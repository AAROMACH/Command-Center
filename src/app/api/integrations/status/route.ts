import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { getSubroles } from '@/lib/permissions';
import { getConnection, qboConfigured, qboEnv, qboGet } from '@/lib/server/quickbooks';
import { readHealth, recordHealth, type HealthEntry } from '@/lib/server/integration-health';
import { EMAIL_SENDERS, emailSender, type EmailKind } from '@/lib/server/notify-delivery';

/**
 * Settings → Integrations (Super Admins). A service shows Connected only when
 * a live test passes right now — never just because a key is set:
 *  - Resend: the key is accepted by Resend and the sending domain is verified
 *  - QuickBooks: the saved connection answers a company-info call
 *  - Twilio: the account answers and is active
 * Services with no safe test say "Set — not tested". The last real use
 * (an email, a text, a QuickBooks call — lib/server/integration-health) is
 * shown too, so a failure in day-to-day use is visible here.
 * Never returns a key's value.
 */

export type IntegrationState = 'connected' | 'failed' | 'missing' | 'untested' | 'unused';
export type IntegrationStatus = {
  id: string; name: string; purpose: string; state: IntegrationState;
  detail: string; lastUse: HealthEntry | null; checkedAt: string;
  vars: { name: string; set: boolean; secret: boolean }[];
};

const set = (n: string) => !!process.env[n];
type Check = { ok: boolean; detail: string };

async function checkResend(): Promise<Check> {
  // Every sender (billing, support, notifications) must be on a verified domain.
  const senders = (Object.keys(EMAIL_SENDERS) as EmailKind[]).map(k => ({ kind: k, ...emailSender(k) }));
  const domains = [...new Set(senders.map(x => (x.from.match(/@([^>\s]+)/)?.[1] || '').toLowerCase()).filter(Boolean))];
  const summary = senders.map(x => `${x.kind}: ${x.from}${x.replyTo ? ` (replies → ${x.replyTo})` : ''}`).join(' · ');
  const r = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
  const d = await r.json().catch(() => ({})) as any;
  // A sending-only key can't list domains — Resend saying so proves the key is real.
  if (!r.ok && d?.name === 'restricted_api_key') return { ok: true, detail: `Key accepted (sending-only, so domains can't be listed). ${summary}` };
  if (!r.ok) return { ok: false, detail: `Resend rejected the key: ${d?.message || r.status}` };
  for (const dom of domains) {
    const found = (d.data || []).find((x: any) => String(x.name).toLowerCase() === dom);
    if (!found) return { ok: false, detail: `${dom} isn't a domain on this Resend account — add and verify it. ${summary}` };
    if (found.status !== 'verified') return { ok: false, detail: `${dom} is "${found.status}" in Resend — finish its DNS records. ${summary}` };
  }
  return { ok: true, detail: `Key accepted; ${domains.join(', ')} verified. ${summary}` };
}

async function checkQuickBooks(): Promise<Check> {
  const c = await getConnection();
  if (!c) return { ok: false, detail: `Keys set (${qboEnv()}) — not connected yet. Use Connect to QuickBooks.` };
  const info = await qboGet(`/companyinfo/${c.realmId}`);
  const days = Math.floor((c.refreshExpiresAt - Date.now()) / 86400000);
  const name = info?.CompanyInfo?.CompanyName || c.companyName || c.realmId;
  return { ok: true, detail: `Answering as ${name} (${c.env === 'production' ? 'live books' : 'sandbox'})${days < 14 ? ` — reconnect within ${days} days` : ''}` };
}

