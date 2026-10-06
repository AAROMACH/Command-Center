'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { db, storage } from '@/lib/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { uploadFile } from '@/lib/upload';
import type { Lead, SiteSurvey, SurveyCloset } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Camera, ClipboardList, Loader2, Plus, Trash2, X } from 'lucide-react';
import {
  CABLE_TYPES, CEILING_TYPES, PATHWAYS, SITE_CONDITIONS, SECTIONS, SECTION_FOR_SERVICE, type SurveySection,
  emptySurvey, totalDrops, estimatedCableFt,
} from '@/lib/crm-survey';
import { todayKey } from '@/lib/crm';
import { logLeadActivity } from '@/lib/crm-actions';

type Props = {
  open: boolean;
  lead: Lead;
  survey?: SiteSurvey | null;
  currentUserId: string;
  currentUserName?: string;
  onClose: () => void;
};

type Draft = Omit<SiteSurvey, 'leadId' | 'createdAt' | 'updatedAt' | 'createdBy'> & Partial<Pick<SiteSurvey, 'createdAt' | 'createdBy'>>;

const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-text-muted';
const inputCls = 'h-9 text-xs bg-bg-tertiary border-border-main';

function Num({ label, value, onChange, suffix }: { label: string; value: number; onChange: (n: number) => void; suffix?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className={labelCls}>{label}{suffix ? ` (${suffix})` : ''}</Label>
      <Input type="number" inputMode="numeric" min="0" value={value || ''} placeholder="0" onChange={e => onChange(Number(e.target.value) || 0)} className={inputCls} />
    </div>
  );
}

function Txt({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (s: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className={labelCls}>{label}</Label>
      <Input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} className={inputCls} />
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-text-secondary cursor-pointer h-9">
      <Checkbox checked={checked} onCheckedChange={v => onChange(!!v)} /> {label}
    </label>
  );
}

