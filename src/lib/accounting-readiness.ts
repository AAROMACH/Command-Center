import type { PersonnelDocument, Technician } from './types';

/**
 * What a directory profile needs for QuickBooks:
 *  - a paid tech becomes a QuickBooks Vendor (bills, 1099-NEC);
 *  - a client becomes a QuickBooks Customer (invoices, payments).
 *
 * Each check says WHY it's there, so nothing is presented as a QuickBooks
 * requirement that isn't one:
 *  - 'required'  — QuickBooks (or the app's sync) can't create the record
 *                  without it. Only these block the sync.
 *  - '1099'      — not needed to create the vendor, but needed to file the
 *                  contractor's 1099-NEC at year end (IRS).
 *  - 'policy'    — Aaromach's own rule, not QuickBooks' (e.g. W-9 on file).
 *  - 'invoicing' — not needed to create the customer, but needed to email
 *                  invoices / Pay now links.
 * QuickBooks itself only requires a unique display name for a vendor or
 * customer.
 */

export type CheckLevel = 'required' | '1099' | 'policy' | 'invoicing';
export const CHECK_LEVEL_LABEL: Record<CheckLevel, string> = {
  required: 'Required by QuickBooks',
  '1099': 'Needed for 1099s',
  policy: 'Company policy',
  invoicing: 'Needed to email invoices',
};
export type ReadinessCheck = { key: string; label: string; ok: boolean; hint?: string; level: CheckLevel };

export type Readiness = {
  /** False when the profile doesn't sync at all (e.g. a W-2 employee). */
  applies: boolean;
  checks: ReadinessCheck[];
  /** Every 'required' check passes — the sync can create the record. */
  ready: boolean;
  /** Required checks that fail (these block the sync). */
  missing: ReadinessCheck[];
  /** Other checks that fail — shown, but don't block the sync. */
  warnings: ReadinessCheck[];
  note?: string;
};

const finish = (checks: ReadinessCheck[], note?: string): Readiness => {
  const missing = checks.filter(c => !c.ok && c.level === 'required');
  const warnings = checks.filter(c => !c.ok && c.level !== 'required');
  return { applies: true, checks, ready: missing.length === 0, missing, warnings, note };
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
    return { applies: false, checks: [], ready: false, missing: [], warnings: [], note: 'W-2 employees are paid through payroll, not as QuickBooks vendors.' };
  }
  if (acct.workerType === 'not_paid') {
    return { applies: false, checks: [], ready: false, missing: [], warnings: [], note: 'Marked as not paid through Aaromach — no QuickBooks vendor is created.' };
  }
  return finish([
    // The sync needs to know a vendor should be made at all (W-2 staff aren't).
    { key: 'workerType', label: 'Worker classification', ok: acct.workerType === '1099_contractor', level: 'required', hint: 'Set 1099 contractor or W-2 employee — the app only creates vendors for contractors.' },
    // QuickBooks' one hard requirement: a vendor name.
    { key: 'payeeLegalName', label: 'Vendor name', ok: filled(acct.payeeLegalName) || filled(person.name), level: 'required', hint: 'QuickBooks needs a name for the vendor.' },
    { key: 'taxId', label: 'Tax ID type + last 4', ok: !!acct.taxIdType && isValidLast4(acct.taxIdLast4), level: '1099', hint: 'Needed to file their 1099-NEC; not needed to create the vendor.' },
    { key: 'legalName', label: 'Legal name as on W-9', ok: filled(acct.payeeLegalName), level: '1099', hint: 'The 1099 must match the W-9 name; otherwise their profile name is used.' },
    { key: 'address', label: 'Mailing address', ok: filled(person.address), level: '1099', hint: '1099-NEC forms are mailed here.' },
    { key: 'w9', label: 'Approved W-9 on file', ok: hasW9OnFile(documents), level: 'policy', hint: 'Best practice before paying a contractor; QuickBooks doesn’t check it.' },
    { key: 'payoutMethod', label: 'Payout method', ok: filled(person.payoutPreferences?.method), level: 'policy', hint: 'How we pay them; QuickBooks doesn’t need it.' },
    { key: 'email', label: 'Email', ok: filled(person.email), level: 'policy', hint: 'Optional in QuickBooks.' },
  ]);
}

/** Name the QuickBooks Customer is created under. */
export function customerDisplayName(person: Technician): string {
  return (person.accounting?.customerDisplayName || person.clientCompany || person.name || '').trim();
}

export function customerReadiness(person: Technician): Readiness {
  const acct = person.accounting || {};
  return finish([
    // QuickBooks' one hard requirement: a customer name.
    { key: 'displayName', label: 'Customer name', ok: filled(customerDisplayName(person)), level: 'required', hint: 'QuickBooks needs a name for the customer.' },
    { key: 'billingEmail', label: 'Billing email', ok: filled(person.billingDetails?.email || person.email), level: 'invoicing', hint: 'Invoices and Pay now links are emailed here.' },
    { key: 'billingAddress', label: 'Billing address', ok: filled(acct.billingAddress || person.address), level: 'policy', hint: 'Printed on invoices; optional in QuickBooks.' },
    { key: 'terms', label: 'Payment terms', ok: filled(person.billingDetails?.terms), level: 'policy', hint: 'Without it QuickBooks uses your company default.' },
    {
      key: 'taxStatus', label: 'Sales tax status', ok: acct.taxExempt === false || (acct.taxExempt === true && filled(acct.taxExemptReason)), level: 'policy',
      hint: acct.taxExempt === true ? 'Exempt customers should have a reason (e.g. certificate on file).' : 'Unset = taxable in QuickBooks.',
    },
  ]);
}
