'use client';
import { logDisplayStatus } from '@/lib/weekly-log-core';

import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react';
import type { WeeklyLog, Technician, WorkOrder, WeeklyLogItem, FinancialRecord, PayrollDispute, TripLog, MissingAssignmentReport, DisputeKind, DisputeResolution } from '@/lib/types';
import { onSiteSessions } from '@/lib/time-on-site';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { 
    AlertTriangle, 
    CheckCircle2, 
    ShieldAlert, 
    Check, 
    X,
    ExternalLink,
    DollarSign,
    Wrench,
    Clock,
    ClipboardCheck,
    Trash2,
    Undo2,
    MessageSquare,
    AlertCircle,
    Calendar as CalendarIcon,
    ShieldCheck,
    FileCheck,
    Pencil,
    Activity as ActivityIcon,
    ChevronRight,
    MapPin,
    Save,
    RotateCcw,
    Lock,
    Unlock,
    Loader2,
    Receipt,
} from 'lucide-react';
import { cn, formatCityState, sanitize } from '@/lib/utils';
import { FIELD_NATION_FEE_RATE, netOfFieldNationFee, computeWeeklyLogSettlement, effectiveJobPay } from '@/lib/payroll';
import { DISPUTE_CARDS, PAYROLL_TICKET_CARDS, disputeKindOf, firstName, isLegacyOtherReason, shortWeek, type CardContext } from '@/lib/disputes';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import { fieldNationUrl, displayWorkOrderNumber, externalWorkOrderId } from '@/lib/work-order-identity';
import { WorkOrderId } from '@/components/work-order-id';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { differenceInMinutes, parseISO, format } from 'date-fns';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { db, auth } from '@/lib/firebase';
import { NotificationService } from '@/lib/notification-service';
import { LogApprovalHistory } from './log-approval-history';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, arrayUnion, collection, query, where, onSnapshot, runTransaction } from 'firebase/firestore';
import { isLockedLog, assignedTechOf, weekOfForScheduleDate } from '@/lib/weekly-log-core';
import { isSuperAdmin } from '@/lib/permissions';
import { toUnassignedWorkOrder } from '@/lib/jobs';
import { auditEvent } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { JobDetailDialog } from '@/components/job-detail-dialog';
import { PayrollTicketDecision } from '@/components/payroll-ticket-decision';
import { money } from '@/lib/financial-summary';

type PayrollReviewDialogProps = {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    log: WeeklyLog | null;
    technician: Technician | undefined;
    missions: WorkOrder[];
    allTechnicians?: Technician[];
    // Every tech's weekly logs — used to look up the counterpart's pay on a
    // shared job (lead <-> helper) so the admin can set appropriate pay for
    // whichever side they're currently auditing.
    allWeeklyLogs?: WeeklyLog[];
    onStatusChange: (logId: string, status: WeeklyLog['status'], total?: number) => void;
};

/**
 * Quicklink tag: on a lead's job row, shows the helper's pay on that same
 * job; on a helper's job row, shows the lead's pay instead. Looks the
 * counterpart's weekly-log item up across every tech's logs by workOrderId,
 * so the admin can see both sides while deciding what's appropriate to pay.
 * Renders nothing if the counterpart hasn't filed that job yet.
 */
function CounterpartPayBadge({
    workOrderId,
    wantHelper,
    allWeeklyLogs,
    allTechnicians,
}: {
    workOrderId: string;
    wantHelper: boolean;
    allWeeklyLogs: WeeklyLog[];
    allTechnicians: Technician[];
}) {
    const counterpart = useMemo(() => {
        for (const log of allWeeklyLogs) {
            const item = (log.items || []).find(i => i.workOrderId === workOrderId && !!i.isHelper === wantHelper);
            if (item) {
                return {
                    techName: allTechnicians.find(t => t.id === log.techId)?.name || log.techId,
                    jobPay: item.jobPay || 0,
                    weekOf: log.weekOf,
                    status: log.status,
                };
            }
        }
        return null;
    }, [allWeeklyLogs, allTechnicians, workOrderId, wantHelper]);

    if (!counterpart) return null;

    return (
        <Popover>
            <PopoverTrigger asChild onClick={e => e.stopPropagation()}>
                <button type="button">
                    <Badge variant="outline" className={cn(
                        "text-[10px] font-semibold uppercase tracking-wide px-1.5 cursor-pointer hover:brightness-110 transition-all",
                        "bg-brand-blue/10 border-brand-blue/30 text-brand-blue"
                    )}>
                        {wantHelper ? 'Helper added' : 'As helper'}
                    </Badge>
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3 bg-bg-elevated border-border-main shadow-md text-left" onClick={e => e.stopPropagation()}>
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{wantHelper ? 'Helper pay' : 'Lead pay'}</p>
                <p className="text-[13px] font-semibold text-text-primary mt-1">{counterpart.techName}</p>
                <p className="text-lg font-mono font-bold text-text-green mt-0.5">${counterpart.jobPay.toFixed(2)}</p>
                <p className="text-[11px] text-text-muted mt-1">Week of {counterpart.weekOf} · {counterpart.status}</p>
            </PopoverContent>
        </Popover>
    );
}

/**
 * @fileOverview Internal Audit Sub-Component for individual mission settlement.
 * Implements a local buffer protocol to ensure notifications only trigger on finalized save.
 *
 * Financial formulas below are untouched — only layout/sizing changed for
 * legibility, plus a non-destructive auto-fill of the Reimb. field from
 * approved job reimbursements (see approvedReimbTotal effect).
 */
function ImportedJobAudit({
    wo,
    onUpdateWorkOrder,
    approvedReimbTotal = 0,
    isLocked = false,
    commitLabel,
}: {
    wo: WorkOrder;
    onUpdateWorkOrder: (id: string, updates: Partial<WorkOrder>) => void;
    approvedReimbTotal?: number;
    isLocked?: boolean;
    /** Always show the save button with this label (a dispute's "Add it and pay"). */
    commitLabel?: string;
}) {
    // Local Buffer State. Older imported jobs can have pay missing or saved as
    // text — read everything as a number so every field is editable.
    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const savedPay = num(wo.pay), savedReimb = num(wo.auditReimbursement), savedOverhead = num(wo.auditOverhead);
    const [localPay, setLocalPay] = useState(savedPay);
    const [localReimb, setLocalReimb] = useState(savedReimb || approvedReimbTotal || 0);
    const [localOverhead, setLocalOverhead] = useState(savedOverhead);
    const prevApprovedTotal = useRef(approvedReimbTotal);

    // Auto-fill the Reimb. field from newly-approved reimbursements — only
    // when the admin hasn't already edited it away from the last auto-filled
    // value, so an in-progress manual edit is never silently overwritten.
    useEffect(() => {
        if (approvedReimbTotal !== prevApprovedTotal.current) {
            setLocalReimb(current => current === prevApprovedTotal.current ? approvedReimbTotal : current);
            prevApprovedTotal.current = approvedReimbTotal;
        }
    }, [approvedReimbTotal]);

    const isDirty = localPay !== savedPay || localReimb !== savedReimb || localOverhead !== savedOverhead;

    // Dynamic Financial Projections (Local).
    // The Field Nation fee is taken off labor AND reimbursement; the tech nets
    // the remainder of each. Aaromach keeps a clean 50% of net labor (minus
    // overhead) and no longer absorbs the fee on reimbursements — a $100
    // reimbursement pays the tech netOfFieldNationFee($100) = $84.15.
    const fnFeeLabor = localPay * FIELD_NATION_FEE_RATE;
    const fnFeeReimb = localReimb * FIELD_NATION_FEE_RATE;
    const totalFnFee = fnFeeLabor + fnFeeReimb;
    const netLabor = localPay - fnFeeLabor;
    const laborPayout = netLabor * 0.50;                 // tech's labor share (stored as finalPay)
    const reimbPayout = netOfFieldNationFee(localReimb); // tech's reimbursement, net of the FN fee
    const aaromachPay = laborPayout + localOverhead;     // overhead goes back to Aaromach (added)

    const handleCommit = () => {
        if (isLocked) return;
        onUpdateWorkOrder(wo.id, {
            pay: localPay,
            auditReimbursement: localReimb,
            auditOverhead: localOverhead,
            // Store LABOR ONLY. Reimbursement is added once, net of fee, at the
            // log-total level so it is never double-counted.
            finalPay: Math.max(0, laborPayout)
        });
    };

    const handleReset = () => {
        setLocalPay(savedPay);
        setLocalReimb(savedReimb);
        setLocalOverhead(savedOverhead);
    };

    return (
        <div className={cn(
            "flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-x-4 sm:gap-y-2 p-2 bg-bg-primary border rounded-lg text-left w-full min-w-0 max-w-full transition-all",
            isDirty ? "border-brand-red ring-1 ring-brand-red/20 shadow-sm" : "border-border-sub"
        )} onClick={e => e.stopPropagation()}>
             <div className="grid grid-cols-3 gap-2 w-full sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:w-auto">
                <div className="flex flex-col items-start gap-1 min-w-0 sm:flex-row sm:items-center sm:gap-2 sm:w-auto">
                    <Label className="text-[11px] font-medium text-text-muted whitespace-nowrap">Pay</Label>
                    <div className="relative w-full sm:w-auto">
                        <DollarSign size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <Input
                            type="number"
                            value={localPay === 0 ? '' : localPay}
                            placeholder="0"
                            disabled={isLocked}
                            onChange={(e) => setLocalPay(parseFloat(e.target.value) || 0)}
                            className="h-7 w-full sm:w-20 text-xs pl-5 bg-bg-secondary font-mono font-bold border border-border-sub shadow-none focus-visible:ring-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                    </div>
                </div>
                <div className="flex flex-col items-start gap-1 min-w-0 sm:flex-row sm:items-center sm:gap-2 sm:w-auto">
                    <Label className="text-[11px] font-medium text-text-muted whitespace-nowrap" title="Reimbursement">Reimb.</Label>
                    <div className="relative w-full sm:w-auto">
                        <DollarSign size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <Input
                            type="number"
                            value={localReimb === 0 ? '' : localReimb}
                            placeholder="0"
                            disabled={isLocked}
                            onChange={(e) => setLocalReimb(parseFloat(e.target.value) || 0)}
                            className="h-7 w-full sm:w-20 text-xs pl-5 bg-bg-secondary font-mono border border-border-sub shadow-none focus-visible:ring-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        {localReimb > 0 && (
                            <span className="block sm:absolute sm:left-0 sm:top-full mt-0.5 text-[11px] font-medium text-text-green whitespace-nowrap" title="Reimbursement paid to tech, net of the Field Nation fee">
                                → ${reimbPayout.toFixed(2)} to tech
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex flex-col items-start gap-1 min-w-0 sm:flex-row sm:items-center sm:gap-2 sm:w-auto">
                    <Label className="text-[11px] font-medium text-text-muted whitespace-nowrap" title="Overhead">Overhead</Label>
                    <div className="relative w-full sm:w-auto">
                        <DollarSign size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <Input
                            type="number"
                            value={localOverhead === 0 ? '' : localOverhead}
                            placeholder="0"
                            disabled={isLocked}
                            onChange={(e) => setLocalOverhead(parseFloat(e.target.value) || 0)}
                            className="h-7 w-full sm:w-20 text-xs pl-5 bg-bg-secondary font-mono border border-border-sub shadow-none focus-visible:ring-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                    </div>
                </div>
             </div>

             <div className="grid grid-cols-4 gap-1.5 min-w-0 w-full sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1 sm:w-auto sm:pl-3 sm:border-l border-border-sub/50">
                <div className="flex flex-col items-start gap-0.5 min-w-0 sm:flex-row sm:items-center sm:gap-1 sm:w-auto whitespace-nowrap">
                    <span className="text-[11px] font-medium text-text-muted" title="Field Nation fee (15.85%)">FN fee<span className="hidden sm:inline"> (15.85%)</span></span>
                    <span className="text-[12px] font-mono font-bold text-text-primary">${totalFnFee.toFixed(2)}</span>
                </div>
                <div className="flex flex-col items-start gap-0.5 min-w-0 sm:flex-row sm:items-center sm:gap-1 sm:w-auto whitespace-nowrap">
                    <span className="text-[11px] font-medium text-text-muted">Net</span>
                    <span className="text-[12px] font-mono font-bold text-text-primary">${netLabor.toFixed(2)}</span>
                </div>
                <div className="flex flex-col items-start gap-0.5 min-w-0 sm:flex-row sm:items-center sm:gap-1 sm:w-auto whitespace-nowrap">
                    <span className="text-[11px] font-medium text-text-green">Tech pay</span>
                    <span className="text-[11px] font-mono font-bold text-text-green" title="Tech labor payout (50% of net labor). Reimbursement is added separately, net of the FN fee.">${laborPayout.toFixed(2)}</span>
                </div>
                <div className="flex flex-col items-start gap-0.5 min-w-0 sm:flex-row sm:items-center sm:gap-1 sm:w-auto whitespace-nowrap">
                    <span className="text-[11px] font-medium text-brand-red">Aaromach</span>
                    <span className="text-[11px] font-mono font-bold text-brand-red">${aaromachPay.toFixed(2)}</span>
                </div>
             </div>

             {(isDirty || (commitLabel && !isLocked)) && (
                <div className="flex items-center gap-1.5 ml-auto">
                    {isDirty && (
                        <button
                            onClick={handleReset}
                            className="h-7 px-2.5 rounded-md bg-bg-tertiary flex items-center gap-1 text-text-muted hover:text-text-primary transition-colors text-[12px] font-medium"
                            title="Reset changes"
                        >
                            <RotateCcw size={12}/> Reset
                        </button>
                    )}
                    <button
                        onClick={handleCommit}
                        className={cn("rounded-md bg-brand-red flex items-center gap-1 text-white hover:bg-brand-red-hover transition-colors shadow-sm font-medium", commitLabel ? "h-9 px-3 text-[13px]" : "h-7 px-2.5 text-[12px]")}
                        title="Save pay changes"
                    >
                        <Save size={12}/> {commitLabel ? `${commitLabel} $${(laborPayout + reimbPayout).toFixed(2)}` : 'Save'}
                    </button>
                </div>
             )}
             {isLocked && (
                <div className="flex items-center gap-1 ml-auto text-text-muted" title="Log approved — reopen it above to edit">
                    <Lock size={12}/>
                    <span className="text-[12px] font-medium">Locked</span>
                </div>
             )}
        </div>
    );
}

