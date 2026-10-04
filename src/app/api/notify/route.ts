import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';

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
  entity?: { id: string; type: 'assignment' | 'project' | 'request' };
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

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

async function sendSms(to: string, text: string): Promise<'sent' | 'skipped'> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    console.warn('[notify] Twilio env vars not set — SMS skipped');
    return 'skipped';
  }
  const credentials = Buffer.from(`${sid}:${token}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: from, Body: text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `Twilio ${res.status}`);
  }
  return 'sent';
}

async function sendEmail(to: string, subject: string, body: string): Promise<'sent' | 'skipped'> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@aaromach.com';
  if (!apiKey) {
    console.warn('[notify] SendGrid env vars not set — email skipped');
    return 'skipped';
  }
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail },
      subject,
      content: [
        { type: 'text/plain', value: body },
        { type: 'text/html', value: `<p>${escapeHtml(body).replace(/\n/g, '<br/>')}</p>` },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(JSON.stringify((err as any).errors || res.status));
  }
  return 'sent';
}

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

  const subject = `[AAROMACH] ${title.toUpperCase()}`;
  const entity = payload.entity && typeof payload.entity.id === 'string' ? payload.entity : undefined;
  let sent = 0;

  await Promise.all(recipients.filter(r => r.data.accountStatus !== 'inactive').map(async ({ id, data }) => {
    const prefs = data.notificationPreferences || { email: true, sms: true, push: true };
    const channels: ('email' | 'sms' | 'push')[] = [];
    if (prefs.email && data.email) channels.push('email');
    if (prefs.sms && data.phone) channels.push('sms');
    if (prefs.push) channels.push('push');
    // Always leave an in-app record, even if they've opted out of every channel.
    if (channels.length === 0) channels.push('push');

    await Promise.all(channels.map(async type => {
      let status: 'sent' | 'failed' | 'pending' = 'pending';
      try {
        if (type === 'email') status = (await sendEmail(data.email, subject, body)) === 'sent' ? 'sent' : 'pending';
        else if (type === 'sms') status = (await sendSms(data.phone, `${subject}\n\n${body}`)) === 'sent' ? 'sent' : 'pending';
      } catch (err) {
        console.error(`[notify] ${type} delivery to ${id} failed:`, err);
        status = 'failed';
      }
      if (status === 'sent') sent++;
      const ref = fs.collection('notifications').doc();
      await ref.set({
        id: ref.id,
        userId: id,
        type,
        title: subject,
        body,
        timestamp: new Date().toISOString(),
        status,
        sentBy: callerId,
        ...(entity ? { relatedEntityId: entity.id, relatedEntityType: entity.type } : {}),
      });
    }));
  }));

  return NextResponse.json({ status: sent > 0 ? 'sent' : 'recorded', recipients: recipients.length });
}
