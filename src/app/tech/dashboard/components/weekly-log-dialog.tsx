'use client';

import { useState } from 'react';
import type { WeeklyLog, FinancialRecord, ProjectDailyLog } from '@/lib/types';
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
import { Check, Coins, ScrollText, Trash2, Plus } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type WeeklyLogDialogProps = {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    log: WeeklyLog;
    onSubmitted: () => void;
};

export function WeeklyLogDialog({ isOpen, setIsOpen, log: initialLog, onSubmitted }: WeeklyLogDialogProps) {
    const [log, setLog] = useState<WeeklyLog>(initialLog);

    const workOrderDetails = (woId: string) => workOrders.find(wo => wo.id === woId);

    const handleAddReimbursement = () => {
        const newReimbursement: FinancialRecord = {
            id: `fr-${Date.now()}`,
            technicianId: log.technicianId,
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
                                    {log.items.map(item => {
                                        const wo = workOrderDetails(item.workOrderId);
                                        return (
                                            <TableRow key={item.id} className="border-border-sub">
                                                <TableCell className="py-2">
                                                    <div className="text-xs font-bold">{wo?.id.toUpperCase()}</div>
                                                    <div className="text-[10px] text-text-muted truncate max-w-[200px]">{wo?.description}</div>
                                                </TableCell>
                                                <TableCell className="py-2">
                                                    <Badge variant="active" className="text-[9px] uppercase tracking-widest h-5">Verified</Badge>
                                                </TableCell>
                                                <TableCell className="py-2 text-right">
                                                    <span className="text-[10px] font-mono text-text-green uppercase">Worked</span>
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
                                <div key={item.id} className="flex gap-2 items-center p-2 rounded bg-bg-primary border border-border-sub">
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
                    <Button onClick={handleSubmit} className="bg-brand-red hover:bg-brand-red-hover">
                        <Check size={16} className="mr-2"/> Submit Log
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}