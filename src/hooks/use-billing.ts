'use client';

import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { onSharedSnapshot } from '@/lib/shared-snapshot';
import { DEFAULT_PRICING, type PricingSettings, type ServicePlan, type Subscription } from '@/lib/billing';

/** Every service plan (any status), in display order. Small collection. */
export function useServicePlans(): { plans: ServicePlan[]; loading: boolean } {
  const [state, setState] = useState<{ plans: ServicePlan[]; loading: boolean }>({ plans: [], loading: true });
  useEffect(() => onSharedSnapshot('servicePlans', snap => {
    const plans = snap.docs
      .map(d => ({ ...d.data(), id: d.id } as ServicePlan))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
    setState({ plans, loading: false });
  }, () => setState({ plans: [], loading: false })), []);
  return state;
}

/** Labor rates, material markups and sales tax — adminConfig/pricing. */
export function usePricingSettings(): { settings: PricingSettings; loading: boolean; exists: boolean } {
  const [state, setState] = useState({ settings: DEFAULT_PRICING, loading: true, exists: false });
  useEffect(() => onSnapshot(doc(db, 'adminConfig', 'pricing'), snap => {
    const data = snap.exists() ? snap.data() as Partial<PricingSettings> : {};
    setState({
      settings: {
        ...DEFAULT_PRICING,
        ...data,
        laborRates: data.laborRates ?? [],
        materialMarkupPct: data.materialMarkupPct ?? {},
      },
      loading: false,
      exists: snap.exists(),
    });
  }, () => setState(s => ({ ...s, loading: false }))), []);
  return state;
}

/** All client subscriptions — admin screens. */
export function useAllSubscriptions(enabled = true): { subscriptions: Subscription[]; loading: boolean } {
  const [state, setState] = useState<{ subscriptions: Subscription[]; loading: boolean }>({ subscriptions: [], loading: true });
  useEffect(() => {
    if (!enabled) return;
    return onSharedSnapshot('subscriptions', snap => {
      setState({ subscriptions: snap.docs.map(d => ({ ...d.data(), id: d.id } as Subscription)), loading: false });
    }, () => setState({ subscriptions: [], loading: false }));
  }, [enabled]);
  return state;
}

/** One client's subscriptions and requests (client portal, site/client pages). */
export function useClientSubscriptions(clientId: string | null | undefined): { subscriptions: Subscription[]; loading: boolean } {
  const [state, setState] = useState<{ subscriptions: Subscription[]; loading: boolean }>({ subscriptions: [], loading: true });
  useEffect(() => {
    if (!clientId) { setState({ subscriptions: [], loading: false }); return; }
    return onSnapshot(query(collection(db, 'subscriptions'), where('clientId', '==', clientId)), snap => {
      setState({ subscriptions: snap.docs.map(d => ({ ...d.data(), id: d.id } as Subscription)), loading: false });
    }, () => setState({ subscriptions: [], loading: false }));
  }, [clientId]);
  return state;
}
