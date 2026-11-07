import type { WeeklyLogItem, FinancialRecord, MissingAssignmentReport, PayAdjustment, WorkOrder } from './types';

// ── Field Nation platform fee ───────────────────────────────────────────────
//
// Field Nation takes a fixed platform fee off everything routed through it —
// labor pay AND reimbursements. The tech nets the remainder. Keeping the rate
// here (instead of a scattered 0.1585 magic number) makes the payroll math a
// single source of truth.

/** Field Nation platform fee rate (15.85%). */
export const FIELD_NATION_FEE_RATE = 0.1585;

// Settle each displayed pay line to cents before adding a weekly total. This
// keeps the total equal to the amounts shown on job rows and paystubs.
const payCents = (amount: number): number => Math.round((amount + Number.EPSILON) * 100);

/** Amount left after the Field Nation platform fee — i.e. what the tech nets. */
export const netOfFieldNationFee = (amount: number): number =>
  payCents((amount || 0) * (1 - FIELD_NATION_FEE_RATE)) / 100;

/**
 * The tech's actual settlement for one weekly-log item — NOT the raw
 * job.pay. An Imported (Field Nation) job pays the tech 50% of its pay
 * amount net of the FN platform fee; a Manual/direct job pays the tech the
 * full logged amount (Aaromach doesn't take a cut). Always derived from the
 * linked job's CURRENT pay, so correcting a job's pay through the payroll
 * audit pay-editor is reflected immediately without a separate "commit"
 * step re-deriving it. Falls back to the item's stored jobPay when the
 * linked job can't be found (e.g. it was later archived/deleted).
 */
export function effectiveJobPay(item: WeeklyLogItem, job: WorkOrder | undefined): number {
  // A helper's line is whatever payroll typed in ($0 until priced) — never
  // the lead's share of the job.
  if (item.isHelper) return payCents(item.jobPay || 0) / 100;
  // Job doc not readable here (a tech's earnings page can't see every job):
  // the item remembers it was a Field Nation job, so still apply fee + split
  // to the stored gross instead of showing the whole work-order pay.
  if (!job) {
    if (item.jobSource !== 'Imported') return payCents(item.jobPay || 0) / 100;
    return payCents(Math.max(0, (item.jobPay || 0) * (1 - FIELD_NATION_FEE_RATE) * 0.5)) / 100;
  }
  if (job.source !== 'Imported') return payCents(item.jobPay || 0) / 100;
  const netLabor = (job.pay || 0) * (1 - FIELD_NATION_FEE_RATE);
  return payCents(Math.max(0, netLabor * 0.5)) / 100;
}

type SettlementLog = {
  items?: WeeklyLogItem[];
  reimbursements?: FinancialRecord[];
  missingAssignmentReports?: MissingAssignmentReport[];
  payAdjustments?: PayAdjustment[];
};

/** One reimbursement the tech is paid on a log, net of the Field Nation fee. */
export type ReimbursementPayLine = {
  id: string;
  workOrderId?: string;
  description: string;
  /** What was spent / entered. */
  gross: number;
  /** What the tech is paid (gross less the FN fee). */
  net: number;
  /** 'log' = an approved reimbursement on the log; 'report' = a missing-job report's audited reimbursement. */
  source: 'log' | 'report';
};

export const countedItems = (log: SettlementLog) => (log.items || [])
  .filter(i => i.confirmationStatus !== 'disputed')
  // Removed as a helper: not paid unless payroll decides they worked it.
  .filter(i => !i.helperRemoved)
  // Held by payroll: paid later, on the week it's released to (lib/pay-holds).
  .filter(i => !i.payHold);

/**
 * Every reimbursement paid on a log: approved reimbursements (pending and
 * rejected ones aren't paid) and audited missing-job reports. The pay
 * calculator's Reimb. box mirrors the approved ones, so it isn't counted again.
 */
