import { format } from 'date-fns';
import type { WeeklyLog, WorkOrder, Technician } from './types';
import { effectiveJobPay, computeWeeklyLogSettlement, netOfFieldNationFee } from './payroll';
import { displayWorkOrderNumber } from './work-order-identity';

/**
 * Full itemized paystub text — company header, tech name, the Mon-Sun pay
 * period, and every VERIFIED job that contributed to the total (disputed
 * items are excluded, same as the settlement total itself, since they
 * aren't being paid). weekOf is stored 'MM-dd-yyyy' as the Monday of that
 * week. Shared by the admin Payroll Audit page and the tech Earnings page
 * so both produce byte-identical stubs for the same log.
 */
export function buildPaystubContent(
  log: WeeklyLog,
  tech: Technician | undefined,
  techId: string,
  jobsById: Map<string, WorkOrder>,
): string {
  const [wm, wd, wy] = log.weekOf.split('-').map(Number);
  const weekStart = new Date(wy || 1970, (wm || 1) - 1, wd || 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const verifiedItems = (log.items || []).filter(i => i.confirmationStatus !== 'disputed');
  const jobLines = verifiedItems.map((item, idx) => {
    const job = jobsById.get(item.workOrderId);
    const label = job?.title || job?.description || item.workOrderId?.toUpperCase() || 'Untitled Job';
    const dateStr = job?.scheduleDate || item.workDate || 'N/A';
    const timeStr = job?.scheduleTime || 'N/A';
    const pay = effectiveJobPay(item, job);
    const asmtId = (item.workOrderId || '').toUpperCase();
    const woNumber = job ? displayWorkOrderNumber(job) : '';
    const idLine = woNumber && woNumber !== asmtId
      ? `Assignment ID: ${asmtId}   Work Order #: ${woNumber}`
      : `Assignment ID: ${asmtId}`;
    return `${idx + 1}. ${label}\n   ${idLine}\n   Date: ${dateStr}   Time: ${timeStr}\n   Pay:  $${pay.toFixed(2)}`;
  });

  const approvedReimbursements = (log.reimbursements || []).filter(r => r.status !== 'pending' && r.status !== 'rejected');
  const reimbLines = approvedReimbursements.map(r => `- ${r.description || 'Reimbursement'}: $${netOfFieldNationFee(r.amount).toFixed(2)}`);

  const rule = '='.repeat(44);
  const thin = '-'.repeat(44);
  const lines = [
    'AAROMACH LLC',
    'PAYSTUB',
    rule,
    `Document ID:  ${log.id.toUpperCase()}`,
    `Generated:    ${format(new Date(), 'MM/dd/yyyy h:mm a')}`,
    thin,
    `Technician:   ${tech?.name || techId}`,
    `Pay Period:   ${format(weekStart, 'MM/dd/yyyy')} - ${format(weekEnd, 'MM/dd/yyyy')}`,
    `Payment Method: ${tech?.payoutPreferences?.method || 'Not on file'}`,
    `Status:       ${log.status}`,
    thin,
    `VERIFIED JOBS (${verifiedItems.length})`,
    thin,
    jobLines.length ? jobLines.join('\n\n') : '(none)',
  ];

  if (reimbLines.length) {
    lines.push(thin, 'REIMBURSEMENTS', thin, reimbLines.join('\n'));
  }

  lines.push(thin, `TOTAL PAID:   $${computeWeeklyLogSettlement(log, jobsById).toFixed(2)}`, rule);
  return lines.join('\n');
}

/** Builds and triggers a browser download of one log's itemized paystub. */
export function downloadPaystub(
  log: WeeklyLog,
  tech: Technician | undefined,
  techId: string,
  jobsById: Map<string, WorkOrder>,
): void {
  const content = buildPaystubContent(log, tech, techId, jobsById);
  const blob = new Blob([content], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `paystub-${(tech?.name || techId).replace(/\s+/g, '-')}-${log.weekOf}.txt`;
  a.click();
}
