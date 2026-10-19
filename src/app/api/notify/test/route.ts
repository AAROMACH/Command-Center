import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { portalForRecipient, sendEmail, sendSms } from '@/lib/server/notify-delivery';
import { sendPush } from '@/lib/server/push';

/**
 * "Send me a test" in Settings: one alert to the caller on every channel,
 * reporting what happened on each — so a channel that isn't set up (no
 * SendGrid/Twilio keys, no phone registered) says so instead of failing
 * silently. Ignores the person's settings (it's a test). Only ever sends to the caller.
 */
type Result = { channel: string; ok: boolean; detail: string };

export async function POST(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  let uid: string;
  try { uid = (await getAuth(adminApp).verifyIdToken(h.replace(/^Bearer /, ''))).uid; }
  catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  const fs = getFirestore(adminApp);
  const snap = await fs.collection('users').doc(uid).get();
  if (!snap.exists) return NextResponse.json({ error: 'No user profile' }, { status: 404 });
  const data = snap.data() || {};
  const title = 'Test notification';
  const body = 'This is a test from Command Center. If you got this, this channel works.';
  const results: Result[] = [];

  const run = async (channel: string, on: boolean, missing: string | null, send: () => Promise<string>) => {
    if (!on) return results.push({ channel, ok: false, detail: 'Switched off in your settings.' });
    if (missing) return results.push({ channel, ok: false, detail: missing });
    try { results.push({ channel, ok: true, detail: await send() }); }
    catch (e: any) { results.push({ channel, ok: false, detail: `Failed: ${String(e?.message || e).slice(0, 200)}` }); }
  };

  await run('Email', true, !data.email ? 'No email address on your profile.' : null, async () => {
    if ((await sendEmail(data.email, `[AAROMACH] ${title.toUpperCase()}`, body)) === 'skipped') throw new Error('Email isn’t set up on the server (SENDGRID_API_KEY missing).');
    return `Sent to ${data.email}.`;
  });
  await run('Text message', true, !data.phone ? 'No phone number on your profile.' : null, async () => {
    if ((await sendSms(data.phone, `[AAROMACH] ${title}\n\n${body}`)) === 'skipped') throw new Error('Texting isn’t set up on the server (Twilio keys missing).');
    return `Sent to ${data.phone}.`;
  });
  await run('Phone notifications', true, null, async () => {
    const devices = (await fs.collection('users').doc(uid).collection('pushTokens').get()).size;
    if (!devices) throw new Error('No phone registered. Open the Android app, sign in and allow notifications.');
    const n = await sendPush(fs, uid, { title, body, url: '/' });
    if (!n) throw new Error(`${devices} phone${devices === 1 ? '' : 's'} registered, but none accepted the notification.`);
    return `Delivered to ${n} phone${n === 1 ? '' : 's'}.`;
  });
  await run('In-app', true, null, async () => {
    const ref = fs.collection('notifications').doc();
    await ref.set({ id: ref.id, userId: uid, type: 'push', title: `[AAROMACH] ${title.toUpperCase()}`, body, timestamp: new Date().toISOString(),
      status: 'sent', sentBy: uid, portal: portalForRecipient(data), event: 'other' });
    return 'Added to your bell.';
  });

  return NextResponse.json({ results });
}
