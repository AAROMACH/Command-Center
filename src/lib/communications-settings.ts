/**
 * Settings → Communications (adminConfig/communications). Read by the server
 * on every send (lib/server/notify-delivery). Blank fields fall back to the
 * built-in defaults / env vars.
 */
export type CommunicationsSettings = {
  /** Replies to support emails: website forms, requests, FAQs, client questions. */
  supportReplyTo?: string;
  /** Replies to billing emails: invoices, quotes, payments. */
  billingReplyTo?: string;
  /** Add a "reach me directly" line to billing emails. */
  billingContactOn?: boolean;
  billingContactName?: string;
  billingContactEmail?: string;
  billingContactPhone?: string;
  /** Shown under your name on the billing banner. */
  billingContactTitle?: string;
  /** Company banner on support emails. */
  companyPhone?: string;
  companyWebsite?: string;
  /** The app's address, saved from the browser — used to link the logo in emails. */
  appUrl?: string;
};

export const DEFAULT_COMPANY_PHONE = '(313) 241-0588';
export const DEFAULT_COMPANY_WEBSITE = 'aaromach.com';

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** The line added to the bottom of billing emails, or null. */
export function billingContactLine(s: CommunicationsSettings | null | undefined): string | null {
  if (!s?.billingContactOn || !s.billingContactEmail || !isEmail(s.billingContactEmail)) return null;
  const who = (s.billingContactName || '').trim();
  const phone = (s.billingContactPhone || '').trim();
  return `Questions about this? Reach ${who || 'me'} directly at ${s.billingContactEmail.trim()}${phone ? ` or ${phone}` : ''}.`;
}
