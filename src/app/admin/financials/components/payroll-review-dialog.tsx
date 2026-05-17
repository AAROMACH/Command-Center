'use client';

import type { WeeklyLog, Technician, WorkOrder, MissingAssignmentReport } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { workOrders } from '@/lib/data';
import { useToast } from '@/hooks/use-toast';
import { 
    AlertTriangle, 
    CheckCircle2, 
    Clock, 
    ShieldAlert, 
    MapPin, 
    Calendar,
    Check,
    X,
    Coins,
    User,
    ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';

type PayrollReviewDialogProps = {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    log: WeeklyLog | null;
    technician: Technician | undefined;
    onStatusChange: (logId: string, status: WeeklyLog['status']) => void;
};

export function PayrollReviewDialog({ isOpen, setIsOpen, log, technician, onStatusChange }: PayrollReviewDialogProps) {
    if (!log || !technician) return null;

    const findWorkOrder = (id: string): WorkOrder | undefined => {
        return workOrders.find(wo => wo.id === id);
    };
    
    const handleStatusChange = (status: WeeklyLog['status']) => {
        onStatusChange(log.id, status);
    };

    const disputedItems = log.items.filter(item => item.confirmationStatus === 'disputed');
    const confirmedItems = log.items.filter(item => item.confirmationStatus === 'confirmed');
    const totalJobs = log.items.length;

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="lg:max-w-5xl bg-bg-elevated border-border-default flex flex-col p-0 overflow-hidden max-h-[90vh]">
                <DialogHeader className="p-4 border-b border-border-sub bg-bg-tertiary/30">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <Avatar className="h-10 w-10 border border-border-sub">
                                <AvatarImage src={technician.avatarUrl} />
                                <AvatarFallback>{technician.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div>
                                <DialogTitle className="text-sm font-bold uppercase tracking-widest text-text-primary">Registry Audit: {technician.name}</DialogTitle>
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                                    Period: <span className="text-brand-red font-mono">{log.weekOf}</span> · Status: <span className="text-text-primary">{log.status}</span>
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                             <Badge variant={log.status === 'Approved' ? 'active' : 'onhold'} className="h-6 px-4 uppercase text-[10px] tracking-widest">
                                {log.status}
                            </Badge>
                        </div>
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
                        <p className={cn("text-lg font-bold", disputedItems.length > 0 ? "text-text-red" : "text-text-green")}>
                            {disputedItems.length + (log.missingAssignmentReports?.length || 0)}
                        </p>
                    </div>
                    <div className="bg-bg-secondary p-3 text-center border-l border-border-sub">
                        <p className="text-[8px] font-black text-text-muted uppercase tracking-widest mb-1">Net Settlement</p>
                        <p className="text-lg font-mono font-bold text-text-green">${(log.totalPayout || 0).toFixed(2)}</p>
                    </div>
                </div>

                <ScrollArea className="flex-1">
                    <div className="p-6 space-y-8">
                        {/* 1. CRITICAL AUDIT ALERTS */}
                        {(disputedItems.length > 0 || (log.missingAssignmentReports && log.missingAssignmentReports.length > 0)) && (
                            <section className="space-y-3">
                                <div className="flex items-center gap-2 text-text-red">
                                    <ShieldAlert size={16} />
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em]">Discrepancy Registry</h3>
                                </div>
                                
                                <div className="space-y-2">
                                    {disputedItems.map(item => {
                                        const wo = findWorkOrder(item.workOrderId);
                                        return (
                                            <div key={item.id} className="p-3 rounded-lg border border-brand-red/30 bg-brand-red-dim/5 grid grid-cols-[1fr,200px] gap-4">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-mono font-bold text-text-red uppercase">{wo?.id.toUpperCase()}</span>
                                                        <p className="text-xs font-bold text-text-primary uppercase truncate">{wo?.description}</p>
                                                    </div>
                                                    <p className="text-[10px] text-text-secondary leading-relaxed uppercase font-medium italic">&quot;{item.disputeReason}: {item.disputeNotes}&quot;</p>
                                                </div>
                                                <div className="text-right flex flex-col justify-center border-l border-brand-red/10 pl-4">
                                                    <p className="text-[8px] font-black text-text-muted uppercase">Tech Disputed Pay</p>
                                                    <p className="text-sm font-mono font-bold text-text-red">${wo?.pay.toFixed(2)}</p>
                                                </div>
                                            </div>
                                        )
                                    })}

                                    {log.missingAssignmentReports?.map(report => (
                                        <div key={report.id} className="p-3 rounded-lg border border-accent-gold/30 bg-accent-gold-dim/5 flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="p-2 bg-bg-secondary rounded border border-accent-gold/20 text-accent-gold">
                                                    <AlertTriangle size={16}/>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-text-primary uppercase tracking-wide">Missing Assignment Report</p>
                                                    <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest">{report.date} · {report.location}</p>
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-text-secondary italic uppercase font-medium max-w-[300px] text-right truncate">&quot;{report.summary}&quot;</p>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {/* 2. ASSIGNMENT LEDGER (LEFT) */}
                            <div className="md:col-span-2 space-y-4">
                                <div className="flex items-center justify-between px-1">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                                        <CheckCircle2 size={14} className="text-text-green" />
                                        Verified Jobs
                                    </h3>
                                    <span className="text-[9px] font-bold text-text-muted uppercase">{confirmedItems.length} Entries</span>
                                </div>
                                <div className="space-y-2">
                                    {confirmedItems.map(item => {
                                        const wo = findWorkOrder(item.workOrderId);
                                        return (
                                            <div key={item.id} className="p-3 rounded-lg border border-border-sub bg-bg-secondary flex items-center justify-between group hover:border-text-muted transition-colors">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-text-primary uppercase tracking-wide truncate">{wo?.description}</p>
                                                    <div className="flex items-center gap-2 mt-0.5 text-[9px] text-text-muted font-bold uppercase tracking-widest">
                                                        <span className="text-brand-red font-mono">{wo?.id.toUpperCase()}</span>
                                                        <span>•</span>
                                                        <span>{wo?.location.split(',')[0]}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0 ml-4">
                                                    <p className="text-xs font-mono font-bold text-text-primary">${wo?.pay.toFixed(2)}</p>
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
                            </div>

                            {/* 3. REIMBURSEMENT REGISTRY (RIGHT) */}
                            <div className="space-y-4">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                                    <Coins size={14} className="text-accent-gold" />
                                    Expenses
                                </h3>
                                <div className="space-y-2">
                                    {log.reimbursements.map(item => (
                                        <div key={item.id} className="p-3 rounded-lg border border-border-sub bg-bg-tertiary/50 flex justify-between items-center">
                                            <div className="min-w-0">
                                                <p className="text-[10px] font-bold text-text-primary uppercase truncate">{item.description}</p>
                                                <p className="text-[8px] text-text-muted font-mono">{item.date}</p>
                                            </div>
                                            <p className="text-[10px] font-mono font-bold text-text-green">+{item.amount.toFixed(2)}</p>
                                        </div>
                                    ))}
                                    {log.reimbursements.length === 0 && (
                                        <div className="p-8 text-center border border-dashed border-border-sub rounded-lg opacity-40">
                                            <p className="text-[10px] font-bold uppercase tracking-widest">Registry Clear</p>
                                        </div>
                                    )}
                                </div>

                                <div className="p-4 mt-6 rounded-xl bg-bg-secondary border-2 border-text-green/20 space-y-4 shadow-inner">
                                    <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] text-center">Settlement Verification</p>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-[10px] uppercase font-bold text-text-muted">
                                            <span>Base Pay</span>
                                            <span className="font-mono text-text-primary">${(confirmedItems.reduce((acc, i) => acc + (findWorkOrder(i.workOrderId)?.pay || 0), 0)).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-[10px] uppercase font-bold text-text-muted">
                                            <span>Expenses</span>
                                            <span className="font-mono text-text-primary">${(log.reimbursements.reduce((acc, i) => acc + i.amount, 0)).toFixed(2)}</span>
                                        </div>
                                        <Separator className="bg-border-sub/50" />
                                        <div className="flex justify-between items-center pt-1">
                                            <span className="text-[10px] font-black text-text-green uppercase tracking-widest">Total Payout</span>
                                            <span className="text-lg font-mono font-bold text-text-green">${(log.totalPayout || 0).toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <DialogFooter className="p-4 border-t border-border-sub bg-bg-tertiary/50 flex flex-row items-center gap-3">
                    {log.status === 'Submitted' ? (
                        <>
                            <Button variant="destructive-outline" className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest" onClick={() => handleStatusChange('Rejected')}>
                                <X size={14} className="mr-2"/> Deny Manifest
                            </Button>
                            <div className="flex-1" />
                            <Button variant="outline" className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest" onClick={() => setIsOpen(false)}>Close Audit</Button>
                            <Button className="h-10 px-12 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest" onClick={() => handleStatusChange('Approved')}>
                                <Check size={14} className="mr-2"/> Authorize Payroll
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