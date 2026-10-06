import type { Firestore } from 'firebase-admin/firestore';

/**
 * Server-side delivery shared by /api/notify, the CRM digest and the
 * public-quote route: email/SMS per the recipient's preferences, plus an
 * in-app record in `notifications` that the bell shows.
 */

export type NotifyEntity = { id: string; type: 'assignment' | 'project' | 'request' | 'lead' };

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
  msg: { title: string; body: string; entity?: NotifyEntity; sentBy: string },
): Promise<number> {
  const subject = `[AAROMACH] ${msg.title.toUpperCase()}`;
  const { entity } = msg;
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
        ...(entity ? { relatedEntityId: entity.id, relatedEntityType: entity.type } : {}),
      });
    }));
  }));
  return sent;
}

const ADMIN_AUDIENCE = ['super_admin', 'dispatch_admin'];

/** Looks up recipients by id or by the ops-admin audience. */
export async function usersById(fs: Firestore, ids: string[]) {
  const snaps = await Promise.all([...new Set(ids.filter(Boolean))].map(id => fs.collection('users').doc(id).get()));
  return snaps.filter(s => s.exists).map(s => ({ id: s.id, data: s.data() || {} }));
}

export async function opsAdmins(fs: Firestore) {
  const snap = await fs.collection('users').where('roles', 'array-contains-any', ADMIN_AUDIENCE).get();
  return snap.docs.map(d => ({ id: d.id, data: d.data() }));
}
