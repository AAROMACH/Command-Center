'use client';

import { useMemo, useState } from 'react';
import { usePaged, ListPager, PAGE_SIZES_SMALL, PAGE_SIZES_LARGE } from '@/components/list-pager';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle, Loader2, Lock } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import type { Technician, WorkOrder } from '@/lib/types';
import { displayWorkOrderNumber } from '@/lib/work-order-identity';
import { moveJobLogOnSwap, describeSwapLogMove } from '@/lib/weekly-log';
import type { MismatchedLogEntry } from '@/lib/weekly-log-audit';
import { auditEvent } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';
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
    entries: MismatchedLogEntry[];
    desynced: WorkOrder[];
    technicians: Technician[];
    currentUser: Technician | null;
};

/**
 * Intel → Flags → Wrong Tech. Enforces: a job's weekly-log entry belongs only
 * to the tech the job is assigned to (or, at $0, to a tech listed as a helper).
 *
 *  - Entries on another tech's log: "Move" pulls the entry off that tech's open
 *    logs and files it on the assigned tech (same logic as a swap, so pay
 *    figures carry over and a duplicate is never added). A stale helper entry is
 *    just removed. Approved/Paid logs are settled pay and can't be changed here.
 *  - Jobs whose owner fields disagree (admin shows one tech, the tech portal
 *    another): "Sync" points the portal at the assigned tech, so the wrong tech
 *    can't complete it onto their log again.
 */
