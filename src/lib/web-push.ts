'use client';

import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { app, auth } from './firebase';
import { isNativeApp } from './native-push';

/**
 * Web push for the website (iPhone Home Screen app, Chrome on Android and
 * desktop). The Android app uses native push instead (lib/native-push.ts).
 * Uses public/sw.js and the Firebase Web Push key (NEXT_PUBLIC_FIREBASE_VAPID_KEY).
 * The token is saved the same way as the app's, so every alert reaches it.
 */

const TOKEN_KEY = 'cc:webPushToken';
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export type WebPushState = 'unsupported' | 'needs-install' | 'not-configured' | 'off' | 'blocked' | 'on';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;

/** What the "phone notifications on this device" control should say. */
export async function webPushState(): Promise<WebPushState> {
  if (typeof window === 'undefined' || isNativeApp()) return 'unsupported';
  // iPhone only allows web push from an app added to the Home Screen.
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('Notification' in window) || !(await isSupported().catch(() => false))) return 'unsupported';
  if (!VAPID_KEY) return 'not-configured';
  if (Notification.permission === 'denied') return 'blocked';
  return Notification.permission === 'granted' ? 'on' : 'off';
}

async function save(method: 'POST' | 'DELETE', token: string) {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) return;
  await fetch('/api/push/register', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ token, platform: 'web' }),
  });
}

async function registerToken(): Promise<boolean> {
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  if (!token) return false;
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* storage blocked */ }
  await save('POST', token);
  return true;
}

/** Turn on from a tap (iPhone requires the permission prompt to follow a tap). */
export async function enableWebPush(): Promise<WebPushState> {
  const state = await webPushState();
  if (state !== 'off' && state !== 'on') return state;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'blocked' : 'off';
  return (await registerToken()) ? 'on' : 'off';
}

/** On each signed-in load: refresh this device's token if notifications are already allowed. */
export async function refreshWebPush(): Promise<void> {
  if ((await webPushState()) === 'on') await registerToken().catch(e => console.warn('[web-push] refresh failed', e));
}

/** Before sign-out: stop this person's alerts on this device. */
export async function unregisterWebPush(): Promise<void> {
  let token: string | null = null;
  try { token = localStorage.getItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ }
  if (token) await save('DELETE', token).catch(() => {});
}
