'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import type { Invoice, Technician } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    FileText,
    Download,
    Search,
    Coins,
    ArrowUpRight,
    CheckCircle2,
    ExternalLink,
    Banknote,
    Activity,
    Briefcase,
    Wrench,
    ChevronRight,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const PLAN_DETAILS: Record<string, { name: string; discount: string; priority: string; response: string; billing: string }> = {
    'on-call': { name: 'On-Call', discount: '0%', priority: 'Standard', response: '48h', billing: 'Monthly' },
    'site-partner': { name: 'Site Partner', discount: '10%', priority: 'Priority', response: '24h', billing: 'Monthly' },
    'dedicated': { name: 'Dedicated', discount: '20%', priority: 'Dedicated', response: 'Same-Day', billing: 'Annually' },
};

export default function ClientFinancialsPage() {
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [myInvoices, setMyInvoices] = useState<Invoice[]>([]);
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
        const userId = sessionStorage.getItem('currentUserId');
        if (!userId) return;

        const unsubUser = onSnapshot(doc(db, 'users', userId), (d) => {
            if (d.exists()) {
                const userData = { ...d.data(), id: d.id } as Technician;
                setCurrentUser(userData);
                
                const clientName = userData.clientCompany || userData.name;

                const unsubInv = onSnapshot(query(collection(db, 'invoices'), where('clientName', '==', clientName)), (snap) => {
                    setMyInvoices(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Invoice)));
                });

                return () => unsubInv();
            }
        });

        return () => unsubUser();
    }, []);

    const filteredInvoices = useMemo(() => {
        return myInvoices
            .filter(inv => 
                (inv.invoiceNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (inv.projectId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (inv.workOrderId || '').toLowerCase().includes(searchQuery.toLowerCase())
            )
            .sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
    }, [myInvoices, searchQuery]);

    const metrics = useMemo(() => {
        const outstanding = filteredInvoices.filter(inv => inv.status !== 'paid' && inv.status !== 'void').reduce((acc, inv) => acc + inv.total, 0);
        const paid = filteredInvoices.filter(inv => inv.status === 'paid').reduce((acc, inv) => acc + inv.total, 0);
        
        return { outstanding, paid };
    }, [filteredInvoices]);

    const getInvoiceSource = (invoice: Invoice) => {
        if (invoice.projectId) return { label: 'Project', id: invoice.projectId, icon: Briefcase };
        if (invoice.workOrderId) return { label: 'Job', id: invoice.workOrderId, icon: Wrench };
        return { label: 'General', id: 'N/A', icon: FileText };
    };

    const handleExportInvoices = () => {
        const rows = [
            ['INVOICE #', 'DATE', 'SOURCE', 'SOURCE ID', 'STATUS', 'TOTAL']
        ];
        
        filteredInvoices.forEach(inv => {
            const source = getInvoiceSource(inv);
            rows.push([
                `INV-${inv.invoiceNumber}`,
                inv.issueDate,
                source.label,
                inv.projectId || inv.workOrderId || 'N/A',
                inv.status.toUpperCase(),
                inv.total.toString()
            ]);
        });

        const csvContent = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Invoices_Export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast({ title: "Download Executed", description: "Audit CSV generated for settlement verification."});
    };

    const planInfo = currentUser?.planId ? PLAN_DETAILS[currentUser.planId] : null;

    if (!mounted) return null;

    return (
        <div className="space-y-8">
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <Banknote size={12} />
                        Financial Settlement
                    </p>
                    <h1 className="page-title">Billing & A/R</h1>
                    <p className="page-subtitle text-left">Invoice audit, current outstanding balances, and low voltage job-level cost breakdowns.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border-main border border-border-main rounded-lg overflow-hidden shadow-sm">
                <div className="bg-bg-secondary p-6 text-left">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Outstanding Balance</p>
                        <ArrowUpRight className="h-4 w-4 text-brand-red" />
                    </div>
                    <p className="text-3xl font-mono font-bold text-text-primary">${metrics.outstanding.toLocaleString()}</p>
                    <p className="text-[10px] text-text-muted mt-1 uppercase tracking-widest font-bold">Funds Due for Settlement</p>
                </div>
                <div className="bg-bg-secondary p-6 text-left">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Settled (YTD)</p>
                        <CheckCircle2 className="h-4 w-4 text-text-green" />
                    </div>
                    <p className="text-3xl font-mono font-bold text-text-green">${metrics.paid.toLocaleString()}</p>
                    <p className="text-[10px] text-text-muted mt-1 uppercase tracking-widest font-bold">Successfully Cleared</p>
                </div>
                <div className="bg-bg-secondary p-6 text-left cursor-pointer hover:bg-bg-tertiary transition-colors group" onClick={() => setIsPlanDialogOpen(true)}>
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Current Plan</p>
                        <div className="flex items-center gap-1">
                            <Coins className="h-4 w-4 text-accent-gold" />
                            <ChevronRight className="h-3 w-3 text-text-muted group-hover:text-text-primary transition-colors" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-text-primary capitalize">
                        {currentUser?.planId ? (PLAN_DETAILS[currentUser.planId]?.name || currentUser.planId) : 'Enterprise'}
                    </p>
                    <p className="text-[10px] text-text-muted mt-1 uppercase tracking-widest font-bold">
                        {currentUser?.planId ? `${PLAN_DETAILS[currentUser.planId]?.response || '48h'} Response Guarantee` : 'Standard Net-30 Terms'}
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border-sub bg-bg-tertiary/20">
                    <div className="text-left">
                        <CardTitle>Invoice Ledger</CardTitle>
                        <CardDescription>Comprehensive record of all field critical financial transactions.</CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="search-wrap !mb-0">
                            <Search />
                            <input 
                                className="search-input !w-[250px] !h-9 !text-xs font-bold uppercase" 
                                placeholder="Filter by Invoice # or Job..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Button variant="outline" size="sm" className="h-9 px-4 uppercase text-[10px] font-bold tracking-widest" onClick={handleExportInvoices}>
                            <Download size={14} className="mr-2" /> Export CSV
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-bg-tertiary/50">
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
                            {filteredInvoices.map(invoice => {
                                const source = getInvoiceSource(invoice);
                                const SourceIcon = source.icon;
                                return (
                                    <TableRow key={invoice.id} className="border-border-sub hover:bg-bg-tertiary transition-colors group">
                                        <TableCell className="pl-6 text-left">
                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide">INV-{invoice.invoiceNumber}</p>
                                        </TableCell>
                                        <TableCell className="text-left">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-[9px] uppercase bg-bg-primary border-border-sub flex items-center gap-1.5">
                                                    <SourceIcon size={10}/>
                                                    {source.label}
                                                </Badge>
                                                <span className="font-mono text-[10px] text-text-muted">{(source.id || '').toUpperCase()}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-left">
                                            <p className="text-xs text-text-secondary">{invoice.issueDate}</p>
                                        </TableCell>
                                        <TableCell className="text-left">
                                            <Badge variant={invoice.status === 'paid' ? 'active' : invoice.status === 'sent' ? 'pending' : 'onhold'}>
                                                {invoice.status.toUpperCase()}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <p className="text-sm font-mono font-bold text-text-primary">${invoice.total.toLocaleString()}</p>
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <div className="flex justify-end gap-2">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-text-muted group-hover:text-brand-red transition-colors" onClick={() => toast({ title: "Audit Link", description: "This will open the detailed invoice audit terminal in a future protocol update."})}>
                                                    <ExternalLink className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {filteredInvoices.length === 0 && (
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
            {/* Plan Details Dialog */}
            <Dialog open={isPlanDialogOpen} onOpenChange={setIsPlanDialogOpen}>
                <DialogContent className="sm:max-w-[480px] bg-bg-elevated border-border-default">
                    <DialogHeader>
                        <DialogTitle className="uppercase tracking-widest font-bold text-sm">
                            {planInfo?.name || 'Current Plan'} Details
                        </DialogTitle>
                        <DialogDescription>Your current service plan and entitlements.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-3">
                        {planInfo ? (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">Response Guarantee</p>
                                        <p className="text-sm font-bold text-text-primary">{planInfo.response}</p>
                                    </div>
                                    <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">Priority Level</p>
                                        <p className="text-sm font-bold text-text-primary">{planInfo.priority}</p>
                                    </div>
                                    <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">Labor Discount</p>
                                        <p className="text-sm font-bold text-text-green">{planInfo.discount}</p>
                                    </div>
                                    <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">Billing Cycle</p>
                                        <p className="text-sm font-bold text-text-primary">{planInfo.billing}</p>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <p className="text-xs text-text-muted">No plan details available. Contact Aaromach for more information.</p>
                        )}
                    </div>
                    <DialogFooter className="gap-3 flex-row">
                        <Button variant="outline" onClick={() => setIsPlanDialogOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest">Close</Button>
                        <Button
                            className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest text-white"
                            onClick={() => { window.location.href = 'mailto:sales@aaromach.com?subject=Plan Upgrade Inquiry'; }}
                        >
                            Contact Sales
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
