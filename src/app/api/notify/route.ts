import { NextRequest, NextResponse } from 'next/server';

type NotifyPayload = {
  type: 'email' | 'sms' | 'push';
  to: string;
  title: string;
  body: string;
};

export async function POST(req: NextRequest) {
  let payload: NotifyPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type, to, title, body } = payload;
  if (!type || !to || !title || !body) {
    return NextResponse.json({ error: 'Missing required fields: type, to, title, body' }, { status: 400 });
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
