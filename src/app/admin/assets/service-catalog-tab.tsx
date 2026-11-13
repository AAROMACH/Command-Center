'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Link2, Loader2, Plus, Save, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { usePricingSettings } from '@/hooks/use-billing';
import { savePricing } from '@/lib/billing-actions';
import type { LaborRate } from '@/lib/billing';
import { cn } from '@/lib/utils';
import {
  DEFAULT_ASSUMPTIONS, DEFAULT_SERVICES, isHourlyUnit, resolveCatalog, suggestLaborRate, unitCost,
  type CatalogService, type EstimatingAssumptions,
} from '@/lib/estimating';
import { saveEstimatingSettings, useEstimatingSettings } from '@/lib/site-walk-actions';

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const n = (v: string) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
const OWN = '__own';

type Field = { key: keyof EstimatingAssumptions; label: string; suffix?: string; hint?: string };
const ASSUMPTION_GROUPS: { title: string; hint: string; fields: Field[] }[] = [
  {
    title: 'Cost & margin', hint: 'How each item’s direct cost and margin are worked out',
    fields: [
      { key: 'wage', label: 'Technician wage', suffix: '$/h', hint: 'What we pay — not what we bill (that’s a labor rate)' },
      { key: 'burdenPct', label: 'Labor burden', suffix: '%', hint: 'Taxes, insurance, other direct labor cost' },
      { key: 'materialUpliftPct', label: 'Material cost adjustment', suffix: '%', hint: 'Added to every catalog material cost' },
      { key: 'targetGmPct', label: 'Target gross margin', suffix: '%' },
      { key: 'floorGmPct', label: 'Minimum gross margin', suffix: '%', hint: 'Below this, a super admin must approve' },
    ],
  },
  {
    title: 'Cabling calculator', hint: 'Site walk drop takeoff',
    fields: [
      { key: 'cableWastePct', label: 'Cable waste', suffix: '%' },
      { key: 'defaultSlackFt', label: 'Default slack / service loop', suffix: 'ft' },
      { key: 'maxCopperRunFt', label: 'Max copper run', suffix: 'ft', hint: 'TIA 90 m channel = 295 ft' },
      { key: 'cableBoxFt', label: 'Cable box size', suffix: 'ft' },
    ],
  },
  {
    title: 'Quotes & service area', hint: 'Site walk quotes: validity, tax, where we work',
    fields: [
      { key: 'quoteValidityDays', label: 'Quote validity', suffix: 'days' },
      { key: 'taxPct', label: 'Tax rate', suffix: '%' },
    ],
  },
];
const TEXT_FIELDS: { key: keyof EstimatingAssumptions; label: string }[] = [
  { key: 'paymentTerms', label: 'Payment terms' },
  { key: 'exclusions', label: 'Exclusions' },
  { key: 'changeOrders', label: 'Change orders' },
  { key: 'warranty', label: 'Warranty' },
];

/**
 * Assets & Materials → Service catalog: packaged per-unit prices (per drop,
 * device, site…) with a modeled direct cost, which site walks are priced from.
 * Hourly items can follow a labor rate from Labor rates & markups so tech time has
 * one price everywhere.
 */
