'use client';

import { useState, useEffect, useMemo } from 'react';
import { technicians, invoices } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Banknote, CreditCard, Download, Plus, Landmark, ShieldCheck } from "lucide-react";

export default function ClientBillingPage() {
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        setCurrentUserId(localStorage.getItem('currentUserId'));
    }, []);

    const currentUser = useMemo(() => 
        currentUserId ? technicians.find(t => t.id === currentUserId) : null
    , [currentUserId]);

    const myInvoices = useMemo(() => {
        if (!currentUser?.clientCompany) return [];
        return invoices.filter(inv => inv.clientName === currentUser.clientCompany);
    }, [currentUser]);

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
                <div className="page-header-right">
                    <Button variant="outline">Upgrade Enterprise Plan</Button>
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
                            <Button variant="outline" className="w-full h-9 text-[10px]">Modify Subscription</Button>
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
        </div>
    );
}