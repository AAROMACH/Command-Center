'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, increment, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { onSharedSnapshot } from '@/lib/shared-snapshot';
import type { InventoryItem, InventoryMovement, Invoice, InvoiceLineItem } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { SearchField } from '@/components/search-field';
import { usePaged, ListPager, PAGE_SIZES_LARGE } from '@/components/list-pager';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { Boxes, Edit2, History, Plus, Receipt, Wrench } from 'lucide-react';

/**
 * A&M → Inventory: what we have on hand (cable, connectors, cameras…), with
 * a quantity that goes up when stock is bought (+, or a tech's company-
 * purchase receipt) and down only when a sent invoice's materials are pulled
 * from stock here, by hand. Quotes never touch stock. Editing the count is
 * for corrections and is logged as an adjustment.
 * Kept apart from the price book (`materials`), which only sets what we
 * charge. Every quantity change writes an `inventoryMovements` record, so an
 * item's history shows where its stock came from and went.
 */

const UNIT_TYPES: InventoryItem['unitType'][] = ['each', 'box', 'pack', 'foot', 'roll', 'set', 'bag', 'bundle'];
const labelCls = 'text-[10px] font-bold uppercase tracking-wider text-text-muted';
const inputCls = 'h-9 text-[11px] bg-bg-secondary border-border-main';
const usd = (n: number) => `$${n.toFixed(2)}`;
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export function useInventory() {
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [movements, setMovements] = useState<InventoryMovement[]>([]);
    useEffect(() => {
        const u1 = onSharedSnapshot('inventory', s => setItems(s.docs.map(d => ({ ...d.data(), id: d.id } as InventoryItem))), () => setItems([]));
        const u2 = onSharedSnapshot('inventoryMovements', s => setMovements(s.docs.map(d => ({ ...d.data(), id: d.id } as InventoryMovement))), () => setMovements([]));
        return () => { u1(); u2(); };
    }, []);
    return { items, movements };
}

const isLow = (i: InventoryItem) => i.reorderPoint != null && i.quantityOnHand <= i.reorderPoint;

/** Writes a quantity change and its history record together. */
async function recordMovement(item: { id: string; name: string }, m: Omit<InventoryMovement, 'id' | 'itemId' | 'itemName' | 'createdAt'>, itemUpdate: Record<string, unknown> = {}) {
    const now = new Date().toISOString();
    const batch = writeBatch(db);
    batch.update(doc(db, 'inventory', item.id), { quantityOnHand: increment(m.change), updatedAt: now, ...itemUpdate });
    batch.set(doc(collection(db, 'inventoryMovements')), clean({ ...m, itemId: item.id, itemName: item.name, createdAt: now }));
    await batch.commit();
}

function clean<T extends object>(o: T): T {
    return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as T;
}

// ─── Tab ─────────────────────────────────────────────────────────────────────

