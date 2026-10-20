"use client";

import { EmptyState } from '@/components/empty-state';
import { useEffect, useMemo, useState } from 'react';
import { usePaged, ListPager, PAGE_SIZES_SMALL } from '@/components/list-pager';
import type { WorkOrder, Technician } from "@/lib/types";
import { Ban, XCircle, Send, Archive as ArchiveIcon, ClipboardList } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WorkOrderId } from '@/components/work-order-id';
import { JobDetailDialog } from '@/components/job-detail-dialog';
import { cn, formatCityState } from '@/lib/utils';
import { jobTechId } from '@/lib/jobs';
import { format } from 'date-fns';

type HistoryEntry = NonNullable<WorkOrder['history']>[number] & {
  previousTechnicianId?: string | null;
  previousTechnicianName?: string | null;
};

/** Placeholder names older entries were saved with when the tech's record wasn't loaded. */
const GENERIC_NAMES = new Set(['field operative', 'technician', 'tech', '']);

/**
 * Who marked the job Cancelled / Did Not Do — the tech who sent it to the
 * review queue, never "Field Operative":
 *  1. techOutcomeByName / techOutcomeBy, stored on the job since this fix;
 *  2. the history entry's user, unless it's a placeholder (or a raw user id,
 *     which is resolved to a name);
 *  3. for older entries saved as "Field Operative": only the job's assigned
 *     tech could record the outcome, so it's whoever was assigned at that
 *     moment — the current tech, or the previous tech of the first swap
 *     recorded after the outcome.
 */
function outcomeRecordedBy(wo: WorkOrder, note: HistoryEntry | undefined, technicians: Technician[]): string | undefined {
  const nameOf = (id?: string | null) => (id ? technicians.find(t => t.id === id)?.name : undefined);
  if (wo.techOutcomeByName && !GENERIC_NAMES.has(wo.techOutcomeByName.toLowerCase())) return wo.techOutcomeByName;
  if (wo.techOutcomeBy && nameOf(wo.techOutcomeBy)) return nameOf(wo.techOutcomeBy);
  const user = (note?.user || '').trim();
  if (user && !GENERIC_NAMES.has(user.toLowerCase())) return nameOf(user) || user;
  const history = (wo.history || []) as HistoryEntry[];
  const noteIdx = note ? history.lastIndexOf(note) : -1;
  const laterSwap = noteIdx >= 0
    ? history.slice(noteIdx + 1).find(h => (h.type as string) === 'tech_swap' || (h.type as string) === 'tech_swapped' || /^Reassigned from/i.test(h.details || ''))
    : undefined;
  if (laterSwap) return laterSwap.previousTechnicianName || nameOf(laterSwap.previousTechnicianId) || undefined;
  return nameOf(jobTechId(wo));
}

/** When the job landed in the queue: the stored outcome time, else the
 *  history entry that recorded it (older jobs), else its last update. */
function markedAt(wo: WorkOrder, note: HistoryEntry | undefined): string | undefined {
  return wo.techOutcomeAt || note?.date || (wo as { updatedAt?: string }).updatedAt || undefined;
}

const lastOutcomeNote = (wo: WorkOrder) => [...(wo.history || [])].reverse()
  .find(h => h.details?.toLowerCase().includes('cancelled') || h.details?.toLowerCase().includes('did not do')) as HistoryEntry | undefined;

/**
 * Jobs this admin has opened from the queue (per admin, this browser). A job
 * is "Recently added" for them until they open it — or until any admin acts
 * on it, which takes it out of the queue. Just viewing the tab doesn't clear
 * it, and the backlog counts as new the first time they look.
 */
function useOpenedIds(queueIds: string[]) {
  const key = (() => { try { const u = sessionStorage.getItem('currentUserId'); return u ? `cc:reviewOpened:${u}` : null; } catch { return null; } })();
  const [opened, setOpened] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!key) return;
    try { setOpened(new Set(JSON.parse(localStorage.getItem(key) || '[]'))); } catch { /* storage blocked */ }
  }, [key]);
  const markOpened = (id: string) => setOpened(prev => {
    if (prev.has(id)) return prev;
    // Keep only ids still in the queue, so the list doesn't grow forever.
    const next = new Set([...prev, id].filter(x => queueIds.includes(x)));
    try { if (key) localStorage.setItem(key, JSON.stringify([...next])); } catch { /* storage blocked */ }
    return next;
  });
  return { opened, markOpened };
}

