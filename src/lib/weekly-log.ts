import { collection, query, where, getDocs, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { WeeklyLog, WeeklyLogItem, WorkOrder } from '@/lib/types';
import { weeklyLogAction } from '@/lib/weekly-log-api';
import { isLockedLog, reportingWeekOf, weekOfForScheduleDate } from '@/lib/weekly-log-core';

// Pure rules live in weekly-log-core (shared with the server); re-exported so
// existing imports keep working.
export { weekOfForScheduleDate, loggedWorkOrderIds, isJobLogged, isLockedLog } from '@/lib/weekly-log-core';

/**
 * Filing jobs onto weekly logs. All writes go through /api/weekly-log
 * (lib/server/weekly-log-server.ts): the server builds each item from the job
 * record, so pay can't be set from the browser, and it only files a job for
 * the tech it's assigned to (or a listed helper). Admins use the same path so
 * filing has a single implementation.
 */

export type FileCompletedResult = {
  weekOf: string;
  /** 'already_logged' — the job already has an entry on this tech's logs, so
   *  nothing was added (it can't be paid twice). */
  placedIn: 'scheduled_week' | 'reporting_week_override' | 'already_logged';
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
  const reportingWeek = reportingWeekOf();
  const schedSnap = await getDocs(query(
    collection(db, 'weeklyLogs'),
    where('techId', '==', opts.techId),
    where('weekOf', '==', scheduledWeek),
  ));
  const scheduledWeekEligible = schedSnap.empty || schedSnap.docs.some(d => d.data().status === 'Draft');
  return { scheduledWeek, reportingWeek, differentWeek: scheduledWeek !== reportingWeek, scheduledWeekEligible };
}

/** Start an empty Draft for a week (one per tech per week). */
export async function createDraftWeeklyLog(opts: { techId?: string; weekOf: string }): Promise<'created' | 'exists'> {
  return weeklyLogAction<'created' | 'exists'>('createDraft', { techId: opts.techId, weekOf: opts.weekOf });
}

/**
 * File a completed job for `techId`.
 *   - `placement: 'scheduled'` → the scheduled week's Draft (created if that
 *      week has no log yet).
 *   - `placement: 'reporting'` → the current reporting week's Draft, flagged
 *      as a cross-week entry.
 *   - default → scheduled week when its log is open, otherwise the reporting
 *      week, flagged.
 */
export async function fileCompletedJob(opts: {
  techId: string;
  job: Pick<WorkOrder, 'id'>;
  filedVia: WeeklyLogItem['filedVia'];
  placement?: 'scheduled' | 'reporting';
}): Promise<FileCompletedResult> {
  return weeklyLogAction<FileCompletedResult>('fileJob', {
    techId: opts.techId, jobId: opts.job.id, filedVia: opts.filedVia, placement: opts.placement,
  });
}

/**
 * Removes a job's item from a tech's Draft logs — used when a job is
 * re-opened (or re-completed, to avoid stacking). Submitted/Approved logs are
 * left alone; those are payroll's to adjust.
 */
export async function removeJobFromDraftLogs(techId: string, workOrderId: string) {
  await weeklyLogAction('removeJob', { techId, jobId: workOrderId });
}

/**
 * Jobs a tech is in the middle of completing — between the status write and
 * the "which week?" answer. The self-healing sync skips these so it can't
 * file a job out from under the tech's choice. Entries expire so a prompt the
 * tech walked away from (closed tab, back button) doesn't block the sync
 * forever.
 */
const COMPLETION_IN_FLIGHT_TTL_MS = 10 * 60 * 1000;
/** Kept briefly after filing so a weekly-log snapshot that hasn't caught up
 *  yet can't make the sync see the job as unlogged and file it twice. */
const COMPLETION_SETTLE_MS = 60 * 1000;
const completionsInFlight = new Map<string, number>(); // workOrderId → expiry

export function beginCompletionFiling(workOrderId: string) {
  completionsInFlight.set(workOrderId, Date.now() + COMPLETION_IN_FLIGHT_TTL_MS);
}

export function endCompletionFiling(workOrderId: string) {
  completionsInFlight.set(workOrderId, Date.now() + COMPLETION_SETTLE_MS);
}

export function isCompletionFilingInFlight(workOrderId: string): boolean {
  const expiresAt = completionsInFlight.get(workOrderId);
  if (expiresAt === undefined) return false;
  if (Date.now() > expiresAt) {
    completionsInFlight.delete(workOrderId);
    return false;
  }
  return true;
}

/**
 * Keeps weekly logs in step when an admin edits a job's status directly
 * (admin assignment edit dialogs). Moving a job INTO completed files it for
 * its tech; moving it OUT of completed pulls it from their open Draft logs.
 */
export async function syncWeeklyLogForAdminStatusEdit(opts: {
  prevStatus: WorkOrder['status'] | undefined;
  job: Pick<WorkOrder, 'id' | 'status' | 'payrollExcluded'>;
  techId: string | null | undefined;
}) {
  const { prevStatus, job, techId } = opts;
  if (!techId || prevStatus === job.status) return;
  if (job.status === 'completed' && !job.payrollExcluded) {
    await fileCompletedJob({ techId, job, filedVia: 'admin_status_edit' });
  } else if (prevStatus === 'completed') {
    await removeJobFromDraftLogs(techId, job.id);
  }
}

export type SwapLogMoveResult = {
  /** Open logs (Draft/Submitted/Rejected) on the previous tech the job was pulled from. */
  removedFrom: string[];
  /** Week the job was filed into on the new tech, when it was completed. */
  filedWeekOf?: string;
  /** Approved/Paid logs on the previous tech that still hold the job — left
   *  untouched (settled pay), and the job was NOT filed to the new tech so it
   *  can't be paid twice. Payroll has to adjust these by hand. */
  lockedWeeks: string[];
};

/**
 * Moves a job's weekly-log entry when its lead tech is swapped (admin only),
 * so it leaves the previous tech's log and lands on the new tech's.
 *
 *  - Pulled from every OPEN log of the previous tech. Their reimbursements
 *    for the job stay with them — that's money they spent.
 *  - If the job is completed (and payable) it's filed on the new tech,
 *    carrying over payroll-entered figures (jobPay, payoutAmount, payNotes,
 *    outcomeCode) with confirmation/review reset. The server replaces any $0
 *    helper entry the new tech had and won't add a second lead entry.
 *  - If the previous tech's entry sits on an Approved/Paid log, nothing is
 *    moved (see SwapLogMoveResult.lockedWeeks).
 */
export async function moveJobLogOnSwap(opts: {
  job: Pick<WorkOrder, 'id' | 'workOrderId' | 'status' | 'payrollExcluded'>;
  /** Previous tech id(s). Pass both the raw `techId` and
   *  `assignedTechnicianId` — a doc desynced by an old swap may have filed
   *  under either. Blanks and the new tech are ignored. */
  fromTechIds: (string | null | undefined)[];
  toTechId: string | null | undefined;
  /** false = only pull the entry off the previous tech's logs (e.g. a stale
   *  helper entry); nothing is filed on the new tech. Default true. */
  fileToTarget?: boolean;
}): Promise<SwapLogMoveResult> {
  const { job, toTechId, fileToTarget = true } = opts;
  const result: SwapLogMoveResult = { removedFrom: [], lockedWeeks: [] };
  const fromTechIds = [...new Set(opts.fromTechIds.filter((t): t is string => !!t && t !== toTechId))];
  if (!toTechId || fromTechIds.length === 0) return result;
  const jobIds = new Set([job.id, job.workOrderId].filter(Boolean) as string[]);
  const matches = (i: WeeklyLogItem) => jobIds.has(i.workOrderId);

  const fromLogDocs = (await Promise.all(fromTechIds.map(t =>
    getDocs(query(collection(db, 'weeklyLogs'), where('techId', '==', t)))))).flatMap(snap => snap.docs);
  let carried: WeeklyLogItem | null = null;
  for (const logDoc of fromLogDocs) {
    const data = logDoc.data() as WeeklyLog;
    const hit = (data.items || []).find(matches);
    if (!hit) continue;
    if (isLockedLog(data)) { result.lockedWeeks.push(data.weekOf); continue; }
    await runTransaction(db, async tx => {
      const fresh = await tx.get(logDoc.ref);
      if (!fresh.exists()) return;
      const items = (fresh.data().items || []) as WeeklyLogItem[];
      const kept = items.filter(i => !matches(i));
      if (kept.length !== items.length) tx.update(logDoc.ref, { items: kept });
    });
    carried = carried || hit;
    result.removedFrom.push(data.weekOf);
  }

  if (result.lockedWeeks.length > 0) return result;
  if (!fileToTarget || job.status !== 'completed' || job.payrollExcluded) return result;

  const carry = carried && !carried.isHelper ? {
    jobPay: carried.jobPay,
    payoutAmount: carried.payoutAmount,
    payNotes: carried.payNotes,
    outcomeCode: carried.outcomeCode ?? null,
    workDate: carried.workDate,
  } : undefined;
  const filed = await weeklyLogAction<FileCompletedResult>('fileJob', {
    techId: toTechId, jobId: job.id, filedVia: 'tech_swap', asLead: true, carry,
  });
  if (filed.placedIn !== 'already_logged') result.filedWeekOf = filed.weekOf;
  return result;
}

/** One-line toast text for a swap's log move. */
export function describeSwapLogMove(r: SwapLogMoveResult, fromName: string, toName: string): { text: string; warn: boolean } | null {
  if (r.lockedWeeks.length) {
    return { warn: true, text: `Already on ${fromName}'s approved log (week of ${r.lockedWeeks.join(', ')}) — not moved. Adjust in Payroll Audit.` };
  }
  if (r.filedWeekOf) return { warn: false, text: `Weekly log entry moved to ${toName} (week of ${r.filedWeekOf}).` };
  if (r.removedFrom.length) return { warn: false, text: `Removed from ${fromName}'s weekly log.` };
  return null;
}
