import { collection, doc, runTransaction } from 'firebase/firestore';
import { db } from './firebase';
import { computeWeeklyLogSettlement, effectiveJobPay } from './payroll';
import { jobLabelFor } from './pay-adjustments';
import type { PayAdjustment, PayHold, WeeklyLog, WeeklyLogItem, WorkOrder } from './types';

/**
 * Holding a job's pay — for big jobs payroll can't pay until the customer
 * pays us. A held job stays on its week (the tech sees it, with the reason)
 * but isn't in that week's total. Releasing it adds a "held job" line to the
 * week payroll picks, so each week's total matches exactly what was
 * transferred, and the stub says where the extra money came from.
 */

export const DEFAULT_HOLD_REASON = 'Waiting on customer payment';
const roundCents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const clean = <T,>(x: T) => JSON.parse(JSON.stringify(x)) as T;

export type HeldJob = { log: WeeklyLog; item: WeeklyLogItem; hold: PayHold };

/** Every job still on hold (not yet released), oldest first. */
export function heldJobs(logs: WeeklyLog[], techId?: string): HeldJob[] {
  const out: HeldJob[] = [];
  logs.filter(l => !techId || l.techId === techId).forEach(log => (log.items || []).forEach(item => {
    if (item.payHold?.status === 'held') out.push({ log, item, hold: item.payHold });
  }));
  return out.sort((a, b) => (a.hold.heldAt || '').localeCompare(b.hold.heldAt || ''));
}

const withTotal = (log: WeeklyLog, patch: Partial<WeeklyLog>, jobsById: Map<string, WorkOrder>) =>
  ({ ...patch, totalPayout: computeWeeklyLogSettlement({ ...log, ...patch }, jobsById) });

/** Hold a job's pay out of its week. Not on a week already marked paid. */
export async function holdJobPay(logId: string, itemId: string, reason: string, by: string, jobsById: Map<string, WorkOrder>): Promise<WeeklyLogItem[]> {
  let items: WeeklyLogItem[] = [];
  await runTransaction(db, async tx => {
    const ref = doc(db, 'weeklyLogs', logId);
    const snap = await tx.get(ref);
    const log = { ...snap.data(), id: snap.id } as WeeklyLog;
    if (!snap.exists()) throw new Error('That week no longer exists.');
    if (log.paid) throw new Error(`The week of ${log.weekOf} is already paid — it can't be held now.`);
    const item = (log.items || []).find(i => i.id === itemId);
    if (!item) throw new Error('That job is no longer on this week.');
    if (item.payHold) throw new Error('This job is already held.');
    const hold: PayHold = {
      status: 'held', reason: reason.trim() || DEFAULT_HOLD_REASON,
      amount: roundCents(effectiveJobPay(item, jobsById.get(item.workOrderId))),
      heldAt: new Date().toISOString(), heldBy: by,
    };
    items = (log.items || []).map(i => (i.id === itemId ? { ...i, payHold: hold } : i));
    tx.update(ref, withTotal(log, { items: clean(items) }, jobsById));
  });
  return items;
}

/** Undo a hold that hasn't been released: the job is paid on its own week again. */
export async function undoJobHold(logId: string, itemId: string, jobsById: Map<string, WorkOrder>): Promise<WeeklyLogItem[]> {
  let items: WeeklyLogItem[] = [];
  await runTransaction(db, async tx => {
    const ref = doc(db, 'weeklyLogs', logId);
    const snap = await tx.get(ref);
    const log = { ...snap.data(), id: snap.id } as WeeklyLog;
    if (log.paid) throw new Error(`The week of ${log.weekOf} is already paid — release the job to an open week instead.`);
    const item = (log.items || []).find(i => i.id === itemId);
    if (item?.payHold?.status !== 'held') throw new Error('This job isn’t on hold.');
    items = (log.items || []).map(i => {
      if (i.id !== itemId) return i;
      const { payHold: _drop, ...rest } = i;
      return rest as WeeklyLogItem;
    });
    tx.update(ref, withTotal(log, { items: clean(items) }, jobsById));
  });
  return items;
}

/**
 * Release a held job: pay it on `toLogId` (an open Draft/Submitted week of
 * the same tech) as a held-job line, or leave it Not set (queued for the
 * tech's next log). Marks the hold released on its original week.
 */
