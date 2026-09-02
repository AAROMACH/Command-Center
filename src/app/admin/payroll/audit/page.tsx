'use client';

import { useState, useMemo, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogFooter,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogAction,
    AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Receipt, Search, ChevronDown, ChevronRight, DollarSign, CheckCircle, Clock, X, Download, Plus, SlidersHorizontal, MergeIcon, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO, isWithinInterval } from 'date-fns';
import type { Technician, WeeklyLog, WeeklyLogItem, WorkOrder } from '@/lib/types';
import { isClient, isTech, isSuperAdmin } from '@/lib/permissions';
import { mergeJobs } from '@/lib/jobs';
import { effectiveJobPay, computeWeeklyLogSettlement, netOfFieldNationFee } from '@/lib/payroll';
import { auditEvent } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';
import { PayrollReviewDialog } from '@/app/admin/financials/components/payroll-review-dialog';

// Within a group of duplicate weekly logs for the same tech+week, picks the
// one considered the legitimate original: whichever left Draft first
// (Submitted/Approved/Rejected outranks Draft — never treat a log that's
// already out of the tech's hands as the throwaway copy), tie-broken by
// item count (the copy that kept receiving completions is the real one).
// This is the log Merge keeps and the only one the per-log Delete button
// refuses to remove.
function pickPrimaryLog(group: WeeklyLog[]): WeeklyLog {
    const statusRank: Record<string, number> = { Approved: 3, Rejected: 3, Submitted: 2, Draft: 1 };
    return [...group].sort((a, b) => {
        const rankDiff = (statusRank[b.status] || 0) - (statusRank[a.status] || 0);
        if (rankDiff !== 0) return rankDiff;
        return (b.items?.length || 0) - (a.items?.length || 0);
    })[0];
}

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
    const jobsById = useMemo(() => new Map(missions.map(m => [m.id, m])), [missions]);
    // Memoized per-log settlement so every display/export site (row totals,
    // CSV, summary chips, Paystub History) reads the exact same number as
    // the review dialog's "Net Tech Settlement" — computed once per log
    // instead of re-deriving it inline at each call site.
    const settlementByLogId = useMemo(() => {
        const map = new Map<string, number>();
        weeklyLogs.forEach(log => map.set(log.id, computeWeeklyLogSettlement(log, jobsById)));
        return map;
    }, [weeklyLogs, jobsById]);
    const settlementOf = (log: WeeklyLog) => settlementByLogId.get(log.id) ?? computeWeeklyLogSettlement(log, jobsById);

    // Full itemized paystub text — company header, tech name, the Mon-Sun
    // pay period, and every VERIFIED job that contributed to the total
    // (disputed items are excluded, same as the settlement total itself,
    // since they aren't being paid). weekOf is stored 'MM-dd-yyyy' as the
    // Monday of that week.
    const buildPaystubContent = (log: WeeklyLog, tech: Technician | undefined, techId: string): string => {
        const [wm, wd, wy] = log.weekOf.split('-').map(Number);
        const weekStart = new Date(wy || 1970, (wm || 1) - 1, wd || 1);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        const verifiedItems = (log.items || []).filter(i => i.confirmationStatus !== 'disputed');
        const jobLines = verifiedItems.map((item, idx) => {
            const job = jobsById.get(item.workOrderId);
            const label = job?.title || job?.description || item.workOrderId?.toUpperCase() || 'Untitled Job';
            const dateStr = job?.scheduleDate || item.workDate || 'N/A';
            const timeStr = job?.scheduleTime || 'N/A';
            const pay = effectiveJobPay(item, job);
            return `${idx + 1}. ${label}\n   Date: ${dateStr}   Time: ${timeStr}\n   Pay:  $${pay.toFixed(2)}`;
        });

        const approvedReimbursements = (log.reimbursements || []).filter(r => r.status !== 'pending' && r.status !== 'rejected');
        const reimbLines = approvedReimbursements.map(r => `- ${r.description || 'Reimbursement'}: $${netOfFieldNationFee(r.amount).toFixed(2)}`);

        const rule = '='.repeat(44);
        const thin = '-'.repeat(44);
        const lines = [
            'AAROMACH LLC',
            'PAYSTUB',
            rule,
            `Document ID:  ${log.id.toUpperCase()}`,
            `Generated:    ${format(new Date(), 'MM/dd/yyyy h:mm a')}`,
            thin,
            `Technician:   ${tech?.name || techId}`,
            `Pay Period:   ${format(weekStart, 'MM/dd/yyyy')} - ${format(weekEnd, 'MM/dd/yyyy')}`,
            `Payment Method: ${tech?.payoutPreferences?.method || 'Not on file'}`,
            `Status:       ${log.status}`,
            thin,
            `VERIFIED JOBS (${verifiedItems.length})`,
            thin,
            jobLines.length ? jobLines.join('\n\n') : '(none)',
        ];

        if (reimbLines.length) {
            lines.push(thin, 'REIMBURSEMENTS', thin, reimbLines.join('\n'));
        }

        lines.push(thin, `TOTAL PAID:   $${settlementOf(log).toFixed(2)}`, rule);
        return lines.join('\n');
    };
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [mergingKey, setMergingKey] = useState<string | null>(null);
    const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
    const [logToDelete, setLogToDelete] = useState<{ log: WeeklyLog; primary: WeeklyLog } | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        setCurrentUserId(typeof window !== 'undefined' ? sessionStorage.getItem('currentUserId') : null);
    }, []);
    const currentUser = technicians.find(t => t.id === currentUserId) || null;

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
        approved: filteredLogs.filter(l => l.status === 'Approved').reduce((s, l) => s + settlementOf(l), 0),
        pending: filteredLogs.filter(l => l.status === 'Submitted').reduce((s, l) => s + settlementOf(l), 0),
        count: filteredLogs.length,
    }), [filteredLogs]);

    // A tech should only ever have ONE weeklyLogs doc per week. More than one
    // for the same techId+weekOf is a data-integrity bug (a race between two
    // near-simultaneous job completions each creating their own log before
    // either write landed) rather than a normal state, so surface it and
    // offer a one-click merge instead of leaving it silently wrong.
    const duplicateLogGroups = useMemo(() => {
        const byKey = new Map<string, WeeklyLog[]>();
        weeklyLogs.forEach(log => {
            const key = `${log.techId}__${log.weekOf}`;
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key)!.push(log);
        });
        return Array.from(byKey.entries())
            .filter(([, group]) => group.length > 1)
            .map(([key, group]) => ({ key, group, primary: pickPrimaryLog(group) }));
    }, [weeklyLogs]);

    const handleMergeDuplicateLogs = async (group: WeeklyLog[]) => {
        const key = `${group[0].techId}__${group[0].weekOf}`;
        setMergingKey(key);
        try {
            const primary = pickPrimaryLog(group);
            const rest = group.filter(l => l.id !== primary.id);

            const items = [...(primary.items || [])];
            const seenWoIds = new Set(items.map(i => i.workOrderId));
            const reimbursements = [...(primary.reimbursements || [])];
            const seenReimbIds = new Set(reimbursements.map(r => r.id));
            const missingAssignmentReports = [...(primary.missingAssignmentReports || [])];
            const seenReportIds = new Set(missingAssignmentReports.map(r => r.id));

            rest.forEach(log => {
                (log.items || []).forEach(item => {
                    if (!seenWoIds.has(item.workOrderId)) { items.push(item); seenWoIds.add(item.workOrderId); }
                });
                (log.reimbursements || []).forEach(r => {
                    if (!seenReimbIds.has(r.id)) { reimbursements.push(r); seenReimbIds.add(r.id); }
                });
                (log.missingAssignmentReports || []).forEach(r => {
                    if (!seenReportIds.has(r.id)) { missingAssignmentReports.push(r); seenReportIds.add(r.id); }
                });
            });

            const totalPayout = computeWeeklyLogSettlement({ items, reimbursements, missingAssignmentReports }, jobsById);

            await updateDoc(doc(db, 'weeklyLogs', primary.id), { items, reimbursements, missingAssignmentReports, totalPayout });
            for (const log of rest) {
                await deleteDoc(doc(db, 'weeklyLogs', log.id));
            }

            const adminId = auth.currentUser?.uid || currentUser?.id || '';
            const adminName = auth.currentUser?.displayName || currentUser?.name || 'Admin';
            await auditEvent(
                'weeklyLogs', primary.id, adminId, adminName, 'merged_duplicate',
                `Merged ${rest.length} duplicate log${rest.length > 1 ? 's' : ''} (${rest.map(l => l.id).join(', ')}) for week of ${primary.weekOf} into ${primary.id}.`
            ).catch(() => {});

            toast({ title: 'Logs Merged', description: `Combined ${group.length} logs for week of ${primary.weekOf} into ${primary.id.toUpperCase()}.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Merge Failed', description: e.message });
        } finally {
            setMergingKey(null);
        }
    };

    // Discards a duplicate log outright (no merge — its items are dropped).
    // The log identified as the original by pickPrimaryLog() is never
    // offered this button in the UI, but guard it here too in case a stale
    // click slips through a re-render.
    const handleDeleteDuplicateLog = async (log: WeeklyLog, primary: WeeklyLog) => {
        if (log.id === primary.id) return;
        setDeletingLogId(log.id);
        try {
            await deleteDoc(doc(db, 'weeklyLogs', log.id));
            const adminId = auth.currentUser?.uid || currentUser?.id || '';
            const adminName = auth.currentUser?.displayName || currentUser?.name || 'Admin';
            await auditEvent(
                'weeklyLogs', log.id, adminId, adminName, 'deleted_duplicate',
                `Deleted duplicate log ${log.id} (${log.items?.length || 0} item${(log.items?.length || 0) === 1 ? '' : 's'}) for week of ${log.weekOf} — original kept: ${primary.id}.`
            ).catch(() => {});
            toast({ title: 'Duplicate Deleted', description: `Removed ${log.id.toUpperCase()}. Original ${primary.id.toUpperCase()} kept.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Delete Failed', description: e.message });
        } finally {
            setDeletingLogId(null);
            setLogToDelete(null);
        }
    };

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
                String(settlementOf(log)),
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
                                            ${settlementOf(log).toFixed(2)}
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
                                    {log.items.map((item: WeeklyLogItem) => {
                                        const disputed = item.confirmationStatus === 'disputed';
                                        return (
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
                                                <p className={cn(
                                                    'text-[11px] font-bold font-mono',
                                                    disputed ? 'text-text-muted line-through' : 'text-text-primary'
                                                )}>
                                                    ${effectiveJobPay(item, jobsById.get(item.workOrderId)).toFixed(2)}
                                                </p>
                                            </div>
                                        </div>
                                        );
                                    })}
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

            {/* Duplicate weekly log warning — a tech should never have two logs
                for the same week; surface it, identify which one is the
                legitimate original, and offer either a one-click merge or a
                per-log delete for the extras (the original is never
                deletable this way). */}
            {duplicateLogGroups.length > 0 && (
                <div className="space-y-2">
                    {duplicateLogGroups.map(({ key, group, primary }) => {
                        const tech = technicians.find(t => t.id === group[0].techId);
                        const totalItems = group.reduce((s, l) => s + (l.items?.length || 0), 0);
                        const uniqueItems = new Set(group.flatMap(l => (l.items || []).map(i => i.workOrderId))).size;
                        const superAdmin = isSuperAdmin(currentUser);
                        return (
                            <div key={key} className="rounded-lg bg-brand-red-dim/10 border border-brand-red/30 overflow-hidden">
                                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <AlertTriangle size={16} className="text-brand-red shrink-0" />
                                        <div>
                                            <p className="text-[11px] font-black uppercase tracking-widest text-brand-red">
                                                {group.length} duplicate logs — {tech?.name || group[0].techId} — week of {group[0].weekOf}
                                            </p>
                                            <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest">
                                                {totalItems} total job entries across the {group.length} logs ({uniqueItems} unique) — merge combines everything, or delete an individual duplicate below.
                                            </p>
                                        </div>
                                    </div>
                                    {superAdmin ? (
                                        <Button
                                            size="sm"
                                            className="h-8 text-[9px] font-bold uppercase tracking-widest bg-brand-red hover:bg-brand-red-hover shrink-0"
                                            disabled={mergingKey === key}
                                            onClick={() => handleMergeDuplicateLogs(group)}
                                        >
                                            <MergeIcon size={12} className="mr-1.5" />
                                            {mergingKey === key ? 'Merging…' : 'Merge Into One'}
                                        </Button>
                                    ) : (
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted shrink-0">Super admin required</p>
                                    )}
                                </div>
                                <div className="divide-y divide-brand-red/20 border-t border-brand-red/20 bg-bg-primary/40">
                                    {group.map(log => {
                                        const isPrimary = log.id === primary.id;
                                        return (
                                            <div key={log.id} className="flex items-center justify-between gap-3 px-4 py-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="text-[10px] font-mono font-bold text-text-primary uppercase">{log.id}</span>
                                                    <Badge variant="outline" className="h-4 px-1.5 text-[8px] uppercase tracking-widest shrink-0">{log.status}</Badge>
                                                    <span className="text-[9px] text-text-muted uppercase font-bold tracking-widest shrink-0">{log.items?.length || 0} item{(log.items?.length || 0) === 1 ? '' : 's'}</span>
                                                </div>
                                                {isPrimary ? (
                                                    <span className="text-[8px] font-black uppercase tracking-widest text-text-green shrink-0">Original — protected</span>
                                                ) : superAdmin ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-6 text-[8px] font-bold uppercase tracking-widest border-brand-red/40 text-brand-red hover:bg-brand-red-dim shrink-0"
                                                        disabled={deletingLogId === log.id}
                                                        onClick={() => setLogToDelete({ log, primary })}
                                                    >
                                                        {deletingLogId === log.id ? 'Deleting…' : 'Delete'}
                                                    </Button>
                                                ) : (
                                                    <span className="text-[8px] font-black uppercase tracking-widest text-text-muted shrink-0">Extra — needs super admin</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <AlertDialog open={!!logToDelete} onOpenChange={(open) => { if (!open) setLogToDelete(null); }}>
                <AlertDialogContent className="bg-bg-elevated border-border-main">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-text-primary uppercase font-black tracking-wide text-sm">Delete duplicate log?</AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-text-muted">
                            {logToDelete && (
                                <>
                                    This permanently deletes <span className="font-mono font-bold text-text-primary">{logToDelete.log.id.toUpperCase()}</span> and
                                    its {logToDelete.log.items?.length || 0} item{(logToDelete.log.items?.length || 0) === 1 ? '' : 's'} — they are NOT merged into the
                                    original. The original log <span className="font-mono font-bold text-text-primary">{logToDelete.primary.id.toUpperCase()}</span> is
                                    kept untouched. If the duplicate has job entries the original doesn't, use Merge Into One instead so nothing is lost.
                                </>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="uppercase font-bold text-[10px] tracking-widest">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest"
                            onClick={() => logToDelete && handleDeleteDuplicateLog(logToDelete.log, logToDelete.primary)}
                        >
                            Delete Duplicate
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

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
                                    <p className="text-[9px] text-text-muted uppercase">{logs.length} approved logs · ${logs.reduce((s, l) => s + settlementOf(l), 0).toFixed(2)} total</p>
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
                                            <p className="text-[12px] font-bold font-mono text-text-green">${settlementOf(log).toFixed(2)}</p>
                                            <button className="text-[9px] text-text-muted hover:text-text-primary uppercase font-bold border border-border-sub rounded px-2 py-0.5 hover:border-border-main transition-colors" onClick={() => {
                                                const content = buildPaystubContent(log, tech, techId);
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
