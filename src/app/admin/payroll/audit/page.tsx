'use client';
import { onSharedSnapshot } from '@/lib/shared-snapshot';
import { statusTone, TONE_BADGE } from '@/lib/status-styles';

import { useState, useMemo, useEffect } from 'react';
import { usePaged, ListPager, PAGE_SIZES_LARGE, PAGE_SIZES_SMALL } from '@/components/list-pager';
import { db, auth } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, query, where, runTransaction } from 'firebase/firestore';
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
import { ArrowLeft, Receipt, Search, ChevronDown, ChevronRight, DollarSign, CheckCircle, Clock, X, Download, Plus, SlidersHorizontal, MergeIcon, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO, isWithinInterval } from 'date-fns';
import type { Technician, WeeklyLog, WeeklyLogItem, WorkOrder, PayrollDispute, FinancialRecord } from '@/lib/types';
import { isClient, isSuperAdmin } from '@/lib/permissions';
import { mergeJobs, parseLocalDate } from '@/lib/jobs';
import { effectiveJobPay, computeWeeklyLogSettlement } from '@/lib/payroll';
import { downloadPaystub } from '@/lib/paystub';
import { auditEvent } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';
import { PayrollReviewDialog } from '@/app/admin/financials/components/payroll-review-dialog';
import { JobDetailDialog } from '@/components/job-detail-dialog';
import { displayWorkOrderNumber } from '@/lib/work-order-identity';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { SearchField } from '@/components/search-field';

// Within a group of duplicate weekly logs for the same tech+week, picks the
// one considered the legitimate original: whichever left Draft first
// (Submitted/Approved/Rejected outranks Draft — never treat a log that's
// already out of the tech's hands as the throwaway copy), tie-broken by
// item count (the copy that kept receiving completions is the real one).
// This is the log Merge keeps and the only one the per-log Delete button
// refuses to remove.
const DAY_MS = 24 * 60 * 60 * 1000;

/** weekOf ('MM-dd-yyyy', also tolerates 'yyyy-MM-dd') → local-midnight ms, or null. */
function weekOfTime(weekOf: string | undefined): number | null {
    const parts = (weekOf || '').split(/[-/]/).map(Number);
    if (parts.length !== 3 || parts.some(n => !n)) return null;
    const [a, b, c] = parts;
    const d = String(a).length === 4 ? new Date(a, b - 1, c) : new Date(c, a - 1, b);
    return isNaN(d.getTime()) ? null : d.getTime();
}

/** <input type="date"> value ('yyyy-MM-dd') → local-midnight ms. */
function inputDateTime(v: string): number {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
}

/** Newest week first — by real date, not the 'MM-dd-yyyy' string (which sorts by month before year). */
function byWeekDesc(a: WeeklyLog, b: WeeklyLog): number {
    return (weekOfTime(b.weekOf) ?? 0) - (weekOfTime(a.weekOf) ?? 0);
}

function pickPrimaryLog(group: WeeklyLog[]): WeeklyLog {
    const statusRank: Record<string, number> = { Approved: 3, Rejected: 3, Submitted: 2, Draft: 1 };
    return [...group].sort((a, b) => {
        const rankDiff = (statusRank[b.status] || 0) - (statusRank[a.status] || 0);
        if (rankDiff !== 0) return rankDiff;
        return (b.items?.length || 0) - (a.items?.length || 0);
    })[0];
}

// An ignored alert belongs to this exact set of logs and their payable
// entries. A new log, job, reimbursement, or status change shows it again.
function duplicateGroupSignature(group: WeeklyLog[]): string {
    return JSON.stringify([...group].sort((a, b) => a.id.localeCompare(b.id)).map(log => ({
        id: log.id,
        status: log.status,
        items: (log.items || []).map(item => [item.id, item.workOrderId, item.jobPay, item.confirmationStatus, item.isAdminReviewed]),
        reimbursements: (log.reimbursements || []).map(r => [r.id, r.amount, r.status]),
        reports: (log.missingAssignmentReports || []).map(r => [r.id, r.pay, r.finalPay]),
        totalPayout: log.totalPayout,
    })));
}

