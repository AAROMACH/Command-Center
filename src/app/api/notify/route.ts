import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { deliverNotification, opsAdmins, NOTIFY_PORTALS, type NotifyEntity, type NotifyPortal } from '@/lib/server/notify-delivery';

/**
 * Sends a notification (in-app record + email/SMS per the recipient's
 * preferences) on behalf of a signed-in user.
 *
 * Recipients are resolved HERE, with the Admin SDK — techs can't read other
 * users' records under the Firestore rules, so a tech's alert to admins used
 * to fail at the client-side lookup and never arrive.
 *
 * Who may notify whom:
 *  - admins: anyone (`userId`) or an `audience`
 *  - any other approved, active account: the admin audiences, an admin
 *    `userId`, or themselves — never an arbitrary user (this route sends from
 *    the company's verified email/SMS identity, so it must not be a relay).
 *  - a brand-new account still waiting for approval: only `kind:
 *    'access_request'`, once — the text is composed here, not by the caller.
 *
 * Every record carries a `portal` so someone with more than one portal sees
 * admin alerts in the Admin Portal and their own job alerts in the Tech
 * Portal. Admin audiences are 'admin'; Project Managers work from the Tech
 * Portal, so theirs are 'tech'; a direct alert uses the caller's `portal` or
 * is inferred from the recipient's roles.
 */

type Audience = 'admins' | 'payroll_admins' | 'project_managers';
type NotifyPayload = {
  userId?: string;
  audience?: Audience;
  title: string;
  body: string;
  entity?: NotifyEntity;
  /** Routine activity: in-app record only, no email/SMS. */
  inAppOnly?: boolean;
  /** Which portal's bell shows it (direct alerts only; audiences are fixed). */
  portal?: NotifyPortal;
  /** A server-composed alert. */
  kind?: 'access_request';
};

const AUDIENCE_PORTAL: Record<Audience, NotifyPortal> = { admins: 'admin', payroll_admins: 'admin', project_managers: 'tech' };
const ENTITY_TYPES = new Set<NotifyEntity['type']>(['assignment', 'project', 'request', 'lead', 'weeklyLog', 'user']);

const ADMIN_ROLES = ['super_admin', 'dispatch_admin', 'payroll_admin'];
const AUDIENCE_ROLES: Record<Audience, string[]> = {
  admins: ['super_admin', 'dispatch_admin'],
  payroll_admins: ['super_admin', 'payroll_admin'],
  // Project activity (crew check-ins, tasks, documents, status) — PMs run
  // every project from the Tech Portal.
  project_managers: ['project_manager'],
};

const rolesOf = (u: Record<string, any>): string[] => [
  ...(Array.isArray(u.roles) ? u.roles : []),
  ...(typeof u.role === 'string' && u.role ? [u.role] : []),
];
const isAdminUser = (u: Record<string, any>) => rolesOf(u).some(r => r === 'admin' || ADMIN_ROLES.includes(r));
const TECH_ROLES = ['field_technician', 'project_lead', 'project_manager'];
const LEAD_TEAM_ROLES = ['Project Lead', 'Project Manager'];

/**
 * Project crew alerts from non-admins: a Project Manager may notify any tech;
 * a project's named lead may notify that project's crew about it.
 */
async function mayNotifyCrew(
  fs: FirebaseFirestore.Firestore, callerId: string, caller: Record<string, any>,
  recipientId: string, recipient: Record<string, any>, entity?: NotifyPayload['entity'],
): Promise<boolean> {
  if (!rolesOf(recipient).some(r => TECH_ROLES.includes(r))) return false;
  if (rolesOf(caller).includes('project_manager')) return true;
  if (entity?.type !== 'project' || typeof entity.id !== 'string' || !rolesOf(caller).includes('project_lead')) return false;
  const p = (await fs.collection('projects').doc(entity.id).get()).data();
  if (!p) return false;
  const team: { techId?: string; role?: string }[] = Array.isArray(p.team) ? p.team : [];
  const leads = p.projectLeadId === callerId || team.some(m => m.techId === callerId && LEAD_TEAM_ROLES.includes(m.role || ''));
  const onCrew = team.some(m => m.techId === recipientId) || (p.assignedTechnicianIds || []).includes(recipientId);
  return leads && onCrew;
}

