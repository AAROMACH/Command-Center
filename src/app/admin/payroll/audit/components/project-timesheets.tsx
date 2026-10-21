'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { addDays, format, parse } from 'date-fns';
import { CheckCircle2, ChevronDown, Clock, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { onSharedSnapshot } from '@/lib/shared-snapshot';
import { makeProjectPayoutId } from '@/lib/doc-ids';
import { addPayoutToWeeklyLog } from '@/lib/project-payout';
import { weekOfForScheduleDate } from '@/lib/weekly-log-core';
import type { Project, ProjectDailyLog, ProjectPayout, Technician } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/empty-state';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const money = (n: number) => `$${n.toFixed(2)}`;
const weekLabel = (weekOf: string) => {
  const mon = parse(weekOf, 'MM-dd-yyyy', new Date());
  return `${format(mon, 'MMM d')} – ${format(addDays(mon, 6), 'MMM d, yyyy')}`;
};

/**
 * Payroll → Project timesheets: every project check-in/out session, by week
 * and tech, so payroll can check the hours and pay them in the week they were
 * worked. "Approve & add to week" writes one approved payout per project
 * (hours × the tech's hourly rate) onto that week's weekly log. Sessions
 * already on a payout show as paid and aren't counted again.
 */
export function ProjectTimesheets({ technicians, approverName }: { technicians: Technician[]; approverName: string }) {
  const { toast } = useToast();
  const [logs, setLogs] = useState<ProjectDailyLog[]>([]);
  const [payouts, setPayouts] = useState<ProjectPayout[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [week, setWeek] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const a = onSharedSnapshot('projectDailyLogs', s => setLogs(s.docs.map(d => ({ ...(d.data() as ProjectDailyLog), id: d.id }))));
    const b = onSharedSnapshot('projectPayouts', s => setPayouts(s.docs.map(d => ({ ...(d.data() as ProjectPayout), id: d.id }))));
    const c = onSharedSnapshot('projects', s => setProjects(s.docs.map(d => ({ ...(d.data() as Project), id: d.id }))));
    return () => { a(); b(); c(); };
  }, []);

  // Only finished sessions count; an open check-in has no hours yet.
  const closed = useMemo(() => logs.filter(l => l.checkOutTime && (l.hoursWorked || 0) > 0 && l.techId), [logs]);
  const paidIds = useMemo(() => new Set(payouts.flatMap(p => p.timesheetLogIds || [])), [payouts]);
  const weeks = useMemo(() => Array.from(new Set(closed.map(l => weekOfForScheduleDate(l.date))))
    .sort((x, y) => parse(y, 'MM-dd-yyyy', new Date()).getTime() - parse(x, 'MM-dd-yyyy', new Date()).getTime()), [closed]);
  useEffect(() => { if (!week && weeks.length) setWeek(weeks[0]); }, [weeks, week]);

  const rows = useMemo(() => {
    const inWeek = closed.filter(l => weekOfForScheduleDate(l.date) === week);
    const byTech = new Map<string, ProjectDailyLog[]>();
    inWeek.forEach(l => byTech.set(l.techId, [...(byTech.get(l.techId) || []), l]));
    return Array.from(byTech.entries()).map(([techId, list]) => {
      const tech = technicians.find(t => t.id === techId);
      const rate = tech?.hourlyRate || 0;
      const sorted = [...list].sort((a, b) => `${a.date}${a.checkInTime}`.localeCompare(`${b.date}${b.checkInTime}`));
      const hours = list.reduce((s, l) => s + (l.hoursWorked || 0), 0);
      const unpaid = list.filter(l => !paidIds.has(l.id));
      const unpaidHours = unpaid.reduce((s, l) => s + (l.hoursWorked || 0), 0);
      return { techId, name: tech?.name || 'Unknown tech', rate, logs: sorted, hours, unpaid, unpaidHours };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [closed, week, technicians, paidIds]);

  const projectName = (id: string) => projects.find(p => p.id === id)?.name || id;

  const approve = async (row: typeof rows[number]) => {
    if (!row.rate) { toast({ variant: 'destructive', title: 'No hourly rate', description: `Set ${row.name}'s hourly rate in the Directory first.` }); return; }
    setBusy(row.techId);
    try {
      // One payout per project, so each project's labor cost stays on that project.
      const byProject = new Map<string, ProjectDailyLog[]>();
      row.unpaid.forEach(l => byProject.set(l.projectId, [...(byProject.get(l.projectId) || []), l]));
      for (const [projectId, list] of byProject) {
        const hours = +list.reduce((s, l) => s + (l.hoursWorked || 0), 0).toFixed(2);
        const amount = +(hours * row.rate).toFixed(2);
        const id = await makeProjectPayoutId();
        const now = new Date().toISOString();
        const notes = `${projectName(projectId)} · week of ${week}: ${hours}h × $${row.rate}/hr`;
        await addDoc(collection(db, 'projectPayouts'), {
          id, projectId, technicianId: row.techId, technicianName: row.name,
          role: 'crew', payType: 'hourly', payoutSource: 'timesheet',
          amount, hoursWorked: hours, hourlyRate: row.rate, timesheetLogIds: list.map(l => l.id),
          notes, status: 'approved', createdAt: now, approvedAt: now, approvedBy: approverName, weekOf: week,
        });
        const lastDate = list[list.length - 1].date;
        await addPayoutToWeeklyLog(row.techId, id, { projectId, amount, notes, weekOf: week, workDate: lastDate });
      }
      toast({ title: 'Added to the weekly log', description: `${row.name}: ${row.unpaidHours.toFixed(2)}h for the week of ${week}.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not add', description: e?.message || 'Try again.' });
    } finally {
      setBusy(null);
    }
  };

  if (!weeks.length) {
    return <EmptyState icon={Clock} title="No project hours yet" description="Check-in / check-out sessions on projects show up here by week." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={week} onValueChange={setWeek}>
          <SelectTrigger className="h-10 w-full sm:w-[260px]"><SelectValue placeholder="Week" /></SelectTrigger>
          <SelectContent>{weeks.map(w => <SelectItem key={w} value={w}>{weekLabel(w)}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-[12px] text-text-muted">Check each tech's project hours, then add them to that week's log to be paid.</p>
      </div>

      {rows.map(row => {
        const isOpen = open.has(row.techId);
        const allPaid = row.unpaid.length === 0;
        return (
          <div key={row.techId} className="rounded-xl border border-border-sub bg-bg-secondary">
            <div className="flex flex-wrap items-center gap-3 p-3">
              <button type="button" aria-expanded={isOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => setOpen(prev => { const n = new Set(prev); if (n.has(row.techId)) n.delete(row.techId); else n.add(row.techId); return n; })}>
                <ChevronDown size={14} className={cn('shrink-0 text-text-muted transition-transform', isOpen && 'rotate-180')} />
                <span className="truncate text-[14px] font-semibold text-text-primary">{row.name}</span>
                <span className="text-[12px] text-text-muted">{row.logs.length} session{row.logs.length === 1 ? '' : 's'}</span>
              </button>
              <div className="flex items-center gap-4 text-[12px] tabular-nums">
                <span><span className="text-text-muted">Hours </span><span className="font-semibold text-text-primary">{row.hours.toFixed(2)}</span></span>
                <span><span className="text-text-muted">Rate </span><span className="font-semibold text-text-primary">{row.rate ? `$${row.rate}/hr` : '—'}</span></span>
                <span><span className="text-text-muted">Pay </span><span className="font-semibold text-text-primary">{money(row.hours * row.rate)}</span></span>
              </div>
              {allPaid ? (
                <Badge variant="completed" className="gap-1"><CheckCircle2 size={12} /> On weekly log</Badge>
              ) : (
                <Button size="sm" onClick={() => approve(row)} disabled={busy === row.techId}>
                  {busy === row.techId && <Loader2 size={13} className="mr-1.5 animate-spin" />}
                  Approve & add to week{row.unpaid.length < row.logs.length ? ` (${row.unpaidHours.toFixed(2)}h left)` : ''}
                </Button>
              )}
            </div>
            {isOpen && (
              <div className="overflow-x-auto border-t border-border-sub">
                <table className="w-full text-[12px] tabular-nums">
                  <thead><tr className="text-left text-text-muted">
                    <th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Project</th>
                    <th className="px-3 py-2 font-medium">In – Out</th><th className="px-3 py-2 font-medium text-right">Hours</th>
                    <th className="px-3 py-2 font-medium">Notes</th><th className="px-3 py-2 font-medium">Status</th>
                  </tr></thead>
                  <tbody>
                    {row.logs.map(l => (
                      <tr key={l.id} className="border-t border-border-sub/60">
                        <td className="px-3 py-2 whitespace-nowrap">{(() => { try { return format(parse(l.date, 'yyyy-MM-dd', new Date()), 'EEE MMM d'); } catch { return l.date; } })()}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate">{projectName(l.projectId)}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-mono">{l.checkInTime || '—'} – {l.checkOutTime || '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold">{(l.hoursWorked || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 max-w-[260px] truncate text-text-muted" title={l.workSummary}>{l.workSummary || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{paidIds.has(l.id) ? <span className="text-text-green">On a payout</span> : <span className="text-text-muted">Not added</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
