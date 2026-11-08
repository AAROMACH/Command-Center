'use client';

import { useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { ArrowRight, Check, Loader2, Search, Wrench, X } from 'lucide-react';
import type { PayrollDispute, WeeklyLog, WorkOrder } from '@/lib/types';
import { PAYROLL_TICKET_CARDS } from '@/lib/disputes';
import { db, auth } from '@/lib/firebase';
import { auditEvent } from '@/lib/audit';
import { NotificationService } from '@/lib/notification-service';
import { createPayAdjustment, disputePaidHint, findNextOpenLog, jobLabelFor } from '@/lib/pay-adjustments';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { PayCorrectionCalculator, type PayCorrection } from '@/components/pay-correction-calculator';

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;

/** "Paid $80.00 → should be $120.00 · +$40.00, paid on week of 10-19-2026". */
export function adjustmentSummary(a: NonNullable<PayrollDispute['adjustment']>): string {
  const where = a.status === 'queued' ? 'paid on the next log' : `paid on week of ${a.appliedWeekOf}`;
  const pair = a.paidAmount != null && a.correctAmount != null ? `Paid ${money(a.paidAmount)} → should be ${money(a.correctAmount)} · ` : '';
  return `${pair}${signed(a.amount)}, ${where}`;
}

/**
 * Yes/No answer for a post-approval payroll dispute ticket (payrollDisputes).
 * Yes asks what the tech was paid and what they should have been paid; the
 * difference becomes a pay adjustment on their next open log, and the job
 * on the disputed week shows "Pay adjusted". No needs a reason the tech sees.
 */
export function PayrollTicketDecision({ dispute, canDecide, fallbackName, sourceLog, jobsById }: {
    dispute: PayrollDispute;
    canDecide: boolean;
    /** Name to record when the signed-in user has no display name. */
    fallbackName?: string;
    /** The disputed (approved) log — prefills "was paid". */
    sourceLog?: WeeklyLog;
    jobsById?: Map<string, WorkOrder>;
}) {
    const { toast } = useToast();
    const [reviewing, setReviewing] = useState(false);
    const [choice, setChoice] = useState<'yes' | 'no' | null>(null);
    const [note, setNote] = useState('');
    const [paid, setPaid] = useState('');
    const [correct, setCorrect] = useState('');
    const [target, setTarget] = useState<string | null | undefined>(undefined);
    // Wrong pay on a job: the calculator (labor before/after → the tech's difference).
    const [calc, setCalc] = useState<PayCorrection | null>(null);
    const [busy, setBusy] = useState(false);
    const card = PAYROLL_TICKET_CARDS[dispute.reason] || PAYROLL_TICKET_CARDS.incorrect_pay;
    const jobs = jobsById || new Map<string, WorkOrder>();
    const useCalc = dispute.reason === 'incorrect_pay' && !!dispute.workOrderId;
    const calcItem = useCalc ? (sourceLog?.items || []).find(i => i.workOrderId === dispute.workOrderId) : undefined;

    useEffect(() => {
        if (choice !== 'yes') return;
        setPaid(disputePaidHint(dispute, sourceLog, jobs).toFixed(2));
        setTarget(undefined);
        findNextOpenLog(dispute.techId).then(l => setTarget(l ? l.weekOf : null)).catch(() => setTarget(null));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [choice]);

    if (dispute.status !== 'open') {
        const r = dispute.resolution;
        return (
            <div className="rounded-lg border border-border-sub bg-bg-tertiary/40 p-2.5 text-left space-y-0.5">
                <p className="text-[12px] font-semibold text-text-primary break-words">
                    {r ? card.outcome(r.decision, r.note) : 'Resolved'}
                </p>
                {dispute.adjustment && (
                    <p className="text-[12px] font-mono text-accent-gold break-words">Pay adjusted · {adjustmentSummary(dispute.adjustment)}</p>
                )}
                {(r?.by || dispute.resolvedBy) && (
                    <p className="text-[11px] text-text-muted">Decided by {r?.by || dispute.resolvedBy}</p>
                )}
            </div>
        );
    }

    const paidN = useCalc ? (calc?.techBefore ?? NaN) : parseFloat(paid);
    const correctN = useCalc ? (calc?.techAfter ?? NaN) : parseFloat(correct);
    const amountsOk = choice !== 'yes' || (Number.isFinite(paidN) && Number.isFinite(correctN));
    const diff = amountsOk && choice === 'yes' ? Math.round((correctN - paidN) * 100) / 100 : 0;

    const save = async () => {
        if (!choice || (choice === 'no' && !note.trim()) || !amountsOk) return;
        setBusy(true);
        const by = auth.currentUser?.displayName || fallbackName || 'Admin';
        const at = new Date().toISOString();
        const resolution = { decision: choice, by, at, ...(note.trim() ? { note: note.trim() } : {}) };
        try {
            // Pay first, so a Yes is never recorded without the money behind it.
            let adjustment: PayrollDispute['adjustment'] = null;
            if (choice === 'yes' && diff !== 0) {
                const job = dispute.workOrderId ? jobs.get(dispute.workOrderId) : undefined;
                const adj = await createPayAdjustment({
                    techId: dispute.techId,
                    amount: diff,
                    reason: note.trim() || card.outcome('yes'),
                    by,
                    paidAmount: paidN,
                    correctAmount: correctN,
                    laborBefore: useCalc ? calc?.laborBefore ?? null : null,
                    laborAmount: useCalc ? calc?.laborAfter ?? null : null,
                    techNote: dispute.notes || null,
                    disputeId: dispute.id,
                    workOrderId: dispute.workOrderId || null,
                    jobLabel: jobLabelFor(job, dispute.workOrderId),
                    sourceLogId: dispute.weeklyLogId,
                    sourceWeekOf: dispute.weekOf,
                });
                adjustment = { id: adj.id, amount: adj.amount, paidAmount: adj.paidAmount, correctAmount: adj.correctAmount, status: adj.status, appliedLogId: adj.appliedLogId, appliedWeekOf: adj.appliedWeekOf };
            }
            await updateDoc(doc(db, 'payrollDisputes', dispute.id), {
                status: 'resolved',
                resolvedAt: at,
                resolvedBy: by,
                resolution,
                adjustment,
            });
            let outcome = card.outcome(choice, note).replace(/[.!?\s]+$/, '');
            if (adjustment) outcome += ` (${adjustmentSummary(adjustment)})`;
            await auditEvent('payrollDisputes', dispute.id, auth.currentUser?.uid || '', by, 'resolved_dispute',
                `${by} answered ${choice.toUpperCase()} on ${dispute.techName}'s "${card.title}" dispute for week of ${dispute.weekOf}. ${outcome}.`
            ).catch(() => {});
            NotificationService.disputeResolved(dispute, outcome).catch(() => {});
            toast({ title: 'Decision saved', description: outcome });
        } catch (e: any) {
            const desc = e?.code === 'permission-denied' ? 'Only payroll admins can make pay adjustments.' : e.message;
            toast({ variant: 'destructive', title: 'Could not save decision', description: desc });
        } finally {
            setBusy(false);
        }
    };

    // Step 1: one neutral Review button — nothing is decided yet.
    if (!reviewing && !choice) {
        return (
            <Button variant="outline" className="h-10 px-5" disabled={!canDecide} onClick={() => setReviewing(true)}
                title={canDecide ? undefined : 'You don\'t have permission to decide payroll disputes'}>
                <Search size={14} className="mr-1.5" /> Review
            </Button>
        );
    }

    // Step 2: fix it (enter the amounts next) or decline (give a reason).
    if (!choice) {
        return (
            <div className="space-y-2 text-left">
                <p className="text-[14px] font-semibold text-text-primary">{card.question}</p>
                <div className="flex flex-col sm:flex-row gap-2 sm:max-w-xl">
                    <Button className="h-10 whitespace-normal bg-text-green hover:bg-text-green/90 text-white" onClick={() => setChoice('yes')}>
                        <Wrench size={14} className="mr-1.5 shrink-0" /> {card.yesLabel}
                    </Button>
                    <Button variant="outline" className="h-10 whitespace-normal border-brand-red/50 text-text-red hover:bg-brand-red-dim" onClick={() => setChoice('no')}>
                        <X size={14} className="mr-1.5 shrink-0" /> {card.noLabel}
                    </Button>
                    <Button variant="ghost" className="h-10 text-text-muted" onClick={() => setReviewing(false)}>Cancel</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-lg border-2 border-accent-gold/50 bg-accent-gold/5 p-3 space-y-3 text-left">
            <p className="text-[13px] font-semibold text-text-primary break-words">
                {choice === 'yes'
                    ? useCalc
                        ? `Correct ${dispute.techName}'s pay. Enter the correct total — the app works out the difference for the tech, and that goes on their next log.`
                        : `Correct ${dispute.techName}'s pay. Enter what they were paid and what they should have been paid — the difference goes on their next log.`
                    : `Close ${dispute.techName}'s dispute with no change? ${dispute.techName} will see your reason.`}
            </p>
            {choice === 'yes' && useCalc && (
                <div className="space-y-2">
                    {dispute.notes && <p className="text-[12px] text-text-muted break-words">{dispute.techName}&apos;s note: “{dispute.notes}”</p>}
                    <PayCorrectionCalculator job={dispute.workOrderId ? jobs.get(dispute.workOrderId) : undefined} item={calcItem} onChange={setCalc} autoFocus />
                    {calc && calc.diff !== 0 && (
                        <p className="text-[12px] text-text-muted">{calc.diff > 0 ? 'Paid' : 'Deducted'} {target === undefined ? '…' : target ? `on the week of ${target}` : 'on their next log (none open yet)'}.</p>
                    )}
                </div>
            )}
            {choice === 'yes' && !useCalc && (
                <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 sm:max-w-md">
                        <div className="space-y-1">
                            <Label className="text-[12px] font-medium text-text-muted">Was paid</Label>
                            <Input type="number" inputMode="decimal" step="0.01" value={paid} onChange={e => setPaid(e.target.value)} className="h-10 font-mono bg-bg-primary" />
                        </div>
                        <ArrowRight size={16} className="mb-3 text-text-muted" />
                        <div className="space-y-1">
                            <Label className="text-[12px] font-medium text-text-muted">Should have been paid</Label>
                            <Input type="number" inputMode="decimal" step="0.01" value={correct} onChange={e => setCorrect(e.target.value)} placeholder="0.00" className="h-10 font-mono bg-bg-primary" autoFocus />
                        </div>
                    </div>
                    {Number.isFinite(paidN) && Number.isFinite(correctN) && (
                        <p className={cn('text-[13px] font-semibold font-mono', diff > 0 ? 'text-text-green' : diff < 0 ? 'text-text-red' : 'text-text-muted')}>
                            {diff === 0 ? 'No difference — nothing will be paid or deducted.'
                                : `${diff > 0 ? 'Pay' : 'Deduct'} ${money(Math.abs(diff))} ${target === undefined ? '…' : target ? `on the week of ${target}` : 'on their next log (none open yet)'}`}
                        </p>
                    )}
                </div>
            )}
            <div className="space-y-1">
                <Label className="text-[12px] font-medium text-text-muted">{choice === 'yes' ? 'Note for the tech (optional — shown on the adjustment)' : 'Why? (required — the tech will see this)'}</Label>
                <Textarea value={note} onChange={e => setNote(e.target.value)} className="min-h-[60px] text-[13px] bg-bg-primary" />
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
                <Button variant="outline" className="h-10" disabled={busy} onClick={() => { setChoice(null); setNote(''); setCorrect(''); setCalc(null); }}>Cancel</Button>
                <Button className="h-10 whitespace-normal" disabled={busy || (choice === 'no' && !note.trim()) || (choice === 'yes' && !amountsOk)} onClick={save}>
                    {busy ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Check size={13} className="mr-1.5" />}
                    {choice === 'yes' ? (diff ? `Save · ${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}` : 'Save') : 'Decline'}
                </Button>
            </div>
        </div>
    );
}
