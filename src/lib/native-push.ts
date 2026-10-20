'use client';

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { auth } from './firebase';

/**
 * Phone push for the Android app (Capacitor). Does nothing in a browser.
 * The device token is saved for the signed-in user via /api/push/register;
 * the server sends from lib/server/push.ts.
 */

const TOKEN_KEY = 'cc:pushToken';
export const isNativeApp = () => Capacitor.isNativePlatform();

async function send(method: 'POST' | 'DELETE', token: string) {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) return;
  await fetch('/api/push/register', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ token, platform: Capacitor.getPlatform() }),
  });
}

/**
 * Asks for permission (once — Android remembers the answer), registers this
 * phone for the signed-in user, and routes notification taps through `open`.
 * Returns a cleanup that removes the listeners.
 */
export async function startNativePush(open: (url: string) => void, onForeground: (title: string, body: string) => void): Promise<() => void> {
  if (!isNativeApp()) return () => {};
  const handles = await Promise.all([
    PushNotifications.addListener('registration', t => {
      try { localStorage.setItem(TOKEN_KEY, t.value); } catch { /* storage blocked */ }
      send('POST', t.value).catch(e => console.warn('[push] register failed', e));
    }),
    PushNotifications.addListener('registrationError', e => console.warn('[push] registration error', e)),
    // App open: Android doesn't show the system banner, so show it in-app.
    PushNotifications.addListener('pushNotificationReceived', n => onForeground(n.title || 'Aaromach', n.body || '')),
    PushNotifications.addListener('pushNotificationActionPerformed', a => {
      const url = a.notification.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) open(url);
    }),
  ]);
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
  // High-importance channel so alerts pop up as banners with sound while the
  // app is closed (the server sends to channelId 'alerts'). Safe to repeat.
  await PushNotifications.createChannel({ id: 'alerts', name: 'Alerts', description: 'Job, message and pay alerts', importance: 5, visibility: 1, sound: 'default', vibration: true }).catch(() => {});
  if (perm.receive === 'granted') await PushNotifications.register();
  return () => handles.forEach(h => h.remove());
}

/** Before sign-out: stop sending this person's alerts to this phone. */
export async function unregisterNativePush(): Promise<void> {
  if (!isNativeApp()) return;
  let token: string | null = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch { /* storage blocked */ }
  if (token) await send('DELETE', token).catch(() => {});
}
