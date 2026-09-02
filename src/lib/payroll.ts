import type { WeeklyLogItem, FinancialRecord, MissingAssignmentReport } from './types';

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
 * TEMPORARY — mirrors the review dialog's live "Net Tech Settlement" total
 * (payroll-review-dialog.tsx's calculatedTotalPayout) so the Payroll Audit
 * Weekly/Staff Pay tabs, CSV export, and Paystub History always agree with
 * it, instead of falling back to the persisted `totalPayout` field (which
 * only refreshes on submit/approve/reject and can go stale). This exists
 * because the real fee-net + 50% split settlement fix (effectiveJobPay /
 * computeWeeklyLogSettlement) is currently reverted at the user's request —
 * once that's reapplied, this should be replaced by computeWeeklyLogSettlement
 * everywhere it's used below, not kept alongside it.
 */
export function liveLogTotal(log: {
  items?: WeeklyLogItem[];
  reimbursements?: FinancialRecord[];
  missingAssignmentReports?: MissingAssignmentReport[];
}): number {
  const itemPay = (log.items || []).reduce((s, i) => s + (i.jobPay || 0), 0);
  const reimbursementPay = (log.reimbursements || [])
    .filter(r => r.status !== 'pending' && r.status !== 'rejected')
    .reduce((s, r) => s + netOfFieldNationFee(r.amount), 0);
  const reportPay = (log.missingAssignmentReports || []).reduce((s, r) =>
    s + (r.jobType === 'Imported'
      ? (r.finalPay || 0) + netOfFieldNationFee(r.auditReimbursement || 0)
      : (r.pay || 0)), 0);
  return itemPay + reimbursementPay + reportPay;
}
