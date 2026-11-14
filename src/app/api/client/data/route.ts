import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Query } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { isClient } from '@/lib/permissions';
import { sharedJob, sharedProject } from '@/lib/server/shared-job';
import type { Technician } from '@/lib/types';

/**
 * A client's jobs (pool + dispatched) and projects, without pay, cost or
 * payroll fields (lib/server/shared-job). Client pages read these here instead
 * of the documents, which the rules no longer let clients read directly.
 * Same scope the rules used: their own clientId, or their company name.
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
  if (!me || !isClient(me)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const company = (me.clientCompany || '').trim();

  const run = async (queries: Query[]) => {
    const snaps = await Promise.all(queries.map(q => q.get()));
    const byId = new Map<string, Record<string, unknown>>();
    for (const s of snaps) for (const d of s.docs) byId.set(d.id, d.data());
    return byId;
  };
  const jobQueries = (['assignments', 'workOrders'] as const).flatMap(c => [
    db.collection(c).where('clientId', '==', uid),
    ...(company ? [db.collection(c).where('clientName', '==', company)] : []),
  ]);
  const projectQueries = [
    db.collection('projects').where('clientId', '==', uid),
    ...(company ? [db.collection('projects').where('client', '==', company)] : []),
  ];
  const [jobs, projects] = await Promise.all([run(jobQueries), run(projectQueries)]);
  return NextResponse.json({
    jobs: [...jobs].map(([id, d]) => sharedJob(id, d)),
    projects: [...projects].map(([id, d]) => sharedProject(id, d)),
  });
}
