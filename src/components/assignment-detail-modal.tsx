'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatCityState } from '@/lib/utils';
import {
  X,
  MapPin,
  Calendar,
  Clock,
  Lock,
  ExternalLink,
  ChevronRight,
  Check,
  AlertTriangle,
  DollarSign,
  Users,
  FileText,
  Activity,
  ShieldCheck,
  ArrowRight,
  RotateCcw,
  Minus,
  Plus,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  orderBy,
  limit,
} from 'firebase/firestore';
import type { WorkOrder, Assignment } from '@/lib/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AssignmentHistoryEntry {
  id: string;
  eventType: string;
  oldScheduledDate: string | null;
  newScheduledDate: string;
  reasonCode: string | null;
  note: string;
  changedBy: string;
  changedAt: string;
}

interface FinancialRecord {
  id: string;
  amount: number;
  category: string;
  note: string;
  reviewStatus: string;
  paymentStatus: string;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

interface PenaltyEvent {
  id: string;
  type: string;
  points: number;
  category: string;
  note: string;
  recordedBy: string;
  createdAt: string;
}

interface AdminReviewData {
  financialRecord: FinancialRecord | null;
  penaltyEvents: PenaltyEvent[];
  history: AssignmentHistoryEntry[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Scope', 'Activity Ledger', 'Admin Review'] as const;
type Tab = typeof TABS[number];

const FIELD_NATION_BASE = 'https://app.fieldnation.com/workorders/';

const getFieldNationUrl = (workOrder: WorkOrder) => {
  const id = workOrder.externalWorkOrderId || workOrder.id.replace(/^(wo-|asmt-)/, '');
  return `${FIELD_NATION_BASE}${id}`;
};

const PAY_TYPE_LABELS: Record<string, string> = {
  fixed:   'Fixed Rate',
  hourly:  'Hourly Labor Rate',
  blended: 'Blended Rate',
};

const OUTCOME_LABELS: Record<string, string> = {
  worked_completed:               'Completed',
  worked_revisit_same_work_order: 'Revisit Required',
  worked_revisit_new_work_order:  'New Work Order Needed',
  did_not_work:                   'No Work Performed',
};

const STATUS_COLOR: Record<string, string> = {
  completed:    'text-text-green border-green-border/40 bg-green-dim',
  'checked-out':'text-text-green border-green-border/40 bg-green-dim',
  'in-progress':'text-accent-gold border-accent-gold/30 bg-accent-gold-dim',
  'on-my-way':  'text-accent-gold border-accent-gold/30 bg-accent-gold-dim',
  assigned:     'text-text-muted border-border-sub bg-bg-tertiary',
  confirmed:    'text-brand-cyan border-brand-cyan/30 bg-brand-cyan/5',
  unassigned:   'text-text-muted border-border-sub bg-bg-tertiary',
};

const HISTORY_EVENT_LABELS: Record<string, string> = {
  assigned:    'Assignment Dispatched',
  rescheduled: 'Rescheduled',
  completed:   'Assignment Closed',
  cancelled:   'Cancelled',
  reassigned:  'Technician Reassigned',
};

// ─── Pay calculation helpers ─────────────────────────────────────────────────

function calcPayout(wo: WorkOrder, hoursWorked?: number): {
  label: string;
  amount: number;
  lines: { label: string; value: string }[];
} {
  const type = wo.payType || 'fixed';

  if (type === 'fixed') {
    return {
      label: 'Fixed Rate',
      amount: wo.pay || 0,
      lines: [{ label: 'Fixed Amount', value: `$${(wo.pay || 0).toFixed(2)}` }],
    };
  }

  if (type === 'hourly') {
    const hrs = hoursWorked ?? 0;
    const rate = wo.pay || 0;
    return {
      label: 'Hourly Labor Rate',
      amount: hrs * rate,
      lines: [
        { label: 'Rate',  value: `$${rate.toFixed(2)}/hr` },
        { label: 'Hours', value: hrs.toFixed(2) },
        { label: 'Total', value: `$${(hrs * rate).toFixed(2)}` },
      ],
    };
  }

  if (type === 'blended') {
    const base     = (wo as any).basePay    || 0;
    const baseHrs  = (wo as any).baseHours  || 0;
    const ovRate   = (wo as any).hourlyRate || 0;
    const hrs      = hoursWorked ?? 0;
    const ovHrs    = Math.max(0, hrs - baseHrs);
    const total    = base + ovHrs * ovRate;
    return {
      label: 'Blended Rate',
      amount: total,
      lines: [
        { label: 'Base Pay',    value: `$${base.toFixed(2)} (${baseHrs}h)` },
        { label: 'OT Rate',     value: `$${ovRate.toFixed(2)}/hr` },
        { label: 'OT Hours',    value: ovHrs.toFixed(2) },
        { label: 'Total',       value: `$${total.toFixed(2)}` },
      ],
    };
  }

  return { label: 'Unknown', amount: 0, lines: [] };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] whitespace-nowrap">
        {children}
      </p>
      <div className="flex-1 h-px bg-border-sub" />
    </div>
  );
}

function MetaRow({ icon: Icon, value }: { icon: React.ElementType; value: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-text-muted font-semibold text-left">
      <Icon size={12} className="text-brand-red shrink-0" />
      <span className="text-text-secondary truncate">{value}</span>
    </div>
  );
}

function InfoGrid({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-5">
      {items.map(({ label, value }) => (
        <div key={label} className="bg-bg-tertiary border border-border-sub rounded-xl p-3">
          <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.16em] mb-1">{label}</p>
          <p className="text-[12px] font-bold text-text-primary">{value}</p>
        </div>
      ))}
    </div>
  );
}

