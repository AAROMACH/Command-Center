import 'server-only';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';

/**
 * A copy of every email the app sends (or tries to): who it went to, the
 * subject and full message, which sender, who/what triggered it, and how it
 * went. emailLog/{id} — server writes only; admins read it in Settings →
 * Email log (firestore.rules). Kept for good, unlike Resend's own history.
 */
export type EmailLogEntry = {
  id: string;
  to: string;
  from: string;
  replyTo: string | null;
  subject: string;
  text: string;
  kind: 'billing' | 'support' | 'notifications';
  status: 'sent' | 'failed';
  error: string | null;
  /** Resend's id, for its delivery status. */
  emailId: string | null;
  /** What it was about, e.g. { type: 'invoice', id: 'inv-012', label: 'INV-110626-012' }. */
  related: { type: string; id: string; label?: string | null } | null;
  sentBy: string | null;
  at: string;
};

/** Save a copy. Never throws — logging must not block or fail a send. */
/** Why the last save failed, for callers that report it (test send). */
export let lastEmailLogError: string | null = null;

export async function logEmail(entry: Omit<EmailLogEntry, 'id' | 'at'>): Promise<string | null> {
  try {
    const ref = getFirestore(adminApp).collection('emailLog').doc();
    await ref.set({ ...entry, id: ref.id, at: new Date().toISOString() });
    lastEmailLogError = null;
    return ref.id;
  } catch (e) {
    lastEmailLogError = e instanceof Error ? e.message : String(e);
    console.warn('[email-log] could not save', e);
    return null;
  }
}
