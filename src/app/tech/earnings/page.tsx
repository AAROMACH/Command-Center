'use client';

import { useState, useEffect, useMemo } from 'react';
import type { WeeklyLog, Expense, Technician, WorkOrder } from '@/lib/types';
import { weeklyLogs, expenses as initialExpenses, technicians, workOrders } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
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
    ClipboardList,
    Settings2,
    Info
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
                    <h1 className="page-title">Earnings Terminal</h1>
                    <p className="page-subtitle">Historical payout audit and reimbursement tracking.</p>
                </div>
                <div className="page-header-right">
                    <Button onClick={() => setIsReceiptDialogOpen(true)}>
                        <Receipt size={14} className="mr-2"/>
                        Submit Receipt
                    </Button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    <div className="grid grid-cols-3 gap-px bg-border-main border border-border-main rounded-lg overflow-hidden">
                        <div className="bg-bg-secondary p-6">
                            <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest mb-2">Total Paid (YTD)</p>
                            <p className="text-3xl font-mono font-bold text-text-green">${totalPaid.toFixed(2)}</p>
                        </div>
                        <div className="bg-bg-secondary p-6">
                            <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest mb-2">Pending Audit</p>
                            <p className="text-3xl font-mono font-bold text-accent-gold">${pendingPayout.toFixed(2)}</p>
                        </div>
                        <div className="bg-bg-secondary p-6">
                            <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest mb-2">Reimbursements</p>
                            <p className="text-3xl font-mono font-bold text-text-primary">${pendingReimbursements.toFixed(2)}</p>
                        </div>
                    </div>

                    <Tabs defaultValue="history" className="w-full">
                        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 bg-bg-secondary/50 p-4 rounded-xl border border-border-sub">
                            <TabsList className="tabs !mb-0">
                                <TabsTrigger value="history" className="tab">Payout History</TabsTrigger>
                                <TabsTrigger value="reimbursements" className="tab">Reimbursements</TabsTrigger>
                            </TabsList>
                        </div>
                        
                        <TabsContent value="history" className="mt-0">
                            <Card>
                                <CardContent className="p-0">
                                    <div className="table-wrap border-none rounded-none">
                                        <table className="tbl">
                                            <thead>
                                                <tr>
                                                    <th className="text-center">Week Period</th>
                                                    <th className="text-center">Status</th>
                                                    <th className="text-right pr-12">Payout</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredLogs.map(log => (
                                                    <TableRow 
                                                        key={log.id} 
                                                        className="hover:bg-bg-tertiary transition-colors cursor-pointer group"
                                                        onClick={() => setSelectedLog(log)}
                                                    >
                                                        <TableCell className="font-bold uppercase text-xs text-center">Week of {log.weekOf}</TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge variant={getStatusVariant(log.status)}>{log.status.toUpperCase()}</Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right pr-12 font-mono font-bold">${(log.totalPayout || 0).toFixed(2)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="reimbursements" className="mt-0">
                            <Card>
                                <CardContent className="p-0">
                                     <div className="table-wrap border-none rounded-none">
                                        <table className="tbl">
                                            <thead>
                                                <tr>
                                                    <th className="text-center">Date</th>
                                                    <th className="text-center">Description</th>
                                                    <th className="text-center">Status</th>
                                                    <th className="text-right pr-12">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredExpenses.map(expense => (
                                                    <TableRow key={expense.id} className="hover:bg-bg-tertiary transition-colors">
                                                        <TableCell className="text-xs font-mono text-center">{formatDateStr(expense.date)}</TableCell>
                                                        <TableCell className="text-center">
                                                            <div className="font-bold text-xs uppercase">{expense.description}</div>
                                                            <div className="text-[9px] text-text-muted uppercase font-bold">{expense.category}</div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge variant={getStatusVariant(expense.status)}>{expense.status.toUpperCase()}</Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right pr-12 font-mono font-bold text-text-primary">${expense.amount.toFixed(2)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Settings2 size={16} className="text-accent-gold" />
                                Payout Protocol
                            </CardTitle>
                            <CardDescription>Verified preferences for disbursement routing.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-4">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Selected Method</p>
                                    <p className="text-sm font-bold text-text-primary uppercase tracking-wide">
                                        {tech?.payoutPreferences?.method || 'ACH Bank Transfer'}
                                    </p>
                                </div>
                                
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Notes / Instructions</p>
                                    <p className="text-xs text-text-secondary leading-relaxed italic">
                                        {tech?.payoutPreferences?.notes || 'No specific routing instructions logged.'}
                                    </p>
                                </div>

                                <div className="pt-2">
                                    <Badge variant="active" className="text-[9px] h-5 px-3 uppercase tracking-widest">Identity Verified</Badge>
                                </div>
                            </div>

                            <div className="p-4 rounded-lg bg-bg-tertiary/50 border border-border-sub flex items-start gap-3">
                                <Info size={16} className="text-text-muted shrink-0 mt-0.5" />
                                <p className="text-[10px] text-text-muted leading-normal uppercase font-medium">
                                    Disbursements are cleared within 48 hours of weekly log approval. Changes to preferred methods require administrative sign-off.
                                </p>
                            </div>

                            <Button variant="outline" className="w-full h-10 uppercase font-bold text-[10px] tracking-widest" onClick={() => router.push('/tech/profile')}>
                                Update Preferences
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <ReceiptUploadDialog 
                isOpen={isReceiptDialogOpen}
                setIsOpen={setIsReceiptDialogOpen}
                workOrders={workOrders.filter(wo => wo.assignedTechnicianId === currentTechId)}
                projects={[]}
            />
        </div>
    );
}