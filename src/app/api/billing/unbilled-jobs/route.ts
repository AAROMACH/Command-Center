import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { hasPermission, isAdmin, isClient, type RoleLike } from '@/lib/permissions';
import { invoicedJobIds, isBillableJob, minutesOnSiteByJob } from '@/lib/job-invoicing';
import type { Invoice, Technician, TripLog, WorkOrder } from '@/lib/types';

/**
 * Bill completed jobs (components/job-invoice → BillJobsDialog): completed,
 * not-yet-invoiced manual jobs with time on site, plus the client list.
 *
 * Sales people with "Create invoices" (admin.crm.create_invoice) can't read
 * jobs, trip logs or users directly — jobs carry tech pay — so this returns
 * only what billing needs: job title, date, client, location and minutes on
 * site. No pay, no tech names.
 */

export type UnbilledJob = {
  id: string; title: string; description: string; scheduleDate: string; location: string;
  clientName: string; clientId: string | null; minutes: number;
  /** The job's client is a staff member (tech/admin) — fix it before billing. */
  staffClient: string | null;
};
export type BillingClient = { id: string; name: string; clientCompany: string; email: string; phone: string };

const norm = (s?: string | null) => (s || '').trim().toLowerCase();

export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let uid: string;
  try { uid = (await getAuth(adminApp).verifyIdToken(token)).uid; }
  catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  const fs = getFirestore(adminApp);
  const me = await fs.collection('users').doc(uid).get();
  const caller = { ...(me.data() || {}), id: uid } as Technician & RoleLike;
  if (!me.exists || !(isAdmin(caller) || hasPermission(caller, 'admin.crm.create_invoice'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [jobsSnap, invSnap, usersSnap] = await Promise.all([
    fs.collection('assignments').where('status', '==', 'completed').get(),
    fs.collection('invoices').get(),
    fs.collection('users').get(),
  ]);
  const billed = invoicedJobIds(invSnap.docs.map(d => ({ ...d.data(), id: d.id } as Invoice)));
  const jobs = jobsSnap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder))
    .filter(j => isBillableJob(j) && !billed.has(j.id) && j.clientName);

  // Time on site from the jobs' trip logs (in chunks: 'in' takes 30 values).
  // Trips name their job as assignmentId or workOrderId (older ones).
  const tripsById = new Map<string, TripLog>();
  const ids = jobs.map(j => j.id);
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const snaps = await Promise.all(['assignmentId', 'workOrderId'].map(f => fs.collection('tripLogs').where(f, 'in', chunk).get()));
    snaps.forEach(s => s.docs.forEach(d => tripsById.set(d.id, { ...d.data(), id: d.id } as TripLog)));
  }
  const trips = [...tripsById.values()];
  const minutes = minutesOnSiteByJob(trips);

  const users = usersSnap.docs.map(d => ({ ...d.data(), id: d.id } as Technician & { accountStatus?: string }));
  const clientUsers = users.filter(u => isClient(u) && u.accountStatus !== 'inactive');
  const staffAsClient = (j: WorkOrder): string | null => {
    const cid = (j as { clientId?: string | null }).clientId;
    const byId = cid ? users.find(u => u.id === cid) : undefined;
    if (byId) return isClient(byId) ? null : byId.name || 'staff';
    const name = norm(j.clientName);
    if (!name || clientUsers.some(u => norm(u.clientCompany) === name || norm(u.name) === name)) return null;
    return users.find(u => !isClient(u) && norm(u.name) === name)?.name || null;
  };

  const out: UnbilledJob[] = jobs.map(j => ({
    id: j.id, title: j.title || '', description: j.description || '', scheduleDate: j.scheduleDate || '',
    location: j.location || '', clientName: j.clientName, clientId: (j as { clientId?: string | null }).clientId || null,
    minutes: minutes.get(j.id) || 0, staffClient: staffAsClient(j),
  }));
  const clients: BillingClient[] = clientUsers
    .map(u => ({ id: u.id, name: u.name || '', clientCompany: u.clientCompany || '', email: u.email || '', phone: u.phone || '' }))
    .filter(c => c.clientCompany || c.name)
    .sort((a, b) => (a.clientCompany || a.name).localeCompare(b.clientCompany || b.name));
  return NextResponse.json({ jobs: out, clients });
}