export default function PayrollAuditPage() {
    const router = useRouter();
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
    // Post-approval disputes techs file against a log/job after it's left
    // Draft — surfaced under Adjustments so they're visible without opening
    // each log's own review dialog. See payroll-review-dialog.tsx's
    // "Post-Approval Disputes" tab for the per-log view of the same data.
    const [payrollDisputes, setPayrollDisputes] = useState<PayrollDispute[]>([]);
    const [resolvingDisputeId, setResolvingDisputeId] = useState<string | null>(null);
    const [adjSearch, setAdjSearch] = useState('');
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
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [mergingKey, setMergingKey] = useState<string | null>(null);
    const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
    const [logToDelete, setLogToDelete] = useState<{ log: WeeklyLog; primary: WeeklyLog } | null>(null);
    const [approvedMergeGroup, setApprovedMergeGroup] = useState<WeeklyLog[] | null>(null);
    const [ignoreGroup, setIgnoreGroup] = useState<WeeklyLog[] | null>(null);
    const [ignoringKey, setIgnoringKey] = useState<string | null>(null);
    const [deleteSelectionKey, setDeleteSelectionKey] = useState<string | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        setCurrentUserId(typeof window !== 'undefined' ? sessionStorage.getItem('currentUserId') : null);
    }, []);
    const currentUser = technicians.find(t => t.id === currentUserId) || null;

    useEffect(() => {
        const unsubT = onSharedSnapshot('users', snap => {
            setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
        });
        const unsubL = onSharedSnapshot('weeklyLogs', snap => {
            setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)));
        });
        const unsubAdj = onSharedSnapshot('payrollAdjustments', snap => {
            setAdjustments(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        });
        const unsubWO = onSharedSnapshot('workOrders', snap => {
            setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });
        const unsubAsmt = onSharedSnapshot('assignments', snap => {
            setAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });
        const unsubDisputes = onSharedSnapshot('payrollDisputes', snap => {
            setPayrollDisputes(snap.docs.map(d => ({ ...d.data(), id: d.id } as PayrollDispute)));
        });
        return () => { unsubT(); unsubL(); unsubAdj(); unsubWO(); unsubAsmt(); unsubDisputes(); };
    }, []);

    const handleResolvePayrollDispute = async (dispute: PayrollDispute) => {
        setResolvingDisputeId(dispute.id);
        try {
            const adminId = auth.currentUser?.uid || currentUser?.id || '';
            const adminName = auth.currentUser?.displayName || currentUser?.name || 'Admin';
            await updateDoc(doc(db, 'payrollDisputes', dispute.id), {
                status: 'resolved',
                resolvedAt: new Date().toISOString(),
                resolvedBy: adminName,
            });
            await auditEvent(
                'payrollDisputes', dispute.id, adminId, adminName, 'resolved_dispute',
                `Resolved ${dispute.reason.replace(/_/g, ' ')} dispute from ${dispute.techName} for week of ${dispute.weekOf}.`
            ).catch(() => {});
            toast({ title: 'Dispute resolved' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could Not Resolve', description: e.message });
        } finally {
            setResolvingDisputeId(null);
        }
    };

    const openReview = (log: WeeklyLog) => { setReviewLog(log); setReviewOpen(true); };

    // Clicking a job inside an expanded log opens the shared job side panel.
    const [panelJob, setPanelJob] = useState<WorkOrder | null>(null);
    const [panelOpen, setPanelOpen] = useState(false);
    const openJobPanel = (item: WeeklyLogItem) => {
        const job = jobsById.get(item.workOrderId);
        if (!job) {
            toast({ variant: 'destructive', title: 'Job not found', description: `${item.workOrderId?.toUpperCase() || 'This entry'} has no matching job record (it may have been archived or deleted).` });
            return;
        }
        setPanelJob(job);
        setPanelOpen(true);
    };

    const staffTechs = useMemo(
        () => technicians.filter(t => !isClient(t)),
        [technicians]
    );


    const approvedLogsByTech = useMemo(() => {
        const approved = weeklyLogs.filter(l => l.status === 'Approved');
        const byTech: Record<string, { tech: Technician | undefined; logs: WeeklyLog[] }> = {};
        approved.forEach(log => {
            if (!byTech[log.techId]) {
                byTech[log.techId] = { tech: technicians.find(t => t.id === log.techId), logs: [] };
            }
            byTech[log.techId].logs.push(log);
        });
        Object.values(byTech).forEach(entry => entry.logs.sort(byWeekDesc));
        return Object.entries(byTech).sort(([, a], [, b]) => (a.tech?.name || '').localeCompare(b.tech?.name || ''));
    }, [weeklyLogs, technicians]);

    const filteredLogs = useMemo(() => {
        return weeklyLogs
            .filter(log => {
                const tech = technicians.find(t => t.id === log.techId);
                const techName = (tech?.name || '').toLowerCase();
                if (searchQuery && !techName.includes(searchQuery.toLowerCase())) return false;
                if (statusFilter !== 'all' && log.status !== statusFilter) return false;
                // weekOf is 'MM-dd-yyyy' (the week's Monday) but the date
                // inputs give 'yyyy-MM-dd' — compare real dates, and keep any
                // week that overlaps the chosen range.
                const weekStart = weekOfTime(log.weekOf);
                if (dateFrom || dateTo) {
                    if (weekStart === null) return false;
                    const weekEnd = weekStart + 6 * DAY_MS;
                    if (dateFrom && weekEnd < inputDateTime(dateFrom)) return false;
                    if (dateTo && weekStart > inputDateTime(dateTo)) return false;
                }
                return true;
            })
            .sort(byWeekDesc);
    }, [weeklyLogs, technicians, searchQuery, statusFilter, dateFrom, dateTo]);

    const totals = useMemo(() => ({
        approved: filteredLogs.filter(l => l.status === 'Approved').reduce((s, l) => s + settlementOf(l), 0),
        pending: filteredLogs.filter(l => l.status === 'Submitted').reduce((s, l) => s + settlementOf(l), 0),
        count: filteredLogs.length,
    }), [filteredLogs]);

    // Multiple Drafts are a data-integrity issue; a Draft beside an Approved
    // log can also hold later work that needs a fresh payroll review.
    const duplicateLogGroups = useMemo(() => {
        const byKey = new Map<string, WeeklyLog[]>();
        weeklyLogs.forEach(log => {
            const key = `${log.techId}__${log.weekOf}`;
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key)!.push(log);
        });
        return Array.from(byKey.entries())
            .filter(([, group]) => group.length > 1)
            .map(([key, group]) => ({ key, group, primary: pickPrimaryLog(group) }))
            .filter(({ group, primary }) => primary.duplicateAlertIgnoreSignature !== duplicateGroupSignature(group));
    }, [weeklyLogs]);

    const handleIgnoreDuplicateAlert = async (group: WeeklyLog[]) => {
        const key = `${group[0].techId}__${group[0].weekOf}`;
        setIgnoringKey(key);
        try {
            const primary = pickPrimaryLog(group);
            const signature = duplicateGroupSignature(group);
            await updateDoc(doc(db, 'weeklyLogs', primary.id), { duplicateAlertIgnoreSignature: signature });
            const adminId = auth.currentUser?.uid || currentUser?.id || '';
            const adminName = auth.currentUser?.displayName || currentUser?.name || 'Admin';
            await auditEvent('weeklyLogs', primary.id, adminId, adminName, 'ignored_duplicate_alert',
                `Ignored duplicate log alert for ${primary.techId}, week of ${primary.weekOf}: ${group.map(log => log.id).join(', ')}.`).catch(() => {});
            toast({ title: 'Alert dismissed', description: 'Both logs and their pay totals are unchanged.' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could Not Ignore Alert', description: e.message });
        } finally {
            setIgnoringKey(null);
            setIgnoreGroup(null);
        }
    };

    const handleMergeDuplicateLogs = async (group: WeeklyLog[], confirmedApproved = false) => {
        const primary = pickPrimaryLog(group);
        if (primary.status === 'Approved' && !confirmedApproved) {
            setApprovedMergeGroup(group);
            return;
        }
        const key = `${group[0].techId}__${group[0].weekOf}`;
        setMergingKey(key);
        try {
            const adminId = auth.currentUser?.uid || currentUser?.id || '';
            const adminName = auth.currentUser?.displayName || currentUser?.name || 'Admin';
            const merged = await runTransaction(db, async tx => {
                // Read the current documents so a completion arriving while an
                // admin reviews the warning cannot be overwritten by the merge.
                const snapshots = await Promise.all(group.map(log => tx.get(doc(db, 'weeklyLogs', log.id))));
                if (snapshots.some(snap => !snap.exists())) throw new Error('One of these logs changed. Refresh and try again.');
                const current = snapshots.map(snap => ({ ...snap.data(), id: snap.id } as WeeklyLog));
                const kept = pickPrimaryLog(current);
                if (kept.id !== primary.id || (kept.status === 'Approved' && !confirmedApproved)) {
                    throw new Error('The approval state changed. Refresh and review the merge again.');
                }
                if ((kept as any).paid || (kept as any).archived) {
                    throw new Error('This log is paid or archived. Reconcile it before merging.');
                }
                const rest = current.filter(log => log.id !== kept.id);
                const items: WeeklyLogItem[] = [];
                const seenWoIds = new Set<string>();
                const reimbursements: FinancialRecord[] = [];
                const seenReimbIds = new Set<string>();
                const missingAssignmentReports: NonNullable<WeeklyLog['missingAssignmentReports']> = [];
                const seenReportIds = new Set<string>();
                [kept, ...rest].forEach(log => {
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
                tx.update(doc(db, 'weeklyLogs', kept.id), {
                    items, reimbursements, missingAssignmentReports, totalPayout,
                    ...(kept.status === 'Approved' ? {
                        status: 'Submitted', submittedAt: new Date().toISOString(),
                        submittedBy: adminName, mergeReviewRequired: true,
                    } : {}),
                });
                rest.forEach(log => tx.delete(doc(db, 'weeklyLogs', log.id)));
                tx.set(doc(db, 'weeklyLogClaims', `${kept.techId}_${kept.weekOf}`), {
                    techId: kept.techId, weekOf: kept.weekOf, logId: kept.id,
                });
                return { kept, rest };
            });

            await auditEvent(
                'weeklyLogs', merged.kept.id, adminId, adminName, 'merged_duplicate',
                `Merged ${merged.rest.length} duplicate log${merged.rest.length > 1 ? 's' : ''} (${merged.rest.map(l => l.id).join(', ')}) for week of ${merged.kept.weekOf} into ${merged.kept.id}.${merged.kept.status === 'Approved' ? 'Prior approval reopened; payroll review required.' : ''}`
            ).catch(() => {});

            toast({ title: 'Logs merged', description: merged.kept.status === 'Approved'
                ? `Combined logs for ${merged.kept.weekOf}. Approval reopened; payroll review is required.`
                : `Combined ${group.length} logs for week of ${merged.kept.weekOf} into ${merged.kept.id.toUpperCase()}.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Merge failed', description: e.message });
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
            toast({ title: 'Duplicate deleted', description: `Removed ${log.id.toUpperCase()}. Original ${primary.id.toUpperCase()} kept.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Delete failed', description: e.message });
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

    // Shared status colors (lib/status-styles.ts).
    const statusVariant = (s: string): any => TONE_BADGE[statusTone('log', s)];

    // Paged lists (see components/list-pager.tsx).
    const logsPager = usePaged(filteredLogs, PAGE_SIZES_LARGE, 'payroll-audit-logs', [searchQuery, statusFilter, dateFrom, dateTo]);
    const stubTechPager = usePaged(approvedLogsByTech, PAGE_SIZES_SMALL, 'payroll-stub-techs');
    const [allStubsFor, setAllStubsFor] = useState<Set<string>>(new Set());
    // One search box for disputes and adjustments: tech, week, reason, notes, amount.
    const adjQuery = adjSearch.trim().toLowerCase();
    const techNameOf = (id: string) => technicians.find(t => t.id === id)?.name || '';
    const sortedDisputes = useMemo(() => [...payrollDisputes]
        .filter(d => !adjQuery || [d.techName, techNameOf(d.techId), d.weekOf, d.reason?.replace(/_/g, ' '), d.notes, d.workOrderId, d.status]
            .some(v => (v || '').toLowerCase().includes(adjQuery)))
        .sort((a, b) => (a.status === b.status ? (b.createdAt || '').localeCompare(a.createdAt || '') : a.status === 'open' ? -1 : 1)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [payrollDisputes, adjQuery, technicians]);
    const disputePager = usePaged(sortedDisputes, PAGE_SIZES_SMALL, 'payroll-disputes', [adjQuery]);
    // Copy before sorting — sorting the state array in render mutated it.
    const sortedAdjustments = useMemo(() => [...adjustments]
        .filter(a => !adjQuery || [techNameOf(a.techId), a.techId, a.reason, a.addedBy, a.date, String(a.amount ?? '')]
            .some(v => (v || '').toLowerCase().includes(adjQuery)))
        .sort((a, b) => (parseLocalDate(b.date)?.getTime() ?? 0) - (parseLocalDate(a.date)?.getTime() ?? 0)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [adjustments, adjQuery, technicians]);
    const adjPager = usePaged(sortedAdjustments, PAGE_SIZES_LARGE, 'payroll-adjustments', [adjQuery]);

    const renderLogList = (logs: WeeklyLog[]) => (
        logs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-sub p-16 text-center">
                <Receipt size={28} className="text-text-muted mx-auto mb-3" />
                <p className="text-[11px] font-bold text-text-muted">No logs match your filters</p>
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
                                        <p className="text-[12px] font-bold text-text-primary">{tech?.name || log.techId}</p>
                                        <p className="text-[11px] text-text-muted font-mono">Week of {log.weekOf}</p>
                                    </div>
                                    <div className="flex flex-col items-start gap-1">
                                        <Badge variant={statusVariant(log.status)} className="text-[10px] h-4 w-fit">{log.status}</Badge>
                                        {log.mergeReviewRequired && <span className="text-[10px] font-bold text-accent-gold flex items-center gap-1"><AlertTriangle size={10} /> Needs reapproval</span>}
                                    </div>
                                    <div className="text-right">
                                        <p className={cn('text-[12px] font-bold font-mono', log.status === 'Approved' ? 'text-text-green' : 'text-text-primary')}>
                                            ${settlementOf(log).toFixed(2)}
                                        </p>
                                        <p className="text-[10px] text-text-muted">{log.items?.length || 0} items</p>
                                    </div>
                                    <div
                                        className="text-right text-[11px] text-text-muted leading-tight"
                                        title={log.submittedAt ? `Submitted ${format(parseISO(log.submittedAt), 'MM/dd/yyyy h:mm a')}` : 'Not submitted yet'}
                                    >
                                        {log.submittedAt ? (
                                            <><span className="block text-[10px] tracking-widest">Submitted</span>{format(parseISO(log.submittedAt), 'MM/dd/yy')}</>
                                        ) : 'Not submitted'}
                                    </div>
                                </button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 shrink-0 text-[10px] font-bold uppercase tracking-wider"
                                    onClick={() => openReview(log)}
                                >
                                    <Receipt size={11} className="mr-1.5" /> Audit log
                                </Button>
                                <button onClick={() => toggleExpand(log.id)} className="shrink-0 p-1 text-text-muted" aria-label="Expand">
                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                            </div>
                            {isExpanded && log.items && log.items.length > 0 && (
                                <div className="border-t border-border-sub divide-y divide-border-sub">
                                    {log.items.map((item: WeeklyLogItem) => {
                                        const disputed = item.confirmationStatus === 'disputed';
                                        const job = jobsById.get(item.workOrderId);
                                        return (
                                        <button
                                            type="button"
                                            key={item.id}
                                            onClick={() => openJobPanel(item)}
                                            className="w-full flex items-center justify-between gap-3 px-5 py-2.5 bg-bg-primary hover:bg-bg-tertiary transition-colors text-left"
                                            title={job ? 'Open job details' : 'Job record not found'}
                                        >
                                            <div className="min-w-0">
                                                <p className="text-[12px] font-bold text-text-primary font-mono">
                                                    {item.workOrderId?.toUpperCase() || item.id}
                                                    {job && <span className="ml-2 text-text-muted">WO {displayWorkOrderNumber(job)}</span>}
                                                </p>
                                                {job && <p className="text-[12px] text-text-secondary truncate">{job.title || job.description}</p>}
                                                {item.outcomeCode && <p className="text-[11px] text-text-muted">{item.outcomeCode.replace(/_/g, ' ')}</p>}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {item.confirmationStatus && (
                                                    <Badge variant={item.confirmationStatus === 'confirmed' ? 'active' : 'destructive'} className="text-[10px] h-4">
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
                                        </button>
                                        );
                                    })}
                                    {log.reimbursements && log.reimbursements.length > 0 && (
                                        <div className="px-5 py-2 bg-bg-primary/50">
                                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Reimbursements</p>
                                            {log.reimbursements.map(r => (
                                                <div key={r.id} className="flex justify-between text-[11px] text-text-muted py-0.5">
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
            {/* Back to wherever the admin came from (Financials, Dashboard, an
                alert); straight to Financials when opened directly. */}
            <PageHeader
                back={{ href: '/admin/financials', label: 'Accounting' }}
                eyebrow="Finance"
                icon={Receipt}
                title="Payroll audit"
                subtitle="Every weekly log submission and approval, with disputes and adjustments."
                actions={
                    <Button variant="outline" size="sm" className="h-9 border-border-main" onClick={handleExportCsv}>
                        <Download size={14} className="mr-1.5" /> Export CSV
                    </Button>
                }
            />

            {/* Summary chips */}
            <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-text-green/10 border border-text-green/20">
                    <CheckCircle size={12} className="text-text-green" />
                    <span className="text-[12px] font-semibold text-text-green">${totals.approved.toFixed(2)} approved</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-text-amber/10 border border-text-amber/20">
                    <Clock size={12} className="text-text-amber" />
                    <span className="text-[12px] font-semibold text-text-amber">${totals.pending.toFixed(2)} pending</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-secondary border border-border-sub">
                    <DollarSign size={12} className="text-text-muted" />
                    <span className="text-[12px] font-semibold text-text-muted">{totals.count} log{totals.count !== 1 ? 's' : ''} shown</span>
                </div>
            </div>

            {/* Duplicate Drafts merge directly. An Approved original requires
                explicit review before its status is reopened. */}
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
                                            <p className="text-[11px] font-bold text-brand-red">
                                                {group.length} duplicate logs — {tech?.name || group[0].techId} — week of {group[0].weekOf}
                                            </p>
                                            <p className="text-[12px] text-text-muted">
                                                {totalItems} total job entries across the {group.length} logs ({uniqueItems} unique) — merge combines everything, or delete an individual duplicate below.
                                            </p>
                                            {primary.status === 'Approved' && (
                                                <p className="text-[10px] font-bold text-accent-gold flex items-center gap-1 mt-1">
                                                    <AlertTriangle size={11} /> Needs review: merging will reopen this approved log.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    {superAdmin ? (
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button
                                                size="sm" variant="outline"
                                                className="h-8 text-[10px] font-bold uppercase tracking-wider shrink-0"
                                                disabled={ignoringKey === key || mergingKey === key}
                                                onClick={() => setIgnoreGroup(group)}
                                            >
                                                {ignoringKey === key ? 'Ignoring…' : 'Ignore'}
                                            </Button>
                                            <Button
                                                size="sm"
                                                className="h-8 text-[10px] font-bold uppercase tracking-wider bg-brand-red hover:bg-brand-red-hover shrink-0"
                                                disabled={mergingKey === key || ignoringKey === key}
                                                onClick={() => handleMergeDuplicateLogs(group)}
                                            >
                                                <MergeIcon size={12} className="mr-1.5" />
                                                {mergingKey === key ? 'Merging…' : 'Merge'}
                                            </Button>
                                            <Button
                                                size="sm" variant="outline"
                                                className="h-8 text-[10px] font-bold uppercase tracking-wider border-brand-red/40 text-brand-red shrink-0"
                                                disabled={mergingKey === key || ignoringKey === key}
                                                onClick={() => setDeleteSelectionKey(current => current === key ? null : key)}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    ) : (
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted shrink-0">Super admin required</p>
                                    )}
                                </div>
                                {superAdmin && deleteSelectionKey === key && (
                                    <p className="px-4 py-2 text-[10px] text-accent-gold border-t border-brand-red/20">
                                        Choose the extra log to delete below. Its entries will not be merged.
                                    </p>
                                )}
                                <div className="divide-y divide-brand-red/20 border-t border-brand-red/20 bg-bg-primary/40">
                                    {group.map(log => {
                                        const isPrimary = log.id === primary.id;
                                        return (
                                            <div key={log.id} className="flex items-center justify-between gap-3 px-4 py-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="text-[12px] font-mono font-bold text-text-primary">{log.id}</span>
                                                    <Badge variant="outline" className="h-4 px-1.5 text-[10px] uppercase tracking-wider shrink-0">{log.status}</Badge>
                                                    <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider shrink-0">{log.items?.length || 0} item{(log.items?.length || 0) === 1 ? '' : 's'}</span>
                                                </div>
                                                {isPrimary ? (
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-green shrink-0">Original — protected</span>
                                                ) : superAdmin && deleteSelectionKey === key ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-6 text-[10px] font-bold uppercase tracking-wider border-brand-red/40 text-brand-red hover:bg-brand-red-dim shrink-0"
                                                        disabled={deletingLogId === log.id}
                                                        onClick={() => setLogToDelete({ log, primary })}
                                                    >
                                                        {deletingLogId === log.id ? 'Deleting…' : 'Delete'}
                                                    </Button>
                                                ) : (
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted shrink-0">{superAdmin ? 'Extra — choose Delete above' : 'Extra — needs super admin'}</span>
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

            <AlertDialog open={!!ignoreGroup} onOpenChange={(open) => { if (!open) setIgnoreGroup(null); }}>
                <AlertDialogContent className="bg-bg-elevated border-border-main">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-text-primary font-bold tracking-wide text-sm">Ignore duplicate alert?</AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-text-muted">
                            This hides the alert for these logs. Both logs, their job entries, and their pay totals stay unchanged, so overlapping jobs may still be counted twice. The alert will return if the job or reimbursement list, status, or number of logs changes.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="uppercase font-bold text-[10px] tracking-wider">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="uppercase font-bold text-[10px] tracking-wider"
                            onClick={() => { if (ignoreGroup) void handleIgnoreDuplicateAlert(ignoreGroup); }}
                        >
                            Ignore alert
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!approvedMergeGroup} onOpenChange={(open) => { if (!open) setApprovedMergeGroup(null); }}>
                <AlertDialogContent className="bg-bg-elevated border-border-main">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-text-primary font-bold tracking-wide text-sm flex items-center gap-2">
                            <AlertTriangle size={16} className="text-accent-gold" /> Review approved log merge
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-text-muted space-y-2">
                            <span className="block">This log was already Approved. Duplicate job entries will be kept once; the approved log's entry wins when the same job appears in both.</span>
                            <span className="block font-bold text-accent-gold">Merging will change the combined log to Submitted. Its new payout must be reviewed and approved again before it counts as approved pay.</span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="uppercase font-bold text-[10px] tracking-wider">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-wider"
                            onClick={() => {
                                const group = approvedMergeGroup;
                                setApprovedMergeGroup(null);
                                if (group) void handleMergeDuplicateLogs(group, true);
                            }}
                        >
                            Merge and require approval
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!logToDelete} onOpenChange={(open) => { if (!open) setLogToDelete(null); }}>
                <AlertDialogContent className="bg-bg-elevated border-border-main">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-text-primary font-bold tracking-wide text-sm">Delete duplicate log?</AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-text-muted">
                            {logToDelete && (
                                <>
                                    This permanently deletes <span className="font-mono font-bold text-text-primary">{logToDelete.log.id.toUpperCase()}</span> and
                                    its {logToDelete.log.items?.length || 0} item{(logToDelete.log.items?.length || 0) === 1 ? '' : 's'} — they are NOT merged into the
                                    original. The original log <span className="font-mono font-bold text-text-primary">{logToDelete.primary.id.toUpperCase()}</span> is
                                    kept untouched. If the duplicate has job entries the original doesn't, use Merge instead so nothing is lost.
                                    <span className="block mt-2 font-bold text-accent-gold">
                                        {(logToDelete.log.items || []).filter(item => !(logToDelete.primary.items || []).some(kept => kept.workOrderId === item.workOrderId)).length} unique job entries and{' '}
                                        {(logToDelete.log.reimbursements || []).filter(r => !(logToDelete.primary.reimbursements || []).some(kept => kept.id === r.id)).length} unique reimbursements would be removed.
                                    </span>
                                </>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="uppercase font-bold text-[10px] tracking-wider">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-wider"
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
                        { value: 'history', label: 'Paystub history', count: approvedLogsByTech.length },
                        { value: 'adjustments', label: 'Adjustments', count: adjustments.length + payrollDisputes.filter(d => d.status === 'open').length },
                    ].map(t => (
                        <TabsTrigger key={t.value} value={t.value} className="tab-underline">
                            {t.label}
                            {t.count > 0 && <span className="text-[10px] font-bold bg-bg-tertiary text-text-muted border border-border-sub px-1.5 py-0.5 rounded">{t.count}</span>}
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
                                className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-main bg-bg-primary text-[12px] font-bold tracking-wide text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-red transition-colors"
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
                                        'h-9 px-3 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition-colors',
                                        statusFilter === s ? 'bg-brand-red text-white border-brand-red' : 'border-border-main text-text-muted hover:text-text-primary bg-bg-primary'
                                    )}
                                >
                                    {s === 'all' ? 'All' : s}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="date" className="h-9 px-3 rounded-lg border border-border-main bg-bg-primary text-[12px] font-bold text-text-primary" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From" />
                            <span className="text-[11px] text-text-muted">to</span>
                            <input type="date" className="h-9 px-3 rounded-lg border border-border-main bg-bg-primary text-[12px] font-bold text-text-primary" value={dateTo} onChange={e => setDateTo(e.target.value)} title="To" />
                            {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-[11px] text-brand-red font-bold hover:underline">Clear</button>}
                        </div>
                    </div>
                    {renderLogList(logsPager.items)}
                    <ListPager pager={logsPager} noun="logs" />
                </TabsContent>


                {/* ── Paystub History ── */}
                <TabsContent value="history" className="m-0 space-y-3">
                    {approvedLogsByTech.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border-sub p-16 text-center">
                            <Receipt size={28} className="text-text-muted mx-auto mb-3" />
                            <p className="text-[11px] font-bold text-text-muted">No approved logs yet</p>
                        </div>
                    ) : stubTechPager.items.map(([techId, { tech, logs }]) => (
                        <div key={techId} className="rounded-xl border border-border-sub bg-bg-secondary overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 bg-bg-tertiary/30 border-b border-border-sub">
                                <div>
                                    <p className="text-[12px] font-bold text-text-primary">{tech?.name || techId}</p>
                                    <p className="text-[11px] text-text-muted">{logs.length} approved logs · ${logs.reduce((s, l) => s + settlementOf(l), 0).toFixed(2)} total</p>
                                </div>
                                <Badge variant="active" className="text-[10px] h-4">{logs.length} stubs</Badge>
                            </div>
                            <div className="divide-y divide-border-sub">
                                {(allStubsFor.has(techId) ? logs : logs.slice(0, 12)).map(log => (
                                    <div key={log.id} className="flex items-center justify-between px-4 py-2.5">
                                        <div>
                                            <p className="text-[12px] font-bold text-text-primary font-mono">Week of {log.weekOf}</p>
                                            <p className="text-[11px] text-text-muted">{log.items?.length || 0} items</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <p className="text-[12px] font-bold font-mono text-text-green">${settlementOf(log).toFixed(2)}</p>
                                            <button className="text-[12px] text-text-muted hover:text-text-primary font-bold border border-border-sub rounded px-2 py-0.5 hover:border-border-main transition-colors" onClick={() => downloadPaystub(log, tech, techId, jobsById)}>
                                                <Download size={9} className="inline mr-0.5" /> Stub
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {logs.length > 12 && (
                                <button
                                    className="w-full px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-muted hover:text-text-primary border-t border-border-sub"
                                    onClick={() => setAllStubsFor(prev => { const n = new Set(prev); n.has(techId) ? n.delete(techId) : n.add(techId); return n; })}
                                >
                                    {allStubsFor.has(techId) ? 'Show latest 12' : `Show all ${logs.length} stubs`}
                                </button>
                            )}
                        </div>
                    ))}
                    <ListPager pager={stubTechPager} noun="techs" />
                </TabsContent>

                {/* ── Adjustments ── */}
                <TabsContent value="adjustments" className="m-0 space-y-4">
                    {/* Post-approval disputes — a tech disputing a job/log after
                        payout is an adjustment candidate just like a manual one,
                        so it lives here instead of only inside each log's own
                        review dialog. Open ones first, resolved ones collapsed
                        underneath for a paper trail. */}
                    {(payrollDisputes.length > 0 || adjustments.length > 0) && (
                        <SearchField className="max-w-md" placeholder="Search tech, week, reason, notes…" value={adjSearch} onChange={setAdjSearch} />
                    )}
                    {payrollDisputes.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-[13px] font-semibold text-text-primary">
                                Payroll disputes ({payrollDisputes.filter(d => d.status === 'open').length} open)
                            </p>
                            {sortedDisputes.length === 0 && (
                                <p className="text-[12px] text-text-muted py-2">No disputes match this search.</p>
                            )}
                            <div className="space-y-2">
                                {disputePager.items.map(dispute => {
                                    const isOpenDispute = dispute.status === 'open';
                                    const reasonLabel = dispute.reason === 'incorrect_pay' ? 'Incorrect pay'
                                        : dispute.reason === 'missing_reimbursement' ? 'Missing reimbursement'
                                        : 'Missing job';
                                    const relatedJob = dispute.workOrderId ? jobsById.get(dispute.workOrderId) : undefined;
                                    const relatedLog = weeklyLogs.find(l => l.id === dispute.weeklyLogId);
                                    return (
                                        <div key={dispute.id} className={cn(
                                            "p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center gap-3",
                                            isOpenDispute ? "bg-brand-red-dim/10 border-brand-red/30" : "bg-bg-secondary border-border-sub opacity-70"
                                        )}>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <Badge variant="outline" className={cn("text-[10px] h-3.5 px-1.5", isOpenDispute ? "border-brand-red/40 text-brand-red bg-brand-red/5" : "border-text-green/40 text-text-green bg-text-green/5")}>
                                                        {reasonLabel}
                                                    </Badge>
                                                    <span className="text-[10px] font-bold text-text-primary uppercase tracking-wide">{dispute.techName}</span>
                                                    <span className="text-[11px] text-text-muted font-mono">Week of {dispute.weekOf}</span>
                                                    {relatedJob && <span className="text-[11px] text-text-muted font-mono">{relatedJob.title || relatedJob.description || dispute.workOrderId?.toUpperCase()}</span>}
                                                </div>
                                                <p className="text-[12px] text-text-secondary leading-relaxed mt-1">{dispute.notes}</p>
                                                <p className="text-[10px] text-text-muted font-mono mt-1">
                                                    {new Date(dispute.createdAt).toLocaleString()}
                                                    {!isOpenDispute && dispute.resolvedBy && ` · Resolved by ${dispute.resolvedBy}`}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {relatedLog && (
                                                    <Button variant="outline" size="sm" className="h-8 text-[10px] font-bold uppercase tracking-wider" onClick={() => openReview(relatedLog)}>
                                                        <Receipt size={12} className="mr-1.5" /> View Log
                                                    </Button>
                                                )}
                                                {isOpenDispute ? (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 text-[10px] font-bold uppercase tracking-wider border-text-green text-text-green hover:bg-green-dim"
                                                        disabled={resolvingDisputeId === dispute.id}
                                                        onClick={() => handleResolvePayrollDispute(dispute)}
                                                    >
                                                        <CheckCircle size={13} className="mr-1.5" /> Mark Resolved
                                                    </Button>
                                                ) : (
                                                    <Badge variant="active" className="h-6 px-3 text-[10px] uppercase tracking-wider">Resolved</Badge>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <ListPager pager={disputePager} noun="disputes" />
                        </div>
                    )}

                    <div className="flex items-center justify-between">
                        <p className="text-[13px] font-semibold text-text-primary">{adjQuery ? `${sortedAdjustments.length} of ${adjustments.length}` : adjustments.length} adjustment{adjustments.length !== 1 ? 's' : ''}</p>
                        <Button size="sm" className="h-8 bg-brand-red hover:bg-brand-red/90 text-white" onClick={() => setAdjustDialogOpen(true)}>
                            <Plus size={14} className="mr-1.5" /> Add adjustment
                        </Button>
                    </div>
                    <div className="rounded-xl border border-border-sub overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-border-sub">
                                    <TableHead className="text-text-muted">Tech</TableHead>
                                    <TableHead className="text-text-muted">Date</TableHead>
                                    <TableHead className="text-text-muted">Amount</TableHead>
                                    <TableHead className="text-text-muted">Reason</TableHead>
                                    <TableHead className="text-text-muted">Added by</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {adjPager.items.map(adj => {
                                    const tech = technicians.find(t => t.id === adj.techId);
                                    const amount = parseFloat(adj.amount || 0);
                                    return (
                                        <TableRow key={adj.id} className="border-border-sub hover:bg-bg-secondary">
                                            <TableCell className="font-bold text-[12px] text-text-primary">{tech?.name || adj.techId}</TableCell>
                                            <TableCell className="text-[12px] text-text-muted">{parseLocalDate(adj.date)?.toLocaleDateString() ?? '—'}</TableCell>
                                            <TableCell className={cn('text-[11px] font-bold font-mono', amount >= 0 ? 'text-text-green' : 'text-text-red')}>
                                                {amount >= 0 ? '+' : ''}${amount.toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-[12px] text-text-muted max-w-[200px] truncate">{adj.reason || '—'}</TableCell>
                                            <TableCell className="text-[12px] text-text-muted">{adj.addedBy || '—'}</TableCell>
                                        </TableRow>
                                    );
                                })}
                                {sortedAdjustments.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-12 text-[13px] text-text-muted">{adjustments.length ? 'No adjustments match this search' : 'No adjustments yet'}</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <ListPager pager={adjPager} noun="adjustments" />
                </TabsContent>

            </Tabs>

            {/* Add Adjustment Dialog */}
            <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold flex items-center gap-2">
                            <SlidersHorizontal size={14} className="text-brand-red" /> Add adjustment
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Technician</Label>
                            <Select value={adjustForm.techId} onValueChange={v => setAdjustForm(p => ({ ...p, techId: v }))}>
                                <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main"><SelectValue placeholder="Select tech..." /></SelectTrigger>
                                <SelectContent className="bg-bg-elevated border-border-main">
                                    {staffTechs.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Amount (use negative for deductions)</Label>
                            <Input type="number" step="0.01" className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. 50.00 or -25.00" value={adjustForm.amount} onChange={e => setAdjustForm(p => ({ ...p, amount: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Reason</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Reason for adjustment" value={adjustForm.reason} onChange={e => setAdjustForm(p => ({ ...p, reason: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Date</Label>
                            <Input type="date" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={adjustForm.date} onChange={e => setAdjustForm(p => ({ ...p, date: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" size="sm" onClick={() => setAdjustDialogOpen(false)} className="text-[10px] font-bold">Cancel</Button>
                        <Button size="sm" disabled={!adjustForm.techId || !adjustForm.amount || adjustSaving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-bold" onClick={async () => {
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
                            {adjustSaving ? 'Saving...' : 'Add adjustment'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <JobDetailDialog isOpen={panelOpen} setIsOpen={setPanelOpen} mission={panelJob} />

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
