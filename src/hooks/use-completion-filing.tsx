'use client';

import { useState } from 'react';
import type { WorkOrder } from '@/lib/types';
import { jobTechId } from '@/lib/jobs';
import {
  beginCompletionFiling,
  endCompletionFiling,
  fileCompletedJob,
  removeJobFromDraftLogs,
  resolveCompletionPlacement,
  type CompletionPlacement,
} from '@/lib/weekly-log';
import { CompletionWeekDialog } from '@/components/completion-week-dialog';
import { useToast } from '@/hooks/use-toast';

type WeekPrompt = CompletionPlacement & { jobId: string };

export type CompletionResult = 'filed' | 'prompted' | 'not_owner';

/** Toast text for a completion, by result. */
export function completionToastText(result: CompletionResult): string {
  if (result === 'filed') return 'Marked completed and filed to your weekly log.';
  if (result === 'prompted') return 'Choose which weekly log should hold it.';
  return 'Marked completed. This job is assigned to another tech, so it was not added to your weekly log — payroll will file it for the assigned tech.';
}

/**
 * One completion flow for every tech screen that can mark a job complete
 * (dashboard, assignments list, assignment detail, calendar). Previously each
 * page carried its own copy, and the calendar had none — so completing from
 * the calendar never reached a weekly log.
 *
 *   await completeAndFile(job, () => updateDoc(...status: 'completed'...));
 *   ...
 *   {weekDialog}
 *
 * The job is marked in-flight before the status write so the self-healing
 * sync (useHelperLogSync) can't file it while the "which week?" prompt is up.
 */
export function useCompletionFiling(techId: string | null) {
  const [weekPrompt, setWeekPrompt] = useState<WeekPrompt | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const completeAndFile = async (
    job: Pick<WorkOrder, 'id' | 'pay' | 'scheduleDate' | 'assignedTechnicianId' | 'assignedTechIds' | 'techId'>,
    writeCompletedStatus: () => Promise<unknown>,
  ): Promise<CompletionResult> => {
    if (!techId) throw new Error('No technician session.');
    // A job only goes on the log of the tech it's ASSIGNED to (what admin
    // screens show). If its owner fields are out of sync it can sit in this
    // tech's portal while being assigned to someone else — complete it, but
    // don't file it here; it shows in Intel → Flags for the assigned tech.
    const assigned = jobTechId(job);
    if (assigned && assigned !== techId) {
      await writeCompletedStatus();
      return 'not_owner';
    }
    beginCompletionFiling(job.id);
    try {
      // Re-completing a job must not stack a second entry in an open Draft.
      await removeJobFromDraftLogs(techId, job.id);
      await writeCompletedStatus();
      const placement = await resolveCompletionPlacement({ techId, scheduleDate: job.scheduleDate });
      if (placement.differentWeek) {
        setWeekPrompt({ jobId: job.id, ...placement });
        return 'prompted'; // in-flight is cleared once the tech picks a week
      }
      // The server builds the entry from the job record (pay included).
      await fileCompletedJob({ techId, job, filedVia: 'completion' });
      endCompletionFiling(job.id);
      return 'filed';
    } catch (e) {
      // Let the self-healing sync pick it up if the status write landed.
      endCompletionFiling(job.id);
      throw e;
    }
  };

  const resolveWeekPrompt = async (choice: 'scheduled' | 'reporting') => {
    if (!techId || !weekPrompt || busy) return;
    setBusy(true);
    try {
      await fileCompletedJob({ techId, job: { id: weekPrompt.jobId }, filedVia: 'completion', placement: choice });
      toast({ title: 'Filed to Weekly Log', description: choice === 'scheduled' ? `Added to the week of ${weekPrompt.scheduledWeek}.` : `Added to the current week (${weekPrompt.reportingWeek}).` });
      endCompletionFiling(weekPrompt.jobId);
      setWeekPrompt(null);
    } catch (e: any) {
      // Keep the prompt open so the tech can retry; the job is still in-flight.
      toast({ variant: 'destructive', title: 'Could not file to weekly log', description: e?.message || 'Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const weekDialog = (
    <CompletionWeekDialog
      open={!!weekPrompt}
      scheduledWeek={weekPrompt?.scheduledWeek || ''}
      reportingWeek={weekPrompt?.reportingWeek || ''}
      scheduledWeekEligible={!!weekPrompt?.scheduledWeekEligible}
      onCorrectWeek={() => resolveWeekPrompt('scheduled')}
      onCurrentWeek={() => resolveWeekPrompt('reporting')}
      busy={busy}
    />
  );

  return { completeAndFile, weekDialog };
}
