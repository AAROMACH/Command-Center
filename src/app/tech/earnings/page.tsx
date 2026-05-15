'use client';

import { useState, useEffect, useMemo } from 'react';
import type { WeeklyLog, Expense, Technician, WorkOrder } from '@/lib/types';
import { weeklyLogs, expenses as initialExpenses, technicians, workOrders } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
    Coins, 
    FileClock, 
    Receipt, 
    Plus, 
    Download, 
    Calendar as CalendarIcon, 
    Check, 
    X, 
    Search, 
    ArrowUpDown, 
    Eye, 
    Clock, 
    MapPin, 
    ClipboardList 
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { ReceiptUploadDialog } from '../dashboard/components/receipt-upload-dialog';
import { useToast } from '@/hooks/use-toast';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription, 
    DialogFooter 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

type LogSortOption = 'date-desc' | 'date-asc' | 'payout-desc' | 'status';
type ExpenseSortOption = 'date-desc' | 'amount-desc' | 'status';

export default function TechEarningsPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    
    // UI Dialog States
    const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false);
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [selectedLog, setSelectedLog] = useState<WeeklyLog | null>(null);
    
    // Filtering/Sorting States
    const [logSearchQuery, setLogSearchQuery] = useState("");
    const [logSortBy, setLogSortBy] = useState<LogSortOption>('date-desc');
    const [expenseSearchQuery, setExpenseSearchQuery] = useState("");
    const [expenseSortBy, setExpenseSortBy] = useState<ExpenseSortOption>('date-desc');

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

    // FILTERED & SORTED LOGS
    const filteredLogs = useMemo(() => {
        if (!currentTechId) return [];
        let results = weeklyLogs.filter(wl => wl.technicianId === currentTechId);
        
        if (logSearchQuery) {
            results = results.filter(l => l.weekOf.toLowerCase().includes(logSearchQuery.toLowerCase()));
        }

        return results.sort((a, b) => {
            if (logSortBy === 'date-desc') return b.weekOf.localeCompare(a.weekOf);
            if (logSortBy === 'date-asc') return a.weekOf.localeCompare(b.weekOf);
            if (logSortBy === 'payout-desc') return (b.totalPayout || 0) - (a.totalPayout || 0);
            if (logSortBy === 'status') return a.status.localeCompare(b.status);
            return 0;
        });
    }, [currentTechId, logSearchQuery, logSortBy]);

    // FILTERED & SORTED EXPENSES
    const filteredExpenses = useMemo(() => {
        if (!tech) return [];
        let results = initialExpenses.filter(e => e.submittedBy === tech.name);

        if (expenseSearchQuery) {
            const q = expenseSearchQuery.toLowerCase();
            results = results.filter(e => 
                e.description.toLowerCase().includes(q) || 
                e.category.toLowerCase().includes(q)
            );
        }

        return results.sort((a, b) => {
            if (expenseSortBy === 'date-desc') return b.date.localeCompare(a.date);
            if (expenseSortBy === 'amount-desc') return b.amount - a.amount;
            if (expenseSortBy === 'status') return a.status.localeCompare(b.status);
            return 0;
        });
    }, [tech, expenseSearchQuery, expenseSortBy]);

    const totalPaid = useMemo(() => 
        filteredLogs.filter(l => l.status === 'Approved').reduce((acc, log) => acc + (log.totalPayout || 0), 0)
    , [filteredLogs]);

    const pendingPayout = useMemo(() => 
        filteredLogs.filter(l => l.status === 'Submitted').reduce((acc, log) => acc + (log.totalPayout || 0), 0)
    , [filteredLogs]);

    const pendingReimbursements = useMemo(() => 
        filteredExpenses.filter(e => e.status === 'Pending').reduce((acc, exp) => acc + exp.amount, 0)
    , [filteredExpenses]);

    const getStatusVariant = (status: string) => {
        const s = status.toLowerCase();
        if (s === 'approved' || s === 'paid') return 'active';
        if (s === 'pending' || s === 'submitted') return 'onhold';
        if (s === 'rejected' || s === 'void') return 'destructive';
        return 'outline';
    };

    const formatDateStr = (dateStr: string) => {
        if (!dateStr) return 'TBD';
        try {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                const [year, month, day] = parts;
                return `${month}-${day}-${year}`;
            }
            return dateStr;
        } catch (e) {
            return dateStr;
        }
    };

    const executeExport = () => {
        toast({
            title: "Export Initiated",
            description: `Generating audit log for period ${formatDateStr(exportDates.from)} – ${formatDateStr(exportDates.to)}.`,
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
                        <Receipt size={14} className="mr-2"/>
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
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 bg-bg-secondary/50 p-4 rounded-xl border border-border-sub">
                    <TabsList className="tabs !mb-0">
                        <TabsTrigger value="history" className="tab">
                            Payout History <span className="tab-count">({filteredLogs.length})</span>
                        </TabsTrigger>
                        <TabsTrigger value="reimbursements" className="tab">
                            Reimbursement Tracker <span className="tab-count">({filteredExpenses.length})</span>
                        </TabsTrigger>
                    </TabsList>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="search-wrap flex-1 md:w-[240px]">
                            <Search className="h-3.5 w-3.5" />
                            <input 
                                className="search-input !w-full !bg-bg-primary h-9 text-xs" 
                                placeholder="Search records..." 
                                value={logSearchQuery}
                                onChange={(e) => setLogSearchQuery(e.target.value)}
                            />
                        </div>
                        <Select value={logSortBy} onValueChange={(val: any) => setLogSortBy(val)}>
                            <SelectTrigger className="w-[150px] h-9 bg-bg-primary text-[10px] uppercase font-bold tracking-widest">
                                <div className="flex items-center gap-2">
                                    <ArrowUpDown size={14} className="text-text-muted" />
                                    <SelectValue placeholder="Sort" />
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="date-desc" className="text-[10px] uppercase font-bold">Newest First</SelectItem>
                                <SelectItem value="date-asc" className="text-[10px] uppercase font-bold">Oldest First</SelectItem>
                                <SelectItem value="payout-desc" className="text-[10px] uppercase font-bold">Highest Payout</SelectItem>
                                <SelectItem value="status" className="text-[10px] uppercase font-bold">By Status</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                
                <TabsContent value="history" className="mt-0">
                    <Card className="bg-bg-secondary border-border-main">
                        <CardHeader>
                            <CardTitle>Log Manifest History</CardTitle>
                            <CardDescription>Comprehensive audit of submitted weekly logs. Click a row to audit assignments.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="table-wrap border-none rounded-none">
                                <table className="tbl">
                                    <thead>
                                        <tr>
                                            <th className="text-center">Week Period</th>
                                            <th className="text-center">Authorization Status</th>
                                            <th className="text-right pr-12">Final Payout</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredLogs.map(log => (
                                            <TableRow 
                                                key={log.id} 
                                                className="hover:bg-bg-tertiary transition-colors cursor-pointer group"
                                                onClick={() => setSelectedLog(log)}
                                            >
                                                <TableCell className="font-bold uppercase text-xs tracking-wide">
                                                    <div className="flex items-center justify-center gap-3">
                                                        <CalendarIcon size={14} className="text-text-muted group-hover:text-brand-red transition-colors" />
                                                        Week of {log.weekOf}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant={getStatusVariant(log.status)}>
                                                        {log.status.toUpperCase()}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right pr-12">
                                                    {log.totalPayout ? (
                                                        <div className="flex flex-col items-end">
                                                            <span className={cn("font-mono font-bold text-sm", log.status === 'Approved' ? 'text-text-green' : 'text-text-primary')}>
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
                                        {filteredLogs.length === 0 && (
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
                            <Button variant="outline" size="sm" className="h-8" onClick={() => setIsExportDialogOpen(true)}>
                                <Download size={14} className="mr-2"/> Export Audit Log
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                             <div className="table-wrap border-none rounded-none">
                                <table className="tbl">
                                    <thead>
                                        <tr>
                                            <th className="text-center">Transaction Date</th>
                                            <th className="text-center">Description & Category</th>
                                            <th className="text-center">Status</th>
                                            <th className="text-right pr-12">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredExpenses.map(expense => (
                                            <TableRow key={expense.id} className="hover:bg-bg-tertiary transition-colors">
                                                <TableCell className="text-xs font-mono text-text-muted text-center">{formatDateStr(expense.date)}</TableCell>
                                                <TableCell className="text-center">
                                                    <div className="font-bold text-text-primary text-xs uppercase tracking-wide">{expense.description}</div>
                                                    <div className="text-[10px] text-text-muted uppercase font-bold tracking-widest mt-0.5">{expense.category}</div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant={getStatusVariant(expense.status)}>
                                                        {expense.status.toUpperCase()}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right pr-12">
                                                    <div className="flex flex-col items-end">
                                                        <span className="font-mono font-bold text-text-primary text-sm">${expense.amount.toFixed(2)}</span>
                                                        <span className="text-[9px] text-text-muted uppercase font-bold tracking-widest mt-0.5">USD</span>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {filteredExpenses.length === 0 && (
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
                    </div>

                    <DialogFooter className="bg-bg-secondary/30 -mx-6 -mb-6 p-6 border-t border-border-default flex gap-3">
                        <Button variant="outline" onClick={() => setIsExportDialogOpen(false)} className="flex-1 h-11 uppercase font-bold text-[10px] tracking-widest">
                            <X size={14} className="mr-2" /> Cancel
                        </Button>
                        <Button onClick={executeExport} className="flex-1 h-11 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest">
                            <Check size={14} className="mr-2" /> Finalize & Download
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* LOG AUDIT POPUP */}
            <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
                <DialogContent className="sm:max-w-3xl bg-bg-elevated border-border-default flex flex-col p-0 overflow-hidden max-h-[85vh]">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-bg-secondary rounded border border-border-sub text-brand-red">
                                    <FileClock size={20} />
                                </div>
                                <div>
                                    <DialogTitle className="text-lg font-bold uppercase tracking-widest">Week Manifest Audit</DialogTitle>
                                    <DialogDescription className="text-xs font-bold text-text-muted uppercase">Period: {selectedLog?.weekOf}</DialogDescription>
                                </div>
                            </div>
                            <Badge variant={selectedLog ? getStatusVariant(selectedLog.status) : 'outline'} className="h-6 px-4 uppercase text-[10px] tracking-widest">
                                {selectedLog?.status}
                            </Badge>
                        </div>
                    </DialogHeader>

                    <ScrollArea className="flex-1">
                        <div className="p-6 space-y-8">
                            {/* Summary Totals */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-xl bg-bg-secondary border border-border-sub text-center space-y-1">
                                    <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Manifest Payout</p>
                                    <p className="text-2xl font-mono font-bold text-text-green">${(selectedLog?.totalPayout || 0).toFixed(2)}</p>
                                </div>
                                <div className="p-4 rounded-xl bg-bg-secondary border border-border-sub text-center space-y-1">
                                    <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Assignment Count</p>
                                    <p className="text-2xl font-bold text-text-primary">{selectedLog?.items.length}</p>
                                </div>
                            </div>

                            {/* Assignment Registry */}
                            <section className="space-y-4">
                                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1">Mission Registry</h3>
                                <div className="space-y-2">
                                    {selectedLog?.items.map(item => {
                                        const wo = workOrders.find(w => w.id === item.workOrderId);
                                        return (
                                            <div key={item.id} className="p-4 rounded-xl border border-border-sub bg-bg-primary flex items-center justify-between group hover:border-text-muted transition-all">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-2 bg-bg-tertiary rounded text-text-muted">
                                                        <ClipboardList size={16} />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{wo?.description}</p>
                                                        <div className="flex items-center gap-3 mt-1 text-[9px] text-text-muted font-bold uppercase tracking-widest">
                                                            <span className="font-mono text-brand-red">ID: {wo?.id.toUpperCase()}</span>
                                                            <span>•</span>
                                                            <span>{wo?.scheduleDate}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <Badge variant="outline" className="text-[8px] bg-bg-secondary border-border-sub uppercase tracking-tighter">
                                                    {item.confirmationStatus === 'confirmed' ? 'Verified' : 'Flagged'}
                                                </Badge>
                                            </div>
                                        )
                                    })}
                                </div>
                            </section>

                            {/* Reimbursement Registry */}
                            <section className="space-y-4">
                                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1">Reimbursement Ledger</h3>
                                <div className="space-y-2">
                                    {selectedLog?.reimbursements && selectedLog.reimbursements.length > 0 ? selectedLog.reimbursements.map(re => (
                                        <div key={re.id} className="flex items-center justify-between p-3 rounded-lg bg-bg-primary border border-border-sub">
                                            <div className="space-y-0.5">
                                                <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide">{re.description}</p>
                                                <p className="text-[9px] text-text-muted font-mono">{re.date}</p>
                                            </div>
                                            <p className="text-xs font-mono font-bold text-text-green">+${re.amount.toFixed(2)}</p>
                                        </div>
                                    )) : (
                                        <div className="p-8 text-center border border-dashed border-border-sub rounded-xl opacity-40">
                                            <p className="text-[10px] font-bold uppercase tracking-widest">No reimbursements logged</p>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>
                    </ScrollArea>

                    <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default">
                        <Button variant="outline" onClick={() => setSelectedLog(null)} className="w-full uppercase font-bold text-[10px] tracking-widest h-10">
                            Close Audit View
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ReceiptUploadDialog 
                isOpen={isReceiptDialogOpen}
                setIsOpen={setIsReceiptDialogOpen}
                workOrders={workOrders.filter(wo => wo.assignedTechnicianId === currentTechId)}
                projects={[]}
            />
        </div>
    );
}
