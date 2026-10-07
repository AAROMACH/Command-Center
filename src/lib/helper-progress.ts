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
  return hp && hp.status ? hp : { status: 'assigned' };
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
