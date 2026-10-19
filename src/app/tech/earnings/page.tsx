
'use client';

import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { usePaged, ListPager, PAGE_SIZES_LARGE, PAGE_SIZES_SMALL } from '@/components/list-pager';
import type { WeeklyLog, Expense, Technician, ProjectPayout, Reimbursement, WorkOrder, PayrollDispute } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    Coins,
    Receipt,
    Calendar as CalendarIcon,
    Search,
    ArrowUpRight,
    CheckCircle2,
    Car,
    Plus,
    Navigation,
    Upload,
    X,
    Loader2,
    Wrench,
    ChevronDown,
    ChevronRight,
    Download,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AddressAutocompleteInput } from '@/components/ui/address-autocomplete-input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { format, isSameDay, startOfDay, addDays } from 'date-fns';
import { weekOfForScheduleDate } from '@/lib/weekly-log';
import { db } from "@/lib/firebase";
import { NotificationService } from '@/lib/notification-service';
import { collection, onSnapshot, query, where, doc, addDoc, getDoc } from 'firebase/firestore';
import { uploadFile } from '@/lib/upload';
import { useToast } from '@/hooks/use-toast';
import { mergeJobs, weekOfValue, parseLocalDate } from '@/lib/jobs';
import { PageHeader } from '@/components/page-header';
import { EmptyState, PageLoading } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { StatCard } from '@/components/stat-card';
import { SearchField } from '@/components/search-field';
import { DateRangeButton } from '@/components/list-toolbar';
import { effectiveJobPay, computeWeeklyLogSettlement, netOfFieldNationFee } from '@/lib/payroll';
import { downloadPaystub } from '@/lib/paystub';
import { displayWorkOrderNumber, externalWorkOrderId } from '@/lib/work-order-identity';
import { money } from '@/lib/financial-summary';

type LogSortOption = 'date-desc' | 'date-asc' | 'payout-desc' | 'status';
type ReimType = 'receipt' | 'mileage';

const DEFAULT_MILEAGE_RATE = 0.67;

