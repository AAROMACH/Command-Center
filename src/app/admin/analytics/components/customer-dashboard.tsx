'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { ArrowDown, ArrowUp, Filter, RotateCcw, Search, X } from 'lucide-react';
import { onSharedSnapshot } from '@/lib/shared-snapshot';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { Invoice, Technician, TripLog, WeeklyLog, WorkOrder } from '@/lib/types';
import {
    buildIntelRows, byCustomer, inIntelFilter, median, rateParts,
    type CustomerRow, type IntelFilter,
} from '@/lib/customer-intel';

/**
 * Intel tab: customer work-order dashboard on live data — which customers
 * bring in the most net pay, and which pay best per hour on site. Clicking a
 * customer focuses the KPIs, monthly and type charts on them; the customer
 * comparisons (top chart, scatter, table) keep the other filters only.
 */

type Metric = 'net' | 'jobs' | 'rate' | 'avg' | 'total' | 'profit' | 'profitRate';
type SortKey = keyof Pick<CustomerRow, 'buyer' | 'jobs' | 'net' | 'share' | 'avg' | 'hours' | 'rate' | 'profit' | 'profitRate' | 'feePct' | 'last' | 'mainType'>;
type Params = IntelFilter & { minJobs: number; capHours: boolean; metric: Metric };

const DEFAULTS: Params = { start: null, end: null, type: null, provider: null, buyer: null, minJobs: 1, capHours: true, metric: 'net' };
const STORE_KEY = 'cc:intel:customers';

