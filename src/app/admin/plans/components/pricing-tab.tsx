'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  MATERIAL_CATEGORIES, materialSellPrice, formatMoney, type LaborRate, type PricingSettings,
} from '@/lib/billing';
import { savePricing } from '@/lib/billing-actions';

const labelCls = 'text-[10px] font-black uppercase tracking-widest text-text-muted';
const inputCls = 'h-9 text-xs bg-bg-secondary border-border-main';

/**
 * The company price book settings quotes and invoices use: labor rates,
 * material markup by category, and sales tax (materials only).
 */
export function PricingTab({ settings, canEdit }: { settings: PricingSettings; canEdit: boolean }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<PricingSettings>(settings);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!dirty) setDraft(settings); }, [settings, dirty]);

  const update = (patch: Partial<PricingSettings>) => { setDraft(d => ({ ...d, ...patch })); setDirty(true); };
  const setRate = (id: string, patch: Partial<LaborRate>) =>
    update({ laborRates: draft.laborRates.map(r => r.id === id ? { ...r, ...patch } : r) });
  const addRate = () => update({
    laborRates: [...draft.laborRates, { id: `rate-${Date.now().toString(36)}`, label: '', rate: 0, unit: 'hour', minimum: '' }],
  });
  const setMarkup = (category: string, value: string) => {
    const next = { ...draft.materialMarkupPct };
    if (value.trim() === '') delete next[category]; else next[category] = parseFloat(value) || 0;
    update({ materialMarkupPct: next });
  };

  const handleSave = async () => {
    if (draft.laborRates.some(r => !r.label.trim())) return toast({ variant: 'destructive', title: 'Every labor rate needs a name' });
    setSaving(true);
    try {
      await savePricing({ ...draft, laborRates: draft.laborRates.map(r => ({ ...r, label: r.label.trim() })) });
      setDirty(false);
      toast({ title: 'Pricing saved', description: 'New quotes and invoices use these rates.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {!canEdit && (
        <p className="text-[10px] text-amber-400">View only — payroll and super admins can change pricing.</p>
      )}
      <fieldset disabled={!canEdit} className="space-y-6">
        <Card className="bg-bg-secondary border-border-main">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Labor & Service Rates</CardTitle>
            <CardDescription className="text-xs">Rates offered on quotes and invoices. Plan discounts apply to hourly labor.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {draft.laborRates.length === 0 && (
              <p className="text-[11px] text-text-muted py-2">No rates yet — add your labor and service charges.</p>
            )}
            {draft.laborRates.map(r => (
              <div key={r.id} className="grid grid-cols-2 sm:grid-cols-[1.6fr,0.9fr,0.9fr,1.2fr,auto] gap-2 items-end p-2 rounded-lg border border-border-sub bg-bg-primary">
                <div className="col-span-2 sm:col-span-1 space-y-1">
                  <Label className={labelCls}>Name</Label>
                  <Input className={inputCls} value={r.label} onChange={e => setRate(r.id, { label: e.target.value })} placeholder="e.g. Installation Labor" />
                </div>
                <div className="space-y-1">
                  <Label className={labelCls}>Rate ($)</Label>
                  <Input type="number" min="0" step="0.01" className={`${inputCls} font-mono`} value={r.rate || ''}
                    onChange={e => setRate(r.id, { rate: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1">
                  <Label className={labelCls}>Per</Label>
                  <Select value={r.unit} onValueChange={v => setRate(r.id, { unit: v as LaborRate['unit'] })}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hour">Hour</SelectItem>
                      <SelectItem value="flat">Flat</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className={labelCls}>Minimum</Label>
                  <Input className={inputCls} value={r.minimum} onChange={e => setRate(r.id, { minimum: e.target.value })} placeholder="e.g. 2 hr min" />
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-text-muted hover:text-text-red justify-self-end"
                  onClick={() => update({ laborRates: draft.laborRates.filter(x => x.id !== r.id) })} aria-label={`Remove ${r.label || 'rate'}`}>
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addRate} className="h-9 text-[10px] font-black uppercase tracking-widest">
              <Plus size={12} className="mr-1.5" /> Add Rate
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-bg-secondary border-border-main">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Material Markup by Category</CardTitle>
            <CardDescription className="text-xs">
              Sell price = cost × (1 + markup). Leave a category blank to use the default. Example on a $100 cost shown at right.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-3 p-2 rounded-lg border border-border-sub bg-bg-primary">
              <div className="space-y-1 w-32">
                <Label className={labelCls}>Default Markup %</Label>
                <Input type="number" min="0" step="0.5" className={`${inputCls} font-mono`} value={draft.defaultMarkupPct}
                  onChange={e => update({ defaultMarkupPct: parseFloat(e.target.value) || 0 })} />
              </div>
              <p className="text-[10px] text-text-muted pb-2">Any category without its own markup.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {MATERIAL_CATEGORIES.map(cat => {
                const own = draft.materialMarkupPct[cat];
                return (
                  <div key={cat} className="flex items-center gap-2 p-2 rounded-lg border border-border-sub bg-bg-primary">
                    <span className="flex-1 text-[11px] font-bold">{cat}</span>
                    <div className="relative w-20">
                      <Input type="number" min="0" step="0.5" className={`${inputCls} font-mono pr-5`} value={own ?? ''}
                        onChange={e => setMarkup(cat, e.target.value)} placeholder={String(draft.defaultMarkupPct)} aria-label={`${cat} markup percent`} />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">%</span>
                    </div>
                    <span className="w-20 text-right text-[10px] font-mono text-text-muted">{formatMoney(materialSellPrice(100, cat, draft))}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-bg-secondary border-border-main">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Sales Tax</CardTitle>
            <CardDescription className="text-xs">Charged on materials only. Labor, travel and plan fees are not taxed.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 w-32">
              <Label className={labelCls}>Rate %</Label>
              <Input type="number" min="0" step="0.01" className={`${inputCls} font-mono`} value={draft.salesTaxPct}
                onChange={e => update({ salesTaxPct: parseFloat(e.target.value) || 0 })} />
            </div>
          </CardContent>
        </Card>
      </fieldset>

      {canEdit && (
        <div className="flex items-center justify-end gap-2 sticky bottom-4">
          {dirty && (
            <Button variant="outline" onClick={() => { setDraft(settings); setDirty(false); }} disabled={saving} className="h-10 text-[10px] font-black uppercase">
              Discard
            </Button>
          )}
          <Button onClick={handleSave} disabled={!dirty || saving} className="h-10 px-6 bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase shadow-lg">
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Save size={12} className="mr-1.5" />} Save Pricing
          </Button>
        </div>
      )}
    </div>
  );
}
