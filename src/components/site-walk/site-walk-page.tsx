'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import {
  AlertTriangle, ArrowLeft, Check, ChevronLeft, ChevronRight, CloudOff, Copy, ImagePlus, Loader2, Minus, Plus, Send, Trash2, X,
} from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { uploadFile } from '@/lib/upload';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  ADD_ONS, BUILDING_STATUSES, CABLE_TYPES, CEILING_TYPES, DEVICE_DEFS, DISCOVERY, PHOTO_CHECKLIST, STEP_GUIDE, STEP_LABEL, SUPPLY_LABEL, WALK_AREAS,
  buildWalkLines, dropLength, dropTotals, genLineId, longRuns, walkCandidateLines, walkSteps,
  type CableType, type DeviceEntry, type DeviceKey, type DropRun, type SiteConditions, type SiteWalk, type WalkArea,
  type WalkExtras, type WalkStep, type WalkTests,
} from '@/lib/estimating';
import { deleteSiteWalk, newSiteWalk, saveSiteWalk, submitSiteWalk, useEstimatingSettings } from '@/lib/site-walk-actions';
import type { WalkClient, WalkSite } from '@/app/api/site-walk/clients/route';

/**
 * The site walk as a page — a tablet-first workflow for a tech on site (or
 * scoping remotely). Every change saves on its own: to the server within a
 * second, and to this device right away, so closing the tab, refreshing or
 * losing signal never loses work. The walk reopens on the step it was left on.
 *
 * Questions are standardized per job type and every answer maps to a catalog
 * code (lib/estimating), so every walk is priced the same way on review.
 * Techs never see prices.
 */

const lbl = 'text-[13px] font-semibold text-text-secondary';
const big = 'h-12 text-[16px] bg-bg-secondary border-border-main';
const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const LOCAL = (id: string) => `sitewalk:${id}`;

// ── Clients & sites (server: techs can't read users / sites) ────────────────
let clientsCache: Promise<{ clients: WalkClient[]; sites: WalkSite[] }> | null = null;
function useWalkClients() {
  const [data, setData] = useState<{ clients: WalkClient[]; sites: WalkSite[] }>({ clients: [], sites: [] });
  useEffect(() => {
    let alive = true;
    if (!clientsCache) {
      clientsCache = (async () => {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/site-walk/clients', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('clients');
        return res.json();
      })();
      clientsCache.catch(() => { clientsCache = null; });
    }
    clientsCache.then(d => alive && setData(d)).catch(() => {});
    return () => { alive = false; };
  }, []);
  return data;
}

/** Text box with a tap-to-pick list under it (no dropdown widget, so it works well on tablets). */
function Combo<T extends { id: string }>({ value, onType, options, render, onPick, placeholder, empty }: {
  value: string; onType: (v: string) => void; options: T[]; render: (o: T) => React.ReactNode; onPick: (o: T) => void; placeholder: string; empty?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Input className={big} value={value} placeholder={placeholder}
        onChange={e => { onType(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && (options.length > 0 || empty) && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border border-border-main bg-bg-elevated shadow-xl">
          {options.length ? options.map(o => (
            <button key={o.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onPick(o); setOpen(false); }}
              className="w-full text-left px-4 py-3 border-b border-border-sub last:border-0 hover:bg-bg-tertiary">{render(o)}</button>
          )) : <p className="px-4 py-3 text-[13px] text-text-muted">{empty}</p>}
        </div>
      )}
    </div>
  );
}

function Stepper({ value, onChange, step = 1, min = 0, suffix }: { value: number; onChange: (n: number) => void; step?: number; min?: number; suffix?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Button type="button" variant="outline" className="h-12 w-12 p-0 shrink-0" onClick={() => onChange(Math.max(min, Math.round(((value || 0) - step) * 100) / 100))} aria-label="Less"><Minus size={18} /></Button>
      <div className="relative w-24">
        <Input type="number" inputMode="decimal" value={value || value === 0 ? String(value) : ''} onChange={e => onChange(Math.max(min, num(e.target.value)))}
          className={cn(big, 'text-center font-mono', suffix && 'pr-8')} />
        {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-text-muted">{suffix}</span>}
      </div>
      <Button type="button" variant="outline" className="h-12 w-12 p-0 shrink-0" onClick={() => onChange(Math.round(((value || 0) + step) * 100) / 100)} aria-label="More"><Plus size={18} /></Button>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange, children }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className={cn('rounded-xl border p-4 transition-colors', checked ? 'border-brand-red/40 bg-brand-red/5' : 'border-border-sub bg-bg-secondary')}>
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-text-primary">{label}</span>
          {hint && <span className="block text-[13px] text-text-muted">{hint}</span>}
        </span>
        <Switch checked={checked} onCheckedChange={onChange} />
      </label>
      {checked && children && <div className="mt-3">{children}</div>}
    </div>
  );
}

