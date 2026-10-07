import 'server-only';

import { getFirestore, type DocumentReference, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { ID_PREFIXES } from '@/lib/constants';
import type { FinancialRecord, MissingAssignmentReport, WeeklyLog, WeeklyLogItem, WorkOrder } from '@/lib/types';
import { computeWeeklyLogSettlement } from '@/lib/payroll';
import { externalWorkOrderId } from '@/lib/work-order-identity';
import {
  assignedTechOf, canSubmitWeek, isLockedLog, reportingWeekOf, weekOfForScheduleDate,
} from '@/lib/weekly-log-core';

/**
 * Every weekly-log write a TECH makes runs here, with the Admin SDK, after
 * /api/weekly-log has checked who is calling. Techs have no direct write
 * access to weeklyLogs any more (firestore.rules), because the rules can't
 * validate what's inside the items/reimbursements arrays — a tech could have
 * rewritten a job's pay or approved their own reimbursement in a Draft.
 *
 * What the server guarantees:
 *  - A filed job's pay comes from the job record (admin-only fields), never
 *    from the caller; helper entries are $0 for payroll to price.
 *  - A job is only filed for the tech it's assigned to (or a listed helper).
 *  - Reimbursements a tech adds are always 'pending'; only payroll changes that.
 *  - Missing-job reports carry no payroll audit figures from the tech.
 *  - Submitting stamps the live settlement total.
 */

export class WeeklyLogError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const fs = (): Firestore => getFirestore(adminApp);

/** Strip undefined (Firestore rejects it inside array values). */
function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Friendly ids (wlog-001 …) — same counter doc and format as lib/generateId.ts. */
export async function serverDocId(prefix: string): Promise<string> {
  const ref = fs().doc('systemConfig/idCounters');
  const current = await fs().runTransaction(async tx => {
    const snap = await tx.get(ref);
    const n = (snap.exists ? (snap.data()?.[prefix] as number | undefined) : undefined) ?? 0;
    tx.set(ref, { [prefix]: n + 1 }, { merge: true });
    return n;
  });
  return `${prefix}-${String(current).padStart(3, '0')}`;
}

/** A job by doc id — dispatched (assignments) first, then the pool. */
export async function loadJob(jobId: string): Promise<WorkOrder | null> {
  if (!jobId || typeof jobId !== 'string' || jobId.includes('/')) return null;
  for (const c of ['assignments', 'workOrders']) {
    const snap = await fs().collection(c).doc(jobId).get();
    if (snap.exists) return { ...snap.data(), id: snap.id } as WorkOrder;
  }
  return null;
}

const logsOf = (techId: string) => fs().collection('weeklyLogs').where('techId', '==', techId);
const claimRef = (techId: string, weekOf: string) => fs().doc(`weeklyLogClaims/${techId}_${weekOf}`);
const newDraft = (id: string, techId: string, weekOf: string, items: WeeklyLogItem[]) =>
  ({ id, techId, weekOf, status: 'Draft', items, reimbursements: [], totalPayout: 0 });

// ── Creating logs / filing jobs ─────────────────────────────────────────────

export async function createDraft(techId: string, weekOf: string): Promise<'created' | 'exists'> {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(weekOf)) throw new WeeklyLogError('Invalid week.');
  if (!(await logsOf(techId).where('weekOf', '==', weekOf).limit(1).get()).empty) return 'exists';
  const logId = await serverDocId(ID_PREFIXES.WEEKLY_LOG);
  const claim = claimRef(techId, weekOf);
  return fs().runTransaction(async tx => {
    const c = await tx.get(claim);
    const claimedId = c.exists ? (c.data()?.logId as string) : null;
    if (claimedId && (await tx.get(fs().doc(`weeklyLogs/${claimedId}`))).exists) return 'exists';
    tx.set(claim, { techId, weekOf, logId });
    tx.set(fs().doc(`weeklyLogs/${logId}`), newDraft(logId, techId, weekOf, []));
    return 'created';
  });
}

/**
 * Files `item` into the tech's Draft for `weekOf` (creating it if the week
 * has no log). If that week's log is closed: `createIfClosed` starts a fresh
 * Draft, otherwise reports 'closed' so the caller can use the reporting week.
 * Atomic via the claim doc — two completions at once can't make two Drafts.
 */
