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
// One App Hosting instance (maxInstances: 1), so in-memory limits hold.
// Stops a script creating requests to email strangers over and over.
const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter(t => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < 86_400_000)) hits.delete(k);
  return recent.length > max;
}

export async function POST(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (limited(`ip:${ip}`, 10, 3_600_000)) return NextResponse.json({ sent: false, error: 'Too many requests' }, { status: 429 });
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
  // At most 3 confirmations a day to any one address.
  if (typeof r.email === 'string' && limited(`to:${r.email.trim().toLowerCase()}`, 3, 86_400_000)) {
    return NextResponse.json({ sent: false });
  }
  try {
    return NextResponse.json({ sent: await sendConfirmation(fs, r) });
  } catch (e) {
    console.warn('[public-request/confirm]', e);
    return NextResponse.json({ sent: false, error: 'Email failed' }, { status: 502 });
  }
}
