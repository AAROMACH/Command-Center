'use server';

import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';

const ADMIN_ROLES = ['super_admin', 'dispatch_admin', 'payroll_admin', 'project_manager'];

/**
 * Server Actions are public HTTP endpoints — the "Add Personnel" dialog
 * being admin-only in the UI doesn't stop someone from calling this action
 * directly. Re-verify the caller is a real admin here before minting a
 * Firebase Auth account and firing off a password-reset email.
 */
async function assertCallerIsAdmin(callerIdToken: string): Promise<void> {
  const decoded = await getAuth(adminApp).verifyIdToken(callerIdToken);
  const userDoc = await getFirestore(adminApp).collection('users').doc(decoded.uid).get();
  const data = userDoc.data();
  const roles: string[] = data?.roles || [];
  const legacyRole: string = data?.role || '';
  const isAdmin = roles.some(r => ADMIN_ROLES.includes(r)) || ['admin', ...ADMIN_ROLES].includes(legacyRole);
  if (!isAdmin) throw new Error('Not authorized');
}

export async function createAuthUser(
  email: string,
  callerIdToken: string
): Promise<{ uid: string | null; error: string | null }> {
  try {
    await assertCallerIsAdmin(callerIdToken);
    const auth = getAuth(adminApp);
    const userRecord = await auth.createUser({ email });
    // Generate a password reset link so the user can set their own password
    await auth.generatePasswordResetLink(email);
    return { uid: userRecord.uid, error: null };
  } catch (e: any) {
    return { uid: null, error: e.message ?? 'Unknown error' };
  }
}
