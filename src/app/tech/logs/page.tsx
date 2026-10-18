'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePaged, ListPager, PAGE_SIZES_SMALL, PAGE_SIZES_LARGE } from '@/components/list-pager';
import type { WeeklyLog, WeeklyLogItem, WorkOrder, MissingAssignmentReport, Technician, FinancialRecord, TripLog, PayrollDispute, DisputeKind, DisputeResolution } from '@/lib/types';
import { externalWorkOrderId, displayWorkOrderNumber, fieldNationUrl, isImported } from '@/lib/work-order-identity';
import { hasPermission } from '@/lib/permissions';
import { computeWeeklyLogSettlement, effectiveJobPay, netOfFieldNationFee } from '@/lib/payroll';
import { mergeJobs, weekOfValue, parseLocalDate } from '@/lib/jobs';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { SearchField } from '@/components/search-field';
import { DateRangeButton } from '@/components/list-toolbar';
import { useHelperLogSync } from '@/hooks/use-helper-log-sync';
import { createDraftWeeklyLog } from '@/lib/weekly-log';
import { weeklyLogAction } from '@/lib/weekly-log-api';
import { canSubmitWeek } from '@/lib/weekly-log-core';
import { uploadFile } from '@/lib/upload';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
    Check,
    X,
    Calendar as CalendarIcon,
    Send,
    History,
    ChevronDown,
    ShieldAlert,
    LayoutList,
    ChevronRight,
    ArrowLeft,
    Search,
    ArrowUpDown,
    Clock,
    CheckCircle2,
    Plus,
    AlertTriangle,
    MapPin,
    Lock,
    Settings,
    Building2,
    ExternalLink,
    Circle,
    Info,
    SearchCheck,
    RotateCcw,
    Undo2,
    MessageSquare,
    AlertCircle,
    DollarSign,
    Loader2,
    Car,
    Activity as ActivityIcon,
    Trash2,
    ArrowLeftRight
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatCityState, sanitize, formatDistance } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { format, parseISO, isSameDay, startOfDay, startOfWeek, addDays } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { Input } from "@/components/ui/input";
import { AddressAutocompleteInput } from "@/components/ui/address-autocomplete-input";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, doc, updateDoc, setDoc, getDocs } from 'firebase/firestore';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import { NotificationService } from '@/lib/notification-service';
import { techDisplayName } from '@/lib/utils';
import { TECH_DISPUTE_OPTIONS, DISPUTE_CARDS, decisionText, disputeKindOf, isLegacyOtherReason } from '@/lib/disputes';


// Sortable timestamp for a job's scheduled date + time. Accepts ISO
// (YYYY-MM-DD) and M/D/YYYY dates and "h:mm AM/PM" or 24h times; undated jobs
// sort last.
function jobDateTimeValue(dateStr?: string | null, timeStr?: string | null): number {
    if (!dateStr) return Number.MAX_SAFE_INTEGER;
    const parts = dateStr.split(/[-/]/);
    let d: Date | null = null;
    if (parts.length === 3) {
        if (parts[0].length === 4) d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
        else d = new Date(+parts[2], +parts[0] - 1, +parts[1]);
    }
    if (!d || isNaN(d.getTime())) return Number.MAX_SAFE_INTEGER;
    if (timeStr) {
        const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
        if (m) {
            let h = +m[1];
            const ap = m[3]?.toUpperCase();
            if (ap === 'PM' && h < 12) h += 12;
            if (ap === 'AM' && h === 12) h = 0;
            d.setHours(h, +m[2], 0, 0);
        }
    }
    return d.getTime();
}

