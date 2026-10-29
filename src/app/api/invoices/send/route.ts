import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { isAdmin } from '@/lib/permissions';
import { sendEmail } from '@/lib/server/notify-delivery';

/**
 * Send a client invoice: emails the client a summary and a private link to
 * the full invoice (/public/invoice/<token>), then marks it Sent. Admins only.
 * GET ?invoiceId= returns who it would go to, for the confirm step.
 * If email isn't set up (no SendGrid key) nothing is marked sent — the link
 * comes back so it can be sent by hand.
 */
async function caller(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  try {
    const uid = (await getAuth(adminApp).verifyIdToken(h.replace(/^Bearer /, ''))).uid;
    const u = (await getFirestore(adminApp).doc(`users/${uid}`).get()).data();
    return u && isAdmin(u as any) ? { uid, name: (u.name as string) || 'Aaromach' } : null;
  } catch { return null; }
}

async function recipientOf(inv: Record<string, any>): Promise<string> {
  if (inv.customerEmail) return inv.customerEmail;
  if (inv.clientId) {
    const c = (await getFirestore(adminApp).doc(`users/${inv.clientId}`).get()).data();
    if (c?.billingEmail) return c.billingEmail;
    if (c?.email) return c.email;
  }
  return '';
}

const money = (n: unknown) => `$${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

export async function GET(req: NextRequest) {
  if (!(await caller(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = req.nextUrl.searchParams.get('invoiceId') || '';
  const snap = id ? await getFirestore(adminApp).doc(`invoices/${id}`).get() : null;
  if (!snap?.exists) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  return NextResponse.json({ to: await recipientOf(snap.data() || {}), emailConfigured: !!process.env.SENDGRID_API_KEY });
}

export async function POST(req: NextRequest) {
  const who = await caller(req);
  if (!who) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const fs = getFirestore(adminApp);
  const ref = fs.doc(`invoices/${String(body.invoiceId || '')}`);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  const inv = snap.data() || {};
  if (inv.status === 'void') return NextResponse.json({ error: 'This invoice is void.' }, { status: 409 });

  const to = (typeof body.to === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.to.trim())) ? body.to.trim() : await recipientOf(inv);
  const token: string = inv.publicToken || randomBytes(24).toString('hex');
  const link = `${req.nextUrl.origin}/public/invoice/${token}`;
  if (!inv.publicToken) await ref.update({ publicToken: token });
  if (!to) return NextResponse.json({ link, emailed: false, reason: 'No email address for this client.' });

  const subject = `Invoice ${inv.invoiceNumber} from Aaromach — ${money(inv.total)}`;
  const text = [
    `Hello${inv.clientName ? ` ${inv.clientName}` : ''},`,
    '',
    `Here is invoice ${inv.invoiceNumber} for ${money(inv.total)}${inv.dueDate ? `, due ${inv.dueDate}` : ''}.`,
    '',
    `View the full invoice: ${link}`,
    '',
    'Thank you for your business.',
    'Aaromach',
  ].join('\n');
  let emailed: 'sent' | 'skipped';
  try { emailed = await sendEmail(to, subject, text); }
  catch (e: any) { return NextResponse.json({ error: `Email failed: ${String(e?.message || e).slice(0, 200)}`, link }, { status: 502 }); }
  if (emailed === 'skipped') return NextResponse.json({ link, emailed: false, reason: 'Email isn’t set up on the server (SENDGRID_API_KEY missing).' });

  await ref.update({
    ...(inv.status === 'draft' ? { status: 'sent' } : {}),
    sentAt: new Date().toISOString(), sentTo: to, sentBy: who.name,
  });
  return NextResponse.json({ link, emailed: true, to });
}
