import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { deliverNotification } from '@/lib/server/notify-delivery';

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
 */

type Audience = 'admins' | 'payroll_admins';
type NotifyPayload = {
  userId?: string;
  audience?: Audience;
  title: string;
  body: string;
  entity?: { id: string; type: 'assignment' | 'project' | 'request' | 'lead' };
};

const ADMIN_ROLES = ['super_admin', 'dispatch_admin', 'payroll_admin', 'project_manager'];
const AUDIENCE_ROLES: Record<Audience, string[]> = {
  admins: ['super_admin', 'dispatch_admin'],
  payroll_admins: ['super_admin', 'payroll_admin'],
};

const rolesOf = (u: Record<string, any>): string[] => [
  ...(Array.isArray(u.roles) ? u.roles : []),
  ...(typeof u.role === 'string' && u.role ? [u.role] : []),
];
const isAdminUser = (u: Record<string, any>) => rolesOf(u).some(r => r === 'admin' || ADMIN_ROLES.includes(r));
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

  const title = typeof payload.title === 'string' ? payload.title.trim().slice(0, 200) : '';
  const body = typeof payload.body === 'string' ? payload.body.trim().slice(0, 4000) : '';
  const { userId, audience } = payload;
  if (!title || !body || (!userId && !audience) || (audience && !(audience in AUDIENCE_ROLES))) {
    return NextResponse.json({ error: 'Need title, body and a userId or audience' }, { status: 400 });
  }

  const fs = getFirestore(adminApp);
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
    recipients = snap.docs.map(d => ({ id: d.id, data: d.data() }));
  } else {
    const snap = await fs.collection('users').doc(String(userId)).get();
    if (!snap.exists) return NextResponse.json({ error: 'Unknown user' }, { status: 404 });
    const data = snap.data() || {};
    if (!callerIsAdmin && snap.id !== callerId && !isAdminUser(data)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    recipients = [{ id: snap.id, data }];
  }

  const entity = payload.entity && typeof payload.entity.id === 'string' ? payload.entity : undefined;
  const sent = await deliverNotification(fs, recipients, { title, body, entity, sentBy: callerId });

  return NextResponse.json({ status: sent > 0 ? 'sent' : 'recorded', recipients: recipients.length });
}
