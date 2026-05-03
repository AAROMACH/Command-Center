
'use client';

import { useState, useEffect } from 'react';
import { technicians } from "@/lib/data";
import { isClient, isTech } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Banknote, CreditCard, Download, Plus, Landmark, ArrowRightLeft, ShieldCheck } from "lucide-react";

const billingHistory = [
    { invoice: 'INV-2024-001', date: 'July 1, 2024', amount: '$5,000.00', status: 'Paid', type: 'Subscription' },
    { invoice: 'INV-2024-002', date: 'June 1, 2024', amount: '$5,000.00', status: 'Paid', type: 'Subscription' },
    { invoice: 'REIM-2024-012', date: 'June 15, 2024', amount: '$142.50', status: 'Paid', type: 'Reimbursement' },
    { invoice: 'PAY-2024-088', date: 'June 28, 2024', amount: '$2,150.00', status: 'Paid', type: '1099 Payout' },
];

export default function BillingPage() {
    const [currentUser, setCurrentUser] = useState<any>(null);

    useEffect(() => {
        const userId = localStorage.getItem('currentUserId');
        if (userId) {
            setCurrentUser(technicians.find(t => t.id === userId));
        }
    }, []);

    const userIsClient = isClient(currentUser);
    const userIsTech = isTech(currentUser);
    const userIsAdmin = !userIsClient && !userIsTech;

    return (
        <div className="space-y-8">
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <Banknote size={12} />
                        Financial Settlement
                    </p>
                    <h1 className="page-title">Billing & Payouts</h1>
                    <p className="page-subtitle">
                        Manage ACH transfers, subscription parameters, and 1099 financial disbursements.
                    </p>
                </div>
                {userIsClient && (
                    <div className="page-header-right">
                        <Button variant="outline">Upgrade Plan</Button>
                    </div>
                )}
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className={(userIsClient || userIsTech) ? "lg:col-span-2" : "lg:col-span-3"}>
                    <Card>
                        <CardHeader>
                            <CardTitle>Transaction Ledger</CardTitle>
                            <CardDescription>Comprehensive history of payments, payouts, and ACH transfers.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-border-sub">
                                        <TableHead className="pl-6">ID / Reference</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right pr-6">Audit</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {billingHistory.map((item) => (
                                        <TableRow key={item.invoice} className="border-border-sub hover:bg-bg-tertiary transition-colors">
                                            <TableCell className="font-mono text-xs text-text-primary pl-6">{item.invoice}</TableCell>
                                            <TableCell>
                                                <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted">{item.type}</div>
                                            </TableCell>
                                            <TableCell className="text-sm">{item.date}</TableCell>
                                            <TableCell className="font-mono text-sm font-bold text-text-primary">{item.amount}</TableCell>
                                            <TableCell>
                                                <Badge variant={item.status === 'Paid' ? 'active' : 'pending'}>{item.status}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-text-muted">
                                                    <Download className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                {(userIsClient || userIsTech) && (
                    <div className="space-y-6">
                        {userIsClient && (
                            <Card className="border-brand-red/20 bg-brand-red/5">
                                <CardHeader>
                                    <CardTitle>Current Plan</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <h3 className="text-2xl font-bold text-text-primary uppercase tracking-tight">Enterprise</h3>
                                    <p className="text-xs text-text-muted mt-1 uppercase tracking-widest font-bold">Standard Billing: $5,000.00 / Mo</p>
                                </CardContent>
                                <CardFooter className="pt-0">
                                    <Button variant="outline" className="w-full h-9 text-[10px]">Manage Subscription</Button>
                                </CardFooter>
                            </Card>
                        )}

                        <Card>
                            <CardHeader>
                                <CardTitle>{userIsClient ? "Settlement Methods" : "Payout Destination"}</CardTitle>
                                <CardDescription>
                                    {userIsClient 
                                        ? "Manage credit cards and ACH bank transfers for service payments." 
                                        : "Configured bank accounts for 1099 payouts and reimbursements."}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* ACH SECTION */}
                                <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-bg-secondary rounded border border-border-sub text-text-green">
                                                <Landmark size={18} />
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide">ACH Bank Transfer</p>
                                                <p className="text-[9px] text-text-muted uppercase tracking-widest font-mono">Chase •••• 9901</p>
                                            </div>
                                        </div>
                                        <Badge variant="active" className="text-[8px] h-4">Verified</Badge>
                                    </div>
                                    <div className="flex items-center gap-2 pt-1">
                                        <ShieldCheck size={12} className="text-text-green" />
                                        <p className="text-[9px] text-text-muted uppercase font-bold tracking-tighter">
                                            Primary target for {userIsTech ? "1099 Disbursements" : "Invoice Settlement"}
                                        </p>
                                    </div>
                                </div>

                                {userIsClient && (
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
                                )}

                                <Button variant="outline" className="w-full h-10 uppercase font-bold text-[10px] tracking-[0.15em]">
                                    <Plus className="mr-2 h-3.5 w-3.5" /> 
                                    Add {userIsTech ? "Account" : "Payment Method"}
                                </Button>
                            </CardContent>
                        </Card>
                        
                        {userIsTech && (
                             <Card className="bg-bg-tertiary border-border-sub">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-[10px] text-accent-gold flex items-center gap-2">
                                        <ArrowRightLeft size={12}/>
                                        Disbursement Protocol
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-[10px] text-text-secondary leading-relaxed">
                                        Field material reimbursements and standard 1099 assignment pay are cleared via verified ACH transfer within 48 hours of weekly log approval.
                                    </p>
                                </CardContent>
                             </Card>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
