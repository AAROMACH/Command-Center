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
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

export default config;
