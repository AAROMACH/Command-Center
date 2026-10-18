'use client';
import { onSharedSnapshot } from '@/lib/shared-snapshot';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { usePaged, ListPager, PAGE_SIZES_LARGE, PAGE_SIZES_SMALL } from '@/components/list-pager';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Banknote, ArrowUpRight, ArrowDownRight, Minus, Download, FileText, BarChart, FileWarning, Plus, Calendar as CalendarIcon, Check, X, ShieldAlert, Search, Info, Undo2, TrendingUp, Activity, Navigation, Car } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Expense, Invoice, WeeklyLog, Technician, WorkOrder, Reimbursement } from '@/lib/types';
import { InvoiceEditor } from './components/invoice-editor';
import { RevenueChart } from './components/revenue-chart';
import { MetricBreakdownSheet, type MetricKey } from './components/metric-breakdown-sheet';
import { computeFinancialSummary, monthBreakdown } from '@/lib/financial-summary';
import { computeWeeklyLogSettlement } from '@/lib/payroll';
import { mergeJobs, parseLocalDate } from '@/lib/jobs';
import { PageHeader } from '@/components/page-header';
import { SearchField } from '@/components/search-field';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { isSuperAdmin, isClient } from '@/lib/permissions';
import { useSearchParams, useRouter } from 'next/navigation';
import { db } from "@/lib/firebase";
import { NotificationService } from '@/lib/notification-service';
import { collection, onSnapshot, query, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import { startOfMonth, endOfMonth, subMonths, format, isWithinInterval, parseISO, startOfDay } from 'date-fns';

/**
 * @fileOverview Master Financial Registry.
 * High-fidelity oversight of organizational revenue, operative payroll, and project economics.
 */

export default function FinancialsPage() {
    const searchParams = useSearchParams();
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [projects, setProjects] = useState<any[]>([]);
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [assignments, setAssignments] = useState<WorkOrder[]>([]);
    const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
    const [mileageRate, setMileageRate] = useState(0.67);

    const [reimTypeFilter, setReimTypeFilter] = useState<'all' | 'receipt' | 'mileage'>('all');
    const [reimStatusFilter, setReimStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'paid'>('all');
    const [searchQuery, setSearchQuery] = useState("");
    const [invStatusFilter, setInvStatusFilter] = useState('all');
    const [invSort, setInvSort] = useState('date');
    const [invSortAsc, setInvSortAsc] = useState(false);
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'summary');

    const [isInvoiceEditorOpen, setIsInvoiceEditorOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    
    const [isClosePeriodOpen, setIsClosePeriodOpen] = useState(false);
    const [confirmationText, setConfirmationText] = useState("");
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [exportConfig, setExportConfig] = useState({
        from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0],
        types: ['invoices', 'expenses', 'payroll']
    });

    const { toast } = useToast();
    const router = useRouter();

    // 1. Initialize Data Listeners
    useEffect(() => {
        const unsubExp = onSharedSnapshot('expenses', (snap) => {
            setExpenses(snap.docs.map(d => ({ ...d.data(), id: d.id } as Expense)));
        });
        const unsubInv = onSharedSnapshot('invoices', (snap) => {
            setInvoices(snap.docs.map(d => ({ ...d.data(), id: d.id } as Invoice)));
        });
        const unsubLog = onSharedSnapshot('weeklyLogs', (snap) => {
            setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)));
        });
        const unsubTech = onSharedSnapshot('users', (snap) => {
            setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
        });
        const unsubProj = onSharedSnapshot('projects', (snap) => {
            setProjects(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        });
        const unsubWO = onSharedSnapshot('workOrders', (snap) => {
            setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });
        const unsubAsmt = onSharedSnapshot('assignments', (snap) => {
            setAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });
        const unsubReim = onSharedSnapshot('reimbursements', (snap) => {
            setReimbursements(snap.docs.map(d => ({ ...d.data(), id: d.id } as Reimbursement)));
        });

        getDoc(doc(db, 'adminConfig', 'finance')).then(snap => {
            if (snap.exists() && snap.data()?.mileageRate) setMileageRate(snap.data()!.mileageRate);
        }).catch(() => {});

        const userId = sessionStorage.getItem('currentUserId');
        if (userId) {
            const unsubUser = onSnapshot(doc(db, 'users', userId), (d) => {
                if (d.exists()) setCurrentUser({ ...d.data(), id: d.id } as Technician);
            });
            return () => {
                unsubExp(); unsubInv(); unsubLog(); unsubTech(); unsubProj(); unsubWO(); unsubAsmt(); unsubReim(); unsubUser();
            };
        }

        return () => {
            unsubExp(); unsubInv(); unsubLog(); unsubTech(); unsubProj(); unsubWO(); unsubAsmt(); unsubReim();
        };
    }, []);

    // 2. Summary cards + cash-flow chart — one shared calculation
    // (lib/financial-summary.ts) so each card, its drill-down and the chart
    // always agree. Weekly logs are valued at their live settlement, the same
    // figure Payroll Audit shows; A/R counts only sent/overdue invoices.
    const jobsById = useMemo(() => new Map(mergeJobs(workOrders, assignments).map(j => [j.id, j as WorkOrder])), [workOrders, assignments]);
    const summary = useMemo(
        () => computeFinancialSummary({ invoices, expenses, weeklyLogs, jobsById }),
        [invoices, expenses, weeklyLogs, jobsById],
    );
    const [openMetric, setOpenMetric] = useState<MetricKey | null>(null);

    const stats = useMemo(() => {
        const usd0 = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
        return [
            { key: 'revenue' as const, title: "REVENUE (MTD)", value: usd0(summary.month.revenue), trend: `${summary.month.jobs.length} COMPLETED JOB${summary.month.jobs.length !== 1 ? 'S' : ''} + PAID INVOICES`, trendType: "positive" as const, TrendIcon: ArrowUpRight },
            { key: 'tech' as const, title: "TECH PAY (MTD)", value: usd0(summary.month.techPortion), trend: "TECH PORTION · EXPENSE", trendType: "warning" as const, TrendIcon: Minus },
            { key: 'profit' as const, title: "AAROMACH PROFIT (MTD)", value: usd0(summary.month.profit), trend: `${summary.margin.toFixed(1)}% OF REVENUE · AFTER FN FEES`, trendType: summary.month.profit >= 0 ? "positive" as const : "negative" as const, TrendIcon: TrendingUp },
            { key: 'pending' as const, title: "PENDING PAYOUTS", value: usd0(summary.pendingTotal), trend: `${summary.pending.length} SUBMITTED LOG${summary.pending.length !== 1 ? 'S' : ''} AWAITING APPROVAL`, trendType: "warning" as const, TrendIcon: Minus },
            { key: 'ar' as const, title: "OUTSTANDING A/R", value: usd0(summary.receivableTotal), trend: `${summary.receivables.length} SENT / OVERDUE INVOICE${summary.receivables.length !== 1 ? 'S' : ''}`, trendType: "positive" as const, TrendIcon: Activity },
        ];
    }, [summary]);

    const chartData = useMemo(() => {
        const now = new Date();
        return [5, 4, 3, 2, 1, 0].map(i => {
            const date = subMonths(now, i);
            const m = monthBreakdown(date, { invoices, expenses, weeklyLogs, jobsById });
            return { month: format(date, 'MMM yy').toUpperCase(), revenue: m.revenue, expenses: m.costs };
        });
    }, [invoices, expenses, weeklyLogs, jobsById]);

    const userIsSuperAdmin = isSuperAdmin(currentUser);
    const allMissions = useMemo(() => [...workOrders, ...assignments], [workOrders, assignments]);

    const handleExpenseStatusChange = async (id: string, status: 'Approved' | 'Rejected') => {
        try {
            await updateDoc(doc(db, 'expenses', id), { status });
            toast({ title: `Expense ${status}`, description: `The expense has been successfully ${status.toLowerCase()}.` });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Save failed", description: e.message });
        }
    };
    
    const getTechnicianName = (id: string) => technicians.find(t => t.id === id)?.name || 'Unknown';
    const getTechnician = (id: string) => technicians.find(t => t.id === id);
    const clientsList = technicians.filter(isClient);
    
    const handleSaveInvoice = async (savedInvoice: Invoice) => {
        try {
            const cleanedData = JSON.parse(JSON.stringify(savedInvoice));
            const { id, ...data } = cleanedData;

            if (id) {
                await setDoc(doc(db, 'invoices', id), cleanedData);
                toast({ title: 'Invoice updated', description: `Invoice ${savedInvoice.invoiceNumber} was updated.` });
            } else {
                const newId = await createDocId(ID_PREFIXES.INVOICE);
                await setDoc(doc(db, 'invoices', newId), { ...data, id: newId });
                toast({ title: 'Invoice created', description: `Invoice ${savedInvoice.invoiceNumber} was created.` });
            }
            setIsInvoiceEditorOpen(false);
        } catch (e: any) {
            console.error("Financial registry write error:", e);
            toast({ variant: "destructive", title: "Save Failed", description: e.message });
        }
    };

    const handleExecuteExport = () => {
        if (exportConfig.types.length === 0) {
            toast({ variant: 'destructive', title: 'Export Configuration Error', description: 'Please select at least one data category.' });
            return;
        }

        const start = startOfDay(parseISO(exportConfig.from));
        const end = startOfDay(parseISO(exportConfig.to));

        const escapeCSV = (val: any) => {
            const str = String(val ?? "");
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const rows: string[][] = [
            ['TYPE', 'REFERENCE ID', 'DATE', 'ENTITY', 'DESCRIPTION', 'AMOUNT', 'STATUS']
        ];

        if (exportConfig.types.includes('invoices')) {
            invoices.forEach(inv => {
                const d = startOfDay(parseISO(inv.issueDate));
                if (isWithinInterval(d, { start, end })) {
                    rows.push(['INV', inv.invoiceNumber, inv.issueDate, inv.clientName, 'Invoice', inv.total.toString(), inv.status]);
                }
            });
        }

        if (exportConfig.types.includes('expenses')) {
            expenses.forEach(exp => {
                const d = startOfDay(parseISO(exp.date));
                if (isWithinInterval(d, { start, end })) {
                    rows.push(['EXP', exp.id, exp.date, exp.submittedBy, exp.description, exp.amount.toString(), exp.status]);
                }
            });
        }

        if (exportConfig.types.includes('payroll')) {
            weeklyLogs.forEach(log => {
                try {
                    const parts = log.weekOf.split('-');
                    const d = startOfDay(new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1])));
                    if (isWithinInterval(d, { start, end })) {
                        rows.push(['PAY', log.id, log.weekOf, getTechnicianName(log.techId), 'Weekly Log Payout', computeWeeklyLogSettlement(log, jobsById).toFixed(2), log.status]);
                    }
                } catch(e) {}
            });
        }

        if (rows.length === 1) {
            toast({ title: 'Nothing to export', description: 'No records found matching the specified temporal window.' });
            return;
        }

        const csvContent = rows.map(r => r.map(escapeCSV).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Aaromach_General_Ledger_${exportConfig.from}_to_${exportConfig.to}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast({ title: 'Ledger exported', description: 'Your CSV download has started.' });
        setIsExportDialogOpen(false);
    };


    // Status options come from the invoices that exist, with counts.
    const invoiceStatusOptions = useMemo(() => {
        const counts = new Map<string, number>();
        invoices.forEach(inv => { const k = (inv.status || 'draft').toLowerCase(); counts.set(k, (counts.get(k) || 0) + 1); });
        return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
    }, [invoices]);
    const filteredInvoices = useMemo(() => {
        const q = searchQuery.toLowerCase();
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
    }, [invoices, searchQuery, invStatusFilter, invSort, invSortAsc]);
    const invoicePager = usePaged(filteredInvoices, PAGE_SIZES_LARGE, 'financials-invoices', [searchQuery, invStatusFilter, invSort, invSortAsc]);
    const exportInvoicesCsv = () => downloadCsv('invoices',
        ['Invoice #', 'Client', 'Issue date', 'Due date', 'Status', 'Subtotal', 'Tax', 'Total', 'Invoice ID'],
        filteredInvoices.map(inv => [inv.invoiceNumber, inv.clientName, inv.issueDate, inv.dueDate, statusLabel(inv.status),
            (Number((inv as any).subtotal) || 0).toFixed(2), (Number((inv as any).taxAmount ?? (inv as any).tax) || 0).toFixed(2), (Number(inv.total) || 0).toFixed(2), inv.id]));


    const filteredExpenses = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return expenses.filter(exp => (exp.description || '').toLowerCase().includes(q) || (exp.submittedBy || '').toLowerCase().includes(q) || (exp.category || '').toLowerCase().includes(q));
    }, [expenses, searchQuery]);

    // Reimbursements table rows (legacy expenses + new reimbursements), newest first.
    const reimbRows = useMemo(() => {
                                            // Normalize legacy expenses as receipt reimbursements
                                            const legacyRows = filteredExpenses
                                                .filter(e => reimTypeFilter !== 'mileage')
                                                .filter(e => reimStatusFilter === 'all' || e.status.toLowerCase() === reimStatusFilter)
                                                .map(e => ({
                                                    id: e.id,
                                                    source: 'expense' as const,
                                                    date: e.date,
                                                    techName: e.submittedBy,
                                                    type: 'receipt' as const,
                                                    status: e.status.toLowerCase() as 'pending' | 'approved' | 'rejected',
                                                    amount: e.amount,
                                                    details: e.description,
                                                    sub: e.category,
                                                    distanceMiles: undefined as number | undefined,
                                                    mileageRate: undefined as number | undefined,
                                                    receiptPhotoUrls: undefined as string[] | undefined,
                                                    notes: undefined as string | undefined,
                                                    techId: undefined as string | undefined,
                                                }));

                                            // New reimbursements
                                            const newRows = reimbursements
                                                .filter(r => reimTypeFilter === 'all' || r.type === reimTypeFilter)
                                                .filter(r => reimStatusFilter === 'all' || r.status === reimStatusFilter)
                                                .filter(r => {
                                                    const q = searchQuery.toLowerCase();
                                                    if (!q) return true;
                                                    const amt = r.type === 'mileage' ? (r.distanceMiles || 0) * (r.mileageRate || mileageRate) : r.amount;
                                                    return [r.techName, r.description, r.vendorName, r.relatedJobId, r.relatedJobTitle, (amt || 0).toFixed(2)]
                                                        .some(v => (v || '').toLowerCase().includes(q));
                                                })
                                                .map(r => ({
                                                    id: r.id,
                                                    source: 'reimbursement' as const,
                                                    date: r.type === 'mileage' ? (r.dateDriven || r.submittedAt?.slice(0, 10) || '') : (r.purchaseDate || r.submittedAt?.slice(0, 10) || ''),
                                                    techName: r.techName,
                                                    type: r.type,
                                                    status: r.status,
                                                    amount: r.type === 'mileage'
                                                        ? (r.distanceMiles || 0) * (r.mileageRate || mileageRate)
                                                        : r.amount,
                                                    details: r.type === 'mileage'
                                                        ? `${r.fromLocation || ''} → ${r.toLocation || ''}`
                                                        : (r.description || r.vendorName || ''),
                                                    sub: r.type === 'mileage'
                                                        ? `${r.distanceMiles?.toFixed(1) || '0'} mi × $${(r.mileageRate || mileageRate).toFixed(2)}`
                                                        : (r.vendorName || ''),
                                                    distanceMiles: r.distanceMiles,
                                                    mileageRate: r.mileageRate,
                                                    receiptPhotoUrls: r.receiptPhotoUrls,
                                                    notes: r.notes,
                                                    techId: r.techId as string | undefined,
                                                }));

                                            return [...legacyRows, ...newRows]
                                                .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    }, [filteredExpenses, reimbursements, reimTypeFilter, reimStatusFilter, mileageRate, searchQuery]);
    const reimbPager = usePaged(reimbRows, PAGE_SIZES_LARGE, 'financials-reimbursements', [reimTypeFilter, reimStatusFilter, searchQuery]);

    return (
        <div className="text-left animate-in fade-in duration-700">
            <PageHeader
                eyebrow="Finance"
                icon={Banknote}
                title="Accounting"
                subtitle="Client revenue, technician pay and reimbursements in one place."
                actions={<>
                    <SearchField className="w-full md:w-[260px]" placeholder="Search invoices and reimbursements…" value={searchQuery} onChange={setSearchQuery} />
                    <Button variant="outline" onClick={() => setIsExportDialogOpen(true)} className="h-9"><Download size={14} className="mr-1.5" />Export ledger</Button>
                    <Button variant="secondary" onClick={() => setIsClosePeriodOpen(true)} className="h-9">
                        {userIsSuperAdmin ? "Close period" : "Request period close"}
                    </Button>
                </>}
            />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full text-left">
                <div className="flex items-center justify-between gap-4">
                    <TabsList className="tabs !p-0 !bg-bg-tertiary">
                        <TabsTrigger value="summary" className="tab">Summary</TabsTrigger>
                        <TabsTrigger value="invoices" className="tab">Invoices</TabsTrigger>
                        <TabsTrigger value="reimbursements" className="tab">Reimbursements</TabsTrigger>
                    </TabsList>
                    <button
                        onClick={() => router.push('/admin/payroll/audit')}
                        className="h-9 px-4 rounded-md border border-border-main text-[13px] font-medium transition-colors bg-bg-secondary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                    >
                        Payroll audit ↗
                    </button>
                </div>
                
                <div className="mt-6 text-left">
                    <TabsContent value="summary" className="m-0 space-y-8">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                            {stats.map((metric, index) => (
                                <Card
                                    key={index}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setOpenMetric(metric.key)}
                                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenMetric(metric.key); } }}
                                    title="Show how this is calculated"
                                    className="bg-bg-secondary border-border-main rounded-xl shadow-sm hover:border-text-muted transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red"
                                >
                                    <CardHeader className="pb-4">
                                        <div className="flex justify-between items-start">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{metric.title}</span>
                                            <metric.TrendIcon size={16} className={cn(
                                                metric.trendType === 'positive' ? 'text-text-green' :
                                                metric.trendType === 'negative' ? 'text-text-red' :
                                                'text-accent-gold'
                                            )} />
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className={cn("text-3xl font-mono font-bold tabular-nums",
                                            metric.trendType === 'negative' ? 'text-text-red' :
                                            metric.trendType === 'warning' ? 'text-accent-gold' :
                                            'text-text-primary'
                                        )}>
                                            {metric.value}
                                        </p>
                                        <p className={cn("text-[12px] font-medium mt-3",
                                            metric.trendType === 'positive' ? 'text-text-green' : 'text-text-muted'
                                        )}>
                                            {metric.trend}
                                        </p>
                                        <p className="text-[12px] font-medium text-text-muted mt-2">View breakdown →</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                        <MetricBreakdownSheet
                            metric={openMetric}
                            onClose={() => setOpenMetric(null)}
                            summary={summary}
                            technicians={technicians}
                            allInvoices={invoices}
                        />

                        <Card className="bg-bg-secondary border-border-main rounded-xl shadow-sm overflow-hidden">
                            <CardHeader className="border-b border-border-sub bg-bg-tertiary/20">
                                <div className="flex items-center justify-between">
                                    <div className="text-left">
                                        <CardTitle className="text-base">Cash flow</CardTitle>
                                        <CardDescription className="text-[12px] text-text-muted">Revenue collected vs. field costs, by month.</CardDescription>
                                    </div>
                                    <Badge variant="outline" className="bg-bg-primary text-[10px] font-semibold uppercase tracking-wide">Last 6 months</Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-8">
                                <RevenueChart data={chartData} />
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="invoices" className="m-0">
                         <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div className="text-left">
                                    <CardTitle className="text-base">Client invoices</CardTitle>
                                    <CardDescription>Create and track every client invoice.</CardDescription>
                                </div>
                                <Button onClick={() => { setSelectedInvoice(null); setIsInvoiceEditorOpen(true); }} className="h-9 px-4"><Plus size={14} className="mr-2"/>New invoice</Button>
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
                                            <TableRow key={invoice.id} onClick={() => { setSelectedInvoice(invoice); setIsInvoiceEditorOpen(true); }} className="cursor-pointer border-border-sub hover:bg-bg-tertiary transition-colors text-left">
                                                <TableCell className="font-mono font-bold text-brand-red text-xs pl-6">{invoice.invoiceNumber}</TableCell>
                                                <TableCell className="text-sm font-semibold">{invoice.clientName}</TableCell>
                                                <TableCell className="text-xs text-text-muted">{invoice.dueDate}</TableCell>
                                                <TableCell className="font-mono text-sm font-bold text-text-primary tabular-nums">${(Number(invoice.total) || 0).toFixed(2)}</TableCell>
                                                <TableCell>
                                                    <StatusBadge kind="invoice" value={invoice.status} />
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
                                                action={<Button size="sm" variant="outline" onClick={() => { setSearchQuery(''); setInvStatusFilter('all'); }}>Reset filters</Button>} />}
                                    </div>
                                )}
                                <div className="px-4"><ListPager pager={invoicePager} noun="invoices" /></div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="reimbursements" className="m-0 space-y-4">
                        {/* Filter bar */}
                        <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center rounded-md border border-border-main overflow-hidden h-8 bg-bg-secondary shrink-0">
                                {(['all', 'receipt', 'mileage'] as const).map((v, i) => (
                                    <>
                                        {i > 0 && <div key={`d${v}`} className="w-px h-full bg-border-main" />}
                                        <button
                                            key={v}
                                            onClick={() => setReimTypeFilter(v)}
                                            className={cn('px-3 h-full text-[12px] font-medium transition-colors', reimTypeFilter === v ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary')}
                                        >{v === 'all' ? 'All types' : v === 'receipt' ? 'Receipt' : 'Mileage'}</button>
                                    </>
                                ))}
                            </div>
                            <div className="flex items-center rounded-md border border-border-main overflow-hidden h-8 bg-bg-secondary shrink-0">
                                {(['all', 'pending', 'approved', 'rejected', 'paid'] as const).map((v, i) => (
                                    <>
                                        {i > 0 && <div key={`ds${v}`} className="w-px h-full bg-border-main" />}
                                        <button
                                            key={v}
                                            onClick={() => setReimStatusFilter(v)}
                                            className={cn('px-3 h-full text-[12px] font-medium transition-colors', reimStatusFilter === v ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary')}
                                        >{v === 'all' ? 'All statuses' : statusLabel(v)}</button>
                                    </>
                                ))}
                            </div>
                            <p className="text-[12px] font-medium text-text-muted ml-auto">
                                Mileage rate: <span className="text-text-primary">${mileageRate.toFixed(2)}/mi</span>
                            </p>
                        </div>

                        <Card>
                            <CardHeader className="text-left">
                                <CardTitle>Reimbursements</CardTitle>
                                <CardDescription>Receipts and mileage submitted by techs. Approve, reject or mark paid.</CardDescription>
                            </CardHeader>
                            <CardContent className="table-wrap p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent border-border-sub">
                                            <TableHead className="pl-6">Date</TableHead>
                                            <TableHead>Technician</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Details</TableHead>
                                            <TableHead>Amount</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right pr-6"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {reimbPager.total === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={7} className="text-center py-12 text-xs text-text-muted">
                                                        No reimbursements match the current filters.
                                                    </TableCell>
                                                </TableRow>
                                        ) : reimbPager.items.map(row => (
                                                <TableRow key={`${row.source}-${row.id}`} className="border-border-sub hover:bg-bg-tertiary transition-colors text-left">
                                                    <TableCell className="text-xs text-text-muted pl-6">{row.date}</TableCell>
                                                    <TableCell className="text-sm font-semibold">{row.techName}</TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant="scheduled"
                                                            className="text-[10px] h-5 font-semibold uppercase tracking-wide flex items-center gap-1 w-fit"
                                                        >
                                                            {row.type === 'mileage' ? <><Car size={8} />&nbsp;Mileage</> : 'Receipt'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-bold text-text-primary text-xs truncate max-w-[200px]">{row.details}</div>
                                                        {row.sub && <div className="text-[11px] text-text-muted">{row.sub}</div>}
                                                        {row.notes && <div className="text-[11px] text-text-muted mt-0.5 truncate max-w-[200px]">{row.notes}</div>}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-sm font-bold text-text-primary tabular-nums">${row.amount.toFixed(2)}</TableCell>
                                                    <TableCell>
                                                        <StatusBadge kind={row.status === 'paid' ? 'log' : 'request'} value={row.status} />
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6">
                                                        {row.status === 'pending' && (
                                                            <div className="flex gap-2 justify-end">
                                                                <Button size="sm" variant="destructive-outline" className="h-7 text-[11px]"
                                                                    onClick={async () => {
                                                                        try {
                                                                            if (row.source === 'expense') {
                                                                                await updateDoc(doc(db, 'expenses', row.id), { status: 'Rejected' });
                                                                            } else {
                                                                                await updateDoc(doc(db, 'reimbursements', row.id), { status: 'rejected', reviewedAt: new Date().toISOString() });
                                                                                if (row.techId) NotificationService.notify(row.techId, 'Reimbursement rejected',
                                                                                    `Your $${row.amount.toFixed(2)} ${row.type} reimbursement (${row.details || row.date}) was not approved. Ask payroll if you have questions.`, undefined, { portal: 'tech' }).catch(() => {});
                                                                            }
                                                                            toast({ title: 'Reimbursement rejected' });
                                                                        } catch { toast({ variant: 'destructive', title: 'Error' }); }
                                                                    }}
                                                                >Deny</Button>
                                                                <Button size="sm" className="h-7 text-[11px] bg-brand-red hover:bg-brand-red/90 text-white"
                                                                    onClick={async () => {
                                                                        try {
                                                                            if (row.source === 'expense') {
                                                                                await updateDoc(doc(db, 'expenses', row.id), { status: 'Approved' });
                                                                            } else {
                                                                                await updateDoc(doc(db, 'reimbursements', row.id), { status: 'approved', reviewedAt: new Date().toISOString() });
                                                                                if (row.techId) NotificationService.notify(row.techId, 'Reimbursement approved',
                                                                                    `Your $${row.amount.toFixed(2)} ${row.type} reimbursement (${row.details || row.date}) was approved.`, undefined, { portal: 'tech', inAppOnly: true }).catch(() => {});
                                                                            }
                                                                            toast({ title: 'Reimbursement approved' });
                                                                        } catch { toast({ variant: 'destructive', title: 'Error' }); }
                                                                    }}
                                                                >Approve</Button>
                                                            </div>
                                                        )}
                                                        {row.status === 'approved' && row.source === 'reimbursement' && (
                                                            <Button size="sm" className="h-8 bg-text-green/10 text-text-green border border-text-green/20 hover:bg-text-green hover:text-white"
                                                                onClick={async () => {
                                                                    try {
                                                                        await updateDoc(doc(db, 'reimbursements', row.id), { status: 'paid', paidAt: new Date().toISOString() });
                                                                        toast({ title: 'Marked as paid' });
                                                                    } catch { toast({ variant: 'destructive', title: 'Error' }); }
                                                                }}
                                                            >Mark paid</Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                <div className="px-4"><ListPager pager={reimbPager} noun="reimbursements" /></div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </div>
            </Tabs>

            {/* PERIOD CLOSURE TERMINAL */}
            <Dialog open={isClosePeriodOpen} onOpenChange={setIsClosePeriodOpen}>
                <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default flex flex-col p-0 overflow-hidden shadow-2xl">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30 text-left">
                        <div className="flex items-center gap-2 mb-1">
                            <ShieldAlert className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-semibold">
                                {userIsSuperAdmin ? "Close this period" : "Request period close"}
                            </DialogTitle>
                        </div>
                        <DialogDescription className="text-xs">
                            {userIsSuperAdmin ? "This action permanently locks the general ledger for the current period." : "A super admin needs to approve closing the period."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="p-6 space-y-6">
                        <div className="p-4 rounded-lg bg-brand-red-dim/10 border border-brand-red/30 space-y-2 text-left">
                            <p className="text-[10px] font-bold text-brand-red uppercase tracking-wider mb-1">Please confirm</p>
                            <p className="text-[12px] text-text-secondary leading-relaxed font-medium">Closing the period makes every financial record for it read-only.</p>
                        </div>
                        {userIsSuperAdmin ? (
                            <div className="space-y-3 pt-2 text-left">
                                <Label className="text-[10px] font-bold text-text-muted">Type <span className="text-text-primary">CLOSE</span> to confirm</Label>
                                <Input placeholder="Type CLOSE" value={confirmationText} onChange={(e) => setConfirmationText(e.target.value)} className="h-11 bg-bg-primary text-center font-mono text-sm font-bold" />
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 p-4 rounded-lg bg-bg-secondary border border-border-sub">
                                <Info size={16} className="text-text-muted" />
                                <p className="text-[12px] text-text-muted leading-snug">A super admin must approve before the period closes.</p>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default flex gap-3">
                        <Button variant="outline" onClick={() => { setIsClosePeriodOpen(false); setConfirmationText(""); }} className="flex-1  h-11">Cancel</Button>
                        <Button onClick={() => { toast({ title: userIsSuperAdmin ? "Period closed" : "Request sent" }); setIsClosePeriodOpen(false); }} disabled={userIsSuperAdmin && confirmationText !== "CLOSE"} className="flex-1 bg-brand-red hover:bg-brand-red-hover  h-11">
                            {userIsSuperAdmin ? "Close period" : "Send request"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* EXPORT CONFIGURATION TERMINAL */}
            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
                <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default flex flex-col p-0 overflow-hidden shadow-2xl">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30 text-left">
                        <div className="flex items-center gap-2 mb-1">
                            <Download className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-semibold">Export general ledger</DialogTitle>
                        </div>
                        <DialogDescription className="text-[12px] text-text-muted">Choose the dates and records to include.</DialogDescription>
                    </DialogHeader>
                    <div className="p-6 space-y-6 text-left">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold text-text-muted">From</Label>
                                <Input type="date" value={exportConfig.from} onChange={e => setExportConfig({...exportConfig, from: e.target.value})} className="h-10 bg-bg-primary text-xs" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold text-text-muted">To</Label>
                                <Input type="date" value={exportConfig.to} onChange={e => setExportConfig({...exportConfig, to: e.target.value})} className="h-10 bg-bg-primary text-xs" />
                            </div>
                        </div>
                        <div className="space-y-3">
                            <Label className="text-[10px] font-bold text-text-muted">Include</Label>
                            <div className="space-y-2">
                                {[
                                    { id: 'invoices', label: 'Client invoices' },
                                    { id: 'expenses', label: 'Field Expenses' },
                                    { id: 'payroll', label: 'Technician pay' }
                                ].map(type => (
                                    <div key={type.id} className="flex items-center space-x-3 p-3 rounded-lg border border-border-sub bg-bg-primary hover:border-brand-red transition-all cursor-pointer" onClick={() => {
                                        setExportConfig(prev => ({
                                            ...prev,
                                            types: prev.types.includes(type.id) ? prev.types.filter(t => t !== type.id) : [...prev.types, type.id]
                                        }));
                                    }}>
                                        <Checkbox checked={exportConfig.types.includes(type.id)} className="h-4 w-4" />
                                        <span className="text-xs font-bold tracking-wide text-text-primary">{type.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default flex gap-3">
                        <Button variant="outline" onClick={() => setIsExportDialogOpen(false)} className="flex-1  h-11">Cancel</Button>
                        <Button onClick={handleExecuteExport} className="flex-1 bg-brand-red hover:bg-brand-red-hover  h-11 text-white">Export CSV</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <InvoiceEditor isOpen={isInvoiceEditorOpen} setIsOpen={setIsInvoiceEditorOpen} invoice={selectedInvoice} clients={clientsList} projects={projects} workOrders={allMissions} onSave={handleSaveInvoice} />
        </div>
    );
}
