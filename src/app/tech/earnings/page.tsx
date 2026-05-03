'use client';

import { useState, useEffect, useMemo } from 'react';
import type { WeeklyLog, Expense, Technician } from '@/lib/types';
import { weeklyLogs, expenses as initialExpenses, technicians, workOrders, projects } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Coins, PiggyBank, FileClock, Receipt, Plus, Download, Calendar as CalendarIcon, Check, X } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { ReceiptUploadDialog } from '../dashboard/components/receipt-upload-dialog';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export default function TechEarningsPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false);
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [exportDates, setExportDates] = useState({
        from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0]
    });
    
    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);
    }, []);

    const tech = useMemo(() => 
        currentTechId ? technicians.find(t => t.id === currentTechId) : null
    , [currentTechId]);

    const logs = useMemo(() => 
        currentTechId ? weeklyLogs.filter(wl => wl.technicianId === currentTechId) : []
    , [currentTechId]);

    const myExpenses = useMemo(() => {
        if (!tech) return [];
        return initialExpenses.filter(e => e.submittedBy === tech.name);
    }, [tech]);

    const totalPaid = useMemo(() => 
        logs.filter(l => l.status === 'Approved').reduce((acc, log) => acc + (log.totalPayout || 0), 0)
    , [logs]);

    const pendingPayout = useMemo(() => 
        logs.filter(l => l.status === 'Submitted').reduce((acc, log) => acc + (log.totalPayout || 0), 0)
    , [logs]);

    const pendingReimbursements = useMemo(() => 
        myExpenses.filter(e => e.status === 'Pending').reduce((acc, exp) => acc + exp.amount, 0)
    , [myExpenses]);

    const getStatusVariant = (status: Expense['status']) => {
        switch (status) {
            case 'Approved': return 'active';
            case 'Pending': return 'onhold';
            case 'Rejected': return 'destructive';
            default: return 'outline';
        }
    };

    const handleExportClick = () => {
        setIsExportDialogOpen(true);
    };

    const executeExport = () => {
        toast({
            title: "Export Initiated",
            description: `Generating audit log from ${exportDates.from} to ${exportDates.to}. Your download will begin shortly.`,
        });
        setIsExportDialogOpen(false);
    };

    if (!mounted || !currentTechId) {
        return <div className="p-8 text-center uppercase tracking-widest text-text-muted text-xs">Accessing Financial Vault...</div>;
    }

    return (
        <div className="space-y-6">
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <Coins size={12} />
                        Financial Intelligence
                    </p>
                    <h1 className="page-title">Payroll & Earnings</h1>
                    <p className="page-subtitle">Historical payout audit and reimbursement tracking for {tech?.name}.</p>
                </div>
                <div className="page-header-right">
                    <Button onClick={() => setIsReceiptDialogOpen(true)}>
                        <Plus size={14} className="mr-2"/>
                        Submit Receipt
                    </Button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border-main border border-border-main rounded-lg overflow-hidden">
                <div className="bg-bg-secondary p-6">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Total Paid (YTD)</p>
                        <Coins className="h-4 w-4 text-text-green" />
                    </div>
                    <p className="text-3xl font-mono font-bold text-text-green">${totalPaid.toFixed(2)}</p>
                    <p className="text-[10px] text-text-muted mt-1 uppercase">Across all approved logs</p>
                </div>
                <div className="bg-bg-secondary p-6">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Awaiting Audit</p>
                        <FileClock className="h-4 w-4 text-accent-gold" />
                    </div>
                    <p className="text-3xl font-mono font-bold text-accent-gold">${pendingPayout.toFixed(2)}</p>
                    <p className="text-[10px] text-text-muted mt-1 uppercase">Standard assignment payouts</p>
                </div>
                <div className="bg-bg-secondary p-6">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Pending Reimbursements</p>
                        <Receipt className="h-4 w-4 text-text-primary" />
                    </div>
                    <p className="text-3xl font-mono font-bold text-text-primary">${pendingReimbursements.toFixed(2)}</p>
                    <p className="text-[10px] text-text-muted mt-1 uppercase">Verified field expenses</p>
                </div>
            </div>

            <Tabs defaultValue="history" className="w-full">
                <TabsList className="tabs !mb-6">
                    <TabsTrigger value="history" className="tab">
                        Payout History <span className="tab-count">({logs.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="reimbursements" className="tab">
                        Reimbursement Tracker <span className="tab-count">({myExpenses.length})</span>
                    </TabsTrigger>
                </TabsList>
                
                <TabsContent value="history" className="mt-0">
                    <Card className="bg-bg-secondary border-border-main">
                        <CardHeader>
                            <CardTitle>Log Manifest History</CardTitle>
                            <CardDescription>Comprehensive audit of submitted weekly logs and their final authorization status.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="table-wrap border-none rounded-none">
                                <table className="tbl">
                                    <thead>
                                        <tr>
                                            <th>Week Period</th>
                                            <th>Authorization Status</th>
                                            <th className="text-right">Final Payout</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map(log => (
                                            <TableRow key={log.id} className="hover:bg-bg-tertiary transition-colors">
                                                <TableCell className="font-bold uppercase text-xs tracking-wide">Week of {log.weekOf}</TableCell>
                                                <TableCell>
                                                    <Badge variant={log.status === 'Approved' ? 'active' : log.status === 'Submitted' ? 'onhold' : 'pending'}>
                                                        {log.status.toUpperCase()}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {log.totalPayout ? (
                                                        <div className="flex flex-col items-end">
                                                            <span className={log.status === 'Approved' ? 'text-text-green font-mono font-bold' : 'text-text-primary font-mono'}>
                                                                ${log.totalPayout.toFixed(2)}
                                                            </span>
                                                            <span className="text-[9px] text-text-muted uppercase font-bold tracking-widest mt-0.5">Verified</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-text-muted italic text-xs">Processing...</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {logs.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="h-32 text-center text-text-muted uppercase text-[10px] tracking-[0.2em] italic">No historical manifests found.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="reimbursements" className="mt-0">
                    <Card className="bg-bg-secondary border-border-main">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0">
                            <div>
                                <CardTitle>Expense Tracking Terminal</CardTitle>
                                <CardDescription>Real-time status tracking for field material and travel reimbursements.</CardDescription>
                            </div>
                            <Button variant="outline" size="sm" className="h-8" onClick={handleExportClick}>
                                <Download size={14} className="mr-2"/> Export Audit Log
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                             <div className="table-wrap border-none rounded-none">
                                <table className="tbl">
                                    <thead>
                                        <tr>
                                            <th>Transaction Date</th>
                                            <th>Description & Category</th>
                                            <th>Status</th>
                                            <th className="text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {myExpenses.map(expense => (
                                            <TableRow key={expense.id} className="hover:bg-bg-tertiary transition-colors">
                                                <TableCell className="text-xs font-mono text-text-muted">{expense.date}</TableCell>
                                                <TableCell>
                                                    <div className="font-bold text-text-primary text-xs uppercase tracking-wide">{expense.description}</div>
                                                    <div className="text-[10px] text-text-muted uppercase tracking-widest mt-0.5">{expense.category}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={getStatusVariant(expense.status)}>
                                                        {expense.status.toUpperCase()}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex flex-col items-end">
                                                        <span className="font-mono font-bold text-text-primary text-sm">${expense.amount.toFixed(2)}</span>
                                                        <span className="text-[9px] text-text-muted uppercase font-bold tracking-widest mt-0.5">USD</span>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {myExpenses.length === 0 && (
                                            <tr>
                                                <td colSpan={4} className="h-32 text-center text-text-muted uppercase text-[10px] tracking-[0.2em] italic">No active reimbursement claims.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* EXPORT RANGE TERMINAL */}
            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
                <DialogContent className="sm:max-w-[450px] bg-bg-elevated border-border-default">
                    <DialogHeader>
                        <div className="flex items-center gap-2 mb-1">
                            <Download className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest">Audit Export Configuration</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs">Select temporal parameters for comprehensive field log generation.</DialogDescription>
                    </DialogHeader>

                    <div className="py-6 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest flex items-center gap-2">
                                    <CalendarIcon size={12} />
                                    Range Start
                                </Label>
                                <Input 
                                    type="date" 
                                    value={exportDates.from}
                                    onChange={(e) => setExportDates({...exportDates, from: e.target.value})}
                                    className="bg-bg-primary h-11 text-xs"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest flex items-center gap-2">
                                    <CalendarIcon size={12} />
                                    Range End
                                </Label>
                                <Input 
                                    type="date" 
                                    value={exportDates.to}
                                    onChange={(e) => setExportDates({...exportDates, to: e.target.value})}
                                    className="bg-bg-primary h-11 text-xs"
                                />
                            </div>
                        </div>

                        <div className="p-4 rounded-lg bg-bg-secondary border border-border-sub space-y-2 text-center">
                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Compiling Dataset</p>
                            <p className="text-[9px] text-text-secondary leading-relaxed uppercase">
                                This will generate a high-fidelity CSV audit log containing all assignments, payouts, and verified receipts between the specified coordinates.
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="bg-bg-secondary/30 -mx-6 -mb-6 p-6 border-t border-border-default flex gap-3">
                        <Button variant="outline" onClick={() => setIsExportDialogOpen(false)} className="flex-1 h-11 uppercase font-bold text-[10px] tracking-widest">
                            <X size={14} className="mr-2" /> Abort
                        </Button>
                        <Button onClick={executeExport} className="flex-1 h-11 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest">
                            <Check size={14} className="mr-2" /> Finalize & Download
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ReceiptUploadDialog 
                isOpen={isReceiptDialogOpen}
                setIsOpen={setIsReceiptDialogOpen}
                workOrders={workOrders.filter(wo => wo.assignedTechnicianId === currentTechId)}
                projects={projects.filter(p => p.assignedTechnicianIds.includes(currentTechId || ''))}
            />
        </div>
    );
}
