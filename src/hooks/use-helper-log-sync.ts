'use client';

import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { WeeklyLog, WorkOrder, WeeklyLogItem } from '@/lib/types';
import { fileCompletedAssignment } from '@/lib/weekly-log';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import { jobTechId } from '@/lib/jobs';

/**
 * Fans a completed job a tech HELPED on (additionalTechnicianIds) into their
 * own weekly log, so it shows up there and reaches payroll alongside the lead
 * tech's entry — jobPay starts at $0 for payroll to price the helper
 * separately. Mount this on every tech page a helper is likely to land on
 * (dashboard, logs) so the job gets filed regardless of which page they open
 * first, rather than only firing when they specifically visit Logs.
 * Dedupe/idempotency: a ref guards the window before the new item appears in
 * the own-logs snapshot, and existing items are checked by workOrderId first.
 */
export function useHelperLogSync(techId: string | null) {
  const [helperJobs, setHelperJobs] = useState<WorkOrder[]>([]);
  const [ownLogs, setOwnLogs] = useState<WeeklyLog[]>([]);
  const filingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!techId) { setHelperJobs([]); setOwnLogs([]); return; }
    const unsubHelper = onSnapshot(
      query(collection(db, 'assignments'), where('additionalTechnicianIds', 'array-contains', techId)),
      (snap) => setHelperJobs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder))),
      () => setHelperJobs([]),
    );
    const unsubLogs = onSnapshot(
      query(collection(db, 'weeklyLogs'), where('techId', '==', techId)),
      (snap) => setOwnLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog))),
    );
    return () => { unsubHelper(); unsubLogs(); };
  }, [techId]);

  useEffect(() => {
    if (!techId || helperJobs.length === 0) return;
    const existingWoIds = new Set<string>();
    ownLogs.forEach(l => (l.items || []).forEach(i => existingWoIds.add(i.workOrderId)));
    const toFile = helperJobs.filter(j =>
      j.status === 'completed' &&
      !existingWoIds.has(j.id) &&
      !filingRef.current.has(j.id)
    );
    toFile.forEach(async (j) => {
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
  }, [techId, helperJobs, ownLogs]);

  return { helperJobs };
}
