'use client';

import { useEffect, useMemo, useState } from 'react';
import { onSharedSnapshot } from '@/lib/shared-snapshot';
import { StatCard } from '@/components/stat-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { FN_ROWS, type SavedFnRow } from '@/lib/fn-reports';
import { perfLines, perfSummary, type PerfStats } from '@/lib/fn-performance';
import type { Technician, WorkOrder } from '@/lib/types';

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n >= 1000 ? 0 : 2 }).format(n || 0);
const hrs = (n: number) => `${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })} h`;

const PERIODS = [
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
  { key: 'ytd', label: 'This year', days: 0 },
  { key: 'all', label: 'All saved', days: -1 },
] as const;
type PeriodKey = typeof PERIODS[number]['key'];

const COLS: { key: keyof PerfStats; label: string; fmt: (n: number) => string }[] = [
  { key: 'payPerHour', label: 'Avg hourly', fmt: money },
  { key: 'pay', label: 'Total pay', fmt: money },
  { key: 'payPerDay', label: 'Pay / day', fmt: money },
  { key: 'payPerWeek', label: 'Pay / week', fmt: money },
  { key: 'payPerMonth', label: 'Pay / month', fmt: money },
  { key: 'payPerYear', label: 'Pay / year', fmt: money },
  { key: 'hours', label: 'Hours', fmt: hrs },
  { key: 'hoursPerDay', label: 'Hrs / day', fmt: hrs },
  { key: 'hoursPerWeek', label: 'Hrs / week', fmt: hrs },
  { key: 'hoursPerMonth', label: 'Hrs / month', fmt: hrs },
  { key: 'hoursPerYear', label: 'Hrs / year', fmt: hrs },
  { key: 'jobs', label: 'Jobs', fmt: n => String(n) },
];

/**
 * Pay and hours from saved Field Nation reports: the tech's take-home share
 * (FN labor − fee, then the 50% split), averaged per hour and per day / week /
 * month / year actually worked. Company totals, then a sortable row per tech.
 */
export function PerformanceStats() {
  const [saved, setSaved] = useState<SavedFnRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [denied, setDenied] = useState(false);
  const [jobs, setJobs] = useState<{ pool: WorkOrder[]; asg: WorkOrder[] }>({ pool: [], asg: [] });
  const [people, setPeople] = useState<Technician[]>([]);
  const [period, setPeriod] = useState<PeriodKey>('90');
  const [sort, setSort] = useState<keyof PerfStats>('payPerHour');

  useEffect(() => {
    const u = [
      onSharedSnapshot(FN_ROWS, s => { setSaved(s.docs.map(d => ({ ...d.data(), id: d.id } as SavedFnRow))); setLoaded(true); }, () => { setDenied(true); setLoaded(true); }),
      onSharedSnapshot('workOrders', s => setJobs(j => ({ ...j, pool: s.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)) }))),
      onSharedSnapshot('assignments', s => setJobs(j => ({ ...j, asg: s.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)) }))),
      onSharedSnapshot('users', s => setPeople(s.docs.map(d => ({ ...d.data(), id: d.id } as Technician)))),
    ];
    return () => u.forEach(f => f());
  }, []);

  const lines = useMemo(() => perfLines(saved, [...jobs.pool, ...jobs.asg], people), [saved, jobs, people]);
  const { company, techs, from } = useMemo(() => {
    const p = PERIODS.find(x => x.key === period)!;
    const now = new Date();
    const from = p.days > 0 ? new Date(now.getTime() - p.days * 864e5).toISOString().slice(0, 10)
      : p.days === 0 ? `${now.getFullYear()}-01-01` : '';
    const inPeriod = from ? lines.filter(l => l.date >= from) : lines;
    return { ...perfSummary(inPeriod), from };
  }, [lines, period]);
  const sorted = useMemo(() => [...techs].sort((a, b) => (b[sort] as number) - (a[sort] as number)), [techs, sort]);
  const lastUpload = saved.reduce((m, r) => (r.uploadedAt > m ? r.uploadedAt : m), '');
  const unmatched = lines.filter(l => !l.matched && (!from || l.date >= from)).length;

  if (denied) return null;
  if (loaded && !saved.length) {
    return <p className="text-[12px] text-text-muted">Pay and hours stats appear once a Field Nation report is uploaded below.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Tech pay &amp; hours</h3>
          <p className="text-[12px] text-text-muted">
            Take-home share of Field Nation jobs (labor − FN fee, then the 50% split). Averages are per day, week, month and year actually worked.
            {lastUpload && ` Last report saved ${lastUpload.slice(0, 10)}.`}
          </p>
        </div>
        <div className="flex gap-1">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={cn('rounded-full border px-3 py-1 text-[12px]', period === p.key ? 'border-accent-gold bg-accent-gold/10 text-text-primary' : 'border-border-sub text-text-muted hover:text-text-primary')}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Avg hourly (take-home)" value={money(company.payPerHour)} sub={`${hrs(company.hours)} · ${company.jobs} jobs`} />
        <StatCard label="Pay per day / week" value={money(company.payPerDay)} sub={`${money(company.payPerWeek)} per week`} />
        <StatCard label="Pay per month / year" value={money(company.payPerMonth)} sub={`${money(company.payPerYear)} per year`} />
        <StatCard label="Hours per day / week" value={hrs(company.hoursPerDay)} sub={`${hrs(company.hoursPerWeek)} per week · ${hrs(company.hoursPerMonth)} per month`} />
      </div>

      {sorted.length > 0 && (
        <div className="rounded-lg border border-border-sub overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px]">Tech</TableHead>
                {COLS.map(c => (
                  <TableHead key={c.key} className="text-[11px] text-right whitespace-nowrap">
                    <button onClick={() => setSort(c.key)} className={cn('hover:text-text-primary', sort === c.key && 'text-accent-gold font-semibold')}>{c.label}</button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map(t => (
                <TableRow key={t.tech}>
                  <TableCell className="text-[12px] whitespace-nowrap">{t.tech}</TableCell>
                  {COLS.map(c => <TableCell key={c.key} className="text-right font-mono text-[12px] whitespace-nowrap">{c.fmt(t[c.key] as number)}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {unmatched > 0 && (
        <p className="text-[11px] text-text-muted">
          {unmatched} job{unmatched > 1 ? 's' : ''} in this period aren&rsquo;t in the app, so they use the Field Nation provider as the tech and the FN approval date as the work date — per-day numbers for those are approximate.
        </p>
      )}
    </div>
  );
}
