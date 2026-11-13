'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { onSharedSnapshot } from '@/lib/shared-snapshot';
import type { InventoryItem, Invoice, Material, Technician } from '@/lib/types';
import { isClient, isTech } from '@/lib/permissions';
import { usePricingSettings } from '@/hooks/use-billing';
import { useEstimatingSettings } from '@/lib/site-walk-actions';
import { resolveCatalog } from '@/lib/estimating';
import { customerName, customersCsv, downloadCsvs, invoicesCsv, productsCsv, vendorsCsv, type Csv } from '@/lib/quickbooks-export';
import { downloadCsv } from '@/app/admin/reports/components/history-tabs';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/**
 * Export for QuickBooks: pick what to send and get one QuickBooks import CSV
 * per list (customers, vendors, products & services, invoices). Import them
 * in QuickBooks Online → Settings (gear) → Import data, customers and
 * products before invoices. Builders: lib/quickbooks-export.ts.
 */

export type QbSection = 'customers' | 'vendors' | 'products' | 'invoices';

const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;

export function QuickBooksExportButton({ preselect, label = 'Export for QuickBooks', className, size = 'sm' }: {
    preselect?: QbSection[]; label?: string; className?: string; size?: 'sm' | 'default';
}) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button variant="outline" size={size} className={cn('h-9', className)} onClick={() => setOpen(true)}>
                <Download size={13} className="mr-1.5" /> {label}
            </Button>
            {open && <QuickBooksExportDialog preselect={preselect} onClose={() => setOpen(false)} />}
        </>
    );
}

function Row({ checked, onChange, title, count, children }: { checked: boolean; onChange: (v: boolean) => void; title: string; count?: number; children?: React.ReactNode }) {
    return (
        <div className={cn('rounded-lg border p-3 space-y-2', checked ? 'border-brand-red/40 bg-brand-red/5' : 'border-border-sub bg-bg-secondary')}>
            <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox checked={checked} onCheckedChange={c => onChange(c === true)} />
                <span className="text-[13px] font-semibold text-text-primary flex-1">{title}</span>
                {count != null && <span className="text-[12px] text-text-muted">{count}</span>}
            </label>
            {checked && children && <div className="pl-7 space-y-2">{children}</div>}
        </div>
    );
}

function Sub({ checked, onChange, title, count, hint }: { checked: boolean; onChange: (v: boolean) => void; title: string; count: number; hint?: string }) {
    return (
        <label className="flex items-start gap-2.5 cursor-pointer">
            <Checkbox checked={checked} onCheckedChange={c => onChange(c === true)} className="mt-0.5" />
            <span className="text-[12px] text-text-secondary flex-1">{title}{hint && <span className="block text-[11px] text-text-muted">{hint}</span>}</span>
            <span className="text-[11px] text-text-muted">{count}</span>
        </label>
    );
}

