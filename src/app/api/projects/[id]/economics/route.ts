import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { isAdmin } from '@/lib/permissions';
import { computeProjectEconomics } from '@/lib/project-economics';
import type { Project, ProjectDailyLog, Expense, Invoice } from '@/lib/types';

/**
 * Project Economics for the project manager assigned to this project (team
 * role "Project Manager"). They can't read invoices, expenses or pay rates
 * from the browser, so the totals are computed here — individual pay rates
 * never leave the server. Admins may call it too.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  const [projectSnap, userSnap] = await Promise.all([db.doc(`projects/${id}`).get(), db.doc(`users/${uid}`).get()]);
  if (!projectSnap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const project = { ...projectSnap.data(), id } as Project;
  const assignedManager = (project.team || []).some(m => m.techId === uid && m.role === 'Project Manager');
  if (!assignedManager && !isAdmin(userSnap.data() as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [logsSnap, expSnap, invSnap] = await Promise.all([
    db.collection('projectDailyLogs').where('projectId', '==', id).get(),
    db.collection('expenses').where('projectId', '==', id).get(),
    db.collection('invoices').where('projectId', '==', id).get(),
  ]);
  const logs = logsSnap.docs.map(d => d.data() as ProjectDailyLog);
  const techIds = [...new Set(logs.map(l => l.techId).filter(Boolean))];
  const rates = new Map<string, number | undefined>();
  if (techIds.length) {
    const users = await db.getAll(...techIds.map(t => db.doc(`users/${t}`)));
    users.forEach(u => rates.set(u.id, u.data()?.hourlyRate));
  }

  const economics = computeProjectEconomics(
    project, logs, techId => rates.get(techId),
    expSnap.docs.map(d => d.data() as Expense),
    invSnap.docs.map(d => d.data() as Invoice),
  );
  return NextResponse.json({ economics });
}
