'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Building2, Cable, Camera, Check, ChevronLeft, ChevronRight, ClipboardList, Copy, ImagePlus,
  Loader2, MapPin, Minus, Plus, Ruler, Search, Send, Trash2, X,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { uploadFile } from '@/lib/upload';
import {
  BUILDING_STATUSES, CABLE_TYPES, CEILING_TYPES, DISCOVERY, QUICK_ITEMS, WALK_AREAS,
  buildWalkLines, conditionLines, dropLength, dropTotals, genLineId, longRuns,
  type CableType, type DropRun, type SiteConditions, type SiteWalk, type WalkArea, type WalkLine,
} from '@/lib/estimating';
import { saveSiteWalk, submitSiteWalk, useEstimatingSettings } from '@/lib/site-walk-actions';

/**
 * The site walk — a tablet-first, step-by-step walkthrough a tech fills in
 * on site (or remotely from plans / a call). Quantities only: no prices,
 * costs or margins. Submitting sends it to admin review (site-walk-review).
 */

const STEPS = [
  { key: 'job', label: 'Job', icon: Building2 },
  { key: 'site', label: 'Site', icon: MapPin },
  { key: 'drops', label: 'Drops', icon: Ruler },
  { key: 'equipment', label: 'Equipment', icon: Cable },
  { key: 'questions', label: 'Questions & photos', icon: Camera },
  { key: 'review', label: 'Review', icon: ClipboardList },
] as const;

const lbl = 'text-[12px] font-semibold text-text-secondary';
const big = 'h-11 text-[15px] bg-bg-secondary border-border-main';
const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

