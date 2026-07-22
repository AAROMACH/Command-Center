import type { WorkOrder } from './types';

// ── Unified job model ───────────────────────────────────────────────────────
//
// A "job" lives in exactly one Firestore collection at a time:
//   • `workOrders`  — the unassigned pool (imports + manual creates land here)
//   • `assignments` — dispatched jobs (the workOrder doc is deleted when a job
//                     is assigned, and a new assignment doc is created that
//                     references the original via `workOrderId`).
//
// The Dispatch, Schedule (calendar), and Assignments pages all derive "who is
// this assigned to", "is it assigned", and "is it archived/completed" from the
// same record shape. These helpers are the single source of truth so those
// derivations can never drift between the three views.

export type JobSource = 'workOrder' | 'assignment';
export type JobWithSrc = WorkOrder & { _src?: JobSource };

/**
 * The technician a job is assigned to, resolved in one consistent order across
 * every view: the single-tech field, then the first of the multi-tech list,
 * then the legacy `techId`. Returns undefined when unassigned.
 */
export function jobTechId(job: Partial<WorkOrder> | null | undefined): string | undefined {
  if (!job) return undefined;
  return job.assignedTechnicianId
    || (job.assignedTechIds && job.assignedTechIds[0])
    || (job as { techId?: string }).techId
    || undefined;
}

/** Whether a job has a technician assigned. */
export function isAssigned(job: Partial<WorkOrder> | null | undefined): boolean {
  return !!jobTechId(job);
}

/** Soft-archived — hidden from active views, kept for restore/dedup. */
export function isArchivedJob(job: Partial<WorkOrder> | null | undefined): boolean {
  if (!job) return false;
  return !!(job as { archived?: boolean }).archived || job.status === 'archived';
}

/** A finished job. */
export function isCompletedJob(job: Partial<WorkOrder> | null | undefined): boolean {
  return job?.status === 'completed';
}

/** In an active working view (not archived, not completed). */
export function isActiveJob(job: Partial<WorkOrder> | null | undefined): boolean {
  return !isArchivedJob(job) && !isCompletedJob(job);
}

/**
 * A single comparable timestamp for a job's schedule, combining the date and
 * the (free-text) start time. Handles both MM-DD-YYYY and YYYY-MM-DD dates and
 * time strings like "10:00 AM" or "10:00 AM EST". Jobs with no/invalid date
 * return 0 so they sort last in a most-recent-first (descending) ordering.
 */
export function jobDateTimeValue(dateStr?: string | null, timeStr?: string | null): number {
  if (!dateStr) return 0;
  const parts = dateStr.split(/[-/]/);
  let d: Date | null = null;
  if (parts.length === 3) {
    if (parts[0].length === 4) d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    else d = new Date(+parts[2], +parts[0] - 1, +parts[1]);
  }
  if (!d || isNaN(d.getTime())) return 0;
  if (timeStr) {
    const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (m) {
      let h = +m[1];
      const ap = m[3]?.toUpperCase();
      if (ap === 'PM' && h < 12) h += 12;
      if (ap === 'AM' && h === 12) h = 0;
      d.setHours(h, +m[2], 0, 0);
    }
  }
  return d.getTime();
}

/**
 * Merge the workOrders pool and assignments into one job list for the union
 * views (Schedule / Calendar). A job is normally in only one collection, but
 * dedup by id — assignments winning — guards against a transient double if an
 * assignment write and the workOrder delete briefly overlap.
 */
export function mergeJobs(workOrders: WorkOrder[], assignments: WorkOrder[]): JobWithSrc[] {
  const seen = new Set<string>();
  const out: JobWithSrc[] = [];
  for (const a of assignments) {
    if (!seen.has(a.id)) { seen.add(a.id); out.push({ ...a, _src: 'assignment' }); }
  }
  for (const w of workOrders) {
    if (!seen.has(w.id)) { seen.add(w.id); out.push({ ...w, _src: 'workOrder' }); }
  }
  return out;
}
