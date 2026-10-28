import type { WorkOrder } from './types';
import { assignedTechOf as jobTechId } from './weekly-log-core';

/**
 * Helpers (additionalTechnicianIds) work the same job as the lead but run
 * their OWN workflow — Confirm → (Start Trip) → Check In → (Check Out) →
 * Complete — stored per helper in `helperProgress[uid]`. The lead's job
 * `status` is never changed by a helper, and a helper's progress never
 * changes the lead's.
 *
 * Tech screens show a helper a "helper view" of the job: the same record
 * with `status` / `activeTripLogId` swapped for that helper's own values, so
 * every existing button and trip-flow rule works unchanged.
 */

export type HelperStatus = 'assigned' | 'confirmed' | 'on-my-way' | 'in-progress' | 'checked-out' | 'completed';

export type HelperProgress = {
  status: HelperStatus;
  activeTripLogId?: string | null;
  confirmedAt?: string;
  checkInAt?: string;
  checkOutAt?: string;
  completedAt?: string;
  updatedAt?: string;
};

type JobLike = Partial<WorkOrder> | null | undefined;

/** Is this tech a helper (not the lead) on the job? */
export function isHelperOn(job: JobLike, techId: string | null | undefined): boolean {
  if (!job || !techId) return false;
  return jobTechId(job) !== techId && (job.additionalTechnicianIds || []).includes(techId);
}

export function helperProgressOf(job: JobLike, techId: string): HelperProgress {
  const hp = (job?.helperProgress || {})[techId];
  if (hp && hp.status) return hp;
  // Jobs from before helpers had their own workflow: if the lead already
  // closed the job, the helper's part is done too — don't resurface it as a
  // fresh "assigned" job.
  return { status: job?.status === 'completed' ? 'completed' : 'assigned' };
}

/**
 * The job as a helper sees it. A cancelled job stays cancelled for everyone;
 * otherwise status is the helper's own.
 */
export function helperView<T extends Partial<WorkOrder>>(job: T, techId: string): T & { _helperFor: string } {
  const hp = helperProgressOf(job, techId);
  const cancelled = job.status === 'cancelled';
  return {
    ...job,
    status: cancelled ? 'cancelled' : hp.status,
    activeTripLogId: hp.activeTripLogId ?? null,
    isAcknowledged: hp.status !== 'assigned',
    _helperFor: techId,
  } as T & { _helperFor: string };
}

/** For a tech's own job lists: the lead's jobs as-is, helper jobs as their helper view. */
export function viewForTech<T extends Partial<WorkOrder>>(job: T, techId: string): T {
  return isHelperOn(job, techId) ? helperView(job, techId) : job;
}

/** Has this helper finished their part? (Legacy: the whole job completed also counts.) */
export function helperCompleted(job: JobLike, techId: string): boolean {
  return helperProgressOf(job, techId).status === 'completed' || job?.status === 'completed';
}

/**
 * After an admin removes a helper: their helper entry for this job is flagged
 * "Removed as helper" on every log that isn't approved yet — not paid, shown
 * in its own section for the tech to confirm or dispute. Returns how many
 * entries sit on already-approved logs (left as paid; payroll handles those).
 */
export async function flagRemovedHelperEntries(jobId: string, helperId: string, by: string): Promise<{ flagged: number; approved: number }> {
  const { collection, doc, getDocs, query, updateDoc, where } = await import('firebase/firestore');
  const { db } = await import('./firebase');
  const logs = await getDocs(query(collection(db, 'weeklyLogs'), where('techId', '==', helperId)));
  let flagged = 0, approved = 0;
  for (const d of logs.docs) {
    const log = d.data() as { status?: string; items?: { workOrderId: string; isHelper?: boolean; helperRemoved?: unknown }[] };
    const hits = (log.items || []).filter(i => i.workOrderId === jobId && i.isHelper && !i.helperRemoved);
    if (!hits.length) continue;
    if (log.status === 'Approved') { approved += hits.length; continue; }
    const at = new Date().toISOString();
    // A Draft: the tech answers it. Already submitted: the tech can't edit it,
    // so it goes straight to payroll as a removed_helper card to decide.
    const submitted = log.status !== 'Draft';
    await updateDoc(doc(db, 'weeklyLogs', d.id), {
      items: (log.items || []).map(i => i.workOrderId === jobId && i.isHelper && !i.helperRemoved
        ? { ...i, helperRemoved: { at, by }, resolution: null,
            ...(submitted
              ? { confirmationStatus: 'disputed', disputeKind: 'removed_helper', disputeReason: 'Removed as helper after the log was submitted', disputeNotes: null }
              : { confirmationStatus: null }) }
        : i),
    });
    flagged += hits.length;
  }
  return { flagged, approved };
}
