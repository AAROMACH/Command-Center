import { collection, doc, getDocs, query, runTransaction, where } from 'firebase/firestore';
import { db } from './firebase';
import { effectiveJobPay, netOfFieldNationFee } from './payroll';
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

/** Shown to the tech: "For WO# 18927 · Camera install · week of 10-12-2026". */
export function adjustmentForText(a: Pick<PayAdjustment, 'jobLabel' | 'workOrderId' | 'sourceWeekOf'>): string {
  const parts = [a.jobLabel || (a.workOrderId ? a.workOrderId.toUpperCase() : ''), a.sourceWeekOf ? `week of ${a.sourceWeekOf}` : ''].filter(Boolean);
  return parts.length ? `For ${parts.join(' · ')}` : 'General adjustment';
}