function QuickBooksExportDialog({ preselect, onClose }: { preselect?: QbSection[]; onClose: () => void }) {
    const { toast } = useToast();
    const { settings: pricing } = usePricingSettings();
    const estimating = useEstimatingSettings();
    const [users, setUsers] = useState<Technician[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    useEffect(() => {
        const subs = [
            onSharedSnapshot('users', s => setUsers(s.docs.map(d => ({ ...d.data(), id: d.id } as Technician))), () => setUsers([])),
            onSharedSnapshot('materials', s => setMaterials(s.docs.map(d => ({ ...d.data(), id: d.id } as Material))), () => setMaterials([])),
            onSharedSnapshot('invoices', s => setInvoices(s.docs.map(d => ({ ...d.data(), id: d.id } as Invoice))), () => setInvoices([])),
            onSharedSnapshot('inventory', s => setInventory(s.docs.map(d => ({ ...d.data(), id: d.id } as InventoryItem))), () => setInventory([])),
        ];
        return () => subs.forEach(u => u());
    }, []);

    const pre = new Set(preselect ?? ['customers', 'vendors', 'products', 'invoices']);
    const [customers, setCustomers] = useState(pre.has('customers'));
    const [vendors, setVendors] = useState(pre.has('vendors'));
    const [vendorScope, setVendorScope] = useState<'1099' | 'all'>('1099');
    const [products, setProducts] = useState(pre.has('products'));
    const [pLabor, setPLabor] = useState(true);
    const [pMaterials, setPMaterials] = useState(true);
    const [pCatalog, setPCatalog] = useState(true);
    const [pInventory, setPInventory] = useState(false);
    const [invs, setInvs] = useState(pre.has('invoices'));
    const [from, setFrom] = useState(yearStart());
    const [to, setTo] = useState(today());
    const [busy, setBusy] = useState(false);

    // Same 'archived' flag the QuickBooks sync skips on. Leads aren't customers yet.
    const clients = useMemo(() => users.filter(u => isClient(u) && !(u as any).archived && !['lead', 'prospect'].includes(u.accountStatus || '')), [users]);
    const techs = useMemo(() => users.filter(u => isTech(u) && !(u as any).archived && (vendorScope === 'all'
        ? !['w2_employee', 'not_paid'].includes(u.accounting?.workerType || '')
        : u.accounting?.workerType === '1099_contractor')), [users, vendorScope]);
    const catalog = useMemo(() => resolveCatalog(estimating.rawServices, pricing.laborRates), [estimating.rawServices, pricing.laborRates]);
    const activeMaterials = materials.filter(m => m.status !== 'inactive');
    const activeInventory = inventory.filter(i => i.status !== 'inactive');
    const outInvoices = useMemo(() => invoices.filter(i => ['sent', 'overdue', 'paid'].includes(i.status)
        && (i.issueDate || '') >= from && (i.issueDate || '').slice(0, 10) <= to), [invoices, from, to]);
    const productCount = (pLabor ? pricing.laborRates.length : 0) + (pMaterials ? activeMaterials.length : 0)
        + (pCatalog ? catalog.filter(s => s.active !== false).length : 0) + (pInventory ? activeInventory.length : 0);
    const nothing = !customers && !vendors && !products && !invs;

    const run = async () => {
        setBusy(true);
        try {
            const files: Csv[] = [];
            if (customers) files.push(customersCsv(clients));
            if (vendors) files.push(vendorsCsv(techs));
            if (products) files.push(productsCsv({
                pricing, asOf: today(),
                laborRates: pLabor ? pricing.laborRates : [],
                materials: pMaterials ? materials : [],
                services: pCatalog ? catalog : [],
                inventory: pInventory ? inventory : undefined,
            }));
            if (invs) {
                const byId = new Map(users.map(u => [u.id, u]));
                files.push(invoicesCsv(outInvoices, inv => {
                    const u = inv.clientId ? byId.get(inv.clientId) : undefined;
                    return u ? customerName(u) : (inv.clientName || 'Customer');
                }));
            }
            await downloadCsvs(files, downloadCsv);
            toast({ title: `Downloaded ${files.length} file${files.length === 1 ? '' : 's'}`, description: 'In QuickBooks: Settings → Import data. Import customers and products before invoices.' });
            onClose();
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Export failed', description: e.message });
        } finally { setBusy(false); }
    };

    return (
        <Dialog open onOpenChange={o => !o && !busy && onClose()}>
            <DialogContent className="bg-bg-elevated border-border-main max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-base font-semibold">Export for QuickBooks</DialogTitle>
                    <DialogDescription className="text-[11px]">
                        One import file per list. In QuickBooks Online: Settings (gear) → Import data → pick the list → upload the file. Import customers and products &amp; services before invoices.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-2.5 py-1">
                    <Row checked={customers} onChange={setCustomers} title="Clients → Customers" count={clients.length} />
                    <Row checked={vendors} onChange={setVendors} title="Technicians → Vendors" count={techs.length}>
                        <Select value={vendorScope} onValueChange={v => setVendorScope(v as '1099' | 'all')}>
                            <SelectTrigger className="h-8 text-[12px] bg-bg-primary border-border-main"><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main">
                                <SelectItem value="1099">1099 contractors only</SelectItem>
                                <SelectItem value="all">All paid technicians (not W-2)</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-[11px] text-text-muted">Tax IDs and bank details aren&apos;t exported. Add them in QuickBooks from the W-9.</p>
                    </Row>
                    <Row checked={products} onChange={setProducts} title="Price book → Products & services" count={productCount}>
                        <Sub checked={pLabor} onChange={setPLabor} title="Labor rates" count={pricing.laborRates.length} />
                        <Sub checked={pMaterials} onChange={setPMaterials} title="Price book materials" count={activeMaterials.length} />
                        <Sub checked={pCatalog} onChange={setPCatalog} title="Service catalog" count={catalog.filter(s => s.active !== false).length} />
                        <Sub checked={pInventory} onChange={setPInventory} title="Inventory on hand" count={activeInventory.length}
                            hint="Exported as Inventory items with quantity on hand. Needs QuickBooks Plus or Advanced." />
                    </Row>
                    <Row checked={invs} onChange={setInvs} title="Invoices (sent, overdue, paid)" count={outInvoices.length}>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1"><Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Issued from</Label><Input type="date" className="h-8 text-[12px]" value={from} onChange={e => setFrom(e.target.value)} /></div>
                            <div className="space-y-1"><Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">To</Label><Input type="date" className="h-8 text-[12px]" value={to} onChange={e => setTo(e.target.value)} /></div>
                        </div>
                        <p className="text-[11px] text-accent-gold">If QuickBooks is connected (Settings → Integrations), sent invoices already sync on their own. Importing them as well makes duplicates.</p>
                    </Row>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
                    <Button className="bg-brand-red hover:bg-brand-red/90 text-white" onClick={run} disabled={busy || nothing}>
                        {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Download size={14} className="mr-1.5" />} Download
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
