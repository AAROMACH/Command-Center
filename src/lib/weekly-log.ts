import { startOfWeek, format, isValid } from 'date-fns';
import { collection, query, where, getDocs, doc, updateDoc, setDoc, arrayUnion, runTransaction } from 'firebase/firestore';
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

/**
 * Claim-doc key for a tech's open weekly log for a given week — a tiny
 * bookkeeping doc (never shown in the UI) rather than a query, because
 * Firestore transactions can only read a fixed document reference, not run
 * a query. This is what makes "does this tech already have a Draft log for
 * this week" an atomic check-and-create instead of the query-then-write
 * race that used to let two near-simultaneous completions each see "no log
 * yet" and create their own duplicate.
 */
function weeklyLogClaimRef(techId: string, weekOf: string) {
  return doc(db, 'weeklyLogClaims', `${techId}_${weekOf}`);
}

/**
 * Atomically files `item` into the Draft weekly log for techId+weekOf,
 * creating that log (and its claim) if none exists yet. If a log exists for
 * that week but isn't Draft anymore: `createIfClosed` true supersedes the
 * stale claim with a fresh Draft log (used for the reporting-week fallback,
 * which never inspects non-Draft logs); false reports 'closed' so the
 * caller can fall through to the reporting week instead.
 */
async function claimAndFileItem(
  techId: string,
  weekOf: string,
  item: WeeklyLogItem,
  makeLogId: () => Promise<string>,
  createIfClosed: boolean,
): Promise<'updated' | 'created' | 'closed'> {
  // Reserved before the transaction starts — Firestore transactions can't
  // contain another transaction, and makeLogId() runs its own against
  // systemConfig/idCounters. Harmless if it goes unused on the rare race
  // that finds a log already claimed: it just skips a sequence number.
  const reservedLogId = await makeLogId();
  const claimRef = weeklyLogClaimRef(techId, weekOf);

  return runTransaction(db, async (tx) => {
    const claimSnap = await tx.get(claimRef);
    const claimedLogId = claimSnap.exists() ? (claimSnap.data() as any).logId as string : null;
    const logSnap = claimedLogId ? await tx.get(doc(db, 'weeklyLogs', claimedLogId)) : null;

    if (logSnap?.exists() && logSnap.data().status === 'Draft') {
      tx.update(doc(db, 'weeklyLogs', claimedLogId!), { items: arrayUnion(item) });
      return 'updated';
    }
    if (logSnap?.exists() && !createIfClosed) {
      return 'closed';
    }

    // No claim, a dangling claim, or a closed log we're allowed to
    // supersede — start a fresh Draft log and (re)point the claim at it.
    const newLogRef = doc(db, 'weeklyLogs', reservedLogId);
    tx.set(claimRef, { techId, weekOf, logId: reservedLogId });
    tx.set(newLogRef, {
      id: reservedLogId, techId, weekOf, status: 'Draft', items: [item], reimbursements: [], totalPayout: 0,
    });
    return 'created';
  });
}

/**
 * Pre-claim-doc fallback: the original query-then-write logic. Used only if
 * the claim-based path throws (e.g. the weeklyLogClaims security rule
 * hasn't been deployed yet) so filing a completion never hard-fails —
 * it's racy under true concurrency, same as before this fix, but strictly
 * no worse.
 */
async function legacyFileInWeek(techId: string, weekOf: string, item: WeeklyLogItem, makeLogId: () => Promise<string>): Promise<'updated' | 'created'> {
  const snap = await getDocs(query(
    collection(db, 'weeklyLogs'),
    where('techId', '==', techId),
    where('weekOf', '==', weekOf),
    where('status', '==', 'Draft'),
  ));
  if (!snap.empty) {
    await updateDoc(doc(db, 'weeklyLogs', snap.docs[0].id), { items: arrayUnion(item) });
    return 'updated';
  }
  const logId = await makeLogId();
  await setDoc(doc(db, 'weeklyLogs', logId), {
    id: logId, techId, weekOf, status: 'Draft', items: [item], reimbursements: [], totalPayout: 0,
  });
  return 'created';
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
  try {
    await claimAndFileItem(techId, reportingWeek, flagged, makeLogId, /* createIfClosed */ true);
  } catch {
    await legacyFileInWeek(techId, reportingWeek, flagged, makeLogId);
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

  let result: 'updated' | 'created' | 'closed';
  try {
    result = await claimAndFileItem(techId, scheduledWeek, item, makeLogId, /* createIfClosed */ false);
  } catch {
    result = await legacyFileInWeek(techId, scheduledWeek, item, makeLogId);
  }
  if (result !== 'closed') {
    return { weekOf: scheduledWeek, placedIn: 'scheduled_week' };
  }

  // Scheduled week's log is closed — file in the reporting week, flagged.
  await fileInReportingWeek(techId, item, scheduledWeek, reportingWeek, makeLogId);
  return { weekOf: reportingWeek, placedIn: 'reporting_week_override' };
}
