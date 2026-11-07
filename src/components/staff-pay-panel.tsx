'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { CheckCircle2, ChevronDown, ChevronRight, Loader2, PiggyBank, Plus, SkipForward } from 'lucide-react';
import { db } from '@/lib/firebase';
import { onSharedSnapshot } from '@/lib/shared-snapshot';
import { isClient } from '@/lib/permissions';
import { reportingWeekOf } from '@/lib/weekly-log-core';
import {
  createStaffPayPlan, recordStaffPayWeek, summarizePlan, updateStaffPayPlan,
  type PlanSummary, type PlanWeek, type StaffPayEntry, type StaffPayPlan,
} from '@/lib/staff-pay';
import type { Technician } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const money = (n: number) => `$${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/** Status chip for one week of a plan. */
export function WeekChip({ w, current }: { w: PlanWeek; current?: boolean }) {
  const e = w.entry;
  const label = e ? (e.status === 'skipped' ? 'Skipped — banked' : e.paid > e.scheduled ? 'Paid + catch-up' : e.paid < e.scheduled ? 'Paid short — rest banked' : 'Paid')
    : current ? 'Not recorded yet' : 'Not recorded';
  const cls = !e ? (current ? 'border-border-sub text-text-muted' : 'border-brand-red/40 text-brand-red')
    : e.status === 'skipped' || e.paid < e.scheduled ? 'border-accent-gold/40 bg-accent-gold/10 text-accent-gold' : 'border-text-green/40 bg-text-green/10 text-text-green';
  return <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', cls)}>{label}</span>;
}

/** Plan totals line shared by payroll and the person's own view. */
export function PlanTotals({ plan, s }: { plan: StaffPayPlan; s: PlanSummary }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
      <div><p className="text-text-muted">Each week</p><p className="font-mono font-semibold text-text-primary">{money(plan.weeklyAmount)}</p></div>
      <div><p className="text-text-muted">Paid so far</p><p className="font-mono font-semibold text-text-green">{money(s.paidTotal)}</p></div>
      {plan.kind === 'installment' ? (
        <>
          {/* The whole unpaid balance is owed; "behind" is just the missed/short weeks within it. */}
          <div><p className="text-text-muted">Still owed (of {money(plan.total || 0)})</p><p className={cn('font-mono font-semibold', (s.remaining || 0) > 0 ? 'text-accent-gold' : 'text-text-primary')}>{money(s.remaining || 0)}</p></div>
          <div><p className="text-text-muted">Behind schedule</p><p className={cn('font-mono font-semibold', s.banked > 0 ? 'text-brand-red' : 'text-text-primary')}>{money(s.banked)}</p></div>
        </>
      ) : (
        <>
          <div><p className="text-text-muted">Banked (owed)</p><p className={cn('font-mono font-semibold', s.banked > 0 ? 'text-accent-gold' : 'text-text-primary')}>{money(s.banked)}</p></div>
          <div><p className="text-text-muted">Weeks recorded</p><p className="font-mono font-semibold text-text-primary">{s.weeks.filter(w => w.entry).length}</p></div>
        </>
      )}
    </div>
  );
}

/**
 * Payroll Audit → Staff pay: weekly bonuses and installment payments outside
 * job logs. Each week payroll marks Paid (amount) or Skipped; skipped or
 * short weeks are banked as owed until caught up.
 */
export function StaffPayPanel({ by, canEdit }: { by: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [plans, setPlans] = useState<StaffPayPlan[]>([]);
  const [entries, setEntries] = useState<StaffPayEntry[]>([]);
  const [people, setPeople] = useState<Technician[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [recording, setRecording] = useState<{ plan: StaffPayPlan; week: PlanWeek; banked: number } | null>(null);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'staffPayPlans'), s => setPlans(s.docs.map(d => ({ ...d.data(), id: d.id } as StaffPayPlan))), () => setPlans([]));
    const u2 = onSnapshot(collection(db, 'staffPayEntries'), s => setEntries(s.docs.map(d => ({ ...d.data(), id: d.id } as StaffPayEntry))), () => setEntries([]));
    const u3 = onSharedSnapshot('users', s => setPeople(s.docs.map(d => ({ ...d.data(), id: d.id } as Technician)).filter(u => !isClient(u) && u.accountStatus !== 'inactive')
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))), () => setPeople([]));
    return () => { u1(); u2(); u3(); };
  }, []);

  const current = reportingWeekOf();
  const rows = useMemo(() => plans
    .map(p => ({ plan: p, s: summarizePlan(p, entries, current) }))
    .sort((a, b) => Number(b.plan.active) - Number(a.plan.active) || a.plan.personName.localeCompare(b.plan.personName)), [plans, entries, current]);
  const needs = rows.filter(r => r.plan.active && !r.s.done && ((r.s.thisWeek && !r.s.thisWeek.entry) || r.s.unrecorded.length));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[14px] font-semibold text-text-primary flex items-center gap-2"><PiggyBank size={15} className="text-brand-red" /> Staff pay</p>
          <p className="text-[12px] text-text-muted">Weekly bonuses and installment payments outside job logs. Mark each week Paid or Skipped — skipped weeks are banked as owed.</p>
        </div>
        {canEdit && <Button size="sm" className="h-9 bg-brand-red hover:bg-brand-red/90 text-white" onClick={() => setAdding(true)}><Plus size={14} className="mr-1.5" /> Add pay plan</Button>}
      </div>

      {needs.length > 0 && (
        <p className="rounded-lg border border-accent-gold/40 bg-accent-gold/5 px-3 py-2 text-[12px] text-text-primary">
          {needs.length} plan{needs.length === 1 ? '' : 's'} need this week (or an earlier week) marked: {needs.map(r => `${r.plan.personName} · ${r.plan.label}`).join(', ')}.
        </p>
      )}

      {!rows.length && <p className="rounded-lg border border-dashed border-border-sub p-8 text-center text-[13px] text-text-muted">No pay plans yet. Add one for a weekly bonus or a payment spread over several checks.</p>}

      <div className="space-y-3">
        {rows.map(({ plan, s }) => {
          const isOpen = open === plan.id;
          const toMark = [s.thisWeek, ...s.unrecorded].filter((w): w is PlanWeek => !!w && !w.entry && w.scheduled > 0);
          return (
            <div key={plan.id} className={cn('rounded-xl border bg-bg-secondary p-4 space-y-3', plan.active ? 'border-border-sub' : 'border-border-sub opacity-60')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-text-primary">{plan.personName} · {plan.label}</p>
                  <p className="text-[12px] text-text-muted">{plan.kind === 'installment' ? `Installment of ${money(plan.total || 0)}` : 'Every week'} · since week of {plan.startWeek}{!plan.active ? ' · paused' : s.done ? ' · paid in full' : ''}</p>
                </div>
                {canEdit && (
                  <Button size="sm" variant="ghost" className="h-8 text-text-muted" onClick={async () => {
                    try { await updateStaffPayPlan(plan.id, { active: !plan.active }); } catch (e: any) { toast({ variant: 'destructive', title: 'Could not update', description: e.message }); }
                  }}>{plan.active ? 'Pause' : 'Resume'}</Button>
                )}
              </div>
              <PlanTotals plan={plan} s={s} />

              {plan.active && !s.done && canEdit && toMark.length > 0 && (
                <div className="space-y-1.5">
                  {toMark.map(w => (
                    <div key={w.weekOf} className="flex flex-wrap items-center gap-2 rounded-lg border border-border-sub bg-bg-primary px-3 py-2">
                      <span className="text-[13px] font-medium text-text-primary flex-1 min-w-[150px]">Week of {w.weekOf}{w.weekOf === current ? ' (this week)' : ''} · {money(w.scheduled)}</span>
                      <Button size="sm" className="h-8 bg-text-green hover:bg-text-green/90 text-white" onClick={() => setRecording({ plan, week: w, banked: s.banked })}>
                        <CheckCircle2 size={13} className="mr-1" /> Paid
                      </Button>
                      <Button size="sm" variant="outline" className="h-8" onClick={async () => {
                        if (!confirm(`Skip ${money(w.scheduled)} for ${plan.personName} (week of ${w.weekOf})? It's added to the bank as owed.`)) return;
                        try { await recordStaffPayWeek(plan, w.weekOf, w.scheduled, 'skipped', 0, by); toast({ title: 'Skipped — banked as owed' }); }
                        catch (e: any) { toast({ variant: 'destructive', title: 'Could not record', description: e.message }); }
                      }}><SkipForward size={13} className="mr-1" /> Skip</Button>
                    </div>
                  ))}
                </div>
              )}

              <button type="button" className="text-[12px] text-text-muted hover:text-text-primary flex items-center gap-1" onClick={() => setOpen(isOpen ? null : plan.id)}>
                {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Week-by-week history
              </button>
              {isOpen && (
                <div className="divide-y divide-border-sub rounded-lg border border-border-sub">
                  {s.weeks.map(w => (
                    <div key={w.weekOf} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12px]">
                      <span className="flex-1 min-w-[120px] text-text-primary">Week of {w.weekOf}</span>
                      <span className="font-mono text-text-muted">due {money(w.scheduled)}</span>
                      <span className="font-mono font-semibold text-text-primary">{w.entry ? `paid ${money(w.entry.paid)}` : '—'}</span>
                      <WeekChip w={w} current={w.weekOf === current} />
                      {w.entry && canEdit && (
                        <button type="button" className="text-[11px] text-text-muted hover:text-text-primary underline" onClick={() => setRecording({ plan, week: { ...w, entry: null }, banked: s.banked })}>Change</button>
                      )}
                      {w.entry?.note && <span className="basis-full text-[11px] text-text-muted">{w.entry.note} — {w.entry.by}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AddPlanDialog open={adding} onClose={() => setAdding(false)} people={people} by={by} />
      <RecordPaidDialog rec={recording} onClose={() => setRecording(null)} by={by} />
    </div>
  );
}

function AddPlanDialog({ open, onClose, people, by }: { open: boolean; onClose: () => void; people: Technician[]; by: string }) {
  const { toast } = useToast();
  const [personId, setPersonId] = useState('');
  const [kind, setKind] = useState<'recurring' | 'installment'>('recurring');
  const [label, setLabel] = useState('');
  const [weekly, setWeekly] = useState('');
  const [total, setTotal] = useState('');
  const [start, setStart] = useState(reportingWeekOf());
  const [busy, setBusy] = useState(false);
  const person = people.find(p => p.id === personId);
  const startIso = (() => { const [m, d, y] = start.split('-'); return y ? `${y}-${m}-${d}` : ''; })();
  const ok = !!person && !!label.trim() && Number(weekly) > 0 && (kind === 'recurring' || Number(total) > 0);
  const save = async () => {
    setBusy(true);
    try {
      await createStaffPayPlan({ personId, personName: person!.name || 'Staff', kind, label: label.trim(), weeklyAmount: Number(weekly), total: kind === 'installment' ? Number(total) : null, startWeek: start, active: true, notes: null, createdBy: by });
      toast({ title: 'Pay plan added' });
      setPersonId(''); setLabel(''); setWeekly(''); setTotal('');
      onClose();
    } catch (e: any) { toast({ variant: 'destructive', title: 'Could not add', description: e?.code === 'permission-denied' ? 'Only payroll admins can add pay plans.' : e.message }); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>Add pay plan</DialogTitle>
          <DialogDescription>A weekly amount for someone, tracked week by week.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label className="text-[12px]">Person</Label>
            <Select value={personId} onValueChange={setPersonId}><SelectTrigger className="h-10"><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent className="max-h-[300px]">{people.map(p => <SelectItem key={p.id} value={p.id}>{p.name || p.email}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label className="text-[12px]">Type</Label>
            <Select value={kind} onValueChange={v => setKind(v as 'recurring' | 'installment')}><SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="recurring">Every week (e.g. a weekly bonus)</SelectItem><SelectItem value="installment">A total paid over several weeks</SelectItem></SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label className="text-[12px]">Name</Label>
            <Input className="h-10" placeholder={kind === 'installment' ? 'App build' : 'Weekly bonus'} value={label} onChange={e => setLabel(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-[12px]">Each week ($)</Label><Input type="number" inputMode="decimal" className="h-10 font-mono" value={weekly} onChange={e => setWeekly(e.target.value)} /></div>
            {kind === 'installment' && <div className="space-y-1.5"><Label className="text-[12px]">Total owed ($)</Label><Input type="number" inputMode="decimal" className="h-10 font-mono" value={total} onChange={e => setTotal(e.target.value)} /></div>}
          </div>
          <div className="space-y-1.5"><Label className="text-[12px]">Starts the week of</Label>
            <Input type="date" className="h-10" value={startIso} onChange={e => { const [y, m, d] = e.target.value.split('-'); if (y) setStart(`${m}-${d}-${y}`); }} />
            <p className="text-[11px] text-text-muted">Any day that week — it's set to that Monday.</p></div>
          {kind === 'installment' && Number(weekly) > 0 && Number(total) > 0 && (
            <p className="text-[12px] text-text-muted">{Math.ceil(Number(total) / Number(weekly))} weeks at {money(Number(weekly))}.</p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!ok || busy}>{busy && <Loader2 size={13} className="mr-1.5 animate-spin" />} Add plan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordPaidDialog({ rec, onClose, by }: { rec: { plan: StaffPayPlan; week: PlanWeek; banked: number } | null; onClose: () => void; by: string }) {
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (rec) { setAmount(String(rec.week.scheduled)); setNote(''); } }, [rec]);
  if (!rec) return null;
  const save = async (status: 'paid' | 'skipped') => {
    setBusy(true);
    try {
      await recordStaffPayWeek(rec.plan, rec.week.weekOf, rec.week.scheduled, status, Number(amount) || 0, by, note);
      toast({ title: status === 'paid' ? 'Recorded as paid' : 'Skipped — banked as owed' });
      onClose();
    } catch (e: any) { toast({ variant: 'destructive', title: 'Could not record', description: e.message }); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={!!rec} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="text-left">
          <DialogTitle>{rec.plan.personName} · {rec.plan.label}</DialogTitle>
          <DialogDescription>Week of {rec.week.weekOf} · {money(rec.week.scheduled)} due{rec.banked > 0 ? ` · ${money(rec.banked)} behind` : ''}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label className="text-[12px]">Amount actually paid</Label>
            <Input type="number" inputMode="decimal" className="h-10 font-mono" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          {rec.banked > 0 && (
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setAmount(String(Math.round((rec.week.scheduled + rec.banked) * 100) / 100))}>
              Catch up all missed ({money(rec.week.scheduled + rec.banked)})
            </Button>
          )}
          <p className="text-[11px] text-text-muted">Less than due banks the difference; more than due pays the bank down.</p>
          <div className="space-y-1.5"><Label className="text-[12px]">Note (optional)</Label><Input className="h-10" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. paid with the 11/7 check" /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => save('skipped')}>Skip week</Button>
          <Button className="bg-text-green hover:bg-text-green/90 text-white" disabled={busy || !(Number(amount) >= 0)} onClick={() => save('paid')}>
            {busy && <Loader2 size={13} className="mr-1.5 animate-spin" />} Record paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The signed-in person's own plans — so they can see what was paid, skipped and is still owed. */
export function MyStaffPay({ userId }: { userId: string }) {
  const [plans, setPlans] = useState<StaffPayPlan[]>([]);
  const [entries, setEntries] = useState<StaffPayEntry[]>([]);
  useEffect(() => {
    if (!userId) return;
    const u1 = onSnapshot(query(collection(db, 'staffPayPlans'), where('personId', '==', userId)), s => setPlans(s.docs.map(d => ({ ...d.data(), id: d.id } as StaffPayPlan))), () => setPlans([]));
    const u2 = onSnapshot(query(collection(db, 'staffPayEntries'), where('personId', '==', userId)), s => setEntries(s.docs.map(d => ({ ...d.data(), id: d.id } as StaffPayEntry))), () => setEntries([]));
    return () => { u1(); u2(); };
  }, [userId]);
  const current = reportingWeekOf();
  if (!plans.length) return null;
  return (
    <div className="space-y-3">
      {plans.map(plan => {
        const s = summarizePlan(plan, entries, current);
        return (
          <div key={plan.id} className="rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-3">
            <div>
              <p className="text-[14px] font-semibold text-text-primary">{plan.label}</p>
              <p className="text-[12px] text-text-muted">{plan.kind === 'installment' ? `${money(plan.total || 0)} paid over weekly checks` : 'Every week'}{s.done ? ' · paid in full' : !plan.active ? ' · paused' : ''}</p>
            </div>
            <PlanTotals plan={plan} s={s} />
            <div className="divide-y divide-border-sub rounded-lg border border-border-sub">
              {s.weeks.slice(0, 12).map(w => (
                <div key={w.weekOf} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12px]">
                  <span className="flex-1 min-w-[120px] text-text-primary">Week of {w.weekOf}</span>
                  <span className="font-mono font-semibold text-text-primary">{w.entry ? money(w.entry.paid) : '—'}</span>
                  <WeekChip w={w} current={w.weekOf === current} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