async function claimAndFile(techId: string, weekOf: string, item: WeeklyLogItem, createIfClosed: boolean):
  Promise<'updated' | 'created' | 'closed'> {
  const existing = await logsOf(techId).where('weekOf', '==', weekOf).get();
  const existingDraft = existing.docs.find(d => d.data().status === 'Draft');
  const reservedId = await serverDocId(ID_PREFIXES.WEEKLY_LOG);
  const claim = claimRef(techId, weekOf);

  return fs().runTransaction(async tx => {
    const c = await tx.get(claim);
    const claimedId = c.exists ? (c.data()?.logId as string) : null;
    const claimed = claimedId ? await tx.get(fs().doc(`weeklyLogs/${claimedId}`)) : null;
    const draft = existingDraft && existingDraft.id !== claimedId ? await tx.get(existingDraft.ref) : null;
    const open = claimed?.exists && claimed.data()?.status === 'Draft' ? claimed
      : draft?.exists && draft.data()?.status === 'Draft' ? draft : null;
    if (open) {
      const items = (open.data()?.items || []) as WeeklyLogItem[];
      if (!items.some(i => i.workOrderId === item.workOrderId)) tx.update(open.ref, { items: [...items, item] });
      if (claimedId !== open.id) tx.set(claim, { techId, weekOf, logId: open.id });
      return 'updated';
    }
    if (!createIfClosed && (claimed?.exists || !existing.empty)) return 'closed';
    tx.set(claim, { techId, weekOf, logId: reservedId });
    tx.set(fs().doc(`weeklyLogs/${reservedId}`), newDraft(reservedId, techId, weekOf, [item]));
    return 'created';
  });
}

export type FileResult = { weekOf: string; placedIn: 'scheduled_week' | 'reporting_week_override' | 'already_logged' };

/** Payroll-entered figures an ADMIN may carry over when moving an entry (tech swap). */
export type CarriedFigures = Partial<Pick<WeeklyLogItem, 'jobPay' | 'payoutAmount' | 'payNotes' | 'outcomeCode' | 'workDate'>>;

/**
 * File a completed job on a tech's weekly log. The item is built here from
 * the job record: lead → the job's pay, helper → $0. Throws when the tech
 * isn't on the job. `asLead` (admins only) treats the tech as lead even if
 * the job doc hasn't caught up with a swap yet.
 */
export async function fileJob(opts: {
  techId: string;
  jobId: string;
  filedVia: WeeklyLogItem['filedVia'];
  placement?: 'scheduled' | 'reporting';
  asLead?: boolean;
  carry?: CarriedFigures;
  /** Techs may only file a job whose record says it's completed. */
  requireCompleted?: boolean;
}): Promise<FileResult> {
  const { techId, filedVia, placement } = opts;
  const job = await loadJob(opts.jobId);
  if (!job) throw new WeeklyLogError('Job not found.', 404);
  if (job.payrollExcluded) throw new WeeklyLogError('This job is excluded from payroll.', 409);
  const isLead = opts.asLead || assignedTechOf(job) === techId;
  const isHelper = !isLead && (job.additionalTechnicianIds || []).includes(techId);
  // A helper's part is done when THEY complete it (helperProgress), even if
  // the lead hasn't closed the job yet.
  const done = job.status === 'completed' || (isHelper && job.helperProgress?.[techId]?.status === 'completed');
  if (opts.requireCompleted && !done) throw new WeeklyLogError('Only completed jobs can be filed.', 409);
  if (!isLead && !isHelper) throw new WeeklyLogError('This job is not assigned to that technician.', 403);

  // Never a second entry for the same job: a lead entry anywhere on the
  // tech's logs (any week, any status) means it's already being paid.
  const all = await logsOf(techId).get();
  const jobKeys = new Set([job.id, job.workOrderId].filter(Boolean) as string[]);
  const onLogs = all.docs.flatMap(d => ((d.data().items || []) as WeeklyLogItem[]).filter(i => jobKeys.has(i.workOrderId)));
  if (onLogs.some(i => !i.isHelper) || (isHelper && onLogs.length > 0)) {
    return { weekOf: '', placedIn: 'already_logged' };
  }
  // A lead entry replaces the tech's own $0 helper entry in open logs.
  if (isLead && onLogs.length > 0) {
    for (const d of all.docs) {
      const data = d.data() as WeeklyLog;
      if (isLockedLog(data)) continue;
      const items = data.items || [];
      if (items.some(i => jobKeys.has(i.workOrderId) && i.isHelper)) {
        await d.ref.update({ items: items.filter(i => !(jobKeys.has(i.workOrderId) && i.isHelper)) });
      }
    }
  }

  const item: WeeklyLogItem = clean({
    id: await serverDocId(ID_PREFIXES.WEEKLY_LOG_ITEM),
    workOrderId: job.id,
    jobPay: isHelper ? 0 : Number(job.pay) || 0,
    outcomeCode: null,
    isComplete: true,
    isAdminReviewed: false,
    workDate: job.scheduleDate,
    filedVia,
    ...(isHelper ? { isHelper: true, helperLeadTechId: assignedTechOf(job) || '' } : {}),
    ...(isLead && opts.carry ? clean(opts.carry) : {}),
  });

  const scheduledWeek = weekOfForScheduleDate(job.scheduleDate);
  const reportingWeek = reportingWeekOf();
  const flagged = (): WeeklyLogItem => ({
    ...item,
    assignmentWeekId: scheduledWeek,
    reportedWeekId: reportingWeek,
    wasMovedBetweenWeeks: true,
    weekOverrideReason: 'Filed in reporting week (scheduled week unavailable or overridden)',
    weekOverrideAt: new Date().toISOString(),
  });

  if (placement === 'reporting') {
    await claimAndFile(techId, reportingWeek, flagged(), true);
    return { weekOf: reportingWeek, placedIn: 'reporting_week_override' };
  }
  if ((await claimAndFile(techId, scheduledWeek, item, false)) !== 'closed') {
    return { weekOf: scheduledWeek, placedIn: 'scheduled_week' };
  }
  await claimAndFile(techId, reportingWeek, flagged(), true);
  return { weekOf: reportingWeek, placedIn: 'reporting_week_override' };
}

