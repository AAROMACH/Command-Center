import { NextRequest, NextResponse } from 'next/server';
import { discountLineLabel } from '@/lib/price-lines';
import { randomBytes } from 'crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { getSubroles, hasPermission, isAdmin } from '@/lib/permissions';
import { emailConfigured, emailDeliveryStatus, sendEmail } from '@/lib/server/notify-delivery';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Send a client invoice: emails the client a summary and a private link to
 * the full invoice (/public/invoice/<token>), then marks it Sent. Admins only.
 * GET ?invoiceId= returns who it would go to, for the confirm step.
 * If email isn't set up (no Resend key) nothing is marked sent — the link
 * comes back so it can be sent by hand.
 */
async function caller(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  try {
    const uid = (await getAuth(adminApp).verifyIdToken(h.replace(/^Bearer /, ''))).uid;
    const u = (await getFirestore(adminApp).doc(`users/${uid}`).get()).data();
    // Admins, and Sales people given the Send invoices permission.
    if (!u || !(isAdmin(u as any) || hasPermission(u as any, 'admin.crm.send_invoice'))) return null;
    // Only Super / Payroll Admins approve invoices (lib/approvals).
    const approver = getSubroles(u as any).some(r => r === 'super_admin' || r === 'payroll_admin');
    return { uid, name: (u.name as string) || 'Aaromach', approver };
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

/** One recorded send: who, to whom, when, and Resend's delivery status. */
type SendRecord = { at: string; to: string; by: string; emailId: string | null; status: string; logId?: string | null };
/** A send within this many minutes of the last one is refused — no accidental double emails. */
const RESEND_COOLDOWN_MIN = 10;

export async function GET(req: NextRequest) {
  if (!(await caller(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = req.nextUrl.searchParams.get('invoiceId') || '';
  const ref = id ? getFirestore(adminApp).doc(`invoices/${id}`) : null;
  const snap = ref ? await ref.get() : null;
  if (!snap?.exists) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  const inv = snap.data() || {};
  // Refresh the latest sends' delivery status from Resend (sent → delivered / bounced).
  const log: SendRecord[] = Array.isArray(inv.sendLog) ? inv.sendLog : [];
  let changed = false;
  const fresh = await Promise.all(log.map(async (e, i) => {
    if (!e.emailId || i < log.length - 3 || ['delivered', 'bounced', 'complained'].includes(e.status)) return e;
    const st = await emailDeliveryStatus(e.emailId);
    if (st && st !== e.status) { changed = true; return { ...e, status: st }; }
    return e;
  }));
  if (changed) await ref!.update({ sendLog: fresh });
  return NextResponse.json({ to: await recipientOf(inv), emailConfigured: emailConfigured(), sendLog: fresh, cooldownMinutes: RESEND_COOLDOWN_MIN });
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
  const approved = inv.approval?.status === 'approved';
  if (inv.status === 'draft' && !approved && !who.approver) {
    return NextResponse.json({ error: 'A Super Admin or Payroll Admin has to approve this invoice before it’s sent.' }, { status: 403 });
  }

  // No spamming the client: one send at a time, and not again within the cooldown.
  const lastAt = Date.parse(inv.sentAt || '') || 0;
  const minsSince = (Date.now() - lastAt) / 60000;
  if (lastAt && minsSince < RESEND_COOLDOWN_MIN) {
    return NextResponse.json({ error: `Already sent ${Math.max(1, Math.round(minsSince))} min ago${inv.sentTo ? ` to ${inv.sentTo}` : ''}. Wait ${Math.ceil(RESEND_COOLDOWN_MIN - minsSince)} min to send again.` }, { status: 429 });
  }
  const locked = await fs.runTransaction(async tx => {
    const cur = (await tx.get(ref)).data() || {};
    if (cur.sendingAt && Date.now() - Date.parse(cur.sendingAt) < 60000) return false;
    tx.update(ref, { sendingAt: new Date().toISOString() });
    return true;
  });
  if (!locked) return NextResponse.json({ error: 'This invoice is already being sent — check back in a moment.' }, { status: 409 });
  const unlock = () => ref.update({ sendingAt: FieldValue.delete() }).catch(() => {});

  const to = (typeof body.to === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.to.trim())) ? body.to.trim() : await recipientOf(inv);
  const token: string = inv.publicToken || randomBytes(24).toString('hex');
  const link = `${req.nextUrl.origin}/public/invoice/${token}`;
  if (!inv.publicToken) await ref.update({ publicToken: token });
  if (!to) { await unlock(); return NextResponse.json({ link, emailed: false, reason: 'No email address for this client.' }); }

  const subject = `Invoice ${inv.invoiceNumber} from Aaromach — ${money(inv.total)}`;
  const text = [
    `Hello${inv.clientName ? ` ${inv.clientName}` : ''},`,
    '',
    `Here is invoice ${inv.invoiceNumber} for ${money(inv.total)}${inv.dueDate ? `, due ${inv.dueDate}` : ''}.`,
    ...(Number(inv.discountAmount) > 0 ? [
      '',
      `Subtotal: ${money(Number(inv.subtotal) || 0)}`,
      `${discountLineLabel(inv.planDiscount)}: -${money(Number(inv.discountAmount))}`,
      ...(Number(inv.tax) > 0 ? [`Tax: ${money(Number(inv.tax))}`] : []),
      `Total: ${money(inv.total)}`,
    ] : []),
    '',
    `View the full invoice: ${link}`,
    '',
    'Thank you for your business.',
    'Aaromach',
  ].join('\n');
  let emailed: 'sent' | 'skipped';
  let emailId: string | null = null;
  let logId: string | null = null;
  const sendNo = (Array.isArray(inv.sendLog) ? inv.sendLog.length : 0) + 1;
  try {
    // Same key for a retry of this send, so Resend never delivers it twice.
    emailed = await sendEmail(to, subject, text, { kind: 'billing', idempotencyKey: `invoice-send/${snap.id}/${sendNo}`, onSent: id => { emailId = id; }, onLogged: id => { logId = id; },
      related: { type: 'invoice', id: snap.id, label: inv.invoiceNumber || null }, sentBy: who.name });
  } catch (e: any) { await unlock(); return NextResponse.json({ error: `Email failed: ${String(e?.message || e).slice(0, 200)}`, link }, { status: 502 }); }
  if (emailed === 'skipped') { await unlock(); return NextResponse.json({ link, emailed: false, reason: 'Email isn’t set up on the server (RESEND_API_KEY missing).' }); }
  const record: SendRecord = { at: new Date().toISOString(), to, by: who.name, emailId, status: 'sent', logId };

  await ref.update({
    ...(inv.status === 'draft' ? { status: 'sent' } : {}),
    sentAt: record.at, sentTo: to, sentBy: who.name,
    sendLog: FieldValue.arrayUnion(record), sendingAt: FieldValue.delete(),
    // An approver sending an unapproved invoice approves it.
    ...(approved ? {} : {
      approval: {
        status: 'approved', requestedBy: inv.approval?.requestedBy ?? who.uid, requestedByName: inv.approval?.requestedByName ?? who.name,
        requestedAt: inv.approval?.requestedAt ?? new Date().toISOString(), decidedBy: who.uid, decidedByName: who.name, decidedAt: new Date().toISOString(), note: null,
      },
    }),
  });
  return NextResponse.json({ link, emailed: true, to, emailId });
}
