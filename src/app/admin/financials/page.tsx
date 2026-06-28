'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Banknote, ArrowUpRight, ArrowDownRight, Minus, Download, FileText, BarChart, FileWarning, Plus, Calendar as CalendarIcon, Check, X, ShieldAlert, Search, Info, Undo2, TrendingUp, Activity, Car, Navigation } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Expense, Invoice, WeeklyLog, Technician, WorkOrder, TripLog } from '@/lib/types';
import { InvoiceEditor } from './components/invoice-editor';
import { PayrollReviewDialog } from './components/payroll-review-dialog';
import { RevenueChart } from './components/revenue-chart';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { isSuperAdmin } from '@/lib/permissions';
import { useSearchParams, useRouter } from 'next/navigation';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, doc, updateDoc, setDoc } from 'firebase/firestore';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import { startOfMonth, endOfMonth, subMonths, format, isWithinInterval, parseISO, startOfDay } from 'date-fns';

/**
 * @fileOverview Master Financial Registry.
 * High-fidelity oversight of organizational revenue, operative payroll, and project economics.
 */

export default function FinancialsPage() {
    const searchParams = useSearchParams();
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [projects, setProjects] = useState<any[]>([]);
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [assignments, setAssignments] = useState<WorkOrder[]>([]);
    const [tripLogs, setTripLogs] = useState<TripLog[]>([]);
    
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'summary');

    const [isInvoiceEditorOpen, setIsInvoiceEditorOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [selectedLog, setSelectedLog] = useState<WeeklyLog | null>(null);
    const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
    
    const [isClosePeriodOpen, setIsClosePeriodOpen] = useState(false);
    const [confirmationText, setConfirmationText] = useState("");
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [exportConfig, setExportConfig] = useState({
        from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0],
        types: ['invoices', 'expenses', 'payroll']
    });

    const { toast } = useToast();
    const router = useRouter();

    // 1. Initialize Data Listeners
    useEffect(() => {
        const unsubExp = onSnapshot(collection(db, 'expenses'), (snap) => {
            setExpenses(snap.docs.map(d => ({ ...d.data(), id: d.id } as Expense)));
        });
        const unsubInv = onSnapshot(collection(db, 'invoices'), (snap) => {
            setInvoices(snap.docs.map(d => ({ ...d.data(), id: d.id } as Invoice)));
        });
        const unsubLog = onSnapshot(collection(db, 'weeklyLogs'), (snap) => {
            setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)));
        });
        const unsubTech = onSnapshot(collection(db, 'users'), (snap) => {
            setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
        });
        const unsubProj = onSnapshot(collection(db, 'projects'), (snap) => {
            setProjects(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        });
        const unsubWO = onSnapshot(collection(db, 'workOrders'), (snap) => {
            setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });
        const unsubAsmt = onSnapshot(collection(db, 'assignments'), (snap) => {
            setAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });
        const unsubTrips = onSnapshot(collection(db, 'tripLogs'), (snap) => {
            setTripLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as TripLog)));
        });

        const userId = sessionStorage.getItem('currentUserId');
        if (userId) {
            const unsubUser = onSnapshot(doc(db, 'users', userId), (d) => {
                if (d.exists()) setCurrentUser({ ...d.data(), id: d.id } as Technician);
            });
            return () => {
                unsubExp(); unsubInv(); unsubLog(); unsubTech(); unsubProj(); unsubWO(); unsubAsmt(); unsubTrips(); unsubUser();
            };
        }

        return () => {
            unsubExp(); unsubInv(); unsubLog(); unsubTech(); unsubProj(); unsubWO(); unsubAsmt(); unsubTrips();
        };
    }, []);

    // 2. Tactical Intelligence Calculation
    const stats = useMemo(() => {
        const now = new Date();
        const start = startOfMonth(now);
        const end = endOfMonth(now);

        // Protocol Update: Revenue only includes PAID invoices
        const mtdRevenue = invoices
            .filter(inv => {
                try {
                    const d = new Date(inv.issueDate);
                    return isWithinInterval(d, { start, end }) && inv.status === 'paid';
                } catch(e) { return false; }
            })
            .reduce((acc, inv) => acc + inv.total, 0);

        const pendingPayouts = weeklyLogs
            .filter(log => log.status === 'Submitted')
            .reduce((acc, log) => acc + (log.totalPayout || 0), 0);

        const outstandingAR = invoices
            .filter(inv => inv.status !== 'paid' && inv.status !== 'void')
            .reduce((acc, inv) => acc + inv.total, 0);

        const mtdCosts = expenses
            .filter(e => {
                try {
                    const d = new Date(e.date);
                    return isWithinInterval(d, { start, end }) && e.status === 'Approved';
                } catch(e) { return false; }
            })
            .reduce((acc, e) => acc + e.amount, 0) + 
            weeklyLogs
            .filter(l => {
                try {
                    const parts = l.weekOf.split('-');
                    const d = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
                    return isWithinInterval(d, { start, end }) && l.status === 'Approved';
                } catch(e) { return false; }
            })
            .reduce((acc, l) => acc + (l.totalPayout || 0), 0);

        const margin = mtdRevenue > 0 ? ((mtdRevenue - mtdCosts) / mtdRevenue) * 100 : 0;

        return [
            { title: "TOTAL REVENUE (MTD)", value: `$${mtdRevenue.toLocaleString()}`, trend: "SETTLED FUNDS ONLY", trendType: "positive" as const, TrendIcon: ArrowUpRight },
            { title: "PENDING PAYOUTS", value: `$${pendingPayouts.toLocaleString()}`, trend: "AWAITING AUDIT", trendType: "warning" as const, TrendIcon: Minus },
            { title: "OUTSTANDING A/R", value: `$${outstandingAR.toLocaleString()}`, trend: "FUNDING PIPELINE", trendType: "positive" as const, TrendIcon: Activity },
            { title: "SERVICE MARGIN", value: `${margin.toFixed(1)}%`, trend: "PAID REVENUE VS COSTS", trendType: margin >= 25 ? "positive" as const : "negative" as const, TrendIcon: TrendingUp },
        ];
    }, [invoices, weeklyLogs, expenses]);

    const chartData = useMemo(() => {
        const data = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const date = subMonths(now, i);
            const start = startOfMonth(date);
            const end = endOfMonth(date);
            const label = format(date, 'MMM yy').toUpperCase();

            const rev = invoices
                .filter(inv => {
                    try {
                        const d = new Date(inv.issueDate);
                        return isWithinInterval(d, { start, end }) && inv.status === 'paid';
                    } catch(e) { return false; }
                })
                .reduce((acc, inv) => acc + inv.total, 0);

            const exp = expenses
                .filter(e => {
                    try {
                        const d = new Date(e.date);
                        return isWithinInterval(d, { start, end }) && e.status === 'Approved';
                    } catch(e) { return false; }
                })
                .reduce((acc, e) => acc + e.amount, 0) +
                weeklyLogs
                .filter(l => {
                    try {
                        const parts = l.weekOf.split('-');
                        const d = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
                        return isWithinInterval(d, { start, end }) && l.status === 'Approved';
                    } catch(e) { return false; }
                })
                .reduce((acc, l) => acc + (l.totalPayout || 0), 0);

            data.push({ month: label, revenue: rev, expenses: exp });
        }
        return data;
    }, [invoices, expenses, weeklyLogs]);

    const userIsSuperAdmin = isSuperAdmin(currentUser);
    const allMissions = useMemo(() => [...workOrders, ...assignments], [workOrders, assignments]);

    const handleExpenseStatusChange = async (id: string, status: 'Approved' | 'Rejected') => {
        try {
            await updateDoc(doc(db, 'expenses', id), { status });
            toast({ title: `Expense ${status}`, description: `The expense has been successfully ${status.toLowerCase()}.` });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Update Failed", description: e.message });
        }
    };
    
    const getTechnicianName = (id: string) => technicians.find(t => t.id === id)?.name || 'Unknown';
    const getTechnician = (id: string) => technicians.find(t => t.id === id);
    const clientsList = technicians.filter(t => t.roles?.includes('client') || (t.role || '').toLowerCase().includes('client'));
    
    const handleSaveInvoice = async (savedInvoice: Invoice) => {
        try {
            const cleanedData = JSON.parse(JSON.stringify(savedInvoice));
            const { id, ...data } = cleanedData;

            if (id) {
                await setDoc(doc(db, 'invoices', id), cleanedData);
                toast({ title: 'Invoice Updated', description: `Invoice ${savedInvoice.invoiceNumber} has been successfully updated.` });
            } else {
                const newId = await createDocId(ID_PREFIXES.INVOICE);
                await setDoc(doc(db, 'invoices', newId), { ...data, id: newId });
                toast({ title: 'Invoice Created', description: `Invoice ${savedInvoice.invoiceNumber} has been successfully staged.` });
            }
            setIsInvoiceEditorOpen(false);
        } catch (e: any) {
            console.error("Financial registry write error:", e);
            toast({ variant: "destructive", title: "Save Failed", description: e.message });
        }
    };

    const handleReviewLog = (log: WeeklyLog) => {
        setSelectedLog(log);
        setIsReviewDialogOpen(true);
    };

    const handleUpdateLogStatus = useCallback((logId: string, status: WeeklyLog['status'], total?: number) => {
        toast({
            title: `Audit Finalized: ${status}`,
            description: `Manifest for log ${logId.split('-').pop()?.toUpperCase()} updated. Final settlement: $${total?.toFixed(2) || '0.00'}`
        });
        setIsReviewDialogOpen(false);
        setSelectedLog(null);
    }, [toast]);

    const handleExecuteExport = () => {
        if (exportConfig.types.length === 0) {
            toast({ variant: 'destructive', title: 'Export Configuration Error', description: 'Please select at least one data category.' });
            return;
        }

        const start = startOfDay(parseISO(exportConfig.from));
        const end = startOfDay(parseISO(exportConfig.to));

        const escapeCSV = (val: any) => {
            const str = String(val ?? "");
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const rows: string[][] = [
            ['TYPE', 'REFERENCE ID', 'DATE', 'ENTITY', 'DESCRIPTION', 'AMOUNT', 'STATUS']
        ];

        if (exportConfig.types.includes('invoices')) {
            invoices.forEach(inv => {
                const d = startOfDay(parseISO(inv.issueDate));
                if (isWithinInterval(d, { start, end })) {
                    rows.push(['INV', inv.invoiceNumber, inv.issueDate, inv.clientName, 'Invoice Settlement', inv.total.toString(), inv.status]);
                }
            });
        }

        if (exportConfig.types.includes('expenses')) {
            expenses.forEach(exp => {
                const d = startOfDay(parseISO(exp.date));
                if (isWithinInterval(d, { start, end })) {
                    rows.push(['EXP', exp.id, exp.date, exp.submittedBy, exp.description, exp.amount.toString(), exp.status]);
                }
            });
        }

        if (exportConfig.types.includes('payroll')) {
            weeklyLogs.forEach(log => {
                try {
                    const parts = log.weekOf.split('-');
                    const d = startOfDay(new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1])));
                    if (isWithinInterval(d, { start, end })) {
                        rows.push(['PAY', log.id, log.weekOf, getTechnicianName(log.techId), 'Weekly Log Payout', (log.totalPayout || 0).toString(), log.status]);
                    }
                } catch(e) {}
            });
        }

        if (rows.length === 1) {
            toast({ title: 'Export Terminal Empty', description: 'No records found matching the specified temporal window.' });
            return;
        }

        const csvContent = rows.map(r => r.map(escapeCSV).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Aaromach_General_Ledger_${exportConfig.from}_to_${exportConfig.to}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast({ title: 'Export Dispatched', description: 'General ledger manifest has been generated and transmitted.' });
        setIsExportDialogOpen(false);
    };

    const filteredWeeklyLogs = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return weeklyLogs.filter(log => (log.weekOf || '').includes(q) || getTechnicianName(log.techId).toLowerCase().includes(q));
    }, [weeklyLogs, searchQuery, technicians]);

    const filteredInvoices = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return invoices.filter(inv => (inv.invoiceNumber || '').toLowerCase().includes(q) || (inv.clientName || '').toLowerCase().includes(q));
    }, [invoices, searchQuery]);

    const filteredExpenses = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return expenses.filter(exp => (exp.description || '').toLowerCase().includes(q) || (exp.submittedBy || '').toLowerCase().includes(q) || (exp.category || '').toLowerCase().includes(q));
    }, [expenses, searchQuery]);

    return (
        <div className="text-left animate-in fade-in duration-700">
            <header className="page-header text-left">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <Banknote size={12} />
                        FINANCIAL OPERATIONS HUB
                    </p>
                    <h1 className="page-title">ACCOUNTING</h1>
                    <p className="page-subtitle text-left">Consolidated management of client revenue, technician payroll, and project overhead.</p>
                </div>
                <div className="page-header-right items-center">
                    <div className="search-wrap">
                        <Search />
                        <input className="search-input !w-full md:!w-[250px]" placeholder="Filter ledger data..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>
                    <Button variant="outline" onClick={() => setIsExportDialogOpen(true)} className="h-10 text-[10px]">⇩ EXPORT GENERAL LEDGER</Button>
                    <Button variant="secondary" onClick={() => setIsClosePeriodOpen(true)} className="h-10 text-[10px]">
                        {userIsSuperAdmin ? "CLOSE FISCAL PERIOD" : "REQUEST PERIOD CLOSURE"}
                    </Button>
                </div>
            </header>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full text-left">
                <div className="flex items-center justify-between gap-4">
                    <TabsList className="tabs !p-0 !bg-bg-tertiary">
                        <TabsTrigger value="summary" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">SUMMARY</TabsTrigger>
                        <TabsTrigger value="invoices" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">INVOICES</TabsTrigger>
                        <TabsTrigger value="logs" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">LOGS</TabsTrigger>
                        <TabsTrigger value="reimbursements" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">REIMBURSEMENTS</TabsTrigger>
                    </TabsList>
                    <button
                        onClick={() => router.push('/admin/payroll/audit')}
                        className="tab !px-8 !py-4 rounded-lg border border-border-main text-[10px] font-black uppercase tracking-widest transition-colors bg-bg-tertiary text-text-muted hover:text-text-primary hover:bg-bg-primary"
                    >
                        PAYROLL AUDIT ↗
                    </button>
                </div>
                
                <div className="mt-6 text-left">
                    <TabsContent value="summary" className="m-0 space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {stats.map((metric, index) => (
                                <Card key={index} className="bg-bg-tertiary border-border-subtle shadow-sm hover:border-text-muted transition-colors">
                                    <CardHeader className="pb-4">
                                        <div className="flex justify-between items-start">
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">{metric.title}</span>
                                            <metric.TrendIcon size={16} className={cn(
                                                metric.trendType === 'positive' ? 'text-text-green' :
                                                metric.trendType === 'negative' ? 'text-text-red' :
                                                'text-accent-gold'
                                            )} />
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className={cn("text-3xl font-mono font-bold tabular-nums",
                                            metric.trendType === 'negative' ? 'text-text-red' :
                                            metric.trendType === 'warning' ? 'text-accent-gold' :
                                            'text-text-primary'
                                        )}>
                                            {metric.value}
                                        </p>
                                        <p className={cn("text-[9px] font-black tracking-widest uppercase mt-3",
                                            metric.trendType === 'positive' ? 'text-text-green' : 'text-text-muted'
                                        )}>
                                            {metric.trend}
                                        </p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        <Card className="bg-bg-secondary border-border-main shadow-xl overflow-hidden">
                            <CardHeader className="border-b border-border-sub bg-bg-tertiary/20">
                                <div className="flex items-center justify-between">
                                    <div className="text-left">
                                        <CardTitle className="text-base">Strategic Cash Flow Analysis</CardTitle>
                                        <CardDescription className="text-[10px] uppercase font-bold text-text-muted">Monthly comparison of realized revenue vs field operational expenses.</CardDescription>
                                    </div>
                                    <Badge variant="outline" className="bg-bg-primary text-[8px] uppercase tracking-widest">Rolling 6-Month Audit</Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-8">
                                <RevenueChart data={chartData} />
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="logs" className="m-0">
                        <Card>
                            <CardHeader className="text-left">
                                <CardTitle>Weekly Logs</CardTitle>
                                <CardDescription>Submitted logs from field operatives. Filter by status to review and audit.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Tabs defaultValue="Submitted" className="w-full">
                                    <TabsList className="tabs !rounded-none border-b border-border-sub !bg-transparent !p-0 w-full justify-start">
                                        {(['Submitted', 'Approved', 'Rejected'] as const).map(status => (
                                            <TabsTrigger key={status} value={status} className="tab !px-6 !py-3 data-[state=active]:bg-brand-red data-[state=active]:text-white">
                                                {status} <span className="ml-1.5 text-[8px]">({filteredWeeklyLogs.filter(l => l.status === status).length})</span>
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>
                                    {(['Submitted', 'Approved', 'Rejected'] as const).map(status => (
                                        <TabsContent key={status} value={status} className="m-0">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="hover:bg-transparent border-border-sub">
                                                        <TableHead className="text-[10px] uppercase font-bold tracking-widest pl-6">Week Of</TableHead>
                                                        <TableHead className="text-[10px] uppercase font-bold tracking-widest">Technician</TableHead>
                                                        <TableHead className="text-[10px] uppercase font-bold tracking-widest">Status</TableHead>
                                                        <TableHead className="text-[10px] uppercase font-bold tracking-widest text-center">Requests</TableHead>
                                                        <TableHead className="text-[10px] uppercase font-bold tracking-widest">Payout</TableHead>
                                                        <TableHead className="text-right pr-6"></TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {filteredWeeklyLogs.filter(l => l.status === status).map(log => (
                                                        <TableRow key={log.id} className="border-border-sub hover:bg-bg-tertiary transition-colors">
                                                            <TableCell className="font-bold uppercase text-xs pl-6">{log.weekOf}</TableCell>
                                                            <TableCell className="text-sm font-semibold uppercase">{getTechnicianName(log.techId)}</TableCell>
                                                            <TableCell>
                                                                <Badge variant={log.status === 'Approved' ? 'active' : log.status === 'Submitted' ? 'onhold' : 'pending'} className="uppercase text-[8px] h-4">
                                                                    {log.status}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                {log.unsubmitRequested && (
                                                                    <Badge variant="destructive" className="uppercase text-[7px] h-4 animate-pulse">
                                                                        <Undo2 size={8} className="mr-1"/> Unsubmit
                                                                    </Badge>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="font-mono text-text-green font-bold tabular-nums">{log.totalPayout ? `$${log.totalPayout.toFixed(2)}` : 'N/A'}</TableCell>
                                                            <TableCell className="text-right pr-6">
                                                                <Button variant="outline" size="sm" className="h-7 text-[10px] uppercase font-bold" onClick={() => handleReviewLog(log)}>Audit Log</Button>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TabsContent>
                                    ))}
                                </Tabs>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="invoices" className="m-0">
                         <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div className="text-left">
                                    <CardTitle>Client Invoices</CardTitle>
                                    <CardDescription>Manage and track all client invoices.</CardDescription>
                                </div>
                                <Button onClick={() => { setSelectedInvoice(null); setIsInvoiceEditorOpen(true); }} className="h-9 px-6"><Plus size={14} className="mr-2"/>Create New Invoice</Button>
                            </CardHeader>
                            <CardContent className="table-wrap p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent border-border-sub">
                                            <TableHead className="text-[10px] uppercase font-bold tracking-widest pl-6">Invoice #</TableHead>
                                            <TableHead className="text-[10px] uppercase font-bold tracking-widest">Client</TableHead>
                                            <TableHead className="text-[10px] uppercase font-bold tracking-widest">Due Date</TableHead>
                                            <TableHead className="text-[10px] uppercase font-bold tracking-widest">Total</TableHead>
                                            <TableHead className="text-[10px] uppercase font-bold tracking-widest">Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredInvoices.map((invoice) => (
                                            <TableRow key={invoice.id} onClick={() => { setSelectedInvoice(invoice); setIsInvoiceEditorOpen(true); }} className="cursor-pointer border-border-sub hover:bg-bg-tertiary transition-colors text-left">
                                                <TableCell className="font-mono font-bold text-brand-red text-xs pl-6">{invoice.invoiceNumber}</TableCell>
                                                <TableCell className="text-sm font-semibold uppercase">{invoice.clientName}</TableCell>
                                                <TableCell className="text-xs text-text-muted">{invoice.dueDate}</TableCell>
                                                <TableCell className="font-mono text-sm font-bold text-text-primary tabular-nums">${invoice.total.toFixed(2)}</TableCell>
                                                <TableCell>
                                                    <Badge variant={invoice.status === 'paid' ? 'active' : invoice.status === 'sent' ? 'onhold' : 'pending'} className="capitalize text-[8px] h-4">{invoice.status}</Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="reimbursements" className="m-0 space-y-6">
                        <Card>
                            <CardHeader className="text-left">
                                <CardTitle>Expense Submissions</CardTitle>
                                <CardDescription>Review and approve submitted technician reimbursement requests.</CardDescription>
                            </CardHeader>
                            <CardContent className="table-wrap p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent border-border-sub">
                                            <TableHead className="text-[10px] uppercase font-bold tracking-widest pl-6">Date</TableHead>
                                            <TableHead className="text-[10px] uppercase font-bold tracking-widest">Submitted By</TableHead>
                                            <TableHead className="text-[10px] uppercase font-bold tracking-widest">Description</TableHead>
                                            <TableHead className="text-[10px] uppercase font-bold tracking-widest">Amount</TableHead>
                                            <TableHead className="text-[10px] uppercase font-bold tracking-widest">Status</TableHead>
                                            <TableHead className="text-right pr-6"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredExpenses.map((expense) => (
                                            <TableRow key={expense.id} className="border-border-sub hover:bg-bg-tertiary transition-colors text-left">
                                                <TableCell className="text-xs text-text-muted pl-6">{expense.date}</TableCell>
                                                <TableCell className="text-sm font-semibold uppercase">{expense.submittedBy}</TableCell>
                                                <TableCell>
                                                    <div className="font-bold text-text-primary text-xs uppercase">{expense.description}</div>
                                                    <div className="text-[10px] text-text-muted uppercase font-bold tracking-tight">{expense.category}</div>
                                                </TableCell>
                                                <TableCell className="font-mono text-sm font-bold text-text-primary tabular-nums">${expense.amount.toFixed(2)}</TableCell>
                                                <TableCell><Badge variant={expense.status === 'Approved' ? 'active' : expense.status === 'Pending' ? 'onhold' : 'missed'} className="text-[8px] h-4 uppercase">{expense.status}</Badge></TableCell>
                                                <TableCell className="text-right pr-6">
                                                     {expense.status === 'Pending' && (
                                                        <div className="flex gap-2 justify-end">
                                                            <Button size="sm" variant="destructive-outline" className="h-7 text-[9px]" onClick={() => handleExpenseStatusChange(expense.id, 'Rejected')}>Deny</Button>
                                                            <Button size="sm" className="h-7 text-[9px]" onClick={() => handleExpenseStatusChange(expense.id, 'Approved')}>Approve</Button>
                                                        </div>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="text-left">
                                <CardTitle className="flex items-center gap-2">
                                    <Car size={16} className="text-brand-red" />
                                    Mileage Logs
                                </CardTitle>
                                <CardDescription>Review and approve technician trip mileage for reimbursement.</CardDescription>
                            </CardHeader>
                            <CardContent className="table-wrap p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent border-border-sub">
                                            <TableHead className="text-[10px] uppercase font-bold tracking-widest pl-6">Date</TableHead>
                                            <TableHead className="text-[10px] uppercase font-bold tracking-widest">Technician</TableHead>
                                            <TableHead className="text-[10px] uppercase font-bold tracking-widest">Route</TableHead>
                                            <TableHead className="text-[10px] uppercase font-bold tracking-widest">Miles</TableHead>
                                            <TableHead className="text-[10px] uppercase font-bold tracking-widest">Purpose</TableHead>
                                            <TableHead className="text-[10px] uppercase font-bold tracking-widest">Reimb.</TableHead>
                                            <TableHead className="text-[10px] uppercase font-bold tracking-widest">Status</TableHead>
                                            <TableHead className="text-right pr-6"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {tripLogs.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="text-center py-12 text-xs text-text-muted uppercase tracking-widest">
                                                    No mileage logs recorded yet.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            [...tripLogs]
                                                .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                                                .map((trip) => (
                                                    <TableRow key={trip.id} className="border-border-sub hover:bg-bg-tertiary transition-colors text-left">
                                                        <TableCell className="text-xs text-text-muted pl-6">{trip.date}</TableCell>
                                                        <TableCell className="text-xs font-bold uppercase">{trip.technicianName || trip.technicianId.slice(0, 8)}</TableCell>
                                                        <TableCell className="text-xs text-text-muted">
                                                            <div className="flex items-center gap-1 text-[10px] text-text-muted">
                                                                <Navigation size={9} />
                                                                <span className="truncate max-w-[120px]">{trip.startLocation}</span>
                                                                <span>→</span>
                                                                <span className="truncate max-w-[120px]">{trip.endLocation}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="font-mono text-sm font-bold tabular-nums">{trip.miles.toFixed(1)}</TableCell>
                                                        <TableCell className="text-xs text-text-muted max-w-[160px] truncate">{trip.purpose || '—'}</TableCell>
                                                        <TableCell>
                                                            <Badge variant={trip.reimbursable ? 'active' : 'default'} className="text-[8px] h-4 uppercase">
                                                                {trip.reimbursable ? 'Yes' : 'No'}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge
                                                                variant={trip.status === 'approved' ? 'completed' : trip.status === 'rejected' ? 'missed' : 'scheduled'}
                                                                className="text-[8px] h-4 uppercase"
                                                            >
                                                                {trip.status}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right pr-6">
                                                            {trip.status === 'pending' && trip.reimbursable && (
                                                                <div className="flex gap-2 justify-end">
                                                                    <Button
                                                                        size="sm"
                                                                        variant="destructive-outline"
                                                                        className="h-7 text-[9px]"
                                                                        onClick={async () => {
                                                                            try {
                                                                                await updateDoc(doc(db, 'tripLogs', trip.id), { status: 'rejected' });
                                                                                toast({ title: 'Trip rejected' });
                                                                            } catch { toast({ title: 'Error', variant: 'destructive' }); }
                                                                        }}
                                                                    >Deny</Button>
                                                                    <Button
                                                                        size="sm"
                                                                        className="h-7 text-[9px] bg-brand-red hover:bg-brand-red/90 text-white"
                                                                        onClick={async () => {
                                                                            try {
                                                                                await updateDoc(doc(db, 'tripLogs', trip.id), { status: 'approved' });
                                                                                toast({ title: 'Trip approved' });
                                                                            } catch { toast({ title: 'Error', variant: 'destructive' }); }
                                                                        }}
                                                                    >Approve</Button>
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </div>
            </Tabs>

            {/* PERIOD CLOSURE TERMINAL */}
            <Dialog open={isClosePeriodOpen} onOpenChange={setIsClosePeriodOpen}>
                <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default flex flex-col p-0 overflow-hidden shadow-2xl">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30 text-left">
                        <div className="flex items-center gap-2 mb-1">
                            <ShieldAlert className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest">
                                {userIsSuperAdmin ? "Authorize Fiscal Closure" : "Request Period Closure"}
                            </DialogTitle>
                        </div>
                        <DialogDescription className="text-xs">
                            {userIsSuperAdmin ? "This action permanently locks the general ledger for the current period." : "You are submitting a closure request for Super Admin authorization."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="p-6 space-y-6">
                        <div className="p-4 rounded-lg bg-brand-red-dim/10 border border-brand-red/30 space-y-2 text-left">
                            <p className="text-[10px] font-black text-brand-red uppercase tracking-widest mb-1">Safety Lock Required</p>
                            <p className="text-[11px] text-text-secondary leading-relaxed uppercase font-medium">Closing the period transitions all financial records to read-only archival state.</p>
                        </div>
                        {userIsSuperAdmin ? (
                            <div className="space-y-3 pt-2 text-left">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Type <span className="text-text-primary">CLOSE</span> to confirm terminal lock</Label>
                                <Input placeholder="Type 'CLOSE'..." value={confirmationText} onChange={(e) => setConfirmationText(e.target.value)} className="h-11 bg-bg-primary text-center font-mono text-sm tracking-widest uppercase font-bold" />
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 p-4 rounded-lg bg-bg-secondary border border-border-sub">
                                <Info size={16} className="text-text-muted" />
                                <p className="text-[10px] text-text-muted uppercase font-bold leading-tight">Your account level requires external sign-off from a Super Admin to finalize closure.</p>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default flex gap-3">
                        <Button variant="outline" onClick={() => { setIsClosePeriodOpen(false); setConfirmationText(""); }} className="flex-1 uppercase font-bold text-[10px] tracking-widest h-11">Cancel</Button>
                        <Button onClick={() => { toast({ title: userIsSuperAdmin ? "Period Finalized" : "Request Sent" }); setIsClosePeriodOpen(false); }} disabled={userIsSuperAdmin && confirmationText !== "CLOSE"} className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest h-11">
                            {userIsSuperAdmin ? "Execute Global Lock" : "Submit Request"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* EXPORT CONFIGURATION TERMINAL */}
            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
                <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default flex flex-col p-0 overflow-hidden shadow-2xl">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30 text-left">
                        <div className="flex items-center gap-2 mb-1">
                            <Download className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest">General Ledger Export</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs uppercase font-bold text-text-muted">Configure the parameters for your financial data extraction.</DialogDescription>
                    </DialogHeader>
                    <div className="p-6 space-y-6 text-left">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">From Date</Label>
                                <Input type="date" value={exportConfig.from} onChange={e => setExportConfig({...exportConfig, from: e.target.value})} className="h-10 bg-bg-primary text-xs" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">To Date</Label>
                                <Input type="date" value={exportConfig.to} onChange={e => setExportConfig({...exportConfig, to: e.target.value})} className="h-10 bg-bg-primary text-xs" />
                            </div>
                        </div>
                        <div className="space-y-3">
                            <Label className="text-[10px] uppercase font-bold text-text-muted">Manifest Categories</Label>
                            <div className="space-y-2">
                                {[
                                    { id: 'invoices', label: 'Client Invoices' },
                                    { id: 'expenses', label: 'Field Expenses' },
                                    { id: 'payroll', label: 'Operative Payroll' }
                                ].map(type => (
                                    <div key={type.id} className="flex items-center space-x-3 p-3 rounded-lg border border-border-sub bg-bg-primary hover:border-brand-red transition-all cursor-pointer" onClick={() => {
                                        setExportConfig(prev => ({
                                            ...prev,
                                            types: prev.types.includes(type.id) ? prev.types.filter(t => t !== type.id) : [...prev.types, type.id]
                                        }));
                                    }}>
                                        <Checkbox checked={exportConfig.types.includes(type.id)} className="h-4 w-4" />
                                        <span className="text-xs font-bold uppercase tracking-wide text-text-primary">{type.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default flex gap-3">
                        <Button variant="outline" onClick={() => setIsExportDialogOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest h-11">Abort</Button>
                        <Button onClick={handleExecuteExport} className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest h-11 text-white">Execute Export</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <InvoiceEditor isOpen={isInvoiceEditorOpen} setIsOpen={setIsInvoiceEditorOpen} invoice={selectedInvoice} clients={clientsList} projects={projects} workOrders={allMissions} onSave={handleSaveInvoice} />
            {selectedLog && <PayrollReviewDialog isOpen={isReviewDialogOpen} setIsOpen={setIsReviewDialogOpen} log={selectedLog} technician={getTechnician(selectedLog.techId)} missions={allMissions} onStatusChange={handleUpdateLogStatus} />}
        </div>
    );
}