function YesNo({ question, hint, value, onChange }: { question: string; hint?: string; value: boolean | null | undefined; onChange: (v: boolean) => void }) {
  return (
    <div className="rounded-xl border-2 border-brand-red/30 bg-brand-red/5 p-4 space-y-3">
      <div>
        <p className="text-[16px] font-semibold text-text-primary">{question}</p>
        {hint && <p className="text-[13px] text-text-muted">{hint}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {([[true, 'Yes'], [false, 'No']] as const).map(([v, t]) => (
          <button key={t} type="button" onClick={() => onChange(v)}
            className={cn('h-14 rounded-xl border text-[16px] font-semibold', value === v ? 'border-brand-red bg-brand-red text-white' : 'border-border-main bg-bg-secondary text-text-secondary')}>{t}</button>
        ))}
      </div>
    </div>
  );
}

const Chips = <T extends string>({ options, value, onChange }: { options: readonly T[] | T[]; value: string; onChange: (v: T) => void }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
    {options.map(o => (
      <button key={o} type="button" onClick={() => onChange(o)} className={cn('h-12 rounded-lg border text-[15px] font-medium', value === o ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-secondary')}>{o}</button>
    ))}
  </div>
);

export function SiteWalkPage({ walkId, basePath, backHref }: { walkId: string; basePath: string; backHref: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const settings = useEstimatingSettings();
  const a = settings.assumptions;
  const { clients, sites } = useWalkClients();
  const [w, setW] = useState<SiteWalk | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'offline' | 'idle'>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // /new with unfinished walks: offer to continue one first.
  const [drafts, setDrafts] = useState<SiteWalk[] | null>(null);
  // Which checklist photo is being taken (its caption).
  const photoTag = useRef('');

  // ── Create (/new) or load ──
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      if (walkId === 'new') {
        if (!params.get('fresh')) {
          const mine = await Promise.all([
            getDocs(query(collection(db, 'siteWalks'), where('createdBy', '==', user.id))),
            getDocs(query(collection(db, 'siteWalks'), where('assignedTechId', '==', user.id))),
          ]).then(rs => {
            const m = new Map<string, SiteWalk>();
            rs.forEach(r => r.docs.forEach(d => m.set(d.id, { ...(d.data() as SiteWalk), id: d.id })));
            return [...m.values()].filter(x => x.status === 'draft' || x.status === 'returned')
              .sort((x, y) => (y.updatedAt || '').localeCompare(x.updatedAt || ''));
          }).catch(() => []);
          if (cancelled) return;
          if (mine.length) { setDrafts(mine); return; }
        }
        const prefill: Partial<SiteWalk> = {};
        const leadId = params.get('leadId');
        if (leadId) {
          const lead = await getDoc(doc(db, 'leads', leadId)).catch(() => null);
          const l = lead?.exists() ? lead.data() as Record<string, string> : null;
          if (l) Object.assign(prefill, { leadId, customerCompany: l.companyName || '', contactName: l.contactName || '', contactEmail: l.contactEmail || '', contactPhone: l.contactPhone || '', siteAddress: l.address || '' });
        }
        const isTechUser = basePath.startsWith('/tech');
        const fresh = newSiteWalk({ id: user.id, name: user.name || 'Tech' }, {
          ...prefill, ...(isTechUser ? { assignedTechId: user.id, assignedTechName: user.name || null } : {}),
        });
        const id = await saveSiteWalk(fresh).catch((e: Error) => { setLoadError(e.message); return null; });
        if (id && !cancelled) router.replace(`${basePath}/${id}`);
        return;
      }
      const snap = await getDoc(doc(db, 'siteWalks', walkId)).catch((e: Error) => { setLoadError(e.message); return null; });
      if (cancelled || !snap) return;
      if (!snap.exists()) { setLoadError('This site walk does not exist.'); return; }
      const server = { ...(snap.data() as SiteWalk), id: snap.id };
      // A newer copy on this device (saved while offline) wins.
      let local: SiteWalk | null = null;
      try { local = JSON.parse(localStorage.getItem(LOCAL(walkId)) || 'null'); } catch { /* private mode */ }
      const useLocal = local && local.updatedAt > (server.updatedAt || '') && ['draft', 'returned'].includes(server.status);
      setW(useLocal ? { ...local!, status: server.status, returnNote: server.returnNote } : server);
      if (useLocal) { dirty.current = true; schedule(); }
    })();
    return () => { cancelled = true; };
  }, [walkId, user?.id, params.get('fresh')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Office actions (sent back / approved) show up live.
  useEffect(() => {
    if (walkId === 'new') return;
    return onSnapshot(doc(db, 'siteWalks', walkId), s => {
      const d = s.data() as SiteWalk | undefined;
      if (d) setW(p => (p && (d.status !== p.status || d.returnNote !== p.returnNote) ? { ...p, status: d.status, returnNote: d.returnNote, quoteId: d.quoteId } : p));
    }, () => {});
  }, [walkId]);

  const locked = !!w && !['draft', 'returned'].includes(w.status);

  // ── Autosave: device right away, server after a second of quiet ──
  const flush = useCallback(async (walk: SiteWalk) => {
    if (!dirty.current) return;
    setSaveState('saving');
    try {
      await saveSiteWalk(walk);
      dirty.current = false;
      setSaveState('saved');
      setSavedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    } catch {
      setSaveState('offline');
    }
  }, []);
  const latest = useRef<SiteWalk | null>(null);
  latest.current = w;
  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (latest.current) flush(latest.current); }, 900);
  };
  const update = (fn: (p: SiteWalk) => SiteWalk) => setW(p => {
    if (!p || locked) return p;
    const next = { ...fn(p), updatedAt: new Date().toISOString() };
    try { localStorage.setItem(LOCAL(next.id), JSON.stringify(next)); } catch { /* full / private */ }
    dirty.current = true;
    schedule();
    return next;
  });
  // Retry when the connection comes back; save before the page goes away.
  useEffect(() => {
    const retry = () => { if (dirty.current && latest.current) flush(latest.current); };
    window.addEventListener('online', retry);
    window.addEventListener('pagehide', retry);
    document.addEventListener('visibilitychange', retry);
    return () => { window.removeEventListener('online', retry); window.removeEventListener('pagehide', retry); document.removeEventListener('visibilitychange', retry); };
  }, [flush]);

  const set = <K extends keyof SiteWalk>(k: K, v: SiteWalk[K]) => update(p => ({ ...p, [k]: v }));
  const setCond = <K extends keyof SiteConditions>(k: K, v: SiteConditions[K]) => update(p => ({ ...p, conditions: { ...p.conditions, [k]: v } }));
  const setDev = (k: DeviceKey, patch: Partial<DeviceEntry>) => update(p => ({ ...p, devices: { ...(p.devices || {}), [k]: { count: 0, locations: '', supply: '', ...(p.devices?.[k] || {}), ...patch } } }));
  const setTest = <K extends keyof WalkTests>(k: K, v: WalkTests[K]) => update(p => ({ ...p, tests: { ...(p.tests || {}), [k]: v } }));
  const setExtra = <K extends keyof WalkExtras>(k: K, v: WalkExtras[K]) => update(p => ({ ...p, extras: { ...(p.extras || {}), [k]: v } }));

  const steps = useMemo(() => (w ? walkSteps(w) : ['job' as WalkStep]), [w?.areas, w?.needsDrops]); // eslint-disable-line react-hooks/exhaustive-deps
  const urlStep = params.get('step') as WalkStep | null;
  const step: WalkStep = urlStep && steps.includes(urlStep) ? urlStep : (w?.lastStep && steps.includes(w.lastStep as WalkStep) ? w.lastStep as WalkStep : 'job');
  const idx = steps.indexOf(step);
  const go = (to: WalkStep) => {
    if (!w) return;
    // Each step's must-answers before moving on (going back is always fine).
    if (steps.indexOf(to) > idx) {
      const need = steps.indexOf(to) > steps.indexOf('job') && (!w.customerCompany.trim() ? 'Add the client first.' : !w.areas.length ? 'Pick at least one job type.' : '')
        || steps.indexOf(to) > steps.indexOf('site') && (w.needsDrops == null ? 'Answer "Are new network drops needed?" first.' : '');
      if (need) { toast({ variant: 'destructive', title: need }); return; }
    }
    if (!locked) set('lastStep', to);
    router.replace(`${basePath}/${w.id}?step=${to}`, { scroll: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totals = useMemo(() => dropTotals(w?.drops || [], a), [w?.drops, a]);
  const tooLong = useMemo(() => longRuns(w?.drops || [], a), [w?.drops, a]);
  const lines = useMemo(() => (w ? buildWalkLines(w, a) : []), [w, a]);
  const clientSites = useMemo(() => sites.filter(s => s.clientId === w?.clientId), [sites, w?.clientId]);

  if (loadError) return <div className="p-6 text-[14px] text-text-red">{loadError} <Link href={backHref} className="underline">Back</Link></div>;
  if (walkId === 'new' && drafts) {
    const leadQ = params.get('leadId') ? `&leadId=${params.get('leadId')}` : '';
    return (
      <div className="max-w-2xl mx-auto space-y-5 text-left">
        <Link href={backHref} className="text-[14px] text-text-muted flex items-center gap-1 hover:text-text-primary"><ArrowLeft size={16} /> Site walks</Link>
        <div>
          <h1 className="text-xl font-semibold text-text-primary">You have {drafts.length} unfinished site walk{drafts.length === 1 ? '' : 's'}</h1>
          <p className="text-[14px] text-text-muted">Pick up where you left off, or start a new one.</p>
        </div>
        <div className="space-y-2">
          {drafts.map(d => (
            <Link key={d.id} href={`${basePath}/${d.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-border-sub bg-bg-secondary px-4 py-4 hover:border-border-main">
              <span className="min-w-0">
                <span className="block text-[16px] font-semibold text-text-primary truncate">{d.customerCompany || 'Untitled walk'}{d.siteName ? ` · ${d.siteName}` : ''}</span>
                <span className="block text-[13px] text-text-muted">{d.status === 'returned' ? 'Sent back by the office · ' : ''}Last saved {new Date(d.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {d.id}</span>
              </span>
              <span className="shrink-0 text-[15px] font-semibold text-brand-red flex items-center gap-1">Continue <ChevronRight size={16} /></span>
            </Link>
          ))}
        </div>
        <Button className="h-14 w-full text-[16px] bg-brand-red hover:bg-brand-red/90 text-white" onClick={() => router.replace(`${basePath}/new?fresh=1${leadQ}`)}>
          <Plus size={18} className="mr-1.5" /> Start a new site walk
        </Button>
      </div>
    );
  }
  if (!w) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-text-muted" /></div>;

  const submit = async () => {
    if (!lines.length) { toast({ variant: 'destructive', title: 'Nothing to quote yet', description: 'Answer the job, drops and devices questions first.' }); return; }
    setSubmitting(true);
    try {
      if (timer.current) clearTimeout(timer.current);
      const id = await submitSiteWalk(w, settings);
      try { localStorage.removeItem(LOCAL(id)); } catch { /* ok */ }
      dirty.current = false;
      toast({ title: 'Sent for approval', description: `Site walk ${id} is with the office for pricing.` });
      router.push(backHref);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not send', description: e.message });
    } finally { setSubmitting(false); }
  };

  const canDelete = w.status === 'draft' && (w.createdBy === user?.id || basePath.startsWith('/admin'));
  const remove = async () => {
    if (!confirm(`Delete this site walk${w.customerCompany ? ` for ${w.customerCompany}` : ''}? This can't be undone.`)) return;
    try {
      if (timer.current) clearTimeout(timer.current);
      dirty.current = false;
      await deleteSiteWalk(w.id);
      toast({ title: 'Site walk deleted' });
      router.push(backHref);
    } catch (e: any) { toast({ variant: 'destructive', title: 'Could not delete', description: e.message }); }
  };
  const takePhoto = (tag: string) => { photoTag.current = tag; fileRef.current?.click(); };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added: SiteWalk['photos'] = [];
      for (const f of Array.from(files)) {
        const up = await uploadFile(`siteWalks/${w.id}/${Date.now()}-${f.name.replace(/[^\w.-]+/g, '_')}`, f, { contentType: f.type });
        added.push({ url: up.url, storagePath: up.storagePath, name: up.name, caption: photoTag.current });
      }
      update(p => ({ ...p, photos: [...p.photos, ...added] }));
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Photo upload failed', description: navigator.onLine ? e.message : 'No signal — try again when you have a connection.' });
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const addRun = (copy?: DropRun) => set('drops', [...w.drops, copy
    ? { ...copy, id: genLineId(), label: copy.label ? `${copy.label} (copy)` : '' }
    : { id: genLineId(), label: '', qty: 1, cable: 'CAT6', horizontalFt: 100, verticalFt: 15, slackFt: a.defaultSlackFt, plenum: true }]);
  const setRun = (id: string, patch: Partial<DropRun>) => set('drops', w.drops.map(d => (d.id === id ? { ...d, ...patch } : d)));

  const c = w.conditions;
  const x = w.extras || {};
  const t = w.tests || {};
  const areaOn = (k: WalkArea) => w.areas.includes(k);
  const nameOf = (code: string) => settings.catalog.get(code)?.name || code;
  const unitOf = (code: string) => settings.catalog.get(code)?.unit || '';
  const shownAreas = w.areas.length ? w.areas : [];
  const typedClients = clients.filter(cl => !w.customerCompany.trim() || `${cl.company} ${cl.name} ${cl.email}`.toLowerCase().includes(w.customerCompany.trim().toLowerCase())).slice(0, 12);
  const typedSites = clientSites.filter(s => !w.siteAddress.trim() || w.siteId || `${s.name} ${s.location}`.toLowerCase().includes(w.siteAddress.trim().toLowerCase()));

  const body = (() => {
    switch (step) {
      case 'job': return (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2">
            {(['on_site', 'remote'] as const).map(m => (
              <button key={m} type="button" onClick={() => set('mode', m)}
                className={cn('h-14 rounded-xl border text-[16px] font-semibold', w.mode === m ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-muted')}>
                {m === 'on_site' ? 'On site' : 'Remote (plans / call)'}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label className={lbl}>Client *</Label>
            <Combo value={w.customerCompany} placeholder="Start typing a client…" options={typedClients}
              empty={w.customerCompany.trim() ? 'Not an app client — it will be quoted as a new customer.' : 'No app clients found.'}
              onType={v => update(p => ({ ...p, customerCompany: v, clientId: null, siteId: null }))}
              render={cl => <><span className="block text-[15px] font-semibold text-text-primary">{cl.company}</span><span className="block text-[12px] text-text-muted">{[cl.name, cl.email, cl.phone].filter(Boolean).join(' · ')}</span></>}
              onPick={cl => update(p => ({ ...p, clientId: cl.id, customerCompany: cl.company, siteId: null,
                contactName: p.contactName || cl.name, contactEmail: p.contactEmail || cl.email, contactPhone: p.contactPhone || cl.phone }))} />
            {w.clientId ? <p className="text-[12px] text-text-green flex items-center gap-1"><Check size={12} /> App client</p>
              : w.customerCompany.trim() ? <p className="text-[12px] text-text-muted">New customer (not in the app yet).</p> : null}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className={lbl}>Site address</Label>
              <Combo value={w.siteAddress} placeholder={w.clientId ? 'Pick one of their sites, or type an address' : 'Type the address'}
                options={typedSites} empty={w.clientId && !clientSites.length ? 'No saved sites for this client — type the address.' : undefined}
                onType={v => update(p => ({ ...p, siteAddress: v, siteId: null }))}
                render={s => <><span className="block text-[15px] font-semibold text-text-primary">{s.name || s.location}</span>{s.name && <span className="block text-[12px] text-text-muted">{s.location}</span>}</>}
                onPick={s => update(p => ({ ...p, siteId: s.id, siteAddress: s.location || s.name, siteName: p.siteName || s.name }))} />
            </div>
            <div className="space-y-1.5"><Label className={lbl}>Site / project name</Label><Input className={big} value={w.siteName} onChange={e => set('siteName', e.target.value)} placeholder="Warehouse B office build-out" /></div>
            <div className="space-y-1.5"><Label className={lbl}>Walk date</Label><Input className={big} type="date" value={w.walkDate} onChange={e => set('walkDate', e.target.value)} /></div>
            <div className="space-y-1.5"><Label className={lbl}>On-site contact</Label><Input className={big} value={w.contactName} onChange={e => set('contactName', e.target.value)} /></div>
            <div className="space-y-1.5"><Label className={lbl}>Contact phone</Label><Input className={big} type="tel" value={w.contactPhone} onChange={e => set('contactPhone', e.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label className={lbl}>Contact email</Label><Input className={big} type="email" value={w.contactEmail} onChange={e => set('contactEmail', e.target.value)} /></div>
          </div>
          <div className="space-y-1.5">
            <Label className={lbl}>State</Label>
            <div className="flex flex-wrap gap-2">
              {a.serviceStates.map(st => (
                <button key={st} type="button" onClick={() => set('siteState', st)} className={cn('h-12 min-w-[60px] px-3 rounded-lg border text-[15px] font-semibold', w.siteState === st ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-muted')}>{st}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className={lbl}>What type of job is it? (pick all that apply)</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {WALK_AREAS.map(ar => (
                <button key={ar.key} type="button" onClick={() => set('areas', areaOn(ar.key) ? w.areas.filter(k => k !== ar.key) : [...w.areas, ar.key])}
                  className={cn('h-16 rounded-xl border px-2 text-[15px] font-semibold flex items-center justify-center gap-1.5 text-center', areaOn(ar.key) ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-secondary')}>
                  {areaOn(ar.key) && <Check size={16} />}{ar.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      );

      case 'site': return (
        <div className="space-y-6">
          <YesNo question="Are new network drops needed?" hint="Yes adds the Drops step to measure each run." value={w.needsDrops}
            onChange={v => set('needsDrops', v)} />
          <div className="space-y-1.5"><Label className={lbl}>Building</Label><Chips options={BUILDING_STATUSES} value={c.buildingStatus} onChange={v => setCond('buildingStatus', v)} /></div>
          <div className="space-y-1.5"><Label className={lbl}>Ceiling</Label><Chips options={CEILING_TYPES} value={c.ceilingType} onChange={v => setCond('ceilingType', v)} /></div>
          <div className="flex flex-wrap gap-6">
            <div className="space-y-1.5"><Label className={lbl}>Ceiling height</Label><Stepper value={c.ceilingHeightFt} onChange={v => setCond('ceilingHeightFt', v)} suffix="ft" /></div>
            <div className="space-y-1.5"><Label className={lbl}>Floors</Label><Stepper value={c.floors} onChange={v => setCond('floors', v)} min={1} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Toggle label="Difficult access" hint="Congested ceilings, odd pathways, restricted areas" checked={c.difficultAccess} onChange={v => setCond('difficultAccess', v)} />
            <Toggle label="Lift needed" checked={c.liftNeeded} onChange={v => setCond('liftNeeded', v)}>
              <Label className={lbl}>Lift days</Label><Stepper value={c.liftDays} onChange={v => setCond('liftDays', v)} min={1} />
            </Toggle>
            <Toggle label="After hours / restricted access" checked={c.afterHours} onChange={v => setCond('afterHours', v)}>
              <Label className={lbl}>Visits</Label><Stepper value={c.afterHoursVisits} onChange={v => setCond('afterHoursVisits', v)} min={1} />
            </Toggle>
            <Toggle label="Rack / closet cleanup needed" checked={!!x.rackCleanup} onChange={v => setExtra('rackCleanup', v)} />
            <Toggle label="Remove existing cable" checked={c.removeExisting} onChange={v => setCond('removeExisting', v)}>
              <Label className={lbl}>Estimated hours</Label><Stepper value={c.removalHours} onChange={v => setCond('removalHours', v)} step={0.5} suffix="h" />
            </Toggle>
            <Toggle label="Conduit / pathway work" checked={c.pathwayWork} onChange={v => setCond('pathwayWork', v)}>
              <Label className={lbl}>Estimated hours</Label><Stepper value={c.pathwayHours} onChange={v => setCond('pathwayHours', v)} step={0.5} suffix="h" />
            </Toggle>
            <Toggle label="Permit required" checked={c.permitRequired} onChange={v => setCond('permitRequired', v)} />
            <Toggle label="Union site" checked={c.unionSite} onChange={v => setCond('unionSite', v)} />
          </div>
          <div className="rounded-xl border border-border-sub p-4 space-y-3">
            <p className="text-[15px] font-semibold text-text-primary">Travel</p>
            <div className="flex flex-wrap gap-6">
              <div className="space-y-1.5"><Label className={lbl}>Round-trip miles</Label><Stepper value={c.roundTripMiles} onChange={v => setCond('roundTripMiles', v)} step={10} /></div>
              <div className="space-y-1.5"><Label className={lbl}>Travel time</Label><Stepper value={c.travelHours} onChange={v => setCond('travelHours', v)} step={0.5} suffix="h" /></div>
              <div className="space-y-1.5"><Label className={lbl}>Lodging nights</Label><Stepper value={c.lodgingNights} onChange={v => setCond('lodgingNights', v)} /></div>
            </div>
            {w.siteState !== a.homeState && <p className="text-[13px] text-accent-gold">Out of state ({w.siteState}) — mobilization is added.</p>}
          </div>
          <div className="space-y-1.5"><Label className={lbl}>Access notes</Label>
            <Textarea className="min-h-[90px] text-[16px] bg-bg-secondary" value={c.accessNotes} onChange={e => setCond('accessNotes', e.target.value)} placeholder="Badge-in, escort, loading dock hours, ceiling tile condition…" /></div>
        </div>
      );

      case 'drops': return (
        <div className="space-y-4">
          <p className="text-[14px] text-text-muted">One row per group of identical drops (a room, a row of desks). Length per drop = horizontal + vertical + slack.</p>
          {w.drops.map((d, i) => {
            const len = dropLength(d);
            const long = d.cable !== 'Fiber' && len > a.maxCopperRunFt;
            return (
              <div key={d.id} className={cn('rounded-xl border p-4 space-y-3', long ? 'border-brand-red/50 bg-brand-red/5' : 'border-border-sub bg-bg-secondary')}>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-text-muted w-6">{i + 1}</span>
                  <Input className={cn(big, 'flex-1')} value={d.label} onChange={e => setRun(d.id, { label: e.target.value })} placeholder="Where? e.g. Office 101" />
                  <Button type="button" variant="ghost" className="h-12 w-12 p-0" onClick={() => addRun(d)} aria-label="Copy row"><Copy size={18} /></Button>
                  <Button type="button" variant="ghost" className="h-12 w-12 p-0 text-text-red" onClick={() => set('drops', w.drops.filter(z => z.id !== d.id))} aria-label="Remove row"><Trash2 size={18} /></Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {CABLE_TYPES.map(ct => (
                    <button key={ct} type="button" onClick={() => setRun(d.id, { cable: ct as CableType })} className={cn('h-11 px-4 rounded-lg border text-[14px] font-semibold', d.cable === ct ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-secondary')}>{ct}</button>
                  ))}
                  <label className="h-11 px-3 rounded-lg border border-border-sub flex items-center gap-2 text-[14px] text-text-secondary"><Switch checked={d.plenum} onCheckedChange={v => setRun(d.id, { plenum: v })} /> Plenum</label>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  <div className="space-y-1.5"><Label className={lbl}>{d.cable === 'Fiber' ? 'Runs' : 'Drops'}</Label><Stepper value={d.qty} onChange={v => setRun(d.id, { qty: Math.round(v) })} /></div>
                  <div className="space-y-1.5"><Label className={lbl}>Horizontal</Label><Stepper value={d.horizontalFt} onChange={v => setRun(d.id, { horizontalFt: v })} step={5} suffix="ft" /></div>
                  <div className="space-y-1.5"><Label className={lbl}>Vertical</Label><Stepper value={d.verticalFt} onChange={v => setRun(d.id, { verticalFt: v })} step={5} suffix="ft" /></div>
                  <div className="space-y-1.5"><Label className={lbl}>Slack / loop</Label><Stepper value={d.slackFt} onChange={v => setRun(d.id, { slackFt: v })} suffix="ft" /></div>
                </div>
                <p className={cn('text-[14px] font-mono', long ? 'text-text-red font-semibold' : 'text-text-secondary')}>
                  {len} ft each · {(len * (d.qty || 0)).toLocaleString()} ft total{long && ` — over ${a.maxCopperRunFt} ft copper limit: add an IDF or use fiber`}
                </p>
              </div>
            );
          })}
          <Button type="button" variant="outline" className="h-14 w-full text-[16px]" onClick={() => addRun()}><Plus size={18} className="mr-1.5" /> Add drops</Button>
          {CABLE_TYPES.some(ct => totals[ct].drops) && (
            <div className="rounded-xl border border-border-main bg-bg-secondary p-4 space-y-1.5">
              <p className="text-[15px] font-semibold text-text-primary">Cable takeoff</p>
              {CABLE_TYPES.filter(ct => totals[ct].drops).map(ct => {
                const q = totals[ct];
                return <p key={ct} className="text-[14px] font-mono text-text-secondary">{ct}: {q.drops} · {q.feet.toLocaleString()} ft + {a.cableWastePct}% = <b className="text-text-primary">{q.withWaste.toLocaleString()} ft</b>{q.boxes ? ` · ${q.boxes} × ${a.cableBoxFt} ft box${q.boxes > 1 ? 'es' : ''}` : ''}</p>;
              })}
              {tooLong.length > 0 && <p className="text-[13px] text-text-red flex items-center gap-1"><AlertTriangle size={13} /> {tooLong.length} group{tooLong.length > 1 ? 's' : ''} over the copper limit.</p>}
            </div>
          )}
        </div>
      );

      case 'devices': return (
        <div className="space-y-4">
          <p className="text-[14px] text-text-muted">For each kind of device on this job: how many, where they go, and who supplies the hardware.</p>
          {DEVICE_DEFS.filter(d => areaOn(d.area)).map(d => {
            const e = w.devices?.[d.key] || { count: 0, locations: '', supply: '' as const };
            return (
              <div key={d.key} className={cn('rounded-xl border p-4 space-y-3', e.count ? 'border-brand-red/40 bg-brand-red/5' : 'border-border-sub bg-bg-secondary')}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[16px] font-semibold text-text-primary">{d.label}</p>
                  <Stepper value={e.count} onChange={v => setDev(d.key, { count: Math.round(v) })} />
                </div>
                {e.count > 0 && <>
                  <div className="space-y-1.5"><Label className={lbl}>{d.where}</Label>
                    <Textarea className="min-h-[70px] text-[16px] bg-bg-primary" value={e.locations} onChange={ev => setDev(d.key, { locations: ev.target.value })} /></div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(Object.keys(SUPPLY_LABEL) as (keyof typeof SUPPLY_LABEL)[]).map(k => (
                      <button key={k} type="button" onClick={() => setDev(d.key, { supply: k })} className={cn('h-12 rounded-lg border text-[14px] font-medium', e.supply === k ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-secondary')}>{SUPPLY_LABEL[k]}</button>
                    ))}
                  </div>
                </>}
              </div>
            );
          })}
          {areaOn('network') && (
            <div className="rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-3">
              <p className="text-[16px] font-semibold text-text-primary">Network documentation</p>
              <div className="grid grid-cols-3 gap-2">
                {([['none', 'None'], ['basic', 'Basic diagram'], ['detailed', 'VLAN / port map']] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setExtra('topology', k)} className={cn('h-12 rounded-lg border text-[14px] font-medium', (x.topology || 'none') === k ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-secondary')}>{l}</button>
                ))}
              </div>
              <div className="space-y-1.5"><Label className={lbl}>Advanced configuration (VLANs, firewall rules) — estimated hours</Label><Stepper value={Number(x.configHours) || 0} onChange={v => setExtra('configHours', v)} step={0.5} suffix="h" /></div>
            </div>
          )}
        </div>
      );

      case 'checks': return (
        <div className="space-y-6">
          {(areaOn('wifi') || areaOn('network')) && (
            <div className="rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-4">
              <p className="text-[16px] font-semibold text-text-primary">Wi-Fi / internet tests</p>
              <div className="flex flex-wrap gap-6">
                <div className="space-y-1.5"><Label className={lbl}>Download</Label><Stepper value={Number(t.downMbps) || 0} onChange={v => setTest('downMbps', v)} step={10} suffix="Mb" /></div>
                <div className="space-y-1.5"><Label className={lbl}>Upload</Label><Stepper value={Number(t.upMbps) || 0} onChange={v => setTest('upMbps', v)} step={5} suffix="Mb" /></div>
                <div className="space-y-1.5"><Label className={lbl}>Ping</Label><Stepper value={Number(t.pingMs) || 0} onChange={v => setTest('pingMs', v)} step={5} suffix="ms" /></div>
              </div>
              <div className="space-y-1.5"><Label className={lbl}>WiFiman results (signal, channel, interference)</Label><Textarea className="min-h-[70px] text-[16px] bg-bg-primary" value={t.wifiman || ''} onChange={e => setTest('wifiman', e.target.value)} /></div>
              <div className="space-y-1.5"><Label className={lbl}>Weak or dead Wi-Fi areas</Label><Textarea className="min-h-[70px] text-[16px] bg-bg-primary" value={t.deadZones || ''} onChange={e => setTest('deadZones', e.target.value)} /></div>
              {areaOn('wifi') && <Toggle label="Full Wi-Fi survey needed" hint="Heat map / physical survey" checked={!!x.wifiSurvey} onChange={v => setExtra('wifiSurvey', v)} />}
            </div>
          )}
          {areaOn('support') && (
            <div className="rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-4">
              <p className="text-[16px] font-semibold text-text-primary">Troubleshooting</p>
              <div className="space-y-1.5"><Label className={lbl}>What's the problem? (what fails, how often, since when)</Label><Textarea className="min-h-[90px] text-[16px] bg-bg-primary" value={t.symptoms || ''} onChange={e => setTest('symptoms', e.target.value)} /></div>
              <div className="flex flex-wrap gap-6">
                <div className="space-y-1.5"><Label className={lbl}>On-site hours to fix</Label><Stepper value={Number(x.supportHours) || 0} onChange={v => setExtra('supportHours', v)} step={0.5} suffix="h" /></div>
                <div className="space-y-1.5"><Label className={lbl}>Remote hours</Label><Stepper value={Number(x.remoteHours) || 0} onChange={v => setExtra('remoteHours', v)} step={0.5} suffix="h" /></div>
              </div>
            </div>
          )}
          {(['general', ...shownAreas] as (WalkArea | 'general')[]).map(k => (
            <div key={k} className="space-y-3">
              <p className="text-[12px] font-bold uppercase tracking-wider text-text-muted">{k === 'general' ? 'General questions' : WALK_AREAS.find(z => z.key === k)?.label}</p>
              {DISCOVERY[k].map(q => (
                <div key={q} className="space-y-1.5">
                  <Label className="text-[15px] font-medium text-text-primary">{q}</Label>
                  <Textarea className="min-h-[64px] text-[16px] bg-bg-secondary" value={w.answers[q] || ''} onChange={e => set('answers', { ...w.answers, [q]: e.target.value })} />
                </div>
              ))}
            </div>
          ))}
          <div className="space-y-3">
            <p className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Photos to take</p>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" multiple className="hidden" onChange={e => uploadPhotos(e.target.files)} />
            {[...PHOTO_CHECKLIST.general, ...shownAreas.flatMap(k => PHOTO_CHECKLIST[k])].filter((v, i, arr) => arr.indexOf(v) === i).map(tag => {
              const shots = w.photos.map((p, i) => ({ p, i })).filter(({ p }) => p.caption === tag);
              return (
                <div key={tag} className={cn('rounded-xl border p-3 space-y-2', shots.length ? 'border-text-green/40 bg-green-dim/30' : 'border-border-sub bg-bg-secondary')}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[15px] font-medium text-text-primary flex items-center gap-2">{shots.length ? <Check size={16} className="text-text-green" /> : <span className="h-4 w-4 rounded-full border-2 border-border-main" />}{tag}</p>
                    <Button type="button" variant="outline" className="h-11 shrink-0" disabled={uploading} onClick={() => takePhoto(tag)}>
                      {uploading && photoTag.current === tag ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} className="mr-1.5" />} {shots.length ? 'Add' : 'Take photo'}
                    </Button>
                  </div>
                  {shots.length > 0 && <div className="flex gap-2 overflow-x-auto">{shots.map(({ p, i }) => (
                    <div key={p.storagePath} className="relative h-20 w-20 shrink-0 rounded-lg overflow-hidden border border-border-sub">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={tag} className="h-full w-full object-cover" />
                      <button type="button" onClick={() => set('photos', w.photos.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 h-8 w-8 rounded-full bg-bg-primary/80 flex items-center justify-center" aria-label="Remove photo"><X size={14} /></button>
                    </div>
                  ))}</div>}
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-2">
              {w.photos.map((p, i) => ({ p, i })).filter(({ p }) => !p.caption).map(({ p, i }) => (
                <div key={p.storagePath} className="relative h-20 w-20 rounded-lg overflow-hidden border border-border-sub">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
                  <button type="button" onClick={() => set('photos', w.photos.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 h-8 w-8 rounded-full bg-bg-primary/80 flex items-center justify-center" aria-label="Remove photo"><X size={14} /></button>
                </div>
              ))}
              <Button type="button" variant="ghost" className="h-11" disabled={uploading} onClick={() => takePhoto('')}><ImagePlus size={16} className="mr-1.5" /> Other photo</Button>
            </div>
          </div>
          <div className="space-y-1.5"><Label className={lbl}>Scope notes</Label>
            <Textarea className="min-h-[110px] text-[16px] bg-bg-secondary" value={w.scopeNotes} onChange={e => set('scopeNotes', e.target.value)} placeholder="What the customer wants, MDF/IDF locations, anything the office should know…" /></div>
        </div>
      );

      case 'review': return (
        <div className="space-y-4">
          {w.status === 'returned' && w.returnNote && <div className="rounded-xl border border-accent-gold/50 bg-accent-gold/5 p-4 text-[14px]"><b>Sent back by the office:</b> {w.returnNote}</div>}
          <div className="rounded-xl border border-border-sub bg-bg-secondary p-4 text-[14px] space-y-0.5">
            <p className="text-[17px] font-semibold text-text-primary">{w.customerCompany || '—'}{w.siteName ? ` · ${w.siteName}` : ''}</p>
            <p className="text-text-muted">{[w.siteAddress, w.siteState].filter(Boolean).join(', ')} · {w.mode === 'remote' ? 'Remote' : 'On site'} · {w.walkDate}</p>
          </div>
          {(() => {
            const all = walkCandidateLines(w, a).filter(l => l.source !== 'addon');
            const groups: [string, typeof all][] = [
              ['Cabling', all.filter(l => l.source === 'drops')],
              ['Devices & services', all.filter(l => l.source === 'manual')],
              ['Site conditions & travel', all.filter(l => l.source === 'conditions')],
            ];
            const toggle = (id: string, on: boolean) => {
              const off = new Set([...(w.excludedLines || []), ...(w.skippedSuggestions || [])]);
              if (on) off.delete(id); else off.add(id);
              update(p => ({ ...p, excludedLines: [...off], skippedSuggestions: [] }));
            };
            return (
              <div className="rounded-xl border border-border-main overflow-hidden">
                <div className="grid grid-cols-[44px_1fr_auto] items-center gap-2 bg-bg-tertiary px-3 py-2 text-[12px] font-bold uppercase tracking-wider text-text-muted">
                  <span>Incl.</span><span>Item</span><span className="text-right pr-1">Qty</span>
                </div>
                {groups.filter(([, ls]) => ls.length).map(([title, ls]) => (
                  <div key={title}>
                    <p className="px-3 pt-3 pb-1 text-[12px] font-bold uppercase tracking-wider text-text-muted border-t border-border-sub">{title}</p>
                    {ls.map(l => (
                      <label key={l.id} className={cn('grid grid-cols-[44px_1fr_auto] items-center gap-2 px-3 py-3 border-t border-border-sub/60 cursor-pointer', l.excluded && 'opacity-45')}>
                        <input type="checkbox" className="h-6 w-6 accent-brand-red" checked={!l.excluded} disabled={locked} onChange={e => toggle(l.id, e.target.checked)} />
                        <span className="min-w-0">
                          <span className={cn('block text-[15px] font-semibold text-text-primary', l.excluded && 'line-through')}>{nameOf(l.code)}</span>
                          {l.notes && <span className="block text-[13px] text-text-muted break-words">{l.notes}</span>}
                          {l.excluded && <span className="block text-[12px] text-text-muted">Not included — won't be sent</span>}
                        </span>
                        <span className="text-right font-mono text-[15px] font-bold whitespace-nowrap">{l.qty} <span className="text-[12px] font-normal text-text-muted">{unitOf(l.code)}</span></span>
                      </label>
                    ))}
                  </div>
                ))}
                {!all.length && <p className="px-3 py-4 text-[14px] text-text-muted">Nothing yet — answer the job, drops and devices questions.</p>}
              </div>
            );
          })()}

          <div className="rounded-xl border border-border-main overflow-hidden">
            <div className="bg-bg-tertiary px-3 py-2">
              <p className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Add-on services</p>
              <p className="text-[12px] text-text-muted">Extras that often get missed. Check any this job needs.</p>
            </div>
            {[...ADD_ONS].sort((p1, p2) => Number(p2.areas.some(z => w.areas.includes(z))) - Number(p1.areas.some(z => w.areas.includes(z)))).map(o => {
              const qty = Number(w.addOns?.[o.code]) || 0;
              const on = qty > 0;
              const suggested = o.areas.some(z => w.areas.includes(z));
              const unit = unitOf(o.code);
              return (
                <div key={o.code} className={cn('grid grid-cols-[44px_1fr] items-center gap-2 px-3 py-3 border-t border-border-sub/60', !on && 'opacity-75')}>
                  <input type="checkbox" className="h-6 w-6 accent-brand-red" checked={on} disabled={locked}
                    onChange={e => update(p => {
                      const next = { ...(p.addOns || {}) };
                      if (e.target.checked) next[o.code] = Math.max(1, o.qty?.(p) || 1); else delete next[o.code];
                      return { ...p, addOns: next };
                    })} />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold text-text-primary">{o.label}{suggested && <span className="ml-2 text-[11px] font-semibold text-brand-red uppercase">Suggested</span>}</span>
                      <span className="block text-[13px] text-text-muted">{o.hint}{unit ? ` · per ${unit}` : ''}</span>
                    </span>
                    {on && <Stepper value={qty} min={1} step={unit.includes('hour') ? 0.5 : 1} onChange={v => update(p => ({ ...p, addOns: { ...(p.addOns || {}), [o.code]: Math.max(1, v) } }))} />}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[14px] text-text-secondary">{lines.length} item{lines.length === 1 ? '' : 's'} will be sent to the office for pricing.</p>
        </div>
      );
    }
  })();

  const isLast = idx === steps.length - 1;
  return (
    <div className="max-w-4xl mx-auto text-left">
      <div className="sticky top-0 z-20 -mx-4 px-4 pt-2 pb-3 bg-bg-primary/95 backdrop-blur border-b border-border-sub space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Link href={backHref} className="text-[14px] text-text-muted flex items-center gap-1 hover:text-text-primary"><ArrowLeft size={16} /> Site walks</Link>
          <span className="text-[12px] text-text-muted flex items-center gap-1.5">
            {locked ? 'Sent — view only'
              : saveState === 'saving' ? <><Loader2 size={12} className="animate-spin" /> Saving…</>
              : saveState === 'offline' ? <span className="text-accent-gold flex items-center gap-1"><CloudOff size={13} /> No signal — saved on this device</span>
              : savedAt ? <><Check size={12} className="text-text-green" /> Saved {savedAt}</> : 'Saves as you go'}
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-text-primary">{w.customerCompany || 'New site walk'}</h1>
            <p className="text-[13px] text-text-muted font-mono">{w.id}</p>
          </div>
          {canDelete && <Button type="button" variant="ghost" className="h-11 text-text-red shrink-0" onClick={remove}><Trash2 size={16} className="mr-1.5" /> Delete</Button>}
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1">
          {steps.map((s, i) => (
            <button key={s} type="button" onClick={() => go(s)} className={cn('shrink-0 h-11 px-4 rounded-full border text-[14px] font-medium',
              s === step ? 'border-brand-red bg-brand-red text-white' : i < idx ? 'border-brand-red/30 text-brand-red' : 'border-border-sub text-text-muted')}>
              {i + 1}. {STEP_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="pt-4">
        <p className="text-[12px] font-bold uppercase tracking-wider text-brand-red">Step {idx + 1} of {steps.length} · {STEP_LABEL[step]}</p>
        <p className="text-[15px] text-text-secondary mt-1">{STEP_GUIDE[step]}</p>
      </div>
      <div className={cn('pt-5', locked && 'pointer-events-none opacity-90')}>{body}</div>
      <div className="sticky bottom-0 z-30 -mx-4 mt-8 border-t border-border-sub bg-bg-elevated/95 backdrop-blur">
        <div className="px-4 py-3 flex items-center gap-2">
          <Button type="button" variant="outline" className="h-14 px-5 text-[16px]" disabled={idx === 0} onClick={() => go(steps[idx - 1])}><ChevronLeft size={18} className="mr-1" /> Back</Button>
          <div className="flex-1" />
          {isLast ? (!locked && (
            <Button type="button" className="h-14 px-6 text-[16px] bg-brand-red hover:bg-brand-red/90 text-white" disabled={submitting} onClick={submit}>
              {submitting ? <Loader2 size={18} className="mr-1.5 animate-spin" /> : <Send size={18} className="mr-1.5" />} Send for approval
            </Button>
          )) : (
            <Button type="button" className="h-14 px-6 text-[16px]" onClick={() => go(steps[idx + 1])}>Next: {STEP_LABEL[steps[idx + 1]]} <ChevronRight size={18} className="ml-1" /></Button>
          )}
        </div>
      </div>
    </div>
  );
}
