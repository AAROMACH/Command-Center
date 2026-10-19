'use client';
import { PageHeader } from '@/components/page-header';

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  BookOpen, Plus, Pencil, Archive, RotateCcw, Copy, Building2, CalendarClock, CheckCircle2,
  XCircle, Receipt, Ban, Info, Download, Search, Clock, Percent, MapPin, Moon,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { useLiveUsers } from '@/hooks/use-live-users';
import { canEditUserPay } from '@/lib/profile-permissions';
import { isClient } from '@/lib/permissions';
import { useAllSubscriptions, useServicePlans } from '@/hooks/use-billing';
import {
  formatMoney, INTERVAL_LABELS, isLiveSubscription, monthlyValue, subscriptionAmount, SUBSCRIPTION_STATUS_LABELS,
  type ServicePlan, type Subscription,
  localDay,
} from '@/lib/billing';
import { cancelSubscription, declineRequest, markPeriodBilled, setPlanStatus } from '@/lib/billing-actions';
import { PlanEditorDialog } from './components/plan-editor-dialog';
import { SubscriptionDialog, type SubscriptionDialogMode } from './components/subscription-dialog';

/**
 * Service plans, client subscriptions and requests. Prices (labor rates,
 * markup, sales tax) live in Assets & Materials → Labor & pricing; a plan only
 * sets the discounts its subscribers get on quotes and invoices. All data is live
 * from Firestore — see lib/billing.ts for the model and
 * docs/billing-roadmap.md for how it maps onto Stripe and QuickBooks.
 *
 * Billing staff (payroll / super admin) manage everything; other admins see
 * it read-only. firestore.rules enforces the same split.
 */

const STATUS_VARIANT: Record<Subscription['status'], 'active' | 'pending' | 'destructive' | 'onhold' | 'outline'> = {
  active: 'active', pending: 'pending', past_due: 'destructive', paused: 'onhold', canceled: 'outline',
};

