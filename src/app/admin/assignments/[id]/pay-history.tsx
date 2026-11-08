'use client';
import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { DollarSign, History } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { WorkOrder, Technician, WeeklyLog, PayAdjustment } from '@/lib/types';
import { buildAssignmentPayHistory, payEventTime, type AuditLogEvent, type AssignmentPayHistory } from '@/lib/assignment-pay-history';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { TONE_DOT } from '@/lib/status-styles';
import { cn } from '@/lib/utils';

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;

function when(at: string) {
  const t = payEventTime(at);
  if (!t) return at || '—';
  const d = new Date(t);
  const date = d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  return /^\d{2}-\d{2}-\d{4}$/.test(at) ? date : `${date} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

/** Every tech who could have a weekly-log line for this job: lead, helpers, past techs. */
function candidateTechIds(job: WorkOrder): string[] {
  const ids = new Set<string>();
  [job.assignedTechnicianId, job.techId, ...(job.assignedTechIds || []), ...(job.additionalTechnicianIds || [])]
    .forEach(id => id && ids.add(id));
  for (const h of job.history || []) {
    const e = h as unknown as Record<string, unknown>;
    ['previousTechnicianId', 'newTechnicianId'].forEach(k => typeof e[k] === 'string' && e[k] && ids.add(e[k] as string));
  }
  return [...ids].slice(0, 30);
}

/** Loads and builds this job's pay history (Firestore reads only). */
export function useAssignmentPayHistory(job: WorkOrder | null, workOrderId: string, techs: Technician[]) {
  const [logs, setLogs] = useState<WeeklyLog[] | null>(null);
  const [audit, setAudit] = useState<Record<string, AuditLogEvent[]>>({});
  const [adjustments, setAdjustments] = useState<PayAdjustment[]>([]);
  const techKey = job ? candidateTechIds(job).join(',') : '';

  useEffect(() => {
    if (!techKey) { setLogs([]); return; }
    return onSnapshot(
      query(collection(db, 'weeklyLogs'), where('techId', 'in', techKey.split(','))),
      s => setLogs(s.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog))
        .filter(l => l.items?.some(i => i.workOrderId === workOrderId))),
      () => setLogs([]),
    );
  }, [techKey, workOrderId]);

  const logKey = (logs || []).map(l => l.id).sort().join(',');
  useEffect(() => {
    let live = true;
    const ids = [workOrderId, ...(logKey ? logKey.split(',') : [])];
    Promise.all(ids.map(async id => {
      try {
        const s = await getDocs(query(collection(db, 'auditLog', id, 'events'), orderBy('changedAt', 'desc'), limit(200)));
        return [id, s.docs.map(d => d.data() as AuditLogEvent)] as const;
      } catch { return [id, []] as const; } // audit trail is admin-only: hide quietly
    })).then(rows => { if (live) setAudit(Object.fromEntries(rows)); });
    return () => { live = false; };
  }, [logKey, workOrderId]);

  useEffect(() => onSnapshot(
    query(collection(db, 'payrollAdjustments'), where('workOrderId', '==', workOrderId)),
    s => setAdjustments(s.docs.map(d => ({ ...d.data(), id: d.id } as PayAdjustment))),
    () => setAdjustments([]), // payroll admins only — hide that part
  ), [workOrderId]);

  const techNames = useMemo(() => Object.fromEntries(techs.map(t => [t.id, t.name])), [techs]);
  const history = useMemo<AssignmentPayHistory | null>(() => logs && buildAssignmentPayHistory({
    workOrderId, job, logs, techNames, auditEvents: audit, adjustments,
  }), [logs, workOrderId, job, techNames, audit, adjustments]);
  return history;
}

export function PayHistorySection({ history }: { history: AssignmentPayHistory | null }) {
  if (!history) return <LoadingState label="Loading pay history…" rows={3} />;
  const { lines, events, summary } = history;
  if (!lines.length && !events.length) {
    return <EmptyState icon={DollarSign} title="No pay history yet" description="This job isn't on any weekly log, and no adjustments were made for it." />;
  }
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border-sub bg-bg-secondary p-4">
        <p className="text-[12px] font-semibold text-text-muted">Summary</p>
        <p className="mt-1 text-[14px] font-semibold text-text-primary break-words">{summary.text}</p>
      </div>

      <div className="rounded-xl border border-border-sub bg-bg-secondary p-4">
        <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-text-primary">
          <DollarSign size={14} className="text-text-muted" /> Weekly log lines
        </p>
        {lines.length ? (
          <div className="divide-y divide-border-sub">
            {lines.map(l => (
              <div key={`${l.logId}-${l.itemId}`} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-text-primary">{l.techName}</span>
                    <span className="text-[11px] text-text-muted">{l.isHelper ? 'Helper' : 'Lead'}</span>
                    <StatusBadge kind="log" value={l.status} />
                    {l.held && <StatusBadge kind="pay" value="submitted" label="Held" />}
                    {l.removedHelper && <StatusBadge kind="log" value="rejected" label="Removed as helper" />}
                    {l.dispute && <StatusBadge kind="log" value="rejected" label="Disputed" />}
                  </div>
                  <p className="text-[12px] text-text-secondary">
                    Week of {l.weekOf} · <span className="font-mono text-[11px] text-text-muted">{l.logId}</span>
                  </p>
                  {(l.approvedAt || l.paidAt) && (
                    <p className="text-[11px] text-text-muted">
                      {l.approvedAt && <>Approved {when(l.approvedAt)}{l.approvedByName ? ` by ${l.approvedByName}` : ''}</>}
                      {l.approvedAt && l.paidAt && ' · '}
                      {l.paidAt && <>Paid {when(l.paidAt)}{l.paidByName ? ` by ${l.paidByName}` : ''}</>}
                    </p>
                  )}
                  {l.hold && (
                    <p className="text-[11px] text-text-muted">
                      {l.hold.status === 'held' ? 'Held' : 'Hold released'} {money(l.hold.amount)} — {l.hold.reason}
                      {l.hold.releasedWeekOf ? ` · paid on week of ${l.hold.releasedWeekOf}` : ''}
                    </p>
                  )}
                  {l.dispute && (
                    <p className="text-[11px] text-text-muted break-words">
                      Dispute: {l.dispute.kind}{l.dispute.reason ? ` — ${l.dispute.reason}` : ''}
                      {l.dispute.decision ? ` · decided ${l.dispute.decision === 'yes' ? 'Yes' : 'No'}${l.dispute.by ? ` by ${l.dispute.by}` : ''}${l.dispute.note ? ` (${l.dispute.note})` : ''}` : ' · awaiting decision'}
                    </p>
                  )}
                </div>
                <p className={cn('shrink-0 font-mono text-[14px] font-semibold tabular-nums', l.held ? 'text-text-muted line-through' : 'text-text-green')}>{money(l.pay)}</p>
              </div>
            ))}
          </div>
        ) : <p className="text-[12px] text-text-muted">Not on any weekly log.</p>}
      </div>

      <div className="rounded-xl border border-border-sub bg-bg-secondary p-4">
        <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-text-primary">
          <History size={14} className="text-text-muted" /> Pay timeline
        </p>
        <ol className="space-y-0">
          {events.map((e, i) => (
            <li key={i} className="flex gap-3 border-b border-border-sub py-2.5 first:pt-0 last:border-0 last:pb-0">
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE_DOT[e.tone])} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="min-w-0 text-[13px] font-medium text-text-primary break-words">{e.title}</p>
                  {e.amount != null && <span className="shrink-0 font-mono text-[12px] tabular-nums text-text-secondary">{money(e.amount)}</span>}
                </div>
                <p className="text-[11px] text-text-muted break-words">
                  {when(e.at)}{e.who ? ` · ${e.who}` : ''}
                  {e.logId && <> · <span className="font-mono">{e.logId}</span></>}
                </p>
                {e.detail && <p className="mt-0.5 text-[12px] text-text-secondary break-words">{e.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
