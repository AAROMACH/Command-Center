import type { WorkOrder } from './types';
import { isImported } from './work-order-identity';

// ── Tech job workflow ───────────────────────────────────────────────────────
//
// Manual jobs run the full trip cycle:
//   Confirm → Start Trip → Check In → Check Out → Mark Complete
//
// Imported (Field Nation) jobs do their check-in / check-out OFF-app, so the
// on-app workflow skips the "Start Trip" (en route) and "Check Out" steps:
//   Confirm → Check In → Mark Complete
//
// These predicates are the single source of truth for which action a tech can
// take next, so every surface (assignment list, detail page, dashboard,
// calendar) stays consistent.

type Job = Partial<WorkOrder> | null | undefined;

/** Manual jobs use the full 5-step cycle; imported jobs use the 3-step cycle. */
export const usesFullTripCycle = (job: Job): boolean => !isImported(job);

export const canConfirm = (job: Job): boolean => job?.status === 'assigned';

/** Only manual jobs have the "en route" leg. */
export const canStartTrip = (job: Job): boolean =>
  usesFullTripCycle(job) && job?.status === 'confirmed';

/** Manual: from 'on-my-way'. Imported: straight from 'confirmed'. */
export const canCheckIn = (job: Job): boolean =>
  job?.status === 'on-my-way' || (!usesFullTripCycle(job) && job?.status === 'confirmed');

/** Only manual jobs check out (imported check-out happens off-app). */
export const canCheckOut = (job: Job): boolean =>
  usesFullTripCycle(job) && job?.status === 'in-progress';

/** Manual: from 'checked-out'. Imported: straight from 'in-progress'. */
export const canComplete = (job: Job): boolean =>
  job?.status === 'checked-out' || (!usesFullTripCycle(job) && job?.status === 'in-progress');

/**
 * When re-opening a completed job, return it to the state that shows "Mark
 * Complete" again for that job's workflow: 'checked-out' for manual jobs,
 * 'in-progress' for imported jobs (which have no checked-out state).
 */
export const reopenStatusFor = (job: Job): WorkOrder['status'] =>
  usesFullTripCycle(job) ? 'checked-out' : 'in-progress';
