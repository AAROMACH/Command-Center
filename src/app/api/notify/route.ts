import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';

type NotifyPayload = {
  type: 'email' | 'sms' | 'push';
  userId: string;
  title: string;
  body: string;
};

export async function POST(req: NextRequest) {
  // Require a real signed-in caller — without this, this route is an open
  // email/SMS relay anyone on the internet can fire from the company's
  // verified sending identity to any destination.
  const authHeader = req.headers.get('authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await getAuth(adminApp).verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: NotifyPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type, userId, title, body } = payload;
  if (!type || !userId || !title || !body) {
    return NextResponse.json({ error: 'Missing required fields: type, userId, title, body' }, { status: 400 });
  }

  // Resolve the real delivery address server-side from the target user's own
  // record — never trust a client-supplied destination string, or an
  // authenticated caller could redirect delivery to an arbitrary address.
  const userSnap = await getFirestore(adminApp).collection('users').doc(userId).get();
  if (!userSnap.exists) {
    return NextResponse.json({ error: 'Unknown user' }, { status: 404 });
  }
  const userRecord = userSnap.data() || {};
  const to = type === 'sms' ? userRecord.phone : userRecord.email;
  if (!to) {
    return NextResponse.json({ status: 'skipped', reason: 'No delivery address on file' });
  }

  try {
    if (type === 'sms') {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_FROM_NUMBER;

      if (!sid || !token || !from) {
        console.warn('[notify] Twilio env vars not set — SMS skipped');
        return NextResponse.json({ status: 'skipped', reason: 'Twilio not configured' });
      }

      // Call Twilio REST API directly — no SDK package required
      const credentials = Buffer.from(`${sid}:${token}`).toString('base64');
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: to, From: from, Body: `${title}\n\n${body}` }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message || `Twilio ${res.status}`);
      }
      return NextResponse.json({ status: 'sent', channel: 'sms' });
    }

    if (type === 'email') {
      const apiKey = process.env.SENDGRID_API_KEY;
      const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@aaromach.com';

      if (!apiKey) {
        console.warn('[notify] SendGrid env vars not set — email skipped');
        return NextResponse.json({ status: 'skipped', reason: 'SendGrid not configured' });
      }

      // Call SendGrid REST API directly — no SDK package required
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: fromEmail },
          subject: title,
          content: [
            { type: 'text/plain', value: body },
            { type: 'text/html', value: `<p>${body.replace(/\n/g, '<br/>')}</p>` },
          ],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(JSON.stringify((err as any).errors || res.status));
      }
      return NextResponse.json({ status: 'sent', channel: 'email' });
    }

    return NextResponse.json({ status: 'skipped', reason: 'Push not yet configured' });
  } catch (err: any) {
    console.error('[notify] Delivery error:', err);
    return NextResponse.json({ error: err.message || 'Delivery failed' }, { status: 500 });
  }
}
