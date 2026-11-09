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
