import type { WeeklyLog, WorkOrder } from './types';
import { jobTechId, isArchivedJob, jobDateTimeValue } from './jobs';
import { externalWorkOrderId, normalizeExternalId } from './work-order-identity';

/**
 * Detection of completed jobs that never reached their tech's weekly log, for
 * Payroll Audit → Unlogged. Pure over the jobs/logs it's handed (no reads or
 * writes). Same matching rules as loggedWorkOrderIds/isJobLogged in
 * weekly-log.ts, but across every tech's logs at once so it can also flag a
 * job that sits on a different tech's log.
 */

export type UnloggedCompletion = {
  job: WorkOrder;
  techId: string;
  /** Best guess at how the job got to completed without being filed. */
  source: string;
  /** A hand-typed missing-job report on this tech's log carries the same
   *  Field Nation number — it may already be paid that way (or it may be a
   *  revisit sharing the number). The tech-side sync won't auto-file these. */
  reportedMissingAs?: string;
  /** Set when the job IS on a log — just under a different tech's (e.g. it
   *  was reassigned after completion). Filing it again may double-pay. */
  loggedUnderTechId?: string;
};

function idsForLog(log: Pick<WeeklyLog, 'items' | 'missingAssignmentReports'>): string[] {
  return [
    ...(log.items || []).map(i => i.workOrderId),
    ...(log.missingAssignmentReports || []).map(r => r.assignmentId || ''),
  ].filter(Boolean);
}

/** Reads the job's history for the entry that marked it completed. */
export function completionSource(job: Pick<WorkOrder, 'history'>): string {
  const history = [...(job.history || [])].reverse();
  for (const h of history) {
    const d = (h?.details || '').toString();
    if (/^Force-completed/i.test(d)) return 'Admin force-complete (not filed)';
    if (/^Mark Complete at/i.test(d)) return 'Tech calendar "Mark Complete"';
    if (/Mission finalized/i.test(d)) return 'Tech completion — week prompt dismissed or filing failed';
    if (/Status update to COMPLETED/i.test(d)) return 'Tech dashboard completion — filing skipped';
    if (/Registry parameters adjusted/i.test(d)) return 'Admin edit (status set to Completed)';
  }
  return 'Unknown — no completion entry in history';
}

export function findUnloggedCompletions(jobs: WorkOrder[], logs: WeeklyLog[]): UnloggedCompletion[] {
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

  const out: UnloggedCompletion[] = [];
  for (const job of jobs) {
    if (job.status !== 'completed' || isArchivedJob(job) || job.payrollExcluded) continue;
    const techId = jobTechId(job);
    if (!techId) continue;
    const own = loggedByTech.get(techId);
    const ids = [job.id, job.workOrderId].filter(Boolean) as string[];
    if (own && ids.some(id => own.has(id))) continue;
    const elsewhere = ids.map(id => firstTechForId.get(id)).find(Boolean);
    const ext = normalizeExternalId(externalWorkOrderId(job));
    const reported = !!ext && !!reportedExtByTech.get(techId)?.has(ext);
    out.push({ job, techId, source: completionSource(job), loggedUnderTechId: elsewhere, reportedMissingAs: reported ? ext.toUpperCase() : undefined });
  }
  return out.sort((a, b) => jobDateTimeValue(b.job.scheduleDate, b.job.scheduleTime) - jobDateTimeValue(a.job.scheduleDate, a.job.scheduleTime));
}
