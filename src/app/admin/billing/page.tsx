
'use client';

import { useState, useEffect } from 'react';
import { technicians } from "@/lib/data";
import { isClient } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Banknote, CreditCard, Download, Plus } from "lucide-react";

const billingHistory = [
    { invoice: 'INV-2024-001', date: 'July 1, 2024', amount: '$5,000.00', status: 'Paid' },
    { invoice: 'INV-2024-002', date: 'June 1, 2024', amount: '$5,000.00', status: 'Paid' },
    { invoice: 'INV-2024-003', date: 'May 1, 2024', amount: '$5,000.00', status: 'Paid' },
    { invoice: 'INV-2024-004', date: 'April 1, 2024', amount: '$5,000.00', status: 'Paid' },
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

    return (
        <div>
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <Banknote size={12} />
                        Account
                    </p>
                    <h1 className="page-title">Billing</h1>
                    <p className="page-subtitle">Manage your subscription, payment methods, and view your billing history.</p>
                </div>
                {userIsClient && (
                    <div className="page-header-right">
                        <Button variant="outline">Upgrade Plan</Button>
                    </div>
                )}
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className={userIsClient ? "lg:col-span-2" : "lg:col-span-3"}>
                    <Card>
                        <CardHeader>
                            <CardTitle>Billing History</CardTitle>
                            <CardDescription>View and download your past invoices.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Invoice</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {billingHistory.map((item) => (
                                        <TableRow key={item.invoice}>
                                            <TableCell className="font-medium">{item.invoice}</TableCell>
                                            <TableCell>{item.date}</TableCell>
                                            <TableCell>{item.amount}</TableCell>
                                            <TableCell>
                                                <Badge variant={item.status === 'Paid' ? 'completed' : 'pending'}>{item.status}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon">
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

                {userIsClient && (
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Current Plan</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <h3 className="text-2xl font-bold text-text-primary">Enterprise</h3>
                                <p className="text-text-muted">Billed at $5,000 per month.</p>
                            </CardContent>
                            <CardFooter>
                                <Button variant="outline" className="w-full">Manage Subscription</Button>
                            </CardFooter>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Payment Methods</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between rounded-md border border-border-default p-4">
                                    <div className="flex items-center gap-4">
                                        <CreditCard className="h-6 w-6" />
                                        <div>
                                            <p className="font-semibold">Visa ending in 4242</p>
                                            <p className="text-sm text-text-muted">Expires 12/2026</p>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="sm">Edit</Button>
                                </div>
                                <Button variant="outline" className="w-full">
                                    <Plus className="mr-2 h-4 w-4" /> Add Payment Method
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}
