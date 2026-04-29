
'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Banknote, ArrowUpRight, ArrowDownRight, Minus, Download, FileText, BarChart, FileWarning, Plus } from "lucide-react";
import { expenses as initialExpenses, reports, weeklyLogs as initialWeeklyLogs, technicians, invoices as initialInvoices, projects, workOrders } from '@/lib/data';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from '@/hooks/use-toast';
import type { Expense, Invoice, WeeklyLog } from '@/lib/types';
import { InvoiceEditor } from './components/invoice-editor';
import { PayrollReviewDialog } from './components/payroll-review-dialog';

const financialMetrics = [
    { title: "TOTAL REVENUE (MTD)", value: "$42,850.00", trend: "+12.4% VS LAST MONTH", trendType: "positive" as const, TrendIcon: ArrowUpRight },
    { title: "PENDING PAYOUTS", value: "$12,450.00", trend: "ACROSS 8 TECHNICIANS", trendType: "negative" as const, TrendIcon: ArrowDownRight },
    { title: "OUTSTANDING A/R", value: "$8,920.00", trend: "NOMINAL STATUS", trendType: "warning" as const, TrendIcon: Minus },
    { title: "SERVICE MARGIN", value: "32.8%", trend: "NOMINAL THRESHOLD: 25%", trendType: "positive" as const, TrendIcon: ArrowUpRight },
];

export default function FinancialsPage() {
    const [expenses, setExpenses] = useState(initialExpenses);
    const [invoices, setInvoices] = useState(initialInvoices);
    const [weeklyLogs, setWeeklyLogs] = useState(initialWeeklyLogs);
    const [isInvoiceEditorOpen, setIsInvoiceEditorOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [selectedLog, setSelectedLog] = useState<WeeklyLog | null>(null);
    const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);

    const { toast } = useToast();

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


    const clients = technicians.filter(t => t.role.toLowerCase().includes('client'));
    
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
            case 'paid': return 'completed';
            case 'sent': return 'active';
            case 'overdue': return 'destructive';
            case 'draft': return 'onhold';
            case 'void': return 'secondary';
            default: return 'secondary';
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
            title: `Manifest ${status}`,
            description: `The weekly manifest has been ${status.toLowerCase()}.`,
        });
        setIsReviewDialogOpen(false);
    };


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
                <div className="page-header-right">
                    <Button variant="outline" onClick={() => toast({ title: "Exporting...", description: "Your general ledger is being generated and will be downloaded shortly." })}>⇩ EXPORT GENERAL LEDGER</Button>
                    <Button variant="secondary" onClick={() => toast({ title: "Closing Period...", description: "This will lock all records for the current fiscal period." })}>CLOSE FISCAL PERIOD</Button>
                </div>
            </header>

            <Tabs defaultValue="summary" className="w-full">
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
                            <CardDescription>Review submitted weekly manifests from technicians for approval.</CardDescription>
                        </CardHeader>
                        <CardContent className="table-wrap p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Week Of</TableHead>
                                        <TableHead>Technician</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Payout</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {weeklyLogs.map(log => (
                                        <TableRow key={log.id}>
                                            <TableCell className="font-semibold">{log.weekOf}</TableCell>
                                            <TableCell>{getTechnicianName(log.technicianId)}</TableCell>
                                            <TableCell><Badge variant={log.status === 'Approved' ? 'completed' : log.status === 'Submitted' ? 'onhold' : 'pending'}>{log.status}</Badge></TableCell>
                                            <TableCell className="font-mono text-text-green">{log.totalPayout ? `$${log.totalPayout.toFixed(2)}` : 'N/A'}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="outline" size="sm" onClick={() => handleReviewLog(log)}>Review Manifest</Button>
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
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <div>
                                    <CardTitle>Client Invoices</CardTitle>
                                    <CardDescription>Manage and track all client invoices.</CardDescription>
                                </div>
                                <Button onClick={handleCreateNewInvoice}><Plus size={14} className="mr-2"/>Create New Invoice</Button>
                            </div>
                        </CardHeader>
                        <CardContent className="table-wrap p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Invoice #</TableHead>
                                        <TableHead>Client</TableHead>
                                        <TableHead>Due Date</TableHead>
                                        <TableHead>Total</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {invoices.map((invoice) => (
                                        <TableRow key={invoice.id} onClick={() => handleEditInvoice(invoice)} className="cursor-pointer">
                                            <TableCell className="font-semibold text-text-primary">{invoice.invoiceNumber}</TableCell>
                                            <TableCell>{invoice.clientName}</TableCell>
                                            <TableCell>{invoice.dueDate}</TableCell>
                                            <TableCell className="font-mono text-text-primary">${invoice.total.toFixed(2)}</TableCell>
                                            <TableCell>
                                                <Badge variant={getInvoiceStatusVariant(invoice.status)} className="capitalize">{invoice.status}</Badge>
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
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Submitted By</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {expenses.map((expense) => (
                                        <TableRow key={expense.id} className="cursor-pointer hover:bg-bg-tertiary">
                                            <TableCell>{expense.date}</TableCell>
                                            <TableCell>{expense.submittedBy}</TableCell>
                                            <TableCell>
                                                <div className="font-semibold text-text-primary">{expense.description}</div>
                                                <div className="text-xs text-text-muted">{expense.category}</div>
                                            </TableCell>
                                            <TableCell className="font-mono text-text-primary">${expense.amount.toFixed(2)}</TableCell>
                                            <TableCell><Badge variant={expense.status === 'Approved' ? 'completed' : expense.status === 'Pending' ? 'onhold' : 'destructive'}>{expense.status}</Badge></TableCell>
                                            <TableCell className="text-right">
                                                 {expense.status === 'Pending' && (
                                                    <div className="flex gap-2 justify-end">
                                                        <Button size="sm" variant="destructive-outline" onClick={() => handleExpenseStatusChange(expense.id, 'Rejected')}>Deny</Button>
                                                        <Button size="sm" onClick={() => handleExpenseStatusChange(expense.id, 'Approved')}>Approve</Button>
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
                                    <TableRow>
                                        <TableHead>Report Name</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Generation Date</TableHead>
                                        <TableHead>Generated By</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reports.map((report) => (
                                        <TableRow key={report.id}>
                                            <TableCell className="font-semibold text-text-primary">{report.name}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="gap-1.5">
                                                    {report.type === 'Financial' && <FileText size={12}/>}
                                                    {report.type === 'Operational' && <BarChart size={12}/>}
                                                    {report.type === 'Compliance' && <FileWarning size={12}/>}
                                                    {report.type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-text-secondary">{report.generationDate}</TableCell>
                                            <TableCell className="text-text-secondary">{report.generatedBy}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon"><Download size={16}/></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
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

    