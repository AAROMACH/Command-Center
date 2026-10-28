import type { DisputeKind, DisputeResolution, PayrollDispute, WeeklyLogItem } from './types';

/**
 * Payroll disputes, simple version (docs/payroll-disputes-plan.md).
 *
 * Every flagged job is one card that asks payroll ONE yes/no question. The
 * wording lives here so the tech's log and the payroll review dialog always
 * say the same thing. Pure — no Firebase, safe to import anywhere.
 */

/** What a tech can say about a job on their log ('missing' is its own flow). */
export const TECH_DISPUTE_OPTIONS: { kind: Exclude<DisputeKind, 'missing'>; label: string; noteRequired: boolean }[] = [
  { kind: 'duplicate', label: 'This is a duplicate', noteRequired: false },
  { kind: 'not_mine', label: "I didn't do this job", noteRequired: false },
  { kind: 'pay_or_date', label: 'Pay or date is wrong', noteRequired: true },
];

/**
 * The card type for a disputed item. New disputes store `disputeKind`; older
 * ones only have the free-text reason they were filed with, so map that.
 * Anything unrecognised is "Pay or date is wrong" (the tech's note shows).
 */
export function disputeKindOf(item: Pick<WeeklyLogItem, 'disputeKind' | 'disputeReason'>): Exclude<DisputeKind, 'missing'> {
  if (item.disputeKind && item.disputeKind !== 'missing') return item.disputeKind as Exclude<DisputeKind, 'missing'>;
  const r = (item.disputeReason || '').trim().toLowerCase();
  if (r === 'duplicate entry' || r === 'this is a duplicate') return 'duplicate';
  if (r === 'i did not do this job' || r === 'another tech did this job' || r === "i didn't do this job") return 'not_mine';
  return 'pay_or_date';
}

/** True when the reason is one of the old ones that doesn't name the card on its own. */
export function isLegacyOtherReason(item: Pick<WeeklyLogItem, 'disputeKind' | 'disputeReason'>): boolean {
  if (item.disputeKind) return false;
  const r = (item.disputeReason || '').trim().toLowerCase();
  return !!r && !['duplicate entry', 'i did not do this job', 'another tech did this job', 'hours logged are incorrect', 'wrong date on my log'].includes(r);
}

/** Bits of the sentence a card's confirm text needs. */
export type CardContext = {
  /** Tech's first name, e.g. "Toby". */
  tech: string;
  /** "WO 18000777" */
  wo: string;
  /** "Oct 12" */
  week: string;
};

export type DisputeCard = {
  /** Short label of what the tech claims. */
  title: string;
  /** The quote shown as "<Tech> says: …". */
  claim: string;
  question: (c: CardContext) => string;
  yesLabel: string;
  noLabel: string;
  yesConfirm: (c: CardContext) => string;
  noConfirm: (c: CardContext) => string;
  /** What the tech sees on their log once payroll decides. */
  outcome: (decision: DisputeResolution['decision'], note?: string) => string;
};

const withNote = (text: string, note?: string) => (note && note.trim() ? `${text} — ${note.trim()}` : text);

