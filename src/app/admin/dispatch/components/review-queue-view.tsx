"use client";

import { useState } from 'react';
import type { WorkOrder, Technician } from "@/lib/types";
import { Ban, XCircle, Send, Archive as ArchiveIcon, ClipboardList } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WorkOrderId } from '@/components/work-order-id';
import { JobDetailDialog } from '@/components/job-detail-dialog';
import { formatCityState } from '@/lib/utils';
import { jobTechId } from '@/lib/jobs';

type ReviewQueueViewProps = {
  jobs: WorkOrder[];
  technicians: Technician[];
  onSendToDispatch: (wo: WorkOrder) => void;
  onArchive: (wo: WorkOrder) => void;
};

/**
 * Jobs a tech marked Cancelled / Did Not Do land here instead of silently
 * lingering in the active lists — an admin has to explicitly redispatch them
 * or archive them, never leave them ambiguous.
 */
export function ReviewQueueView({ jobs, technicians, onSendToDispatch, onArchive }: ReviewQueueViewProps) {
  const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  if (jobs.length === 0) {
    return (
      <div className="p-24 text-center border-2 border-dashed border-border-main rounded-xl bg-bg-secondary/30">
        <ClipboardList size={32} className="mx-auto text-text-muted mb-3 opacity-40" />
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted italic">
          Review queue is clear — no cancelled or unfinished jobs awaiting a decision.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {jobs.map(wo => {
          const lastNote = [...(wo.history || [])].reverse()
            .find(h => h.details?.toLowerCase().includes('cancelled') || h.details?.toLowerCase().includes('did not do'));
          // Show whoever actually recorded the outcome, not whoever the job
          // is currently allocated to — the two can diverge if the job gets
          // reassigned afterward, which would otherwise misattribute the
          // cancellation/did-not-do to the new tech.
          const techName = lastNote?.user || technicians.find(t => t.id === jobTechId(wo))?.name;

          return (
            <div key={wo.id} className="rounded-xl border border-brand-red/30 bg-bg-secondary p-4 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => { setSelectedJob(wo); setIsDetailOpen(true); }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <WorkOrderId wo={wo} />
                    <Badge variant="outline" className="text-[8px] h-4 px-1.5 uppercase tracking-widest border-brand-red/40 text-brand-red bg-brand-red/5">
                      {wo.techOutcome === 'did_not_do'
                        ? <><XCircle size={10} className="mr-1" />Did Not Do</>
                        : <><Ban size={10} className="mr-1" />Cancelled</>}
                    </Badge>
                  </div>
                  <p className="text-xs font-bold text-text-primary uppercase tracking-wide mt-1.5">{wo.title || wo.description}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[10px] text-text-muted font-bold uppercase tracking-widest">
                    <span>{wo.clientName || 'Unassigned Client'}</span>
                    <span>·</span>
                    <span>{formatCityState(wo.location)}</span>
                    {techName && (<><span>·</span><span>{techName}</span></>)}
                  </div>
                  {lastNote && (
                    <p className="text-[10px] text-text-secondary italic mt-1.5 truncate max-w-xl">{lastNote.details}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[9px] font-bold uppercase tracking-widest border-brand-blue text-brand-blue hover:bg-brand-blue/10"
                    onClick={() => onSendToDispatch(wo)}
                  >
                    <Send size={13} className="mr-1.5" /> Move to Unassigned
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[9px] font-bold uppercase tracking-widest border-text-muted text-text-muted hover:bg-bg-tertiary"
                    onClick={() => onArchive(wo)}
                  >
                    <ArchiveIcon size={13} className="mr-1.5" /> Move to Archives
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <JobDetailDialog isOpen={isDetailOpen} setIsOpen={setIsDetailOpen} mission={selectedJob} />
    </>
  );
}
