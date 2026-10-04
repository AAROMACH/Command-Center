'use client';

import { useMemo, useState } from 'react';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle, Download, Loader2, Search } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import type { Technician } from '@/lib/types';
import type { JobWithSrc } from '@/lib/jobs';
import { displayWorkOrderNumber, externalWorkOrderId } from '@/lib/work-order-identity';
import { fileCompletedJob, weekOfForScheduleDate } from '@/lib/weekly-log';
import type { UnloggedCompletion, ExcludedCompletion, ExcludedReason } from '@/lib/weekly-log-audit';
import { auditEvent } from '@/lib/audit';
import { isInactiveTechnician } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

type Props = {
    rows: UnloggedCompletion[];
    /** Completed jobs deliberately NOT listed, with why — shown read-only so
     *  the tab's number can be explained. */
    excluded: ExcludedCompletion[];
    technicians: Technician[];
    currentUser: Technician | null;
};

/**
 * Payroll Audit → Unlogged: completed jobs that are not on their tech's
 * weekly log, so they can't reach payroll. "File to Log" uses the same auto
 * placement as a tech completion (scheduled week if its log is still Draft,
 * otherwise the current week flagged as a cross-week entry), so nothing is
 * paid until the log goes through normal review. "Not Payable" marks the job
 * payrollExcluded so it drops off this list and the tech-side sync ignores it.
 */