export default function TechEarningsPage() {
    const { toast } = useToast();
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [tech, setTech] = useState<Technician | null>(null);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [myPayrollDisputes, setMyPayrollDisputes] = useState<PayrollDispute[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [workOrders, setWorkOrders] = useState<any[]>([]);
    // This tech's own assignment docs (current + completed/historical) — the
    // source for resolving a weekly-log item's job title/date/time/pay in
    // the expanded per-job breakdown below. `workOrders` above only ever
    // holds unassigned-pool docs, which a tech's own jobs never sit in.
    const [assignments, setAssignments] = useState<WorkOrder[]>([]);
    const [helperAssignments, setHelperAssignments] = useState<WorkOrder[]>([]);
    const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
    const [projectPayouts, setProjectPayouts] = useState<any[]>([]);
    const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
    const [mileageRate, setMileageRate] = useState(DEFAULT_MILEAGE_RATE);

    const [mounted, setMounted] = useState(false);
    const [isReimDialogOpen, setIsReimDialogOpen] = useState(false);
    const [reimType, setReimType] = useState<ReimType>('receipt');

    // Receipt form state
    const [receiptForm, setReceiptForm] = useState({
        vendorName: '',
        purchaseDate: '',
        amount: '',
        description: '',
        relatedJobId: '',
        notes: '',
    });
    const [receiptPhotoUrl, setReceiptPhotoUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Mileage form state
    const [mileageForm, setMileageForm] = useState({
        fromLocation: '',
        toLocation: '',
        distanceMiles: '',
        dateDriven: '',
        relatedJobId: '',
        notes: '',
    });

    const [submitting, setSubmitting] = useState(false);
    const [logSearchQuery, setLogSearchQuery] = useState("");
    const [logSortBy, setLogSortBy] = useState<LogSortOption>('date-desc');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [logStatusFilter, setLogStatusFilter] = useState<string>('all');
    // Which week folders are collapsed in the reimbursement table — open by
    // default, collapse individually to declutter.
    const [collapsedWeeks, setCollapsedWeeks] = useState<Record<string, boolean>>({});

    useEffect(() => {
        setMounted(true);
        const userId = sessionStorage.getItem('currentUserId');
        setCurrentTechId(userId);

        getDoc(doc(db, 'adminConfig', 'finance')).then(snap => {
            if (snap.exists() && snap.data()?.mileageRate) setMileageRate(snap.data()!.mileageRate);
        }).catch(() => {});

        if (userId) {
            const unsubTech = onSnapshot(doc(db, 'users', userId), (d) => {
                if (d.exists()) setTech({ ...d.data(), id: d.id } as Technician);
            });
            const unsubLogs = onSnapshot(query(collection(db, 'weeklyLogs'), where('techId', '==', userId)), (snap) => {
                setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)));
            });
            const unsubDisputes = onSnapshot(query(collection(db, 'payrollDisputes'), where('techId', '==', userId)), (snap) => {
                setMyPayrollDisputes(snap.docs.map(d => ({ ...d.data(), id: d.id } as PayrollDispute)));
            });
            const unsubExp = onSnapshot(query(collection(db, 'expenses'), where('techId', '==', userId)), (snap) => {
                setExpenses(snap.docs.map(d => ({ ...d.data(), id: d.id } as Expense)));
            });
            // Note: workOrders/assignments here are used only to resolve a
            // logged job's title/date/pay for the earnings breakdown, not as
            // a live/operational list — a job that's since been archived
            // still needs to resolve correctly for a week that already paid
            // out, so these are deliberately NOT archived-filtered.
            const unsubWO = onSnapshot(query(collection(db, 'workOrders'), where('assignedTechnicianId', '==', userId)), (snap) => {
                setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id })));
            });
            const unsubAsmt = onSnapshot(query(collection(db, 'assignments'), where('techId', '==', userId)), (snap) => {
                setAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
            });
            const unsubPayouts = onSnapshot(query(collection(db, 'projectPayouts'), where('technicianId', '==', userId)), (snap) => {
                setProjectPayouts(snap.docs.map(d => ({ ...d.data(), id: d.id })));
            });
            const unsubReim = onSnapshot(query(collection(db, 'reimbursements'), where('techId', '==', userId)), (snap) => {
                setReimbursements(snap.docs.map(d => ({ ...d.data(), id: d.id } as Reimbursement)));
            });
            // Jobs they helped on, so helper lines resolve too.
            const unsubHelp = onSnapshot(query(collection(db, 'assignments'), where('additionalTechnicianIds', 'array-contains', userId)), (snap) => {
                setHelperAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
            }, () => {});
            return () => { unsubTech(); unsubLogs(); unsubExp(); unsubWO(); unsubAsmt(); unsubHelp(); unsubPayouts(); unsubReim(); unsubDisputes(); };
        }
    }, []);

    // This tech's own jobs, keyed by id — resolves a weekly-log item's
    // title/date/time/pay for the per-job breakdown, whichever collection
    // (unassigned-pool leftovers or the tech's live/completed assignments)
    // the doc currently lives in.
    const jobsById = useMemo(
        () => new Map(mergeJobs(workOrders, [...assignments, ...helperAssignments]).map(j => [j.id, j])),
        [workOrders, assignments, helperAssignments],
    );

    const settlementOf = (log: WeeklyLog) => computeWeeklyLogSettlement(log, jobsById);

    // Search + date range (status applied after, so its menu counts are accurate).
    const searchedLogs = useMemo(() => {
        let results = [...weeklyLogs];
        if (logSearchQuery) {
            // Week, status, or any job on the log (ASMT id / WO # / title / client / city).
            const q = logSearchQuery.toLowerCase().trim();
            results = results.filter(l => (l.weekOf || '').toLowerCase().includes(q)
                || (l.status || '').toLowerCase().includes(q)
                || (l.items || []).some(item => {
                    const job = jobsById.get(item.workOrderId);
                    return [item.workOrderId, job?.id, job && externalWorkOrderId(job), job?.title, job?.description, job?.clientName, job?.location]
                        .some(v => String(v || '').toLowerCase().includes(q));
                }));
        }
        if (dateRange?.from) {
            // A week matches when any of its 7 days falls in the range.
            const start = startOfDay(dateRange.from).getTime();
            const end = startOfDay(dateRange.to ?? dateRange.from).getTime();
            results = results.filter(log => {
                const ws = parseLocalDate(log.weekOf);
                if (!ws) return true;
                return startOfDay(ws).getTime() <= end && addDays(startOfDay(ws), 6).getTime() >= start;
            });
        }
        return results;
    }, [weeklyLogs, logSearchQuery, dateRange, jobsById]);
    const logStatusCounts = useMemo(() => {
        const c: Record<string, number> = { all: searchedLogs.length };
        for (const l of searchedLogs) c[l.status] = (c[l.status] || 0) + 1;
        return c;
    }, [searchedLogs]);
    const logFiltersActive = !!logSearchQuery || !!dateRange?.from || logStatusFilter !== 'all';
    const resetLogFilters = () => { setLogSearchQuery(''); setDateRange(undefined); setLogStatusFilter('all'); };
    const filteredLogs = useMemo(() => {
        const results = logStatusFilter === 'all' ? [...searchedLogs] : searchedLogs.filter(l => l.status === logStatusFilter);
        return results.sort((a, b) => {
            if (logSortBy === 'date-desc') return weekOfValue(b.weekOf) - weekOfValue(a.weekOf);
            if (logSortBy === 'date-asc') return weekOfValue(a.weekOf) - weekOfValue(b.weekOf);
            if (logSortBy === 'payout-desc') return settlementOf(b) - settlementOf(a);
            if (logSortBy === 'status') return (a.status || '').localeCompare(b.status || '') || weekOfValue(b.weekOf) - weekOfValue(a.weekOf);
            return 0;
        });
    }, [searchedLogs, logStatusFilter, logSortBy, jobsById]);
    const logsPager = usePaged(filteredLogs, PAGE_SIZES_LARGE, 'tech-earnings-logs', [logSearchQuery, logSortBy, dateRange, logStatusFilter]);

    // Reimbursements added from job verification during weekly log review —
    // these live in an embedded array on each weeklyLogs doc, separate from
    // the standalone `reimbursements` collection submitted from this page.
    const jobReimbursements = useMemo(() =>
        weeklyLogs.flatMap(log => (log.reimbursements || []).filter(r => r.type === 'reimbursement')),
    [weeklyLogs]);

    const metrics = useMemo(() => {
        const settled = filteredLogs.filter(l => l.status === 'Approved').reduce((acc, log) => acc + settlementOf(log), 0);
        const pending = filteredLogs.filter(l => l.status === 'Submitted').reduce((acc, log) => acc + settlementOf(log), 0);
        const pendingReim = [
            ...expenses.filter(e => e.status === 'Pending').map(e => e.amount),
            ...reimbursements.filter(r => r.status === 'pending').map(r =>
                r.type === 'mileage' ? (r.distanceMiles || 0) * (r.mileageRate || mileageRate) : r.amount
            ),
            ...jobReimbursements.filter(r => (r.status || 'approved') === 'pending').map(r => r.amount),
        ].reduce((a, b) => a + b, 0);
        return { settled, pending, pendingReim };
    }, [filteredLogs, expenses, reimbursements, jobReimbursements, mileageRate, jobsById]);

    const handleReceiptPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            // Store under personnelDocuments/{techId} so it uses the deployed
            // storage rule (admin + owning tech). Matches the tech/logs receipt path.
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const { url } = await uploadFile(`personnelDocuments/${currentTechId}/reimbursement-${Date.now()}-${safeName}`, file, { contentType: file.type });
            setReceiptPhotoUrl(url);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Upload failed', description: err.message });
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSubmitReceipt = async () => {
        if (!currentTechId || !receiptForm.purchaseDate || !receiptForm.amount || !receiptForm.description) return;
        setSubmitting(true);
        try {
            const amount = parseFloat(receiptForm.amount);
            if (isNaN(amount) || amount <= 0) throw new Error('Enter a valid amount.');
            await addDoc(collection(db, 'reimbursements'), {
                techId: currentTechId,
                techName: tech?.name || currentTechId,
                type: 'receipt',
                status: 'pending',
                amount,
                vendorName: receiptForm.vendorName.trim(),
                purchaseDate: receiptForm.purchaseDate,
                description: receiptForm.description.trim(),
                notes: receiptForm.notes.trim() || null,
                ...(receiptForm.relatedJobId && { relatedJobId: receiptForm.relatedJobId }),
                ...(receiptPhotoUrl && { receiptPhotoUrls: [receiptPhotoUrl] }),
                submittedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
            });
            NotificationService.notifyPayrollAdmins('Reimbursement requested',
                `${tech?.name || 'A technician'} submitted a $${amount.toFixed(2)} receipt${receiptForm.vendorName.trim() ? ` from ${receiptForm.vendorName.trim()}` : ''}: ${receiptForm.description.trim().slice(0, 120)}.`).catch(() => {});
            toast({ title: 'Receipt submitted', description: 'Your reimbursement request is pending review.' });
            setReceiptForm({ vendorName: '', purchaseDate: '', amount: '', description: '', relatedJobId: '', notes: '' });
            setReceiptPhotoUrl(null);
            setIsReimDialogOpen(false);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Submission failed', description: err.message });
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmitMileage = async () => {
        if (!currentTechId || !mileageForm.fromLocation || !mileageForm.toLocation || !mileageForm.distanceMiles || !mileageForm.dateDriven) return;
        setSubmitting(true);
        try {
            const distanceMiles = parseFloat(mileageForm.distanceMiles);
            if (isNaN(distanceMiles) || distanceMiles <= 0) throw new Error('Enter a valid distance.');
            await addDoc(collection(db, 'reimbursements'), {
                techId: currentTechId,
                techName: tech?.name || currentTechId,
                type: 'mileage',
                status: 'pending',
                amount: distanceMiles * mileageRate,
                fromLocation: mileageForm.fromLocation.trim(),
                toLocation: mileageForm.toLocation.trim(),
                distanceMiles,
                mileageRate,
                dateDriven: mileageForm.dateDriven,
                notes: mileageForm.notes.trim() || null,
                ...(mileageForm.relatedJobId && { relatedJobId: mileageForm.relatedJobId }),
                submittedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
            });
            NotificationService.notifyPayrollAdmins('Mileage reimbursement requested',
                `${tech?.name || 'A technician'} submitted ${distanceMiles} mi ($${(distanceMiles * mileageRate).toFixed(2)}) for ${mileageForm.dateDriven}.`).catch(() => {});
            toast({ title: 'Mileage submitted', description: `${distanceMiles} mi × $${mileageRate.toFixed(2)} = $${(distanceMiles * mileageRate).toFixed(2)}` });
            setMileageForm({ fromLocation: '', toLocation: '', distanceMiles: '', dateDriven: '', relatedJobId: '', notes: '' });
            setIsReimDialogOpen(false);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Submission failed', description: err.message });
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusVariant = (status: string) => {
        const s = (status || '').toLowerCase();
        if (s === 'approved' || s === 'paid') return 'active';
        if (s === 'rejected') return 'missed';
        if (s === 'pending' || s === 'submitted') return 'onhold';
        return 'outline';
    };

    // All reimbursements unified: new `reimbursements` + legacy `expenses`
    const allReimbursements = useMemo(() => {
        const newItems = reimbursements.map(r => ({
            id: r.id,
            source: 'reimbursement' as const,
            date: r.type === 'mileage' ? (r.dateDriven || r.submittedAt?.slice(0, 10) || '') : (r.purchaseDate || r.submittedAt?.slice(0, 10) || ''),
            type: r.type,
            status: r.status,
            amount: r.type === 'mileage' ? (r.distanceMiles || 0) * (r.mileageRate || mileageRate) : r.amount,
            label: r.type === 'mileage'
                ? `${r.fromLocation || ''} → ${r.toLocation || ''}`
                : (r.description || r.vendorName || ''),
            sub: r.type === 'mileage'
                ? `${r.distanceMiles?.toFixed(1) || '0'} mi × $${(r.mileageRate || mileageRate).toFixed(2)}/mi`
                : (r.vendorName || ''),
            receiptPhotoUrls: r.receiptPhotoUrls,
        }));
        const legacyItems = expenses.map(e => ({
            id: e.id,
            source: 'expense' as const,
            date: e.date,
            type: 'receipt' as const,
            status: e.status.toLowerCase() as 'pending' | 'approved' | 'rejected',
            amount: e.amount,
            label: e.description,
            sub: e.category,
            receiptPhotoUrls: undefined as string[] | undefined,
        }));
        // Job-tied reimbursements filed during weekly log verification — status
        // undefined on a legacy record counts as already-approved (see FinancialRecord).
        const jobItems = jobReimbursements.map(r => ({
            id: r.id,
            source: 'job' as const,
            date: r.date,
            type: 'job' as const,
            status: (r.status || 'approved') as 'pending' | 'approved' | 'rejected',
            amount: r.amount,
            label: r.description,
            sub: r.externalWorkOrderId ? `WO ${r.externalWorkOrderId}` : (r.workOrderId ? `WO ${r.workOrderId.toUpperCase()}` : 'Job reimbursement'),
            receiptPhotoUrls: r.receiptUrl ? [r.receiptUrl] : undefined as string[] | undefined,
        }));
        return [...newItems, ...legacyItems, ...jobItems].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }, [reimbursements, expenses, jobReimbursements, mileageRate]);

    // Reimbursements grouped into "week folders" (Monday-start, matching the
    // weekly log convention) — most recent week first, items within a week
    // newest first.
    const reimbursementWeeks = useMemo(() => {
        const buckets = new Map<string, typeof allReimbursements>();
        for (const item of allReimbursements) {
            const weekOf = weekOfForScheduleDate(item.date);
            if (!buckets.has(weekOf)) buckets.set(weekOf, []);
            buckets.get(weekOf)!.push(item);
        }
        return Array.from(buckets.entries())
            .map(([weekOf, items]) => ({
                weekOf,
                items,
                total: items.reduce((sum, i) => sum + money(i.amount), 0),
            }))
            .sort((a, b) => {
                const [monthA, dayA, yearA] = a.weekOf.split('-').map(Number);
                const [monthB, dayB, yearB] = b.weekOf.split('-').map(Number);
                return new Date(yearB, monthB - 1, dayB).getTime() - new Date(yearA, monthA - 1, dayA).getTime();
            });
    }, [allReimbursements]);

    const distanceMilesNum = parseFloat(mileageForm.distanceMiles) || 0;
    const calculatedMileageAmount = distanceMilesNum * mileageRate;

    if (!mounted || !currentTechId) {
        return <PageLoading label="Loading your earnings…" />;
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Pay"
                icon={Coins}
                title="My earnings"
                subtitle="Your weekly pay, pay stubs and reimbursements."
            />

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <StatCard label="Paid (approved)" icon={CheckCircle2} tone="done" value={`$${metrics.settled.toFixed(2)}`} sub={logFiltersActive ? 'Filtered logs' : 'All approved logs'} />
                <StatCard label="Waiting on approval" icon={ArrowUpRight} tone="progress" value={`≈ $${metrics.pending.toFixed(2)}`} sub="Estimated · submitted logs" />
                <StatCard label="Reimbursements pending" icon={Receipt} value={`$${metrics.pendingReim.toFixed(2)}`} sub="Waiting on review" className="col-span-2 md:col-span-1" />
            </div>

            {/* Project Payouts */}
            {projectPayouts.length > 0 && (
                <Card>
                    <CardHeader className="pb-4 border-b border-border-sub bg-bg-tertiary/30 text-left">
                        <CardTitle className="text-base font-semibold">Project earnings</CardTitle>
                        <CardDescription className="text-[12px]">Payouts for project work — separate from your weekly logs.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent border-border-sub">
                                    <TableHead className="text-[10px] uppercase font-bold tracking-wider pl-4">Project</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Role</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Type</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Amount</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Status</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold tracking-wider">Notes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {projectPayouts.map((pp: any) => (
                                    <TableRow key={pp.id} className="hover:bg-bg-tertiary transition-colors border-border-sub">
                                        <TableCell className="text-xs font-bold pl-4">{pp.projectId?.slice(0, 8)}</TableCell>
                                        <TableCell className="text-xs text-text-muted capitalize">{pp.role}</TableCell>
                                        <TableCell className="text-xs text-text-muted capitalize">{pp.payType?.replace('_', ' ')}</TableCell>
                                        <TableCell className="font-mono text-sm font-bold tabular-nums">${(pp.amount || 0).toFixed(2)}</TableCell>
                                        <TableCell>
                                            <StatusBadge kind="pay" value={pp.status} />
                                        </TableCell>
                                        <TableCell className="text-xs text-text-muted max-w-[160px] truncate">{pp.notes || '—'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            <Tabs defaultValue="logs" className="w-full">
                <TabsList className="tabs mb-4 h-auto flex-nowrap justify-start bg-transparent p-0">
                    <TabsTrigger value="logs" className="tab flex items-center gap-1.5 data-[state=active]:bg-brand-red data-[state=active]:text-white"><CalendarIcon size={14}/> Weekly pay</TabsTrigger>
                    <TabsTrigger value="reimbursements" className="tab flex items-center gap-1.5 data-[state=active]:bg-brand-red data-[state=active]:text-white"><Receipt size={14}/> Reimbursements</TabsTrigger>
                </TabsList>

                {/* LOGS TAB */}
                <TabsContent value="logs" className="mt-0">
                    <Card>
                        <CardHeader className="space-y-3 pb-4 border-b border-border-sub bg-bg-tertiary/30">
                            <div className="text-left">
                                <CardTitle className="text-base font-semibold">Weekly pay</CardTitle>
                                <CardDescription className="text-[12px]">Tap a week to see its jobs. Pay stubs are ready once a week is approved.</CardDescription>
                            </div>
                            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                                <SearchField value={logSearchQuery} onChange={setLogSearchQuery} placeholder="Search week, job, WO # or client" className="lg:flex-1" />
                                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                                    <Select value={logStatusFilter} onValueChange={setLogStatusFilter}>
                                        <SelectTrigger className="h-11 sm:h-9 sm:w-[160px] bg-bg-secondary border-border-main" aria-label="Status">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {([['all', 'All statuses'], ['Draft', 'Draft'], ['Submitted', 'Submitted'], ['Approved', 'Approved'], ['Rejected', 'Rejected']] as const).map(([v, label]) => (
                                                <SelectItem key={v} value={v} className="text-[13px]">{label} ({logStatusCounts[v] || 0})</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Select value={logSortBy} onValueChange={(v) => setLogSortBy(v as LogSortOption)}>
                                        <SelectTrigger className="h-11 sm:h-9 sm:w-[160px] bg-bg-secondary border-border-main" aria-label="Sort">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="date-desc" className="text-[13px]">Newest week first</SelectItem>
                                            <SelectItem value="date-asc" className="text-[13px]">Oldest week first</SelectItem>
                                            <SelectItem value="payout-desc" className="text-[13px]">Highest pay</SelectItem>
                                            <SelectItem value="status" className="text-[13px]">Status</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <DateRangeButton value={dateRange} onChange={setDateRange} className="col-span-2 sm:col-span-1" />
                                    {logFiltersActive && (
                                        <Button variant="ghost" onClick={resetLogFilters} className="col-span-2 h-11 sm:h-9 text-brand-red sm:col-span-1">
                                            <X size={14} className="mr-1" /> Reset
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0 overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-border-sub">
                                        <TableHead className="pl-4">Week</TableHead>
                                        <TableHead className="hidden sm:table-cell">Status</TableHead>
                                        <TableHead className="text-right">Pay</TableHead>
                                        <TableHead className="w-[110px]" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {logsPager.items.map(log => {
                                        // The formal paystub document (view/download) only makes
                                        // sense once payroll has actually settled the log — a
                                        // Draft/Submitted/Rejected log's numbers aren't final yet.
                                        // The inline breakdown below stays available for any status
                                        // so a tech can see what's in a week before it's approved;
                                        // its reimbursement figure is marked Pending until then.
                                        const isApproved = log.status === 'Approved';
                                        const isExpanded = expandedLogs.has(log.id);
                                        const verifiedItems = (log.items || []).filter(i => i.confirmationStatus !== 'disputed');
                                        const nonRejectedReimbs = (log.reimbursements || []).filter(r => r.status !== 'rejected');
                                        const reimbTotal = isApproved
                                            ? nonRejectedReimbs.filter(r => r.status !== 'pending').reduce((s, r) => s + netOfFieldNationFee(r.amount), 0)
                                            : nonRejectedReimbs.reduce((s, r) => s + (r.amount || 0), 0);
                                        const hasOpenDispute = myPayrollDisputes.some(d => d.status === 'open' && d.weeklyLogId === log.id);
                                        return (
                                            <Fragment key={log.id}>
                                                <TableRow
                                                    className="hover:bg-bg-tertiary transition-colors cursor-pointer group"
                                                    onClick={() => setExpandedLogs(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(log.id)) next.delete(log.id); else next.add(log.id);
                                                        return next;
                                                    })}
                                                >
                                                    <TableCell className="pl-4 font-semibold text-[13px] whitespace-nowrap">
                                                        <span className="inline-flex items-center gap-1.5">
                                                            {isExpanded ? <ChevronDown size={14} className="text-text-muted" /> : <ChevronRight size={14} className="text-text-muted" />}
                                                            Week of {log.weekOf}
                                                        </span>
                                                        <div className="mt-1 pl-5 flex flex-wrap gap-1 sm:hidden"><StatusBadge kind="log" value={log.status} />{hasOpenDispute && <Badge variant="destructive" className="text-[10px] uppercase tracking-wide">Dispute under review</Badge>}</div>
                                                    </TableCell>
                                                    <TableCell className="hidden sm:table-cell">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <StatusBadge kind="log" value={log.status} />
                                                            {hasOpenDispute && (
                                                                <Badge variant="destructive" className="text-[10px] uppercase tracking-wide">
                                                                    Dispute under review
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono font-semibold text-text-primary whitespace-nowrap" title={log.status === 'Approved' ? undefined : 'Estimated until payroll approves'}>{log.status === 'Approved' ? '' : '≈ '}${settlementOf(log).toFixed(2)}</TableCell>
                                                    <TableCell className="text-right pr-4">
                                                        {isApproved ? (
                                                            <button
                                                                className="inline-flex h-10 sm:h-8 items-center whitespace-nowrap text-[12px] text-text-muted hover:text-text-primary font-medium border border-border-main rounded-md px-3 hover:bg-bg-tertiary transition-colors"
                                                                onClick={(e) => { e.stopPropagation(); downloadPaystub(log, tech || undefined, currentTechId || '', jobsById); }}
                                                            >
                                                                <Download size={12} className="mr-1.5" /> Pay stub
                                                            </button>
                                                        ) : (
                                                            <span className="text-[12px] text-text-muted whitespace-nowrap">Not approved yet</span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                                {isExpanded && (
                                                    <TableRow key={`${log.id}-detail`} className="hover:bg-transparent border-border-sub">
                                                        <TableCell colSpan={4} className="bg-bg-primary/40 p-0">
                                                            {verifiedItems.length === 0 ? (
                                                                <p className="text-center py-6 text-[12px] text-text-muted">No confirmed jobs on this log.</p>
                                                            ) : (
                                                                <div className="divide-y divide-border-sub">
                                                                    {verifiedItems.map(item => {
                                                                        const job = jobsById.get(item.workOrderId);
                                                                        const pay = effectiveJobPay(item, job);
                                                                        return (
                                                                            <div key={item.id} className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3 text-left">
                                                                                <div className="min-w-0">
                                                                                    <p className="text-[13px] font-semibold text-text-primary truncate">{job?.title || job?.description || 'Untitled job'}</p>
                                                                                    <p className="text-[11px] text-text-muted font-mono mt-0.5">
                                                                                        ASMT {item.workOrderId?.toUpperCase()}
                                                                                        {job && ` · WO# ${displayWorkOrderNumber(job)}`}
                                                                                        {job?.scheduleDate && ` · ${job.scheduleDate}`}
                                                                                        {job?.scheduleTime && ` · ${job.scheduleTime}`}
                                                                                    </p>
                                                                                </div>
                                                                                <span className="shrink-0 text-sm font-mono font-bold text-text-green">{log.status === 'Approved' ? '' : '≈ '}${pay.toFixed(2)}</span>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                            {nonRejectedReimbs.length > 0 && (
                                                                <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3 border-t border-border-sub bg-bg-secondary/40">
                                                                    <div className="flex items-center gap-2">
                                                                        <Receipt size={12} className="text-accent-gold" />
                                                                        <span className="text-[13px] font-semibold text-text-primary">Reimbursements</span>
                                                                        <StatusBadge kind="pay" value={isApproved ? 'approved' : 'submitted'} label={isApproved ? 'Approved' : 'Pending'} />
                                                                    </div>
                                                                    <span className="shrink-0 text-sm font-mono font-bold text-accent-gold">${reimbTotal.toFixed(2)}</span>
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                    {filteredLogs.length === 0 && (
                                        <TableRow className="hover:bg-transparent">
                                            <TableCell colSpan={4} className="p-4">
                                                {weeklyLogs.length === 0 ? (
                                                    <EmptyState compact icon={Coins} title="No weekly pay yet" description="Your weekly logs show up here once you have jobs." />
                                                ) : (
                                                    <EmptyState compact icon={Search} title="No weeks match these filters" action={<Button variant="outline" onClick={resetLogFilters}>Reset filters</Button>} />
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                            <div className="px-4"><ListPager pager={logsPager} noun="logs" /></div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* REIMBURSEMENTS TAB */}
                <TabsContent value="reimbursements" className="mt-0">
                    <Card>
                        <CardHeader className="pb-4 border-b border-border-sub bg-bg-tertiary/30">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-left">
                                    <CardTitle className="text-base font-semibold">Reimbursements</CardTitle>
                                    <CardDescription className="text-[12px]">Submit receipts or mileage. Approved amounts are paid with payroll.</CardDescription>
                                </div>
                                <Button onClick={() => { setReimType('receipt'); setIsReimDialogOpen(true); }} className="h-10 sm:h-9 px-4 bg-brand-red hover:bg-brand-red-hover text-white">
                                    <Plus size={14} className="mr-1.5" /> Add reimbursement
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            {reimbursementWeeks.length === 0 ? (
                                <div className="p-4"><EmptyState compact icon={Receipt} title="No reimbursements yet" description="Receipts and mileage you submit show up here." /></div>
                            ) : reimbursementWeeks.map(({ weekOf, items, total }) => {
                                const [m, d, y] = weekOf.split('-').map(Number);
                                const weekStart = new Date(y, m - 1, d);
                                const weekEnd = addDays(weekStart, 6);
                                const isCollapsed = !!collapsedWeeks[weekOf];
                                return (
                                    <div key={weekOf} className="border-b border-border-sub last:border-b-0">
                                        <button
                                            type="button"
                                            onClick={() => setCollapsedWeeks(prev => ({ ...prev, [weekOf]: !prev[weekOf] }))}
                                            className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-bg-tertiary/30 hover:bg-bg-tertiary transition-colors text-left"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                {isCollapsed ? <ChevronRight size={14} className="text-text-muted shrink-0" /> : <ChevronDown size={14} className="text-text-muted shrink-0" />}
                                                <span className="text-[13px] font-semibold text-text-primary truncate">
                                                    Week of {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
                                                </span>
                                                <span className="text-[12px] text-text-muted shrink-0">({items.length})</span>
                                            </div>
                                            <span className="text-[13px] font-mono font-semibold text-text-green shrink-0">${total.toFixed(2)}</span>
                                        </button>
                                        {!isCollapsed && (
                                            <div className="overflow-x-auto"><Table>
                                                <TableHeader>
                                                    <TableRow className="hover:bg-transparent border-border-sub">
                                                        <TableHead className="text-[10px] uppercase font-bold tracking-wider pl-4">Date</TableHead>
                                                        <TableHead className="text-[10px] uppercase font-bold tracking-wider">Type</TableHead>
                                                        <TableHead className="text-[10px] uppercase font-bold tracking-wider">Details</TableHead>
                                                        <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Amount</TableHead>
                                                        <TableHead className="text-center text-[10px] uppercase font-bold tracking-wider">Status</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {items.map(item => (
                                                        <TableRow key={`${item.source}-${item.id}`} className="hover:bg-bg-tertiary transition-colors border-border-sub">
                                                            <TableCell className="text-[12px] font-medium pl-4 whitespace-nowrap">{item.date}</TableCell>
                                                            <TableCell>
                                                                <Badge
                                                                    variant={item.type === 'mileage' ? 'onhold' : item.type === 'job' ? 'outline' : 'default'}
                                                                    className="text-[10px] uppercase tracking-wide flex items-center gap-1 w-fit whitespace-nowrap"
                                                                >
                                                                    {item.type === 'mileage' ? <><Car size={10} />&nbsp;Mileage</> : item.type === 'job' ? <><Wrench size={10} />&nbsp;Job</> : 'Receipt'}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="text-[13px] text-text-primary truncate max-w-[200px]">{item.label}</div>
                                                                {item.sub && <div className="text-[12px] text-text-muted">{item.sub}</div>}
                                                                {item.receiptPhotoUrls?.[0] && (
                                                                    <button
                                                                        className="text-[12px] text-brand-red hover:underline mt-0.5"
                                                                        onClick={() => window.open(item.receiptPhotoUrls![0], '_blank')}
                                                                    >
                                                                        View receipt
                                                                    </button>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono text-[13px] font-semibold whitespace-nowrap">${item.amount.toFixed(2)}</TableCell>
                                                            <TableCell className="text-center">
                                                                <StatusBadge kind="request" value={item.status} />
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table></div>
                                        )}
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* UNIFIED REIMBURSEMENT DIALOG */}
            <Dialog open={isReimDialogOpen} onOpenChange={setIsReimDialogOpen}>
                <DialogContent className="sm:max-w-[520px] bg-bg-elevated border-border-default">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold flex items-center gap-2">
                            <Receipt size={16} className="text-brand-red" /> Add reimbursement
                        </DialogTitle>
                        <DialogDescription>Choose the type of reimbursement to submit.</DialogDescription>
                    </DialogHeader>

                    {/* Type switcher */}
                    <div className="flex rounded-lg border border-border-main overflow-hidden">
                        <button
                            onClick={() => setReimType('receipt')}
                            className={cn(
                                'flex-1 h-10 flex items-center justify-center gap-2 text-[13px] font-medium transition-colors',
                                reimType === 'receipt' ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary bg-bg-secondary'
                            )}
                        >
                            <Receipt size={12} /> Receipt
                        </button>
                        <div className="w-px bg-border-main" />
                        <button
                            onClick={() => setReimType('mileage')}
                            className={cn(
                                'flex-1 h-10 flex items-center justify-center gap-2 text-[13px] font-medium transition-colors',
                                reimType === 'mileage' ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary bg-bg-secondary'
                            )}
                        >
                            <Car size={12} /> Mileage
                        </button>
                    </div>

                    {/* RECEIPT FORM */}
                    {reimType === 'receipt' && (
                        <div className="space-y-4 pt-1">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[12px] font-semibold text-text-muted">Purchase date *</Label>
                                    <Input type="date" value={receiptForm.purchaseDate} onChange={e => setReceiptForm(p => ({ ...p, purchaseDate: e.target.value }))} className="h-10 text-xs" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[12px] font-semibold text-text-muted">Amount ($) *</Label>
                                    <Input type="number" step="0.01" min="0" value={receiptForm.amount} onChange={e => setReceiptForm(p => ({ ...p, amount: e.target.value }))} className="h-10 text-xs font-mono" placeholder="0.00" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[12px] font-semibold text-text-muted">Vendor</Label>
                                <Input value={receiptForm.vendorName} onChange={e => setReceiptForm(p => ({ ...p, vendorName: e.target.value }))} className="h-10 text-xs" placeholder="Store or vendor" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[12px] font-semibold text-text-muted">Description *</Label>
                                <Input value={receiptForm.description} onChange={e => setReceiptForm(p => ({ ...p, description: e.target.value }))} className="h-10 text-xs" placeholder="What was purchased?" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[12px] font-semibold text-text-muted">Related job (optional)</Label>
                                <Select value={receiptForm.relatedJobId} onValueChange={v => setReceiptForm(p => ({ ...p, relatedJobId: v === '__none__' ? '' : v }))}>
                                    <SelectTrigger className="h-10 text-xs bg-bg-primary border-border-main">
                                        <SelectValue placeholder="Select a job..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        <SelectItem value="__none__">None</SelectItem>
                                        {workOrders.map((wo: any) => (
                                            <SelectItem key={wo.id} value={wo.id} className="text-xs">
                                                {wo.title || wo.description || wo.id.slice(0, 8)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[12px] font-semibold text-text-muted">Notes</Label>
                                <Input value={receiptForm.notes} onChange={e => setReceiptForm(p => ({ ...p, notes: e.target.value }))} className="h-10 text-xs" placeholder="Optional notes" />
                            </div>
                            {/* Receipt photo upload */}
                            <div className="space-y-2">
                                <Label className="text-[12px] font-semibold text-text-muted">Receipt photo (optional)</Label>
                                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleReceiptPhotoSelect} />
                                {receiptPhotoUrl ? (
                                    <div className="flex items-center gap-3 p-2 rounded-lg border border-border-sub bg-bg-secondary">
                                        <img src={receiptPhotoUrl} alt="Receipt" className="h-12 w-12 rounded object-cover shrink-0 cursor-pointer" onClick={() => window.open(receiptPhotoUrl, '_blank')} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12px] font-semibold text-text-primary">Receipt uploaded</p>
                                            <p className="text-[12px] text-text-muted">Tap the image to view</p>
                                        </div>
                                        <button onClick={() => setReceiptPhotoUrl(null)} aria-label="Remove receipt" className="flex h-10 w-10 items-center justify-center text-text-muted hover:text-text-primary">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploading}
                                        className="w-full h-16 rounded-lg border border-dashed border-border-main flex items-center justify-center gap-2 text-[13px] font-medium text-text-muted hover:text-text-primary hover:border-brand-red transition-colors"
                                    >
                                        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                        {uploading ? 'Uploading...' : 'Upload receipt photo'}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* MILEAGE FORM */}
                    {reimType === 'mileage' && (
                        <div className="space-y-4 pt-1">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[12px] font-semibold text-text-muted">Date driven *</Label>
                                    <Input type="date" value={mileageForm.dateDriven} onChange={e => setMileageForm(p => ({ ...p, dateDriven: e.target.value }))} className="h-10 text-xs" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[12px] font-semibold text-text-muted">Distance (miles) *</Label>
                                    <Input type="number" step="0.1" min="0" value={mileageForm.distanceMiles} onChange={e => setMileageForm(p => ({ ...p, distanceMiles: e.target.value }))} className="h-10 text-xs font-mono" placeholder="0.0" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[12px] font-semibold text-text-muted">From *</Label>
                                <AddressAutocompleteInput value={mileageForm.fromLocation} onChange={v => setMileageForm(p => ({ ...p, fromLocation: v }))} className="h-10 text-xs" placeholder="Starting address or location" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[12px] font-semibold text-text-muted">To *</Label>
                                <AddressAutocompleteInput value={mileageForm.toLocation} onChange={v => setMileageForm(p => ({ ...p, toLocation: v }))} className="h-10 text-xs" placeholder="Destination address or location" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[12px] font-semibold text-text-muted">Related job (optional)</Label>
                                <Select value={mileageForm.relatedJobId} onValueChange={v => setMileageForm(p => ({ ...p, relatedJobId: v === '__none__' ? '' : v }))}>
                                    <SelectTrigger className="h-10 text-xs bg-bg-primary border-border-main">
                                        <SelectValue placeholder="Select a job..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        <SelectItem value="__none__">None</SelectItem>
                                        {workOrders.map((wo: any) => (
                                            <SelectItem key={wo.id} value={wo.id} className="text-xs">
                                                {wo.title || wo.description || wo.id.slice(0, 8)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[12px] font-semibold text-text-muted">Notes (optional)</Label>
                                <Input value={mileageForm.notes} onChange={e => setMileageForm(p => ({ ...p, notes: e.target.value }))} className="h-10 text-xs" placeholder="Purpose of trip" />
                            </div>
                            {/* Calculated amount preview */}
                            {distanceMilesNum > 0 && (
                                <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub flex items-center gap-3">
                                    <Navigation size={14} className="text-brand-red shrink-0" />
                                    <div>
                                        <p className="text-[10px] font-semibold uppercase text-text-muted tracking-wider">Reimbursement</p>
                                        <p className="text-sm font-mono font-bold text-text-primary">
                                            {distanceMilesNum.toFixed(1)} mi × ${mileageRate.toFixed(2)}/mi = <span className="text-text-green">${calculatedMileageAmount.toFixed(2)}</span>
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter className="gap-3 flex-row pt-2">
                        <Button
                            variant="outline"
                            onClick={() => setIsReimDialogOpen(false)}
                            className="flex-1 uppercase font-bold text-[10px] tracking-wider"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={reimType === 'receipt' ? handleSubmitReceipt : handleSubmitMileage}
                            disabled={submitting || uploading || (reimType === 'receipt'
                                ? !receiptForm.purchaseDate || !receiptForm.amount || !receiptForm.description
                                : !mileageForm.dateDriven || !mileageForm.fromLocation || !mileageForm.toLocation || !mileageForm.distanceMiles
                            )}
                            className="flex-1 bg-brand-red hover:bg-brand-red/90 uppercase font-bold text-[10px] tracking-wider text-white"
                        >
                            {submitting ? 'Submitting...' : reimType === 'receipt' ? 'Submit receipt' : 'Submit mileage'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
