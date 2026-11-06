'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CheckCircle2, Clock, Loader2, Send, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { DocApproval } from '@/lib/types';

const when = (s?: string | null) => { try { return s ? format(parseISO(s), 'MMM d, h:mm a') : ''; } catch { return ''; } };

/**
 * Internal approval for a quote or invoice (lib/approvals): where it stands,
 * and the buttons for whoever is looking — submit / resubmit for the person
 * who made it, Approve / Send back for an approver.
 */
export function ApprovalPanel({ kind, approval, canApprove, approverLabel, onRequest, onApprove, onReturn }: {
  kind: 'quote' | 'invoice';
  approval: DocApproval | null | undefined;
  canApprove: boolean;
  /** Who approves, for the waiting message ("a Super Admin, Payroll Admin or Project Manager"). */
  approverLabel: string;
  onRequest: () => Promise<void>;
  onApprove: () => Promise<void>;
  onReturn: (note: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<'request' | 'approve' | 'return' | null>(null);
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState('');
  const run = async (k: 'request' | 'approve' | 'return', fn: () => Promise<void>) => {
    setBusy(k);
    try { await fn(); setReturning(false); setNote(''); } finally { setBusy(null); }
  };
  const status = approval?.status;

  if (status === 'approved') {
    return (
      <div className="rounded-lg border border-text-green/25 bg-text-green/5 p-3 text-[12px] flex items-start gap-2">
        <CheckCircle2 size={14} className="text-text-green mt-0.5 shrink-0" />
        <p className="text-text-secondary">Approved{approval?.decidedByName ? ` by ${approval.decidedByName}` : ''}{approval?.decidedAt ? ` · ${when(approval.decidedAt)}` : ''}. Ready to send.</p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border p-3 space-y-2 text-[12px]', status === 'returned' ? 'border-brand-red/30 bg-brand-red/5' : 'border-accent-gold/40 bg-accent-gold/5')}>
      <div className="flex items-start gap-2">
        {status === 'returned' ? <Undo2 size={14} className="text-brand-red mt-0.5 shrink-0" /> : <Clock size={14} className="text-accent-gold mt-0.5 shrink-0" />}
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold text-text-primary">
            {status === 'pending' ? 'Awaiting approval' : status === 'returned' ? 'Sent back' : 'Needs approval before it’s sent'}
          </p>
          <p className="text-text-secondary">
            {status === 'pending'
              ? `${approval?.requestedByName || 'Someone'} submitted it${approval?.requestedAt ? ` ${when(approval.requestedAt)}` : ''}.${canApprove ? '' : ` Waiting on ${approverLabel}.`}`
              : status === 'returned'
                ? `${approval?.decidedByName || 'An approver'}: ${approval?.note || 'no note'} — fix it, then resubmit.`
                : canApprove ? `You can approve it yourself, or send it — sending counts as your approval.` : `${approverLabel} has to approve this ${kind} before it goes to the client.`}
          </p>
        </div>
      </div>
      {returning ? (
        <div className="space-y-1.5">
          <Textarea autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="What needs to change?" className="min-h-[60px] text-[12px]" />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" className="h-8" onClick={() => setReturning(false)}>Cancel</Button>
            <Button size="sm" className="h-8 bg-brand-red hover:bg-brand-red/90 text-white" disabled={!note.trim() || !!busy} onClick={() => run('return', () => onReturn(note))}>
              {busy === 'return' && <Loader2 size={13} className="mr-1 animate-spin" />} Send back
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canApprove && (
            <Button size="sm" className="h-8 bg-text-green hover:bg-text-green/90 text-white" disabled={!!busy} onClick={() => run('approve', onApprove)}>
              {busy === 'approve' ? <Loader2 size={13} className="mr-1 animate-spin" /> : <CheckCircle2 size={13} className="mr-1" />} Approve
            </Button>
          )}
          {canApprove && status === 'pending' && (
            <Button size="sm" variant="outline" className="h-8" disabled={!!busy} onClick={() => setReturning(true)}>
              <Undo2 size={13} className="mr-1" /> Send back
            </Button>
          )}
          {!canApprove && status !== 'pending' && (
            <Button size="sm" className="h-8 bg-brand-red hover:bg-brand-red/90 text-white" disabled={!!busy} onClick={() => run('request', onRequest)}>
              {busy === 'request' ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Send size={13} className="mr-1" />} {status === 'returned' ? 'Resubmit for approval' : 'Submit for approval'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
