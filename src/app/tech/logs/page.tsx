'use client';

import { useState, useEffect } from 'react';
import type { WeeklyLog, FinancialRecord } from '@/lib/types';
import { weeklyLogs, workOrders } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Check, Edit, Plus, Coins, ScrollText, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function TechLogsPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [log, setLog] = useState<WeeklyLog | undefined>(undefined);
    const { toast } = useToast();

    useEffect(() => {
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);
        if (userId) {
            // Find the most recent draft, or the most recent log.
            const userLogs = weeklyLogs.filter(wl => wl.technicianId === userId);
            const draftLog = userLogs.find(l => l.status === 'Draft');
            setLog(draftLog || userLogs[0]);
        }
    }, []);

    if (!currentTechId) {
        return <div>Loading...</div>;
    }

    if (!log) {
        return (
             <div>
                <header className="page-header">
                    <div>
                        <p className="page-eyebrow flex items-center gap-2"><ScrollText size={12}/> Payroll & Logs</p>
                        <h1 className="page-title">Weekly Manifests</h1>
                        <p className="page-subtitle">Review your weekly work logs and submit them for payroll processing.</p>
                    </div>
                </header>
                <div className="empty-state">No weekly logs found for your account.</div>
            </div>
        )
    }
    
    const workOrderDetails = (woId: string) => workOrders.find(wo => wo.id === woId);
    
    const isSubmitted = log.status !== 'Draft';

    const handleOutcomeChange = (itemId: string, outcome: 'worked_completed' | 'worked_revisit' | 'other') => {
        setLog(prev => prev ? ({
            ...prev,
            items: prev.items.map(item => item.id === itemId ? { ...item, outcomeCode: outcome } : item)
        }) : undefined);
    };

    const handleReimbursementChange = (index: number, field: 'description' | 'amount', value: string) => {
        setLog(prev => {
            if (!prev) return undefined;
            const newReimbursements = [...prev.reimbursements];
            const val = field === 'amount' ? parseFloat(value) || 0 : value;
            (newReimbursements[index] as any)[field] = val;
            return { ...prev, reimbursements: newReimbursements };
        });
    }

    const handleAddReimbursement = () => {
        if (!currentTechId) return;
        const newReimbursement: FinancialRecord = {
            id: `fr-${Date.now()}`,
            technicianId: currentTechId,
            date: new Date().toISOString().split('T')[0],
            type: 'reimbursement',
            amount: 0,
            description: '',
        };
        setLog(prev => prev ? ({ ...prev, reimbursements: [...prev.reimbursements, newReimbursement] }) : undefined);
    }
    
    const handleRemoveReimbursement = (index: number) => {
        setLog(prev => {
            if (!prev) return undefined;
            const newReimbursements = [...prev.reimbursements];
            newReimbursements.splice(index, 1);
            return { ...prev, reimbursements: newReimbursements };
        });
    }

    const handleSubmitManifest = () => {
        setLog(prev => prev ? ({ ...prev, status: 'Submitted' }) : undefined);
        toast({ title: "Manifest Submitted", description: "Your weekly log is now with the admins for audit." });
    }

    return (
        <div>
            <header className="page-header">
                 <div>
                    <p className="page-eyebrow flex items-center gap-2"><ScrollText size={12}/> Payroll & Logs</p>
                    <h1 className="page-title">Weekly Manifests</h1>
                    <p className="page-subtitle">Review your weekly work logs and submit them for payroll processing.</p>
                </div>
                <div className="page-header-right">
                    {!isSubmitted && (
                        <Button onClick={handleSubmitManifest}><Check size={16} className="mr-2"/> Submit Manifest</Button>
                    )}
                </div>
            </header>

            <Card className="max-w-4xl mx-auto">
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <div>
                        <CardTitle>Week of {log.weekOf}</CardTitle>
                        <CardDescription>Review all assignments and add any reimbursements before submitting.</CardDescription>
                        </div>
                        <Badge variant={log.status === 'Approved' ? 'completed' : log.status === 'Submitted' ? 'onhold' : 'pending'}>{log.status}</Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="mb-6">
                        <h3 className="field-group-title !mb-2">Completed Assignments</h3>
                        <div className="table-wrap">
                            <table className="tbl">
                                <thead>
                                    <tr>
                                        <th>Work Order</th>
                                        <th>Client</th>
                                        <th className="text-right w-52">Outcome</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {log.items.map(item => {
                                        const wo = workOrderDetails(item.workOrderId);
                                        return (
                                            <tr key={item.id}>
                                                <td>
                                                    <div className="cell-id">{wo?.id.toUpperCase()}</div>
                                                    <div className="text-text-primary text-sm">{wo?.description}</div>
                                                </td>
                                                <td><div className="text-sm text-text-secondary">{wo?.clientName}</div></td>
                                                <td className="text-right">
                                                    {isSubmitted ? (
                                                        <Badge variant={item.outcomeCode === 'worked_completed' ? 'active' : 'medium'}>{item.outcomeCode.replace(/_/g, ' ')}</Badge>
                                                    ) : (
                                                        <Select value={item.outcomeCode} onValueChange={(val) => handleOutcomeChange(item.id, val as any)}>
                                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="worked_completed">Work Completed</SelectItem>
                                                                <SelectItem value="worked_revisit">Revisit Required</SelectItem>
                                                                <SelectItem value="other">Other</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                     <div>
                        <h3 className="field-group-title !mb-2 flex items-center justify-between">
                            <span><Coins/> Reimbursements</span>
                            {!isSubmitted && (
                                 <Button variant="outline" size="sm" onClick={handleAddReimbursement}>
                                    <Plus size={14} className="mr-2"/> Add Item
                                </Button>
                            )}
                        </h3>
                        <div className="space-y-2">
                            {log.reimbursements.map((item, index) => (
                                <div key={item.id} className="flex gap-2 items-center">
                                    <Input 
                                        placeholder="Description (e.g., Parking, Materials)" 
                                        value={item.description}
                                        disabled={isSubmitted}
                                        className="field-input"
                                        onChange={(e) => handleReimbursementChange(index, 'description', e.target.value)}
                                    />
                                    <Input 
                                        type="number" 
                                        placeholder="Amount" 
                                        value={item.amount || ''}
                                        disabled={isSubmitted}
                                        className="field-input w-32"
                                        onChange={(e) => handleReimbursementChange(index, 'amount', e.target.value)}
                                    />
                                     {!isSubmitted && <Button variant="ghost" size="icon" className="text-text-muted" onClick={() => handleRemoveReimbursement(index)}><Trash2 size={16}/></Button>}
                                </div>
                            ))}
                            {log.reimbursements.length === 0 && (
                                <div className="empty-state !text-sm">No reimbursements added for this week.</div>
                            )}
                        </div>
                    </div>

                    {log.status === 'Approved' && log.totalPayout && (
                         <div className="mt-6 p-4 rounded-lg bg-green-dim border border-green-border text-center">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted">Approved Payout</h3>
                            <p className="text-3xl font-bold text-text-green">${log.totalPayout.toFixed(2)}</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
