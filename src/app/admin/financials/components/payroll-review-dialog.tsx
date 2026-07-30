'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { WeeklyLog, Technician, WorkOrder, WeeklyLogItem, FinancialRecord, PayrollDispute } from '@/lib/types';
import { assignmentTimeLogs } from '@/lib/data';
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
    Receipt,
    MoreVertical,
    Archive as ArchiveIcon,
    Send
} from 'lucide-react';
import { cn, formatCityState, sanitize } from '@/lib/utils';
import { FIELD_NATION_FEE_RATE, netOfFieldNationFee } from '@/lib/payroll';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import { fieldNationUrl } from '@/lib/work-order-identity';
import { WorkOrderId } from '@/components/work-order-id';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { differenceInMinutes, parseISO, format } from 'date-fns';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { db, auth } from '@/lib/firebase';
import { doc, setDoc, updateDoc, deleteDoc, arrayUnion, collection, query, where, onSnapshot } from 'firebase/firestore';
import { toUnassignedWorkOrder } from '@/lib/jobs';
import { auditEvent } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { JobDetailDialog } from '@/components/job-detail-dialog';

type PayrollReviewDialogProps = {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    log: WeeklyLog | null;
    technician: Technician | undefined;
    missions: WorkOrder[];
    allTechnicians?: Technician[];
    onStatusChange: (logId: string, status: WeeklyLog['status'], total?: number) => void;
};

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
}: {
    wo: WorkOrder;
    onUpdateWorkOrder: (id: string, updates: Partial<WorkOrder>) => void;
    approvedReimbTotal?: number;
}) {
    // Local Buffer State
    const [localPay, setLocalPay] = useState(wo.pay);
    const [localReimb, setLocalReimb] = useState(wo.auditReimbursement || approvedReimbTotal || 0);
    const [localOverhead, setLocalOverhead] = useState(wo.auditOverhead || 0);
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

    const isDirty = localPay !== wo.pay || localReimb !== (wo.auditReimbursement || 0) || localOverhead !== (wo.auditOverhead || 0);

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
        setLocalPay(wo.pay);
        setLocalReimb(wo.auditReimbursement || 0);
        setLocalOverhead(wo.auditOverhead || 0);
    };

    return (
        <div className={cn(
            "flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-x-4 sm:gap-y-2 p-2 bg-bg-primary border rounded-lg text-left w-full min-w-0 max-w-full transition-all",
            isDirty ? "border-brand-red ring-1 ring-brand-red/20 shadow-lg" : "border-border-sub"
        )} onClick={e => e.stopPropagation()}>
             <div className="grid grid-cols-3 gap-2 w-full sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:w-auto">
                <div className="flex flex-col items-start gap-1 min-w-0 sm:flex-row sm:items-center sm:gap-2 sm:w-auto">
                    <Label className="text-[8px] font-black uppercase text-text-muted whitespace-nowrap">Pay</Label>
                    <div className="relative w-full sm:w-auto">
                        <DollarSign size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <Input
                            type="number"
                            value={localPay === 0 ? '' : localPay}
                            placeholder="0"
                            onChange={(e) => setLocalPay(parseFloat(e.target.value) || 0)}
                            className="h-7 w-full sm:w-20 text-xs pl-5 bg-bg-secondary font-mono font-bold border border-border-sub shadow-none focus-visible:ring-1"
                        />
                    </div>
                </div>
                <div className="flex flex-col items-start gap-1 min-w-0 sm:flex-row sm:items-center sm:gap-2 sm:w-auto">
                    <Label className="text-[8px] font-black uppercase text-text-muted whitespace-nowrap">Reimb.</Label>
                    <div className="relative w-full sm:w-auto">
                        <DollarSign size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <Input
                            type="number"
                            value={localReimb === 0 ? '' : localReimb}
                            placeholder="0"
                            onChange={(e) => setLocalReimb(parseFloat(e.target.value) || 0)}
                            className="h-7 w-full sm:w-20 text-xs pl-5 bg-bg-secondary font-mono border border-border-sub shadow-none focus-visible:ring-1"
                        />
                        {localReimb > 0 && (
                            <span className="block sm:absolute sm:left-0 sm:top-full mt-0.5 text-[7px] font-bold text-text-green uppercase tracking-tight whitespace-nowrap" title="Reimbursement paid to tech, net of the Field Nation fee">
                                → ${reimbPayout.toFixed(2)} to tech
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex flex-col items-start gap-1 min-w-0 sm:flex-row sm:items-center sm:gap-2 sm:w-auto">
                    <Label className="text-[8px] font-black uppercase text-text-muted whitespace-nowrap">Ovhd.</Label>
                    <div className="relative w-full sm:w-auto">
                        <DollarSign size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-text-muted" />
                        <Input
                            type="number"
                            value={localOverhead === 0 ? '' : localOverhead}
                            placeholder="0"
                            onChange={(e) => setLocalOverhead(parseFloat(e.target.value) || 0)}
                            className="h-7 w-full sm:w-20 text-xs pl-5 bg-bg-secondary font-mono border border-border-sub shadow-none focus-visible:ring-1"
                        />
                    </div>
                </div>
             </div>

             <div className="grid grid-cols-4 gap-1.5 min-w-0 w-full sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1 sm:w-auto sm:pl-3 sm:border-l border-border-sub/50">
                <div className="flex flex-col items-start gap-0.5 min-w-0 sm:flex-row sm:items-center sm:gap-1 sm:w-auto whitespace-nowrap">
                    <span className="text-[7px] font-black text-text-muted uppercase">FN (15.85%)</span>
                    <span className="text-[11px] font-mono font-bold text-text-primary">${totalFnFee.toFixed(2)}</span>
                </div>
                <div className="flex flex-col items-start gap-0.5 min-w-0 sm:flex-row sm:items-center sm:gap-1 sm:w-auto whitespace-nowrap">
                    <span className="text-[7px] font-black text-text-muted uppercase">Net</span>
                    <span className="text-[11px] font-mono font-bold text-text-primary">${netLabor.toFixed(2)}</span>
                </div>
                <div className="flex flex-col items-start gap-0.5 min-w-0 sm:flex-row sm:items-center sm:gap-1 sm:w-auto whitespace-nowrap">
                    <span className="text-[7px] font-black text-text-green uppercase">Payout</span>
                    <span className="text-[11px] font-mono font-bold text-text-green" title="Tech labor payout (50% of net labor). Reimbursement is added separately, net of the FN fee.">${laborPayout.toFixed(2)}</span>
                </div>
                <div className="flex flex-col items-start gap-0.5 min-w-0 sm:flex-row sm:items-center sm:gap-1 sm:w-auto whitespace-nowrap">
                    <span className="text-[7px] font-black text-brand-red uppercase">Aaromach</span>
                    <span className="text-[11px] font-mono font-bold text-brand-red">${aaromachPay.toFixed(2)}</span>
                </div>
             </div>

             {isDirty && (
                <div className="flex items-center gap-1.5 ml-auto">
                    <button
                        onClick={handleReset}
                        className="h-6 px-2 rounded bg-bg-tertiary flex items-center gap-1 text-text-muted hover:text-text-primary transition-colors text-[8px] font-bold uppercase tracking-widest"
                        title="Reset changes"
                    >
                        <RotateCcw size={10}/> Reset
                    </button>
                    <button
                        onClick={handleCommit}
                        className="h-6 px-2 rounded bg-brand-red flex items-center gap-1 text-white hover:bg-brand-red-hover transition-colors shadow-sm text-[8px] font-bold uppercase tracking-widest"
                        title="Commit Audit"
                    >
                        <Save size={10}/> Save
                    </button>
                </div>
             )}
        </div>
    );
}

export function PayrollReviewDialog({ isOpen, setIsOpen, log: initialLog, technician, missions, allTechnicians = [], onStatusChange }: PayrollReviewDialogProps) {
    const [localLog, setLocalLog] = useState<WeeklyLog | null>(null);
    const [selectedJobForDetail, setSelectedJobForDetail] = useState<WorkOrder | null>(null);
    const [isJobDetailOpen, setIsJobDetailOpen] = useState(false);
    const { toast } = useToast();
    const { hasPermission } = useAuth();
    // Weekly-log review authority (subrole-driven). Approve settles a submitted
    // log; return sends it back to the tech (Deny / Authorize Unsubmit).
    const canApproveLog = hasPermission('admin.logs.approve');
    const canReturnLog = hasPermission('admin.logs.return');
    // Overriding a tech's dispute (sending the job back to Dispatch, or
    // archiving it outright) is a step beyond acknowledging the dispute —
    // gate it the same as reopening a closed assignment.
    const canOverrideDispute = hasPermission('admin.logs.reopen');

    useEffect(() => {
        if (isOpen && initialLog) {
            setLocalLog(JSON.parse(JSON.stringify(initialLog)));
        }
    }, [isOpen, initialLog]);

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

    const handleResolvePayrollDispute = async (disputeId: string) => {
        const adminName = auth.currentUser?.displayName || 'Admin';
        try {
            await updateDoc(doc(db, 'payrollDisputes', disputeId), {
                status: 'resolved',
                resolvedAt: new Date().toISOString(),
                resolvedBy: adminName,
            });
            toast({ title: "Dispute Resolved" });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could Not Resolve', description: e.message });
        }
    };

    const findWorkOrder = useCallback((id: string): WorkOrder | undefined => {
        return missions.find(wo => wo.id === id);
    }, [missions]);

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

    const getHoursOnsite = useCallback((woId: string) => {
        if (!technician) return 'TBD';
        const log = assignmentTimeLogs.find(l => l.workOrderId === woId && l.techId === technician.id);
        if (!log) return 'TBD';
        if (!log.checkOutTime) return 'ACTIVE';
        
        try {
            const start = parseISO(log.checkInTime);
            const end = parseISO(log.checkOutTime);
            const mins = differenceInMinutes(end, start);
            return (mins / 60).toFixed(1) + 'h';
        } catch (e) {
            return 'TBD';
        }
    }, [technician]);

    const calculatedTotalPayout = useMemo(() => {
        if (!localLog) return 0;
        const assignmentPay = (localLog.items || []).reduce((acc, i) => acc + (i.jobPay || 0), 0);
        // Count reimbursements that are approved (or legacy ones with no status).
        // Pending awaits review; rejected never counts. Each is paid NET of the
        // Field Nation fee (the tech absorbs it, Aaromach does not), and counted
        // exactly once — job payouts (jobPay) hold labor only.
        const reimbursementPay = (localLog.reimbursements || [])
            .filter(r => r.status !== 'pending' && r.status !== 'rejected')
            .reduce((acc, r) => acc + netOfFieldNationFee(r.amount), 0);
        // Manually-added missing jobs: imported ones run the FN pay calc (labor
        // finalPay + reimbursement net of fee); manual ones are a flat pay.
        const reportPay = (localLog.missingAssignmentReports || []).reduce((acc, r) =>
            acc + (r.jobType === 'Imported'
                ? (r.finalPay || 0) + netOfFieldNationFee(r.auditReimbursement || 0)
                : (r.pay || 0)), 0);
        return assignmentPay + reimbursementPay + reportPay;
    }, [localLog]);
    
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
        if (localLog) {
            const finalTotal = calculatedTotalPayout;
            try {
                const logRef = doc(db, 'weeklyLogs', localLog.id);
                await updateDoc(logRef, { status, totalPayout: finalTotal });
                onStatusChange(localLog.id, status, finalTotal);
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
                toast({ variant: 'destructive', title: 'Update Failed', description: e.message });
            }
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
                title: "Unsubmit Authorized",
                description: `Weekly log for ${localLog.weekOf} has been reverted to Draft.`,
            });
            setIsOpen(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Authorization Failed', description: e.message });
        }
    };

    const handleUpdateWorkOrder = useCallback(async (woId: string, updates: Partial<WorkOrder>) => {
        if (updates.finalPay !== undefined && localLog) {
            const updatedItems = (localLog.items || []).map(item => 
                item.workOrderId === woId ? { ...item, jobPay: updates.finalPay! } : item
            );
            
            try {
                const logRef = doc(db, 'weeklyLogs', localLog.id);
                await updateDoc(logRef, { items: updatedItems });
                setLocalLog({ ...localLog, items: updatedItems });
                // NOTIFICATION DISPATCHED ONLY ON FORMAL COMMIT
                toast({ title: "Pay Registry Updated", description: "Audit adjustment reflected in current manifest." });
            } catch (e: any) {
                toast({ variant: 'destructive', title: 'Sync Error', description: e.message });
            }
        }

        try {
            const asmtRef = doc(db, 'assignments', woId);
            const woRef = doc(db, 'workOrders', woId);
            await updateDoc(asmtRef, updates).catch(async () => {
                await updateDoc(woRef, updates);
            });
        } catch (e: any) {
            console.error("Registry update error", e);
        }
    }, [localLog, toast]);

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
            toast({ title: 'Pay Registry Updated', description: 'Missing-job audit saved to the log.' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Sync Error', description: e.message });
        }
    }, [localLog, toast]);

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
            toast({ title: nextStatus ? "Item Verified" : "Review Reset", description: "Audit trail synchronized with registry." });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Audit Sync Error', description: e.message });
        }
    };

    // Acknowledging a dispute only marks that admin has looked at it — it stays
    // in the Discrepancy list with confirmationStatus:'disputed' untouched.
    // Clearing a dispute out of this list is a deliberate override (below), not
    // a side effect of acknowledgment.
    const toggleDisputeAcknowledged = async (itemId: string) => {
        if (!localLog) return;
        const item = (localLog.items || []).find(i => i.id === itemId);
        if (!item) return;

        const nextReviewed = !item.isAdminReviewed;
        const updatedItems = (localLog.items || []).map(i =>
            i.id === itemId ? { ...i, isAdminReviewed: nextReviewed } : i
        );

        try {
            await updateDoc(doc(db, 'weeklyLogs', localLog.id), { items: updatedItems });
            setLocalLog({ ...localLog, items: updatedItems });
            toast({
                title: nextReviewed ? "Dispute Acknowledged" : "Acknowledgment Cleared",
                description: nextReviewed
                    ? "Flagged as reviewed. It stays in Discrepancies until you return it to Dispatch or archive it."
                    : "Marked as unreviewed."
            });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Sync Error', description: e.message });
        }
    };

    const removeLogItem = async (itemId: string) => {
        if (!localLog) return;
        const updatedItems = (localLog.items || []).filter(i => i.id !== itemId);
        await updateDoc(doc(db, 'weeklyLogs', localLog.id), { items: updatedItems });
        setLocalLog({ ...localLog, items: updatedItems });
    };

    // Override: the dispute isn't being resolved through payroll at all — the
    // admin is sending the job back to the Dispatch Hub for reassignment (e.g.
    // "another tech did this job" / "I did not do this job"). Resets the job to
    // unassigned and drops it from this manifest, so it's never paid out here.
    const handleReturnDisputeToDispatch = async (item: WeeklyLogItem) => {
        if (!canOverrideDispute) return;
        const adminName = auth.currentUser?.displayName || 'Admin';
        const wo = findWorkOrder(item.workOrderId);
        if (!wo) return;
        try {
            // Every unassigned job lives in the `workOrders` pool, not
            // `assignments` (see lib/jobs.ts) — migrate the doc back so it
            // actually surfaces in the Dispatch Hub's Unassigned tab.
            const target = toUnassignedWorkOrder(wo, [{
                type: 'status_change',
                date: format(new Date(), 'MM-dd-yyyy'),
                details: `Sent back to Dispatch Hub by ${adminName} — dispute override (${item.disputeReason || 'disputed'}).`,
                user: adminName,
            }]);
            await setDoc(doc(db, 'workOrders', target.id), sanitize(target));
            await deleteDoc(doc(db, 'assignments', item.workOrderId));
            await removeLogItem(item.id);
            toast({ title: "Sent to Dispatch Hub", description: "Job reset to unassigned and removed from this payroll manifest." });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Override Failed', description: e.message });
        }
    };

    // Override: the admin is closing this job out entirely rather than
    // redispatching it — soft-archives it (recoverable from Archives) and drops
    // it from this manifest so it's never paid out here.
    const handleArchiveDispute = async (item: WeeklyLogItem) => {
        if (!canOverrideDispute) return;
        const adminName = auth.currentUser?.displayName || 'Admin';
        const wo = findWorkOrder(item.workOrderId);
        try {
            const asmtRef = doc(db, 'assignments', item.workOrderId);
            const woRef = doc(db, 'workOrders', item.workOrderId);
            const patch: Record<string, any> = {
                archived: true,
                status: 'archived',
                previousStatus: wo?.status || 'completed',
                archivedAt: new Date().toISOString(),
                archivedBy: adminName,
                archiveReason: `Disputed payroll item overridden and archived (${item.disputeReason || 'disputed'}).`,
                history: arrayUnion({
                    type: 'status_change',
                    date: format(new Date(), 'MM-dd-yyyy'),
                    details: `Archived by ${adminName} — dispute override (${item.disputeReason || 'disputed'}).`,
                    user: adminName,
                }),
            };
            await updateDoc(asmtRef, patch).catch(async () => { await updateDoc(woRef, patch); });
            await removeLogItem(item.id);
            toast({ title: "Job Archived", description: "Moved to Archives and removed from this payroll manifest." });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Override Failed', description: e.message });
        }
    };

    const handleOpenJobDetail = (wo: WorkOrder) => {
        setSelectedJobForDetail(wo);
        setIsJobDetailOpen(true);
    };

    const confirmedItems = useMemo(() => localLog?.items?.filter(item => item.confirmationStatus === 'confirmed' || !item.confirmationStatus) || [], [localLog]);
    const discrepancyItems = useMemo(() => [
        ...(localLog?.items?.filter(item => item.confirmationStatus === 'disputed') || []),
        ...(localLog?.missingAssignmentReports || [])
    ], [localLog]);

    const totalJobsCount = (localLog?.items?.length || 0) + (localLog?.missingAssignmentReports?.length || 0);
    const auditCompleteCount = (localLog?.items || []).filter(i => i.isAdminReviewed).length + (localLog?.missingAssignmentReports || []).filter(r => (r as any).isAudited).length;
    const isManifestFullyAudited = auditCompleteCount === totalJobsCount && totalJobsCount > 0;

    if (!localLog || !technician) return null;

    return (
        <>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="w-screen max-w-full h-[100dvh] rounded-none border-0 bg-bg-elevated flex flex-col p-0 overflow-y-auto sm:overflow-hidden shadow-2xl text-left">
                    <DialogHeader className="p-3 sm:p-4 border-b border-border-sub bg-bg-tertiary/30 text-left shrink-0 space-y-0">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                <Avatar className="h-9 w-9 sm:h-10 sm:w-10 border border-border-sub shrink-0">
                                    <AvatarImage src={technician.avatarUrl} />
                                    <AvatarFallback>{technician.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="text-left min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <DialogTitle className="text-[13px] sm:text-sm font-bold uppercase tracking-widest text-text-primary text-left">Registry Audit: {technician.name}</DialogTitle>
                                        {localLog.unsubmitRequested && (
                                            <Badge variant="destructive" className="h-4 px-1.5 text-[7px] uppercase animate-pulse">Unsubmit Requested</Badge>
                                        )}
                                    </div>
                                    <DialogDescription className="text-[9px] sm:text-[10px] font-bold text-text-muted uppercase tracking-widest text-left">
                                        Period: <span className="text-brand-red font-mono">{localLog.weekOf}</span> · Status: <span className="text-text-primary">{localLog.status}</span>
                                    </DialogDescription>
                                </div>
                            </div>
                            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                                <div className="flex flex-col items-start sm:items-end">
                                    <p className="text-[8px] font-black text-text-muted uppercase">Audit Progress</p>
                                    <p className={cn("text-xs font-mono font-bold", isManifestFullyAudited ? "text-text-green" : "text-accent-gold")}>
                                        {auditCompleteCount} / {totalJobsCount} VERIFIED
                                    </p>
                                </div>
                                <Badge variant={localLog.status === 'Approved' ? 'active' : localLog.status === 'Submitted' ? 'onhold' : 'pending'} className="h-6 px-3 sm:px-4 uppercase text-[9px] sm:text-[10px] tracking-widest shrink-0">
                                    {localLog.status}
                                </Badge>
                            </div>
                        </div>
                    </DialogHeader>

                    <Tabs defaultValue="verified" className="flex flex-col sm:flex-1 sm:min-h-0 sm:overflow-hidden">
                        <div className="px-3 sm:px-6 border-b border-border-sub bg-bg-tertiary/20 flex flex-col sm:flex-row sm:justify-between sm:items-center shrink-0">
                            <TabsList className="h-11 sm:h-12 bg-transparent p-0 gap-5 sm:gap-8 justify-start w-full sm:w-auto overflow-x-auto no-scrollbar">
                                <TabsTrigger value="verified" className="tab-trigger-payroll flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0">
                                    <CheckCircle2 size={14} />
                                    <span className="hidden xs:inline">Verified Assignments</span><span className="xs:hidden">Verified</span>
                                    <span className="ml-1 opacity-50">({confirmedItems.length})</span>
                                </TabsTrigger>
                                <TabsTrigger value="discrepancy" className="tab-trigger-payroll flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0">
                                    <ShieldAlert size={14} />
                                    <span className="hidden xs:inline">Discrepancy Registry</span><span className="xs:hidden">Discrepancy</span>
                                    <span className="ml-1 opacity-50">({discrepancyItems.length})</span>
                                </TabsTrigger>
                                {payrollDisputes.length > 0 && (
                                    <TabsTrigger value="post-approval" className="tab-trigger-payroll flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0">
                                        <AlertTriangle size={14} />
                                        <span className="hidden xs:inline">Post-Approval Disputes</span><span className="xs:hidden">Post-Approval</span>
                                        <span className="ml-1 opacity-50">({payrollDisputes.filter(d => d.status === 'open').length})</span>
                                    </TabsTrigger>
                                )}
                            </TabsList>
                            <div className="flex items-center justify-between sm:justify-end gap-2 pb-2 sm:pb-0 border-t sm:border-t-0 border-border-sub/50 pt-2 sm:pt-0">
                                <p className="text-[8px] font-black text-text-muted uppercase tracking-widest sm:hidden">Net Tech Settlement</p>
                                <div className="text-right">
                                    <p className="hidden sm:block text-[8px] font-black text-text-muted uppercase tracking-widest text-right">Net Tech Settlement</p>
                                    <p className="text-base sm:text-lg font-mono font-bold text-text-green leading-none">${calculatedTotalPayout.toFixed(2)}</p>
                                </div>
                            </div>
                        </div>

                        <div className="relative sm:flex-1 sm:min-h-0 sm:overflow-hidden">
                            <TabsContent value="verified" className="m-0 h-full text-left">
                                <ScrollArea className="p-2 sm:h-full sm:min-h-0">
                                    <div className="space-y-1">
                                        {localLog.unsubmitRequested && (
                                            <div className="p-3 rounded-lg border border-border-alert bg-brand-red-dim/5 flex items-start gap-4 mb-2">
                                                <AlertCircle size={18} className="text-text-red shrink-0 mt-0.5" />
                                                <div className="space-y-1 text-left flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-[10px] font-black text-text-red uppercase tracking-widest">Unsubmit Request Flagged</p>
                                                        <span className="text-[8px] text-text-muted font-mono uppercase">{localLog.unsubmitRequestedAt ? format(parseISO(localLog.unsubmitRequestedAt), 'MMM d, h:mm a') : ''}</span>
                                                    </div>
                                                    <p className="text-[9px] text-text-secondary leading-relaxed uppercase font-medium italic text-left">&quot;{localLog.unsubmitReason}&quot;</p>
                                                    <div className="pt-1.5">
                                                        {canReturnLog ? (
                                                            <Button
                                                                size="sm"
                                                                className="h-7 px-4 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[8px] tracking-widest text-white"
                                                                onClick={handleApproveUnsubmit}
                                                            >
                                                                <Undo2 size={10} className="mr-1.5"/> Authorize Unsubmit
                                                            </Button>
                                                        ) : (
                                                            <p className="text-[8px] font-bold text-text-muted uppercase tracking-widest">Requires weekly-log return permission</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {confirmedItems.length > 0 ? confirmedItems.map(item => {
                                            const wo = findWorkOrder(item.workOrderId);
                                            const isImported = wo?.source === 'Imported';
                                            const isAudited = item.isAdminReviewed;
                                            const displayTitle = wo?.title || 'Mission identifier lookup pending...';
                                            const helperNames = getHelperNames(wo);
                                            const jobReimbursements = getJobReimbursements(wo?.id);
                                            const hasPendingReimb = jobReimbursements.some(r => r.status === 'pending');
                                            const approvedReimbTotal = jobReimbursements.filter(r => r.status === 'approved').reduce((acc, r) => acc + r.amount, 0);

                                            return (
                                                <div key={item.id} className={cn(
                                                    "p-2 rounded-lg border transition-all flex flex-col gap-3 group",
                                                    isAudited ? "bg-bg-primary border-green-border/30" : "bg-bg-secondary border-border-sub hover:border-text-muted"
                                                )}>
                                                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:min-h-[3rem] sm:items-center cursor-pointer" onClick={() => wo && handleOpenJobDetail(wo)}>
                                                    <div className="order-2 sm:order-1 shrink-0 flex items-center gap-2 sm:pr-2 sm:border-r border-border-sub/30" onClick={e => e.stopPropagation()}>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={hasPendingReimb}
                                                            title={hasPendingReimb ? 'Locked: pending reimbursement must be approved first' : undefined}
                                                            className={cn(
                                                                "w-full sm:w-auto h-9 sm:h-7 px-3 uppercase text-[9px] sm:text-[8px] font-bold tracking-widest transition-all",
                                                                isAudited ? "bg-text-green text-white border-text-green" : "border-border-sub text-text-muted hover:border-text-green",
                                                                hasPendingReimb && "opacity-40 cursor-not-allowed hover:border-border-sub"
                                                            )}
                                                            onClick={() => !hasPendingReimb && toggleAuditItem(item.id, item.workOrderId)}
                                                        >
                                                            {hasPendingReimb ? <Lock size={12} className="mr-1"/> : isAudited ? <Check size={12} className="mr-1"/> : <ClipboardCheck size={12} className="mr-1"/>}
                                                            {hasPendingReimb ? 'Locked' : isAudited ? 'Verified' : 'Approve'}
                                                        </Button>
                                                    </div>

                                                    <div className={cn("order-1 sm:order-2 flex-1 flex flex-col gap-2", !isImported && "sm:flex-row sm:items-center sm:justify-between")}>
                                                        <div className="min-w-0 text-left">
                                                            <div className="flex items-center gap-2 text-left flex-wrap">
                                                                <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide break-words sm:truncate text-left">{displayTitle}</p>
                                                                {isImported && <Badge variant="outline" className="text-[6px] bg-brand-red-dim border-brand-red/20 text-brand-red h-3 px-1">IMPORTED</Badge>}
                                                                {item.isHelper && (
                                                                    <Badge variant="outline" className="text-[6px] bg-blue-400/15 border-blue-400/40 text-blue-400 h-3 px-1">
                                                                        AS HELPER
                                                                    </Badge>
                                                                )}
                                                                {helperNames.length > 0 && (
                                                                    <Badge variant="outline" className="text-[6px] bg-blue-400/10 border-blue-400/30 text-blue-400 h-3 px-1">
                                                                        HELPER ADDED
                                                                    </Badge>
                                                                )}
                                                                {hasPendingReimb && (
                                                                    <Badge variant="outline" className="text-[6px] bg-accent-gold/15 border-accent-gold/30 text-accent-gold h-3 px-1">
                                                                        REIMB. PENDING
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-0.5 text-[8px] text-text-muted font-medium uppercase tracking-widest text-left">
                                                                {wo ? (
                                                                    <WorkOrderId wo={wo} className="!text-[8px]" />
                                                                ) : (
                                                                    <span className="text-brand-red font-mono font-bold">{(item.workOrderId || '').toUpperCase()}</span>
                                                                )}
                                                                <span>•</span>
                                                                <span>{wo?.location ? formatCityState(wo.location) : 'Location Pending'}</span>
                                                                <span>•</span>
                                                                <span>{wo?.scheduleDate || 'Schedule Pending'} · {wo?.scheduleTime || 'TBD'}</span>
                                                            </div>
                                                            {helperNames.length > 0 && (
                                                                <p className="text-[8px] text-blue-400 font-bold uppercase tracking-widest mt-0.5 text-left italic">
                                                                    Note: helper tech added during job — {helperNames.join(', ')}
                                                                </p>
                                                            )}
                                                        </div>

                                                        <div className={cn("w-full min-w-0", !isImported && "sm:w-auto")} onClick={e => e.stopPropagation()}>
                                                            {isImported && wo ? (
                                                                <div className="border-t border-border-sub/40 pt-2">
                                                                    <ImportedJobAudit wo={wo} onUpdateWorkOrder={handleUpdateWorkOrder} approvedReimbTotal={approvedReimbTotal} />
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-6 p-2 rounded bg-bg-tertiary/30 border border-border-sub/50">
                                                                    <div className="text-left">
                                                                        <p className="text-[7px] font-black text-text-muted uppercase">Duration</p>
                                                                        <p className="text-[10px] font-mono font-bold text-accent-gold uppercase tracking-tighter leading-none text-left">
                                                                            {wo ? getHoursOnsite(wo.id) : 'TBD'}
                                                                        </p>
                                                                    </div>
                                                                    <div className="text-left">
                                                                        <p className="text-[7px] font-black text-text-muted uppercase">Payout</p>
                                                                        <p className="text-[11px] font-mono font-bold text-text-green leading-none text-left">
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
                                                                "flex items-center justify-between gap-3 p-2 rounded border text-left",
                                                                r.status === 'pending' ? "bg-accent-gold/5 border-accent-gold/30" : r.status === 'approved' ? "bg-text-green/5 border-text-green/20" : "bg-brand-red/5 border-brand-red/20"
                                                            )}>
                                                                <div className="min-w-0 flex items-center gap-2">
                                                                    <Receipt size={11} className="shrink-0 text-text-muted" />
                                                                    <p className="text-[9px] font-bold text-text-primary uppercase tracking-wide truncate">{r.description}</p>
                                                                    <span className="text-[10px] font-mono font-bold text-accent-gold shrink-0">${r.amount.toFixed(2)}</span>
                                                                </div>
                                                                {r.status === 'pending' ? (
                                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                                        <Button size="sm" variant="outline" className="h-6 px-2 text-[8px] font-bold uppercase text-text-green border-text-green/30 hover:bg-text-green/10" onClick={() => reviewReimbursement(r.id, 'approved')}>Approve</Button>
                                                                        <Button size="sm" variant="outline" className="h-6 px-2 text-[8px] font-bold uppercase text-brand-red border-brand-red/30 hover:bg-brand-red/10" onClick={() => reviewReimbursement(r.id, 'rejected')}>Reject</Button>
                                                                    </div>
                                                                ) : (
                                                                    <Badge variant="outline" className={cn("text-[7px] h-4 px-1.5 shrink-0 uppercase", r.status === 'rejected' ? "text-brand-red border-brand-red/30" : "text-text-green border-text-green/30")}>{r.status || 'approved'}</Badge>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                </div>
                                            );
                                        }) : (
                                            <div className="p-24 text-center border-2 border-dashed border-border-sub rounded-xl opacity-40 bg-bg-secondary/30">
                                                <CheckCircle2 size={48} className="mx-auto text-text-muted mb-2" />
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-center">No assignments in verified state</p>
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </TabsContent>

                            <TabsContent value="discrepancy" className="m-0 h-full text-left">
                                <ScrollArea className="p-2 text-left sm:h-full sm:min-h-0">
                                    <div className="space-y-1 text-left">
                                        {(localLog?.items || []).filter(i => i.confirmationStatus === 'disputed').map(item => {
                                            const wo = findWorkOrder(item.workOrderId);
                                            const isAudited = item.isAdminReviewed;
                                            const isImported = wo?.source === 'Imported';
                                            const displayTitle = wo?.title || 'Mission identifier lookup pending...';
                                            const helperNames = getHelperNames(wo);
                                            const jobReimbursements = getJobReimbursements(wo?.id);
                                            const hasPendingReimb = jobReimbursements.some(r => r.status === 'pending');
                                            const approvedReimbTotal = jobReimbursements.filter(r => r.status === 'approved').reduce((acc, r) => acc + r.amount, 0);

                                            return (
                                                <div key={item.id} className={cn(
                                                    "p-2 rounded-lg border transition-all flex flex-col gap-3 group",
                                                    isAudited ? "bg-bg-primary border-green-border/30" : "bg-bg-secondary border-brand-red/30 shadow-sm"
                                                )}>
                                                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:min-h-[3rem] sm:items-center cursor-pointer" onClick={() => wo && handleOpenJobDetail(wo)}>
                                                    <div className="order-2 sm:order-1 shrink-0 flex items-center gap-1.5 sm:pr-2 sm:border-r border-border-sub/30" onClick={e => e.stopPropagation()}>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={hasPendingReimb}
                                                            title={hasPendingReimb ? 'Locked: pending reimbursement must be approved first' : 'Marks that you\'ve reviewed this — it stays in Discrepancies until you send it to Dispatch or archive it.'}
                                                            className={cn(
                                                                "w-full sm:w-auto h-9 sm:h-7 px-3 uppercase text-[9px] sm:text-[8px] font-bold tracking-widest",
                                                                isAudited ? "bg-text-green text-white border-text-green" : "border-brand-red text-text-red hover:bg-brand-red-dim",
                                                                hasPendingReimb && "opacity-40 cursor-not-allowed hover:bg-transparent"
                                                            )}
                                                            onClick={() => !hasPendingReimb && toggleDisputeAcknowledged(item.id)}
                                                        >
                                                            {hasPendingReimb ? <Lock size={12} className="mr-1"/> : isAudited ? <Check size={12} className="mr-1"/> : <AlertTriangle size={12} className="mr-1"/>}
                                                            {hasPendingReimb ? 'Locked' : isAudited ? 'Acknowledged' : 'Acknowledge'}
                                                        </Button>
                                                        {canOverrideDispute && (
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <button
                                                                        title="Override this dispute"
                                                                        className="h-9 w-9 sm:h-7 sm:w-7 shrink-0 flex items-center justify-center rounded border border-border-sub text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
                                                                    >
                                                                        <MoreVertical size={14} />
                                                                    </button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="start">
                                                                    <DropdownMenuItem
                                                                        className="text-[11px] uppercase font-bold tracking-wide"
                                                                        onClick={() => handleReturnDisputeToDispatch(item)}
                                                                    >
                                                                        <Send size={13} className="mr-2 text-text-muted" /> Send to Dispatch Hub
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        className="text-[11px] uppercase font-bold tracking-wide text-text-red focus:text-text-red"
                                                                        onClick={() => handleArchiveDispute(item)}
                                                                    >
                                                                        <ArchiveIcon size={13} className="mr-2" /> Move to Archives
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        )}
                                                    </div>

                                                    <div className="order-1 sm:order-2 flex-1 flex flex-col gap-2">
                                                        <div className="min-w-0 text-left">
                                                            <div className="flex items-center gap-2 text-left flex-wrap">
                                                                <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide break-words sm:truncate text-left">{displayTitle}</p>
                                                                {isImported && <Badge variant="outline" className="text-[6px] bg-brand-red-dim border-brand-red/20 text-brand-red h-3 px-1">IMPORTED</Badge>}
                                                                {item.isHelper && (
                                                                    <Badge variant="outline" className="text-[6px] bg-blue-400/15 border-blue-400/40 text-blue-400 h-3 px-1">
                                                                        AS HELPER
                                                                    </Badge>
                                                                )}
                                                                {helperNames.length > 0 && (
                                                                    <Badge variant="outline" className="text-[6px] bg-blue-400/10 border-blue-400/30 text-blue-400 h-3 px-1">
                                                                        HELPER ADDED
                                                                    </Badge>
                                                                )}
                                                                {hasPendingReimb && (
                                                                    <Badge variant="outline" className="text-[6px] bg-accent-gold/15 border-accent-gold/30 text-accent-gold h-3 px-1">
                                                                        REIMB. PENDING
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-0.5 text-[8px] text-text-muted font-medium uppercase tracking-widest text-left">
                                                                {wo ? (
                                                                    <WorkOrderId wo={wo} className="!text-[8px]" />
                                                                ) : (
                                                                    <span className="text-brand-red font-mono font-bold">{(item.workOrderId || '').toUpperCase()}</span>
                                                                )}
                                                                <span>•</span>
                                                                <span>{wo?.location ? formatCityState(wo.location) : 'Location Pending'}</span>
                                                                <span>•</span>
                                                                <span>{wo?.scheduleDate || 'Schedule Pending'} · {wo?.scheduleTime || 'TBD'}</span>
                                                            </div>
                                                            {helperNames.length > 0 && (
                                                                <p className="text-[8px] text-blue-400 font-bold uppercase tracking-widest mt-0.5 text-left italic">
                                                                    Note: helper tech added during job — {helperNames.join(', ')}
                                                                </p>
                                                            )}
                                                        </div>

                                                        <div className={cn("flex flex-col gap-2", !isImported && "sm:flex-row sm:items-center")} onClick={e => e.stopPropagation()}>
                                                            {isImported && wo ? (
                                                                <ImportedJobAudit wo={wo} onUpdateWorkOrder={handleUpdateWorkOrder} approvedReimbTotal={approvedReimbTotal} />
                                                            ) : (
                                                                <div className="flex items-center gap-6 p-2 rounded bg-bg-tertiary/30 border border-border-sub/50 text-left">
                                                                    <div className="text-left">
                                                                        <p className="text-[7px] font-black text-text-muted uppercase text-left">Duration</p>
                                                                        <p className="text-[10px] font-mono font-bold text-accent-gold uppercase leading-none text-left">
                                                                            {wo ? getHoursOnsite(wo.id) : 'TBD'}
                                                                        </p>
                                                                    </div>
                                                                    <div className="text-left">
                                                                        <p className="text-[7px] font-black text-text-muted uppercase text-left">Payout</p>
                                                                        <p className="text-[11px] font-mono font-bold text-text-red leading-none text-left">
                                                                            ${(item.jobPay || 0).toFixed(2)}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <div className="min-w-[180px] max-w-[250px] p-2 rounded bg-brand-red-dim/10 border border-brand-red/10 text-left flex flex-col justify-center h-full">
                                                                <p className="text-[7px] font-black text-brand-red uppercase flex items-center gap-1 text-left">
                                                                    <ShieldAlert size={8}/> DISCREPANCY: {item.disputeReason}
                                                                </p>
                                                                {item.disputeNotes && (
                                                                    <p className="text-[9px] text-text-secondary leading-tight italic uppercase font-medium text-left truncate mt-0.5">
                                                                        &quot;{item.disputeNotes}&quot;
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {jobReimbursements.length > 0 && (
                                                    <div className="flex flex-col gap-1.5 pl-2 sm:pl-[52px]" onClick={e => e.stopPropagation()}>
                                                        {jobReimbursements.map(r => (
                                                            <div key={r.id} className={cn(
                                                                "flex items-center justify-between gap-3 p-2 rounded border text-left",
                                                                r.status === 'pending' ? "bg-accent-gold/5 border-accent-gold/30" : r.status === 'approved' ? "bg-text-green/5 border-text-green/20" : "bg-brand-red/5 border-brand-red/20"
                                                            )}>
                                                                <div className="min-w-0 flex items-center gap-2">
                                                                    <Receipt size={11} className="shrink-0 text-text-muted" />
                                                                    <p className="text-[9px] font-bold text-text-primary uppercase tracking-wide truncate">{r.description}</p>
                                                                    <span className="text-[10px] font-mono font-bold text-accent-gold shrink-0">${r.amount.toFixed(2)}</span>
                                                                </div>
                                                                {r.status === 'pending' ? (
                                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                                        <Button size="sm" variant="outline" className="h-6 px-2 text-[8px] font-bold uppercase text-text-green border-text-green/30 hover:bg-text-green/10" onClick={() => reviewReimbursement(r.id, 'approved')}>Approve</Button>
                                                                        <Button size="sm" variant="outline" className="h-6 px-2 text-[8px] font-bold uppercase text-brand-red border-brand-red/30 hover:bg-brand-red/10" onClick={() => reviewReimbursement(r.id, 'rejected')}>Reject</Button>
                                                                    </div>
                                                                ) : (
                                                                    <Badge variant="outline" className={cn("text-[7px] h-4 px-1.5 shrink-0 uppercase", r.status === 'rejected' ? "text-brand-red border-brand-red/30" : "text-text-green border-text-green/30")}>{r.status || 'approved'}</Badge>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                </div>
                                            )
                                        })}

                                        {localLog?.missingAssignmentReports?.map(report => {
                                            const isAudited = !!report.isAudited;
                                            const isImportedReport = report.jobType === 'Imported';
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
                                            return (
                                                <div key={report.id} className={cn(
                                                    "p-2 rounded-lg border transition-all flex flex-col gap-2",
                                                    isAudited ? "border-green-border/30 bg-bg-primary" : "border-accent-gold/30 bg-bg-secondary shadow-sm"
                                                )}>
                                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                                                        <div className="flex-1 text-left min-w-0">
                                                            <div className="flex items-center gap-2 text-left flex-wrap">
                                                                <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide text-left truncate max-w-[220px]">{report.summary || 'Missing Assignment'}</p>
                                                                <Badge variant="onhold" className="text-[6px] h-3.5 px-1 uppercase">Manually Added · Was Missing</Badge>
                                                                <Badge variant="outline" className="text-[6px] h-3.5 px-1 uppercase">{report.jobType || 'Manual'}</Badge>
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[8px] text-text-muted font-medium uppercase tracking-widest text-left">
                                                                {report.clientName && <span>{report.clientName}</span>}
                                                                {isImportedReport && report.externalWorkOrderId && (
                                                                    <a href={fieldNationUrl(reportWo)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-brand-red hover:underline" onClick={e => e.stopPropagation()}>
                                                                        WO #{report.externalWorkOrderId} <ExternalLink size={9} />
                                                                    </a>
                                                                )}
                                                                {report.assignmentId && <span className="font-mono text-brand-red">ASMT #{report.assignmentId.toUpperCase()}</span>}
                                                                <span>{report.date} · {report.location.split(',')[0]}</span>
                                                            </div>
                                                        </div>
                                                        <div className="shrink-0 text-left" onClick={e => e.stopPropagation()}>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className={cn(
                                                                    "w-full sm:w-auto h-9 sm:h-7 px-3 uppercase text-[9px] sm:text-[8px] font-bold tracking-widest",
                                                                    isAudited ? "bg-text-green text-white border-text-green" : "border-accent-gold text-accent-gold hover:bg-accent-gold/10"
                                                                )}
                                                                onClick={async () => {
                                                                    // Authorizing a missing job promotes it to a real assignment:
                                                                    // auto-generate its assignment number the first time (the tech
                                                                    // never enters one).
                                                                    const nextAssignmentId = (!isAudited && !report.assignmentId)
                                                                        ? await createDocId(ID_PREFIXES.ASSIGNMENT)
                                                                        : report.assignmentId;
                                                                    const updatedReports = (localLog.missingAssignmentReports || []).map(r =>
                                                                        r.id === report.id ? { ...r, isAudited: !isAudited, assignmentId: nextAssignmentId } : r
                                                                    );
                                                                    await updateDoc(doc(db, 'weeklyLogs', localLog.id), { missingAssignmentReports: updatedReports });
                                                                    setLocalLog({ ...localLog, missingAssignmentReports: updatedReports });
                                                                }}
                                                            >
                                                                {isAudited ? <Check size={12} className="mr-1"/> : <Wrench size={12} className="mr-1"/>}
                                                                {isAudited ? 'Cleared' : 'Authorize'}
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    {/* Settlement: imported → FN pay calc; manual → flat pay input. */}
                                                    <div onClick={e => e.stopPropagation()}>
                                                        {isImportedReport ? (
                                                            <ImportedJobAudit wo={reportWo} onUpdateWorkOrder={(id, updates) => auditMissingReport(report.id, updates)} approvedReimbTotal={0} />
                                                        ) : (
                                                            <div className="flex items-center gap-2">
                                                                <Label className="text-[8px] font-black uppercase text-text-muted whitespace-nowrap">Manual Pay</Label>
                                                                <div className="relative">
                                                                    <DollarSign size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-text-muted" />
                                                                    <Input
                                                                        type="number"
                                                                        defaultValue={report.pay || 0}
                                                                        onBlur={(e) => auditMissingReport(report.id, { pay: parseFloat(e.target.value) || 0, finalPay: parseFloat(e.target.value) || 0 })}
                                                                        className="h-7 w-28 text-xs pl-5 bg-bg-secondary font-mono border border-border-sub"
                                                                    />
                                                                </div>
                                                                <span className="text-[8px] text-text-muted uppercase">tech payout</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {discrepancyItems.length === 0 && (
                                            <div className="p-24 text-center bg-bg-secondary/30 rounded-xl border-2 border-dashed border-border-sub opacity-40">
                                                <CheckCircle2 size={48} className="mx-auto mb-2 text-text-muted" />
                                                <p className="text-[10px] font-bold uppercase tracking-widest italic text-center">Discrepancy registry clear</p>
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </TabsContent>

                            {payrollDisputes.length > 0 && (
                                <TabsContent value="post-approval" className="m-0 h-full text-left">
                                    <ScrollArea className="p-2 text-left sm:h-full sm:min-h-0">
                                        <div className="space-y-2 text-left">
                                            {[...payrollDisputes].sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1)).map(dispute => {
                                                const reasonLabel = dispute.reason === 'incorrect_pay' ? 'Incorrect Pay'
                                                    : dispute.reason === 'missing_reimbursement' ? 'Missing Reimbursement'
                                                    : 'Missing Job';
                                                const relatedWo = dispute.workOrderId ? findWorkOrder(dispute.workOrderId) : undefined;
                                                const isOpenDispute = dispute.status === 'open';
                                                return (
                                                    <div key={dispute.id} className={cn(
                                                        "p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center gap-3 text-left",
                                                        isOpenDispute ? "bg-bg-secondary border-brand-red/30" : "bg-bg-primary border-border-sub/40 opacity-70"
                                                    )}>
                                                        <div className="flex-1 min-w-0 text-left">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <Badge variant="outline" className={cn("text-[7px] h-3.5 px-1.5 uppercase", isOpenDispute ? "border-brand-red/40 text-brand-red bg-brand-red/5" : "border-text-green/40 text-text-green bg-text-green/5")}>
                                                                    {reasonLabel}
                                                                </Badge>
                                                                <span className="text-[10px] font-bold text-text-primary uppercase tracking-wide">{dispute.techName}</span>
                                                                {relatedWo && <WorkOrderId wo={relatedWo} className="!text-[8px]" />}
                                                            </div>
                                                            <p className="text-[10px] text-text-secondary leading-relaxed mt-1 text-left">{dispute.notes}</p>
                                                            <p className="text-[8px] text-text-muted font-mono mt-1">
                                                                {new Date(dispute.createdAt).toLocaleString()}
                                                                {!isOpenDispute && dispute.resolvedBy && ` · Resolved by ${dispute.resolvedBy}`}
                                                            </p>
                                                        </div>
                                                        {isOpenDispute ? (
                                                            <Button variant="outline" size="sm" className="h-8 shrink-0 text-[9px] font-bold uppercase tracking-widest border-text-green text-text-green hover:bg-green-dim" onClick={() => handleResolvePayrollDispute(dispute.id)}>
                                                                <Check size={13} className="mr-1.5"/> Mark Resolved
                                                            </Button>
                                                        ) : (
                                                            <Badge variant="active" className="shrink-0 h-6 px-3 text-[8px] uppercase tracking-widest">Resolved</Badge>
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

                    <DialogFooter className="p-3 sm:p-4 border-t border-border-sub bg-bg-tertiary/50 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 shrink-0">
                        {localLog && (localLog.status === 'Approved' || (localLog as any).status === 'Paid') ? (
                            <Button variant="outline" className="w-full h-11 uppercase font-bold text-[10px] tracking-widest" onClick={() => setIsOpen(false)}>Exit Registry Audit</Button>
                        ) : (canApproveLog || canReturnLog) ? (
                            <>
                                {canReturnLog && localLog?.status === 'Submitted' && (
                                    <Button variant="destructive-outline" className="w-full sm:w-auto order-3 sm:order-1 h-10 px-6 sm:px-8 uppercase font-bold text-[10px] tracking-widest" onClick={() => handleStatusChange('Rejected')}>
                                        <X size={16} className="mr-2"/> Deny Manifest
                                    </Button>
                                )}
                                <div className="hidden sm:block flex-1 order-2" />
                                <Button variant="outline" className="w-full sm:w-auto order-2 sm:order-3 h-11 px-6 sm:px-8 uppercase font-bold text-[10px] tracking-widest" onClick={() => setIsOpen(false)}>Close Feed</Button>
                                {canApproveLog && (
                                    <Button
                                        disabled={!isManifestFullyAudited}
                                        title={isManifestFullyAudited ? undefined : 'Verify all assignments before approving'}
                                        className={cn(
                                            "w-full sm:w-auto order-1 sm:order-4 h-11 px-6 sm:px-12 uppercase font-bold text-[10px] tracking-[0.15em] shadow-lg transition-all",
                                            isManifestFullyAudited ? "bg-brand-red hover:bg-brand-red-hover" : "bg-bg-tertiary text-text-muted cursor-not-allowed border border-border-sub"
                                        )}
                                        onClick={() => handleStatusChange('Approved')}
                                    >
                                        <Check size={16} className="mr-2"/>
                                        {isManifestFullyAudited ? 'Approve Log' : 'Audit Pending'}
                                    </Button>
                                )}
                            </>
                        ) : (
                            <div className="w-full flex items-center justify-between gap-3">
                                <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">View only — you cannot approve or return weekly logs</p>
                                <Button variant="outline" className="h-11 px-8 uppercase font-bold text-[10px] tracking-widest shrink-0" onClick={() => setIsOpen(false)}>Close Feed</Button>
                            </div>
                        )}
                    </DialogFooter>
                </DialogContent>
                <style jsx global>{`
                    .tab-trigger-payroll {
                        @apply px-0 h-12 bg-transparent text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted rounded-none border-b-2 border-transparent transition-all;
                    }
                    .tab-trigger-payroll[data-state="active"] {
                        @apply text-text-primary border-brand-red bg-transparent shadow-none;
                    }
                `}</style>
            </Dialog>

            <JobDetailDialog 
                isOpen={isJobDetailOpen} 
                setIsOpen={setIsJobDetailOpen} 
                mission={selectedJobForDetail} 
            />
        </>
    );
}