export function InventoryTab({ items, movements, categories, actorName, addOpen, setAddOpen }: {
    items: InventoryItem[];
    movements: InventoryMovement[];
    categories: string[];
    actorName: string;
    addOpen: boolean;
    setAddOpen: (v: boolean) => void;
}) {
    const [search, setSearch] = useState('');
    const [show, setShow] = useState<'active' | 'low' | 'all'>('active');
    const [editing, setEditing] = useState<InventoryItem | null>(null);
    const [stockFor, setStockFor] = useState<{ item: InventoryItem; dir: 'in' | 'out' } | null>(null);
    const [historyFor, setHistoryFor] = useState<InventoryItem | null>(null);

    const rows = useMemo(() => {
        const q = search.toLowerCase();
        return items
            .filter(i => show === 'all' || (show === 'low' ? i.status === 'active' && isLow(i) : i.status === 'active'))
            .filter(i => !q || [i.name, i.category, i.vendor, i.sku, i.location].some(v => (v || '').toLowerCase().includes(q)))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [items, search, show]);
    const pager = usePaged(rows, PAGE_SIZES_LARGE, 'inventory', [search, show]);
    const lowCount = items.filter(i => i.status === 'active' && isLow(i)).length;
    const stockValue = items.filter(i => i.status === 'active').reduce((s, i) => s + Math.max(0, i.quantityOnHand) * (i.unitCost || 0), 0);

    return (
        <>
            <InvoicesToPull items={items} actorName={actorName} />
            <div className="flex flex-wrap items-center gap-2 mb-5">
                <SearchField className="flex-1 min-w-[200px]" placeholder="Search name, vendor, SKU, location…" value={search} onChange={setSearch} />
                <Select value={show} onValueChange={v => setShow(v as typeof show)}>
                    <SelectTrigger className="h-9 w-[150px] bg-bg-secondary border-border-main" aria-label="Show"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-bg-elevated border-border-main">
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="low">Low stock ({lowCount})</SelectItem>
                        <SelectItem value="all">All, incl. inactive</SelectItem>
                    </SelectContent>
                </Select>
                <p className="text-[12px] text-text-muted ml-auto">Stock value at cost: <span className="font-mono font-semibold text-text-primary">{usd(stockValue)}</span></p>
            </div>

            {rows.length === 0 ? (
                <EmptyState
                    icon={Boxes}
                    title={items.length ? 'Nothing matches' : 'Nothing in inventory yet'}
                    description={items.length ? 'Try another search or filter.' : 'Add stock here, or from a receipt not tied to a job in Financials → Reimbursements.'}
                    action={!items.length ? <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}><Plus size={14} className="mr-1.5" /> Add first item</Button> : undefined}
                />
            ) : (
                <div className="table-wrap rounded-xl border border-border-main bg-bg-secondary">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-border-sub">
                                <TableHead className="pl-4">Material</TableHead>
                                <TableHead>On hand</TableHead>
                                <TableHead>Unit cost</TableHead>
                                <TableHead>Location</TableHead>
                                <TableHead className="text-right pr-4"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pager.items.map(i => (
                                <TableRow key={i.id} className={cn('border-border-sub', i.status === 'inactive' && 'opacity-60')}>
                                    <TableCell className="pl-4">
                                        <div className="text-sm font-semibold text-text-primary">{i.name}</div>
                                        <div className="text-[11px] text-text-muted">{[i.category, i.vendor, i.sku].filter(Boolean).join(' · ') || '—'}</div>
                                    </TableCell>
                                    <TableCell>
                                        <span className={cn('font-mono text-sm font-bold tabular-nums', isLow(i) ? 'text-text-red' : 'text-text-primary')}>{qty(i.quantityOnHand)}</span>
                                        <span className="text-[11px] text-text-muted ml-1">{i.unitType}</span>
                                        {isLow(i) && <Badge variant="destructive" className="ml-2 h-5 text-[10px] uppercase">Low</Badge>}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs text-text-secondary">{i.unitCost != null ? usd(i.unitCost) : '—'}</TableCell>
                                    <TableCell className="text-xs text-text-secondary">{i.location || '—'}</TableCell>
                                    <TableCell className="text-right pr-4">
                                        <div className="flex justify-end gap-1">
                                            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" title="Received / bought" onClick={() => setStockFor({ item: i, dir: 'in' })}><Plus size={12} /></Button>
                                            <Button size="sm" variant="ghost" className="h-7 px-2" title="History" onClick={() => setHistoryFor(i)}><History size={12} /></Button>
                                            <Button size="sm" variant="ghost" className="h-7 px-2" title="Edit" onClick={() => setEditing(i)}><Edit2 size={12} /></Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <div className="px-4"><ListPager pager={pager} noun="items" /></div>
                </div>
            )}

            <InventoryItemDialog
                open={addOpen || !!editing}
                item={editing}
                categories={categories}
                actorName={actorName}
                onClose={() => { setAddOpen(false); setEditing(null); }}
            />
            {stockFor && <StockChangeDialog item={stockFor.item} dir={stockFor.dir} actorName={actorName} onClose={() => setStockFor(null)} />}
            <Dialog open={!!historyFor} onOpenChange={o => !o && setHistoryFor(null)}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold">{historyFor?.name} — history</DialogTitle>
                        <DialogDescription className="text-[11px]">On hand now: {historyFor ? `${qty(historyFor.quantityOnHand)} ${historyFor.unitType}` : ''}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        {movements.filter(m => m.itemId === historyFor?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(m => (
                            <div key={m.id} className="flex items-start justify-between gap-3 rounded-md border border-border-sub bg-bg-secondary p-2.5">
                                <div className="min-w-0">
                                    <div className="text-[12px] font-semibold text-text-primary flex items-center gap-1.5">
                                        {m.reason === 'receipt' && <Receipt size={11} />}
                                        {REASON_LABEL[m.reason]}{m.cost != null ? ` · ${usd(m.cost)}` : ''}
                                    </div>
                                    {m.note && <div className="text-[11px] text-text-muted truncate">{m.note}</div>}
                                    <div className="text-[10px] text-text-muted">{format(parseISO(m.createdAt), 'MMM d, yyyy h:mm a')} · {m.byName}</div>
                                </div>
                                <span className={cn('font-mono text-sm font-bold tabular-nums shrink-0', m.change >= 0 ? 'text-text-green' : 'text-text-red')}>{m.change >= 0 ? '+' : ''}{qty(m.change)}</span>
                            </div>
                        ))}
                        {!movements.some(m => m.itemId === historyFor?.id) && <p className="text-[12px] text-text-muted">No changes recorded.</p>}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

const REASON_LABEL: Record<InventoryMovement['reason'], string> = {
    receipt: 'From tech receipt', purchase: 'Received', used: 'Used on invoice', adjustment: 'Count adjusted',
};

// ─── Sent invoices → pull materials from stock ──────────────────────────────

/** Invoices sent before stock tracking began are left out of the list. */
const STOCK_TRACKING_FROM = '2026-11-13';
const isMaterialLine = (l: InvoiceLineItem) => l.category !== 'labor';
const OUT_STATUSES: Invoice['status'][] = ['sent', 'overdue', 'paid'];

function InvoicesToPull({ items, actorName }: { items: InventoryItem[]; actorName: string }) {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [pulling, setPulling] = useState<Invoice | null>(null);
    useEffect(() => onSharedSnapshot('invoices', s => setInvoices(s.docs.map(d => ({ ...d.data(), id: d.id } as Invoice))), () => setInvoices([])), []);
    const waiting = useMemo(() => invoices
        .filter(i => OUT_STATUSES.includes(i.status) && !i.stockPull
            && ((i.sentAt || i.issueDate || '') >= STOCK_TRACKING_FROM)
            && (i.lineItems || []).some(isMaterialLine))
        .sort((a, b) => (b.sentAt || b.issueDate || '').localeCompare(a.sentAt || a.issueDate || '')), [invoices]);
    if (!waiting.length) return null;
    return (
        <div className="mb-5 rounded-xl border border-accent-gold/40 bg-accent-gold/5 p-4">
            <p className="text-[13px] font-semibold text-text-primary">Sent invoices to pull from stock ({waiting.length})</p>
            <p className="text-[12px] text-text-muted mb-3">Stock only goes down here. Match each invoice&apos;s materials to what came off the shelf.</p>
            <div className="space-y-2">
                {waiting.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between gap-3 rounded-md border border-border-sub bg-bg-secondary px-3 py-2">
                        <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-text-primary truncate">Invoice {inv.invoiceNumber}{inv.clientName ? ` · ${inv.clientName}` : ''}</div>
                            <div className="text-[11px] text-text-muted">{inv.lineItems.filter(isMaterialLine).length} material line(s) · sent {(inv.sentAt || inv.issueDate || '').slice(0, 10)}</div>
                        </div>
                        <Button size="sm" className="h-8 bg-brand-red hover:bg-brand-red/90 text-white shrink-0" onClick={() => setPulling(inv)}>Pull from stock</Button>
                    </div>
                ))}
            </div>
            {pulling && <PullStockDialog invoice={pulling} items={items} actorName={actorName} onClose={() => setPulling(null)} />}
        </div>
    );
}

function PullStockDialog({ invoice, items, actorName, onClose }: { invoice: Invoice; items: InventoryItem[]; actorName: string; onClose: () => void }) {
    const { toast } = useToast();
    const active = useMemo(() => items.filter(i => i.status === 'active').sort((a, b) => a.name.localeCompare(b.name)), [items]);
    const lines = useMemo(() => invoice.lineItems.filter(isMaterialLine), [invoice]);
    // Pre-match: stock last pulled for the same price-book material, else same name.
    const guess = (l: InvoiceLineItem) => {
        const pb = l.itemRef?.startsWith('mat:') ? l.itemRef.slice(4) : '';
        const byRef = pb && active.find(i => i.priceBookId === pb);
        const byName = active.find(i => i.name.trim().toLowerCase() === (l.description || '').trim().toLowerCase());
        return (byRef || byName)?.id || '__none__';
    };
    const [picks, setPicks] = useState(() => lines.map(l => ({ itemId: guess(l), qty: String(l.quantity || 0) })));
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        try {
            const now = new Date().toISOString();
            const batch = writeBatch(db);
            const pulled: { itemId: string; itemName: string; qty: number }[] = [];
            const totals = new Map<string, number>();
            lines.forEach((l, idx) => {
                const p = picks[idx];
                const item = active.find(i => i.id === p.itemId);
                const n = Number(p.qty);
                if (!item || !(n > 0)) return;
                totals.set(item.id, (totals.get(item.id) || 0) + n);
                pulled.push({ itemId: item.id, itemName: item.name, qty: n });
                batch.set(doc(collection(db, 'inventoryMovements')), {
                    itemId: item.id, itemName: item.name, change: -n, reason: 'used',
                    note: `Invoice ${invoice.invoiceNumber}${invoice.clientName ? ` · ${invoice.clientName}` : ''} · ${l.description}`,
                    byName: actorName, createdAt: now,
                });
                const pb = l.itemRef?.startsWith('mat:') ? l.itemRef.slice(4) : '';
                if (pb) batch.update(doc(db, 'inventory', item.id), { priceBookId: pb });
            });
            totals.forEach((n, id) => batch.update(doc(db, 'inventory', id), { quantityOnHand: increment(-n), updatedAt: now }));
            batch.update(doc(db, 'invoices', invoice.id), { stockPull: { at: now, by: actorName, lines: pulled } });
            await batch.commit();
            toast({ title: pulled.length ? 'Pulled from stock' : 'Marked: nothing from stock', description: `Invoice ${invoice.invoiceNumber}` });
            onClose();
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not update stock', description: e.message });
        } finally { setSaving(false); }
    };

    return (
        <Dialog open onOpenChange={o => !o && onClose()}>
            <DialogContent className="bg-bg-elevated border-border-main max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-base font-semibold">Pull invoice {invoice.invoiceNumber} from stock</DialogTitle>
                    <DialogDescription className="text-[11px]">For each material, pick the stock it came from, or &quot;Not from stock&quot; (bought for the job, supplied by the client…).</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                    {lines.map((l, idx) => {
                        const item = active.find(i => i.id === picks[idx].itemId);
                        return (
                            <div key={l.id || idx} className="rounded-md border border-border-sub bg-bg-secondary p-3 space-y-2">
                                <div className="text-[12px] font-semibold text-text-primary">{l.description} <span className="font-normal text-text-muted">× {qty(Number(l.quantity) || 0)} on invoice</span></div>
                                <div className="grid grid-cols-[1fr_90px] gap-2">
                                    <Select value={picks[idx].itemId} onValueChange={v => setPicks(ps => ps.map((p, j) => j === idx ? { ...p, itemId: v } : p))}>
                                        <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                                        <SelectContent className="bg-bg-elevated border-border-main">
                                            <SelectItem value="__none__">Not from stock</SelectItem>
                                            {active.map(i => <SelectItem key={i.id} value={i.id}>{i.name} ({qty(i.quantityOnHand)} {i.unitType})</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Input type="number" className={inputCls} disabled={!item} aria-label="Quantity from stock" value={picks[idx].qty} onChange={e => setPicks(ps => ps.map((p, j) => j === idx ? { ...p, qty: e.target.value } : p))} />
                                </div>
                                {item && Number(picks[idx].qty) > item.quantityOnHand && (
                                    <p className="text-[11px] text-text-red">More than the {qty(item.quantityOnHand)} {item.unitType} on hand — stock will go negative until the count is corrected.</p>
                                )}
                            </div>
                        );
                    })}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button className="bg-brand-red hover:bg-brand-red/90 text-white" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Confirm'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Add / edit item ─────────────────────────────────────────────────────────

const EMPTY_ITEM = { name: '', category: '', unitType: 'each' as InventoryItem['unitType'], quantityOnHand: '', unitCost: '', vendor: '', sku: '', location: '', reorderPoint: '', notes: '', status: 'active' as InventoryItem['status'] };

function InventoryItemDialog({ open, item, categories, actorName, onClose }: {
    open: boolean; item: InventoryItem | null; categories: string[]; actorName: string; onClose: () => void;
}) {
    const { toast } = useToast();
    const [f, setF] = useState({ ...EMPTY_ITEM });
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        if (!open) return;
        setF(item ? {
            name: item.name, category: item.category || '', unitType: item.unitType, quantityOnHand: String(item.quantityOnHand ?? 0),
            unitCost: item.unitCost != null ? String(item.unitCost) : '', vendor: item.vendor || '', sku: item.sku || '', location: item.location || '',
            reorderPoint: item.reorderPoint != null ? String(item.reorderPoint) : '', notes: item.notes || '', status: item.status,
        } : { ...EMPTY_ITEM });
    }, [open, item]);

    const save = async () => {
        if (!f.name.trim()) { toast({ variant: 'destructive', title: 'Name is required' }); return; }
        setSaving(true);
        try {
            const now = new Date().toISOString();
            const fields = {
                name: f.name.trim(), category: f.category || null, unitType: f.unitType, status: f.status,
                unitCost: f.unitCost !== '' ? Number(f.unitCost) : null, vendor: f.vendor.trim() || null, sku: f.sku.trim() || null,
                location: f.location.trim() || null, reorderPoint: f.reorderPoint !== '' ? Number(f.reorderPoint) : null, notes: f.notes.trim() || null,
                updatedAt: now,
            };
            const count = Number(f.quantityOnHand || 0);
            if (item) {
                // Quantity edits go through the history as a count adjustment.
                const diff = count - (item.quantityOnHand || 0);
                await updateDoc(doc(db, 'inventory', item.id), fields);
                if (diff) await recordMovement({ id: item.id, name: fields.name }, { change: diff, reason: 'adjustment', note: 'Count edited', byName: actorName });
                toast({ title: 'Inventory item updated' });
            } else {
                const ref = doc(collection(db, 'inventory'));
                const batch = writeBatch(db);
                batch.set(ref, clean({ ...fields, quantityOnHand: count, createdAt: now }));
                if (count) batch.set(doc(collection(db, 'inventoryMovements')), { itemId: ref.id, itemName: fields.name, change: count, reason: 'adjustment', note: 'Starting count', byName: actorName, createdAt: now });
                await batch.commit();
                toast({ title: 'Added to inventory', description: fields.name });
            }
            onClose();
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not save', description: e.message });
        } finally { setSaving(false); }
    };

    return (
        <Dialog open={open} onOpenChange={o => !o && onClose()}>
            <DialogContent className="bg-bg-elevated border-border-main max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-base font-semibold">{item ? 'Edit inventory item' : 'Add inventory item'}</DialogTitle>
                    <DialogDescription className="text-[11px]">Stock on hand. What we charge clients is set in the price book.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                    <div className="space-y-1.5"><Label className={labelCls}>Name *</Label><Input className={inputCls} placeholder="e.g. Cat6 CMR, blue, 1000ft" value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} /></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5"><Label className={labelCls}>Category</Label>
                            <Select value={f.category || '__none__'} onValueChange={v => setF(p => ({ ...p, category: v === '__none__' ? '' : v }))}>
                                <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-bg-elevated border-border-main">
                                    <SelectItem value="__none__">None</SelectItem>
                                    {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5"><Label className={labelCls}>Unit</Label>
                            <Select value={f.unitType} onValueChange={v => setF(p => ({ ...p, unitType: v as InventoryItem['unitType'] }))}>
                                <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-bg-elevated border-border-main">{UNIT_TYPES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5"><Label className={labelCls}>On hand</Label><Input type="number" className={inputCls} placeholder="0" value={f.quantityOnHand} onChange={e => setF(p => ({ ...p, quantityOnHand: e.target.value }))} /></div>
                        <div className="space-y-1.5"><Label className={labelCls}>Unit cost ($)</Label><Input type="number" className={inputCls} placeholder="0.00" value={f.unitCost} onChange={e => setF(p => ({ ...p, unitCost: e.target.value }))} /></div>
                        <div className="space-y-1.5"><Label className={labelCls}>Vendor</Label><Input className={inputCls} value={f.vendor} onChange={e => setF(p => ({ ...p, vendor: e.target.value }))} /></div>
                        <div className="space-y-1.5"><Label className={labelCls}>SKU</Label><Input className={inputCls} value={f.sku} onChange={e => setF(p => ({ ...p, sku: e.target.value }))} /></div>
                        <div className="space-y-1.5"><Label className={labelCls}>Location</Label><Input className={inputCls} placeholder="e.g. Shop shelf B, Van 2" value={f.location} onChange={e => setF(p => ({ ...p, location: e.target.value }))} /></div>
                        <div className="space-y-1.5"><Label className={labelCls}>Low-stock alert at</Label><Input type="number" className={inputCls} placeholder="Optional" value={f.reorderPoint} onChange={e => setF(p => ({ ...p, reorderPoint: e.target.value }))} /></div>
                    </div>
                    <div className="space-y-1.5"><Label className={labelCls}>Notes</Label><Textarea className="text-[11px] bg-bg-secondary border-border-main min-h-[60px]" value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} /></div>
                    {item && (
                        <div className="space-y-1.5"><Label className={labelCls}>Status</Label>
                            <Select value={f.status} onValueChange={v => setF(p => ({ ...p, status: v as InventoryItem['status'] }))}>
                                <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-bg-elevated border-border-main"><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button className="bg-brand-red hover:bg-brand-red/90 text-white" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Receive / use ───────────────────────────────────────────────────────────

function StockChangeDialog({ item, dir, actorName, onClose }: { item: InventoryItem; dir: 'in' | 'out'; actorName: string; onClose: () => void }) {
    const { toast } = useToast();
    const [amount, setAmount] = useState('');
    const [cost, setCost] = useState('');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const save = async () => {
        const n = Number(amount);
        if (!(n > 0)) { toast({ variant: 'destructive', title: 'Enter a quantity' }); return; }
        setSaving(true);
        try {
            const total = dir === 'in' && cost !== '' ? Number(cost) : undefined;
            await recordMovement(item, {
                change: dir === 'in' ? n : -n, reason: dir === 'in' ? 'purchase' : 'used',
                note: note.trim() || undefined, cost: total, byName: actorName,
            }, total != null && n ? { unitCost: Math.round((total / n) * 100) / 100 } : {});
            toast({ title: dir === 'in' ? 'Stock received' : 'Stock used', description: `${item.name}: ${dir === 'in' ? '+' : '−'}${qty(n)} ${item.unitType}` });
            onClose();
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not save', description: e.message });
        } finally { setSaving(false); }
    };
    return (
        <Dialog open onOpenChange={o => !o && onClose()}>
            <DialogContent className="bg-bg-elevated border-border-main max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-base font-semibold">{dir === 'in' ? 'Receive stock' : 'Use stock'}</DialogTitle>
                    <DialogDescription className="text-[11px]">{item.name} · on hand {qty(item.quantityOnHand)} {item.unitType}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                    <div className="space-y-1.5"><Label className={labelCls}>Quantity ({item.unitType})</Label><Input type="number" autoFocus className={inputCls} value={amount} onChange={e => setAmount(e.target.value)} /></div>
                    {dir === 'in' && <div className="space-y-1.5"><Label className={labelCls}>Total cost ($, optional)</Label><Input type="number" className={inputCls} value={cost} onChange={e => setCost(e.target.value)} /></div>}
                    <div className="space-y-1.5"><Label className={labelCls}>Note</Label><Input className={inputCls} placeholder={dir === 'in' ? 'e.g. Graybar order' : 'e.g. Job at Main St'} value={note} onChange={e => setNote(e.target.value)} /></div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button className="bg-brand-red hover:bg-brand-red/90 text-white" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── From a tech receipt ─────────────────────────────────────────────────────

export type ReceiptDraft = {
    collection: 'reimbursements' | 'expenses';
    id: string;
    label: string;
    name: string;
    vendor: string;
    amount: number;
};

/**
 * Financials → Reimbursements → Add to A&M on a receipt with no job: add
 * what was bought to inventory (new item, or more of one we have).
 * Tools and equipment go to Assets instead (onAsAsset).
 */
export function ReceiptToStockDialog({ draft, items, categories, actorName, onClose, onAsAsset }: {
    draft: ReceiptDraft | null; items: InventoryItem[]; categories: string[]; actorName: string;
    onClose: () => void; onAsAsset: () => void;
}) {
    const { toast } = useToast();
    const [target, setTarget] = useState('__new__');
    const [name, setName] = useState('');
    const [category, setCategory] = useState('');
    const [unitType, setUnitType] = useState<InventoryItem['unitType']>('each');
    const [count, setCount] = useState('1');
    const [location, setLocation] = useState('');
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        if (!draft) return;
        setTarget('__new__'); setName(draft.name); setCategory(''); setUnitType('each'); setCount('1'); setLocation('');
    }, [draft]);
    const active = useMemo(() => items.filter(i => i.status === 'active').sort((a, b) => a.name.localeCompare(b.name)), [items]);
    const existing = active.find(i => i.id === target);
    const n = Number(count);

    const save = async () => {
        if (!draft) return;
        if (!(n > 0)) { toast({ variant: 'destructive', title: 'Enter how many were bought' }); return; }
        if (!existing && !name.trim()) { toast({ variant: 'destructive', title: 'Name the item' }); return; }
        setSaving(true);
        try {
            const now = new Date().toISOString();
            const unitCost = draft.amount ? Math.round((draft.amount / n) * 100) / 100 : undefined;
            const batch = writeBatch(db);
            const ref = existing ? doc(db, 'inventory', existing.id) : doc(collection(db, 'inventory'));
            const itemName = existing ? existing.name : name.trim();
            if (existing) {
                batch.update(ref, clean({ quantityOnHand: increment(n), unitCost, vendor: existing.vendor || draft.vendor || undefined, updatedAt: now }));
            } else {
                batch.set(ref, clean({
                    name: itemName, category: category || undefined, unitType, quantityOnHand: n, unitCost,
                    vendor: draft.vendor || undefined, location: location.trim() || undefined, status: 'active', createdAt: now, updatedAt: now,
                }));
            }
            batch.set(doc(collection(db, 'inventoryMovements')), clean({
                itemId: ref.id, itemName, change: n, reason: 'receipt', cost: draft.amount || undefined,
                note: draft.label, receipt: { collection: draft.collection, id: draft.id }, byName: actorName, createdAt: now,
            }));
            await batch.commit();
            toast({ title: 'Added to inventory', description: `${itemName}: +${qty(n)} ${existing?.unitType || unitType}` });
            // Mark the receipt so Financials shows where it went. Receipts are payroll-admin only.
            await updateDoc(doc(db, draft.collection, draft.id), { inventoryItemId: ref.id, inventoryItemName: itemName })
                .catch(() => toast({ variant: 'destructive', title: 'Stock saved, receipt not linked', description: 'Only payroll admins can update receipts.' }));
            onClose();
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not save', description: e.message });
        } finally { setSaving(false); }
    };

    return (
        <Dialog open={!!draft} onOpenChange={o => !o && onClose()}>
            <DialogContent className="bg-bg-elevated border-border-main max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-base font-semibold">Add purchase to inventory</DialogTitle>
                    <DialogDescription className="text-[11px]">From receipt: {draft?.label}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                    <div className="space-y-1.5"><Label className={labelCls}>Inventory item</Label>
                        <Select value={target} onValueChange={setTarget}>
                            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main">
                                <SelectItem value="__new__">New item…</SelectItem>
                                {active.map(i => <SelectItem key={i.id} value={i.id}>{i.name} ({qty(i.quantityOnHand)} {i.unitType} on hand)</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    {!existing && (
                        <>
                            <div className="space-y-1.5"><Label className={labelCls}>Name *</Label><Input className={inputCls} placeholder="e.g. RJ45 Cat6 pass-through, 100pk" value={name} onChange={e => setName(e.target.value)} /></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5"><Label className={labelCls}>Category</Label>
                                    <Select value={category || '__none__'} onValueChange={v => setCategory(v === '__none__' ? '' : v)}>
                                        <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                                        <SelectContent className="bg-bg-elevated border-border-main">
                                            <SelectItem value="__none__">None</SelectItem>
                                            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5"><Label className={labelCls}>Unit</Label>
                                    <Select value={unitType} onValueChange={v => setUnitType(v as InventoryItem['unitType'])}>
                                        <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                                        <SelectContent className="bg-bg-elevated border-border-main">{UNIT_TYPES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-1.5"><Label className={labelCls}>Location</Label><Input className={inputCls} placeholder="e.g. Shop shelf B, Van 2" value={location} onChange={e => setLocation(e.target.value)} /></div>
                        </>
                    )}
                    <div className="grid grid-cols-2 gap-3 items-end">
                        <div className="space-y-1.5"><Label className={labelCls}>Quantity bought ({existing?.unitType || unitType})</Label><Input type="number" className={inputCls} value={count} onChange={e => setCount(e.target.value)} /></div>
                        <p className="text-[11px] text-text-muted pb-2">
                            {draft?.amount ? <>Receipt {usd(draft.amount)}{n > 0 ? <> → <span className="font-mono text-text-primary">{usd(draft.amount / n)}</span> each</> : null}</> : null}
                        </p>
                    </div>
                </div>
                <DialogFooter className="sm:justify-between gap-2">
                    <Button variant="ghost" className="text-[12px]" onClick={onAsAsset} disabled={saving}><Wrench size={12} className="mr-1.5" />It&apos;s a tool / equipment — add as asset</Button>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                        <Button className="bg-brand-red hover:bg-brand-red/90 text-white" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Add to stock'}</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