export function WrongTechEntries({ entries, desynced, technicians, currentUser }: Props) {
    const { toast } = useToast();
    const [busy, setBusy] = useState<Set<string>>(new Set());
    const [confirmAll, setConfirmAll] = useState(false);
    const entryPager = usePaged(entries, PAGE_SIZES_SMALL, 'intel-wrong-tech');
    const desyncPager = usePaged(desynced, PAGE_SIZES_SMALL, 'intel-desynced');
    const [fixingAll, setFixingAll] = useState(false);

    const techById = useMemo(() => new Map(technicians.map(t => [t.id, t])), [technicians]);
    const techName = (id?: string | null) => (id && techById.get(id)?.name) || id || '—';
    const adminName = auth.currentUser?.displayName || currentUser?.name || 'Admin';
    const adminId = auth.currentUser?.uid || currentUser?.id || '';
    const mark = (key: string, on: boolean) => setBusy(prev => {
        const next = new Set(prev);
        if (on) next.add(key); else next.delete(key);
        return next;
    });

    const fixable = entries.filter(e => !e.locked);
    const rowKey = (e: MismatchedLogEntry) => `${e.log.id}:${e.itemId}`;

    const fixEntry = async (e: MismatchedLogEntry) => {
        const result = await moveJobLogOnSwap({
            job: e.job,
            fromTechIds: [e.logTechId],
            toTechId: e.assignedTechId,
            fileToTarget: e.kind === 'not_assigned',
        });
        await auditEvent('weeklyLogs', e.log.id, adminId, adminName, 'moved_wrong_tech_entry',
            `${e.kind === 'stale_helper' ? 'Removed stale helper entry' : 'Moved entry'} for ${displayWorkOrderNumber(e.job)} from ${techName(e.logTechId)}'s log (week of ${e.log.weekOf})${e.kind === 'not_assigned' ? ` to ${techName(e.assignedTechId)}` : ''}.`).catch(() => {});
        return result;
    };

    const handleFix = async (e: MismatchedLogEntry) => {
        mark(rowKey(e), true);
        try {
            const result = await fixEntry(e);
            const note = describeSwapLogMove(result, techName(e.logTechId), techName(e.assignedTechId));
            toast({ variant: note?.warn ? 'destructive' : undefined, title: e.kind === 'stale_helper' ? 'Helper Entry Removed' : 'Entry Moved', description: note?.text || 'Done.' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Could not fix entry', description: err?.message || 'Please try again.' });
        } finally {
            mark(rowKey(e), false);
        }
    };

    const handleFixAll = async () => {
        setConfirmAll(false);
        setFixingAll(true);
        let ok = 0;
        const failed: string[] = [];
        for (const e of fixable) {
            mark(rowKey(e), true);
            try { await fixEntry(e); ok++; } catch { failed.push(displayWorkOrderNumber(e.job)); }
            finally { mark(rowKey(e), false); }
        }
        setFixingAll(false);
        toast({
            variant: failed.length ? 'destructive' : undefined,
            title: `Fixed ${ok} of ${fixable.length}`,
            description: failed.length ? `Failed: ${failed.join(', ')}` : 'All open entries are now on the assigned tech’s log.',
        });
    };

    const syncJob = async (job: WorkOrder) => {
        const to = job.assignedTechnicianId!;
        await updateDoc(doc(db, 'assignments', job.id), {
            techId: to,
            technicianName: techName(to),
            history: arrayUnion({
                type: 'note',
                date: format(new Date(), 'MM-dd-yyyy'),
                details: `Tech portal ownership synced from ${techName(job.techId)} to ${techName(to)} by ${adminName} (Intel → Flags → Wrong Tech).`,
                user: adminName,
            }),
        });
        await auditEvent('assignments', job.id, adminId, adminName, 'synced_tech_fields',
            `Synced ${displayWorkOrderNumber(job)} portal owner ${techName(job.techId)} → ${techName(to)}.`).catch(() => {});
    };

    const [syncingAll, setSyncingAll] = useState(false);
    const handleSyncAll = async () => {
        setSyncingAll(true);
        let ok = 0;
        for (const job of desynced) {
            try { await syncJob(job); ok++; } catch { /* reported below */ }
        }
        setSyncingAll(false);
        toast({ variant: ok < desynced.length ? 'destructive' : undefined, title: `Synced ${ok} of ${desynced.length}`, description: 'Each job now shows only in its assigned tech’s portal.' });
    };

    const handleSync = async (job: WorkOrder) => {
        const key = `sync:${job.id}`;
        mark(key, true);
        try {
            await syncJob(job);
            toast({ title: 'Tech Fields Synced', description: `${displayWorkOrderNumber(job)} now shows only in ${techName(job.assignedTechnicianId)}'s portal.` });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Could not sync', description: err?.message || 'Please try again.' });
        } finally {
            mark(key, false);
        }
    };

    const nothing = entries.length === 0 && desynced.length === 0;

    return (
        <div className="space-y-4 text-left">
            <div className="flex items-start gap-3 p-3 rounded-xl border border-accent-gold/30 bg-accent-gold/5">
                <AlertTriangle size={14} className="text-accent-gold shrink-0 mt-0.5" />
                <p className="text-[10px] text-text-secondary leading-relaxed">
                    A job belongs only on the weekly log of the <span className="font-bold text-text-primary">tech it&apos;s assigned to</span> (helpers get a separate $0 entry).
                    Moving keeps the entered pay figures and never adds a duplicate. Approved or paid logs are settled and must be adjusted by payroll.
                </p>
            </div>

            {nothing ? (
                <div className="rounded-xl border border-dashed border-border-sub p-16 text-center">
                    <CheckCircle size={28} className="text-text-green mx-auto mb-3" />
                    <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest">Every log entry is on the assigned tech</p>
                </div>
            ) : (
                <>
                    {entries.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                                    On the wrong tech&apos;s log · {entries.length}{entries.length !== fixable.length ? ` (${entries.length - fixable.length} on settled logs)` : ''}
                                </p>
                                <Button size="sm" className="h-8 text-[9px] uppercase font-black tracking-widest bg-brand-red hover:bg-brand-red/90 text-white" disabled={fixable.length === 0 || fixingAll} onClick={() => setConfirmAll(true)}>
                                    {fixingAll ? <Loader2 size={11} className="mr-1 animate-spin" /> : null} Fix All Open ({fixable.length})
                                </Button>
                            </div>
                            <div className="rounded-xl border border-border-sub bg-bg-secondary divide-y divide-border-sub overflow-hidden">
                                {entryPager.items.map(e => {
                                    const isBusy = busy.has(rowKey(e)) || fixingAll;
                                    return (
                                        <div key={rowKey(e)} className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3">
                                            <div className="min-w-0 space-y-0.5">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <a href={`/admin/assignments/${e.job.id}`} className="text-[11px] font-bold font-mono text-blue-400 hover:underline">{e.job.id.toUpperCase()}</a>
                                                    <span className="text-[10px] font-mono text-text-muted">WO {displayWorkOrderNumber(e.job)}</span>
                                                </div>
                                                <p className="text-[11px] font-bold text-text-primary truncate">{e.job.title || e.job.description || '—'}</p>
                                                <p className="text-[10px] text-text-secondary">
                                                    {e.kind === 'stale_helper' ? 'Helper entry' : 'Entry'} on <span className="font-bold">{techName(e.logTechId)}</span>&apos;s log (week of {e.log.weekOf}, {e.log.status})
                                                    {' · '}assigned to <span className="font-bold text-text-primary">{techName(e.assignedTechId)}</span>
                                                </p>
                                            </div>
                                            <div className="shrink-0">
                                                {e.locked ? (
                                                    <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-text-muted"><Lock size={11} /> Settled — adjust in payroll</span>
                                                ) : (
                                                    <Button size="sm" className="h-8 text-[9px] uppercase font-black tracking-widest bg-text-green hover:bg-text-green/90 text-white" disabled={isBusy} onClick={() => handleFix(e)}>
                                                        {busy.has(rowKey(e)) ? <Loader2 size={11} className="animate-spin" /> : e.kind === 'stale_helper' ? 'Remove Entry' : `Move to ${techName(e.assignedTechId)}`}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <ListPager pager={entryPager} noun="entries" />
                        </div>
                    )}

                    {desynced.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                                    Out of sync (hidden from the old tech&apos;s portal, but not yet synced) · {desynced.length}
                                </p>
                                <Button size="sm" variant="outline" className="h-8 text-[9px] uppercase font-black tracking-widest" disabled={syncingAll} onClick={handleSyncAll}>
                                    {syncingAll ? <Loader2 size={11} className="mr-1 animate-spin" /> : null} Sync All ({desynced.length})
                                </Button>
                            </div>
                            <div className="rounded-xl border border-border-sub bg-bg-secondary divide-y divide-border-sub overflow-hidden">
                                {desyncPager.items.map(job => (
                                    <div key={job.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3">
                                        <div className="min-w-0 space-y-0.5">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <a href={`/admin/assignments/${job.id}`} className="text-[11px] font-bold font-mono text-blue-400 hover:underline">{job.id.toUpperCase()}</a>
                                                <span className="text-[10px] font-mono text-text-muted">WO {displayWorkOrderNumber(job)}</span>
                                            </div>
                                            <p className="text-[10px] text-text-secondary">
                                                Assigned to <span className="font-bold text-text-primary">{techName(job.assignedTechnicianId)}</span>; old owner field still points at <span className="font-bold">{techName(job.techId)}</span>
                                            </p>
                                        </div>
                                        <Button size="sm" variant="outline" className="h-8 shrink-0 text-[9px] uppercase font-black tracking-widest" disabled={busy.has(`sync:${job.id}`)} onClick={() => handleSync(job)}>
                                            {busy.has(`sync:${job.id}`) ? <Loader2 size={11} className="animate-spin" /> : `Sync to ${techName(job.assignedTechnicianId)}`}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                            <ListPager pager={desyncPager} noun="jobs" />
                        </div>
                    )}
                </>
            )}

            <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Fix {fixable.length} entries?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Each entry is pulled off the wrong tech&apos;s open log and, if the job is completed, filed on the assigned tech&apos;s log with the same pay figures.
                            Stale helper entries are removed. Entries on approved or paid logs are left for payroll.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleFixAll}>Fix All</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
