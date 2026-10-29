import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';

/** The public invoice page reads its invoice here, matched on the exact token
 *  server-side (a security rule can't tie a query to the caller's token). */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';
  if (token.length < 16 || token.length > 128) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const snap = await getFirestore(adminApp).collection('invoices').where('publicToken', '==', token).limit(1).get();
  if (snap.empty) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const i = snap.docs[0].data();
  if (i.status === 'void') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Only what the client needs to see.
  return NextResponse.json({ invoice: {
    invoiceNumber: i.invoiceNumber, clientName: i.clientName, issueDate: i.issueDate, dueDate: i.dueDate, status: i.status,
    lineItems: (i.lineItems || []).map((l: any) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, category: l.category, multiplier: l.multiplier })),
    subtotal: i.subtotal, discountAmount: i.discountAmount || 0, planName: i.planDiscount?.planName || null, tax: i.tax, total: i.total, notes: i.notes || '',
  } });
}
