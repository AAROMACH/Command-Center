'use client';

import { fetchHelperJobsRetrying } from '@/lib/tech-assignments';
import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import type { WeeklyLog, WorkOrder } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { Activity, AlertTriangle, ArrowDown, ArrowUp, Filter, RotateCcw, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { isAssignedTo } from '@/lib/jobs';
import { median } from '@/lib/customer-intel';
import { statusTone, TONE_TEXT } from '@/lib/status-styles';
import { buildTechJobRows, PAY_STATUS_LABELS, type PayStatus, type TechJobRow } from '@/lib/tech-intel';
import { HBars, Tip } from '@/app/admin/analytics/components/customer-dashboard';
import { JobDetailDialog } from '@/components/job-detail-dialog';
import { usePaged, ListPager, PAGE_SIZES_LARGE } from '@/components/list-pager';

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
    const unsubHelped = onSnapshot(
      query(collection(db, 'assignments'), where('additionalTechnicianIds', 'array-contains', userId)),
      (snap) => { helped = snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)); publish(); },
      // Query refused → read helper jobs server-side instead.
      () => { fetchHelperJobsRetrying().then(j => { helped = j; publish(); }).catch(() => { helped = []; publish(); }); }
    );
    const unsubAssignments = () => { unsubLed(); unsubHelped(); };

    return () => { unsubLogs(); unsubAssignments(); };
  }, []);

  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);
  const set = (patch: Partial<Filters>) => setF(prev => ({ ...prev, ...patch }));
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const sortBy = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(k === 'title' || k === 'customer' ? 1 : -1); }
  };
  const [openJob, setOpenJob] = useState<WorkOrder | null>(null);

  const jobsById = useMemo(() => new Map(assignments.map(a => [a.id, a])), [assignments]);
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
  const approved = sel.filter(r => r.payStatus === 'approved');
  const awaiting = sel.filter(r => r.payStatus === 'submitted' || r.payStatus === 'draft');
  const notFiled = sel.filter(r => r.payStatus === 'not-filed');
  const completed = sel.filter(r => r.status === 'completed');
  const paidCompleted = completed.filter(r => !r.estimated);
  const med = median(paidCompleted.map(r => r.pay));
  const helperCount = sel.filter(r => r.role === 'helper').length;
  const kpis = [
    { label: 'Approved pay', value: money(sum(approved)), sub: `${count(approved.length)} job${approved.length === 1 ? '' : 's'}`, tone: 'text-text-green' },
    { label: 'Awaiting approval', value: money(sum(awaiting)), sub: `${count(awaiting.length)} on submitted / draft logs`, tone: 'text-accent-gold' },
    { label: 'Not filed yet', value: count(notFiled.length), sub: notFiled.length ? `~${money(sum(notFiled))} once logged` : 'all completed jobs are on a log', tone: notFiled.length ? 'text-brand-red' : 'text-text-primary' },
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
      if (r.payStatus === 'approved') e.approved += r.pay; else e.pending += r.pay;
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

  // History table
  const q = f.search.trim().toLowerCase();
  const table = useMemo(() => sel
    .filter(r => !q || r.title.toLowerCase().includes(q) || r.customer.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
    .sort((a, b) => {
      const va = a[sortKey] ?? '', vb = b[sortKey] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') return sortDir * (va - vb);
      return sortDir * String(va).localeCompare(String(vb));
    }), [sel, q, sortKey, sortDir]);
  const pager = usePaged(table, PAGE_SIZES_LARGE, 'tech-activity-jobs', [f, sortKey, sortDir]);

  const pendingVerification = useMemo(() => weeklyLogs.flatMap(l => l.items || []).filter(i => !i.confirmationStatus).length, [weeklyLogs]);
  const isDefault = JSON.stringify(f) === JSON.stringify(DEFAULT_FILTERS);

  if (!mounted) return null;

  const label = 'text-[10px] font-bold uppercase tracking-wider text-text-muted';
  const control = 'h-8 bg-bg-primary border-border-main text-[10px] font-bold';
  const pick = (k: 'customer' | 'type', v: string) => set({ [k]: f[k] === v ? null : v } as Partial<Filters>);

  return (
    <div className="space-y-5 text-left">
      <header className="page-header text-left">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2"><Activity size={12} /> Overview</p>
          <h1 className="page-title text-left">Activity</h1>
          <p className="page-subtitle text-left">Your jobs, your pay and your history — filter any way you like.</p>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 p-3 bg-bg-secondary/60 border border-border-sub rounded-xl">
        <div className="flex items-center gap-2 shrink-0 self-center"><Filter size={12} className="text-text-muted" /><span className={label}>Filters</span></div>
        <label className="flex flex-col gap-1"><span className={label}>From</span>
          <Input type="date" className={cn(control, 'w-[145px]')} value={f.start ?? ''} max={f.end ?? undefined} onChange={e => set({ start: e.target.value || null })} /></label>
        <label className="flex flex-col gap-1"><span className={label}>To</span>
          <Input type="date" className={cn(control, 'w-[145px]')} value={f.end ?? ''} min={f.start ?? undefined} onChange={e => set({ end: e.target.value || null })} /></label>
        <div className="flex flex-col gap-1"><span className={label}>Customer</span>
          <Select value={f.customer ?? 'all'} onValueChange={v => set({ customer: v === 'all' ? null : v })}>
            <SelectTrigger className={cn(control, 'w-[170px]')}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-bg-elevated border-border-main">
              <SelectItem value="all" className="text-[10px] font-bold">All customers</SelectItem>
              {customers.map(c => <SelectItem key={c} value={c} className="text-[10px] font-bold">{c}</SelectItem>)}
            </SelectContent>
          </Select></div>
        <div className="flex flex-col gap-1"><span className={label}>Type of work</span>
          <Select value={f.type ?? 'all'} onValueChange={v => set({ type: v === 'all' ? null : v })}>
            <SelectTrigger className={cn(control, 'w-[160px]')}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-bg-elevated border-border-main">
              <SelectItem value="all" className="text-[10px] font-bold">All types</SelectItem>
              {types.map(t => <SelectItem key={t} value={t} className="text-[10px] font-bold">{t}</SelectItem>)}
            </SelectContent>
          </Select></div>
        <div className="flex flex-col gap-1"><span className={label}>Jobs</span>
          <Select value={f.job} onValueChange={v => set({ job: v as Filters['job'] })}>
            <SelectTrigger className={cn(control, 'w-[130px]')}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-bg-elevated border-border-main">
              <SelectItem value="all" className="text-[10px] font-bold">All jobs</SelectItem>
              <SelectItem value="completed" className="text-[10px] font-bold">Completed</SelectItem>
              <SelectItem value="open" className="text-[10px] font-bold">Open / upcoming</SelectItem>
            </SelectContent>
          </Select></div>
        <div className="flex flex-col gap-1"><span className={label}>Pay status</span>
          <Select value={f.pay ?? 'all'} onValueChange={v => set({ pay: v === 'all' ? null : v as PayStatus })}>
            <SelectTrigger className={cn(control, 'w-[140px]')}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-bg-elevated border-border-main">
              <SelectItem value="all" className="text-[10px] font-bold">Any</SelectItem>
              {(Object.keys(PAY_STATUS_LABELS) as PayStatus[]).map(p => <SelectItem key={p} value={p} className="text-[10px] font-bold">{PAY_STATUS_LABELS[p]}</SelectItem>)}
            </SelectContent>
          </Select></div>
        {f.customer && (
          <button onClick={() => set({ customer: null })} className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-500 text-[10px] font-bold">
            {f.customer} <X size={11} />
          </button>
        )}
        {!isDefault && (
          <button onClick={() => setF(DEFAULT_FILTERS)} className="h-8 px-3 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-red hover:underline">
            <RotateCcw size={11} /> Reset
          </button>
        )}
      </div>

      {pendingVerification > 0 && (
        <div className="p-3 rounded-lg bg-accent-gold-dim border border-accent-gold/30 flex items-center gap-2">
          <AlertTriangle size={12} className="text-accent-gold shrink-0" />
          <p className="text-[10px] font-bold text-accent-gold">{pendingVerification} job{pendingVerification === 1 ? '' : 's'} on your logs waiting for you to confirm — open Logs to review.</p>
        </div>
      )}

      {all.length === 0 ? (
        <Card className="bg-bg-secondary border-border-main"><CardContent className="py-16 text-center text-[11px] font-bold text-text-muted">No jobs yet — your history fills in as you're assigned work.</CardContent></Card>
      ) : (<>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {kpis.map(k => (
            <Card key={k.label} className="bg-bg-secondary border-border-main">
              <CardContent className="p-4 min-w-0">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider truncate">{k.label}</p>
                <p className={cn('text-xl font-black tabular-nums truncate', k.tone)}>{k.value}</p>
                <p className="text-[10px] text-text-muted truncate">{k.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card className="bg-bg-secondary border-border-main min-w-0 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold tracking-wide">Pay by month</CardTitle>
              <CardDescription className="text-[10px]">{f.customer ? `${f.customer} — ` : ''}by work date. Green = approved; gold = submitted, draft or not filed yet.</CardDescription>
            </CardHeader>
            <CardContent>
              {monthly.length === 0 ? <p className="py-12 text-center text-[11px] text-text-muted">No completed jobs in this view.</p> : (
                <ChartContainer config={{ approved: { label: 'Approved', color: 'var(--text-green)' }, pending: { label: 'Pending', color: 'var(--accent-gold)' } } satisfies ChartConfig} className="w-full h-[260px]">
                  <BarChart data={monthly} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} className="text-[11px]" tickFormatter={monthLabel} minTickGap={8} />
                    <YAxis tickLine={false} axisLine={false} className="text-[11px]" tickFormatter={v => `$${v}`} width={48} />
                    <Tooltip cursor={{ opacity: 0.1 }} content={({ payload }) => {
                      const d = payload?.[0]?.payload as { month: string; approved: number; pending: number } | undefined;
                      return d ? <Tip title={monthLabel(d.month)} lines={[`${money(d.approved)} approved`, `${money(d.pending)} pending`]} /> : null;
                    }} />
                    <Bar dataKey="approved" stackId="p" fill="var(--color-approved)" />
                    <Bar dataKey="pending" stackId="p" fill="var(--color-pending)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
          <Card className="bg-bg-secondary border-border-main min-w-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold tracking-wide">Pay by customer</CardTitle>
              <CardDescription className="text-[10px]">Tap a customer to focus the page on them.</CardDescription>
            </CardHeader>
            <CardContent><HBars items={byCustomer} fmt={money} selected={f.customer} onPick={c => pick('customer', c)} color="var(--brand-red)" empty="No completed jobs in this view." /></CardContent>
          </Card>
          <Card className="bg-bg-secondary border-border-main min-w-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold tracking-wide">Pay by type of work</CardTitle>
              <CardDescription className="text-[10px]">Tap a type to filter by it.</CardDescription>
            </CardHeader>
            <CardContent><HBars items={byType} fmt={money} selected={f.type} onPick={t => pick('type', t)} color="var(--accent-gold)" empty="No completed jobs in this view." /></CardContent>
          </Card>
        </div>

        <Card className="bg-bg-secondary border-border-main">
          <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-sm font-bold tracking-wide">Job history</CardTitle>
              <CardDescription className="text-[10px]">{count(table.length)} job{table.length === 1 ? '' : 's'} · tap a job to open it · ~ = estimate until it's on a log</CardDescription>
            </div>
            <div className="relative w-full sm:w-[240px]">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <Input value={f.search} onChange={e => set({ search: e.target.value })} placeholder="Search job, customer or #" className="h-8 pl-7 bg-bg-primary border-border-main text-[11px]" />
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-[11px] tabular-nums">
              <thead>
                <tr className="border-b border-border-sub">
                  {([
                    ['date', 'Date', ''], ['title', 'Job', ''], ['customer', 'Customer', 'hidden md:table-cell'], ['type', 'Type', 'hidden lg:table-cell'],
                    ['status', 'Status', 'hidden sm:table-cell'], ['pay', 'My pay', ''], ['payStatus', 'Pay status', ''],
                  ] as [SortKey, string, string][]).map(([k, text, cls]) => (
                    <th key={k} className={cn('px-3 py-2 font-bold uppercase tracking-wider text-[10px] text-text-muted', k === 'pay' ? 'text-right' : 'text-left', cls)}
                      aria-sort={k === sortKey ? (sortDir > 0 ? 'ascending' : 'descending') : 'none'}>
                      <button onClick={() => sortBy(k)} className="inline-flex items-center gap-1 hover:text-text-primary">
                        {text}{k === sortKey && (sortDir > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pager.items.map(r => (
                  <tr key={r.id} onClick={() => setOpenJob(jobsById.get(r.id) || null)} className="border-b border-border-sub/60 cursor-pointer hover:bg-bg-tertiary/40">
                    <td className="px-3 py-2 whitespace-nowrap">{dayLabel(r.date)}</td>
                    <td className="px-3 py-2 max-w-[220px]">
                      <p className="font-bold text-text-primary truncate">{r.title}</p>
                      <p className="text-[11px] text-text-muted truncate md:hidden">{r.customer}</p>
                      {r.role === 'helper' && <span className="text-[10px] font-bold text-text-muted">Helper</span>}
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell max-w-[180px] truncate">{r.customer}</td>
                    <td className="px-3 py-2 hidden lg:table-cell max-w-[160px] truncate">{r.type}</td>
                    <td className="px-3 py-2 hidden sm:table-cell capitalize whitespace-nowrap">{r.status.replace('-', ' ')}</td>
                    <td className={cn('px-3 py-2 text-right whitespace-nowrap font-bold', r.estimated ? 'text-text-muted' : 'text-text-primary')}>
                      {r.pay || !r.estimated ? `${r.estimated ? '~' : ''}${money(r.pay)}` : '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={cn('text-[11px] font-bold', PAY_TONE[r.payStatus])}>{PAY_STATUS_LABELS[r.payStatus]}</span>
                      {r.disputed && <span className="ml-1 text-[11px] font-bold text-brand-red">· Disputed</span>}
                    </td>
                  </tr>
                ))}
                {table.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-text-muted">No jobs match.</td></tr>}
              </tbody>
            </table>
          </CardContent>
          <div className="px-3 pb-3"><ListPager pager={pager} noun="jobs" /></div>
        </Card>
        <p className="text-[10px] text-text-muted">
          My pay = what you're paid for the job: your weekly-log amount (Field Nation jobs pay 50% after the platform fee). Jobs not on a log show an estimate (~); helper jobs are priced by payroll. Time on site isn't shown — Field Nation hours aren't available to the app.
        </p>
      </>)}

      {openJob && <JobDetailDialog isOpen={!!openJob} setIsOpen={(o) => { if (!o) setOpenJob(null); }} mission={openJob} />}
    </div>
  );
}

type SortKey = 'date' | 'title' | 'customer' | 'type' | 'status' | 'pay' | 'payStatus';
type Filters = {
  start: string | null; end: string | null; customer: string | null; type: string | null;
  job: 'all' | 'completed' | 'open'; pay: PayStatus | null; search: string;
};
const DEFAULT_FILTERS: Filters = { start: null, end: null, customer: null, type: null, job: 'all', pay: null, search: '' };
// Shared status colors (lib/status-styles.ts).
const PAY_TONE = Object.fromEntries((Object.keys(PAY_STATUS_LABELS) as PayStatus[]).map(p => [p, TONE_TEXT[statusTone('pay', p)]])) as Record<PayStatus, string>;
const money = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 });
const count = (v: number) => v.toLocaleString('en-US');
const monthLabel = (ym: string) => new Date(`${ym}-01T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
const dayLabel = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—');
