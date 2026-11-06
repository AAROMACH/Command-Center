import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { getSubroles } from '@/lib/permissions';
import { getConnection, qboConfigured, qboEnv } from '@/lib/server/quickbooks';

/**
 * Settings → Integrations (Super Admins): which outside services this
 * deployment has keys for. Only "set / not set" and non-secret details —
 * never a key's value.
 */
export type IntegrationStatus = {
  id: string; name: string; purpose: string;
  status: 'ready' | 'partial' | 'missing' | 'unused';
  detail: string; vars: { name: string; set: boolean; secret: boolean }[];
};

const set = (n: string) => !!process.env[n];

export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  try {
    const uid = (await getAuth(adminApp).verifyIdToken(token)).uid;
    const u = (await getFirestore(adminApp).doc(`users/${uid}`).get()).data();
    if (!u || !getSubroles(u as any).includes('super_admin')) throw new Error();
  } catch { return NextResponse.json({ error: 'Super Admins only' }, { status: 403 }); }

  const v = (name: string, secret = true) => ({ name, set: set(name), secret });
  const all = (vars: { set: boolean }[]) => vars.every(x => x.set) ? 'ready' : vars.some(x => x.set) ? 'partial' : 'missing';
  const qbo = await getConnection().catch(() => null);

  const list: IntegrationStatus[] = [
    (() => { const vars = [v('RESEND_API_KEY'), v('RESEND_FROM_EMAIL', false)]; return {
      id: 'resend', name: 'Resend (email)', purpose: 'Invoice emails, notifications, CRM digest',
      status: set('RESEND_API_KEY') ? 'ready' : 'missing',
      detail: `Sends from ${process.env.RESEND_FROM_EMAIL || 'AAROMACH <invoices@billing.aaromach.com>'}`, vars } as IntegrationStatus; })(),
    (() => { const vars = [v('QBO_CLIENT_ID', false), v('QBO_CLIENT_SECRET'), v('QBO_ENV', false), v('QBO_REDIRECT_URI', false)]; return {
      id: 'quickbooks', name: 'QuickBooks Online', purpose: 'Customers, invoices and Pay now links; payments back to the app',
      status: !qboConfigured() ? 'missing' : qbo ? 'ready' : 'partial',
      detail: !qboConfigured() ? 'Keys not set' : qbo ? `Connected to ${qbo.companyName || 'company ' + qbo.realmId} (${qbo.env})` : `Keys set (${qboEnv()}) — not connected yet`, vars } as IntegrationStatus; })(),
    (() => { const vars = [v('TWILIO_ACCOUNT_SID', false), v('TWILIO_AUTH_TOKEN'), v('TWILIO_FROM_NUMBER', false)]; return {
      id: 'twilio', name: 'Twilio (text messages)', purpose: 'SMS notifications', status: all(vars), detail: set('TWILIO_FROM_NUMBER') ? `From ${process.env.TWILIO_FROM_NUMBER}` : 'Texts are skipped until set', vars } as IntegrationStatus; })(),
    (() => { const vars = [v('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', false)]; return {
      id: 'maps', name: 'Google Maps Platform', purpose: 'Address lookup, job maps and routing', status: all(vars), detail: 'Public key — restrict it to app.aaromach.com in Google Cloud', vars } as IntegrationStatus; })(),
    (() => { const vars = [v('NEXT_PUBLIC_FIREBASE_VAPID_KEY', false)]; return {
      id: 'push', name: 'Web push (Firebase Messaging)', purpose: 'Phone / browser notifications', status: all(vars), detail: 'Set in apphosting.yaml', vars } as IntegrationStatus; })(),
    (() => { const vars = [v('CRM_DIGEST_SECRET'), v('CRM_DIGEST_TZ', false)]; return {
      id: 'digest', name: 'CRM daily digest', purpose: 'Scheduled sales digest email', status: set('CRM_DIGEST_SECRET') ? 'ready' : 'missing', detail: 'The scheduler calls the digest with this secret', vars } as IntegrationStatus; })(),
    ...(['GEMINI_API_KEY', 'GOOGLE_GENAI_API_KEY', 'RECAPTCHA_SECRET_KEY'].filter(set).map(n => ({
      id: n.toLowerCase(), name: n, purpose: 'Set in hosting, but nothing in the app uses it', status: 'unused' as const,
      detail: 'Safe to remove, or keep for a planned feature — store it as a secret either way', vars: [v(n)],
    }))),
  ];
  return NextResponse.json({ integrations: list });
}
