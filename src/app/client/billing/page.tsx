'use client';

import { useState, useEffect, useMemo } from 'react';
import { technicians, invoices } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Banknote, Download, Search, FileText, Mail, Clock, ShieldCheck, Settings2, Sparkles, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

type PlanTier = 'On-Call' | 'Site Partner' | 'Dedicated';

interface PlanOption {
    id: PlanTier;
    price: string;
    description: string;
    features: string[];
}

const plans: PlanOption[] = [
    { 
        id: 'On-Call', 
        price: '$199.00 / Mo', 
        description: 'Priority scheduling and triage support.',
        features: ['48-hr priority scheduling', '10% off all labor', 'Phone triage support', 'Annual site walkthrough', 'No contract — month to month']
    },
    { 
        id: 'Site Partner', 
        price: '$499.00 / Mo', 
        description: 'Quarterly inspections and documentation.',
        features: ['24-hr priority scheduling', '15% off all labor', 'Quarterly site inspection', 'Infrastructure documentation', 'Emergency dispatch available']
    },
    { 
        id: 'Dedicated', 
        price: '$999.00 / Mo', 
        description: 'High-fidelity same-day response tier.',
        features: ['Same-day scheduling', '20% off all labor', 'Monthly site visits included', 'Dedicated tech assignment', 'After-hours emergency dispatch', 'Full infrastructure documentation']
    }
];

