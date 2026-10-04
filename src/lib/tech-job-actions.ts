import { format } from 'date-fns';
import {
  addDoc, arrayUnion, collection, doc, getDoc, getDocs, query, updateDoc, where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { WorkOrder } from './types';
import { calculateDistance, getTacticalCoords, getTacticalLocation } from './utils';
import { canCheckIn, canCheckOut, canComplete, canConfirm, canStartTrip, reopenStatusFor } from './trip-flow';
import { externalWorkOrderId } from './work-order-identity';
import { removeJobFromDraftLogs } from './weekly-log';
import { NotificationService } from './notification-service';

/**
 * The tech job workflow — Confirm → Start Trip → Check In → Check Out → Mark
 * Complete (and Re-open) — implemented ONCE for every tech screen: the
 * dashboard (active job card + schedule box), the calendar/schedule, the
 * assignments list and the assignment detail page.
 *
 * Each screen used to carry its own copy, and they had drifted: only the
 * detail page recorded trips (so time on site and mileage were missing for
 * jobs worked from the dashboard or calendar), confirm only set
 * isAcknowledged there, the calendar re-opened jobs to 'assigned', the
 * one-job-on-site rule was enforced on some screens only, and two screens
 * rewrote the whole history array (a double tap could drop an entry).
 *
 * Every action re-reads the job first and checks the trip-flow rule against
 * the CURRENT status, so a stale screen or a double tap can't move a job
 * backwards or skip a step.
 */

export type TechJobAction = 'confirm' | 'startTrip' | 'checkIn' | 'checkOut' | 'complete' | 'reopen';

export const TECH_ACTION_LABELS: Record<TechJobAction, string> = {
  confirm: 'Confirm',
  startTrip: 'Start Trip',
  checkIn: 'Check In',
  checkOut: 'Check Out',
  complete: 'Mark Complete',
  reopen: 'Re-open',
};

/** Status a screen asks for → the action that produces it. */
export const ACTION_FOR_STATUS: Partial<Record<WorkOrder['status'], TechJobAction>> = {
  'confirmed': 'confirm',
  'on-my-way': 'startTrip',
  'in-progress': 'checkIn',
  'checked-out': 'checkOut',
  'completed': 'complete',
};

type Job = WorkOrder & { _src?: 'assignment' | 'workOrder'; activeTripLogId?: string | null };

export type TechActionContext = {
  techId: string;
  techName: string;
  /** From useCompletionFiling — writes 'completed' and files the weekly log. */
  completeAndFile: (job: Job, writeStatus: () => Promise<unknown>) => Promise<'filed' | 'prompted' | 'not_owner'>;
};

export type TechActionResult = {
  title: string;
  description?: string;
  /** Set when the action completed the job (for completion toast text). */
  completion?: 'filed' | 'prompted' | 'not_owner';
};

export class TechActionError extends Error {}

/** Find the job's live doc (dispatched jobs are in assignments, pool jobs in workOrders). */
async function liveJob(job: Job): Promise<{ ref: ReturnType<typeof doc>; data: Job }> {
  const order = job._src === 'workOrder' ? ['workOrders', 'assignments'] : ['assignments', 'workOrders'];
  for (const c of order) {
    const ref = doc(db, c, job.id);
    const snap = await getDoc(ref);
    if (snap.exists()) return { ref, data: { ...(snap.data() as WorkOrder), id: snap.id } };
  }
  throw new TechActionError('This job no longer exists.');
}

const historyEntry = (details: string, user: string, type: 'status_change' | 'note' = 'status_change') => ({
  type,
  date: format(new Date(), 'MM-dd-yyyy'),
  details,
  user,
  // Makes each entry unique so arrayUnion never collapses two real events.
  at: new Date().toISOString(),
});

/** Close the job's open trip: end time/location, and miles when start coords exist. */
async function finalizeOpenTrip(tripId: string | null | undefined, endLocation: string) {
  if (!tripId) return;
  try {
    const ref = doc(db, 'tripLogs', tripId);
    const trip = (await getDoc(ref)).data() as { startLat?: number; startLng?: number; endTime?: string } | undefined;
    if (!trip || trip.endTime) return;
    const coords = await getTacticalCoords();
    const patch: Record<string, any> = {
      endTime: format(new Date(), 'h:mm a'),
      endLocation,
      updatedAt: new Date().toISOString(),
    };
    if (coords) { patch.endLat = coords.lat; patch.endLng = coords.lng; }
    if (trip.startLat != null && trip.startLng != null && coords) {
      const miles = Math.round(calculateDistance(trip.startLat, trip.startLng, coords.lat, coords.lng) * 10) / 10;
      patch.calculatedMiles = miles;
      patch.miles = miles;
    }
    await updateDoc(ref, patch);
  } catch (e) {
    console.error('finalizeOpenTrip failed', e);
  }
}

async function createTrip(job: Job, ctx: TechActionContext, location: string, kind: 'start_trip' | 'check_in'): Promise<string | null> {
  try {
    const coords = kind === 'start_trip' ? await getTacticalCoords() : null;
    const now = new Date();
    const ref = await addDoc(collection(db, 'tripLogs'), {
      technicianId: ctx.techId,
      technicianName: ctx.techName,
      assignmentId: job.id,
      workOrderId: job.workOrderId || job.id,
      externalWorkOrderId: externalWorkOrderId(job) || '',
      jobTitle: job.title || job.description || '',
      date: format(now, 'yyyy-MM-dd'),
      startLocation: kind === 'start_trip' ? location : '',
      endLocation: '',
      startLat: coords?.lat ?? null,
      startLng: coords?.lng ?? null,
      miles: 0,
      // A check-in-only record (Field Nation jobs skip Start Trip) tracks time
      // on site, not a drive, so it isn't reimbursable mileage.
      purpose: kind === 'start_trip' ? 'Drive to job site' : 'On site',
      reimbursable: kind === 'start_trip',
      status: 'pending',
      source: kind,
      ...(kind === 'start_trip' ? { startTime: format(now, 'h:mm a') } : { arrivedAt: format(now, 'h:mm a'), arrivalLocation: location }),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    return ref.id;
  } catch (e) {
    console.error('trip record failed', e);
    return null;
  }
}

/** Run one workflow action on a job. Throws TechActionError with a readable message. */
export async function performTechJobAction(job: Job, action: TechJobAction, ctx: TechActionContext): Promise<TechActionResult> {
  const { ref, data: live } = await liveJob(job);
  const allowed: Record<TechJobAction, boolean> = {
    confirm: canConfirm(live),
    startTrip: canStartTrip(live),
    checkIn: canCheckIn(live),
    checkOut: canCheckOut(live),
    complete: canComplete(live),
    reopen: live.status === 'completed',
  };
  if (!allowed[action]) {
    throw new TechActionError(`Can't ${TECH_ACTION_LABELS[action].toLowerCase()} — this job is now ${String(live.status).replace(/-/g, ' ')}. The screen will refresh.`);
  }

  const now = format(new Date(), 'h:mm a');
  const location = await getTacticalLocation();
  const user = ctx.techName;
  const tripId = (live as Job).activeTripLogId || null;

  switch (action) {
    case 'confirm':
      await updateDoc(ref, {
        status: 'confirmed', isAcknowledged: true,
        history: arrayUnion(historyEntry(`Assignment confirmed at ${now}. Location: [${location}].`, user)),
      });
      return { title: 'Assignment Confirmed' };

    case 'startTrip': {
      const newTrip = await createTrip(live, ctx, location, 'start_trip');
      await updateDoc(ref, {
        status: 'on-my-way',
        ...(newTrip ? { activeTripLogId: newTrip } : {}),
        history: arrayUnion(historyEntry(`Trip initiated at ${now}. Status: EN ROUTE. Location: [${location}].`, user)),
      });
      return newTrip
        ? { title: 'Trip Started', description: 'Status updated to En Route. Trip logged.' }
        : { title: 'Trip Started', description: 'Status updated, but the trip record could not be saved — mileage for this drive is missing.' };
    }

    case 'checkIn': {
      // One job on site at a time.
      const onSite = await getDocs(query(collection(db, 'assignments'), where('techId', '==', ctx.techId), where('status', '==', 'in-progress')));
      const other = onSite.docs.find(d => d.id !== live.id);
      if (other) throw new TechActionError(`You're still checked in at ${(other.data().title as string) || other.id.toUpperCase()}. Check out or complete it first.`);
      let activeTrip = tripId;
      if (activeTrip) {
        try {
          await updateDoc(doc(db, 'tripLogs', activeTrip), { arrivedAt: now, arrivalLocation: location, updatedAt: new Date().toISOString() });
        } catch (e) { console.error('check-in trip update failed', e); }
      } else {
        // No trip (Field Nation jobs skip Start Trip): still record arrival so
        // time on site is tracked.
        activeTrip = await createTrip(live, ctx, location, 'check_in');
      }
      await updateDoc(ref, {
        status: 'in-progress',
        ...(activeTrip ? { activeTripLogId: activeTrip } : {}),
        history: arrayUnion(historyEntry(`Arrival verified at ${now}. Status: ON SITE. Location: [${location}].`, user, 'note')),
      });
      NotificationService.notifyAdmins('Status Alert: IN-PROGRESS',
        `Technician ${user} checked in on ${live.id.toUpperCase()} at ${location}.`, { id: live.id, type: 'assignment' }).catch(() => {});
      return { title: 'Checked In', description: 'Status updated to In Progress.' };
    }

    case 'checkOut':
      await finalizeOpenTrip(tripId, location);
      await updateDoc(ref, {
        status: 'checked-out',
        activeTripLogId: null,
        history: arrayUnion(historyEntry(`Session paused at ${now}. Status: CHECKED OUT. Location: [${location}].`, user, 'note')),
      });
      return { title: 'Checked Out', description: 'Time on site and trip mileage recorded.' };

    case 'complete': {
      // Completing without an explicit check-out still closes the trip.
      await finalizeOpenTrip(tripId, location);
      const completion = await ctx.completeAndFile(live, () => updateDoc(ref, {
        status: 'completed',
        activeTripLogId: null,
        history: arrayUnion(historyEntry(`Mission finalized at ${now}. Status: CLOSED. Location: [${location}].`, user, 'note')),
      }));
      NotificationService.notifyAdmins('Status Alert: COMPLETED',
        `Technician ${user} completed ${live.id.toUpperCase()} at ${location}.`, { id: live.id, type: 'assignment' }).catch(() => {});
      return { title: 'Mission Finalized', completion };
    }

    case 'reopen':
      await removeJobFromDraftLogs(ctx.techId, live.id);
      await updateDoc(ref, {
        status: reopenStatusFor(live),
        history: arrayUnion(historyEntry(`Mission re-opened at ${now} for correction. Location: [${location}].`, user, 'note')),
      });
      return { title: 'Mission Re-opened', description: 'Removed from your Draft weekly log until it is completed again.' };
  }
}