export function weeklyLogReimbursementLines(log: SettlementLog): ReimbursementPayLine[] {
  const lines: ReimbursementPayLine[] = (log.reimbursements || [])
    .filter(r => r.status !== 'pending' && r.status !== 'rejected')
    .map(r => ({ id: r.id, workOrderId: r.workOrderId || r.assignmentId, source: 'log' as const, description: r.description || 'Reimbursement', gross: Number(r.amount) || 0, net: netOfFieldNationFee(r.amount) }));
  (log.missingAssignmentReports || [])
    .filter(r => r.isAudited && r.jobType === 'Imported' && (r.auditReimbursement || 0) > 0)
    .forEach(r => lines.push({
      id: `report-${r.id}`, source: 'report', description: `Reimbursement · ${r.externalWorkOrderId || r.clientName || 'reported job'}`,
      gross: r.auditReimbursement || 0, net: netOfFieldNationFee(r.auditReimbursement || 0),
    }));
  return lines;
}

export type WeeklyLogPay = {
  /** Pay for the work: jobs (after the FN fee/split) and approved missing-job reports. */
  jobPay: number;
  /** Approved reimbursements, net of the FN fee. */
  reimbursementPay: number;
  /** Pay corrections paid on this log (+ owed / − overpaid). */
  adjustmentPay: number;
  /** jobPay + reimbursementPay + adjustmentPay — what the tech nets for the week. */
  total: number;
  /** Reimbursements the tech requested that payroll hasn't reviewed (gross, not in total). */
  pendingReimbursement: number;
};

/**
 * A weekly log's settlement, split into work pay and reimbursements:
 * tech payout after the FN fee/split, excluding disputed items (a disputed
 * job isn't necessarily getting paid until the dispute is resolved) and
 * missing-job reports payroll hasn't approved yet. `jobsById` is optional —
 * omit it and every item falls back to its stored jobPay (no Imported-job
 * pay recalculation).
 */
export function computeWeeklyLogPay(log: SettlementLog, jobsById: Map<string, WorkOrder> = new Map()): WeeklyLogPay {
  const itemPayCents = countedItems(log)
    .reduce((s, i) => s + payCents(effectiveJobPay(i, jobsById.get(i.workOrderId))), 0);
  // A job the tech reported missing is only paid once payroll says Yes
  // (isAudited) — never just because the tech added it.
  const reportPayCents = (log.missingAssignmentReports || []).filter(r => r.isAudited).reduce((s, r) =>
    s + payCents(r.jobType === 'Imported' ? (r.finalPay || 0) : (r.pay || 0)), 0);
  const reimbCents = weeklyLogReimbursementLines(log).reduce((s, l) => s + payCents(l.net), 0);
  const pendingCents = (log.reimbursements || []).filter(r => r.status === 'pending').reduce((s, r) => s + payCents(Number(r.amount) || 0), 0);
  const adjCents = (log.payAdjustments || []).reduce((s, a) => s + payCents(Number(a.amount) || 0), 0);
  const jobCents = itemPayCents + reportPayCents;
  return {
    jobPay: jobCents / 100, reimbursementPay: reimbCents / 100, adjustmentPay: adjCents / 100,
    total: (jobCents + reimbCents + adjCents) / 100, pendingReimbursement: pendingCents / 100,
  };
}

/** The tech's estimate: real pay, with each job's own guessed pay swapped in
 *  where they entered one. Display only — never used to pay. */
export function computeWeeklyLogEstimate(log: SettlementLog, jobsById: Map<string, WorkOrder> = new Map()): WeeklyLogPay {
  const real = computeWeeklyLogPay(log, jobsById);
  const deltaCents = countedItems(log).reduce((s, i) => {
    const est = (i as WeeklyLogItem).estimatedPay;
    return est == null ? s : s + payCents(est) - payCents(effectiveJobPay(i, jobsById.get(i.workOrderId)));
  }, 0);
  return { ...real, jobPay: real.jobPay + deltaCents / 100, total: real.total + deltaCents / 100 };
}

/** A weekly log's true settlement total (work pay + reimbursements + adjustments). See computeWeeklyLogPay. */
export function computeWeeklyLogSettlement(log: SettlementLog, jobsById: Map<string, WorkOrder> = new Map()): number {
  return computeWeeklyLogPay(log, jobsById).total;
}
