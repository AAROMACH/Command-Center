'use client';

import { useState, useMemo, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Receipt, Search, ChevronDown, ChevronRight, DollarSign, CheckCircle, Clock, X, Download, Plus, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO, isWithinInterval } from 'date-fns';
import type { Technician, WeeklyLog, WeeklyLogItem, WorkOrder } from '@/lib/types';
import { isClient, isTech } from '@/lib/permissions';
import { mergeJobs } from '@/lib/jobs';
import { PayrollReviewDialog } from '@/app/admin/financials/components/payroll-review-dialog';

export default function PayrollAuditPage() {
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
    const [adjustments, setAdjustments] = useState<any[]>([]);
    const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
    const [adjustForm, setAdjustForm] = useState({ techId: '', amount: '', reason: '', date: '' });
    const [adjustSaving, setAdjustSaving] = useState(false);
    // Weekly-log audit review (moved here from the Accounting page).
    const [reviewLog, setReviewLog] = useState<WeeklyLog | null>(null);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [assignments, setAssignments] = useState<WorkOrder[]>([]);
    const missions = useMemo(() => mergeJobs(workOrders, assignments), [workOrders, assignments]);

    useEffect(() => {
        const unsubT = onSnapshot(collection(db, 'users'), snap => {
            setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
        });
        const unsubL = onSnapshot(collection(db, 'weeklyLogs'), snap => {
            setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)));
        });
        const unsubAdj = onSnapshot(collection(db, 'payrollAdjustments'), snap => {
            setAdjustments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        });
        const unsubWO = onSnapshot(collection(db, 'workOrders'), snap => {
            setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });
        const unsubAsmt = onSnapshot(collection(db, 'assignments'), snap => {
            setAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });
        return () => { unsubT(); unsubL(); unsubAdj(); unsubWO(); unsubAsmt(); };
    }, []);

    const openReview = (log: WeeklyLog) => { setReviewLog(log); setReviewOpen(true); };

    const staffTechs = useMemo(
        () => technicians.filter(t => !isClient(t)),
        [technicians]
    );

    const staffUserIds = useMemo(
        () => new Set(staffTechs.filter(t => !isTech(t)).map(t => t.id)),
        [staffTechs]
    );

    const staffFilteredLogs = useMemo(() => {
        return weeklyLogs
            .filter(log => {
                if (!staffUserIds.has(log.techId)) return false;
                const tech = technicians.find(t => t.id === log.techId);
                const techName = (tech?.name || '').toLowerCase();
                if (searchQuery && !techName.includes(searchQuery.toLowerCase())) return false;
                if (statusFilter !== 'all' && log.status !== statusFilter) return false;
                return true;
            })
            .sort((a, b) => b.weekOf.localeCompare(a.weekOf));
    }, [weeklyLogs, technicians, staffUserIds, searchQuery, statusFilter]);

    const approvedLogsByTech = useMemo(() => {
        const approved = weeklyLogs.filter(l => l.status === 'Approved');
        const byTech: Record<string, { tech: Technician | undefined; logs: WeeklyLog[] }> = {};
        approved.forEach(log => {
            if (!byTech[log.techId]) {
                byTech[log.techId] = { tech: technicians.find(t => t.id === log.techId), logs: [] };
            }
            byTech[log.techId].logs.push(log);
        });
        Object.values(byTech).forEach(entry => entry.logs.sort((a, b) => b.weekOf.localeCompare(a.weekOf)));
        return Object.entries(byTech).sort(([, a], [, b]) => (a.tech?.name || '').localeCompare(b.tech?.name || ''));
    }, [weeklyLogs, technicians]);

    const filteredLogs = useMemo(() => {
        return weeklyLogs
            .filter(log => {
                const tech = technicians.find(t => t.id === log.techId);
                const techName = (tech?.name || '').toLowerCase();
                if (searchQuery && !techName.includes(searchQuery.toLowerCase())) return false;
                if (statusFilter !== 'all' && log.status !== statusFilter) return false;
                if (dateFrom && log.weekOf < dateFrom) return false;
                if (dateTo && log.weekOf > dateTo) return false;
                return true;
            })
            .sort((a, b) => b.weekOf.localeCompare(a.weekOf));
    }, [weeklyLogs, technicians, searchQuery, statusFilter, dateFrom, dateTo]);

    const totals = useMemo(() => ({
        approved: filteredLogs.filter(l => l.status === 'Approved').reduce((s, l) => s + (l.totalPayout || 0), 0),
        pending: filteredLogs.filter(l => l.status === 'Submitted').reduce((s, l) => s + (l.totalPayout || 0), 0),
        count: filteredLogs.length,
    }), [filteredLogs]);

    const toggleExpand = (id: string) => {
        setExpandedLogs(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleExportCsv = () => {
        const rows = [['Week Of', 'Tech', 'Status', 'Total Payout', 'Items']];
        filteredLogs.forEach(log => {
            const tech = technicians.find(t => t.id === log.techId);
            rows.push([
                log.weekOf,
                tech?.name || log.techId,
                log.status,
                String(log.totalPayout || 0),
                String(log.items?.length || 0),
            ]);
        });
        const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payroll-audit.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const statusVariant = (s: string): any => s === 'Approved' ? 'active' : s === 'Submitted' ? 'scheduled' : s === 'Rejected' ? 'destructive' : 'onhold';

    const renderLogList = (logs: WeeklyLog[]) => (
        logs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-sub p-16 text-center">
                <Receipt size={28} className="text-text-muted mx-auto mb-3" />
                <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest">No logs match your filters</p>
            </div>
        ) : (
            <div className="space-y-2">
                {logs.map(log => {
                    const tech = technicians.find(t => t.id === log.techId);
                    const isExpanded = expandedLogs.has(log.id);
                    return (
                        <div key={log.id} className="rounded-xl border border-border-sub bg-bg-secondary overflow-hidden">
                            <div className="w-full flex items-center gap-3 p-3 hover:bg-bg-tertiary transition-colors text-left">
                                <button
                                    onClick={() => toggleExpand(log.id)}
                                    className="flex-1 min-w-0 grid grid-cols-4 gap-3 items-center text-left"
                                >
                                    <div>
                                        <p className="text-[11px] font-bold text-text-primary uppercase">{tech?.name || log.techId}</p>
                                        <p className="text-[9px] text-text-muted font-mono">Week of {log.weekOf}</p>
                                    </div>
                                    <Badge variant={statusVariant(log.status)} className="text-[7px] uppercase h-4 w-fit">{log.status}</Badge>
                                    <div className="text-right">
                                        <p className={cn('text-[12px] font-bold font-mono', log.status === 'Approved' ? 'text-text-green' : 'text-text-primary')}>
                                            ${(log.totalPayout || 0).toFixed(2)}
                                        </p>
                                        <p className="text-[8px] text-text-muted uppercase">{log.items?.length || 0} items</p>
                                    </div>
                                    <div className="text-right text-[9px] text-text-muted uppercase">
                                        {log.submittedAt ? format(parseISO(log.submittedAt), 'MM/dd/yy') : '—'}
                                    </div>
                                </button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 shrink-0 text-[9px] font-bold uppercase tracking-widest"
                                    onClick={() => openReview(log)}
                                >
                                    <Receipt size={11} className="mr-1.5" /> Audit Log
                                </Button>
                                <button onClick={() => toggleExpand(log.id)} className="shrink-0 p-1 text-text-muted" aria-label="Expand">
                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                            </div>
                            {isExpanded && log.items && log.items.length > 0 && (
                                <div className="border-t border-border-sub divide-y divide-border-sub">
                                    {log.items.map((item: WeeklyLogItem) => (
                                        <div key={item.id} className="flex items-center justify-between px-5 py-2.5 bg-bg-primary">
                                            <div>
                                                <p className="text-[10px] font-bold text-text-primary uppercase font-mono">{item.workOrderId?.toUpperCase() || item.id}</p>
                                                {item.outcomeCode && <p className="text-[9px] text-text-muted uppercase">{item.outcomeCode.replace(/_/g, ' ')}</p>}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {item.confirmationStatus && (
                                                    <Badge variant={item.confirmationStatus === 'confirmed' ? 'active' : 'destructive'} className="text-[7px] uppercase h-4">
                                                        {item.confirmationStatus}
                                                    </Badge>
                                                )}
                                                <p className="text-[11px] font-bold text-text-primary font-mono">${(item.jobPay || 0).toFixed(2)}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {log.reimbursements && log.reimbursements.length > 0 && (
                                        <div className="px-5 py-2 bg-bg-primary/50">
                                            <p className="text-[8px] font-black text-text-muted uppercase tracking-widest mb-1">Reimbursements</p>
                                            {log.reimbursements.map(r => (
                                                <div key={r.id} className="flex justify-between text-[9px] text-text-muted py-0.5">
                                                    <span>{r.description}</span>
                                                    <span className="font-mono">${r.amount.toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        )
    );

    return (
        <div className="space-y-5">
            <header className="page-header">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <Receipt size={12} />
                        Financial Registry
                    </p>
                    <h1 className="page-title">Payroll Audit</h1>
                    <p className="page-subtitle">Full audit trail of weekly log submissions and approvals.</p>
                </div>
                <div className="page-header-right">
                    <Button variant="outline" size="sm" className="h-9 text-[10px] font-bold uppercase border-border-main" onClick={handleExportCsv}>
                        <Download size={12} className="mr-1.5" /> Export CSV
                    </Button>
                </div>
            </header>

            {/* Summary chips */}
            <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-text-green/10 border border-text-green/20">
                    <CheckCircle size={12} className="text-text-green" />
                    <span className="text-[10px] font-black text-text-green uppercase">${totals.approved.toFixed(2)} approved</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-text-amber/10 border border-text-amber/20">
                    <Clock size={12} className="text-text-amber" />
                    <span className="text-[10px] font-black text-text-amber uppercase">${totals.pending.toFixed(2)} pending</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-secondary border border-border-sub">
                    <DollarSign size={12} className="text-text-muted" />
                    <span className="text-[10px] font-black text-text-muted uppercase">{totals.count} log{totals.count !== 1 ? 's' : ''} shown</span>
                </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="weekly" className="w-full">
                <TabsList className="border-b border-border-sub bg-transparent rounded-none h-auto p-0 gap-8 justify-start mb-4">
                    {[
                        { value: 'weekly', label: 'Weekly', count: filteredLogs.length },
                        { value: 'staff', label: 'Staff Pay', count: staffFilteredLogs.length },
                        { value: 'history', label: 'Paystub History', count: approvedLogsByTech.length },
                        { value: 'adjustments', label: 'Adjustments', count: adjustments.length },
                    ].map(t => (
                        <TabsTrigger key={t.value} value={t.value} className="px-0 pb-3 pt-0 h-auto bg-transparent rounded-none border-b-2 border-transparent text-[11px] font-black uppercase tracking-[0.2em] text-text-muted data-[state=active]:bg-transparent data-[state=active]:text-text-primary data-[state=active]:border-brand-red data-[state=active]:shadow-none transition-all flex items-center gap-2">
                            {t.label}
                            {t.count > 0 && <span className="text-[8px] font-black bg-bg-tertiary text-text-muted border border-border-sub px-1.5 py-0.5 rounded">{t.count}</span>}
                        </TabsTrigger>
                    ))}
                </TabsList>

                {/* ── Weekly ── */}
                <TabsContent value="weekly" className="m-0 space-y-4">
                    {/* Filters */}
                    <div className="flex flex-wrap gap-3 p-3 bg-bg-secondary/60 border border-border-sub rounded-xl">
                        <div className="relative flex-1 min-w-[180px]">
                            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                            <input
                                className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-main bg-bg-primary text-[11px] font-bold uppercase tracking-wide text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-red transition-colors"
                                placeholder="Search by tech name..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            {(['all', 'Draft', 'Submitted', 'Approved', 'Rejected'] as const).map(s => (
                                <button
                                    key={s}
                                    onClick={() => setStatusFilter(s)}
                                    className={cn(
                                        'h-9 px-3 text-[9px] font-black uppercase tracking-widest rounded-lg border transition-colors',
                                        statusFilter === s ? 'bg-brand-red text-white border-brand-red' : 'border-border-main text-text-muted hover:text-text-primary bg-bg-primary'
                                    )}
                                >
                                    {s === 'all' ? 'All' : s}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="date" className="h-9 px-3 rounded-lg border border-border-main bg-bg-primary text-[10px] font-bold text-text-primary" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From" />
                            <span className="text-[9px] text-text-muted">to</span>
                            <input type="date" className="h-9 px-3 rounded-lg border border-border-main bg-bg-primary text-[10px] font-bold text-text-primary" value={dateTo} onChange={e => setDateTo(e.target.value)} title="To" />
                            {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-[9px] text-brand-red font-black uppercase hover:underline">Clear</button>}
                        </div>
                    </div>
                    {renderLogList(filteredLogs)}
                </TabsContent>

                {/* ── Staff Pay ── */}
                <TabsContent value="staff" className="m-0 space-y-4">
                    <div className="flex flex-wrap gap-3 p-3 bg-bg-secondary/60 border border-border-sub rounded-xl">
                        <div className="relative flex-1 min-w-[180px]">
                            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                            <input
                                className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-main bg-bg-primary text-[11px] font-bold uppercase tracking-wide text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-red transition-colors"
                                placeholder="Search staff name..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            {(['all', 'Draft', 'Submitted', 'Approved', 'Rejected'] as const).map(s => (
                                <button key={s} onClick={() => setStatusFilter(s)} className={cn('h-9 px-3 text-[9px] font-black uppercase tracking-widest rounded-lg border transition-colors', statusFilter === s ? 'bg-brand-red text-white border-brand-red' : 'border-border-main text-text-muted hover:text-text-primary bg-bg-primary')}>
                                    {s === 'all' ? 'All' : s}
                                </button>
                            ))}
                        </div>
                    </div>
                    {renderLogList(staffFilteredLogs)}
                </TabsContent>

                {/* ── Paystub History ── */}
                <TabsContent value="history" className="m-0 space-y-3">
                    {approvedLogsByTech.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border-sub p-16 text-center">
                            <Receipt size={28} className="text-text-muted mx-auto mb-3" />
                            <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest">No approved logs yet</p>
                        </div>
                    ) : approvedLogsByTech.map(([techId, { tech, logs }]) => (
                        <div key={techId} className="rounded-xl border border-border-sub bg-bg-secondary overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 bg-bg-tertiary/30 border-b border-border-sub">
                                <div>
                                    <p className="text-[11px] font-bold text-text-primary uppercase">{tech?.name || techId}</p>
                                    <p className="text-[9px] text-text-muted uppercase">{logs.length} approved logs · ${logs.reduce((s, l) => s + (l.totalPayout || 0), 0).toFixed(2)} total</p>
                                </div>
                                <Badge variant="active" className="text-[7px] uppercase h-4">{logs.length} stubs</Badge>
                            </div>
                            <div className="divide-y divide-border-sub">
                                {logs.slice(0, 12).map(log => (
                                    <div key={log.id} className="flex items-center justify-between px-4 py-2.5">
                                        <div>
                                            <p className="text-[10px] font-bold text-text-primary font-mono">Week of {log.weekOf}</p>
                                            <p className="text-[9px] text-text-muted">{log.items?.length || 0} items</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <p className="text-[12px] font-bold font-mono text-text-green">${(log.totalPayout || 0).toFixed(2)}</p>
                                            <button className="text-[9px] text-text-muted hover:text-text-primary uppercase font-bold border border-border-sub rounded px-2 py-0.5 hover:border-border-main transition-colors" onClick={() => {
                                                const content = `PAYSTUB\nTech: ${tech?.name || techId}\nWeek: ${log.weekOf}\nTotal: $${(log.totalPayout || 0).toFixed(2)}\nStatus: ${log.status}\nItems: ${log.items?.length || 0}`;
                                                const blob = new Blob([content], { type: 'text/plain' });
                                                const a = document.createElement('a');
                                                a.href = URL.createObjectURL(blob);
                                                a.download = `paystub-${tech?.name?.replace(/\s+/g, '-') || techId}-${log.weekOf}.txt`;
                                                a.click();
                                            }}>
                                                <Download size={9} className="inline mr-0.5" /> Stub
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </TabsContent>

                {/* ── Adjustments ── */}
                <TabsContent value="adjustments" className="m-0 space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">{adjustments.length} Adjustment{adjustments.length !== 1 ? 's' : ''}</p>
                        <Button size="sm" className="h-8 text-[10px] font-bold uppercase bg-brand-red hover:bg-brand-red/90 text-white" onClick={() => setAdjustDialogOpen(true)}>
                            <Plus size={11} className="mr-1.5" /> Add Adjustment
                        </Button>
                    </div>
                    <div className="rounded-xl border border-border-sub overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-border-sub">
                                    <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Tech</TableHead>
                                    <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Date</TableHead>
                                    <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Amount</TableHead>
                                    <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Reason</TableHead>
                                    <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Added By</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {adjustments.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(adj => {
                                    const tech = technicians.find(t => t.id === adj.techId);
                                    const amount = parseFloat(adj.amount || 0);
                                    return (
                                        <TableRow key={adj.id} className="border-border-sub hover:bg-bg-secondary">
                                            <TableCell className="font-bold text-[11px] uppercase text-text-primary">{tech?.name || adj.techId}</TableCell>
                                            <TableCell className="text-[10px] text-text-muted">{adj.date ? new Date(adj.date).toLocaleDateString() : '—'}</TableCell>
                                            <TableCell className={cn('text-[11px] font-black font-mono', amount >= 0 ? 'text-text-green' : 'text-text-red')}>
                                                {amount >= 0 ? '+' : ''}${amount.toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-[10px] text-text-muted max-w-[200px] truncate">{adj.reason || '—'}</TableCell>
                                            <TableCell className="text-[10px] text-text-muted">{adj.addedBy || '—'}</TableCell>
                                        </TableRow>
                                    );
                                })}
                                {adjustments.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-12 text-[10px] text-text-muted uppercase tracking-widest">No adjustments recorded</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>
            </Tabs>

            {/* Add Adjustment Dialog */}
            <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
                            <SlidersHorizontal size={14} className="text-brand-red" /> Add Adjustment
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Technician</Label>
                            <Select value={adjustForm.techId} onValueChange={v => setAdjustForm(p => ({ ...p, techId: v }))}>
                                <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main"><SelectValue placeholder="Select tech..." /></SelectTrigger>
                                <SelectContent className="bg-bg-elevated border-border-main">
                                    {staffTechs.map(t => <SelectItem key={t.id} value={t.id} className="text-[11px]">{t.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Amount (use negative for deductions)</Label>
                            <Input type="number" step="0.01" className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. 50.00 or -25.00" value={adjustForm.amount} onChange={e => setAdjustForm(p => ({ ...p, amount: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Reason</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Reason for adjustment" value={adjustForm.reason} onChange={e => setAdjustForm(p => ({ ...p, reason: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Date</Label>
                            <Input type="date" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={adjustForm.date} onChange={e => setAdjustForm(p => ({ ...p, date: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" size="sm" onClick={() => setAdjustDialogOpen(false)} className="text-[10px] font-black uppercase">Cancel</Button>
                        <Button size="sm" disabled={!adjustForm.techId || !adjustForm.amount || adjustSaving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase" onClick={async () => {
                            setAdjustSaving(true);
                            const currentUserId = sessionStorage.getItem('currentUserId') || '';
                            const addedByTech = technicians.find(t => t.id === currentUserId);
                            await addDoc(collection(db, 'payrollAdjustments'), {
                                ...adjustForm,
                                amount: parseFloat(adjustForm.amount),
                                addedBy: addedByTech?.name || 'Admin',
                                createdAt: new Date().toISOString(),
                            });
                            setAdjustForm({ techId: '', amount: '', reason: '', date: '' });
                            setAdjustDialogOpen(false);
                            setAdjustSaving(false);
                        }}>
                            {adjustSaving ? 'Saving...' : 'Add Adjustment'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {reviewLog && (
                <PayrollReviewDialog
                    isOpen={reviewOpen}
                    setIsOpen={setReviewOpen}
                    log={reviewLog}
                    technician={technicians.find(t => t.id === reviewLog.techId)}
                    missions={missions}
                    allTechnicians={technicians}
                    allWeeklyLogs={weeklyLogs}
                    onStatusChange={() => { /* weeklyLogs listener refreshes the list live */ }}
                />
            )}
        </div>
    );
}
