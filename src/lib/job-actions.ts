import { db } from './firebase';
import { doc, setDoc, updateDoc, deleteDoc, arrayUnion } from 'firebase/firestore';
import { makeAssignmentId } from './doc-ids';
import type { WorkOrder } from './types';

// Mutations that must behave identically no matter which admin view triggers
// them (Dispatch, Schedule, Assignments) so a change made in one reflects
// everywhere. Ownership of an assignment is keyed on `techId` — the tech portal
// queries `assignments where techId == uid` and Firestore rules enforce it — so
// every assign/swap writes BOTH `techId` and `assignedTechnicianId`.

const sanitize = (obj: unknown): unknown => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v !== undefined) out[k] = sanitize(v);
  }
  return out;
};

export type AssignJobOptions = {
  /** The job being assigned (its current record). */
  job: WorkOrder & { _src?: 'workOrder' | 'assignment' };
  /** Which collection the job currently lives in. */
  source: 'workOrder' | 'assignment';
  techId: string;
  techName?: string;
  previousTechId?: string;
  previousTechName?: string;
  actorName?: string;
  /** Extra field edits (e.g. schedule date/time/notes) to apply in the same write. */
  extraFields?: Record<string, unknown>;
};

/**
 * Assign (or reassign) a job to a technician, keeping every view consistent.
 *  - A dispatched job (in `assignments`) is updated in place — `techId` and
 *    `assignedTechnicianId` both set, status → 'assigned', history appended.
 *  - An unassigned pool job (in `workOrders`) is MOVED: a new `assignments`
 *    doc is created (referencing the original via `workOrderId`) and the
 *    `workOrders` doc is deleted, matching the Dispatch assign flow.
 * Returns the assignment doc id (unchanged for in-place, new for a move).
 */
export async function assignJobToTechnician(opts: AssignJobOptions): Promise<string> {
  const { job, source, techId, techName, previousTechId, previousTechName, actorName, extraFields } = opts;
  const now = new Date().toISOString();
  const historyEntry = {
    type: previousTechId ? 'tech_swap' : 'tech_add',
    date: now,
    previousTechnicianId: previousTechId || null,
    previousTechnicianName: previousTechName || null,
    newTechnicianId: techId,
    newTechnicianName: techName || techId,
    details: previousTechId
      ? `Reassigned from ${previousTechName || 'unassigned'} to ${techName || techId}`
      : `Assigned to ${techName || techId}`,
    user: actorName || 'Admin',
  };

  const techFields = {
    assignedTechnicianId: techId,
    techId,
    technicianName: techName || '',
    status: 'assigned' as const,
    updatedAt: now,
  };

  if (source === 'assignment') {
    await updateDoc(doc(db, 'assignments', job.id), {
      ...(extraFields || {}),
      ...techFields,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      history: arrayUnion(historyEntry as any),
    });
    return job.id;
  }

  // Pool workOrder → move into assignments (create the assignment, delete the WO).
  const asmtId = await makeAssignmentId();
  const { _src, ...jobData } = job as WorkOrder & { _src?: string };
  await setDoc(doc(db, 'assignments', asmtId), sanitize({
    ...jobData,
    ...(extraFields || {}),
    id: asmtId,
    workOrderId: job.id,
    ...techFields,
    assignedAt: now,
    history: [...((job as WorkOrder).history || []), historyEntry],
  }) as Record<string, unknown>);
  await deleteDoc(doc(db, 'workOrders', job.id));
  return asmtId;
}
