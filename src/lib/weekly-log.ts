import { startOfWeek, format, isValid } from 'date-fns';
import { collection, query, where, getDocs, doc, setDoc, updateDoc, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import type { WeeklyLog, WeeklyLogItem, WorkOrder } from '@/lib/types';

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

function logsForWeek(techId: string, weekOf: string) {
  return query(collection(db, 'weeklyLogs'), where('techId', '==', techId), where('weekOf', '==', weekOf));
}

/** Manual creation uses the same claim as completed jobs, so either path can
 * win a concurrent race without leaving two Drafts for the week. */
export async function createDraftWeeklyLog(opts: {
  techId: string;
  weekOf: string;
  makeLogId: () => Promise<string>;
}): Promise<'created' | 'exists'> {
  const { techId, weekOf, makeLogId } = opts;
  if (!(await getDocs(logsForWeek(techId, weekOf))).empty) return 'exists';
  const logId = await makeLogId();
  const claimRef = weeklyLogClaimRef(techId, weekOf);
  return runTransaction(db, async tx => {
    const claimSnap = await tx.get(claimRef);
    const claimedId = claimSnap.exists() ? claimSnap.data().logId as string : null;
    const claimedLog = claimedId ? await tx.get(doc(db, 'weeklyLogs', claimedId)) : null;
    if (claimedLog?.exists()) return 'exists';
    tx.set(claimRef, { techId, weekOf, logId });
    tx.set(doc(db, 'weeklyLogs', logId), {
      id: logId, techId, weekOf, status: 'Draft', items: [], reimbursements: [], totalPayout: 0,
    });
    return 'created';
  });
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
  // Older/manual logs may predate weeklyLogClaims. Adopt an existing Draft
  // before the transaction considers creating a new log.
  const existing = await getDocs(logsForWeek(techId, weekOf));
  const existingDraft = existing.docs.find(d => d.data().status === 'Draft');
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
    const draftSnap = existingDraft && existingDraft.id !== claimedLogId
      ? await tx.get(doc(db, 'weeklyLogs', existingDraft.id)) : null;

    const openLog = logSnap?.exists() && logSnap.data().status === 'Draft' ? logSnap
      : draftSnap?.exists() && draftSnap.data().status === 'Draft' ? draftSnap : null;
    if (openLog) {
      const items = (openLog.data().items || []) as WeeklyLogItem[];
      if (!items.some(existingItem => existingItem.workOrderId === item.workOrderId)) {
        tx.update(openLog.ref, { items: [...items, item] });
      }
      if (claimedLogId !== openLog.id) tx.set(claimRef, { techId, weekOf, logId: openLog.id });
      return 'updated';
    }
    if (!createIfClosed && (logSnap?.exists() || !existing.empty)) {
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
 * Pre-claim-doc fallback when weeklyLogClaims is unavailable. Existing Draft
 * updates still use a transaction and avoid repeating a work order. Creating
 * a new log here remains racy if the claim security rule is not deployed.
 */
async function legacyFileInWeek(techId: string, weekOf: string, item: WeeklyLogItem, makeLogId: () => Promise<string>, createIfClosed: boolean): Promise<'updated' | 'created' | 'closed'> {
  const snap = await getDocs(logsForWeek(techId, weekOf));
  const draft = snap.docs.find(d => d.data().status === 'Draft');
  if (draft) {
    await runTransaction(db, async tx => {
      const current = await tx.get(draft.ref);
      if (!current.exists() || current.data().status !== 'Draft') throw new Error('Weekly log changed while filing. Retry the action.');
      const items = (current.data().items || []) as WeeklyLogItem[];
      if (!items.some(existingItem => existingItem.workOrderId === item.workOrderId)) {
        tx.update(draft.ref, { items: [...items, item] });
      }
    });
    return 'updated';
  }
  if (!createIfClosed && !snap.empty) return 'closed';
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
    await legacyFileInWeek(techId, reportingWeek, flagged, makeLogId, true);
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
 * A closed week can receive a separate Draft for review. Open Drafts are
 * reused, including older manual logs that have no claim document yet.
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
    result = await legacyFileInWeek(techId, scheduledWeek, item, makeLogId, false);
  }
  if (result !== 'closed') {
    return { weekOf: scheduledWeek, placedIn: 'scheduled_week' };
  }

  // Scheduled week's log is closed — file in the reporting week, flagged.
  await fileInReportingWeek(techId, item, scheduledWeek, reportingWeek, makeLogId);
  return { weekOf: reportingWeek, placedIn: 'reporting_week_override' };
}

// ── Completed-job coverage ──────────────────────────────────────────────────
//
// A job only reaches a weekly log when something files it at completion time.
// The helpers below let every completion path share one item shape, and let
// the self-healing sync (use-helper-log-sync.ts) and the admin "Unlogged" audit
// agree on what counts as "already in a log".

/** Work-order ids a set of logs already accounts for: filed items, plus
 *  missing-job reports the tech linked to a specific assignment (those are
 *  pending payroll review and must not be double-filed). */
export function loggedWorkOrderIds(logs: Pick<WeeklyLog, 'items' | 'missingAssignmentReports'>[]): Set<string> {
  const ids = new Set<string>();
  for (const log of logs) {
    (log.items || []).forEach(i => { if (i.workOrderId) ids.add(i.workOrderId); });
    (log.missingAssignmentReports || []).forEach(r => { if (r.assignmentId) ids.add(r.assignmentId); });
  }
  return ids;
}

/** Whether a job is accounted for by `ids` — matched by its doc id or, for
 *  jobs that moved from workOrders → assignments, its original workOrderId. */
export function isJobLogged(job: Pick<WorkOrder, 'id' | 'workOrderId'>, ids: Set<string>): boolean {
  return ids.has(job.id) || (!!job.workOrderId && ids.has(job.workOrderId));
}

export async function buildCompletedJobItem(
  job: Pick<WorkOrder, 'id' | 'pay' | 'scheduleDate'>,
  filedVia: WeeklyLogItem['filedVia'],
): Promise<WeeklyLogItem> {
  return {
    id: await createDocId(ID_PREFIXES.WEEKLY_LOG_ITEM),
    workOrderId: job.id,
    jobPay: job.pay,
    outcomeCode: null,
    isComplete: true,
    isAdminReviewed: false,
    workDate: job.scheduleDate,
    filedVia,
  };
}

/** Files a completed job for `techId` using auto placement (scheduled week if
 *  its log is open, otherwise the reporting week, flagged). */
export async function fileCompletedJob(opts: {
  techId: string;
  job: Pick<WorkOrder, 'id' | 'pay' | 'scheduleDate'>;
  filedVia: WeeklyLogItem['filedVia'];
}): Promise<FileCompletedResult> {
  const item = await buildCompletedJobItem(opts.job, opts.filedVia);
  return fileCompletedAssignment({
    techId: opts.techId,
    scheduleDate: opts.job.scheduleDate,
    item,
    makeLogId: () => createDocId(ID_PREFIXES.WEEKLY_LOG),
  });
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
 * Removes a job's item from a tech's Draft logs — used when a job is
 * re-opened (or re-completed, to avoid stacking). Submitted/Approved logs are
 * left alone; those are payroll's to adjust.
 */
export async function removeJobFromDraftLogs(techId: string, workOrderId: string) {
  const snap = await getDocs(query(
    collection(db, 'weeklyLogs'),
    where('techId', '==', techId),
    where('status', '==', 'Draft'),
  ));
  for (const logDoc of snap.docs) {
    const items = (logDoc.data().items || []) as WeeklyLogItem[];
    const kept = items.filter(i => i.workOrderId !== workOrderId);
    if (kept.length !== items.length) await updateDoc(logDoc.ref, { items: kept });
  }
}

/**
 * Keeps weekly logs in step when an admin edits a job's status directly
 * (admin assignment edit dialogs). Moving a job INTO completed files it for
 * its tech; moving it OUT of completed pulls it from their open Draft logs.
 */
export async function syncWeeklyLogForAdminStatusEdit(opts: {
  prevStatus: WorkOrder['status'] | undefined;
  job: Pick<WorkOrder, 'id' | 'pay' | 'scheduleDate' | 'status' | 'payrollExcluded'>;
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

const isLockedLog = (log: WeeklyLog) => {
  const status = log.status as string;
  const flags = log as { paid?: boolean; archived?: boolean };
  return status === 'Approved' || status === 'Paid' || flags.paid === true || flags.archived === true;
};

/**
 * Moves a job's weekly-log entry when its lead tech is swapped, so it leaves
 * the previous tech's log and lands on the new tech's — mirroring how the job
 * itself leaves the previous tech's views (techId changes) and appears in
 * the new tech's.
 *
 *  - Pulled from every OPEN log of the previous tech. Their reimbursements
 *    for the job stay with them — that's money they spent.
 *  - If the job is completed (and payable) it's filed on the new tech with
 *    auto placement, carrying over payroll-entered figures (jobPay,
 *    payoutAmount, payNotes, outcomeCode) but with confirmation/review reset
 *    since the new tech hasn't confirmed it. Any $0 helper entry the new tech
 *    had for the job is replaced.
 *  - If the previous tech's entry sits on an Approved/Paid log, nothing is
 *    moved (see SwapLogMoveResult.lockedWeeks).
 */
export async function moveJobLogOnSwap(opts: {
  job: Pick<WorkOrder, 'id' | 'workOrderId' | 'pay' | 'scheduleDate' | 'status' | 'payrollExcluded'>;
  /** Previous tech id(s). Pass both the raw `techId` and
   *  `assignedTechnicianId` — a doc desynced by an old swap may have filed
   *  under either. Blanks and the new tech are ignored. */
  fromTechIds: (string | null | undefined)[];
  toTechId: string | null | undefined;
}): Promise<SwapLogMoveResult> {
  const { job, toTechId } = opts;
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
  if (job.status !== 'completed' || job.payrollExcluded) return result;

  // The new lead may have been a helper on this job — drop their $0 entry
  // from open logs so the lead entry replaces it instead of being deduped.
  const toLogs = await getDocs(query(collection(db, 'weeklyLogs'), where('techId', '==', toTechId)));
  for (const logDoc of toLogs.docs) {
    const data = logDoc.data() as WeeklyLog;
    if (isLockedLog(data)) continue;
    const items = data.items || [];
    if (!items.some(i => matches(i) && i.isHelper)) continue;
    await updateDoc(logDoc.ref, { items: items.filter(i => !(matches(i) && i.isHelper)) });
  }

  const base = await buildCompletedJobItem(job, 'tech_swap');
  const item: WeeklyLogItem = carried && !carried.isHelper
    ? {
        ...base,
        jobPay: carried.jobPay ?? base.jobPay,
        ...(carried.payoutAmount !== undefined ? { payoutAmount: carried.payoutAmount } : {}),
        ...(carried.payNotes ? { payNotes: carried.payNotes } : {}),
        outcomeCode: carried.outcomeCode ?? null,
        workDate: carried.workDate || base.workDate,
      }
    : base;
  const filed = await fileCompletedAssignment({
    techId: toTechId,
    scheduleDate: job.scheduleDate,
    item,
    makeLogId: () => createDocId(ID_PREFIXES.WEEKLY_LOG),
  });
  result.filedWeekOf = filed.weekOf;
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
