import type { PersonnelDocument, Technician } from './types';

/**
 * What a directory profile still needs before QuickBooks can take it:
 *  - a paid tech becomes a QuickBooks Vendor (bills, 1099-NEC);
 *  - a client becomes a QuickBooks Customer (invoices, payments).
 *
 * Each check is something the sync can't guess. The directory shows the
 * checklist, and the sync refuses a profile that isn't ready instead of
 * creating a half-filled vendor/customer someone has to fix in QuickBooks.
 */

export type ReadinessCheck = { key: string; label: string; ok: boolean; hint?: string };

export type Readiness = {
  /** False when the profile doesn't sync at all (e.g. a W-2 employee). */
  applies: boolean;
  checks: ReadinessCheck[];
  ready: boolean;
  missing: ReadinessCheck[];
  note?: string;
};

const finish = (checks: ReadinessCheck[], note?: string): Readiness => {
  const missing = checks.filter(c => !c.ok);
  return { applies: true, checks, ready: missing.length === 0, missing, note };
};

const filled = (s: string | undefined | null) => !!s && s.trim().length > 0;

export const isValidLast4 = (s: string | undefined | null) => !!s && /^\d{4}$/.test(s);

/** An approved, unexpired W-9 among the person's documents. */
export function hasW9OnFile(documents: Pick<PersonnelDocument, 'type' | 'approvalStatus' | 'expiryDate'>[], now = new Date()): boolean {
  return documents.some(d =>
    d.type === 'w9' && d.approvalStatus === 'approved' && (!d.expiryDate || new Date(d.expiryDate) >= now));
}

export const WORKER_TYPE_LABELS: Record<string, string> = {
  '1099_contractor': '1099 Contractor',
  w2_employee: 'W-2 Employee',
  not_paid: 'Not paid through Aaromach',
};

export function vendorReadiness(person: Technician, documents: Pick<PersonnelDocument, 'type' | 'approvalStatus' | 'expiryDate'>[]): Readiness {
  const acct = person.accounting || {};
  if (acct.workerType === 'w2_employee') {
    return { applies: false, checks: [], ready: false, missing: [], note: 'W-2 employees are paid through payroll, not as QuickBooks vendors.' };
  }
  if (acct.workerType === 'not_paid') {
    return { applies: false, checks: [], ready: false, missing: [], note: 'Marked as not paid through Aaromach — no QuickBooks vendor is created.' };
  }
  return finish([
    { key: 'workerType', label: 'Worker classification', ok: acct.workerType === '1099_contractor', hint: 'Set 1099 contractor or W-2 employee.' },
    { key: 'payeeLegalName', label: 'Legal name (W-9 line 1)', ok: filled(acct.payeeLegalName) },
    { key: 'taxId', label: 'Tax ID type + last 4', ok: !!acct.taxIdType && isValidLast4(acct.taxIdLast4) },
    { key: 'address', label: 'Mailing address', ok: filled(person.address), hint: '1099-NEC forms are mailed here.' },
    { key: 'email', label: 'Email', ok: filled(person.email) },
    { key: 'payoutMethod', label: 'Payout method', ok: filled(person.payoutPreferences?.method) },
    { key: 'w9', label: 'Approved W-9 on file', ok: hasW9OnFile(documents), hint: 'Upload it under Documents as type W-9, then approve it.' },
  ]);
}

/** Name the QuickBooks Customer is created under. */
export function customerDisplayName(person: Technician): string {
  return (person.accounting?.customerDisplayName || person.clientCompany || person.name || '').trim();
}

export function customerReadiness(person: Technician): Readiness {
  const acct = person.accounting || {};
  return finish([
    { key: 'displayName', label: 'Customer name', ok: filled(customerDisplayName(person)) },
    { key: 'billingEmail', label: 'Billing email', ok: filled(person.billingDetails?.email || person.email), hint: 'Invoices and payment links go here.' },
    { key: 'billingAddress', label: 'Billing address', ok: filled(acct.billingAddress || person.address) },
    { key: 'terms', label: 'Payment terms', ok: filled(person.billingDetails?.terms) },
    {
      key: 'taxStatus', label: 'Sales tax status', ok: acct.taxExempt === false || (acct.taxExempt === true && filled(acct.taxExemptReason)),
      hint: acct.taxExempt === true ? 'Exempt customers need a reason (e.g. certificate on file).' : 'Mark taxable or exempt.',
    },
  ]);
}
