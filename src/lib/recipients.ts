/** Email recipients for invoice/quote sends: trimmed, valid, lowercase-deduped, max 10. */
export const MAX_RECIPIENTS = 10;
export const isEmailAddress = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** The parts of a client's user doc that can hold a billing address. */
type BillingEmailSource = {
  billingEmail?: string | null;
  billingDetails?: { email?: string | null } | null;
  email?: string | null;
};

/**
 * Where money mail for a client goes — invoices, quotes, the QuickBooks
 * customer and the readiness check all resolve it the same way.
 *
 * Two fields have always existed: top-level `billingEmail` (written by the
 * client's own Settings → Billing) and `billingDetails.email` (written by
 * Directory → Edit profile and the client's Profile → Billing). Senders only
 * ever read the first, so a billing address typed into either of the other
 * two screens was silently ignored and mail fell back to the sign-in email.
 * Both are read here, and all three screens now write both. Keep this the
 * single resolver so the surfaces can't drift apart again.
 */
export function clientBillingEmail(u: BillingEmailSource | null | undefined): string {
  if (!u) return '';
  for (const v of [u.billingEmail, u.billingDetails?.email, u.email]) {
    const e = String(v || '').trim();
    if (e) return e;
  }
  return '';
}

export function cleanRecipients(list: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of Array.isArray(list) ? list : [list]) {
    if (typeof v !== 'string') continue;
    for (const part of v.split(/[,;\s]+/)) {
      const e = part.trim();
      if (!e || !isEmailAddress(e) || seen.has(e.toLowerCase())) continue;
      seen.add(e.toLowerCase());
      out.push(e);
    }
  }
  return out.slice(0, MAX_RECIPIENTS);
}
