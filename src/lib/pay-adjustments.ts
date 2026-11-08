import { collection, doc, getDocs, query, runTransaction, where } from 'firebase/firestore';
import { db } from './firebase';
import { computeWeeklyLogSettlement, effectiveJobPay, netOfFieldNationFee } from './payroll';
import { displayWorkOrderNumber } from './work-order-identity';
import type { PayAdjustment, PayrollDispute, WeeklyLog, WorkOrder } from './types';

/**
 * Pay adjustments: payroll enters what a tech was paid and what they should
 * have been paid; the difference is paid on the tech's next open log (the
 * oldest Submitted one, else the latest Draft). With no open log it waits
 * (status 'queued') and the server puts it on the next Draft it creates
 * (lib/server/weekly-log-server takeQueuedAdjustments).
 */

const roundCents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** MM-dd-yyyy → sortable yyyymmdd. */
const weekKey = (w: string) => { const [m, d, y] = (w || '').split('-'); return `${y || ''}${m || ''}${d || ''}`; };

/** The log the next payout comes from: oldest Submitted, else latest Draft. */
export async function findNextOpenLog(techId: string): Promise<WeeklyLog | null> {
  const snap = await getDocs(query(collection(db, 'weeklyLogs'), where('techId', '==', techId)));
  const logs = snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)).filter(l => !l.paid && !(l as { archived?: boolean }).archived);
  const submitted = logs.filter(l => l.status === 'Submitted').sort((a, b) => weekKey(a.weekOf).localeCompare(weekKey(b.weekOf)));
  if (submitted[0]) return submitted[0];
  const drafts = logs.filter(l => l.status === 'Draft').sort((a, b) => weekKey(b.weekOf).localeCompare(weekKey(a.weekOf)));
  return drafts[0] || null;
}

/** "WO# 18927 · Camera install" — how the job is named on the adjustment. */
export function jobLabelFor(job: WorkOrder | undefined, workOrderId?: string | null): string | null {
  if (!job && !workOrderId) return null;
  const num = job ? displayWorkOrderNumber(job) : '';
  const title = job?.title || job?.description || '';
  return [num ? `WO# ${num}` : (workOrderId || '').toUpperCase(), title].filter(Boolean).join(' · ');
}

/** What the log paid for the disputed job — the starting "was paid" figure. */
export function disputePaidHint(dispute: PayrollDispute, log: WeeklyLog | undefined, jobsById: Map<string, WorkOrder>): number {
  if (!log || !dispute.workOrderId || dispute.reason === 'missing_job') return 0;
  const id = dispute.workOrderId;
  if (dispute.reason === 'missing_reimbursement') {
    return roundCents((log.reimbursements || [])
      .filter(r => (r.workOrderId || r.assignmentId) === id && r.status !== 'pending' && r.status !== 'rejected')
      .reduce((s, r) => s + netOfFieldNationFee(r.amount), 0));
  }
  const item = (log.items || []).find(i => i.workOrderId === id);
  return item ? effectiveJobPay(item, jobsById.get(id)) : 0;
}

export type NewAdjustment = {
  techId: string;
  amount: number;
  reason: string;
  by: string;
  paidAmount?: number | null;
  correctAmount?: number | null;
  techNote?: string | null;
  disputeId?: string | null;
  workOrderId?: string | null;
  jobLabel?: string | null;
  sourceLogId?: string | null;
  sourceWeekOf?: string | null;
  /** Job pay corrections: labor pay before/after (see PayAdjustment). */
  laborBefore?: number | null;
  laborAmount?: number | null;
};