export default function TechWeeklyLogPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [assignedWorkOrders, setAssignedWorkOrders] = useState<WorkOrder[]>([]);
    const [myPayrollDisputes, setMyPayrollDisputes] = useState<PayrollDispute[]>([]);
    // Jobs this tech assisted on as a helper (lead tech owns the primary
    // entry) — the hook also fans a completed one into this tech's own
    // weekly log so it shows up here and reaches payroll.
    const { helperJobs } = useHelperLogSync(currentTechId);
    const [tripLogs, setTripLogs] = useState<TripLog[]>([]);
    const [logView, setLogView] = useState<'work' | 'trips'>('work');
    const [mounted, setMounted] = useState(false);
    const [mileageUnit, setMileageUnit] = useState<'mi' | 'km'>('mi');
    
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<string>('newest');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [isReportMissingOpen, setIsReportMissingOpen] = useState(false);
    // Post-approval dispute: a tech's log has left Draft (Submitted / Approved
    // / Rejected) and the rich in-place dispute editor is no longer available,
    // so this simple popup files a payrollDisputes ticket instead. Only
    // offered once a log is Approved (paid out) — Submitted/Rejected logs
    // aren't final yet, so there's nothing to dispute.
    const [isPayrollDisputeOpen, setIsPayrollDisputeOpen] = useState(false);
    // "Dispute This Log" now just enters dispute mode — the actual per-job
    // "Dispute This Job" buttons only appear on job cards once this is on,
    // rather than being visible all the time.
    const [isDisputeModeOn, setIsDisputeModeOn] = useState(false);
    const [payrollDisputeReason, setPayrollDisputeReason] = useState<'incorrect_pay' | 'missing_reimbursement' | 'missing_job' | ''>('');
    const [payrollDisputeWorkOrderId, setPayrollDisputeWorkOrderId] = useState<string>('');
    const [payrollDisputeNotes, setPayrollDisputeNotes] = useState('');
    const [payrollDisputeSaving, setPayrollDisputeSaving] = useState(false);
    // Opened from a specific job's "Dispute This Job" button (shown only in
    // dispute mode, once the log is Approved) — pre-scopes the popup to that
    // job instead of the tech having to find it in the optional dropdown.
    const openJobDispute = (item: WeeklyLogItem) => {
        setPayrollDisputeWorkOrderId(item.workOrderId);
        setPayrollDisputeReason('incorrect_pay');
        setIsPayrollDisputeOpen(true);
    };
    // For an issue that isn't tied to one of the listed jobs (e.g. a job
    // missing from the log entirely) — reachable from dispute mode without
    // picking a specific job card.
    const openGeneralDispute = () => {
        setPayrollDisputeWorkOrderId('');
        setPayrollDisputeReason('');
        setIsPayrollDisputeOpen(true);
    };
    const [isCreateLogOpen, setIsCreateLogOpen] = useState(false);
    const [newLogDate, setNewLogDate] = useState<Date | undefined>(new Date());

    // Unsubmit Request State
    const [isUnsubmitDialogOpen, setIsUnsubmitDialogOpen] = useState(false);
    const [unsubmitReason, setUnsubmitReason] = useState("");
    // Direct unsubmit (permission-gated) confirm state + current user for the check
    const [isDirectUnsubmitOpen, setIsDirectUnsubmitOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    // Move-between-logs state
    const [moveItem, setMoveItem] = useState<WeeklyLogItem | null>(null);

    const { toast } = useToast();

    // 1. Terminal Initialization
    useEffect(() => {
        setMounted(true);
        const userId = sessionStorage.getItem('currentUserId');
        setCurrentTechId(userId);

        if (userId) {
            const unsubLogs = onSnapshot(query(collection(db, 'weeklyLogs'), where('techId', '==', userId)), (snap) => {
                setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)));
            });
            const unsubWO = onSnapshot(query(collection(db, 'assignments'), where('techId', '==', userId)), (snap) => {
                setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
            });
            const unsubAssignedWO = onSnapshot(query(collection(db, 'workOrders'), where('assignedTechnicianId', '==', userId)), (snap) => {
                setAssignedWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
            });
            // Own trip logs only — techs must never see another tech's trips.
            const unsubTrips = onSnapshot(query(collection(db, 'tripLogs'), where('technicianId', '==', userId)), (snap) => {
                setTripLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as TripLog)));
            });
            const unsubProfile = onSnapshot(doc(db, 'users', userId), (snap) => {
                if (snap.exists()) {
                    setMileageUnit((snap.data().mileageUnit as 'mi' | 'km') || 'mi');
                    setCurrentUser({ ...snap.data(), id: snap.id } as Technician);
                }
            });
            const unsubDisputes = onSnapshot(query(collection(db, 'payrollDisputes'), where('techId', '==', userId)), (snap) => {
                setMyPayrollDisputes(snap.docs.map(d => ({ ...d.data(), id: d.id } as PayrollDispute)));
            });
            return () => {
                unsubLogs(); unsubWO(); unsubAssignedWO(); unsubTrips(); unsubProfile(); unsubDisputes();
            };
        }
    }, []);

    // 2. Active Log Resolution (Reactive)
    const activeLog = useMemo(() => {
        if (!selectedLogId) return null;
        return weeklyLogs.find(l => l.id === selectedLogId) || null;
    }, [weeklyLogs, selectedLogId]);

    // Lead + helper jobs merged, so a helper log item can resolve its work-order
    // details (number, date, Field Nation link) for display.
    // Jobs on this tech's logs that they can't read directly (reassigned, or
    // moved onto their log by payroll) — fetched through the server so every
    // line on their own log is visible and confirmable.
    const [logOnlyJobs, setLogOnlyJobs] = useState<WorkOrder[]>([]);
    const logJobIdsKey = useMemo(
        () => [...new Set(weeklyLogs.flatMap(l => (l.items || []).map(i => i.workOrderId)))].sort().join(','),
        [weeklyLogs],
    );
    useEffect(() => {
        if (!currentTechId || !logJobIdsKey) return;
        const known = new Set([...workOrders, ...assignedWorkOrders, ...helperJobs].map(j => j.id));
        if (logJobIdsKey.split(',').every(id => known.has(id))) return;
        weeklyLogAction<WorkOrder[]>('logJobs').then(setLogOnlyJobs).catch(() => {});
    }, [currentTechId, logJobIdsKey, workOrders.length, assignedWorkOrders.length, helperJobs.length]);

    const allJobs = useMemo(() => {
        const merged = [...mergeJobs(assignedWorkOrders, workOrders), ...helperJobs];
        const have = new Set(merged.map(j => j.id));
        return [...merged, ...logOnlyJobs.filter(j => !have.has(j.id))];
    }, [assignedWorkOrders, workOrders, helperJobs, logOnlyJobs]);
    const jobsById = useMemo(() => new Map(allJobs.map(j => [j.id, j])), [allJobs]);
    const settlementOf = (log: WeeklyLog) => computeWeeklyLogSettlement(log, jobsById);

    // Open post-approval disputes filed against the active log — surfaced as
    // an "Under Review" tag so a tech can see a dispute is being processed
    // without having to remember whether they filed one.
    const openDisputesForActiveLog = useMemo(
        () => myPayrollDisputes.filter(d => d.status === 'open' && d.weeklyLogId === activeLog?.id),
        [myPayrollDisputes, activeLog?.id],
    );
    const disputedWorkOrderIds = useMemo(
        () => new Set(openDisputesForActiveLog.filter(d => d.workOrderId).map(d => d.workOrderId as string)),
        [openDisputesForActiveLog],
    );

    /**
     * Submission Window Validator.
     * Current week: only Saturday (6) and Sunday (0).
     * Past weeks: always allowed (catch-up submissions).
     */
    // Same rule the server enforces on submit (business time zone): past
    // weeks any time, the current week Saturday/Sunday, future weeks never.
    const canSubmitActiveLog = useMemo(
        () => !!activeLog?.weekOf && canSubmitWeek(activeLog.weekOf),
        [activeLog?.weekOf],
    );

    // Reimbursements can be added any time the log is still in Draft — no
    // day/time-of-week window (previously Friday 6PM ET through the weekend).
    const canAddReimbursement = useMemo(() => !!activeLog?.weekOf, [activeLog?.weekOf]);

    // 3. Registry Filtering & Sorting
    // Search + date range first, so the status menu can show accurate counts.
    const searchedLogs = useMemo(() => {
        let filtered = weeklyLogs;

        if (searchQuery) {
            // Week date, or any job on the log: ASMT id, WO#, title, city.
            const q = searchQuery.toLowerCase().trim();
            filtered = filtered.filter(l => (l.weekOf || '').includes(q) || (l.items || []).some(i => {
                const j = jobsById.get(i.workOrderId);
                return [i.workOrderId, j && externalWorkOrderId(j), j?.title, j?.description, j?.location, j?.clientName]
                    .some(v => String(v || '').toLowerCase().includes(q));
            }));
        }

        if (dateRange?.from) {
            // A week matches when ANY of its 7 days (Mon–Sun) falls inside
            // the chosen range — not only its Monday.
            const start = startOfDay(dateRange.from).getTime();
            const end = startOfDay(dateRange.to ?? dateRange.from).getTime();
            filtered = filtered.filter(log => {
                const weekStart = parseLocalDate(log.weekOf);
                if (!weekStart) return true;
                const ws = startOfDay(weekStart);
                return ws.getTime() <= end && addDays(ws, 6).getTime() >= start;
            });
        }
        return filtered;
    }, [weeklyLogs, searchQuery, dateRange, jobsById]);

    const statusCounts = useMemo(() => {
        const c: Record<string, number> = { all: searchedLogs.length };
        for (const l of searchedLogs) c[l.status] = (c[l.status] || 0) + 1;
        return c;
    }, [searchedLogs]);
    const filtersActive = !!searchQuery || statusFilter !== 'all' || !!dateRange?.from;
    const resetFilters = () => { setSearchQuery(''); setStatusFilter('all'); setDateRange(undefined); };

    const filteredAndSortedLogs = useMemo(() => {
        const filtered = statusFilter === 'all' ? searchedLogs : searchedLogs.filter(l => l.status === statusFilter);
        return [...filtered].sort((a, b) => {
            if (sortBy === 'newest') return weekOfValue(b.weekOf) - weekOfValue(a.weekOf);
            if (sortBy === 'oldest') return weekOfValue(a.weekOf) - weekOfValue(b.weekOf);
            if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '');
            if (sortBy === 'billing') return settlementOf(b) - settlementOf(a);
            return 0;
        });
    }, [searchedLogs, sortBy, statusFilter, jobsById]);

    // Past (non-Draft) logs pile up week after week — page them; open Drafts always show.
    const pastLogsAll = useMemo(() => filteredAndSortedLogs.filter(l => l.status !== 'Draft'), [filteredAndSortedLogs]);
    const pastLogsPager = usePaged(pastLogsAll, PAGE_SIZES_SMALL, 'tech-past-logs', [searchQuery, sortBy, statusFilter, dateRange]);

    const isLocked = useMemo(() => activeLog?.status !== 'Draft', [activeLog?.status]);

    const handleCreateLog = async () => {
        if (!newLogDate || !currentTechId) return;
        
        const monday = startOfWeek(newLogDate, { weekStartsOn: 1 });
        const weekOf = format(monday, 'MM-dd-yyyy');
        
        if (weeklyLogs.some(l => l.weekOf === weekOf)) {
            toast({ variant: 'destructive', title: 'Save failed', description: `A log for the week of ${weekOf} already exists.` });
            return;
        }

        try {
            const result = await createDraftWeeklyLog({ weekOf });
            if (result === 'exists') {
                toast({ variant: 'destructive', title: 'Save failed', description: `A log for the week of ${weekOf} already exists.` });
                return;
            }
            toast({ title: "Log created", description: `Weekly log for the week of ${weekOf} created.` });
            setIsCreateLogOpen(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not create log', description: e.message });
        }
    };

    // Every log edit goes through the server (/api/weekly-log): it changes
    // only what a tech may change — pay comes from the job records and new
    // reimbursements are always pending payroll review.
    const handleConfirm = async (itemId: string) => {
        if (!activeLog || isLocked) return;
        try {
            await weeklyLogAction('confirmItem', { logId: activeLog.id, itemId });
            toast({ title: "Job confirmed", description: "Saved to your weekly log." });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Could not confirm job", description: e.message });
        }
    };

    const handleDispute = async (itemId: string, kind: DisputeKind, notes?: string) => {
        if (!activeLog || isLocked) return;
        const reason = TECH_DISPUTE_OPTIONS.find(o => o.kind === kind)?.label || DISPUTE_CARDS[kind].title;
        try {
            await weeklyLogAction('disputeItem', { logId: activeLog.id, itemId, reason, kind, notes: notes || null });
            toast({ title: "Dispute saved", description: "Payroll will review this job." });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Could not save dispute", description: e.message });
        }
    };

    const handleAddReimbursement = async (
        item: WeeklyLogItem,
        data: { amount: number; description: string; note?: string; receiptUrl?: string },
    ) => {
        if (!activeLog || isLocked) return;
        try {
            await weeklyLogAction('addReimbursement', {
                logId: activeLog.id, itemId: item.id,
                amount: data.amount, description: data.description, note: data.note, receiptUrl: data.receiptUrl,
            });
            toast({ title: 'Reimbursement added', description: 'Pending payroll review — it will appear in the pay calculator.' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not add reimbursement', description: e.message });
        }
    };

    const handleDeleteReimbursement = async (reimbId: string) => {
        if (!activeLog || isLocked) return;
        try {
            await weeklyLogAction('deleteReimbursement', { logId: activeLog.id, reimbId });
            toast({ title: 'Reimbursement removed' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not remove reimbursement', description: e.message });
        }
    };

    const handleReportMissing = async (report: MissingAssignmentReport) => {
        if (!activeLog || isLocked) return;
        try {
            await weeklyLogAction('addMissingReport', { logId: activeLog.id, report });
            toast({ title: "Missing job reported", description: "Payroll will look into it." });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Could not send report", description: e.message });
        }
    };

    const handleSubmitPayrollDispute = async () => {
        if (!activeLog || !currentTechId || !payrollDisputeReason) return;
        if (!payrollDisputeNotes.trim()) {
            toast({ variant: "destructive", title: "Missing details", description: "Describe the issue for the admin." });
            return;
        }
        setPayrollDisputeSaving(true);
        try {
            const id = await createDocId(ID_PREFIXES.PAYROLL_DISPUTE);
            await setDoc(doc(db, 'payrollDisputes', id), {
                id,
                techId: currentTechId,
                techName: techDisplayName(currentUser),
                weeklyLogId: activeLog.id,
                weekOf: activeLog.weekOf,
                workOrderId: payrollDisputeWorkOrderId || null,
                reason: payrollDisputeReason,
                notes: payrollDisputeNotes.trim(),
                status: 'open',
                createdAt: new Date().toISOString(),
            });
            const disputeSubject = payrollDisputeWorkOrderId ? `job ${payrollDisputeWorkOrderId.toUpperCase()}` : 'a job';
            NotificationService.notifyPayrollAdmins(
                "Payroll dispute filed",
                `${currentUser?.name || 'A technician'} disputed ${disputeSubject} on the weekly log for ${activeLog.weekOf}. Reason: ${payrollDisputeReason.replace(/_/g, ' ')}.`,
                { id: activeLog.id, type: 'weeklyLog' },
            ).catch(() => {});
            toast({ title: "Dispute filed", description: "An admin will review this against your weekly log." });
            setIsPayrollDisputeOpen(false);
            setIsDisputeModeOn(false);
            setPayrollDisputeReason('');
            setPayrollDisputeWorkOrderId('');
            setPayrollDisputeNotes('');
        } catch (e: any) {
            toast({ variant: "destructive", title: "Could not file dispute", description: e.message });
        } finally {
            setPayrollDisputeSaving(false);
        }
    };

    const handleSubmit = async () => {
        if (!activeLog) return;

        if (!canSubmitActiveLog) {
            toast({
                variant: "destructive",
                title: "Can't submit yet",
                description: "Current-week logs can only be submitted on Saturday or Sunday. Past week logs can be submitted anytime.",
            });
            return;
        }
        
        // The server stamps the true settlement (job pay from the job records,
        // FN fee/split applied, disputed items excluded) and re-checks the
        // submit window.
        try {
            await weeklyLogAction('submit', { logId: activeLog.id });
            toast({
                title: "Log submitted",
                description: "Your weekly log was sent to payroll.",
            });
            setSelectedLogId(null);
        } catch (e: any) {
            toast({ variant: "destructive", title: "Could not submit", description: e.message });
        }
    };

    // Direct self-unsubmit — only for techs granted tech.logs.unsubmit_own, and
    // only while the log is still Submitted (payroll approval flips it to
    // Approved, which is ineligible). Returns the log to Draft and records it.
    const canUnsubmitOwnLog = hasPermission(currentUser, 'tech.logs.unsubmit_own');
    const canMoveAssignment = hasPermission(currentUser, 'tech.logs.move_assignment');
    const isUnsubmitEligible = !!activeLog
        && activeLog.status === 'Submitted'
        && !(activeLog as any).archived
        && !(activeLog as any).paid;

    // Other active (Draft) logs owned by this tech that an item can move into.
    const moveDestinations = useMemo(
        () => weeklyLogs.filter(l => l.techId === currentTechId && l.id !== activeLog?.id && l.status === 'Draft'),
        [weeklyLogs, currentTechId, activeLog?.id]
    );

    // Move one assignment (weekly-log item) + its reimbursements from the active
    // log into another active log, updating both logs' totals. The item exists in
    // exactly one log at a time — no duplication. Notes/time logs/mileage/photos
    // live on the assignment/trip records (not the log item), so they follow the
    // assignment automatically and are unaffected.
    const handleMoveItem = async (destLogId: string) => {
        if (!activeLog || !moveItem) return;
        const dest = weeklyLogs.find(l => l.id === destLogId);
        if (!dest || dest.status !== 'Draft') return;
        if ((dest.items || []).some(i => i.workOrderId === moveItem.workOrderId)) {
            toast({ variant: 'destructive', title: 'Already in that log', description: 'This job is already on the other log.' });
            return;
        }
        try {
            await weeklyLogAction('moveItem', { fromLogId: activeLog.id, toLogId: dest.id, itemId: moveItem.id });
            toast({ title: 'Job moved', description: `Moved to the week of ${dest.weekOf}.` });
            setMoveItem(null);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not move job', description: e.message });
        }
    };

    const handleDirectUnsubmit = async () => {
        if (!activeLog || !canUnsubmitOwnLog || !isUnsubmitEligible) return;
        try {
            await weeklyLogAction('unsubmit', { logId: activeLog.id });
            toast({ title: 'Log unsubmitted', description: 'Back to draft — you can edit it again.' });
            setIsDirectUnsubmitOpen(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not unsubmit', description: e.message });
        }
    };

    const handleRequestUnsubmit = async () => {
        if (!activeLog || !unsubmitReason.trim()) return;
        try {
            await weeklyLogAction('requestUnsubmit', { logId: activeLog.id, reason: unsubmitReason.trim() });
            toast({
                title: "Unsubmit requested",
                description: "An admin will review your request.",
            });
            setIsUnsubmitDialogOpen(false);
            setUnsubmitReason("");
        } catch (e: any) {
            toast({ variant: "destructive", title: "Could not send request", description: e.message });
        }
    };

    const counts = useMemo(() => {
        if (!activeLog) return { total: 0, confirmed: 0, disputed: 0, pending: 0 };
        const items = activeLog.items || [];
        return {
            total: items.length,
            confirmed: items.filter(i => i.confirmationStatus === 'confirmed').length,
            disputed: items.filter(i => i.confirmationStatus === 'disputed').length,
            pending: items.filter(i => !i.confirmationStatus).length
        };
    }, [activeLog]);

    const canSubmit = counts.total > 0 && counts.pending === 0;

    const ViewTabs = () => (
        <div className="tabs !mb-0 flex-nowrap" role="tablist">
            <button type="button" role="tab" aria-selected={logView === 'work'} onClick={() => setLogView('work')}
                className={cn('tab inline-flex items-center', logView === 'work' && 'active')}>
                <LayoutList size={14} className="mr-1.5" />Work logs
            </button>
            <button type="button" role="tab" aria-selected={logView === 'trips'} onClick={() => setLogView('trips')}
                className={cn('tab inline-flex items-center', logView === 'trips' && 'active')}>
                <Car size={14} className="mr-1.5" />Mileage
            </button>
        </div>
    );

    if (logView === 'trips') {
        return (
            <div className="space-y-6 text-left">
                <PageHeader
                    eyebrow="Mileage"
                    icon={Car}
                    title="Trip log"
                    subtitle="Every trip you've recorded — for reimbursement and year-end mileage."
                    actions={<ViewTabs />}
                />
                <TripLogsView tripLogs={tripLogs} workOrders={workOrders} mileageUnit={mileageUnit} />
            </div>
        );
    }

    if (!activeLog) {
        return (
            <div className="space-y-6 text-left">
                <PageHeader
                    eyebrow="Weekly logs"
                    icon={LayoutList}
                    title="My weekly logs"
                    subtitle="Confirm each week's jobs, add reimbursements and submit for pay."
                    actions={<>
                        <ViewTabs />
                        <Button onClick={() => setIsCreateLogOpen(true)} className="bg-brand-red hover:bg-brand-red-hover h-10 px-4">
                            <Plus size={16} className="mr-1.5" /> New log
                        </Button>
                    </>}
                />

                <div className="flex flex-col gap-2 rounded-xl border border-border-main bg-bg-secondary p-3 shadow-sm max-w-6xl mx-auto sm:flex-row sm:items-center">
                    <SearchField
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search week, job, WO # or city"
                        className="sm:flex-1"
                    />
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="h-11 sm:h-9 sm:w-[160px] bg-bg-secondary border-border-main" aria-label="Status">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                {([['all', 'All statuses'], ['Draft', 'Draft'], ['Submitted', 'Submitted'], ['Approved', 'Approved'], ['Rejected', 'Rejected']] as const).map(([v, label]) => (
                                    <SelectItem key={v} value={v} className="text-[13px]">{label} ({statusCounts[v] || 0})</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                            <SelectTrigger className="h-11 sm:h-9 sm:w-[160px] bg-bg-secondary border-border-main" aria-label="Sort">
                                <SelectValue placeholder="Sort" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="newest" className="text-[13px]">Newest week first</SelectItem>
                                <SelectItem value="oldest" className="text-[13px]">Oldest week first</SelectItem>
                                <SelectItem value="status" className="text-[13px]">Status</SelectItem>
                                <SelectItem value="billing" className="text-[13px]">Highest pay</SelectItem>
                            </SelectContent>
                        </Select>
                        <DateRangeButton value={dateRange} onChange={setDateRange} className="col-span-2 sm:col-span-1" />
                        {filtersActive && (
                            <Button variant="ghost" onClick={resetFilters} className="col-span-2 h-11 sm:h-9 text-brand-red sm:col-span-1">
                                <X size={14} className="mr-1" /> Reset
                            </Button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 max-w-6xl mx-auto">
                    {(() => {
                        const draftLogs = filteredAndSortedLogs.filter(l => l.status === 'Draft');
                        const pastLogs = pastLogsPager.items;
                        const showDivider = statusFilter === 'all' && draftLogs.length > 0 && pastLogsPager.total > 0;
                        const renderCard = (log: WeeklyLog, logIdx: number) => (
                            <Card
                                key={log.id || `log-list-${logIdx}`}
                                className={cn(
                                    "rounded-xl bg-bg-secondary shadow-sm hover:border-brand-red transition-all cursor-pointer group",
                                    log.status === 'Draft' ? "border-accent-gold/30" :
                                    log.status === 'Approved' ? "border-green-border/30" :
                                    "border-border-sub"
                                )}
                                onClick={() => setSelectedLogId(log.id)}
                            >
                                <CardContent className="p-4 flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-3 sm:gap-4 text-left">
                                        <div className={cn(
                                            "p-2.5 rounded-xl border",
                                            log.status === 'Draft' ? "bg-accent-gold-dim border-accent-gold/30 text-accent-gold" :
                                            log.status === 'Approved' ? "bg-green-dim border-green-border/30 text-text-green" :
                                            "bg-bg-tertiary border-border-sub text-text-muted"
                                        )}>
                                            <CalendarIcon size={16} />
                                        </div>
                                        <div className="min-w-0 text-left">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-[14px] font-semibold text-text-primary group-hover:text-brand-red transition-colors text-left">Week of {log.weekOf}</p>
                                                {log.unsubmitRequested && (
                                                    <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">Unsubmit requested</Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5 text-[12px] text-text-muted text-left">
                                                <span>{(log.items || []).length} {(log.items || []).length === 1 ? 'job' : 'jobs'}</span>
                                                <div className="h-1 w-1 rounded-full bg-text-muted opacity-30" />
                                                <span className="text-text-green font-mono">${settlementOf(log).toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2 sm:gap-4">
                                        <StatusBadge kind="log" value={log.status} />
                                        <ChevronRight size={18} className="text-text-muted group-hover:text-text-primary transition-all" />
                                    </div>
                                </CardContent>
                            </Card>
                        );
                        return (
                            <>
                                {draftLogs.map((log, i) => renderCard(log, i))}
                                {showDivider && (
                                    <div className="flex items-center gap-3 py-2">
                                        <div className="flex-1 h-px bg-border-sub" />
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                                            <History size={12} /> Past logs
                                        </p>
                                        <div className="flex-1 h-px bg-border-sub" />
                                    </div>
                                )}
                                {pastLogs.map((log, i) => renderCard(log, draftLogs.length + i))}
                                <ListPager pager={pastLogsPager} noun="past logs" />
                            </>
                        );
                    })()}
                    {filteredAndSortedLogs.length === 0 && (weeklyLogs.length === 0 || !filtersActive ? (
                        <EmptyState icon={LayoutList} title="No weekly logs yet" description="Start a log for a week with New log." />
                    ) : (
                        <EmptyState
                            icon={Search}
                            title="No logs match these filters"
                            description="Try a different search, status or date range."
                            action={<Button variant="outline" onClick={resetFilters}>Reset filters</Button>}
                        />
                    ))}
                </div>

                <Dialog open={isCreateLogOpen} onOpenChange={setIsCreateLogOpen}>
                    <DialogContent className="sm:max-w-[400px] bg-bg-elevated border-border-default shadow-2xl">
                        <DialogHeader className="text-left">
                            <DialogTitle className="text-base font-semibold">Start a weekly log</DialogTitle>
                            <DialogDescription className="text-[12px] text-left">Pick any day in the week. The log starts on that week&apos;s Monday.</DialogDescription>
                        </DialogHeader>
                        <div className="py-6 flex justify-center border-y border-border-sub my-4 text-left">
                            <Calendar 
                                mode="single" 
                                selected={newLogDate} 
                                onSelect={setNewLogDate} 
                                initialFocus
                                className="bg-bg-primary rounded-md border border-border-sub"
                            />
                        </div>
                        <DialogFooter className="gap-3 flex-row">
                            <Button variant="outline" onClick={() => setIsCreateLogOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-wider h-11">Cancel</Button>
                            <Button onClick={handleCreateLog} className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-wider h-11 text-white">Create log</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500 text-left">
            <div className="text-left">
                <Button variant="ghost" size="sm" onClick={() => setSelectedLogId(null)} className="h-10 -ml-2 px-2 text-text-muted hover:text-text-primary">
                    <ArrowLeft size={14} className="mr-1.5"/> All weekly logs
                </Button>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-secondary p-4 sm:p-6 rounded-xl border border-border-main shadow-sm text-left">
                <div className="flex items-center gap-4 sm:gap-6 text-left">
                    <div className={cn(
                        "p-3 rounded-xl border",
                        activeLog.status === 'Draft' ? "bg-accent-gold-dim border-accent-gold/30 text-accent-gold" : "bg-green-dim border-green-border/30 text-text-green"
                    )}>
                        <ShieldAlert size={24} />
                    </div>
                    <div className="text-left">
                        <div className="flex items-center gap-3 text-left">
                            <h1 className="text-lg sm:text-xl font-semibold text-text-primary text-left">Week of {activeLog.weekOf}</h1>
                            <StatusBadge kind="log" value={activeLog.status} />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-left">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-green uppercase tracking-wider text-left">
                                <Check className="text-text-green h-3 w-3"/> {counts.confirmed} confirmed
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-red uppercase tracking-wider text-left">
                                <X className="text-text-red h-3 w-3"/> {counts.disputed} disputed
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-accent-gold uppercase tracking-wider text-left">
                                <Clock size={12} className="h-3 w-3"/> {counts.pending} to review
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-3 text-right">
                    {activeLog.status === 'Submitted' ? (
                        <div className="flex flex-col items-end gap-3 text-right">
                            {canUnsubmitOwnLog && isUnsubmitEligible ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-9 px-6 text-[10px] font-bold uppercase tracking-wider border-brand-red text-text-red hover:bg-brand-red-dim"
                                    onClick={() => setIsDirectUnsubmitOpen(true)}
                                >
                                    <Undo2 size={14} className="mr-2" /> Unsubmit Log
                                </Button>
                            ) : activeLog.unsubmitRequested ? (
                                <div className="flex items-center gap-2 p-2 rounded-lg bg-bg-tertiary border border-border-sub text-accent-gold">
                                    <AlertCircle size={14} className="animate-pulse" />
                                    <p className="text-[12px] font-semibold">Unsubmit requested</p>
                                </div>
                            ) : (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-9 px-6 text-[10px] font-bold uppercase tracking-wider border-brand-red text-text-red hover:bg-brand-red-dim"
                                    onClick={() => setIsUnsubmitDialogOpen(true)}
                                >
                                    <Undo2 size={14} className="mr-2" /> Request Unsubmit
                                </Button>
                            )}
                            <div className="text-right">
                                <p className="text-[10px] font-semibold text-text-green uppercase tracking-wider text-right">Submitted</p>
                                <p className="text-[11px] text-text-muted font-bold text-right">
                                  {activeLog.submittedAt
                                    ? `${format(parseISO(activeLog.submittedAt), 'MMM d, h:mm a')}${activeLog.submittedBy ? ` · ${activeLog.submittedBy}` : ''}`
                                    : 'N/A'}
                                </p>
                            </div>
                        </div>
                    ) : isLocked ? (
                        <div className="flex flex-col items-end text-right">
                            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider text-right">Locked · submitted</p>
                            <p className="text-[11px] text-text-muted font-bold text-right">
                              {activeLog.submittedAt
                                ? `${format(parseISO(activeLog.submittedAt), 'MMM d, h:mm a')}${activeLog.submittedBy ? ` · ${activeLog.submittedBy}` : ''}`
                                : 'N/A'}
                            </p>
                        </div>
                    ) : (
                        <Button
                            disabled={!canSubmit || !canSubmitActiveLog}
                            onClick={handleSubmit}
                            className={cn(
                                "h-11 w-full md:w-auto px-6",
                                canSubmit && canSubmitActiveLog ? "bg-brand-red hover:bg-brand-red-hover" : "bg-bg-tertiary text-text-muted border border-border-sub"
                            )}
                        >
                            <Send size={16} className="mr-2"/>
                            {canSubmitActiveLog ? "Submit log" : "Submit on Sat or Sun"}
                        </Button>
                    )}
                </div>
            </div>

            {/* UNSET REASONS WARNING */}
            {!isLocked && counts.pending > 0 && (
                <div className="max-w-6xl mx-auto p-4 rounded-xl border border-border-alert bg-brand-red/5 flex items-start gap-3 shadow-sm text-left">
                    <ShieldAlert size={20} className="text-text-red shrink-0 mt-0.5" />
                    <div className="space-y-1 text-left">
                        <p className="text-[13px] font-semibold text-text-red text-left">Review every job</p>
                        <p className="text-[12px] text-text-secondary leading-relaxed text-left">
                            Confirm or dispute the remaining <span className="text-text-red font-semibold">{counts.pending} {counts.pending === 1 ? 'job' : 'jobs'}</span> before you can submit this log.
                        </p>
                    </div>
                </div>
            )}

            {!isLocked && !canSubmitActiveLog && (
                <div className="max-w-6xl mx-auto p-4 rounded-xl border border-border-main bg-bg-secondary flex items-start gap-3 shadow-sm text-left">
                    <Info size={20} className="text-accent-gold shrink-0 mt-0.5" />
                    <div className="space-y-1 text-left">
                        <p className="text-[13px] font-semibold text-text-primary text-left">When you can submit</p>
                        <p className="text-[12px] text-text-secondary leading-relaxed text-left">
                            Keep confirming jobs and adding expenses during the week. This week&apos;s log can be submitted on <span className="text-brand-red font-semibold">Saturday or Sunday</span>. Past weeks can be submitted any time.
                        </p>
                    </div>
                </div>
            )}

            <div className="space-y-4 max-w-6xl mx-auto text-left">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-sub pb-2 px-1 text-left">
                    <div className="flex items-center gap-2">
                        <h2 className="section-label text-left">Jobs this week</h2>
                        {openDisputesForActiveLog.length > 0 && (
                            <Badge variant="destructive" className="text-[10px] h-5 uppercase tracking-wider flex items-center gap-1">
                                <AlertTriangle size={10} /> Dispute under review
                            </Badge>
                        )}
                    </div>
                    {!isLocked ? (
                        <Button variant="ghost" size="sm" className="h-10 sm:h-8 text-brand-red hover:bg-brand-red/10" onClick={() => setIsReportMissingOpen(true)}>
                            <Search size={14} className="mr-1.5"/> Report missing job
                        </Button>
                    ) : activeLog.status === 'Approved' ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                                "h-10 sm:h-8",
                                isDisputeModeOn ? "text-text-primary hover:bg-bg-tertiary" : "text-brand-red hover:bg-brand-red/10"
                            )}
                            onClick={() => setIsDisputeModeOn(v => !v)}
                        >
                            <AlertTriangle size={14} className="mr-1.5"/> {isDisputeModeOn ? 'Cancel dispute' : 'Dispute this log'}
                        </Button>
                    ) : null}
                </div>
                {isDisputeModeOn && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-brand-red/30 bg-brand-red/5 text-left">
                        <p className="text-[12px] font-medium text-text-red">
                            Pick the job below you want to dispute, or file a general issue.
                        </p>
                        <Button variant="outline" size="sm" className="h-10 sm:h-8 shrink-0" onClick={openGeneralDispute}>
                            File a general dispute
                        </Button>
                    </div>
                )}
                <div className="space-y-3 text-left">
                    {[...(activeLog.items || [])]
                        .sort((a, b) => {
                            const ja = allJobs.find(w => w.id === a.workOrderId);
                            const jb = allJobs.find(w => w.id === b.workOrderId);
                            return jobDateTimeValue(ja?.scheduleDate, ja?.scheduleTime) - jobDateTimeValue(jb?.scheduleDate, jb?.scheduleTime);
                        })
                        .map((item, itemIdx) => (
                        <JobAuditCard
                            key={item.id || item.workOrderId || `item-${itemIdx}`}
                            item={item}
                            isLocked={isLocked}
                            workOrders={allJobs}
                            reimbursements={activeLog.reimbursements || []}
                            canAddReimbursement={canAddReimbursement}
                            onConfirm={handleConfirm}
                            onDispute={handleDispute}
                            onAddReimbursement={handleAddReimbursement}
                            onDeleteReimbursement={handleDeleteReimbursement}
                            canMove={!isLocked && canMoveAssignment}
                            onRequestMove={() => setMoveItem(item)}
                            techId={currentTechId}
                            onDisputeJob={isDisputeModeOn ? openJobDispute : undefined}
                            hasOpenPayrollDispute={disputedWorkOrderIds.has(item.workOrderId)}
                        />
                    ))}
                    {(activeLog.items || []).length === 0 && (
                        <EmptyState icon={ActivityIcon} title="No jobs on this log yet" description="Jobs you complete this week show up here." />
                    )}
                    {/* Reported-missing jobs always trail the synced registry — they aren't
                        confirmed assignments yet, just a flag for payroll to investigate. */}
                    {(activeLog.missingAssignmentReports || []).map(report => (
                        <Card key={report.id} className="rounded-xl bg-bg-secondary border-accent-gold/30 border-dashed overflow-hidden text-left">
                            <CardContent className="p-4 flex items-center gap-4 text-left">
                                <div className="h-10 w-10 rounded-xl border border-accent-gold/30 bg-accent-gold/10 text-accent-gold flex items-center justify-center shrink-0 shadow-inner">
                                    <Search size={18}/>
                                </div>
                                <div className="min-w-0 text-left flex-1">
                                    <div className="flex flex-wrap items-center gap-2 text-left">
                                        <h3 className="text-[14px] font-semibold text-text-primary break-words text-left min-w-0">{report.summary || 'Missing job'}</h3>
                                        {report.resolution?.decision === 'no' ? (
                                            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">Not paid</Badge>
                                        ) : report.isAudited ? (
                                            <StatusBadge kind="log" value="approved" label="Added by payroll" />
                                        ) : (
                                            <Badge variant="pending" className="text-[10px] uppercase tracking-wide">Reported missing</Badge>
                                        )}
                                        {report.jobType && <Badge variant="outline" className="text-[10px] uppercase tracking-wide">{report.jobType}</Badge>}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1 text-[12px] text-text-muted text-left">
                                        {report.clientName && <span>{report.clientName}</span>}
                                        {report.jobType === 'Imported' && report.externalWorkOrderId && (
                                            <a
                                                href={`https://app.fieldnation.com/workorders/${report.externalWorkOrderId}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 text-brand-red hover:underline"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                WO #{report.externalWorkOrderId} <ExternalLink size={9} />
                                            </a>
                                        )}
                                        {report.assignmentId && <span className="font-mono text-brand-red">ASMT #{report.assignmentId.toUpperCase()}</span>}
                                        <span className="flex items-center gap-1.5 text-left"><MapPin size={10} className="text-brand-red shrink-0"/> {formatCityState(report.location)}</span>
                                        <span className="flex items-center gap-1.5 text-left"><CalendarIcon size={10} className="shrink-0"/> {report.date}{report.time ? ` · ${report.time}` : ''}</span>
                                        {report.pay != null && <span className="text-text-green">${report.pay.toFixed(2)}</span>}
                                    </div>
                                    {report.resolution ? (
                                        <p className="text-[12px] font-semibold text-text-primary mt-1.5 break-words text-left">{decisionText('missing', report.resolution)}</p>
                                    ) : !report.isAudited && (
                                        <p className="text-[11px] text-text-muted mt-1.5 text-left">Waiting for payroll to decide. Not paid until then.</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                    {/* Flagged jobs payroll took off this log (duplicate copy removed,
                        or sent back to Dispatch) — the line is gone, so show the answer. */}
                    {((activeLog as WeeklyLog & { history?: any[] }).history || [])
                        .filter(h => h?.type === 'dispute_removed' && h.resolution && !(activeLog.items || []).some(i => i.id === h.itemId))
                        .map((h, idx) => (
                            <div key={`removed-${idx}`} className="p-3 rounded-xl border border-border-sub bg-bg-tertiary/30 text-left">
                                <p className="text-[12px] text-text-muted text-left">
                                    <span className="font-mono font-semibold text-text-primary">{String(h.workOrderId || '').toUpperCase()}</span> · removed from this log
                                </p>
                                <p className="text-[12px] font-semibold text-text-primary mt-0.5 break-words text-left">{decisionText(h.kind, h.resolution)}</p>
                            </div>
                        ))}
                </div>
            </div>

            {/* MOVE ASSIGNMENT TO ANOTHER ACTIVE LOG */}
            <Dialog open={!!moveItem} onOpenChange={v => { if (!v) setMoveItem(null); }}>
                <DialogContent className="sm:max-w-[460px] bg-bg-elevated border-border-default shadow-2xl">
                    <DialogHeader className="text-left">
                        <div className="flex items-center gap-2 mb-1">
                            <ArrowLeftRight className="text-brand-blue h-5 w-5" />
                            <DialogTitle className="text-base font-semibold">Move to another log</DialogTitle>
                        </div>
                        <p className="text-[12px] text-text-muted leading-relaxed">
                            Moving from the week of <span className="text-text-primary font-semibold">{activeLog?.weekOf}</span>. Choose a draft log to move it to — notes, time, mileage, reimbursements, receipts and pay stay with the job.
                        </p>
                    </DialogHeader>
                    <div className="space-y-2 max-h-[45vh] overflow-y-auto py-1">
                        {moveDestinations.length === 0 ? (
                            <div className="text-center py-6 space-y-1">
                                <p className="text-[13px] text-text-primary font-semibold">No other draft logs</p>
                                <p className="text-[12px] text-text-muted leading-relaxed px-4">Start a draft log for another week first, then move this job into it.</p>
                            </div>
                        ) : moveDestinations.map(l => (
                            <button
                                key={l.id}
                                onClick={() => handleMoveItem(l.id)}
                                className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-border-sub bg-bg-secondary hover:border-brand-blue/50 hover:bg-brand-blue/5 transition-colors text-left"
                            >
                                <div>
                                    <p className="text-[13px] font-semibold text-text-primary">Week of {l.weekOf}</p>
                                    <p className="text-[12px] text-text-muted">{l.status} · {(l.items || []).length} job{(l.items || []).length !== 1 ? 's' : ''}</p>
                                </div>
                                <ArrowLeftRight size={14} className="text-brand-blue shrink-0" />
                            </button>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="h-9 text-[10px] font-bold uppercase tracking-wider" onClick={() => setMoveItem(null)}>Cancel</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* DIRECT UNSUBMIT CONFIRM (permission-gated) */}
            <Dialog open={isDirectUnsubmitOpen} onOpenChange={setIsDirectUnsubmitOpen}>
                <DialogContent className="sm:max-w-[440px] bg-bg-elevated border-border-default shadow-2xl">
                    <DialogHeader className="text-left">
                        <div className="flex items-center gap-2 mb-1">
                            <Undo2 className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-base font-semibold">Unsubmit weekly log</DialogTitle>
                        </div>
                        <p className="text-[12px] text-text-muted leading-relaxed">
                            Unsubmitting this weekly log returns it to draft so you can edit its jobs and entries again. Continue?
                        </p>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" className="h-9 text-[10px] font-bold uppercase tracking-wider" onClick={() => setIsDirectUnsubmitOpen(false)}>Cancel</Button>
                        <Button className="h-9 text-[10px] font-bold uppercase tracking-wider bg-brand-red hover:bg-brand-red-hover text-white" onClick={handleDirectUnsubmit}>
                            <Undo2 size={14} className="mr-2" /> Unsubmit Log
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* UN-SUBMIT REQUEST DIALOG */}
            <Dialog open={isUnsubmitDialogOpen} onOpenChange={setIsUnsubmitDialogOpen}>
                <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30 text-left">
                        <div className="flex items-center gap-2 mb-1 text-left">
                            <Undo2 className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-semibold">Request to unsubmit</DialogTitle>
                        </div>
                        <DialogDescription className="text-[12px] text-text-muted text-left">Ask an admin to reopen this submitted log so you can change it.</DialogDescription>
                    </DialogHeader>
                    <div className="p-6 space-y-4 text-left">
                        <div className="p-4 rounded-lg bg-bg-secondary border border-border-sub space-y-2 text-left">
                            <p className="text-[10px] font-semibold text-brand-red uppercase tracking-wider flex items-center gap-2 text-left">
                                <Info size={12}/> Before you ask
                            </p>
                            <p className="text-[12px] text-text-secondary leading-relaxed text-left">
                                Unsubmitting pauses payroll review for this week. Tell the admin exactly what you need to change.
                            </p>
                        </div>
                        <div className="space-y-2 text-left">
                            <Label className="text-[12px] font-semibold text-text-muted ml-1 flex items-center gap-1.5">
                                <MessageSquare size={12} /> Reason
                            </Label>
                            <Textarea 
                                placeholder="e.g., Added missing materials reimbursement, need to dispute WO-18927..." 
                                value={unsubmitReason}
                                onChange={e => setUnsubmitReason(e.target.value)}
                                className="bg-bg-primary border-border-sub min-h-[120px] text-xs leading-relaxed font-medium"
                            />
                        </div>
                    </div>
                    <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default flex gap-3">
                        <Button variant="outline" onClick={() => setIsUnsubmitDialogOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-wider h-11">Cancel</Button>
                        <Button 
                            disabled={!unsubmitReason.trim()}
                            onClick={handleRequestUnsubmit} 
                            className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-wider h-11 text-white shadow-lg"
                        >
                            <Send size={16} className="mr-2" /> Send request
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ReportMissingJobDialog
                isOpen={isReportMissingOpen}
                setIsOpen={setIsReportMissingOpen}
                onSave={handleReportMissing}
            />

            {/* Post-approval dispute — simple popup for logs that have left Draft. */}
            <Dialog open={isPayrollDisputeOpen} onOpenChange={(open) => { setIsPayrollDisputeOpen(open); if (!open) { setPayrollDisputeReason(''); setPayrollDisputeWorkOrderId(''); setPayrollDisputeNotes(''); } }}>
                <DialogContent className="sm:max-w-[480px] bg-bg-elevated border-border-default shadow-2xl">
                    <DialogHeader className="text-left">
                        <div className="flex items-center gap-2 mb-1 text-left">
                            <AlertTriangle className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-semibold text-text-primary text-left">
                                {payrollDisputeWorkOrderId ? 'Dispute this job' : 'Dispute this log'}
                            </DialogTitle>
                        </div>
                        <DialogDescription className="text-[12px] text-text-muted text-left">
                            {payrollDisputeWorkOrderId
                                ? 'This log has already been submitted — the rest of it is unaffected. Flag just this job for admin review.'
                                : 'This log has already been submitted. Flag an issue for admin review.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2 text-left">
                        <div className="space-y-2 text-left">
                            <Label className="text-[12px] font-semibold text-text-muted">Reason</Label>
                            <RadioGroup value={payrollDisputeReason} onValueChange={(v: any) => setPayrollDisputeReason(v)} className="space-y-2">
                                {[
                                    { value: 'incorrect_pay', label: 'Incorrect pay' },
                                    { value: 'missing_reimbursement', label: 'Missing reimbursement' },
                                    { value: 'missing_job', label: 'Missing job' },
                                ].map(r => (
                                    <div key={r.value} className="flex items-center space-x-2 p-2 rounded hover:bg-bg-tertiary transition-colors cursor-pointer text-left">
                                        <RadioGroupItem value={r.value} id={`pap-${r.value}`} />
                                        <Label htmlFor={`pap-${r.value}`} className="text-[13px] font-medium text-text-primary cursor-pointer flex-1 text-left">{r.label}</Label>
                                    </div>
                                ))}
                            </RadioGroup>
                        </div>

                        {(payrollDisputeReason === 'incorrect_pay' || payrollDisputeReason === 'missing_reimbursement') && (activeLog?.items?.length ?? 0) > 0 && (
                            <div className="space-y-2 text-left">
                                <Label className="text-[12px] font-semibold text-text-muted">Which job? (optional)</Label>
                                <Select value={payrollDisputeWorkOrderId} onValueChange={setPayrollDisputeWorkOrderId}>
                                    <SelectTrigger className="bg-bg-primary border-border-sub h-10 text-xs">
                                        <SelectValue placeholder="Select a job" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(activeLog?.items || []).map(item => {
                                            const job = allJobs.find(wo => wo.id === item.workOrderId);
                                            return (
                                                <SelectItem key={item.id} value={item.workOrderId} className="text-xs">
                                                    {job ? `${displayWorkOrderNumber(job)} — ${job.title || job.description}` : item.workOrderId}
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="space-y-2 text-left">
                            <Label className="text-[12px] font-semibold text-text-muted">Details</Label>
                            <Textarea
                                value={payrollDisputeNotes}
                                onChange={e => setPayrollDisputeNotes(e.target.value)}
                                placeholder="Describe the issue..."
                                className="bg-bg-secondary h-24 text-xs font-medium leading-relaxed text-left"
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-3 flex-row">
                        <Button variant="outline" onClick={() => setIsPayrollDisputeOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-wider h-11">Cancel</Button>
                        <Button
                            disabled={!payrollDisputeReason || !payrollDisputeNotes.trim() || payrollDisputeSaving}
                            onClick={handleSubmitPayrollDispute}
                            className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-wider h-11 text-white shadow-lg"
                        >
                            <Send size={16} className="mr-2" /> {payrollDisputeSaving ? 'Filing...' : 'File Dispute'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function JobAuditCard({ item, isLocked, workOrders, reimbursements, canAddReimbursement, onConfirm, onDispute, onAddReimbursement, onDeleteReimbursement, canMove, onRequestMove, techId, onDisputeJob, hasOpenPayrollDispute }: { item: WeeklyLogItem, isLocked: boolean, workOrders: WorkOrder[], reimbursements: FinancialRecord[], canAddReimbursement: boolean, onConfirm: (id: string) => void, onDispute: (id: string, kind: DisputeKind, notes?: string) => void, onAddReimbursement: (item: WeeklyLogItem, data: { amount: number; description: string; note?: string; receiptUrl?: string }) => void, onDeleteReimbursement: (reimbId: string) => void, canMove?: boolean, onRequestMove?: () => void, techId: string | null, onDisputeJob?: (item: WeeklyLogItem) => void, hasOpenPayrollDispute?: boolean }) {
    const job = workOrders.find(wo => wo.id === item.workOrderId);
    const itemReimbursements = reimbursements.filter(r => r.workOrderId === item.workOrderId);
    const settledReimbursement = itemReimbursements
        .filter(r => r.status !== 'pending' && r.status !== 'rejected')
        .reduce((acc, r) => acc + netOfFieldNationFee(r.amount), 0);
    const requestedReimbursement = itemReimbursements
        .filter(r => r.status === 'pending')
        .reduce((acc, r) => acc + (r.amount || 0), 0);
    const [isDisputing, setIsDisputing] = useState(item.confirmationStatus === 'disputed' && !item.resolution);
    const [kind, setKind] = useState<string>(item.disputeKind || item.disputeReason ? disputeKindOf(item) : '');
    const [notes, setNotes] = useState(item.disputeNotes || "");
    const noteRequired = !!TECH_DISPUTE_OPTIONS.find(o => o.kind === kind)?.noteRequired;
    const decision = item.resolution && (item.disputeKind || item.disputeReason) ? decisionText(disputeKindOf(item), item.resolution) : null;
    const [isReimbursing, setIsReimbursing] = useState(false);
    const [reimbAmount, setReimbAmount] = useState('');
    const [reimbDesc, setReimbDesc] = useState('');
    const [reimbNote, setReimbNote] = useState('');
    const [reimbFile, setReimbFile] = useState<File | null>(null);
    const [reimbSaving, setReimbSaving] = useState(false);
    const { toast: reimbToast } = useToast();

    const submitReimbursement = async () => {
        if (!canAddReimbursement) {
            reimbToast({ variant: 'destructive', title: 'Not available', description: 'There is no open log to add this reimbursement to.' });
            return;
        }
        const amount = parseFloat(reimbAmount);
        if (!amount || amount <= 0 || !reimbDesc.trim()) {
            reimbToast({ variant: 'destructive', title: 'Missing info', description: 'Enter an amount and a description.' });
            return;
        }
        setReimbSaving(true);
        let receiptUrl: string | undefined;
        if (reimbFile && techId) {
            // Best-effort receipt upload; reimbursement still saves if it fails.
            try {
                const up = await uploadFile(`personnelDocuments/${techId}/reimbursement-${Date.now()}-${reimbFile.name}`, reimbFile, { contentType: reimbFile.type });
                receiptUrl = up.url;
            } catch { /* proceed without receipt */ }
        }
        await onAddReimbursement(item, { amount, description: reimbDesc.trim(), note: reimbNote.trim() || undefined, receiptUrl });
        setReimbSaving(false);
        setIsReimbursing(false);
        setReimbAmount(''); setReimbDesc(''); setReimbNote(''); setReimbFile(null);
    };

    const isConfirmed = item.confirmationStatus === 'confirmed';
    const isDisputed = item.confirmationStatus === 'disputed';
    const isPending = !item.confirmationStatus;

    // Every line on the tech's own log must be visible and confirmable, even
    // before (or without) its job record loading — fall back to the line itself.
    const shown = job || ({
        id: item.workOrderId, title: `Job ${item.workOrderId.toUpperCase()}`, description: '',
        scheduleDate: item.workDate || '', scheduleTime: '', location: '', clientName: '',
        pay: item.jobPay || 0, payType: 'fixed', status: 'completed', priority: 'medium', projectType: '',
    } as unknown as WorkOrder);

    return (
        <Card className={cn(
            "rounded-xl bg-bg-secondary border-border-main shadow-sm overflow-hidden transition-all text-left",
            isDisputed ? "border-brand-red shadow-[0_0_15px_color-mix(in_srgb,var(--brand-red)_5%,transparent)]" :
            isConfirmed ? "border-green-border bg-green-dim/5" : "hover:border-text-muted"
        )}>
            <CardContent className="p-0 text-left">
                <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6 text-left">
                    <div className="flex flex-wrap items-center gap-4 sm:gap-6 flex-1 min-w-0 text-left">
                        {/* Phones: the status badge says the same thing, so the icon gives its width to the title. */}
                        <div className={cn(
                            "hidden sm:flex h-10 w-10 rounded-xl border items-center justify-center shrink-0 shadow-inner",
                            isDisputed ? "bg-brand-red-dim text-text-red border-brand-red/30" : 
                            isConfirmed ? "bg-green-dim text-text-green border-green-border/30" : "bg-bg-tertiary border-border-sub text-text-muted"
                        )}>
                            {isDisputed ? <AlertTriangle size={20}/> : isConfirmed ? <CheckCircle2 size={20}/> : <Clock size={20}/>}
                        </div>
                        <div className="min-w-0 text-left flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-left">
                                <h3 className="text-[14px] font-semibold text-text-primary break-words text-left min-w-0">{shown.title || shown.description}</h3>
                                {item.isHelper && <Badge variant="outline" className="text-[10px] uppercase tracking-wide">Helper</Badge>}
                                {isConfirmed && <StatusBadge kind="log" value="approved" label="Confirmed" />}
                                {isDisputed && <StatusBadge kind="log" value="rejected" label="Disputed" />}
                                {hasOpenPayrollDispute && (
                                    <Badge variant="destructive" className="text-[10px] uppercase tracking-wide flex items-center gap-1">
                                        <AlertTriangle size={10} /> Under review
                                    </Badge>
                                )}
                                {settledReimbursement > 0 && (
                                    <Badge variant="active" className="text-[10px] uppercase tracking-wide flex items-center gap-1">
                                        <DollarSign size={10} /> Reimbursement · ${settledReimbursement.toFixed(2)}
                                    </Badge>
                                )}
                                {requestedReimbursement > 0 && (
                                    <Badge variant="pending" className="text-[10px] uppercase tracking-wide flex items-center gap-1">
                                        <DollarSign size={10} /> Requested · ${requestedReimbursement.toFixed(2)}
                                    </Badge>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1 text-[12px] text-text-muted text-left">
                                <span className="flex items-center gap-1.5 text-left"><MapPin size={12} className="text-brand-red shrink-0"/> {formatCityState(shown.location)}</span>
                                <span className="flex items-center gap-1.5 text-left"><CalendarIcon size={12} className="shrink-0"/> {shown.scheduleDate}{shown.scheduleTime ? ` · ${shown.scheduleTime}` : ''}</span>
                                <span className="id-text text-left">ASMT {shown.id.toUpperCase()}</span>
                                {isImported(shown) && externalWorkOrderId(shown) && (
                                    <a
                                        href={fieldNationUrl(shown)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={e => e.stopPropagation()}
                                        className="id-external hover:underline text-left"
                                        title="Open in Field Nation"
                                    >
                                        WO# {displayWorkOrderNumber(shown)} <ExternalLink size={9} className="shrink-0" />
                                    </a>
                                )}
                            </div>
                        </div>

                        <div className="text-right px-4 border-l border-border-sub/30 min-w-[100px]">
                            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider text-right">{isDisputed ? 'Excluded (disputed)' : 'Pay'}</p>
                            <p className="text-sm font-mono font-bold text-text-green text-right">${(isDisputed ? 0 : effectiveJobPay(item, shown)).toFixed(2)}</p>
                        </div>

                        {itemReimbursements.length > 0 && (
                            <div className="text-right px-4 border-l border-border-sub/30 min-w-[100px]">
                                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider text-right">Reimbursement</p>
                                <p className="text-sm font-mono font-bold text-accent-gold text-right">${settledReimbursement.toFixed(2)}</p>
                                <p className="text-[11px] text-text-muted text-right">
                                    {requestedReimbursement > 0 ? `$${requestedReimbursement.toFixed(2)} requested`
                                        : settledReimbursement > 0 ? 'Approved net of fee'
                                        : 'Rejected — excluded'}
                                </p>
                            </div>
                        )}
                    </div>

                    {!isLocked && (
                        <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
                        <div className="flex flex-wrap items-center gap-2">
                            {isPending ? (
                                <>
                                    <Button
                                        size="sm"
                                        className="h-10 sm:h-8 px-4 bg-text-green hover:bg-text-green/90 text-white"
                                        onClick={() => onConfirm(item.id)}
                                    >
                                        <Check size={14} className="mr-1.5"/> Confirm
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-10 sm:h-8 px-4 border-brand-red text-text-red hover:bg-brand-red-dim"
                                        onClick={() => setIsDisputing(true)}
                                    >
                                        <X size={14} className="mr-1.5"/> Dispute
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-10 sm:h-8 px-3 text-text-muted hover:text-text-primary"
                                    onClick={() => setIsDisputing(!isDisputing)}
                                >
                                    <RotateCcw size={14} className="mr-1.5"/> Change answer
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!canAddReimbursement}
                                title="Add reimbursement"
                                aria-label="Add reimbursement"
                                className="h-10 w-10 sm:h-8 sm:w-8 p-0 shrink-0 border-accent-gold/40 text-accent-gold hover:bg-accent-gold/10 disabled:opacity-40 disabled:cursor-not-allowed"
                                onClick={() => setIsReimbursing(v => !v)}
                            >
                                <DollarSign size={14}/>
                            </Button>
                            {canMove && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    title="Move to another log"
                                    aria-label="Move to another log"
                                    className="h-10 w-10 sm:h-8 sm:w-8 p-0 shrink-0 border-brand-blue/40 text-brand-blue hover:bg-brand-blue/10"
                                    onClick={onRequestMove}
                                >
                                    <ArrowLeftRight size={14}/>
                                </Button>
                            )}
                        </div>
                        </div>
                    )}

                    {isLocked && !isDisputed && !hasOpenPayrollDispute && onDisputeJob && (
                        <div className="shrink-0">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-10 sm:h-8 px-4 border-brand-red/40 text-text-red hover:bg-brand-red-dim"
                                onClick={() => onDisputeJob(item)}
                            >
                                <AlertTriangle size={14} className="mr-1.5"/> Dispute this job
                            </Button>
                        </div>
                    )}
                </div>

                {itemReimbursements.length > 0 && (
                    <div className="px-5 pb-4 -mt-1 text-left space-y-1.5">
                        {itemReimbursements.map(r => (
                            <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-bg-primary/40 border border-accent-gold/20 text-left">
                                <div className="min-w-0 text-left">
                                    <p className="text-[12px] font-medium text-text-primary truncate text-left">{r.description}</p>
                                    <p className="text-[11px] text-text-muted text-left">{r.date}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-xs font-mono font-bold text-accent-gold">${(r.status === 'pending' || r.status === 'rejected' ? r.amount || 0 : netOfFieldNationFee(r.amount)).toFixed(2)}</span>
                                    <StatusBadge
                                        kind="log"
                                        value={r.status === 'rejected' ? 'rejected' : r.status === 'pending' ? 'submitted' : 'approved'}
                                        label={r.status === 'pending' ? 'Requested' : r.status === 'rejected' ? 'Rejected' : 'Approved net'}
                                    />
                                    {!isLocked && (
                                        <button
                                            type="button"
                                            title="Remove reimbursement"
                                            onClick={() => onDeleteReimbursement(r.id)}
                                            aria-label="Remove reimbursement"
                                            className="flex h-10 w-10 sm:h-7 sm:w-7 items-center justify-center rounded-md text-text-muted hover:text-brand-red transition-colors"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {isReimbursing && !isLocked && canAddReimbursement && (
                    <div className="px-5 pb-5 pt-1 animate-in slide-in-from-top-2 duration-300 text-left">
                        <div className="p-4 rounded-xl bg-bg-primary/50 border border-accent-gold/30 space-y-3 text-left">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-semibold text-accent-gold uppercase tracking-wider">Add reimbursement · WO# {displayWorkOrderNumber(shown)}</p>
                                <button onClick={() => setIsReimbursing(false)} aria-label="Close" className="flex h-10 w-10 sm:h-7 sm:w-7 items-center justify-center text-text-muted hover:text-text-primary"><X size={16}/></button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Amount ($)</label>
                                    <Input type="number" min="0" step="0.01" value={reimbAmount} onChange={e => setReimbAmount(e.target.value)} placeholder="0.00" className="h-9 text-xs bg-bg-secondary border-border-main font-mono" />
                                </div>
                                <div className="space-y-1 sm:col-span-2">
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Description / Reason</label>
                                    <Input value={reimbDesc} onChange={e => setReimbDesc(e.target.value)} placeholder="e.g. Parking, materials, tolls" className="h-9 text-xs bg-bg-secondary border-border-main" />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Note (optional)</label>
                                <Input value={reimbNote} onChange={e => setReimbNote(e.target.value)} placeholder="Additional detail" className="h-9 text-xs bg-bg-secondary border-border-main" />
                            </div>
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-2 cursor-pointer">
                                    <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => setReimbFile(e.target.files?.[0] || null)} />
                                    <span className="px-3 py-1.5 rounded border border-border-main bg-bg-secondary hover:bg-bg-tertiary">{reimbFile ? reimbFile.name.slice(0, 24) : 'Attach receipt (optional)'}</span>
                                </label>
                                <Button size="sm" disabled={reimbSaving} onClick={submitReimbursement} className="h-10 sm:h-9 px-6 bg-accent-gold hover:bg-accent-gold/90 text-black">
                                    {reimbSaving ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Check size={13} className="mr-1.5" />}Submit for review
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {isDisputing && !isLocked && (
                    <div className="px-5 pb-5 pt-1 animate-in slide-in-from-top-2 duration-300 text-left">
                        <div className="p-4 rounded-xl bg-bg-primary/50 border border-border-sub space-y-5 text-left">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-semibold text-brand-red uppercase tracking-wider text-left">Why are you disputing this job?</p>
                                <button onClick={() => setIsDisputing(false)} aria-label="Close" className="flex h-10 w-10 sm:h-7 sm:w-7 items-center justify-center text-text-muted hover:text-text-primary"><X size={16}/></button>
                            </div>
                            
                            <div className="space-y-4 text-left">
                                <RadioGroup 
                                    value={kind} 
                                    onValueChange={setKind}
                                    className="grid grid-cols-1 md:grid-cols-3 gap-2 text-left"
                                >
                                    {TECH_DISPUTE_OPTIONS.map(o => (
                                        <div key={o.kind} className="flex items-center space-x-2 p-2 rounded hover:bg-bg-tertiary transition-colors cursor-pointer text-left">
                                            <RadioGroupItem value={o.kind} id={`r-${item.id}-${o.kind}`} />
                                            <Label htmlFor={`r-${item.id}-${o.kind}`} className="text-[13px] font-medium text-text-primary cursor-pointer flex-1 text-left">{o.label}</Label>
                                        </div>
                                    ))}
                                </RadioGroup>
                                <p className="text-[12px] text-text-muted text-left">Job missing from your log? Use <span className="font-semibold text-text-primary">Report missing job</span> instead.</p>

                                <div className="space-y-2 text-left">
                                    <Label className="text-[12px] font-semibold text-text-muted ml-1 text-left">{noteRequired ? 'What is wrong? (required)' : 'More detail (optional)'}</Label>
                                    <Textarea
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        placeholder={noteRequired ? "e.g. Pay should be $150, or this was on Oct 14" : "Add any details for payroll..."}
                                        className="bg-bg-secondary h-20 text-xs font-medium leading-relaxed text-left"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="outline" size="sm" className="h-10 sm:h-8" onClick={() => setIsDisputing(false)}>Cancel</Button>
                                <Button 
                                    size="sm" 
                                    className="h-10 sm:h-8 bg-brand-red hover:bg-brand-red-hover text-white"
                                    disabled={!kind || (noteRequired && !notes.trim())}
                                    onClick={() => { onDispute(item.id, kind as DisputeKind, notes); setIsDisputing(false); }}
                                >
                                    Save dispute
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {isDisputed && (isLocked || !isDisputing) && (
                    <div className="px-4 pb-4 animate-in fade-in duration-300 text-left">
                         <div className="p-3 rounded-lg bg-brand-red-dim/10 border border-brand-red/10 text-left">
                            <p className="text-[12px] font-semibold text-brand-red mb-1 flex items-center gap-1.5 text-left">
                                <ShieldAlert size={12}/> Disputed: {isLegacyOtherReason(item) ? item.disputeReason : DISPUTE_CARDS[disputeKindOf(item)].title}
                            </p>
                            {item.disputeNotes && (
                                <p className="text-[12px] text-text-secondary leading-relaxed text-left">
                                    &quot;{item.disputeNotes}&quot;
                                </p>
                            )}
                            <p className="text-[11px] text-text-muted mt-1 text-left">Waiting for payroll to decide. Not paid until then.</p>
                        </div>
                    </div>
                )}

                {decision && <PayrollDecisionLine text={decision} resolution={item.resolution!} />}
            </CardContent>
        </Card>
    );
}

/** Payroll's answer to a flagged job, as the tech sees it on their log. */
function PayrollDecisionLine({ text, resolution }: { text: string; resolution: DisputeResolution }) {
    return (
        <div className="px-4 pb-4 text-left">
            <div className={cn(
                "p-3 rounded-lg border text-left",
                resolution.decision === 'yes' ? "bg-green-dim/20 border-green-border/40" : "bg-bg-tertiary/40 border-border-sub"
            )}>
                <p className="text-[12px] font-semibold text-text-primary break-words text-left">{text}</p>
                <p className="text-[11px] text-text-muted mt-0.5 text-left">
                    {resolution.by}{resolution.at ? ` · ${new Date(resolution.at).toLocaleDateString()}` : ''}
                </p>
            </div>
        </div>
    );
}

function ReportMissingJobDialog({ isOpen, setIsOpen, onSave }: { isOpen: boolean, setIsOpen: (val: boolean) => void, onSave: (report: MissingAssignmentReport) => void }) {
    const [jobType, setJobType] = useState<'Manual' | 'Imported'>('Imported');

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const payRaw = parseFloat(formData.get('pay') as string);
        onSave({
            id: await createDocId(ID_PREFIXES.MISSING_REPORT),
            // No assignment number here — it is auto-generated when payroll
            // authorizes the missing job as a real assignment.
            clientName: formData.get('clientName') as string,
            date: formData.get('date') as string,
            time: formData.get('time') as string,
            location: formData.get('location') as string,
            summary: formData.get('summary') as string,
            jobType,
            externalWorkOrderId: jobType === 'Imported' ? ((formData.get('externalWorkOrderId') as string) || '').trim() : undefined,
            pay: isNaN(payRaw) ? undefined : payRaw,
        });
        setJobType('Imported');
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[600px] bg-bg-elevated border-border-default shadow-2xl">
                <DialogHeader className="text-left">
                    <div className="flex items-center gap-2 mb-1 text-left">
                        <Search className="text-brand-red h-5 w-5" />
                        <DialogTitle className="text-lg font-semibold text-text-primary text-left">Report a missing job</DialogTitle>
                    </div>
                    <DialogDescription className="text-[12px] text-text-muted text-left">Tell payroll about a job that&apos;s missing from this weekly log.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSave} className="space-y-4 py-4 text-left">
                    {/* Job type — decides how payroll settles it. */}
                    <div className="space-y-2 text-left">
                        <Label className="text-[12px] font-semibold text-text-muted">Job type</Label>
                        <div className="grid grid-cols-2 gap-2">
                            {(['Imported', 'Manual'] as const).map(t => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setJobType(t)}
                                    className={cn(
                                        "h-10 rounded-md border text-[13px] font-medium transition-colors",
                                        jobType === t ? "border-brand-red bg-brand-red/10 text-brand-red" : "border-border-sub bg-bg-primary text-text-muted hover:text-text-primary"
                                    )}
                                >
                                    {t === 'Imported' ? 'Imported (Field Nation)' : 'Manual'}
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] text-text-muted normal-case tracking-normal">
                            {jobType === 'Imported'
                                ? 'Enter the Field Nation work order number so payroll can open the FN link and run the pay calculator.'
                                : 'Manual jobs use a flat pay you enter below; payroll verifies it.'}
                        </p>
                    </div>
                    <div className="space-y-2 text-left">
                        <Label className="text-[12px] font-semibold text-text-muted">Client</Label>
                        <Input name="clientName" className="bg-bg-primary h-10 text-xs font-bold" />
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-left">
                        {jobType === 'Imported' && (
                            <div className="space-y-2 text-left">
                                <Label className="text-[12px] font-semibold text-text-muted">Field Nation WO #</Label>
                                <Input name="externalWorkOrderId" required placeholder="e.g. 18927456" className="bg-bg-primary h-10 text-xs font-bold" />
                            </div>
                        )}
                        <div className="space-y-2 text-left">
                            <Label className="text-[12px] font-semibold text-text-muted">{jobType === 'Imported' ? 'Job pay (optional)' : 'Job pay'}</Label>
                            <Input name="pay" type="number" step="0.01" required={jobType === 'Manual'} placeholder="0.00" className="bg-bg-primary h-10 text-xs font-mono" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-left">
                        <div className="space-y-2 text-left">
                            <Label className="text-[12px] font-semibold text-text-muted">Work date</Label>
                            <Input name="date" type="date" required className="bg-bg-primary h-10 text-xs" />
                        </div>
                        <div className="space-y-2 text-left">
                            <Label className="text-[12px] font-semibold text-text-muted">Location</Label>
                            <AddressAutocompleteInput name="location" required className="bg-bg-primary h-10 text-xs" />
                        </div>
                    </div>
                    <div className="space-y-2 text-left">
                        <Label className="text-[12px] font-semibold text-text-muted">Summary</Label>
                        <Textarea name="summary" required className="bg-bg-primary min-h-[120px] text-xs leading-relaxed font-medium text-left" placeholder="What job was it and what did you do on site?" />
                    </div>
                    <DialogFooter className="pt-4 border-t border-border-sub flex-row gap-3">
                        <Button variant="outline" type="button" onClick={() => setIsOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-wider">Cancel</Button>
                        <Button type="submit" className="flex-1 bg-brand-red hover:bg-brand-red-hover h-11 uppercase font-bold text-[10px] tracking-wider text-white shadow-lg">
                            <Send size={14} className="mr-2" /> Send report
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ── Tech Mileage / Trip Logs ────────────────────────────────────────────────
function tripStatusLabel(t: TripLog): { label: string; cls: string } {
    const miles = t.miles || t.calculatedMiles || t.manualMiles || 0;
    if (t.source && t.source !== 'manual' && !t.endTime) return { label: 'Missing checkout', cls: 'text-accent-gold border-accent-gold/30 bg-accent-gold/10' };
    if (!miles) return { label: 'Missing mileage', cls: 'text-accent-gold border-accent-gold/30 bg-accent-gold/10' };
    if (!t.startLocation || !t.endLocation) return { label: 'Needs review', cls: 'text-accent-gold border-accent-gold/30 bg-accent-gold/10' };
    return { label: 'Recorded', cls: 'text-text-green border-green-border/30 bg-green-dim/10' };
}

const TRIP_SOURCE_LABEL: Record<string, string> = {
    manual: 'Manual',
    start_trip: 'Start trip',
    check_in_flow: 'Check-in',
};

function TripLogsView({ tripLogs, workOrders, mileageUnit }: { tripLogs: TripLog[]; workOrders: WorkOrder[]; mileageUnit: 'mi' | 'km' }) {
    const sorted = [...tripLogs].sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''));
    const totalMiles = sorted.reduce((acc, t) => acc + (t.miles || t.calculatedMiles || t.manualMiles || 0), 0);

    if (sorted.length === 0) {
        return (
            <EmptyState icon={Car} title="No trips recorded yet" description="Trips you add from a job show up here for year-end mileage." />
        );
    }

    return (
        <div className="space-y-4 max-w-5xl">
            <div className="flex items-center gap-4 p-3 rounded-xl bg-bg-secondary border border-border-main shadow-sm w-max">
                <div>
                    <p className="stat-label">Total trips</p>
                    <p className="text-lg font-mono font-bold text-text-primary leading-none">{sorted.length}</p>
                </div>
                <div className="border-l border-border-sub pl-4">
                    <p className="stat-label">Total {mileageUnit === 'km' ? 'kilometers' : 'miles'}</p>
                    <p className="text-lg font-mono font-bold text-text-green leading-none">{formatDistance(totalMiles, mileageUnit)}</p>
                </div>
            </div>

            <div className="rounded-xl border border-border-main bg-bg-secondary shadow-sm overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-bg-tertiary/50 border-b border-border-sub">
                            {['Date', 'Work order', 'Job / site', 'Route', 'Time', mileageUnit === 'km' ? 'KM' : 'Miles', 'Source', 'Status'].map(h => (
                                <th key={h} className="table-header px-3 py-2 whitespace-nowrap">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map(t => {
                            const job = workOrders.find(w => w.id === t.workOrderId || w.id === t.assignmentId);
                            const woNum = t.externalWorkOrderId
                                ? t.externalWorkOrderId.toUpperCase()
                                : job ? displayWorkOrderNumber(job) : (t.workOrderId ? t.workOrderId.toUpperCase() : '—');
                            const miles = t.miles || t.calculatedMiles || t.manualMiles || 0;
                            const st = tripStatusLabel(t);
                            return (
                                <tr key={t.id} className="border-b border-border-sub last:border-0 hover:bg-bg-tertiary/30 transition-colors">
                                    <td className="px-3 py-2.5 text-[12px] text-text-secondary whitespace-nowrap">{t.date || '—'}</td>
                                    <td className="px-3 py-2.5 id-text whitespace-nowrap">{woNum}</td>
                                    <td className="px-3 py-2.5 text-[12px] text-text-primary max-w-[200px] truncate">{t.jobTitle || job?.title || job?.description || t.purpose || '—'}</td>
                                    <td className="px-3 py-2.5 text-[12px] text-text-muted max-w-[220px] truncate">{[t.startLocation, t.endLocation].filter(Boolean).join(' → ') || '—'}</td>
                                    <td className="px-3 py-2.5 text-[12px] text-text-muted whitespace-nowrap">{[t.startTime, t.endTime].filter(Boolean).join(' – ') || '—'}</td>
                                    <td className="px-3 py-2.5 text-[12px] font-mono font-semibold text-text-primary whitespace-nowrap">{miles ? formatDistance(miles, mileageUnit) : '—'}</td>
                                    <td className="px-3 py-2.5 text-[12px] text-text-muted whitespace-nowrap">{TRIP_SOURCE_LABEL[t.source || 'manual'] || 'Manual'}</td>
                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                        <span className={cn('inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border', st.cls)}>{st.label}</span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
