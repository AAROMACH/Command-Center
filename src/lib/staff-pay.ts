import { addWeeks, format, parse, startOfWeek } from 'date-fns';
import { collection, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { reportingWeekOf } from './weekly-log-core';

/**
 * Staff pay plans — money the company pays a person on top of (or outside)
 * weekly job logs, tracked week by week so it can be verified:
 *  - recurring:   a set amount every week (e.g. a weekly bonus);
 *  - installment: a total paid down in weekly amounts (e.g. $2,000 for
 *                 building the app).
 * Each week payroll records Paid (with the amount actually paid) or Skipped.
 * A skipped (or short) week goes into the plan's bank — owed, not lost — and
 * paying more than scheduled later draws the bank down.
 * staffPayPlans/{id} and staffPayEntries/{planId}_{yyyymmdd}: payroll writes;
 * the person can read their own (firestore.rules).
 */

export type StaffPayPlan = {
  id: string;
  personId: string;
  personName: string;
  kind: 'recurring' | 'installment';
  /** e.g. "Weekly bonus", "App build ($2,000)". */
  label: string;
  /** Scheduled each week. */
  weeklyAmount: number;
  /** Installment only: the full amount owed. */
  total?: number | null;
  /** First week ('MM-dd-yyyy', a Monday). */
  startWeek: string;
  active: boolean;
  notes?: string | null;
  createdAt: string;
  createdBy: string;
};

export type StaffPayEntry = {
  id: string;
  planId: string;
  personId: string;
  weekOf: string;
  /** What was due that week (scheduled amount, for an installment capped at what's left). */
  scheduled: number;
  /** What was actually paid (0 when skipped). */
  paid: number;
  status: 'paid' | 'skipped';
  note?: string | null;
  by: string;
  at: string;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const toDate = (w: string) => parse(w, 'MM-dd-yyyy', new Date());
export const weekKey = (w: string) => format(toDate(w), 'yyyyMMdd');
export const mondayOf = (d: Date) => format(startOfWeek(d, { weekStartsOn: 1 }), 'MM-dd-yyyy');
export const entryId = (planId: string, weekOf: string) => `${planId}_${weekKey(weekOf)}`;

export type PlanWeek = { weekOf: string; scheduled: number; entry: StaffPayEntry | null };
export type PlanSummary = {
  weeks: PlanWeek[];            // newest first, start → this week
  thisWeek: PlanWeek | null;
  paidTotal: number;
  /** Skipped or short weeks not yet caught up (recurring and installment). */
  banked: number;
  /** Past weeks with nothing recorded — payroll still needs to mark them. */
  unrecorded: PlanWeek[];
  /** Installment only. */
  remaining: number | null;
  done: boolean;
};

/**
 * Week-by-week view of a plan through the current week. An installment's
 * schedule stops once what's been paid plus what's scheduled reaches the total.
 */
export function summarizePlan(plan: StaffPayPlan, entries: StaffPayEntry[], currentWeek = reportingWeekOf()): PlanSummary {
  const byWeek = new Map(entries.filter(e => e.planId === plan.id).map(e => [e.weekOf, e]));
  const weeks: PlanWeek[] = [];
  const end = toDate(currentWeek);
  let scheduledSoFar = 0;
  for (let d = toDate(plan.startWeek), i = 0; d <= end && i < 520; d = addWeeks(d, 1), i++) {
    const weekOf = format(d, 'MM-dd-yyyy');
    let scheduled = plan.weeklyAmount;
    if (plan.kind === 'installment' && plan.total != null) {
      scheduled = r2(Math.max(0, Math.min(plan.weeklyAmount, plan.total - scheduledSoFar)));
      if (scheduled <= 0 && !byWeek.has(weekOf)) break;
    }
    scheduledSoFar = r2(scheduledSoFar + scheduled);
    weeks.push({ weekOf, scheduled, entry: byWeek.get(weekOf) || null });
  }
  // Entries recorded for weeks outside the schedule still count.
  byWeek.forEach((e, w) => { if (!weeks.some(x => x.weekOf === w)) weeks.push({ weekOf: w, scheduled: e.scheduled, entry: e }); });
  weeks.sort((a, b) => weekKey(b.weekOf).localeCompare(weekKey(a.weekOf)));

  const recorded = weeks.filter(w => w.entry);
  const paidTotal = r2(recorded.reduce((s, w) => s + (w.entry!.paid || 0), 0));
  const banked = r2(Math.max(0, recorded.reduce((s, w) => s + (w.entry!.scheduled - (w.entry!.paid || 0)), 0)));
  const remaining = plan.kind === 'installment' && plan.total != null ? r2(Math.max(0, plan.total - paidTotal)) : null;
  return {
    weeks,
    thisWeek: weeks.find(w => w.weekOf === currentWeek) || null,
    paidTotal, banked,
    unrecorded: weeks.filter(w => !w.entry && w.weekOf !== currentWeek && w.scheduled > 0),
    remaining,
    done: remaining != null && remaining <= 0,
  };
}

export async function createStaffPayPlan(p: Omit<StaffPayPlan, 'id' | 'createdAt'>): Promise<string> {
  const ref = doc(collection(db, 'staffPayPlans'));
  const plan: StaffPayPlan = {
    ...p, id: ref.id, startWeek: mondayOf(toDate(p.startWeek)), weeklyAmount: r2(p.weeklyAmount),
    total: p.kind === 'installment' ? r2(Number(p.total) || 0) : null, createdAt: new Date().toISOString(),
  };
  await setDoc(ref, JSON.parse(JSON.stringify(plan)));
  return ref.id;
}

export const updateStaffPayPlan = (id: string, patch: Partial<Pick<StaffPayPlan, 'label' | 'weeklyAmount' | 'total' | 'active' | 'notes'>>) =>
  updateDoc(doc(db, 'staffPayPlans', id), JSON.parse(JSON.stringify(patch)));

/** Record a week: Paid (with the amount actually paid — more than scheduled catches up the bank) or Skipped. */
export async function recordStaffPayWeek(plan: StaffPayPlan, weekOf: string, scheduled: number, status: 'paid' | 'skipped', paid: number, by: string, note?: string): Promise<void> {
  const e: StaffPayEntry = {
    id: entryId(plan.id, weekOf), planId: plan.id, personId: plan.personId, weekOf,
    scheduled: r2(scheduled), paid: status === 'skipped' ? 0 : r2(Math.max(0, paid)), status,
    note: note?.trim() || null, by, at: new Date().toISOString(),
  };
  await setDoc(doc(db, 'staffPayEntries', e.id), JSON.parse(JSON.stringify(e)));
}
