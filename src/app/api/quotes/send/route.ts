import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { isAdmin, isSales } from '@/lib/permissions';
import { sendEmail } from '@/lib/server/notify-delivery';

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
  try {
    const uid = (await getAuth(adminApp).verifyIdToken((req.headers.get('authorization') || '').replace(/^Bearer /, ''))).uid;
    const u = (await fs.doc(`users/${uid}`).get()).data();
    if (!u || !(isAdmin(u as never) || isSales(u as never))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    name = (u.name as string) || name;
  } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  const { quoteId } = await req.json().catch(() => ({} as { quoteId?: string }));
  if (typeof quoteId !== 'string' || !quoteId || quoteId.includes('/')) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const ref = fs.doc(`quotes/${quoteId}`);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  const q = snap.data() || {};
  if (q.status !== 'sent') return NextResponse.json({ error: 'Mark the quote as sent first.' }, { status: 409 });
  const last = Date.parse(q.emailedAt || '') || 0;
  if (last && Date.now() - last < COOLDOWN_MIN * 60_000) {
    return NextResponse.json({ emailed: false, reason: `Already emailed to ${q.emailedTo || 'the customer'} a few minutes ago.` });
  }

  let to: string = String(q.customerEmail || '').trim();
  if (!to && q.clientId) {
    const c = (await fs.doc(`users/${q.clientId}`).get()).data();
    to = String(c?.billingEmail || c?.email || '').trim();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ emailed: false, reason: 'No email address for this customer.' });

  const link = q.publicToken ? `${req.nextUrl.origin}/public/quote/${q.publicToken}` : `${req.nextUrl.origin}/client/quotes`;
  const subject = `Quote ${q.quoteNumber || ''} from Aaromach — ${money(q.total)}`.replace(/\s+/g, ' ');
  const text = [
    `Hello${q.customerName ? ` ${q.customerName}` : ''},`,
    '',
    `Here is quote ${q.quoteNumber || ''}${q.title ? ` for ${q.title}` : ''}: ${money(q.total)}.`,
    '',
    `Review and approve it here: ${link}`,
    '',
    'Reply to this email with any questions.',
    '',
    'Thank you,',
    'Aaromach',
  ].join('\n');
  try {
    const res = await sendEmail(to, subject, text, {
      kind: 'billing', idempotencyKey: `quote-send/${snap.id}/${q.revisionNumber || 0}/${q.sentAt || ''}`,
      related: { type: 'quote', id: snap.id, label: q.quoteNumber || null }, sentBy: name,
    });
    if (res === 'skipped') return NextResponse.json({ emailed: false, reason: 'Email isn’t set up on the server.' });
  } catch (e) {
    return NextResponse.json({ error: `Email failed: ${String((e as Error)?.message || e).slice(0, 200)}` }, { status: 502 });
  }
  const at = new Date().toISOString();
  await ref.update({ emailedAt: at, emailedTo: to, emailLog: FieldValue.arrayUnion({ at, to, by: name }) });
  return NextResponse.json({ emailed: true, to });
}
