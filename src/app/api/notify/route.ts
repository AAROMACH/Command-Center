import { NextRequest, NextResponse } from 'next/server';

// Install these when keys are ready: npm install twilio @sendgrid/mail
// For now the route logs and returns success so the client path is wired correctly.

type NotifyPayload = {
  type: 'email' | 'sms' | 'push';
  to: string;        // phone number (E.164) for SMS, email address for email
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

      // Dynamic import — install `twilio` package to enable
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const twilio = require('twilio');
      const client = twilio(sid, token);
      await client.messages.create({ body: `${title}\n\n${body}`, from, to });
      return NextResponse.json({ status: 'sent', channel: 'sms' });
    }

    if (type === 'email') {
      const apiKey = process.env.SENDGRID_API_KEY;
      const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@aaromach.com';

      if (!apiKey) {
        console.warn('[notify] SendGrid env vars not set — email skipped');
        return NextResponse.json({ status: 'skipped', reason: 'SendGrid not configured' });
      }

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(apiKey);
      await sgMail.send({ to, from: fromEmail, subject: title, text: body, html: `<p>${body.replace(/\n/g, '<br/>')}</p>` });
      return NextResponse.json({ status: 'sent', channel: 'email' });
    }

    // push — not yet wired to FCM; fall through
    return NextResponse.json({ status: 'skipped', reason: 'Push not yet configured' });
  } catch (err: any) {
    console.error('[notify] Delivery error:', err);
    return NextResponse.json({ error: err.message || 'Delivery failed' }, { status: 500 });
  }
}