const isActive = (u: Record<string, any>) => u.accountStatus !== 'inactive' && u.approvalStatus !== 'pending' && u.approvalStatus !== 'denied';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let callerId: string;
  try {
    callerId = (await getAuth(adminApp).verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: NotifyPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const fs = getFirestore(adminApp);

  // A new sign-up tells the ops admins once. Pending accounts can't do
  // anything else here.
  if (payload.kind === 'access_request') {
    const ref = fs.collection('users').doc(callerId);
    const snap = await ref.get();
    const u = snap.data() || {};
    if (!snap.exists || u.approvalStatus !== 'pending' || u.accessRequestNotifiedAt) {
      return NextResponse.json({ status: 'skipped' });
    }
    await ref.update({ accessRequestNotifiedAt: new Date().toISOString() });
    const who = [u.name, u.email].filter(Boolean).join(' · ') || 'Someone';
    await deliverNotification(fs, await opsAdmins(fs), {
      title: 'Access request',
      body: `${who} signed up and is waiting for approval. Approve or deny them in the Directory.`,
      entity: { id: callerId, type: 'user' }, sentBy: callerId, portal: 'admin',
    });
    return NextResponse.json({ status: 'sent' });
  }

  const title = typeof payload.title === 'string' ? payload.title.trim().slice(0, 200) : '';
  const body = typeof payload.body === 'string' ? payload.body.trim().slice(0, 4000) : '';
  const { userId, audience } = payload;
  if (!title || !body || (!userId && !audience) || (audience && !(audience in AUDIENCE_ROLES))) {
    return NextResponse.json({ error: 'Need title, body and a userId or audience' }, { status: 400 });
  }

  const callerSnap = await fs.collection('users').doc(callerId).get();
  const caller = callerSnap.data() || {};
  if (!callerSnap.exists || !isActive(caller) || rolesOf(caller).length === 0) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const callerIsAdmin = isAdminUser(caller);

  // Resolve recipients.
  let recipients: { id: string; data: Record<string, any> }[];
  if (audience) {
    const snap = await fs.collection('users').where('roles', 'array-contains-any', AUDIENCE_ROLES[audience]).get();
    // Never notify someone about their own action.
    recipients = snap.docs.map(d => ({ id: d.id, data: d.data() })).filter(r => r.id !== callerId);
  } else {
    // Never notify someone about their own action (an admin who assigns a
    // job to themselves already knows).
    if (String(userId) === callerId) return NextResponse.json({ status: 'skipped', recipients: 0 });
    const snap = await fs.collection('users').doc(String(userId)).get();
    if (!snap.exists) return NextResponse.json({ error: 'Unknown user' }, { status: 404 });
    const data = snap.data() || {};
    if (!callerIsAdmin && snap.id !== callerId && !isAdminUser(data)
        && !(await mayNotifyCrew(fs, callerId, caller, snap.id, data, payload.entity))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    recipients = [{ id: snap.id, data }];
  }

  const entity = payload.entity && typeof payload.entity.id === 'string' && ENTITY_TYPES.has(payload.entity.type)
    ? { id: payload.entity.id.slice(0, 200), type: payload.entity.type } : undefined;
  // Audiences have a fixed portal; a direct alert may name one, otherwise
  // it is inferred per recipient in deliverNotification.
  const portal: NotifyPortal | undefined = audience ? AUDIENCE_PORTAL[audience]
    : payload.portal && NOTIFY_PORTALS.includes(payload.portal) ? payload.portal : undefined;
  const sent = await deliverNotification(fs, recipients, { title, body, entity, sentBy: callerId, inAppOnly: payload.inAppOnly === true, portal });

  return NextResponse.json({ status: sent > 0 ? 'sent' : 'recorded', recipients: recipients.length });
}