function LedgerEntry({
  dot,
  time,
  title,
  note,
  by,
  isLast,
}: {
  dot: 'green' | 'gold' | 'blue' | 'red' | 'gray';
  time: string;
  title: string;
  note: string;
  by: string;
  isLast?: boolean;
}) {
  const dotClass = {
    green: 'bg-green-dim border-green-border text-text-green',
    gold:  'bg-accent-gold-dim border-accent-gold/40 text-accent-gold',
    blue:  'bg-brand-cyan/5 border-brand-cyan/30 text-brand-cyan',
    red:   'bg-brand-red-dim border-brand-red/30 text-text-red',
    gray:  'bg-bg-tertiary border-border-sub text-text-muted',
  }[dot];

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={cn('w-6 h-6 rounded-full border flex items-center justify-center shrink-0 mt-0.5', dotClass)}>
          <div className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border-sub mt-1 mb-1 min-h-[16px]" />}
      </div>
      <div className="pb-4 flex-1 min-w-0 text-left">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[12px] font-bold text-text-primary leading-tight">{title}</p>
          <p className="text-[9px] font-bold text-text-muted uppercase tracking-wider shrink-0 mt-0.5">{time}</p>
        </div>
        <p className="text-[10px] text-text-muted mt-1 leading-relaxed">{note}</p>
        <p className="text-[9px] font-bold text-text-muted/60 uppercase tracking-widest mt-1">{by}</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface AssignmentDetailModalProps {
  assignment: Assignment | null;
  workOrder: WorkOrder | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function AssignmentDetailModal({
  assignment,
  workOrder,
  isOpen,
  onClose,
}: AssignmentDetailModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [adminData, setAdminData] = useState<AdminReviewData>({
    financialRecord: null,
    penaltyEvents: [],
    history: [],
  });
  const [loadingAdmin, setLoadingAdmin] = useState(false);

  const isLocked = useMemo(
    () => assignment?.status === 'completed' || assignment?.status === 'checked-out',
    [assignment?.status]
  );

  // Load Admin Review data lazily when that tab is first opened
  useEffect(() => {
    if (activeTab !== 'Admin Review' || !assignment?.id) return;
    if (adminData.history.length > 0 || adminData.financialRecord) return; // already loaded

    setLoadingAdmin(true);

    Promise.all([
      // financialRecords linked to this assignment
      getDocs(
        query(
          collection(db, 'financialRecords'),
          where('assignmentId', '==', assignment.id),
          limit(1)
        )
      ),
      // penalty events linked to this assignment
      getDocs(
        query(
          collection(db, 'penaltyEvents'),
          where('assignmentId', '==', assignment.id)
        )
      ),
      // assignment/history subcollection
      getDocs(
        query(
          collection(db, 'assignments', assignment.id, 'history'),
          orderBy('changedAt', 'asc')
        )
      ),
    ])
      .then(([finSnap, penSnap, histSnap]) => {
        setAdminData({
          financialRecord: finSnap.empty
            ? null
            : ({ id: finSnap.docs[0].id, ...finSnap.docs[0].data() } as FinancialRecord),
          penaltyEvents: penSnap.docs.map(d => ({ id: d.id, ...d.data() } as PenaltyEvent)),
          history: histSnap.docs.map(d => ({ id: d.id, ...d.data() } as AssignmentHistoryEntry)),
        });
      })
      .catch(console.error)
      .finally(() => setLoadingAdmin(false));
  }, [activeTab, assignment?.id, adminData.financialRecord, adminData.history.length]);

  // Reset tab on close
  useEffect(() => {
    if (!isOpen) {
      setActiveTab('Overview');
      setAdminData({ financialRecord: null, penaltyEvents: [], history: [] });
    }
  }, [isOpen]);

  if (!assignment || !workOrder) return null;

  const payout = calcPayout(workOrder);
  const statusKey = assignment.status?.toLowerCase() ?? 'assigned';
  const statusLabel =
    statusKey === 'completed'    ? 'Completed'  :
    statusKey === 'checked-out'  ? 'Checked Out' :
    statusKey === 'in-progress'  ? 'On Site'     :
    statusKey === 'on-my-way'    ? 'En Route'    :
    statusKey === 'confirmed'    ? 'Confirmed'   :
    statusKey === 'assigned'     ? 'Scheduled'   : assignment.status;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="p-0 gap-0 max-w-2xl w-full bg-bg-elevated border-border-default rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="shrink-0 px-6 pt-5 pb-0 border-b border-border-sub text-left">
          {/* Top row: ID + status + lock indicator + close */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[10px] font-bold text-brand-red uppercase tracking-wider">
                WO: {assignment.id.toUpperCase()}
              </span>
              <span className={cn(
                'text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border',
                STATUS_COLOR[statusKey] ?? 'text-text-muted border-border-sub bg-bg-tertiary'
              )}>
                {statusLabel}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {isLocked && (
                <div className="flex items-center gap-1.5 text-[9px] font-black text-text-muted uppercase tracking-widest">
                  <Lock size={11} className="text-text-muted" />
                  Record Locked
                </div>
              )}
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-center text-text-muted hover:text-text-primary hover:border-border-main transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Title */}
          <h2 className="text-xl font-black uppercase tracking-wide text-text-primary leading-tight mb-3 text-left">
            {workOrder.title || workOrder.description}
          </h2>

          {/* Meta bar */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pb-4">
            <MetaRow icon={MapPin}   value={workOrder.locationText || workOrder.location || '—'} />
            <MetaRow icon={Calendar} value={workOrder.scheduleDate || assignment.currentScheduledDate || '—'} />
            {workOrder.scheduleTime && (
              <MetaRow icon={Clock} value={workOrder.scheduleTime} />
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-0 -mb-px">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'text-[10px] font-black uppercase tracking-widest px-4 py-3 border-b-2 transition-colors whitespace-nowrap',
                  activeTab === tab
                    ? 'border-brand-red text-brand-red'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* ── Body (scrollable) ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-1">

          {/* ══ Overview ════════════════════════════════════════════════ */}
          {activeTab === 'Overview' && (
            <div className="space-y-5">
              {/* Job details grid */}
              <div>
                <SectionLabel>Job Details</SectionLabel>
                <InfoGrid items={[
                  { label: 'Client',     value: workOrder.clientName || '—' },
                  { label: 'Job Type',   value: workOrder.jobType || workOrder.projectType || '—' },
                  { label: 'Priority',   value: workOrder.priority ? (workOrder.priority.charAt(0).toUpperCase() + workOrder.priority.slice(1)) : '—' },
                  { label: 'Pay Type',   value: PAY_TYPE_LABELS[workOrder.payType || 'fixed'] || '—' },
                  { label: 'Date',       value: workOrder.scheduleDate || assignment.currentScheduledDate || '—' },
                  { label: 'Time',       value: workOrder.scheduleTime || '—' },
                ]} />
              </div>

              {/* Location */}
              <div>
                <SectionLabel>Location</SectionLabel>
                <div className="bg-bg-secondary border border-border-sub rounded-xl p-3 flex items-start gap-3 mb-5">
                  <MapPin size={14} className="text-brand-red shrink-0 mt-0.5" />
                  <p className="text-[12px] text-text-secondary leading-relaxed">{workOrder.locationText || workOrder.location || '—'}</p>
                </div>
              </div>

              {/* Assigned tech */}
              <div>
                <SectionLabel>Assigned Technician</SectionLabel>
                <div className="bg-bg-secondary border border-border-sub rounded-xl p-3 flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-full bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-black text-brand-cyan">
                      {(assignment.techName || 'T').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-text-primary uppercase">{assignment.techName || 'Unassigned'}</p>
                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-wider mt-0.5">Field Technician</p>
                  </div>
                  <span className={cn(
                    'text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border',
                    STATUS_COLOR[statusKey] ?? 'text-text-muted border-border-sub bg-bg-tertiary'
                  )}>
                    {statusLabel}
                  </span>
                </div>
              </div>

              {/* Pay summary */}
              <div>
                <SectionLabel>Pay Summary</SectionLabel>
                <div className="bg-bg-secondary border border-green-border/20 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-black text-text-muted uppercase tracking-widest mb-1">{PAY_TYPE_LABELS[workOrder.payType || 'fixed'] || 'Fixed Rate'}</p>
                    <p className="text-2xl font-black font-mono text-text-green">${payout.amount.toFixed(2)}</p>
                  </div>
                  <div className="flex flex-col gap-1 text-right">
                    {payout.lines.map(({ label, value }, i) => (
                      <div key={i} className="text-[10px] text-text-muted">
                        <span className="font-bold">{label}:</span> {value}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══ Scope ════════════════════════════════════════════════════ */}
          {activeTab === 'Scope' && (
            <div className="space-y-5">

              {/* Scope description */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <SectionLabel>Scope of Work</SectionLabel>
                  <a
                    href={getFieldNationUrl(workOrder)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[9px] font-black text-brand-red uppercase tracking-widest hover:opacity-80 transition-opacity"
                  >
                    <ExternalLink size={11} />
                    Field Nation
                  </a>
                </div>
                <div className="bg-bg-secondary border border-border-sub rounded-xl p-4 text-[12px] text-text-secondary leading-relaxed text-left">
                  {workOrder.description || 'No scope description provided.'}
                </div>
              </div>

              {/* Key fields */}
              <div>
                <SectionLabel>Assignment Details</SectionLabel>
                <InfoGrid items={[
                  { label: 'Job Type',     value: workOrder.jobType || workOrder.projectType || '—' },
                  { label: 'Priority',     value: workOrder.priority ? (workOrder.priority.charAt(0).toUpperCase() + workOrder.priority.slice(1)) : '—' },
                  { label: 'Client',       value: workOrder.clientName || '—' },
                  { label: 'GPS Required', value: workOrder.gpsRequired ? 'Yes' : 'No' },
                  { label: 'Source',       value: workOrder.source || '—' },
                  { label: 'Revisit #',    value: String(workOrder.revisitCount ?? assignment.revisitCount ?? 0) },
                ]} />
              </div>

              {/* Required skills */}
              {Array.isArray(workOrder.requiredSkills) && workOrder.requiredSkills.length > 0 && (
                <div>
                  <SectionLabel>Required Skills</SectionLabel>
                  <div className="flex flex-col gap-2 mb-5">
                    {workOrder.requiredSkills.map((skill: string, i: number) => (
                      <div key={i} className="flex items-center gap-3 bg-bg-secondary border border-border-sub rounded-xl px-3 py-2.5">
                        <div className="w-5 h-5 rounded-md bg-green-dim border border-green-border/30 flex items-center justify-center shrink-0">
                          <Check size={10} className="text-text-green" />
                        </div>
                        <span className="text-[11px] font-bold text-text-primary uppercase">{skill}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {workOrder.notes && (
                <div>
                  <SectionLabel>Admin Notes</SectionLabel>
                  <div className="bg-accent-gold-dim border border-accent-gold/20 rounded-xl p-4 flex gap-3 text-left">
                    <AlertTriangle size={14} className="text-accent-gold shrink-0 mt-0.5" />
                    <p className="text-[12px] text-text-secondary leading-relaxed uppercase font-medium">{workOrder.notes}</p>
                  </div>
                </div>
              )}

              {/* Documents placeholder */}
              <div>
                <SectionLabel>Documents</SectionLabel>
                <div className="bg-bg-secondary border border-dashed border-border-sub rounded-xl p-6 text-center">
                  <FileText size={20} className="text-text-muted mx-auto mb-2" />
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">No documents attached</p>
                  <p className="text-[9px] text-text-muted mt-1">Document upload available for completed assignments.</p>
                </div>
              </div>

              {/* Pay model */}
              <div>
                <SectionLabel>Pay Structure</SectionLabel>
                <div className="bg-bg-secondary border border-green-border/20 rounded-xl p-4 flex items-center justify-between mb-3">
                  <div className="text-left">
                    <p className="text-[9px] font-black text-text-muted uppercase tracking-widest mb-1 text-left">
                      Pay Type
                    </p>
                    <p className="text-[13px] font-black text-text-primary uppercase tracking-wide text-left">
                      {PAY_TYPE_LABELS[workOrder.payType || 'fixed'] || 'Fixed Rate'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-text-muted uppercase tracking-widest mb-1 text-right">
                      Calculated Payout
                    </p>
                    <p className="text-2xl font-black font-mono text-text-green text-right">
                      ${payout.amount.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className={cn(
                  'grid gap-2 mb-5',
                  payout.lines.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
                )}>
                  {payout.lines.map(({ label, value }, i) => (
                    <div key={i} className="bg-bg-tertiary border border-border-sub rounded-xl p-3 text-left">
                      <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.16em] mb-1 text-left">{label}</p>
                      <p className={cn(
                        'text-[12px] font-bold font-mono text-left',
                        label === 'Total' || label === 'Fixed Amount' ? 'text-text-green' : 'text-text-primary'
                      )}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* ══ Activity Ledger ══════════════════════════════════════════ */}
          {activeTab === 'Activity Ledger' && (
            <div>
              <SectionLabel>Assignment Timeline</SectionLabel>
              <div className="mt-1">
                <LedgerEntry
                  dot="blue"
                  time={assignment.assignedAt ? format(parseISO(assignment.assignedAt), 'MMM d, h:mm a') : '—'}
                  title="Assignment Created"
                  note="Work order assigned and sent to technician."
                  by={`By: ${assignment.assignedBy || 'Admin'}`}
                />
                <LedgerEntry
                  dot={assignment.acknowledgmentMissed ? 'red' : 'gold'}
                  time={assignment.acknowledgedAt ? format(parseISO(assignment.acknowledgedAt), 'MMM d, h:mm a') : '—'}
                  title={assignment.acknowledgmentMissed ? 'Acknowledgment Missed' : 'Acknowledgment Received'}
                  note={
                    assignment.acknowledgmentMissed
                      ? 'Acknowledgment window elapsed without tech response. Penalty event recorded.'
                      : 'Technician confirmed receipt.'
                  }
                  by={assignment.acknowledgmentMissed ? 'By: System — Auto' : `By: ${assignment.techName}`}
                />
                {assignment.status === 'on-my-way' || assignment.status === 'in-progress' || assignment.status === 'checked-out' || assignment.status === 'completed' ? (
                  <LedgerEntry
                    dot="gold"
                    time="—"
                    title="En Route — Status Update"
                    note="Technician updated status to On My Way."
                    by={`By: ${assignment.techName}`}
                  />
                ) : null}
                {(assignment.status === 'in-progress' || assignment.status === 'checked-out' || assignment.status === 'completed') && (
                  <LedgerEntry
                    dot="green"
                    time={assignment.confirmedStartAt ? format(parseISO(assignment.confirmedStartAt), 'MMM d, h:mm a') : '—'}
                    title="Check-In — On Site"
                    note="Technician checked in at job location."
                    by={`By: ${assignment.techName}`}
                  />
                )}
                {(assignment.status === 'checked-out' || assignment.status === 'completed') && (
                  <LedgerEntry
                    dot="green"
                    time="—"
                    title="Check-Out — Work Complete"
                    note={`Outcome: ${OUTCOME_LABELS[assignment.latestOutcomeCode || 'worked_completed'] || 'Completed'}.${assignment.revisitCount && assignment.revisitCount > 0 ? ` Revisit count: ${assignment.revisitCount}.` : ' No revisit required.'}`}
                    by={`By: ${assignment.techName}`}
                  />
                )}
                {assignment.status === 'completed' && (
                  <LedgerEntry
                    dot="blue"
                    time={assignment.updatedAt ? format(parseISO(assignment.updatedAt), 'MMM d, h:mm a') : '—'}
                    title="Assignment Closed"
                    note="Assignment finalized. Payout queued for payroll processing."
                    by="By: System — Auto"
                    isLast
                  />
                )}
              </div>

              {/* Revisit flag */}
              {assignment.revisitCount && assignment.revisitCount > 0 && (
                <div className="mt-2 text-left">
                  <SectionLabel>Revisit History</SectionLabel>
                  <div className="bg-brand-red-dim border border-brand-red/20 rounded-xl p-4 flex items-start gap-3 text-left">
                    <RotateCcw size={14} className="text-text-red shrink-0 mt-0.5" />
                    <div className="text-left">
                      <p className="text-[11px] font-bold text-text-primary uppercase text-left">
                        {assignment.revisitCount} revisit{assignment.revisitCount > 1 ? 's' : ''} recorded
                      </p>
                      <p className="text-[10px] text-text-muted mt-0.5 text-left">
                        Latest outcome code: {OUTCOME_LABELS[assignment.latestOutcomeCode || ''] || 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Removal flag */}
              {assignment.removedAfterAcknowledgment && (
                <div className="mt-4 text-left">
                  <div className="bg-accent-gold-dim border border-accent-gold/20 rounded-xl p-4 flex items-start gap-3 text-left">
                    <AlertTriangle size={14} className="text-accent-gold shrink-0 mt-0.5" />
                    <div className="text-left">
                      <p className="text-[11px] font-bold text-text-primary uppercase text-left">Removed After Acknowledgment</p>
                      <p className="text-[10px] text-text-muted mt-0.5 text-left">
                        Reason: {assignment.removalReasonCode || 'Not specified'}.
                        {assignment.removedAt ? ` Removed: ${format(parseISO(assignment.removedAt), 'MMM d, h:mm a')}` : ''}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ Admin Review ═════════════════════════════════════════════ */}
          {activeTab === 'Admin Review' && (
            <div className="space-y-5">
              {loadingAdmin ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3">
                  <div className="w-6 h-6 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Loading review data...</p>
                </div>
              ) : (
                <>
                  {/* Assignment flags */}
                  {(assignment.needsAdminReview || assignment.acknowledgmentMissed) && (
                    <div>
                      <SectionLabel>Active Flags</SectionLabel>
                      <div className="flex flex-col gap-2 mb-1">
                        {assignment.needsAdminReview && (
                          <div className="flex items-center gap-3 bg-brand-red-dim border border-brand-red/20 rounded-xl px-4 py-3 text-left">
                            <AlertTriangle size={14} className="text-text-red shrink-0" />
                            <div className="text-left">
                              <p className="text-[11px] font-bold text-text-red uppercase tracking-wide text-left">Requires Admin Review</p>
                              <p className="text-[10px] text-text-muted mt-0.5 text-left">This assignment has been flagged for manual review.</p>
                            </div>
                          </div>
                        )}
                        {assignment.acknowledgmentMissed && (
                          <div className="flex items-center gap-3 bg-accent-gold-dim border border-accent-gold/20 rounded-xl px-4 py-3 text-left">
                            <AlertTriangle size={14} className="text-accent-gold shrink-0" />
                            <div className="text-left">
                              <p className="text-[11px] font-bold text-accent-gold uppercase tracking-wide text-left">Acknowledgment Missed</p>
                              <p className="text-[10px] text-text-muted mt-0.5 text-left">
                                Required by {assignment.acknowledgmentRequiredAt ? format(parseISO(assignment.acknowledgmentRequiredAt), 'MMM d, h:mm a') : '—'}.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Financial record */}
                  <div>
                    <SectionLabel>Payout Record</SectionLabel>
                    {adminData.financialRecord ? (
                      <div className="bg-bg-secondary border border-border-sub rounded-xl overflow-hidden mb-1">
                        <div className="flex items-center justify-between p-4 border-b border-border-sub">
                          <div className="text-left">
                            <p className="text-[9px] font-black text-text-muted uppercase tracking-widest mb-1 text-left">Final Amount</p>
                            <p className="text-xl font-black font-mono text-text-green text-left">
                              ${adminData.financialRecord.amount.toFixed(2)}
                            </p>
                          </div>
                          <div className="text-right flex flex-col gap-1.5">
                            <span className={cn(
                              'text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border',
                              adminData.financialRecord.paymentStatus === 'paid'
                                ? 'text-text-green border-green-border/40 bg-green-dim'
                                : 'text-accent-gold border-accent-gold/30 bg-accent-gold-dim'
                            )}>
                              {adminData.financialRecord.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
                            </span>
                            <span className={cn(
                              'text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border',
                              adminData.financialRecord.reviewStatus === 'approved'
                                ? 'text-text-green border-green-border/40 bg-green-dim'
                                : adminData.financialRecord.reviewStatus === 'under_review'
                                ? 'text-accent-gold border-accent-gold/30 bg-accent-gold-dim'
                                : 'text-text-muted border-border-sub bg-bg-tertiary'
                            )}>
                              {adminData.financialRecord.reviewStatus === 'approved' ? 'Approved'
                                : adminData.financialRecord.reviewStatus === 'under_review' ? 'Under Review'
                                : 'Pending'}
                            </span>
                          </div>
                        </div>
                        <div className="p-4 space-y-1 text-left">
                          <p className="text-[10px] text-text-muted leading-relaxed text-left uppercase font-medium italic">&quot;{adminData.financialRecord.note}&quot;</p>
                          {adminData.financialRecord.reviewedBy && (
                            <p className="text-[9px] font-bold text-text-muted/60 uppercase tracking-widest text-left">
                              Reviewed by: {adminData.financialRecord.reviewedBy}
                              {adminData.financialRecord.reviewedAt
                                ? ` · ${format(parseISO(adminData.financialRecord.reviewedAt), 'MMM d, h:mm a')}`
                                : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-bg-secondary border border-dashed border-border-sub rounded-xl p-6 text-center mb-1">
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">No settlement record found</p>
                        <p className="text-[9px] text-text-muted mt-1">Financial record will appear once payout is processed.</p>
                      </div>
                    )}
                  </div>

                  {/* Penalty events */}
                  <div>
                    <SectionLabel>Reliability Events</SectionLabel>
                    {adminData.penaltyEvents.length === 0 ? (
                      <div className="bg-green-dim border border-green-border/20 rounded-xl p-4 flex items-center gap-3 mb-1 text-left">
                        <ShieldCheck size={14} className="text-text-green shrink-0" />
                        <p className="text-[11px] font-bold text-text-green uppercase tracking-wide">No penalty events linked to this assignment</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 mb-1">
                        {adminData.penaltyEvents.map(evt => (
                          <div key={evt.id} className={cn(
                            'flex items-start gap-3 rounded-xl border px-4 py-3 text-left',
                            evt.points < 0
                              ? 'bg-brand-red-dim border-brand-red/20'
                              : 'bg-green-dim border-green-border/20'
                          )}>
                            <div className={cn(
                              'w-7 h-7 rounded-full border flex items-center justify-center shrink-0 mt-0.5 font-black text-[10px]',
                              evt.points < 0
                                ? 'bg-brand-red/10 border-brand-red/30 text-text-red'
                                : 'bg-green-dim border-green-border/40 text-text-green'
                            )}>
                              {evt.points > 0 ? '+' : ''}{evt.points}
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                              <p className={cn(
                                'text-[11px] font-bold uppercase tracking-wide text-left',
                                evt.points < 0 ? 'text-text-red' : 'text-text-green'
                              )}>
                                {evt.type.replace(/_/g, ' ')}
                              </p>
                              <p className="text-[10px] text-text-muted mt-0.5 leading-relaxed text-left">{evt.note}</p>
                              <p className="text-[9px] font-bold text-text-muted/60 uppercase tracking-widest mt-1 text-left">
                                {evt.recordedBy === 'system' ? 'Auto — System' : `By: ${evt.recordedBy}`}
                                {evt.createdAt ? ` · ${format(parseISO(evt.createdAt), 'MMM d, h:mm a')}` : ''}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Schedule history */}
                  <div>
                    <SectionLabel>Schedule History</SectionLabel>
                    {adminData.history.length === 0 ? (
                      <div className="bg-bg-secondary border border-dashed border-border-sub rounded-xl p-6 text-center mb-1">
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">No schedule changes recorded</p>
                      </div>
                    ) : (
                      <div className="mt-1">
                        {adminData.history.map((entry, i) => (
                          <LedgerEntry
                            key={entry.id}
                            dot={
                              entry.eventType === 'assigned'    ? 'blue' :
                              entry.eventType === 'rescheduled' ? 'gold' :
                              entry.eventType === 'completed'   ? 'green' :
                              entry.eventType === 'cancelled'   ? 'red' : 'gray'
                            }
                            time={entry.changedAt ? format(parseISO(entry.changedAt), 'MMM d, h:mm a') : '—'}
                            title={HISTORY_EVENT_LABELS[entry.eventType] || entry.eventType}
                            note={
                              entry.note ||
                              (entry.oldScheduledDate && entry.newScheduledDate
                                ? `${entry.oldScheduledDate} → ${entry.newScheduledDate}${entry.reasonCode ? ` · ${entry.reasonCode}` : ''}`
                                : `Date: ${entry.newScheduledDate}`)
                            }
                            by={`By: ${entry.changedBy}`}
                            isLast={i === adminData.history.length - 1}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="shrink-0 px-6 py-4 border-t border-border-sub flex items-center justify-between bg-bg-tertiary/20">
          <div className="flex items-center gap-2 text-[9px] font-black text-text-muted uppercase tracking-widest">
            <Lock size={11} />
            {isLocked ? 'Record Locked' : 'Record Active'}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-9 px-6 text-[10px] font-black uppercase tracking-widest border-border-sub hover:border-border-main"
          >
            Close
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}