type ReviewQueueViewProps = {
  jobs: WorkOrder[];
  technicians: Technician[];
  onSendToDispatch: (wo: WorkOrder) => void;
  onArchive: (wo: WorkOrder) => void;
  /** Jobs that entered the queue since the admin last looked — tagged NEW. */
  newIds?: Set<string>;
};

/**
 * Jobs a tech marked Cancelled / Did Not Do land here instead of silently
 * lingering in the active lists — an admin has to explicitly redispatch them
 * or archive them, never leave them ambiguous.
 */
export function ReviewQueueView({ jobs, technicians, onSendToDispatch, onArchive, newIds }: ReviewQueueViewProps) {
  const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  // Newest first, with jobs this admin hasn't opened yet above the rest.
  const { opened, markOpened } = useOpenedIds(jobs.map(j => j.id));
  const sorted = useMemo(() => [...jobs].sort((a, b) => {
    const na = opened.has(a.id) ? 1 : 0, nb = opened.has(b.id) ? 1 : 0;
    if (na !== nb) return na - nb;
    return (markedAt(b, lastOutcomeNote(b)) || '').localeCompare(markedAt(a, lastOutcomeNote(a)) || '');
  }), [jobs, opened]);
  const pager = usePaged(sorted, PAGE_SIZES_SMALL, 'dispatch-review-queue');
  const openJob = (wo: WorkOrder) => { markOpened(wo.id); setSelectedJob(wo); setIsDetailOpen(true); };

  if (jobs.length === 0) {
    return (
      <EmptyState icon={ClipboardList} title="Review queue is clear" description="No cancelled or unfinished jobs are waiting for a decision." />
    );
  }

  return (
    <>
      <div className="space-y-3">
        {pager.items.map(wo => {
          const lastNote = lastOutcomeNote(wo);
          const techName = outcomeRecordedBy(wo, lastNote, technicians);
          const when = markedAt(wo, lastNote);
          const isNew = !opened.has(wo.id);

          return (
            <div key={wo.id} className={cn('rounded-xl border bg-bg-secondary p-4 shadow-sm', isNew ? 'border-brand-red/60' : 'border-brand-red/25')}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => openJob(wo)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <WorkOrderId wo={wo} />
                    {isNew && (
                      <Badge className={cn('text-[10px] h-4 px-1.5 uppercase tracking-wider bg-brand-red text-white', newIds?.has(wo.id) && 'animate-pulse')}>Recently added</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 uppercase tracking-wider border-brand-red/40 text-brand-red bg-brand-red/5">
                      {wo.techOutcome === 'did_not_do'
                        ? <><XCircle size={10} className="mr-1" />Did Not Do</>
                        : <><Ban size={10} className="mr-1" />Cancelled</>}
                    </Badge>
                  </div>
                  <p className="text-xs font-bold text-text-primary tracking-wide mt-1.5">{wo.title || wo.description}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[10px] text-text-muted font-bold uppercase tracking-wider">
                    <span>{wo.clientName || 'Unassigned Client'}</span>
                    <span>·</span>
                    <span>{formatCityState(wo.location)}</span>
                  </div>
                  {/* Who sent it here and when — the line people read first, on phones too. */}
                  <p className="text-[12px] text-text-secondary mt-2 leading-snug">
                    <span className="font-semibold text-text-primary">{techName || 'A technician'}</span>
                    {' marked this job '}{wo.techOutcome === 'did_not_do' ? 'Did Not Do' : 'Cancelled'}
                    {when && <span className="text-text-muted"> · {format(new Date(when), 'MMM d, yyyy · h:mm a')}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[10px] font-bold uppercase tracking-wider border-brand-blue text-brand-blue hover:bg-brand-blue/10"
                    onClick={() => onSendToDispatch(wo)}
                  >
                    <Send size={13} className="mr-1.5" /> Move to Unassigned
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[10px] font-bold uppercase tracking-wider border-text-muted text-text-muted hover:bg-bg-tertiary"
                    onClick={() => onArchive(wo)}
                  >
                    <ArchiveIcon size={13} className="mr-1.5" /> Archive
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <ListPager pager={pager} noun="jobs" />

      <JobDetailDialog isOpen={isDetailOpen} setIsOpen={setIsDetailOpen} mission={selectedJob} />
    </>
  );
}
