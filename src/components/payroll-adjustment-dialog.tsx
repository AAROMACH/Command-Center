'use client';

import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CheckCircle2, Loader2, SlidersHorizontal, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  PAYOUT_LABEL, adjustmentForText, correctionText, movableLogs, payoutStatus, setAdjustmentPaid, updatePayAdjustment, type PayoutStatus,
} from '@/lib/pay-adjustments';
import { PayCorrectionCalculator, type PayCorrection } from '@/components/pay-correction-calculator';
import type { PayAdjustment, WeeklyLog, WorkOrder } from '@/lib/types';

const NOT_SET = '__not_set';
const when = (s?: string | null) => { try { return s ? format(parseISO(s), 'MMM d, yyyy') : ''; } catch { return s || ''; } };

export const PAYOUT_BADGE: Record<PayoutStatus, string> = {
  paid: 'border-text-green/40 bg-text-green/10 text-text-green',
  upcoming: 'border-brand-blue/40 bg-brand-blue/10 text-brand-blue',
  not_set: 'border-accent-gold/40 bg-accent-gold/10 text-accent-gold',
  record_only: 'border-border-sub text-text-muted',
};

/**
 * Payroll audit → Adjustments → a row: change the amount, reason or the week
 * it's paid on, and confirm it was paid out (Paid) once it's in the payroll
 * run. Paid adjustments are locked until unmarked.
 */
