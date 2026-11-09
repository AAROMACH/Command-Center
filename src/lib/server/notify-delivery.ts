import type { Firestore } from 'firebase-admin/firestore';
import { alertOn, channelOn, resolveNotificationPrefs } from '@/lib/notification-prefs';
import { alertTypeForTitle, eventForTitle, type NotificationEvent } from '@/lib/notification-events';
import { entityHref } from '@/lib/notification-links';
import { Resend } from 'resend';
import { sendPush } from './push';
import { recordHealth } from './integration-health';
import { logEmail, type EmailLogEntry } from './email-log';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { billingContactLine, isEmail, type CommunicationsSettings } from '@/lib/communications-settings';
import { bannerHtml, emailHtml } from './email-banner';

/**
 * Server-side delivery shared by /api/notify, the CRM digest and the
 * public-quote route: email/SMS per the recipient's preferences, plus an
 * in-app record in `notifications` that the bell shows ('push'), plus a phone
 * notification to the Android app ('phone') for non-routine alerts.
 */

export type NotifyEntity = { id: string; type: 'assignment' | 'project' | 'request' | 'lead' | 'weeklyLog' | 'user' | 'message' | 'quote' | 'invoice' };

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
    const msg = (err as any).message || `Twilio ${res.status}`;
    // A bad phone number is the recipient's problem, not the connection's.
    if (res.status === 401 || res.status === 403 || res.status >= 500) await recordHealth('twilio', false, msg);
    throw new Error(msg);
  }
  await recordHealth('twilio', true);
  return 'sent';
}

/** Is email delivery configured on the server (Resend)? */
export const emailConfigured = () => !!process.env.RESEND_API_KEY;

/**
 * Who an email comes from, by kind. All send from the one verified Resend
 * domain (mail.aaromach.com); Reply-To sends answers to a real inbox, since
 * Resend can't receive. Each is an App Hosting setting, with these defaults.
 *  - billing:       invoices and quotes            → replies to support@aaromach.com
 *  - support:       client requests / tickets      → replies to support@aaromach.com
 *  - notifications: staff alerts, digests, tests   → no reply address
 */
export type EmailKind = 'billing' | 'support' | 'notifications';

/** Where Resend says an email is: sent → delivered, or bounced / complained / delayed. */
export async function emailDeliveryStatus(emailId: string): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !emailId) return null;
  const r = await fetch(`https://api.resend.com/emails/${encodeURIComponent(emailId)}`, { headers: { Authorization: `Bearer ${apiKey}` } }).catch(() => null);
  if (!r?.ok) return null;
  const d = await r.json().catch(() => ({})) as { last_event?: string };
  return d.last_event || null;
}
export const EMAIL_SENDERS: Record<EmailKind, { fromEnv: string; from: string; replyToEnv?: string; replyTo?: string }> = {
  billing: { fromEnv: 'EMAIL_FROM_BILLING', from: 'AAROMACH Billing <billing@mail.aaromach.com>', replyToEnv: 'EMAIL_REPLY_TO_BILLING', replyTo: 'support@aaromach.com' },
  support: { fromEnv: 'EMAIL_FROM_SUPPORT', from: 'AAROMACH Support <support@mail.aaromach.com>', replyToEnv: 'EMAIL_REPLY_TO_SUPPORT', replyTo: 'support@aaromach.com' },
  notifications: { fromEnv: 'EMAIL_FROM_NOTIFICATIONS', from: 'AAROMACH <notifications@mail.aaromach.com>' },
};
export function emailSender(kind: EmailKind, settings?: CommunicationsSettings | null): { from: string; replyTo: string | null } {
  const s = EMAIL_SENDERS[kind];
  const fromSettings = kind === 'billing' ? settings?.billingReplyTo : kind === 'support' ? settings?.supportReplyTo : undefined;
  return {
    from: process.env[s.fromEnv] || s.from,
    replyTo: (fromSettings && isEmail(fromSettings) ? fromSettings.trim() : null) || (s.replyToEnv && process.env[s.replyToEnv]) || s.replyTo || null,
  };
}

// Settings → Communications, cached briefly so a burst of sends reads it once.
let commsCache: { at: number; value: CommunicationsSettings | null } | null = null;
export async function communicationsSettings(): Promise<CommunicationsSettings | null> {
  if (commsCache && Date.now() - commsCache.at < 30_000) return commsCache.value;
  try {
    const snap = await getFirestore(adminApp).doc('adminConfig/communications').get();
    commsCache = { at: Date.now(), value: (snap.data() as CommunicationsSettings) || null };
  } catch (e) {
    console.warn('[notify] could not read communications settings', e);
    commsCache = { at: Date.now(), value: null };
  }
  return commsCache.value;
}

