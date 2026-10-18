'use client';

import { useMemo, useState } from 'react';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, Clock, Percent, CalendarClock, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Technician } from '@/lib/types';
import { useClientSubscriptions, useServicePlans } from '@/hooks/use-billing';
import {
  formatMoney, INTERVAL_LABELS, isLiveSubscription, planPrice, subscriptionAmount, SUBSCRIPTION_STATUS_LABELS,
  type BillingInterval, type ServicePlan,
} from '@/lib/billing';
import { requestPlan } from '@/lib/billing-actions';

/** The client's plan, from their real subscription — Billing and Financials. */
export function useClientPlan(client: Technician | null | undefined) {
  const { plans } = useServicePlans();
  const { subscriptions, loading } = useClientSubscriptions(client?.id);
  const current = subscriptions.find(isLiveSubscription) || null;
  const pending = subscriptions.find(s => s.status === 'pending') || null;
  const plan = current ? plans.find(p => p.id === current.planId) : undefined;
  // What this client may pick: active standard plans + their own custom plans.
  const offered = plans.filter(p => p.status === 'active' && (p.kind === 'standard' || p.clientId === client?.id));
  return { plans, offered, current, pending, plan, loading };
}

export function ClientPlanCard({ client }: { client: Technician | null | undefined }) {
  const { toast } = useToast();
  const { offered, current, pending, plan, loading } = useClientPlan(client);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<{ planId: string; interval: BillingInterval } | null>(null);
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const pendingPlan = useMemo(() => offered.find(p => p.id === pending?.planId), [offered, pending]);

  const submit = async () => {
    if (!client || !choice) return;
    setSending(true);
    try {
      await requestPlan({
        clientId: client.id,
        clientName: client.clientCompany || client.name,
        planId: choice.planId,
        interval: choice.interval,
        replacesSubscriptionId: current?.id ?? null,
        notes: notes.trim(),
      });
      toast({ title: 'Request sent', description: 'Your account manager will confirm the change.' });
      setOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not send request', description: e.message });
    } finally {
      setSending(false);
    }
  };

  const withdraw = async () => {
    if (!pending) return;
    try {
      await deleteDoc(doc(db, 'subscriptions', pending.id));
      toast({ title: 'Request withdrawn' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not withdraw', description: e.message });
    }
  };

  return (
    <>
      <Card className="rounded-xl border-border-main bg-bg-secondary shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Service plan</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-[12px] text-text-muted">Loading plan…</p>
          ) : current ? (
            <>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-text-primary">{plan?.name || 'Your plan'}</h3>
                  {current.status !== 'active' && <Badge variant="disputed" className="text-[10px] font-semibold uppercase tracking-wide">{SUBSCRIPTION_STATUS_LABELS[current.status]}</Badge>}
                </div>
                <p className="text-[13px] text-text-muted mt-1">
                  {formatMoney(subscriptionAmount(current, plan))} · {INTERVAL_LABELS[current.interval]}
                  {current.nextBillingDate && <> · next bill {current.nextBillingDate}</>}
                </p>
                {current.cancelAtPeriodEnd && <p className="text-[12px] text-accent-gold mt-1">Ends {current.nextBillingDate || 'at the end of this period'}.</p>}
              </div>
              {plan && <PlanBenefitList plan={plan} />}
            </>
          ) : (
            <p className="text-[13px] text-text-muted">You&apos;re not on a service plan. Plans add priority response and labor discounts.</p>
          )}
          {pending && (
            <div className="p-2.5 rounded-md border border-accent-gold/40 bg-accent-gold/5 text-[12px] flex items-center justify-between gap-2">
              <span>Requested: <b>{pendingPlan?.name || 'a plan change'}</b> ({INTERVAL_LABELS[pending.interval].toLowerCase()}) — awaiting approval.</span>
              <button onClick={withdraw} className="text-[12px] font-medium text-text-muted hover:text-text-primary shrink-0">Withdraw</button>
            </div>
          )}
        </CardContent>
        {offered.length > 0 && !pending && (
          <CardFooter className="pt-0">
            <Button variant="outline" className="w-full"
              onClick={() => { setChoice(null); setNotes(''); setOpen(true); }}>
              {current ? 'Change plan' : 'Choose a plan'}
            </Button>
          </CardFooter>
        )}
      </Card>

      <Dialog open={open} onOpenChange={v => { if (!v && !sending) setOpen(false); }}>
        <DialogContent className="sm:max-w-[760px] max-h-[90vh] p-0 flex flex-col bg-bg-elevated border-border-main">
          <DialogHeader className="p-4 sm:p-6 pb-3 border-b border-border-sub text-left">
            <DialogTitle className="text-base font-semibold">{current ? 'Change plan' : 'Choose a plan'}</DialogTitle>
            <DialogDescription className="text-[13px]">Pick a plan and billing option. Your account manager confirms before anything changes.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-3">
            {offered.map(p => (
              <div key={p.id} className={cn('p-4 rounded-xl border flex flex-col gap-2',
                choice?.planId === p.id ? 'border-brand-red ring-1 ring-brand-red bg-brand-red/5' : 'border-border-sub bg-bg-primary')}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{p.name}</p>
                  {current?.planId === p.id && <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wide">Current</Badge>}
                </div>
                {p.description && <p className="text-[12px] text-text-muted">{p.description}</p>}
                <PlanBenefitList plan={p} />
                <div className="mt-auto pt-2 space-y-1.5">
                  {p.prices.map(pr => {
                    const selected = choice?.planId === p.id && choice.interval === pr.interval;
                    return (
                      <button key={pr.interval} type="button" onClick={() => setChoice({ planId: p.id, interval: pr.interval })}
                        className={cn('w-full flex items-center justify-between px-3 py-2 rounded-md border text-left text-xs transition-colors',
                          selected ? 'border-brand-red bg-brand-red/10' : 'border-border-sub hover:border-text-muted')}>
                        <span className="font-mono font-bold">{formatMoney(pr.amount)}</span>
                        <span className="flex items-center gap-1 text-[12px] text-text-muted">{INTERVAL_LABELS[pr.interval]}{selected && <Check size={12} className="text-brand-red" />}</span>
                      </button>
                    );
                  })}
                  {p.setupFee > 0 && <p className="text-[11px] text-text-muted">+ {formatMoney(p.setupFee)} one-time setup</p>}
                </div>
              </div>
            ))}
            <div className="md:col-span-3 space-y-1">
              <p className="text-[12px] font-medium text-text-secondary">Note (optional)</p>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="text-[13px] min-h-[60px] resize-none"
                placeholder="Anything we should know — sites to cover, start date…" />
            </div>
          </div>
          <DialogFooter className="p-4 sm:p-6 border-t border-border-sub flex flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={submit} disabled={!choice || sending || (choice.planId === current?.planId && choice.interval === current?.interval)}
              className="w-full sm:w-auto">
              {sending && <Loader2 size={12} className="mr-1.5 animate-spin" />}
              {choice ? `Request ${offered.find(p => p.id === choice.planId)?.name} · ${formatMoney(planPrice(offered.find(p => p.id === choice.planId), choice.interval) || 0)}` : 'Pick a billing option'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PlanBenefitList({ plan }: { plan: ServicePlan }) {
  const b = plan.benefits;
  return (
    <ul className="space-y-1 text-[12px] text-text-secondary">
      <li className="flex items-center gap-1.5"><Clock size={11} className="text-text-muted" /> {b.responseHours}-hour response</li>
      {b.laborDiscountPct > 0 && <li className="flex items-center gap-1.5"><Percent size={11} className="text-text-muted" /> {b.laborDiscountPct}% off labor</li>}
      {b.includedVisits > 0 && (
        <li className="flex items-center gap-1.5"><CalendarClock size={11} className="text-text-muted" /> {b.includedVisits} site visit{b.includedVisits === 1 ? '' : 's'} per {b.includedVisitsPer}</li>
      )}
      {plan.features.map(f => <li key={f} className="flex items-center gap-1.5"><Check size={11} className="text-text-green" /> {f}</li>)}
    </ul>
  );
}