export function PayrollAdjustmentDialog({ adj, techName, logs, jobsById, by, canEdit, onClose }: {
  adj: PayAdjustment | null;
  techName: string;
  logs: WeeklyLog[];
  jobsById: Map<string, WorkOrder>;
  by: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [week, setWeek] = useState(NOT_SET);
  const [busy, setBusy] = useState<'save' | 'paid' | null>(null);

  useEffect(() => {
    if (!adj) return;
    setAmount(String(adj.amount ?? ''));
    setReason(adj.reason || '');
    setWeek(adj.status === 'applied' && adj.appliedLogId ? adj.appliedLogId : NOT_SET);
  }, [adj?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const logsById = useMemo(() => new Map(logs.map(l => [l.id, l])), [logs]);
  const options = useMemo(() => (adj ? movableLogs(adj.techId, logs) : []), [adj, logs]);
  // A correction on a job: re-run the calculator from its original pay on file;
  // the amount is the tech's difference. Plain adjustments keep the amount box.
  const [calc, setCalc] = useState<PayCorrection | null>(null);
  const baseline = useMemo(() => (adj?.workOrderId && adj.paidAmount != null
    ? { labor: Number(adj.laborBefore ?? adj.paidAmount), tech: Number(adj.paidAmount) } : null), [adj]);
  useEffect(() => { setCalc(null); }, [adj?.id]);
  if (!adj) return null;
  const job = adj.workOrderId ? jobsById.get(adj.workOrderId) : undefined;
  const isFn = adj.laborBefore != null && adj.laborBefore !== adj.paidAmount ? true : job?.source === 'Imported';

  const legacy = !adj.status || (adj.status !== 'applied' && adj.status !== 'queued');
  const st = payoutStatus(adj, logsById);
  const current = adj.appliedLogId ? logsById.get(adj.appliedLogId) : undefined;
  const locked = !canEdit || legacy || !!adj.paidOutAt || !!current?.paid;
  const lockReason = !canEdit ? 'Only payroll admins can change adjustments.'
    : legacy ? 'Added before adjustments were paid through weekly logs — record only.'
    : adj.paidOutAt ? 'Marked paid — unmark it to make changes.'
    : current?.paid ? `The week of ${current.weekOf} is already paid, so this can’t change.` : '';
  // With the calculator, the amount is its difference (unchanged until a new total is entered).
  const effAmount = baseline && calc ? calc.diff : Number(amount);
  const dirty = effAmount !== Number(adj.amount) || reason.trim() !== (adj.reason || '').trim()
    || week !== (adj.status === 'applied' && adj.appliedLogId ? adj.appliedLogId : NOT_SET);

  const save = async () => {
    setBusy('save');
    try {
      const saved = await updatePayAdjustment(adj, baseline && calc
        ? { amount: calc.diff, reason, paidAmount: calc.techBefore, correctAmount: calc.techAfter, laborBefore: calc.laborBefore, laborAmount: calc.laborAfter }
        : { amount: Number(amount), reason, paidAmount: adj.paidAmount, correctAmount: adj.correctAmount },
        week === NOT_SET ? null : week, by, jobsById);
      toast({ title: 'Adjustment updated', description: saved.status === 'applied' ? `Paid on the week of ${saved.appliedWeekOf}.` : 'Not on a week — it goes on the tech’s next log.' });
      onClose();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not update', description: e?.code === 'permission-denied' ? 'Only payroll admins can change adjustments.' : e.message });
    } finally { setBusy(null); }
  };
  const markPaid = async (paid: boolean) => {
    if (paid && !confirm(`Mark ${amountText} for ${techName} as paid out? Only do this once it's in the payroll run.`)) return;
    setBusy('paid');
    try {
      await setAdjustmentPaid(adj, paid, by);
      toast({ title: paid ? 'Marked paid' : 'Paid mark removed' });
      onClose();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not update', description: e?.code === 'permission-denied' ? 'Only payroll admins can do this.' : e.message });
    } finally { setBusy(null); }
  };
  const amt = Number(adj.amount) || 0;
  const amountText = `${amt >= 0 ? '+' : '−'}$${Math.abs(amt).toFixed(2)}`;

  return (
    <Dialog open={!!adj} onOpenChange={o => !o && onClose()}>
      <DialogContent className="bg-bg-elevated border-border-main sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2"><SlidersHorizontal size={15} className="text-brand-red" /> Adjustment · {techName}</DialogTitle>
          <DialogDescription>{adj.status ? adjustmentForText(adj) : 'Record only'}{adj.techNote ? ` — “${adj.techNote}”` : ''}</DialogDescription>
        </DialogHeader>

        {/* Payout status */}
        <div className="rounded-lg border border-border-sub bg-bg-secondary p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', PAYOUT_BADGE[st.status])}>{PAYOUT_LABEL[st.status]}</span>
              <span className="text-[12px] text-text-secondary">
                {st.status === 'paid' ? `Paid out ${when(adj.paidOutAt)}${adj.paidOutBy ? ` · marked by ${adj.paidOutBy}` : ''}`
                  : st.status === 'upcoming' ? `On the week of ${adj.appliedWeekOf}${current ? ` (${current.paid ? 'week paid' : current.status})` : ''}`
                  : st.status === 'not_set' ? 'Not on a week yet — goes on the tech’s next log'
                  : 'Kept for the record'}
              </span>
            </div>
            {canEdit && !legacy && (adj.paidOutAt ? (
              <Button size="sm" variant="outline" className="h-8" disabled={!!busy} onClick={() => markPaid(false)}>
                {busy === 'paid' ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Undo2 size={13} className="mr-1" />} Unmark paid
              </Button>
            ) : st.status === 'upcoming' && (
              <Button size="sm" className="h-8 bg-text-green hover:bg-text-green/90 text-white" disabled={!!busy || dirty} onClick={() => markPaid(true)}
                title={dirty ? 'Save your changes first' : undefined}>
                {busy === 'paid' ? <Loader2 size={13} className="mr-1 animate-spin" /> : <CheckCircle2 size={13} className="mr-1" />} Mark paid
              </Button>
            ))}
          </div>
          {st.weekPaid && <p className="text-[12px] text-accent-gold">Its week is marked paid — confirm this adjustment was included, then mark it paid.</p>}
        </div>

        {lockReason && <p className="text-[12px] text-text-muted">{lockReason}</p>}

        {baseline && (
          <div className="space-y-1.5">
            {correctionText(adj, 'tech') && (
              <p className="text-[12px] text-text-muted">Now: {correctionText(adj, 'tech')} · {amountText}</p>
            )}
            {!locked && (
              <PayCorrectionCalculator key={adj.id} job={job} baseline={baseline} fieldNation={isFn}
                initial={adj.laborAmount ?? adj.correctAmount} onChange={setCalc} />
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {!baseline && (
          <div className="space-y-1.5">
            <Label className="text-[12px]">Amount (+ owed / − overpaid)</Label>
            <Input type="number" step="0.01" inputMode="decimal" className="h-10 font-mono" value={amount} disabled={locked} onChange={e => setAmount(e.target.value)} />
          </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-[12px]">Pay it on</Label>
            <Select value={week} onValueChange={setWeek} disabled={locked}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NOT_SET}>Not set — next log the tech opens</SelectItem>
                {current && !options.some(o => o.id === current.id) && (
                  <SelectItem value={current.id}>Week of {current.weekOf} · {current.paid ? 'paid' : current.status}</SelectItem>
                )}
                {options.map(l => <SelectItem key={l.id} value={l.id}>Week of {l.weekOf} · {l.status}</SelectItem>)}
              </SelectContent>
            </Select>
            {!options.length && <p className="text-[11px] text-text-muted">{techName} has no open weeks right now.</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-[12px]">Reason (the tech sees this)</Label>
            <Input className="h-10" value={reason} disabled={locked} onChange={e => setReason(e.target.value)} />
          </div>
        </div>
        <p className="text-[11px] text-text-muted">Added {when(adj.at)} by {adj.by || '—'}{adj.editedAt ? ` · edited ${when(adj.editedAt)} by ${adj.editedBy}` : ''}</p>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {!locked && (
            <Button className="bg-brand-red hover:bg-brand-red/90 text-white" disabled={!dirty || !!busy || !effAmount || !reason.trim()} onClick={save}>
              {busy === 'save' && <Loader2 size={13} className="mr-1.5 animate-spin" />} Save changes
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
