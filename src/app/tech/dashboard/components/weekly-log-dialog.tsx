'use client';

import { useState } from 'react';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import type { WeeklyLog, FinancialRecord } from '@/lib/types';
import { workOrders } from '@/lib/data';
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
import { Input } from '@/components/ui/input';
import { Check, Coins, ScrollText, Trash2, Plus, Info } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OUTCOME_CODE_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';

type WeeklyLogDialogProps = {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    log: WeeklyLog;
    onSubmitted: () => void;
};

export function WeeklyLogDialog({ isOpen, setIsOpen, log: initialLog, onSubmitted }: WeeklyLogDialogProps) {
    const [log, setLog] = useState<WeeklyLog>(initialLog);

    const isWeekend = (() => {
        const day = new Date().getDay();
        return day === 0 || day === 6;
    })();

    const workOrderDetails = (woId: string) => workOrders.find(wo => wo.id === woId);

    const handleAddReimbursement = async () => {
        const newReimbursement: FinancialRecord = {
            id: await createDocId(ID_PREFIXES.FINANCIAL_RECORD),
            techId: log.techId,
            date: new Date().toISOString().split('T')[0],
            type: 'reimbursement',
            amount: 0,
            description: '',
        };
        setLog({ ...log, reimbursements: [...log.reimbursements, newReimbursement] });
    }

    const handleRemoveReimbursement = (index: number) => {
        const newReimbursements = [...log.reimbursements];
        newReimbursements.splice(index, 1);
        setLog({ ...log, reimbursements: newReimbursements });
    }

    const handleReimbursementChange = (index: number, field: 'description' | 'amount', value: string) => {
        const newReimbursements = [...log.reimbursements];
        (newReimbursements[index] as any)[field] = field === 'amount' ? parseFloat(value) || 0 : value;
        setLog({ ...log, reimbursements: newReimbursements });
    }

    const handleSubmit = () => {
        if (!isWeekend) return;
        onSubmitted();
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-3xl bg-bg-elevated border-border-default">
                <DialogHeader>
                    <div className="flex items-center gap-2 mb-1">
                        <ScrollText className="text-accent-gold h-5 w-5" />
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest">Finalize Weekly Log</DialogTitle>
                    </div>
                    <DialogDescription>
                        Audit for week of <span className="text-text-primary font-bold">{log.weekOf}</span>. Ensure all reimbursements are logged.
                    </DialogDescription>
                </DialogHeader>

                {!isWeekend && (
                    <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub flex items-start gap-3 mb-4">
                        <Info size={16} className="text-accent-gold shrink-0 mt-0.5" />
                        <p className="text-[10px] text-text-muted uppercase font-bold leading-relaxed text-left">
                            Submission Lock: This manifest can be updated mid-week, but final submission is only authorized on <span className="text-brand-red">Saturday and Sunday</span>.
                        </p>
                    </div>
                )}

                <div className="py-4 space-y-6 max-h-[60vh] overflow-y-auto">
                    <div className="space-y-2">
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted">Assignment Summary</h3>
                        <div className="table-wrap p-0 border border-border-sub">
                            <Table>
                                <TableHeader className="bg-bg-tertiary">
                                    <TableRow className="hover:bg-transparent border-border-sub">
                                        <TableHead className="text-[10px] h-9">Work Order</TableHead>
                                        <TableHead className="text-[10px] h-9">Status</TableHead>
                                        <TableHead className="text-[10px] h-9 text-right">Result</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(log.items || []).map((item, index) => {
                                        const wo = workOrderDetails(item.workOrderId);
                                        return (
                                            <TableRow key={item.id || item.workOrderId || `log-item-${index}`} className="border-border-sub">
                                                <TableCell className="py-2 text-left">
                                                    <div className="text-xs font-bold uppercase">{(wo?.id || item.workOrderId || 'N/A').toUpperCase()}</div>
                                                    <div className="text-[10px] text-text-muted truncate max-w-[200px] uppercase text-left">{wo?.title || wo?.description || 'Assignment Detail Restricted'}</div>
                                                </TableCell>
                                                <TableCell className="py-2">
                                                    <Badge variant={item.confirmationStatus === 'confirmed' ? 'active' : 'onhold'} className="text-[9px] uppercase tracking-widest h-5">
                                                        {item.confirmationStatus ? item.confirmationStatus.toUpperCase() : 'VERIFYING'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="py-2 text-right">
                                                    <span className={cn(
                                                        "text-[10px] font-mono uppercase font-bold",
                                                        item.outcomeCode === 'worked_completed' ? "text-text-green" : 
                                                        item.outcomeCode === 'worked_revisit' ? "text-text-red" : "text-text-muted"
                                                    )}>
                                                        {item.outcomeCode ? OUTCOME_CODE_LABELS[item.outcomeCode as keyof typeof OUTCOME_CODE_LABELS] : 'Pending Verification'}
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
                             <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted flex items-center gap-2">
                                <Coins size={12}/> Reimbursements & Expenses
                             </h3>
                             <Button variant="outline" size="sm" className="h-7 !text-[9px]" onClick={handleAddReimbursement}>
                                <Plus size={12} className="mr-1"/> Add Item
                             </Button>
                        </div>
                        
                        <div className="space-y-2">
                            {log.reimbursements.map((item, index) => (
                                <div key={item.id || `reimb-${index}`} className="flex gap-2 items-center p-2 rounded bg-bg-primary border border-border-sub">
                                    <Input 
                                        placeholder="Description (e.g., Parking, Materials)" 
                                        value={item.description}
                                        className="h-8 text-xs bg-bg-secondary border-border-sub"
                                        onChange={(e) => handleReimbursementChange(index, 'description', e.target.value)}
                                    />
                                    <Input 
                                        type="number" 
                                        placeholder="0.00" 
                                        value={item.amount || ''}
                                        className="h-8 text-xs bg-bg-secondary border-border-sub w-24 font-mono"
                                        onChange={(e) => handleReimbursementChange(index, 'amount', e.target.value)}
                                    />
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-text-muted hover:text-text-red" onClick={() => handleRemoveReimbursement(index)}>
                                        <Trash2 size={14}/>
                                    </Button>
                                </div>
                            ))}
                            {log.reimbursements.length === 0 && (
                                <div className="text-center py-6 border border-dashed border-border-sub rounded text-[10px] uppercase font-bold text-text-muted">No reimbursements logged</div>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="border-t border-border-default pt-4">
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                    <Button 
                        onClick={handleSubmit} 
                        disabled={!isWeekend}
                        className={cn(
                            "font-bold uppercase text-[10px] tracking-widest h-10 px-8",
                            isWeekend ? "bg-brand-red hover:bg-brand-red-hover" : "bg-bg-tertiary text-text-muted border border-border-sub"
                        )}
                    >
                        <Check size={16} className="mr-2"/> 
                        {isWeekend ? "Submit Log" : "Weekend Submission Only"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
