import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';

/**
 * One-time backfill: copies each job's `source` onto the weekly-log items
 * filed before items started recording it (`jobSource`). Without it, a tech's
 * Earnings page can't tell a Field Nation job from a manual one when the job
 * doc isn't readable, and shows the full work-order pay instead of their
 * net share. Only fills missing values, so it is safe to run more than once.
 * Super admins only.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let uid: string;
  try {
    uid = (await getAuth(adminApp).verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const fs = getFirestore(adminApp);
  const caller = (await fs.collection('users').doc(uid).get()).data() || {};
  const roles: string[] = Array.isArray(caller.roles) ? caller.roles : [];
  if (!roles.includes('super_admin') && !['super_admin', 'admin'].includes(caller.role || '')) {
    return NextResponse.json({ error: 'Only a super admin can run this.' }, { status: 403 });
  }

  const [logs, assignments, workOrders] = await Promise.all([
    fs.collection('weeklyLogs').get(),
    fs.collection('assignments').get(),
    fs.collection('workOrders').get(),
  ]);
  const sourceById = new Map<string, string>();
  for (const d of [...workOrders.docs, ...assignments.docs]) {
    const src = d.data().source;
    if (typeof src === 'string' && src) sourceById.set(d.id, src);
  }

  let logsUpdated = 0, itemsUpdated = 0, itemsUnresolved = 0;
  let batch = fs.batch(), pending = 0;
  for (const d of logs.docs) {
    const items: Record<string, any>[] = Array.isArray(d.data().items) ? d.data().items : [];
    let changed = false;
    const next = items.map(item => {
      if (item.jobSource || !item.workOrderId) return item;
      const src = sourceById.get(item.workOrderId);
      if (!src) { itemsUnresolved++; return item; }
      changed = true; itemsUpdated++;
      return { ...item, jobSource: src };
    });
    if (!changed) continue;
    batch.update(d.ref, { items: next });
    logsUpdated++;
    if (++pending === 400) { await batch.commit(); batch = fs.batch(); pending = 0; }
  }
  if (pending) await batch.commit();

  return NextResponse.json({ logsUpdated, itemsUpdated, itemsUnresolved });
}
