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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { 
    AlertTriangle, 
    CheckCircle2, 
    Clock, 
    ShieldAlert, 
    MapPin, 
    Calendar,
    MessageSquare,
    Check
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

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
    const pendingItems = log.items.filter(item => !item.confirmationStatus);

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="lg:max-w-4xl bg-bg-elevated border-border-default flex flex-col p-0 overflow-hidden max-h-[95vh]">
                <DialogHeader className="p-6 border-b border-border-sub bg-bg-tertiary/30">
                    <div className="flex justify-between items-start">
                        <div>
                            <DialogTitle className="text-xl font-bold uppercase tracking-widest text-text-primary">Registry Audit: Weekly Log</DialogTitle>
                            <DialogDescription className="text-[11px] font-bold text-text-muted uppercase tracking-widest mt-1">
                                Operative: <span className="text-text-primary">{technician.name}</span> · Period: <span className="text-brand-red font-mono">{log.weekOf}</span>
                            </DialogDescription>
                        </div>
                        <Badge variant={log.status === 'Approved' ? 'active' : log.status === 'Submitted' ? 'onhold' : 'pending'} className="h-6 px-4 uppercase text-[10px] tracking-widest">
                            {log.status}
                        </Badge>
                    </div>
                </DialogHeader>

                <ScrollArea className="flex-1">
                    <div className="p-6 space-y-8">
                        {/* Audit Alerts (Disputes & Missing Jobs) */}
                        {(disputedItems.length > 0 || (log.missingAssignmentReports && log.missingAssignmentReports.length > 0)) && (
                            <section className="space-y-4">
                                <div className="flex items-center gap-2 text-brand-red">
                                    <ShieldAlert size={16} />
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em]">Discrepancy Audit Required</h3>
                                </div>
                                
                                <div className="space-y-3">
                                    {disputedItems.map(item => {
                                        const wo = findWorkOrder(item.workOrderId);
                                        return (
                                            <div key={item.id} className="p-4 rounded-xl border border-brand-red/30 bg-brand-red-dim/10 space-y-3">
                                                <div className="flex justify-between items-start">
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide">Disputed: {wo?.description}</p>
                                                            <Badge variant="outline" className="text-[8px] border-brand-red/30 text-text-red bg-brand-red-dim/20 uppercase font-mono">ID: {wo?.id.toUpperCase()}</Badge>
                                                        </div>
                                                        <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest">Technician Reason: <span className="text-text-red">{item.disputeReason}</span></p>
                                                    </div>
                                                    <span className="text-[10px] font-mono font-bold text-text-primary">${wo?.pay.toFixed(2)}</span>
                                                </div>
                                                {item.disputeNotes && (
                                                    <div className="p-2.5 rounded bg-bg-primary/50 border border-border-sub italic text-[11px] text-text-secondary leading-relaxed">
                                                        &quot;{item.disputeNotes}&quot;
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}

                                    {log.missingAssignmentReports?.map(report => (
                                        <div key={report.id} className="p-4 rounded-xl border border-accent-gold/30 bg-accent-gold-dim/10 space-y-3">
                                            <div className="flex justify-between items-start">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2 text-accent-gold">
                                                        <AlertTriangle size={14}/>
                                                        <p className="text-xs font-bold uppercase tracking-wide">Missing Assignment Reported</p>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[10px] text-text-muted uppercase font-bold tracking-widest">
                                                        <span className="flex items-center gap-1.5"><Calendar size={12} className="text-brand-red"/> {report.date}</span>
                                                        <span className="flex items-center gap-1.5"><MapPin size={12} className="text-brand-red"/> {report.location}</span>
                                                    </div>
                                                </div>
                                                <Badge variant="outline" className="text-[8px] uppercase tracking-widest bg-bg-primary">Tech Inquiry</Badge>
                                            </div>
                                            <div className="p-2.5 rounded bg-bg-primary/50 border border-border-sub space-y-1.5">
                                                <p className="text-[9px] font-black uppercase text-text-muted tracking-widest">Report Summary</p>
                                                <p className="text-[11px] text-text-secondary leading-relaxed uppercase font-medium italic">&quot;{report.summary}&quot;</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Verified Assignments */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-2 text-text-green">
                                <CheckCircle2 size={16} />
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em]">Verified Assignments</h3>
                            </div>
                            <div className="table-wrap p-0 border border-border-sub">
                                <Table>
                                    <TableHeader className="bg-bg-tertiary">
                                        <TableRow className="hover:bg-transparent border-border-sub">
                                            <TableHead className="text-[9px] h-9 uppercase tracking-widest">Assignment Identification</TableHead>
                                            <TableHead className="text-[9px] h-9 uppercase tracking-widest text-center">Tech Confirmed</TableHead>
                                            <TableHead className="text-[9px] h-9 uppercase tracking-widest text-right">Settlement</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {confirmedItems.map(item => {
                                            const wo = findWorkOrder(item.workOrderId);
                                            return (
                                                <TableRow key={item.id} className="border-border-sub group hover:bg-bg-primary transition-colors">
                                                    <TableCell className="py-3">
                                                        <div className="text-xs font-bold text-text-primary uppercase tracking-tight">{wo?.description}</div>
                                                        <div className="text-[9px] text-text-muted font-mono uppercase mt-0.5">ID: {wo?.id.toUpperCase()} · Site: {wo?.location.split(',')[0]}</div>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="flex justify-center">
                                                            <div className="p-1 rounded bg-green-dim border border-green-border text-text-green">
                                                                <Check size={12}/>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono font-bold text-text-primary text-xs">
                                                        ${wo?.pay.toFixed(2)}
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                        {confirmedItems.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center h-20 text-[10px] text-text-muted italic font-bold uppercase tracking-widest">Registry Clear: No tech-verified jobs.</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </section>
                        
                        {/* Financial Overrides & Reimbursements */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-2 text-text-muted">
                                <Clock size={16} />
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em]">Reimbursement Registry</h3>
                            </div>
                            <div className="table-wrap p-0 border border-border-sub">
                                <Table>
                                    <TableHeader className="bg-bg-tertiary">
                                        <TableRow className="hover:bg-transparent border-border-sub">
                                            <TableHead className="text-[9px] h-9 uppercase tracking-widest">Description</TableHead>
                                            <TableHead className="text-[9px] h-9 uppercase tracking-widest">Date</TableHead>
                                            <TableHead className="text-[9px] h-9 uppercase tracking-widest text-right">Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {log.reimbursements.map(item => (
                                            <TableRow key={item.id} className="border-border-sub">
                                                <TableCell className="text-xs uppercase font-bold text-text-primary">{item.description}</TableCell>
                                                <TableCell className="text-[10px] font-mono text-text-muted">{item.date}</TableCell>
                                                <TableCell className="text-right font-mono font-bold text-text-green text-xs">+${item.amount.toFixed(2)}</TableCell>
                                            </TableRow>
                                        ))}
                                        {log.reimbursements.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center h-16 text-[10px] text-text-muted italic uppercase font-bold tracking-widest">No reimbursements logged.</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </section>

                        {/* Summary Block */}
                        <div className="p-4 rounded-xl bg-bg-secondary border border-border-sub grid grid-cols-2 gap-px bg-border-sub overflow-hidden">
                             <div className="bg-bg-secondary p-4 text-center space-y-1">
                                <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Audit Total Payout</p>
                                <p className="text-2xl font-mono font-bold text-text-green">${(log.totalPayout || 0).toFixed(2)}</p>
                             </div>
                             <div className="bg-bg-secondary p-4 text-center space-y-1 border-l border-border-sub">
                                <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Log Item Count</p>
                                <p className="text-2xl font-bold text-text-primary">{log.items.length}</p>
                             </div>
                        </div>
                    </div>
                </ScrollArea>

                <DialogFooter className="p-6 border-t border-border-sub bg-bg-tertiary/50 flex flex-row items-center gap-3">
                    {log.status === 'Submitted' ? (
                        <>
                            <Button variant="destructive-outline" className="h-11 px-8 uppercase font-bold text-[10px] tracking-widest" onClick={() => handleStatusChange('Rejected')}>
                                <X size={16} className="mr-2"/> Deny Manifest
                            </Button>
                            <div className="flex-1" />
                            <Button variant="outline" className="h-11 px-8 uppercase font-bold text-[10px] tracking-widest" onClick={() => setIsOpen(false)}>Close Feed</Button>
                            <Button className="h-11 px-12 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest" onClick={() => handleStatusChange('Approved')}>
                                <Check size={16} className="mr-2"/> Authorize Payroll
                            </Button>
                        </>
                    ) : (
                        <Button variant="outline" className="w-full h-11 uppercase font-bold text-[10px] tracking-widest" onClick={() => setIsOpen(false)}>Exit Registry Audit</Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}