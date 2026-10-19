import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { tokenDocId } from '@/lib/server/push';

/**
 * The Android app registers (POST) or drops (DELETE, on sign-out) this
 * device's push token for the signed-in user. Body: { token, platform }.
 */
async function uidFrom(req: NextRequest): Promise<string | null> {
  const h = req.headers.get('authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  try { return (await getAuth(adminApp).verifyIdToken(h.slice(7))).uid; } catch { return null; }
}

async function tokenFrom(req: NextRequest): Promise<{ token: string; platform: string } | null> {
  try {
    const body = await req.json();
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token || token.length > 4096) return null;
    return { token, platform: typeof body.platform === 'string' ? body.platform.slice(0, 20) : 'android' };
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const uid = await uidFrom(req);
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const t = await tokenFrom(req);
  if (!t) return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  const fs = getFirestore(adminApp);
  // Save first — the phone must be registered even if the clean-up below fails.
  await fs.collection('users').doc(uid).collection('pushTokens').doc(tokenDocId(t.token))
    .set({ token: t.token, platform: t.platform, updatedAt: new Date().toISOString() });
  // A phone that changes hands should only notify its current user. Needs the
  // collection-group index on pushTokens.token (firestore.indexes.json); until
  // it's deployed this query fails, which must not block registration.
  try {
    const others = await fs.collectionGroup('pushTokens').where('token', '==', t.token).get();
    await Promise.all(others.docs.filter(d => d.ref.parent.parent?.id !== uid).map(d => d.ref.delete()));
  } catch (e) {
    console.warn('[push/register] previous-owner cleanup skipped:', (e as Error).message);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const uid = await uidFrom(req);
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const t = await tokenFrom(req);
  if (!t) return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  await getFirestore(adminApp).collection('users').doc(uid).collection('pushTokens').doc(tokenDocId(t.token)).delete();
  return NextResponse.json({ ok: true });
}
