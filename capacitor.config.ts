import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android app shell. The app needs its server (API routes, SSR), so the APK
 * loads the live site instead of bundling it — every web deploy updates the
 * app, and only native changes (icon, permissions, plugins) need a new APK.
 *
 * CAP_SERVER_URL = the live App Hosting address, e.g.
 * https://command-center--<project>.us-east4.hosted.app (set it when running
 * `npx cap sync`, or as a GitHub Actions variable for the APK workflow).
 */
const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.aaromach.commandcenter',
  appName: 'Aaromach',
  // Shown only if the live site can't be reached.
  webDir: 'mobile/www',
  server: serverUrl ? { url: serverUrl, cleartext: false } : undefined,
  android: {
    // Android 15+ draws apps under the status and gesture bars. Keep the app
    // between them so the top bar (menu, alerts, bell) and the bottom nav
    // aren't covered by the phone's notification shade.
    adjustMarginsForEdgeToEdge: 'force',
  },
  // Fills the strips above/below the app (matches the dark UI).
  backgroundColor: '#111111',
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
    // Google blocks its sign-in page inside the app's web view, so the app
    // uses Android's account picker and hands the token to the web Firebase
    // SDK (skipNativeAuth) — same account as signing in on the website.
    FirebaseAuthentication: { skipNativeAuth: true, providers: ['google.com'] },
  },
};

export default config;
