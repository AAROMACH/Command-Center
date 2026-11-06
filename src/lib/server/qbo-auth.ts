import 'server-only';
import { NextRequest } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import { getSubroles } from '@/lib/permissions';

/** Super / Payroll Admins manage the QuickBooks connection (they approve invoices). */
export async function qboAdmin(req: NextRequest): Promise<{ uid: string; name: string } | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!token) return null;
  try {
    const uid = (await getAuth(adminApp).verifyIdToken(token)).uid;
    const u = (await getFirestore(adminApp).doc(`users/${uid}`).get()).data();
    if (!u || !getSubroles(u as any).some(r => r === 'super_admin' || r === 'payroll_admin')) return null;
    return { uid, name: (u.name as string) || 'Admin' };
  } catch { return null; }
}
