'use client';

import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { PlanTier, Technician } from './types';
import {
  DEFAULT_PRICING, type BillingInterval, type LaborRate, type PricingSettings, type ServicePlan, type Subscription,
} from './billing';

/**
 * One-time import from the old Plans page storage:
 *  - adminConfig/servicePricing.plans  (array of PlanTier)  → servicePlans/{same id}
 *  - adminConfig/serviceRates                               → adminConfig/pricing
 *  - users.planId + subscriptionStatus                      → subscriptions
 * Plan ids are kept, so every client's existing planId still matches.
 */

const PERIOD: Record<string, BillingInterval> = { monthly: 'month', quarterly: 'quarter', annual: 'year' };

function responseHours(rt: string | undefined): number {
  const t = (rt || '').toLowerCase();
  if (t.includes('same')) return 8;
  const n = parseFloat(t);
  if (!isFinite(n) || n <= 0) return 48;
  return t.includes('d') && !t.includes('h') ? n * 24 : n;
}

function laborDiscount(features: string[]): number {
  for (const f of features) {
    const m = /(\d+(?:\.\d+)?)\s*%\s*off[^,]*labor/i.exec(f);
    if (m) return parseFloat(m[1]);
  }
  return 0;
}

export type LegacyPlanPreview = {
  legacy: PlanTier;
  plan: Omit<ServicePlan, 'createdAt' | 'updatedAt'>;
  /** Custom plan whose client couldn't be found by name — likely demo data. */
  unmatchedClient: boolean;
  subscriberCount: number;
};

export type MigrationPreview = {
  plans: LegacyPlanPreview[];
  pricing: PricingSettings | null;
  subscriptions: Omit<Subscription, 'createdAt' | 'updatedAt'>[];
};

export async function buildMigrationPreview(users: Technician[]): Promise<MigrationPreview> {
  const [pricingSnap, ratesSnap] = await Promise.all([
    getDoc(doc(db, 'adminConfig', 'servicePricing')),
    getDoc(doc(db, 'adminConfig', 'serviceRates')),
  ]);
  const legacyPlans: PlanTier[] = pricingSnap.exists() && Array.isArray(pricingSnap.data().plans) ? pricingSnap.data().plans : [];
  const clients = users.filter(u => (u.roles || []).includes('client') || u.role === 'client');

  const plans: LegacyPlanPreview[] = legacyPlans.map((p, i) => {
    const client = p.type === 'custom' && p.clientName
      ? clients.find(c => (c.clientCompany || c.name) === p.clientName)
      : undefined;
    const benefits = {
      responseHours: responseHours(p.responseTime),
      laborDiscountPct: laborDiscount(p.features || []),
      includedVisits: 0,
      includedVisitsPer: 'year' as BillingInterval,
      siteLimit: p.siteLimit ?? null,
      afterHoursDispatch: (p.features || []).some(f => /after-hours|emergency dispatch/i.test(f)),
    };
    return {
      legacy: p,
      plan: {
        id: p.id,
        name: p.name,
        description: p.description || '',
        kind: p.type === 'custom' ? 'custom' : 'standard',
        clientId: client?.id ?? null,
        status: p.status === 'inactive' ? 'archived' : 'active',
        prices: [{ interval: PERIOD[p.billingPeriod] || 'month', amount: Number(p.price) || 0 }],
        setupFee: 0,
        minimumTermMonths: null,
        benefits,
        features: p.features || [],
        sortOrder: i,
      },
      unmatchedClient: p.type === 'custom' && !client,
      subscriberCount: clients.filter(c => c.planId === p.id && c.subscriptionStatus === 'active').length,
    };
  });

  let pricing: PricingSettings | null = null;
  if (ratesSnap.exists()) {
    const r = ratesSnap.data() as Record<string, any>;
    const labels: Record<string, string> = r.labels || {};
    const units: Record<string, LaborRate['unit']> = { travelFee: 'flat', minimumServiceCall: 'flat' };
    const laborRates: LaborRate[] = Object.entries(r)
      .filter(([k, v]) => typeof v === 'number' && k !== 'materialMarkup')
      .map(([k, v]) => ({ id: k, label: labels[k] || k, rate: v as number, unit: units[k] || 'hour', minimum: '' }));
    pricing = {
      ...DEFAULT_PRICING,
      laborRates,
      defaultMarkupPct: typeof r.materialMarkup === 'number' ? r.materialMarkup : DEFAULT_PRICING.defaultMarkupPct,
    };
  }

  const planInterval = new Map(plans.map(p => [p.plan.id, p.plan.prices[0]?.interval || 'month'] as const));
  const subscriptions = clients
    .filter(c => c.planId && (c.subscriptionStatus === 'active' || c.subscriptionStatus === 'pending'))
    .map(c => {
      const start = (c.subscriptionStartDate || '').slice(0, 10) || null;
      return {
        id: `sub-${c.id}`,
        clientId: c.id,
        clientName: c.clientCompany || c.name,
        planId: c.planId!,
        interval: planInterval.get(c.planId!) || 'month',
        status: c.subscriptionStatus === 'active' ? 'active' : 'pending',
        collection: 'manual',
        priceOverride: null,
        startDate: start,
        nextBillingDate: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        replacesSubscriptionId: null,
        notes: 'Imported from the old plans page.',
        requestedBy: null,
      } as Omit<Subscription, 'createdAt' | 'updatedAt'>;
    });

  return { plans, pricing, subscriptions };
}

export async function runMigration(preview: MigrationPreview, includePlanIds: Set<string>) {
  const stamp = new Date().toISOString();
  const writes: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
  for (const p of preview.plans) {
    if (!includePlanIds.has(p.plan.id)) continue;
    writes.push(b => b.set(doc(db, 'servicePlans', p.plan.id), { ...p.plan, createdAt: stamp, updatedAt: stamp }));
  }
  if (preview.pricing) {
    const pricing = preview.pricing;
    writes.push(b => b.set(doc(db, 'adminConfig', 'pricing'), { ...pricing, updatedAt: stamp }, { merge: true }));
  }
  for (const s of preview.subscriptions) {
    writes.push(b => b.set(doc(db, 'subscriptions', s.id), { ...s, createdAt: stamp, updatedAt: stamp }));
  }
  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(db);
    writes.slice(i, i + 400).forEach(w => w(batch));
    await batch.commit();
  }
  return writes.length;
}
