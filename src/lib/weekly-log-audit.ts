import type { WeeklyLog, WorkOrder } from './types';
import { isArchivedJob, jobDateTimeValue } from './jobs';
import { externalWorkOrderId, normalizeExternalId } from './work-order-identity';

/**
 * Payroll Audit → Unlogged. Pure over the jobs/logs it's handed (no reads or
 * writes).
 *
 * A job is listed ONLY when all of these hold:
 *  1. status is 'completed' (not archived, not marked payrollExcluded);
 *  2. its history shows someone actually MARKED it complete in the app — a
 *     tech completion (assignment page/list, dashboard, calendar) or an admin
 *     force-complete. Jobs that are merely sitting at 'completed' (seed/test
 *     data, imports, records predating the trip flow) are not listed;
 *  3. it is on NO weekly log for any tech id the job carries (techId,
 *     assignedTechnicianId, assignedTechIds) — matched by assignment id or
 *     original work-order id;
 *  4. it isn't on another tech's log and doesn't match a missing-job report's
 *     Field Nation number (either way it may already be paid).
 * Everything that fails 2 or 4 is counted in `excluded` (with the reason) so
 * the number on the tab can be explained, but never shown as a filing row.
 */

export type UnloggedCompletion = {
  job: WorkOrder;
  techId: string;
  /** The history entry that marked it completed. */
  source: string;
};

export type ExcludedReason = 'no_completion_record' | 'on_other_tech_log' | 'missing_job_report';

export type ExcludedCompletion = {
  job: WorkOrder;
  techId: string;
  reason: ExcludedReason;
  /** Other tech's id (on_other_tech_log) or the FN number (missing_job_report). */
  detail?: string;
};

export type UnloggedAudit = { rows: UnloggedCompletion[]; excluded: ExcludedCompletion[] };

function idsForLog(log: Pick<WeeklyLog, 'items' | 'missingAssignmentReports'>): string[] {
  return [
    ...(log.items || []).map(i => i.workOrderId),
    ...(log.missingAssignmentReports || []).map(r => r.assignmentId || ''),
  ].filter(Boolean);
}

/**
 * The history entry where someone explicitly marked the job complete, or null
 * if there is none. Only entries written by a completion action count — a
 * generic admin edit ("Registry parameters adjusted") is written on every
 * save, so it can't show the job was completed by that edit.
 */
export function completionEvent(job: Pick<WorkOrder, 'history'>): string | null {
  const history = [...(job.history || [])].reverse();
  for (const h of history) {
    const d = (h?.details || '').toString();
    if (/^Force-completed/i.test(d)) return 'Admin force-complete (not filed)';
    if (/^Mark Complete at/i.test(d)) return 'Tech calendar "Mark Complete"';
    if (/Mission finalized/i.test(d)) return 'Tech completion — week prompt dismissed or filing failed';
    if (/Status update to COMPLETED/i.test(d)) return 'Tech dashboard completion — filing skipped';
  }
  return null;
}

/** Every tech id a job may have been filed under. */
export function jobTechIds(job: Partial<WorkOrder>): string[] {
  return [...new Set([
    (job as { techId?: string }).techId,
    job.assignedTechnicianId || undefined,
    ...(job.assignedTechIds || []),
  ].filter((t): t is string => !!t))];
}

export function findUnloggedCompletions(jobs: WorkOrder[], logs: WeeklyLog[]): UnloggedAudit {
  const loggedByTech = new Map<string, Set<string>>();
  const reportedExtByTech = new Map<string, Set<string>>();
  const firstTechForId = new Map<string, string>();
  for (const log of logs) {
    if (!log.techId) continue;
    const set = loggedByTech.get(log.techId) || new Set<string>();
    for (const id of idsForLog(log)) {
      set.add(id);
      if (!firstTechForId.has(id)) firstTechForId.set(id, log.techId);
    }
    loggedByTech.set(log.techId, set);
    const ext = reportedExtByTech.get(log.techId) || new Set<string>();
    (log.missingAssignmentReports || []).forEach(r => {
      const n = normalizeExternalId(r.externalWorkOrderId);
      if (n) ext.add(n);
    });
    reportedExtByTech.set(log.techId, ext);
  }

  const rows: UnloggedCompletion[] = [];
  const excluded: ExcludedCompletion[] = [];
  for (const job of jobs) {
    if (job.status !== 'completed' || isArchivedJob(job) || job.payrollExcluded) continue;
    const techIds = jobTechIds(job);
    if (techIds.length === 0) continue;
    const techId = job.assignedTechnicianId || techIds[0];
    const ids = [job.id, job.workOrderId].filter(Boolean) as string[];

    // On one of this job's own techs' logs → logged, not listed anywhere.
    if (techIds.some(t => ids.some(id => loggedByTech.get(t)?.has(id)))) continue;

    const elsewhere = ids.map(id => firstTechForId.get(id)).find(Boolean);
    if (elsewhere) { excluded.push({ job, techId, reason: 'on_other_tech_log', detail: elsewhere }); continue; }

    const ext = normalizeExternalId(externalWorkOrderId(job));
    if (ext && techIds.some(t => reportedExtByTech.get(t)?.has(ext))) {
      excluded.push({ job, techId, reason: 'missing_job_report', detail: ext.toUpperCase() });
      continue;
    }

    const source = completionEvent(job);
    if (!source) { excluded.push({ job, techId, reason: 'no_completion_record' }); continue; }

    rows.push({ job, techId, source });
  }
  const byDateDesc = (a: { job: WorkOrder }, b: { job: WorkOrder }) =>
    jobDateTimeValue(b.job.scheduleDate, b.job.scheduleTime) - jobDateTimeValue(a.job.scheduleDate, a.job.scheduleTime);
  return { rows: rows.sort(byDateDesc), excluded: excluded.sort(byDateDesc) };
}
