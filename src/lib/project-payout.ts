import { collection, doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import { createDocId } from './generateId';
import { ID_PREFIXES } from './constants';

/** Throws if the tech's week is already approved — call BEFORE creating payout
 *  records, so a refused week never leaves payouts that aren't on any log. */
export async function assertWeekOpen(techId: string, weekOf: string): Promise<void> {
  const logs = (await getDocs(query(collection(db, 'weeklyLogs'), where('techId', '==', techId))))
    .docs.map(d => d.data() as any).filter(l => l.weekOf === weekOf && !l.ignoredDuplicate);
  const open = logs.some(l => l.status === 'Draft' || l.status === 'Submitted');
  if (!open && logs.some(l => l.status === 'Approved')) {
    throw new Error(`The week of ${weekOf} is already approved for this tech. Reopen it in Payroll audit first.`);
  }
}

/**
 * Puts a project payout on a tech's weekly log for `weekOf` (MM-dd-yyyy, the
 * Monday) — the week the hours were worked — creating a Draft log for that
 * week if there isn't one. Refuses an already-approved week: payroll has to
 * reopen it first, so a paid stub never changes underneath anyone.
 */
export async function addPayoutToWeeklyLog(techId: string, payoutId: string, p: {
  projectId: string; amount: number; notes?: string; weekOf: string; workDate: string;
}): Promise<string> {
  const logs = (await getDocs(query(collection(db, 'weeklyLogs'), where('techId', '==', techId))))
    .docs.map(d => ({ ...(d.data() as any), id: d.id }))
    .filter(l => l.weekOf === p.weekOf && !l.ignoredDuplicate);
  const target = logs.find(l => l.status === 'Draft') || logs.find(l => l.status === 'Submitted');
  if (!target && logs.some(l => l.status === 'Approved')) {
    throw new Error(`The week of ${p.weekOf} is already approved for this tech. Reopen it in Payroll audit first.`);
  }
  const item = {
    id: await createDocId(ID_PREFIXES.WEEKLY_LOG_ITEM),
    workOrderId: p.projectId,
    source: 'project_payout' as const,
    projectId: p.projectId,
    projectPayoutId: payoutId,
    workDate: p.workDate,
    jobPay: p.amount,
    payoutAmount: p.amount,
    reimbursementAmount: 0,
    payNotes: p.notes || '',
    confirmationStatus: null,
    isComplete: false,
    isAdminReviewed: false,
  };
  let logId: string;
  if (target) {
    logId = target.id;
    await updateDoc(doc(db, 'weeklyLogs', logId), { items: [...(target.items || []), item] });
  } else {
    logId = await createDocId(ID_PREFIXES.WEEKLY_LOG);
    await setDoc(doc(db, 'weeklyLogs', logId), { id: logId, techId, weekOf: p.weekOf, status: 'Draft', items: [item], reimbursements: [] });
  }
  await updateDoc(doc(db, 'projectPayouts', payoutId), { weeklyLogId: logId, weekOf: p.weekOf });
  return logId;
}