export default function ServicePlansPage() {
  const { toast } = useToast();
  const { user: me } = useAuth();
  const canManage = canEditUserPay(me);

  const { plans, loading: plansLoading } = useServicePlans();
  const { subscriptions, loading: subsLoading } = useAllSubscriptions();
  const users = useLiveUsers();
  const clients = useMemo(() => users.filter(u => isClient(u))
    .sort((a, b) => (a.clientCompany || a.name || '').localeCompare(b.clientCompany || b.name || '')), [users]);
  const clientName = (id: string | null) => {
    const c = clients.find(x => x.id === id);
    return c ? (c.clientCompany || c.name) : '';
  };
  const planById = useMemo(() => new Map(plans.map(p => [p.id, p])), [plans]);

  const [editorPlan, setEditorPlan] = useState<ServicePlan | Omit<ServicePlan, 'id' | 'createdAt' | 'updatedAt'> | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [subDialog, setSubDialog] = useState<SubscriptionDialogMode | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Subscription | null>(null);
  const [declineTarget, setDeclineTarget] = useState<Subscription | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [subFilter, setSubFilter] = useState<'live' | 'due' | 'canceled'>('live');
  const [search, setSearch] = useState('');

  const today = localDay();
  const live = subscriptions.filter(isLiveSubscription);
  const requests = subscriptions.filter(s => s.status === 'pending')
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  const due = live.filter(s => s.status !== 'paused' && s.nextBillingDate && s.nextBillingDate <= today);
  const mrr = live.filter(s => s.status !== 'paused').reduce((sum, s) => sum + monthlyValue(s, planById.get(s.planId)), 0);
  const pastDue = live.filter(s => s.status === 'past_due');
  const subscriberCount = (planId: string) => live.filter(s => s.planId === planId).length;

  const shownSubs = useMemo(() => {
    const base = subFilter === 'live' ? live : subFilter === 'due' ? due : subscriptions.filter(s => s.status === 'canceled');
    const q = search.trim().toLowerCase();
    return base
      .filter(s => !q || (s.clientName || '').toLowerCase().includes(q) || (planById.get(s.planId)?.name || '').toLowerCase().includes(q))
      .sort((a, b) => (a.nextBillingDate || '9999').localeCompare(b.nextBillingDate || '9999'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptions, subFilter, search, planById]);

  const openNewPlan = () => { setEditorPlan(null); setEditorOpen(true); };
  const openEditPlan = (p: ServicePlan) => { setEditorPlan(p); setEditorOpen(true); };
  const duplicateAsCustom = (p: ServicePlan) => {
    const { id: _id, createdAt: _c, updatedAt: _u, stripe: _s, ...rest } = p;
    setEditorPlan({ ...rest, name: `${p.name} (custom)`, kind: 'custom', clientId: null, status: 'draft' });
    setEditorOpen(true);
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast({ title: ok }); }
    catch (e: any) { toast({ variant: 'destructive', title: 'Action failed', description: e.message }); }
  };

  const exportCsv = () => {
    const rows = [['Client', 'Plan', 'Billing', 'Amount', 'Monthly value', 'Status', 'Next billing', 'Collection']];
    live.forEach(s => {
      const p = planById.get(s.planId);
      rows.push([s.clientName, p?.name || s.planId, INTERVAL_LABELS[s.interval], String(subscriptionAmount(s, p)),
        String(monthlyValue(s, p)), SUBSCRIPTION_STATUS_LABELS[s.status], s.nextBillingDate || '', s.collection]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `subscriptions-${today}.csv`;
    a.click();
  };

  const noData = !plansLoading && !subsLoading && plans.length === 0 && subscriptions.length === 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
          eyebrow="Billing"
          icon={BookOpen}
          title="Service plans"
          subtitle="Plans, client subscriptions and the discounts subscribers get."
          actions={canManage ? (<>
            <Button variant="outline" onClick={() => setSubDialog({ kind: 'create' })} disabled={plans.length === 0}
              className="h-10 px-4">
              <Building2 size={14} className="mr-2" /> Start subscription
            </Button>
            <Button onClick={openNewPlan} className="h-10 px-4 bg-brand-red hover:bg-brand-red/90 text-white">
              <Plus size={14} className="mr-2" /> New plan
            </Button>
          
          </>) : undefined}
      />

      <div className="flex items-start gap-2 p-3 rounded-lg border border-border-sub bg-bg-secondary text-[12px] text-text-secondary">
        <Info size={14} className="text-brand-red shrink-0 mt-0.5" />
        <p>
          Stripe isn&apos;t connected yet, so subscriptions are billed by invoice: when one is <b>due</b>, bill it and click
          <b> Mark billed</b> to move it to the next period. Once Stripe is connected it charges automatically and these
          dates update themselves.
        </p>
      </div>

      {noData && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-accent-gold/40 bg-accent-gold/5">
          <p className="text-xs text-text-primary">
            No plans yet. Create your first plan.
          </p>
          {canManage && (
            <Button onClick={openNewPlan} className="h-9 shrink-0 bg-brand-red hover:bg-brand-red/90 text-white">
              <Plus size={12} className="mr-1.5" /> Create First Plan
            </Button>
          )}
        </div>
      )}

      {/* Stats — all computed from live subscriptions */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Monthly Recurring', value: formatMoney(mrr), color: 'text-text-green' },
          { label: 'Active Subscriptions', value: String(live.length - pastDue.length), color: 'text-text-primary' },
          { label: 'Due to Bill', value: String(due.length), color: due.length ? 'text-accent-gold' : 'text-text-primary' },
          { label: 'Past Due', value: String(pastDue.length), color: pastDue.length ? 'text-text-red' : 'text-text-primary' },
          { label: 'Requests', value: String(requests.length), color: requests.length ? 'text-accent-gold' : 'text-text-primary' },
        ].map(s => (
          <Card key={s.label} className="bg-bg-secondary border-border-main">
            <CardContent className="p-4">
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{s.label}</p>
              <p className={cn('text-xl font-mono font-bold mt-1', s.color)}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="subscriptions" className="w-full">
        <div className="overflow-x-auto">
          <TabsList className="tabs grid grid-cols-2 sm:flex border-b border-border-sub bg-transparent rounded-none h-auto p-0 gap-x-3 gap-y-1 sm:gap-6 justify-start mb-5 w-full sm:w-auto sm:min-w-max">
            <TabsTrigger value="subscriptions" className="tab-trigger-plans">Subscriptions</TabsTrigger>
            <TabsTrigger value="plans" className="tab-trigger-plans">Plans</TabsTrigger>
            <TabsTrigger value="requests" className="tab-trigger-plans flex items-center gap-1.5">
              Requests {requests.length > 0 && <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">{requests.length}</Badge>}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Subscriptions ── */}
        <TabsContent value="subscriptions" className="m-0 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <div className="flex gap-1">
              {([['live', `Current (${live.length})`], ['due', `Due (${due.length})`], ['canceled', 'Canceled']] as const).map(([k, l]) => (
                <Button key={k} size="sm" variant={subFilter === k ? 'default' : 'outline'} onClick={() => setSubFilter(k)}
                  className="h-8">{l}</Button>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Client or plan…" className="h-8 pl-7 text-xs bg-bg-secondary" />
              </div>
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={live.length === 0} className="h-8 text-[10px] font-bold">
                <Download size={12} className="mr-1" /> CSV
              </Button>
            </div>
          </div>

          {shownSubs.length === 0 ? (
            <div className="py-16 text-center border-2 border-dashed border-border-sub rounded-xl">
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                {subFilter === 'due' ? 'Nothing due to bill' : subFilter === 'canceled' ? 'No canceled subscriptions' : 'No client subscriptions yet'}
              </p>
            </div>
          ) : shownSubs.map(s => {
            const p = planById.get(s.planId);
            const isDue = s.status !== 'paused' && s.status !== 'canceled' && !!s.nextBillingDate && s.nextBillingDate <= today;
            return (
              <Card key={s.id} className="bg-bg-secondary border-border-main">
                <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-text-primary truncate">{s.clientName || clientName(s.clientId) || s.clientId}</p>
                      <Badge variant={STATUS_VARIANT[s.status]} className="text-[10px] h-4">{SUBSCRIPTION_STATUS_LABELS[s.status]}</Badge>
                      {s.cancelAtPeriodEnd && <Badge variant="outline" className="text-[10px] h-4">Ends {s.nextBillingDate || 'at period end'}</Badge>}
                      {s.priceOverride != null && <Badge variant="outline" className="text-[10px] h-4">Custom price</Badge>}
                    </div>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      {p?.name || <span className="text-text-red">Unknown plan ({s.planId})</span>} · {INTERVAL_LABELS[s.interval]}
                      {s.startDate && <> · since {s.startDate}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Amount</p>
                      <p className="text-sm font-mono font-bold text-text-green">{formatMoney(subscriptionAmount(s, p))}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Next bill</p>
                      <p className={cn('text-sm font-mono font-bold', isDue ? 'text-accent-gold' : 'text-text-primary')}>
                        {s.status === 'canceled' ? '—' : s.nextBillingDate || 'Not set'}
                      </p>
                    </div>
                  </div>
                  {canManage && s.status !== 'canceled' && (
                    <div className="flex flex-wrap gap-2">
                      {isDue && (
                        <Button size="sm" onClick={() => run(() => markPeriodBilled(s), 'Marked billed')}
                          className="h-8 text-[10px] font-bold bg-accent-gold hover:bg-accent-gold/90 text-black">
                          <Receipt size={12} className="mr-1" /> Mark billed
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setSubDialog({ kind: 'edit', sub: s })} className="h-8 text-[10px] font-bold">
                        <Pencil size={12} className="mr-1" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setCancelTarget(s)} className="h-8 text-[10px] font-bold text-text-red border-brand-red/40">
                        <Ban size={12} className="mr-1" /> Cancel
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ── Plans ── */}
        <TabsContent value="plans" className="m-0 space-y-6">
          {(['standard', 'custom'] as const).map(kind => {
            const list = plans.filter(p => p.kind === kind);
            return (
              <section key={kind} className="space-y-3">
                <h2 className="text-[13px] font-semibold text-text-primary">
                  {kind === 'standard' ? 'Standard plans' : 'Custom client plans'}
                </h2>
                {list.length === 0 ? (
                  <p className="text-[11px] text-text-muted">
                    {kind === 'standard' ? 'No standard plans yet.' : 'No custom plans. Duplicate a standard plan to write one for a client.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {list.map(p => (
                      <Card key={p.id} className={cn('bg-bg-secondary border-border-main flex flex-col', p.status === 'archived' && 'opacity-60')}>
                        <CardContent className="p-5 flex flex-col gap-3 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-base font-bold tracking-wide truncate">{p.name}</p>
                              {p.kind === 'custom' && <p className="text-[10px] text-text-muted truncate">For {clientName(p.clientId) || 'unknown client'}</p>}
                            </div>
                            <Badge variant={p.status === 'active' ? 'active' : p.status === 'draft' ? 'pending' : 'outline'} className="text-[10px] h-4 shrink-0">{p.status}</Badge>
                          </div>
                          <div className="space-y-0.5">
                            {p.prices.map(pr => (
                              <p key={pr.interval} className="text-sm font-mono font-bold text-text-green">
                                {formatMoney(pr.amount)} <span className="text-[10px] text-text-muted font-sans font-normal">{INTERVAL_LABELS[pr.interval].toLowerCase()}</span>
                              </p>
                            ))}
                            {p.setupFee > 0 && <p className="text-[10px] text-text-muted">+ {formatMoney(p.setupFee)} setup</p>}
                          </div>
                          {p.description && <p className="text-[12px] text-text-secondary">{p.description}</p>}
                          <div className="grid grid-cols-2 gap-1.5 text-[12px] text-text-secondary">
                            <span className="flex items-center gap-1"><Clock size={10} /> {p.benefits.responseHours}h response</span>
                            <span className="flex items-center gap-1"><Percent size={10} /> {p.benefits.laborDiscountPct}% off labor{p.benefits.materialsDiscountPct ? ` · ${p.benefits.materialsDiscountPct}% off materials` : ''}</span>
                            <span className="flex items-center gap-1"><CalendarClock size={10} />
                              {p.benefits.includedVisits ? `${p.benefits.includedVisits} visit${p.benefits.includedVisits === 1 ? '' : 's'}/${p.benefits.includedVisitsPer}` : 'No visits incl.'}
                            </span>
                            <span className="flex items-center gap-1"><MapPin size={10} /> {p.benefits.siteLimit ?? 'Unlimited'} site{p.benefits.siteLimit === 1 ? '' : 's'}</span>
                            {p.benefits.afterHoursDispatch && <span className="flex items-center gap-1 col-span-2"><Moon size={10} /> After-hours dispatch</span>}
                          </div>
                          {p.features.length > 0 && (
                            <ul className="space-y-0.5 text-[12px] text-text-secondary list-disc pl-4">
                              {p.features.map(f => <li key={f}>{f}</li>)}
                            </ul>
                          )}
                          <p className="text-[10px] text-text-muted mt-auto pt-2 border-t border-border-sub">
                            {subscriberCount(p.id)} active client{subscriberCount(p.id) === 1 ? '' : 's'}
                            {p.minimumTermMonths ? ` · ${p.minimumTermMonths}-month minimum` : '· month to month'}
                          </p>
                          {canManage && (
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" variant="outline" onClick={() => openEditPlan(p)} className="h-8 text-[10px] font-bold">
                                <Pencil size={12} className="mr-1" /> Edit
                              </Button>
                              {p.kind === 'standard' && (
                                <Button size="sm" variant="outline" onClick={() => duplicateAsCustom(p)} className="h-8 text-[10px] font-bold">
                                  <Copy size={12} className="mr-1" /> Custom copy
                                </Button>
                              )}
                              {p.status === 'archived' ? (
                                <Button size="sm" variant="outline" onClick={() => run(() => setPlanStatus(p.id, 'active'), 'Plan restored')} className="h-8 text-[10px] font-bold">
                                  <RotateCcw size={12} className="mr-1" /> Restore
                                </Button>
                              ) : (
                                <Button size="sm" variant="outline" onClick={() => run(() => setPlanStatus(p.id, 'archived'), 'Plan archived — existing clients keep it')}
                                  className="h-8 text-[10px] font-bold">
                                  <Archive size={12} className="mr-1" /> Archive
                                </Button>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </TabsContent>

        {/* ── Requests ── */}
        <TabsContent value="requests" className="m-0 space-y-3">
          <p className="text-[11px] text-text-muted">Plan requests from the client portal. Approving starts billing; a plan change ends the client&apos;s current subscription.</p>
          {requests.length === 0 ? (
            <div className="py-16 text-center border-2 border-dashed border-border-sub rounded-xl">
              <p className="text-[13px] text-text-muted">No pending requests</p>
            </div>
          ) : requests.map(r => {
            const p = planById.get(r.planId);
            const current = r.replacesSubscriptionId ? subscriptions.find(s => s.id === r.replacesSubscriptionId) : undefined;
            return (
              <Card key={r.id} className="bg-bg-secondary border-dashed border-accent-gold/40">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{r.clientName || clientName(r.clientId)}</p>
                    <p className="text-[11px] text-text-muted">
                      {current ? <>Change from {planById.get(current.planId)?.name || current.planId} to </> : 'New:'}
                      <b className="text-text-primary">{p?.name || r.planId}</b> · {INTERVAL_LABELS[r.interval]} · {formatMoney(subscriptionAmount(r, p))}
                      {r.createdAt && <> · asked {r.createdAt.slice(0, 10)}</>}
                    </p>
                    {r.notes && <p className="text-[12px] text-text-secondary mt-1 whitespace-pre-wrap">&ldquo;{r.notes}&rdquo;</p>}
                  </div>
                  {canManage && (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => { setDeclineTarget(r); setDeclineReason(''); }} className="h-8 text-[10px] font-bold">
                        <XCircle size={12} className="mr-1" /> Decline
                      </Button>
                      <Button size="sm" onClick={() => setSubDialog({ kind: 'approve', sub: r })} className="h-8 text-[10px] font-bold bg-brand-red hover:bg-brand-red/90 text-white">
                        <CheckCircle2 size={12} className="mr-1" /> Approve
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      <PlanEditorDialog open={editorOpen} onClose={() => setEditorOpen(false)} plan={editorPlan} clients={clients}
        nextSortOrder={plans.length} />
      <SubscriptionDialog mode={subDialog} onClose={() => setSubDialog(null)} plans={plans} clients={clients} />

      <AlertDialog open={!!cancelTarget} onOpenChange={v => { if (!v) setCancelTarget(null); }}>
        <AlertDialogContent className="bg-bg-elevated border-border-main">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold tracking-wide">Cancel {cancelTarget?.clientName}&apos;s subscription?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              End of period keeps service until {cancelTarget?.nextBillingDate || 'the next billing date'} and stops renewal. Cancel now ends it today.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel className="text-[10px] font-bold">Keep</AlertDialogCancel>
            <Button variant="outline" className="text-[10px] font-bold"
              onClick={() => { const s = cancelTarget!; setCancelTarget(null); run(() => cancelSubscription(s, true), 'Will end at period end'); }}>
              End of period
            </Button>
            <AlertDialogAction className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-bold"
              onClick={() => { const s = cancelTarget!; setCancelTarget(null); run(() => cancelSubscription(s, false), 'Subscription canceled'); }}>
              Cancel now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!declineTarget} onOpenChange={v => { if (!v) setDeclineTarget(null); }}>
        <AlertDialogContent className="bg-bg-elevated border-border-main">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold tracking-wide">Decline this request?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">The client keeps their current plan, if any.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={declineReason} onChange={e => setDeclineReason(e.target.value)} placeholder="Reason (optional, kept with the request)" className="text-xs" />
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[10px] font-bold">Back</AlertDialogCancel>
            <AlertDialogAction className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-bold"
              onClick={() => { const r = declineTarget!; setDeclineTarget(null); run(() => declineRequest(r, declineReason.trim()), 'Request declined'); }}>
              Decline
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
