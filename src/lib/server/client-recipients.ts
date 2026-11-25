import 'server-only';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebase-admin';
import type { ClientContact, Technician } from '@/lib/types';
import {
  recipientOptions, resolveRecipient, type DocKind, type RecipientOption, type ResolvedRecipient,
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
export async function recipientFor(kind: DocKind, clientId: string | undefined | null): Promise<{
  resolved: ResolvedRecipient;
  options: RecipientOption[];
}> {
  const { client, contacts } = await loadClient(String(clientId || ''));
  return {
    resolved: resolveRecipient(kind, client, contacts),
    options: recipientOptions(kind, client, contacts),
  };
}
