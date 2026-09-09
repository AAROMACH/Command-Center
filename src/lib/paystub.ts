import { format } from 'date-fns';
import jsPDF from 'jspdf';
import type { WeeklyLog, WorkOrder, Technician } from './types';
import { effectiveJobPay, computeWeeklyLogSettlement, netOfFieldNationFee } from './payroll';
import { displayWorkOrderNumber } from './work-order-identity';

type PaystubJobLine = {
  label: string;
  asmtId: string;
  woNumber: string;
  dateStr: string;
  timeStr: string;
  pay: number;
};

type PaystubReimbLine = {
  description: string;
  amount: number;
};

type PaystubData = {
  companyName: string;
  documentId: string;
  generatedAt: string;
  techName: string;
  payPeriod: string;
  paymentMethod: string;
  status: string;
  jobs: PaystubJobLine[];
  reimbursements: PaystubReimbLine[];
  totalPaid: number;
};

/**
 * Assembles everything a paystub document needs — company header, tech
 * name, the Mon-Sun pay period, every VERIFIED job that contributed to the
 * total (disputed items are excluded, same as the settlement total itself,
 * since they aren't being paid), and approved reimbursements. weekOf is
 * stored 'MM-dd-yyyy' as the Monday of that week. Shared by the admin
 * Payroll Audit page and the tech Earnings page so both produce identical
 * paystubs for the same log.
 */
function buildPaystubData(
  log: WeeklyLog,
  tech: Technician | undefined,
  techId: string,
  jobsById: Map<string, WorkOrder>,
): PaystubData {
  const [wm, wd, wy] = log.weekOf.split('-').map(Number);
  const weekStart = new Date(wy || 1970, (wm || 1) - 1, wd || 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const verifiedItems = (log.items || []).filter(i => i.confirmationStatus !== 'disputed');
  const jobs: PaystubJobLine[] = verifiedItems.map(item => {
    const job = jobsById.get(item.workOrderId);
    const asmtId = (item.workOrderId || '').toUpperCase();
    const woNumber = job ? displayWorkOrderNumber(job) : '';
    return {
      label: job?.title || job?.description || asmtId || 'Untitled Job',
      asmtId,
      woNumber,
      dateStr: job?.scheduleDate || item.workDate || 'N/A',
      timeStr: job?.scheduleTime || '',
      pay: effectiveJobPay(item, job),
    };
  });

  const reimbursements: PaystubReimbLine[] = (log.reimbursements || [])
    .filter(r => r.status !== 'pending' && r.status !== 'rejected')
    .map(r => ({ description: r.description || 'Reimbursement', amount: netOfFieldNationFee(r.amount) }));

  return {
    companyName: 'AAROMACH LLC',
    documentId: log.id.toUpperCase(),
    generatedAt: format(new Date(), 'MM/dd/yyyy h:mm a'),
    techName: tech?.name || techId,
    payPeriod: `${format(weekStart, 'MM/dd/yyyy')} - ${format(weekEnd, 'MM/dd/yyyy')}`,
    paymentMethod: tech?.payoutPreferences?.method || 'Not on file',
    status: log.status,
    jobs,
    reimbursements,
    totalPaid: computeWeeklyLogSettlement(log, jobsById),
  };
}

/** Builds and triggers a browser download of one log's itemized paystub as a PDF. */
export function downloadPaystub(
  log: WeeklyLog,
  tech: Technician | undefined,
  techId: string,
  jobsById: Map<string, WorkOrder>,
): void {
  const data = buildPaystubData(log, tech, techId, jobsById);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 50;
  const bottomLimit = pageHeight - 60;
  let y = 56;

  const newPageIfNeeded = (needed: number) => {
    if (y + needed > bottomLimit) {
      doc.addPage();
      y = 56;
    }
  };

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text(data.companyName, marginX, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('PAYSTUB', pageWidth - marginX, y, { align: 'right' });
  y += 10;
  doc.setDrawColor(180);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 20;

  // Info block
  doc.setFontSize(9);
  doc.setTextColor(90);
  const infoLeft = [
    `Document ID: ${data.documentId}`,
    `Technician: ${data.techName}`,
    `Payment Method: ${data.paymentMethod}`,
  ];
  const infoRight = [
    `Generated: ${data.generatedAt}`,
    `Pay Period: ${data.payPeriod}`,
    `Status: ${data.status}`,
  ];
  infoLeft.forEach((line, i) => doc.text(line, marginX, y + i * 14));
  infoRight.forEach((line, i) => doc.text(line, pageWidth - marginX, y + i * 14, { align: 'right' }));
  y += infoLeft.length * 14 + 16;

  doc.setDrawColor(220);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 22;

  // Jobs
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(20);
  doc.text(`VERIFIED JOBS (${data.jobs.length})`, marginX, y);
  y += 18;

  if (data.jobs.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text('(none)', marginX, y);
    y += 18;
  }

  data.jobs.forEach((job, idx) => {
    newPageIfNeeded(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(20);
    doc.text(`${idx + 1}. ${job.label}`, marginX, y);
    doc.text(`$${job.pay.toFixed(2)}`, pageWidth - marginX, y, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(110);
    const idLine = job.woNumber && job.woNumber !== job.asmtId
      ? `Assignment ID: ${job.asmtId}   Work Order #: ${job.woNumber}`
      : `Assignment ID: ${job.asmtId}`;
    doc.text(idLine, marginX + 12, y + 13);
    doc.text(job.timeStr ? `${job.dateStr}  ·  ${job.timeStr}` : job.dateStr, marginX + 12, y + 25);
    y += 36;
  });

  // Reimbursements
  if (data.reimbursements.length > 0) {
    newPageIfNeeded(30 + data.reimbursements.length * 16);
    y += 6;
    doc.setDrawColor(220);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 22;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(20);
    doc.text('REIMBURSEMENTS', marginX, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    data.reimbursements.forEach(r => {
      newPageIfNeeded(16);
      doc.setTextColor(60);
      doc.text(r.description, marginX, y);
      doc.text(`$${r.amount.toFixed(2)}`, pageWidth - marginX, y, { align: 'right' });
      y += 16;
    });
  }

  // Total
  newPageIfNeeded(50);
  y += 12;
  doc.setDrawColor(20);
  doc.setLineWidth(1);
  doc.line(marginX, y, pageWidth - marginX, y);
  doc.setLineWidth(0.5);
  y += 24;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(20);
  doc.text('TOTAL PAID', marginX, y);
  doc.text(`$${data.totalPaid.toFixed(2)}`, pageWidth - marginX, y, { align: 'right' });

  doc.save(`paystub-${data.techName.replace(/\s+/g, '-')}-${log.weekOf}.pdf`);
}