async function checkTwilio(): Promise<Check> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}` },
  });
  const d = await r.json().catch(() => ({})) as any;
  if (!r.ok) return { ok: false, detail: `Twilio rejected the credentials: ${d?.message || r.status}` };
  if (d.status !== 'active') return { ok: false, detail: `Twilio account is ${d.status}` };
  return { ok: true, detail: `Account active. Texts from ${process.env.TWILIO_FROM_NUMBER}` };
}

/** Runs a live check, records it, and turns errors into a failed result. */
async function live(id: string, fn: () => Promise<Check>): Promise<Check> {
  let res: Check;
  try { res = await fn(); } catch (e: any) { res = { ok: false, detail: String(e?.message || e).slice(0, 300) }; }
  await recordHealth(id, res.ok, res.ok ? null : res.detail, 'check');
  return res;
}

export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  try {
    const uid = (await getAuth(adminApp).verifyIdToken(token)).uid;
    const u = (await getFirestore(adminApp).doc(`users/${uid}`).get()).data();
    if (!u || !getSubroles(u as any).includes('super_admin')) throw new Error();
  } catch { return NextResponse.json({ error: 'Super Admins only' }, { status: 403 }); }

  const before = await readHealth(); // last real use, before this check overwrites it
  const now = new Date().toISOString();
  const v = (name: string, secret = true) => ({ name, set: set(name), secret });
  const lastUse = (id: string) => (before[id]?.source === 'use' ? before[id] : null);

  const [resend, qbo, twilio] = await Promise.all([
    set('RESEND_API_KEY') ? live('resend', checkResend) : null,
    qboConfigured() ? live('quickbooks', checkQuickBooks) : null,
    set('TWILIO_ACCOUNT_SID') && set('TWILIO_AUTH_TOKEN') && set('TWILIO_FROM_NUMBER') ? live('twilio', checkTwilio) : null,
  ]);
  const st = (c: Check | null): IntegrationState => (c == null ? 'missing' : c.ok ? 'connected' : 'failed');

  const list: IntegrationStatus[] = [
    { id: 'resend', name: 'Resend (email)', purpose: 'Invoice emails, notifications, CRM digest', state: st(resend),
      detail: resend?.detail || 'RESEND_API_KEY not set — emails are skipped', lastUse: lastUse('resend'), checkedAt: now,
      vars: [v('RESEND_API_KEY'), ...(Object.values(EMAIL_SENDERS).flatMap(x => [x.fromEnv, x.replyToEnv].filter(Boolean) as string[]).map(n => v(n, false)))] },
    { id: 'quickbooks', name: 'QuickBooks Online', purpose: 'Customers, invoices and Pay now links; payments back to the app', state: st(qbo),
      detail: qbo?.detail || 'QBO_CLIENT_ID / QBO_CLIENT_SECRET not set', lastUse: lastUse('quickbooks'), checkedAt: now,
      vars: [v('QBO_CLIENT_ID', false), v('QBO_CLIENT_SECRET'), v('QBO_ENV', false), v('QBO_REDIRECT_URI', false)] },
    { id: 'twilio', name: 'Twilio (text messages)', purpose: 'SMS notifications', state: st(twilio),
      detail: twilio?.detail || 'Not set up — texts are skipped', lastUse: lastUse('twilio'), checkedAt: now,
      vars: [v('TWILIO_ACCOUNT_SID', false), v('TWILIO_AUTH_TOKEN'), v('TWILIO_FROM_NUMBER', false)] },
    // Tested in the browser (it's a browser key, locked to the site's address).
    { id: 'maps', name: 'Google Maps Platform', purpose: 'Address lookup, job maps and routing', state: set('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY') ? 'untested' : 'missing',
      detail: set('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY') ? 'Testing from your browser…' : 'Not set — maps and address lookup are off', lastUse: null, checkedAt: now,
      vars: [v('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', false)] },
    { id: 'push', name: 'Web push (Firebase Messaging)', purpose: 'Phone / browser notifications', state: set('NEXT_PUBLIC_FIREBASE_VAPID_KEY') ? 'untested' : 'missing',
      detail: set('NEXT_PUBLIC_FIREBASE_VAPID_KEY') ? 'Key set — not tested here; turn on notifications on a phone to confirm' : 'Not set — push notifications are off', lastUse: null, checkedAt: now,
      vars: [v('NEXT_PUBLIC_FIREBASE_VAPID_KEY', false)] },
    { id: 'digest', name: 'CRM daily digest', purpose: 'Scheduled sales digest email', state: set('CRM_DIGEST_SECRET') ? 'untested' : 'missing',
      detail: set('CRM_DIGEST_SECRET') ? 'Secret set — not tested here; it runs when the scheduler calls it' : 'Not set — the scheduled digest can’t run', lastUse: null, checkedAt: now,
      vars: [v('CRM_DIGEST_SECRET'), v('CRM_DIGEST_TZ', false)] },
    ...(['GEMINI_API_KEY', 'GOOGLE_GENAI_API_KEY', 'RECAPTCHA_SECRET_KEY'].filter(set).map(n => ({
      id: n.toLowerCase(), name: n, purpose: 'Set in hosting, but nothing in the app uses it', state: 'unused' as const,
      detail: 'Safe to remove, or keep for a planned feature — store it as a secret either way', lastUse: null, checkedAt: now, vars: [v(n)],
    }))),
  ];
  return NextResponse.json({ integrations: list });
}
