'use client';

import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { WeeklyLog, WorkOrder, WeeklyLogItem } from '@/lib/types';
import {
  fileCompletedAssignment,
  fileCompletedJob,
  isCompletionFilingInFlight,
  isJobLogged,
  loggedWorkOrderIds,
} from '@/lib/weekly-log';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import { jobTechId, jobDateTimeValue, isArchivedJob } from '@/lib/jobs';
import { completionEvent } from '@/lib/weekly-log-audit';

/**
 * How far back the sync will auto-file a lead tech's own completed job that
 * never reached a log. Older gaps are left to payroll's Unlogged audit
 * (Payroll Audit → Unlogged), where an admin files them deliberately — an old
 * job may have been settled outside the app, and silently dropping it into
 * this week's log invites a double payment.
 */
export const AUTO_HEAL_LOOKBACK_DAYS = 30;

/**
 * Jobs the sync must leave to an admin (Payroll Audit → Unlogged) even inside
 * the window, because the tech's own logs can't tell the whole story:
 *  - reassigned jobs — the entry may still sit on the previous tech's log
 *    (swaps before the log-move existed, or a locked log), which this tech's
 *    sync can't see; filing here would pay it twice.
 *  - force-completed without filing — an admin's explicit "don't pay
 *    through a log", recorded before payrollExcluded existed.
 */
function needsAdminDecision(job: WorkOrder): boolean {
  return (job.history || []).some(h => {
    const type = (h?.type || '') as string;
    const details = (h?.details || '').toString();
    return type === 'tech_swap' || type === 'tech_swapped' || /^Reassigned from/i.test(details)
      || (/^Force-completed/i.test(details) && !/filed to weekly log/i.test(details));
  });
}

function withinAutoHealWindow(job: WorkOrder): boolean {
  const ts = jobDateTimeValue(job.scheduleDate, null);
  if (!ts) return false;
  return Date.now() - ts <= AUTO_HEAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Keeps a tech's weekly logs in step with the jobs they've completed. Mount
 * on every tech page they're likely to land on (dashboard, logs).
 *
 *  - Helper jobs (additionalTechnicianIds): fanned into the helper's own log
 *    at $0 for payroll to price separately.
 *  - Lead jobs: a job the tech (or an admin) explicitly marked complete that
 *    isn't in any of the tech's logs (the
 *    "which week?" prompt was abandoned, the filing write failed after the
 *    status write landed, an admin marked it completed) is filed with auto
 *    placement and tagged filedVia 'auto_sync'.
 *
 * Dedupe/idempotency: nothing runs until the tech's logs have loaded once
 * (an empty pre-load list would make every job look unlogged); a ref guards
 * the window before a new item shows up in the logs snapshot; jobs mid-
 * completion on another screen are skipped via isCompletionFilingInFlight.
 */
export function useHelperLogSync(techId: string | null) {
  const [helperJobs, setHelperJobs] = useState<WorkOrder[]>([]);
  const [leadAssignments, setLeadAssignments] = useState<WorkOrder[]>([]);
  const [leadPoolJobs, setLeadPoolJobs] = useState<WorkOrder[]>([]);
  const [ownLogs, setOwnLogs] = useState<WeeklyLog[] | null>(null);
  const filingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!techId) { setHelperJobs([]); setLeadAssignments([]); setLeadPoolJobs([]); setOwnLogs(null); return; }
    const unsubHelper = onSnapshot(
      query(collection(db, 'assignments'), where('additionalTechnicianIds', 'array-contains', techId)),
      (snap) => setHelperJobs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder))),
      () => setHelperJobs([]),
    );
    const unsubLead = onSnapshot(
      query(collection(db, 'assignments'), where('techId', '==', techId)),
      (snap) => setLeadAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder))),
      () => setLeadAssignments([]),
    );
    const unsubPool = onSnapshot(
      query(collection(db, 'workOrders'), where('assignedTechnicianId', '==', techId)),
      (snap) => setLeadPoolJobs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder))),
      () => setLeadPoolJobs([]),
    );
    const unsubLogs = onSnapshot(
      query(collection(db, 'weeklyLogs'), where('techId', '==', techId)),
      (snap) => setOwnLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog))),
    );
    return () => { unsubHelper(); unsubLead(); unsubPool(); unsubLogs(); };
  }, [techId]);

  useEffect(() => {
    if (!techId || ownLogs === null) return;
    const logged = loggedWorkOrderIds(ownLogs);
    const needsFiling = (j: WorkOrder) =>
      j.status === 'completed' &&
      !isArchivedJob(j) &&
      !j.payrollExcluded &&
      !isJobLogged(j, logged) &&
      !filingRef.current.has(j.id) &&
      !isCompletionFilingInFlight(j.id);

    const isLead = (j: WorkOrder) => jobTechId(j) === techId || j.techId === techId;

    helperJobs.filter(j => !isLead(j) && needsFiling(j)).forEach(async (j) => {
      filingRef.current.add(j.id);
      try {
        const itemId = await createDocId(ID_PREFIXES.WEEKLY_LOG_ITEM);
        const item: WeeklyLogItem = {
          id: itemId,
          workOrderId: j.id,
          jobPay: 0,
          outcomeCode: null,
          isComplete: true,
          isAdminReviewed: false,
          isHelper: true,
          helperLeadTechId: jobTechId(j) || '',
          workDate: j.scheduleDate,
        };
        await fileCompletedAssignment({
          techId,
          scheduleDate: j.scheduleDate,
          item,
          makeLogId: () => createDocId(ID_PREFIXES.WEEKLY_LOG),
        });
      } catch {
        filingRef.current.delete(j.id); // allow a retry next snapshot
      }
    });

    const leadById = new Map<string, WorkOrder>();
    [...leadPoolJobs, ...leadAssignments].forEach(j => leadById.set(j.id, j));
    [...leadById.values()]
      .filter(j => isLead(j) && withinAutoHealWindow(j) && !!completionEvent(j) && !needsAdminDecision(j) && needsFiling(j))
      .forEach(async (j) => {
        filingRef.current.add(j.id);
        try {
          await fileCompletedJob({ techId, job: j, filedVia: 'auto_sync' });
        } catch {
          filingRef.current.delete(j.id);
        }
      });
  }, [techId, helperJobs, leadAssignments, leadPoolJobs, ownLogs]);

  return { helperJobs };
}
