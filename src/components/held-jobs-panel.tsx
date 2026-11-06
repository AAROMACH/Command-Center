'use client';

import { useMemo, useState } from 'react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { Hourglass, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { heldJobs, releaseHeldJob, undoJobHold, type HeldJob } from '@/lib/pay-holds';
import { jobLabelFor, movableLogs } from '@/lib/pay-adjustments';
import type { Technician, WeeklyLog, WorkOrder } from '@/lib/types';

const NOT_SET = '__not_set';
const money = (n: number) => `$${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/**
 * Payroll audit: every job whose pay is on hold (waiting on the customer),
 * how long it's waited, and Release → the week it's paid on.
 */
export function HeldJobsPanel({ logs, technicians, jobsById, by, canEdit }: {
  logs: WeeklyLog[]; technicians: Technician[]; jobsById: Map<string, WorkOrder>; by: string; canEdit: boolean;
}) {
  const { toast } = useToast();
  const held = useMemo(() => heldJobs(logs), [logs]);
  const [releasing, setReleasing] = useState<HeldJob | null>(null);
  const [week, setWeek] = useState(NOT_SET);
  const [busy, setBusy] = useState(false);
  const nameOf = (id: string) => technicians.find(t => t.id === id)?.name || id;
  const total = held.reduce((s, h) => s + h.hold.amount, 0);
  if (!held.length) return null;

  const open = (h: HeldJob) => {
    const opts = movableLogs(h.log.techId, logs);
    setWeek(opts[0]?.id || NOT_SET);
    setReleasing(h);
  };
  const release = async () => {
    if (!releasing) return;
    setBusy(true);
    try {
      const adj = await releaseHeldJob(releasing.log.id, releasing.item.id, week === NOT_SET ? null : week, by, jobsById);
      toast({ title: 'Released', description: adj.status === 'applied' ? `Paid on ${nameOf(adj.techId)}'s week of ${adj.appliedWeekOf}.` : 'Goes on the tech’s next log.' });
      setReleasing(null);
    } catch (e: any) { toast({ variant: 'destructive', title: 'Could not release', description: e.message }); }
    finally { setBusy(false); }
  };
  const undo = async (h: HeldJob) => {
    if (!confirm(`Pay ${jobLabelFor(jobsById.get(h.item.workOrderId), h.item.workOrderId)} on its own week (${h.log.weekOf}) again?`)) return;
    try { await undoJobHold(h.log.id, h.item.id, jobsById); toast({ title: 'Hold removed' }); }
    catch (e: any) { toast({ variant: 'destructive', title: 'Could not undo', description: e.message }); }
  };

  const options = releasing ? movableLogs(releasing.log.techId, logs) : [];
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-semibold text-text-primary flex items-center gap-2">
        <Hourglass size={14} className="text-accent-gold" /> Jobs on hold ({held.length} · {money(total)})
      </p>
      <div className="space-y-1.5">
        {held.map(h => {
          const job = jobsById.get(h.item.workOrderId);
          const days = (() => { try { return differenceInCalendarDays(new Date(), parseISO(h.hold.heldAt)); } catch { return 0; } })();
          return (
            <div key={`${h.log.id}-${h.item.id}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-accent-gold/30 bg-accent-gold/5 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-text-primary truncate">{jobLabelFor(job, h.item.workOrderId)}</p>
                <p className="text-[12px] text-text-muted">
                  {nameOf(h.log.techId)} · week of {h.log.weekOf}{job?.clientName ? ` · ${job.clientName}` : ''} · {h.hold.reason} · held {days} day{days === 1 ? '' : 's'}
                </p>
              </div>
              <span className="font-mono text-[13px] font-bold text-text-primary">{money(h.hold.amount)}</span>
              {canEdit && (
                <div className="flex gap-1.5">
                  {!h.log.paid && <Button size="sm" variant="ghost" className="h-8 text-text-muted" onClick={() => undo(h)}>Undo</Button>}
                  <Button size="sm" className="h-8" onClick={() => open(h)}>Release</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={!!releasing} onOpenChange={o => !o && setReleasing(null)}>
        <DialogContent className="sm:max-w-md">
          {releasing && (
            <>
              <DialogHeader className="text-left">
                <DialogTitle>Release held job</DialogTitle>
                <DialogDescription>
                  {jobLabelFor(jobsById.get(releasing.item.workOrderId), releasing.item.workOrderId)} · {money(releasing.hold.amount)} for {nameOf(releasing.log.techId)}.
                  It&apos;s added to the week you pick as its own line, so that week&apos;s stub shows where the money came from.
                </DialogDescription>
              </DialogHeader>
              <Select value={week} onValueChange={setWeek}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {options.map(l => <SelectItem key={l.id} value={l.id}>Pay on the week of {l.weekOf} · {l.status}</SelectItem>)}
                  <SelectItem value={NOT_SET}>Not set — next log the tech opens</SelectItem>
                </SelectContent>
              </Select>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setReleasing(null)}>Cancel</Button>
                <Button onClick={release} disabled={busy}>{busy && <Loader2 size={13} className="mr-1.5 animate-spin" />} Release</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
