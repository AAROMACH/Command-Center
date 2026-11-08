import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { sendEmail } from './notify-delivery';

/**
 * Emails to outside customers who used a website/app form (clientRequests):
 *  - a confirmation right after they submit
 *  - one "we haven't forgotten you" follow-up if it's still waiting on review
 *    after FOLLOW_UP_BUSINESS_DAYS business days
 * Both go out as 'support' emails, so replies land in the support inbox
 * (Settings → Communications → Support replies).
 */
export const PUBLIC_REQUEST_SOURCES = ['public_service_request', 'client_intake_form'];
export const FOLLOW_UP_BUSINESS_DAYS = 2;
const TZ = 'America/Detroit';

type Req = Record<string, any> & { id: string };

const firstName = (r: Req) => String(r.fullName || r.primaryContactName || '').trim().split(/\s+/)[0] || 'there';
const refOf = (r: Req) => String(r.requestCode || r.id).toUpperCase();
const whatOf = (r: Req) => (r.source === 'client_intake_form' ? 'partnership request' : 'service request');
export const createdAtOf = (r: Req): Date | null => {
  const c = r.createdAt;
  if (!c) return null;
  if (typeof c.toDate === 'function') return c.toDate();
  const d = new Date(c);
  return isNaN(d.getTime()) ? null : d;
};
export const isEmailAddr = (s: unknown) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** Weekday (Mon–Fri) count in the shop's time zone, from the day after `from` through `to`. */
export function businessDaysBetween(from: Date, to: Date): number {
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const end = day(to);
  let n = 0;
  const cur = new Date(`${day(from)}T12:00:00Z`);
  for (let i = 0; i < 60; i++) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    const key = cur.toISOString().slice(0, 10);
    if (key > end) break;
    const wd = cur.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

export function confirmationEmail(r: Req) {
  return {
    subject: `We got your ${whatOf(r)} — ${refOf(r)}`,
    body: [
      `Hi ${firstName(r)},`,
      ``,
      `Thanks for reaching out to AAROMACH. We received your ${whatOf(r)} and our team will review it shortly.`,
      ``,
      `Your reference number is ${refOf(r)}. If you have anything to add — photos, details, a better time to reach you — just reply to this email.`,
      ``,
      `— The AAROMACH team`,
    ].join('\n'),
  };
}

export function followUpEmail(r: Req) {
  return {
    subject: `We haven't forgotten about your ${whatOf(r)} — ${refOf(r)}`,
    body: [
      `Hi ${firstName(r)},`,
      ``,
      `Just a quick note: your ${whatOf(r)} (${refOf(r)}) is still in our queue and we haven't forgotten about it. Someone from our team will be in touch soon.`,
      ``,
      `If it's urgent or anything has changed, reply to this email and it'll go straight to our support team.`,
      ``,
      `— The AAROMACH team`,
    ].join('\n'),
  };
}

const related = (r: Req) => ({ type: 'clientRequest', id: r.id, label: refOf(r) });

export async function sendConfirmation(fs: Firestore, r: Req): Promise<boolean> {
  if (!isEmailAddr(r.email) || r.confirmationSentAt) return false;
  const e = confirmationEmail(r);
  const res = await sendEmail(r.email.trim(), e.subject, e.body, { kind: 'support', related: related(r), sentBy: 'automatic', idempotencyKey: `request-confirm/${r.id}` });
  if (res !== 'sent') return false;
  await fs.doc(`clientRequests/${r.id}`).update({ confirmationSentAt: new Date().toISOString() });
  return true;
}

/** Sends the follow-up to every public request still pending review after 2 business days. */
export async function sendDueFollowUps(fs: Firestore, now = new Date()): Promise<{ sent: number; failed: number }> {
  const snap = await fs.collection('clientRequests').where('status', '==', 'pending_review').get();
  let sent = 0, failed = 0;
  for (const d of snap.docs) {
    const r = { ...d.data(), id: d.id } as Req;
    if (!PUBLIC_REQUEST_SOURCES.includes(r.source) || r.followUpSentAt || !isEmailAddr(r.email)) continue;
    const created = createdAtOf(r);
    if (!created || businessDaysBetween(created, now) < FOLLOW_UP_BUSINESS_DAYS) continue;
    try {
      const e = followUpEmail(r);
      if (await sendEmail(r.email.trim(), e.subject, e.body, { kind: 'support', related: related(r), sentBy: 'automatic', idempotencyKey: `request-followup/${r.id}` }) === 'sent') {
        await d.ref.update({ followUpSentAt: now.toISOString() });
        sent++;
      }
    } catch (e) {
      console.warn('[request-emails] follow-up failed', r.id, e);
      failed++;
    }
  }
  return { sent, failed };
}
