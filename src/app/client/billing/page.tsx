'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePaged, ListPager, PAGE_SIZES_LARGE, PAGE_SIZES_SMALL } from '@/components/list-pager';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/auth-context';
import { useClientInvoices } from '@/hooks/use-client-invoices';
import type { Invoice } from '@/lib/types';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Banknote, Download, Search, FileText, Mail, Clock, ShieldCheck, Settings2, Sparkles, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { ClientPlanCard } from '@/components/client-plan-card';

export default function ClientBillingPage() {
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const router = useRouter();
    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
    }, []);

    // The signed-in client's real invoices (this page used to show the demo list).
    const { user: currentUser } = useAuth();
    const liveInvoices = useClientInvoices(currentUser);

    const myInvoices = useMemo(() => {
        return liveInvoices
            .filter(inv => 
                inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                inv.status.toLowerCase().includes(searchQuery.toLowerCase())
            );
    }, [liveInvoices, searchQuery]);
    const invoicePager = usePaged(myInvoices, PAGE_SIZES_LARGE, 'client-billing-invoices', []);

    if (!mounted || !currentUser) return null;

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
                                    {invoicePager.items.map((inv) => (
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
                            <div className="px-4"><ListPager pager={invoicePager} noun="invoices" /></div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    {/* The client's real plan and plan requests (was a hard-coded
                        "Dedicated Tier $999" and a request button that saved nothing). */}
                    <ClientPlanCard client={currentUser} />

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

        </div>
    );
}
