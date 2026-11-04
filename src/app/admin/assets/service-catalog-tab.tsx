'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RotateCcw, Save, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  DEFAULT_ASSUMPTIONS, DEFAULT_SERVICES, unitCost,
  type CatalogService, type EstimatingAssumptions,
} from '@/lib/estimating';
import { saveEstimatingSettings, useEstimatingSettings } from '@/lib/site-walk-actions';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const n = (v: string) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };

const NUM_FIELDS: { key: keyof EstimatingAssumptions; label: string; suffix?: string; hint?: string }[] = [
  { key: 'wage', label: 'Technician wage', suffix: '$/h' },
  { key: 'burdenPct', label: 'Labor burden', suffix: '%', hint: 'Taxes, insurance, other direct labor cost' },
  { key: 'targetGmPct', label: 'Target gross margin', suffix: '%' },
  { key: 'floorGmPct', label: 'Minimum gross margin', suffix: '%', hint: 'Below this, a super admin must approve' },
  { key: 'materialUpliftPct', label: 'Material cost adjustment', suffix: '%', hint: 'Added to every catalog material cost' },
  { key: 'taxPct', label: 'Tax rate', suffix: '%' },
  { key: 'quoteValidityDays', label: 'Quote validity', suffix: 'days' },
  { key: 'cableWastePct', label: 'Cable waste', suffix: '%', hint: 'Drop calculator footage allowance' },
  { key: 'defaultSlackFt', label: 'Default slack / service loop', suffix: 'ft' },
  { key: 'maxCopperRunFt', label: 'Max copper run', suffix: 'ft', hint: 'TIA 90 m channel = 295 ft' },
  { key: 'cableBoxFt', label: 'Cable box size', suffix: 'ft' },
];
const TEXT_FIELDS: { key: keyof EstimatingAssumptions; label: string }[] = [
  { key: 'paymentTerms', label: 'Payment terms' },
  { key: 'exclusions', label: 'Exclusions' },
  { key: 'changeOrders', label: 'Change orders' },
  { key: 'warranty', label: 'Warranty' },
];

/**
 * Assets & Materials → Service catalog: the estimating workbook's Rate Sheet
 * and Assumptions. Site walks and their approval price from here.
 */