export function PayrollReviewDialog({ isOpen, setIsOpen, log: initialLog, technician, missions, allTechnicians = [], allWeeklyLogs = [], onStatusChange }: PayrollReviewDialogProps) {
    const [localLog, setLocalLog] = useState<WeeklyLog | null>(null);
    const [selectedJobForDetail, setSelectedJobForDetail] = useState<WorkOrder | null>(null);
    const [isJobDetailOpen, setIsJobDetailOpen] = useState(false);
    const { toast } = useToast();
    const { hasPermission, user: authUser } = useAuth();
    const superAdmin = isSuperAdmin(authUser);
    const [toolsOpen, setToolsOpen] = useState(false);
    const [toolBusy, setToolBusy] = useState<string | null>(null);
    // Weekly-log review authority (subrole-driven). Approve settles a submitted
    // log; return sends it back to the tech (Deny / Authorize Unsubmit).
    const canApproveLog = hasPermission('admin.logs.approve');
    const canReturnLog = hasPermission('admin.logs.return');
    // Overriding a tech's dispute (sending the job back to Dispatch, or
    // archiving it outright) is a step beyond acknowledging the dispute —
    // gate it the same as reopening a closed assignment.
    const canOverrideDispute = hasPermission('admin.logs.reopen');

    // An Approved log's pay figures are locked. "Reopen to Edit" (same
    // authority as overriding a dispute) moves it back to Submitted — every
    // item, pay figure, reimbursement and totalPayout is left exactly as
    // entered — so payroll can correct it and approve it again through the
    // normal flow. The confirm is inline in the banner rather than a stacked
    // AlertDialog: Radix treats a click in a second modal as an outside click
    // on this Dialog, which closed it and silently discarded the reopen.
    const [reopenConfirming, setReopenConfirming] = useState(false);
    const [reopening, setReopening] = useState(false);

    useEffect(() => {
        if (isOpen && initialLog) {
            setLocalLog(JSON.parse(JSON.stringify(initialLog)));
            setReopenConfirming(false);
        }
    }, [isOpen, initialLog]);

    const isLogApproved = localLog?.status === 'Approved' || (localLog as any)?.status === 'Paid';
    const isLogLockedForEdit = isLogApproved;

    // Post-approval disputes a tech filed against this log after it left
    // Draft — a separate ticket collection, since the log itself is locked
    // from direct tech edits by then.
    const [payrollDisputes, setPayrollDisputes] = useState<PayrollDispute[]>([]);
    useEffect(() => {
        if (!isOpen || !initialLog?.id) { setPayrollDisputes([]); return; }
        const unsub = onSnapshot(
            query(collection(db, 'payrollDisputes'), where('weeklyLogId', '==', initialLog.id)),
            (snap) => setPayrollDisputes(snap.docs.map(d => ({ ...d.data(), id: d.id } as PayrollDispute))),
            () => setPayrollDisputes([]),
        );
        return () => unsub();
    }, [isOpen, initialLog?.id]);

    // Jobs on this log that aren't in the live lists — usually finished jobs
    // since archived to History. Fetched by id so older weeks still show the
    // job's title and the full pay calculator (they used to fall back to a
    // bare "Loading job details…" row with no calculator).
    const [extraJobs, setExtraJobs] = useState<WorkOrder[]>([]);
    const [extraLoading, setExtraLoading] = useState(false);
    const allJobs = useMemo(() => [...missions, ...extraJobs], [missions, extraJobs]);
    useEffect(() => {
        if (!isOpen || !initialLog) return;
        const ids = Array.from(new Set((initialLog.items || []).map(i => i.workOrderId).filter(Boolean)));
        const missing = ids.filter(id => !missions.some(m => m.id === id || m.workOrderId === id));
        if (!missing.length) { setExtraJobs([]); return; }
        let cancelled = false;
        setExtraLoading(true);
        (async () => {
            const found: WorkOrder[] = [];
            for (const id of missing) {
                for (const col of ['assignments', 'activityArchive', 'workOrders']) {
                    try {
                        const snap = await getDoc(doc(db, col, id));
                        if (snap.exists()) { found.push({ ...(snap.data() as WorkOrder), id: snap.id }); break; }
                    } catch { /* not readable here; try the next place */ }
                }
            }
            if (!cancelled) { setExtraJobs(found); setExtraLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [isOpen, initialLog, missions]);

    const findWorkOrder = useCallback((id: string): WorkOrder | undefined => {
        return allJobs.find(wo => wo.id === id) || allJobs.find(wo => wo.workOrderId === id);
    }, [allJobs]);

    const jobsById = useMemo(() => new Map(allJobs.map(m => [m.id, m])), [allJobs]);

    const getHelperNames = useCallback((wo: WorkOrder | undefined): string[] => {
        if (!wo?.additionalTechnicianIds?.length) return [];
        return wo.additionalTechnicianIds.map(id => allTechnicians.find(t => t.id === id)?.name || id);
    }, [allTechnicians]);

    // Reimbursements attach to a specific job via workOrderId (set when the
    // tech files them from job verification) — this is the join key used to
    // lock a job's approval and to inline its reimbursement review here.
    const getJobReimbursements = useCallback((woId: string | undefined): FinancialRecord[] => {
        if (!woId) return [];
        return (localLog?.reimbursements || []).filter(r => r.workOrderId === woId);
    }, [localLog]);

    // Hours on site from the tech's real trip records (check-in → check-out);
    // this used to read the demo time logs in lib/data. Multiple visits to the
    // same job add up.
    const [techSessions, setTechSessions] = useState<ReturnType<typeof onSiteSessions>>([]);
    useEffect(() => {
        if (!isOpen || !technician?.id) { setTechSessions([]); return; }
        return onSnapshot(
            query(collection(db, 'tripLogs'), where('technicianId', '==', technician.id)),
            snap => setTechSessions(onSiteSessions(snap.docs.map(d => ({ ...d.data(), id: d.id } as TripLog)))),
            () => setTechSessions([]),
        );
    }, [isOpen, technician?.id]);
    const getHoursOnsite = useCallback((woId: string) => {
        const sessions = techSessions.filter(s => s.workOrderId === woId);
        if (sessions.length === 0) return 'TBD';
        if (sessions.some(s => !s.checkOutTime)) return 'ACTIVE';
        const mins = sessions.reduce((sum, s) => sum + (s.minutesWorked || 0), 0);
        return (mins / 60).toFixed(1) + 'h';
    }, [techSessions]);

    // Shared with the Payroll Audit Weekly tab, CSV export, and
    // Paystub History via computeWeeklyLogSettlement() so this dialog's "Net
    // Tech Settlement" can never drift from what those screens show.
    const calculatedTotalPayout = useMemo(
        () => computeWeeklyLogSettlement(localLog || {}, jobsById),
        [localLog, jobsById],
    );
    
    const reviewReimbursement = async (reimbId: string, decision: 'approved' | 'rejected') => {
        if (!localLog) return;
        const updated = (localLog.reimbursements || []).map(r =>
            r.id === reimbId
                ? { ...r, status: decision, reviewedBy: auth.currentUser?.uid || null, reviewedAt: new Date().toISOString() } as any
                : r
        );
        setLocalLog({ ...localLog, reimbursements: updated } as WeeklyLog);
        try {
            await updateDoc(doc(db, 'weeklyLogs', localLog.id), { reimbursements: updated });
            const r = (localLog.reimbursements || []).find(x => x.id === reimbId);
            if (r && localLog.techId) NotificationService.notify(localLog.techId,
                decision === 'approved' ? 'Reimbursement approved' : 'Reimbursement rejected',
                `Your $${(Number(r.amount) || 0).toFixed(2)} reimbursement (${r.description || 'expense'}) on your log for ${localLog.weekOf} was ${decision === 'approved' ? 'approved' : 'not approved'}.`,
                { id: localLog.id, type: 'weeklyLog' }, { portal: 'tech', inAppOnly: decision === 'approved' }).catch(() => {});
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Update failed', description: e.message });
        }
    };

    const handleStatusChange = async (status: WeeklyLog['status']) => {
        // Approving a log needs admin.logs.approve; sending it back
        // (Rejected/Draft) needs admin.logs.return.
        const needed = status === 'Approved' ? canApproveLog : canReturnLog;
        if (!needed) {
            toast({ variant: 'destructive', title: 'Not permitted', description: `You do not have permission to ${status === 'Approved' ? 'approve' : 'return'} weekly logs.` });
            return;
        }
        if (status === 'Approved' && undecidedCount > 0) {
            toast({ variant: 'destructive', title: 'Decide the flagged jobs first', description: `${undecidedCount} flagged job${undecidedCount === 1 ? '' : 's'} still need a yes or no.` });
            return;
        }
        if (localLog) {
            const finalTotal = calculatedTotalPayout;
            try {
                const logRef = doc(db, 'weeklyLogs', localLog.id);
                // Record when (and by whom) a log was approved — Payroll Audit shows
                // the approval time in place of the submitted time, and App
                // Activity logs it. Returning/rejecting clears it.
                const approval = status === 'Approved'
                    ? { approvedAt: new Date().toISOString(), approvedBy: auth.currentUser?.uid || null, approvedByName: authUser?.name || auth.currentUser?.displayName || 'Admin', mergeReviewRequired: false }
                    : { approvedAt: null, approvedBy: null, approvedByName: null };
                await updateDoc(logRef, { status, totalPayout: finalTotal, ...approval });
                onStatusChange(localLog.id, status, finalTotal);
                if (localLog.techId && status !== localLog.status) {
                    const msg = status === 'Approved'
                        ? { title: 'Weekly log approved', body: `Your log for ${localLog.weekOf} was approved — $${finalTotal.toFixed(2)}.` }
                        : status === 'Rejected'
                            ? { title: 'Weekly log rejected', body: `Your log for ${localLog.weekOf} was rejected. Check it under Logs and talk to payroll.` }
                            : { title: 'Weekly log returned', body: `Your log for ${localLog.weekOf} was sent back to Draft for corrections. Fix it and submit again.` };
                    NotificationService.notify(localLog.techId, msg.title, msg.body, { id: localLog.id, type: 'weeklyLog' }, { portal: 'tech' }).catch(() => {});
                }
                const adminId = auth.currentUser?.uid ?? '';
                const adminName = auth.currentUser?.displayName ?? 'Admin';
                await auditEvent(
                    'weeklyLogs',
                    localLog.id,
                    adminId,
                    adminName,
                    `payroll_${status.toLowerCase()}`,
                    `Log for week of ${localLog.weekOf} (tech: ${technician?.name ?? localLog.techId}) ${status.toLowerCase()} by ${adminName}. Total payout: $${finalTotal.toFixed(2)}`
                );
            } catch (e: any) {
                toast({ variant: 'destructive', title: 'Could not save', description: e.message });
            }
        }
    };

    // Approved → Paid: payroll has paid this week out. Undo is allowed (a
    // payment that bounced, or marked by mistake); reopening a paid log
    // requires undoing Paid first.
    const [paying, setPaying] = useState(false);
    const setPaid = async (paid: boolean) => {
        if (!localLog || paying || localLog.status !== 'Approved') return;
        setPaying(true);
        try {
            const by = authUser?.name || auth.currentUser?.displayName || 'Admin';
            const patch = paid ? { paid: true, paidAt: new Date().toISOString(), paidByName: by } : { paid: false, paidAt: null, paidByName: null };
            await updateDoc(doc(db, 'weeklyLogs', localLog.id), patch);
            setLocalLog({ ...localLog, ...patch } as WeeklyLog);
            await auditEvent('weeklyLogs', localLog.id, auth.currentUser?.uid ?? '', by, paid ? 'payroll_paid' : 'payroll_unpaid',
                `${by} marked ${technician?.name ?? localLog.techId}'s week of ${localLog.weekOf} as ${paid ? 'PAID' : 'not paid'}.`).catch(() => {});
            if (paid && localLog.techId) NotificationService.notify(localLog.techId, 'Weekly log paid',
                `Your week of ${shortWeek(localLog.weekOf)} has been paid.`, { id: localLog.id, type: 'weeklyLog' }, { portal: 'tech' }).catch(() => {});
            toast({ title: paid ? 'Paid out' : 'Pay out undone' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not update', description: e.message });
        } finally {
            setPaying(false);
        }
    };

    const handleReopenToSubmitted = async () => {
        if (!localLog || reopening) return;
        if ((localLog as any).paid) {
            toast({ variant: 'destructive', title: 'This log is paid out', description: 'Undo the pay out first, then unapprove it.' });
            return;
        }
        if (!canOverrideDispute) {
            toast({ variant: 'destructive', title: 'Not permitted', description: 'You do not have permission to reopen approved weekly logs.' });
            return;
        }
        setReopening(true);
        const previousStatus = localLog.status;
        try {
            // Status only — items, reimbursements and totalPayout stay as-is.
            await updateDoc(doc(db, 'weeklyLogs', localLog.id), { status: 'Submitted' });
            setLocalLog({ ...localLog, status: 'Submitted' });
            onStatusChange(localLog.id, 'Submitted', localLog.totalPayout ?? calculatedTotalPayout);
            setReopenConfirming(false);
            const adminId = auth.currentUser?.uid ?? '';
            const adminName = auth.currentUser?.displayName ?? 'Admin';
            await auditEvent(
                'weeklyLogs',
                localLog.id,
                adminId,
                adminName,
                'payroll_reopened',
                `${adminName} reopened ${technician?.name ?? localLog.techId}'s weekly log for week of ${localLog.weekOf} (${previousStatus} → Submitted) for editing. Entered figures unchanged.`
            ).catch(() => {});
            toast({ title: 'Log reopened', description: 'Moved back to Submitted with all entered figures kept. Re-approve when corrections are done.' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not reopen', description: e.message });
        } finally {
            setReopening(false);
        }
    };

    const handleApproveUnsubmit = async () => {
        if (!localLog) return;
        if (!canReturnLog) {
            toast({ variant: 'destructive', title: 'Not permitted', description: 'You do not have permission to return weekly logs.' });
            return;
        }
        try {
            const logRef = doc(db, 'weeklyLogs', localLog.id);
            const previousStatus = localLog.status;
            await updateDoc(logRef, {
                status: 'Draft',
                unsubmitRequested: false,
                unsubmitReason: null,
                unsubmitRequestedAt: null
            });
            if (localLog.techId) NotificationService.notify(localLog.techId, 'Weekly log reopened',
                `Your request was approved — your log for ${localLog.weekOf} is a Draft again. Make your changes and submit it.`,
                { id: localLog.id, type: 'weeklyLog' }, { portal: 'tech' }).catch(() => {});
            const adminId = auth.currentUser?.uid ?? '';
            const adminName = auth.currentUser?.displayName ?? 'Admin';
            await auditEvent(
                'weeklyLogs',
                localLog.id,
                adminId,
                adminName,
                'unsubmit_approved',
                `Unsubmit approved by ${adminName} for week of ${localLog.weekOf} (tech: ${technician?.name ?? localLog.techId}). Log reverted from ${previousStatus} to Draft. Reason: ${localLog.unsubmitReason ?? '—'}`
            );
            toast({
                title: "Unsubmit approved",
                description: `Weekly log for ${localLog.weekOf} has been reverted to Draft.`,
            });
            setIsOpen(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Not allowed', description: e.message });
        }
    };

    // A pay edit that lands on an already-Approved log means the log was
    // reopened — record it distinctly from the normal approve/return audit
    // trail so a settled paycheck that got changed afterward is traceable.
    const logReopenedPayEdit = useCallback((logId: string, weekOf: string) => {
        const adminId = auth.currentUser?.uid ?? '';
        const adminName = auth.currentUser?.displayName ?? 'Admin';
        auditEvent(
            'weeklyLogs',
            logId,
            adminId,
            adminName,
            'payroll_reopened_edit',
            `${adminName} reopened and made changes to ${technician?.name ?? 'tech'}'s weekly log settlement date ${weekOf}.`
        ).catch(() => {});
    }, [technician]);

    const handleUpdateWorkOrder = useCallback(async (woId: string, updates: Partial<WorkOrder>) => {
        // The log may file the job under its original work-order id.
        const job = allJobs.find(j => j.id === woId);
        const onThisJob = (id: string) => id === woId || (!!job?.workOrderId && id === job.workOrderId);
        // Archived jobs aren't live-updated: patch the local copy so the
        // calculator's fields keep what was typed.
        if (extraJobs.some(j => j.id === woId)) setExtraJobs(prev => prev.map(j => j.id === woId ? { ...j, ...updates } : j));
        if (updates.finalPay !== undefined && localLog) {
            const updatedItems = (localLog.items || []).map(item =>
                onThisJob(item.workOrderId) ? { ...item, jobPay: updates.finalPay! } : item
            );

            try {
                const logRef = doc(db, 'weeklyLogs', localLog.id);
                await updateDoc(logRef, { items: updatedItems });
                setLocalLog({ ...localLog, items: updatedItems });
                if (isLogApproved) logReopenedPayEdit(localLog.id, localLog.weekOf);
                // NOTIFICATION DISPATCHED ONLY ON FORMAL COMMIT
                toast({ title: "Pay updated", description: "The new amount is on this weekly log." });
            } catch (e: any) {
                toast({ variant: 'destructive', title: 'Could not save', description: e.message });
            }
        }

        try {
            const asmtRef = doc(db, 'assignments', woId);
            const woRef = doc(db, 'workOrders', woId);
            await updateDoc(asmtRef, updates).catch(async () => {
                await updateDoc(woRef, updates).catch(async () => {
                    // Finished jobs archived to History.
                    await updateDoc(doc(db, 'activityArchive', woId), updates);
                });
            });
        } catch (e: any) {
            console.error("Weekly log update error", e);
        }
    }, [localLog, toast, isLogApproved, logReopenedPayEdit, allJobs, extraJobs]);

    // A manually-added missing job has no assignment/workOrder doc, so the pay
    // calc writes its results straight back onto the report inside the log.
    const auditMissingReport = useCallback(async (reportId: string, updates: Partial<WorkOrder>) => {
        if (!localLog) return;
        const updatedReports = (localLog.missingAssignmentReports || []).map(r =>
            r.id === reportId ? {
                ...r,
                pay: updates.pay ?? r.pay ?? 0,
                auditReimbursement: updates.auditReimbursement ?? r.auditReimbursement ?? 0,
                auditOverhead: updates.auditOverhead ?? r.auditOverhead ?? 0,
                finalPay: updates.finalPay ?? r.finalPay ?? 0,
                isAudited: true,
                auditedAt: new Date().toISOString(),
                auditedBy: auth.currentUser?.displayName || 'Admin',
            } : r
        );
        try {
            await updateDoc(doc(db, 'weeklyLogs', localLog.id), { missingAssignmentReports: updatedReports });
            setLocalLog({ ...localLog, missingAssignmentReports: updatedReports });
            if (isLogApproved) logReopenedPayEdit(localLog.id, localLog.weekOf);
            toast({ title: 'Pay updated', description: 'Pay for the added job is saved to the log.' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not save', description: e.message });
        }
    }, [localLog, toast, isLogApproved, logReopenedPayEdit]);

    // Toggles a CONFIRMED item's payroll-verified state. Never touches a
    // disputed item — a dispute is only cleared via acknowledgment or one of
    // the explicit overrides below, never by this "Verify" toggle.
    const toggleAuditItem = async (itemId: string, workOrderId: string) => {
        if (!localLog) return;

        const item = (localLog.items || []).find(i => i.id === itemId);
        if (!item || item.confirmationStatus === 'disputed') return;

        const nextStatus: 'confirmed' | null = item.confirmationStatus === 'confirmed' ? null : 'confirmed';
        const updatedItems = (localLog.items || []).map(i =>
            i.id === itemId ? { ...i, confirmationStatus: nextStatus, isAdminReviewed: !!nextStatus } : i
        );

        try {
            const logRef = doc(db, 'weeklyLogs', localLog.id);
            await updateDoc(logRef, { items: updatedItems });

            const asmtRef = doc(db, 'assignments', workOrderId);
            const woRef = doc(db, 'workOrders', workOrderId);

            const auditUpdates = {
                isAudited: !!nextStatus,
                auditedAt: nextStatus ? new Date().toISOString() : null,
                auditedBy: nextStatus ? 'Admin' : null
            };

            await updateDoc(asmtRef, auditUpdates).catch(async () => {
                await updateDoc(woRef, auditUpdates);
            });

            setLocalLog({ ...localLog, items: updatedItems });
            toast({ title: nextStatus ? "Job verified" : "Verification cleared", description: "Saved to the job's history." });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not save', description: e.message });
        }
    };

    // ── Log tools: move a job to another of this tech's logs, remove it, or
    // delete an emptied log. Admin-only, never on locked (approved/paid) logs.
    const otherOpenLogs = useMemo(() => {
        if (!localLog) return [] as WeeklyLog[];
        return allWeeklyLogs
            .filter(l => l.techId === localLog.techId && l.id !== localLog.id && !isLockedLog(l as any))
            .sort((a, b) => (b.weekOf || '').localeCompare(a.weekOf || ''));
    }, [allWeeklyLogs, localLog?.id, localLog?.techId]);

    const adminName = () => auth.currentUser?.displayName || authUser?.name || 'Admin';

    const handleMoveItem = async (item: WeeklyLogItem, toLogId: string) => {
        if (!localLog) return;
        setToolBusy(item.id);
        try {
            const fromRef = doc(db, 'weeklyLogs', localLog.id);
            const toRef = doc(db, 'weeklyLogs', toLogId);
            let toWeek = '';
            await runTransaction(db, async tx => {
                const [a, b] = await Promise.all([tx.get(fromRef), tx.get(toRef)]);
                if (!a.exists() || !b.exists()) throw new Error('Weekly log not found.');
                const from = a.data() as WeeklyLog & { history?: unknown[] };
                const to = b.data() as WeeklyLog & { history?: unknown[] };
                if (isLockedLog(from as any) || isLockedLog(to as any)) throw new Error('Approved or paid logs can\'t be changed.');
                const moving = (from.items || []).find(i => i.id === item.id);
                if (!moving) throw new Error('That job is no longer on this log.');
                if ((to.items || []).some(i => i.workOrderId === moving.workOrderId)) throw new Error('That job is already on the destination log.');
                const reimbs = (from.reimbursements || []).filter(r => r.workOrderId === moving.workOrderId);
                toWeek = to.weekOf;
                const stamp = { type: 'item_moved', workOrderId: moving.workOrderId, fromWeek: from.weekOf, toWeek: to.weekOf, by: adminName(), at: new Date().toISOString() };
                tx.update(fromRef, {
                    items: (from.items || []).filter(i => i.id !== item.id),
                    reimbursements: (from.reimbursements || []).filter(r => r.workOrderId !== moving.workOrderId),
                    history: [...(from.history || []), stamp],
                });
                tx.update(toRef, {
                    items: [...(to.items || []), moving],
                    reimbursements: [...(to.reimbursements || []), ...reimbs],
                    history: [...(to.history || []), stamp],
                });
            });
            setLocalLog(prev => prev ? { ...prev, items: (prev.items || []).filter(i => i.id !== item.id), reimbursements: (prev.reimbursements || []).filter(r => r.workOrderId !== item.workOrderId) } : prev);
            await auditEvent('weeklyLogs', localLog.id, auth.currentUser?.uid || '', adminName(), 'item_moved',
                `Moved ${item.workOrderId} from week of ${localLog.weekOf} to ${toLogId} (week of ${toWeek}).`).catch(() => {});
            toast({ title: 'Job moved', description: `Now on the week of ${toWeek}.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Move failed', description: e.message });
        } finally {
            setToolBusy(null);
        }
    };

    const handleRemoveItemTool = async (item: WeeklyLogItem) => {
        if (!localLog || !confirm(`Remove ${item.workOrderId} from this log? The job itself is not deleted.`)) return;
        setToolBusy(item.id);
        try {
            await removeLogItem(item.id);
            await auditEvent('weeklyLogs', localLog.id, auth.currentUser?.uid || '', adminName(), 'item_removed',
                `Removed ${item.workOrderId} from week of ${localLog.weekOf}.`).catch(() => {});
            toast({ title: 'Removed from log' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Remove failed', description: e.message });
        } finally {
            setToolBusy(null);
        }
    };

    const handleDeleteEmptyLog = async () => {
        if (!localLog || (localLog.items || []).length > 0 || (localLog.reimbursements || []).length > 0) return;
        if (!confirm(`Delete the empty log for the week of ${localLog.weekOf}?`)) return;
        setToolBusy('log');
        try {
            await deleteDoc(doc(db, 'weeklyLogs', localLog.id));
            await auditEvent('weeklyLogs', localLog.id, auth.currentUser?.uid || '', adminName(), 'deleted_empty',
                `Deleted empty log ${localLog.id} for week of ${localLog.weekOf}.`).catch(() => {});
            toast({ title: 'Log deleted' });
            setIsOpen(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Delete failed', description: e.message });
        } finally {
            setToolBusy(null);
        }
    };

    const removeLogItem = async (itemId: string) => {
        if (!localLog) return;
        const updatedItems = (localLog.items || []).filter(i => i.id !== itemId);
        await updateDoc(doc(db, 'weeklyLogs', localLog.id), { items: updatedItems });
        setLocalLog({ ...localLog, items: updatedItems });
    };

    // "I didn't do this job" → Yes: the job goes back to the Dispatch Hub for
    // reassignment (reset to unassigned) and is dropped from this log, so it's
    // never paid out here. Throws so the decision isn't recorded on failure.
    const returnJobToDispatch = async (item: WeeklyLogItem) => {
        if (!canOverrideDispute) throw new Error('You do not have permission to send jobs back to Dispatch.');
        const adminName = auth.currentUser?.displayName || 'Admin';
        const wo = findWorkOrder(item.workOrderId);
        if (!wo) throw new Error('The job record could not be found.');
        // Every unassigned job lives in the `workOrders` pool, not
        // `assignments` (see lib/jobs.ts) — migrate the doc back so it
        // actually surfaces in the Dispatch Hub's Unassigned tab.
        const target = toUnassignedWorkOrder(wo, [{
            type: 'status_change',
            date: format(new Date(), 'MM-dd-yyyy'),
            details: `Sent back to Dispatch Hub by ${adminName} — ${technician?.name || 'the tech'} said they didn't do this job.`,
            user: adminName,
        }]);
        await setDoc(doc(db, 'workOrders', target.id), sanitize(target));
        await deleteDoc(doc(db, 'assignments', item.workOrderId));
    };

    // ── Flagged jobs: one yes/no decision each (lib/disputes.ts) ──────────
    // Nothing is paid or removed until payroll clicks through the inline
    // confirm on the card. The confirm is inline rather than a stacked
    // AlertDialog for the same reason as the reopen banner above.
    const [decisionDraft, setDecisionDraft] = useState<{ id: string; decision: 'yes' | 'no'; note: string; moveTo: string; pay: string } | null>(null);
    const [decisionBusy, setDecisionBusy] = useState(false);
    const canDecide = canApproveLog && !isLogLockedForEdit;
    const techFirst = firstName(technician?.name);
    const weekShort = shortWeek(localLog?.weekOf);
    const logHistory = ((localLog as (WeeklyLog & { history?: any[] }) | null)?.history || []) as any[];

    const woLabelFor = useCallback((workOrderId: string) => {
        const wo = findWorkOrder(workOrderId);
        return `WO ${wo ? displayWorkOrderNumber(wo) : workOrderId.toUpperCase()}`;
    }, [findWorkOrder]);

    const makeResolution = (decision: 'yes' | 'no', note: string): DisputeResolution =>
        sanitize({ decision, note: note.trim() || undefined, by: adminName(), at: new Date().toISOString() });

    // Audit trail + an in-app notice to the tech for every decision.
    const announceDecision = (kind: DisputeKind, woLabel: string, resolution: DisputeResolution | null) => {
        if (!localLog) return;
        const text = (resolution ? DISPUTE_CARDS[kind].outcome(resolution.decision, resolution.note) : 'Payroll is taking another look').replace(/[.!?\s]+$/, '');
        auditEvent('weeklyLogs', localLog.id, auth.currentUser?.uid || '', adminName(),
            resolution ? 'dispute_decision' : 'dispute_decision_cleared',
            `${adminName()} ${resolution ? `answered ${resolution.decision.toUpperCase()}` : 'cleared the decision'} on ${woLabel} (${DISPUTE_CARDS[kind].title}) for ${technician?.name ?? localLog.techId}'s week of ${localLog.weekOf}. ${text}.`
        ).catch(() => {});
        if (resolution && localLog.techId) NotificationService.notify(localLog.techId, 'Payroll decided a flagged job',
            `${woLabel} on your week of ${shortWeek(localLog.weekOf)}: ${text}.`,
            { id: localLog.id, type: 'weeklyLog' }, { portal: 'tech', inAppOnly: true }).catch(() => {});
    };

    const decideItem = async (item: WeeklyLogItem, decision: 'yes' | 'no', note: string, moveTo?: string, baseItems?: WeeklyLogItem[]) => {
        if (!localLog || !canDecide || decisionBusy) return;
        const kind = disputeKindOf(item);
        const woLabel = woLabelFor(item.workOrderId);
        const resolution = makeResolution(decision, note);
        setDecisionBusy(true);
        try {
            const removes = (decision === 'yes' && (kind === 'duplicate' || kind === 'not_mine'))
                // Removed helper who didn't work it: the entry leaves the log.
                || (decision === 'no' && kind === 'removed_helper');
            if (removes) {
                // Only THIS line leaves the log. For a duplicate the job record
                // is never touched — the other copy stays and is paid.
                if (kind === 'not_mine') await returnJobToDispatch(item);
                const stamp = sanitize({ type: 'dispute_removed', itemId: item.id, workOrderId: item.workOrderId, kind, resolution, item, by: resolution.by, at: resolution.at });
                const items = (baseItems || localLog.items || []).filter(i => i.id !== item.id);
                await updateDoc(doc(db, 'weeklyLogs', localLog.id), { items: sanitize(items), history: arrayUnion(stamp) });
                setLocalLog({ ...localLog, items, history: [...logHistory, stamp] } as WeeklyLog);
            } else {
                // Keep it and pay (tech was wrong), or fixed (tech was right):
                // either way the job is confirmed and counts toward pay.
                const items = (baseItems || localLog.items || []).map(i => i.id === item.id
                    // helperRemoved clears too: a removed helper payroll says worked it is paid.
                    ? { ...i, confirmationStatus: 'confirmed' as const, isAdminReviewed: true, resolution, helperRemoved: null }
                    : i);
                await updateDoc(doc(db, 'weeklyLogs', localLog.id), { items: sanitize(items) });
                setLocalLog({ ...localLog, items });
                if (moveTo) await handleMoveItem(items.find(i => i.id === item.id)!, moveTo);
            }
            announceDecision(kind, woLabel, resolution);
            setDecisionDraft(null);
            toast({ title: 'Decision saved', description: DISPUTE_CARDS[kind].outcome(decision, note) });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not save decision', description: e.message });
        } finally {
            setDecisionBusy(false);
        }
    };

    const decideReport = async (report: MissingAssignmentReport, decision: 'yes' | 'no', note: string, pay?: Partial<WorkOrder>) => {
        if (!localLog || !canDecide || decisionBusy) return;
        const woLabel = report.externalWorkOrderId ? `WO ${report.externalWorkOrderId}` : `the missing job on ${report.date}`;
        const resolution = makeResolution(decision, note);
        setDecisionBusy(true);
        try {
            // Saying Yes promotes it to a real assignment: auto-generate its
            // assignment number the first time (the tech never enters one).
            const assignmentId = decision === 'yes' && !report.assignmentId ? await createDocId(ID_PREFIXES.ASSIGNMENT) : report.assignmentId;
            const reports = (localLog.missingAssignmentReports || []).map(r => r.id !== report.id ? r : sanitize({
                ...r,
                ...(decision === 'yes' ? {
                    pay: pay?.pay ?? r.pay ?? 0,
                    auditReimbursement: pay?.auditReimbursement ?? r.auditReimbursement ?? 0,
                    auditOverhead: pay?.auditOverhead ?? r.auditOverhead ?? 0,
                    finalPay: pay?.finalPay ?? r.finalPay ?? 0,
                    assignmentId,
                    auditedAt: resolution.at,
                    auditedBy: resolution.by,
                } : {}),
                isAudited: decision === 'yes',
                resolution,
            }));
            await updateDoc(doc(db, 'weeklyLogs', localLog.id), { missingAssignmentReports: reports });
            setLocalLog({ ...localLog, missingAssignmentReports: reports });
            announceDecision('missing', woLabel, resolution);
            setDecisionDraft(null);
            toast({ title: 'Decision saved', description: DISPUTE_CARDS.missing.outcome(decision, note) });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not save decision', description: e.message });
        } finally {
            setDecisionBusy(false);
        }
    };

    // "Change decision": puts the card back to undecided (until the log is
    // approved). A removed duplicate copy is put back on the log; pay figures
    // payroll entered are left as they are.
    const reopenDecision = async (target: { item?: WeeklyLogItem; report?: MissingAssignmentReport; removed?: any }) => {
        if (!localLog || !canDecide || decisionBusy) return;
        setDecisionBusy(true);
        try {
            if (target.report) {
                const reports = (localLog.missingAssignmentReports || []).map(r => r.id === target.report!.id ? { ...r, isAudited: false, resolution: null } : r);
                await updateDoc(doc(db, 'weeklyLogs', localLog.id), { missingAssignmentReports: sanitize(reports) });
                setLocalLog({ ...localLog, missingAssignmentReports: reports });
                announceDecision('missing', target.report.externalWorkOrderId ? `WO ${target.report.externalWorkOrderId}` : `the missing job on ${target.report.date}`, null);
            } else if (target.item) {
                const items = (localLog.items || []).map(i => i.id === target.item!.id ? { ...i, confirmationStatus: 'disputed' as const, isAdminReviewed: false, resolution: null } : i);
                await updateDoc(doc(db, 'weeklyLogs', localLog.id), { items: sanitize(items) });
                setLocalLog({ ...localLog, items });
                announceDecision(disputeKindOf(target.item), woLabelFor(target.item.workOrderId), null);
            } else if (target.removed?.item) {
                const restored = { ...target.removed.item, confirmationStatus: 'disputed', isAdminReviewed: false, resolution: null } as WeeklyLogItem;
                if ((localLog.items || []).some(i => i.id === restored.id)) return;
                const items = [...(localLog.items || []), restored];
                const stamp = { type: 'dispute_restored', itemId: restored.id, workOrderId: restored.workOrderId, by: adminName(), at: new Date().toISOString() };
                await updateDoc(doc(db, 'weeklyLogs', localLog.id), { items: sanitize(items), history: arrayUnion(stamp) });
                setLocalLog({ ...localLog, items, history: [...logHistory, stamp] } as WeeklyLog);
                announceDecision(target.removed.kind, woLabelFor(restored.workOrderId), null);
            }
            setDecisionDraft(null);
            toast({ title: 'Decision cleared', description: 'The card is back under Needs a decision.' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not change decision', description: e.message });
        } finally {
            setDecisionBusy(false);
        }
    };

    // A plain (non-Imported) job's pay is the log line's own amount.
    const handleSetItemPay = async (item: WeeklyLogItem, amount: number) => {
        if (!localLog || isLogLockedForEdit) return;
        const items = (localLog.items || []).map(i => i.id === item.id ? { ...i, jobPay: Math.max(0, Math.round(amount * 100) / 100) } : i);
        try {
            await updateDoc(doc(db, 'weeklyLogs', localLog.id), { items: sanitize(items) });
            setLocalLog({ ...localLog, items });
            toast({ title: 'Pay updated', description: 'The new amount is on this weekly log.' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not save', description: e.message });
        }
    };

    // Every way a job is identified (record id, original pool id, FN number),
    // so a duplicate or a "missing" job is found however it was filed.
    const jobKeysOf = useCallback((workOrderId: string): string[] => {
        const wo = findWorkOrder(workOrderId);
        const ext = wo ? externalWorkOrderId(wo) : '';
        return [workOrderId, wo?.workOrderId, ext && `ext:${ext}`].filter(Boolean).map(k => String(k).toLowerCase());
    }, [findWorkOrder]);

    /** Other lines for the same job on this tech's logs (this log first). */
    const findCopies = useCallback((keys: string[], excludeItemId?: string) => {
        if (!localLog) return [] as { item: WeeklyLogItem; weekOf: string; logStatus: string; sameLog: boolean }[];
        const want = new Set(keys.map(k => k.toLowerCase()));
        const logs = [localLog, ...allWeeklyLogs.filter(l => l.techId === localLog.techId && l.id !== localLog.id)];
        return logs.flatMap(l => (l.items || [])
            .filter(i => i.id !== excludeItemId && jobKeysOf(i.workOrderId).some(k => want.has(k)))
            .map(i => ({ item: i, weekOf: l.weekOf, logStatus: l.status, sameLog: l.id === localLog.id })));
    }, [localLog, allWeeklyLogs, jobKeysOf]);

    const handleOpenJobDetail = (wo: WorkOrder) => {
        setSelectedJobForDetail(wo);
        setIsJobDetailOpen(true);
    };

    const confirmedItems = useMemo(() => localLog?.items?.filter(item => item.confirmationStatus === 'confirmed' || !item.confirmationStatus) || [], [localLog]);
    // Flagged jobs: undecided ones block approval. A decided item stays on
    // its card (with "Change decision") until the log is approved.
    const flaggedItems = useMemo(() => (localLog?.items || []).filter(i => i.confirmationStatus === 'disputed' || !!i.resolution), [localLog]);
    const removedFlagged = useMemo(() => logHistory
        .filter(h => h?.type === 'dispute_removed' && h.item && !(localLog?.items || []).some(i => i.id === h.itemId))
        .filter((h, idx, all) => all.findIndex(x => x.itemId === h.itemId) === idx), [logHistory, localLog]);
    const isReportDecided = (r: MissingAssignmentReport) => !!r.isAudited || r.resolution?.decision === 'no';
    const undecidedCount = (localLog?.items || []).filter(i => i.confirmationStatus === 'disputed' && !i.resolution).length
        + (localLog?.missingAssignmentReports || []).filter(r => !isReportDecided(r)).length;
    const flaggedCount = flaggedItems.length + removedFlagged.length + (localLog?.missingAssignmentReports?.length || 0);

    const totalJobsCount = (localLog?.items?.length || 0) + (localLog?.missingAssignmentReports?.length || 0);
    const auditCompleteCount = (localLog?.items || []).filter(i => i.isAdminReviewed && i.confirmationStatus !== 'disputed').length + (localLog?.missingAssignmentReports || []).filter(isReportDecided).length;
    const isManifestFullyAudited = auditCompleteCount === totalJobsCount && totalJobsCount > 0;
    const canApproveNow = isManifestFullyAudited && undecidedCount === 0;


    // ── Flagged-job cards ─────────────────────────────────────────────────
    const plainLabel = (label: string) => { const t = label.replace(/^(Yes|No): /, ''); return t.charAt(0).toUpperCase() + t.slice(1); };

    type Check = { warn: boolean; text: string };
    const itemCheck = (item: WeeklyLogItem, kind: DisputeKind, wo: WorkOrder | undefined, copies: ReturnType<typeof findCopies>): Check => {
        if (kind === 'duplicate') {
            if (!copies.length) return { warn: true, text: `No other copy found. Removing it means ${techFirst} won't be paid for this job.` };
            return { warn: true, text: copies[0].sameLog ? 'This job is on this week twice.' : `This job is already on ${techFirst}'s week of ${shortWeek(copies[0].weekOf)}.` };
        }
        if (!wo) return { warn: true, text: 'No matching job record found.' };
        if (kind === 'not_mine') {
            if (item.isHelper) return { warn: false, text: `${techFirst} is listed as a helper on this job.` };
            const assigned = assignedTechOf(wo);
            if (assigned === localLog?.techId) return { warn: true, text: `The job record says ${techFirst} was the assigned tech.` };
            const who = allTechnicians.find(t => t.id === assigned)?.name;
            return { warn: true, text: assigned ? `The job record shows it's assigned to ${who || 'another tech'}.` : 'The job record has no tech assigned.' };
        }
        const sched = wo.scheduleDate || item.workDate;
        const facts = `Time on site: ${getHoursOnsite(wo.id)} · Pay: $${effectiveJobPay(item, wo).toFixed(2)}`;
        const schedWeek = sched ? weekOfForScheduleDate(sched) : '';
        if (schedWeek && schedWeek !== localLog?.weekOf) return { warn: true, text: `Scheduled ${sched}, which is the week of ${shortWeek(schedWeek)}, not this week. ${facts}` };
        return { warn: false, text: `Scheduled ${sched || '(no date)'}, in this week. ${facts}` };
    };

    const reportCheck = (report: MissingAssignmentReport): Check => {
        const ext = (report.externalWorkOrderId || '').trim().replace(/^wo-/i, '');
        if (!ext) return { warn: true, text: 'No WO number given. Check the details with the tech.' };
        const copies = findCopies([`ext:${ext}`, ext]);
        if (copies.length) return { warn: true, text: copies[0].sameLog ? 'This job is already on this week.' : `This job is already on ${techFirst}'s week of ${shortWeek(copies[0].weekOf)}.` };
        const job = missions.find(m => externalWorkOrderId(m).toLowerCase() === ext.toLowerCase());
        if (job) {
            const who = allTechnicians.find(t => t.id === assignedTechOf(job))?.name;
            return { warn: false, text: `Found "${job.title || 'this job'}" in the system${who ? `, assigned to ${who}` : ''}.` };
        }
        return { warn: true, text: 'No matching job found in the system.' };
    };

    const renderCheck = (c: Check) => (
        <p className={cn("text-[12px] leading-snug flex items-start gap-1.5 text-left", c.warn ? "text-accent-gold" : "text-text-muted")}>
            {c.warn ? <AlertTriangle size={13} className="shrink-0 mt-px" /> : <CheckCircle2 size={13} className="shrink-0 mt-px" />}
            <span className="min-w-0 break-words">{c.text}</span>
        </p>
    );

    const renderCardHead = (p: { kind: DisputeKind; woLabel: string; claim: string; note?: string; jobLine?: ReactNode; decided: boolean }) => (
        <div className="space-y-1 text-left min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[13px] font-semibold text-text-primary break-words min-w-0">{technician?.name} · {p.woLabel} · Week of {weekShort}</p>
                <Badge variant={p.decided ? 'approved' : 'disputed'} className="text-[10px] font-semibold uppercase tracking-wide px-1.5">{p.decided ? 'Decided' : DISPUTE_CARDS[p.kind].title}</Badge>
            </div>
            <p className="text-[13px] text-text-secondary break-words">{techFirst} says: <span className="font-semibold text-text-primary">&ldquo;{p.claim}&rdquo;</span></p>
            {p.note && <p className="text-[12px] italic text-text-secondary break-words">Their note: &ldquo;{p.note}&rdquo;</p>}
            {p.jobLine}
        </div>
    );

    const renderDecision = (p: {
        id: string;
        kind: DisputeKind;
        ctx: CardContext;
        resolution?: DisputeResolution | null;
        decidedExtra?: ReactNode;
        onChange?: () => void;
        changeBlockedText?: string;
        blockedReason?: string;
        yesConfirm: string;
        noConfirm: string;
        yesBody?: ReactNode;
        /** null: the yes body has its own commit button (pay box). */
        yesCommit: { label: string; disabled?: boolean } | null;
        yesNote?: boolean;
        onYes: () => void;
        onNo: (note: string) => void;
    }) => {
        const card = DISPUTE_CARDS[p.kind];
        if (p.resolution) {
            return (
                <div className={cn("rounded-lg border p-3 space-y-2 text-left", p.resolution.decision === 'yes' ? "border-green-border/40 bg-green-dim/20" : "border-border-sub bg-bg-tertiary/40")}>
                    <p className="text-[13px] font-semibold text-text-primary break-words">{card.outcome(p.resolution.decision, p.resolution.note)}</p>
                    <p className="text-[11px] text-text-muted">Decided by {p.resolution.by}{p.resolution.at ? ` · ${format(parseISO(p.resolution.at), 'MMM d, h:mm a')}` : ''}</p>
                    {p.decidedExtra}
                    {canDecide && (p.onChange ? (
                        <button type="button" disabled={decisionBusy} onClick={p.onChange} className="text-[12px] font-medium text-brand-blue hover:underline disabled:opacity-50">
                            Change decision
                        </button>
                    ) : p.changeBlockedText ? (
                        <p className="text-[12px] text-text-muted">{p.changeBlockedText}</p>
                    ) : null)}
                </div>
            );
        }
        const draft = decisionDraft?.id === p.id ? decisionDraft : null;
        if (!draft) {
            return (
                <div className="space-y-2 text-left">
                    <p className="text-[15px] font-semibold text-text-primary">{card.question(p.ctx)}</p>
                    {p.blockedReason && <p className="text-[12px] text-accent-gold">{p.blockedReason}</p>}
                    {!canApproveLog && <p className="text-[12px] text-text-muted">View only — you can’t decide flagged jobs.</p>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:max-w-xl">
                        <Button
                            className="h-11 sm:h-10 whitespace-normal bg-text-green hover:bg-text-green/90 text-white"
                            disabled={!canDecide || !!p.blockedReason || decisionBusy}
                            onClick={() => setDecisionDraft({ id: p.id, decision: 'yes', note: '', moveTo: '', pay: '' })}
                        >
                            <Check size={14} className="mr-1.5 shrink-0" /> {card.yesLabel}
                        </Button>
                        <Button
                            variant="outline"
                            className="h-11 sm:h-10 whitespace-normal border-brand-red/50 text-text-red hover:bg-brand-red-dim"
                            disabled={!canDecide || !!p.blockedReason || decisionBusy}
                            onClick={() => setDecisionDraft({ id: p.id, decision: 'no', note: '', moveTo: '', pay: '' })}
                        >
                            <X size={14} className="mr-1.5 shrink-0" /> {card.noLabel}
                        </Button>
                    </div>
                </div>
            );
        }
        const isYes = draft.decision === 'yes';
        return (
            <div className="rounded-lg border-2 border-accent-gold/50 bg-accent-gold/5 p-3 space-y-3 text-left">
                <p className="text-[13px] font-semibold text-text-primary break-words">{isYes ? p.yesConfirm : p.noConfirm}</p>
                {isYes && p.yesBody}
                {(!isYes || p.yesNote) && (
                    <div className="space-y-1">
                        <Label className="text-[12px] font-medium text-text-muted">{isYes ? 'What did you change? (optional — the tech will see this)' : 'Why? (required — the tech will see this)'}</Label>
                        <Textarea
                            value={draft.note}
                            onChange={e => setDecisionDraft({ ...draft, note: e.target.value })}
                            placeholder={isYes ? 'e.g. Pay corrected to $150' : 'e.g. Dispatch shows Bob did this job'}
                            className="min-h-[64px] text-[13px] bg-bg-primary"
                        />
                    </div>
                )}
                <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
                    <Button variant="outline" className="h-10" disabled={decisionBusy} onClick={() => setDecisionDraft(null)}>Cancel</Button>
                    {!isYes ? (
                        <Button className="h-10 whitespace-normal" disabled={decisionBusy || !draft.note.trim()} onClick={() => p.onNo(draft.note)}>
                            {decisionBusy ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <X size={13} className="mr-1.5" />} {plainLabel(card.noLabel)}
                        </Button>
                    ) : p.yesCommit && (
                        <Button className="h-10 whitespace-normal" disabled={decisionBusy || p.yesCommit.disabled} onClick={p.onYes}>
                            {decisionBusy ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Check size={13} className="mr-1.5" />} {p.yesCommit.label}
                        </Button>
                    )}
                </div>
            </div>
        );
    };

    const renderReimbursements = (rs: FinancialRecord[]) => rs.length > 0 && (
        <div className="flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
            {rs.map(r => (
                <div key={r.id} className={cn(
                    "flex flex-wrap items-center justify-between gap-2 p-2 rounded-md border text-left",
                    r.status === 'pending' ? "bg-accent-gold/5 border-accent-gold/30" : r.status === 'approved' ? "bg-text-green/5 border-text-green/20" : "bg-brand-red/5 border-brand-red/20"
                )}>
                    <div className="min-w-0 flex items-center gap-2">
                        <Receipt size={11} className="shrink-0 text-text-muted" />
                        <p className="text-[12px] font-medium text-text-primary truncate">{r.description}</p>
                        <span className="text-[12px] font-mono font-semibold text-accent-gold shrink-0">${r.amount.toFixed(2)}</span>
                    </div>
                    {r.status === 'pending' ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                            <Button size="sm" variant="outline" className="h-7 px-2 text-text-green border-text-green/30 hover:bg-text-green/10" onClick={() => reviewReimbursement(r.id, 'approved')}>Approve</Button>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-text-red border-brand-red/30 hover:bg-brand-red/10" onClick={() => reviewReimbursement(r.id, 'rejected')}>Reject</Button>
                        </div>
                    ) : (
                        <StatusBadge kind="log" value={r.status || 'approved'} className="shrink-0" />
                    )}
                </div>
            ))}
        </div>
    );

    const renderCopy = (label: string, item: WeeklyLogItem, extra: string) => {
        const wo = findWorkOrder(item.workOrderId);
        return (
            <div className="rounded-md border border-border-sub bg-bg-primary p-2.5 text-left min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{label}</p>
                <p className="text-[13px] font-semibold text-text-primary break-words mt-0.5">{wo?.title || woLabelFor(item.workOrderId)}</p>
                <p className="text-[12px] text-text-muted break-words">{woLabelFor(item.workOrderId)} · {wo?.scheduleDate || item.workDate || 'No date'}</p>
                <p className="text-[12px] text-text-muted">Pay <span className="font-mono font-semibold text-text-green">${effectiveJobPay(item, wo).toFixed(2)}</span> · {extra}</p>
            </div>
        );
    };

    const itemStateLabel = (i: WeeklyLogItem) => i.confirmationStatus === 'disputed' ? 'flagged' : i.confirmationStatus === 'confirmed' ? 'confirmed' : 'not confirmed yet';

    const renderItemCard = (item: WeeklyLogItem) => {
        const kind = disputeKindOf(item);
        const card = DISPUTE_CARDS[kind];
        const wo = findWorkOrder(item.workOrderId);
        const woLabel = woLabelFor(item.workOrderId);
        const ctx: CardContext = { tech: techFirst, wo: woLabel, week: weekShort };
        const reimbs = getJobReimbursements(item.workOrderId);
        const hasPendingReimb = reimbs.some(r => r.status === 'pending');
        const approvedReimbTotal = reimbs.filter(r => r.status === 'approved').reduce((acc, r) => acc + money(r.amount), 0);
        const copies = kind === 'duplicate' ? findCopies(jobKeysOf(item.workOrderId), item.id) : [];
        const decided = !!item.resolution;
        const draft = decisionDraft?.id === item.id ? decisionDraft : null;
        const assigned = wo ? assignedTechOf(wo) : undefined;
        const assignedElsewhere = !!assigned && assigned !== localLog?.techId ? (allTechnicians.find(t => t.id === assigned)?.name || 'another tech') : '';
        const moveLog = draft?.moveTo ? otherOpenLogs.find(l => l.id === draft.moveTo) : undefined;
        const isImported = wo?.source === 'Imported';

        let yesConfirm = card.yesConfirm(ctx);
        if (kind === 'duplicate' && !copies.length) yesConfirm = `Remove ${woLabel} from ${techFirst}'s week of ${weekShort}? No other copy was found, so ${techFirst} won't be paid for this job.`;
        if (kind === 'not_mine' && assignedElsewhere) yesConfirm += ` It is assigned to ${assignedElsewhere}, so this also takes it off ${assignedElsewhere}'s schedule.`;

        const payOrDateBody = kind === 'pay_or_date' && (
            <div className="space-y-3">
                <div className="space-y-1">
                    <p className="text-[12px] font-medium text-text-muted">Pay</p>
                    {isImported && wo ? (
                        <>
                            <ImportedJobAudit wo={wo} onUpdateWorkOrder={handleUpdateWorkOrder} approvedReimbTotal={approvedReimbTotal} isLocked={isLogLockedForEdit} />
                            <p className="text-[11px] text-text-muted">Changed the pay? Press Save in the pay box first.</p>
                        </>
                    ) : (
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <DollarSign size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-text-muted" />
                                <Input
                                    type="number"
                                    value={draft?.pay ?? ''}
                                    placeholder={(item.jobPay || 0).toFixed(2)}
                                    onChange={e => draft && setDecisionDraft({ ...draft, pay: e.target.value })}
                                    className="h-9 w-32 text-[13px] pl-5 bg-bg-primary font-mono"
                                />
                            </div>
                            <span className="text-[12px] text-text-muted">now ${(item.jobPay || 0).toFixed(2)}</span>
                        </div>
                    )}
                </div>
                <div className="space-y-1">
                    <p className="text-[12px] font-medium text-text-muted">Week</p>
                    <select
                        className="h-9 w-full sm:w-auto max-w-full rounded-md border border-border-main bg-bg-primary text-[13px] px-2"
                        value={draft?.moveTo || ''}
                        disabled={otherOpenLogs.length === 0}
                        onChange={e => draft && setDecisionDraft({ ...draft, moveTo: e.target.value })}
                    >
                        <option value="">Keep on the week of {weekShort}</option>
                        {otherOpenLogs.map(l => <option key={l.id} value={l.id}>Move to the week of {shortWeek(l.weekOf)} · {l.status}</option>)}
                    </select>
                    {otherOpenLogs.length === 0 && <p className="text-[11px] text-text-muted">{techFirst} has no other open week to move it to.</p>}
                </div>
            </div>
        );

        const onYes = async () => {
            if (kind === 'pay_or_date' && draft) {
                if (moveLog && (moveLog.items || []).some(i => i.workOrderId === item.workOrderId)) {
                    toast({ variant: 'destructive', title: 'Already on that week', description: `${woLabel} is already on the week of ${shortWeek(moveLog.weekOf)}.` });
                    return;
                }
                const newPay = draft.pay.trim() === '' ? null : parseFloat(draft.pay);
                if (!isImported && newPay !== null) {
                    if (!Number.isFinite(newPay) || newPay < 0) { toast({ variant: 'destructive', title: 'Enter a valid pay amount' }); return; }
                    // New pay and the decision go in one write.
                    const items = (localLog!.items || []).map(i => i.id === item.id ? { ...i, jobPay: Math.round(newPay * 100) / 100 } : i);
                    return decideItem(items.find(i => i.id === item.id)!, 'yes', draft.note, draft.moveTo || undefined, items);
                }
                return decideItem(item, 'yes', draft.note, draft.moveTo || undefined);
            }
            return decideItem(item, 'yes', '');
        };

        return (
            <div key={item.id} className={cn(
                "p-3 sm:p-4 rounded-xl border border-l-4 shadow-sm flex flex-col gap-3 text-left min-w-0",
                decided ? "bg-bg-primary border-green-border/40 border-l-[color:var(--text-green)]" : "bg-bg-secondary border-brand-red/30 border-l-[color:var(--brand-red)]"
            )}>
                {renderCardHead({
                    kind, woLabel, decided,
                    claim: isLegacyOtherReason(item) ? (item.disputeReason || card.claim) : card.claim,
                    note: item.disputeNotes || undefined,
                    jobLine: (
                        <button type="button" className="text-[12px] text-text-muted hover:text-text-primary text-left break-words" onClick={() => wo && handleOpenJobDetail(wo)}>
                            {wo?.title || 'Job details not found'}{wo?.location ? ` · ${formatCityState(wo.location)}` : ''}{wo?.scheduleDate ? ` · ${wo.scheduleDate}` : ''}
                            {wo && <ExternalLink size={10} className="inline ml-1" />}
                        </button>
                    ),
                })}
                {renderCheck(itemCheck(item, kind, wo, copies))}
                {kind === 'duplicate' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {renderCopy('This copy (flagged)', item, `week of ${weekShort}`)}
                        {copies.map(c => (
                            <div key={`${c.weekOf}-${c.item.id}`}>
                                {renderCopy(c.sameLog ? 'Other copy · this week' : `Other copy · week of ${shortWeek(c.weekOf)}`, c.item, `${itemStateLabel(c.item)} · log ${c.logStatus}`)}
                            </div>
                        ))}
                    </div>
                )}
                {renderDecision({
                    id: item.id, kind, ctx,
                    resolution: item.resolution,
                    onChange: () => reopenDecision({ item }),
                    blockedReason: hasPendingReimb ? 'Approve or reject the reimbursement below first.' : undefined,
                    yesConfirm,
                    noConfirm: card.noConfirm(ctx),
                    yesBody: payOrDateBody || undefined,
                    yesNote: kind === 'pay_or_date',
                    yesCommit: kind === 'not_mine' && !canOverrideDispute
                        ? { label: 'You can’t send jobs back to Dispatch', disabled: true }
                        : { label: kind === 'pay_or_date' ? (moveLog ? `Move to the week of ${shortWeek(moveLog.weekOf)} and mark fixed` : 'Mark as fixed') : plainLabel(card.yesLabel) },
                    onYes,
                    onNo: note => decideItem(item, 'no', note),
                })}
                {renderReimbursements(reimbs)}
            </div>
        );
    };

    const renderRemovedCard = (h: any) => {
        const item = h.item as WeeklyLogItem;
        const kind = (h.kind || disputeKindOf(item)) as DisputeKind;
        const woLabel = woLabelFor(item.workOrderId);
        return (
            <div key={`removed-${h.itemId}`} className="p-3 sm:p-4 rounded-xl border border-l-4 shadow-sm flex flex-col gap-3 text-left min-w-0 bg-bg-primary border-green-border/40 border-l-[color:var(--text-green)]">
                {renderCardHead({ kind, woLabel, decided: true, claim: DISPUTE_CARDS[kind].claim, note: item.disputeNotes || undefined })}
                {renderDecision({
                    id: `removed-${h.itemId}`, kind, ctx: { tech: techFirst, wo: woLabel, week: weekShort },
                    resolution: h.resolution,
                    onChange: kind === 'duplicate' ? () => reopenDecision({ removed: h }) : undefined,
                    changeBlockedText: kind === 'not_mine' ? 'Sent back to Dispatch. If that was a mistake, reassign it from Dispatch.' : undefined,
                    yesConfirm: '', noConfirm: '', yesCommit: null, onYes: () => {}, onNo: () => {},
                })}
            </div>
        );
    };

    const renderReportCard = (report: MissingAssignmentReport) => {
        const woLabel = report.externalWorkOrderId ? `WO ${report.externalWorkOrderId}` : `the missing job on ${report.date}`;
        const ctx: CardContext = { tech: techFirst, wo: woLabel, week: weekShort };
        const isImportedReport = report.jobType === 'Imported';
        const draft = decisionDraft?.id === report.id ? decisionDraft : null;
        // Synthetic work order so the imported pay calc + FN link work
        // without an assignment/workOrder doc (there is none).
        const reportWo = {
            id: report.id,
            source: 'Imported',
            externalWorkOrderId: report.externalWorkOrderId,
            pay: report.pay || 0,
            payType: 'fixed',
            auditReimbursement: report.auditReimbursement || 0,
            auditOverhead: report.auditOverhead || 0,
            clientName: report.clientName,
            title: report.summary,
            location: report.location,
            scheduleDate: report.date,
        } as WorkOrder;
        // Older reports approved before decisions existed count as a Yes.
        const resolution: DisputeResolution | null = report.resolution
            || (report.isAudited ? { decision: 'yes', by: report.auditedBy || 'Payroll', at: report.auditedAt || '' } : null);
        const manualPay = draft?.pay.trim() ? parseFloat(draft.pay) : (report.pay || 0);
        const payBox = (onCommit: (u: Partial<WorkOrder>) => void, commitLabel?: string) => isImportedReport ? (
            <ImportedJobAudit wo={reportWo} onUpdateWorkOrder={(_id, u) => onCommit(u)} approvedReimbTotal={0} isLocked={isLogLockedForEdit} commitLabel={commitLabel} />
        ) : null;

        return (
            <div key={report.id} className={cn(
                "p-3 sm:p-4 rounded-xl border border-l-4 shadow-sm flex flex-col gap-3 text-left min-w-0",
                resolution ? "bg-bg-primary border-green-border/40 border-l-[color:var(--text-green)]" : "bg-bg-secondary border-accent-gold/40 border-l-[color:var(--accent-gold)]"
            )}>
                {renderCardHead({
                    kind: 'missing', woLabel, decided: !!resolution,
                    claim: DISPUTE_CARDS.missing.claim,
                    note: report.summary,
                    jobLine: (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-text-muted">
                            <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wide px-1.5">{report.jobType || 'Manual'}</Badge>
                            {report.clientName && <span>{report.clientName}</span>}
                            {isImportedReport && report.externalWorkOrderId && (
                                <a href={fieldNationUrl(reportWo)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-brand-red hover:underline">
                                    Open in Field Nation <ExternalLink size={11} />
                                </a>
                            )}
                            {report.assignmentId && <span className="font-mono text-brand-red">Assignment #{report.assignmentId.toUpperCase()}</span>}
                            <span className="break-words">{report.date}{report.time ? ` · ${report.time}` : ''} · {formatCityState(report.location)}</span>
                            {report.pay != null && <span>Tech says pay: <span className="font-mono text-text-green">${report.pay.toFixed(2)}</span></span>}
                        </div>
                    ),
                })}
                {renderCheck(reportCheck(report))}
                {renderDecision({
                    id: report.id, kind: 'missing', ctx, resolution,
                    onChange: () => reopenDecision({ report }),
                    decidedExtra: resolution?.decision === 'yes' && (
                        <div className="space-y-1">
                            <p className="text-[12px] font-medium text-text-muted">Pay for this job</p>
                            {isImportedReport ? payBox(u => auditMissingReport(report.id, u)) : (
                                <div className="flex items-center gap-2">
                                    <div className="relative">
                                        <DollarSign size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-text-muted" />
                                        <Input
                                            type="number"
                                            defaultValue={report.pay || 0}
                                            disabled={isLogLockedForEdit}
                                            onBlur={(e) => { const v = parseFloat(e.target.value) || 0; if (v !== (report.pay || 0)) auditMissingReport(report.id, { pay: v, finalPay: v }); }}
                                            className="h-8 w-28 text-[13px] pl-5 bg-bg-secondary font-mono border border-border-sub disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                    </div>
                                    <span className="text-[12px] text-text-muted">to the tech</span>
                                </div>
                            )}
                        </div>
                    ),
                    yesConfirm: DISPUTE_CARDS.missing.yesConfirm(ctx),
                    noConfirm: DISPUTE_CARDS.missing.noConfirm(ctx),
                    yesBody: isImportedReport ? payBox(u => decideReport(report, 'yes', '', u), 'Add it and pay') : (
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <DollarSign size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-text-muted" />
                                <Input
                                    type="number"
                                    value={draft?.pay ?? ''}
                                    placeholder={(report.pay || 0).toFixed(2)}
                                    onChange={e => draft && setDecisionDraft({ ...draft, pay: e.target.value })}
                                    className="h-9 w-32 text-[13px] pl-5 bg-bg-primary font-mono"
                                />
                            </div>
                            <span className="text-[12px] text-text-muted">to the tech</span>
                        </div>
                    ),
                    yesCommit: isImportedReport ? null : {
                        label: `Add it and pay $${(Number.isFinite(manualPay) ? manualPay : 0).toFixed(2)}`,
                        disabled: !Number.isFinite(manualPay) || manualPay < 0,
                    },
                    onYes: () => decideReport(report, 'yes', '', { pay: manualPay, finalPay: manualPay }),
                    onNo: note => decideReport(report, 'no', note),
                })}
            </div>
        );
    };

    if (!localLog || !technician) return null;

    return (
        <>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="w-screen max-w-full h-[100dvh] rounded-none border-0 bg-bg-elevated flex flex-col p-0 overflow-y-auto sm:overflow-hidden shadow-xl text-left">
                    <DialogHeader className="px-4 sm:px-8 pt-4 sm:pt-6 pb-4 border-b border-border-sub bg-bg-secondary text-left shrink-0 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                <Avatar className="h-11 w-11 sm:h-12 sm:w-12 border-2 border-border-main shrink-0">
                                    <AvatarImage src={technician.avatarUrl} />
                                    <AvatarFallback className="font-bold">{technician.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="text-left min-w-0">
                                    <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Weekly log review</p>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <DialogTitle className="text-lg sm:text-xl font-semibold text-text-primary text-left leading-tight">{technician.name}</DialogTitle>
                                        {localLog.unsubmitRequested && (
                                            <Badge variant="disputed" className="text-[10px] font-semibold uppercase tracking-wide">Unsubmit requested</Badge>
                                        )}
                                    </div>
                                    <DialogDescription className="text-[12px] text-text-muted text-left">
                                        Week of <span className="font-semibold text-text-primary">{(() => { try { const [m, d, y] = (localLog.weekOf || '').split('-'); return format(new Date(+y, +m - 1, +d), 'MMMM d, yyyy'); } catch { return localLog.weekOf; } })()}</span>
                                        {' · '}{totalJobsCount} {totalJobsCount === 1 ? 'job' : 'jobs'}
                                        {localLog.submittedAt && <> · Submitted {format(parseISO(localLog.submittedAt), 'MMM d, h:mm a')}</>}
                                    </DialogDescription>
                                </div>
                            </div>
                            <StatusBadge kind="log" value={logDisplayStatus(localLog)} className="h-7 px-3 shrink-0 self-start sm:self-center" />
                        </div>
                        {/* Summary strip */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                            <div className="rounded-xl border border-border-main bg-bg-primary px-3 py-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Verified</p>
                                <p className={cn("text-lg font-bold tabular-nums leading-tight", isManifestFullyAudited ? "text-text-green" : "text-accent-gold")}>{auditCompleteCount} <span className="text-[11px] text-text-muted font-semibold">of {totalJobsCount}</span></p>
                                <div className="mt-1.5 h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                                    <div className={cn("h-full rounded-full transition-all", isManifestFullyAudited ? "bg-text-green" : "bg-accent-gold")} style={{ width: `${totalJobsCount ? Math.round((auditCompleteCount / totalJobsCount) * 100) : 0}%` }} />
                                </div>
                            </div>
                            <div className="rounded-xl border border-border-main bg-bg-primary px-3 py-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Needs a decision</p>
                                <p className={cn("text-lg font-bold tabular-nums leading-tight", undecidedCount ? "text-brand-red" : "text-text-primary")}>{undecidedCount}</p>
                            </div>
                            <div className="rounded-xl border border-border-main bg-bg-primary px-3 py-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Reimb. waiting</p>
                                {(() => { const n = (localLog.reimbursements || []).filter(x => x.status === 'pending').length; return (
                                    <p className={cn("text-lg font-bold tabular-nums leading-tight", n ? "text-accent-gold" : "text-text-primary")}>{n}</p>
                                ); })()}
                            </div>
                            <div className="rounded-xl border border-green-border/40 bg-green-dim/40 px-3 py-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-green">Total pay</p>
                                <p className="text-lg font-bold font-mono tabular-nums text-text-green leading-tight">${calculatedTotalPayout.toFixed(2)}</p>
                            </div>
                        </div>
                        <LogApprovalHistory key={localLog.id} logId={localLog.id} submittedAt={localLog.submittedAt} />
                    </DialogHeader>

                    {!isLogApproved && !isLockedLog(localLog as any) && canOverrideDispute && (
                        <div className="px-3 sm:px-4 py-2 border-b border-border-sub shrink-0 bg-bg-tertiary/30">
                            <button onClick={() => setToolsOpen(o => !o)} className="text-[12px] font-medium text-text-muted hover:text-text-primary flex items-center gap-1.5">
                                <Wrench size={13} /> Log tools {toolsOpen ? '▾' : '▸'}
                            </button>
                            {toolsOpen && (
                                <div className="mt-2 space-y-1.5">
                                    {(localLog.items || []).length === 0 && (
                                        <p className="text-[12px] text-text-muted">No jobs on this log.</p>
                                    )}
                                    {(localLog.items || []).map(item => {
                                        const m = findWorkOrder(item.workOrderId);
                                        return (
                                            <div key={item.id} className="flex flex-wrap items-center gap-2 text-[12px]">
                                                <span className="font-mono font-bold text-text-primary">{item.workOrderId.toUpperCase()}</span>
                                                <span className="text-text-muted truncate max-w-[220px]">{m?.title || ''}</span>
                                                <select
                                                    className="ml-auto h-8 rounded-md border border-border-main bg-bg-primary text-[12px] px-2"
                                                    value=""
                                                    disabled={!!toolBusy || otherOpenLogs.length === 0}
                                                    onChange={e => e.target.value && handleMoveItem(item, e.target.value)}
                                                >
                                                    <option value="">{otherOpenLogs.length ? 'Move to…' : 'No other open logs'}</option>
                                                    {otherOpenLogs.map(l => (
                                                        <option key={l.id} value={l.id}>Week of {l.weekOf} · {l.status}</option>
                                                    ))}
                                                </select>
                                                <Button size="sm" variant="ghost" className="h-8 px-2 text-text-muted hover:text-text-red"
                                                    disabled={!!toolBusy} onClick={() => handleRemoveItemTool(item)}>
                                                    {toolBusy === item.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Remove
                                                </Button>
                                            </div>
                                        );
                                    })}
                                    {(localLog.items || []).length === 0 && (localLog.reimbursements || []).length === 0 && (
                                        superAdmin ? (
                                            <Button size="sm" variant="destructive"
                                                disabled={!!toolBusy} onClick={handleDeleteEmptyLog}>
                                                {toolBusy === 'log' ? <Loader2 size={11} className="mr-1.5 animate-spin" /> : <Trash2 size={11} className="mr-1.5" />} Delete empty log
                                            </Button>
                                        ) : (
                                            <p className="text-[12px] text-text-muted">A super admin can delete this empty log.</p>
                                        )
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {isLogApproved && (
                        <div className="flex flex-wrap items-center justify-between gap-3 px-3 sm:px-4 py-2 border-b border-border-sub shrink-0 text-[12px] bg-bg-tertiary/50 text-text-muted">
                            <span className="flex items-center gap-1.5">
                                <Lock size={12} />
                                {reopenConfirming
                                    ? "Move this log back to Submitted? Entered figures are kept; re-approve after editing."
                                    : "This log is approved and locked from editing."}
                            </span>
                            {canOverrideDispute && (reopenConfirming ? (
                                <div className="flex items-center gap-2 shrink-0">
                                    <Button variant="outline" size="sm" className="h-8" disabled={reopening} onClick={() => setReopenConfirming(false)}>
                                        Cancel
                                    </Button>
                                    <Button size="sm" className="h-8" disabled={reopening} onClick={handleReopenToSubmitted}>
                                        {reopening ? <Loader2 size={11} className="mr-1.5 animate-spin" /> : <Unlock size={11} className="mr-1.5" />} Confirm reopen
                                    </Button>
                                </div>
                            ) : (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 shrink-0"
                                    onClick={() => setReopenConfirming(true)}
                                >
                                    <Unlock size={11} className="mr-1.5" /> Reopen to edit
                                </Button>
                            ))}
                        </div>
                    )}

                    <Tabs defaultValue={undecidedCount > 0 ? 'discrepancy' : 'verified'} className="flex flex-col sm:flex-1 sm:min-h-0 sm:overflow-hidden">
                        <div className="px-4 sm:px-8 border-b border-border-sub bg-bg-secondary flex flex-col sm:flex-row sm:justify-between sm:items-center shrink-0">
                            <TabsList className="h-auto min-h-11 sm:h-12 bg-transparent p-0 gap-x-5 sm:gap-8 justify-start w-full sm:w-auto">
                                <TabsTrigger value="verified" className="tab-trigger-payroll flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0">
                                    <CheckCircle2 size={14} />
                                    <span>Jobs</span>
                                    <span className="ml-1 opacity-50">({confirmedItems.length})</span>
                                </TabsTrigger>
                                <TabsTrigger value="discrepancy" className="tab-trigger-payroll flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0">
                                    <ShieldAlert size={14} />
                                    <span>Needs a decision</span>
                                    <span className={cn("ml-1", undecidedCount ? "text-brand-red font-semibold" : "opacity-50")}>({undecidedCount})</span>
                                </TabsTrigger>
                                {payrollDisputes.length > 0 && (
                                    <TabsTrigger value="post-approval" className="tab-trigger-payroll flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0">
                                        <AlertTriangle size={14} />
                                        <span>After approval</span>
                                        <span className="ml-1 opacity-50">({payrollDisputes.filter(d => d.status === 'open').length})</span>
                                    </TabsTrigger>
                                )}
                            </TabsList>
                        </div>

                        <div className="relative sm:flex-1 sm:min-h-0 sm:overflow-hidden">
                            <TabsContent value="verified" className="m-0 h-full text-left">
                                <ScrollArea className="p-3 sm:p-6 sm:h-full sm:min-h-0">
                                    <div className="space-y-3 max-w-6xl mx-auto">
                                        {localLog.unsubmitRequested && (
                                            <div className="p-3 rounded-xl border border-border-alert bg-brand-red-dim/40 flex items-start gap-3 mb-2">
                                                <AlertCircle size={18} className="text-text-red shrink-0 mt-0.5" />
                                                <div className="space-y-1 text-left flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-[13px] font-semibold text-text-red">Tech asked to unsubmit this log</p>
                                                        <span className="text-[11px] text-text-muted">{localLog.unsubmitRequestedAt ? format(parseISO(localLog.unsubmitRequestedAt), 'MMM d, h:mm a') : ''}</span>
                                                    </div>
                                                    <p className="text-[13px] text-text-secondary leading-relaxed text-left">Reason: {localLog.unsubmitReason || 'None given'}</p>
                                                    <div className="pt-1.5">
                                                        {canReturnLog ? (
                                                            <Button
                                                                size="sm"
                                                                className="h-8 px-3"
                                                                onClick={handleApproveUnsubmit}
                                                            >
                                                                <Undo2 size={12} className="mr-1.5"/> Approve unsubmit
                                                            </Button>
                                                        ) : (
                                                            <p className="text-[12px] text-text-muted">You need permission to return weekly logs to approve this.</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {confirmedItems.length > 0 ? confirmedItems.map(item => {
                                            const wo = findWorkOrder(item.workOrderId);
                                            const isImported = wo?.source === 'Imported';
                                            const isAudited = item.isAdminReviewed;
                                            const displayTitle = wo?.title || wo?.description || (extraLoading ? 'Loading job details…' : 'Job record not found — pay shown from the log');
                                            const helperNames = getHelperNames(wo);
                                            const jobReimbursements = getJobReimbursements(wo?.id);
                                            const hasPendingReimb = jobReimbursements.some(r => r.status === 'pending');
                                            const approvedReimbTotal = jobReimbursements.filter(r => r.status === 'approved').reduce((acc, r) => acc + money(r.amount), 0);

                                            return (
                                                <div key={item.id} className={cn(
                                                    "p-3 sm:p-4 rounded-xl border border-l-4 transition-all flex flex-col gap-3 group shadow-sm",
                                                    isAudited ? "bg-bg-primary border-green-border/40 border-l-[color:var(--text-green)]" : "bg-bg-secondary border-border-sub border-l-[color:var(--accent-gold)] hover:border-text-muted"
                                                )}>
                                                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:min-h-[3rem] sm:items-center cursor-pointer" onClick={() => wo && handleOpenJobDetail(wo)}>
                                                    <div className="order-2 sm:order-1 shrink-0 flex items-center gap-2 sm:pr-2 sm:border-r border-border-sub/30" onClick={e => e.stopPropagation()}>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={hasPendingReimb}
                                                            title={hasPendingReimb ? 'Locked: pending reimbursement must be approved first' : undefined}
                                                            className={cn(
                                                                "w-full sm:w-auto h-9 sm:h-8 px-3 transition-all",
                                                                isAudited ? "bg-text-green text-white border-text-green" : "border-border-sub text-text-muted hover:border-text-green",
                                                                hasPendingReimb && "opacity-40 cursor-not-allowed hover:border-border-sub"
                                                            )}
                                                            onClick={() => !hasPendingReimb && toggleAuditItem(item.id, item.workOrderId)}
                                                        >
                                                            {hasPendingReimb ? <Lock size={12} className="mr-1"/> : isAudited ? <Check size={12} className="mr-1"/> : <ClipboardCheck size={12} className="mr-1"/>}
                                                            {hasPendingReimb ? 'Locked' : isAudited ? 'Verified' : 'Verify'}
                                                        </Button>
                                                    </div>

                                                    <div className={cn("order-1 sm:order-2 flex-1 flex flex-col gap-2", !isImported && "sm:flex-row sm:items-center sm:justify-between")}>
                                                        <div className="min-w-0 text-left">
                                                            <div className="flex items-center gap-2 text-left flex-wrap">
                                                                <p className="text-[13px] font-semibold text-text-primary break-words text-left">{displayTitle}</p>
                                                                {isImported && <Badge variant="info" className="text-[10px] font-semibold uppercase tracking-wide px-1.5">Imported</Badge>}
                                                                {item.isHelper && (
                                                                    <CounterpartPayBadge workOrderId={item.workOrderId} wantHelper={false} allWeeklyLogs={allWeeklyLogs} allTechnicians={allTechnicians} />
                                                                )}
                                                                {helperNames.length > 0 && (
                                                                    <CounterpartPayBadge workOrderId={item.workOrderId} wantHelper={true} allWeeklyLogs={allWeeklyLogs} allTechnicians={allTechnicians} />
                                                                )}
                                                                {hasPendingReimb && (
                                                                    <Badge variant="pending" className="text-[10px] font-semibold uppercase tracking-wide px-1.5">
                                                                        Reimb. pending
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[12px] text-text-muted text-left">
                                                                {wo ? (
                                                                    <WorkOrderId wo={wo} className="!text-[11px]" />
                                                                ) : (
                                                                    <span className="text-brand-red font-mono font-bold">{(item.workOrderId || '').toUpperCase()}</span>
                                                                )}
                                                                <span>•</span>
                                                                <span>{wo?.location ? formatCityState(wo.location) : 'No location'}</span>
                                                                <span>•</span>
                                                                <span>{wo?.scheduleDate || 'No date'} · {wo?.scheduleTime || 'No time'}</span>
                                                            </div>
                                                            {helperNames.length > 0 && (
                                                                <p className="text-[12px] text-brand-blue mt-0.5 text-left">
                                                                    Helper added during the job — {helperNames.join(', ')}
                                                                </p>
                                                            )}
                                                        </div>

                                                        <div className={cn("w-full min-w-0", !isImported && "sm:w-auto")} onClick={e => e.stopPropagation()}>
                                                            {isImported && wo ? (
                                                                <div className="border-t border-border-sub/40 pt-2">
                                                                    <ImportedJobAudit wo={wo} onUpdateWorkOrder={handleUpdateWorkOrder} approvedReimbTotal={approvedReimbTotal} isLocked={isLogLockedForEdit} />
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-6 px-3 py-2 rounded-md bg-bg-tertiary/30 border border-border-sub">
                                                                    <div className="text-left">
                                                                        <p className="text-[11px] text-text-muted">Time on site</p>
                                                                        <p className="text-[13px] font-mono font-semibold text-accent-gold leading-tight text-left">
                                                                            {wo ? getHoursOnsite(wo.id) : 'TBD'}
                                                                        </p>
                                                                    </div>
                                                                    <div className="text-left">
                                                                        <p className="text-[11px] text-text-muted">Pay</p>
                                                                        <p className="text-[13px] font-mono font-semibold text-text-green leading-tight text-left">
                                                                            ${(item.jobPay || 0).toFixed(2)}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {jobReimbursements.length > 0 && (
                                                    <div className="flex flex-col gap-1.5 pl-2 sm:pl-[52px]" onClick={e => e.stopPropagation()}>
                                                        {jobReimbursements.map(r => (
                                                            <div key={r.id} className={cn(
                                                                "flex items-center justify-between gap-3 p-2 rounded-md border text-left",
                                                                r.status === 'pending' ? "bg-accent-gold/5 border-accent-gold/30" : r.status === 'approved' ? "bg-text-green/5 border-text-green/20" : "bg-brand-red/5 border-brand-red/20"
                                                            )}>
                                                                <div className="min-w-0 flex items-center gap-2">
                                                                    <Receipt size={11} className="shrink-0 text-text-muted" />
                                                                    <p className="text-[12px] font-medium text-text-primary truncate">{r.description}</p>
                                                                    <span className="text-[12px] font-mono font-semibold text-accent-gold shrink-0">${r.amount.toFixed(2)}</span>
                                                                </div>
                                                                {r.status === 'pending' ? (
                                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                                        <Button size="sm" variant="outline" className="h-7 px-2 text-text-green border-text-green/30 hover:bg-text-green/10" onClick={() => reviewReimbursement(r.id, 'approved')}>Approve</Button>
                                                                        <Button size="sm" variant="outline" className="h-7 px-2 text-text-red border-brand-red/30 hover:bg-brand-red/10" onClick={() => reviewReimbursement(r.id, 'rejected')}>Reject</Button>
                                                                    </div>
                                                                ) : (
                                                                    <StatusBadge kind="log" value={r.status || 'approved'} className="shrink-0" />
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                </div>
                                            );
                                        }) : (
                                            <EmptyState icon={CheckCircle2} title="No confirmed jobs on this log" description="Jobs the tech confirmed show up here for you to verify." />
                                        )}
                                    </div>
                                </ScrollArea>
                            </TabsContent>

                            <TabsContent value="discrepancy" className="m-0 h-full text-left">
                                <ScrollArea className="p-3 sm:p-6 text-left sm:h-full sm:min-h-0">
                                    <div className="space-y-3 text-left max-w-6xl mx-auto">
                                        {flaggedCount > 0 && (
                                            <p className="text-[13px] text-text-secondary">
                                                {undecidedCount > 0
                                                    ? <>Answer one question per job. <span className="font-semibold text-text-primary">Nothing is paid or removed until you confirm.</span></>
                                                    : 'Every flagged job has a decision. You can change one until the log is approved.'}
                                            </p>
                                        )}
                                        {[...flaggedItems].sort((a, b) => Number(!!a.resolution) - Number(!!b.resolution)).map(renderItemCard)}
                                        {[...(localLog?.missingAssignmentReports || [])].sort((a, b) => Number(isReportDecided(a)) - Number(isReportDecided(b))).map(renderReportCard)}
                                        {removedFlagged.map(renderRemovedCard)}

                                        {flaggedCount === 0 && (
                                            <EmptyState icon={CheckCircle2} title="Nothing needs a decision" description="Jobs the tech flags (missing, duplicate, not theirs, or wrong pay or date) show up here." />
                                        )}
                                    </div>
                                </ScrollArea>
                            </TabsContent>

                            {payrollDisputes.length > 0 && (
                                <TabsContent value="post-approval" className="m-0 h-full text-left">
                                    <ScrollArea className="p-3 sm:p-6 text-left sm:h-full sm:min-h-0">
                                        <div className="space-y-3 text-left max-w-6xl mx-auto">
                                            {[...payrollDisputes].sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1)).map(dispute => {
                                                const reasonLabel = PAYROLL_TICKET_CARDS[dispute.reason]?.title || 'Pay is wrong';
                                                const relatedWo = dispute.workOrderId ? findWorkOrder(dispute.workOrderId) : undefined;
                                                const isOpenDispute = dispute.status === 'open';
                                                return (
                                                    <div key={dispute.id} className={cn(
                                                        "p-3 sm:p-4 rounded-xl border border-l-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3 text-left",
                                                        isOpenDispute ? "border-l-[color:var(--brand-red)] " + "bg-bg-secondary border-brand-red/30" : "bg-bg-primary border-border-sub/40 opacity-70"
                                                    )}>
                                                        <div className="flex-1 min-w-0 text-left">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <Badge variant={isOpenDispute ? "disputed" : "approved"} className="text-[10px] font-semibold uppercase tracking-wide px-1.5">
                                                                    {reasonLabel}
                                                                </Badge>
                                                                <span className="text-[13px] font-semibold text-text-primary">{dispute.techName}</span>
                                                                {relatedWo && <WorkOrderId wo={relatedWo} className="!text-[11px]" />}
                                                            </div>
                                                            <p className="text-[12px] text-text-secondary leading-relaxed mt-1 text-left">{dispute.notes}</p>
                                                            <p className="text-[11px] text-text-muted mt-1">
                                                                {new Date(dispute.createdAt).toLocaleString()}
                                                            </p>
                                                            <div className="mt-2">
                                                                <PayrollTicketDecision dispute={dispute} canDecide={canApproveLog} fallbackName={authUser?.name} />
                                                            </div>
                                                        </div>
                                                        {!isOpenDispute && (
                                                            <Badge variant="approved" className="shrink-0 text-[10px] font-semibold uppercase tracking-wide">Resolved</Badge>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </ScrollArea>
                                </TabsContent>
                            )}
                        </div>
                    </Tabs>

                    <DialogFooter className="px-4 sm:px-8 py-3 sm:py-4 border-t border-border-sub bg-bg-secondary flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 shrink-0">
                        {localLog && (localLog.status === 'Approved' || (localLog as any).status === 'Paid') ? (
                            // Approved = math checked, pay final. Pay out = money has gone out.
                            <div className="w-full flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                <p className="text-[12px] text-text-muted flex-1">
                                    {localLog.paid
                                        ? <>Paid out{localLog.paidAt ? ` ${format(new Date(localLog.paidAt), 'MMM d, yyyy')}` : ''}{localLog.paidByName ? ` by ${localLog.paidByName}` : ''}.</>
                                        : 'Approved — pay it out once the money has gone out.'}
                                </p>
                                <Button variant="outline" className="h-10 px-6 order-last sm:order-none" onClick={() => setIsOpen(false)}>Close</Button>
                                {localLog.paid ? (
                                    canApproveLog && <Button variant="ghost" className="h-10 px-4 text-text-muted" disabled={paying} onClick={() => setPaid(false)}>Undo pay out</Button>
                                ) : (
                                    <>
                                        {canOverrideDispute && (
                                            <Button variant="outline" className="h-10 px-6" disabled={reopening} onClick={() => { if (confirm('Unapprove this log? It goes back to Submitted so the pay can be edited. Entered figures are kept.')) handleReopenToSubmitted(); }}>
                                                {reopening ? <Loader2 size={16} className="mr-2 animate-spin" /> : <X size={16} className="mr-2" />} Unapprove
                                            </Button>
                                        )}
                                        {canApproveLog && (
                                            <Button className="h-10 px-6 sm:px-8 bg-text-green hover:bg-text-green/90 text-white" disabled={paying} onClick={() => setPaid(true)}>
                                                {paying ? <Loader2 size={16} className="mr-2 animate-spin" /> : <DollarSign size={16} className="mr-2" />} Pay out
                                            </Button>
                                        )}
                                    </>
                                )}
                            </div>
                        ) : (canApproveLog || canReturnLog) ? (
                            <>
                                {canReturnLog && localLog?.status === 'Submitted' && (
                                    <Button variant="destructive-outline" className="w-full sm:w-auto order-3 sm:order-1 h-10 px-6" onClick={() => handleStatusChange('Rejected')}>
                                        <X size={16} className="mr-2"/> Return to tech
                                    </Button>
                                )}
                                <div className="hidden sm:block flex-1 order-2" />
                                <Button variant="outline" className="w-full sm:w-auto order-2 sm:order-3 h-10 px-6" onClick={() => setIsOpen(false)}>Close</Button>
                                {canApproveLog && (
                                    <Button
                                        disabled={!canApproveNow}
                                        title={canApproveNow ? undefined : undecidedCount ? 'Answer every flagged job under Needs a decision first' : 'Verify every job before approving'}
                                        className={cn(
                                            "w-full sm:w-auto order-1 sm:order-4 h-10 px-6 sm:px-8 shadow-sm transition-all",
                                            canApproveNow ? "bg-brand-red hover:bg-brand-red-hover" : "bg-bg-tertiary text-text-muted cursor-not-allowed border border-border-sub"
                                        )}
                                        onClick={() => handleStatusChange('Approved')}
                                    >
                                        <Check size={16} className="mr-2"/>
                                        {undecidedCount > 0
                                            ? `Decide the ${undecidedCount} flagged job${undecidedCount === 1 ? '' : 's'} first`
                                            : isManifestFullyAudited ? 'Approve log' : `Verify ${totalJobsCount - auditCompleteCount} more to approve`}
                                    </Button>
                                )}
                                {canApproveLog && (
                                    // Turns green once the log is approved.
                                    <Button disabled title="Approve the log first" className="w-full sm:w-auto order-1 sm:order-5 h-10 px-6 bg-bg-tertiary text-text-muted border border-border-sub cursor-not-allowed">
                                        <DollarSign size={16} className="mr-2"/> Pay out
                                    </Button>
                                )}
                            </>
                        ) : (
                            <div className="w-full flex items-center justify-between gap-3">
                                <p className="text-[12px] text-text-muted">View only — you can’t approve or return weekly logs.</p>
                                <Button variant="outline" className="h-10 px-6 shrink-0" onClick={() => setIsOpen(false)}>Close</Button>
                            </div>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <JobDetailDialog
                isOpen={isJobDetailOpen}
                setIsOpen={setIsJobDetailOpen}
                mission={selectedJobForDetail}
            />

        </>
    );
}