/** Save an adjustment and put it on the tech's next open log (or queue it). */
export async function createPayAdjustment(input: NewAdjustment): Promise<PayAdjustment> {
  const amount = roundCents(Number(input.amount) || 0);
  if (!amount) throw new Error('The adjustment is $0.00 — nothing to pay.');
  const target = await findNextOpenLog(input.techId);
  const ref = doc(collection(db, 'payrollAdjustments'));
  const adj: PayAdjustment = {
    id: ref.id,
    techId: input.techId,
    amount,
    reason: input.reason.trim(),
    paidAmount: input.paidAmount ?? null,
    correctAmount: input.correctAmount ?? null,
    techNote: input.techNote ?? null,
    disputeId: input.disputeId ?? null,
    workOrderId: input.workOrderId ?? null,
    jobLabel: input.jobLabel ?? null,
    sourceLogId: input.sourceLogId ?? null,
    sourceWeekOf: input.sourceWeekOf ?? null,
    laborBefore: input.laborBefore ?? null,
    laborAmount: input.laborAmount ?? null,
    status: target ? 'applied' : 'queued',
    appliedLogId: target?.id ?? null,
    appliedWeekOf: target?.weekOf ?? null,
    by: input.by,
    at: new Date().toISOString(),
  };
  await runTransaction(db, async tx => {
    if (target) {
      const logRef = doc(db, 'weeklyLogs', target.id);
      const fresh = await tx.get(logRef);
      const data = fresh.data() as WeeklyLog | undefined;
      if (!fresh.exists() || !data || data.paid || (data.status !== 'Draft' && data.status !== 'Submitted')) {
        throw new Error('The tech\'s open log just changed. Try again.');
      }
      tx.update(logRef, { payAdjustments: [...(data.payAdjustments || []), adj] });
    }
    tx.set(ref, adj);
  });
  return adj;
}

/**
 * The before → after of a job pay correction: "Labor $195.00 → $250.00 ·
 * your pay $82.05 → $105.20". Null for a plain amount (no job math).
 */
export function correctionText(a: Pick<PayAdjustment, 'laborBefore' | 'laborAmount' | 'paidAmount' | 'correctAmount'>, whose: 'your' | 'tech' = 'your'): string | null {
  const usd = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;
  const parts: string[] = [];
  // Manual jobs: labor and pay are the same number — show it once.
  if (a.laborBefore != null && a.laborAmount != null && a.laborBefore !== a.paidAmount) parts.push(`Labor ${usd(a.laborBefore)} → ${usd(a.laborAmount)}`);
  if (a.paidAmount != null && a.correctAmount != null) parts.push(`${parts.length ? whose : whose === 'your' ? 'Your' : 'Tech'} pay ${usd(a.paidAmount)} → ${usd(a.correctAmount)}`);
  return parts.length ? parts.join(' · ') : null;
}

/** Shown to the tech: "For WO# 18927 · Camera install · week of 10-12-2026". */
export function adjustmentForText(a: Pick<PayAdjustment, 'jobLabel' | 'workOrderId' | 'sourceWeekOf'>): string {
  const parts = [a.jobLabel || (a.workOrderId ? a.workOrderId.toUpperCase() : ''), a.sourceWeekOf ? `week of ${a.sourceWeekOf}` : ''].filter(Boolean);
  return parts.length ? `For ${parts.join(' · ')}` : 'General adjustment';
}

// ── Payout status, editing and moving ───────────────────────────────────────

export type PayoutStatus = 'paid' | 'upcoming' | 'not_set' | 'record_only';
export const PAYOUT_LABEL: Record<PayoutStatus, string> = {
  paid: 'Paid', upcoming: 'Upcoming', not_set: 'Not set', record_only: 'Record only',
};

/**
 * Where an adjustment stands:
 *  - Paid: payroll marked it paid out (they put it in the payroll run).
 *  - Upcoming: it's on a week that hasn't been marked paid out yet.
 *  - Not set: no week yet (queued for the tech's next log).
 *  - Record only: added before adjustments were paid through logs.
 * `weekPaid` = its week is marked paid but the adjustment isn't — a nudge to
 * confirm it really went out.
 */
export function payoutStatus(a: Partial<PayAdjustment> & { status?: string }, logsById: Map<string, WeeklyLog>): { status: PayoutStatus; weekPaid: boolean } {
  if (a.paidOutAt) return { status: 'paid', weekPaid: false };
  if (a.status === 'applied' && a.appliedLogId) return { status: 'upcoming', weekPaid: !!logsById.get(a.appliedLogId)?.paid };
  if (a.status === 'queued') return { status: 'not_set', weekPaid: false };
  return { status: 'record_only', weekPaid: false };
}

/** Logs an adjustment can be moved to: the tech's unpaid Draft / Submitted weeks, newest first. */
export function movableLogs(techId: string, logs: WeeklyLog[]): WeeklyLog[] {
  return logs
    .filter(l => l.techId === techId && !l.paid && !(l as { archived?: boolean }).archived && (l.status === 'Draft' || l.status === 'Submitted'))
    .sort((a, b) => weekKey(b.weekOf).localeCompare(weekKey(a.weekOf)));
}