export function ServiceCatalogTab() {
  const { toast } = useToast();
  const live = useEstimatingSettings();
  const [a, setA] = useState<EstimatingAssumptions>(DEFAULT_ASSUMPTIONS);
  const [services, setServices] = useState<CatalogService[]>(DEFAULT_SERVICES);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');

  useEffect(() => {
    if (live.loading || dirty) return;
    setA(live.assumptions);
    setServices(live.services);
  }, [live.loading, live.assumptions, live.services]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = <T,>(fn: (x: T) => void) => (x: T) => { fn(x); setDirty(true); };
  const setAssumption = edit(([k, v]: [keyof EstimatingAssumptions, unknown]) => setA(p => ({ ...p, [k]: v })));
  const setSvc = (code: string, patch: Partial<CatalogService>) => { setServices(ss => ss.map(s => (s.code === code ? { ...s, ...patch } : s))); setDirty(true); };

  const cats = useMemo(() => [...new Set(services.map(s => s.category))], [services]);
  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return services.filter(s => (cat === 'all' || s.category === cat) && words.every(w => `${s.code} ${s.name} ${s.category}`.toLowerCase().includes(w)));
  }, [services, search, cat]);

  const save = async () => {
    const codes = services.map(s => s.code.trim());
    if (codes.some(c => !c) || new Set(codes).size !== codes.length) { toast({ variant: 'destructive', title: 'Every service needs a unique code' }); return; }
    setSaving(true);
    try {
      await saveEstimatingSettings({ assumptions: a, services });
      setDirty(false);
      toast({ title: 'Service catalog saved', description: 'New site walk reviews use these prices and assumptions.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not save', description: e?.code === 'permission-denied' ? 'Only admins can change the service catalog.' : e.message });
    } finally { setSaving(false); }
  };

  const addService = () => {
    let i = 1; while (services.some(s => s.code === `NEW-${String(i).padStart(2, '0')}`)) i++;
    setServices(ss => [{ code: `NEW-${String(i).padStart(2, '0')}`, category: cat === 'all' ? 'Labor' : cat, name: 'New service', unit: 'each', priceLow: 0, priceTarget: 0, priceHigh: 0, materialCost: 0, techHours: 0, otherCost: 0, active: true }, ...ss]);
    setDirty(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-text-muted max-w-2xl">
          The estimating workbook&apos;s rate sheet. Direct cost / unit = material × (1 + adjustment) + tech hours × wage × (1 + burden) + other cost. Site walks are priced at the target price on review.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { if (confirm('Reset the catalog and assumptions to the v3 workbook values? Unsaved until you press Save.')) { setA(DEFAULT_ASSUMPTIONS); setServices(DEFAULT_SERVICES); setDirty(true); } }}>
            <RotateCcw size={14} className="mr-1.5" /> Workbook defaults
          </Button>
          <Button onClick={save} disabled={!dirty || saving} className="bg-brand-red hover:bg-brand-red/90 text-white">
            {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />} Save{dirty ? ' changes' : 'd'}
          </Button>
        </div>
      </div>

      {/* Assumptions */}
      <div className="rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-4">
        <p className="text-[14px] font-semibold text-text-primary">Assumptions</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {NUM_FIELDS.map(f => (
            <div key={f.key} className="space-y-1">
              <Label className="text-[12px] text-text-secondary">{f.label}{f.suffix ? ` (${f.suffix})` : ''}</Label>
              <Input type="number" inputMode="decimal" value={String(a[f.key] ?? '')} onChange={e => setAssumption([f.key, n(e.target.value)])} className="h-9 font-mono" />
              {f.hint && <p className="text-[11px] text-text-muted">{f.hint}</p>}
            </div>
          ))}
          <div className="space-y-1">
            <Label className="text-[12px] text-text-secondary">Home state</Label>
            <Input value={a.homeState} onChange={e => setAssumption(['homeState', e.target.value.toUpperCase().slice(0, 2)])} className="h-9 font-mono" />
          </div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-3">
            <Label className="text-[12px] text-text-secondary">Service states (comma separated)</Label>
            <Input value={a.serviceStates.join(', ')} onChange={e => setAssumption(['serviceStates', e.target.value.split(',').map(x => x.trim().toUpperCase()).filter(Boolean)])} className="h-9 font-mono" />
          </div>
        </div>
        <p className="text-[12px] text-text-muted font-mono">Burdened labor: {fmt(a.wage * (1 + a.burdenPct / 100))}/h</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TEXT_FIELDS.map(f => (
            <div key={f.key} className="space-y-1">
              <Label className="text-[12px] text-text-secondary">{f.label} (on every quote)</Label>
              <Textarea value={String(a[f.key] ?? '')} onChange={e => setAssumption([f.key, e.target.value])} className="min-h-[60px] text-[12px]" />
            </div>
          ))}
        </div>
      </div>

      {/* Services */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code or service" className="pl-8 h-9" />
          </div>
          <Button variant="outline" className="h-9" onClick={addService}><Plus size={14} className="mr-1.5" /> Add service</Button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {['all', ...cats].map(k => (
            <button key={k} type="button" onClick={() => setCat(k)} className={cn('shrink-0 rounded-full border px-3 py-1 text-[12px] font-medium', cat === k ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-muted')}>
              {k === 'all' ? 'All' : k}
            </button>
          ))}
        </div>
        <div className="table-wrap rounded-lg border border-border-sub">
          <table className="w-full text-[12px]">
            <thead className="bg-bg-tertiary text-text-muted text-left">
              <tr>
                <th className="px-2 py-2 font-semibold">Code</th>
                <th className="px-2 py-2 font-semibold">Service</th>
                <th className="px-2 py-2 font-semibold">Unit</th>
                <th className="px-2 py-2 font-semibold text-right">Low</th>
                <th className="px-2 py-2 font-semibold text-right">Target</th>
                <th className="px-2 py-2 font-semibold text-right">High</th>
                <th className="px-2 py-2 font-semibold text-right">Material</th>
                <th className="px-2 py-2 font-semibold text-right">Tech h</th>
                <th className="px-2 py-2 font-semibold text-right">Other</th>
                <th className="px-2 py-2 font-semibold text-right">Cost</th>
                <th className="px-2 py-2 font-semibold text-right">GM @ target</th>
                <th className="px-2 py-2 font-semibold">On</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map(s => {
                const cost = unitCost(s, a);
                const gm = s.priceTarget > 0 ? Math.round(((s.priceTarget - cost) / s.priceTarget) * 1000) / 10 : null;
                const numCell = (k: keyof CatalogService, w = 'w-20') => (
                  <td className="px-1 py-1 text-right"><Input type="number" inputMode="decimal" value={String(s[k] ?? 0)} onChange={e => setSvc(s.code, { [k]: n(e.target.value) } as Partial<CatalogService>)} className={cn('h-8 text-right font-mono ml-auto', w)} /></td>
                );
                return (
                  <tr key={s.code} className={cn('border-t border-border-sub', s.active === false && 'opacity-50')} title={s.note}>
                    <td className="px-1 py-1"><Input value={s.code} onChange={e => { const code = e.target.value.toUpperCase(); setServices(ss => ss.map(x => (x === s ? { ...x, code } : x))); setDirty(true); }} className="h-8 w-24 font-mono" /></td>
                    <td className="px-1 py-1 min-w-[220px]">
                      <Input value={s.name} onChange={e => setSvc(s.code, { name: e.target.value })} className="h-8" />
                      <Input value={s.category} onChange={e => setSvc(s.code, { category: e.target.value })} className="h-7 mt-1 text-[11px] text-text-muted" />
                    </td>
                    <td className="px-1 py-1"><Input value={s.unit} onChange={e => setSvc(s.code, { unit: e.target.value })} className="h-8 w-24" /></td>
                    {numCell('priceLow')}{numCell('priceTarget')}{numCell('priceHigh')}{numCell('materialCost')}{numCell('techHours', 'w-16')}{numCell('otherCost')}
                    <td className="px-2 py-1 text-right font-mono text-text-muted whitespace-nowrap">{fmt(cost)}</td>
                    <td className={cn('px-2 py-1 text-right font-mono font-semibold', gm == null ? 'text-text-muted' : gm >= a.targetGmPct ? 'text-text-green' : gm >= a.floorGmPct ? 'text-accent-gold' : 'text-text-red')}>{gm == null ? '—' : `${gm}%`}</td>
                    <td className="px-2 py-1"><Switch checked={s.active !== false} onCheckedChange={v => setSvc(s.code, { active: v })} /></td>
                    <td className="px-1 py-1"><button type="button" aria-label={`Remove ${s.code}`} className="h-8 w-8 flex items-center justify-center text-text-muted hover:text-text-red"
                      onClick={() => { if (confirm(`Remove ${s.code} ${s.name}? Walks already using it will show it as unknown.`)) { setServices(ss => ss.filter(x => x !== s)); setDirty(true); } }}><Trash2 size={14} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
