
'use client';

import { useState, useEffect, useMemo } from 'react';
import { technicians, invoices } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Banknote, CreditCard, Download, Plus, Landmark, ShieldCheck, Check, Settings2, Sparkles, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type PlanTier = 'Standard' | 'Professional' | 'Enterprise';

interface PlanOption {
    id: PlanTier;
    price: string;
    description: string;
    features: string[];
}

const plans: PlanOption[] = [
    { 
        id: 'Standard', 
        price: '$1,500.00 / Mo', 
        description: 'Basic site management and ticketing.',
        features: ['Up to 5 managed sites', 'Standard 24h response', 'Email support']
    },
    { 
        id: 'Professional', 
        price: '$3,000.00 / Mo', 
        description: 'Enhanced oversight for growing organizations.',
        features: ['Up to 20 managed sites', 'Priority 8h response', 'Live portal tracking']
    },
    { 
        id: 'Enterprise', 
        price: '$5,000.00 / Mo', 
        description: 'Full strategic command for global operations.',
        features: ['Unlimited managed sites', 'Critical 4h response', 'Dedicated account lead']
    }
];

export default function ClientBillingPage() {
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [isModifyOpen, setIsModifyOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<PlanTier>('Enterprise');
    const [searchQuery, setSearchQuery] = useState("");
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
                    <p className="page-subtitle">
                        Manage payment methods, subscription parameters, and review your global settlement history.
                    </p>
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
                    <Button variant="outline" onClick={() => setIsModifyOpen(true)}>Upgrade Enterprise Plan</Button>
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
                            <h3 className="text-2xl font-bold text-text-primary uppercase tracking-tight">Enterprise Tier</h3>
                            <p className="text-xs text-text-muted mt-1 uppercase tracking-widest font-bold">Base Billing: $5,000.00 / Mo</p>
                        </CardContent>
                        <CardFooter className="pt-0">
                            <Button variant="outline" className="w-full h-9 text-[10px]" onClick={() => setIsModifyOpen(true)}>Modify Subscription</Button>
                        </CardFooter>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Settlement Methods</CardTitle>
                            <CardDescription>Authorized methods for automated invoice payment.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-bg-secondary rounded border border-border-sub text-text-green">
                                            <Landmark size={18} />
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide">ACH Transfer</p>
                                            <p className="text-[9px] text-text-muted uppercase tracking-widest font-mono">Chase •••• 9901</p>
                                        </div>
                                    </div>
                                    <Badge variant="active" className="text-[8px] h-4">Verified</Badge>
                                </div>
                                <div className="flex items-center gap-2 pt-1">
                                    <ShieldCheck size={12} className="text-text-green" />
                                    <p className="text-[9px] text-text-muted uppercase font-bold tracking-tighter">Primary Target for Settlement</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between rounded-lg border border-border-sub bg-bg-primary p-4">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-bg-secondary rounded border border-border-sub text-text-muted">
                                        <CreditCard className="h-[18px] w-[18px]" />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide">Visa ending in 4242</p>
                                        <p className="text-[9px] text-text-muted uppercase tracking-widest">Expires 12/2026</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="sm" className="h-7 text-[9px]">Edit</Button>
                            </div>

                            <Button variant="outline" className="w-full h-10 uppercase font-bold text-[10px] tracking-[0.15em]">
                                <Plus className="mr-2 h-3.5 w-3.5" /> 
                                Add Payment Method
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

                    <DialogFooter className="bg-bg-tertiary/50 p-6 border-t border-border-default">
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
