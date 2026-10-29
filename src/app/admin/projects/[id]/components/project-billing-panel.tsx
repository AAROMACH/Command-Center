'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { FileText, Link2, Loader2, Package, Plus, Receipt, Trash2, Unlink } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { onSharedSnapshot } from '@/lib/shared-snapshot';
import { usePricingSettings } from '@/hooks/use-billing';
import { materialPrice } from '@/lib/price-lines';
import { addProjectPart, createProjectInvoice, linkQuoteToProject, removeProjectPart, unlinkQuote } from '@/lib/project-billing';
import { quoteEstimate } from '@/lib/project-economics';
import type { Invoice, Material, Project, Quote } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SendInvoiceButton } from '@/components/send-invoice-button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

/**
 * Admin: the project's quote, the parts added on site, and its invoice.
 * Linking a quote sets the estimate; parts added here are billed on that quote;
 * completing the project drafts the invoice to send.
 */
export function ProjectBillingPanel({ project }: { project: Project }) {
    const { toast } = useToast();
    const { settings: pricing } = usePricingSettings();
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [invoice, setInvoice] = useState<Invoice | null>(null);
    useEffect(() => onSharedSnapshot('quotes', s => setQuotes(s.docs.map(d => ({ ...d.data(), id: d.id } as Quote)))), []);
    useEffect(() => onSharedSnapshot('materials', s => setMaterials(s.docs.map(d => ({ ...d.data(), id: d.id } as Material)))), []);
    useEffect(() => {
        if (!project.invoiceId) { setInvoice(null); return; }
        return onSnapshot(doc(db, 'invoices', project.invoiceId), s => setInvoice(s.exists() ? ({ ...s.data(), id: s.id } as Invoice) : null), () => setInvoice(null));
    }, [project.invoiceId]);

    const quote = quotes.find(q => q.id === project.sourceQuoteId) || null;
    const est = quoteEstimate(quote);
    const by = auth.currentUser?.displayName || 'Admin';

    // ── Link a quote ──
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkSearch, setLinkSearch] = useState('');
    const [applyEstimates, setApplyEstimates] = useState(true);
    const [busy, setBusy] = useState(false);
    const quoteChoices = useMemo(() => {
        const q = linkSearch.trim().toLowerCase();
        const client = (project.client || '').toLowerCase();
        return quotes
            .filter(x => !['archived', 'superseded', 'rejected'].includes(x.status))
            .filter(x => !q || [x.quoteNumber, x.title, x.customerName, x.customerCompany].some(v => (v || '').toLowerCase().includes(q)))
            // This client's quotes first.
            .sort((a, b) => Number(((b.customerCompany || b.customerName || '').toLowerCase() === client)) - Number(((a.customerCompany || a.customerName || '').toLowerCase() === client))
                || (b.createdAt || '').localeCompare(a.createdAt || ''))
            .slice(0, 30);
    }, [quotes, linkSearch, project.client]);
    const doLink = async (q: Quote) => {
        setBusy(true);
        try {
            await linkQuoteToProject(project, q, applyEstimates);
            toast({ title: `Linked quote ${q.quoteNumber}`, description: applyEstimates ? 'Budget and estimated hours now come from this quote.' : undefined });
            setLinkOpen(false);
        } catch (e: any) { toast({ variant: 'destructive', title: 'Could not link', description: e.message }); }
        finally { setBusy(false); }
    };

    // ── Add materials & parts ──
    const [partOpen, setPartOpen] = useState(false);
    const [partSearch, setPartSearch] = useState('');
    const [partId, setPartId] = useState('');
    const [qty, setQty] = useState('1');
    const partChoices = useMemo(() => {
        const q = partSearch.trim().toLowerCase();
        return materials.filter(m => m.status !== 'inactive' && (!q || `${m.name} ${m.category} ${m.sku || ''}`.toLowerCase().includes(q)))
            .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 50);
    }, [materials, partSearch]);
    const chosen = materials.find(m => m.id === partId);
    const doAddPart = async () => {
        if (!chosen) return;
        setBusy(true);
        try {
            await addProjectPart(project, chosen, Number(qty), by, pricing);
            toast({ title: 'Part added', description: quote ? `Added to quote ${quote.quoteNumber} and billed on the invoice.` : 'Added to project costs. Link a quote to bill it.' });
            setPartId(''); setQty('1'); setPartSearch('');
        } catch (e: any) { toast({ variant: 'destructive', title: 'Could not add part', description: e.message }); }
        finally { setBusy(false); }
    };
    const doRemovePart = async (id: string, name: string) => {
        if (!confirm(`Remove "${name}" from this project${quote ? ' and its quote' : ''}?`)) return;
        try { await removeProjectPart(project, id, pricing); } catch (e: any) { toast({ variant: 'destructive', title: 'Could not remove', description: e.message }); }
    };

    const doCreateInvoice = async () => {
        setBusy(true);
        try {
            const id = await createProjectInvoice(project, pricing);
            toast(id ? { title: 'Invoice drafted', description: 'Review it, then send it to the client.' } : { variant: 'destructive', title: 'Nothing to invoice', description: 'Link a quote or add parts first.' });
        } catch (e: any) { toast({ variant: 'destructive', title: 'Could not create invoice', description: e.message }); }
        finally { setBusy(false); }
    };

    return (
        <div className="field-group space-y-4">
            <h3 className="field-group-title !mb-0 font-bold"><Receipt className="text-brand-red h-4 w-4" /> Quote, parts & invoice</h3>

            {/* Quote */}
            <div className="rounded-lg border border-border-sub bg-bg-primary p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[12px] font-semibold text-text-primary flex items-center gap-1.5"><FileText size={13} /> Quote</p>
                    <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" className="h-8" onClick={() => setLinkOpen(true)}><Link2 size={13} className="mr-1" /> {quote ? 'Change' : 'Link a quote'}</Button>
                        {quote && <Button size="sm" variant="ghost" className="h-8 text-text-muted" onClick={() => confirm('Unlink this quote? The budget stays as it is.') && unlinkQuote(project)}><Unlink size={13} /></Button>}
                    </div>
                </div>
                {quote && est ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
                        <div><p className="text-text-muted">Quote</p><p className="font-mono font-semibold">{quote.quoteNumber}</p></div>
                        <div><p className="text-text-muted">Labor</p><p className="font-mono font-semibold">{est.laborHours}h · {fmt(est.laborAmount)}</p></div>
                        <div><p className="text-text-muted">Materials</p><p className="font-mono font-semibold">{fmt(est.materialsAmount)}</p></div>
                        <div><p className="text-text-muted">Total</p><p className="font-mono font-semibold text-text-green">{fmt(est.total)}</p></div>
                    </div>
                ) : <p className="text-[12px] text-text-muted">No quote linked. Link one to set the budget, estimated hours and materials.</p>}
            </div>

            {/* Parts added on the project */}
            <div className="rounded-lg border border-border-sub bg-bg-primary p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[12px] font-semibold text-text-primary flex items-center gap-1.5"><Package size={13} /> Materials & parts added</p>
                    <Button size="sm" className="h-8" onClick={() => setPartOpen(true)} disabled={project.status === 'completed' && !!project.invoiceId}>
                        <Plus size={13} className="mr-1" /> Add materials & parts
                    </Button>
                </div>
                {(project.addedParts || []).length ? (
                    <div className="space-y-1">
                        {(project.addedParts || []).map(p => (
                            <div key={p.id} className="flex items-center justify-between gap-3 text-[12px]">
                                <span className="min-w-0 break-words">{p.quantity} × {p.name}</span>
                                <span className="flex items-center gap-2 shrink-0 font-mono">
                                    <span className="text-text-muted">cost {fmt(p.quantity * p.unitCost)}</span>
                                    <span>bill {fmt(p.quantity * p.unitPrice)}</span>
                                    <button type="button" aria-label={`Remove ${p.name}`} onClick={() => doRemovePart(p.id, p.name)} className="text-text-muted hover:text-text-red"><Trash2 size={13} /></button>
                                </span>
                            </div>
                        ))}
                    </div>
                ) : <p className="text-[12px] text-text-muted">None yet.</p>}
            </div>

            {/* Invoice */}
            <div className="rounded-lg border border-border-sub bg-bg-primary p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[12px]">
                    <p className="font-semibold text-text-primary flex items-center gap-1.5"><Receipt size={13} /> Invoice</p>
                    {invoice ? (
                        <p className="text-text-muted mt-0.5">{invoice.invoiceNumber} · <span className="font-mono">{fmt(invoice.total)}</span> · <Badge variant="outline" className="h-4 px-1.5 text-[10px] uppercase">{invoice.status}</Badge></p>
                    ) : <p className="text-text-muted mt-0.5">{project.status === 'completed' ? 'Not created yet.' : 'Drafted automatically when the project is completed.'}</p>}
                </div>
                {invoice ? <SendInvoiceButton invoice={invoice} /> : (
                    <Button size="sm" variant="outline" className="h-8" onClick={doCreateInvoice} disabled={busy}>
                        {busy && <Loader2 size={13} className="mr-1 animate-spin" />} Create invoice now
                    </Button>
                )}
            </div>

            {/* Link dialog */}
            <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader className="text-left">
                        <DialogTitle>Link a quote</DialogTitle>
                        <DialogDescription>{project.client ? `${project.client}'s quotes are listed first.` : 'Pick the quote this project was sold on.'}</DialogDescription>
                    </DialogHeader>
                    <Input value={linkSearch} onChange={e => setLinkSearch(e.target.value)} placeholder="Search quote #, title or customer" />
                    <label className="flex items-center gap-2 text-[12px]">
                        <Checkbox checked={applyEstimates} onCheckedChange={v => setApplyEstimates(v === true)} />
                        Set the budget and estimated hours from the quote
                    </label>
                    <div className="max-h-[50svh] overflow-y-auto space-y-1.5">
                        {quoteChoices.map(q => (
                            <button key={q.id} type="button" disabled={busy} onClick={() => doLink(q)}
                                className={cn('w-full text-left rounded-lg border p-2.5 hover:bg-bg-tertiary', q.id === project.sourceQuoteId ? 'border-brand-red' : 'border-border-sub')}>
                                <div className="flex justify-between gap-2 text-[13px]">
                                    <span className="font-semibold truncate">{q.quoteNumber} · {q.title || 'Untitled'}</span>
                                    <span className="font-mono shrink-0">{fmt(q.total)}</span>
                                </div>
                                <p className="text-[11px] text-text-muted">{q.customerCompany || q.customerName} · {q.status.replace(/_/g, ' ')}</p>
                            </button>
                        ))}
                        {!quoteChoices.length && <p className="text-[12px] text-text-muted py-4 text-center">No quotes match.</p>}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Add part dialog */}
            <Dialog open={partOpen} onOpenChange={setPartOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader className="text-left">
                        <DialogTitle>Add materials & parts</DialogTitle>
                        <DialogDescription>{quote ? `Added to quote ${quote.quoteNumber} at its price-book sell price, so it's billed on the invoice. Its cost counts in project costs.` : 'No quote linked — it counts in project costs only. Link a quote to bill it.'}</DialogDescription>
                    </DialogHeader>
                    <Input value={partSearch} onChange={e => setPartSearch(e.target.value)} placeholder="Search the price book" />
                    <div className="max-h-[40svh] overflow-y-auto space-y-1">
                        {partChoices.map(m => (
                            <button key={m.id} type="button" onClick={() => setPartId(m.id)}
                                className={cn('w-full text-left rounded-md border px-2.5 py-2 text-[12px] flex justify-between gap-2', partId === m.id ? 'border-brand-red bg-brand-red/5' : 'border-border-sub hover:bg-bg-tertiary')}>
                                <span className="min-w-0"><span className="font-semibold">{m.name}</span> <span className="text-text-muted">· {m.category}</span></span>
                                <span className="font-mono shrink-0">{fmt(materialPrice(m, pricing))}/{m.unitType}</span>
                            </button>
                        ))}
                        {!partChoices.length && <p className="text-[12px] text-text-muted py-4 text-center">No materials match. Add them in Assets & Materials.</p>}
                    </div>
                    <DialogFooter className="flex-row items-center gap-2 sm:justify-between">
                        <label className="flex items-center gap-2 text-[12px]">Qty
                            <Input type="number" inputMode="decimal" min={0} value={qty} onChange={e => setQty(e.target.value)} className="h-9 w-24" />
                        </label>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setPartOpen(false)}>Done</Button>
                            <Button onClick={doAddPart} disabled={!chosen || busy}>
                                {busy && <Loader2 size={13} className="mr-1 animate-spin" />} Add{chosen ? ` · ${fmt(materialPrice(chosen, pricing) * (Number(qty) || 0))}` : ''}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
