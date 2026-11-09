import { NextRequest, NextResponse } from 'next/server';
import { publicOrigin } from '@/lib/server/public-origin';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { isAdmin, isSales } from '@/lib/permissions';
import { sendEmail } from '@/lib/server/notify-delivery';
import { cleanRecipients } from '@/lib/recipients';
import { canApproveQuotes } from '@/lib/approvals';
import { randomBytes } from 'crypto';

/**
 * Email a quote to the customer (billing email → your personal banner,
 * replies to the billing reply address). Called by the quote's Send button
 * after it marks the quote Sent. External customers get the private approval
 * link; portal clients get a link to their Quotes page.
 */
const money = (n: unknown) => `$${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const COOLDOWN_MIN = 10;

export async function POST(req: NextRequest) {
  const fs = getFirestore(adminApp);
  let name = 'Aaromach';
  let senderEmail = '';
  let approver = false;
  try {
    const uid = (await getAuth(adminApp).verifyIdToken((req.headers.get('authorization') || '').replace(/^Bearer /, ''))).uid;
    const u = (await fs.doc(`users/${uid}`).get()).data();
    if (!u || !(isAdmin(u as never) || isSales(u as never))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    name = (u.name as string) || name;
    senderEmail = String(u.email || '');
    approver = canApproveQuotes(u as never);
  } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  const reqBody = await req.json().catch(() => ({} as { quoteId?: string; to?: unknown; replyToMe?: boolean }));
  const { quoteId } = reqBody;
  if (typeof quoteId !== 'string' || !quoteId || quoteId.includes('/')) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const ref = fs.doc(`quotes/${quoteId}`);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  const q = snap.data() || {};
  // Quotes made by anyone other than an admin or payroll need approval before they go out.
  if (!approver && q.internalApproval?.status !== 'approved') {
    return NextResponse.json({ error: 'This quote needs approval from an admin or payroll before it can be sent.' }, { status: 403 });
  }
  if (q.status !== 'sent') return NextResponse.json({ error: 'Mark the quote as sent first.' }, { status: 409 });
  const last = Date.parse(q.emailedAt || '') || 0;
  if (last && Date.now() - last < COOLDOWN_MIN * 60_000) {
    return NextResponse.json({ emailed: false, reason: `Already emailed to ${q.emailedTo || 'the customer'} a few minutes ago.` });
  }

  // Recipients picked in the Send dialog; none → the customer's email.
  let recipients = cleanRecipients(reqBody.to);
  if (!recipients.length) {
    let fallback: string = String(q.customerEmail || '').trim();
    if (!fallback && q.clientId) {
      const c = (await fs.doc(`users/${q.clientId}`).get()).data();
      fallback = String(c?.billingEmail || c?.email || '').trim();
    }
    recipients = cleanRecipients(fallback);
  }
  if (!recipients.length) return NextResponse.json({ emailed: false, reason: 'No email address for this customer.' });
  const to = recipients.join(', ');

  // Everyone gets the private approval link (no login needed), portal clients included.
  let token: string = q.publicToken || '';
  if (!token) { token = randomBytes(24).toString('hex'); await ref.update({ publicToken: token }); }
  const link = `${await publicOrigin(req)}/public/quote/${token}`;
  const subject = `Quote ${q.quoteNumber || ''} from AAROMACH`.replace(/\s+/g, ' ');
  const text = [
    `Hello${q.customerName ? ` ${q.customerName}` : ''},`,
    '',
    `Here is quote ${q.quoteNumber || ''}${q.title ? ` for ${q.title}` : ''}: ${money(q.total)}.`,
    '',
    ...(Number(q.depositAmount) > 0 ? [`A deposit of ${money(q.depositAmount)} is due when you approve. You'll get a link to pay it online right after.`, ''] : []),
    `Review and approve it here: ${link}`,
    '',
    'Reply to this email with any questions.',
    '',
    'Thank you,',
    'Aaromach',
  ].join('\n');
  try {
    const res = await sendEmail(recipients, subject, text, {
      kind: 'billing', idempotencyKey: `quote-send/${snap.id}/${q.revisionNumber || 0}/${q.sentAt || ''}`,
      related: { type: 'quote', id: snap.id, label: q.quoteNumber || null }, sentBy: name,
      ...(reqBody.replyToMe && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail) ? { replyTo: senderEmail } : {}),
    });
    if (res === 'skipped') return NextResponse.json({ emailed: false, reason: 'Email isn’t set up on the server.' });
  } catch (e) {
    return NextResponse.json({ error: `Email failed: ${String((e as Error)?.message || e).slice(0, 200)}` }, { status: 502 });
  }
  const at = new Date().toISOString();
  await ref.update({ emailedAt: at, emailedTo: to, emailLog: FieldValue.arrayUnion({ at, to, by: name }) });
  return NextResponse.json({ emailed: true, to });
}