export const DISPUTE_CARDS: Record<DisputeKind, DisputeCard> = {
  missing: {
    title: 'Missing from my log',
    claim: 'This job is missing from my log.',
    question: c => `Did ${c.tech} do this job?`,
    yesLabel: 'Yes: add it and pay',
    noLabel: "No: don't pay it",
    yesConfirm: c => `Add ${c.wo} to ${c.tech}'s week of ${c.week} and pay it? Check the pay below first.`,
    noConfirm: c => `Leave ${c.wo} off ${c.tech}'s week of ${c.week}? It won't be paid. ${c.tech} will see your reason.`,
    outcome: (d, note) => d === 'yes' ? withNote('Payroll: added and paid', note) : withNote('Payroll: declined', note),
  },
  duplicate: {
    title: 'This is a duplicate',
    claim: 'This job is on my log twice.',
    question: () => 'Is it the same job twice?',
    yesLabel: 'Yes: remove the extra copy',
    noLabel: 'No: keep it and pay',
    yesConfirm: c => `Remove the extra copy of ${c.wo} from ${c.tech}'s week of ${c.week}? ${c.tech} will still be paid once for this job.`,
    noConfirm: c => `Keep ${c.wo} on ${c.tech}'s week of ${c.week} and pay it? ${c.tech} will see your reason.`,
    outcome: (d, note) => d === 'yes' ? withNote('Payroll: removed duplicate copy', note) : withNote('Payroll: not a duplicate, kept and paid', note),
  },
  not_mine: {
    title: "I didn't do this job",
    claim: "I didn't do this job.",
    question: () => 'Did someone else do it?',
    yesLabel: 'Yes: send back to Dispatch',
    noLabel: 'No: keep it and pay',
    yesConfirm: c => `Take ${c.wo} off ${c.tech}'s week of ${c.week} and send it back to Dispatch to reassign? ${c.tech} won't be paid for it.`,
    noConfirm: c => `Keep ${c.wo} on ${c.tech}'s week of ${c.week} and pay it? ${c.tech} will see your reason.`,
    outcome: (d, note) => d === 'yes' ? withNote('Payroll: sent back to Dispatch', note) : withNote('Payroll: kept and paid', note),
  },
  removed_helper: {
    title: 'Removed as helper — says they worked it',
    claim: 'I was taken off this job as a helper, but I worked it.',
    question: c => `Did ${c.tech} work this job as a helper?`,
    yesLabel: 'Yes: keep it and pay',
    noLabel: 'No: take it off',
    yesConfirm: c => `Keep ${c.wo} on ${c.tech}'s week of ${c.week} as a helper job and pay it?`,
    noConfirm: c => `Take ${c.wo} off ${c.tech}'s week of ${c.week}? ${c.tech} won't be paid for it and will see your reason.`,
    outcome: (d, note) => d === 'yes' ? withNote('Payroll: you worked it — kept and paid', note) : withNote('Payroll: removed from your log', note),
  },
  pay_or_date: {
    title: 'Pay or date is wrong',
    claim: 'The pay or date on this job is wrong.',
    question: c => `Is ${c.tech} right?`,
    yesLabel: 'Yes: fix it',
    noLabel: 'No: keep as is',
    yesConfirm: c => `Mark ${c.wo} as fixed on ${c.tech}'s week of ${c.week}? Change the pay or the week below first. It will be paid as shown.`,
    noConfirm: c => `Keep ${c.wo} as it is on ${c.tech}'s week of ${c.week} and pay it? ${c.tech} will see your reason.`,
    outcome: (d, note) => d === 'yes' ? withNote('Payroll: fixed', note) : withNote('Payroll: declined, kept as is', note),
  },
};

/** What the tech sees once payroll has decided (null while undecided). */
export function decisionText(kind: DisputeKind, resolution: DisputeResolution | null | undefined): string | null {
  if (!resolution) return null;
  return DISPUTE_CARDS[kind].outcome(resolution.decision, resolution.note);
}

// ── Post-approval tickets (payrollDisputes) ─────────────────────────────────

export const PAYROLL_TICKET_CARDS: Record<PayrollDispute['reason'], {
  title: string; question: string; yesLabel: string; noLabel: string; outcome: (d: 'yes' | 'no', note?: string) => string;
}> = {
  incorrect_pay: {
    title: 'Pay is wrong',
    question: 'Is the pay wrong?',
    yesLabel: 'Yes: I fixed the pay',
    noLabel: 'No: pay stays as is',
    outcome: (d, note) => d === 'yes' ? withNote('Payroll fixed your pay', note) : withNote('Payroll kept your pay as is', note),
  },
  missing_reimbursement: {
    title: 'Missing reimbursement',
    question: 'Is the reimbursement owed?',
    yesLabel: 'Yes: I added it',
    noLabel: 'No: not owed',
    outcome: (d, note) => d === 'yes' ? withNote('Payroll added your reimbursement', note) : withNote('Payroll declined the reimbursement', note),
  },
  missing_job: {
    title: 'Missing from my log',
    question: 'Did they do this job?',
    yesLabel: 'Yes: I added and paid it',
    noLabel: "No: don't pay it",
    outcome: (d, note) => d === 'yes' ? withNote('Payroll added and paid the job', note) : withNote('Payroll declined the missing job', note),
  },
};

/** "10-12-2026" → "Oct 12". Falls back to the raw key. */
export function shortWeek(weekOf: string | undefined): string {
  const parts = (weekOf || '').split('-');
  const [m, d] = (parts[0]?.length === 4 ? [parts[1], parts[2]] : [parts[0], parts[1]]).map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return m >= 1 && m <= 12 && d ? `${months[m - 1]} ${d}` : (weekOf || '');
}

/** "Toby Tech" → "Toby". */
export const firstName = (name: string | undefined) => (name || 'The tech').trim().split(/\s+/)[0];
