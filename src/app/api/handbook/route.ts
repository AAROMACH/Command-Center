import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { getSubroles } from '@/lib/permissions';
import { deleteSection, publishToGoogleDoc, saveSection } from '@/lib/server/handbook';

/**
 * Edit the Operations Manual (Super Admins). Every change is saved, then the
 * whole manual is re-published to the Google Doc.
 *   POST   { id?, title, audience, body, order? } → save one section
 *   DELETE ?id=…                                 → remove one section
 *   PUT                                          → publish to the Doc only
 */
async function editor(req: NextRequest): Promise<string | null> {
  try {
    const uid = (await getAuth(adminApp).verifyIdToken((req.headers.get('authorization') || '').replace(/^Bearer /, ''))).uid;
    const u = (await getFirestore(adminApp).doc(`users/${uid}`).get()).data();
    return u && getSubroles(u as never).includes('super_admin') ? (u.name as string) || 'Super Admin' : null;
  } catch { return null; }
}
const AUD = ['tech', 'pm', 'office'] as const;

export async function POST(req: NextRequest) {
  const by = await editor(req);
  if (!by) return NextResponse.json({ error: 'Only Super Admins can edit the manual.' }, { status: 403 });
  const b = await req.json().catch(() => ({})) as { id?: string; title?: string; audience?: string; body?: string; order?: number };
  if (!b.title?.trim() || typeof b.body !== 'string' || !AUD.includes(b.audience as typeof AUD[number])) return NextResponse.json({ error: 'Title, audience and text are required.' }, { status: 400 });
  if (b.body.length > 200_000) return NextResponse.json({ error: 'That section is too long.' }, { status: 400 });
  if (b.id && (b.id.includes('/') || b.id.length > 100)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const section = await saveSection({ id: b.id, title: b.title, audience: b.audience as typeof AUD[number], body: b.body, order: typeof b.order === 'number' ? b.order : undefined }, by);
  return NextResponse.json({ section, doc: await publishToGoogleDoc(by) });
}

export async function DELETE(req: NextRequest) {
  const by = await editor(req);
  if (!by) return NextResponse.json({ error: 'Only Super Admins can edit the manual.' }, { status: 403 });
  const id = req.nextUrl.searchParams.get('id') || '';
  if (!id || id.includes('/')) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  await deleteSection(id);
  return NextResponse.json({ doc: await publishToGoogleDoc(by) });
}

export async function PUT(req: NextRequest) {
  const by = await editor(req);
  if (!by) return NextResponse.json({ error: 'Only Super Admins can edit the manual.' }, { status: 403 });
  return NextResponse.json({ doc: await publishToGoogleDoc(by) });
}
