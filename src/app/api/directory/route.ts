import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { isAdmin, isClient, type RoleLike } from '@/lib/permissions';

/**
 * Public staff/contact directory for portals that can't read `users`.
 *
 * firestore.rules let a user read only their own `users` doc (admins read
 * all), and those docs hold pay, payout, address and emergency-contact data,
 * so they stay closed. Messaging contacts, sender names and project leads
 * come from here instead: name, preferred name, avatar, roles and company —
 * computed live from `users` with the Admin SDK, so there's no second copy to
 * keep in sync.
 *
 * Who sees whom:
 *  - admins: everyone
 *  - techs / other staff: every active account
 *  - clients: admins, people in their own company, and the techs on their
 *    projects or jobs
 */

export type DirectoryEntry = {
  id: string;
  name: string;
  preferredName?: string;
  avatarUrl?: string;
  roles: string[];
  role?: string;
  clientCompany?: string;
};

const ADMIN_ROLES = ['super_admin', 'dispatch_admin', 'payroll_admin', 'project_manager', 'admin'];

type UserDoc = RoleLike & {
  name?: string; preferredName?: string; avatarUrl?: string; photoURL?: string; clientCompany?: string;
  accountStatus?: string; status?: string; approvalStatus?: string;
};

const isActiveDoc = (u: UserDoc) =>
  u.accountStatus !== 'inactive' && u.status !== 'inactive' && u.approvalStatus !== 'pending' && u.approvalStatus !== 'denied';

const toEntry = (id: string, u: UserDoc): DirectoryEntry => {
  const e: DirectoryEntry = {
    id,
    name: u.name || 'Unnamed',
    roles: Array.isArray(u.roles) ? u.roles : [],
  };
  if (u.preferredName) e.preferredName = u.preferredName;
  if (u.avatarUrl || u.photoURL) e.avatarUrl = u.avatarUrl || u.photoURL;
  if (typeof u.role === 'string' && u.role) e.role = u.role;
  if (u.clientCompany) e.clientCompany = u.clientCompany;
  return e;
};

const rolesOf = (u: UserDoc) => [...(Array.isArray(u.roles) ? u.roles : []), ...(u.role ? [u.role] : [])];

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

  const fs = getFirestore(adminApp);
  const callerSnap = await fs.collection('users').doc(uid).get();
  const caller = (callerSnap.data() || {}) as UserDoc;
  if (!callerSnap.exists || !isActiveDoc(caller) || rolesOf(caller).length === 0) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const all = (await fs.collection('users').get()).docs
    .map(d => ({ id: d.id, data: d.data() as UserDoc }))
    .filter(u => isActiveDoc(u.data));

  let visible = all;
  if (!isAdmin(caller) && isClient(caller)) {
    const company = caller.clientCompany || '';
    const crew = new Set<string>();
    const addJobTechs = (j: Record<string, any>) => {
      [j.techId, j.assignedTechnicianId, ...(j.assignedTechIds || []), ...(j.additionalTechnicianIds || [])]
        .forEach(t => { if (typeof t === 'string' && t) crew.add(t); });
    };
    const addProjectTechs = (p: Record<string, any>) => {
      [p.projectLeadId, ...(p.assignedTechnicianIds || []), ...((p.team || []).map((m: any) => m?.techId))]
        .forEach(t => { if (typeof t === 'string' && t) crew.add(t); });
    };
    const queries = [
      fs.collection('projects').where('clientId', '==', uid).get().then(s => s.docs.forEach(d => addProjectTechs(d.data()))),
      fs.collection('assignments').where('clientId', '==', uid).get().then(s => s.docs.forEach(d => addJobTechs(d.data()))),
    ];
    if (company) {
      queries.push(
        fs.collection('projects').where('client', '==', company).get().then(s => s.docs.forEach(d => addProjectTechs(d.data()))),
        fs.collection('assignments').where('clientName', '==', company).get().then(s => s.docs.forEach(d => addJobTechs(d.data()))),
      );
    }
    await Promise.all(queries);
    visible = all.filter(u =>
      u.id === uid
      || rolesOf(u.data).some(r => ADMIN_ROLES.includes(r))
      || (company !== '' && u.data.clientCompany === company)
      || crew.has(u.id));
  }

  const entries = visible.map(u => toEntry(u.id, u.data)).sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ entries }, { headers: { 'Cache-Control': 'private, no-store' } });
}
