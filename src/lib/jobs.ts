import type { WorkOrder } from './types';
import { db } from './firebase';
import { doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';

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

/**
 * Whether a job is assigned to this tech — the single rule for what a tech
 * sees and can act on in their portal. Uses jobTechId (what every admin
 * screen shows), so a job whose legacy `techId` still points at a previous
 * tech after an out-of-sync swap is NOT theirs, even though the portal's
 * `techId` query returns it.
 */
export function isAssignedTo(job: Partial<WorkOrder> | null | undefined, techId: string | null | undefined): boolean {
  return !!techId && jobTechId(job) === techId;
}

/** Job statuses in workflow order, with display labels — for sorting by
 *  status (pipeline order, not alphabetical) and status filter checkboxes. */
export const JOB_STATUS_OPTIONS: { value: WorkOrder['status']; label: string }[] = [
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'on-my-way', label: 'On My Way' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'checked-out', label: 'Checked Out' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'archived', label: 'Archived' },
];
const STATUS_RANK = new Map(JOB_STATUS_OPTIONS.map((o, i) => [o.value as string, i]));
/** Compare two jobs by workflow status order (unknown statuses last). */
export function compareJobStatus(a: Partial<WorkOrder>, b: Partial<WorkOrder>): number {
  return (STATUS_RANK.get(a.status || '') ?? 99) - (STATUS_RANK.get(b.status || '') ?? 99);
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
 * Parse any date string the app stores into a LOCAL Date:
 *   'yyyy-MM-dd'  → local midnight (new Date('2026-08-18') is UTC midnight,
 *                   i.e. the evening of the 17th in Michigan — dates showed
 *                   and filtered a day early);
 *   'MM-dd-yyyy' / 'M/D/YYYY' → local midnight (Safari/iOS returns Invalid
 *                   Date for 'MM-dd-yyyy' strings);
 *   full ISO datetimes and anything else Date understands → as-is.
 * Null when it isn't a date.
 */
export function parseLocalDate(s?: string | null): Date | null {
  if (!s) return null;
  const str = String(s).trim();
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * A weekly log's `weekOf` ('MM-dd-yyyy', tolerates 'yyyy-MM-dd') as a
 * comparable timestamp, 0 when unparseable. Use this — never a string
 * compare: 'MM-dd-yyyy' strings sort by month before year.
 */
export function weekOfValue(weekOf?: string | null): number {
  return jobDateTimeValue(weekOf, null);
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
 *
 * Archiving is meant to act as a first line of defense before deletion — a
 * job in Archives should behave as if it's gone until it's explicitly
 * restored or permanently deleted. Writing the archive copy and deleting the
 * source doc in one batch (instead of two sequential awaits) closes the gap
 * where the first write could succeed and the second fail, leaving the same
 * job live in both places at once.
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
  const batch = writeBatch(db);
  batch.set(doc(db, 'activityArchive', job.id), {
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
  batch.delete(doc(db, collectionName, job.id));
  await batch.commit();
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