function Pick({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (s: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className={labelCls}>{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className={inputCls}><SelectValue placeholder="Select..." /></SelectTrigger>
        <SelectContent className="bg-bg-elevated border-border-main">{options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

export function SiteSurveyDialog({ open, lead, survey, currentUserId, currentUserName, onClose }: Props) {
  const { toast } = useToast();
  const [d, setD] = useState<Draft | null>(null);
  const [section, setSection] = useState<SurveySection>('site');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (survey) setD({ ...emptySurvey(), ...survey });
    else setD({ ...emptySurvey(), id: doc(collection(db, 'siteSurveys')).id, surveyDate: todayKey(), surveyedBy: currentUserName || '' });
    setSection('site');
  }, [open, survey?.id]);

  // Sections relevant to what's being sold come first; the rest stay reachable.
  const ordered = useMemo(() => {
    const wanted = new Set<SurveySection>(['site', ...(lead.serviceLines || []).map(s => SECTION_FOR_SERVICE[s]).filter(Boolean)]);
    return [...SECTIONS.filter(s => wanted.has(s.key)), ...SECTIONS.filter(s => !wanted.has(s.key))].map(s => ({ ...s, relevant: wanted.has(s.key) }));
  }, [lead.serviceLines]);

  if (!d) return null;

  function patch<K extends keyof Draft>(key: K, value: Partial<Draft[K]> | Draft[K]) {
    setD(prev => prev && ({ ...prev, [key]: typeof value === 'object' && !Array.isArray(value) && value !== null ? { ...(prev[key] as object), ...value } : value }));
  }

  function setCloset(i: number, c: Partial<SurveyCloset>) {
    setD(prev => prev && ({ ...prev, closets: prev.closets.map((x, j) => j === i ? { ...x, ...c } : x) }));
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length || !d) return;
    const list = Array.from(files);
    setUploading(n => n + list.length);
    for (const f of list) {
      try {
        if (f.size > 15 * 1024 * 1024) throw new Error(`${f.name} is over 15 MB`);
        const safe = f.name.replace(/[^\w.-]+/g, '_');
        const up = await uploadFile(`siteSurveys/${d.id}/${Date.now()}-${safe}`, f, { contentType: f.type });
        setD(prev => prev && ({ ...prev, photos: [...prev.photos, { url: up.url, storagePath: up.storagePath, caption: '', uploadedAt: new Date().toISOString() }] }));
      } catch (e: any) {
        toast({ variant: 'destructive', title: 'Upload failed', description: e?.message });
      } finally {
        setUploading(n => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function removePhoto(i: number) {
    const p = d!.photos[i];
    setD(prev => prev && ({ ...prev, photos: prev.photos.filter((_, j) => j !== i) }));
    try { await deleteObject(ref(storage, p.storagePath)); } catch { /* already gone — the record no longer points at it */ }
  }

  async function save(status: SiteSurvey['status']) {
    if (!d) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const isNew = !survey;
      await setDoc(doc(db, 'siteSurveys', d.id), {
        ...d,
        status,
        leadId: lead.id,
        ...(lead.companyId ? { companyId: lead.companyId } : {}),
        createdBy: d.createdBy || currentUserId,
        createdAt: d.createdAt || now,
        updatedAt: now,
      });
      if (isNew || (status === 'complete' && survey?.status !== 'complete')) {
        await logLeadActivity(lead.id, {
          type: 'site_walk',
          description: `${status === 'complete' ? 'Completed' : 'Started'} ${d.title}: ${totalDrops(d)} drops${d.photos.length ? `, ${d.photos.length} photos` : ''}`,
          createdBy: currentUserId,
        });
      }
      toast({ title: status === 'complete' ? 'Survey completed' : 'Survey saved' });
      onClose();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e?.message });
    } finally {
      setSaving(false);
    }
  }

  const drops = totalDrops(d);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-bg-secondary border-border-main sm:max-w-3xl max-h-[92vh] flex flex-col p-0">
        <DialogHeader className="p-5 pb-3 border-b border-border-sub">
          <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
            <ClipboardList size={15} className="text-brand-red" /> Site Survey
          </DialogTitle>
          <DialogDescription className="text-[10px] uppercase font-bold text-text-muted">
            {lead.companyName}{lead.address ? ` · ${lead.address}` : ''}
          </DialogDescription>
          <div className="grid grid-cols-3 gap-2 pt-2">
            <Txt label="Survey Name" value={d.title} onChange={v => patch('title', v)} placeholder="Building A — 2nd floor" />
            <div className="space-y-1.5">
              <Label className={labelCls}>Date</Label>
              <Input type="date" value={d.surveyDate} onChange={e => patch('surveyDate', e.target.value)} className={inputCls} />
            </div>
            <Txt label="Surveyed By" value={d.surveyedBy} onChange={v => patch('surveyedBy', v)} />
          </div>
        </DialogHeader>

        {/* Section tabs */}
        <div className="flex gap-1 px-5 pt-3 overflow-x-auto shrink-0">
          {ordered.map(s => (
            <button key={s.key} onClick={() => setSection(s.key)}
              className={cn('px-3 h-8 rounded-md text-[9px] font-black uppercase tracking-widest whitespace-nowrap border transition-colors',
                section === s.key ? 'bg-brand-red text-white border-brand-red' : s.relevant ? 'border-border-main text-text-primary' : 'border-border-sub text-text-muted')}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {section === 'site' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Pick label="Condition" value={d.site.condition} options={SITE_CONDITIONS} onChange={v => patch('site', { condition: v })} />
              <Num label="Square Feet" value={d.site.squareFeet} onChange={n => patch('site', { squareFeet: n })} />
              <Num label="Floors" value={d.site.floors} onChange={n => patch('site', { floors: n })} />
              <Pick label="Ceiling" value={d.site.ceilingType} options={CEILING_TYPES} onChange={v => patch('site', { ceilingType: v })} />
              <Num label="Ceiling Height" suffix="ft" value={d.site.ceilingHeightFt} onChange={n => patch('site', { ceilingHeightFt: n })} />
              <div />
              <Check label="After-hours only" checked={d.site.afterHoursOnly} onChange={b => patch('site', { afterHoursOnly: b })} />
              <Check label="Lift needed" checked={d.site.liftNeeded} onChange={b => patch('site', { liftNeeded: b })} />
              <Check label="Permit required" checked={d.site.permitRequired} onChange={b => patch('site', { permitRequired: b })} />
              <Check label="Union site" checked={d.site.unionSite} onChange={b => patch('site', { unionSite: b })} />
              <div className="col-span-full"><Txt label="Access / Parking / Badging" value={d.site.accessNotes} onChange={v => patch('site', { accessNotes: v })} placeholder="Badge at security desk, loading dock in rear" /></div>
              <div className="col-span-full"><Txt label="Hazards" value={d.site.hazardNotes} onChange={v => patch('site', { hazardNotes: v })} placeholder="Asbestos tile in east wing, live electrical in IDF" /></div>
            </div>
          )}

          {section === 'cabling' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Num label="Data" value={d.cabling.dataDrops} onChange={n => patch('cabling', { dataDrops: n })} />
                <Num label="Voice" value={d.cabling.voiceDrops} onChange={n => patch('cabling', { voiceDrops: n })} />
                <Num label="WAP" value={d.cabling.wapDrops} onChange={n => patch('cabling', { wapDrops: n })} />
                <Num label="Camera" value={d.cabling.cameraDrops} onChange={n => patch('cabling', { cameraDrops: n })} />
                <Num label="Other" value={d.cabling.otherDrops} onChange={n => patch('cabling', { otherDrops: n })} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Pick label="Cable" value={d.cabling.cableType} options={CABLE_TYPES} onChange={v => patch('cabling', { cableType: v })} />
                <Num label="Avg Run" suffix="ft" value={d.cabling.avgRunFt} onChange={n => patch('cabling', { avgRunFt: n })} />
                <div className="flex flex-col justify-end">
                  <Check label="Plenum rated" checked={d.cabling.plenum} onChange={b => patch('cabling', { plenum: b })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Pathways</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PATHWAYS.map(p => {
                    const on = d.cabling.pathways.includes(p);
                    return (
                      <button key={p} type="button" onClick={() => patch('cabling', { pathways: on ? d.cabling.pathways.filter(x => x !== p) : [...d.cabling.pathways, p] })}
                        className={cn('px-2.5 h-7 rounded-md border text-[9px] font-bold uppercase tracking-wider', on ? 'bg-brand-red/15 border-brand-red/40 text-text-primary' : 'border-border-main text-text-muted')}>
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Check label="Remove / abandon existing cabling" checked={d.cabling.removeExisting} onChange={b => patch('cabling', { removeExisting: b })} />
              <Txt label="Cabling Notes" value={d.cabling.notes} onChange={v => patch('cabling', { notes: v })} />
              <div className="rounded-lg border border-border-sub bg-bg-primary p-3 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                Takeoff: <span className="text-text-primary">{drops} drops</span> · <span className="text-text-primary">~{estimatedCableFt(d).toLocaleString()} ft</span> {d.cabling.cableType} (avg run + 10%)
              </div>
            </div>
          )}

          {section === 'closets' && (
            <div className="space-y-3">
              {d.closets.map((c, i) => (
                <div key={i} className="rounded-lg border border-border-sub bg-bg-primary p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Input value={c.name} onChange={e => setCloset(i, { name: e.target.value })} placeholder="MDF / IDF-1" className={cn(inputCls, 'w-[160px] font-bold')} />
                    <Input value={c.location} onChange={e => setCloset(i, { location: e.target.value })} placeholder="Room 104, 1st floor" className={cn(inputCls, 'flex-1')} />
                    <button onClick={() => setD(p => p && ({ ...p, closets: p.closets.filter((_, j) => j !== i) }))} className="p-1.5 text-text-muted hover:text-text-red"><Trash2 size={13} /></button>
                  </div>
                  <div className="flex flex-wrap gap-x-5">
                    <Check label="New rack needed" checked={c.rackNeeded} onChange={b => setCloset(i, { rackNeeded: b })} />
                    <Check label="Dedicated power" checked={c.powerAvailable} onChange={b => setCloset(i, { powerAvailable: b })} />
                    <Check label="Grounded (TMGB)" checked={c.grounded} onChange={b => setCloset(i, { grounded: b })} />
                  </div>
                  <Input value={c.notes} onChange={e => setCloset(i, { notes: e.target.value })} placeholder="Existing switches, space on backboard, HVAC..." className={inputCls} />
                </div>
              ))}
              <Button size="sm" variant="outline" className="h-8 text-[10px] font-bold uppercase"
                onClick={() => setD(p => p && ({ ...p, closets: [...p.closets, { name: p.closets.length ? `IDF-${p.closets.length}` : 'MDF', location: '', rackNeeded: false, powerAvailable: false, grounded: false, notes: '' }] }))}>
                <Plus size={11} className="mr-1.5" /> Add Closet
              </Button>
            </div>
          )}

          {section === 'cameras' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Num label="Indoor" value={d.cameras.indoor} onChange={n => patch('cameras', { indoor: n })} />
              <Num label="Outdoor" value={d.cameras.outdoor} onChange={n => patch('cameras', { outdoor: n })} />
              <Num label="PTZ" value={d.cameras.ptz} onChange={n => patch('cameras', { ptz: n })} />
              <Num label="Retention" suffix="days" value={d.cameras.retentionDays} onChange={n => patch('cameras', { retentionDays: n })} />
              <Txt label="NVR Location" value={d.cameras.nvrLocation} onChange={v => patch('cameras', { nvrLocation: v })} />
              <Txt label="Existing System" value={d.cameras.existingSystem} onChange={v => patch('cameras', { existingSystem: v })} placeholder="Hikvision analog, 8ch DVR" />
              <div className="col-span-full"><Txt label="Notes" value={d.cameras.notes} onChange={v => patch('cameras', { notes: v })} placeholder="Coverage goals, mounting heights, lighting" /></div>
            </div>
          )}

          {section === 'access' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Num label="Doors" value={d.access.doors} onChange={n => patch('access', { doors: n })} />
              <Num label="Readers" value={d.access.readers} onChange={n => patch('access', { readers: n })} />
              <Num label="REX" value={d.access.rex} onChange={n => patch('access', { rex: n })} />
              <div className="col-span-full"><Txt label="Existing System" value={d.access.existingSystem} onChange={v => patch('access', { existingSystem: v })} /></div>
              <div className="col-span-full"><Txt label="Notes" value={d.access.notes} onChange={v => patch('access', { notes: v })} placeholder="Door hardware, strikes vs maglocks, fire alarm tie-in" /></div>
            </div>
          )}

          {section === 'wireless' && (
            <div className="grid grid-cols-2 gap-3">
              <Num label="Access Points" value={d.wireless.aps} onChange={n => patch('wireless', { aps: n })} />
              <Txt label="Existing System" value={d.wireless.existingSystem} onChange={v => patch('wireless', { existingSystem: v })} />
              <div className="col-span-full"><Txt label="Coverage Notes" value={d.wireless.coverageNotes} onChange={v => patch('wireless', { coverageNotes: v })} placeholder="Dead zones, warehouse racking, outdoor coverage" /></div>
            </div>
          )}

          {section === 'av' && (
            <div className="grid grid-cols-2 gap-3">
              <Num label="Rooms" value={d.av.rooms} onChange={n => patch('av', { rooms: n })} />
              <Num label="Displays" value={d.av.displays} onChange={n => patch('av', { displays: n })} />
              <div className="col-span-full"><Txt label="Notes" value={d.av.notes} onChange={v => patch('av', { notes: v })} placeholder="Conference rooms, VC needs, wall construction" /></div>
            </div>
          )}

          {section === 'fiber' && (
            <div className="grid grid-cols-2 gap-3">
              <Num label="Runs" value={d.fiber.runs} onChange={n => patch('fiber', { runs: n })} />
              <Num label="Strands per Run" value={d.fiber.strands} onChange={n => patch('fiber', { strands: n })} />
              <div className="col-span-full"><Txt label="Notes" value={d.fiber.notes} onChange={v => patch('fiber', { notes: v })} placeholder="Building-to-building, innerduct, termination type" /></div>
            </div>
          )}

          {/* Photos + notes are always visible */}
          <div className="space-y-2 pt-2 border-t border-border-sub">
            <div className="flex items-center justify-between">
              <Label className={labelCls}>Photos & Plans ({d.photos.length})</Label>
              <Button size="sm" variant="outline" className="h-8 text-[10px] font-bold uppercase" onClick={() => fileRef.current?.click()} disabled={uploading > 0}>
                {uploading > 0 ? <Loader2 size={11} className="mr-1.5 animate-spin" /> : <Camera size={11} className="mr-1.5" />}
                {uploading > 0 ? `Uploading ${uploading}...` : 'Add Photos'}
              </Button>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" multiple className="hidden" onChange={e => addPhotos(e.target.files)} />
            </div>
            {d.photos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {d.photos.map((p, i) => (
                  <div key={p.storagePath} className="relative group">
                    <a href={p.url} target="_blank" rel="noreferrer" className="block aspect-square rounded-md overflow-hidden border border-border-sub bg-bg-tertiary">
                      {/\.pdf/i.test(p.storagePath)
                        ? <span className="h-full flex items-center justify-center text-[10px] font-black text-text-muted">PDF</span>
                        : <img src={p.url} alt={p.caption || 'Survey photo'} className="h-full w-full object-cover" />}
                    </a>
                    <button onClick={() => removePhoto(i)} className="absolute top-1 right-1 p-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100"><X size={11} /></button>
                    <input value={p.caption || ''} placeholder="Caption"
                      onChange={e => setD(prev => prev && ({ ...prev, photos: prev.photos.map((x, j) => j === i ? { ...x, caption: e.target.value } : x) }))}
                      className="mt-1 w-full bg-transparent text-[9px] text-text-muted focus:outline-none focus:text-text-primary" />
                  </div>
                ))}
              </div>
            )}
            <Label className={labelCls}>General Notes</Label>
            <Textarea value={d.notes} onChange={e => patch('notes', e.target.value)} className="text-xs bg-bg-tertiary border-border-main min-h-[70px]" />
          </div>
        </div>

        <DialogFooter className="gap-2 p-4 border-t border-border-sub">
          <span className="mr-auto text-[10px] font-bold uppercase tracking-wider text-text-muted self-center">{drops} drops · {d.photos.length} photos</span>
          <Button variant="ghost" size="sm" className="text-[10px] uppercase font-bold" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="outline" size="sm" className="text-[10px] uppercase font-bold" onClick={() => save('draft')} disabled={saving || uploading > 0}>Save Draft</Button>
          <Button size="sm" className="text-[10px] uppercase font-bold bg-brand-red hover:bg-brand-red/90 text-white" onClick={() => save('complete')} disabled={saving || uploading > 0}>
            {saving && <Loader2 size={12} className="animate-spin mr-1.5" />} Mark Complete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
