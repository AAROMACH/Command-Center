/**
 * Line items + totals shared by quotes and invoices (components/price-doc-editor).
 *
 * Both documents split lines into Labor (never taxed) and Materials (taxed
 * per line, at the company sales tax rate from Assets & Materials → Labor &
 * pricing). A client on an active service plan gets that plan's labor and
 * materials discounts, taken before tax.
 *
 * Quotes and invoices keep their own stored shapes (QuoteLineItem /
 * InvoiceLineItem); the editor converts to and from PriceLine.
 */
import type { Invoice, InvoiceLineItem, QuoteLineItem } from './types';
import { roundCents, type PricingSettings, type ServicePlan, type Subscription, isLiveSubscription } from './billing';

export type PriceSection = 'labor' | 'material';

export type PriceLine = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  section: PriceSection;
  /** Materials only — labor is never taxed. */
  taxable: boolean;
  /** Labor only: emergency / after-hours rate (1.5×). */
  emergency?: boolean;
  /** Quotes: false = the client may leave it out. */
  required?: boolean;
  /** The quote category it came from, kept so a round trip doesn't change it. */
  sourceCategory?: QuoteLineItem['category'];
};

/** A plan discount as applied to one document (snapshot — the plan can change later). */
export type PlanDiscount = { planId: string; planName: string; laborPct: number; materialsPct: number };

export const EMERGENCY_MULTIPLIER = 1.5;

export const lineAmount = (l: PriceLine) =>
  roundCents((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * (l.section === 'labor' && l.emergency ? EMERGENCY_MULTIPLIER : 1));

export type PriceTotals = {
  laborSubtotal: number;
  materialsSubtotal: number;
  /** Before discount. */
  subtotal: number;
  laborDiscount: number;
  materialsDiscount: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
};

export function priceTotals(lines: PriceLine[], discount: PlanDiscount | null, salesTaxPct: number): PriceTotals {
  const sum = (rows: PriceLine[]) => roundCents(rows.reduce((s, l) => s + lineAmount(l), 0));
  const labor = lines.filter(l => l.section === 'labor');
  const materials = lines.filter(l => l.section === 'material');
  const laborSubtotal = sum(labor);
  const materialsSubtotal = sum(materials);
  const lp = (discount?.laborPct || 0) / 100;
  const mp = (discount?.materialsPct || 0) / 100;
  const laborDiscount = roundCents(laborSubtotal * lp);
  const materialsDiscount = roundCents(materialsSubtotal * mp);
  // Tax on what the client actually pays for taxable materials.
  const taxAmount = roundCents(sum(materials.filter(l => l.taxable)) * (1 - mp) * (salesTaxPct || 0) / 100);
  const subtotal = roundCents(laborSubtotal + materialsSubtotal);
  const discountAmount = roundCents(laborDiscount + materialsDiscount);
  return { laborSubtotal, materialsSubtotal, subtotal, laborDiscount, materialsDiscount, discountAmount, taxAmount, total: roundCents(subtotal - discountAmount + taxAmount) };
}

/** The discount a client's active service plan gives, or null. */
export function planDiscountFor(clientId: string | null | undefined, subscriptions: Subscription[], plans: ServicePlan[]): PlanDiscount | null {
  if (!clientId) return null;
  const sub = subscriptions.find(s => s.clientId === clientId && isLiveSubscription(s));
  const plan = sub && plans.find(p => p.id === sub.planId);
  if (!plan) return null;
  const laborPct = plan.benefits?.laborDiscountPct || 0;
  const materialsPct = plan.benefits?.materialsDiscountPct || 0;
  if (!laborPct && !materialsPct) return null;
  return { planId: plan.id, planName: plan.name, laborPct, materialsPct };
}

export function describeDiscount(d: PlanDiscount): string {
  return [d.laborPct ? `${d.laborPct}% off labor` : '', d.materialsPct ? `${d.materialsPct}% off materials` : ''].filter(Boolean).join(', ');
}

// ── Price book ────────────────────────────────────────────────────────────────

export type PriceBookItem = { id: string; name: string; unitPrice: number; section: PriceSection; taxable: boolean; group: string };

/** Sell price for a material: its billable price, or cost + category markup. */
export function materialPrice(m: { billablePrice?: number; standardCost?: number; category?: string }, settings: PricingSettings): number {
  if ((m.billablePrice || 0) > 0) return roundCents(m.billablePrice!);
  const markup = m.category && settings.materialMarkupPct[m.category] != null ? settings.materialMarkupPct[m.category] : settings.defaultMarkupPct;
  return roundCents((m.standardCost || 0) * (1 + markup / 100));
}

// ── Stored shapes ↔ PriceLine ─────────────────────────────────────────────────

const LABOR_CATEGORIES: QuoteLineItem['category'][] = ['labor', 'service', 'travel'];

export function fromQuoteLines(items: QuoteLineItem[] = []): PriceLine[] {
  return items.map(i => {
    const section: PriceSection = LABOR_CATEGORIES.includes(i.category) ? 'labor' : 'material';
    return {
      id: i.id, name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, section,
      taxable: section === 'material' && !!i.taxable, emergency: !!(i as any).emergency,
      required: i.required !== false, sourceCategory: i.category,
    };
  });
}

export function toQuoteLines(lines: PriceLine[]): QuoteLineItem[] {
  return lines.map(l => {
    const keep = l.sourceCategory && (LABOR_CATEGORIES.includes(l.sourceCategory) === (l.section === 'labor'));
    return {
      id: l.id, name: l.name, description: '', quantity: Number(l.quantity) || 0, unitPrice: Number(l.unitPrice) || 0,
      total: lineAmount(l), taxable: l.section === 'material' && l.taxable,
      category: keep ? l.sourceCategory! : (l.section === 'labor' ? 'labor' : 'materials'),
      required: l.required !== false,
      ...(l.emergency && l.section === 'labor' ? { emergency: true } : {}),
    } as QuoteLineItem;
  });
}

export function fromInvoiceLines(items: InvoiceLineItem[] = []): PriceLine[] {
  return items.map(i => ({
    id: i.id, name: i.description, quantity: i.quantity, unitPrice: i.unitPrice, section: i.category,
    // Older invoices taxed every material line.
    taxable: i.category === 'material' && i.taxable !== false, emergency: !!i.isEmergencyProtocol,
  }));
}

export function toInvoiceLines(lines: PriceLine[]): InvoiceLineItem[] {
  return lines.map(l => ({
    id: l.id, description: l.name, quantity: Number(l.quantity) || 0, unitPrice: Number(l.unitPrice) || 0, category: l.section,
    isEmergencyProtocol: l.section === 'labor' && !!l.emergency, taxable: l.section === 'material' && l.taxable,
  }));
}

/** An invoice's revenue: subtotal less any plan discount (tax isn't revenue). */
export const invoiceNet = (inv: Pick<Invoice, 'subtotal' | 'total' | 'discountAmount'>) =>
  roundCents((Number(inv.subtotal ?? inv.total) || 0) - (Number(inv.discountAmount) || 0));
