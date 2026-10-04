'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarClock, Lock } from 'lucide-react';

type Props = {
  open: boolean;
  scheduledWeek: string;
  reportingWeek: string;
  /** When false, "Add to Correct Week" is disabled (that week's log is locked). */
  scheduledWeekEligible: boolean;
  onCorrectWeek: () => void;
  onCurrentWeek: () => void;
  /** True while the choice is being written — disables both buttons. */
  busy?: boolean;
};

/**
 * Shown when a tech completes a job scheduled for a different week than the one
 * they're reporting in. Lets them file it in the scheduled ("correct") week or
 * the current reporting week. "Add to Correct Week" is disabled when the
 * scheduled week's log is already submitted/locked.
 *
 * There is deliberately no Cancel: by the time this opens the job is already
 * marked completed, so dismissing it used to leave a completed job in no log
 * at all. Escape, outside clicks and the corner X are suppressed.
 */
export function CompletionWeekDialog({
  open, scheduledWeek, reportingWeek, scheduledWeekEligible,
  onCorrectWeek, onCurrentWeek, busy = false,
}: Props) {
  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-[460px] bg-bg-elevated border-border-default shadow-2xl [&>button:last-child]:hidden"
        onEscapeKeyDown={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
      >
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
            disabled={!scheduledWeekEligible || busy}
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
            disabled={busy}
            className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-border-sub bg-bg-secondary hover:border-brand-red/50 hover:bg-brand-red/5 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <div>
              <p className="text-[12px] font-bold text-text-primary">Add to Current Week</p>
              <p className="text-[9px] text-text-muted uppercase tracking-widest font-bold">Week of {reportingWeek} · flagged as different service week</p>
            </div>
            <CalendarClock size={14} className="text-brand-red shrink-0" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
