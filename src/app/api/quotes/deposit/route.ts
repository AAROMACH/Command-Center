import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { isAdmin, isSales } from '@/lib/permissions';
import { createDepositInvoice } from '@/lib/server/quote-deposit';

/** Staff recorded the customer's approval (phone, in person…): make the deposit invoice. */
export async function POST(req: NextRequest) {
  const fs = getFirestore(adminApp);
  let name = 'Office';
  try {
    const uid = (await getAuth(adminApp).verifyIdToken((req.headers.get('authorization') || '').replace(/^Bearer /, ''))).uid;
    const u = (await fs.doc(`users/${uid}`).get()).data();
    if (!u || !(isAdmin(u as never) || isSales(u as never))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    name = (u.name as string) || name;
  } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  const { quoteId } = await req.json().catch(() => ({} as { quoteId?: string }));
  if (typeof quoteId !== 'string' || !quoteId || quoteId.includes('/')) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const q = (await fs.doc(`quotes/${quoteId}`).get()).data();
  if (!q || q.status !== 'approved') return NextResponse.json({ error: 'The quote isn’t approved.' }, { status: 409 });
  try { return NextResponse.json(await createDepositInvoice(quoteId, req.nextUrl.origin, name) || { invoiceId: null }); }
  catch (e) { return NextResponse.json({ error: String((e as Error).message).slice(0, 300) }, { status: 502 }); }
}
