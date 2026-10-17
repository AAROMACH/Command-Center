'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { WeeklyLog, WorkOrder } from '@/lib/types';
import { weeklyLogAction } from '@/lib/weekly-log-api';
import { canSubmitWeek } from '@/lib/weekly-log-core';
import { useToast } from '@/hooks/use-toast';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { Check, Coins, ScrollText, Info } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OUTCOME_CODE_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';

type WeeklyLogDialogProps = {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    log: WeeklyLog;
    onSubmitted: () => void;
    /** The tech's live jobs, to show each log item's details (was demo data). */
    jobs: WorkOrder[];
};

export function WeeklyLogDialog({ isOpen, setIsOpen, log, onSubmitted, jobs }: WeeklyLogDialogProps) {
    const { toast } = useToast();
    const [submitting, setSubmitting] = useState(false);
    // Past weeks any time; the current week Saturday/Sunday (business time).
    const isWeekend = canSubmitWeek(log.weekOf);

    const workOrderDetails = (woId: string) => jobs.find(wo => wo.id === woId || wo.workOrderId === woId);

    // This used to only close the dialog — nothing was saved, and the
    // reimbursement rows here were local-only. It now submits through the
    // server; reimbursements are added per job on the Logs page.
    const handleSubmit = async () => {
        if (!isWeekend || submitting) return;
        setSubmitting(true);
        try {
            await weeklyLogAction('submit', { logId: log.id });
            toast({ title: 'Log submitted', description: `Week of ${log.weekOf} sent to payroll.` });
            onSubmitted();
            setIsOpen(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not submit', description: e.message });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-3xl bg-bg-elevated border-border-default">
                <DialogHeader>
                    <div className="flex items-center gap-2 mb-1">
                        <ScrollText className="text-accent-gold h-5 w-5" />
                        <DialogTitle className="text-lg font-semibold">Submit weekly log</DialogTitle>
                    </div>
                    <DialogDescription>
                        Week of <span className="text-text-primary font-semibold">{log.weekOf}</span>. Check your jobs and reimbursements before you submit.
                    </DialogDescription>
                </DialogHeader>

                {!isWeekend && (
                    <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub flex items-start gap-3 mb-4">
                        <Info size={16} className="text-accent-gold shrink-0 mt-0.5" />
                        <p className="text-[12px] text-text-secondary leading-relaxed text-left">
                            You can update this week&apos;s log any time, but you can only submit it on <span className="text-brand-red font-semibold">Saturday or Sunday</span>.
                        </p>
                    </div>
                )}

                <div className="py-4 space-y-6 max-h-[60vh] overflow-y-auto">
                    <div className="space-y-2">
                        <h3 className="section-label">Jobs</h3>
                        <div className="table-wrap p-0 border border-border-sub">
                            <Table>
                                <TableHeader className="bg-bg-tertiary">
                                    <TableRow className="hover:bg-transparent border-border-sub">
                                        <TableHead className="h-9">Work order</TableHead>
                                        <TableHead className="h-9">Status</TableHead>
                                        <TableHead className="h-9 text-right">Result</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(log.items || []).map((item, index) => {
                                        const wo = workOrderDetails(item.workOrderId);
                                        return (
                                            <TableRow key={item.id || item.workOrderId || `log-item-${index}`} className="border-border-sub">
                                                <TableCell className="py-2 text-left">
                                                    <div className="id-text">{(wo?.id || item.workOrderId || 'N/A').toUpperCase()}</div>
                                                    <div className="text-[12px] text-text-secondary truncate max-w-[200px] text-left">{wo?.title || wo?.description || 'Job details unavailable'}</div>
                                                </TableCell>
                                                <TableCell className="py-2">
                                                    <StatusBadge kind="log" value={item.confirmationStatus === 'confirmed' ? 'approved' : item.confirmationStatus === 'disputed' ? 'rejected' : 'submitted'} label={item.confirmationStatus ? (item.confirmationStatus === 'confirmed' ? 'Confirmed' : 'Disputed') : 'To review'} />
                                                </TableCell>
                                                <TableCell className="py-2 text-right">
                                                    <span className={cn(
                                                        "text-[12px] font-medium",
                                                        item.outcomeCode === 'worked_completed' ? "text-text-green" : 
                                                        item.outcomeCode === 'worked_revisit' ? "text-text-red" : "text-text-muted"
                                                    )}>
                                                        {item.outcomeCode ? OUTCOME_CODE_LABELS[item.outcomeCode as keyof typeof OUTCOME_CODE_LABELS] : 'Not confirmed yet'}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                             <h3 className="section-label flex items-center gap-2">
                                <Coins size={12}/> Reimbursements
                             </h3>
                             <Link href="/tech/logs" className="text-[12px] font-semibold text-accent-gold hover:underline">
                                Add on the Logs page
                             </Link>
                        </div>
                        
                        <div className="space-y-2">
                            {(log.reimbursements || []).map((item, index) => (
                                <div key={item.id || `reimb-${index}`} className="flex gap-2 items-center justify-between p-2 rounded bg-bg-primary border border-border-sub">
                                    <span className="text-[13px] truncate text-left">{item.description || 'Reimbursement'}</span>
                                    <span className="flex items-center gap-2 shrink-0">
                                        <StatusBadge kind="request" value={item.status || 'approved'} />
                                        <span className="text-xs font-mono">${(Number(item.amount) || 0).toFixed(2)}</span>
                                    </span>
                                </div>
                            ))}
                            {(log.reimbursements || []).length === 0 && (
                                <div className="text-center py-6 border border-dashed border-border-main rounded-xl text-[12px] text-text-muted">No reimbursements on this log</div>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="border-t border-border-default pt-4">
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                    <Button 
                        onClick={handleSubmit} 
                        disabled={!isWeekend || submitting}
                        className={cn(
                            "h-10 px-6",
                            isWeekend ? "bg-brand-red hover:bg-brand-red-hover" : "bg-bg-tertiary text-text-muted border border-border-sub"
                        )}
                    >
                        <Check size={16} className="mr-2"/> 
                        {isWeekend ? "Submit log" : "Submit on Sat or Sun"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
