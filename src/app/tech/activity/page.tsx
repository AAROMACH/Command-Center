'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import type { WeeklyLog, WorkOrder, Technician } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, CheckCircle2, Clock, AlertTriangle, ShieldCheck, BarChart2, ClipboardList, Coins, Filter, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getReliabilityTier, getTierColor } from '@/lib/reliability';
import { format, parseISO, subWeeks, startOfMonth, endOfMonth } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

export default function TechActivityPage() {
  const [currentTechId, setCurrentTechId] = useState<string | null>(null);
  const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
  const [assignments, setAssignments] = useState<WorkOrder[]>([]);
  const [techDoc, setTechDoc] = useState<Technician | null>(null);
  const [mounted, setMounted] = useState(false);
  const [dateRange, setDateRange] = useState<'4w' | '8w' | 'month' | 'all'>('8w');

  useEffect(() => {
    setMounted(true);
    const userId = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('currentUserId') : null;
    setCurrentTechId(userId);

    if (!userId) return;

    const unsubLogs = onSnapshot(
      query(collection(db, 'weeklyLogs'), where('techId', '==', userId)),
      (snap) => setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)))
    );

    const unsubAssignments = onSnapshot(
      query(collection(db, 'assignments'), where('techId', '==', userId)),
      (snap) => setAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)))
    );

    const unsubUser = onSnapshot(doc(db, 'users', userId), (snap) => {
      if (snap.exists()) setTechDoc({ ...snap.data(), id: snap.id } as Technician);
    });

    return () => { unsubLogs(); unsubAssignments(); unsubUser(); };
  }, []);

  const reliabilityScore = (techDoc as any)?.reliabilityScore ?? 100;
  const reliabilityEvents = (techDoc as any)?.reliabilityEvents ?? [];
  const tier = getReliabilityTier(reliabilityScore);
  const tierColor = getTierColor(tier);

  const logCounts = useMemo(() => ({
    draft: weeklyLogs.filter(l => l.status === 'Draft').length,
    submitted: weeklyLogs.filter(l => l.status === 'Submitted').length,
    approved: weeklyLogs.filter(l => l.status === 'Approved').length,
    rejected: weeklyLogs.filter(l => l.status === 'Rejected').length,
  }), [weeklyLogs]);

  const allItems = useMemo(() => weeklyLogs.flatMap(l => l.items || []), [weeklyLogs]);
  const pendingVerification = allItems.filter(i => !i.confirmationStatus).length;
  const disputed = allItems.filter(i => i.confirmationStatus === 'disputed').length;

  const jobCounts = useMemo(() => ({
    completed: assignments.filter(a => a.status === 'completed' || a.status === 'checked-out').length,
    inProgress: assignments.filter(a => a.status === 'in-progress' || a.status === 'on-my-way').length,
    assigned: assignments.filter(a => a.status === 'assigned' || a.status === 'confirmed').length,
  }), [assignments]);

  const recentCompleted = useMemo(() =>
    assignments
      .filter(a => a.status === 'completed' || a.status === 'checked-out')
      .sort((a, b) => (b.scheduleDate || '').localeCompare(a.scheduleDate || ''))
      .slice(0, 5),
    [assignments]
  );

  const jobsPerWeek = useMemo(() => {
    const grouped: Record<string, number> = {};
    weeklyLogs.forEach(l => {
      if (!l.weekOf) return;
      const week = l.weekOf.slice(0, 10);
      if (l.status === 'Submitted' || l.status === 'Approved') grouped[week] = (grouped[week] || 0) + 1;
    });
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).slice(-8)
      .map(([week, count]) => ({ week: week.slice(5), count }));
  }, [weeklyLogs]);

  const earningsTrend = useMemo(() =>
    weeklyLogs
      .filter(l => l.status === 'Approved')
      .sort((a, b) => (a.weekOf || '').localeCompare(b.weekOf || ''))
      .slice(-8)
      .map(l => ({ week: (l.weekOf || '').slice(5, 10), pay: l.totalPayout || 0 })),
    [weeklyLogs]
  );

  const rangeStart = useMemo(() => {
    const now = new Date();
    if (dateRange === '4w') return subWeeks(now, 4);
    if (dateRange === '8w') return subWeeks(now, 8);
    if (dateRange === 'month') return startOfMonth(now);
    return null;
  }, [dateRange]);

  const filteredAssignments = useMemo(() => {
    if (!rangeStart) return assignments;
    return assignments.filter(a => {
      if (!a.scheduleDate) return false;
      try { return new Date(a.scheduleDate) >= rangeStart; } catch { return false; }
    });
  }, [assignments, rangeStart]);

  const filteredLogs = useMemo(() => {
    if (!rangeStart) return weeklyLogs;
    return weeklyLogs.filter(l => {
      if (!l.weekOf) return false;
      try { return new Date(l.weekOf) >= rangeStart; } catch { return false; }
    });
  }, [weeklyLogs, rangeStart]);

  const avgJobsPerWeek = useMemo(() => {
    const completed = filteredAssignments.filter(a => a.status === 'completed' || a.status === 'checked-out').length;
    const weeks = dateRange === '4w' ? 4 : dateRange === '8w' ? 8 : dateRange === 'month' ? 4 : Math.max(1, Math.ceil(weeklyLogs.length / 1));
    return (completed / Math.max(1, weeks)).toFixed(1);
  }, [filteredAssignments, dateRange, weeklyLogs]);

  const jobsThisMonth = useMemo(() => {
    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());
    return assignments.filter(a => {
      if (!a.scheduleDate) return false;
      try { const d = new Date(a.scheduleDate); return d >= start && d <= end; } catch { return false; }
    }).length;
  }, [assignments]);

  const logTimeliness = useMemo(() => {
    const approved = filteredLogs.filter(l => l.status === 'Approved').length;
    const submitted = filteredLogs.filter(l => l.status === 'Submitted').length;
    const rejected = filteredLogs.filter(l => l.status === 'Rejected').length;
    const total = approved + submitted + rejected;
    const rate = total > 0 ? Math.round((approved / total) * 100) : 0;
    return { approved, submitted, rejected, total, rate };
  }, [filteredLogs]);

  const assignmentPie = [
    { name: 'Completed', value: jobCounts.completed, color: 'var(--text-green)' },
    { name: 'In Progress', value: jobCounts.inProgress, color: 'var(--brand-blue)' },
    { name: 'Scheduled', value: jobCounts.assigned, color: 'var(--accent-gold)' },
  ].filter(d => d.value > 0);

  if (!mounted) return null;

  const StatTile = ({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) => (
    <div className="bg-bg-secondary border border-border-sub rounded-xl p-4 flex flex-col gap-1">
      <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-muted">{label}</p>
      <p className={cn('text-2xl font-mono font-black leading-none', color || 'text-text-primary')}>{value}</p>
      {sub && <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <header className="page-header text-left">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2"><Activity size={12} /> Overview</p>
          <h1 className="page-title text-left">Activity</h1>
          <p className="page-subtitle text-[11px] uppercase font-bold text-text-muted tracking-widest mt-1 text-left">Your field performance metrics.</p>
        </div>
        <div className="flex items-center gap-2 mt-3 md:mt-0">
          <Filter size={10} className="text-text-muted shrink-0" />
          <Select value={dateRange} onValueChange={(v: any) => setDateRange(v)}>
            <SelectTrigger className="h-8 w-[140px] bg-bg-secondary border-border-main text-[10px] font-bold uppercase">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-bg-elevated border-border-main">
              <SelectItem value="4w" className="text-[10px] uppercase font-bold">Last 4 Weeks</SelectItem>
              <SelectItem value="8w" className="text-[10px] uppercase font-bold">Last 8 Weeks</SelectItem>
              <SelectItem value="month" className="text-[10px] uppercase font-bold">This Month</SelectItem>
              <SelectItem value="all" className="text-[10px] uppercase font-bold">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile label="Completed Jobs" value={jobCounts.completed} color="text-text-green" />
        <StatTile label="In Progress" value={jobCounts.inProgress} color="text-blue-400" />
        <StatTile label="Scheduled" value={jobCounts.assigned} />
        <StatTile label="Reliability Score" value={reliabilityScore} sub={tier} color={tierColor} />
        <StatTile label="Pending Verify" value={pendingVerification} color={pendingVerification > 0 ? 'text-accent-gold' : 'text-text-primary'} />
        <StatTile label="Disputed Items" value={disputed} color={disputed > 0 ? 'text-brand-red' : 'text-text-primary'} />
      </div>

      {/* Performance Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-bg-secondary border border-border-sub rounded-xl p-4">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted mb-3 flex items-center gap-1.5"><BarChart2 size={10} className="text-brand-red" /> Logs Per Week</p>
          {jobsPerWeek.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={jobsPerWeek} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <XAxis dataKey="week" tick={{ fontSize: 8, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 8, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-main)', borderRadius: 8, fontSize: 10 }} cursor={{ fill: 'color-mix(in srgb, var(--brand-red) 8%, transparent)' }} />
                <Bar dataKey="count" fill="var(--brand-red)" radius={[3, 3, 0, 0]} name="Logs" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[160px] flex items-center justify-center"><p className="text-[9px] text-text-muted uppercase opacity-40">No log data yet</p></div>
          )}
        </div>
        <div className="bg-bg-secondary border border-border-sub rounded-xl p-4">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted mb-3 flex items-center gap-1.5"><Activity size={10} className="text-brand-red" /> Job Status</p>
          {assignmentPie.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={assignmentPie} dataKey="value" cx="50%" cy="50%" outerRadius={60} strokeWidth={0}>
                  {assignmentPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-main)', borderRadius: 8, fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[160px] flex items-center justify-center"><p className="text-[9px] text-text-muted uppercase opacity-40">No assignments yet</p></div>
          )}
        </div>
        <div className="bg-bg-secondary border border-border-sub rounded-xl p-4">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted mb-3 flex items-center gap-1.5"><Coins size={10} className="text-brand-red" /> Earnings Trend</p>
          {earningsTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={earningsTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <XAxis dataKey="week" tick={{ fontSize: 8, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 8, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-main)', borderRadius: 8, fontSize: 10 }} formatter={(v: number) => [`$${v.toFixed(2)}`, 'Payout']} />
                <Line dataKey="pay" stroke="var(--text-green)" strokeWidth={2} dot={{ r: 3, fill: 'var(--text-green)', strokeWidth: 0 }} activeDot={{ r: 4 }} name="Payout" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[160px] flex items-center justify-center"><p className="text-[9px] text-text-muted uppercase opacity-40">No approved logs yet</p></div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Log Summary */}
        <div className="bg-bg-secondary border border-border-sub rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border-sub">
            <ClipboardList size={12} className="text-brand-red" />
            <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Weekly Log Status</p>
            <span className="ml-auto text-[9px] font-bold text-text-muted">{weeklyLogs.length} total</span>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            {[
              { label: 'Draft', count: logCounts.draft, color: 'text-accent-gold' },
              { label: 'Submitted', count: logCounts.submitted, color: 'text-blue-400' },
              { label: 'Approved', count: logCounts.approved, color: 'text-text-green' },
              { label: 'Returned', count: logCounts.rejected, color: 'text-brand-red' },
            ].map(({ label, count, color }) => (
              <div key={label} className="flex items-center justify-between p-3 rounded-lg bg-bg-primary border border-border-sub">
                <p className="text-[9px] font-black uppercase tracking-widest text-text-muted">{label}</p>
                <p className={cn('text-lg font-mono font-black', color)}>{count}</p>
              </div>
            ))}
          </div>
          {pendingVerification > 0 && (
            <div className="mx-4 mb-4 p-3 rounded-lg bg-accent-gold-dim border border-accent-gold/30 flex items-center gap-2">
              <AlertTriangle size={12} className="text-accent-gold shrink-0" />
              <p className="text-[9px] font-bold uppercase tracking-widest text-accent-gold">
                {pendingVerification} assignment{pendingVerification !== 1 ? 's' : ''} awaiting your confirmation
              </p>
            </div>
          )}
        </div>

        {/* Recent Completed Jobs */}
        <div className="bg-bg-secondary border border-border-sub rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border-sub">
            <CheckCircle2 size={12} className="text-text-green" />
            <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Recent Completed Jobs</p>
          </div>
          <div className="divide-y divide-border-sub">
            {recentCompleted.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">No completed jobs yet</p>
              </div>
            ) : (
              recentCompleted.map(job => (
                <div key={job.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide truncate">
                      {job.title || job.description || job.id}
                    </p>
                    <p className="text-[9px] text-text-muted font-bold uppercase tracking-widest mt-0.5 truncate">
                      {job.clientName || 'Client N/A'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[9px] font-mono font-bold text-text-secondary">{job.scheduleDate || '—'}</p>
                    <Badge variant="active" className="text-[7px] h-3.5 px-1 mt-0.5">Done</Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="bg-bg-secondary border border-border-sub rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-sub">
          <TrendingUp size={12} className="text-brand-red" />
          <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Performance Metrics</p>
          <span className="ml-auto text-[9px] font-bold text-text-muted uppercase tracking-widest">{dateRange === '4w' ? 'Last 4 Wks' : dateRange === '8w' ? 'Last 8 Wks' : dateRange === 'month' ? 'This Month' : 'All Time'}</span>
        </div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg border border-border-sub bg-bg-primary space-y-0.5">
            <p className="text-[8px] font-black uppercase tracking-widest text-text-muted">Avg Jobs / Week</p>
            <p className="text-xl font-mono font-black text-text-green">{avgJobsPerWeek}</p>
            <p className="text-[8px] text-text-muted">in selected range</p>
          </div>
          <div className="p-3 rounded-lg border border-border-sub bg-bg-primary space-y-0.5">
            <p className="text-[8px] font-black uppercase tracking-widest text-text-muted">Jobs This Month</p>
            <p className="text-xl font-mono font-black text-blue-400">{jobsThisMonth}</p>
            <p className="text-[8px] text-text-muted">scheduled or completed</p>
          </div>
          <div className="p-3 rounded-lg border border-border-sub bg-bg-primary space-y-0.5">
            <p className="text-[8px] font-black uppercase tracking-widest text-text-muted">Log Approval Rate</p>
            <p className="text-xl font-mono font-black text-accent-gold">{logTimeliness.rate}%</p>
            <p className="text-[8px] text-text-muted">{logTimeliness.approved} approved / {logTimeliness.total} submitted</p>
          </div>
          <div className="p-3 rounded-lg border border-border-sub bg-bg-primary space-y-0.5">
            <p className="text-[8px] font-black uppercase tracking-widest text-text-muted">Returned Logs</p>
            <p className={cn('text-xl font-mono font-black', logTimeliness.rejected > 0 ? 'text-brand-red' : 'text-text-primary')}>{logTimeliness.rejected}</p>
            <p className="text-[8px] text-text-muted">of {logTimeliness.total} logs in range</p>
          </div>
        </div>
      </div>
    </div>
  );
}
