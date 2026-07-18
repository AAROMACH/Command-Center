import { startOfWeek, format, isValid } from 'date-fns';
import { collection, query, where, getDocs, doc, updateDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { WeeklyLogItem } from '@/lib/types';

/**
 * The Monday-based `weekOf` key ('MM-dd-yyyy') for a work order's scheduled
 * date — the week that owns the assignment. Weekly logs are keyed by this
 * value, so completing a job must file it in the log for its SCHEDULED week,
 * not whatever week it happened to be completed in.
 *
 * Accepts the two scheduleDate shapes the app stores (ISO `YYYY-MM-DD` and
 * `M/D/YYYY`); falls back to the current week only when the date is missing or
 * unparseable.
 */
export function weekOfForScheduleDate(scheduleDate: string | undefined | null): string {
  let d: Date | null = null;
  if (scheduleDate) {
    const parts = scheduleDate.split(/[-/]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        d = new Date(`${scheduleDate}T12:00:00`);
      } else {
        const [m, day, y] = parts.map(Number);
        if (y && m && day) d = new Date(y, m - 1, day, 12);
      }
    }
  }
  if (!d || !isValid(d)) d = new Date();
  return format(startOfWeek(d, { weekStartsOn: 1 }), 'MM-dd-yyyy');
}

export type FileCompletedResult = {
  weekOf: string;
  placedIn: 'scheduled_week' | 'reporting_week_override';
};

/**
 * File a completed assignment's weekly-log item into the correct log:
 *   - the scheduled week's Draft log (created if that week has no log yet), OR
 *   - when the scheduled week's log already exists but is closed
 *     (Submitted/Approved/etc.), the current reporting week's Draft log, with
 *     the item flagged (assignmentWeekId/reportedWeekId/wasMovedBetweenWeeks…)
 *     so payroll can see it belongs to a different service week.
 * Never creates a second log for a week that already has one.
 */
export async function fileCompletedAssignment(opts: {
  techId: string;
  scheduleDate: string | undefined | null;
  item: WeeklyLogItem;
  makeLogId: () => Promise<string>;
}): Promise<FileCompletedResult> {
  const { techId, scheduleDate, item, makeLogId } = opts;
  const scheduledWeek = weekOfForScheduleDate(scheduleDate);
  const reportingWeek = weekOfForScheduleDate(format(new Date(), 'yyyy-MM-dd'));

  const schedSnap = await getDocs(query(
    collection(db, 'weeklyLogs'),
    where('techId', '==', techId),
    where('weekOf', '==', scheduledWeek),
  ));
  const scheduledDraft = schedSnap.docs.find(d => d.data().status === 'Draft');

  if (scheduledDraft) {
    await updateDoc(doc(db, 'weeklyLogs', scheduledDraft.id), { items: arrayUnion(item) });
    return { weekOf: scheduledWeek, placedIn: 'scheduled_week' };
  }
  if (schedSnap.empty) {
    const logId = await makeLogId();
    await setDoc(doc(db, 'weeklyLogs', logId), {
      id: logId, techId, weekOf: scheduledWeek, status: 'Draft', items: [item], reimbursements: [], totalPayout: 0,
    });
    return { weekOf: scheduledWeek, placedIn: 'scheduled_week' };
  }

  // Scheduled week's log is closed — file in the reporting week, flagged.
  const flagged: WeeklyLogItem = {
    ...item,
    assignmentWeekId: scheduledWeek,
    reportedWeekId: reportingWeek,
    wasMovedBetweenWeeks: true,
    weekOverrideReason: 'Scheduled week log already closed',
    weekOverrideAt: new Date().toISOString(),
  };
  const curSnap = await getDocs(query(
    collection(db, 'weeklyLogs'),
    where('techId', '==', techId),
    where('weekOf', '==', reportingWeek),
    where('status', '==', 'Draft'),
  ));
  if (!curSnap.empty) {
    await updateDoc(doc(db, 'weeklyLogs', curSnap.docs[0].id), { items: arrayUnion(flagged) });
  } else {
    const logId = await makeLogId();
    await setDoc(doc(db, 'weeklyLogs', logId), {
      id: logId, techId, weekOf: reportingWeek, status: 'Draft', items: [flagged], reimbursements: [], totalPayout: 0,
    });
  }
  return { weekOf: reportingWeek, placedIn: 'reporting_week_override' };
}
