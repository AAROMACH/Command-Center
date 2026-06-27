'server-only';

import { initializeApp, getApps, cert, App } from 'firebase-admin/app';

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0];

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey) {
    return initializeApp({ credential: cert(JSON.parse(serviceAccountKey)) });
  }

  // Application Default Credentials — works automatically on Firebase App Hosting / Cloud Run
  return initializeApp();
}

export const adminApp = getAdminApp();
