import type { ClientContact, Technician } from './types';
import { clientBillingEmail, isEmailAddress } from './recipients';

/**
 * Which of a client's people a document goes to.
 *
 * A client's contacts live in `users/{clientId}/contacts` (ClientContact,
 * managed in Admin → Clients → [id] → Contacts). They carry a `contactType`,
 * so "the AP address" and "the person who asked for the quote" are already
 * distinguishable — this module is what finally reads them.
 *
 * An invoice goes to accounts payable; a quote goes to the person who asked
 * for it. They are often different people at the same company: the buyer
 * wants the quote in their own inbox, and AR wants the invoice.
 *
 * A client with no contacts resolves exactly as before — the single billing
 * address (see clientBillingEmail) — so nothing changes until contacts exist.
 */
export type DocKind = 'invoice' | 'quote';

export const CONTACT_TYPE_LABELS: Record<string, string> = {
  main: 'Main', billing: 'Billing', site: 'Site', emergency: 'Emergency',
  decision_maker: 'Decision maker', accounts_payable: 'Accounts payable',
  store_manager: 'Store manager', regional_manager: 'Regional manager',
};

/** Contact types each document prefers, best first. */
const PREFERRED: Record<DocKind, ClientContact['contactType'][]> = {
  invoice: ['accounts_payable', 'billing', 'main'],
  quote: ['decision_maker', 'main', 'billing'],
};

/** The client-doc field holding the hand-picked default for each document. */
export const DEFAULT_CONTACT_FIELD: Record<DocKind, 'billingContactId' | 'quoteContactId'> = {
  invoice: 'billingContactId',
  quote: 'quoteContactId',
};

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  invoice: 'Invoices',
  quote: 'Quotes',
};

const usable = (c: ClientContact) => isEmailAddress(String(c.email || ''));

/** Narrowing a document to the location it is for. */
export type RecipientScope = {
  /** The site the billed work happened at, when the document is for one. */
  siteId?: string | null;
};

/**
 * The client's contacts that could receive this document, best first:
 * the preferred types in order (primary contacts ahead of the rest), then
 * everyone else with an address. Drives both the default and the picker, so
 * the dropdown's first entry is always the one a plain send would use.
 *
 * With a site, a contact pinned to that site comes before an unpinned one of
 * the same role, and one pinned to a different site comes last — so a
 * multi-site client bills to the right location's accounts payable without
 * anyone overriding it per send.
 */
export function rankedContactsFor(
  kind: DocKind,
  contacts: ClientContact[],
  scope: RecipientScope = {},
): ClientContact[] {
  const order = PREFERRED[kind];
  const site = String(scope.siteId || '');
  // 0 = this site, 1 = client-wide, 2 = pinned to some other site.
  const siteRank = (c: ClientContact) => {
    const own = String(c.siteId || '');
    if (!own) return 1;
    if (!site) return 1; // no site in hand: a pinned contact is no worse
    return own === site ? 0 : 2;
  };
  const rank = (c: ClientContact) => {
    const i = order.indexOf(c.contactType);
    return ((i === -1 ? order.length : i) * 3 + siteRank(c)) * 2 + (c.isPrimary ? 0 : 1);
  };
  return contacts.filter(usable).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/**
 * The contact this document goes to by default: the one picked for it on the
 * client's profile, else the best-ranked contact. Null when the client has no
 * usable contact and the single billing address should be used instead.
 */
export function defaultContactFor(
  kind: DocKind,
  client: Partial<Technician> | null | undefined,
  contacts: ClientContact[],
  scope: RecipientScope = {},
): ClientContact | null {
  const pickedId = client?.[DEFAULT_CONTACT_FIELD[kind]];
  if (pickedId) {
    const picked = contacts.find(c => c.id === pickedId);
    // A picked contact that was since deleted or had its email cleared falls
    // through to the ranking rather than sending nothing.
    if (picked && usable(picked)) return picked;
  }
  return rankedContactsFor(kind, contacts, scope)[0] || null;
}

export type ResolvedRecipient = {
  email: string;
  contact: ClientContact | null;
  /** Why this address — shown in the send dialog so it is never a guess. */
  reason: string;
};

/** Where this document goes if nobody overrides it. */
export function resolveRecipient(
  kind: DocKind,
  client: Partial<Technician> | null | undefined,
  contacts: ClientContact[],
  scope: RecipientScope = {},
): ResolvedRecipient {
  const contact = defaultContactFor(kind, client, contacts, scope);
  if (contact) {
    const picked = client?.[DEFAULT_CONTACT_FIELD[kind]] === contact.id;
    const role = CONTACT_TYPE_LABELS[contact.contactType] || contact.contactType;
    const atThisSite = !!scope.siteId && contact.siteId === scope.siteId;
    return {
      email: String(contact.email || '').trim(),
      contact,
      reason: picked
        ? `Chosen for ${DOC_KIND_LABEL[kind].toLowerCase()} on this client`
        : atThisSite ? `${role} contact for this site` : `${role} contact`,
    };
  }
  const email = clientBillingEmail(client);
  const explicit = !!(client?.billingEmail || client?.billingDetails?.email);
  return {
    email,
    contact: null,
    reason: !email ? 'No address on file' : explicit ? 'Client billing email' : 'Client sign-in email',
  };
}

/** One row of the send dialog's dropdown. */
export type RecipientOption = { email: string; label: string; hint: string };

export function recipientOptions(
  kind: DocKind,
  client: Partial<Technician> | null | undefined,
  contacts: ClientContact[],
  scope: RecipientScope = {},
  /** The signed-in staff member, to put their own contacts nearer the top. */
  viewerId?: string | null,
): RecipientOption[] {
  const out: RecipientOption[] = [];
  const seen = new Set<string>();
  const push = (email: string, label: string, hint: string) => {
    const e = String(email || '').trim();
    if (!e || !isEmailAddress(e) || seen.has(e.toLowerCase())) return;
    seen.add(e.toLowerCase());
    out.push({ email: e, label, hint });
  };
  // The default goes first and is owner-blind, so the address a plain send
  // uses is the same whoever is signed in — only the order below it changes.
  const def = defaultContactFor(kind, client, contacts, scope);
  if (def) {
    const why = resolveRecipient(kind, client, contacts, scope).reason;
    // Keep the "yours" signal even when your own contact is the default.
    push(String(def.email), def.name, viewerId && def.ownerId === viewerId ? `${why} · your contact` : why);
  }
  const ranked = rankedContactsFor(kind, contacts, scope);
  const mine = viewerId ? ranked.filter(c => c.ownerId === viewerId) : [];
  for (const c of [...mine, ...ranked]) {
    const role = CONTACT_TYPE_LABELS[c.contactType] || c.contactType;
    push(String(c.email), c.name, c.ownerId && c.ownerId === viewerId ? `${role} · your contact` : role);
  }
  // The single billing address stays offerable even when contacts exist.
  push(clientBillingEmail(client), 'Client billing email', 'On the client profile');
  return out;
}