const stripAdj = (a: PayAdjustment) => JSON.parse(JSON.stringify(a)) as PayAdjustment;

/**
 * Edit an adjustment: amount / reason / note, and the week it's paid on
 * (`toLogId` — a log id, or null for "not set": the next log the tech opens).
 * Both logs' copies and stored totals are updated in one transaction. A paid
 * adjustment, or one on a week already paid, can't be changed.
 */
export async function updatePayAdjustment(adj: PayAdjustment, patch: {
  amount: number; reason: string; paidAmount?: number | null; correctAmount?: number | null;
  /** Job corrections: labor before/after. Omitted = keep what's stored. */
  laborBefore?: number | null; laborAmount?: number | null;
}, toLogId: string | null, by: string, jobsById: Map<string, WorkOrder>): Promise<PayAdjustment> {
  const amount = roundCents(Number(patch.amount) || 0);
  if (!amount) throw new Error('The adjustment is $0.00 — remove it instead, or enter an amount.');
  if (adj.paidOutAt) throw new Error('This adjustment is marked paid. Unmark it first to change it.');
  const fromId = adj.status === 'applied' ? adj.appliedLogId || null : null;
  let saved!: PayAdjustment;
  await runTransaction(db, async tx => {
    const fromRef = fromId ? doc(db, 'weeklyLogs', fromId) : null;
    const toRef = toLogId ? doc(db, 'weeklyLogs', toLogId) : null;
    const fromSnap = fromRef ? await tx.get(fromRef) : null;
    // The held job's original week (read before any write), if this pays one.
    const heldSnap = adj.kind === 'held_job' && adj.heldLogId && adj.heldLogId !== fromId && adj.heldLogId !== toLogId
      ? await tx.get(doc(db, 'weeklyLogs', adj.heldLogId)) : null;
    const toSnap = toRef && toLogId !== fromId ? await tx.get(toRef) : null;
    const from = fromSnap?.exists() ? ({ ...fromSnap.data(), id: fromSnap.id } as WeeklyLog) : null;
    const to = toLogId === fromId ? from : toSnap?.exists() ? ({ ...toSnap.data(), id: toSnap.id } as WeeklyLog) : null;
    if (from?.paid) throw new Error(`The week of ${from.weekOf} is already paid — this adjustment can't change.`);
    if (toLogId && !to) throw new Error('That week no longer exists.');
    if (to && (to.paid || (to.status !== 'Draft' && to.status !== 'Submitted'))) throw new Error(`The week of ${to.weekOf} is ${to.paid ? 'paid' : to.status} — pick an open week.`);

    saved = stripAdj({
      ...adj, amount, reason: patch.reason.trim(),
      paidAmount: patch.paidAmount ?? null, correctAmount: patch.correctAmount ?? null,
      ...(patch.laborBefore !== undefined ? { laborBefore: patch.laborBefore } : {}),
      ...(patch.laborAmount !== undefined ? { laborAmount: patch.laborAmount } : {}),
      status: to ? 'applied' : 'queued', appliedLogId: to?.id ?? null, appliedWeekOf: to?.weekOf ?? null,
      editedAt: new Date().toISOString(), editedBy: by,
    });
    const withTotal = (log: WeeklyLog, list: PayAdjustment[]) => ({
      payAdjustments: list,
      totalPayout: computeWeeklyLogSettlement({ ...log, payAdjustments: list }, jobsById),
    });
    if (from && fromRef && (!to || to.id !== from.id)) {
      tx.update(fromRef, withTotal(from, (from.payAdjustments || []).filter(x => x.id !== adj.id)));
    }
    if (to && toRef) {
      const list = (to.payAdjustments || []).filter(x => x.id !== adj.id).concat(saved);
      tx.update(toRef, withTotal(to, list));
    }
    tx.set(doc(db, 'payrollAdjustments', adj.id), saved);
    // A held job paid by this line: keep its "paid on" week in step.
    if (adj.kind === 'held_job' && adj.heldLogId && adj.heldItemId && heldSnap?.exists()) {
      const heldLog = heldSnap.data() as WeeklyLog;
      const items = (heldLog.items || []).map(i => (i.id === adj.heldItemId && i.payHold
        ? { ...i, payHold: { ...i.payHold, releasedLogId: saved.appliedLogId ?? null, releasedWeekOf: saved.appliedWeekOf ?? null } } : i));
      tx.update(doc(db, 'weeklyLogs', adj.heldLogId), { items: JSON.parse(JSON.stringify(items)) });
    }
  });
  return saved;
}

