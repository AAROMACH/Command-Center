'use server';

import { getAuth } from 'firebase-admin/auth';
import { adminApp } from '@/lib/firebase-admin';

export async function createAuthUser(
  email: string
): Promise<{ uid: string | null; error: string | null }> {
  try {
    const auth = getAuth(adminApp);
    const userRecord = await auth.createUser({ email });
    // Generate a password reset link so the user can set their own password
    await auth.generatePasswordResetLink(email);
    return { uid: userRecord.uid, error: null };
  } catch (e: any) {
    return { uid: null, error: e.message ?? 'Unknown error' };
  }
}
