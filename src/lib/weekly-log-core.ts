import { startOfWeek, format, isValid } from 'date-fns';
import type { WeeklyLog, WorkOrder } from './types';
import { externalWorkOrderId, normalizeExternalId } from './work-order-identity';

// Pure weekly-log rules shared by the browser (lib/weekly-log.ts) and the
// server (lib/server/weekly-log-server.ts). No Firebase imports here, so the
// two sides can't drift on which week a job belongs to or what counts as
// "already logged".

/** The company's time zone — weeks and the weekend submit window follow it,
 *  not whatever zone the server or a browser happens to run in. */
export const BUSINESS_TIME_ZONE = 'America/Detroit';

/** Today's date ('yyyy-MM-dd') in the business time zone. */
export function businessToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * The Monday-based `weekOf` key ('MM-dd-yyyy') for a work order's scheduled
 * date — the week that owns the assignment. Weekly logs are keyed by this
 * value, so completing a job must file it in the log for its SCHEDULED week,
 * not whatever week it happened to be completed in.
 *
 * Accepts the two scheduleDate shapes the app stores (ISO `YYYY-MM-DD` and
 * `M/D/YYYY`); falls back to the current business week when the date is
 * missing or unparseable.
 */
export function weekOfForScheduleDate(scheduleDate: string | undefined | null): string {
  const parse = (s: string): Date | null => {
    const parts = s.split(/[-/]/);
    if (parts.length !== 3) return null;
    if (parts[0].length === 4) return new Date(`${s}T12:00:00`);
    const [m, day, y] = parts.map(Number);
    return y && m && day ? new Date(y, m - 1, day, 12) : null;
  };
  let d = scheduleDate ? parse(scheduleDate) : null;
  if (!d || !isValid(d)) d = parse(businessToday());
  return format(startOfWeek(d!, { weekStartsOn: 1 }), 'MM-dd-yyyy');
}

/** The current business week's `weekOf` key. */
export const reportingWeekOf = () => weekOfForScheduleDate(businessToday());

/** 'MM-dd-yyyy' (or 'yyyy-MM-dd') → comparable day number, NaN when invalid. */
function weekKeyValue(weekOf: string): number {
  const p = (weekOf || '').split(/[-/]/).map(Number);
  if (p.length !== 3 || p.some(n => !n)) return NaN;
  const [y, m, d] = String(p[0]).length === 4 ? [p[0], p[1], p[2]] : [p[2], p[0], p[1]];
  return Date.UTC(y, m - 1, d);
}

/**
 * Submit window: past weeks any time; the current week only on Saturday or
 * Sunday (business time); future weeks never.
 */
export function canSubmitWeek(weekOf: string, now: Date = new Date()): boolean {
  const logMonday = weekKeyValue(weekOf);
  const thisMonday = weekKeyValue(reportingWeekOfAt(now));
  if (isNaN(logMonday)) return false;
  if (logMonday < thisMonday) return true;
  if (logMonday > thisMonday) return false;
  const [y, m, d] = businessToday(now).split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

function reportingWeekOfAt(now: Date) {
  return weekOfForScheduleDate(businessToday(now));
}

/** Approved/Paid/archived — settled pay nobody but payroll may touch. */
export const isLockedLog = (log: Pick<WeeklyLog, 'status'> & { paid?: boolean; archived?: boolean }) => {
  const status = log.status as string;
  return status === 'Approved' || status === 'Paid' || log.paid === true || log.archived === true;
};

/** Work-order ids a set of logs already accounts for: filed items, plus
 *  missing-job reports (pending or settled through payroll, so they must not
 *  be double-filed) — matched by linked assignment id, or by Field Nation
 *  number for reports the tech typed in by hand (stored as `ext:<number>`). */
export function loggedWorkOrderIds(logs: Pick<WeeklyLog, 'items' | 'missingAssignmentReports'>[]): Set<string> {
  const ids = new Set<string>();
  for (const log of logs) {
    (log.items || []).forEach(i => { if (i.workOrderId) ids.add(i.workOrderId); });
    (log.missingAssignmentReports || []).forEach(r => {
      if (r.assignmentId) ids.add(r.assignmentId);
      const ext = normalizeExternalId(r.externalWorkOrderId);
      if (ext) ids.add(`ext:${ext}`);
    });
  }
  return ids;
}

/** Whether a job is accounted for by `ids` — matched by its doc id or, for
 *  jobs that moved from workOrders → assignments, its original workOrderId. */
export function isJobLogged(job: Pick<WorkOrder, 'id' | 'workOrderId'>, ids: Set<string>): boolean {
  if (ids.has(job.id) || (!!job.workOrderId && ids.has(job.workOrderId))) return true;
  const ext = normalizeExternalId(externalWorkOrderId(job as Partial<WorkOrder>));
  return !!ext && ids.has(`ext:${ext}`);
}

/** The tech a job is assigned to (same rule as lib/jobs.ts jobTechId). */
export function assignedTechOf(job: Partial<WorkOrder> | null | undefined): string | undefined {
  if (!job) return undefined;
  return job.assignedTechnicianId
    || (job.assignedTechIds && job.assignedTechIds[0])
    || (job as { techId?: string }).techId
    || undefined;
}
