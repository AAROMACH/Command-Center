'use client';
import { SendInvoiceButton } from '@/components/send-invoice-button';
import { onSharedSnapshot } from '@/lib/shared-snapshot';

import { useState, useMemo, useEffect } from 'react';
import { usePaged, ListPager, PAGE_SIZES_LARGE } from '@/components/list-pager';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Download, FileText, Plus, X } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from '@/hooks/use-toast';
import type { Invoice } from '@/lib/types';
import { PriceDocEditor, type PriceDocResult } from '@/components/price-doc-editor';
import { invoiceToEditor, saveInvoiceFromEditor } from '@/lib/invoice-actions';
import { parseLocalDate } from '@/lib/jobs';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { SortControl } from '@/components/list-toolbar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { downloadCsv } from '@/app/admin/reports/components/history-tabs';
import { statusLabel } from '@/lib/status-styles';

const INVOICE_SORTS = [
    { value: 'date', label: 'Due date' },
    { value: 'issued', label: 'Issue date' },
    { value: 'total', label: 'Total' },
    { value: 'client', label: 'Client' },
    { value: 'number', label: 'Invoice #' },
];

/**
 * The client invoice list + editor. Shown on Financials → Invoices and on
 * Quotes & Invoices, so both places create and edit invoices the same way.
 * `search` comes from the host page's search box.
 */
