'use client';

import { useState, useEffect, useMemo } from 'react';
import type { WeeklyLog, FinancialRecord } from '@/lib/types';
import { weeklyLogs, workOrders } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Check, Edit, Plus, Coins, ScrollText, Trash2, ChevronLeft, ChevronRight, Eye, FileText, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function TechLogsPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [allLogs, setAllLogs] = useState<WeeklyLog[]>([]);
    const [editingLogId, setEditingLogId] = useState<string | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);
        if (userId) {
            setAllLogs(weeklyLogs.filter(wl => wl.technicianId === userId));
        }
    }, []);

    const editingLog = useMemo(() => 
        editingLogId ? allLogs.find(l => l.id === editingLogId) : null
    , [editingLogId, allLogs]);

    const groupedLogs = useMemo(() => {
        return {
            open: allLogs.filter(l => ['Draft', 'Submitted'].includes(l.status)),
            closed: allLogs.filter(l => ['Approved', 'Rejected'].includes(l.status))
        };
    }, [allLogs]);

    if (!currentTechId) {
        return <div className="p-8 text-center uppercase tracking-widest text-text-muted text-xs">Accessing Manifest Terminal...</div>;
    }

    const workOrderDetails = (woId: string) => workOrders.find(wo => wo.id === woId);

    const handleOutcomeChange = (itemId: string, outcome: 'worked_completed' | 'worked_revisit' | 'other') => {
        setAllLogs(prev => prev.map(log => {
            if (log.id === editingLogId) {
                return {
                    ...log,
                    items: log.items.map(item => item.id === itemId ? { ...item, outcomeCode: outcome } : item)
                };
            }
            return log;
        }));
    };

    const handleReimbursementChange = (index: number, field: 'description' | 'amount', value: string) => {
        setAllLogs(prev => prev.map(log => {
            if (log.id === editingLogId) {
                const newReimbursements = [...log.reimbursements];
                const val = field === 'amount' ? parseFloat(value) || 0 : value;
                (newReimbursements[index] as any)[field] = val;
                return { ...log, reimbursements: newReimbursements };
            }
            return log;
        }));
    }

    const handleAddReimbursement = () => {
        if (!currentTechId || !editingLogId) return;
        const newReimbursement: FinancialRecord = {
            id: `fr-${Date.now()}`,
            technicianId: currentTechId,
            date: new Date().toISOString().split('T')[0],
            type: 'reimbursement',
            amount: 0,
            description: '',
        };
        setAllLogs(prev => prev.map(log => 
            log.id === editingLogId ? { ...log, reimbursements: [...log.reimbursements, newReimbursement] } : log
        ));
    }
    
    const handleRemoveReimbursement = (index: number) => {
        setAllLogs(prev => prev.map(log => {
            if (log.id === editingLogId) {
                const newReimbursements = [...log.reimbursements];
                newReimbursements.splice(index, 1);
                return { ...log, reimbursements: newReimbursements };
            }
            return log;
        }));
    }

    const handleSubmitManifest = () => {
        setAllLogs(prev => prev.map(log => 
            log.id === editingLogId ? { ...log, status: 'Submitted' } : log
        ));
        toast({ title: "Manifest Submitted", description: "Your weekly log is now with the admins for audit." });
        setEditingLogId(null);
    }

    // MAIN DASHBOARD VIEW
    if (!editingLogId) {
        return (
            <div className="space-y-12">
                <header className="page-header">
                    <div>
                        <p className="page-eyebrow flex items-center gap-2"><ScrollText size={12}/> Payroll & Manifests</p>
                        <h1 className="page-title">Work Manifests</h1>
                        <p className="page-subtitle">Submit tactical work logs for audit and payroll processing.</p>
                    </div>
                </header>

                <div className="space-y-10">
                    {/* SECTION 1: OPEN LOGS */}
                    <section>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-red flex items-center gap-2">
                                <Clock size={14}/>
                                Pending Audit & Drafts
                            </h2>
                            <span className="text-[10px] font-bold text-text-muted uppercase">{groupedLogs.open.length} Manifest(s)</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {groupedLogs.open.map(log => (
                                <Card key={log.id} className="bg-bg-secondary border-border-main hover:border-brand-red transition-all group">
                                    <CardHeader className="pb-4">
                                        <div className="flex justify-between items-start">
                                            <Badge variant={log.status === 'Draft' ? 'pending' : 'onhold'} className="text-[9px] uppercase tracking-widest">
                                                {log.status}
                                            </Badge>
                                            <span className="font-mono text-xs text-text-muted">ID: {log.id}</span>
                                        </div>
                                        <CardTitle className="text-lg mt-2 uppercase tracking-wide">Week of {log.weekOf}</CardTitle>
                                        <CardDescription className="text-[10px] uppercase font-bold tracking-widest">
                                            {log.items.length} Assignments • {log.reimbursements.length} Expenses
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="flex items-center justify-between p-3 rounded bg-bg-primary border border-border-sub">
                                            <span className="text-[10px] font-bold uppercase text-text-muted">Est. Payout</span>
                                            <span className="font-mono text-text-green font-bold">${(log.totalPayout || 0).toFixed(2)}</span>
                                        </div>
                                        {log.status === 'Draft' ? (
                                            <Button className="w-full h-11" onClick={() => setEditingLogId(log.id)}>
                                                <Edit size={16} className="mr-2"/> Edit & Finalize
                                            </Button>
                                        ) : (
                                             <Button variant="outline" className="w-full h-11 border-accent-gold text-accent-gold hover:bg-accent-gold-dim" onClick={() => setEditingLogId(log.id)}>
                                                <Eye size={16} className="mr-2"/> Review Submission
                                            </Button>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                            {groupedLogs.open.length === 0 && (
                                <div className="col-span-full py-12 text-center border border-dashed border-border-main rounded-lg bg-bg-secondary/50">
                                    <p className="text-xs font-bold uppercase tracking-widest text-text-muted">No pending manifests. Your log history is clean.</p>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* SECTION 2: CLOSED LOGS */}
                    <section>
                         <div className="flex items-center justify-between mb-6 border-b border-border-main pb-4">
                            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                                <FileText size={14}/>
                                Finalized History
                            </h2>
                            <span className="text-[10px] font-bold text-text-muted uppercase">{groupedLogs.closed.length} Manifest(s)</span>
                        </div>
                        <div className="space-y-2">
                            {groupedLogs.closed.map(log => (
                                <div key={log.id} className="flex items-center justify-between p-4 rounded-lg bg-bg-secondary border border-border-sub hover:bg-bg-tertiary transition-colors cursor-pointer group" onClick={() => setEditingLogId(log.id)}>
                                    <div className="flex items-center gap-6">
                                        <div className="p-2 bg-bg-primary rounded-md group-hover:bg-bg-secondary transition-colors">
                                            <ScrollText size={18} className="text-text-muted"/>
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-text-primary uppercase tracking-wide">Week of {log.weekOf}</p>
                                            <p className="text-[10px] text-text-muted uppercase tracking-widest mt-0.5">Finalized • ID: {log.id}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-8">
                                        <div className="text-right">
                                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Final Status</p>
                                            <Badge variant={log.status === 'Approved' ? 'active' : 'missed'} className="text-[9px] uppercase tracking-widest h-5 mt-1">
                                                {log.status}
                                            </Badge>
                                        </div>
                                        <div className="text-right min-w-[120px]">
                                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Payout</p>
                                            <p className="font-mono font-bold text-text-green text-lg">${(log.totalPayout || 0).toFixed(2)}</p>
                                        </div>
                                        <ChevronRight size={16} className="text-text-muted group-hover:text-text-primary group-hover:translate-x-1 transition-all"/>
                                    </div>
                                </div>
                            ))}
                            {groupedLogs.closed.length === 0 && (
                                <div className="text-center py-12 text-text-muted uppercase text-[10px] tracking-widest italic">No historical manifests found.</div>
                            )}
                        </div>
                    </section>
                </div>
            </div>
        );
    }

    // EDITING / DETAIL VIEW
    const isSubmitted = editingLog.status !== 'Draft';

    return (
        <div>
            <header className="page-header">
                 <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => setEditingLogId(null)} className="h-10 w-10">
                        <ChevronLeft size={24}/>
                    </Button>
                    <div>
                        <p className="page-eyebrow flex items-center gap-2"><ScrollText size={12}/> Manifest Editor</p>
                        <h1 className="page-title">Week of {editingLog.weekOf}</h1>
                        <p className="page-subtitle">Status: <span className="font-bold text-text-primary uppercase">{editingLog.status}</span></p>
                    </div>
                </div>
                <div className="page-header-right">
                    {!isSubmitted && (
                        <Button onClick={handleSubmitManifest} className="h-11 px-8"><Check size={16} className="mr-2"/> Submit Manifest</Button>
                    )}
                    {isSubmitted && (
                        <Button variant="outline" onClick={() => setEditingLogId(null)}>Back to History</Button>
                    )}
                </div>
            </header>

            <Card className="max-w-4xl mx-auto bg-bg-secondary border-border-main">
                <CardHeader className="border-b border-border-sub">
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle className="text-lg">Audit Verification</CardTitle>
                            <CardDescription>Review all assignments and add any reimbursements before finalizing the manifest.</CardDescription>
                        </div>
                        <Badge variant={editingLog.status === 'Approved' ? 'active' : editingLog.status === 'Submitted' ? 'onhold' : 'pending'}>
                            {editingLog.status}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="py-6 space-y-8">
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-text-muted flex items-center gap-2">
                             <Check size={14} className="text-brand-red"/>
                             Completed Assignments
                        </h3>
                        <div className="table-wrap border border-border-sub overflow-hidden">
                            <table className="tbl">
                                <thead className="bg-bg-tertiary">
                                    <tr className="border-b border-border-sub">
                                        <th className="text-[10px] uppercase font-bold text-text-muted">Work Order</th>
                                        <th className="text-[10px] uppercase font-bold text-text-muted">Client Context</th>
                                        <th className="text-right w-64 text-[10px] uppercase font-bold text-text-muted">Outcome Verification</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {editingLog.items.map(item => {
                                        const wo = workOrderDetails(item.workOrderId);
                                        return (
                                            <tr key={item.id} className="border-b border-border-sub hover:bg-bg-primary transition-colors">
                                                <td className="py-3">
                                                    <div className="cell-id !mb-0.5">{wo?.id.toUpperCase()}</div>
                                                    <div className="text-text-primary text-xs font-semibold">{wo?.description}</div>
                                                </td>
                                                <td className="py-3"><div className="text-[10px] text-text-muted uppercase tracking-widest">{wo?.clientName}</div></td>
                                                <td className="text-right py-3">
                                                    {isSubmitted ? (
                                                        <Badge variant={item.outcomeCode === 'worked_completed' ? 'active' : 'onhold'} className="text-[9px] uppercase tracking-widest">
                                                            {item.outcomeCode.replace(/_/g, ' ')}
                                                        </Badge>
                                                    ) : (
                                                        <Select value={item.outcomeCode} onValueChange={(val) => handleOutcomeChange(item.id, val as any)}>
                                                            <SelectTrigger className="h-9 text-xs bg-bg-primary border-border-sub">
                                                                <SelectValue/>
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="worked_completed">Work Completed</SelectItem>
                                                                <SelectItem value="worked_revisit">Revisit Required</SelectItem>
                                                                <SelectItem value="other">Other / No Access</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {editingLog.items.length === 0 && (
                                        <tr>
                                            <td colSpan={3} className="text-center py-10 text-text-muted italic text-xs">No assignments logged for this period.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-text-muted flex items-center gap-2">
                                <Coins size={14} className="text-accent-gold"/>
                                Reimbursements & Field Expenses
                            </h3>
                            {!isSubmitted && (
                                <Button variant="secondary" size="sm" className="h-8 !text-[10px]" onClick={handleAddReimbursement}>
                                    <Plus size={14} className="mr-1.5"/> Add Line Item
                                </Button>
                            )}
                        </div>
                        <div className="space-y-2">
                            {editingLog.reimbursements.map((item, index) => (
                                <div key={item.id} className="flex gap-2 items-center p-3 rounded bg-bg-primary border border-border-sub transition-all hover:border-text-muted">
                                    <div className="flex-1 space-y-1.5">
                                        <p className="text-[10px] font-bold uppercase text-text-muted tracking-widest ml-1">Description</p>
                                        <Input 
                                            placeholder="e.g., Parking, Emergency Materials" 
                                            value={item.description}
                                            disabled={isSubmitted}
                                            className="h-9 text-xs bg-bg-secondary border-border-sub focus:border-brand-red"
                                            onChange={(e) => handleReimbursementChange(index, 'description', e.target.value)}
                                        />
                                    </div>
                                    <div className="w-32 space-y-1.5">
                                        <p className="text-[10px] font-bold uppercase text-text-muted tracking-widest ml-1">Amount ($)</p>
                                        <Input 
                                            type="number" 
                                            placeholder="0.00" 
                                            value={item.amount || ''}
                                            disabled={isSubmitted}
                                            className="h-9 text-xs bg-bg-secondary border-border-sub font-mono focus:border-brand-red"
                                            onChange={(e) => handleReimbursementChange(index, 'amount', e.target.value)}
                                        />
                                    </div>
                                     {!isSubmitted && (
                                        <div className="pt-5">
                                            <Button variant="ghost" size="icon" className="h-9 w-9 text-text-muted hover:text-text-red hover:bg-brand-red/10" onClick={() => handleRemoveReimbursement(index)}>
                                                <Trash2 size={16}/>
                                            </Button>
                                        </div>
                                     )}
                                </div>
                            ))}
                            {editingLog.reimbursements.length === 0 && (
                                <div className="p-8 text-center border border-dashed border-border-sub rounded text-[10px] uppercase font-bold text-text-muted tracking-widest">
                                    No reimbursements filed for this manifest
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="pt-6 border-t border-border-sub">
                         <div className="max-w-xs ml-auto p-4 rounded-lg bg-bg-tertiary border border-border-sub text-center">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted mb-2">Total Manifest Value</h3>
                            <p className={`text-3xl font-mono font-bold ${editingLog.status === 'Approved' ? 'text-text-green' : 'text-text-primary'}`}>
                                ${(editingLog.totalPayout || 0).toFixed(2)}
                            </p>
                            <p className="text-[9px] text-text-muted uppercase tracking-[0.2em] mt-1">Pending Audit Confirmation</p>
                        </div>
                    </div>
                </CardContent>
                {!isSubmitted && (
                    <CardFooter className="bg-bg-tertiary/50 py-4 flex justify-end gap-3 rounded-b-lg">
                        <Button variant="outline" onClick={() => setEditingLogId(null)}>Save as Draft</Button>
                        <Button onClick={handleSubmitManifest} className="px-10">Submit for Audit</Button>
                    </CardFooter>
                )}
            </Card>
        </div>
    );
}