export async function releaseHeldJob(heldLogId: string, itemId: string, toLogId: string | null, by: string, jobsById: Map<string, WorkOrder>): Promise<PayAdjustment> {
  const adjRef = doc(collection(db, 'payrollAdjustments'));
  let adj!: PayAdjustment;
  await runTransaction(db, async tx => {
    const heldRef = doc(db, 'weeklyLogs', heldLogId);
    const toRef = toLogId && toLogId !== heldLogId ? doc(db, 'weeklyLogs', toLogId) : null;
    const heldSnap = await tx.get(heldRef);
    const toSnap = toRef ? await tx.get(toRef) : null;
    const held = { ...heldSnap.data(), id: heldSnap.id } as WeeklyLog;
    const item = (held.items || []).find(i => i.id === itemId);
    if (!item?.payHold || item.payHold.status !== 'held') throw new Error('This job isn’t on hold any more.');
    const to = toLogId === heldLogId ? held : toSnap?.exists() ? ({ ...toSnap.data(), id: toSnap.id } as WeeklyLog) : null;
    if (toLogId && !to) throw new Error('That week no longer exists.');
    if (to && (to.paid || (to.status !== 'Draft' && to.status !== 'Submitted'))) throw new Error(`The week of ${to.weekOf} is ${to.paid ? 'paid' : to.status} — pick an open week.`);
    if (to && to.techId !== held.techId) throw new Error('That week belongs to another tech.');

    const now = new Date().toISOString();
    adj = clean<PayAdjustment>({
      id: adjRef.id, techId: held.techId, amount: item.payHold.amount, kind: 'held_job',
      reason: `Held job paid — ${item.payHold.reason}`,
      workOrderId: item.workOrderId, jobLabel: jobLabelFor(jobsById.get(item.workOrderId), item.workOrderId),
      sourceLogId: held.id, sourceWeekOf: held.weekOf, heldLogId: held.id, heldItemId: item.id,
      status: to ? 'applied' : 'queued', appliedLogId: to?.id ?? null, appliedWeekOf: to?.weekOf ?? null,
      by, at: now,
    });
    const heldItems = (held.items || []).map(i => (i.id === itemId
      ? { ...i, payHold: { ...item.payHold!, status: 'released' as const, releasedAt: now, releasedBy: by, adjustmentId: adj.id, releasedLogId: to?.id ?? null, releasedWeekOf: to?.weekOf ?? null } } : i));
    if (to && to.id === held.id) {
      const list = [...(held.payAdjustments || []), adj];
      tx.update(heldRef, withTotal(held, { items: clean(heldItems), payAdjustments: list }, jobsById));
    } else {
      tx.update(heldRef, { items: clean(heldItems) });
      if (to && toRef) {
        const list = [...(to.payAdjustments || []), adj];
        tx.update(toRef, withTotal(to, { payAdjustments: list }, jobsById));
      }
    }
    tx.set(adjRef, adj);
  });
  return adj;
}

/**
 * Put a released hold back on hold: take its line off the week it was paid
 * on, mark the job held again on its original week, and delete the
 * adjustment. Only while that week isn't paid and the line wasn't paid out.
 */
export async function reholdReleasedJob(adjId: string, by: string, jobsById: Map<string, WorkOrder>): Promise<void> {
  await runTransaction(db, async tx => {
    const adjRef = doc(db, 'payrollAdjustments', adjId);
    const adjSnap = await tx.get(adjRef);
    if (!adjSnap.exists()) throw new Error('That payment was already removed.');
    const adj = adjSnap.data() as PayAdjustment;
    if (adj.kind !== 'held_job' || !adj.heldLogId || !adj.heldItemId) throw new Error('This isn’t a held job.');
    if (adj.paidOutAt) throw new Error('This was already paid out — it can’t go back on hold.');
    const heldRef = doc(db, 'weeklyLogs', adj.heldLogId);
    const toRef = adj.appliedLogId && adj.appliedLogId !== adj.heldLogId ? doc(db, 'weeklyLogs', adj.appliedLogId) : null;
    const heldSnap = await tx.get(heldRef);
    const toSnap = toRef ? await tx.get(toRef) : null;
    if (!heldSnap.exists()) throw new Error('The job’s original week no longer exists.');
    const held = { ...heldSnap.data(), id: heldSnap.id } as WeeklyLog;
    const to = toSnap?.exists() ? ({ ...toSnap.data(), id: toSnap.id } as WeeklyLog) : adj.appliedLogId === held.id ? held : null;
    if (to?.paid) throw new Error(`The week of ${to.weekOf} is already paid — it can’t be taken back.`);
    const item = (held.items || []).find(i => i.id === adj.heldItemId);
    if (!item?.payHold) throw new Error('The job is no longer on its original week.');
    const heldItems = (held.items || []).map(i => (i.id === item.id ? {
      ...i, payHold: { status: 'held' as const, reason: item.payHold!.reason, amount: item.payHold!.amount, heldAt: new Date().toISOString(), heldBy: by },
    } : i));
    if (to && to.id === held.id) {
      tx.update(heldRef, withTotal(held, { items: clean(heldItems), payAdjustments: (held.payAdjustments || []).filter(a => a.id !== adjId) }, jobsById));
    } else {
      tx.update(heldRef, { items: clean(heldItems) });
      if (to && toRef) tx.update(toRef, withTotal(to, { payAdjustments: (to.payAdjustments || []).filter(a => a.id !== adjId) }, jobsById));
    }
    tx.delete(adjRef);
  });
}
