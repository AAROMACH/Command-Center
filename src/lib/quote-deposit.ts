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
