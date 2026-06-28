'use client';

import { useState, useMemo, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Receipt, Search, ChevronDown, ChevronRight, DollarSign, CheckCircle, Clock, X, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO, isWithinInterval } from 'date-fns';
import type { Technician, WeeklyLog, WeeklyLogItem } from '@/lib/types';

export default function PayrollAuditPage() {
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

    useEffect(() => {
        const unsubT = onSnapshot(collection(db, 'users'), snap => {
            setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
        });
        const unsubL = onSnapshot(collection(db, 'weeklyLogs'), snap => {
            setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)));
        });
        return () => { unsubT(); unsubL(); };
    }, []);

    const staffTechs = useMemo(
        () => technicians.filter(t => !t.roles?.includes('client')),
        [technicians]
    );

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
                                "h-9 px-3 text-[9px] font-black uppercase tracking-widest rounded-lg border transition-colors",
                                statusFilter === s
                                    ? 'bg-brand-red text-white border-brand-red'
                                    : 'border-border-main text-text-muted hover:text-text-primary bg-bg-primary'
                            )}
                        >
                            {s === 'all' ? 'All' : s}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        className="h-9 px-3 rounded-lg border border-border-main bg-bg-primary text-[10px] font-bold text-text-primary"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        title="From"
                    />
                    <span className="text-[9px] text-text-muted">to</span>
                    <input
                        type="date"
                        className="h-9 px-3 rounded-lg border border-border-main bg-bg-primary text-[10px] font-bold text-text-primary"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        title="To"
                    />
                    {(dateFrom || dateTo) && (
                        <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-[9px] text-brand-red font-black uppercase hover:underline">Clear</button>
                    )}
                </div>
            </div>

            {/* Log list */}
            {filteredLogs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-sub p-16 text-center">
                    <Receipt size={28} className="text-text-muted mx-auto mb-3" />
                    <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest">No logs match your filters</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filteredLogs.map(log => {
                        const tech = technicians.find(t => t.id === log.techId);
                        const isExpanded = expandedLogs.has(log.id);
                        return (
                            <div key={log.id} className="rounded-xl border border-border-sub bg-bg-secondary overflow-hidden">
                                <button
                                    onClick={() => toggleExpand(log.id)}
                                    className="w-full flex items-center gap-4 p-3 hover:bg-bg-tertiary transition-colors text-left"
                                >
                                    <div className="flex-1 min-w-0 grid grid-cols-4 gap-3 items-center">
                                        <div>
                                            <p className="text-[11px] font-bold text-text-primary uppercase">{tech?.name || log.techId}</p>
                                            <p className="text-[9px] text-text-muted font-mono">Week of {log.weekOf}</p>
                                        </div>
                                        <Badge variant={statusVariant(log.status)} className="text-[7px] uppercase h-4 w-fit">{log.status}</Badge>
                                        <div className="text-right">
                                            <p className={cn("text-[12px] font-bold font-mono", log.status === 'Approved' ? 'text-text-green' : 'text-text-primary')}>
                                                ${(log.totalPayout || 0).toFixed(2)}
                                            </p>
                                            <p className="text-[8px] text-text-muted uppercase">{log.items?.length || 0} items</p>
                                        </div>
                                        <div className="text-right text-[9px] text-text-muted uppercase">
                                            {log.submittedAt ? format(parseISO(log.submittedAt), 'MM/dd/yy') : '—'}
                                        </div>
                                    </div>
                                    {isExpanded ? <ChevronDown size={14} className="text-text-muted shrink-0" /> : <ChevronRight size={14} className="text-text-muted shrink-0" />}
                                </button>
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
            )}
        </div>
    );
}
