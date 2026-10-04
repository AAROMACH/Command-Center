import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';

/**
 * Creates the Firebase Auth account for a person an admin adds in Directory.
 *
 * Was a Server Action. Server Action ids change between deploys, so a tab
 * opened before a deploy failed with "Server Action … was not found on the
 * server" until it was hard-refreshed. A plain route has a stable URL.
 */

const ADMIN_ROLES = ['super_admin', 'dispatch_admin', 'payroll_admin', 'project_manager'];

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let callerUid: string;
  try {
    callerUid = (await getAuth(adminApp).verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const caller = (await getFirestore(adminApp).collection('users').doc(callerUid).get()).data() || {};
  const roles: string[] = Array.isArray(caller.roles) ? caller.roles : [];
  const isAdmin = roles.some(r => ADMIN_ROLES.includes(r)) || ['admin', ...ADMIN_ROLES].includes(caller.role || '');
  if (!isAdmin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  let email = '';
  try {
    email = String((await req.json())?.email || '').trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  try {
    const user = await getAuth(adminApp).createUser({ email });
    return NextResponse.json({ uid: user.uid });
  } catch (e: any) {
    if (e?.code === 'auth/email-already-exists') {
      return NextResponse.json({ error: 'The email address is already in use by another account.', code: 'already-exists' }, { status: 409 });
    }
    console.error('[create-user]', e);
    return NextResponse.json({ error: e?.message || 'Could not create the account.' }, { status: 500 });
  }
}