export default function ClientBillingPage() {
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [isModifyOpen, setIsModifyOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<PlanTier>('Dedicated');
    const [searchQuery, setSearchQuery] = useState("");
    const router = useRouter();
    const { toast } = useToast();

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
                inv.status.toLowerCase().includes(searchQuery.toLowerCase())
            );
    }, [currentUser, searchQuery]);

    const handleUpdatePlan = () => {
        toast({
            title: "Plan Update Requested",
            description: `A request to transition to the ${selectedPlan} tier has been transmitted for audit.`,
        });
        setIsModifyOpen(false);
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
                    <h1 className="page-title">Billing & Subscription</h1>
                    <p className="page-subtitle">Review global settlement history and manage organizational billing parameters.</p>
                </div>
                <div className="page-header-right items-center">
                    <div className="search-wrap">
                        <Search />
                        <input 
                            className="search-input !w-full md:!w-[250px]" 
                            placeholder="Find transaction..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <Button variant="outline" onClick={() => setIsModifyOpen(true)}>Upgrade Plan</Button>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Payment History</CardTitle>
                            <CardDescription>Consolidated ledger of all finalized invoices and settlements.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-border-sub">
                                        <TableHead className="pl-6">Invoice #</TableHead>
                                        <TableHead>Issue Date</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right pr-6">Audit</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {myInvoices.map((inv) => (
                                        <TableRow key={inv.id} className="border-border-sub hover:bg-bg-tertiary transition-colors">
                                            <TableCell className="font-mono text-xs text-text-primary pl-6">INV-{inv.invoiceNumber}</TableCell>
                                            <TableCell className="text-sm">{inv.issueDate}</TableCell>
                                            <TableCell className="font-mono text-sm font-bold text-text-primary">${inv.total.toLocaleString()}</TableCell>
                                            <TableCell>
                                                <Badge variant={inv.status === 'paid' ? 'active' : 'onhold'}>{inv.status.toUpperCase()}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-text-muted">
                                                    <Download className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {myInvoices.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-32 text-center text-text-muted uppercase text-[10px] tracking-[0.2em] italic">No transaction history found.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="border-brand-red/20 bg-brand-red/5">
                        <CardHeader>
                            <CardTitle>Active Plan</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <h3 className="text-2xl font-bold text-text-primary uppercase tracking-tight">Dedicated Tier</h3>
                            <p className="text-xs text-text-muted mt-1 uppercase tracking-widest font-bold">Base Billing: $999.00 / Mo</p>
                        </CardContent>
                        <CardFooter className="pt-0">
                            <Button variant="outline" className="w-full h-9 text-[10px]" onClick={() => setIsModifyOpen(true)}>Modify Subscription</Button>
                        </CardFooter>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileText size={16} className="text-brand-red" />
                                Billing Profile
                            </CardTitle>
                            <CardDescription>Verified organizational billing context.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-4">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Billing Contact</p>
                                    <p className="text-xs font-bold text-text-primary uppercase">{currentUser?.billingDetails?.contactName || 'Awaiting Entry'}</p>
                                    <div className="flex items-center gap-2 text-[10px] text-text-muted">
                                        <Mail size={10} />
                                        <span>{currentUser?.billingDetails?.email || 'No email registered'}</span>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border-sub/50">
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Payment Terms</p>
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-text-primary uppercase">
                                            <Clock size={10} className="text-accent-gold" />
                                            {currentUser?.billingDetails?.terms || 'Net 30'}
                                        </div>
                                    </div>
                                    <div className="space-y-1 text-right">
                                        <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Delivery</p>
                                        <p className="text-xs font-bold text-text-primary uppercase">{currentUser?.billingDetails?.deliveryMethod || 'Portal'}</p>
                                    </div>
                                </div>

                                <div className="pt-2 flex justify-between items-center">
                                    <Badge variant="active" className="text-[8px] h-4">Verified</Badge>
                                    <ShieldCheck size={14} className="text-text-green" />
                                </div>
                            </div>

                            <Button variant="outline" className="w-full h-10 uppercase font-bold text-[10px] tracking-widest" onClick={() => router.push('/client/profile')}>
                                Update Registry
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Dialog open={isModifyOpen} onOpenChange={setIsModifyOpen}>
                <DialogContent className="sm:max-w-[700px] bg-bg-elevated border-border-default flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="p-6 border-b border-border-sub bg-bg-tertiary/30">
                        <div className="flex items-center gap-3">
                            <Settings2 className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest">Subscription Terminal</DialogTitle>
                        </div>
                        <DialogDescription>Modify organizational plan parameters and service level agreements.</DialogDescription>
                    </DialogHeader>

                    <div className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {plans.map(plan => (
                                <div 
                                    key={plan.id}
                                    onClick={() => setSelectedPlan(plan.id)}
                                    className={cn(
                                        "p-4 rounded-lg border transition-all cursor-pointer flex flex-col h-full",
                                        selectedPlan === plan.id 
                                            ? "bg-brand-red-dim/10 border-brand-red ring-1 ring-brand-red" 
                                            : "bg-bg-primary border-border-sub hover:border-text-muted"
                                    )}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <p className={cn("text-[10px] font-black uppercase tracking-widest", selectedPlan === plan.id ? "text-brand-red" : "text-text-muted")}>
                                            {plan.id}
                                        </p>
                                        {selectedPlan === plan.id && <Check size={14} className="text-brand-red" />}
                                    </div>
                                    <p className="text-xl font-mono font-bold text-text-primary mb-1">{plan.price.split(' ')[0]}</p>
                                    <p className="text-[9px] text-text-muted uppercase font-bold tracking-tight leading-tight mb-4">{plan.description}</p>
                                    
                                    <div className="mt-auto space-y-2 pt-4 border-t border-border-sub/30">
                                        {plan.features.map((feature, i) => (
                                            <div key={i} className="flex items-center gap-1.5">
                                                <div className="h-1 w-1 rounded-full bg-text-green" />
                                                <span className="text-[9px] text-text-secondary uppercase font-bold tracking-tighter">{feature}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="p-4 rounded-lg bg-bg-secondary border border-border-sub flex items-start gap-4">
                            <div className="p-2 bg-bg-tertiary rounded text-accent-gold">
                                <Sparkles size={16} />
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-text-primary">Administrative Verification</p>
                                <p className="text-[10px] text-text-muted leading-relaxed uppercase font-medium">
                                    Transitioning plans may affect your site visibility limits and response tier guarantees. Final authorization by your account lead is required.
                                </p>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default">
                        <Button variant="outline" onClick={() => setIsModifyOpen(false)} className="h-10 px-8">Cancel</Button>
                        <Button onClick={handleUpdatePlan} className="h-10 px-12 bg-brand-red hover:bg-brand-red-hover">
                            Request Plan Transition
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
