import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { getSubroles } from '@/lib/permissions';
import { pushInvoice, qboReady, syncAllPayments } from '@/lib/server/qbo-sync';

/**
 * POST { action: 'payments' } — check every open invoice against QuickBooks
 * and mark paid ones Paid. POST { action: 'push', invoiceId } — send (or
 * re-send) one invoice to QuickBooks. Super / Payroll Admins.
 */
export async function POST(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  let ok = false;
  try {
    const uid = (await getAuth(adminApp).verifyIdToken(h.replace(/^Bearer /, ''))).uid;
    const u = (await getFirestore(adminApp).doc(`users/${uid}`).get()).data();
    ok = !!u && getSubroles(u as any).some(r => r === 'super_admin' || r === 'payroll_admin');
  } catch { /* not signed in */ }
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!(await qboReady())) return NextResponse.json({ error: 'QuickBooks isn’t connected.' }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  if (body.action === 'payments') return NextResponse.json(await syncAllPayments());
  if (body.action === 'push' && typeof body.invoiceId === 'string') {
    const r = await pushInvoice(body.invoiceId);
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 502 });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
