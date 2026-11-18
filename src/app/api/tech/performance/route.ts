import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { isTech } from '@/lib/permissions';
import { perfLines } from '@/lib/fn-performance';
import type { FnRow } from '@/lib/fn-reconcile';
import type { Technician, WorkOrder } from '@/lib/types';

/**
 * The signed-in tech's own pay & hours from saved Field Nation reports
 * (Tech → Insights). Only jobs the app has them as the lead tech on — never
 * anyone else's rows, and never the FN report itself (admin-only).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let uid: string;
  try {
    uid = (await getAuth(adminApp).verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const db = getFirestore(adminApp);
  const me = (await db.collection('users').doc(uid).get()).data() as Technician | undefined;
  if (!me || !isTech(me)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [asg, pool, fn] = await Promise.all([
    db.collection('assignments').where('assignedTechnicianId', '==', uid).get(),
    db.collection('workOrders').where('assignedTechnicianId', '==', uid).get(),
    db.collection('fnReportRows').get(),
  ]);
  const jobs = [...asg.docs, ...pool.docs].map(d => ({ ...d.data(), id: d.id } as WorkOrder));
  const lines = perfLines(fn.docs.map(d => d.data() as FnRow), jobs, [{ ...me, id: uid }])
    // Only rows matched to one of their own jobs.
    .filter(l => l.matched)
    .map(({ date, hours, pay }) => ({ date, hours, pay }));
  return NextResponse.json({ lines });
}
