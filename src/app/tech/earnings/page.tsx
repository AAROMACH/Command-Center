'use client';

import { useState, useEffect } from 'react';
import type { WeeklyLog } from '@/lib/types';
import { weeklyLogs } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Coins, PiggyBank, FileClock } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function TechEarningsPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [logs, setLogs] = useState<WeeklyLog[]>([]);

    useEffect(() => {
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);
        if (userId) {
            setLogs(weeklyLogs.filter(wl => wl.technicianId === userId));
        }
    }, []);

    const totalPaid = logs.filter(l => l.status === 'Approved').reduce((acc, log) => acc + (log.totalPayout || 0), 0);
    const pendingPayout = logs.filter(l => l.status === 'Submitted').reduce((acc, log) => acc + (log.totalPayout || 0), 0);

    if (!currentTechId) {
        return <div>Loading...</div>;
    }

    return (
        <div>
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2"><Coins size={12} /> Payroll & Earnings</p>
                    <h1 className="page-title">My Earnings</h1>
                    <p className="page-subtitle">Track your log statuses and view your payment history.</p>
                </div>
            </header>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Paid (YTD)</CardTitle>
                        <PiggyBank className="h-4 w-4 text-text-muted" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-text-green">${totalPaid.toFixed(2)}</div>
                        <p className="text-xs text-text-muted">Across all approved logs.</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending Payout</CardTitle>
                        <FileClock className="h-4 w-4 text-text-muted" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-accent-gold">${pendingPayout.toFixed(2)}</div>
                        <p className="text-xs text-text-muted">From submitted logs pending approval.</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Log History</CardTitle>
                    <CardDescription>A summary of your submitted weekly logs and their payout status.</CardDescription>
                </CardHeader>
                <CardContent className="table-wrap p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Week Of</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Total Payout</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs.map(log => (
                                <TableRow key={log.id}>
                                    <TableCell className="font-semibold">{log.weekOf}</TableCell>
                                    <TableCell>
                                        <Badge variant={log.status === 'Approved' ? 'completed' : log.status === 'Submitted' ? 'onhold' : 'pending'}>
                                            {log.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                        {log.totalPayout ? (
                                            <span className={log.status === 'Approved' ? 'text-text-green' : 'text-text-primary'}>
                                                ${log.totalPayout.toFixed(2)}
                                            </span>
                                        ) : (
                                            <span className="text-text-muted">N/A</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {logs.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3} className="h-24 text-center text-text-muted">No earnings history found.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
