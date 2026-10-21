'use client';
import { useSessionState } from '@/hooks/use-session-state';

import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { useClientPlan } from '@/components/client-plan-card';
import { useState, useEffect, useMemo } from 'react';
import { usePaged, ListPager, PAGE_SIZES_LARGE, PAGE_SIZES_SMALL } from '@/components/list-pager';
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { useClientInvoices } from '@/hooks/use-client-invoices';
import type { Invoice, Technician } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    FileText,
    Download,
    Search,
    Coins,
    ArrowUpRight,
    CheckCircle2,
    ExternalLink,
    Banknote,
    Activity,
    Briefcase,
    Wrench,
    ChevronRight,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { money } from '@/lib/financial-summary';
import { PageHeader } from '@/components/page-header';
import { SearchField } from '@/components/search-field';
import { FiltersPopover, FilterSection, CheckboxFilter } from '@/components/list-toolbar';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { statusLabel } from '@/lib/status-styles';
import { jobDateTimeValue } from '@/lib/jobs';

/** Invoice numbers are stored with or without the INV- prefix. */
const invLabel = (n?: string) => (n || '').toUpperCase().startsWith('INV') ? (n || '') : `INV-${n || ''}`;

export default function ClientFinancialsPage() {
    // Signed-in client from Firebase Auth (sessionStorage is per-tab, so a
    // new tab showed nothing).
    const { user: currentUser } = useAuth();
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useSessionState('client/financials:searchQuery', "");
    const [statusFilter, setStatusFilter] = useSessionState<string[]>('client/financials:statusFilter', []);
    const { toast } = useToast();
    const router = useRouter();
    const { plan: currentPlan, current: currentSub } = useClientPlan(currentUser);

    useEffect(() => { setMounted(true); }, []);
    const myInvoices = useClientInvoices(currentUser);

    const statusOptions = useMemo(() => {
        const counts = new Map<string, number>();
        myInvoices.forEach(inv => { const st = (inv.status || '').toLowerCase(); if (st) counts.set(st, (counts.get(st) || 0) + 1); });
        return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))
            .map(([value, n]) => ({ value, label: `${statusLabel(value)} (${n})` }));
    }, [myInvoices]);

    const filteredInvoices = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return myInvoices
            .filter(inv =>
                (!statusFilter.length || statusFilter.includes((inv.status || '').toLowerCase())) &&
                (!q ||
                    (inv.invoiceNumber || '').toLowerCase().includes(q) ||
                    (inv.projectId || '').toLowerCase().includes(q) ||
                    (inv.workOrderId || '').toLowerCase().includes(q))
            )
            .sort((a, b) => jobDateTimeValue(b.issueDate) - jobDateTimeValue(a.issueDate));
    }, [myInvoices, searchQuery, statusFilter]);
    const invoicePager = usePaged(filteredInvoices, PAGE_SIZES_LARGE, 'client-financials-invoices', [searchQuery, statusFilter]);
    const filtered = !!searchQuery || statusFilter.length > 0;
    const resetFilters = () => { setSearchQuery(''); setStatusFilter([]); };

    // Totals cover every invoice on the account, not just the filtered rows.
    const metrics = useMemo(() => {
        const outstanding = myInvoices.filter(inv => inv.status === 'sent' || inv.status === 'overdue').reduce((acc, inv) => acc + money(inv.total), 0);
        const paid = myInvoices.filter(inv => inv.status === 'paid').reduce((acc, inv) => acc + money(inv.total), 0);
        
        return { outstanding, paid };
    }, [myInvoices]);

    const getInvoiceSource = (invoice: Invoice) => {
        if (invoice.projectId) return { label: 'Project', id: invoice.projectId, icon: Briefcase };
        if (invoice.workOrderId) return { label: 'Job', id: invoice.workOrderId, icon: Wrench };
        return { label: 'General', id: '', icon: FileText };
    };

    const handleExportInvoices = () => {
        const rows = [
            ['Invoice #', 'Date', 'Source', 'Source ID', 'Status', 'Total']
        ];
        
        filteredInvoices.forEach(inv => {
            const source = getInvoiceSource(inv);
            rows.push([
                invLabel(inv.invoiceNumber),
                inv.issueDate || '',
                source.label,
                inv.projectId || inv.workOrderId || '',
                statusLabel(inv.status),
                String(inv.total ?? 0)
            ]);
        });

        const csvContent = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Invoices_Export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast({ title: "Download started", description: `${filteredInvoices.length} invoices exported to CSV.`});
    };


    if (!mounted) return null;

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Client portal"
                icon={Banknote}
                title="Financials"
                subtitle="Balances, payments and every invoice on your account."
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <StatCard label="Balance due" icon={ArrowUpRight} value={`$${metrics.outstanding.toLocaleString()}`} sub="Sent and overdue invoices" />
                <StatCard label="Paid" icon={CheckCircle2} tone="done" value={`$${metrics.paid.toLocaleString()}`} sub="Invoices paid in full" />
                <StatCard
                    label="Service plan"
                    icon={Coins}
                    onClick={() => router.push('/client/billing')}
                    value={currentSub ? <span className="capitalize">{currentPlan?.name || 'Service plan'}</span> : 'No plan'}
                    sub={<span className="flex items-center gap-1">{currentPlan ? `${currentPlan.benefits.responseHours}-hour response` : `${currentUser?.billingDetails?.terms || 'Net 30'} terms`}<ChevronRight size={12} /></span>}
                />
            </div>

            <Card className="rounded-xl border-border-main bg-bg-secondary shadow-sm">
                <CardHeader className="flex flex-col gap-4 pb-4 border-b border-border-sub lg:flex-row lg:items-center lg:justify-between space-y-0">
                    <div className="text-left">
                        <CardTitle className="text-base font-semibold">Invoices</CardTitle>
                        <CardDescription>Every invoice for your projects and jobs.</CardDescription>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search invoice #, project or job" className="sm:w-[260px]" />
                        <div className="flex gap-2">
                            <FiltersPopover activeCount={statusFilter.length} onReset={() => setStatusFilter([])}>
                                <FilterSection title="Status">
                                    <CheckboxFilter idPrefix="fin-status" options={statusOptions} selected={statusFilter} onChange={setStatusFilter} columns={1} />
                                </FilterSection>
                            </FiltersPopover>
                            <Button variant="outline" onClick={handleExportInvoices} disabled={filteredInvoices.length === 0}>
                                <Download size={14} className="mr-2" /> Export CSV
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-border-sub">
                                <TableHead className="pl-6">Invoice #</TableHead>
                                <TableHead>For</TableHead>
                                <TableHead>Issued</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-right pr-6"><span className="sr-only">Open</span></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {invoicePager.items.map(invoice => {
                                const source = getInvoiceSource(invoice);
                                const SourceIcon = source.icon;
                                return (
                                    <TableRow key={invoice.id} className="border-border-sub hover:bg-bg-tertiary transition-colors group">
                                        <TableCell className="pl-6 text-left">
                                            <p className="font-mono text-xs font-semibold text-text-primary">{invLabel(invoice.invoiceNumber)}</p>
                                        </TableCell>
                                        <TableCell className="text-left">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-[11px] bg-bg-primary border-border-sub flex items-center gap-1.5">
                                                    <SourceIcon size={12}/>
                                                    {source.label}
                                                </Badge>
                                                {source.id && <span className="font-mono text-[11px] text-text-muted">{source.id.toUpperCase()}</span>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-left">
                                            <p className="text-[13px] text-text-secondary">{invoice.issueDate || '—'}</p>
                                        </TableCell>
                                        <TableCell className="text-left">
                                            <StatusBadge kind="invoice" value={invoice.status} />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <p className="text-[13px] font-mono font-semibold text-text-primary">${(invoice.total ?? 0).toLocaleString()}</p>
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <div className="flex justify-end gap-2">
                                                <Button variant="ghost" size="icon" aria-label="Invoice details" className="h-8 w-8 text-text-muted group-hover:text-text-primary transition-colors" onClick={() => toast({ title: "Coming soon", description: "Detailed invoice view is on the way."})}>
                                                    <ExternalLink className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {filteredInvoices.length === 0 && (
                                <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={6} className="h-32 text-center">
                                        {filtered && myInvoices.length > 0 ? (
                                            <div className="space-y-2">
                                                <p className="text-[13px] text-text-muted">No invoices match these filters.</p>
                                                <Button variant="outline" size="sm" onClick={resetFilters}>Reset</Button>
                                            </div>
                                        ) : (
                                            <p className="text-[13px] text-text-muted">No invoices yet.</p>
                                        )}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                    </div>
                    <div className="px-4"><ListPager pager={invoicePager} noun="invoices" /></div>
                </CardContent>
            </Card>
        </div>
    );
}