const money = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 });
const compact = (v: number) => '$' + new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
const big = (v: number) => (Math.abs(v) >= 10000 ? compact(v) : money(v));
const count = (v: number) => v.toLocaleString('en-US');
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const day = (iso: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const month = (ym: string) => new Date(`${ym}-01T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

const METRICS: Record<Metric, { label: string; fmt: (v: number) => string }> = {
    net: { label: 'Net pay', fmt: big },
    jobs: { label: 'Jobs', fmt: count },
    rate: { label: 'Net per hour', fmt: money },
    avg: { label: 'Avg net per job', fmt: money },
    total: { label: 'Gross pay', fmt: big },
    profit: { label: 'Profit after tech pay', fmt: big },
    profitRate: { label: 'Profit per hour', fmt: money },
};
const HOURLY: Metric[] = ['rate', 'profitRate'];

const label = 'text-[10px] font-bold uppercase tracking-wider text-text-muted';
const control = 'h-8 bg-bg-primary border-border-main text-[10px] font-bold';

export function CustomerDashboard({ jobs, weeklyLogs, invoices, technicians, onFilteredJobIds }: {
    jobs: WorkOrder[];
    weeklyLogs: WeeklyLog[];
    invoices: Invoice[];
    technicians: Technician[];
    /** Job ids in the focused view — drives the density map. */
    onFilteredJobIds?: (ids: Set<string>) => void;
}) {
    const [trips, setTrips] = useState<TripLog[]>([]);
    useEffect(() => onSharedSnapshot('tripLogs', snap => setTrips(snap.docs.map(d => ({ ...d.data(), id: d.id } as TripLog)))), []);

    // Saved filters load after mount (the server render has no localStorage,
    // so reading it in the initializer would mismatch on hydration).
    const [p, setP] = useState<Params>(DEFAULTS);
    const [restored, setRestored] = useState(false);
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
            if (saved && typeof saved === 'object') setP({ ...DEFAULTS, ...saved });
        } catch { /* private mode / bad JSON */ }
        setRestored(true);
    }, []);
    useEffect(() => {
        if (!restored) return;
        try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch { /* private mode */ }
    }, [p, restored]);
    const set = (patch: Partial<Params>) => setP(prev => ({ ...prev, ...patch }));
    const pickBuyer = (b: string) => set({ buyer: p.buyer === b ? null : b });

    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('net');
    const [sortDir, setSortDir] = useState<1 | -1>(-1);
    const sortBy = (k: SortKey) => {
        if (k === sortKey) setSortDir(d => (d === 1 ? -1 : 1));
        else { setSortKey(k); setSortDir(k === 'buyer' || k === 'mainType' ? 1 : -1); }
    };

    const nameById = useMemo(() => new Map(technicians.map(t => [t.id, t.name])), [technicians]);
    const all = useMemo(
        () => buildIntelRows(jobs, weeklyLogs, invoices, trips, id => nameById.get(id)),
        [jobs, weeklyLogs, invoices, trips, nameById],
    );
    const types = useMemo(() => [...new Set(all.map(r => r.type))].sort(), [all]);
    const providers = useMemo(() => [...new Set(all.map(r => r.provider))].sort(), [all]);
    // A saved type/technician that no longer exists (renamed tech, retyped
    // jobs) would blank the Select and filter out every row — drop it.
    useEffect(() => {
        if (!all.length) return;
        const patch: Partial<Params> = {};
        if (p.type && !types.includes(p.type)) patch.type = null;
        if (p.provider && !providers.includes(p.provider)) patch.provider = null;
        if (Object.keys(patch).length) setP(prev => ({ ...prev, ...patch }));
    }, [all.length, types, providers, p.type, p.provider]);

    const cap = p.capHours;
    const minJobs = Math.max(1, Math.floor(p.minJobs) || 1);
    const base = useMemo(() => all.filter(r => inIntelFilter(r, p, true)), [all, p]);
    const sel = useMemo(() => (p.buyer ? base.filter(r => r.buyer === p.buyer) : base), [base, p.buyer]);
    const custsAll = useMemo(() => byCustomer(base, cap), [base, cap]);
    const custs = useMemo(() => custsAll.filter(c => c.jobs >= minJobs || c.buyer === p.buyer), [custsAll, minJobs, p.buyer]);

    useEffect(() => { onFilteredJobIds?.(new Set(sel.map(r => r.id))); }, [sel, onFilteredJobIds]);

    // KPIs (focused set)
    const net = sel.reduce((s, r) => s + r.net, 0);
    const gross = sel.reduce((s, r) => s + r.total, 0);
    const fees = sel.reduce((s, r) => s + r.fees, 0);
    const profit = sel.reduce((s, r) => s + r.profit, 0);
    const rp = rateParts(sel, cap);
    const nCust = new Set(sel.map(r => r.buyer)).size;
    const repeat = custsAll.filter(c => c.jobs >= 5).length;
    const med = median(sel.map(r => r.net));
    const kpis = [
        { label: 'Net pay', value: big(net), sub: `${big(gross)} gross` },
        { label: 'Work orders', value: count(sel.length), sub: p.buyer ? `of ${count(base.length)} in view` : `${count(sel.filter(r => !r.approved).length)} pending approval` },
        { label: 'Customers', value: count(nCust), sub: p.buyer ? 'focused' : `${count(repeat)} with 5+ jobs` },
        { label: 'Avg net per job', value: sel.length ? money(net / sel.length) : '—', sub: med != null ? `median ${money(med)}` : '' },
        { label: 'Net per hour on site', value: rp.rate != null ? money(rp.rate) : '—', sub: rp.hours ? `over ${count(Math.round(rp.hours))} h logged` : 'no hours logged' },
        { label: 'Platform fees', value: gross ? pct(fees / gross) : '—', sub: `${big(fees)} of gross` },
        { label: 'Profit after tech pay', value: big(profit), sub: gross ? `${pct(profit / gross)} margin · ${big(net - profit)} tech pay` : '' },
        { label: 'Profit per hour on site', value: rp.profitRate != null ? money(rp.profitRate) : '—', sub: rp.hours ? 'same jobs as net per hour' : 'no hours logged' },
    ];

    // Takeaway
    const ranked = useMemo(() => [...custsAll].sort((a, b) => b.net - a.net), [custsAll]);
    let takeaway = 'No completed work orders match these filters.';
    if (base.length && p.buyer) {
        const c = custsAll.find(d => d.buyer === p.buyer);
        const rank = ranked.findIndex(d => d.buyer === p.buyer) + 1;
        takeaway = c
            ? `${p.buyer}: #${rank} of ${count(ranked.length)} customers by net pay — ${count(c.jobs)} jobs, ${money(c.net)} net (${pct(c.share)} of total), ${c.rate != null ? `${money(c.rate)}/hr` : 'no hours logged'}.`
            : `${p.buyer} has no work orders under these filters.`;
    } else if (base.length) {
        const top5 = ranked.slice(0, 5).reduce((s, d) => s + d.net, 0) / (ranked.reduce((s, d) => s + d.net, 0) || 1);
        const t = ranked[0];
        takeaway = `${t.buyer} leads with ${money(t.net)} net over ${count(t.jobs)} jobs. The top 5 customers bring in ${pct(top5)} of net pay across ${count(ranked.length)} customers.`;
    }

    // Top customers
    const metric = METRICS[p.metric] ? p.metric : 'net';
    const hourly = HOURLY.includes(metric);
    const pool = hourly ? custs.filter(c => c.rate != null && c.jobs >= Math.max(5, minJobs) && c.hours >= 5) : custs;
    const top = [...pool].sort((a, b) => (b[metric] ?? -1) - (a[metric] ?? -1)).slice(0, 15)
        .map(c => ({ key: c.buyer, value: c[metric] ?? 0, tip: `${count(c.jobs)} jobs · ${money(c.net)} net · ${money(c.profit)} profit · ${c.rate != null ? `${money(c.rate)}/hr net, ${money(c.profitRate ?? 0)}/hr profit` : 'no hours'} · ${pct(c.share)} of net` }));

    // Scatter: volume vs hourly return
    const scatterPts = useMemo(() => {
        const pts = custs.filter(c => c.rate != null && c.jobs >= 3 && c.hours >= 2);
        const top5 = new Set([...pts].sort((a, b) => b.net - a.net).slice(0, 5).map(c => c.buyer));
        return pts.map(c => ({ ...c, label: top5.has(c.buyer) || c.buyer === p.buyer ? c.buyer : '' }));
    }, [custs, p.buyer]);
    const medJobs = median(scatterPts.map(c => c.jobs));
    const medRate = median(scatterPts.map(c => c.rate as number));
    const rateMax = useMemo(() => {
        // Clip a few extreme $/hr outliers so the bulk stays readable.
        const r = scatterPts.map(c => c.rate as number).sort((a, b) => a - b);
        return r.length ? Math.ceil(r[Math.min(r.length - 1, Math.floor(r.length * 0.97))] * 1.1) : 100;
    }, [scatterPts]);

    // Monthly + by type (focused set)
    const monthly = useMemo(() => {
        const m = new Map<string, number>();
        for (const r of sel) if (r.date) m.set(r.date.slice(0, 7), (m.get(r.date.slice(0, 7)) || 0) + r.net);
        return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([ym, v]) => ({ month: ym, net: Math.round(v) }));
    }, [sel]);
    const byType = useMemo(() => {
        const m = new Map<string, { net: number; jobs: number }>();
        for (const r of sel) { const s = m.get(r.type) || { net: 0, jobs: 0 }; s.net += r.net; s.jobs += 1; m.set(r.type, s); }
        return [...m.entries()].map(([key, s]) => ({ key, value: s.net, jobs: s.jobs })).sort((a, b) => b.value - a.value).slice(0, 12);
    }, [sel]);

    // Table
    const q = search.trim().toLowerCase();
    const tableRows = custs.filter(c => !q || c.buyer.toLowerCase().includes(q)).sort((a, b) => {
        const va = a[sortKey], vb = b[sortKey];
        if (typeof va === 'string' || typeof vb === 'string') return sortDir * String(va ?? '').localeCompare(String(vb ?? ''));
        return sortDir * ((va ?? -Infinity) - (vb ?? -Infinity));
    });
    const maxNet = Math.max(1, ...custs.map(c => c.net));

    const isDefault = JSON.stringify({ ...p }) === JSON.stringify(DEFAULTS);
    const empty = all.length === 0;

    return (
        <div className="space-y-5 text-left">
            {/* Filters */}
            <div className="flex flex-wrap items-end gap-3 p-3 bg-bg-secondary/60 border border-border-sub rounded-xl">
                <div className="flex items-center gap-2 shrink-0 self-center">
                    <Filter size={12} className="text-text-muted" />
                    <span className={label}>Filters</span>
                </div>
                <label className="flex flex-col gap-1">
                    <span className={label}>Work date from</span>
                    <Input type="date" className={cn(control, 'w-[150px]')} value={p.start ?? ''} max={p.end ?? undefined} onChange={e => set({ start: e.target.value || null })} />
                </label>
                <label className="flex flex-col gap-1">
                    <span className={label}>To</span>
                    <Input type="date" className={cn(control, 'w-[150px]')} value={p.end ?? ''} min={p.start ?? undefined} onChange={e => set({ end: e.target.value || null })} />
                </label>
                <div className="flex flex-col gap-1">
                    <span className={label}>Type of work</span>
                    <Select value={p.type ?? 'all'} onValueChange={v => set({ type: v === 'all' ? null : v })}>
                        <SelectTrigger className={cn(control, 'w-[170px]')}><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-bg-elevated border-border-main">
                            <SelectItem value="all" className="text-[10px] font-bold">All types</SelectItem>
                            {types.map(t => <SelectItem key={t} value={t} className="text-[10px] font-bold">{t}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex flex-col gap-1">
                    <span className={label}>Technician</span>
                    <Select value={p.provider ?? 'all'} onValueChange={v => set({ provider: v === 'all' ? null : v })}>
                        <SelectTrigger className={cn(control, 'w-[170px]')}><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-bg-elevated border-border-main">
                            <SelectItem value="all" className="text-[10px] font-bold">All technicians</SelectItem>
                            {providers.map(t => <SelectItem key={t} value={t} className="text-[10px] font-bold">{t}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <label className="flex flex-col gap-1">
                    <span className={label}>Min. jobs per customer</span>
                    <Input type="number" min={1} step={1} className={cn(control, 'w-[90px]')} value={p.minJobs}
                        onChange={e => set({ minJobs: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
                </label>
                <label className="flex items-center gap-2 h-8 cursor-pointer">
                    <Checkbox checked={p.capHours} onCheckedChange={v => set({ capHours: v === true })} />
                    <span className="text-[10px] font-bold text-text-secondary">Skip jobs logged over 24 h in $/hr</span>
                </label>
                {p.buyer && (
                    <button onClick={() => set({ buyer: null })}
                        className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-500 text-[10px] font-bold">
                        {p.buyer} <X size={11} />
                    </button>
                )}
                {!isDefault && (
                    <button onClick={() => { setSearch(''); setP(DEFAULTS); }}
                        className="h-8 px-3 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-red hover:underline">
                        <RotateCcw size={11} /> Reset
                    </button>
                )}
            </div>

            {empty ? (
                <Card className="bg-bg-secondary border-border-main">
                    <CardContent className="py-16 text-center text-[11px] font-bold text-text-muted">
                        No completed jobs yet — the dashboard fills in as jobs are completed.
                    </CardContent>
                </Card>
            ) : (<>
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {kpis.map(k => (
                        <Card key={k.label} className="bg-bg-secondary border-border-main">
                            <CardContent className="p-4 min-w-0">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider truncate">{k.label}</p>
                                <p className="text-xl font-black text-text-primary tabular-nums truncate">{k.value}</p>
                                <p className="text-[10px] text-text-muted truncate">{k.sub}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
                <p className="text-sm text-text-secondary">{takeaway}</p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <Card className="bg-bg-secondary border-border-main min-w-0">
                        <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3 space-y-0">
                            <div>
                                <CardTitle className="text-sm font-bold tracking-wide">Top customers</CardTitle>
                                <CardDescription className="text-[10px]">
                                    {hourly ? 'Customers with 5+ jobs and 5+ logged hours. ' : ''}Click a bar to focus the page on that customer.
                                </CardDescription>
                            </div>
                            <Select value={metric} onValueChange={v => set({ metric: v as Metric })}>
                                <SelectTrigger className={cn(control, 'w-[150px] shrink-0')}><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-bg-elevated border-border-main">
                                    {(Object.keys(METRICS) as Metric[]).map(m => <SelectItem key={m} value={m} className="text-[10px] font-bold">{METRICS[m].label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </CardHeader>
                        <CardContent>
                            <HBars items={top} fmt={METRICS[metric].fmt} selected={p.buyer} onPick={pickBuyer} color="var(--brand-red)" empty="No customers match these filters." />
                        </CardContent>
                    </Card>

                    <Card className="bg-bg-secondary border-border-main min-w-0">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold tracking-wide">Volume vs. hourly return</CardTitle>
                            <CardDescription className="text-[10px]">Customers with 3+ jobs and 2+ logged hours. Dot size = net pay; dashed lines = medians. Click a dot to focus.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {scatterPts.length < 2 ? (
                                <p className="py-16 text-center text-[11px] text-text-muted">Not enough logged on-site hours yet. Hours come from check-in → check-out on each trip.</p>
                            ) : (
                                <ChartContainer config={{ rate: { label: 'Net per hour', color: 'var(--accent-gold)' } } satisfies ChartConfig} className="w-full h-[380px]">
                                    <ScatterChart margin={{ top: 16, right: 24, bottom: 16, left: 4 }}>
                                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                        <XAxis type="number" dataKey="jobs" name="Jobs" scale="log" domain={[Math.max(1, Math.min(...scatterPts.map(c => c.jobs)) * 0.8), 'auto']} allowDataOverflow
                                            tickLine={false} className="text-[11px]" label={{ value: 'Jobs (log scale)', position: 'insideBottom', offset: -8, className: 'text-[11px] fill-current' }} />
                                        <YAxis type="number" dataKey="rate" name="Net/hr" domain={[0, rateMax]} allowDataOverflow tickLine={false} className="text-[11px]" tickFormatter={v => `$${v}`} width={44} />
                                        <ZAxis type="number" dataKey="net" range={[40, 420]} />
                                        {medJobs != null && <ReferenceLine x={medJobs} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="4 4" />}
                                        {medRate != null && <ReferenceLine y={medRate} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="4 4" />}
                                        <Tooltip cursor={false} content={({ payload }) => {
                                            const c = payload?.[0]?.payload as CustomerRow | undefined;
                                            return c ? <Tip title={c.buyer} lines={[`${count(c.jobs)} jobs · ${money(c.net)} net · ${money(c.profit)} profit`, `${c.rate != null ? money(c.rate) : '—'}/hr net · ${c.profitRate != null ? money(c.profitRate) : '—'}/hr profit over ${c.hours.toFixed(1)} h`]} /> : null;
                                        }} />
                                        <Scatter data={scatterPts} onClick={(d: { buyer?: string }) => d?.buyer && pickBuyer(d.buyer)} className="cursor-pointer">
                                            {scatterPts.map(c => (
                                                <Cell key={c.buyer} fill={c.buyer === p.buyer ? 'var(--brand-red)' : 'var(--accent-gold)'} fillOpacity={p.buyer && c.buyer !== p.buyer ? 0.3 : 0.75} />
                                            ))}
                                            <LabelList dataKey="label" position="right" className="text-[11px] font-bold fill-current" />
                                        </Scatter>
                                    </ScatterChart>
                                </ChartContainer>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-bg-secondary border-border-main min-w-0">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold tracking-wide">Net pay by month</CardTitle>
                            <CardDescription className="text-[10px]">{p.buyer ? `${p.buyer} — ` : ''}by work date.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {monthly.length === 0 ? (
                                <p className="py-16 text-center text-[11px] text-text-muted">No dated jobs in this view.</p>
                            ) : (
                                <ChartContainer config={{ net: { label: 'Net pay', color: 'var(--brand-red)' } } satisfies ChartConfig} className="w-full h-[300px]">
                                    <BarChart data={monthly} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                                        <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.15} />
                                        <XAxis dataKey="month" tickLine={false} axisLine={false} className="text-[11px]" tickFormatter={month} minTickGap={12} />
                                        <YAxis tickLine={false} axisLine={false} className="text-[11px]" tickFormatter={v => compact(v)} width={48} />
                                        <Tooltip cursor={{ opacity: 0.1 }} content={({ payload }) => {
                                            const d = payload?.[0]?.payload as { month: string; net: number } | undefined;
                                            return d ? <Tip title={month(d.month)} lines={[`${money(d.net)} net`]} /> : null;
                                        }} />
                                        <Bar dataKey="net" fill="var(--color-net)" radius={[3, 3, 0, 0]} />
                                    </BarChart>
                                </ChartContainer>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-bg-secondary border-border-main min-w-0">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold tracking-wide">Net pay by type of work</CardTitle>
                            <CardDescription className="text-[10px]">{p.buyer ? `${p.buyer} — ` : ''}click a type to filter the page by it.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <HBars
                                items={byType.map(t => ({ key: t.key, value: t.value, extra: `${count(t.jobs)} jobs · ${money(t.value / t.jobs)}/job`, tip: `${money(t.value)} net · ${count(t.jobs)} jobs` }))}
                                fmt={big} selected={p.type} onPick={t => set({ type: p.type === t ? null : t })} color="var(--accent-gold)" empty="No jobs in this view." />
                        </CardContent>
                    </Card>
                </div>

                {/* All customers */}
                <Card className="bg-bg-secondary border-border-main">
                    <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                        <div>
                            <CardTitle className="text-sm font-bold tracking-wide">All customers</CardTitle>
                            <CardDescription className="text-[10px]">{count(tableRows.length)} customer{tableRows.length === 1 ? '' : 's'} · click a row to focus</CardDescription>
                        </div>
                        <div className="relative w-full sm:w-[240px]">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customers" className="h-8 pl-7 bg-bg-primary border-border-main text-[11px]" />
                        </div>
                    </CardHeader>
                    <CardContent className="p-0 overflow-x-auto max-h-[560px] overflow-y-auto">
                        <table className="w-full text-[11px] tabular-nums">
                            <thead className="sticky top-0 bg-bg-secondary z-10">
                                <tr className="border-b border-border-sub">
                                    {([
                                        ['buyer', 'Customer', ''], ['jobs', 'Jobs', ''], ['net', 'Net pay', ''], ['share', 'Share', ''], ['avg', 'Avg/job', ''],
                                        ['hours', 'Hours', 'hidden md:table-cell'], ['rate', 'Net/hr', ''], ['profit', 'Profit', ''], ['profitRate', 'Profit/hr', 'hidden sm:table-cell'], ['feePct', 'Fees %', 'hidden md:table-cell'],
                                        ['last', 'Last job', 'hidden lg:table-cell'], ['mainType', 'Main work', 'hidden lg:table-cell'],
                                    ] as [SortKey, string, string][]).map(([k, text, cls]) => (
                                        <th key={k} className={cn('px-3 py-2 font-bold uppercase tracking-wider text-[10px] text-text-muted', k === 'buyer' || k === 'mainType' ? 'text-left' : 'text-right', cls)}
                                            aria-sort={k === sortKey ? (sortDir > 0 ? 'ascending' : 'descending') : 'none'}>
                                            <button onClick={() => sortBy(k)} className="inline-flex items-center gap-1 hover:text-text-primary">
                                                {text}{k === sortKey && (sortDir > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                                            </button>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {tableRows.map(c => (
                                    <tr key={c.buyer} onClick={() => pickBuyer(c.buyer)}
                                        className={cn('border-b border-border-sub/60 cursor-pointer hover:bg-bg-tertiary/40', c.buyer === p.buyer && 'bg-brand-red/10')}>
                                        <td className="px-3 py-2 text-left font-bold text-text-primary max-w-[220px] truncate">{c.buyer}</td>
                                        <td className="px-3 py-2 text-right">{count(c.jobs)}</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">
                                            <span className="inline-block h-2 mr-2 rounded-sm bg-brand-red/70 align-middle" style={{ width: Math.max(2, (48 * c.net) / maxNet) }} />
                                            {money(c.net)}
                                        </td>
                                        <td className="px-3 py-2 text-right">{pct(c.share)}</td>
                                        <td className="px-3 py-2 text-right">{money(c.avg)}</td>
                                        <td className="px-3 py-2 text-right hidden md:table-cell">{c.hours.toFixed(1)}</td>
                                        <td className="px-3 py-2 text-right">{c.rate != null ? money(c.rate) : '—'}</td>
                                        <td className={cn('px-3 py-2 text-right', c.profit < 0 && 'text-brand-red')}>{money(c.profit)}</td>
                                        <td className="px-3 py-2 text-right hidden sm:table-cell">{c.profitRate != null ? money(c.profitRate) : '—'}</td>
                                        <td className="px-3 py-2 text-right hidden md:table-cell">{pct(c.feePct)}</td>
                                        <td className="px-3 py-2 text-right hidden lg:table-cell whitespace-nowrap">{day(c.last)}</td>
                                        <td className="px-3 py-2 text-left hidden lg:table-cell max-w-[180px] truncate">{c.mainType}</td>
                                    </tr>
                                ))}
                                {tableRows.length === 0 && (
                                    <tr><td colSpan={12} className="px-3 py-10 text-center text-text-muted">No customers match.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
                <p className="text-[10px] text-text-muted">
                    Completed jobs only. Gross = paid invoice (pre-tax) or job pay; fees = Field Nation's 15.85% on imported jobs; net = gross − fees; profit = net − tech pay (weekly-log settlement, else the payroll formula).
                    Hours = on-site time from trip check-in to check-out. Pending approval = not yet on an approved weekly log.
                </p>
            </>)}
        </div>
    );
}

export function Tip({ title, lines }: { title: string; lines: string[] }) {
    return (
        <div className="rounded-md border border-border-main bg-bg-elevated px-3 py-2 shadow-xl text-[10px]">
            <p className="font-bold text-text-primary mb-0.5">{title}</p>
            {lines.map(l => <p key={l} className="text-text-muted">{l}</p>)}
        </div>
    );
}

/** Clickable horizontal bars (customer / type rankings). */
export function HBars({ items, fmt, selected, onPick, color, empty }: {
    items: { key: string; value: number; extra?: string; tip?: string }[];
    fmt: (v: number) => string;
    selected: string | null;
    onPick: (key: string) => void;
    color: string;
    empty: string;
}) {
    if (!items.length) return <p className="py-16 text-center text-[11px] text-text-muted">{empty}</p>;
    const max = Math.max(1e-9, ...items.map(i => i.value));
    return (
        <div className="space-y-1">
            {items.map(i => (
                <button key={i.key} onClick={() => onPick(i.key)} title={i.tip}
                    className={cn('w-full grid grid-cols-[minmax(0,38%)_1fr] items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-bg-tertiary/40',
                        selected && i.key !== selected && 'opacity-45', i.key === selected && 'bg-bg-tertiary/50')}>
                    <span className="truncate text-[11px] font-bold text-text-primary">{i.key}</span>
                    <span className="flex items-center gap-2 min-w-0">
                        <span className="h-4 rounded-sm shrink-0" style={{ width: `${Math.max(1, (70 * i.value) / max)}%`, background: color }} />
                        <span className="text-[10px] tabular-nums text-text-secondary whitespace-nowrap truncate">
                            {fmt(i.value)}{i.extra ? <span className="text-text-muted"> · {i.extra}</span> : null}
                        </span>
                    </span>
                </button>
            ))}
        </div>
    );
}
