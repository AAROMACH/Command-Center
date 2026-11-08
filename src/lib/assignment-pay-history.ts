/**
 * Pay history for ONE job (assignment detail page): every weekly-log line
 * that carries it (lead or helper), what happened to those logs (approved,
 * unapproved, reopened, paid…), holds, disputes and pay adjustments — merged
 * into one newest-first timeline. Pure: the page does the Firestore reads.
 */
import type { WeeklyLog, WeeklyLogItem, WorkOrder, PayAdjustment, PayHold } from './types';
import { effectiveJobPay } from './payroll';
import { logDisplayStatus } from './weekly-log-core';
import { disputeKindOf } from './disputes';

/** An auditLog/{entityId}/events doc (lib/audit.ts). */
export type AuditLogEvent = {
  entityCollection?: string;
  entityId?: string;
  changedByName?: string;
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
  details?: string | null;
  changedAt?: string;
};

export type PayTone = 'done' | 'progress' | 'scheduled' | 'problem' | 'info' | 'neutral';

/** One weekly-log line that carries this job. */
export type PayHistoryLine = {
  logId: string;
  itemId: string;
  techId: string;
  techName: string;
  isHelper: boolean;
  weekOf: string;
  /** Draft / Submitted / Approved / Paid / Rejected */
  status: string;
  /** This line's pay: effectiveJobPay for leads, as entered for helpers. */
  pay: number;
  /** Held lines aren't in that week's total. */
  held: boolean;
  removedHelper: boolean;
  approvedAt?: string | null;
  approvedByName?: string | null;
  paidAt?: string | null;
  paidByName?: string | null;
  hold?: PayHold | null;
  dispute?: { kind: string; reason?: string; notes?: string; decision?: string; note?: string; by?: string; at?: string } | null;
};

export type PayHistoryEvent = {
  /** ISO timestamp (or MM-dd-yyyy for undated items) — sorted newest first. */
  at: string;
  title: string;
  detail?: string;
  who?: string;
  /** Signed amount, when the event moves money. */
  amount?: number | null;
  logId?: string;
  tone: PayTone;
};

export type PayHistorySummary = {
  /** Week(s) the lead line was paid on (Paid logs), else approved/filed weeks. */
  paidWeeks: string[];
  leadPay: number;
  helperCount: number;
  helperPay: number;
  adjustmentCount: number;
  adjustmentTotal: number;
  heldCount: number;
  disputeCount: number;
  text: string;
};

export type AssignmentPayHistory = { lines: PayHistoryLine[]; events: PayHistoryEvent[]; summary: PayHistorySummary };

