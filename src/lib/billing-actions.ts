'use client';

import { doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from './firebase';
import { createDocId } from './generateId';
import { ID_PREFIXES } from './constants';
import { auditEvent } from './audit';
import {
  addInterval, type BillingInterval, type PricingSettings, type ServicePlan, type Subscription,
} from './billing';

/**
 * Writes for service plans and subscriptions. The `subscriptions` collection
 * is the only record of who is on what plan — the old planId /
 * subscriptionStatus fields on user docs were placeholders and are no longer
 * read or written.
 */

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);
const actor = () => ({ id: auth.currentUser?.uid || '', name: auth.currentUser?.displayName || 'Admin' });

async function audit(sub: Pick<Subscription, 'id' | 'clientId'>, action: string, detail: string) {
  const a = actor();
  await auditEvent('subscriptions', sub.id, a.id, a.name, action, detail).catch(() => {});
}

// ── Plans ──────────────────────────────────────────────────────────────────

export async function savePlan(plan: Omit<ServicePlan, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<ServicePlan, 'id' | 'createdAt'>>): Promise<string> {
  const id = plan.id || await createDocId(ID_PREFIXES.PLAN_TIER);
  const { stripe: _ignored, ...editable } = plan as ServicePlan;
  await setDoc(doc(db, 'servicePlans', id), {
    ...editable,
    id,
    createdAt: plan.createdAt || now(),
    updatedAt: now(),
  }, { merge: true });
  return id;
}

export async function setPlanStatus(planId: string, status: ServicePlan['status']) {
  await updateDoc(doc(db, 'servicePlans', planId), { status, updatedAt: now() });
}

// ── Subscriptions (admin) ──────────────────────────────────────────────────

export type NewSubscription = {
  clientId: string;
  clientName: string;
  planId: string;
  interval: BillingInterval;
  startDate: string;
  priceOverride: number | null;
  notes: string;
};

export async function createSubscription(input: NewSubscription): Promise<string> {
  const id = await createDocId(ID_PREFIXES.SUBSCRIPTION);
  const sub: Subscription = {
    id,
    ...input,
    status: 'active',
    collection: 'manual',
    nextBillingDate: input.startDate,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    replacesSubscriptionId: null,
    requestedBy: null,
    createdAt: now(),
    updatedAt: now(),
  };
  const batch = writeBatch(db);
  batch.set(doc(db, 'subscriptions', id), sub);
  await batch.commit();
  await audit(sub, 'subscription_created', `Started ${input.interval} subscription to plan ${input.planId} for ${input.clientName}`);
  return id;
}

export async function updateSubscription(sub: Subscription, patch: Partial<Pick<Subscription,
  'planId' | 'interval' | 'priceOverride' | 'nextBillingDate' | 'notes' | 'status'>>) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'subscriptions', sub.id), { ...patch, updatedAt: now() });
  await batch.commit();
  await audit(sub, 'subscription_updated', `Updated: ${Object.keys(patch).join(', ')}`);
}

/** Cancel now, or at the end of the current period (keeps service until then). */
export async function cancelSubscription(sub: Subscription, atPeriodEnd: boolean) {
  const batch = writeBatch(db);
  if (atPeriodEnd) {
    batch.update(doc(db, 'subscriptions', sub.id), { cancelAtPeriodEnd: true, updatedAt: now() });
  } else {
    batch.update(doc(db, 'subscriptions', sub.id), { status: 'canceled', canceledAt: now(), cancelAtPeriodEnd: false, updatedAt: now() });
  }
  await batch.commit();
  await audit(sub, 'subscription_canceled', atPeriodEnd ? `Cancels on ${sub.nextBillingDate || 'period end'}` : 'Canceled immediately');
}

/** Record that this period was billed: move the next billing date forward. */
export async function markPeriodBilled(sub: Subscription) {
  const from = sub.nextBillingDate || today();
  const ending = sub.cancelAtPeriodEnd;
  const batch = writeBatch(db);
  batch.update(doc(db, 'subscriptions', sub.id), ending
    ? { status: 'canceled', canceledAt: now(), nextBillingDate: null, updatedAt: now() }
    : { nextBillingDate: addInterval(from, sub.interval), updatedAt: now() });
  await batch.commit();
  await audit(sub, 'subscription_billed', ending ? `Final period billed (${from}); subscription ended` : `Billed period starting ${from}`);
}

// ── Requests ───────────────────────────────────────────────────────────────

/** Client asks for a plan (new, or a change that replaces their current one). */
export async function requestPlan(input: {
  clientId: string; clientName: string; planId: string; interval: BillingInterval;
  replacesSubscriptionId: string | null; notes: string;
}): Promise<string> {
  const id = await createDocId(ID_PREFIXES.SUBSCRIPTION);
  const sub: Subscription = {
    id,
    ...input,
    status: 'pending',
    collection: 'manual',
    priceOverride: null,
    startDate: null,
    nextBillingDate: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    requestedBy: auth.currentUser?.uid || input.clientId,
    createdAt: now(),
    updatedAt: now(),
  };
  await setDoc(doc(db, 'subscriptions', id), sub);
  return id;
}

/** Approve a request: it becomes active; a plan change ends the old one. */
export async function approveRequest(req: Subscription, terms: { startDate: string; interval: BillingInterval; priceOverride: number | null }) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'subscriptions', req.id), {
    status: 'active',
    planId: req.planId,
    interval: terms.interval,
    priceOverride: terms.priceOverride,
    startDate: terms.startDate,
    nextBillingDate: terms.startDate,
    updatedAt: now(),
  });
  if (req.replacesSubscriptionId) {
    batch.update(doc(db, 'subscriptions', req.replacesSubscriptionId), {
      status: 'canceled', canceledAt: now(), cancelAtPeriodEnd: false, updatedAt: now(),
    });
  }
  await batch.commit();
  await audit(req, 'subscription_approved', `Approved ${req.clientName}'s request for plan ${req.planId}`);
}

export async function declineRequest(req: Subscription, reason: string) {
  await updateDoc(doc(db, 'subscriptions', req.id), {
    status: 'canceled', canceledAt: now(), notes: [req.notes, reason && `Declined: ${reason}`].filter(Boolean).join('\n'), updatedAt: now(),
  });
  await audit(req, 'subscription_declined', reason || 'Declined');
}

// ── Pricing ────────────────────────────────────────────────────────────────

export async function savePricing(settings: PricingSettings) {
  await setDoc(doc(db, 'adminConfig', 'pricing'), {
    ...settings,
    updatedAt: now(),
    updatedBy: auth.currentUser?.uid || '',
  });
}
