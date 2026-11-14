import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { sharedJob } from '@/lib/server/shared-job';

/**
 * The jobs the signed-in tech is a HELPER on (additionalTechnicianIds), or
 * one of them with ?id=. Pay, cost and payroll fields are removed — a helper
 * must not see the lead's pay — so helpers read these here; the rules no
 * longer let them read the lead's job document directly.
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
  const col = getFirestore(adminApp).collection('assignments');
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    if (id.length > 200 || id.includes('/')) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    const d = await col.doc(id).get();
    const data = d.data();
    const helpers = Array.isArray(data?.additionalTechnicianIds) ? data!.additionalTechnicianIds as string[] : [];
    if (!d.exists || !helpers.includes(uid)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ job: sharedJob(d.id, data!) });
  }
  const snap = await col.where('additionalTechnicianIds', 'array-contains', uid).get();
  return NextResponse.json({ jobs: snap.docs.map(d => sharedJob(d.id, d.data())) });
}