type LogWithMeta = WeeklyLog & {
  approvedAt?: string | null;
  approvedByName?: string | null;
  history?: Record<string, unknown>[];
};

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(2)}`;

/** MM-dd-yyyy or ISO → epoch ms (0 when unknown). */
export function payEventTime(at: string | null | undefined): number {
  if (!at) return 0;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(at);
  if (m) return new Date(+m[3], +m[1] - 1, +m[2], 12).getTime();
  const t = Date.parse(at);
  return Number.isFinite(t) ? t : 0;
}

const AUDIT_TITLES: Record<string, [string, PayTone]> = {
  payroll_approved: ['Log approved', 'info'],
  payroll_rejected: ['Log returned / rejected', 'problem'],
  payroll_draft: ['Log sent back to draft', 'problem'],
  payroll_submitted: ['Log set to submitted', 'progress'],
  payroll_reopened: ['Log unapproved (reopened for editing)', 'problem'],
  payroll_reopened_edit: ['Reopened log edited', 'progress'],
  payroll_paid: ['Marked paid', 'done'],
  payroll_unpaid: ['Pay out undone', 'problem'],
  item_moved: ['Job moved to another week', 'progress'],
  item_removed: ['Job removed from log', 'problem'],
  merged_duplicate: ['Duplicate logs merged', 'neutral'],
  deleted_duplicate: ['Duplicate log deleted', 'neutral'],
  deleted_empty: ['Empty log deleted', 'neutral'],
  ignored_duplicate_alert: ['Duplicate alert ignored', 'neutral'],
  backfilled_unlogged_job: ['Unlogged job filed on a log', 'progress'],
  excluded_unlogged_job: ['Unlogged job excluded from pay', 'neutral'],
  moved_wrong_tech_entry: ['Entry moved to the right tech', 'progress'],
  synced_tech_fields: ['Tech fields synced', 'neutral'],
};

const humanize = (s: string) => {
  const v = s.replace(/[_-]+/g, ' ').trim();
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : 'Event';
};

/**
 * Builds the history. `auditEvents` maps an auditLog entity id (a weekly log
 * id or this job's id) to its events; log-level events (approve/pay/reopen)
 * on a log carrying this job are kept, other events only when their details
 * mention the job id or its WO number.
 */
export function buildAssignmentPayHistory(input: {
  workOrderId: string;
  job?: WorkOrder | null;
  logs: LogWithMeta[];
  techNames?: Record<string, string>;
  auditEvents?: Record<string, AuditLogEvent[]>;
  adjustments?: PayAdjustment[];
}): AssignmentPayHistory {
  const { workOrderId, job, logs, techNames = {}, auditEvents = {}, adjustments = [] } = input;
  const nameOf = (id: string) => techNames[id] || id || 'Unknown tech';
  const woNumber = job?.externalWorkOrderId ? String(job.externalWorkOrderId) : '';
  const mentionsJob = (text: string | null | undefined) => {
    const t = (text || '').toLowerCase();
    return !!t && (t.includes(workOrderId.toLowerCase()) || (!!woNumber && t.includes(woNumber.toLowerCase())));
  };

  const lines: PayHistoryLine[] = [];
  const events: PayHistoryEvent[] = [];
  const logIds = new Set(logs.map(l => l.id));

  for (const log of logs) {
    const status = logDisplayStatus(log) || 'Draft';
    const tech = nameOf(log.techId);
    for (const item of (log.items || []) as WeeklyLogItem[]) {
      if (item.workOrderId !== workOrderId) continue;
      const isHelper = !!item.isHelper;
      const pay = effectiveJobPay(item, job ?? undefined);
      const held = item.payHold?.status === 'held';
      const disputed = item.confirmationStatus === 'disputed';
      lines.push({
        logId: log.id, itemId: item.id, techId: log.techId, techName: tech, isHelper,
        weekOf: log.weekOf, status, pay, held, removedHelper: !!item.helperRemoved,
        approvedAt: log.approvedAt ?? null, approvedByName: log.approvedByName ?? null,
        paidAt: log.paid ? log.paidAt ?? null : null, paidByName: log.paid ? log.paidByName ?? null : null,
        hold: item.payHold ?? null,
        dispute: disputed ? {
          kind: humanize(disputeKindOf(item)), reason: item.disputeReason, notes: item.disputeNotes,
          decision: item.resolution?.decision, note: item.resolution?.note, by: item.resolution?.by, at: item.resolution?.at,
        } : null,
      });

      const who = `${tech}${isHelper ? ' (helper)' : ''}`;
      events.push({
        at: log.submittedAt || log.weekOf, logId: log.id, tone: 'scheduled', amount: pay, who,
        title: `On ${isHelper ? 'helper' : 'lead'} log · week of ${log.weekOf}`,
        detail: `Filed on ${tech}'s log${log.submittedAt ? ' (submitted)' : ''} — now ${status}.`,
      });
      if (item.helperRemoved) events.push({
        at: item.helperRemoved.at, logId: log.id, tone: 'problem', who: item.helperRemoved.by,
        title: 'Removed as helper', detail: `${tech}'s helper line isn't paid unless they show they worked it.`,
      });
      if (item.approvedFromLeadLog) events.push({
        at: item.approvedFromLeadLog.at, logId: log.id, tone: 'info', who: item.approvedFromLeadLog.by, amount: pay,
        title: 'Helper pay set from lead log', detail: `Priced from ${item.approvedFromLeadLog.leadLogId}.`,
      });
      const h = item.payHold;
      if (h) {
        events.push({
          at: h.heldAt, logId: log.id, tone: 'progress', who: h.heldBy, amount: h.amount,
          title: `Pay held · week of ${log.weekOf}`, detail: h.reason,
        });
        if (h.status === 'released') events.push({
          at: h.releasedAt || h.heldAt, logId: h.releasedLogId || log.id, tone: 'done', who: h.releasedBy || undefined, amount: h.amount,
          title: `Hold released${h.releasedWeekOf ? ` · paid on week of ${h.releasedWeekOf}` : ''}`, detail: h.reason,
        });
      }
      if (disputed) {
        const kind = humanize(disputeKindOf(item));
        events.push({
          at: item.resolution?.at || log.submittedAt || log.weekOf, logId: log.id,
          tone: item.resolution ? 'info' : 'problem', who: item.resolution?.by || tech,
          title: item.resolution ? `Dispute decided: ${item.resolution.decision === 'yes' ? 'Yes' : 'No'} · ${kind}` : `Disputed · ${kind}`,
          detail: [item.disputeReason, item.disputeNotes, item.resolution?.note].filter(Boolean).join(' — ') || undefined,
        });
      }
    }

    // Log-level approval / pay stamps (the doc keeps only the latest).
    const onLog = lines.filter(l => l.logId === log.id);
    if (!onLog.length) continue;
    const linePay = onLog.reduce((s, l) => s + (l.held ? 0 : l.pay), 0);
    if (log.approvedAt) events.push({
      at: log.approvedAt, logId: log.id, tone: 'info', who: log.approvedByName || undefined, amount: linePay,
      title: `Approved · week of ${log.weekOf}`, detail: `${tech}'s log approved.`,
    });
    if (log.paid && log.paidAt) events.push({
      at: log.paidAt, logId: log.id, tone: 'done', who: log.paidByName || undefined, amount: linePay,
      title: `Paid · week of ${log.weekOf}`, detail: `${tech}'s log paid out.`,
    });

    // weeklyLogs.history stamps about this job (item_moved, dispute_removed…).
    for (const h of log.history || []) {
      if (h?.workOrderId !== workOrderId) continue;
      const type = String(h.type || 'event');
      const extra = type === 'item_moved' ? `From week of ${h.fromWeek ?? '?'} to week of ${h.toWeek ?? '?'}.`
        : type === 'dispute_removed' ? `Removed after a ${humanize(String(h.kind || 'dispute')).toLowerCase()} dispute.` : undefined;
      events.push({
        at: String(h.at || h.date || log.weekOf), logId: log.id, tone: type === 'item_moved' ? 'progress' : 'neutral',
        who: (h.by as string) || undefined, title: type === 'item_moved' ? 'Job moved between weeks' : humanize(type), detail: extra,
      });
    }
  }

  // Audit trail.
  for (const [entityId, list] of Object.entries(auditEvents)) {
    const isLog = logIds.has(entityId);
    const log = logs.find(l => l.id === entityId);
    for (const ev of list) {
      const action = ev.field === '__action__' ? String(ev.newValue || '') : `${ev.field || 'field'}_changed`;
      const logLevel = isLog && action.startsWith('payroll_');
      if (!logLevel && entityId !== workOrderId && !mentionsJob(ev.details)) continue;
      // The doc stamp already shows the latest approval / pay out.
      const t = payEventTime(ev.changedAt);
      if (log && ((action === 'payroll_approved' && log.approvedAt && Math.abs(payEventTime(log.approvedAt) - t) < 120_000)
        || (action === 'payroll_paid' && log.paidAt && Math.abs(payEventTime(log.paidAt) - t) < 120_000))) continue;
      const [title, tone] = AUDIT_TITLES[action] || [humanize(action), 'neutral' as PayTone];
      events.push({
        at: ev.changedAt || '', logId: isLog ? entityId : undefined, tone, who: ev.changedByName || undefined,
        title: log ? `${title} · week of ${log.weekOf}` : title,
        detail: ev.details || (ev.field && ev.field !== '__action__' ? `${ev.field}: ${String(ev.oldValue ?? '—')} → ${String(ev.newValue ?? '—')}` : undefined),
      });
    }
  }

  // Pay adjustments (payroll admins only — the page passes [] otherwise).
  const adjs = adjustments.filter(a => a.workOrderId === workOrderId);
  for (const a of adjs) {
    const parts = [
      a.laborBefore != null && a.laborAmount != null ? `Labor ${money(a.laborBefore)} → ${money(a.laborAmount)}` : '',
      a.paidAmount != null && a.correctAmount != null ? `Tech pay ${money(a.paidAmount)} → ${money(a.correctAmount)}` : '',
      a.reason ? `“${a.reason}”` : '',
    ].filter(Boolean);
    const week = a.status === 'queued' ? 'queued for the next open week' : `on week of ${a.appliedWeekOf || '?'}`;
    events.push({
      at: a.at, logId: a.appliedLogId || undefined, tone: a.amount >= 0 ? 'progress' : 'problem', who: a.by, amount: a.amount,
      title: `${a.kind === 'held_job' ? 'Held pay scheduled' : 'Pay adjustment'} ${signed(a.amount)} · ${week} (${nameOf(a.techId)})`,
      detail: parts.join(' · ') || undefined,
    });
    if (a.paidOutAt) events.push({
      at: a.paidOutAt, logId: a.appliedLogId || undefined, tone: 'done', who: a.paidOutBy || undefined, amount: a.amount,
      title: `Adjustment paid out${a.appliedWeekOf ? ` · week of ${a.appliedWeekOf}` : ''}`,
    });
    if (a.editedAt) events.push({ at: a.editedAt, logId: a.appliedLogId || undefined, tone: 'neutral', who: a.editedBy || undefined, title: 'Adjustment edited' });
  }

  events.sort((x, y) => payEventTime(y.at) - payEventTime(x.at));
  lines.sort((x, y) => payEventTime(y.weekOf) - payEventTime(x.weekOf) || Number(x.isHelper) - Number(y.isHelper));

  // Summary.
  const leads = lines.filter(l => !l.isHelper);
  const helpers = lines.filter(l => l.isHelper && !l.removedHelper);
  const paidLeads = leads.filter(l => l.status === 'Paid');
  const shown = paidLeads.length ? paidLeads : leads;
  const paidWeeks = [...new Set(shown.map(l => l.weekOf))];
  const leadPay = leads.reduce((s, l) => s + (l.held ? 0 : l.pay), 0);
  const helperPay = helpers.reduce((s, l) => s + (l.held ? 0 : l.pay), 0);
  const adjustmentTotal = adjs.reduce((s, a) => s + (a.amount || 0), 0);
  const heldCount = lines.filter(l => l.held).length;
  const disputeCount = lines.filter(l => l.dispute).length;
  const helperIds = new Set(helpers.map(l => l.techId));
  const head = !leads.length ? 'Not on a lead weekly log yet'
    : paidLeads.length ? `Paid on week of ${paidWeeks.join(', ')}`
      : `On week of ${paidWeeks.join(', ')} (${shown[0].status.toLowerCase()})`;
  const text = [
    head,
    leads.length ? `Lead ${money(leadPay)}` : '',
    helperIds.size ? `${helperIds.size} helper${helperIds.size === 1 ? '' : 's'} ${money(helperPay)}` : '',
    adjs.length ? `${adjs.length} adjustment${adjs.length === 1 ? '' : 's'} ${signed(adjustmentTotal)}` : '',
    heldCount ? `${heldCount} held` : '',
    disputeCount ? `${disputeCount} disputed` : '',
  ].filter(Boolean).join(' · ');

  return {
    lines, events,
    summary: { paidWeeks, leadPay, helperCount: helperIds.size, helperPay, adjustmentCount: adjs.length, adjustmentTotal, heldCount, disputeCount, text },
  };
}
