'use client';

import { useState } from 'react';
import type { WorkOrder } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useCompletionFiling, completionToastText } from '@/hooks/use-completion-filing';
import { performTechJobAction, type TechJobAction } from '@/lib/tech-job-actions';

/**
 * The tech workflow buttons for any screen. Every tech screen calls this, so
 * Confirm / Start Trip / Check In / Check Out / Mark Complete / Re-open do the
 * same writes everywhere (see lib/tech-job-actions.ts) and each screen just
 * re-renders from its live listeners.
 *
 *   const { run, busy, weekDialog } = useTechJobActions(techId, techName);
 *   <Button disabled={busy} onClick={() => run(job, 'checkIn')} />
 *   {weekDialog}
 */
export function useTechJobActions(techId: string | null, techName: string) {
  const { completeAndFile, weekDialog } = useCompletionFiling(techId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { toast } = useToast();

  const run = async (job: WorkOrder & { _src?: 'assignment' | 'workOrder' }, action: TechJobAction): Promise<boolean> => {
    if (!techId) {
      toast({ variant: 'destructive', title: 'Not signed in', description: 'Sign in again and retry.' });
      return false;
    }
    if (busyId) return false; // one action at a time — no double taps
    setBusyId(job.id);
    try {
      const r = await performTechJobAction(job, action, { techId, techName, completeAndFile });
      toast({ title: r.title, description: r.completion ? completionToastText(r.completion) : r.description });
      return true;
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Update Failed', description: e?.message || 'Please try again.' });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  return { run, busy: busyId !== null, busyId, weekDialog };
}
