import 'server-only';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import type { ClientContact, Technician } from '@/lib/types';
import {
  recipientOptions, resolveRecipient,
  type DocKind, type RecipientOption, type RecipientScope, type ResolvedRecipient,
} from '@/lib/client-contacts';

/**
 * Server-side half of lib/client-contacts: loads a client's user doc and
 * their contacts so an invoice or quote send resolves the same way
 * everywhere. Contacts are admin-only in firestore.rules, so the send
 * routes read them with the admin SDK and hand the dialog the options.
 */
const fs = () => getFirestore(adminApp);

export async function loadClient(clientId: string): Promise<{
  client: Partial<Technician> | null;
  contacts: ClientContact[];
}> {
  if (!clientId) return { client: null, contacts: [] };
  const ref = fs().doc(`users/${clientId}`);
  const [snap, contactSnap] = await Promise.all([ref.get(), ref.collection('contacts').get()]);
  if (!snap.exists) return { client: null, contacts: [] };
  return {
    client: { ...snap.data(), id: snap.id } as Partial<Technician>,
    contacts: contactSnap.docs.map(d => ({ ...d.data(), id: d.id }) as ClientContact),
  };
}

/** Where this document goes by default, and every address offerable for it. */
export async function recipientFor(
  kind: DocKind,
  clientId: string | undefined | null,
  opts: RecipientScope & { viewerId?: string | null } = {},
): Promise<{ resolved: ResolvedRecipient; options: RecipientOption[] }> {
  const { client, contacts } = await loadClient(String(clientId || ''));
  const scope: RecipientScope = { siteId: opts.siteId ?? null };
  return {
    resolved: resolveRecipient(kind, client, contacts, scope),
    options: recipientOptions(kind, client, contacts, scope, opts.viewerId),
  };
}

/**
 * The site an invoice's work happened at, so it can bill to that location's
 * accounts payable. Invoices carry the job, not the site, so read it off the
 * job. Never fails the send — no site just means client-level routing.
 */
export async function siteOfInvoice(inv: Record<string, unknown>): Promise<string | null> {
  const direct = String((inv.siteId as string) || '').trim();
  if (direct) return direct;
  const jobId = String((inv.workOrderId as string) || '').trim();
  if (!jobId) return null;
  try {
    const snap = await fs().doc(`workOrders/${jobId}`).get();
    return String(snap.data()?.siteId || '').trim() || null;
  } catch { return null; }
}
