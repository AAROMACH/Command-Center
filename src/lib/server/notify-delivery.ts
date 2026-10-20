import type { Firestore } from 'firebase-admin/firestore';
import { channelOn, resolveNotificationPrefs } from '@/lib/notification-prefs';
import { eventForTitle, type NotificationEvent } from '@/lib/notification-events';
import { entityHref } from '@/lib/notification-links';
import { sendPush } from './push';

/**
 * Server-side delivery shared by /api/notify, the CRM digest and the
 * public-quote route: email/SMS per the recipient's preferences, plus an
 * in-app record in `notifications` that the bell shows ('push'), plus a phone
 * notification to the Android app ('phone') for non-routine alerts.
 */

export type NotifyEntity = { id: string; type: 'assignment' | 'project' | 'request' | 'lead' | 'weeklyLog' | 'user' | 'message' };

/**
 * The portal a notification belongs to. A person with several portals (a
 * super admin who also works jobs) sees each alert only in the portal it is
 * about — admin oversight in the Admin Portal, their own jobs in the Tech
 * Portal — so the two never mix in one bell.
 */
export type NotifyPortal = 'admin' | 'tech' | 'client' | 'sales';
export const NOTIFY_PORTALS: NotifyPortal[] = ['admin', 'tech', 'client', 'sales'];

const rolesOf = (u: Record<string, any>): string[] => [
  ...(Array.isArray(u.roles) ? u.roles : []),
  ...(typeof u.role === 'string' && u.role ? [u.role] : []),
];

/**
 * Best guess for a direct alert sent without an explicit portal: client
 * accounts get client alerts, a deal's owner gets it in Sales (or the
 * Admin CRM if they have no sales role), anyone who works in the field gets
 * it in the Tech Portal, everyone else in the Admin Portal.
 */
export function portalForRecipient(data: Record<string, any>, entity?: NotifyEntity): NotifyPortal {
  const roles = rolesOf(data);
  if (roles.includes('client')) return 'client';
  if (entity?.type === 'lead') return roles.includes('sales') ? 'sales' : 'admin';
  if (roles.some(r => ['field_technician', 'project_lead', 'project_manager'].includes(r))) return 'tech';
  if (roles.includes('sales')) return 'sales';
  return 'admin';
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export async function sendSms(to: string, text: string): Promise<'sent' | 'skipped'> {
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

export async function sendEmail(to: string, subject: string, body: string): Promise<'sent' | 'skipped'> {
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


export async function deliverNotification(
  fs: Firestore,
  recipients: { id: string; data: Record<string, any> }[],
  msg: { title: string; body: string; entity?: NotifyEntity; sentBy: string; inAppOnly?: boolean; portal?: NotifyPortal; event?: NotificationEvent },
): Promise<number> {
  const subject = `[AAROMACH] ${msg.title.toUpperCase()}`;
  const { entity } = msg;
  let sent = 0;
  const event = msg.event || eventForTitle(msg.title);

  await Promise.all(recipients.filter(r => r.data.accountStatus !== 'inactive').map(async ({ id, data }) => {
    const prefs = resolveNotificationPrefs(data.notificationPreferences);
    // Routine activity stays in the bell; otherwise each channel follows the
    // person's Settings grid for this kind of alert.
    const on = (ch: 'phone' | 'email' | 'sms') => !msg.inAppOnly && channelOn(prefs, event, ch);
    const channels: ('email' | 'sms' | 'push')[] = [];
    // Routine activity (a task checked off, a check-in) is an in-app record
    // only — texting every update would bury the alerts that matter.
    if (on('email') && data.email) channels.push('email');
    if (on('sms') && data.phone) channels.push('sms');
    // The bell always gets it — every phone, email or text alert is also
    // there to find later.
    channels.push('push');

    // Phone notification (Android app) — its own switch, separate from the bell.
    if (on('phone')) {
      try {
        const portal = msg.portal || portalForRecipient(data, entity);
        if (await sendPush(fs, id, { title: msg.title, body: msg.body, url: entity ? entityHref(portal, entity.type, entity.id) || undefined : undefined }) > 0) sent++;
      } catch (err) {
        console.error(`[notify] phone push to ${id} failed:`, err);
      }
    }

    await Promise.all(channels.map(async type => {
      let status: 'sent' | 'failed' | 'pending' = 'pending';
      try {
        if (type === 'email') status = (await sendEmail(data.email, subject, msg.body)) === 'sent' ? 'sent' : 'pending';
        else if (type === 'sms') status = (await sendSms(data.phone, `${subject}\n\n${msg.body}`)) === 'sent' ? 'sent' : 'pending';

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
        body: msg.body,
        timestamp: new Date().toISOString(),
        status,
        sentBy: msg.sentBy,
        portal: msg.portal || portalForRecipient(data, entity),
        event,
        ...(entity ? { relatedEntityId: entity.id, relatedEntityType: entity.type } : {}),
      });
    }));
  }));
  return sent;
}

const ADMIN_AUDIENCE = ['super_admin', 'dispatch_admin'];
const PAYROLL_AUDIENCE = ['super_admin', 'payroll_admin'];

/** Looks up recipients by id or by the ops-admin audience. */
export async function usersById(fs: Firestore, ids: string[]) {
  const snaps = await Promise.all([...new Set(ids.filter(Boolean))].map(id => fs.collection('users').doc(id).get()));
  return snaps.filter(s => s.exists).map(s => ({ id: s.id, data: s.data() || {} }));
}

export async function opsAdmins(fs: Firestore) {
  const snap = await fs.collection('users').where('roles', 'array-contains-any', ADMIN_AUDIENCE).get();
  return snap.docs.map(d => ({ id: d.id, data: d.data() }));
}

/** Payroll audience (disputes, submitted logs, reimbursements). */
export async function payrollAdmins(fs: Firestore) {
  const snap = await fs.collection('users').where('roles', 'array-contains-any', PAYROLL_AUDIENCE).get();
  return snap.docs.map(d => ({ id: d.id, data: d.data() }));
}