export function ServiceCatalogTab({ canEditPricing = false }: { canEditPricing?: boolean }) {
  const { toast } = useToast();
  const live = useEstimatingSettings();
  const { settings: pricing } = usePricingSettings();
  const [a, setA] = useState<EstimatingAssumptions>(DEFAULT_ASSUMPTIONS);
  const [services, setServices] = useState<CatalogService[]>(DEFAULT_SERVICES);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const [showOff, setShowOff] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [showAssumptions, setShowAssumptions] = useState(false);

  useEffect(() => {
    if (live.loading || dirty) return;
    setA(live.assumptions);
    setServices(live.rawServices);
  }, [live.loading, live.assumptions, live.rawServices]); // eslint-disable-line react-hooks/exhaustive-deps

  const hourlyRates = pricing.laborRates.filter(r => r.unit === 'hour');
  const resolved = useMemo(() => resolveCatalog(services, pricing.laborRates), [services, pricing.laborRates]);

  const setAssumption = (k: keyof EstimatingAssumptions, v: unknown) => { setA(p => ({ ...p, [k]: v })); setDirty(true); };
  const setSvc = (code: string, patch: Partial<CatalogService>) => { setServices(ss => ss.map(s => (s.code === code ? { ...s, ...patch } : s))); setDirty(true); };

  const cats = useMemo(() => [...new Set(services.map(s => s.category))], [services]);
  const offCount = services.filter(s => s.active === false).length;
  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return resolved
      .filter(s => (showOff || s.active !== false || s.code === open) && (cat === 'all' || s.category === cat)
        && words.every(w => `${s.code} ${s.name} ${s.category}`.toLowerCase().includes(w)))
      .sort((x, y) => cats.indexOf(x.category) - cats.indexOf(y.category));
  }, [resolved, search, cat, showOff, open, cats]);

  // Hourly items still on their own price that match a labor rate by name.
  const linkable = useMemo(() => services
    .filter(s => s.active !== false && isHourlyUnit(s.unit) && !s.laborRateId)
    .map(s => ({ s, r: suggestLaborRate(s, pricing.laborRates) }))
    .filter((x): x is { s: CatalogService; r: LaborRate } => !!x.r), [services, pricing.laborRates]);
  // With no hourly labor rates yet, the catalog's own hourly labor rows can become them.
  const seedRows = hourlyRates.length ? [] : services.filter(s => s.active !== false && isHourlyUnit(s.unit) && /labor/i.test(s.category) && s.priceTarget > 0);

  const persist = async (next: CatalogService[]) => {
    const codes = next.map(s => s.code.trim());
    if (codes.some(c => !c) || new Set(codes).size !== codes.length) { toast({ variant: 'destructive', title: 'Every service needs a unique code' }); return false; }
    setSaving(true);
    try {
      await saveEstimatingSettings({ assumptions: a, services: next });
      setDirty(false);
      return true;
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not save', description: e?.code === 'permission-denied' ? 'Only admins can change the service catalog.' : e.message });
      return false;
    } finally { setSaving(false); }
  };

  const save = async () => {
    if (await persist(services)) toast({ title: 'Service catalog saved', description: 'New site walk reviews use these prices and assumptions.' });
  };

  const linkAll = () => {
    const ids = new Map(linkable.map(x => [x.s.code, x.r.id]));
    setServices(ss => ss.map(s => (ids.has(s.code) ? { ...s, laborRateId: ids.get(s.code)! } : s)));
    setDirty(true);
    toast({ title: `Linked ${ids.size} hourly item${ids.size === 1 ? '' : 's'}`, description: 'Press Save to keep it.' });
  };

  const seedRates = async () => {
    if (!confirm(`Create ${seedRows.length} hourly labor rate${seedRows.length === 1 ? '' : 's'} (${seedRows.map(s => `${s.name} ${fmt(s.priceTarget)}`).join(', ')}) in Labor rates & markups, and link these items to them?`)) return;
    const made = seedRows.map((s, i) => ({ code: s.code, rate: { id: `rate-${Date.now().toString(36)}${i}`, label: s.name, rate: s.priceTarget, unit: 'hour' as const, minimum: '' } }));
    try {
      await savePricing({ ...pricing, laborRates: [...pricing.laborRates, ...made.map(m => m.rate)] });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not create labor rates', description: e?.code === 'permission-denied' ? 'Only billing admins can change labor rates.' : e.message });
      return;
    }
    const next = services.map(s => { const m = made.find(x => x.code === s.code); return m ? { ...s, laborRateId: m.rate.id } : s; });
    setServices(next);
    if (await persist(next)) toast({ title: 'Labor rates created', description: 'Change them in Labor rates & markups — these catalog items follow.' });
  };

  const addService = () => {
    let i = 1; while (services.some(s => s.code === `NEW-${String(i).padStart(2, '0')}`)) i++;
    const code = `NEW-${String(i).padStart(2, '0')}`;
    setServices(ss => [{ code, category: cat === 'all' ? (cats[0] || 'Other') : cat, name: 'New service', unit: 'each', priceLow: 0, priceTarget: 0, priceHigh: 0, materialCost: 0, techHours: 0, otherCost: 0, active: true }, ...ss]);
    setOpen(code);
    setDirty(true);
  };

  const gmCls = (gm: number | null) => gm == null ? 'text-text-muted' : gm >= a.targetGmPct ? 'text-text-green' : gm >= a.floorGmPct ? 'text-accent-gold' : 'text-text-red';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code or service" className="pl-8 h-9" />
        </div>
        <Button variant="outline" className="h-9" onClick={addService}><Plus size={14} className="mr-1.5" /> Add service</Button>
        <div className="ml-auto flex gap-2">
          <Button onClick={save} disabled={!dirty || saving} className="h-9 bg-brand-red hover:bg-brand-red/90 text-white">
            {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />} Save{dirty ? ' changes' : 'd'}
          </Button>
        </div>
      </div>

      {(linkable.length > 0 || (seedRows.length > 0 && canEditPricing)) && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-accent-gold/40 bg-accent-gold/5 px-3 py-2.5 text-[12px]">
          <Link2 size={14} className="text-accent-gold shrink-0" />
          {linkable.length > 0 ? (
            <>
              <span className="flex-1 min-w-[200px] text-text-secondary">
                {linkable.length} hourly item{linkable.length === 1 ? ' has' : 's have'} its own price but match{linkable.length === 1 ? 'es' : ''} a labor rate: {linkable.map(x => `${x.s.name} → ${x.r.label} (${fmt(x.r.rate)}/h)`).join(' · ')}
              </span>
              <Button size="sm" variant="outline" onClick={linkAll}>Link to labor rates</Button>
            </>
          ) : (
            <>
              <span className="flex-1 min-w-[200px] text-text-secondary">
                No hourly labor rates are set up yet, so quotes and job invoices have no rate to pick. Make the catalog&apos;s hourly labor prices your labor rates?
              </span>
              <Button size="sm" variant="outline" onClick={seedRates} disabled={saving}>Create {seedRows.length} labor rate{seedRows.length === 1 ? '' : 's'}</Button>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {['all', ...cats].map(k => (
          <button key={k} type="button" onClick={() => setCat(k)} className={cn('shrink-0 rounded-full border px-3 py-1 text-[12px] font-medium', cat === k ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-muted')}>
            {k === 'all' ? 'All' : k}
          </button>
        ))}
        {offCount > 0 && (
          <label className="ml-auto flex items-center gap-2 text-[12px] text-text-muted">
            <Switch checked={showOff} onCheckedChange={setShowOff} /> Show {offCount} turned off
          </label>
        )}
      </div>

      {/* Services */}
      <div className="table-wrap rounded-lg border border-border-sub">
        <table className="w-full text-[12px]">
          <thead className="bg-bg-tertiary text-text-muted text-left">
            <tr>
              <th className="w-8" />
              <th className="px-2 py-2 font-semibold">Service</th>
              <th className="px-2 py-2 font-semibold">Per</th>
              <th className="px-2 py-2 font-semibold text-right">Price</th>
              <th className="px-2 py-2 font-semibold text-right">Our cost</th>
              <th className="px-2 py-2 font-semibold text-right">Margin</th>
              <th className="px-2 py-2 font-semibold">On</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s, i) => {
              const cost = unitCost(s, a);
              const gm = s.priceTarget > 0 ? Math.round(((s.priceTarget - cost) / s.priceTarget) * 1000) / 10 : null;
              const isOpen = open === s.code;
              const linked = !!s.linkedRateLabel;
              const brokenLink = !!s.laborRateId && !linked;
              const numField = (k: keyof CatalogService, label: string, disabled = false) => (
                <div className="space-y-1">
                  <Label className="text-[11px] text-text-muted">{label}</Label>
                  <Input type="number" inputMode="decimal" disabled={disabled} value={String(s[k] ?? 0)} onChange={e => setSvc(s.code, { [k]: n(e.target.value) } as Partial<CatalogService>)} className="h-8 font-mono" />
                </div>
              );
              return (
                <Fragment key={s.code}>
                  {(i === 0 || shown[i - 1].category !== s.category) && (
                    <tr className="border-t border-border-sub bg-bg-secondary/60">
                      <td colSpan={7} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">{s.category}</td>
                    </tr>
                  )}
                  <tr className={cn('border-t border-border-sub cursor-pointer hover:bg-bg-tertiary/50', s.active === false && 'opacity-50', isOpen && 'bg-bg-tertiary/50')} onClick={() => setOpen(isOpen ? null : s.code)}>
                    <td className="pl-2 text-text-muted">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                    <td className="px-2 py-2">
                      <p className="font-medium text-text-primary">{s.name}</p>
                      <p className="text-[11px] text-text-muted font-mono">{s.code}</p>
                    </td>
                    <td className="px-2 py-2 text-text-secondary whitespace-nowrap">{s.unit}</td>
                    <td className="px-2 py-2 text-right font-mono font-semibold whitespace-nowrap">
                      {fmt(s.priceTarget)}
                      {linked && <span className="flex items-center justify-end gap-1 text-[10px] font-sans font-normal text-text-muted"><Link2 size={10} /> {s.linkedRateLabel}</span>}
                      {brokenLink && <span className="block text-[10px] font-sans font-normal text-text-red">Labor rate removed — own price</span>}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-text-muted whitespace-nowrap">{fmt(cost)}</td>
                    <td className={cn('px-2 py-2 text-right font-mono font-semibold', gmCls(gm))}>{gm == null ? '—' : `${gm}%`}</td>
                    <td className="px-2 py-2" onClick={e => e.stopPropagation()}><Switch checked={s.active !== false} onCheckedChange={v => setSvc(s.code, { active: v })} /></td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-bg-tertiary/30">
                      <td />
                      <td colSpan={6} className="px-2 pb-3 pt-1">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                          <div className="space-y-1 col-span-2 sm:col-span-3 lg:col-span-3">
                            <Label className="text-[11px] text-text-muted">Name</Label>
                            <Input value={s.name} onChange={e => setSvc(s.code, { name: e.target.value })} className="h-8" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-text-muted">Code</Label>
                            <Input value={s.code} onChange={e => { const code = e.target.value.toUpperCase(); setServices(ss => ss.map(x => (x.code === s.code ? { ...x, code } : x))); setOpen(code); setDirty(true); }} className="h-8 font-mono" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-text-muted">Category</Label>
                            <Input value={s.category} onChange={e => setSvc(s.code, { category: e.target.value })} className="h-8" list="catalog-categories" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-text-muted">Per (unit)</Label>
                            <Input value={s.unit} onChange={e => setSvc(s.code, { unit: e.target.value })} className="h-8" />
                          </div>

                          {isHourlyUnit(s.unit) && (
                            <div className="space-y-1 col-span-2 sm:col-span-3">
                              <Label className="text-[11px] text-text-muted">Bills at</Label>
                              <Select value={s.laborRateId && hourlyRates.some(r => r.id === s.laborRateId) ? s.laborRateId : OWN} onValueChange={v => setSvc(s.code, { laborRateId: v === OWN ? null : v })}>
                                <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={OWN}>Its own price (below)</SelectItem>
                                  {hourlyRates.map(r => <SelectItem key={r.id} value={r.id}>Labor rate: {r.label} — {fmt(r.rate)}/h</SelectItem>)}
                                </SelectContent>
                              </Select>
                              {!hourlyRates.length && <p className="text-[11px] text-text-muted">Add hourly labor rates in Labor rates &amp; markups to link this.</p>}
                            </div>
                          )}
                          {numField('priceLow', 'Low', linked)}
                          {numField('priceTarget', linked ? 'Price (labor rate)' : 'Price (target)', linked)}
                          {numField('priceHigh', 'High', linked)}
                          {numField('materialCost', 'Material cost')}
                          {numField('techHours', 'Tech hours')}
                          {numField('otherCost', 'Other cost')}
                          <div className="space-y-1 col-span-2 sm:col-span-3 lg:col-span-5">
                            <Label className="text-[11px] text-text-muted">Note (scope, what&apos;s excluded)</Label>
                            <Input value={s.note || ''} onChange={e => setSvc(s.code, { note: e.target.value })} className="h-8" />
                          </div>
                          <div className="flex items-end">
                            <Button variant="ghost" size="sm" className="text-text-muted hover:text-text-red"
                              onClick={() => { if (confirm(`Remove ${s.code} ${s.name}? Walks already using it will show it as unknown. Turning it off keeps it on old walks.`)) { setServices(ss => ss.filter(x => x.code !== s.code)); setOpen(null); setDirty(true); } }}>
                              <Trash2 size={13} className="mr-1" /> Remove
                            </Button>
                          </div>
                        </div>
                        <p className="mt-2 text-[11px] text-text-muted font-mono">
                          Our cost = {fmt(s.materialCost)} × {1 + a.materialUpliftPct / 100} + {s.techHours} h × {fmt(a.wage * (1 + a.burdenPct / 100))} + {fmt(s.otherCost)} = {fmt(cost)}
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!shown.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-text-muted">No services match.</td></tr>}
          </tbody>
        </table>
        <datalist id="catalog-categories">{cats.map(c => <option key={c} value={c} />)}</datalist>
      </div>

      {/* Assumptions */}
      <div className="rounded-xl border border-border-sub bg-bg-secondary">
        <button type="button" onClick={() => setShowAssumptions(v => !v)} className="w-full flex items-center gap-2 px-4 py-3 text-left">
          {showAssumptions ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="text-[14px] font-semibold text-text-primary">Assumptions</span>
          <span className="text-[12px] text-text-muted">Wage {fmt(a.wage)}/h · burdened {fmt(a.wage * (1 + a.burdenPct / 100))}/h · target {a.targetGmPct}% · floor {a.floorGmPct}%</span>
        </button>
        {showAssumptions && (
          <div className="px-4 pb-4 space-y-5">
            {ASSUMPTION_GROUPS.map(g => (
              <div key={g.title} className="space-y-2">
                <p className="text-[12px] font-semibold text-text-primary">{g.title} <span className="font-normal text-text-muted">— {g.hint}</span></p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {g.fields.map(f => (
                    <div key={f.key} className="space-y-1">
                      <Label className="text-[12px] text-text-secondary">{f.label}{f.suffix ? ` (${f.suffix})` : ''}</Label>
                      <Input type="number" inputMode="decimal" value={String(a[f.key] ?? '')} onChange={e => setAssumption(f.key, n(e.target.value))} className="h-9 font-mono" />
                      {f.hint && <p className="text-[11px] text-text-muted">{f.hint}</p>}
                    </div>
                  ))}
                  {g.title === 'Quotes & service area' && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-[12px] text-text-secondary">Home state</Label>
                        <Input value={a.homeState} onChange={e => setAssumption('homeState', e.target.value.toUpperCase().slice(0, 2))} className="h-9 font-mono" />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-[12px] text-text-secondary">Service states (comma separated)</Label>
                        <Input value={a.serviceStates.join(', ')} onChange={e => setAssumption('serviceStates', e.target.value.split(',').map(x => x.trim().toUpperCase()).filter(Boolean))} className="h-9 font-mono" />
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {TEXT_FIELDS.map(f => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-[12px] text-text-secondary">{f.label} (on every site walk quote)</Label>
                  <Textarea value={String(a[f.key] ?? '')} onChange={e => setAssumption(f.key, e.target.value)} className="min-h-[60px] text-[12px]" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
