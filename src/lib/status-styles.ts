/**
 * One status → color map for the whole app (badges, map pins, chart bars,
 * dots). Meaning per color:
 *   green  done / approved / paid
 *   gold   in progress / submitted / waiting on someone
 *   grey   scheduled / draft / neutral
 *   red    problem / disputed / returned / missed
 *   blue   informational (confirmed, en route, reviewed)
 */
export type Tone = 'done' | 'progress' | 'scheduled' | 'problem' | 'info' | 'neutral';

/** Badge variant (components/ui/badge.tsx) for each tone. */
export const TONE_BADGE: Record<Tone, 'approved' | 'inprogress' | 'scheduled' | 'disputed' | 'info' | 'draft'> = {
    done: 'approved', progress: 'inprogress', scheduled: 'scheduled', problem: 'disputed', info: 'info', neutral: 'draft',
};

/** Concrete colors for places that can't use classes (map pins, canvas). */
export const TONE_HEX: Record<Tone, string> = {
    done: '#1f8a55', progress: '#C89B3C', scheduled: '#64748b', problem: '#CC2200', info: '#2563eb', neutral: '#94a3b8',
};

/** Theme-aware text / dot classes. */
export const TONE_TEXT: Record<Tone, string> = {
    done: 'text-text-green', progress: 'text-accent-gold', scheduled: 'text-text-muted', problem: 'text-text-red', info: 'text-brand-blue', neutral: 'text-text-muted',
};
export const TONE_DOT: Record<Tone, string> = {
    done: 'bg-text-green', progress: 'bg-accent-gold', scheduled: 'bg-text-muted', problem: 'bg-brand-red', info: 'bg-brand-blue', neutral: 'bg-border-main',
};

const JOB: Record<string, Tone> = {
    unassigned: 'progress', assigned: 'scheduled', scheduled: 'scheduled', confirmed: 'info', 'on-my-way': 'info',
    'in-progress': 'progress', 'checked-out': 'progress', completed: 'done', cancelled: 'neutral', archived: 'neutral',
    missed: 'problem', disputed: 'problem',
};
const LOG: Record<string, Tone> = {
    draft: 'scheduled', submitted: 'progress', approved: 'done', paid: 'done', rejected: 'problem', returned: 'problem',
};
const PAY: Record<string, Tone> = {
    approved: 'done', paid: 'done', submitted: 'progress', draft: 'scheduled', returned: 'problem', 'not-filed': 'problem', upcoming: 'neutral',
};
const REQUEST: Record<string, Tone> = {
    new: 'progress', pending: 'progress', pending_review: 'progress', reviewed: 'info', approved: 'done', converted: 'done', paid: 'done',
    denied: 'problem', rejected: 'problem', closed: 'neutral', archived: 'neutral',
};
const INVOICE: Record<string, Tone> = {
    draft: 'scheduled', sent: 'progress', viewed: 'info', partial: 'progress', paid: 'done', overdue: 'problem', void: 'neutral', cancelled: 'neutral',
};

export type StatusKind = 'job' | 'log' | 'pay' | 'request' | 'invoice';
const MAPS: Record<StatusKind, Record<string, Tone>> = { job: JOB, log: LOG, pay: PAY, request: REQUEST, invoice: INVOICE };

export function statusTone(kind: StatusKind, value: string | null | undefined): Tone {
    return MAPS[kind][(value || '').toLowerCase().trim()] || 'neutral';
}

/** "on-my-way" → "On my way", "pending_review" → "Pending review". */
export function statusLabel(value: string | null | undefined): string {
    const v = (value || '').replace(/[_-]+/g, ' ').trim();
    return v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : '—';
}
