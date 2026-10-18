import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  connectFirestoreEmulator, type Firestore,
} from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const app = !getApps().length
  ? initializeApp(firebaseConfig)
  : getApp();

export const auth = getAuth(app);
// On-device cache: listeners re-attached after a page change (or a reload)
// start from IndexedDB and only fetch what changed, instead of downloading
// whole collections again. Shared across open tabs. Falls back to the default
// in-memory cache on the server, when IndexedDB is unavailable (private
// windows), or if Firestore was already initialized (hot reload).
// Cleared on sign-out — see lib/sign-out.ts.
function createDb(): Firestore {
  if (typeof window === "undefined") return getFirestore(app);
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore(app);
  }
}
export const db = createDb();
export const storage = getStorage(app);

// Local development / screenshot testing against the Firebase emulators.
// Off unless NEXT_PUBLIC_USE_EMULATORS=1 is set at build/dev time.
if (process.env.NEXT_PUBLIC_USE_EMULATORS === "1" && typeof window !== "undefined") {
  const w = window as Window & { __ccEmulators?: boolean };
  if (!w.__ccEmulators) {
    w.__ccEmulators = true;
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
  }
}

// Persistence is chosen at login: local persistence (survives browser restarts)
// when "Remember Me" is on, session persistence otherwise. We intentionally do
// NOT force a persistence here — the Firebase default is local, so a
// remembered session is restored on return instead of being dropped on load.

