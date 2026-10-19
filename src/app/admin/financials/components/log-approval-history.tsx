'use client';
import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { History } from 'lucide-react';
import { db } from '@/lib/firebase';

type Entry = { at: string; action: string; by: string };

// Status changes payroll records in auditLog/{logId}/events (see auditEvent
// calls in payroll-review-dialog). Other actions (item moves etc.) are left out.
const LABELS: Record<string, string> = {
    payroll_approved: 'Approved',
    payroll_rejected: 'Rejected',
    payroll_draft: 'Returned to draft',
    payroll_submitted: 'Set back to submitted',
    payroll_reopened: 'Reopened',
    payroll_reopened_edit: 'Reopened to edit',
    unsubmit_approved: 'Unsubmit approved',
};

/** Every approve / return / reject on one weekly log, oldest first. */
export function LogApprovalHistory({ logId, submittedAt }: { logId: string; submittedAt?: string }) {
    const [open, setOpen] = useState(false);
    const [entries, setEntries] = useState<Entry[] | null>(null);

    useEffect(() => {
        if (!open || entries) return;
        getDocs(query(collection(db, 'auditLog', logId, 'events'), orderBy('changedAt', 'asc')))
            .then(snap => setEntries(snap.docs.map(d => d.data())
                .filter(e => e.field === '__action__' && LABELS[e.newValue])
                .map(e => ({ at: e.changedAt, action: LABELS[e.newValue], by: e.changedByName || 'Admin' }))))
            .catch(() => setEntries([]));
    }, [open, entries, logId]);

    const rows: Entry[] = [
        ...(submittedAt ? [{ at: submittedAt, action: 'Submitted', by: 'Tech' }] : []),
        ...(entries || []),
    ].sort((a, b) => a.at.localeCompare(b.at));
    const when = (iso: string) => { try { return format(parseISO(iso), 'MMM d, yyyy · h:mm a'); } catch { return iso; } };

    return (
        <div className="text-left">
            <button onClick={() => setOpen(o => !o)} className="text-[12px] font-medium text-text-muted hover:text-text-primary flex items-center gap-1.5">
                <History size={13} /> Approval history {open ? '▾' : '▸'}
            </button>
            {open && (
                <div className="mt-2 rounded-lg border border-border-sub bg-bg-primary divide-y divide-border-sub">
                    {entries === null ? (
                        <p className="px-3 py-2 text-[12px] text-text-muted">Loading…</p>
                    ) : rows.length === 0 ? (
                        <p className="px-3 py-2 text-[12px] text-text-muted">No history recorded for this log.</p>
                    ) : rows.map((r, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-[12px]">
                            <span className="font-semibold text-text-primary">{r.action}<span className="font-normal text-text-muted"> · {r.by}</span></span>
                            <span className="font-mono text-text-muted whitespace-nowrap">{when(r.at)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