function Stepper({ value, onChange, step = 1, min = 0, suffix }: { value: number; onChange: (n: number) => void; step?: number; min?: number; suffix?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Button type="button" variant="outline" className="h-11 w-11 p-0 shrink-0" onClick={() => onChange(Math.max(min, Math.round((value - step) * 100) / 100))} aria-label="Less"><Minus size={16} /></Button>
      <div className="relative w-24">
        <Input type="number" inputMode="decimal" value={value || value === 0 ? String(value) : ''} onChange={e => onChange(Math.max(min, num(e.target.value)))}
          className={cn(big, 'text-center font-mono', suffix && 'pr-8')} />
        {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-text-muted">{suffix}</span>}
      </div>
      <Button type="button" variant="outline" className="h-11 w-11 p-0 shrink-0" onClick={() => onChange(Math.round((value + step) * 100) / 100)} aria-label="More"><Plus size={16} /></Button>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange, children }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className={cn('rounded-xl border p-3 transition-colors', checked ? 'border-brand-red/40 bg-brand-red/5' : 'border-border-sub bg-bg-secondary')}>
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold text-text-primary">{label}</span>
          {hint && <span className="block text-[12px] text-text-muted">{hint}</span>}
        </span>
        <Switch checked={checked} onCheckedChange={onChange} />
      </label>
      {checked && children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function SiteWalkWizard({ open, onClose, initial, onSubmitted }: {
  open: boolean;
  onClose: () => void;
  /** A new walk (newSiteWalk) or an existing draft / returned walk. */
  initial: SiteWalk | null;
  onSubmitted?: (id: string) => void;
}) {
  const { toast } = useToast();
  const settings = useEstimatingSettings();
  const a = settings.assumptions;
  const [w, setW] = useState<SiteWalk | null>(initial);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setW(initial); setStep(0); } }, [open, initial?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof SiteWalk>(k: K, v: SiteWalk[K]) => setW(p => (p ? { ...p, [k]: v } : p));
  const setCond = <K extends keyof SiteConditions>(k: K, v: SiteConditions[K]) => setW(p => (p ? { ...p, conditions: { ...p.conditions, [k]: v } } : p));

  const totals = useMemo(() => dropTotals(w?.drops || [], a), [w?.drops, a]);
  const tooLong = useMemo(() => longRuns(w?.drops || [], a), [w?.drops, a]);
  const lines = useMemo(() => (w ? buildWalkLines(w, a) : []), [w, a]);

  if (!w) return null;
  const locked = !['draft', 'returned'].includes(w.status);

  const persist = async (quiet = true) => {
    if (locked) return w.id;
    setSaving(true);
    try {
      const id = await saveSiteWalk(w);
      if (!w.id) setW(p => (p ? { ...p, id } : p));
      if (!quiet) toast({ title: 'Draft saved', description: `Site walk ${id}` });
      return id;
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not save', description: e.message });
      return null;
    } finally { setSaving(false); }
  };

  const go = async (to: number) => {
    if (to > step && step === 0 && !(w.customerCompany.trim() || w.siteName.trim())) {
      toast({ variant: 'destructive', title: 'Add the customer or site name first' });
      return;
    }
    if (!locked && (w.customerCompany || w.siteName)) await persist();
    setStep(Math.max(0, Math.min(STEPS.length - 1, to)));
  };

  const submit = async () => {
    if (!lines.length) { toast({ variant: 'destructive', title: 'Nothing to quote yet', description: 'Add drops, equipment or site conditions first.' }); return; }
    setSaving(true);
    try {
      const id = await submitSiteWalk(w, settings);
      toast({ title: 'Sent for approval', description: `Site walk ${id} is with the office for pricing.` });
      onSubmitted?.(id);
      onClose();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not submit', description: e.message });
    } finally { setSaving(false); }
  };

  // ── Drops ──
  const addRun = (copy?: DropRun) => set('drops', [...w.drops, copy
    ? { ...copy, id: genLineId(), label: copy.label ? `${copy.label} (copy)` : '' }
    : { id: genLineId(), label: '', qty: 1, cable: 'CAT6', horizontalFt: 100, verticalFt: 15, slackFt: a.defaultSlackFt, plenum: true }]);
  const setRun = (id: string, patch: Partial<DropRun>) => set('drops', w.drops.map(d => (d.id === id ? { ...d, ...patch } : d)));

  // ── Equipment ──
  const qtyOf = (code: string) => w.manualLines.filter(l => l.code === code).reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const setQty = (code: string, qty: number) => {
    const rest = w.manualLines.filter(l => l.code !== code);
    set('manualLines', qty > 0 ? [...rest, { id: `m-${code}`, code, qty, source: 'manual' } as WalkLine] : rest);
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const id = w.id || await persist();
      if (!id) return;
      const added: SiteWalk['photos'] = [];
      for (const f of Array.from(files)) {
        const up = await uploadFile(`siteWalks/${id}/${Date.now()}-${f.name.replace(/[^\w.-]+/g, '_')}`, f, { contentType: f.type });
        added.push({ url: up.url, storagePath: up.storagePath, name: up.name, caption: '' });
      }
      setW(p => (p ? { ...p, id, photos: [...p.photos, ...added] } : p));
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Photo upload failed', description: e.message });
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const areaOn = (k: WalkArea) => w.areas.includes(k);
  const shownAreas = w.areas.length ? w.areas : (WALK_AREAS.map(x => x.key) as WalkArea[]);
  const suggestions = conditionLines(w.conditions, w.siteState, a);
  const nameOf = (code: string) => settings.catalog.get(code)?.name || code;
  const unitOf = (code: string) => settings.catalog.get(code)?.unit || '';
  const c = w.conditions;

  const body = (() => {
    switch (STEPS[step].key) {
      case 'job': return (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2">
            {(['on_site', 'remote'] as const).map(m => (
              <button key={m} type="button" disabled={locked} onClick={() => set('mode', m)}
                className={cn('h-14 rounded-xl border text-[15px] font-semibold transition-colors', w.mode === m ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-muted')}>
                {m === 'on_site' ? 'On site' : 'Remote (plans / call)'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className={lbl}>Customer / company *</Label><Input className={big} value={w.customerCompany} onChange={e => set('customerCompany', e.target.value)} placeholder="Acme Logistics" /></div>
            <div className="space-y-1.5"><Label className={lbl}>Site / project</Label><Input className={big} value={w.siteName} onChange={e => set('siteName', e.target.value)} placeholder="Warehouse B office build-out" /></div>
            <div className="space-y-1.5"><Label className={lbl}>Contact name</Label><Input className={big} value={w.contactName} onChange={e => set('contactName', e.target.value)} /></div>
            <div className="space-y-1.5"><Label className={lbl}>Contact phone</Label><Input className={big} type="tel" value={w.contactPhone} onChange={e => set('contactPhone', e.target.value)} /></div>
            <div className="space-y-1.5"><Label className={lbl}>Contact email</Label><Input className={big} type="email" value={w.contactEmail} onChange={e => set('contactEmail', e.target.value)} /></div>
            <div className="space-y-1.5"><Label className={lbl}>Walk date</Label><Input className={big} type="date" value={w.walkDate} onChange={e => set('walkDate', e.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label className={lbl}>Site address</Label><Input className={big} value={w.siteAddress} onChange={e => set('siteAddress', e.target.value)} placeholder="Street, city" /></div>
          </div>
          <div className="space-y-1.5">
            <Label className={lbl}>State</Label>
            <div className="flex flex-wrap gap-2">
              {a.serviceStates.map(s => (
                <button key={s} type="button" onClick={() => set('siteState', s)}
                  className={cn('h-11 min-w-[56px] px-3 rounded-lg border text-[14px] font-semibold', w.siteState === s ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-muted')}>{s}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className={lbl}>What's the job? (pick all that apply)</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {WALK_AREAS.map(x => (
                <button key={x.key} type="button" onClick={() => set('areas', areaOn(x.key) ? w.areas.filter(k => k !== x.key) : [...w.areas, x.key])}
                  className={cn('h-14 rounded-xl border px-2 text-[14px] font-semibold flex items-center justify-center gap-1.5 text-center', areaOn(x.key) ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-secondary')}>
                  {areaOn(x.key) && <Check size={15} />}{x.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      );

      case 'site': return (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label className={lbl}>Building</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {BUILDING_STATUSES.map(s => (
                <button key={s} type="button" onClick={() => setCond('buildingStatus', s)} className={cn('h-12 rounded-lg border text-[14px] font-medium', c.buildingStatus === s ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-secondary')}>{s}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className={lbl}>Ceiling</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CEILING_TYPES.map(s => (
                <button key={s} type="button" onClick={() => setCond('ceilingType', s)} className={cn('h-12 rounded-lg border text-[14px] font-medium', c.ceilingType === s ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-secondary')}>{s}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-6">
            <div className="space-y-1.5"><Label className={lbl}>Ceiling height</Label><Stepper value={c.ceilingHeightFt} onChange={v => setCond('ceilingHeightFt', v)} suffix="ft" /></div>
            <div className="space-y-1.5"><Label className={lbl}>Floors</Label><Stepper value={c.floors} onChange={v => setCond('floors', v)} min={1} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Toggle label="Difficult access" hint="Congested ceilings, odd pathways, restricted areas" checked={c.difficultAccess} onChange={v => setCond('difficultAccess', v)} />
            <Toggle label="Lift needed" hint="High ceilings / elevated work" checked={c.liftNeeded} onChange={v => setCond('liftNeeded', v)}>
              <Label className={lbl}>Lift days</Label><Stepper value={c.liftDays} onChange={v => setCond('liftDays', v)} min={1} />
            </Toggle>
            <Toggle label="After hours / restricted access" checked={c.afterHours} onChange={v => setCond('afterHours', v)}>
              <Label className={lbl}>Visits</Label><Stepper value={c.afterHoursVisits} onChange={v => setCond('afterHoursVisits', v)} min={1} />
            </Toggle>
            <Toggle label="Permit required" checked={c.permitRequired} onChange={v => setCond('permitRequired', v)} />
            <Toggle label="Remove existing cable" checked={c.removeExisting} onChange={v => setCond('removeExisting', v)}>
              <Label className={lbl}>Estimated hours</Label><Stepper value={c.removalHours} onChange={v => setCond('removalHours', v)} step={0.5} suffix="h" />
            </Toggle>
            <Toggle label="Conduit / pathway work" checked={c.pathwayWork} onChange={v => setCond('pathwayWork', v)}>
              <Label className={lbl}>Estimated hours</Label><Stepper value={c.pathwayHours} onChange={v => setCond('pathwayHours', v)} step={0.5} suffix="h" />
            </Toggle>
            <Toggle label="Union site" checked={c.unionSite} onChange={v => setCond('unionSite', v)} />
          </div>
          <div className="rounded-xl border border-border-sub p-3 space-y-3">
            <p className="text-[14px] font-semibold text-text-primary">Travel</p>
            <div className="flex flex-wrap gap-6">
              <div className="space-y-1.5"><Label className={lbl}>Round-trip miles</Label><Stepper value={c.roundTripMiles} onChange={v => setCond('roundTripMiles', v)} step={10} /></div>
              <div className="space-y-1.5"><Label className={lbl}>Travel time</Label><Stepper value={c.travelHours} onChange={v => setCond('travelHours', v)} step={0.5} suffix="h" /></div>
              <div className="space-y-1.5"><Label className={lbl}>Lodging nights</Label><Stepper value={c.lodgingNights} onChange={v => setCond('lodgingNights', v)} /></div>
            </div>
            {w.siteState !== a.homeState && <p className="text-[12px] text-accent-gold">Out of state ({w.siteState}) — mobilization is added.</p>}
          </div>
          <div className="space-y-1.5"><Label className={lbl}>Access notes</Label>
            <Textarea className="min-h-[80px] text-[15px] bg-bg-secondary" value={c.accessNotes} onChange={e => setCond('accessNotes', e.target.value)} placeholder="Badge-in, escort, loading dock hours, ceiling tile condition…" /></div>
        </div>
      );

      case 'drops': return (
        <div className="space-y-4">
          <p className="text-[13px] text-text-muted">One row per group of identical drops (a room, a row of desks, the cameras on a wall). Length per drop = horizontal + vertical + slack.</p>
          {w.drops.map((d, i) => {
            const len = dropLength(d);
            const long = d.cable !== 'Fiber' && len > a.maxCopperRunFt;
            return (
              <div key={d.id} className={cn('rounded-xl border p-3 space-y-3', long ? 'border-brand-red/50 bg-brand-red/5' : 'border-border-sub bg-bg-secondary')}>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold text-text-muted w-6">{i + 1}</span>
                  <Input className={cn(big, 'flex-1')} value={d.label} onChange={e => setRun(d.id, { label: e.target.value })} placeholder="Where? e.g. Office 101, Conference room" />
                  <Button type="button" variant="ghost" className="h-11 w-11 p-0" onClick={() => addRun(d)} aria-label="Copy row"><Copy size={16} /></Button>
                  <Button type="button" variant="ghost" className="h-11 w-11 p-0 text-text-red" onClick={() => set('drops', w.drops.filter(x => x.id !== d.id))} aria-label="Remove row"><Trash2 size={16} /></Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {CABLE_TYPES.map(ct => (
                    <button key={ct} type="button" onClick={() => setRun(d.id, { cable: ct as CableType })}
                      className={cn('h-10 px-4 rounded-lg border text-[13px] font-semibold', d.cable === ct ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-secondary')}>{ct}</button>
                  ))}
                  <label className="h-10 px-3 rounded-lg border border-border-sub flex items-center gap-2 text-[13px] text-text-secondary">
                    <Switch checked={d.plenum} onCheckedChange={v => setRun(d.id, { plenum: v })} /> Plenum
                  </label>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  <div className="space-y-1.5"><Label className={lbl}>{d.cable === 'Fiber' ? 'Runs' : 'Drops'}</Label><Stepper value={d.qty} onChange={v => setRun(d.id, { qty: Math.round(v) })} /></div>
                  <div className="space-y-1.5"><Label className={lbl}>Horizontal</Label><Stepper value={d.horizontalFt} onChange={v => setRun(d.id, { horizontalFt: v })} step={5} suffix="ft" /></div>
                  <div className="space-y-1.5"><Label className={lbl}>Vertical</Label><Stepper value={d.verticalFt} onChange={v => setRun(d.id, { verticalFt: v })} step={5} suffix="ft" /></div>
                  <div className="space-y-1.5"><Label className={lbl}>Slack / loop</Label><Stepper value={d.slackFt} onChange={v => setRun(d.id, { slackFt: v })} step={1} suffix="ft" /></div>
                </div>
                <p className={cn('text-[13px] font-mono', long ? 'text-text-red font-semibold' : 'text-text-secondary')}>
                  {len} ft per {d.cable === 'Fiber' ? 'run' : 'drop'} · {(len * (d.qty || 0)).toLocaleString()} ft total
                  {long && ` — over ${a.maxCopperRunFt} ft (90 m) copper limit: add an IDF or use fiber`}
                </p>
              </div>
            );
          })}
          <Button type="button" variant="outline" className="h-12 w-full text-[15px]" onClick={() => addRun()}><Plus size={16} className="mr-1.5" /> Add drops</Button>
          {CABLE_TYPES.some(ct => totals[ct].drops) && (
            <div className="rounded-xl border border-border-main bg-bg-secondary p-3 space-y-1.5">
              <p className="text-[14px] font-semibold text-text-primary">Cable takeoff</p>
              {CABLE_TYPES.filter(ct => totals[ct].drops).map(ct => {
                const x = totals[ct];
                return (
                  <p key={ct} className="text-[13px] font-mono text-text-secondary">
                    {ct}: {x.drops} {ct === 'Fiber' ? 'runs' : 'drops'} · {x.feet.toLocaleString()} ft + {a.cableWastePct}% = <span className="font-bold text-text-primary">{x.withWaste.toLocaleString()} ft</span>
                    {x.boxes ? ` · ${x.boxes} × ${a.cableBoxFt} ft box${x.boxes > 1 ? 'es' : ''}` : ''} · longest {x.longest} ft
                  </p>
                );
              })}
              {tooLong.length > 0 && <p className="text-[12px] text-text-red flex items-center gap-1"><AlertTriangle size={12} /> {tooLong.length} group{tooLong.length > 1 ? 's' : ''} over the copper limit.</p>}
            </div>
          )}
        </div>
      );

      case 'equipment': return <EquipmentStep areas={shownAreas} qtyOf={qtyOf} setQty={setQty} nameOf={nameOf} unitOf={unitOf} services={settings.services} />;

      case 'questions': return (
        <div className="space-y-5">
          {(['general', ...shownAreas] as (WalkArea | 'general')[]).map(k => (
            <div key={k} className="space-y-3">
              <p className="text-[12px] font-bold uppercase tracking-wider text-text-muted">{k === 'general' ? 'General' : WALK_AREAS.find(x => x.key === k)?.label}</p>
              {DISCOVERY[k].map(q => (
                <div key={q} className="space-y-1.5">
                  <Label className="text-[14px] font-medium text-text-primary">{q}</Label>
                  <Textarea className="min-h-[60px] text-[15px] bg-bg-secondary" value={w.answers[q] || ''} onChange={e => set('answers', { ...w.answers, [q]: e.target.value })} />
                </div>
              ))}
            </div>
          ))}
          <div className="space-y-2">
            <p className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Photos</p>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" multiple className="hidden" onChange={e => uploadPhotos(e.target.files)} />
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {w.photos.map((p, i) => (
                <div key={p.storagePath} className="relative aspect-square rounded-lg overflow-hidden border border-border-sub bg-bg-tertiary">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.caption || p.name} className="h-full w-full object-cover" />
                  <button type="button" onClick={() => set('photos', w.photos.filter((_, j) => j !== i))} className="absolute top-1 right-1 h-8 w-8 rounded-full bg-bg-primary/80 flex items-center justify-center" aria-label="Remove photo"><X size={14} /></button>
                </div>
              ))}
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                className="aspect-square rounded-lg border-2 border-dashed border-border-main flex flex-col items-center justify-center gap-1 text-text-muted hover:text-text-primary">
                {uploading ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={22} />}
                <span className="text-[12px] font-medium">Add photo</span>
              </button>
            </div>
          </div>
          <div className="space-y-1.5"><Label className={lbl}>Scope notes</Label>
            <Textarea className="min-h-[100px] text-[15px] bg-bg-secondary" value={w.scopeNotes} onChange={e => set('scopeNotes', e.target.value)} placeholder="What the customer wants, routes, MDF/IDF locations, anything the office should know…" /></div>
        </div>
      );

      case 'review': return (
        <div className="space-y-4">
          {w.status === 'returned' && w.returnNote && (
            <div className="rounded-xl border border-accent-gold/50 bg-accent-gold/5 p-3 text-[13px]"><span className="font-semibold">Sent back by the office:</span> {w.returnNote}</div>
          )}
          <div className="rounded-xl border border-border-sub bg-bg-secondary p-3 text-[13px] space-y-0.5">
            <p className="text-[15px] font-semibold text-text-primary">{w.customerCompany || '—'}{w.siteName ? ` · ${w.siteName}` : ''}</p>
            <p className="text-text-muted">{[w.siteAddress, w.siteState].filter(Boolean).join(', ')} · {w.mode === 'remote' ? 'Remote' : 'On site'} · {w.walkDate}</p>
            {w.contactName && <p className="text-text-muted">{w.contactName}{w.contactPhone ? ` · ${w.contactPhone}` : ''}{w.contactEmail ? ` · ${w.contactEmail}` : ''}</p>}
          </div>
          <div className="space-y-2">
            <p className="text-[12px] font-bold uppercase tracking-wider text-text-muted">What goes to the office ({lines.length})</p>
            {lines.map(l => {
              const isSuggestion = l.source === 'conditions';
              return (
                <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-border-sub bg-bg-secondary px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-text-primary break-words">{nameOf(l.code)}</p>
                    {l.notes && <p className="text-[12px] text-text-muted break-words">{l.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[14px] font-mono font-bold">{l.qty} <span className="text-[12px] font-normal text-text-muted">{unitOf(l.code)}</span></span>
                    {isSuggestion && !locked && (
                      <Button type="button" variant="ghost" className="h-10 w-10 p-0 text-text-muted" aria-label="Remove" onClick={() => set('skippedSuggestions', [...w.skippedSuggestions, l.id])}><X size={15} /></Button>
                    )}
                  </div>
                </div>
              );
            })}
            {!lines.length && <p className="text-[13px] text-text-muted">Nothing yet — add drops, equipment or site conditions.</p>}
            {suggestions.some(sg => w.skippedSuggestions.includes(sg.id)) && !locked && (
              <Button type="button" variant="ghost" size="sm" onClick={() => set('skippedSuggestions', [])}>Restore removed site-condition lines</Button>
            )}
          </div>
          <p className="text-[12px] text-text-muted">Photos: {w.photos.length} · Questions answered: {Object.values(w.answers).filter(v => v?.trim()).length}</p>
        </div>
      );
    }
  })();

  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="p-0 gap-0 bg-bg-elevated border-border-main w-screen max-w-none h-[100dvh] sm:h-[94vh] sm:max-w-4xl sm:rounded-xl flex flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border-sub px-4 pt-4 pb-3 space-y-3">
          <div className="pr-8">
            <DialogTitle className="text-lg font-semibold">Site walk{w.id ? ` · ${w.id}` : ''}</DialogTitle>
            <DialogDescription className="text-[13px] text-text-muted">{locked ? 'Submitted — view only.' : 'Walk the site and fill in what you see. Pricing is done by the office.'}</DialogDescription>
          </div>
          <div className="flex gap-1 overflow-x-auto -mx-1 px-1">
            {STEPS.map((s, i) => (
              <button key={s.key} type="button" onClick={() => go(i)}
                className={cn('shrink-0 h-10 px-3 rounded-full border text-[13px] font-medium flex items-center gap-1.5',
                  i === step ? 'border-brand-red bg-brand-red text-white' : i < step ? 'border-brand-red/30 text-brand-red' : 'border-border-sub text-text-muted')}>
                <s.icon size={14} /> {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className={cn('flex-1 overflow-y-auto px-4 py-4', locked && 'pointer-events-none opacity-90')}>{body}</div>
        <div className="shrink-0 border-t border-border-sub px-4 py-3 flex items-center gap-2 bg-bg-elevated">
          <Button type="button" variant="outline" className="h-12 px-4" onClick={() => (step ? go(step - 1) : onClose())}>
            <ChevronLeft size={16} className="mr-1" /> {step ? 'Back' : 'Close'}
          </Button>
          {!locked && <Button type="button" variant="ghost" className="h-12 px-3 text-text-muted" disabled={saving || !(w.customerCompany || w.siteName)} onClick={() => persist(false)}>Save draft</Button>}
          <div className="flex-1" />
          {isLast ? (
            !locked && <Button type="button" className="h-12 px-5 bg-brand-red hover:bg-brand-red/90 text-white text-[15px]" disabled={saving} onClick={submit}>
              {saving ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : <Send size={16} className="mr-1.5" />} Send for approval
            </Button>
          ) : (
            <Button type="button" className="h-12 px-5 text-[15px]" disabled={saving} onClick={() => go(step + 1)}>
              {saving && <Loader2 size={16} className="mr-1.5 animate-spin" />} Next <ChevronRight size={16} className="ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Counts for equipment and services — quick items for the chosen areas, plus the whole catalog by search. */
function EquipmentStep({ areas, qtyOf, setQty, nameOf, unitOf, services }: {
  areas: WalkArea[];
  qtyOf: (code: string) => number;
  setQty: (code: string, qty: number) => void;
  nameOf: (code: string) => string;
  unitOf: (code: string) => string;
  services: { code: string; name: string; category: string; unit: string; active?: boolean }[];
}) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const quick = [...new Map(areas.flatMap(k => QUICK_ITEMS[k]).map(q => [q.code, q])).values()];
  const quickCodes = new Set(quick.map(q => q.code));
  const cats = [...new Set(services.map(s => s.category))];
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const more = services.filter(s => s.active !== false && !quickCodes.has(s.code)
    && (cat === 'all' || s.category === cat) && words.every(wd => `${s.name} ${s.category} ${s.code}`.toLowerCase().includes(wd)));
  const row = (code: string, label: string) => (
    <div key={code} className={cn('flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3', qtyOf(code) ? 'border-brand-red/40 bg-brand-red/5' : 'border-border-sub bg-bg-secondary')}>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-text-primary">{label}</p>
        <p className="text-[12px] text-text-muted">{nameOf(code)} · per {unitOf(code)}</p>
      </div>
      <Stepper value={qtyOf(code)} onChange={v => setQty(code, v)} step={unitOf(code).includes('hour') ? 0.5 : 1} />
    </div>
  );
  return (
    <div className="space-y-4">
      {quick.length > 0 && <div className="space-y-2">{quick.map(q => row(q.code, q.label))}</div>}
      <div className="space-y-2 pt-2 border-t border-border-sub">
        <p className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Anything else</p>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input className={cn(big, 'pl-9')} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search services (rack, splice, topology…)" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {['all', ...cats].map(k => (
            <button key={k} type="button" onClick={() => setCat(k)} className={cn('shrink-0 h-9 px-3 rounded-full border text-[12px] font-medium', cat === k ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-muted')}>{k === 'all' ? 'All' : k}</button>
          ))}
        </div>
        <div className="space-y-2">{more.map(s => row(s.code, s.name))}</div>
        {!more.length && <p className="text-[13px] text-text-muted py-4 text-center">No services match.</p>}
      </div>
    </div>
  );
}
