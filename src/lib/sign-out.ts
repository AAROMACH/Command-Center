'use client';

import { signOut } from 'firebase/auth';
import { clearIndexedDbPersistence, terminate } from 'firebase/firestore';
import { auth, db } from './firebase';

/**
 * The one sign-out path. Besides ending the Firebase session it clears the
 * on-device Firestore cache (lib/firebase.ts), so the next person on a shared
 * computer can't open the browser's storage and read the last user's
 * payroll, clients or messages. Clearing requires a stopped Firestore, so
 * this finishes with a full page load of /login.
 */
export async function signOutAndClear(): Promise<void> {
  sessionStorage.removeItem('currentUserId');
  document.cookie = 'aaromach_session=; path=/; max-age=0; SameSite=Strict';
  document.cookie = 'aaromach_portals=; path=/; max-age=0; SameSite=Strict';
  try { await signOut(auth); } catch { /* still clear and leave */ }
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch {
    // Another open tab still holds the cache; it is cleared when the last
    // tab signs out or closes. Signing out still succeeded.
  }
  window.location.assign('/login');
}
