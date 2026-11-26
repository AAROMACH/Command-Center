'use client';

import { subscribeHelperJobs } from '@/lib/tech-assignments';
import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import type { WeeklyLog, WorkOrder } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, AlertTriangle, Filter, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isAssignedTo } from '@/lib/jobs';
import { median } from '@/lib/customer-intel';
import { statusTone, TONE_TEXT } from '@/lib/status-styles';
import { buildTechJobRows, PAY_STATUS_LABELS, type PayStatus, type TechJobRow } from '@/lib/tech-intel';
import { HBars } from '@/components/chart-bits';
import dynamic from 'next/dynamic';
// recharts is heavy: the chart loads after the page, same-height placeholder meanwhile.
const PayChart = dynamic(() => import('./pay-chart'), { ssr: false, loading: () => <div className="h-[260px] w-full animate-pulse rounded-md bg-bg-tertiary/40" /> });
import { PageHeader } from '@/components/page-header';
import { MyPerformance } from './my-performance';
import { EmptyState, PageLoading } from '@/components/empty-state';

export default function TechActivityPage() {
  const [currentTechId, setCurrentTechId] = useState<string | null>(null);
  const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
  const [assignments, setAssignments] = useState<WorkOrder[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const userId = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('currentUserId') : null;
    setCurrentTechId(userId);

    if (!userId) return;

    const unsubLogs = onSnapshot(
      query(collection(db, 'weeklyLogs'), where('techId', '==', userId)),
      (snap) => setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)))
    );

    // Jobs they lead plus jobs they helped on.
    let led: WorkOrder[] = [];
    let helped: WorkOrder[] = [];
    const publish = () => {
      const merged = new Map<string, WorkOrder>();
      [...led, ...helped].forEach(j => merged.set(j.id, j));
      setAssignments([...merged.values()]);
    };
    const unsubLed = onSnapshot(
      query(collection(db, 'assignments'), where('techId', '==', userId)),
      (snap) => { led = snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)).filter(wo => isAssignedTo(wo, userId)); publish(); }
    );
    // Helper jobs: server copy, pay removed (helpers can't read the lead's job doc).
    const unsubHelped = subscribeHelperJobs(j => { helped = j; publish(); });
    const unsubAssignments = () => { unsubLed(); unsubHelped(); };

    return () => { unsubLogs(); unsubAssignments(); };
  }, []);

  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);
  const set = (patch: Partial<Filters>) => setF(prev => ({ ...prev, ...patch }));

  const all = useMemo(() => (currentTechId ? buildTechJobRows(assignments, weeklyLogs, currentTechId) : []), [assignments, weeklyLogs, currentTechId]);
  const customers = useMemo(() => [...new Set(all.map(r => r.customer))].sort(), [all]);
  const types = useMemo(() => [...new Set(all.map(r => r.type))].sort(), [all]);

  const matches = (r: TechJobRow, ignoreCustomer = false) => {
    if (f.start && (!r.date || r.date < f.start)) return false;
    if (f.end && (!r.date || r.date > f.end)) return false;
    if (!ignoreCustomer && f.customer && r.customer !== f.customer) return false;
    if (f.type && r.type !== f.type) return false;
    if (f.job === 'completed' && r.status !== 'completed') return false;
    if (f.job === 'open' && r.status === 'completed') return false;
    if (f.pay && r.payStatus !== f.pay) return false;
    return true;
  };
  const base = useMemo(() => all.filter(r => matches(r, true)), [all, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = useMemo(() => (f.customer ? base.filter(r => r.customer === f.customer) : base), [base, f.customer]);

  // KPIs
  const sum = (rows: TechJobRow[]) => rows.reduce((s, r) => s + r.pay, 0);
  const approved = sel.filter(r => r.payStatus === 'approved' || r.payStatus === 'paid' || r.payStatus === 'held');
  const paidRows = sel.filter(r => r.payStatus === 'paid');
  const awaiting = sel.filter(r => r.payStatus === 'submitted' || r.payStatus === 'draft');
  const notFiled = sel.filter(r => r.payStatus === 'not-filed');
  const completed = sel.filter(r => r.status === 'completed');
  const paidCompleted = completed.filter(r => !r.estimated);
  const med = median(paidCompleted.map(r => r.pay));
  const helperCount = sel.filter(r => r.role === 'helper').length;
  const kpis = [
    { label: 'Approved pay', value: money(sum(approved)), sub: `${count(approved.length)} job${approved.length === 1 ? '' : 's'} · ${money(sum(paidRows))} paid out`, tone: 'text-text-green' },
    { label: 'Awaiting approval', value: `≈ ${money(sum(awaiting))}`, sub: `${count(awaiting.length)} on submitted / draft logs`, tone: 'text-accent-gold' },
    { label: 'Not filed yet', value: count(notFiled.length), sub: notFiled.length ? `≈ ${money(sum(notFiled))} once logged` : 'all completed jobs are on a log', tone: notFiled.length ? 'text-brand-red' : 'text-text-primary' },
    { label: 'Completed jobs', value: count(completed.length), sub: helperCount ? `${count(helperCount)} as helper` : `${count(sel.length - completed.length)} open`, tone: 'text-text-primary' },
    { label: 'Avg pay per job', value: paidCompleted.length ? money(sum(paidCompleted) / paidCompleted.length) : '—', sub: med != null ? `median ${money(med)}` : 'no logged jobs yet', tone: 'text-text-primary' },
    { label: 'Customers', value: count(new Set(sel.map(r => r.customer)).size), sub: f.customer ? 'focused' : 'in this view', tone: 'text-text-primary' },
  ];

  // Charts
  const monthly = useMemo(() => {
    const m = new Map<string, { approved: number; pending: number }>();
    for (const r of sel) {
      if (!r.date || r.payStatus === 'upcoming') continue;
      const k = r.date.slice(0, 7);
      const e = m.get(k) || { approved: 0, pending: 0 };
      if (r.payStatus === 'approved' || r.payStatus === 'paid' || r.payStatus === 'held') e.approved += r.pay; else e.pending += r.pay;
      m.set(k, e);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12)
      .map(([month, v]) => ({ month, approved: Math.round(v.approved), pending: Math.round(v.pending) }));
  }, [sel]);
  const byCustomer = useMemo(() => {
    const m = new Map<string, { pay: number; jobs: number }>();
    for (const r of base) { if (r.payStatus === 'upcoming') continue; const e = m.get(r.customer) || { pay: 0, jobs: 0 }; e.pay += r.pay; e.jobs += 1; m.set(r.customer, e); }
    return [...m.entries()].map(([key, v]) => ({ key, value: v.pay, extra: `${count(v.jobs)} jobs`, tip: `${money(v.pay)} over ${count(v.jobs)} jobs` }))
      .sort((a, b) => b.value - a.value).slice(0, 10);
  }, [base]);
  const byType = useMemo(() => {
    const m = new Map<string, { pay: number; jobs: number }>();
    for (const r of sel) { if (r.payStatus === 'upcoming') continue; const e = m.get(r.type) || { pay: 0, jobs: 0 }; e.pay += r.pay; e.jobs += 1; m.set(r.type, e); }
    return [...m.entries()].map(([key, v]) => ({ key, value: v.pay, extra: `${count(v.jobs)} jobs · ${money(v.pay / v.jobs)}/job` }))
      .sort((a, b) => b.value - a.value).slice(0, 10);
  }, [sel]);


  const pendingVerification = useMemo(() => weeklyLogs.flatMap(l => l.items || []).filter(i => !i.confirmationStatus).length, [weeklyLogs]);
  const isDefault = JSON.stringify(f) === JSON.stringify(DEFAULT_FILTERS);

  if (!mounted) return <PageLoading label="Loading your activity…" />;

  const label = 'text-[10px] font-semibold uppercase tracking-wider text-text-muted';
  const control = 'h-11 sm:h-9 bg-bg-primary border-border-main text-[13px]';
  const pick = (k: 'customer' | 'type', v: string) => set({ [k]: f[k] === v ? null : v } as Partial<Filters>);

  return (
    <div className="space-y-5 text-left">
      <PageHeader eyebrow="Overview" icon={Activity} title="Insights" subtitle="Your performance, jobs, pay and history — filter any way you like." />

      <MyPerformance />

      {/* Filters */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-3 p-3 bg-bg-secondary border border-border-main rounded-xl shadow-sm">
        <div className="col-span-2 flex items-center gap-2 shrink-0 sm:self-center"><Filter size={12} className="text-text-muted" /><span className={label}>Filters</span></div>
        <label className="flex flex-col gap-1"><span className={label}>From</span>
          <Input type="date" className={cn(control, 'w-full sm:w-[150px]')} value={f.start ?? ''} max={f.end ?? undefined} onChange={e => set({ start: e.target.value || null })} /></label>
        <label className="flex flex-col gap-1"><span className={label}>To</span>
          <Input type="date" className={cn(control, 'w-full sm:w-[150px]')} value={f.end ?? ''} min={f.start ?? undefined} onChange={e => set({ end: e.target.value || null })} /></label>
        <div className="flex flex-col gap-1"><span className={label}>Customer</span>
          <Select value={f.customer ?? 'all'} onValueChange={v => set({ customer: v === 'all' ? null : v })}>
            <SelectTrigger className={cn(control, 'w-full sm:w-[170px]')}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-bg-elevated border-border-main">
              <SelectItem value="all" className="text-[13px]">All customers</SelectItem>
              {customers.map(c => <SelectItem key={c} value={c} className="text-[13px]">{c}</SelectItem>)}
            </SelectContent>
          </Select></div>
        <div className="flex flex-col gap-1"><span className={label}>Type of work</span>
          <Select value={f.type ?? 'all'} onValueChange={v => set({ type: v === 'all' ? null : v })}>
            <SelectTrigger className={cn(control, 'w-full sm:w-[160px]')}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-bg-elevated border-border-main">
              <SelectItem value="all" className="text-[13px]">All types</SelectItem>
              {types.map(t => <SelectItem key={t} value={t} className="text-[13px]">{t}</SelectItem>)}
            </SelectContent>
          </Select></div>
        <div className="flex flex-col gap-1"><span className={label}>Jobs</span>
          <Select value={f.job} onValueChange={v => set({ job: v as Filters['job'] })}>
            <SelectTrigger className={cn(control, 'w-full sm:w-[140px]')}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-bg-elevated border-border-main">
              <SelectItem value="all" className="text-[13px]">All jobs</SelectItem>
              <SelectItem value="completed" className="text-[13px]">Completed</SelectItem>
              <SelectItem value="open" className="text-[13px]">Open / upcoming</SelectItem>
            </SelectContent>
          </Select></div>
        <div className="flex flex-col gap-1"><span className={label}>Pay status</span>
          <Select value={f.pay ?? 'all'} onValueChange={v => set({ pay: v === 'all' ? null : v as PayStatus })}>
            <SelectTrigger className={cn(control, 'w-full sm:w-[150px]')}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-bg-elevated border-border-main">
              <SelectItem value="all" className="text-[13px]">Any</SelectItem>
              {(Object.keys(PAY_STATUS_LABELS) as PayStatus[]).map(p => <SelectItem key={p} value={p} className="text-[13px]">{PAY_STATUS_LABELS[p]}</SelectItem>)}
            </SelectContent>
          </Select></div>
        {f.customer && (
          <button onClick={() => set({ customer: null })} className="h-10 sm:h-8 px-3 inline-flex items-center gap-1.5 rounded-full border border-accent-gold/40 bg-accent-gold/10 text-accent-gold text-[12px] font-medium">
            {f.customer} <X size={11} />
          </button>
        )}
        {!isDefault && (
          <button onClick={() => setF(DEFAULT_FILTERS)} className="h-10 sm:h-8 px-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-red hover:underline">
            <RotateCcw size={11} /> Reset
          </button>
        )}
      </div>

      {pendingVerification > 0 && (
        <div className="p-3 rounded-xl bg-accent-gold-dim border border-accent-gold/30 flex items-center gap-2">
          <AlertTriangle size={14} className="text-accent-gold shrink-0" />
          <p className="text-[12px] font-medium text-accent-gold">{pendingVerification} job{pendingVerification === 1 ? '' : 's'} on your logs waiting for you to confirm — open Logs to review.</p>
        </div>
      )}

      {all.length === 0 ? (
        <EmptyState icon={Activity} title="No jobs yet" description="Your history fills in as you're assigned work." />
      ) : (<>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {kpis.map(k => (
            <Card key={k.label} className="rounded-xl bg-bg-secondary border-border-main shadow-sm">
              <CardContent className="p-4 min-w-0">
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider truncate">{k.label}</p>
                <p className={cn('text-2xl font-bold tabular-nums truncate', k.tone)}>{k.value}</p>
                <p className="text-[12px] text-text-muted truncate">{k.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card className="rounded-xl shadow-sm bg-bg-secondary border-border-main min-w-0 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Pay by month</CardTitle>
              <CardDescription className="text-[12px]">{f.customer ? `${f.customer} — ` : ''}by work date. Green = approved; gold = submitted, draft or not filed yet.</CardDescription>
            </CardHeader>
            <CardContent>
              {monthly.length === 0 ? <EmptyState compact title="No completed jobs in this view" /> : (
                <PayChart monthly={monthly} />
              )}
            </CardContent>
          </Card>
          <Card className="rounded-xl shadow-sm bg-bg-secondary border-border-main min-w-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Pay by customer</CardTitle>
              <CardDescription className="text-[12px]">Tap a customer to focus the page on them.</CardDescription>
            </CardHeader>
            <CardContent><HBars items={byCustomer} fmt={money} selected={f.customer} onPick={c => pick('customer', c)} color="var(--brand-red)" empty="No completed jobs in this view." /></CardContent>
          </Card>
          <Card className="rounded-xl shadow-sm bg-bg-secondary border-border-main min-w-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Pay by type of work</CardTitle>
              <CardDescription className="text-[12px]">Tap a type to filter by it.</CardDescription>
            </CardHeader>
            <CardContent><HBars items={byType} fmt={money} selected={f.type} onPick={t => pick('type', t)} color="var(--accent-gold)" empty="No completed jobs in this view." /></CardContent>
          </Card>
        </div>

        <p className="text-[12px] text-text-muted">
          My pay = what you're paid for the job: your weekly-log amount (Field Nation jobs pay 50% after the platform fee). Jobs not on a log are an estimate (≈); helper jobs are priced by payroll. Job by job, see Assignments → History. Time on site isn't shown — Field Nation hours aren't available to the app.
        </p>
      </>)}
    </div>
  );
}

type Filters = {
  start: string | null; end: string | null; customer: string | null; type: string | null;
  job: 'all' | 'completed' | 'open'; pay: PayStatus | null;
};
const DEFAULT_FILTERS: Filters = { start: null, end: null, customer: null, type: null, job: 'all', pay: null };
const money = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 });
const count = (v: number) => v.toLocaleString('en-US');
const monthLabel = (ym: string) => new Date(`${ym}-01T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
