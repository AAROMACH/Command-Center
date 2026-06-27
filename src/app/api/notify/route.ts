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

      // webpackIgnore keeps this out of the bundle; package must be installed at runtime
      const twilio = (await import(/* webpackIgnore: true */ 'twilio' as any)).default;
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

      const sgMail = (await import(/* webpackIgnore: true */ '@sendgrid/mail' as any)).default;
      sgMail.setApiKey(apiKey);
      await sgMail.send({ to, from: fromEmail, subject: title, text: body, html: `<p>${body.replace(/\n/g, '<br/>')}</p>` });
      return NextResponse.json({ status: 'sent', channel: 'email' });
    }

    return NextResponse.json({ status: 'skipped', reason: 'Push not yet configured' });
  } catch (err: any) {
    console.error('[notify] Delivery error:', err);
    return NextResponse.json({ error: err.message || 'Delivery failed' }, { status: 500 });
  }
}
