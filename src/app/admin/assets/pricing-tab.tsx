'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Loader2, Save, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  describeFactor, formatMoney, roundCents,
  type LaborRate, type PriceCategory, type PricingSettings, type RateMultiplier,
} from '@/lib/billing';
import { materialPrice } from '@/lib/price-lines';
import { savePricing } from '@/lib/billing-actions';
import { downloadCsv } from '@/app/admin/reports/components/history-tabs';
import type { Material } from '@/lib/types';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const labelCls = 'text-[10px] font-bold uppercase tracking-wider text-text-muted';
const inputCls = 'h-9 text-xs bg-bg-secondary border-border-main';
const newId = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * The price book settings quotes and invoices use: labor rates, labor
 * multipliers, material categories with their markups, and sales tax.
 * Materials themselves are added on the Materials tab; each one is priced
 * from its category's markup unless it sets its own price.
 *
 * QuickBooks: labor rates map to Service items, materials to NonInventory
 * items, a category's income account to IncomeAccountRef. "Export for
 * QuickBooks" writes the QBO products & services import file.
 */
export function PricingTab({ settings, canEdit, materials }: { settings: PricingSettings; canEdit: boolean; materials: Material[] }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<PricingSettings>(settings);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!dirty) setDraft(settings); }, [settings, dirty]);

  const update = (patch: Partial<PricingSettings>) => { setDraft(d => ({ ...d, ...patch })); setDirty(true); };
  const setRate = (id: string, patch: Partial<LaborRate>) =>
    update({ laborRates: draft.laborRates.map(r => r.id === id ? { ...r, ...patch } : r) });
  const setMult = (id: string, patch: Partial<RateMultiplier>) =>
    update({ multipliers: draft.multipliers.map(m => m.id === id ? { ...m, ...patch } : m) });
  const setCat = (id: string, patch: Partial<PriceCategory>) =>
    update({ categories: draft.categories.map(c => c.id === id ? { ...c, ...patch } : c) });

  const inUse = (cat: PriceCategory) => materials.filter(m => m.category.toLowerCase() === cat.name.toLowerCase()).length;

  const handleSave = async () => {
    if (draft.laborRates.some(r => !r.label.trim())) return toast({ variant: 'destructive', title: 'Every labor rate needs a name' });
    if (draft.multipliers.some(m => !m.label.trim() || !(m.factor > 0))) return toast({ variant: 'destructive', title: 'Every multiplier needs a name and a number above 0' });
    const names = draft.categories.map(c => c.name.trim().toLowerCase());
    if (names.some(n => !n)) return toast({ variant: 'destructive', title: 'Every category needs a name' });
    if (new Set(names).size !== names.length) return toast({ variant: 'destructive', title: 'Two categories have the same name' });
    setSaving(true);
    try {
      await savePricing({
        ...draft,
        laborRates: draft.laborRates.map(r => ({ ...r, label: r.label.trim() })),
        multipliers: draft.multipliers.map(m => ({ ...m, label: m.label.trim() })),
        categories: draft.categories.map(c => ({ ...c, name: c.name.trim() })),
      });
      // A renamed category takes its materials with it.
      const renames = draft.categories
        .map(c => ({ from: settings.categories.find(o => o.id === c.id)?.name, to: c.name.trim() }))
        .filter((r): r is { from: string; to: string } => !!r.from && r.from !== r.to);
      if (renames.length) {
        const batch = writeBatch(db);
        let moved = 0;
        for (const m of materials) {
          const r = renames.find(x => x.from.toLowerCase() === m.category.toLowerCase());
          if (r) { batch.update(doc(db, 'materials', m.id), { category: r.to, updatedAt: new Date().toISOString() }); moved++; }
        }
        if (moved) await batch.commit();
      }
      setDirty(false);
      toast({ title: 'Price book saved', description: 'New quotes and invoices use these prices.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  // QuickBooks Online "Import products and services" columns.
  const exportForQuickBooks = () => {
    const incomeFor = (category: string) =>
      draft.categories.find(c => c.name.toLowerCase() === category.toLowerCase())?.qbIncomeAccount || 'Sales of Product Income';
    downloadCsv('quickbooks_price_book',
      ['Product/Service Name', 'Sales Description', 'SKU', 'Type', 'Sales Price / Rate', 'Income Account', 'Purchase Cost', 'Expense Account', 'Taxable', 'Category'],
      [
        ...draft.laborRates.map(r => [r.label, r.unit === 'hour' ? `${r.label} (per hour)` : r.label, r.sku || '', 'Service', r.rate.toFixed(2), 'Services', '', '', 'No', 'Labor']),
        ...materials.filter(m => m.status !== 'inactive').map(m => [
          m.name, m.description || m.name, m.sku || '', 'Non-inventory', materialPrice(m, draft).toFixed(2), incomeFor(m.category),
          (m.standardCost || 0).toFixed(2), 'Cost of Goods Sold', m.taxable ? 'Yes' : 'No', m.category,
        ]),
      ]);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!canEdit
          ? <p className="text-[11px] text-accent-gold">View only — payroll and super admins can change the price book.</p>
          : <p className="text-[11px] text-text-muted">Add materials on the Materials tab — each is priced from its category&apos;s markup below.</p>}
        <Button variant="outline" size="sm" className="h-9" onClick={exportForQuickBooks} title="QuickBooks Online → Settings → Import data → Products and services">
          <Download size={13} className="mr-1.5" /> Export for QuickBooks
        </Button>
      </div>
      <fieldset disabled={!canEdit} className="space-y-6">
        {/* Labor rates */}
        <Card className="bg-bg-secondary border-border-main">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Labor &amp; service rates</CardTitle>
            <CardDescription className="text-xs">Picked on quote and invoice labor lines. Plan labor discounts apply to these.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {draft.laborRates.length === 0 && <p className="text-[12px] text-text-muted py-2">No rates yet — add your labor and service charges.</p>}
            {draft.laborRates.map(r => (
              <div key={r.id} className="grid grid-cols-2 sm:grid-cols-[1.6fr,0.8fr,0.8fr,1fr,0.9fr,auto] gap-2 items-end p-2 rounded-lg border border-border-sub bg-bg-primary">
                <div className="col-span-2 sm:col-span-1 space-y-1">
                  <Label className={labelCls}>Name</Label>
                  <Input className={inputCls} value={r.label} onChange={e => setRate(r.id, { label: e.target.value })} placeholder="e.g. Installation labor" />
                </div>
                <div className="space-y-1">
                  <Label className={labelCls}>Rate ($)</Label>
                  <Input type="number" min="0" step="0.01" className={`${inputCls} font-mono`} value={r.rate || ''} onChange={e => setRate(r.id, { rate: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1">
                  <Label className={labelCls}>Per</Label>
                  <Select value={r.unit} onValueChange={v => setRate(r.id, { unit: v as LaborRate['unit'] })}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="hour">Hour</SelectItem><SelectItem value="flat">Flat</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className={labelCls}>Minimum</Label>
                  <Input className={inputCls} value={r.minimum} onChange={e => setRate(r.id, { minimum: e.target.value })} placeholder="e.g. 2 hr min" />
                </div>
                <div className="space-y-1">
                  <Label className={labelCls}>SKU</Label>
                  <Input className={`${inputCls} font-mono`} value={r.sku || ''} onChange={e => setRate(r.id, { sku: e.target.value })} placeholder="Optional" />
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-text-muted hover:text-text-red justify-self-end"
                  onClick={() => update({ laborRates: draft.laborRates.filter(x => x.id !== r.id) })} aria-label={`Remove ${r.label || 'rate'}`}>
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => update({ laborRates: [...draft.laborRates, { id: newId('rate'), label: '', rate: 0, unit: 'hour', minimum: '' }] })} className="h-9 text-[11px]">
              <Plus size={12} className="mr-1.5" /> Add rate
            </Button>
          </CardContent>
        </Card>

        {/* Multipliers */}
        <Card className="bg-bg-secondary border-border-main">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Labor multipliers</CardTitle>
            <CardDescription className="text-xs">
              Chosen per labor line — the rate is multiplied by this. ×2 doubles it (after hours); ×0.9 takes 10% off.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {draft.multipliers.map(m => (
              <div key={m.id} className="grid grid-cols-[1fr,96px,auto] sm:grid-cols-[1.6fr,110px,1fr,auto] gap-2 items-end p-2 rounded-lg border border-border-sub bg-bg-primary">
                <div className="space-y-1">
                  <Label className={labelCls}>Name</Label>
                  <Input className={inputCls} value={m.label} onChange={e => setMult(m.id, { label: e.target.value })} placeholder="e.g. After hours" />
                </div>
                <div className="space-y-1">
                  <Label className={labelCls}>Multiply by</Label>
                  <Input type="number" min="0" step="0.05" className={`${inputCls} font-mono`} value={m.factor || ''} onChange={e => setMult(m.id, { factor: parseFloat(e.target.value) || 0 })} />
                </div>
                <p className="hidden sm:block text-[11px] text-text-muted pb-2.5">
                  {m.factor > 0 ? `${describeFactor(m.factor)} · $100/hr → ${formatMoney(roundCents(100 * m.factor))}/hr` : '—'}
                </p>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-text-muted hover:text-text-red"
                  onClick={() => update({ multipliers: draft.multipliers.filter(x => x.id !== m.id) })} aria-label={`Remove ${m.label || 'multiplier'}`}>
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => update({ multipliers: [...draft.multipliers, { id: newId('mult'), label: '', factor: 1.5 }] })} className="h-9 text-[11px]">
              <Plus size={12} className="mr-1.5" /> Add multiplier
            </Button>
          </CardContent>
        </Card>

        {/* Categories */}
        <Card className="bg-bg-secondary border-border-main">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Material categories &amp; markup</CardTitle>
            <CardDescription className="text-xs">
              Every material is filed under a category and priced cost × (1 + markup) — change a markup and every material in it follows,
              unless the material sets its own price.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {draft.categories.map(c => {
              const n = inUse(c);
              return (
                <div key={c.id} className="grid grid-cols-[1fr,90px,auto] sm:grid-cols-[1.4fr,90px,1.2fr,90px,auto] gap-2 items-end p-2 rounded-lg border border-border-sub bg-bg-primary">
                  <div className="space-y-1">
                    <Label className={labelCls}>Category</Label>
                    <Input className={inputCls} value={c.name} onChange={e => setCat(c.id, { name: e.target.value })} placeholder="e.g. Cable" />
                  </div>
                  <div className="space-y-1">
                    <Label className={labelCls}>Markup %</Label>
                    <Input type="number" min="0" step="0.5" className={`${inputCls} font-mono`} value={c.markupPct} onChange={e => setCat(c.id, { markupPct: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="hidden sm:block space-y-1">
                    <Label className={labelCls}>QuickBooks income account</Label>
                    <Input className={inputCls} value={c.qbIncomeAccount || ''} onChange={e => setCat(c.id, { qbIncomeAccount: e.target.value })} placeholder="Sales of Product Income" />
                  </div>
                  <p className="hidden sm:block text-[10px] text-text-muted pb-2.5">$100 → {formatMoney(roundCents(100 * (1 + c.markupPct / 100)))}<br />{n} material{n === 1 ? '' : 's'}</p>
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-text-muted hover:text-text-red disabled:opacity-30"
                    disabled={n > 0} title={n > 0 ? 'Move or remove its materials first' : undefined}
                    onClick={() => update({ categories: draft.categories.filter(x => x.id !== c.id) })} aria-label={`Remove ${c.name || 'category'}`}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={() => update({ categories: [...draft.categories, { id: newId('cat'), name: '', markupPct: draft.defaultMarkupPct }] })} className="h-9 text-[11px]">
              <Plus size={12} className="mr-1.5" /> Add category
            </Button>
            <div className="flex items-end gap-3 pt-2">
              <div className="space-y-1 w-32">
                <Label className={labelCls}>Default markup %</Label>
                <Input type="number" min="0" step="0.5" className={`${inputCls} font-mono`} value={draft.defaultMarkupPct} onChange={e => update({ defaultMarkupPct: parseFloat(e.target.value) || 0 })} />
              </div>
              <p className="text-[10px] text-text-muted pb-2">For a material whose category isn&apos;t listed above, and the starting markup for new categories.</p>
            </div>
          </CardContent>
        </Card>

        {/* Tax */}
        <Card className="bg-bg-secondary border-border-main">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Sales tax</CardTitle>
            <CardDescription className="text-xs">Charged on taxable materials only. Labor is never taxed.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 w-32">
              <Label className={labelCls}>Rate %</Label>
              <Input type="number" min="0" step="0.01" className={`${inputCls} font-mono`} value={draft.salesTaxPct} onChange={e => update({ salesTaxPct: parseFloat(e.target.value) || 0 })} />
            </div>
          </CardContent>
        </Card>
      </fieldset>

      {canEdit && (
        <div className="flex items-center justify-end gap-2 sticky bottom-4">
          {dirty && (
            <Button variant="outline" onClick={() => { setDraft(settings); setDirty(false); }} disabled={saving} className="h-10 text-[11px]">Discard</Button>
          )}
          <Button onClick={handleSave} disabled={!dirty || saving} className="h-10 px-6 bg-brand-red hover:bg-brand-red/90 text-white text-[11px] shadow-lg">
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Save size={12} className="mr-1.5" />} Save price book
          </Button>
        </div>
      )}
    </div>
  );
}
