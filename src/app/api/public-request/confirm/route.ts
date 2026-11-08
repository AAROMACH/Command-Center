import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { PUBLIC_REQUEST_SOURCES, createdAtOf, sendConfirmation } from '@/lib/server/request-emails';

/**
 * Called by the public forms right after they save a clientRequest. No sign-in
 * (the forms are public), so it only acts on a request that is a public form,
 * still pending review, created in the last 30 minutes and not yet confirmed —
 * a stranger can't use it to email anyone else.
 */
export async function POST(req: NextRequest) {
  const { id } = await req.json().catch(() => ({} as { id?: string }));
  if (typeof id !== 'string' || !id || id.length > 100 || id.includes('/')) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const fs = getFirestore(adminApp);
  const snap = await fs.doc(`clientRequests/${id}`).get();
  if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const r = { ...snap.data(), id: snap.id } as Record<string, any> & { id: string };
  const created = createdAtOf(r);
  if (!PUBLIC_REQUEST_SOURCES.includes(r.source) || r.status !== 'pending_review' || !created || Date.now() - created.getTime() > 30 * 60_000) {
    return NextResponse.json({ sent: false });
  }
  try {
    return NextResponse.json({ sent: await sendConfirmation(fs, r) });
  } catch (e) {
    console.warn('[public-request/confirm]', e);
    return NextResponse.json({ sent: false, error: 'Email failed' }, { status: 502 });
  }
}
