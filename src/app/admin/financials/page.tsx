
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Banknote, ArrowUpRight, ArrowDownRight, Minus, Download, FileText, BarChart, FileWarning, Plus, Calendar as CalendarIcon, Check, X, ShieldAlert, Search, Info } from "lucide-react";
import { expenses as initialExpenses, reports, weeklyLogs as initialWeeklyLogs, technicians, invoices as initialInvoices, projects, workOrders } from '@/lib/data';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Expense, Invoice, WeeklyLog, Technician } from '@/lib/types';
import { InvoiceEditor } from './components/invoice-editor';
import { PayrollReviewDialog } from './components/payroll-review-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { isSuperAdmin } from '@/lib/permissions';

const financialMetrics = [
    { title: "TOTAL REVENUE (MTD)", value: "$42,850.00", trend: "+12.4% VS LAST MONTH", trendType: "positive" as const, TrendIcon: ArrowUpRight },
    { title: "PENDING PAYOUTS", value: "$12,450.00", trend: "ACROSS 8 TECHNICIANS", trendType: "negative" as const, TrendIcon: ArrowDownRight },
    { title: "OUTSTANDING A/R", value: "$8,920.00", trend: "NOMINAL STATUS", trendType: "warning" as const, TrendIcon: Minus },
    { title: "SERVICE MARGIN", value: "32.8%", trend: "NOMINAL THRESHOLD: 25%", trendType: "positive" as const, TrendIcon: ArrowUpRight },
];

