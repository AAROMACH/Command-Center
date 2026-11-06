import { onSiteSessions } from './time-on-site';
import type { LaborRate, PricingSettings } from './billing';
import type { PriceLine } from './price-lines';
import type { Invoice, Technician, TripLog, WorkOrder } from './types';
import type { PriceDocValues } from '@/components/price-doc-editor';

/**
 * Billing manual jobs (assignments from client requests — not Field Nation
 * imports, which Field Nation bills). Per job by default; a client with many
 * jobs can be billed for a period on one invoice, one line per job.
 *
 * A job only stores what the TECH is paid, so the client's price is drafted
 * from time on site (every tech's arrival → check-out on the job's trip logs)
 * × the standard labor rate. The office reviews the draft — and adds any
 * materials — before saving; the client's service-plan discount applies in
 * the editor as usual.
 */

/** Billable hours: total on-site time, rounded up to the quarter hour, 1-hour minimum. */
export function billableHours(minutes: number): number {
  if (!minutes || minutes <= 0) return 0;
  return Math.max(1, Math.ceil(minutes / 15) / 4);
}

/** Minutes on site per job id, from trip logs (all techs, finished visits only). */
export function minutesOnSiteByJob(trips: TripLog[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of onSiteSessions(trips)) {
    if (!s.workOrderId || !s.minutesWorked) continue;
    m.set(s.workOrderId, (m.get(s.workOrderId) || 0) + s.minutesWorked);
  }
  return m;
}

/** The hourly rate a job draft uses: the first hourly labor rate in Labor rates & markups. */
export const standardHourlyRate = (pricing: PricingSettings): LaborRate | null =>
  pricing.laborRates.find(r => r.unit === 'hour') || null;

export const isBillableJob = (j: WorkOrder) => j.source !== 'Imported' && !(j as { isImported?: boolean }).isImported;

/** Job ids already on a (non-void) invoice — single-job or roll-up. */
export function invoicedJobIds(invoices: Invoice[]): Set<string> {
  const ids = new Set<string>();
  invoices.filter(i => i.status !== 'void').forEach(i => {
    if (i.workOrderId) ids.add(i.workOrderId);
    ((i as { workOrderIds?: string[] }).workOrderIds || []).forEach(id => ids.add(id));
  });
  return ids;
}

const jobName = (j: WorkOrder) => j.title || j.description || j.id.toUpperCase();

/** One labor line for a job. Hours 0 = no recorded time: the office fills it in. */
export function jobLaborLine(j: WorkOrder, minutes: number, rate: LaborRate | null): PriceLine {
  const hrs = billableHours(minutes);
  const when = j.scheduleDate ? ` (${j.scheduleDate})` : '';
  return {
    id: `job-${j.id}`.replace(/[^a-z0-9-]/gi, ''),
    name: `${jobName(j)}${when} — ${hrs ? `${hrs} h on site` : 'no time recorded, enter hours'}`,
    quantity: hrs, unitPrice: rate?.rate || 0, section: 'labor', taxable: false, required: true,
    ...(rate ? { itemRef: `rate:${rate.id}` } : {}),
  };
}

/** Editor values for an invoice covering these jobs (one client). */
export function jobsInvoiceDraft(jobs: WorkOrder[], minutes: Map<string, number>, pricing: PricingSettings, clients: Technician[]): Partial<PriceDocValues> {
  const first = jobs[0];
  const clientId = (first as { clientId?: string | null }).clientId
    || clients.find(c => (c.clientCompany || c.name || '').trim().toLowerCase() === (first.clientName || '').trim().toLowerCase())?.id || '';
  const rate = standardHourlyRate(pricing);
  return {
    customerType: clientId ? 'in_app_client' : 'external_customer',
    clientId,
    customerName: clientId ? '' : first.clientName || '',
    customerCompany: clientId ? '' : first.clientName || '',
    relatedId: jobs.length === 1 ? first.id : '',
    status: 'draft',
    terms: jobs.length === 1
      ? `Service: ${jobName(first)}${first.location ? ` at ${first.location}` : ''}.`
      : `Service for ${jobs.length} jobs: ${jobs.map(j => j.id.toUpperCase()).join(', ')}.`,
    lines: jobs.map(j => jobLaborLine(j, minutes.get(j.id) || 0, rate)),
  };
}
