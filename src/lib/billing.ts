/**
 * Service plans, client subscriptions and pricing settings.
 *
 * Shaped to map onto Stripe without a redesign (docs/billing-roadmap.md):
 *  - ServicePlan        → Stripe Product (one Price per billing interval)
 *  - Subscription       → Stripe Subscription (collection 'stripe'), or billed
 *                          by hand from the app until Stripe is connected
 *  - PricingSettings    → labor rates, material markup by category, sales tax
 *
 * Money is stored in dollars with cents (Stripe wants integer cents — the sync
 * converts with toCents()).
 */

export type BillingInterval = 'month' | 'quarter' | 'year';

export const INTERVAL_LABELS: Record<BillingInterval, string> = {
  month: 'Monthly',
  quarter: 'Quarterly',
  year: 'Annual',
};
const INTERVAL_MONTHS: Record<BillingInterval, number> = { month: 1, quarter: 3, year: 12 };

export type PlanPrice = { interval: BillingInterval; amount: number };

/** What a plan actually gives the client — the app enforces these. */
export type PlanBenefits = {
  /** Request response target (hours). Drives the client SLA clock. */
  responseHours: number;
  /** % off labor lines on quotes and invoices for subscribers. */
  laborDiscountPct: number;
  /** Included site visits per period (0 = none). */
  includedVisits: number;
  includedVisitsPer: BillingInterval;
  /** Sites covered; null = unlimited. */
  siteLimit: number | null;
  afterHoursDispatch: boolean;
};

export type ServicePlan = {
  id: string;
  name: string;
  description: string;
  /** standard = offered to everyone; custom = written for one client. */
  kind: 'standard' | 'custom';
  /** Custom plans belong to one client, by user id (never by company name). */
  clientId: string | null;
  /** Archived plans keep existing subscriptions but can't be chosen. Stripe
   *  prices can't be deleted, so plans are archived, not removed. */
  status: 'draft' | 'active' | 'archived';
  prices: PlanPrice[];
  setupFee: number;
  /** Minimum commitment in months; null = month to month. */
  minimumTermMonths: number | null;
  benefits: PlanBenefits;
  /** Customer-facing bullet points. */
  features: string[];
  sortOrder: number;
  /** Written by the Stripe sync — never edited by hand. */
  stripe?: { productId: string; priceIds: Partial<Record<BillingInterval, string>> };
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionStatus = 'pending' | 'active' | 'past_due' | 'paused' | 'canceled';

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  pending: 'Requested',
  active: 'Active',
  past_due: 'Past due',
  paused: 'Paused',
  canceled: 'Canceled',
};

export type Subscription = {
  id: string;
  clientId: string;
  /** Snapshot for lists; the client record is the source of truth. */
  clientName: string;
  planId: string;
  interval: BillingInterval;
  status: SubscriptionStatus;
  /** 'manual' = invoiced from the app; 'stripe' = Stripe charges automatically. */
  collection: 'manual' | 'stripe';
  /** Negotiated price for this client; null = the plan's price. */
  priceOverride: number | null;
  startDate: string | null;
  /** Next renewal / invoice date (yyyy-MM-dd). */
  nextBillingDate: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  /** A client asking to change plans: the subscription this would replace. */
  replacesSubscriptionId: string | null;
  notes: string;
  requestedBy: string | null;
  stripe?: { customerId: string; subscriptionId: string };
  createdAt: string;
  updatedAt: string;
};

// ── Pricing settings (adminConfig/pricing) ─────────────────────────────────

export const MATERIAL_CATEGORIES = [
  'Cable & Wire',
  'Fiber',
  'Connectivity',
  'Racks & Enclosures',
  'Network Equipment',
  'Cameras & Security',
  'Audio/Visual',
  'Automation & Controls',
  'Hardware & Supplies',
  'Other',
] as const;

export type LaborRate = { id: string; label: string; rate: number; unit: 'hour' | 'flat'; minimum: string };

export type PricingSettings = {
  laborRates: LaborRate[];
  /** Markup % by material category; categories not listed use defaultMarkupPct. */
  materialMarkupPct: Record<string, number>;
  defaultMarkupPct: number;
  /** Sales tax rate %, applied to materials only. */
  salesTaxPct: number;
  updatedAt?: string;
  updatedBy?: string;
};

export const DEFAULT_PRICING: PricingSettings = {
  laborRates: [],
  materialMarkupPct: {},
  defaultMarkupPct: 20,
  salesTaxPct: 6,
};

// ── Helpers ────────────────────────────────────────────────────────────────

export const roundCents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const toCents = (n: number) => Math.round(n * 100);

export const formatMoney = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export function planPrice(plan: ServicePlan | undefined, interval: BillingInterval): number | null {
  return plan?.prices.find(p => p.interval === interval)?.amount ?? null;
}

/** The amount this subscription bills each period. */
export function subscriptionAmount(sub: Subscription, plan: ServicePlan | undefined): number {
  return sub.priceOverride ?? planPrice(plan, sub.interval) ?? 0;
}

/** Monthly recurring revenue contributed by a subscription. */
export function monthlyValue(sub: Subscription, plan: ServicePlan | undefined): number {
  return roundCents(subscriptionAmount(sub, plan) / INTERVAL_MONTHS[sub.interval]);
}

/**
 * Next billing date one interval after `from` (yyyy-MM-dd). `anchorDay` is
 * the subscription's original day of month, so a Jan 31 start bills Feb 28,
 * then Mar 31 (as Stripe does) instead of drifting to the 28th for good.
 */
export function addInterval(from: string, interval: BillingInterval, anchorDay?: number): string {
  const [y, m, d] = from.split('-').map(Number);
  const date = new Date(y, m - 1 + INTERVAL_MONTHS[interval], 1);
  // Clamp the day (Jan 31 + 1 month → Feb 28/29).
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(anchorDay && anchorDay >= 1 && anchorDay <= 31 ? anchorDay : d, lastDay));
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** Today's local calendar date as yyyy-MM-dd. */
export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function markupFor(category: string | undefined, settings: PricingSettings): number {
  if (category && settings.materialMarkupPct[category] != null) return settings.materialMarkupPct[category];
  return settings.defaultMarkupPct;
}

/** Sell price for a material from its cost and category markup. */
export function materialSellPrice(cost: number, category: string | undefined, settings: PricingSettings): number {
  return roundCents(cost * (1 + markupFor(category, settings) / 100));
}

/** Sales tax on a line — materials only, per company policy. */
export function lineTax(amount: number, isMaterial: boolean, settings: PricingSettings): number {
  return isMaterial ? roundCents(amount * settings.salesTaxPct / 100) : 0;
}

export function emptyPlan(sortOrder = 0): Omit<ServicePlan, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: '',
    description: '',
    kind: 'standard',
    clientId: null,
    status: 'draft',
    prices: [{ interval: 'month', amount: 0 }],
    setupFee: 0,
    minimumTermMonths: null,
    benefits: {
      responseHours: 48,
      laborDiscountPct: 0,
      includedVisits: 0,
      includedVisitsPer: 'year',
      siteLimit: null,
      afterHoursDispatch: false,
    },
    features: [],
    sortOrder,
  };
}

/** Subscriptions that count as current (billing or about to). */
export const isLiveSubscription = (s: Subscription) =>
  s.status === 'active' || s.status === 'past_due' || s.status === 'paused';