export default function FinancialsPage() {
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [expenses, setExpenses] = useState(initialExpenses);
    const [invoices, setInvoices] = useState(initialInvoices);
    const [weeklyLogs, setWeeklyLogs] = useState(initialWeeklyLogs);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState("summary");

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

    useEffect(() => {
        const userId = localStorage.getItem('currentUserId');
        if (userId) {
            setCurrentUser(technicians.find(t => t.id === userId) || null);
        }
    }, []);

    const userIsSuperAdmin = isSuperAdmin(currentUser);

    const handleExpenseStatusChange = (id: string, status: 'Approved' | 'Rejected') => {
        setExpenses(currentExpenses =>
            currentExpenses.map(exp => (exp.id === id ? { ...exp, status } : exp))
        );
        toast({
            title: `Expense ${status}`,
            description: `The expense has been successfully ${status.toLowerCase()}.`,
        });
    };
    
    const getTechnicianName = (id: string) => technicians.find(t => t.id === id)?.name || 'Unknown';
    const getTechnician = (id: string) => technicians.find(t => t.id === id);


    const clients = technicians.filter(t => t.roles?.includes('client') || t.role.toLowerCase().includes('client'));
    
    const handleCreateNewInvoice = () => {
        setSelectedInvoice(null);
        setIsInvoiceEditorOpen(true);
    };

    const handleEditInvoice = (invoice: Invoice) => {
        setSelectedInvoice(invoice);
        setIsInvoiceEditorOpen(true);
    };
    
    const handleSaveInvoice = (savedInvoice: Invoice) => {
        const isNew = !savedInvoice.id || !invoices.some(inv => inv.id === savedInvoice.id);
        if (isNew) {
            const newInvoiceWithId = { ...savedInvoice, id: `inv-${Date.now()}`};
            setInvoices(current => [newInvoiceWithId, ...current]);
             toast({ title: 'Invoice Created', description: `Invoice ${newInvoiceWithId.invoiceNumber} has been successfully created.` });
        } else {
            setInvoices(current => current.map(inv => inv.id === savedInvoice.id ? savedInvoice : inv));
            toast({ title: 'Invoice Updated', description: `Invoice ${savedInvoice.invoiceNumber} has been successfully updated.` });
        }
        setIsInvoiceEditorOpen(false);
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
    
    const handleUpdateLogStatus = (logId: string, status: WeeklyLog['status']) => {
        setWeeklyLogs(currentLogs =>
            currentLogs.map(log =>
                log.id === logId ? { ...log, status } : log
            )
        );
        toast({
            title: `Log ${status}`,
            description: `The weekly log has been ${status.toLowerCase()}.`,
        });
        setIsReviewDialogOpen(false);
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

    const toggleExportType = (type: string) => {
        setExportConfig(prev => ({
            ...prev,
            types: prev.types.includes(type) 
                ? prev.types.filter(t => t !== type) 
                : [...prev.types, type]
        }));
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
            log.weekOf.includes(q) || 
            getTechnicianName(log.technicianId).toLowerCase().includes(q)
        );
    }, [weeklyLogs, searchQuery]);

    const filteredInvoices = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return invoices.filter(inv => 
            inv.invoiceNumber.toLowerCase().includes(q) || 
            inv.clientName.toLowerCase().includes(q)
        );
    }, [invoices, searchQuery]);

    const filteredExpenses = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return expenses.filter(exp => 
            exp.description.toLowerCase().includes(q) || 
            exp.submittedBy.toLowerCase().includes(q) ||
            exp.category.toLowerCase().includes(q)
        );
    }, [expenses, searchQuery]);


    return (
        <div>
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <Banknote size={12} />
                        FINANCIAL OPERATIONS HUB
                    </p>
                    <h1 className="page-title">ACCOUNTING</h1>
                    <p className="page-subtitle">Consolidated management of client revenue, technician payroll, and project overhead.</p>
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
                    <Button variant="outline" onClick={() => setIsExportDialogOpen(true)}>⇩ EXPORT GENERAL LEDGER</Button>
                    <Button variant="secondary" onClick={() => setIsClosePeriodOpen(true)}>
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
                    <TabsTrigger value="reports" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">REPORTS</TabsTrigger>
                </TabsList>
                
                <TabsContent value="summary" className="mt-6">
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
                     <div className="mt-6 empty-state">Further financial summary components can be added here.</div>
                </TabsContent>
                <TabsContent value="payroll" className="mt-6">
                    <Card>
                        <CardHeader>
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
                <TabsContent value="invoices" className="mt-6">
                     <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
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
                                        <TableRow key={invoice.id} onClick={() => handleEditInvoice(invoice)} className="cursor-pointer border-border-sub hover:bg-bg-tertiary transition-colors">
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
                <TabsContent value="expenses" className="mt-6">
                    <Card>
                        <CardHeader>
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
                                        <TableRow key={expense.id} className="border-border-sub hover:bg-bg-tertiary transition-colors">
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
                <TabsContent value="reports" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Generated Reports</CardTitle>
                            <CardDescription>Download previously generated financial and operational reports.</CardDescription>
                        </CardHeader>
                        <CardContent className="table-wrap p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-border-sub">
                                        <TableHead className="text-[10px] uppercase font-bold tracking-widest pl-6">Report Name</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold tracking-widest">Type</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold tracking-widest">Generation Date</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold tracking-widest">Generated By</TableHead>
                                        <TableHead className="text-right pr-6"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reports.map((report) => (
                                        <TableRow key={report.id} className="border-border-sub hover:bg-bg-tertiary transition-colors">
                                            <TableCell className="font-bold text-text-primary text-xs uppercase pl-6">{report.name}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="gap-1.5 text-[8px] uppercase h-4 bg-bg-primary">
                                                    {report.type === 'Financial' && <FileText size={10} className="text-brand-red"/>}
                                                    {report.type === 'Operational' && <BarChart size={10} className="text-accent-gold"/>}
                                                    {report.type === 'Compliance' && <FileWarning size={10} className="text-text-red"/>}
                                                    {report.type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-xs text-text-muted">{report.generationDate}</TableCell>
                                            <TableCell className="text-xs text-text-muted">{report.generatedBy}</TableCell>
                                            <TableCell className="text-right pr-6">
                                                <Button variant="ghost" size="icon" className="h-8 w-8"><Download size={14}/></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* FISCAL PERIOD CLOSURE TERMINAL */}
            <Dialog open={isClosePeriodOpen} onOpenChange={setIsClosePeriodOpen}>
                <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default flex flex-col p-0 overflow-hidden shadow-2xl">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30">
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
                        <div className="p-4 rounded-lg bg-brand-red-dim/10 border border-brand-red/30 space-y-2">
                            <p className="text-[10px] font-black text-brand-red uppercase tracking-widest">Tactical Warning</p>
                            <p className="text-[11px] text-text-secondary leading-relaxed uppercase">
                                Closing the period transitions all financial records (Invoices, Expenses, Payroll) to a read-only archival state.
                            </p>
                        </div>

                        {userIsSuperAdmin ? (
                            <div className="space-y-3 pt-2">
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
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30">
                        <div className="flex items-center gap-2 mb-1">
                            <Download className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest">Audit Export Configuration</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs">Define temporal parameters and tactical categories for general ledger generation.</DialogDescription>
                    </DialogHeader>

                    <div className="p-6 space-y-8">
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-brand-red uppercase tracking-[0.2em] border-b border-border-sub pb-1.5 px-1">Temporal Audit Window</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
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
                                <div className="space-y-2">
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

                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-brand-red uppercase tracking-[0.2em] border-b border-border-sub pb-1.5 px-1">Tactical Categories</h3>
                            <div className="grid grid-cols-1 gap-2">
                                {[
                                    { id: 'invoices', label: 'Client Invoices', desc: 'All transmitted and settled financial records.' },
                                    { id: 'expenses', label: 'Field Expenses', desc: 'Material reimbursements and incidental costs.' },
                                    { id: 'payroll', label: 'Technician Payroll', desc: 'Verified weekly logs and assignment payouts.' }
                                ].map(cat => (
                                    <div 
                                        key={cat.id} 
                                        onClick={() => toggleExportType(cat.id)}
                                        className={cn(
                                            "flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer",
                                            exportConfig.types.includes(cat.id) ? "bg-brand-red-dim/10 border-brand-red" : "bg-bg-primary border-border-sub hover:border-text-muted"
                                        )}
                                    >
                                        <div className="space-y-0.5">
                                            <p className={cn("text-xs font-bold uppercase", exportConfig.types.includes(cat.id) ? "text-text-primary" : "text-text-muted")}>{cat.label}</p>
                                            <p className="text-[9px] text-text-muted tracking-tight leading-tight">{cat.desc}</p>
                                        </div>
                                        <Checkbox checked={exportConfig.types.includes(cat.id)} className="h-4 w-4" />
                                    </div>
                                ))}
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
                workOrders={workOrders}
                onSave={handleSaveInvoice}
            />
            {selectedLog && (
                <PayrollReviewDialog
                    isOpen={isReviewDialogOpen}
                    setIsOpen={setIsReviewDialogOpen}
                    log={selectedLog}
                    technician={getTechnician(selectedLog.technicianId)}
                    onStatusChange={handleUpdateLogStatus}
                />
            )}
        </div>
    );
}
