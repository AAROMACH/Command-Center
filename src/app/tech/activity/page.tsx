'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import type { WeeklyLog, WorkOrder, Technician } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Activity, CheckCircle2, Clock, AlertTriangle, ShieldCheck, BarChart2, ClipboardList, Coins } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getReliabilityTier, getTierColor } from '@/lib/reliability';
import { format, parseISO } from 'date-fns';

export default function TechActivityPage() {
  const [currentTechId, setCurrentTechId] = useState<string | null>(null);
  const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
  const [assignments, setAssignments] = useState<WorkOrder[]>([]);
  const [techDoc, setTechDoc] = useState<Technician | null>(null);
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
    </div>
  );
}
