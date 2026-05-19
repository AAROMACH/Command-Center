
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { WeeklyLog, Expense, Technician } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
    Coins, 
    Receipt, 
    Calendar as CalendarIcon, 
    Search, 
    ArrowUpDown, 
    ChevronRight,
    ArrowUpRight,
    CheckCircle2
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { ReceiptUploadDialog } from '../dashboard/components/receipt-upload-dialog';
import { useToast } from '@/hooks/use-toast';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { format, isSameDay, startOfDay } from 'date-fns';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, doc } from 'firebase/firestore';

type LogSortOption = 'date-desc' | 'date-asc' | 'payout-desc' | 'status';

export default function TechEarningsPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [tech, setTech] = useState<Technician | null>(null);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [workOrders, setWorkOrders] = useState<any[]>([]);
    
    const [mounted, setMounted] = useState(false);
    const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false);
    const [logSearchQuery, setLogSearchQuery] = useState("");
    const [logSortBy, setLogSortBy] = useState<LogSortOption>('date-desc');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

    useEffect(() => {
        setMounted(true);
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);

        if (userId) {
            const unsubTech = onSnapshot(doc(db, 'users', userId), (d) => {
                if (d.exists()) setTech({ ...d.data(), id: d.id } as Technician);
            });
            const unsubLogs = onSnapshot(query(collection(db, 'weeklyLogs'), where('technicianId', '==', userId)), (snap) => {
                setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)));
            });
            const unsubExp = onSnapshot(query(collection(db, 'expenses'), where('technicianId', '==', userId)), (snap) => {
                setExpenses(snap.docs.map(d => ({ ...d.data(), id: d.id } as Expense)));
            });
            const unsubWO = onSnapshot(query(collection(db, 'workOrders'), where('assignedTechnicianId', '==', userId)), (snap) => {
                setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id })));
            });

            return () => {
                unsubTech(); unsubLogs(); unsubExp(); unsubWO();
            };
        }
    }, []);

    const filteredLogs = useMemo(() => {
        let results = weeklyLogs;
        
        if (logSearchQuery) {
            results = results.filter(l => (l.weekOf || '').toLowerCase().includes(logSearchQuery.toLowerCase()));
        }

        if (dateRange?.from) {
            results = results.filter(log => {
                try {
                    const [m, d, y] = log.weekOf.split('-');
                    const logDate = startOfDay(new Date(parseInt(y), parseInt(m) - 1, parseInt(d)));
                    if (dateRange.from && dateRange.to) {
                        return logDate >= startOfDay(dateRange.from) && logDate <= startOfDay(dateRange.to);
                    }
                    return isSameDay(logDate, dateRange.from!);
                } catch(e) { return true; }
            });
        }

        return results.sort((a, b) => {
            if (logSortBy === 'date-desc') return (b.weekOf || '').localeCompare(a.weekOf || '');
            if (logSortBy === 'date-asc') return (a.weekOf || '').localeCompare(b.weekOf || '');
            if (logSortBy === 'payout-desc') return (b.totalPayout || 0) - (a.totalPayout || 0);
            return 0;
        });
    }, [weeklyLogs, logSearchQuery, logSortBy, dateRange]);

    const metrics = useMemo(() => {
        const settled = filteredLogs.filter(l => l.status === 'Approved').reduce((acc, log) => acc + (log.totalPayout || 0), 0);
        const pending = filteredLogs.filter(l => l.status === 'Submitted').reduce((acc, log) => acc + (log.totalPayout || 0), 0);
        const reimb = expenses.filter(e => e.status === 'Pending').reduce((acc, exp) => acc + exp.amount, 0);
        return { settled, pending, reimb };
    }, [filteredLogs, expenses]);

    const getStatusVariant = (status: string) => {
        const s = (status || '').toLowerCase();
        if (s === 'approved' || s === 'paid') return 'active';
        if (s === 'pending' || s === 'submitted') return 'onhold';
        return 'outline';
    };

    if (!mounted || !currentTechId) {
        return <div className="p-8 text-center uppercase tracking-widest text-text-muted text-xs">Accessing Financial Vault...</div>;
    }

    return (
        <div className="space-y-6">
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2"><Coins size={12} />Financial Intelligence</p>
                    <h1 className="page-title">Billing Terminal</h1>
                    <p className="page-subtitle">Historical billing audit and reimbursement tracking.</p>
                </div>
                <div className="page-header-right">
                    <Button onClick={() => setIsReceiptDialogOpen(true)}>
                        <Receipt size={14} className="mr-2"/> Submit Receipt
                    </Button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border-main border border-border-main rounded-lg overflow-hidden shadow-sm">
                <div className="bg-bg-secondary p-6">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Total Settled (YTD)</p>
                        <CheckCircle2 className="h-4 w-4 text-text-green" />
                    </div>
                    <p className="text-3xl font-mono font-bold text-text-green">${metrics.settled.toFixed(2)}</p>
                </div>
                <div className="bg-bg-secondary p-6">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Pending Audit</p>
                        <ArrowUpRight className="h-4 w-4 text-accent-gold" />
                    </div>
                    <p className="text-3xl font-mono font-bold text-accent-gold">${metrics.pending.toFixed(2)}</p>
                </div>
                <div className="bg-bg-secondary p-6">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Reimbursements</p>
                        <Receipt className="h-4 w-4 text-text-primary" />
                    </div>
                    <p className="text-3xl font-mono font-bold text-text-primary">${metrics.reimb.toFixed(2)}</p>
                </div>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border-sub bg-bg-tertiary/30">
                    <div className="text-left">
                        <CardTitle>Billing Registry</CardTitle>
                        <CardDescription>Historical weekly log audit and settlement tracking.</CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                        <Popover>
                            <PopoverTrigger asChild>
                                <div className={cn(
                                    "flex items-center h-9 rounded-md border border-border-main bg-bg-primary px-3 cursor-pointer hover:bg-bg-tertiary transition-all group relative pr-8",
                                    dateRange?.from && "border-brand-red ring-1 ring-brand-red"
                                )}>
                                    <CalendarIcon size={12} className={cn("mr-2", dateRange?.from ? "text-brand-red" : "text-text-muted")} />
                                    <span className={cn("text-[10px] font-bold uppercase tracking-widest", dateRange?.from ? "text-text-primary" : "text-text-muted")}>
                                        {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, "MM-dd")} – ${format(dateRange.to, "MM-dd")}` : format(dateRange.from, "MM-dd")) : "Pick Period"}
                                    </span>
                                </div>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-bg-elevated border-border-main shadow-2xl" align="end">
                                <Calendar initialFocus mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={1} />
                            </PopoverContent>
                        </Popover>
                        <div className="search-wrap !mb-0 w-[180px]">
                            <Search className="h-3.5 w-3.5" />
                            <input 
                                className="search-input !w-full !h-9 !text-[10px] font-bold uppercase" 
                                placeholder="Filter records..." 
                                value={logSearchQuery}
                                onChange={(e) => setLogSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-border-sub">
                                <TableHead className="text-center text-[10px] uppercase font-bold tracking-widest">Week Period</TableHead>
                                <TableHead className="text-center text-[10px] uppercase font-bold tracking-widest">Audit Status</TableHead>
                                <TableHead className="text-right pr-12 text-[10px] uppercase font-bold tracking-widest">Settlement</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredLogs.map(log => (
                                <TableRow key={log.id} className="hover:bg-bg-tertiary transition-colors cursor-pointer group">
                                    <TableCell className="font-bold uppercase text-xs text-center">Week of {log.weekOf}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant={getStatusVariant(log.status)}>{(log.status || '').toUpperCase()}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right pr-12 font-mono font-bold text-text-primary">${(log.totalPayout || 0).toFixed(2)}</TableCell>
                                </TableRow>
                            ))}
                            {filteredLogs.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-12 text-[10px] font-bold text-text-muted uppercase tracking-widest italic">No billing records found in current registry window.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <ReceiptUploadDialog 
                isOpen={isReceiptDialogOpen}
                setIsOpen={setIsReceiptDialogOpen}
                workOrders={workOrders}
                projects={[]}
            />
        </div>
    );
}
