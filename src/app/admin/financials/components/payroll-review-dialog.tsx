
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { WeeklyLog, Technician, WorkOrder, MissingAssignmentReport, WeeklyLogItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { workOrders as initialWorkOrders, assignmentTimeLogs } from '@/lib/data';
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
    Tabs as TabsIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { differenceInMinutes, parseISO } from 'date-fns';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type PayrollReviewDialogProps = {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    log: WeeklyLog | null;
    technician: Technician | undefined;
    onStatusChange: (logId: string, status: WeeklyLog['status']) => void;
};

const getFieldNationLink = (id: string) => {
  const cleanId = id.replace(/^wo-/, '');
  return `https://app.fieldnation.com/workorders/${cleanId}`;
};

export function PayrollReviewDialog({ isOpen, setIsOpen, log: initialLog, technician, onStatusChange }: PayrollReviewDialogProps) {
    const [localLog, setLocalLog] = useState<WeeklyLog | null>(null);
    const [localWorkOrders, setLocalWorkOrders] = useState<WorkOrder[]>(initialWorkOrders);
    const [auditedIds, setAuditedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (isOpen && initialLog) {
            setLocalLog(JSON.parse(JSON.stringify(initialLog)));
            setAuditedIds(new Set()); // Reset audit state on open
        }
    }, [isOpen, initialLog]);

    const findWorkOrder = (id: string): WorkOrder | undefined => {
        return localWorkOrders.find(wo => wo.id === id);
    };

    const getHoursOnsite = (woId: string) => {
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
    }
    
    const handleStatusChange = (status: WeeklyLog['status']) => {
        if (localLog) {
            onStatusChange(localLog.id, status);
        }
    };

    const handleUpdatePay = (woId: string, newPay: number) => {
        setLocalWorkOrders(prev => prev.map(wo => 
            wo.id === woId ? { ...wo, pay: newPay } : wo
        ));
    };

    const toggleAuditItem = (id: string) => {
        setAuditedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const confirmedItems = localLog?.items.filter(item => item.confirmationStatus === 'confirmed') || [];
    const discrepancyItems = [
        ...(localLog?.items.filter(item => item.confirmationStatus === 'disputed') || []),
        ...(localLog?.missingAssignmentReports || [])
    ];

    const totalJobsCount = (localLog?.items.length || 0) + (localLog?.missingAssignmentReports?.length || 0);
    const auditCompleteCount = auditedIds.size;
    const isManifestFullyAudited = auditCompleteCount === totalJobsCount && totalJobsCount > 0;

    const calculatedTotalPayout = useMemo(() => {
        if (!localLog) return 0;
        const assignmentPay = localLog.items
            .filter(i => i.confirmationStatus === 'confirmed' || i.confirmationStatus === 'disputed')
            .reduce((acc, i) => acc + (findWorkOrder(i.workOrderId)?.pay || 0), 0);
        
        const reimbursementPay = localLog.reimbursements.reduce((acc, r) => acc + r.amount, 0);
        
        return assignmentPay + reimbursementPay;
    }, [localLog, localWorkOrders]);

    if (!localLog || !technician) return null;

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="lg:max-w-6xl bg-bg-elevated border-border-default flex flex-col p-0 overflow-hidden max-h-[90vh]">
                <DialogHeader className="p-4 border-b border-border-sub bg-bg-tertiary/30 text-left">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <Avatar className="h-10 w-10 border border-border-sub">
                                <AvatarImage src={technician.avatarUrl} />
                                <AvatarFallback>{technician.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div>
                                <DialogTitle className="text-sm font-bold uppercase tracking-widest text-text-primary">Registry Audit: {technician.name}</DialogTitle>
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                                    Period: <span className="text-brand-red font-mono">{localLog.weekOf}</span> · Status: <span className="text-text-primary">{localLog.status}</span>
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                             <div className="flex flex-col items-end mr-4">
                                <p className="text-[8px] font-black uppercase text-text-muted">Audit Progress</p>
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
                    <div className="px-6 border-b border-border-sub bg-bg-tertiary/20 flex justify-between items-center">
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
                             <div>
                                <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">Net Settlement</p>
                                <p className="text-lg font-mono font-bold text-text-green leading-none">${calculatedTotalPayout.toFixed(2)}</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden">
                        <ScrollArea className="h-full p-6">
                            <TabsContent value="verified" className="m-0 space-y-3">
                                {confirmedItems.length > 0 ? confirmedItems.map(item => {
                                    const wo = findWorkOrder(item.workOrderId);
                                    const isImported = wo?.source === 'Imported';
                                    const isAudited = auditedIds.has(item.id);
                                    return (
                                        <div key={item.id} className={cn(
                                            "p-4 rounded-xl border transition-all flex items-center justify-between group",
                                            isAudited ? "bg-bg-primary border-green-border/30" : "bg-bg-secondary border-border-sub hover:border-text-muted"
                                        )}>
                                            <div className="min-w-0 flex-1 flex items-center gap-6">
                                                <div className="shrink-0">
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        className={cn(
                                                            "h-8 px-4 uppercase text-[9px] font-bold tracking-widest transition-all",
                                                            isAudited ? "bg-text-green text-white border-text-green" : "border-border-sub text-text-muted hover:border-text-green hover:text-text-green"
                                                        )}
                                                        onClick={() => toggleAuditItem(item.id)}
                                                    >
                                                        {isAudited ? <Check size={14} className="mr-1.5"/> : <ClipboardCheck size={14} className="mr-1.5"/>}
                                                        {isAudited ? 'Audit Pass' : 'Audit & Approve'}
                                                    </Button>
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-bold text-text-primary uppercase tracking-wide truncate">{wo?.description}</p>
                                                        {isImported && (
                                                            <Badge variant="outline" className="text-[8px] bg-brand-red-dim border-brand-red/20 text-brand-red h-4">IMPORTED</Badge>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5 text-[9px] text-text-muted font-bold uppercase tracking-widest">
                                                        <div className="flex items-center gap-1.5">
                                                          <span className="text-brand-red font-mono">{wo?.id.toUpperCase()}</span>
                                                          {isImported && wo && (
                                                            <a href={getFieldNationLink(wo.id)} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-brand-red transition-colors">
                                                              <ExternalLink size={10} />
                                                            </a>
                                                          )}
                                                        </div>
                                                        <span>•</span>
                                                        <span>{wo?.location.split(',')[0]}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-6 ml-4 shrink-0">
                                                {isImported ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex flex-col gap-0.5">
                                                            <Label className="text-[7px] uppercase text-text-muted ml-0.5">Reimbursement</Label>
                                                            <Input type="number" className="h-7 w-16 text-[10px] p-1 bg-bg-primary font-mono" placeholder="0.00" />
                                                        </div>
                                                        <div className="flex flex-col gap-0.5">
                                                            <Label className="text-[7px] uppercase text-text-muted ml-0.5">Overhead</Label>
                                                            <Input type="number" className="h-7 w-16 text-[10px] p-1 bg-bg-primary font-mono" placeholder="0.00" />
                                                        </div>
                                                        <div className="flex flex-col gap-0.5">
                                                            <Label className="text-[7px] uppercase text-text-muted ml-0.5">Total Settlement</Label>
                                                            <div className="relative">
                                                                <DollarSign size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-text-green" />
                                                                <Input 
                                                                    type="number"
                                                                    value={wo?.pay || 0}
                                                                    onChange={(e) => handleUpdatePay(wo!.id, parseFloat(e.target.value) || 0)}
                                                                    className="h-7 w-24 text-[10px] pl-4 p-1 bg-bg-primary font-mono font-bold text-text-green focus:border-brand-red"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-8">
                                                        <div className="text-right">
                                                            <p className="text-[8px] font-black text-text-muted uppercase">Duration On-Site</p>
                                                            <p className="text-xs font-mono font-bold text-accent-gold uppercase tracking-tighter">{getHoursOnsite(wo!.id)}</p>
                                                        </div>
                                                        <div className="text-right min-w-[70px]">
                                                            <p className="text-[8px] font-black text-text-muted uppercase">Base Payout</p>
                                                            <p className="text-sm font-mono font-bold text-text-primary">${wo?.pay.toFixed(2)}</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                }) : (
                                    <div className="p-24 text-center border-2 border-dashed border-border-sub rounded-xl opacity-40 bg-bg-secondary/30">
                                        <CheckCircle2 size={48} className="mx-auto text-text-muted mb-2" />
                                        <p className="text-[10px] font-bold uppercase tracking-widest">No verified assignments in this manifest</p>
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="discrepancy" className="m-0 space-y-4">
                                {localLog.items.filter(i => i.confirmationStatus === 'disputed').map(item => {
                                    const wo = findWorkOrder(item.workOrderId);
                                    const isAudited = auditedIds.has(item.id);
                                    return (
                                        <Card key={item.id} className={cn(
                                            "bg-bg-secondary border transition-all",
                                            isAudited ? "border-green-border/30" : "border-brand-red/30 shadow-sm"
                                        )}>
                                            <CardContent className="p-4 space-y-4">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex items-center gap-4">
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className={cn(
                                                                "h-8 px-4 uppercase text-[9px] font-bold tracking-widest",
                                                                isAudited ? "bg-text-green text-white border-text-green" : "border-brand-red text-text-red hover:bg-brand-red-dim"
                                                            )}
                                                            onClick={() => toggleAuditItem(item.id)}
                                                        >
                                                            {isAudited ? <Check size={14} className="mr-1.5"/> : <AlertTriangle size={14} className="mr-1.5"/>}
                                                            {isAudited ? 'Audit Resolved' : 'Audit & Resolve'}
                                                        </Button>
                                                        <div className="space-y-0.5">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[9px] font-mono font-bold text-text-red uppercase">{wo?.id.toUpperCase()}</span>
                                                                <Badge variant="missed" className="text-[7px] h-3.5 px-1.5 uppercase">Technician Dispute</Badge>
                                                            </div>
                                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{wo?.description}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-[8px] font-black text-text-muted uppercase">Base Payout</p>
                                                        <p className="text-sm font-mono font-bold text-text-red">${wo?.pay.toFixed(2)}</p>
                                                    </div>
                                                </div>
                                                <div className="p-3 rounded-lg bg-brand-red-dim/10 border border-brand-red/10 text-left">
                                                    <p className="text-[9px] font-black text-brand-red uppercase mb-1.5 flex items-center gap-1.5">
                                                        <ShieldAlert size={10}/> Reported Discrepancy: {item.disputeReason}
                                                    </p>
                                                    <p className="text-[10px] text-text-secondary leading-relaxed italic uppercase font-medium">
                                                        &quot;{item.disputeNotes}&quot;
                                                    </p>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )
                                })}

                                {localLog.missingAssignmentReports?.map(report => {
                                    const isAudited = auditedIds.has(report.id);
                                    return (
                                        <Card key={report.id} className={cn(
                                            "bg-bg-secondary border transition-all",
                                            isAudited ? "border-green-border/30" : "border-accent-gold/30 shadow-sm"
                                        )}>
                                            <CardContent className="p-4 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className={cn(
                                                                "h-8 px-4 uppercase text-[9px] font-bold tracking-widest",
                                                                isAudited ? "bg-text-green text-white border-text-green" : "border-accent-gold text-accent-gold hover:bg-accent-gold/10"
                                                            )}
                                                            onClick={() => toggleAuditItem(report.id)}
                                                        >
                                                            {isAudited ? <Check size={14} className="mr-1.5"/> : <Wrench size={14} className="mr-1.5"/>}
                                                            {isAudited ? 'Report Cleared' : 'Audit & Authorize'}
                                                        </Button>
                                                        <div className="p-2 bg-bg-tertiary rounded border border-border-sub text-accent-gold">
                                                            <Wrench size={16}/>
                                                        </div>
                                                        <div className="text-left">
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide">Missing Assignment Report</p>
                                                                <Badge variant="onhold" className="text-[7px] h-3.5 px-1.5 uppercase">Awaiting Manual Pay</Badge>
                                                            </div>
                                                            <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest">{report.date} · {report.location.split(',')[0]}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="p-3 rounded-lg bg-accent-gold-dim/10 border border-accent-gold/10 text-left">
                                                    <p className="text-[10px] text-text-secondary leading-relaxed uppercase font-bold italic">&quot;{report.summary}&quot;</p>
                                                </div>
                                                {!isAudited && (
                                                    <div className="space-y-3 text-left animate-in fade-in duration-300">
                                                        <Label className="text-[8px] font-black uppercase text-text-muted ml-1 flex">Manual Pay Authorization</Label>
                                                        <div className="flex gap-2">
                                                            <div className="relative flex-1">
                                                                <DollarSign size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-green" />
                                                                <Input 
                                                                    placeholder="Enter payout..." 
                                                                    className="h-8 pl-8 bg-bg-primary border-border-sub text-xs font-mono"
                                                                />
                                                            </div>
                                                            <Button variant="default" size="sm" className="h-8 text-[9px] uppercase font-bold bg-text-green px-4">Apply & Authorize</Button>
                                                        </div>
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    );
                                })}

                                {discrepancyItems.length === 0 && (
                                    <div className="p-24 text-center border-2 border-dashed border-border-sub rounded-xl opacity-40 bg-bg-secondary/30">
                                        <CheckCircle2 size={48} className="mx-auto mb-2 text-text-muted" />
                                        <p className="text-[10px] font-bold uppercase tracking-widest italic">Discrepancy registry clear</p>
                                    </div>
                                )}
                            </TabsContent>
                        </ScrollArea>
                    </div>

                    <Separator className="bg-border-sub" />

                    <div className="p-6 bg-bg-tertiary/10 space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                            <section className="space-y-4 text-left">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2 px-1">
                                    <Coins size={14} className="text-accent-gold" />
                                    Authorized Expenses
                                </h3>
                                <div className="space-y-2">
                                    {localLog.reimbursements.map(item => (
                                        <div key={item.id} className="p-3 rounded-lg border border-border-sub bg-bg-secondary flex justify-between items-center group hover:bg-bg-tertiary transition-colors">
                                            <div className="min-w-0">
                                                <p className="text-[10px] font-bold text-text-primary uppercase truncate">{item.description}</p>
                                                <p className="text-[8px] text-text-muted font-mono uppercase font-bold">{item.date}</p>
                                            </div>
                                            <p className="text-[10px] font-mono font-bold text-text-green ml-4">+${item.amount.toFixed(2)}</p>
                                        </div>
                                    ))}
                                    {localLog.reimbursements.length === 0 && (
                                        <div className="p-8 text-center border border-dashed border-border-sub rounded-lg opacity-40">
                                            <p className="text-[10px] font-bold uppercase tracking-widest">No expenses logged</p>
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section className="space-y-4 text-left">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2 px-1">
                                    <FileText size={14} className="text-brand-red" />
                                    Settlement Verification
                                </h3>
                                <div className="p-6 rounded-2xl bg-bg-secondary border-2 border-green-border/20 space-y-6 shadow-inner relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 opacity-5">
                                        <Coins size={80} />
                                    </div>
                                    <div className="space-y-3 relative z-10">
                                        <div className="flex justify-between text-[10px] uppercase font-bold text-text-muted">
                                            <span>Assignment Net Pay</span>
                                            <span className="font-mono text-text-primary font-bold">
                                                ${(localLog.items.reduce((acc, i) => acc + (findWorkOrder(i.workOrderId)?.pay || 0), 0)).toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-[10px] uppercase font-bold text-text-muted">
                                            <span>Total Reimbursements</span>
                                            <span className="font-mono text-text-primary font-bold">
                                                +${(localLog.reimbursements.reduce((acc, i) => acc + i.amount, 0)).toFixed(2)}
                                            </span>
                                        </div>
                                        <Separator className="bg-border-sub/50" />
                                        <div className="flex justify-between items-center pt-2">
                                            <div className="space-y-0.5">
                                                <p className="text-[9px] font-black text-text-green uppercase tracking-widest">Calculated Disbursement</p>
                                                <p className="text-[8px] text-text-muted uppercase font-bold">Verified payout target</p>
                                            </div>
                                            <p className="text-3xl font-mono font-bold text-text-green">
                                                ${calculatedTotalPayout.toFixed(2)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                </Tabs>

                <DialogFooter className="p-4 border-t border-border-sub bg-bg-tertiary/50 flex flex-row items-center gap-3">
                    {localLog.status === 'Submitted' ? (
                        <>
                            <Button variant="destructive-outline" className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest" onClick={() => handleStatusChange('Rejected')}>
                                <X size={16} className="mr-2"/> Deny Manifest
                            </Button>
                            <div className="flex-1" />
                            <Button variant="outline" className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest" onClick={() => setIsOpen(false)}>Close Feed</Button>
                            <Button 
                                disabled={!isManifestFullyAudited}
                                className={cn(
                                    "h-10 px-12 uppercase font-bold text-[10px] tracking-widest shadow-lg transition-all",
                                    isManifestFullyAudited ? "bg-brand-red hover:bg-brand-red-hover" : "bg-bg-tertiary text-text-muted cursor-not-allowed border border-border-sub"
                                )} 
                                onClick={() => handleStatusChange('Approved')}
                            >
                                <Check size={16} className="mr-2"/> 
                                {isManifestFullyAudited ? 'Authorize Disbursement' : 'Audit Pending'}
                            </Button>
                        </>
                    ) : (
                        <Button variant="outline" className="w-full h-10 uppercase font-bold text-[10px] tracking-widest" onClick={() => setIsOpen(false)}>Exit Registry Audit</Button>
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
    );
}
