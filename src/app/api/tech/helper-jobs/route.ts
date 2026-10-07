import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';

/**
 * The jobs the signed-in tech is a HELPER on (additionalTechnicianIds).
 *
 * Read server-side because the equivalent client query depends on Firestore
 * proving the helper read rule against the query, which it can refuse — and
 * a refused query left helpers with no helper jobs at all. Same data the
 * rules already let a helper read one doc at a time.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let uid: string;
  try {
    uid = (await getAuth(adminApp).verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const snap = await getFirestore(adminApp).collection('assignments')
    .where('additionalTechnicianIds', 'array-contains', uid).get();
  const jobs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  return NextResponse.json({ jobs: JSON.parse(JSON.stringify(jobs)) });
}