export function UnloggedCompletions({ rows, excluded, technicians, currentUser }: Props) {
    const { toast } = useToast();
    const [search, setSearch] = useState('');
    const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
    const [confirmFileAll, setConfirmFileAll] = useState(false);
    const [filingAll, setFilingAll] = useState(false);

    const techById = useMemo(() => new Map(technicians.map(t => [t.id, t])), [technicians]);
    const techName = (id?: string) => (id && techById.get(id)?.name) || id || '—';

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(r => [
            techName(r.techId), r.job.id, displayWorkOrderNumber(r.job), externalWorkOrderId(r.job), r.job.title, r.job.clientName,
        ].some(v => (v || '').toString().toLowerCase().includes(q)));
    }, [rows, search, techById]);

    const bulkRows = visible;
    const [showExcluded, setShowExcluded] = useState(false);
    const excludedCounts = excluded.reduce((acc, e) => { acc[e.reason] = (acc[e.reason] || 0) + 1; return acc; }, {} as Partial<Record<ExcludedReason, number>>);
    const reasonLabel = (e: ExcludedCompletion) =>
        e.reason === 'no_completion_record' ? 'Status is completed, but no one marked it complete in the app (test/seed data, import, or old record)'
        : e.reason === 'on_other_tech_log' ? `Already on ${techName(e.detail)}'s weekly log`
        : `Matches missing-job report for WO ${e.detail}`;
    const totalPay = visible.reduce((s, r) => s + (Number(r.job.pay) || 0), 0);

    const adminName = auth.currentUser?.displayName || currentUser?.name || 'Admin';
    const adminId = auth.currentUser?.uid || currentUser?.id || '';
    const setBusy = (id: string, on: boolean) => setBusyIds(prev => {
        const next = new Set(prev);
        if (on) next.add(id); else next.delete(id);
        return next;
    });

    const fileRow = async (r: UnloggedCompletion) => {
        const result = await fileCompletedJob({ techId: r.techId, job: r.job, filedVia: 'admin_backfill' });
        await auditEvent('weeklyLogs', r.job.id, adminId, adminName, 'backfilled_unlogged_job',
            `Filed completed job ${displayWorkOrderNumber(r.job)} to ${techName(r.techId)}'s weekly log (week of ${result.weekOf}${result.placedIn === 'reporting_week_override' ? ', cross-week' : ''}).`).catch(() => {});
        return result;
    };

    const handleFile = async (r: UnloggedCompletion) => {
        setBusy(r.job.id, true);
        try {
            const result = await fileRow(r);
            toast({ title: 'Filed to Weekly Log', description: `${displayWorkOrderNumber(r.job)} → ${techName(r.techId)}, week of ${result.weekOf}${result.placedIn === 'reporting_week_override' ? ' (scheduled week closed — flagged cross-week)' : ''}.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not file', description: e?.message || 'Please try again.' });
        } finally {
            setBusy(r.job.id, false);
        }
    };

    const handleExclude = async (r: UnloggedCompletion) => {
        setBusy(r.job.id, true);
        try {
            const coll = (r.job as JobWithSrc)._src === 'workOrder' ? 'workOrders' : 'assignments';
            await updateDoc(doc(db, coll, r.job.id), {
                payrollExcluded: true,
                history: arrayUnion({
                    type: 'note',
                    date: format(new Date(), 'MM-dd-yyyy'),
                    details: `Marked not payable through weekly logs by ${adminName} (Payroll Audit → Unlogged).`,
                    user: adminName,
                }),
            });
            await auditEvent('weeklyLogs', r.job.id, adminId, adminName, 'excluded_unlogged_job',
                `Marked ${displayWorkOrderNumber(r.job)} (${techName(r.techId)}) as not payable through weekly logs.`).catch(() => {});
            toast({ title: 'Marked Not Payable', description: `${displayWorkOrderNumber(r.job)} removed from the Unlogged list.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not update job', description: e?.message || 'Please try again.' });
        } finally {
            setBusy(r.job.id, false);
        }
    };

    const handleFileAll = async () => {
        setConfirmFileAll(false);
        setFilingAll(true);
        let ok = 0;
        const failed: string[] = [];
        // Sequential on purpose — several rows often share one tech/week log,
        // and each filing is a transaction on that log.
        for (const r of bulkRows) {
            setBusy(r.job.id, true);
            try { await fileRow(r); ok++; } catch { failed.push(displayWorkOrderNumber(r.job)); }
            finally { setBusy(r.job.id, false); }
        }
        setFilingAll(false);
        toast({
            variant: failed.length ? 'destructive' : undefined,
            title: `Filed ${ok} of ${bulkRows.length}`,
            description: failed.length ? `Failed: ${failed.join(', ')}` : 'All listed jobs were added to their technicians’ weekly logs.',
        });
    };

    const exportCsv = () => {
        const esc = (v: unknown) => `"${(v ?? '').toString().replace(/"/g, '""')}"`;
        const header = ['Assignment', 'Work Order', 'Title', 'Client', 'Technician', 'Schedule Date', 'Week Of', 'Pay', 'Marked Complete By'];
        const lines = visible.map(r => [
            r.job.id, displayWorkOrderNumber(r.job), r.job.title, r.job.clientName, techName(r.techId),
            r.job.scheduleDate, weekOfForScheduleDate(r.job.scheduleDate), Number(r.job.pay) || 0, r.source,
        ].map(esc).join(','));
        const blob = new Blob([[header.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `unlogged-completions-${format(new Date(), 'yyyy-MM-dd')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-xl border border-accent-gold/30 bg-accent-gold/5 text-left">
                <AlertTriangle size={14} className="text-accent-gold shrink-0 mt-0.5" />
                <p className="text-[10px] text-text-secondary leading-relaxed">
                    Jobs a tech or admin <span className="font-bold text-text-primary">marked complete in the app</span> that never reached a weekly log, so they can&apos;t reach payroll.
                    Filing adds the job to its scheduled week&apos;s log if that log is still Draft; otherwise to the current week, flagged as a cross-week entry.
                    Nothing is paid until the log is submitted and approved. Check for a payment made outside the app before filing older jobs.
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 p-3 bg-bg-secondary/60 border border-border-sub rounded-xl">
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                        className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-main bg-bg-primary text-[11px] font-bold uppercase tracking-wide text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-red transition-colors"
                        placeholder="Search tech, WO #, assignment, client..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <p className="text-[9px] font-black uppercase tracking-widest text-text-muted">
                    {visible.length} job{visible.length !== 1 ? 's' : ''} · ${totalPay.toFixed(2)} listed pay
                </p>
                <Button variant="outline" size="sm" className="h-9 text-[9px] uppercase font-black tracking-widest" onClick={exportCsv} disabled={visible.length === 0}>
                    <Download size={11} className="mr-1" /> CSV
                </Button>
                <Button size="sm" className="h-9 text-[9px] uppercase font-black tracking-widest bg-brand-red hover:bg-brand-red/90 text-white" onClick={() => setConfirmFileAll(true)} disabled={bulkRows.length === 0 || filingAll}>
                    {filingAll ? <Loader2 size={11} className="mr-1 animate-spin" /> : null} File All ({bulkRows.length})
                </Button>
            </div>

            {visible.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-sub p-16 text-center">
                    <CheckCircle size={28} className="text-text-green mx-auto mb-3" />
                    <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest">Every job marked complete is on a weekly log</p>
                </div>
            ) : (
                <div className="rounded-xl border border-border-sub bg-bg-secondary divide-y divide-border-sub overflow-hidden">
                    {visible.map(r => {
                        const tech = techById.get(r.techId);
                        const busy = busyIds.has(r.job.id);
                        return (
                            <div key={r.job.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3 text-left">
                                <div className="min-w-0 space-y-0.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <a href={`/admin/assignments/${r.job.id}`} className="text-[11px] font-bold font-mono text-blue-400 hover:underline">{r.job.id.toUpperCase()}</a>
                                        <span className="text-[10px] font-mono text-text-muted">WO {displayWorkOrderNumber(r.job)}</span>
                                        {tech && isInactiveTechnician(tech) && <Badge variant="destructive" className="text-[7px] h-4 uppercase">Inactive tech</Badge>}
                                    </div>
                                    <p className="text-[11px] font-bold text-text-primary truncate">{r.job.title || r.job.description || '—'}</p>
                                    <p className="text-[9px] text-text-muted uppercase tracking-widest font-bold">
                                        {techName(r.techId)} · {r.job.scheduleDate || 'No date'} · week of {weekOfForScheduleDate(r.job.scheduleDate)} · ${(Number(r.job.pay) || 0).toFixed(2)}
                                    </p>
                                    <p className="text-[9px] text-accent-gold">{r.source}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <Button size="sm" variant="outline" className="h-8 text-[9px] uppercase font-black tracking-widest" disabled={busy || filingAll} onClick={() => handleExclude(r)}>
                                        Not Payable
                                    </Button>
                                    <Button size="sm" className="h-8 text-[9px] uppercase font-black tracking-widest bg-text-green hover:bg-text-green/90 text-white" disabled={busy || filingAll} onClick={() => handleFile(r)}>
                                        {busy ? <Loader2 size={11} className="animate-spin" /> : 'File to Log'}
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {excluded.length > 0 && (
                <div className="rounded-xl border border-border-sub bg-bg-secondary/40 text-left">
                    <button type="button" onClick={() => setShowExcluded(v => !v)} className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                            {excluded.length} other completed job{excluded.length !== 1 ? 's' : ''} not listed
                        </span>
                        <span className="text-[9px] text-text-muted">
                            {[
                                excludedCounts.no_completion_record && `${excludedCounts.no_completion_record} never marked complete in app`,
                                excludedCounts.on_other_tech_log && `${excludedCounts.on_other_tech_log} on another tech's log`,
                                excludedCounts.missing_job_report && `${excludedCounts.missing_job_report} match a missing-job report`,
                            ].filter(Boolean).join(' · ')} · {showExcluded ? 'Hide' : 'Show'}
                        </span>
                    </button>
                    {showExcluded && (
                        <div className="divide-y divide-border-sub border-t border-border-sub">
                            {excluded.map(e => (
                                <div key={e.job.id} className="px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                    <a href={`/admin/assignments/${e.job.id}`} className="text-[10px] font-mono font-bold text-blue-400 hover:underline">{e.job.id.toUpperCase()}</a>
                                    <span className="text-[10px] font-mono text-text-muted">WO {displayWorkOrderNumber(e.job)}</span>
                                    <span className="text-[10px] text-text-secondary">{techName(e.techId)} · {e.job.scheduleDate || 'No date'}</span>
                                    <span className="text-[9px] text-text-muted basis-full">{reasonLabel(e)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <AlertDialog open={confirmFileAll} onOpenChange={setConfirmFileAll}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>File {bulkRows.length} jobs to weekly logs?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Each job goes to its technician&apos;s log for its scheduled week, or the current week (flagged) if that week is closed.
                            Logs still need normal submission and approval before anything is paid.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleFileAll}>File All</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
