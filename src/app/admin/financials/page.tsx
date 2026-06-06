'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Banknote, ArrowUpRight, ArrowDownRight, Minus, Download, FileText, BarChart, FileWarning, Plus, Calendar as CalendarIcon, Check, X, ShieldAlert, Search, Info, Undo2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Expense, Invoice, WeeklyLog, Technician, WorkOrder } from '@/lib/types';
import { InvoiceEditor } from './components/invoice-editor';
import { PayrollReviewDialog } from './components/payroll-review-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { isSuperAdmin } from '@/lib/permissions';
import { useSearchParams } from 'next/navigation';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, doc, updateDoc, setDoc, addDoc } from 'firebase/firestore';

const financialMetrics = [
    { title: "TOTAL REVENUE (MTD)", value: "$42,850.00", trend: "+12.4% VS LAST MONTH", trendType: "positive" as const, TrendIcon: ArrowUpRight },
    { title: "PENDING PAYOUTS", value: "$12,450.00", trend: "ACROSS 8 TECHNICIANS", trendType: "negative" as const, TrendIcon: ArrowDownRight },
    { title: "OUTSTANDING A/R", value: "$8,920.00", trend: "NOMINAL STATUS", trendType: "warning" as const, TrendIcon: Minus },
    { title: "SERVICE MARGIN", value: "32.8%", trend: "NOMINAL THRESHOLD: 25%", trendType: "positive" as const, TrendIcon: ArrowUpRight },
];

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
    
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'summary');

    const [isInvoiceEditorOpen, setIsInvoiceEditorOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [selectedLog, setSelectedLog] = useState<WeeklyLog | null>(null);
    const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
    
    // Period Closure State
    const [isClosePeriodOpen, setIsClosePeriodOpen] = useState(false);
    const [confirmationText, setConfirmationText] = useState("");
    
    // Export State
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [exportConfig, setExportConfig] = useState({
        from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0],
        types: ['invoices', 'expenses', 'payroll']
    });

    const { toast } = useToast();

    // 1. Initialize Registry Listeners
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

        const userId = localStorage.getItem('currentUserId');
        if (userId) {
            const unsubUser = onSnapshot(doc(db, 'users', userId), (d) => {
                if (d.exists()) setCurrentUser({ ...d.data(), id: d.id } as Technician);
            });
            return () => {
                unsubExp(); unsubInv(); unsubLog(); unsubTech(); unsubProj(); unsubWO(); unsubAsmt(); unsubUser();
            };
        }

        return () => {
            unsubExp(); unsubInv(); unsubLog(); unsubTech(); unsubProj(); unsubWO(); unsubAsmt();
        };
    }, []);

    const userIsSuperAdmin = isSuperAdmin(currentUser);

    const allMissions = useMemo(() => [...workOrders, ...assignments], [workOrders, assignments]);

    const handleExpenseStatusChange = async (id: string, status: 'Approved' | 'Rejected') => {
        try {
            await updateDoc(doc(db, 'expenses', id), { status });
            toast({
                title: `Expense ${status}`,
                description: `The expense has been successfully ${status.toLowerCase()}.`,
            });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Update Failed", description: e.message });
        }
    };
    
    const getTechnicianName = (id: string) => technicians.find(t => t.id === id)?.name || 'Unknown';
    const getTechnician = (id: string) => technicians.find(t => t.id === id);

    const clients = technicians.filter(t => t.roles?.includes('client') || (t.role || '').toLowerCase().includes('client'));
    
    const handleCreateNewInvoice = () => {
        setSelectedInvoice(null);
        setIsInvoiceEditorOpen(true);
    };

    const handleEditInvoice = (invoice: Invoice) => {
        setSelectedInvoice(invoice);
        setIsInvoiceEditorOpen(true);
    };
    
    const handleSaveInvoice = async (savedInvoice: Invoice) => {
        try {
            if (savedInvoice.id) {
                await setDoc(doc(db, 'invoices', savedInvoice.id), savedInvoice);
                toast({ title: 'Invoice Updated', description: `Invoice ${savedInvoice.invoiceNumber} has been successfully updated.` });
            } else {
                const docRef = await addDoc(collection(db, 'invoices'), savedInvoice);
                toast({ title: 'Invoice Created', description: `Invoice ${savedInvoice.invoiceNumber} has been successfully staged.` });
            }
            setIsInvoiceEditorOpen(false);
        } catch (e: any) {
            toast({ variant: "destructive", title: "Save Failed", description: e.message });
        }
    };

    const getInvoiceStatusVariant = (status: Invoice['status']) => {
        switch (status) {
            case 'paid': return 'active';
            case 'sent': return 'onhold';
            case 'overdue': return 'missed';
            case 'draft': return 'pending';
            case 'void': return 'outline';
            default: return 'outline';
        }
    };
    
    const handleReviewLog = (log: WeeklyLog) => {
        setSelectedLog(log);
        setIsReviewDialogOpen(true);
    };
    
    const handleUpdateLogStatus = async (logId: string, status: WeeklyLog['status'], total?: number) => {
        try {
            const updates: any = { status };
            if (total !== undefined) updates.totalPayout = total;
            await updateDoc(doc(db, 'weeklyLogs', logId), updates);
            toast({
                title: `Log ${status}`,
                description: `The weekly log has been ${status.toLowerCase()}.`,
            });
            setIsReviewDialogOpen(false);
        } catch (e: any) {
            toast({ variant: "destructive", title: "Update Failed", description: e.message });
        }
    };

    const handleExecuteClosePeriod = () => {
        if (!userIsSuperAdmin) {
            toast({
                title: "Closure Request Transmitted",
                description: "Request to lock fiscal period sent to Super Admin registry for final sign-off.",
            });
        } else {
            toast({
                title: "Fiscal Period Finalized",
                description: "General ledger successfully locked. All financial records transitioned to read-only archival state.",
            });
        }
        setIsClosePeriodOpen(false);
        setConfirmationText("");
    };

    const handleExecuteExport = () => {
        if (exportConfig.types.length === 0) {
            toast({ variant: 'destructive', title: 'Export Configuration Error', description: 'Please select at least one data category to export.' });
            return;
        }
        toast({ 
            title: 'General Ledger Exported', 
            description: `Audit file containing ${exportConfig.types.join(', ')} from ${exportConfig.from} to ${exportConfig.to} generated.` 
        });
        setIsExportDialogOpen(false);
    };

    const filteredWeeklyLogs = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return weeklyLogs.filter(log => 
            (log.weekOf || '').includes(q) || 
            getTechnicianName(log.technicianId).toLowerCase().includes(q)
        );
    }, [weeklyLogs, searchQuery, technicians]);

    const filteredInvoices = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return invoices.filter(inv => 
            (inv.invoiceNumber || '').toLowerCase().includes(q) || 
            (inv.clientName || '').toLowerCase().includes(q)
        );
    }, [invoices, searchQuery]);

    const filteredExpenses = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return expenses.filter(exp => 
            (exp.description || '').toLowerCase().includes(q) || 
            (exp.submittedBy || '').toLowerCase().includes(q) ||
            (exp.category || '').toLowerCase().includes(q)
        );
    }, [expenses, searchQuery]);


    return (
        <div>
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
                        <input 
                            className="search-input !w-full md:!w-[250px]" 
                            placeholder="Filter ledger data..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <Button variant="outline" onClick={() => setIsExportDialogOpen(true)} className="h-10 text-[10px]">⇩ EXPORT GENERAL LEDGER</Button>
                    <Button variant="secondary" onClick={() => setIsClosePeriodOpen(true)} className="h-10 text-[10px]">
                        {userIsSuperAdmin ? "CLOSE FISCAL PERIOD" : "REQUEST PERIOD CLOSURE"}
                    </Button>
                </div>
            </header>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="tabs !p-0 !bg-bg-tertiary">
                    <TabsTrigger value="summary" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">SUMMARY</TabsTrigger>
                    <TabsTrigger value="payroll" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">PAYROLL AUDIT</TabsTrigger>
                    <TabsTrigger value="invoices" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">INVOICES</TabsTrigger>
                    <TabsTrigger value="expenses" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">EXPENSES</TabsTrigger>
                </TabsList>
                
                <div className="mt-6">
                    <TabsContent value="summary">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {financialMetrics.map((metric, index) => (
                                <Card key={index} className="bg-bg-tertiary border-border-subtle">
                                    <CardHeader className="pb-4">
                                        <div className="flex justify-between items-start">
                                            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">{metric.title}</span>
                                            <metric.TrendIcon size={16} className={
                                                metric.trendType === 'positive' ? 'text-text-green' :
                                                metric.trendType === 'negative' ? 'text-text-red' :
                                                'text-accent-gold'
                                            } />
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className={`text-4xl font-bold 
                                            ${metric.trendType === 'negative' ? 'text-text-red' :
                                              metric.trendType === 'warning' ? 'text-accent-gold' :
                                              'text-text-primary'}`
                                        }>
                                            {metric.value}
                                        </p>
                                        <p className={`text-xs font-semibold tracking-wider uppercase mt-2 
                                            ${metric.trendType === 'positive' ? 'text-text-green' :
                                              'text-text-muted'}`
                                        }>
                                            {metric.trend}
                                        </p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </TabsContent>
                    <TabsContent value="payroll">
                        <Card>
                            <CardHeader className="text-left">
                                <CardTitle>Payroll Audit</CardTitle>
                                <CardDescription>Review submitted weekly logs from technicians for approval.</CardDescription>
                            </CardHeader>
                            <CardContent className="table-wrap p-0">
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
                                        {filteredWeeklyLogs.map(log => (
                                            <TableRow key={log.id} className="border-border-sub hover:bg-bg-tertiary transition-colors">
                                                <TableCell className="font-bold uppercase text-xs pl-6">{log.weekOf}</TableCell>
                                                <TableCell className="text-sm font-semibold">{getTechnicianName(log.technicianId)}</TableCell>
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
                                                <TableCell className="font-mono text-text-green font-bold">{log.totalPayout ? `$${log.totalPayout.toFixed(2)}` : 'N/A'}</TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <Button variant="outline" size="sm" className="h-7 text-[10px] uppercase font-bold" onClick={() => handleReviewLog(log)}>Review Log</Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="invoices">
                         <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div className="text-left">
                                    <CardTitle>Client Invoices</CardTitle>
                                    <CardDescription>Manage and track all client invoices.</CardDescription>
                                </div>
                                <Button onClick={handleCreateNewInvoice} className="h-9 px-6"><Plus size={14} className="mr-2"/>Create New Invoice</Button>
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
                                            <TableRow key={invoice.id} onClick={() => handleEditInvoice(invoice)} className="cursor-pointer border-border-sub hover:bg-bg-tertiary transition-colors text-left">
                                                <TableCell className="font-mono font-bold text-brand-red text-xs pl-6">{invoice.invoiceNumber}</TableCell>
                                                <TableCell className="text-sm font-semibold uppercase">{invoice.clientName}</TableCell>
                                                <TableCell className="text-xs text-text-muted">{invoice.dueDate}</TableCell>
                                                <TableCell className="font-mono text-sm font-bold text-text-primary">${invoice.total.toFixed(2)}</TableCell>
                                                <TableCell>
                                                    <Badge variant={getInvoiceStatusVariant(invoice.status)} className="capitalize text-[8px] h-4">{invoice.status}</Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="expenses">
                        <Card>
                            <CardHeader className="text-left">
                                <CardTitle>Expense Submissions</CardTitle>
                                <CardDescription>Review and approve submitted technician expenses.</CardDescription>
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
                                                    <div className="text-[10px] text-text-muted uppercase font-bold">{expense.category}</div>
                                                </TableCell>
                                                <TableCell className="font-mono text-sm font-bold text-text-primary">${expense.amount.toFixed(2)}</TableCell>
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
                    </TabsContent>
                </div>
            </Tabs>

            {/* FISCAL PERIOD CLOSURE TERMINAL */}
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
                            {userIsSuperAdmin 
                                ? "This action permanently locks the general ledger for the current period. Irreversible operation."
                                : "You are submitting a closure request to the command hierarchy for Super Admin authorization."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-6 space-y-6">
                        <div className="p-4 rounded-lg bg-brand-red-dim/10 border border-brand-red/30 space-y-2 text-left">
                            <p className="text-[10px] font-black text-brand-red uppercase tracking-widest">Tactical Warning</p>
                            <p className="text-[11px] text-text-secondary leading-relaxed uppercase font-medium">
                                Closing the period transitions all financial records (Invoices, Expenses, Payroll) to a read-only archival state.
                            </p>
                        </div>

                        {userIsSuperAdmin ? (
                            <div className="space-y-3 pt-2 text-left">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Type <span className="text-text-primary">CLOSE</span> to confirm terminal lock</Label>
                                <Input 
                                    placeholder="Type 'CLOSE'..." 
                                    value={confirmationText}
                                    onChange={(e) => setConfirmationText(e.target.value)}
                                    className="h-11 bg-bg-primary border-border-sub text-center font-mono text-sm tracking-widest uppercase font-bold"
                                />
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 p-4 rounded-lg bg-bg-secondary border border-border-sub">
                                <Info size={16} className="text-text-muted" />
                                <p className="text-[10px] text-text-muted uppercase font-bold leading-tight">
                                    Your account level requires external sign-off from a Super Admin to finalize closure.
                                </p>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default flex gap-3">
                        <Button variant="outline" onClick={() => { setIsClosePeriodOpen(false); setConfirmationText(""); }} className="flex-1 uppercase font-bold text-[10px] tracking-widest h-11">
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleExecuteClosePeriod} 
                            disabled={userIsSuperAdmin && confirmationText !== "CLOSE"}
                            className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest h-11"
                        >
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
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest">Audit Export Configuration</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs">Define temporal parameters and tactical categories for general ledger generation.</DialogDescription>
                    </DialogHeader>

                    <div className="p-6 space-y-8">
                        {/* Temporal Window */}
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-brand-red uppercase tracking-[0.2em] border-b border-border-sub pb-1.5 px-1 text-left">Temporal Audit Window</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest flex items-center gap-1.5">
                                        <CalendarIcon size={12} /> From
                                    </Label>
                                    <Input 
                                        type="date" 
                                        value={exportConfig.from}
                                        onChange={e => setExportConfig({...exportConfig, from: e.target.value})}
                                        className="h-10 bg-bg-primary border-border-sub text-xs"
                                    />
                                </div>
                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest flex items-center gap-1.5">
                                        <CalendarIcon size={12} /> To
                                    </Label>
                                    <Input 
                                        type="date" 
                                        value={exportConfig.to}
                                        onChange={e => setExportConfig({...exportConfig, to: e.target.value})}
                                        className="h-10 bg-bg-primary border-border-sub text-xs"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="bg-bg-tertiary/50 p-6 border-t border-border-default flex gap-3">
                        <Button variant="outline" onClick={() => setIsExportDialogOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest h-11">
                            Cancel
                        </Button>
                        <Button onClick={handleExecuteExport} className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest h-11">
                            <Check size={16} className="mr-2" /> Execute Audit Export
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <InvoiceEditor
                isOpen={isInvoiceEditorOpen}
                setIsOpen={setIsInvoiceEditorOpen}
                invoice={selectedInvoice}
                clients={clients}
                projects={projects}
                workOrders={allMissions}
                onSave={handleSaveInvoice}
            />
            {selectedLog && (
                <PayrollReviewDialog
                    isOpen={isReviewDialogOpen}
                    setIsOpen={setIsReviewDialogOpen}
                    log={selectedLog}
                    technician={getTechnician(selectedLog.technicianId)}
                    missions={allMissions}
                    onStatusChange={handleUpdateLogStatus}
                />
            )}
        </div>
    );
}