/** Payroll confirms the adjustment went out in the payroll run (or undoes it). */
export async function setAdjustmentPaid(adj: PayAdjustment, paid: boolean, by: string): Promise<void> {
  const patch = paid ? { paidOutAt: new Date().toISOString(), paidOutBy: by } : { paidOutAt: null, paidOutBy: null };
  await runTransaction(db, async tx => {
    const logRef = adj.status === 'applied' && adj.appliedLogId ? doc(db, 'weeklyLogs', adj.appliedLogId) : null;
    const log = logRef ? await tx.get(logRef) : null;
    if (paid && adj.status !== 'applied') throw new Error('Put it on a week first — it isn’t on one yet.');
    if (log?.exists()) {
      const list = ((log.data() as WeeklyLog).payAdjustments || []).map(x => (x.id === adj.id ? stripAdj({ ...x, ...patch }) : x));
      tx.update(logRef!, { payAdjustments: list });
    }
    tx.update(doc(db, 'payrollAdjustments', adj.id), patch);
  });
}

/**
 * payrollAdjustments is the source of truth. A log's copy is kept only if
 * that adjustment still exists and says it's applied on THIS log; leftovers
 * from older flows (deleted, moved, or copied twice) are stripped.
 * Paid logs keep their totalPayout (that's what was paid); open logs are re-totaled.
 */
export type AdjustmentCleanup = { logId: string; weekOf: string; techId: string; paid: boolean; remove: PayAdjustment[]; keep: PayAdjustment[] };

export async function findStaleLogAdjustments(): Promise<AdjustmentCleanup[]> {
  const [adjSnap, logSnap] = await Promise.all([getDocs(collection(db, 'payrollAdjustments')), getDocs(collection(db, 'weeklyLogs'))]);
  const live = new Map(adjSnap.docs.map(d => [d.id, d.data() as PayAdjustment]));
  return logSnap.docs.map(d => staleAdjustmentsOn({ ...d.data(), id: d.id } as WeeklyLog, live)).filter((c): c is AdjustmentCleanup => !!c);
}

/** Pure: which of this log's adjustment copies are leftovers. */
export function staleAdjustmentsOn(log: WeeklyLog, live: Map<string, Pick<PayAdjustment, 'appliedLogId'>>): AdjustmentCleanup | null {
  const seen = new Set<string>();
  const keep: PayAdjustment[] = [], remove: PayAdjustment[] = [];
  (log.payAdjustments || []).forEach(a => {
    const src = live.get(a.id);
    const ok = !!src && !seen.has(a.id) && src.appliedLogId === log.id;
    seen.add(a.id);
    (ok ? keep : remove).push(a);
  });
  return remove.length ? { logId: log.id, weekOf: log.weekOf, techId: log.techId, paid: !!log.paid, remove, keep } : null;
}

export async function removeStaleLogAdjustments(items: AdjustmentCleanup[], jobsById: Map<string, WorkOrder>): Promise<number> {
  let n = 0;
  for (const c of items) {
    await runTransaction(db, async tx => {
      const ref = doc(db, 'weeklyLogs', c.logId);
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const log = { ...snap.data(), id: snap.id } as WeeklyLog;
      const drop = new Set(c.remove.map(a => a.id));
      const seen = new Set<string>();
      const keepIds = new Set(c.keep.map(a => a.id));
      const list = (log.payAdjustments || []).filter(a => {
        if (drop.has(a.id) && !keepIds.has(a.id)) return false;
        if (seen.has(a.id)) return false;
        seen.add(a.id); return true;
      });
      n += (log.payAdjustments || []).length - list.length;
      tx.update(ref, log.paid ? { payAdjustments: list } : { payAdjustments: list, totalPayout: computeWeeklyLogSettlement({ ...log, payAdjustments: list }, jobsById) });
    });
  }
  return n;
}
