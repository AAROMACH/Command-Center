import 'server-only';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';

/**
 * Integration health: the real result of the last time each outside service
 * was used (an email sent, a QuickBooks call…) or checked. Settings →
 * Integrations reads it, so a card only says Connected when the service has
 * actually worked — never just because a key is set.
 *
 * When a service goes from working to failing, Super Admins get one in-app
 * alert (not one per failure). Stored in integrations/health (no rules
 * match — server only).
 */

export type HealthEntry = { ok: boolean; at: string; error: string | null; source: 'use' | 'check' };
export type HealthDoc = Record<string, HealthEntry>;

const ref = () => getFirestore(adminApp).doc('integrations/health');

export async function readHealth(): Promise<HealthDoc> {
  const s = await ref().get().catch(() => null);
  return (s?.data() as HealthDoc) || {};
}

const NAMES: Record<string, string> = { resend: 'Email (Resend)', quickbooks: 'QuickBooks', twilio: 'Text messages (Twilio)' };

/** Record a real result. Never throws — health tracking must not break the caller. */
export async function recordHealth(id: string, ok: boolean, error: unknown = null, source: HealthEntry['source'] = 'use'): Promise<void> {
  try {
    const fs = getFirestore(adminApp);
    const prev = await fs.runTransaction(async tx => {
      const snap = await tx.get(ref());
      const before = ((snap.data() as HealthDoc) || {})[id];
      const entry: HealthEntry = { ok, at: new Date().toISOString(), error: ok ? null : String((error as any)?.message || error || 'Unknown error').slice(0, 300), source };
      tx.set(ref(), { [id]: entry }, { merge: true });
      return before;
    });
    // Working (or never seen) → failing: tell Super Admins once.
    if (!ok && (!prev || prev.ok)) {
      const { deliverNotification } = await import('./notify-delivery');
      const supers = await fs.collection('users').where('roles', 'array-contains', 'super_admin').get();
      await deliverNotification(fs, supers.docs.map(d => ({ id: d.id, data: d.data() })), {
        title: `${NAMES[id] || id} stopped working`,
        body: `${String((error as any)?.message || error || 'Unknown error').slice(0, 200)} — check Settings → Integrations.`,
        sentBy: 'system', inAppOnly: true, portal: 'admin',
      });
    }
  } catch (e) {
    console.warn('[integration-health] could not record', id, e);
  }
}
