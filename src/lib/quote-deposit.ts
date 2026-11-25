import type { QuoteDeposit } from './types';

const roundCents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Dollars due as a deposit: a percent of the total or a fixed amount, never more than the total. */
export function depositAmountFor(total: number, d: QuoteDeposit | null | undefined): number {
  if (!d || !(Number(d.value) > 0) || !(Number(total) > 0)) return 0;
  const amt = d.kind === 'percent' ? Number(total) * Math.min(Number(d.value), 100) / 100 : Number(d.value);
  return roundCents(Math.min(amt, Number(total)));
}

/** The line that takes a paid deposit off the final invoice. */
export const depositCreditLine = (amount: number, depositNumber?: string | null) => ({
  id: `dep-${Date.now().toString(36)}`, name: `Less deposit${depositNumber ? ` (${depositNumber})` : ''}`,
  quantity: 1, unitPrice: -roundCents(amount), section: 'labor' as const, taxable: false, required: true,
});

/** Payment terms a quote can carry; the invoice made from it is due this many days after issue. */
export const PAYMENT_TERMS: { value: string; label: string; days: number }[] = [
  { value: 'due_on_receipt', label: 'Due on receipt', days: 0 },
  { value: 'net_15', label: 'Net 15', days: 15 },
  { value: 'net_30', label: 'Net 30', days: 30 },
  { value: 'net_45', label: 'Net 45', days: 45 },
  { value: 'net_60', label: 'Net 60', days: 60 },
];
export const DEFAULT_PAYMENT_TERMS = 'net_30';
export const paymentTermsLabel = (v?: string | null) => PAYMENT_TERMS.find(t => t.value === v)?.label || 'Net 30';
export const paymentTermsDays = (v?: string | null) => PAYMENT_TERMS.find(t => t.value === v)?.days ?? 30;

/**
 * A terms value from anywhere, as a PAYMENT_TERMS value — or null when there
 * is nothing on file.
 *
 * Client records used to store the label ("Net 30", "Due on Receipt") while
 * quotes and invoices stored the value ("net_30"), which is why a client's
 * agreed terms never connected to their invoices. Both are accepted on read
 * so existing client records keep working; everything writes the value now.
 */
export function normalizeTerms(v?: string | null): string | null {
  const raw = String(v ?? '').trim();
  if (!raw) return null;
  if (PAYMENT_TERMS.some(t => t.value === raw)) return raw;
  const slug = raw.toLowerCase().replace(/[\s-]+/g, '_');
  return PAYMENT_TERMS.find(t => t.value === slug || t.label.toLowerCase() === raw.toLowerCase())?.value ?? null;
}

/** The payment terms on a client record, as a PAYMENT_TERMS value. */
export function clientTerms(client?: { billingDetails?: { terms?: string | null } | null } | null): string | null {
  return normalizeTerms(client?.billingDetails?.terms);
}

/** issueDate + the term's days, as YYYY-MM-DD. */
export function dueDateFor(issueDate: string, terms?: string | null): string {
  const base = Date.parse(`${String(issueDate || '').slice(0, 10)}T12:00:00`);
  const from = Number.isNaN(base) ? Date.now() : base;
  return new Date(from + paymentTermsDays(terms) * 86_400_000).toISOString().slice(0, 10);
}

/** Deposit choices (percent of the quote total). 0 = no deposit. */
export const DEPOSIT_PERCENTS = [0, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100];

/** Plain-words payment terms for the PDF and approval page:
 *  "Payment due within 30 days of invoice (Net 30). Deposit due before work begins: 50% ($1,250.00)." */
export function paymentTermsText(terms: string | null | undefined, depositPct: number, depositAmount: number, money: (n: number) => string): string {
  const days = paymentTermsDays(terms);
  const base = days ? `Payment due within ${days} days of invoice (${paymentTermsLabel(terms)}).` : 'Payment due on receipt of invoice.';
  if (!(depositAmount > 0)) return base;
  return `${base} Deposit due before work begins: ${depositPct > 0 ? `${depositPct}% ` : ''}(${money(depositAmount)}), taken off the final invoice.`;
}

/** Add-ons the customer picked on the quote, as invoice lines ("Storage upgrade: 4 TB drive"). */
export function selectedAddOnLines(q: { optionalChoices?: { title?: string; options?: { id: string; label: string; priceAdjustment: number; selected: boolean }[] }[] | null }) {
  return (q.optionalChoices || []).flatMap(g => (g.options || []).filter(o => o.selected && Number(o.priceAdjustment)).map(o => ({
    id: `addon-${o.id}`, name: g.title ? `${g.title}: ${o.label}` : o.label,
    quantity: 1, unitPrice: Number(o.priceAdjustment) || 0, section: 'labor' as const, taxable: false, required: true,
  })));
}
