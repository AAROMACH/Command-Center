'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Technician } from '@/lib/types';
import {
  emptyPlan, INTERVAL_LABELS, type BillingInterval, type ServicePlan,
} from '@/lib/billing';
import { savePlan } from '@/lib/billing-actions';

const labelCls = 'text-[10px] font-bold uppercase tracking-wider text-text-muted';
const inputCls = 'h-10 text-xs bg-bg-secondary border-border-main';
const INTERVALS: BillingInterval[] = ['month', 'quarter', 'year'];

type Draft = Omit<ServicePlan, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<ServicePlan, 'id' | 'createdAt'>>;

export function PlanEditorDialog({
  open, onClose, plan, clients, nextSortOrder,
}: {
  open: boolean;
  onClose: () => void;
  /** null = new plan. */
  plan: Draft | null;
  clients: Technician[];
  nextSortOrder: number;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft>(() => plan ?? emptyPlan(nextSortOrder));
  const [featureInput, setFeatureInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setDraft(plan ?? emptyPlan(nextSortOrder)); setFeatureInput(''); }
  }, [open, plan, nextSortOrder]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => ({ ...d, [k]: v }));
  const setBenefit = <K extends keyof Draft['benefits']>(k: K, v: Draft['benefits'][K]) =>
    setDraft(d => ({ ...d, benefits: { ...d.benefits, [k]: v } }));

  const priceFor = (i: BillingInterval) => draft.prices.find(p => p.interval === i);
  const togglePrice = (i: BillingInterval, on: boolean) =>
    set('prices', on ? [...draft.prices, { interval: i, amount: 0 }] : draft.prices.filter(p => p.interval !== i));
  const setPrice = (i: BillingInterval, amount: number) =>
    set('prices', draft.prices.map(p => p.interval === i ? { ...p, amount } : p));

  const addFeature = () => {
    const f = featureInput.trim();
    if (f && !draft.features.includes(f)) set('features', [...draft.features, f]);
    setFeatureInput('');
  };

  const handleSave = async () => {
    if (!draft.name.trim()) return toast({ variant: 'destructive', title: 'Name required' });
    if (draft.prices.length === 0) return toast({ variant: 'destructive', title: 'Add at least one price', description: 'Turn on monthly, quarterly or annual billing.' });
    if (draft.prices.some(p => !(p.amount > 0))) return toast({ variant: 'destructive', title: 'Prices must be above $0' });
    if (draft.kind === 'custom' && !draft.clientId) return toast({ variant: 'destructive', title: 'Pick the client', description: 'A custom plan belongs to one client.' });
    setSaving(true);
    try {
      await savePlan({ ...draft, name: draft.name.trim(), clientId: draft.kind === 'custom' ? draft.clientId : null });
      toast({ title: plan?.id ? 'Plan saved' : 'Plan created' });
      onClose();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] p-0 flex flex-col bg-bg-elevated border-border-main">
        <DialogHeader className="p-4 sm:p-6 pb-3 border-b border-border-sub text-left">
          <DialogTitle className="text-base font-semibold">{plan?.id ? 'Edit plan' : 'New plan'}</DialogTitle>
          <DialogDescription className="text-xs">
            Prices and benefits here are what clients are billed and what the app enforces (response time, labor discount).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-6">
          {/* Basics */}
          <section className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className={labelCls}>Plan Name *</Label>
                <Input className={inputCls} value={draft.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Site Partner" />
              </div>
              <div className="space-y-1">
                <Label className={labelCls}>Status</Label>
                <Select value={draft.status} onValueChange={v => set('status', v as Draft['status'])}>
                  <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft — not offered yet</SelectItem>
                    <SelectItem value="active">Active — clients can choose it</SelectItem>
                    <SelectItem value="archived">Archived — existing clients only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className={labelCls}>Description</Label>
              <Textarea className="text-xs bg-bg-secondary border-border-main min-h-[60px] resize-none" value={draft.description}
                onChange={e => set('description', e.target.value)} placeholder="One or two sentences shown to clients." />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className={labelCls}>Type</Label>
                <Select value={draft.kind} onValueChange={v => set('kind', v as Draft['kind'])}>
                  <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard — offered to every client</SelectItem>
                    <SelectItem value="custom">Custom — one client only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {draft.kind === 'custom' && (
                <div className="space-y-1">
                  <Label className={labelCls}>Client *</Label>
                  <Select value={draft.clientId || ''} onValueChange={v => set('clientId', v)}>
                    <SelectTrigger className={inputCls}><SelectValue placeholder="Choose client…" /></SelectTrigger>
                    <SelectContent>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.clientCompany || c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </section>

          {/* Pricing */}
          <section className="space-y-3">
            <p className={labelCls}>Billing Options</p>
            <div className="space-y-2">
              {INTERVALS.map(i => {
                const p = priceFor(i);
                return (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border border-border-sub bg-bg-secondary">
                    <Switch checked={!!p} onCheckedChange={v => togglePrice(i, v)} aria-label={`${INTERVAL_LABELS[i]} billing`} />
                    <span className="w-24 text-[11px] font-bold tracking-wider">{INTERVAL_LABELS[i]}</span>
                    {p ? (
                      <div className="relative flex-1 max-w-[180px]">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted">$</span>
                        <Input type="number" min="0" step="0.01" inputMode="decimal" className={`${inputCls} pl-6 font-mono`}
                          value={p.amount || ''} onChange={e => setPrice(i, parseFloat(e.target.value) || 0)} />
                      </div>
                    ) : <span className="text-[10px] text-text-muted">Not offered</span>}
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className={labelCls}>Setup Fee ($)</Label>
                <Input type="number" min="0" step="0.01" className={`${inputCls} font-mono`} value={draft.setupFee || ''}
                  onChange={e => set('setupFee', parseFloat(e.target.value) || 0)} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label className={labelCls}>Minimum Term (months)</Label>
                <Input type="number" min="0" step="1" className={`${inputCls} font-mono`} value={draft.minimumTermMonths ?? ''}
                  onChange={e => set('minimumTermMonths', e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="Month to month" />
              </div>
            </div>
          </section>

          {/* Benefits the app enforces */}
          <section className="space-y-3">
            <p className={labelCls}>Benefits</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className={labelCls}>Response Time (hours)</Label>
                <Input type="number" min="1" className={`${inputCls} font-mono`} value={draft.benefits.responseHours || ''}
                  onChange={e => setBenefit('responseHours', Math.max(1, parseFloat(e.target.value) || 0))} />
                <p className="text-[11px] text-text-muted">Drives the client&apos;s request SLA clock.</p>
              </div>
              <div className="space-y-1">
                <Label className={labelCls}>Labor Discount (%)</Label>
                <Input type="number" min="0" max="100" className={`${inputCls} font-mono`} value={draft.benefits.laborDiscountPct || ''}
                  onChange={e => setBenefit('laborDiscountPct', parseFloat(e.target.value) || 0)} placeholder="0" />
                <p className="text-[11px] text-text-muted">Off labor on this client&apos;s quotes and invoices.</p>
              </div>
              <div className="space-y-1">
                <Label className={labelCls}>Materials Discount (%)</Label>
                <Input type="number" min="0" max="100" className={`${inputCls} font-mono`} value={draft.benefits.materialsDiscountPct || ''}
                  onChange={e => setBenefit('materialsDiscountPct', parseFloat(e.target.value) || 0)} placeholder="0" />
                <p className="text-[11px] text-text-muted">Off materials (before tax) on this client&apos;s quotes and invoices.</p>
              </div>
              <div className="space-y-1">
                <Label className={labelCls}>Included Site Visits</Label>
                <div className="flex gap-2">
                  <Input type="number" min="0" className={`${inputCls} font-mono w-20`} value={draft.benefits.includedVisits || ''}
                    onChange={e => setBenefit('includedVisits', parseInt(e.target.value, 10) || 0)} placeholder="0" />
                  <Select value={draft.benefits.includedVisitsPer} onValueChange={v => setBenefit('includedVisitsPer', v as BillingInterval)}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">per month</SelectItem>
                      <SelectItem value="quarter">per quarter</SelectItem>
                      <SelectItem value="year">per year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className={labelCls}>Sites Covered</Label>
                <Input type="number" min="1" className={`${inputCls} font-mono`} value={draft.benefits.siteLimit ?? ''}
                  onChange={e => setBenefit('siteLimit', e.target.value ? parseInt(e.target.value, 10) : null)} placeholder="Unlimited" />
              </div>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border-sub bg-bg-secondary">
              <span className="text-[11px] font-bold tracking-wider">After-hours emergency dispatch</span>
              <Switch checked={draft.benefits.afterHoursDispatch} onCheckedChange={v => setBenefit('afterHoursDispatch', v)} />
            </div>
          </section>

          {/* Marketing bullets */}
          <section className="space-y-2">
            <p className={labelCls}>Feature List (shown to clients)</p>
            <div className="flex gap-2">
              <Input className={inputCls} value={featureInput} onChange={e => setFeatureInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFeature(); } }} placeholder="e.g. Quarterly site inspection" />
              <Button type="button" size="sm" onClick={addFeature} className="h-10 px-3"><Plus size={14} /></Button>
            </div>
            <ul className="space-y-1">
              {draft.features.map(f => (
                <li key={f} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded border border-border-sub bg-bg-secondary text-[11px]">
                  <span>{f}</span>
                  <button type="button" onClick={() => set('features', draft.features.filter(x => x !== f))} aria-label={`Remove ${f}`}
                    className="text-text-muted hover:text-text-red"><X size={12} /></button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <DialogFooter className="p-4 sm:p-6 border-t border-border-sub flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="h-10 w-full sm:w-auto text-[10px] font-bold">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="h-10 w-full sm:w-auto bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-bold">
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : null} Save Plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
