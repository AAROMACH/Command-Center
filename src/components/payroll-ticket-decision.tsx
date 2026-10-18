'use client';

import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Check, Loader2, X } from 'lucide-react';
import type { PayrollDispute } from '@/lib/types';
import { PAYROLL_TICKET_CARDS } from '@/lib/disputes';
import { db, auth } from '@/lib/firebase';
import { auditEvent } from '@/lib/audit';
import { NotificationService } from '@/lib/notification-service';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * Yes/No answer for a post-approval payroll dispute ticket (payrollDisputes).
 * Same rule as the flagged-job cards: one question, plain buttons, an inline
 * confirm, and a required reason on No that the tech sees.
 */
export function PayrollTicketDecision({ dispute, canDecide, fallbackName }: {
    dispute: PayrollDispute;
    canDecide: boolean;
    /** Name to record when the signed-in user has no display name. */
    fallbackName?: string;
}) {
    const { toast } = useToast();
    const [choice, setChoice] = useState<'yes' | 'no' | null>(null);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const card = PAYROLL_TICKET_CARDS[dispute.reason] || PAYROLL_TICKET_CARDS.incorrect_pay;
    const plain = (label: string) => label.replace(/^(Yes|No): /, '').replace(/^./, c => c.toUpperCase());

    if (dispute.status !== 'open') {
        const r = dispute.resolution;
        return (
            <div className="rounded-lg border border-border-sub bg-bg-tertiary/40 p-2.5 text-left">
                <p className="text-[12px] font-semibold text-text-primary break-words">
                    {r ? card.outcome(r.decision, r.note) : 'Resolved'}
                </p>
                {(r?.by || dispute.resolvedBy) && (
                    <p className="text-[11px] text-text-muted">Decided by {r?.by || dispute.resolvedBy}</p>
                )}
            </div>
        );
    }

    const save = async () => {
        if (!choice || (choice === 'no' && !note.trim())) return;
        setBusy(true);
        const by = auth.currentUser?.displayName || fallbackName || 'Admin';
        const at = new Date().toISOString();
        const resolution = { decision: choice, by, at, ...(note.trim() ? { note: note.trim() } : {}) };
        try {
            await updateDoc(doc(db, 'payrollDisputes', dispute.id), {
                status: 'resolved',
                resolvedAt: at,
                resolvedBy: by,
                resolution,
            });
            const outcome = card.outcome(choice, note).replace(/[.!?\s]+$/, '');
            await auditEvent('payrollDisputes', dispute.id, auth.currentUser?.uid || '', by, 'resolved_dispute',
                `${by} answered ${choice.toUpperCase()} on ${dispute.techName}'s "${card.title}" dispute for week of ${dispute.weekOf}. ${outcome}.`
            ).catch(() => {});
            NotificationService.disputeResolved(dispute, outcome).catch(() => {});
            toast({ title: 'Decision saved', description: outcome });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not save decision', description: e.message });
        } finally {
            setBusy(false);
        }
    };

    if (!choice) {
        return (
            <div className="space-y-2 text-left">
                <p className="text-[14px] font-semibold text-text-primary">{card.question}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:max-w-lg">
                    <Button className="h-10 whitespace-normal bg-text-green hover:bg-text-green/90 text-white" disabled={!canDecide} onClick={() => setChoice('yes')}>
                        <Check size={14} className="mr-1.5 shrink-0" /> {card.yesLabel}
                    </Button>
                    <Button variant="outline" className="h-10 whitespace-normal border-brand-red/50 text-text-red hover:bg-brand-red-dim" disabled={!canDecide} onClick={() => setChoice('no')}>
                        <X size={14} className="mr-1.5 shrink-0" /> {card.noLabel}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-lg border-2 border-accent-gold/50 bg-accent-gold/5 p-3 space-y-3 text-left">
            <p className="text-[13px] font-semibold text-text-primary break-words">
                {choice === 'yes'
                    ? `Close ${dispute.techName}'s dispute as done? Only do this after you've made the change. ${dispute.techName} will be told.`
                    : `Close ${dispute.techName}'s dispute with no change? ${dispute.techName} will see your reason.`}
            </p>
            <div className="space-y-1">
                <Label className="text-[12px] font-medium text-text-muted">{choice === 'yes' ? 'What did you change? (optional — the tech will see this)' : 'Why? (required — the tech will see this)'}</Label>
                <Textarea value={note} onChange={e => setNote(e.target.value)} className="min-h-[60px] text-[13px] bg-bg-primary" />
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
                <Button variant="outline" className="h-10" disabled={busy} onClick={() => { setChoice(null); setNote(''); }}>Cancel</Button>
                <Button className="h-10 whitespace-normal" disabled={busy || (choice === 'no' && !note.trim())} onClick={save}>
                    {busy ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Check size={13} className="mr-1.5" />}
                    {plain(choice === 'yes' ? card.yesLabel : card.noLabel)}
                </Button>
            </div>
        </div>
    );
}
