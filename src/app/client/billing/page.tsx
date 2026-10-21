'use client';
import { useSessionState } from '@/hooks/use-session-state';

import { useState, useEffect, useMemo } from 'react';
import { usePaged, ListPager, PAGE_SIZES_LARGE, PAGE_SIZES_SMALL } from '@/components/list-pager';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/auth-context';
import { useClientInvoices } from '@/hooks/use-client-invoices';
import type { Invoice } from '@/lib/types';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from '@/components/page-header';
import { SearchField } from '@/components/search-field';
import { SortControl, FiltersPopover, FilterSection, CheckboxFilter } from '@/components/list-toolbar';
import { StatusBadge } from '@/components/status-badge';
import { statusLabel } from '@/lib/status-styles';
import { jobDateTimeValue } from '@/lib/jobs';
import { Banknote, Download, Search, FileText, Mail, Clock, ShieldCheck, Settings2, Sparkles, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { ClientPlanCard } from '@/components/client-plan-card';

/** Invoice numbers are stored with or without the INV- prefix. */
const invLabel = (n?: string) => (n || '').toUpperCase().startsWith('INV') ? (n || '') : `INV-${n || ''}`;

export default function ClientBillingPage() {
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useSessionState('client/billing:searchQuery', "");
    const [sortBy, setSortBy] = useSessionState<'date' | 'amount' | 'due'>('client/billing:sortBy', 'date');
    const [dateAsc, setDateAsc] = useState(false);
    const [statusFilter, setStatusFilter] = useSessionState<string[]>('client/billing:statusFilter', []);
    const router = useRouter();

    useEffect(() => {
        setMounted(true);
    }, []);

    // The signed-in client's real invoices (this page used to show the demo list).
    const { user: currentUser } = useAuth();
    const liveInvoices = useClientInvoices(currentUser);

    // Status options from the invoices actually on file, with counts.
    const statusOptions = useMemo(() => {
        const counts = new Map<string, number>();
        liveInvoices.forEach(inv => { const st = (inv.status || '').toLowerCase(); if (st) counts.set(st, (counts.get(st) || 0) + 1); });
        return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))
            .map(([value, n]) => ({ value, label: `${statusLabel(value)} (${n})` }));
    }, [liveInvoices]);

    const myInvoices = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const rows = liveInvoices.filter(inv =>
            (!statusFilter.length || statusFilter.includes((inv.status || '').toLowerCase())) &&
            (!q || [inv.invoiceNumber, inv.status, inv.issueDate, String(inv.total ?? '')].some(v => (v || '').toLowerCase().includes(q)))
        );
        return [...rows].sort((a, b) => {
            if (sortBy === 'amount') return (b.total ?? 0) - (a.total ?? 0);
            if (sortBy === 'due') return (jobDateTimeValue(a.dueDate) || Infinity) - (jobDateTimeValue(b.dueDate) || Infinity);
            const d = jobDateTimeValue(a.issueDate) - jobDateTimeValue(b.issueDate);
            return dateAsc ? d : -d;
        });
    }, [liveInvoices, searchQuery, statusFilter, sortBy, dateAsc]);
    const invoicePager = usePaged(myInvoices, PAGE_SIZES_LARGE, 'client-billing-invoices', [searchQuery, statusFilter, sortBy, dateAsc]);
    const filtered = !!searchQuery || statusFilter.length > 0;
    const resetFilters = () => { setSearchQuery(''); setStatusFilter([]); };

    if (!mounted || !currentUser) return null;

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Client portal"
                icon={Banknote}
                title="Billing"
                subtitle="Your invoices, payment history and service plan."
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card className="rounded-xl border-border-main bg-bg-secondary shadow-sm">
                        <CardHeader className="space-y-4">
                            <div>
                                <CardTitle className="text-base font-semibold">Invoices</CardTitle>
                                <CardDescription>All invoices sent to your account.</CardDescription>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search invoice # or amount" className="sm:max-w-xs" />
                                <div className="flex gap-2">
                                    <SortControl
                                        value={sortBy}
                                        onChange={v => setSortBy(v as typeof sortBy)}
                                        options={[{ value: 'date', label: 'Issue date' }, { value: 'due', label: 'Due soonest' }, { value: 'amount', label: 'Amount' }]}
                                        dateAsc={dateAsc}
                                        onToggleDirection={() => setDateAsc(v => !v)}
                                    />
                                    <FiltersPopover activeCount={statusFilter.length} onReset={() => setStatusFilter([])}>
                                        <FilterSection title="Status">
                                            <CheckboxFilter idPrefix="billing-status" options={statusOptions} selected={statusFilter} onChange={setStatusFilter} columns={1} />
                                        </FilterSection>
                                    </FiltersPopover>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-border-sub">
                                        <TableHead className="pl-6">Invoice #</TableHead>
                                        <TableHead>Issued</TableHead>
                                        <TableHead>Due</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right pr-6"><span className="sr-only">Download</span></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {invoicePager.items.map((inv) => (
                                        <TableRow key={inv.id} className="border-border-sub hover:bg-bg-tertiary transition-colors">
                                            <TableCell className="font-mono text-xs text-text-primary pl-6">{invLabel(inv.invoiceNumber)}</TableCell>
                                            <TableCell className="text-[13px]">{inv.issueDate || '—'}</TableCell>
                                            <TableCell className="text-[13px] text-text-muted">{inv.dueDate || '—'}</TableCell>
                                            <TableCell className="font-mono text-[13px] font-semibold text-text-primary">${(inv.total ?? 0).toLocaleString()}</TableCell>
                                            <TableCell><StatusBadge kind="invoice" value={inv.status} /></TableCell>
                                            <TableCell className="text-right pr-6">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-text-muted" aria-label="Download invoice">
                                                    <Download className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {myInvoices.length === 0 && (
                                        <TableRow className="hover:bg-transparent">
                                            <TableCell colSpan={6} className="h-32 text-center">
                                                {filtered && liveInvoices.length > 0 ? (
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

                <div className="space-y-6">
                    {/* The client's real plan and plan requests (was a hard-coded
                        "Dedicated Tier $999" and a request button that saved nothing). */}
                    <ClientPlanCard client={currentUser} />

                    <Card className="rounded-xl border-border-main bg-bg-secondary shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base font-semibold">
                                <FileText size={16} className="text-text-muted" />
                                Billing details
                            </CardTitle>
                            <CardDescription>Who receives invoices and how.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-4">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Billing contact</p>
                                    <p className="text-[13px] font-semibold text-text-primary">{currentUser?.billingDetails?.contactName || 'Not set'}</p>
                                    <div className="flex items-center gap-2 text-[12px] text-text-muted">
                                        <Mail size={12} />
                                        <span>{currentUser?.billingDetails?.email || 'No email on file'}</span>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border-sub/50">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Payment terms</p>
                                        <div className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
                                            <Clock size={12} className="text-text-muted" />
                                            {currentUser?.billingDetails?.terms || 'Net 30'}
                                        </div>
                                    </div>
                                    <div className="space-y-1 text-right">
                                        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Delivery</p>
                                        <p className="text-[13px] font-medium text-text-primary">{currentUser?.billingDetails?.deliveryMethod || 'Portal'}</p>
                                    </div>
                                </div>
                            </div>

                            <Button variant="outline" className="w-full" onClick={() => router.push('/client/profile')}>
                                Edit billing details
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>

        </div>
    );
}
