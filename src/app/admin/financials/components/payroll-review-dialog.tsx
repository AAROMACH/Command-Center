'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { WeeklyLog, Technician, WorkOrder, WeeklyLogItem } from '@/lib/types';
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
    Coins,
    FileText,
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
    Info,
    ChevronRight,
    MapPin,
    Save,
    RotateCcw
} from 'lucide-react';
import { cn, formatCityState } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { differenceInMinutes, parseISO, format } from 'date-fns';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { db } from '@/lib/firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { JobDetailDialog } from '@/components/job-detail-dialog';

type PayrollReviewDialogProps = {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    log: WeeklyLog | null;
    technician: Technician | undefined;
    missions: WorkOrder[];
    onStatusChange: (logId: string, status: WeeklyLog['status'], total?: number) => void;
};

/**
 * @fileOverview Internal Audit Sub-Component for individual mission settlement.
 * Implements a local buffer protocol to ensure notifications only trigger on finalized save.
 */
function ImportedJobAudit({ 
    wo, 
    onUpdateWorkOrder 
}: { 
    wo: WorkOrder; 
    onUpdateWorkOrder: (id: string, updates: Partial<WorkOrder>) => void 
}) {
    // Local Buffer State
    const [localPay, setLocalPay] = useState(wo.pay);
    const [localReimb, setLocalReimb] = useState(wo.auditReimbursement || 0);
    const [localOverhead, setLocalOverhead] = useState(wo.auditOverhead || 0);

    const isDirty = localPay !== wo.pay || localReimb !== (wo.auditReimbursement || 0) || localOverhead !== (wo.auditOverhead || 0);

    // Dynamic Financial Projections (Local)
    const fnFeeLabor = localPay * 0.1585;
    const fnFeeReimb = localReimb * 0.1585;
    const totalFnFee = fnFeeLabor + fnFeeReimb;
    const netLabor = localPay - fnFeeLabor;
    const techPayout = (netLabor * 0.50) + localReimb;
    const aaromachPay = (netLabor * 0.50) - fnFeeReimb - localOverhead;

    const handleCommit = () => {
        onUpdateWorkOrder(wo.id, { 
            pay: localPay,
            auditReimbursement: localReimb,
            auditOverhead: localOverhead,
            finalPay: Math.max(0, techPayout) 
        });
    };

    const handleReset = () => {
        setLocalPay(wo.pay);
        setLocalReimb(wo.auditReimbursement || 0);
        setLocalOverhead(wo.auditOverhead || 0);
    };

    return (
        <div className={cn(
            "flex flex-col gap-0.5 p-1 bg-transparent border rounded-md text-left w-fit min-w-[320px] transition-all",
            isDirty ? "border-brand-red ring-1 ring-brand-red/20 shadow-lg" : "border-border-sub"
        )}>
             <div className="grid grid-cols-4 gap-1 text-left items-end">
                <div className="space-y-0 text-left">
                    <Label className="text-[6px] font-black uppercase text-text-muted ml-0.5 text-left">Labor Pay</Label>
                    <div className="relative text-left">
                        <DollarSign size={8} className="absolute left-1 top-1/2 -translate-y-1/2 text-text-muted" />
                        <Input 
                            type="number"
                            value={localPay}
                            onChange={(e) => setLocalPay(parseFloat(e.target.value) || 0)}
                            className="h-4 w-full text-[8px] pl-5 bg-bg-secondary font-mono font-bold border-none shadow-none focus-visible:ring-0" 
                        />
                    </div>
                </div>
                <div className="space-y-0 text-left">
                    <Label className="text-[6px] font-black uppercase text-text-muted ml-0.5 text-left">Reimb.</Label>
                    <div className="relative text-left">
                        <DollarSign size={8} className="absolute left-1 top-1/2 -translate-y-1/2 text-text-muted" />
                        <Input 
                            type="number"
                            value={localReimb}
                            onChange={(e) => setLocalReimb(parseFloat(e.target.value) || 0)}
                            className="h-4 w-full text-[8px] pl-5 bg-bg-secondary font-mono border-none shadow-none focus-visible:ring-0" 
                        />
                    </div>
                </div>
                <div className="space-y-0 text-left">
                    <Label className="text-[6px] font-black uppercase text-text-muted ml-0.5 text-left">Overhead</Label>
                    <div className="relative text-left">
                        <DollarSign size={8} className="absolute left-1 top-1/2 -translate-y-1/2 text-text-muted" />
                        <Input 
                            type="number"
                            value={localOverhead}
                            onChange={(e) => setLocalOverhead(parseFloat(e.target.value) || 0)}
                            className="h-4 w-full text-[8px] pl-5 bg-bg-secondary font-mono border-none shadow-none focus-visible:ring-0" 
                        />
                    </div>
                </div>
                <div className="flex gap-0.5 pb-0.5 pr-0.5">
                    {isDirty && (
                        <>
                            <button 
                                onClick={handleReset}
                                className="h-4 w-4 rounded bg-bg-tertiary flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
                                title="Reset changes"
                            >
                                <RotateCcw size={8}/>
                            </button>
                            <button 
                                onClick={handleCommit}
                                className="h-4 w-4 rounded bg-brand-red flex items-center justify-center text-white hover:bg-brand-red-hover transition-colors shadow-sm"
                                title="Commit Audit"
                            >
                                <Save size={8}/>
                            </button>
                        </>
                    )}
                </div>
             </div>

             <div className="grid grid-cols-4 gap-1 pt-0.5 border-t border-border-sub/30 text-left">
                <div className="space-y-0 text-left">
                    <p className="text-[5px] font-black text-text-muted uppercase text-left">FN Fee (15.85%)</p>
                    <p className="text-[8px] font-mono font-bold text-text-primary leading-none text-left">${totalFnFee.toFixed(2)}</p>
                </div>
                <div className="space-y-0 text-left">
                    <p className="text-[5px] font-black text-text-muted uppercase text-left">Net Labor</p>
                    <p className="text-[8px] font-mono font-bold text-text-primary leading-none text-left">${netLabor.toFixed(2)}</p>
                </div>
                <div className="space-y-0 text-left">
                    <p className="text-[5px] font-black text-text-green uppercase text-left">Tech Payout</p>
                    <p className="text-[8px] font-mono font-bold text-text-green leading-none text-left">${techPayout.toFixed(2)}</p>
                </div>
                <div className="space-y-0 text-right pr-1">
                    <p className="text-[5px] font-black text-brand-red uppercase text-right">Aaromach</p>
                    <p className="text-[8px] font-mono font-bold text-brand-red leading-none text-right">${aaromachPay.toFixed(2)}</p>
                </div>
             </div>
        </div>
    );
}

