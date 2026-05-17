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
import { workOrders as initialWorkOrders } from '@/lib/data';
import { 
    AlertTriangle, 
    CheckCircle2, 
    ShieldAlert, 
    Check, 
    X, 
    Coins,
    ClipboardList,
    FileText,
    ExternalLink,
    DollarSign,
    Wrench
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

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

    useEffect(() => {
        if (isOpen && initialLog) {
            setLocalLog(JSON.parse(JSON.stringify(initialLog)));
        }
    }, [isOpen, initialLog]);

    const findWorkOrder = (id: string): WorkOrder | undefined => {
        return localWorkOrders.find(wo => wo.id === id);
    };
    
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

    const disputedItems = localLog?.items.filter(item => item.confirmationStatus === 'disputed') || [];
    const confirmedItems = localLog?.items.filter(item => item.confirmationStatus === 'confirmed') || [];
    const totalJobs = localLog?.items.length || 0;

    // Recalculate settlement total based on local edits
    const calculatedTotalPayout = useMemo(() => {
        if (!localLog) return 0;
        const assignmentPay = localLog.items
            .filter(i => i.confirmationStatus === 'confirmed')
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
                        <Badge variant={localLog.status === 'Approved' ? 'active' : localLog.status === 'Submitted' ? 'onhold' : 'pending'} className="h-6 px-4 uppercase text-[10px] tracking-widest">
                            {localLog.status}
                        </Badge>
                    </div>
                </DialogHeader>

                {/* COMMAND QUICK STATS */}
                <div className="grid grid-cols-3 gap-px bg-border-sub border-b border-border-sub">
                    <div className="bg-bg-secondary p-3 text-center">
                        <p className="text-[8px] font-black text-text-muted uppercase tracking-widest mb-1">Total Assignments</p>
                        <p className="text-lg font-bold text-text-primary">{totalJobs}</p>
                    </div>
                    <div className="bg-bg-secondary p-3 text-center border-l border-border-sub">
                        <p className="text-[8px] font-black text-text-muted uppercase tracking-widest mb-1">Audit Alerts</p>
                        <p className={cn("text-lg font-bold", (disputedItems.length > 0 || (localLog.missingAssignmentReports?.length || 0) > 0) ? "text-text-red" : "text-text-green")}>
                            {disputedItems.length + (localLog.missingAssignmentReports?.length || 0)}
                        </p>
                    </div>
                    <div className="bg-bg-secondary p-3 text-center border-l border-border-sub">
                        <p className="text-[8px] font-black text-text-muted uppercase tracking-widest mb-1">Net Settlement</p>
                        <p className="text-lg font-mono font-bold text-text-green">${calculatedTotalPayout.toFixed(2)}</p>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden p-6 space-y-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 h-full max-h-[500px]">
                        {/* LEFT: VERIFIED JOBS */}
                        <section className="space-y-4 flex flex-col overflow-hidden text-left">
                            <div className="flex items-center justify-between px-1">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                                    <CheckCircle2 size={14} className="text-text-green" />
                                    Verified Jobs
                                </h3>
                                <span className="text-[9px] font-bold text-text-muted uppercase">{confirmedItems.length} Entries</span>
                            </div>
                            <ScrollArea className="flex-1 pr-4">
                                <div className="space-y-2 pb-4">
                                    {confirmedItems.map(item => {
                                        const wo = findWorkOrder(item.workOrderId);
                                        const isImported = wo?.source === 'Imported';
                                        return (
                                            <div key={item.id} className="p-3 rounded-lg border border-border-sub bg-bg-secondary flex items-center justify-between group hover:border-text-muted transition-colors">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-xs font-bold text-text-primary uppercase tracking-wide truncate">{wo?.description}</p>
                                                        {isImported && (
                                                            <Badge variant="outline" className="text-[8px] bg-brand-red-dim border-brand-red/20 text-brand-red h-4">IMPORTED</Badge>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5 text-[9px] text-text-muted font-bold uppercase tracking-widest">
                                                        <div className="flex items-center gap-1.5">
                                                          <span className="text-brand-red font-mono">{wo?.id.toUpperCase()}</span>
                                                          {isImported && wo && (
                                                            <a href={getFieldNationLink(wo.id)} target="_blank" rel="noopener noreferrer" title="View Source" className="text-text-muted hover:text-brand-red transition-colors">
                                                              <ExternalLink size={10} />
                                                            </a>
                                                          )}
                                                        </div>
                                                        <span>•</span>
                                                        <span>{wo?.location.split(',')[0]}</span>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex items-center gap-3 ml-4 shrink-0">
                                                    {isImported ? (
                                                        <div className="flex items-center gap-1.5 bg-bg-primary p-1 rounded border border-border-sub">
                                                            <DollarSign size={10} className="text-text-green" />
                                                            <input 
                                                                type="number"
                                                                value={wo?.pay || 0}
                                                                onChange={(e) => handleUpdatePay(wo!.id, parseFloat(e.target.value) || 0)}
                                                                className="w-16 bg-transparent border-none text-[11px] font-mono font-bold text-text-primary focus:ring-0 p-0"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs font-mono font-bold text-text-primary">${wo?.pay.toFixed(2)}</p>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                    {confirmedItems.length === 0 && (
                                        <div className="p-12 text-center border border-dashed border-border-sub rounded-lg opacity-40">
                                            <p className="text-[10px] font-bold uppercase tracking-widest italic">No verified jobs in this manifest</p>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </section>

                        {/* RIGHT: DISCREPANCIES (CARDS) */}
                        <section className="space-y-4 flex flex-col overflow-hidden text-left">
                            <div className="flex items-center gap-2 text-text-red px-1">
                                <ShieldAlert size={14} />
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em]">Discrepancy Registry</h3>
                            </div>
                            <ScrollArea className="flex-1 pr-4">
                                <div className="space-y-3 pb-4">
                                    {disputedItems.map(item => {
                                        const wo = findWorkOrder(item.workOrderId);
                                        const isImported = wo?.source === 'Imported';
                                        return (
                                            <Card key={item.id} className="bg-bg-secondary border-brand-red/30 shadow-sm">
                                                <CardContent className="p-4 space-y-4">
                                                    <div className="flex justify-between items-start">
                                                        <div className="space-y-0.5">
                                                            <div className="flex items-center gap-2">
                                                                <div className="flex items-center gap-1.5">
                                                                  <span className="text-[9px] font-mono font-bold text-text-red uppercase">{wo?.id.toUpperCase()}</span>
                                                                  {isImported && wo && (
                                                                    <a href={getFieldNationLink(wo.id)} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-brand-red transition-colors">
                                                                      <ExternalLink size={10} />
                                                                    </a>
                                                                  )}
                                                                </div>
                                                                <Badge variant="missed" className="text-[7px] h-3.5 px-1.5 uppercase">Technician Dispute</Badge>
                                                            </div>
                                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{wo?.description}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-[8px] font-black text-text-muted uppercase">Base Pay</p>
                                                            <p className="text-xs font-mono font-bold text-text-red">${wo?.pay.toFixed(2)}</p>
                                                        </div>
                                                    </div>
                                                    <div className="p-3 rounded-lg bg-brand-red-dim/10 border border-brand-red/10">
                                                        <p className="text-[9px] font-black text-brand-red uppercase mb-1.5 flex items-center gap-1.5">
                                                            <AlertTriangle size={10}/> Reason: {item.disputeReason}
                                                        </p>
                                                        <p className="text-[10px] text-text-secondary leading-relaxed italic uppercase font-medium">
                                                            &quot;{item.disputeNotes}&quot;
                                                        </p>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Button variant="outline" size="sm" className="flex-1 h-7 text-[9px] uppercase font-bold">Reject Dispute</Button>
                                                        <Button variant="default" size="sm" className="flex-1 h-7 text-[9px] uppercase font-bold bg-brand-red">Audit & Adjust</Button>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )
                                    })}

                                    {localLog.missingAssignmentReports?.map(report => (
                                        <Card key={report.id} className="bg-bg-secondary border-accent-gold/30 shadow-sm">
                                            <CardContent className="p-4 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 bg-bg-tertiary rounded border border-accent-gold/20 text-accent-gold">
                                                            <Wrench size={16}/>
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide">Missing Assignment Report</p>
                                                                <Badge variant="onhold" className="text-[7px] h-3.5 px-1.5 uppercase">Audit Required</Badge>
                                                            </div>
                                                            <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest">{report.date} · {report.location.split(',')[0]}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="p-3 rounded-lg bg-accent-gold-dim/10 border border-accent-gold/10 text-left">
                                                    <p className="text-[10px] text-text-secondary leading-relaxed uppercase font-bold italic">&quot;{report.summary}&quot;</p>
                                                </div>
                                                <div className="space-y-3 text-left">
                                                    <Label className="text-[8px] font-black uppercase text-text-muted ml-1 flex">Manual Pay Authorization</Label>
                                                    <div className="flex gap-2">
                                                        <div className="relative flex-1">
                                                            <DollarSign size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-green" />
                                                            <Input 
                                                                placeholder="Enter payout..." 
                                                                className="h-8 pl-8 bg-bg-primary border-border-sub text-xs font-mono"
                                                            />
                                                        </div>
                                                        <Button variant="default" size="sm" className="h-8 text-[9px] uppercase font-bold bg-text-green px-4">Authorize</Button>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}

                                    {(disputedItems.length === 0 && (!localLog.missingAssignmentReports || localLog.missingAssignmentReports.length === 0)) && (
                                        <div className="p-12 text-center border border-dashed border-border-sub rounded-xl opacity-40 bg-bg-secondary/30">
                                            <CheckCircle2 size={32} className="mx-auto mb-2 text-text-muted" />
                                            <p className="text-[10px] font-bold uppercase tracking-widest italic">Discrepancy registry clear</p>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </section>
                    </div>

                    <Separator className="bg-border-sub" />

                    {/* BOTTOM SECTION: FINANCIALS */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                        {/* LEFT: REIMBURSEMENTS */}
                        <section className="space-y-4 text-left">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2 px-1">
                                <Coins size={14} className="text-accent-gold" />
                                Expense Manifest
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

                        {/* RIGHT: SETTLEMENT SUMMARY */}
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
                                        <span>Base Assignment Pay</span>
                                        <span className="font-mono text-text-primary font-bold">
                                            ${(confirmedItems.reduce((acc, i) => acc + (findWorkOrder(i.workOrderId)?.pay || 0), 0)).toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-[10px] uppercase font-bold text-text-muted">
                                        <span>Authorized Reimbursements</span>
                                        <span className="font-mono text-text-primary font-bold">
                                            +${(localLog.reimbursements.reduce((acc, i) => acc + i.amount, 0)).toFixed(2)}
                                        </span>
                                    </div>
                                    <Separator className="bg-border-sub/50" />
                                    <div className="flex justify-between items-center pt-2">
                                        <div className="space-y-0.5">
                                            <p className="text-[9px] font-black text-text-green uppercase tracking-widest">Total Net Disbursement</p>
                                            <p className="text-[8px] text-text-muted uppercase font-bold">Final verified payout amount</p>
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

                <DialogFooter className="p-4 border-t border-border-sub bg-bg-tertiary/50 flex flex-row items-center gap-3">
                    {localLog.status === 'Submitted' ? (
                        <>
                            <Button variant="destructive-outline" className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest" onClick={() => handleStatusChange('Rejected')}>
                                <X size={16} className="mr-2"/> Deny Manifest
                            </Button>
                            <div className="flex-1" />
                            <Button variant="outline" className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest" onClick={() => setIsOpen(false)}>Close Audit</Button>
                            <Button className="h-10 px-12 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest shadow-lg" onClick={() => handleStatusChange('Approved')}>
                                <Check size={16} className="mr-2"/> Authorize Disbursement
                            </Button>
                        </>
                    ) : (
                        <Button variant="outline" className="w-full h-10 uppercase font-bold text-[10px] tracking-widest" onClick={() => setIsOpen(false)}>Exit Registry Audit</Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
