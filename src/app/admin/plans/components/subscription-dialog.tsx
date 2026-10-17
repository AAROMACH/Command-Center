'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Technician } from '@/lib/types';
import {
  formatMoney, INTERVAL_LABELS, planPrice, SUBSCRIPTION_STATUS_LABELS,
  type BillingInterval, type ServicePlan, type Subscription, type SubscriptionStatus,
  localDay,
} from '@/lib/billing';
import { approveRequest, createSubscription, updateSubscription } from '@/lib/billing-actions';

const labelCls = 'text-[10px] font-bold uppercase tracking-wider text-text-muted';
const inputCls = 'h-10 text-xs bg-bg-secondary border-border-main';

export type SubscriptionDialogMode =
  | { kind: 'create' }
  | { kind: 'edit'; sub: Subscription }
  | { kind: 'approve'; sub: Subscription };

const clientLabel = (c: Technician) => c.clientCompany || c.name;

export function SubscriptionDialog({
  mode, onClose, plans, clients,
}: {
  mode: SubscriptionDialogMode | null;
  onClose: () => void;
  plans: ServicePlan[];
  clients: Technician[];
}) {
  const { toast } = useToast();
  const today = localDay();
  const existing = mode && mode.kind !== 'create' ? mode.sub : null;

  const [clientId, setClientId] = useState('');
  const [planId, setPlanId] = useState('');
  const [interval, setBillInterval] = useState<BillingInterval>('month');
  const [startDate, setStartDate] = useState(today);
  const [nextBillingDate, setNextBillingDate] = useState('');
  const [status, setStatus] = useState<SubscriptionStatus>('active');
  const [override, setOverride] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!mode) return;
    const s = mode.kind === 'create' ? null : mode.sub;
    setClientId(s?.clientId || '');
    setPlanId(s?.planId || '');
    setBillInterval(s?.interval || 'month');
    setStartDate(s?.startDate || today);
    setNextBillingDate(s?.nextBillingDate || '');
    setStatus(s && s.status !== 'pending' ? s.status : 'active');
    setOverride(s?.priceOverride != null ? String(s.priceOverride) : '');
    setNotes(s?.notes || '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Plans this client can be put on: active standard plans, plus their own
  // custom plans; the current plan stays listed even if archived.
  const choosable = useMemo(() => plans.filter(p =>
    p.id === existing?.planId
    || (p.status === 'active' && (p.kind === 'standard' || p.clientId === clientId))), [plans, clientId, existing?.planId]);
  const plan = plans.find(p => p.id === planId);
  const intervals = plan?.prices.map(p => p.interval) ?? [];

  useEffect(() => {
    if (plan && !intervals.includes(interval) && intervals[0]) setBillInterval(intervals[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  const listPrice = planPrice(plan, interval);
  const priceOverride = override.trim() ? parseFloat(override) : null;

  const handleSave = async () => {
    if (!clientId || !planId) return toast({ variant: 'destructive', title: 'Choose a client and a plan' });
    if (listPrice == null) return toast({ variant: 'destructive', title: `This plan isn't offered ${INTERVAL_LABELS[interval].toLowerCase()}` });
    if (priceOverride != null && !(priceOverride > 0)) return toast({ variant: 'destructive', title: 'Custom price must be above $0' });
    setSaving(true);
    try {
      if (!mode || mode.kind === 'create') {
        const client = clients.find(c => c.id === clientId)!;
        await createSubscription({ clientId, clientName: clientLabel(client), planId, interval, startDate, priceOverride, notes: notes.trim() });
        toast({ title: 'Subscription started' });
      } else if (mode.kind === 'approve') {
        await approveRequest({ ...mode.sub, planId }, { startDate, interval, priceOverride });
        toast({ title: 'Request approved', description: 'The subscription is active.' });
      } else {
        await updateSubscription(mode.sub, {
          planId, interval, priceOverride, notes: notes.trim(), status,
          nextBillingDate: nextBillingDate || null,
        });
        toast({ title: 'Subscription updated' });
      }
      onClose();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const title = !mode ? '' : mode.kind === 'create' ? 'Start Subscription' : mode.kind === 'approve' ? 'Approve Request' : 'Edit Subscription';

  return (
    <Dialog open={!!mode} onOpenChange={v => { if (!v && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] p-0 flex flex-col bg-bg-elevated border-border-main">
        <DialogHeader className="p-4 sm:p-6 pb-3 border-b border-border-sub text-left">
          <DialogTitle className="text-[13px] font-bold">{title}</DialogTitle>
          <DialogDescription className="text-xs">
            Billed by invoice from the app until Stripe is connected; then Stripe charges automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          <div className="space-y-1">
            <Label className={labelCls}>Client</Label>
            <Select value={clientId} onValueChange={setClientId} disabled={!!existing}>
              <SelectTrigger className={inputCls}><SelectValue placeholder="Choose client…" /></SelectTrigger>
              <SelectContent>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{clientLabel(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className={labelCls}>Plan</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger className={inputCls}><SelectValue placeholder="Choose plan…" /></SelectTrigger>
                <SelectContent>
                  {choosable.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}{p.kind === 'custom' ? ' (custom)' : ''}{p.status === 'archived' ? ' · archived' : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className={labelCls}>Billing</Label>
              <Select value={interval} onValueChange={v => setBillInterval(v as BillingInterval)} disabled={!plan}>
                <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {intervals.map(i => (
                    <SelectItem key={i} value={i}>{INTERVAL_LABELS[i]} · {formatMoney(planPrice(plan, i) || 0)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {mode?.kind === 'edit' ? (
              <div className="space-y-1">
                <Label className={labelCls}>Next Billing Date</Label>
                <Input type="date" className={inputCls} value={nextBillingDate} onChange={e => setNextBillingDate(e.target.value)} />
              </div>
            ) : (
              <div className="space-y-1">
                <Label className={labelCls}>Start / First Bill Date</Label>
                <Input type="date" className={inputCls} value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
            )}
            <div className="space-y-1">
              <Label className={labelCls}>Custom Price ($)</Label>
              <Input type="number" min="0" step="0.01" inputMode="decimal" className={`${inputCls} font-mono`} value={override}
                onChange={e => setOverride(e.target.value)} placeholder={listPrice != null ? `List ${formatMoney(listPrice)}` : 'List price'} />
            </div>
          </div>
          {mode?.kind === 'edit' && (
            <div className="space-y-1">
              <Label className={labelCls}>Status</Label>
              <Select value={status} onValueChange={v => setStatus(v as SubscriptionStatus)}>
                <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['active', 'past_due', 'paused'] as SubscriptionStatus[]).map(s => (
                    <SelectItem key={s} value={s}>{SUBSCRIPTION_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-text-muted">Use Cancel on the subscription to end it.</p>
            </div>
          )}
          <div className="space-y-1">
            <Label className={labelCls}>Notes</Label>
            <Textarea className="text-xs bg-bg-secondary border-border-main min-h-[60px] resize-none" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Contract terms, who approved the custom price…" />
          </div>
        </div>
        <DialogFooter className="p-4 sm:p-6 border-t border-border-sub flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="h-10 w-full sm:w-auto text-[10px] font-bold">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="h-10 w-full sm:w-auto bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-bold">
            {saving && <Loader2 size={12} className="mr-1.5 animate-spin" />}
            {mode?.kind === 'approve' ? 'Approve & Start' : mode?.kind === 'create' ? 'Start Subscription' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
