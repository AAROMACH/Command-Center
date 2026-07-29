'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { WeeklyLog, WeeklyLogItem, WorkOrder, MissingAssignmentReport, Technician, FinancialRecord, TripLog } from '@/lib/types';
import { externalWorkOrderId, displayWorkOrderNumber, fieldNationUrl, isImported } from '@/lib/work-order-identity';
import { hasPermission } from '@/lib/permissions';
import { netOfFieldNationFee } from '@/lib/payroll';
import { jobTechId } from '@/lib/jobs';
import { fileCompletedAssignment } from '@/lib/weekly-log';
import { uploadFile } from '@/lib/upload';
import { technicians } from '@/lib/data';
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
import { format, parseISO, isSameDay, startOfDay, startOfWeek, isWithinInterval } from 'date-fns';
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

const DISPUTE_REASONS = [
    "Hours logged are incorrect",
    "Another tech did this job",
    "I did not do this job",
    "Revisit needed — not complete",
    "Wrong date on my log",
    "Duplicate entry",
    "Other",
];

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
    // Jobs this tech assisted on as a helper (lead tech owns the primary entry).
    const [helperJobs, setHelperJobs] = useState<WorkOrder[]>([]);
    const helperFilingRef = useRef<Set<string>>(new Set());
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
    // so this simple popup files a payrollDisputes ticket instead.
    const [isPayrollDisputeOpen, setIsPayrollDisputeOpen] = useState(false);
    const [payrollDisputeReason, setPayrollDisputeReason] = useState<'incorrect_pay' | 'missing_reimbursement' | 'missing_job' | ''>('');
    const [payrollDisputeWorkOrderId, setPayrollDisputeWorkOrderId] = useState<string>('');
    const [payrollDisputeNotes, setPayrollDisputeNotes] = useState('');
    const [payrollDisputeSaving, setPayrollDisputeSaving] = useState(false);
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
            // Jobs where this tech is a helper (additionalTechnicianIds). Guarded:
            // if the Firestore rule for helper reads isn't deployed yet, the error
            // handler simply leaves the helper list empty instead of breaking.
            const unsubHelper = onSnapshot(
                query(collection(db, 'assignments'), where('additionalTechnicianIds', 'array-contains', userId)),
                (snap) => setHelperJobs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder))),
                () => setHelperJobs([]),
            );
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
            return () => {
                unsubLogs(); unsubWO(); unsubHelper(); unsubTrips(); unsubProfile();
            };
        }
    }, []);

    // 1b. Fan a completed job the tech HELPED on into their own weekly log, so
    // it shows on the helper's log (and reaches payroll) alongside the lead's
    // entry. Deduped by work order across all the tech's logs; jobPay starts at
    // $0 for payroll to price the helper separately. Idempotent — a ref guards
    // the window before the new item appears in the logs snapshot.
    useEffect(() => {
        if (!currentTechId || helperJobs.length === 0) return;
        const existingWoIds = new Set<string>();
        weeklyLogs.forEach(l => (l.items || []).forEach(i => existingWoIds.add(i.workOrderId)));
        const toFile = helperJobs.filter(j =>
            j.status === 'completed' &&
            !existingWoIds.has(j.id) &&
            !helperFilingRef.current.has(j.id)
        );
        toFile.forEach(async (j) => {
            helperFilingRef.current.add(j.id);
            try {
                const itemId = await createDocId(ID_PREFIXES.WEEKLY_LOG_ITEM);
                const item: WeeklyLogItem = {
                    id: itemId,
                    workOrderId: j.id,
                    jobPay: 0,
                    outcomeCode: null,
                    isComplete: true,
                    isAdminReviewed: false,
                    isHelper: true,
                    helperLeadTechId: jobTechId(j) || '',
                    workDate: j.scheduleDate,
                };
                await fileCompletedAssignment({
                    techId: currentTechId,
                    scheduleDate: j.scheduleDate,
                    item,
                    makeLogId: () => createDocId(ID_PREFIXES.WEEKLY_LOG),
                });
            } catch {
                helperFilingRef.current.delete(j.id); // allow a retry next snapshot
            }
        });
    }, [helperJobs, weeklyLogs, currentTechId]);

    // 2. Active Log Resolution (Reactive)
    const activeLog = useMemo(() => {
        if (!selectedLogId) return null;
        return weeklyLogs.find(l => l.id === selectedLogId) || null;
    }, [weeklyLogs, selectedLogId]);

    // Lead + helper jobs merged, so a helper log item can resolve its work-order
    // details (number, date, Field Nation link) for display.
    const allJobs = useMemo(() => [...workOrders, ...helperJobs], [workOrders, helperJobs]);

    /**
     * Submission Window Validator.
     * Current week: only Saturday (6) and Sunday (0).
     * Past weeks: always allowed (catch-up submissions).
     */
    const canSubmitActiveLog = useMemo(() => {
        if (!activeLog?.weekOf) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dow = today.getDay();
        const daysToMonday = dow === 0 ? 6 : dow - 1;
        const thisWeekMonday = new Date(today);
        thisWeekMonday.setDate(today.getDate() - daysToMonday);

        // Parse weekOf as MM-DD-YYYY
        const parts = activeLog.weekOf.split('-').map(Number);
        let logMonday: Date;
        if (parts[2] > 1000) {
            logMonday = new Date(parts[2], parts[0] - 1, parts[1]);
        } else {
            logMonday = new Date(activeLog.weekOf);
        }
        logMonday.setHours(0, 0, 0, 0);

        const isPastWeek = logMonday.getTime() < thisWeekMonday.getTime();
        const isCurrentWeek = logMonday.getTime() === thisWeekMonday.getTime();
        const isWeekend = dow === 0 || dow === 6;

        return isPastWeek || (isCurrentWeek && isWeekend);
    }, [activeLog?.weekOf]);

    // Reimbursements can be added any time the log is still in Draft — no
    // day/time-of-week window (previously Friday 6PM ET through the weekend).
    const canAddReimbursement = useMemo(() => !!activeLog?.weekOf, [activeLog?.weekOf]);

    // 3. Registry Filtering & Sorting
    const filteredAndSortedLogs = useMemo(() => {
        let filtered = weeklyLogs;
        
        if (statusFilter !== 'all') {
            filtered = filtered.filter(l => l.status === statusFilter);
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(l => (l.weekOf || '').includes(q));
        }

        if (dateRange?.from) {
            filtered = filtered.filter(log => {
                try {
                    const parts = log.weekOf.split('-');
                    let logDate;
                    if (parts[2]?.length === 4) { 
                        logDate = startOfDay(new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1])));
                    } else { 
                        logDate = startOfDay(parseISO(log.weekOf));
                    }
                    const start = startOfDay(dateRange.from!);
                    const end = dateRange.to ? startOfDay(dateRange.to) : start;
                    return isWithinInterval(logDate, { start, end });
                } catch(e) { return true; }
            });
        }

        return filtered.sort((a, b) => {
            if (sortBy === 'newest') return (b.weekOf || '').localeCompare(a.weekOf || '');
            if (sortBy === 'oldest') return (a.weekOf || '').localeCompare(b.weekOf || '');
            if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '');
            if (sortBy === 'billing') return (b.totalPayout || 0) - (a.totalPayout || 0);
            return 0;
        });
    }, [weeklyLogs, searchQuery, sortBy, statusFilter, dateRange]);

    const isLocked = useMemo(() => activeLog?.status !== 'Draft', [activeLog?.status]);

    const handleCreateLog = async () => {
        if (!newLogDate || !currentTechId) return;
        
        const monday = startOfWeek(newLogDate, { weekStartsOn: 1 });
        const weekOf = format(monday, 'MM-dd-yyyy');
        
        if (weeklyLogs.some(l => l.weekOf === weekOf)) {
            toast({ variant: 'destructive', title: 'Registry Error', description: `A log for the week of ${weekOf} already exists.` });
            return;
        }

        const newLog: Omit<WeeklyLog, 'id'> = {
            techId: currentTechId,
            weekOf,
            status: 'Draft',
            items: [],
            reimbursements: [],
            totalPayout: 0
        };

        try {
            const logId = await createDocId(ID_PREFIXES.WEEKLY_LOG);
            await setDoc(doc(db, 'weeklyLogs', logId), { ...newLog, id: logId });
            toast({ title: "Log Initialized", description: `Weekly manifest for ${weekOf} has been created.` });
            setIsCreateLogOpen(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Write Failed', description: e.message });
        }
    };

    const handleConfirm = async (itemId: string) => {
        if (!activeLog || isLocked) return;
        
        const updatedItems = (activeLog.items || []).map(item => 
            item.id === itemId 
                ? { 
                    ...item, 
                    confirmationStatus: 'confirmed' as const, 
                    outcomeCode: 'worked_completed' as const, 
                    disputeReason: null, 
                    disputeNotes: null 
                  } 
                : item
        );

        try {
            await updateDoc(doc(db, 'weeklyLogs', activeLog.id), { items: updatedItems });
            toast({ title: "Assignment Verified", description: "Confirmation committed to cloud manifest." });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Handshake Failed", description: e.message });
        }
    };

    const handleDispute = async (itemId: string, reason: string, notes?: string) => {
        if (!activeLog || isLocked) return;
        
        const updatedItems = (activeLog.items || []).map(item => 
            item.id === itemId 
                ? { 
                    ...item, 
                    confirmationStatus: 'disputed' as const, 
                    outcomeCode: 'worked_revisit' as const, 
                    disputeReason: reason, 
                    disputeNotes: notes || null 
                  } 
                : item
        );

        try {
            await updateDoc(doc(db, 'weeklyLogs', activeLog.id), { items: updatedItems });
            toast({ title: "Discrepancy Logged", description: "Dispute parameters committed to audit folder." });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Logging Failed", description: e.message });
        }
    };

    const handleAddReimbursement = async (
        item: WeeklyLogItem,
        data: { amount: number; description: string; note?: string; receiptUrl?: string },
    ) => {
        if (!activeLog || isLocked) return;
        const job = workOrders.find(wo => wo.id === item.workOrderId);
        const record: FinancialRecord = {
            id: `reimb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            techId: activeLog.techId,
            date: new Date().toISOString().split('T')[0],
            type: 'reimbursement',
            amount: data.amount,
            description: data.note ? `${data.description} — ${data.note}` : data.description,
            workOrderId: item.workOrderId,
            assignmentId: (job as any)?.assignmentId || item.workOrderId,
            externalWorkOrderId: job ? externalWorkOrderId(job) : undefined,
            status: 'pending',
            receiptUrl: data.receiptUrl,
            createdAt: new Date().toISOString(),
        };
        const updated = [...(activeLog.reimbursements || []), sanitize(record)];
        try {
            await updateDoc(doc(db, 'weeklyLogs', activeLog.id), { reimbursements: updated });
            toast({ title: 'Reimbursement Added', description: 'Pending payroll review — it will appear in the pay calculator.' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Failed', description: e.message });
        }
    };

    const handleDeleteReimbursement = async (reimbId: string) => {
        if (!activeLog || isLocked) return;
        const updated = (activeLog.reimbursements || []).filter(r => r.id !== reimbId);
        try {
            await updateDoc(doc(db, 'weeklyLogs', activeLog.id), { reimbursements: updated });
            toast({ title: 'Reimbursement Removed' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Failed', description: e.message });
        }
    };

    const handleReportMissing = async (report: MissingAssignmentReport) => {
        if (!activeLog) return;
        try {
            // Strip undefined fields — Firestore rejects them inside array values.
            const updatedReports = [...(activeLog.missingAssignmentReports || []), sanitize(report)];
            await updateDoc(doc(db, 'weeklyLogs', activeLog.id), { missingAssignmentReports: updatedReports });
            toast({ title: "Discrepancy Transmitted", description: "Inquiry folder initialized for audit." });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Report Failed", description: e.message });
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
                techName: currentUser?.name || 'Field Operative',
                weeklyLogId: activeLog.id,
                weekOf: activeLog.weekOf,
                workOrderId: payrollDisputeWorkOrderId || null,
                reason: payrollDisputeReason,
                notes: payrollDisputeNotes.trim(),
                status: 'open',
                createdAt: new Date().toISOString(),
            });
            toast({ title: "Dispute Filed", description: "An admin will review this against your weekly log." });
            setIsPayrollDisputeOpen(false);
            setPayrollDisputeReason('');
            setPayrollDisputeWorkOrderId('');
            setPayrollDisputeNotes('');
        } catch (e: any) {
            toast({ variant: "destructive", title: "Could Not File Dispute", description: e.message });
        } finally {
            setPayrollDisputeSaving(false);
        }
    };

    const handleSubmit = async () => {
        if (!activeLog) return;

        if (!canSubmitActiveLog) {
            toast({
                variant: "destructive",
                title: "Submission Restricted",
                description: "Current-week logs can only be submitted on Saturday or Sunday. Past week logs can be submitted anytime.",
            });
            return;
        }
        
        // Reimbursements are paid net of the Field Nation fee (tech absorbs it).
        // Manually-added missing jobs also contribute (imported = labor finalPay
        // + reimb net of fee; manual = flat pay).
        const total = (activeLog.items || []).reduce((acc, i) => acc + (i.jobPay || 0), 0) +
                      (activeLog.reimbursements || []).reduce((acc, r) => acc + netOfFieldNationFee(r.amount), 0) +
                      (activeLog.missingAssignmentReports || []).reduce((acc, r) => acc + (r.jobType === 'Imported'
                          ? (r.finalPay || 0) + netOfFieldNationFee(r.auditReimbursement || 0)
                          : (r.pay || 0)), 0);

        try {
            await updateDoc(doc(db, 'weeklyLogs', activeLog.id), {
                status: 'Submitted',
                submittedAt: new Date().toISOString(),
                submittedBy: technicians.find(t => t.id === currentTechId)?.name || currentTechId || 'Tech',
                totalPayout: total
            });
            toast({
                title: "Log Submitted",
                description: "Weekly assignments manifest has been transmitted for audit.",
            });
            setSelectedLogId(null);
        } catch (e: any) {
            toast({ variant: "destructive", title: "Submission Failed", description: e.message });
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

    // Log total = job pay + counted (approved / legacy) reimbursements; mirrors
    // the payroll settlement so both logs stay correct after a move.
    const logTotal = (items?: WeeklyLogItem[], reimbs?: FinancialRecord[]) =>
        (items || []).reduce((a, i) => a + (i.jobPay || 0), 0)
        + (reimbs || []).filter(r => r.status !== 'pending' && r.status !== 'rejected').reduce((a, r) => a + netOfFieldNationFee(r.amount || 0), 0);

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
            toast({ variant: 'destructive', title: 'Already In That Log', description: 'This assignment already exists in the destination log.' });
            return;
        }
        const woId = moveItem.workOrderId;
        const srcItems = (activeLog.items || []).filter(i => i.id !== moveItem.id);
        const destItems = [...(dest.items || []), moveItem];
        const movingReimbs = (activeLog.reimbursements || []).filter(r => r.workOrderId === woId);
        const srcReimbs = (activeLog.reimbursements || []).filter(r => r.workOrderId !== woId);
        const destReimbs = [...(dest.reimbursements || []), ...movingReimbs];
        const stamp = (from: string, to: string) => ({ type: 'item_moved', workOrderId: woId, fromWeek: from, toWeek: to, by: currentTechId || '', at: new Date().toISOString() });
        try {
            await updateDoc(doc(db, 'weeklyLogs', activeLog.id), {
                items: srcItems, reimbursements: srcReimbs, totalPayout: logTotal(srcItems, srcReimbs),
                history: [...((activeLog as any).history || []), stamp(activeLog.weekOf, dest.weekOf)],
            });
            await updateDoc(doc(db, 'weeklyLogs', dest.id), {
                items: destItems, reimbursements: destReimbs, totalPayout: logTotal(destItems, destReimbs),
                history: [...((dest as any).history || []), stamp(activeLog.weekOf, dest.weekOf)],
            });
            toast({ title: 'Assignment Moved', description: `Moved to the week of ${dest.weekOf}.` });
            setMoveItem(null);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Move Failed', description: e.message });
        }
    };

    const handleDirectUnsubmit = async () => {
        if (!activeLog || !canUnsubmitOwnLog || !isUnsubmitEligible) return;
        try {
            const historyEntry = {
                type: 'unsubmit',
                by: currentUser?.name || currentTechId || 'Technician',
                byId: currentTechId || '',
                previousStatus: activeLog.status,
                newStatus: 'Draft',
                at: new Date().toISOString(),
            };
            await updateDoc(doc(db, 'weeklyLogs', activeLog.id), {
                status: 'Draft',
                unsubmitRequested: false,
                unsubmitReason: null,
                unsubmitRequestedAt: null,
                history: [...((activeLog as any).history || []), historyEntry],
            });
            toast({ title: 'Log Unsubmitted', description: 'Returned to Draft — assignments and entries are editable again.' });
            setIsDirectUnsubmitOpen(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Unsubmit Failed', description: e.message });
        }
    };

    const handleRequestUnsubmit = async () => {
        if (!activeLog || !unsubmitReason.trim()) return;
        try {
            await updateDoc(doc(db, 'weeklyLogs', activeLog.id), {
                unsubmitRequested: true,
                unsubmitReason: unsubmitReason.trim(),
                unsubmitRequestedAt: new Date().toISOString()
            });
            toast({
                title: "Unsubmit Requested",
                description: "Amendment request transmitted for administrative authorization.",
            });
            setIsUnsubmitDialogOpen(false);
            setUnsubmitReason("");
        } catch (e: any) {
            toast({ variant: "destructive", title: "Request Failed", description: e.message });
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
        <div className="flex items-center gap-1 rounded-lg border border-border-sub bg-bg-secondary p-1 w-max">
            <button type="button" onClick={() => setLogView('work')}
                className={cn('px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-colors', logView === 'work' ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-primary')}>
                <LayoutList size={11} className="inline mr-1.5" />Work Logs
            </button>
            <button type="button" onClick={() => setLogView('trips')}
                className={cn('px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-colors', logView === 'trips' ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-primary')}>
                <Car size={11} className="inline mr-1.5" />Mileage / Trips
            </button>
        </div>
    );

    if (logView === 'trips') {
        return (
            <div className="space-y-6 text-left">
                <header className="page-header text-left">
                    <div className="text-left">
                        <p className="page-eyebrow flex items-center gap-2"><Car size={12}/> Mileage Registry</p>
                        <h1 className="page-title text-left">Trip Logs</h1>
                        <p className="page-subtitle text-[11px] uppercase font-bold text-text-muted tracking-widest mt-1 text-left">Every trip you&apos;ve recorded — for reimbursement and year-end mileage review.</p>
                    </div>
                    <ViewTabs />
                </header>
                <TripLogsView tripLogs={tripLogs} workOrders={workOrders} mileageUnit={mileageUnit} />
            </div>
        );
    }

    if (!activeLog) {
        return (
            <div className="space-y-6 text-left">
                <header className="page-header text-left">
                    <div className="text-left">
                        <p className="page-eyebrow flex items-center gap-2"><LayoutList size={12}/> Billing Audit</p>
                        <h1 className="page-title text-left">Weekly Log Registry</h1>
                        <p className="page-subtitle text-[11px] uppercase font-bold text-text-muted tracking-widest mt-1 text-left">Audit terminal for assignment verification and billing.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <ViewTabs />
                        <Button onClick={() => setIsCreateLogOpen(true)} className="bg-brand-red hover:bg-brand-red-hover h-10 px-6 font-bold uppercase tracking-widest text-[10px]">
                            <Plus size={16} className="mr-2" /> Initialize New Log
                        </Button>
                    </div>
                </header>

                <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-bg-secondary border border-border-sub shadow-sm max-w-6xl mx-auto mb-6 text-left">
                    <div className="search-wrap flex-1 !mb-0 w-full md:w-auto text-left">
                        <Search className="h-4 w-4" />
                        <input 
                            placeholder="Filter by week period (MM-DD)..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="search-input !w-full !bg-bg-primary h-10 text-xs font-bold uppercase text-left"
                        />
                    </div>
                    
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[120px] h-10 bg-bg-primary text-[10px] uppercase font-bold tracking-widest border-border-main">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="text-[10px] uppercase font-bold">All Statuses</SelectItem>
                                <SelectItem value="Draft" className="text-[10px] uppercase font-bold">Drafts</SelectItem>
                                <SelectItem value="Submitted" className="text-[10px] uppercase font-bold">Submitted</SelectItem>
                                <SelectItem value="Approved" className="text-[10px] uppercase font-bold">Approved</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                            <SelectTrigger className="w-[140px] h-10 bg-bg-primary text-[10px] uppercase font-bold tracking-widest border-border-main">
                                <SelectValue placeholder="Sort" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="newest" className="text-[10px] uppercase font-bold">Newest First</SelectItem>
                                <SelectItem value="oldest" className="text-[10px] uppercase font-bold">Oldest First</SelectItem>
                                <SelectItem value="status" className="text-[10px] uppercase font-bold">By Status</SelectItem>
                                <SelectItem value="billing" className="text-[10px] uppercase font-bold">By Settlement</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 max-w-6xl mx-auto">
                    {(() => {
                        const draftLogs = filteredAndSortedLogs.filter(l => l.status === 'Draft');
                        const pastLogs = filteredAndSortedLogs.filter(l => l.status !== 'Draft');
                        const showDivider = statusFilter === 'all' && draftLogs.length > 0 && pastLogs.length > 0;
                        const renderCard = (log: WeeklyLog, logIdx: number) => (
                            <Card
                                key={log.id || `log-list-${logIdx}`}
                                className={cn(
                                    "bg-bg-secondary hover:border-brand-red transition-all cursor-pointer group",
                                    log.status === 'Draft' ? "border-accent-gold/30" :
                                    log.status === 'Approved' ? "border-green-border/30" :
                                    "border-border-sub"
                                )}
                                onClick={() => setSelectedLogId(log.id)}
                            >
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-4 text-left">
                                        <div className={cn(
                                            "p-2.5 rounded-xl border",
                                            log.status === 'Draft' ? "bg-accent-gold-dim border-accent-gold/30 text-accent-gold" :
                                            log.status === 'Approved' ? "bg-green-dim border-green-border/30 text-text-green" :
                                            "bg-bg-tertiary border-border-sub text-text-muted"
                                        )}>
                                            <CalendarIcon size={16} />
                                        </div>
                                        <div className="text-left">
                                            <div className="flex items-center gap-3">
                                                <p className="text-xs font-bold uppercase tracking-wide text-text-primary group-hover:text-brand-red transition-colors text-left">Week of {log.weekOf}</p>
                                                {log.unsubmitRequested && (
                                                    <Badge variant="destructive" className="h-4 px-1.5 text-[7px] uppercase animate-pulse">Unsubmit Pending</Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 mt-0.5 text-[9px] text-text-muted font-bold uppercase tracking-widest text-left">
                                                <span>{(log.items || []).length} Assignments</span>
                                                <div className="h-1 w-1 rounded-full bg-text-muted opacity-30" />
                                                <span className="text-text-green font-mono">${(log.totalPayout || 0).toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <Badge variant={log.status === 'Draft' ? 'onhold' : log.status === 'Approved' ? 'active' : 'pending'}>
                                            {(log.status || '').toUpperCase()}
                                        </Badge>
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
                                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-green flex items-center gap-1.5">
                                            <History size={10} /> Past Logs
                                        </p>
                                        <div className="flex-1 h-px bg-border-sub" />
                                    </div>
                                )}
                                {pastLogs.map((log, i) => renderCard(log, draftLogs.length + i))}
                            </>
                        );
                    })()}
                    {filteredAndSortedLogs.length === 0 && (
                        <div className="py-24 text-center border-2 border-dashed border-border-sub rounded-2xl opacity-40 bg-bg-secondary/30 text-left">
                            <LayoutList size={48} className="mx-auto text-text-muted mb-2" />
                            <p className="text-[10px] font-bold uppercase tracking-widest italic">Registry clear for these filters</p>
                        </div>
                    )}
                </div>

                <Dialog open={isCreateLogOpen} onOpenChange={setIsCreateLogOpen}>
                    <DialogContent className="sm:max-w-[400px] bg-bg-elevated border-border-default shadow-2xl">
                        <DialogHeader className="text-left">
                            <DialogTitle className="uppercase tracking-widest font-bold">Initialize Weekly Log</DialogTitle>
                            <DialogDescription className="text-xs text-left">Pick a date within the target week. Registry will anchor to that Monday.</DialogDescription>
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
                            <Button variant="outline" onClick={() => setIsCreateLogOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest h-11">Cancel</Button>
                            <Button onClick={handleCreateLog} className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest h-11 text-white">Initialize Manifest</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500 text-left">
            <header className="flex items-center gap-4 mb-4 text-left">
                <Button variant="ghost" size="sm" onClick={() => setSelectedLogId(null)} className="h-8 text-[10px] uppercase font-bold text-text-muted hover:text-text-primary text-left">
                    <ArrowLeft size={14} className="mr-2"/> Back to Registry
                </Button>
                <div className="h-4 w-px bg-border-sub" />
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest text-left">Auditing week of {activeLog.weekOf}</p>
            </header>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-bg-secondary p-6 rounded-2xl border border-border-sub shadow-2xl text-left">
                <div className="flex items-center gap-6 text-left">
                    <div className={cn(
                        "p-3 rounded-xl border",
                        activeLog.status === 'Draft' ? "bg-accent-gold-dim border-accent-gold/30 text-accent-gold" : "bg-green-dim border-green-border/30 text-text-green"
                    )}>
                        <ShieldAlert size={24} />
                    </div>
                    <div className="text-left">
                        <div className="flex items-center gap-3 text-left">
                            <h2 className="text-xl font-bold uppercase tracking-wider text-text-primary text-left">Operational Audit</h2>
                            <Badge variant={activeLog.status === 'Draft' ? 'onhold' : 'active'} className="h-5 uppercase text-[9px] tracking-widest">
                                {activeLog.status}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-left">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-green uppercase tracking-widest text-left">
                                <Check className="text-text-green h-3 w-3"/> {counts.confirmed} Confirmed
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-red uppercase tracking-widest text-left">
                                <X className="text-text-red h-3 w-3"/> {counts.disputed} Disputed
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-accent-gold uppercase tracking-widest text-left">
                                <Clock size={12} className="h-3 w-3"/> {counts.pending} Awaiting Action
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
                                    className="h-9 px-6 text-[10px] font-bold uppercase tracking-widest border-brand-red text-text-red hover:bg-brand-red-dim"
                                    onClick={() => setIsDirectUnsubmitOpen(true)}
                                >
                                    <Undo2 size={14} className="mr-2" /> Unsubmit Log
                                </Button>
                            ) : activeLog.unsubmitRequested ? (
                                <div className="flex items-center gap-2 p-2 rounded-lg bg-bg-tertiary border border-border-sub text-accent-gold">
                                    <AlertCircle size={14} className="animate-pulse" />
                                    <p className="text-[9px] font-black uppercase tracking-widest">Unsubmit Pending Approval</p>
                                </div>
                            ) : (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-9 px-6 text-[10px] font-bold uppercase tracking-widest border-brand-red text-text-red hover:bg-brand-red-dim"
                                    onClick={() => setIsUnsubmitDialogOpen(true)}
                                >
                                    <Undo2 size={14} className="mr-2" /> Request Unsubmit
                                </Button>
                            )}
                            <div className="text-right">
                                <p className="text-[10px] font-black text-text-green uppercase tracking-widest text-right">Registry Transmitted</p>
                                <p className="text-[9px] text-text-muted uppercase font-bold text-right">
                                  {activeLog.submittedAt
                                    ? `${format(parseISO(activeLog.submittedAt), 'MMM d, h:mm a')}${activeLog.submittedBy ? ` · ${activeLog.submittedBy}` : ''}`
                                    : 'N/A'}
                                </p>
                            </div>
                        </div>
                    ) : isLocked ? (
                        <div className="flex flex-col items-end text-right">
                            <p className="text-[10px] font-black text-text-green uppercase tracking-widest text-right">Terminal Locked</p>
                            <p className="text-[9px] text-text-muted uppercase font-bold text-right">
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
                                "h-12 px-10 font-bold uppercase text-[10px] tracking-[0.2em]",
                                canSubmit && canSubmitActiveLog ? "bg-brand-red hover:bg-brand-red-hover" : "bg-bg-tertiary text-text-muted border border-border-sub"
                            )}
                        >
                            <Send size={16} className="mr-2"/>
                            {canSubmitActiveLog ? "Finalize & Submit Manifest" : "Weekend Submission Only"}
                        </Button>
                    )}
                </div>
            </div>

            {/* UNSET REASONS WARNING */}
            {!isLocked && counts.pending > 0 && (
                <div className="max-w-6xl mx-auto p-4 rounded-xl border border-border-alert bg-brand-red-dim/5 flex items-start gap-4 shadow-sm animate-pulse text-left">
                    <ShieldAlert size={20} className="text-text-red shrink-0 mt-0.5" />
                    <div className="space-y-1 text-left">
                        <p className="text-[11px] font-bold text-text-red uppercase tracking-wide text-left">Registry Verification Required</p>
                        <p className="text-[10px] text-text-muted leading-relaxed uppercase text-left">
                            You must confirm or dispute the remaining <span className="text-text-red font-black">{counts.pending} assignments</span> before the manifest can be transmitted for billing.
                        </p>
                    </div>
                </div>
            )}

            {!isLocked && !canSubmitActiveLog && (
                <div className="max-w-6xl mx-auto p-4 rounded-xl border border-border-sub bg-bg-secondary flex items-start gap-4 shadow-sm text-left">
                    <Info size={20} className="text-accent-gold shrink-0 mt-0.5" />
                    <div className="space-y-1 text-left">
                        <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide text-left">Audit Manifest Preparation</p>
                        <p className="text-[10px] text-text-muted leading-relaxed uppercase font-medium text-left">
                            You can continue verifying missions and logging expenses throughout the week. Current-week log submission is authorized on <span className="text-brand-red font-bold">Saturday and Sunday</span>. Past week logs can be submitted anytime.
                        </p>
                    </div>
                </div>
            )}

            <div className="space-y-4 max-w-6xl mx-auto text-left">
                <div className="flex items-center justify-between border-b border-border-sub pb-2 px-1 text-left">
                    <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] text-left">Tactical Assignment Registry</h3>
                    {!isLocked ? (
                        <Button variant="ghost" size="sm" className="h-6 text-[9px] uppercase font-bold text-brand-red hover:bg-brand-red/10" onClick={() => setIsReportMissingOpen(true)}>
                            <Search size={12} className="mr-1.5"/> Report Missing Assignment
                        </Button>
                    ) : (
                        <Button variant="ghost" size="sm" className="h-6 text-[9px] uppercase font-bold text-brand-red hover:bg-brand-red/10" onClick={() => setIsPayrollDisputeOpen(true)}>
                            <AlertTriangle size={12} className="mr-1.5"/> Dispute This Log
                        </Button>
                    )}
                </div>
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
                        />
                    ))}
                    {(activeLog.items || []).length === 0 && (
                        <div className="py-24 text-center border-2 border-dashed border-border-sub rounded-2xl bg-bg-secondary/30 text-left">
                            <ActivityIcon size={48} className="mx-auto text-text-muted mb-2 opacity-20" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">No assignments synced to this weeklog</p>
                        </div>
                    )}
                    {/* Reported-missing jobs always trail the synced registry — they aren't
                        confirmed assignments yet, just a flag for payroll to investigate. */}
                    {(activeLog.missingAssignmentReports || []).map(report => (
                        <Card key={report.id} className="bg-bg-secondary border-accent-gold/30 border-dashed overflow-hidden text-left">
                            <CardContent className="p-4 flex items-center gap-6 text-left">
                                <div className="h-10 w-10 rounded-xl border border-accent-gold/30 bg-accent-gold/10 text-accent-gold flex items-center justify-center shrink-0 shadow-inner">
                                    <Search size={18}/>
                                </div>
                                <div className="min-w-0 text-left flex-1">
                                    <div className="flex flex-wrap items-center gap-2 text-left">
                                        <h4 className="text-sm font-bold text-text-primary uppercase tracking-wide truncate max-w-[420px] text-left">{report.summary || 'Missing Assignment'}</h4>
                                        <Badge variant="pending" className="text-[7px] h-3.5 uppercase tracking-tighter">Manually Added · Was Missing</Badge>
                                        {report.jobType && <Badge variant="outline" className="text-[7px] h-3.5 uppercase tracking-tighter">{report.jobType}</Badge>}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-0.5 text-[10px] text-text-muted font-bold uppercase tracking-widest text-left">
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
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {/* MOVE ASSIGNMENT TO ANOTHER ACTIVE LOG */}
            <Dialog open={!!moveItem} onOpenChange={v => { if (!v) setMoveItem(null); }}>
                <DialogContent className="sm:max-w-[460px] bg-bg-elevated border-border-default shadow-2xl">
                    <DialogHeader className="text-left">
                        <div className="flex items-center gap-2 mb-1">
                            <ArrowLeftRight className="text-blue-400 h-5 w-5" />
                            <DialogTitle className="text-base font-bold uppercase tracking-widest">Move to Another Log</DialogTitle>
                        </div>
                        <p className="text-[11px] text-text-muted leading-relaxed">
                            Moving from the week of <span className="text-text-primary font-bold">{activeLog?.weekOf}</span>. Choose a destination draft log — all notes, time, mileage, reimbursements, receipts, and payout stay with the assignment.
                        </p>
                    </DialogHeader>
                    <div className="space-y-2 max-h-[45vh] overflow-y-auto py-1">
                        {moveDestinations.length === 0 ? (
                            <div className="text-center py-6 space-y-1">
                                <p className="text-[11px] text-text-muted uppercase tracking-widest font-bold">No other draft logs</p>
                                <p className="text-[10px] text-text-muted/70 leading-relaxed px-4">You need a second draft weekly log to move this assignment into. Start a draft for another week first.</p>
                            </div>
                        ) : moveDestinations.map(l => (
                            <button
                                key={l.id}
                                onClick={() => handleMoveItem(l.id)}
                                className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-border-sub bg-bg-secondary hover:border-blue-400/50 hover:bg-blue-400/5 transition-colors text-left"
                            >
                                <div>
                                    <p className="text-[12px] font-bold text-text-primary">Week of {l.weekOf}</p>
                                    <p className="text-[9px] text-text-muted uppercase tracking-widest font-bold">{l.status} · {(l.items || []).length} assignment{(l.items || []).length !== 1 ? 's' : ''}</p>
                                </div>
                                <ArrowLeftRight size={14} className="text-blue-400 shrink-0" />
                            </button>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="h-9 text-[10px] font-bold uppercase tracking-widest" onClick={() => setMoveItem(null)}>Cancel</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* DIRECT UNSUBMIT CONFIRM (permission-gated) */}
            <Dialog open={isDirectUnsubmitOpen} onOpenChange={setIsDirectUnsubmitOpen}>
                <DialogContent className="sm:max-w-[440px] bg-bg-elevated border-border-default shadow-2xl">
                    <DialogHeader className="text-left">
                        <div className="flex items-center gap-2 mb-1">
                            <Undo2 className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-base font-bold uppercase tracking-widest">Unsubmit Weekly Log</DialogTitle>
                        </div>
                        <p className="text-[11px] text-text-muted leading-relaxed">
                            Unsubmitting this weekly log will return it to Draft status and allow its assignments and entries to be edited. Continue?
                        </p>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" className="h-9 text-[10px] font-bold uppercase tracking-widest" onClick={() => setIsDirectUnsubmitOpen(false)}>Cancel</Button>
                        <Button className="h-9 text-[10px] font-bold uppercase tracking-widest bg-brand-red hover:bg-brand-red-hover text-white" onClick={handleDirectUnsubmit}>
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
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest">Unsubmit Request Terminal</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs uppercase font-bold text-text-muted text-left">Request authorization to amend a previously submitted weekly manifest.</DialogDescription>
                    </DialogHeader>
                    <div className="p-6 space-y-4 text-left">
                        <div className="p-4 rounded-lg bg-bg-secondary border border-border-sub space-y-2 text-left">
                            <p className="text-[9px] font-black text-brand-red uppercase tracking-widest flex items-center gap-2 text-left">
                                <Info size={12}/> Amendment Policy
                            </p>
                            <p className="text-[10px] text-text-secondary leading-relaxed uppercase font-medium text-left">
                                Unsubmitting a log will pause any active billing audits for this week. You must provide a specific tactical reason for this amendment request.
                            </p>
                        </div>
                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] uppercase font-bold text-text-muted ml-1 flex items-center gap-1.5">
                                <MessageSquare size={12} /> Amendment Justification
                            </Label>
                            <Textarea 
                                placeholder="e.g., Added missing materials reimbursement, need to dispute WO-18927..." 
                                value={unsubmitReason}
                                onChange={e => setUnsubmitReason(e.target.value)}
                                className="bg-bg-primary border-border-sub min-h-[120px] text-xs leading-relaxed uppercase font-medium"
                            />
                        </div>
                    </div>
                    <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default flex gap-3">
                        <Button variant="outline" onClick={() => setIsUnsubmitDialogOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest h-11">Abort</Button>
                        <Button 
                            disabled={!unsubmitReason.trim()}
                            onClick={handleRequestUnsubmit} 
                            className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest h-11 text-white shadow-lg"
                        >
                            <Send size={16} className="mr-2" /> Transmit Request
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
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary text-left">Dispute This Log</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs uppercase font-bold text-text-muted text-left">
                            This log has already been submitted. Flag an issue for admin review.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2 text-left">
                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] uppercase font-bold text-text-muted">Reason</Label>
                            <RadioGroup value={payrollDisputeReason} onValueChange={(v: any) => setPayrollDisputeReason(v)} className="space-y-2">
                                {[
                                    { value: 'incorrect_pay', label: 'Incorrect Pay' },
                                    { value: 'missing_reimbursement', label: 'Missing Reimbursement' },
                                    { value: 'missing_job', label: 'Missing Job' },
                                ].map(r => (
                                    <div key={r.value} className="flex items-center space-x-2 p-2 rounded hover:bg-bg-tertiary transition-colors cursor-pointer text-left">
                                        <RadioGroupItem value={r.value} id={`pap-${r.value}`} />
                                        <Label htmlFor={`pap-${r.value}`} className="text-[10px] uppercase font-bold text-text-primary cursor-pointer flex-1 text-left">{r.label}</Label>
                                    </div>
                                ))}
                            </RadioGroup>
                        </div>

                        {(payrollDisputeReason === 'incorrect_pay' || payrollDisputeReason === 'missing_reimbursement') && (activeLog?.items?.length ?? 0) > 0 && (
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Which Job? (Optional)</Label>
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
                            <Label className="text-[10px] uppercase font-bold text-text-muted">Details</Label>
                            <Textarea
                                value={payrollDisputeNotes}
                                onChange={e => setPayrollDisputeNotes(e.target.value)}
                                placeholder="Describe the issue..."
                                className="bg-bg-secondary h-24 text-xs font-medium leading-relaxed text-left"
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-3 flex-row">
                        <Button variant="outline" onClick={() => setIsPayrollDisputeOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest h-11">Cancel</Button>
                        <Button
                            disabled={!payrollDisputeReason || !payrollDisputeNotes.trim() || payrollDisputeSaving}
                            onClick={handleSubmitPayrollDispute}
                            className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest h-11 text-white shadow-lg"
                        >
                            <Send size={16} className="mr-2" /> {payrollDisputeSaving ? 'Filing...' : 'File Dispute'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function JobAuditCard({ item, isLocked, workOrders, reimbursements, canAddReimbursement, onConfirm, onDispute, onAddReimbursement, onDeleteReimbursement, canMove, onRequestMove, techId }: { item: WeeklyLogItem, isLocked: boolean, workOrders: WorkOrder[], reimbursements: FinancialRecord[], canAddReimbursement: boolean, onConfirm: (id: string) => void, onDispute: (id: string, reason: string, notes?: string) => void, onAddReimbursement: (item: WeeklyLogItem, data: { amount: number; description: string; note?: string; receiptUrl?: string }) => void, onDeleteReimbursement: (reimbId: string) => void, canMove?: boolean, onRequestMove?: () => void, techId: string | null }) {
    const job = workOrders.find(wo => wo.id === item.workOrderId);
    const itemReimbursements = reimbursements.filter(r => r.workOrderId === item.workOrderId);
    const totalReimbursed = itemReimbursements.reduce((acc, r) => acc + (r.amount || 0), 0);
    const [isDisputing, setIsDisputing] = useState(item.confirmationStatus === 'disputed');
    const [reason, setReason] = useState(item.disputeReason || "");
    const [notes, setNotes] = useState(item.disputeNotes || "");
    const [isReimbursing, setIsReimbursing] = useState(false);
    const [reimbAmount, setReimbAmount] = useState('');
    const [reimbDesc, setReimbDesc] = useState('');
    const [reimbNote, setReimbNote] = useState('');
    const [reimbFile, setReimbFile] = useState<File | null>(null);
    const [reimbSaving, setReimbSaving] = useState(false);
    const { toast: reimbToast } = useToast();

    const submitReimbursement = async () => {
        if (!canAddReimbursement) {
            reimbToast({ variant: 'destructive', title: 'Not Available', description: 'No active log to attach this reimbursement to.' });
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

    if (!job) return null;

    return (
        <Card className={cn(
            "bg-bg-secondary border-border-main overflow-hidden transition-all text-left",
            isDisputed ? "border-brand-red shadow-[0_0_15px_color-mix(in_srgb,var(--brand-red)_5%,transparent)]" :
            isConfirmed ? "border-green-border bg-green-dim/5" : "hover:border-text-muted"
        )}>
            <CardContent className="p-0 text-left">
                <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6 text-left">
                    <div className="flex flex-wrap items-center gap-4 sm:gap-6 flex-1 min-w-0 text-left">
                        <div className={cn(
                            "h-10 w-10 rounded-xl border flex items-center justify-center shrink-0 shadow-inner",
                            isDisputed ? "bg-brand-red-dim text-text-red border-brand-red/30" : 
                            isConfirmed ? "bg-green-dim text-text-green border-green-border/30" : "bg-bg-tertiary border-border-sub text-text-muted"
                        )}>
                            {isDisputed ? <AlertTriangle size={20}/> : isConfirmed ? <CheckCircle2 size={20}/> : <Clock size={20}/>}
                        </div>
                        <div className="min-w-0 text-left flex-1">
                            <div className="flex items-center gap-3 text-left">
                                <h4 className="text-sm font-bold text-text-primary uppercase tracking-wide truncate max-w-[520px] text-left">{job.title || job.description}</h4>
                                {item.isHelper && <Badge variant="outline" className="text-[7px] h-3.5 uppercase tracking-tighter">Helper</Badge>}
                                {isConfirmed && <Badge variant="active" className="text-[7px] h-3.5 uppercase tracking-tighter">VERIFIED</Badge>}
                                {isDisputed && <Badge variant="missed" className="text-[7px] h-3.5 uppercase tracking-tighter">DISPUTED</Badge>}
                                {itemReimbursements.length > 0 && (
                                    <Badge variant="pending" className="text-[7px] h-3.5 uppercase tracking-tighter flex items-center gap-1">
                                        <DollarSign size={9} /> Reimbursement · ${totalReimbursed.toFixed(2)}
                                    </Badge>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-0.5 text-[10px] text-text-muted font-bold uppercase tracking-widest text-left">
                                <span className="flex items-center gap-1.5 text-left"><MapPin size={10} className="text-brand-red shrink-0"/> {formatCityState(job.location)}</span>
                                <span className="flex items-center gap-1.5 text-left"><CalendarIcon size={10} className="shrink-0"/> {job.scheduleDate}{job.scheduleTime ? ` · ${job.scheduleTime}` : ''}</span>
                                <span className="font-mono text-brand-red font-bold text-left">ASMT: {job.id.toUpperCase()}</span>
                                {isImported(job) && externalWorkOrderId(job) && (
                                    <a
                                        href={fieldNationUrl(job)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={e => e.stopPropagation()}
                                        className="flex items-center gap-1 font-mono text-blue-400 font-bold hover:text-blue-300 hover:underline text-left"
                                        title="Open in Field Nation"
                                    >
                                        WO# {displayWorkOrderNumber(job)} <ExternalLink size={9} className="shrink-0" />
                                    </a>
                                )}
                            </div>
                        </div>

                        <div className="text-right px-4 border-l border-border-sub/30 min-w-[100px]">
                            <p className="text-[8px] font-black text-text-muted uppercase tracking-widest text-right">Settlement</p>
                            <p className="text-sm font-mono font-bold text-text-green text-right">${(item.jobPay || 0).toFixed(2)}</p>
                        </div>

                        {itemReimbursements.length > 0 && (
                            <div className="text-right px-4 border-l border-border-sub/30 min-w-[100px]">
                                <p className="text-[8px] font-black text-text-muted uppercase tracking-widest text-right">Reimbursement</p>
                                <p className="text-sm font-mono font-bold text-accent-gold text-right">${totalReimbursed.toFixed(2)}</p>
                                <p className="text-[7px] font-bold uppercase tracking-widest text-text-muted text-right">
                                    {itemReimbursements.every(r => r.status === 'approved') ? 'Approved'
                                        : itemReimbursements.some(r => r.status === 'rejected') ? 'Includes Rejected'
                                        : 'Pending Review'}
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
                                        className="h-8 px-4 bg-text-green hover:bg-text-green/90 uppercase text-[9px] font-bold tracking-widest text-white"
                                        onClick={() => onConfirm(item.id)}
                                    >
                                        <Check size={14} className="mr-1.5"/> Confirm
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 px-4 uppercase text-[9px] font-bold tracking-widest border-brand-red text-text-red hover:bg-brand-red-dim"
                                        onClick={() => setIsDisputing(true)}
                                    >
                                        <X size={14} className="mr-1.5"/> Dispute
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-3 text-[9px] font-bold uppercase text-text-muted hover:text-text-primary"
                                    onClick={() => setIsDisputing(!isDisputing)}
                                >
                                    <RotateCcw size={12} className="mr-1.5"/> Adjust Decision
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!canAddReimbursement}
                                title="Add Reimbursement"
                                aria-label="Add Reimbursement"
                                className="h-8 w-8 p-0 shrink-0 border-accent-gold/40 text-accent-gold hover:bg-accent-gold/10 disabled:opacity-40 disabled:cursor-not-allowed"
                                onClick={() => setIsReimbursing(v => !v)}
                            >
                                <DollarSign size={14}/>
                            </Button>
                            {canMove && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    title="Move to Another Log"
                                    aria-label="Move to Another Log"
                                    className="h-8 w-8 p-0 shrink-0 border-blue-400/40 text-blue-400 hover:bg-blue-400/10"
                                    onClick={onRequestMove}
                                >
                                    <ArrowLeftRight size={14}/>
                                </Button>
                            )}
                        </div>
                        </div>
                    )}
                </div>

                {itemReimbursements.length > 0 && (
                    <div className="px-5 pb-4 -mt-1 text-left space-y-1.5">
                        {itemReimbursements.map(r => (
                            <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-bg-primary/40 border border-accent-gold/20 text-left">
                                <div className="min-w-0 text-left">
                                    <p className="text-[10px] font-bold text-text-primary uppercase truncate text-left">{r.description}</p>
                                    <p className="text-[8px] text-text-muted uppercase tracking-widest text-left">{r.date}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-xs font-mono font-bold text-accent-gold">${(r.amount || 0).toFixed(2)}</span>
                                    <Badge
                                        variant={r.status === 'approved' ? 'active' : r.status === 'rejected' ? 'missed' : 'pending'}
                                        className="text-[7px] h-3.5 uppercase tracking-tighter"
                                    >
                                        {r.status || 'pending'}
                                    </Badge>
                                    {!isLocked && (
                                        <button
                                            type="button"
                                            title="Remove reimbursement"
                                            onClick={() => onDeleteReimbursement(r.id)}
                                            className="text-text-muted hover:text-brand-red transition-colors p-1 -m-1"
                                        >
                                            <Trash2 size={12} />
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
                                <p className="text-[9px] font-black text-accent-gold uppercase tracking-[0.2em]">Add Reimbursement · WO# {displayWorkOrderNumber(job)}</p>
                                <button onClick={() => setIsReimbursing(false)} className="text-text-muted hover:text-text-primary"><X size={14}/></button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[8px] font-black uppercase tracking-widest text-text-muted">Amount ($)</label>
                                    <Input type="number" min="0" step="0.01" value={reimbAmount} onChange={e => setReimbAmount(e.target.value)} placeholder="0.00" className="h-9 text-xs bg-bg-secondary border-border-main font-mono" />
                                </div>
                                <div className="space-y-1 sm:col-span-2">
                                    <label className="text-[8px] font-black uppercase tracking-widest text-text-muted">Description / Reason</label>
                                    <Input value={reimbDesc} onChange={e => setReimbDesc(e.target.value)} placeholder="e.g. Parking, materials, tolls" className="h-9 text-xs bg-bg-secondary border-border-main" />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[8px] font-black uppercase tracking-widest text-text-muted">Note (optional)</label>
                                <Input value={reimbNote} onChange={e => setReimbNote(e.target.value)} placeholder="Additional detail" className="h-9 text-xs bg-bg-secondary border-border-main" />
                            </div>
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <label className="text-[9px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2 cursor-pointer">
                                    <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => setReimbFile(e.target.files?.[0] || null)} />
                                    <span className="px-3 py-1.5 rounded border border-border-main bg-bg-secondary hover:bg-bg-tertiary">{reimbFile ? reimbFile.name.slice(0, 24) : 'Attach receipt (optional)'}</span>
                                </label>
                                <Button size="sm" disabled={reimbSaving} onClick={submitReimbursement} className="h-9 px-6 bg-accent-gold hover:bg-accent-gold/90 text-black uppercase text-[9px] font-bold tracking-widest">
                                    {reimbSaving ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Check size={13} className="mr-1.5" />}Submit for Review
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {isDisputing && !isLocked && (
                    <div className="px-5 pb-5 pt-1 animate-in slide-in-from-top-2 duration-300 text-left">
                        <div className="p-4 rounded-xl bg-bg-primary/50 border border-border-sub space-y-5 text-left">
                            <div className="flex items-center justify-between">
                                <p className="text-[9px] font-black text-brand-red uppercase tracking-[0.2em] text-left">Dispute Parameters</p>
                                <button onClick={() => setIsDisputing(false)} className="text-text-muted hover:text-text-primary"><X size={14}/></button>
                            </div>
                            
                            <div className="space-y-4 text-left">
                                <RadioGroup 
                                    value={reason} 
                                    onValueChange={setReason}
                                    className="grid grid-cols-1 md:grid-cols-2 gap-2 text-left"
                                >
                                    {DISPUTE_REASONS.map((r, idx) => (
                                        <div key={idx} className="flex items-center space-x-2 p-2 rounded hover:bg-bg-tertiary transition-colors cursor-pointer text-left">
                                            <RadioGroupItem value={r} id={`r-${item.id}-${idx}`} />
                                            <Label htmlFor={`r-${item.id}-${idx}`} className="text-[10px] uppercase font-bold text-text-primary cursor-pointer flex-1 text-left">{r}</Label>
                                        </div>
                                    ))}
                                </RadioGroup>

                                <div className="space-y-2 text-left">
                                    <Label className="text-[9px] uppercase font-black text-text-muted ml-1 text-left">{reason === 'Other' ? 'Please specify (required)' : 'Additional Context (Optional)'}</Label>
                                    <Textarea
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        placeholder={reason === 'Other' ? "Describe the reason for this dispute..." : "Provide specific details for administrative audit..."}
                                        className="bg-bg-secondary h-20 text-xs font-medium uppercase leading-relaxed text-left"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="outline" size="sm" className="h-8 text-[9px] uppercase font-bold" onClick={() => setIsDisputing(false)}>Discard</Button>
                                <Button 
                                    size="sm" 
                                    className="h-8 bg-brand-red hover:bg-brand-red-hover text-white uppercase text-[9px] font-bold tracking-widest"
                                    disabled={!reason || (reason === 'Other' && !notes.trim())}
                                    onClick={() => { onDispute(item.id, reason, notes); setIsDisputing(false); }}
                                >
                                    Commit Dispute
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {isDisputed && (isLocked || !isDisputing) && (
                    <div className="px-4 pb-4 animate-in fade-in duration-300 text-left">
                         <div className="p-3 rounded-lg bg-brand-red-dim/10 border border-brand-red/10 text-left">
                            <p className="text-[9px] font-black text-brand-red uppercase mb-1 flex items-center gap-1.5 text-left">
                                <ShieldAlert size={10}/> Reported Discrepancy: {item.disputeReason}
                            </p>
                            {item.disputeNotes && (
                                <p className="text-[10px] text-text-secondary leading-relaxed italic uppercase font-medium text-left">
                                    &quot;{item.disputeNotes}&quot;
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
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
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary text-left">Report Missing Assignment</DialogTitle>
                    </div>
                    <DialogDescription className="text-xs uppercase font-bold text-text-muted text-left">Submit details for a mission that is absent from the weekly registry.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSave} className="space-y-4 py-4 text-left">
                    {/* Job type — decides how payroll settles it. */}
                    <div className="space-y-2 text-left">
                        <Label className="text-[10px] uppercase font-bold text-text-muted">Job Type</Label>
                        <div className="grid grid-cols-2 gap-2">
                            {(['Imported', 'Manual'] as const).map(t => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setJobType(t)}
                                    className={cn(
                                        "h-10 rounded-md border text-[10px] font-bold uppercase tracking-widest transition-colors",
                                        jobType === t ? "border-brand-red bg-brand-red/10 text-brand-red" : "border-border-sub bg-bg-primary text-text-muted hover:text-text-primary"
                                    )}
                                >
                                    {t === 'Imported' ? 'Imported (Field Nation)' : 'Manual'}
                                </button>
                            ))}
                        </div>
                        <p className="text-[9px] text-text-muted normal-case tracking-normal">
                            {jobType === 'Imported'
                                ? 'Enter the Field Nation work order number so payroll can open the FN link and run the pay calculator.'
                                : 'Manual jobs use a flat pay you enter below; payroll verifies it.'}
                        </p>
                    </div>
                    <div className="space-y-2 text-left">
                        <Label className="text-[10px] uppercase font-bold text-text-muted">Client Entity</Label>
                        <Input name="clientName" className="bg-bg-primary h-10 text-xs uppercase font-bold" />
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-left">
                        {jobType === 'Imported' && (
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Work Order # (Field Nation)</Label>
                                <Input name="externalWorkOrderId" required placeholder="e.g. 18927456" className="bg-bg-primary h-10 text-xs uppercase font-bold" />
                            </div>
                        )}
                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] uppercase font-bold text-text-muted">{jobType === 'Imported' ? 'Job Pay (optional)' : 'Job Pay'}</Label>
                            <Input name="pay" type="number" step="0.01" required={jobType === 'Manual'} placeholder="0.00" className="bg-bg-primary h-10 text-xs font-mono" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-left">
                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] uppercase font-bold text-text-muted">Work Date</Label>
                            <Input name="date" type="date" required className="bg-bg-primary h-10 text-xs" />
                        </div>
                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] uppercase font-bold text-text-muted">Location</Label>
                            <AddressAutocompleteInput name="location" required className="bg-bg-primary h-10 text-xs" />
                        </div>
                    </div>
                    <div className="space-y-2 text-left">
                        <Label className="text-[10px] uppercase font-bold text-text-muted">Summary</Label>
                        <Textarea name="summary" required className="bg-bg-primary min-h-[120px] text-xs leading-relaxed uppercase font-medium text-left" placeholder="Document site activity and terminal outcomes..." />
                    </div>
                    <DialogFooter className="pt-4 border-t border-border-sub flex-row gap-3">
                        <Button variant="outline" type="button" onClick={() => setIsOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest">Cancel</Button>
                        <Button type="submit" className="flex-1 bg-brand-red hover:bg-brand-red-hover h-11 uppercase font-bold text-[10px] tracking-widest text-white shadow-lg">
                            <Send size={14} className="mr-2" /> Submit Inquiry
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
    start_trip: 'Start Trip',
    check_in_flow: 'Check-In Flow',
};

function TripLogsView({ tripLogs, workOrders, mileageUnit }: { tripLogs: TripLog[]; workOrders: WorkOrder[]; mileageUnit: 'mi' | 'km' }) {
    const sorted = [...tripLogs].sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''));
    const totalMiles = sorted.reduce((acc, t) => acc + (t.miles || t.calculatedMiles || t.manualMiles || 0), 0);

    if (sorted.length === 0) {
        return (
            <div className="py-24 text-center border-2 border-dashed border-border-sub rounded-2xl bg-bg-secondary/30">
                <Car size={48} className="mx-auto text-text-muted mb-2 opacity-20" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">No trips recorded yet</p>
                <p className="text-[9px] text-text-muted uppercase tracking-widest mt-1">Trips added from an assignment appear here for year-end mileage review.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4 max-w-5xl">
            <div className="flex items-center gap-4 p-3 rounded-xl bg-bg-secondary border border-border-sub w-max">
                <div>
                    <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">Total Trips</p>
                    <p className="text-lg font-mono font-bold text-text-primary leading-none">{sorted.length}</p>
                </div>
                <div className="border-l border-border-sub pl-4">
                    <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">Total {mileageUnit === 'km' ? 'Kilometers' : 'Miles'}</p>
                    <p className="text-lg font-mono font-bold text-text-green leading-none">{formatDistance(totalMiles, mileageUnit)}</p>
                </div>
            </div>

            <div className="rounded-xl border border-border-sub overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-bg-tertiary/50 border-b border-border-sub">
                            {['Date', 'Work Order', 'Job / Site', 'Route', 'Time', mileageUnit === 'km' ? 'KM' : 'Miles', 'Source', 'Status'].map(h => (
                                <th key={h} className="text-[8px] font-black uppercase tracking-widest text-text-muted px-3 py-2 whitespace-nowrap">{h}</th>
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
                                    <td className="px-3 py-2.5 text-[10px] text-text-secondary whitespace-nowrap">{t.date || '—'}</td>
                                    <td className="px-3 py-2.5 text-[10px] font-mono font-bold text-brand-red whitespace-nowrap">{woNum}</td>
                                    <td className="px-3 py-2.5 text-[10px] text-text-primary max-w-[200px] truncate">{t.jobTitle || job?.title || job?.description || t.purpose || '—'}</td>
                                    <td className="px-3 py-2.5 text-[9px] text-text-muted max-w-[220px] truncate">{[t.startLocation, t.endLocation].filter(Boolean).join(' → ') || '—'}</td>
                                    <td className="px-3 py-2.5 text-[9px] text-text-muted whitespace-nowrap">{[t.startTime, t.endTime].filter(Boolean).join(' – ') || '—'}</td>
                                    <td className="px-3 py-2.5 text-[10px] font-mono font-bold text-text-primary whitespace-nowrap">{miles ? formatDistance(miles, mileageUnit) : '—'}</td>
                                    <td className="px-3 py-2.5 text-[9px] text-text-muted uppercase whitespace-nowrap">{TRIP_SOURCE_LABEL[t.source || 'manual'] || 'Manual'}</td>
                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                        <span className={cn('inline-block text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border', st.cls)}>{st.label}</span>
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
