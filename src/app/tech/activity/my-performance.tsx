'use client';

import { useEffect, useMemo, useState } from 'react';
import { Gauge } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { StatCard } from '@/components/stat-card';
import { cn } from '@/lib/utils';
import { perfStats, type PerfLine } from '@/lib/fn-performance';

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n >= 1000 ? 0 : 2 }).format(n || 0);
const hrs = (n: number) => `${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })} h`;

const PERIODS = [
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: 'ytd', label: 'This year', days: 0 },
  { key: 'all', label: 'All', days: -1 },
] as const;

/**
 * Tech → Insights: your own pay per hour / day / week / month / year and hours
 * worked, from Field Nation reports the office has uploaded — the same numbers
 * the office sees for you (Insights → Performance), your jobs only.
 */
export function MyPerformance() {
  const [lines, setLines] = useState<PerfLine[] | null>(null);
  const [period, setPeriod] = useState<typeof PERIODS[number]['key']>('90');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await auth.authStateReady();
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch('/api/tech/performance', { headers: { Authorization: `Bearer ${token}` } });
        const body = res.ok ? await res.json() : { lines: [] };
        if (alive) setLines((body.lines || []).map((l: Omit<PerfLine, 'woId' | 'tech' | 'matched'>) => ({ ...l, woId: '', tech: 'me', matched: true })));
      } catch { if (alive) setLines([]); }
    })();
    return () => { alive = false; };
  }, []);

  const s = useMemo(() => {
    const p = PERIODS.find(x => x.key === period)!;
    const now = new Date();
    const from = p.days > 0 ? new Date(now.getTime() - p.days * 864e5).toISOString().slice(0, 10) : p.days === 0 ? `${now.getFullYear()}-01-01` : '';
    return perfStats('me', (lines || []).filter(l => !from || l.date >= from));
  }, [lines, period]);

  if (lines === null) return null;
  if (!lines.length) return null; // no Field Nation reports matched to their jobs yet

  return (
    <div className="space-y-3 rounded-xl border border-border-main bg-bg-secondary p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-text-primary"><Gauge size={14} className="text-brand-red" /> My performance</p>
          <p className="text-[12px] text-text-muted">Your take-home on Field Nation jobs, averaged over the days, weeks and months you worked.</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={cn('rounded-full border px-3 py-1 text-[12px]', period === p.key ? 'border-accent-gold bg-accent-gold/10 text-text-primary' : 'border-border-sub text-text-muted hover:text-text-primary')}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {s.jobs === 0 ? (
        <p className="text-[12px] text-text-muted">No Field Nation jobs in this period.</p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Avg per hour" value={money(s.payPerHour)} sub={`${hrs(s.hours)} · ${s.jobs} jobs`} />
          <StatCard label="Per day / week" value={money(s.payPerDay)} sub={`${money(s.payPerWeek)} per week`} />
          <StatCard label="Per month / year" value={money(s.payPerMonth)} sub={`${money(s.payPerYear)} per year`} />
          <StatCard label="Hours per day / week" value={hrs(s.hoursPerDay)} sub={`${hrs(s.hoursPerWeek)} per week · ${hrs(s.hoursPerMonth)} per month`} />
        </div>
      )}
    </div>
  );
}
