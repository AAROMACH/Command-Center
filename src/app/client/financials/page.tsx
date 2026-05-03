'use client';

import { useState, useEffect, useMemo } from 'react';
import { technicians, invoices, workOrders, projects } from '@/lib/data';
import type { Invoice, Technician, WorkOrder, Project } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
    FileText, 
    Download, 
    Search,
    Coins,
    ArrowUpRight,
    ArrowDownRight,
    CheckCircle2,
    Calendar,
    ChevronRight,
    ExternalLink,
    Banknote,
    Activity,
    Briefcase,
    Wrench
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function ClientFinancialsPage() {
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        setMounted(true);
        setCurrentUserId(localStorage.getItem('currentUserId'));
    }, []);

    const currentUser = useMemo(() => 
        currentUserId ? technicians.find(t => t.id === currentUserId) : null
    , [currentUserId]);

    const myInvoices = useMemo(() => {
        if (!currentUser?.clientCompany) return [];
        return invoices
            .filter(inv => inv.clientName === currentUser.clientCompany)
            .filter(inv => 
                inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (inv.projectId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (inv.workOrderId || '').toLowerCase().includes(searchQuery.toLowerCase())
            )
            .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
    }, [currentUser, searchQuery]);

    const metrics = useMemo(() => {
        const total = myInvoices.reduce((acc, inv) => acc + inv.total, 0);
        const outstanding = myInvoices.filter(inv => inv.status !== 'paid' && inv.status !== 'void').reduce((acc, inv) => acc + inv.total, 0);
        const paid = myInvoices.filter(inv => inv.status === 'paid').reduce((acc, inv) => acc + inv.total, 0);
        
        return { total, outstanding, paid };
    }, [myInvoices]);

    const getInvoiceSource = (invoice: Invoice) => {
        if (invoice.projectId) return { label: 'Project', id: invoice.projectId, icon: Briefcase };
        if (invoice.workOrderId) return { label: 'Assignment', id: invoice.workOrderId, icon: Wrench };
        return { label: 'General', id: 'N/A', icon: FileText };
    };

    if (!mounted || !currentUserId) return null;

    return (
        <div className="space-y-8">
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <Banknote size={12} />
                        Financial Settlement
                    </p>
                    <h1 className="page-title">Billing & A/R</h1>
                    <p className="page-subtitle">Historical invoice audit, current outstanding balances, and job-level cost breakdowns.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border-main border border-border-main rounded-lg overflow-hidden shadow-sm">
                <div className="bg-bg-secondary p-6">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Outstanding Balance</p>
                        <ArrowUpRight className="h-4 w-4 text-brand-red" />
                    </div>
                    <p className="text-3xl font-mono font-bold text-text-primary">${metrics.outstanding.toLocaleString()}</p>
                    <p className="text-[10px] text-text-muted mt-1 uppercase tracking-widest font-bold">Funds Due for Settlement</p>
                </div>
                <div className="bg-bg-secondary p-6">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Settled (YTD)</p>
                        <CheckCircle2 className="h-4 w-4 text-text-green" />
                    </div>
                    <p className="text-3xl font-mono font-bold text-text-green">${metrics.paid.toLocaleString()}</p>
                    <p className="text-[10px] text-text-muted mt-1 uppercase tracking-widest font-bold">Successfully Cleared</p>
                </div>
                <div className="bg-bg-secondary p-6">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Current Plan</p>
                        <Coins className="h-4 w-4 text-accent-gold" />
                    </div>
                    <p className="text-3xl font-bold text-text-primary">Enterprise</p>
                    <p className="text-[10px] text-text-muted mt-1 uppercase tracking-widest font-bold">Standard Net-30 Terms</p>
                </div>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Invoice Ledger</CardTitle>
                        <CardDescription>Comprehensive record of all mission-critical financial transactions.</CardDescription>
                    </div>
                    <div className="search-wrap !mb-0">
                        <Search />
                        <input 
                            className="search-input !w-[250px]" 
                            placeholder="Filter by Invoice # or Source..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-border-sub">
                                <TableHead className="pl-6 text-[10px] uppercase tracking-widest font-bold">Reference #</TableHead>
                                <TableHead className="text-[10px] uppercase tracking-widest font-bold">Originating Source</TableHead>
                                <TableHead className="text-[10px] uppercase tracking-widest font-bold">Date Issued</TableHead>
                                <TableHead className="text-[10px] uppercase tracking-widest font-bold">Status</TableHead>
                                <TableHead className="text-right text-[10px] uppercase tracking-widest font-bold">Total Amount</TableHead>
                                <TableHead className="text-right pr-6"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {myInvoices.map(invoice => {
                                const source = getInvoiceSource(invoice);
                                return (
                                    <TableRow key={invoice.id} className="border-border-sub hover:bg-bg-tertiary transition-colors group">
                                        <TableCell className="pl-6">
                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide">INV-{invoice.invoiceNumber}</p>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-[9px] uppercase bg-bg-primary border-border-sub">
                                                    {source.label}
                                                </Badge>
                                                <span className="font-mono text-[10px] text-text-muted">{source.id.toUpperCase()}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <p className="text-xs text-text-secondary">{invoice.issueDate}</p>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={invoice.status === 'paid' ? 'active' : invoice.status === 'sent' ? 'pending' : 'onhold'}>
                                                {invoice.status.toUpperCase()}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <p className="text-sm font-mono font-bold text-text-primary">${invoice.total.toLocaleString()}</p>
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <div className="flex justify-end gap-2">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-text-muted group-hover:text-brand-red transition-colors">
                                                    <Download className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-text-muted group-hover:text-text-primary">
                                                    <ExternalLink className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {myInvoices.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-text-muted uppercase text-[10px] tracking-[0.2em] italic">
                                        Financial ledger clear. No transaction history found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card className="bg-bg-tertiary/30 border-border-sub">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Coins size={14} className="text-accent-gold" />
                            Settlement Policy
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-xs text-text-secondary leading-relaxed">
                            Standard Net-30 payment terms apply to all service assignments. Invoices are generated automatically upon successful administrative audit of field logs.
                        </p>
                        <div className="p-3 rounded-lg bg-bg-primary border border-border-sub space-y-2">
                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Primary Method</p>
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide">ACH / Wire Transfer</p>
                                <Badge variant="active" className="text-[8px] h-4">Verified</Badge>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-bg-tertiary/30 border-border-sub">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Activity size={14} className="text-text-green" />
                            Cost Center Analytics
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-xs text-text-secondary leading-relaxed">
                            Monthly service margins and job-level fiscal auditing features are currently in deployment.
                        </p>
                        <Button variant="outline" className="w-full h-10 uppercase font-bold text-[10px] tracking-widest opacity-50 cursor-not-allowed">
                            Access Multi-Site Cost Audit
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}