/**
 * Send one email through Resend. 'skipped' when RESEND_API_KEY isn't set.
 * Network errors, 429 and 5xx are retried with backoff (429 honors
 * retry-after); other errors throw. `idempotencyKey` (e.g. `invoice/<id>/<n>`)
 * keeps a retried request from sending twice.
 */
export async function sendEmail(to: string | string[], subject: string, body: string, opts: {
  idempotencyKey?: string; kind?: EmailKind; onSent?: (emailId: string | null) => void;
  /** For the email log: what it's about and who sent it. */
  related?: EmailLogEntry['related']; sentBy?: string | null;
  /** Send replies to this address instead of the configured one (e.g. the person sending). */
  replyTo?: string | null;
  /** Files to attach (base64 content), e.g. the quote/invoice PDF. */
  attachments?: { filename: string; content: string }[];
  /** Gets the email log entry's id. */
  onLogged?: (logId: string | null) => void;
} = {}): Promise<'sent' | 'skipped'> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[notify] RESEND_API_KEY not set — email skipped');
    return 'skipped';
  }
  const resend = new Resend(apiKey);
  const settings = await communicationsSettings();
  const configured = emailSender(opts.kind || 'notifications', settings);
  const sender = opts.replyTo ? { ...configured, replyTo: opts.replyTo } : configured;
  const contact = opts.kind === 'billing' ? billingContactLine(settings) : null;
  if (contact) body = `${body.trimEnd()}\n\n${contact}`;
  const email = {
    from: sender.from,
    ...(sender.replyTo ? { replyTo: sender.replyTo } : {}),
    to: Array.isArray(to) ? to : [to],
    subject,
    text: body,
    ...(opts.attachments?.length ? { attachments: opts.attachments.map(a => ({ filename: a.filename, content: Buffer.from(a.content, 'base64') })) } : {}),
    html: emailHtml(body, bannerHtml(opts.kind || 'notifications', settings, sender.replyTo)),
  };
  const logBase = {
    to: Array.isArray(to) ? to.join(", ") : to, from: sender.from, replyTo: sender.replyTo, subject, text: body, kind: opts.kind || 'notifications' as EmailKind,
    related: opts.related || null, sentBy: opts.sentBy || null,
  };
  let lastError = 'Resend request failed';
  let lastStatus: number | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    // The SDK returns { data, error } and doesn't throw.
    const { data, error, headers } = await resend.emails.send(email, opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey.slice(0, 256) } : undefined);
    if (!error) {
      console.info(`[notify] email sent via Resend id=${data?.id || '?'}`);
      opts.onSent?.(data?.id || null);
      await recordHealth('resend', true);
      opts.onLogged?.(await logEmail({ ...logBase, status: 'sent', error: null, emailId: data?.id || null }));
      return 'sent';
    }
    lastError = `Resend ${error.statusCode ?? ''} ${error.name}: ${error.message}`.replace(/\s+/g, ' ');
    // Retry network errors (no status), 429 and 5xx; other 4xx won't succeed.
    const status = error.statusCode;
    lastStatus = status ?? null;
    if (status != null && status !== 429 && status < 500) break;
    const retryAfter = Number(headers?.['retry-after']);
    await new Promise(r => setTimeout(r, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt));
  }
  // Only connection-level failures count against the integration (bad key,
  // unverified domain, Resend down) — not one bad recipient address.
  if (lastStatus == null || lastStatus === 401 || lastStatus === 403 || lastStatus >= 500) await recordHealth('resend', false, lastError);
  opts.onLogged?.(await logEmail({ ...logBase, status: 'failed', error: lastError, emailId: null }));
  throw new Error(lastError);
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
  const alertId = alertTypeForTitle(msg.title)?.id;

  await Promise.all(recipients.filter(r => r.data.accountStatus !== 'inactive').map(async ({ id, data }) => {
    const prefs = resolveNotificationPrefs(data.notificationPreferences);
    // Routine activity stays in the bell; otherwise each channel follows the
    // person's Settings grid for this kind of alert.
    const on = (ch: 'phone' | 'email' | 'sms') => !msg.inAppOnly && alertOn(prefs, alertId) && channelOn(prefs, event, ch);
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
        // Clients hear from Support (they can reply); staff alerts are no-reply.
        if (type === 'email') status = (await sendEmail(data.email, subject, msg.body, { kind: (msg.portal || portalForRecipient(data, entity)) === 'client' ? 'support' : 'notifications', related: entity ? { type: entity.type, id: entity.id } : null, sentBy: msg.sentBy })) === 'sent' ? 'sent' : 'pending';
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
