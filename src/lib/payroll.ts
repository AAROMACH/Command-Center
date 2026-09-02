import type { WeeklyLogItem, FinancialRecord, MissingAssignmentReport, WorkOrder } from './types';

// ── Field Nation platform fee ───────────────────────────────────────────────
//
// Field Nation takes a fixed platform fee off everything routed through it —
// labor pay AND reimbursements. The tech nets the remainder. Keeping the rate
// here (instead of a scattered 0.1585 magic number) makes the payroll math a
// single source of truth.

/** Field Nation platform fee rate (15.85%). */
export const FIELD_NATION_FEE_RATE = 0.1585;

/** Amount left after the Field Nation platform fee — i.e. what the tech nets. */
export const netOfFieldNationFee = (amount: number): number =>
  (amount || 0) * (1 - FIELD_NATION_FEE_RATE);

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
  if (!job || job.source !== 'Imported') return item.jobPay || 0;
  const netLabor = (job.pay || 0) * (1 - FIELD_NATION_FEE_RATE);
  return Math.max(0, netLabor * 0.5);
}

/**
 * A weekly log's true settlement total: tech payout after the FN fee/split,
 * excluding disputed items (a disputed job isn't necessarily getting paid
 * until the dispute is resolved, so it shouldn't move the total either
 * way). `jobsById` is optional — omit it and every item falls back to its
 * stored jobPay (no Imported-job pay recalculation).
 */
export function computeWeeklyLogSettlement(
  log: {
    items?: WeeklyLogItem[];
    reimbursements?: FinancialRecord[];
    missingAssignmentReports?: MissingAssignmentReport[];
  },
  jobsById: Map<string, WorkOrder> = new Map(),
): number {
  const itemPay = (log.items || [])
    .filter(i => i.confirmationStatus !== 'disputed')
    .reduce((s, i) => s + effectiveJobPay(i, jobsById.get(i.workOrderId)), 0);
  const reimbursementPay = (log.reimbursements || [])
    .filter(r => r.status !== 'pending' && r.status !== 'rejected')
    .reduce((s, r) => s + netOfFieldNationFee(r.amount), 0);
  const reportPay = (log.missingAssignmentReports || []).reduce((s, r) =>
    s + (r.jobType === 'Imported'
      ? (r.finalPay || 0) + netOfFieldNationFee(r.auditReimbursement || 0)
      : (r.pay || 0)), 0);
  return itemPay + reimbursementPay + reportPay;
}
