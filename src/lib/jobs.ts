import type { WorkOrder } from './types';
import { db } from './firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';

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
 * Reverses the workOrders→assignments transition: given an assignment doc
 * whose technician is being cleared, returns the doc to write back into the
 * `workOrders` collection (unassigned pool) — original id restored via
 * `workOrderId`, dispatch/tech-only fields stripped. The caller still owns
 * the actual `setDoc` (into `workOrders`) + `deleteDoc` (from `assignments`).
 */
export function toUnassignedWorkOrder(
  assignment: WorkOrder,
  extraHistory: NonNullable<WorkOrder['history']> = []
): WorkOrder {
  const targetId = (assignment as { workOrderId?: string }).workOrderId || assignment.id;
  const {
    techId, assignedAt, workOrderId, activeTripLogId, techOutcome,
    assignedTechnicianId, assignedTechIds, additionalTechnicianIds,
    ...rest
  } = assignment as WorkOrder & Record<string, any>;
  return {
    ...rest,
    id: targetId,
    status: 'unassigned',
    history: [...(assignment.history || []), ...extraHistory],
  } as WorkOrder;
}

export type ArchiveJobOptions = {
  job: WorkOrder;
  /** Which collection the job doc currently lives in. */
  collectionName: 'workOrders' | 'assignments';
  archivedBy: string;
  archiveReason: string;
  /** Resolved technician name, if any — display only. */
  techName?: string;
};

/**
 * Archives a job by moving it into `activityArchive` rather than flipping
 * `archived`/`status` fields in place — the doc is removed from
 * workOrders/assignments entirely, and a restorable copy is written in the
 * same archivedFrom/archivedRecordJson shape the generic activity-archive
 * restore flow (admin/reports handleRestoreEvent) already understands, so
 * jobs and other archived activity share one collection and one restore path.
 */
export async function archiveJobRecord({ job, collectionName, archivedBy, archiveReason, techName }: ArchiveJobOptions): Promise<void> {
  const now = new Date().toISOString();
  const record = {
    ...job,
    archived: true,
    status: 'archived',
    previousStatus: job.status,
    archivedAt: now,
    archivedBy,
    archiveReason,
  };
  await setDoc(doc(db, 'activityArchive', job.id), {
    id: job.id,
    timestamp: now,
    archivedAt: now,
    type: collectionName === 'assignments' ? 'assignment' : 'work_order',
    eventLabel: 'Job Archived',
    entity: job.title || job.description || job.id,
    techName: techName || null,
    techId: jobTechId(job) || null,
    clientName: job.clientName || null,
    color: 'text-text-muted',
    icon: 'archive',
    archivedFrom: collectionName,
    archivedRecordJson: JSON.stringify(record),
  });
  await deleteDoc(doc(db, collectionName, job.id));
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
