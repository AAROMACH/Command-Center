import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';

// The public quote-approval page (src/app/public/quote/[token]) talks to
// Firestore through this route instead of the client SDK directly. A
// Firestore security rule can't tie a `list`/query read to the SPECIFIC
// token value a caller supplied (it can only see whether a doc's own
// publicToken field is non-null) — so a rule shaped like
// `resource.data.publicToken != null` ends up granting anonymous read of
// EVERY sent quote, not just the one matching the caller's token. Doing the
// token-equality check here, server-side with the Admin SDK (which bypasses
// rules), closes that gap without needing to restructure how quotes are
// stored.

async function findByToken(token: string) {
  const snap = await getFirestore(adminApp)
    .collection('quotes')
    .where('publicToken', '==', token)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0];
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const doc = await findByToken(token);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = doc.data();
  if (data.status === 'sent') {
    await doc.ref.update({ status: 'viewed', viewedAt: new Date().toISOString() });
    data.status = 'viewed';
  }
  return NextResponse.json({ quote: { ...data, id: doc.id } });
}

type RespondPayload = {
  token: string;
  action: 'approve' | 'reject';
  approverName?: string;
  approverEmail?: string;
  approvalNote?: string;
  rejectReason?: string;
  optionalChoices?: unknown;
};

export async function POST(req: NextRequest) {
  let payload: RespondPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { token, action } = payload;
  if (!token || (action !== 'approve' && action !== 'reject')) {
    return NextResponse.json({ error: 'Missing token or invalid action' }, { status: 400 });
  }

  const doc = await findByToken(token);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = doc.data();
  if (data.status === 'approved' || data.status === 'rejected') {
    return NextResponse.json({ error: 'Quote already decided' }, { status: 409 });
  }

  const now = new Date().toISOString();
  if (action === 'approve') {
    if (!payload.approverName || !payload.approverEmail) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }
    await doc.ref.update({
      status: 'approved',
      approvedAt: now,
      approvedByName: payload.approverName,
      approvedByEmail: payload.approverEmail,
      approvalNote: payload.approvalNote || null,
      optionalChoices: payload.optionalChoices ?? data.optionalChoices ?? [],
      updatedAt: now,
    });
  } else {
    if (!payload.rejectReason) {
      return NextResponse.json({ error: 'A reason is required' }, { status: 400 });
    }
    await doc.ref.update({
      status: 'rejected',
      rejectedAt: now,
      rejectionReason: payload.rejectReason,
      updatedAt: now,
    });
  }

  return NextResponse.json({ status: 'ok' });
}