/** Pull a job off a tech's Draft logs (job reopened / re-completed). */
export async function removeJobFromDrafts(techId: string, jobId: string): Promise<number> {
  const snap = await logsOf(techId).where('status', '==', 'Draft').get();
  let removed = 0;
  for (const d of snap.docs) {
    await fs().runTransaction(async tx => {
      const fresh = await tx.get(d.ref);
      if (!fresh.exists || fresh.data()?.status !== 'Draft') return;
      const items = (fresh.data()?.items || []) as WeeklyLogItem[];
      const kept = items.filter(i => i.workOrderId !== jobId);
      if (kept.length !== items.length) { tx.update(d.ref, { items: kept }); removed++; }
    });
  }
  return removed;
}

// ── Edits to one of the tech's own logs ─────────────────────────────────────

type LogData = WeeklyLog & { paid?: boolean; archived?: boolean; history?: unknown[] };

/** Run `fn` on the caller's own log in a transaction; `fn` returns the patch. */
async function withOwnLog(
  logId: string,
  techId: string,
  opts: { draftOnly: boolean },
  fn: (log: LogData, ref: DocumentReference) => Record<string, any> | null,
): Promise<void> {
  if (!logId || typeof logId !== 'string' || logId.includes('/')) throw new WeeklyLogError('Invalid log.');
  const ref = fs().doc(`weeklyLogs/${logId}`);
  await fs().runTransaction(async tx => {
    const snap: DocumentSnapshot = await tx.get(ref);
    if (!snap.exists) throw new WeeklyLogError('Weekly log not found.', 404);
    const log = { ...snap.data(), id: snap.id } as LogData;
    if (log.techId !== techId) throw new WeeklyLogError('Not your weekly log.', 403);
    if (opts.draftOnly && log.status !== 'Draft') throw new WeeklyLogError('This log is no longer a Draft.', 409);
    const patch = fn(log, ref);
    if (patch) tx.update(ref, patch);
  });
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const findItem = (log: LogData, itemId: string) => {
  const item = (log.items || []).find(i => i.id === itemId);
  if (!item) throw new WeeklyLogError('That job is not on this log.', 404);
  return item;
};

export const confirmItem = (techId: string, logId: string, itemId: string) =>
  withOwnLog(logId, techId, { draftOnly: true }, log => {
    findItem(log, itemId);
    return {
      items: (log.items || []).map(i => i.id === itemId
        ? { ...i, confirmationStatus: 'confirmed', outcomeCode: 'worked_completed', disputeReason: null, disputeNotes: null }
        : i),
    };
  });

export const disputeItem = (techId: string, logId: string, itemId: string, reason: unknown, notes: unknown) =>
  withOwnLog(logId, techId, { draftOnly: true }, log => {
    findItem(log, itemId);
    const r = str(reason, 200);
    if (!r) throw new WeeklyLogError('A dispute reason is required.');
    return {
      items: (log.items || []).map(i => i.id === itemId
        ? { ...i, confirmationStatus: 'disputed', outcomeCode: 'worked_revisit', disputeReason: r, disputeNotes: str(notes, 2000) || null }
        : i),
    };
  });

/**
 * A tech adds a reimbursement to a job on their Draft. Always 'pending' —
 * payroll approves or rejects it — and attached to a job actually on the log.
 */
export async function addReimbursement(techId: string, logId: string, input: {
  itemId: unknown; amount: unknown; description: unknown; note?: unknown; receiptUrl?: unknown;
}): Promise<string> {
  const amount = Math.round((Number(input.amount) || 0) * 100) / 100;
  if (!(amount > 0) || amount > 100000) throw new WeeklyLogError('Enter a valid amount.');
  const description = str(input.description, 300);
  if (!description) throw new WeeklyLogError('A description is required.');
  const note = str(input.note, 1000);
  const receiptUrl = str(input.receiptUrl, 2000);
  if (receiptUrl && !/^https:\/\//.test(receiptUrl)) throw new WeeklyLogError('Invalid receipt link.');
  const id = `reimb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let job: WorkOrder | null = null;
  // Look the job up outside the transaction (Admin SDK reads are cheap; the
  // item check inside the transaction is what guarantees it's on the log).
  const pre = await fs().doc(`weeklyLogs/${logId}`).get();
  const preItem = ((pre.data()?.items || []) as WeeklyLogItem[]).find(i => i.id === input.itemId);
  if (preItem) job = await loadJob(preItem.workOrderId);

  await withOwnLog(logId, techId, { draftOnly: true }, log => {
    const item = findItem(log, String(input.itemId));
    const record: FinancialRecord = clean({
      id,
      techId,
      date: new Date().toISOString().split('T')[0],
      type: 'reimbursement',
      amount,
      description: note ? `${description} — ${note}` : description,
      workOrderId: item.workOrderId,
      assignmentId: (job as { assignmentId?: string } | null)?.assignmentId || item.workOrderId,
      externalWorkOrderId: job ? externalWorkOrderId(job) : undefined,
      status: 'pending',
      receiptUrl: receiptUrl || undefined,
      createdAt: new Date().toISOString(),
    } as FinancialRecord);
    return { reimbursements: [...(log.reimbursements || []), record] };
  });
  return id;
}

/** A tech may withdraw only their own still-pending reimbursements. */
export const deleteReimbursement = (techId: string, logId: string, reimbId: string) =>
  withOwnLog(logId, techId, { draftOnly: true }, log => {
    const r = (log.reimbursements || []).find(x => x.id === reimbId);
    if (!r) throw new WeeklyLogError('Reimbursement not found.', 404);
    if (r.status !== 'pending') throw new WeeklyLogError('Payroll has already reviewed this reimbursement.', 409);
    return { reimbursements: (log.reimbursements || []).filter(x => x.id !== reimbId) };
  });

/** A job missing from the log, reported by the tech. Only the tech's own
 *  description and claimed pay are kept — audit figures are payroll's. */
export async function addMissingReport(techId: string, logId: string, input: Record<string, unknown>): Promise<string> {
  const id = await serverDocId(ID_PREFIXES.MISSING_REPORT);
  const jobType = input.jobType === 'Manual' ? 'Manual' : 'Imported';
  const pay = Number(input.pay);
  const report: MissingAssignmentReport = clean({
    id,
    clientName: str(input.clientName, 200) || undefined,
    date: str(input.date, 20),
    time: str(input.time, 20) || undefined,
    location: str(input.location, 300),
    summary: str(input.summary, 2000),
    jobType,
    externalWorkOrderId: jobType === 'Imported' ? str(input.externalWorkOrderId, 50) || undefined : undefined,
    pay: Number.isFinite(pay) && pay >= 0 && pay <= 100000 ? Math.round(pay * 100) / 100 : undefined,
  });
  if (!report.date || !report.location || !report.summary) throw new WeeklyLogError('Date, location and summary are required.');
  await withOwnLog(logId, techId, { draftOnly: true }, log =>
    ({ missingAssignmentReports: [...(log.missingAssignmentReports || []), report] }));
  return id;
}

/** Submit a Draft: stamps the live settlement (job pay from the job records). */
export async function submitLog(techId: string, logId: string, submittedBy: string): Promise<number> {
  const pre = await fs().doc(`weeklyLogs/${logId}`).get();
  const jobIds = [...new Set(((pre.data()?.items || []) as WeeklyLogItem[]).map(i => i.workOrderId))];
  const jobs = await Promise.all(jobIds.map(loadJob));
  const jobsById = new Map(jobs.filter((j): j is WorkOrder => !!j).map(j => [j.id, j]));
  let total = 0;
  await withOwnLog(logId, techId, { draftOnly: true }, log => {
    if (!canSubmitWeek(log.weekOf)) {
      throw new WeeklyLogError('Current-week logs can only be submitted on Saturday or Sunday. Past weeks can be submitted anytime.', 409);
    }
    total = computeWeeklyLogSettlement(log, jobsById);
    return { status: 'Submitted', submittedAt: new Date().toISOString(), submittedBy, totalPayout: total };
  });
  return total;
}

/** Move one job (and its reimbursements) between two of the tech's Drafts. */
export async function moveItem(techId: string, fromLogId: string, toLogId: string, itemId: string, by: string): Promise<string> {
  if (fromLogId === toLogId) throw new WeeklyLogError('Pick a different log.');
  const fromRef = fs().doc(`weeklyLogs/${fromLogId}`);
  const toRef = fs().doc(`weeklyLogs/${toLogId}`);
  let destWeek = '';
  await fs().runTransaction(async tx => {
    const [a, b] = await Promise.all([tx.get(fromRef), tx.get(toRef)]);
    const from = { ...a.data(), id: a.id } as LogData;
    const to = { ...b.data(), id: b.id } as LogData;
    if (!a.exists || !b.exists) throw new WeeklyLogError('Weekly log not found.', 404);
    if (from.techId !== techId || to.techId !== techId) throw new WeeklyLogError('Not your weekly log.', 403);
    if (from.status !== 'Draft' || to.status !== 'Draft') throw new WeeklyLogError('Both logs must be Drafts.', 409);
    const item = findItem(from, itemId);
    if ((to.items || []).some(i => i.workOrderId === item.workOrderId)) throw new WeeklyLogError('This assignment already exists in the destination log.', 409);
    const moving = (from.reimbursements || []).filter(r => r.workOrderId === item.workOrderId);
    const stamp = { type: 'item_moved', workOrderId: item.workOrderId, fromWeek: from.weekOf, toWeek: to.weekOf, by, at: new Date().toISOString() };
    tx.update(fromRef, {
      items: (from.items || []).filter(i => i.id !== itemId),
      reimbursements: (from.reimbursements || []).filter(r => r.workOrderId !== item.workOrderId),
      history: [...(from.history || []), stamp],
    });
    tx.update(toRef, {
      items: [...(to.items || []), item],
      reimbursements: [...(to.reimbursements || []), ...moving],
      history: [...(to.history || []), stamp],
    });
    destWeek = to.weekOf;
  });
  return destWeek;
}

/** Self-unsubmit: Submitted → Draft while payroll hasn't acted on it. */
export const unsubmitLog = (techId: string, logId: string, by: { id: string; name: string }) =>
  withOwnLog(logId, techId, { draftOnly: false }, log => {
    if (log.status !== 'Submitted' || log.paid || log.archived) throw new WeeklyLogError('Only a Submitted log that payroll hasn\'t acted on can be unsubmitted.', 409);
    return {
      status: 'Draft',
      unsubmitRequested: false,
      unsubmitReason: null,
      unsubmitRequestedAt: null,
      history: [...(log.history || []), { type: 'unsubmit', by: by.name, byId: by.id, previousStatus: log.status, newStatus: 'Draft', at: new Date().toISOString() }],
    };
  });

/** Ask payroll to reopen a non-Draft log. */
export const requestUnsubmit = (techId: string, logId: string, reason: unknown) =>
  withOwnLog(logId, techId, { draftOnly: false }, log => {
    if (log.status === 'Draft') throw new WeeklyLogError('This log is already a Draft.', 409);
    const r = str(reason, 2000);
    if (!r) throw new WeeklyLogError('A reason is required.');
    return { unsubmitRequested: true, unsubmitReason: r, unsubmitRequestedAt: new Date().toISOString() };
  });
