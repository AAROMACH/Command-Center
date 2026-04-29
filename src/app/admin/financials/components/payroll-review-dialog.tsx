
'use client';

import type { WeeklyLog, Technician, WorkOrder } from '@/lib/types';
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

type PayrollReviewDialogProps = {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    log: WeeklyLog | null;
    technician: Technician | undefined;
    onStatusChange: (logId: string, status: WeeklyLog['status']) => void;
};

export function PayrollReviewDialog({ isOpen, setIsOpen, log, technician, onStatusChange }: PayrollReviewDialogProps) {
    if (!log || !technician) return null;

    const { toast } = useToast();

    const findWorkOrder = (id: string): WorkOrder | undefined => {
        return workOrders.find(wo => wo.id === id);
    };
    
    const handleStatusChange = (status: WeeklyLog['status']) => {
        onStatusChange(log.id, status);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="lg:max-w-3xl bg-bg-elevated border-border-default">
                <DialogHeader>
                    <DialogTitle className="page-title text-xl">Review Weekly Manifest</DialogTitle>
                    <DialogDescription>
                        For <span className="font-bold text-text-primary">{technician.name}</span> · Week of <span className="font-bold text-text-primary">{log.weekOf}</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-6 max-h-[60vh] overflow-y-auto">
                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="p-3 bg-bg-primary rounded-md">
                            <div className="field-label">Current Status</div>
                            <Badge variant={log.status === 'Approved' ? 'completed' : log.status === 'Submitted' ? 'onhold' : 'pending'}>{log.status}</Badge>
                        </div>
                        <div className="p-3 bg-bg-primary rounded-md">
                            <div className="field-label">Assignments Logged</div>
                            <div className="text-xl font-bold text-text-primary">{log.items.length}</div>
                        </div>
                         <div className="p-3 bg-bg-primary rounded-md">
                            <div className="field-label">Reimbursements</div>
                            <div className="text-xl font-bold text-text-primary">{log.reimbursements.length}</div>
                        </div>
                    </div>

                    <div>
                        <h3 className="field-group-title">Assignments</h3>
                        <div className="table-wrap">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Work Order</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Pay</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {log.items.map(item => {
                                        const wo = findWorkOrder(item.workOrderId);
                                        return (
                                            <TableRow key={item.id}>
                                                <TableCell className="font-mono text-brand-red text-xs">{wo?.id.toUpperCase()}</TableCell>
                                                <TableCell>{wo?.description}</TableCell>
                                                <TableCell className="font-mono text-text-green">${wo?.pay.toFixed(2)}</TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                    
                     <div>
                        <h3 className="field-group-title">Reimbursements</h3>
                        <div className="table-wrap">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {log.reimbursements.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.date}</TableCell>
                                            <TableCell>{item.description}</TableCell>
                                            <TableCell className="text-right font-mono text-text-green">${item.amount.toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {log.reimbursements.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center h-20 text-text-muted">No reimbursements submitted.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>

                <DialogFooter className="pt-4 border-t border-border-default">
                    {log.status === 'Submitted' ? (
                        <>
                        <Button variant="destructive-outline" className="mr-auto" onClick={() => handleStatusChange('Rejected')}>Reject</Button>
                        <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                        <Button onClick={() => handleStatusChange('Approved')}>Approve Manifest</Button>
                        </>
                    ) : (
                        <Button variant="outline" onClick={() => setIsOpen(false)}>Close</Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


    