export function InvoicesPanel({ search = '', onResetSearch, hideNewButton = false }: {
    search?: string;
    onResetSearch?: () => void;
    /** Quotes & Invoices has its own New → Invoice button. */
    hideNewButton?: boolean;
}) {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [invStatusFilter, setInvStatusFilter] = useState('all');
    const [invSort, setInvSort] = useState('date');
    const [invSortAsc, setInvSortAsc] = useState(false);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        const subs = [
            onSharedSnapshot('invoices', snap => setInvoices(snap.docs.map(d => ({ ...d.data(), id: d.id } as Invoice)))),
        ];
        return () => subs.forEach(u => u());
    }, []);


    // Status options come from the invoices that exist, with counts.
    const invoiceStatusOptions = useMemo(() => {
        const counts = new Map<string, number>();
        invoices.forEach(inv => { const k = (inv.status || 'draft').toLowerCase(); counts.set(k, (counts.get(k) || 0) + 1); });
        return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
    }, [invoices]);
    const filteredInvoices = useMemo(() => {
        const q = search.toLowerCase();
        const rows = invoices
            .filter(inv => invStatusFilter === 'all' || (inv.status || 'draft').toLowerCase() === invStatusFilter)
            .filter(inv => !q || [inv.invoiceNumber, inv.clientName, (Number(inv.total) || 0).toFixed(2)].some(v => (v || '').toLowerCase().includes(q)));
        const day = (v?: string | null) => (v ? parseLocalDate(v)?.getTime() ?? (new Date(v).getTime() || 0) : 0);
        return [...rows].sort((a, b) => {
            switch (invSort) {
                case 'issued': return day(b.issueDate) - day(a.issueDate);
                case 'total': return (Number(b.total) || 0) - (Number(a.total) || 0);
                case 'client': return (a.clientName || '').localeCompare(b.clientName || '');
                case 'number': return (b.invoiceNumber || '').localeCompare(a.invoiceNumber || '', undefined, { numeric: true });
                default: return invSortAsc ? day(a.dueDate) - day(b.dueDate) : day(b.dueDate) - day(a.dueDate);
            }
        });
    }, [invoices, search, invStatusFilter, invSort, invSortAsc]);
    const invoicePager = usePaged(filteredInvoices, PAGE_SIZES_LARGE, 'financials-invoices', [search, invStatusFilter, invSort, invSortAsc]);
    const exportInvoicesCsv = () => downloadCsv('invoices',
        ['Invoice #', 'Client', 'Issue date', 'Due date', 'Status', 'Subtotal', 'Tax', 'Total', 'Invoice ID'],
        filteredInvoices.map(inv => [inv.invoiceNumber, inv.clientName, inv.issueDate, inv.dueDate, statusLabel(inv.status),
            (Number((inv as any).subtotal) || 0).toFixed(2), (Number((inv as any).taxAmount ?? (inv as any).tax) || 0).toFixed(2), (Number(inv.total) || 0).toFixed(2), inv.id]));

    const handleSaveInvoice = async (r: PriceDocResult) => {
        setSaving(true);
        try {
            await saveInvoiceFromEditor(r, selectedInvoice);
            toast({ title: selectedInvoice ? 'Invoice updated' : 'Invoice created', description: `Invoice ${r.invoiceNumber} was saved.` });
            setIsEditorOpen(false);
        } catch (e: any) {
            toast({ variant: "destructive", title: "Save failed", description: e.message });
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div className="text-left">
                        <CardTitle className="text-base">Client invoices</CardTitle>
                        <CardDescription>Create and track every client invoice.</CardDescription>
                    </div>
                    {!hideNewButton && <Button onClick={() => { setSelectedInvoice(null); setIsEditorOpen(true); }} className="h-9 px-4"><Plus size={14} className="mr-2"/>New invoice</Button>}
                </CardHeader>
                <div className="flex flex-wrap items-center gap-2 px-6 pb-4">
                    <Select value={invStatusFilter} onValueChange={setInvStatusFilter}>
                        <SelectTrigger className="h-11 sm:h-9 w-[170px] bg-bg-secondary border-border-main" aria-label="Status">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses ({invoices.length})</SelectItem>
                            {invoiceStatusOptions.map(([k, n]) => <SelectItem key={k} value={k}>{statusLabel(k)} ({n})</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <SortControl value={invSort} onChange={setInvSort} options={INVOICE_SORTS} dateAsc={invSortAsc} onToggleDirection={() => setInvSortAsc(v => !v)} />
                    {invStatusFilter !== 'all' && (
                        <Button variant="ghost" size="sm" className="h-9 text-brand-red" onClick={() => setInvStatusFilter('all')}><X size={14} className="mr-1" />Reset</Button>
                    )}
                    <Button variant="outline" className="h-11 sm:h-9 ml-auto" onClick={exportInvoicesCsv} disabled={filteredInvoices.length === 0}>
                        <Download size={14} className="mr-1.5" />Export CSV ({filteredInvoices.length})
                    </Button>
                </div>
                <CardContent className="table-wrap p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-border-sub">
                                <TableHead className="pl-6">Invoice #</TableHead>
                                <TableHead>Client</TableHead>
                                <TableHead>Due date</TableHead>
                                <TableHead>Total</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {invoicePager.items.map((invoice) => (
                                <TableRow key={invoice.id} onClick={() => { setSelectedInvoice(invoice); setIsEditorOpen(true); }} className="cursor-pointer border-border-sub hover:bg-bg-tertiary transition-colors text-left">
                                    <TableCell className="font-mono font-bold text-brand-red text-xs pl-6">{invoice.invoiceNumber}</TableCell>
                                    <TableCell className="text-sm font-semibold">{invoice.clientName}</TableCell>
                                    <TableCell className="text-xs text-text-muted">{invoice.dueDate}</TableCell>
                                    <TableCell className="font-mono text-sm font-bold text-text-primary tabular-nums">${(Number(invoice.total) || 0).toFixed(2)}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <StatusBadge kind="invoice" value={invoice.status} />
                                            {invoice.status !== 'paid' && <SendInvoiceButton invoice={invoice} className="h-7 px-2 text-[12px]" />}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    {filteredInvoices.length === 0 && (
                        <div className="p-4">
                            {invoices.length === 0
                                ? <EmptyState compact icon={FileText} title="No invoices yet" description="Create an invoice to bill a client." />
                                : <EmptyState compact icon={FileText} title="No invoices match these filters"
                                    action={<Button size="sm" variant="outline" onClick={() => { onResetSearch?.(); setInvStatusFilter('all'); }}>Reset filters</Button>} />}
                        </div>
                    )}
                    <div className="px-4"><ListPager pager={invoicePager} noun="invoices" /></div>
                </CardContent>
            </Card>
            <PriceDocEditor
                open={isEditorOpen}
                onClose={() => setIsEditorOpen(false)}
                kind="invoice"
                initial={selectedInvoice ? invoiceToEditor(selectedInvoice) : undefined}
                initialDiscount={selectedInvoice ? (selectedInvoice.planDiscount ?? null) : undefined}
                title={selectedInvoice ? `Edit invoice ${selectedInvoice.invoiceNumber}` : 'New invoice'}
                saveLabel="Save invoice"
                saving={saving}
                onSave={handleSaveInvoice}
            />
        </>
    );
}
