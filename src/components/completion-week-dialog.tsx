'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CalendarClock, Lock } from 'lucide-react';

type Props = {
  open: boolean;
  scheduledWeek: string;
  reportingWeek: string;
  /** When false, "Add to Correct Week" is disabled (that week's log is locked). */
  scheduledWeekEligible: boolean;
  onCorrectWeek: () => void;
  onCurrentWeek: () => void;
  onCancel: () => void;
};

/**
 * Shown when a tech completes a job scheduled for a different week than the one
 * they're reporting in. Lets them file it in the scheduled ("correct") week or
 * the current reporting week. "Add to Correct Week" is disabled when the
 * scheduled week's log is already submitted/locked.
 */
export function CompletionWeekDialog({
  open, scheduledWeek, reportingWeek, scheduledWeekEligible,
  onCorrectWeek, onCurrentWeek, onCancel,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-[460px] bg-bg-elevated border-border-default shadow-2xl">
        <DialogHeader className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <CalendarClock className="text-accent-gold h-5 w-5" />
            <DialogTitle className="text-base font-bold uppercase tracking-widest">Which Weekly Log?</DialogTitle>
          </div>
          <p className="text-[11px] text-text-muted leading-relaxed">
            This assignment was scheduled for the week of <span className="text-text-primary font-bold">{scheduledWeek}</span>, but you are completing it during the week of <span className="text-text-primary font-bold">{reportingWeek}</span>. Which weekly log should contain it?
          </p>
        </DialogHeader>

        <div className="space-y-2 py-1">
          <button
            onClick={onCorrectWeek}
            disabled={!scheduledWeekEligible}
            className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-border-sub bg-bg-secondary hover:border-accent-gold/50 hover:bg-accent-gold/5 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border-sub disabled:hover:bg-bg-secondary"
          >
            <div>
              <p className="text-[12px] font-bold text-text-primary">Add to Correct Week</p>
              <p className="text-[9px] text-text-muted uppercase tracking-widest font-bold">
                {scheduledWeekEligible ? `Week of ${scheduledWeek}` : 'That week’s log is locked'}
              </p>
            </div>
            {scheduledWeekEligible ? <CalendarClock size={14} className="text-accent-gold shrink-0" /> : <Lock size={14} className="text-text-muted shrink-0" />}
          </button>

          <button
            onClick={onCurrentWeek}
            className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-border-sub bg-bg-secondary hover:border-brand-red/50 hover:bg-brand-red/5 transition-colors text-left"
          >
            <div>
              <p className="text-[12px] font-bold text-text-primary">Add to Current Week</p>
              <p className="text-[9px] text-text-muted uppercase tracking-widest font-bold">Week of {reportingWeek} · flagged as different service week</p>
            </div>
            <CalendarClock size={14} className="text-brand-red shrink-0" />
          </button>
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-9 text-[10px] font-bold uppercase tracking-widest" onClick={onCancel}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