export function PayrollReviewDialog({ isOpen, setIsOpen, log: initialLog, technician, missions, onStatusChange }: PayrollReviewDialogProps) {
    const [localLog, setLocalLog] = useState<WeeklyLog | null>(null);
    const [selectedJobForDetail, setSelectedJobForDetail] = useState<WorkOrder | null>(null);
    const [isJobDetailOpen, setIsJobDetailOpen] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        if (isOpen && initialLog) {
            setLocalLog(JSON.parse(JSON.stringify(initialLog)));
        }
    }, [isOpen, initialLog]);

    const findWorkOrder = useCallback((id: string): WorkOrder | undefined => {
        return missions.find(wo => wo.id === id);
    }, [missions]);

    const getHoursOnsite = useCallback((woId: string) => {
        if (!technician) return 'TBD';
        const log = assignmentTimeLogs.find(l => l.workOrderId === woId && l.technicianId === technician.id);
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
        const reimbursementPay = (localLog.reimbursements || []).reduce((acc, r) => acc + r.amount, 0);
        return assignmentPay + reimbursementPay;
    }, [localLog]);
    
    const handleStatusChange = async (status: WeeklyLog['status']) => {
        if (localLog) {
            const finalTotal = calculatedTotalPayout;
            try {
                const logRef = doc(db, 'weeklyLogs', localLog.id);
                await updateDoc(logRef, { 
                    status,
                    totalPayout: finalTotal
                });
                onStatusChange(localLog.id, status, finalTotal);
            } catch (e: any) {
                toast({ variant: 'destructive', title: 'Update Failed', description: e.message });
            }
        }
    };

    const handleApproveUnsubmit = async () => {
        if (!localLog) return;
        try {
            const logRef = doc(db, 'weeklyLogs', localLog.id);
            await updateDoc(logRef, {
                status: 'Draft',
                unsubmitRequested: false,
                unsubmitReason: null,
                unsubmitRequestedAt: null
            });
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

    const toggleAuditItem = async (itemId: string, workOrderId: string) => {
        if (!localLog) return;
        
        const item = (localLog.items || []).find(i => i.id === itemId);
        if (!item) return;

        const nextStatus = item.confirmationStatus === 'confirmed' ? null : 'confirmed';
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
                <DialogContent className="lg:max-w-6xl bg-bg-elevated border-border-default flex flex-col p-0 overflow-hidden h-[90vh] shadow-2xl text-left">
                    <DialogHeader className="p-4 border-b border-border-sub bg-bg-tertiary/30 text-left shrink-0 space-y-0">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <Avatar className="h-10 w-10 border border-border-sub">
                                    <AvatarImage src={technician.avatarUrl} />
                                    <AvatarFallback>{technician.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="text-left">
                                    <div className="flex items-center gap-2">
                                        <DialogTitle className="text-sm font-bold uppercase tracking-widest text-text-primary text-left">Registry Audit: {technician.name}</DialogTitle>
                                        {localLog.unsubmitRequested && (
                                            <Badge variant="destructive" className="h-4 px-1.5 text-[7px] uppercase animate-pulse">Unsubmit Requested</Badge>
                                        )}
                                    </div>
                                    <DialogDescription className="text-[10px] font-bold text-text-muted uppercase tracking-widest text-left">
                                        Period: <span className="text-brand-red font-mono">{localLog.weekOf}</span> · Status: <span className="text-text-primary">{localLog.status}</span>
                                    </DialogDescription>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex flex-col items-end mr-4">
                                    <p className="text-[8px] font-black text-text-muted uppercase">Audit Progress</p>
                                    <p className={cn("text-xs font-mono font-bold", isManifestFullyAudited ? "text-text-green" : "text-accent-gold")}>
                                        {auditCompleteCount} / {totalJobsCount} VERIFIED
                                    </p>
                                </div>
                                <Badge variant={localLog.status === 'Approved' ? 'active' : localLog.status === 'Submitted' ? 'onhold' : 'pending'} className="h-6 px-4 uppercase text-[10px] tracking-widest">
                                    {localLog.status}
                                </Badge>
                            </div>
                        </div>
                    </DialogHeader>

                    <Tabs defaultValue="verified" className="flex-1 overflow-hidden flex flex-col">
                        <div className="px-6 border-b border-border-sub bg-bg-tertiary/20 flex justify-between items-center shrink-0">
                            <TabsList className="h-12 bg-transparent p-0 gap-8 justify-start">
                                <TabsTrigger value="verified" className="tab-trigger-payroll flex items-center gap-2">
                                    <CheckCircle2 size={14} />
                                    Verified Assignments
                                    <span className="ml-1 opacity-50">({confirmedItems.length})</span>
                                </TabsTrigger>
                                <TabsTrigger value="discrepancy" className="tab-trigger-payroll flex items-center gap-2">
                                    <ShieldAlert size={14} />
                                    Discrepancy Registry
                                    <span className="ml-1 opacity-50">({discrepancyItems.length})</span>
                                </TabsTrigger>
                            </TabsList>
                            <div className="flex items-center gap-4 text-right">
                                <div className="text-right">
                                    <p className="text-[8px] font-black text-text-muted uppercase tracking-widest text-right">Net Tech Settlement</p>
                                    <p className="text-lg font-mono font-bold text-text-green leading-none">${calculatedTotalPayout.toFixed(2)}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-hidden relative">
                            <TabsContent value="verified" className="m-0 h-full text-left">
                                <ScrollArea className="h-full p-2">
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
                                                        <Button 
                                                            size="sm" 
                                                            className="h-7 px-4 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[8px] tracking-widest text-white"
                                                            onClick={handleApproveUnsubmit}
                                                        >
                                                            <Undo2 size={10} className="mr-1.5"/> Authorize Unsubmit
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {confirmedItems.length > 0 ? confirmedItems.map(item => {
                                            const wo = findWorkOrder(item.workOrderId);
                                            const isImported = wo?.source === 'Imported';
                                            const isAudited = item.isAdminReviewed;
                                            const displayTitle = wo?.title || 'Mission identifier lookup pending...';

                                            return (
                                                <div key={item.id} className={cn(
                                                    "p-2 rounded-lg border transition-all flex group gap-4 min-h-[3rem] items-center cursor-pointer",
                                                    isAudited ? "bg-bg-primary border-green-border/30" : "bg-bg-secondary border-border-sub hover:border-text-muted"
                                                )} onClick={() => wo && handleOpenJobDetail(wo)}>
                                                    <div className="shrink-0 flex items-center gap-2 pr-2 border-r border-border-sub/30" onClick={e => e.stopPropagation()}>
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className={cn(
                                                                "h-7 px-3 uppercase text-[8px] font-bold tracking-widest transition-all",
                                                                isAudited ? "bg-text-green text-white border-text-green" : "border-border-sub text-text-muted hover:border-text-green"
                                                            )}
                                                            onClick={() => toggleAuditItem(item.id, item.workOrderId)}
                                                        >
                                                            {isAudited ? <Check size={12} className="mr-1"/> : <ClipboardCheck size={12} className="mr-1"/>}
                                                            {isAudited ? 'Verified' : 'Approve'}
                                                        </Button>
                                                    </div>
                                                    
                                                    <div className="flex-1 flex items-center justify-between gap-8">
                                                        <div className="min-w-0 text-left">
                                                            <div className="flex items-center gap-2 text-left">
                                                                <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide truncate text-left">{displayTitle}</p>
                                                                {isImported && <Badge variant="outline" className="text-[6px] bg-brand-red-dim border-brand-red/20 text-brand-red h-3 px-1">IMPORTED</Badge>}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-0.5 text-[8px] text-text-muted font-medium uppercase tracking-widest text-left">
                                                                <span className="text-brand-red font-mono font-bold">{(wo?.id || item.workOrderId || '').toUpperCase()}</span>
                                                                <span>•</span>
                                                                <span>{wo?.location ? formatCityState(wo.location) : 'Location Pending'}</span>
                                                                <span>•</span>
                                                                <span>{wo?.scheduleDate || 'Schedule Pending'} · {wo?.scheduleTime || 'TBD'}</span>
                                                            </div>
                                                        </div>

                                                        <div className="shrink-0" onClick={e => e.stopPropagation()}>
                                                            {isImported && wo ? (
                                                                <ImportedJobAudit wo={wo} onUpdateWorkOrder={handleUpdateWorkOrder} />
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
                                <ScrollArea className="h-full p-2 text-left">
                                    <div className="space-y-1 text-left">
                                        {(localLog?.items || []).filter(i => i.confirmationStatus === 'disputed').map(item => {
                                            const wo = findWorkOrder(item.workOrderId);
                                            const isAudited = item.isAdminReviewed;
                                            const isImported = wo?.source === 'Imported';
                                            const displayTitle = wo?.title || 'Mission identifier lookup pending...';

                                            return (
                                                <div key={item.id} className={cn(
                                                    "p-2 rounded-lg border transition-all flex group gap-4 min-h-[3rem] items-center cursor-pointer",
                                                    isAudited ? "bg-bg-primary border-green-border/30" : "bg-bg-secondary border-brand-red/30 shadow-sm"
                                                )} onClick={() => wo && handleOpenJobDetail(wo)}>
                                                    <div className="shrink-0 flex items-center gap-2 pr-2 border-r border-border-sub/30" onClick={e => e.stopPropagation()}>
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className={cn(
                                                                "h-7 px-3 uppercase text-[8px] font-bold tracking-widest",
                                                                isAudited ? "bg-text-green text-white border-text-green" : "border-brand-red text-text-red hover:bg-brand-red-dim"
                                                            )}
                                                            onClick={() => toggleAuditItem(item.id, item.workOrderId)}
                                                        >
                                                            {isAudited ? <Check size={12} className="mr-1"/> : <AlertTriangle size={12} className="mr-1"/>}
                                                            {isAudited ? 'Resolved' : 'Resolve'}
                                                        </Button>
                                                    </div>

                                                    <div className="flex-1 flex flex-col gap-2">
                                                        <div className="min-w-0 text-left">
                                                            <div className="flex items-center gap-2 text-left">
                                                                <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide truncate text-left">{displayTitle}</p>
                                                                {isImported && <Badge variant="outline" className="text-[6px] bg-brand-red-dim border-brand-red/20 text-brand-red h-3 px-1">IMPORTED</Badge>}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-0.5 text-[8px] text-text-muted font-medium uppercase tracking-widest text-left">
                                                                <span className="text-brand-red font-mono font-bold">{(wo?.id || item.workOrderId || '').toUpperCase()}</span>
                                                                <span>•</span>
                                                                <span>{wo?.location ? formatCityState(wo.location) : 'Location Pending'}</span>
                                                                <span>•</span>
                                                                <span>{wo?.scheduleDate || 'Schedule Pending'} · {wo?.scheduleTime || 'TBD'}</span>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-4 shrink-0" onClick={e => e.stopPropagation()}>
                                                            {isImported && wo ? (
                                                                <ImportedJobAudit wo={wo} onUpdateWorkOrder={handleUpdateWorkOrder} />
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
                                            )
                                        })}

                                        {localLog?.missingAssignmentReports?.map(report => {
                                            const isAudited = (report as any).isAudited;
                                            return (
                                                <div key={report.id} className={cn(
                                                    "p-2 rounded-lg border transition-all flex group gap-4 min-h-[3rem] items-center",
                                                    isAudited ? "border-green-border/30 bg-bg-primary" : "border-accent-gold/30 bg-bg-secondary shadow-sm"
                                                )}>
                                                    <div className="shrink-0 text-left">
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className={cn(
                                                                "h-7 px-3 uppercase text-[8px] font-bold tracking-widest",
                                                                isAudited ? "bg-text-green text-white border-text-green" : "border-accent-gold text-accent-gold hover:bg-accent-gold/10"
                                                            )}
                                                            onClick={async () => {
                                                                const updatedReports = (localLog.missingAssignmentReports || []).map(r => 
                                                                    r.id === report.id ? { ...r, isAudited: !isAudited } : r
                                                                );
                                                                await updateDoc(doc(db, 'weeklyLogs', localLog.id), { missingAssignmentReports: updatedReports });
                                                                setLocalLog({ ...localLog, missingAssignmentReports: updatedReports });
                                                            }}
                                                        >
                                                            {isAudited ? <Check size={12} className="mr-1"/> : <Wrench size={12} className="mr-1"/>}
                                                            {isAudited ? 'Cleared' : 'Authorize'}
                                                        </Button>
                                                    </div>
                                                    
                                                    <div className="flex-1 flex items-center justify-between gap-8">
                                                        <div className="text-left">
                                                            <div className="flex items-center gap-2 text-left">
                                                                <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide text-left">Missing Assignment Report</p>
                                                                <Badge variant="onhold" className="text-[6px] h-3.5 px-1 uppercase">MANUAL PAY</Badge>
                                                            </div>
                                                            <p className="text-[8px] text-text-muted font-medium uppercase tracking-widest text-left">{report.date} · {report.location.split(',')[0]}</p>
                                                        </div>

                                                        <div className="max-w-[400px] p-2 rounded bg-accent-gold-dim/10 border border-accent-gold/10 text-left">
                                                            <p className="text-[9px] text-text-secondary leading-tight uppercase font-medium italic truncate text-left">&quot;{report.summary}&quot;</p>
                                                        </div>
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
                        </div>

                        <Separator className="bg-border-sub shrink-0" />

                        <div className="p-2 bg-bg-tertiary/10 space-y-1 shrink-0">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <section className="space-y-1 text-left px-4">
                                    <h3 className="text-[8px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-1.5 text-left">
                                        <Coins size={10} className="text-accent-gold" /> Expenses
                                    </h3>
                                    <div className="space-y-0.5">
                                        {(localLog?.reimbursements || []).map(item => (
                                            <div key={item.id} className="px-2 py-0.5 rounded border border-border-sub bg-bg-secondary flex justify-between items-center text-left text-[9px] font-bold">
                                                <p className="text-text-primary uppercase truncate flex-1">{item.description}</p>
                                                <p className="text-text-green ml-2 font-mono">+${item.amount.toFixed(2)}</p>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                <section className="space-y-1 text-left px-4">
                                    <h3 className="text-[8px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-1.5 text-left">
                                        <FileText size={10} className="text-brand-red" /> Settlement
                                    </h3>
                                    <div className="p-2 rounded-lg bg-bg-secondary border border-green-border/20 space-y-1 shadow-inner">
                                        <div className="flex justify-between items-center">
                                            <p className="text-[7px] font-black text-text-green uppercase tracking-widest">Disbursement</p>
                                            <p className="text-lg font-mono font-bold text-text-green leading-none">
                                                ${calculatedTotalPayout.toFixed(2)}
                                            </p>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </div>
                    </Tabs>

                    <div className="p-5 rounded-xl bg-bg-tertiary/20 border border-dashed border-border-sub flex items-start gap-4 mx-6 mb-4">
                        <Info size={18} className="text-accent-gold shrink-0 mt-0.5" />
                        <div className="space-y-1 text-left">
                            <p className="text-[10px] font-black text-text-primary uppercase tracking-widest">Audit Terminal Protocol</p>
                            <p className="text-[10px] text-text-muted leading-relaxed uppercase font-medium text-left">
                                Registry verification is required for all mission line items before financial disbursement authorization.
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="p-4 border-t border-border-sub bg-bg-tertiary/50 flex flex-row items-center gap-3 shrink-0">
                        {localLog?.status === 'Submitted' ? (
                            <>
                                <Button variant="destructive-outline" className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest" onClick={() => handleStatusChange('Rejected')}>
                                    <X size={16} className="mr-2"/> Deny Manifest
                                </Button>
                                <div className="flex-1" />
                                <Button variant="outline" className="h-11 px-8 uppercase font-bold text-[10px] tracking-widest" onClick={() => setIsOpen(false)}>Close Feed</Button>
                                <Button 
                                    disabled={!isManifestFullyAudited}
                                    className={cn(
                                        "h-11 px-12 uppercase font-bold text-[10px] tracking-[0.15em] shadow-lg transition-all",
                                        isManifestFullyAudited ? "bg-brand-red hover:bg-brand-red-hover" : "bg-bg-tertiary text-text-muted cursor-not-allowed border border-border-sub"
                                    )} 
                                    onClick={() => handleStatusChange('Approved')}
                                >
                                    <Check size={16} className="mr-2"/> 
                                    {isManifestFullyAudited ? 'Authorize Disbursement' : 'Audit Pending'}
                                </Button>
                            </>
                        ) : (
                            <Button variant="outline" className="w-full h-11 uppercase font-bold text-[10px] tracking-widest" onClick={() => setIsOpen(false)}>Exit Registry Audit</Button>
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
