import type { Firestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { adminApp } from '@/lib/firebase-admin';

/**
 * Phone push notifications (Firebase Cloud Messaging) for the Android app.
 * Each signed-in device registers its token at users/{uid}/pushTokens/{token}
 * (via /api/push/register — server only, no client rules). Tokens FCM says
 * are dead are deleted as they're found.
 */

const DEAD_TOKEN = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/** Sends to every device the user has registered. Returns how many got it. */
export async function sendPush(
  fs: Firestore,
  userId: string,
  msg: { title: string; body: string; url?: string },
): Promise<number> {
  const snap = await fs.collection('users').doc(userId).collection('pushTokens').get();
  const tokens = snap.docs.map(d => d.get('token') as string).filter(Boolean);
  if (!tokens.length) return 0;
  const res = await getMessaging(adminApp).sendEachForMulticast({
    tokens,
    notification: { title: msg.title, body: msg.body.slice(0, 500) },
    data: msg.url ? { url: msg.url } : {},
    android: { priority: 'high', notification: { sound: 'default' } },
  });
  const dead = res.responses
    .map((r, i) => (!r.success && DEAD_TOKEN.has(r.error?.code || '') ? tokens[i] : null))
    .filter((t): t is string => !!t);
  await Promise.all(dead.map(t => fs.collection('users').doc(userId).collection('pushTokens').doc(tokenDocId(t)).delete().catch(() => {})));
  return res.successCount;
}

/** FCM tokens can be long; a doc id can't contain '/'. */
export const tokenDocId = (token: string) => token.replace(/\//g, '_').slice(0, 1400);
