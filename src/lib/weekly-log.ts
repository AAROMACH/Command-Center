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

export type CompletionPlacement = {
  scheduledWeek: string;
  reportingWeek: string;
  /** true when the job was scheduled in a different week than it's being completed. */
  differentWeek: boolean;
  /** true when the scheduled week has no log yet or its log is still Draft (so
   *  "Add to Correct Week" is a valid choice). */
  scheduledWeekEligible: boolean;
};

/**
 * Inspect where a completed job could be filed without writing anything — used
 * to decide whether to prompt the tech "correct week vs current week".
 */
export async function resolveCompletionPlacement(opts: {
  techId: string;
  scheduleDate: string | undefined | null;
}): Promise<CompletionPlacement> {
  const scheduledWeek = weekOfForScheduleDate(opts.scheduleDate);
  const reportingWeek = weekOfForScheduleDate(format(new Date(), 'yyyy-MM-dd'));
  const schedSnap = await getDocs(query(
    collection(db, 'weeklyLogs'),
    where('techId', '==', opts.techId),
    where('weekOf', '==', scheduledWeek),
  ));
  const scheduledWeekEligible = schedSnap.empty || schedSnap.docs.some(d => d.data().status === 'Draft');
  return { scheduledWeek, reportingWeek, differentWeek: scheduledWeek !== reportingWeek, scheduledWeekEligible };
}

async function fileInReportingWeek(techId: string, item: WeeklyLogItem, scheduledWeek: string, reportingWeek: string, makeLogId: () => Promise<string>) {
  const flagged: WeeklyLogItem = {
    ...item,
    assignmentWeekId: scheduledWeek,
    reportedWeekId: reportingWeek,
    wasMovedBetweenWeeks: true,
    weekOverrideReason: 'Filed in reporting week (scheduled week unavailable or overridden)',
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
}

/**
 * File a completed assignment's weekly-log item into the correct log.
 *   - `placement: 'scheduled'` → the scheduled week's Draft log (created if
 *      that week has no log yet).
 *   - `placement: 'reporting'` → the current reporting week's Draft log, flagged
 *      as a cross-week entry.
 *   - default (no placement) → auto: scheduled week when possible, otherwise the
 *      reporting week flagged (used when the scheduled week's log is closed).
 * Never creates a second log for a week that already has one.
 */
export async function fileCompletedAssignment(opts: {
  techId: string;
  scheduleDate: string | undefined | null;
  item: WeeklyLogItem;
  makeLogId: () => Promise<string>;
  placement?: 'scheduled' | 'reporting';
}): Promise<FileCompletedResult> {
  const { techId, scheduleDate, item, makeLogId, placement } = opts;
  const scheduledWeek = weekOfForScheduleDate(scheduleDate);
  const reportingWeek = weekOfForScheduleDate(format(new Date(), 'yyyy-MM-dd'));

  if (placement === 'reporting') {
    await fileInReportingWeek(techId, item, scheduledWeek, reportingWeek, makeLogId);
    return { weekOf: reportingWeek, placedIn: 'reporting_week_override' };
  }

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

  // Scheduled week's log is closed (or caller forced reporting) — file in the
  // reporting week, flagged.
  await fileInReportingWeek(techId, item, scheduledWeek, reportingWeek, makeLogId);
  return { weekOf: reportingWeek, placedIn: 'reporting_week_override' };
}
