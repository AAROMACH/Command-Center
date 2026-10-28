'use client';
import { logDisplayStatus } from '@/lib/weekly-log-core';

import { viewForTech, isHelperOn } from '@/lib/helper-progress';
import { isLockedLog } from '@/lib/weekly-log-core';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { db } from '@/lib/firebase';
import {
  doc, getDoc, collection, query, where, onSnapshot,
  updateDoc, arrayUnion, addDoc,
} from 'firebase/firestore';
import type { WorkOrder, Technician, WeeklyLog } from '@/lib/types';
import { effectiveJobPay } from '@/lib/payroll';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, ShieldCheck, Phone, Mail, Calendar, Clock, DollarSign,
  Briefcase, MapPin, Navigation, AlertTriangle, Users, Check,
  Flag, Activity, MessageSquare, ExternalLink, Wrench, Play,
  LogIn, LogOut, CheckCircle2, RotateCcw,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn, getTacticalLocation, getTacticalCoords, calculateDistance } from '@/lib/utils';
import { canConfirm, canStartTrip, canCheckIn, canCheckOut, canComplete, reopenStatusFor } from '@/lib/trip-flow';
import { externalWorkOrderId } from '@/lib/work-order-identity';
import { removeJobFromDraftLogs } from '@/lib/weekly-log';
import { useAuth } from '@/contexts/auth-context';
import { useTechJobActions } from '@/hooks/use-tech-job-actions';
import type { TechJobAction } from '@/lib/tech-job-actions';
import { setDoc } from 'firebase/firestore';
import { startOfWeek } from 'date-fns';
import { isAssignedTo, parseLocalDate } from '@/lib/jobs';
import { techDisplayName } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { statusLabel } from '@/lib/status-styles';
import { EmptyState, PageLoading } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';

const AssignmentMap = dynamic(
  () => import('@/app/admin/assignments/[id]/assignment-map'),
  { ssr: false }
);

function getTechBg(name: string): string {
  const palette = ['#e11d48','#9333ea','#0ea5e9','#d97706','#059669','#6366f1','#0d9488','#dc2626'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function getStatusLabel(status: string) {
  return ({
    unassigned: 'Unassigned', assigned: 'Assigned', confirmed: 'Confirmed',
    'on-my-way': 'On my way', 'in-progress': 'In progress',
    'checked-out': 'Checked out', completed: 'Completed',
  } as Record<string, string>)[status] || status;
}

function formatTime(t?: string) {
  if (!t) return '—';
  if (/[ap]m/i.test(t)) return t;
  try {
    const [h, m] = t.split(':').map(Number);
    const p = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${String(h12).padStart(2, '0')}:${String(m || 0).padStart(2, '0')} ${p}`;
  } catch { return t; }
}

function parseScheduleDate(s: string): Date | null {
  if (!s) return null;
  try {
    const parts = s.split(/[-/]/);
    if (parts[0]?.length === 4) return new Date(s + 'T12:00:00');
    const [m, d, y] = parts;
    if (m && d && y) return new Date(+y, +m - 1, +d, 12);
  } catch {}
  return null;
}

function TechCard({ tech, label }: { tech: Technician; label?: string }) {
  const bg = getTechBg(tech.name);
  const isPrimary = label === 'Lead';
  return (
    <div className="flex items-center gap-3 p-3 bg-bg-primary/40 rounded-xl border border-border-sub h-full">
      <div
        className="h-9 w-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
        style={{ background: bg }}
      >
        {tech.name.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-1">
          <p className="text-[13px] font-semibold text-text-primary truncate">{tech.name}</p>
          {label && (
            <span
              className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-px rounded-full border"
              style={{
                background: isPrimary ? 'color-mix(in srgb, var(--text-green) 10%, transparent)' : 'color-mix(in srgb, var(--accent-gold) 10%, transparent)',
                color: isPrimary ? 'var(--text-green)' : 'var(--accent-gold)',
                borderColor: isPrimary ? 'color-mix(in srgb, var(--text-green) 20%, transparent)' : 'color-mix(in srgb, var(--accent-gold) 20%, transparent)',
              }}
            >
              {label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-text-muted">
          <Phone size={8} />
          <Mail size={8} />
          <div className="w-px h-3 bg-border-sub" />
          <Calendar size={8} />
          <span className="text-[11px] font-mono text-text-secondary">{tech.currentWorkload ?? '—'}</span>
          <Clock size={8} />
          <span className="text-[11px] font-mono text-text-secondary">—</span>
        </div>
      </div>
    </div>
  );
}

/** A helper sees the job with their own status/trip (lib/helper-progress). */
function asSeenByMe(job: WorkOrder): WorkOrder {
  const me = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('currentUserId') : null;
  return me ? viewForTech(job, me) : job;
}

export default function TechAssignmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const assignmentId = params?.id as string;

  const [currentTechId, setCurrentTechId] = useState<string | null>(null);
  // History entries name the signed-in tech (a helper acting on the job, not the lead).
  const { user: me } = useAuth();
  const { run: runAction, weekDialog } = useTechJobActions(currentTechId, techDisplayName(me));
  const [assignment, setAssignment] = useState<WorkOrder | null>(null);
  const [tech, setTech] = useState<Technician | null>(null);
  const [helperTechs, setHelperTechs] = useState<Technician[]>([]);
  const [relatedLogs, setRelatedLogs] = useState<WeeklyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [detailView, setDetailView] = useState<'overview' | 'history'>('overview');
  const [historyTypeFilter, setHistoryTypeFilter] = useState('all');

  useEffect(() => {
    const uid = sessionStorage.getItem('currentUserId');
    setCurrentTechId(uid);
  }, []);

  // Load assignment (assignments collection first, fallback workOrders)
  useEffect(() => {
    if (!assignmentId) return;
    let unsub: (() => void) | null = null;

    (async () => {
      const aSnap = await getDoc(doc(db, 'assignments', assignmentId));
      if (aSnap.exists()) {
        setAssignment(asSeenByMe({ ...aSnap.data(), id: aSnap.id } as WorkOrder));
        setLoading(false);
        // Live updates
        unsub = onSnapshot(doc(db, 'assignments', assignmentId), s => {
          if (s.exists()) setAssignment(asSeenByMe({ ...s.data(), id: s.id } as WorkOrder));
        });
        return;
      }
      const wSnap = await getDoc(doc(db, 'workOrders', assignmentId));
      if (wSnap.exists()) {
        setAssignment(asSeenByMe({ ...wSnap.data(), id: wSnap.id } as WorkOrder));
        unsub = onSnapshot(doc(db, 'workOrders', assignmentId), s => {
          if (s.exists()) setAssignment(asSeenByMe({ ...s.data(), id: s.id } as WorkOrder));
        });
      }
      setLoading(false);
    })();

    return () => unsub?.();
  }, [assignmentId]);

  // Load primary tech
  useEffect(() => {
    if (!assignment) return;
    const tid = assignment.assignedTechnicianId || assignment.techId || assignment.assignedTechIds?.[0];
    if (!tid) return;
    return onSnapshot(doc(db, 'users', tid), s => {
      if (s.exists()) setTech({ ...s.data(), id: s.id } as Technician);
    });
  }, [assignment?.assignedTechnicianId, assignment?.techId]);

  // Load helper techs
  useEffect(() => {
    if (!assignment?.additionalTechnicianIds?.length) { setHelperTechs([]); return; }
    const ids = assignment.additionalTechnicianIds;
    Promise.all(ids.map(id => getDoc(doc(db, 'users', id)))).then(snaps => {
      setHelperTechs(snaps.filter(s => s.exists()).map(s => ({ ...s.data(), id: s.id } as Technician)));
    });
  }, [assignment?.additionalTechnicianIds]);

  // Weekly logs for this assignment
  useEffect(() => {
    if (!assignment || !currentTechId) return;
    return onSnapshot(
      query(collection(db, 'weeklyLogs'), where('techId', '==', currentTechId)),
      s => setRelatedLogs(
        s.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog))
          .filter(l => l.items?.some(i => i.workOrderId === assignmentId))
      )
    );
  }, [assignment, assignmentId, currentTechId]);

  // Security: redirect if this assignment isn't theirs
  useEffect(() => {
    if (!assignment || !currentTechId || loading) return;
    // Assigned tech (what admin screens show) or a listed helper only — a stale
    // techId from an out-of-sync swap doesn't make the job theirs.
    const isTheirs =
      isAssignedTo(assignment, currentTechId) ||
      assignment.additionalTechnicianIds?.includes(currentTechId);
    if (!isTheirs) router.push('/tech/assignments');
  }, [assignment, currentTechId, loading, router]);

  // ── Status action handlers ────────────────────────────────────────────────
  // Same shared workflow as the dashboard, calendar and assignments list
  // (lib/tech-job-actions.ts): trip records, history, weekly-log filing.
  const withLoading = (fn: () => Promise<void>) => async () => {
    setActionLoading(true);
    try { await fn(); } finally { setActionLoading(false); }
  };

  const techName = techDisplayName(tech);
  const act = (action: TechJobAction) => withLoading(async () => { if (assignment) await runAction(assignment, action); });
  const handleConfirm = act('confirm');
  const handleStartTrip = act('startTrip');
  const handleCheckIn = act('checkIn');
  const handleCheckOut = act('checkOut');
  const handleMarkComplete = act('complete');
  const handleReopen = act('reopen');

  // ── Loading / not found ───────────────────────────────────────────────────
  // This job's pay on a weekly log (FN fee/split applied) — not the whole
  // week's total, which also went stale after pay corrections.
  const jobPayIn = (log: WeeklyLog) => {
    const item = log.items?.find(i => i.workOrderId === assignmentId);
    return item ? effectiveJobPay(item, assignment ?? undefined) : 0;
  };

  if (loading) return <PageLoading label="Loading job…" />;

  if (!assignment) return (
    <div className="space-y-4">
      <PageHeader back={{ href: '/tech/assignments', label: 'My jobs' }} title="Job not found" />
      <EmptyState icon={AlertTriangle} title="We couldn't find this job" description={`It may have been removed or reassigned. (${assignmentId})`} />
    </div>
  );

  // ── Derived values ────────────────────────────────────────────────────────
  const status = assignment.status;
  const payLabel = assignment.payType === 'hourly'
    ? `$${assignment.pay}/hr`
    : assignment.payType === 'blended'
      ? `$${assignment.blendedFixedPay} + $${assignment.blendedHourlyRate}/hr`
      : `$${(assignment.pay || 0).toFixed(2)}`;

  const endTime = (assignment as any).scheduleEndTime;

  const riskLabel =
    assignment.slaStatus === 'at-risk' ? 'At risk'
    : assignment.slaStatus === 'breached' ? 'Breached'
    : (assignment.revisitCount || 0) > 0 ? 'At risk'
    : assignment.slaStatus === 'on-track' ? 'On track'
    : assignment.slaStatus === 'met' ? 'Met'
    : '—';

  const dateObj = parseScheduleDate(assignment.scheduleDate);
  const dayName  = dateObj ? format(dateObj, 'EEEE') : '—';
  const monthStr = dateObj ? format(dateObj, 'MMM') : '—';
  const dayNum   = dateObj ? format(dateObj, 'd') : '—';
  const yearStr  = dateObj ? format(dateObj, 'yyyy') : '—';

  const HISTORY_COLORS = ['var(--text-green)', 'var(--accent-gold)', 'var(--brand-blue)', 'var(--priority-critical)'];
  const recentHistory = [...(assignment.history || [])].reverse().slice(0, 6);

  const jobDetailRows: { label: string; value?: string; icon: React.ElementType }[] = [
    { label: 'Client',      value: assignment.clientName,                                          icon: Users },
    { label: 'Location',    value: assignment.location,                                             icon: MapPin },
    { label: 'Job type',    value: assignment.jobType || assignment.projectType,                   icon: Wrench },
    { label: 'Pay',         value: payLabel,                                                        icon: DollarSign },
    { label: 'Work order',  value: assignment.externalWorkOrderId || assignmentId.toUpperCase(),   icon: ExternalLink },
    { label: 'Source',      value: assignment.source || '—',                                       icon: Activity },
  ];

  const statusStripItems = [
    { icon: Flag,          label: 'Priority',   value: assignment.priority
        ? assignment.priority.charAt(0).toUpperCase() + assignment.priority.slice(1) : '—',
      color: assignment.priority === 'critical' ? 'var(--priority-critical)'
        : assignment.priority === 'high' ? 'var(--priority-high)'
        : assignment.priority === 'medium' ? 'var(--accent-gold)'
        : undefined },
    { icon: ShieldCheck,   label: 'Status',     value: getStatusLabel(status),
      color: status === 'confirmed' || status === 'completed' ? 'var(--text-green)' : undefined },
    { icon: AlertTriangle, label: 'Risk', value: riskLabel,
      color: riskLabel === 'At risk' || riskLabel === 'Breached' ? 'var(--accent-gold)' : undefined },
    { icon: DollarSign,    label: 'Pay type',   value: assignment.payType
        ? assignment.payType.charAt(0).toUpperCase() + assignment.payType.slice(1) : '—',
      color: undefined },
    { icon: DollarSign,    label: 'Pay', value: payLabel, color: 'var(--text-green)' },
  ];

  // Tech action buttons — only show ones relevant to current status
  const techActions = [
    {
      key: 'confirm', label: 'Confirm', icon: Check,
      show: canConfirm(assignment),
      handler: handleConfirm,
      cls: 'bg-text-green hover:bg-text-green/90 text-white border-0',
    },
    {
      key: 'start-trip', label: 'Start trip', icon: Play,
      show: canStartTrip(assignment),
      handler: handleStartTrip,
      cls: 'bg-brand-blue hover:bg-brand-blue/90 text-white border-0',
    },
    {
      key: 'check-in', label: 'Check in', icon: LogIn,
      show: canCheckIn(assignment),
      handler: handleCheckIn,
      cls: 'bg-text-green hover:bg-text-green/90 text-white border-0',
    },
    {
      key: 'check-out', label: 'Check out', icon: LogOut,
      show: canCheckOut(assignment),
      handler: handleCheckOut,
      cls: '',
    },
    {
      key: 'complete', label: 'Mark complete', icon: CheckCircle2,
      show: canComplete(assignment),
      handler: handleMarkComplete,
      cls: 'bg-text-green hover:bg-text-green/90 text-white border-0',
    },
    {
      key: 'reopen', label: 'Re-open', icon: RotateCcw,
      // Locked once it's on an Approved / Paid weekly log — payroll owns it then.
      show: status === 'completed' && !relatedLogs.some(l => isLockedLog(l)),
      handler: handleReopen,
      cls: '',
    },
  // The assigned tech, or a helper running their own part of the job
  // (helpers see their own status here — lib/helper-progress).
  ].filter(a => a.show && (isAssignedTo(assignment, currentTechId) || isHelperOn(assignment, currentTechId)));

  return (
    <div className="space-y-5 text-left pb-24">

      {/* Back ───────────────────────────────────────────────────────────── */}
      {/* Header ─────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <PageHeader
          className="!mb-2"
          back={{ href: '/tech/assignments', label: 'My jobs' }}
          eyebrow="Job"
          icon={Wrench}
          title={assignment.title || assignment.description?.split('\n')[0]?.slice(0, 80) || assignmentId.toUpperCase()}
          subtitle={assignment.clientName || undefined}
        />

        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge kind="job" value={status} label={getStatusLabel(status)} />
          {assignment.priority && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border border-accent-gold/30 bg-accent-gold/10 text-accent-gold">
              {assignment.priority} priority
            </span>
          )}
          <span className="id-text">{assignmentId.toUpperCase()}</span>
          {assignment.shortId && (
            <>
              <span className="text-text-muted text-[10px]">•</span>
              <span className="text-[10px] font-mono text-text-muted">{assignment.shortId.toUpperCase()}</span>
            </>
          )}
          {assignment.source && (
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue border border-brand-blue/20">
              <span className="h-1.5 w-1.5 rounded-full inline-block bg-brand-blue" />
              {assignment.source}
            </span>
          )}
        </div>
      </div>

      {/* Team (read-only for techs) ──────────────────────────────────────── */}
      <div className="bg-bg-secondary rounded-xl border border-border-main shadow-sm p-4">
        <p className="section-label flex items-center gap-2 mb-4">
          <Users size={12} className="text-brand-red" /> Team
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {tech && <TechCard tech={tech} label="Lead" />}
          {helperTechs.map(ht => (
            <TechCard key={ht.id} tech={ht} label="Helper" />
          ))}
          {!tech && helperTechs.length === 0 && (
            <div className="col-span-full py-6 text-center">
              <p className="text-[12px] text-text-muted">No team assigned</p>
            </div>
          )}
        </div>
      </div>

      {/* Page view tabs */}
      <div className="flex gap-5 border-b border-border-sub" role="tablist">
        {([['overview', 'Overview'], ['history', 'History']] as const).map(([v, text]) => (
          <button
            key={v}
            role="tab"
            aria-selected={detailView === v}
            data-state={detailView === v ? 'active' : 'inactive'}
            onClick={() => setDetailView(v)}
            className="tab-underline -mb-px min-h-[40px]"
          >
            {text}
          </button>
        ))}
      </div>

      {detailView === 'overview' && (
      <>

      {/* 3-column: Job Details | Schedule | Map ────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-5">

        {/* Job Details */}
        <div className="md:col-span-2 bg-bg-secondary rounded-xl border border-border-main shadow-sm p-4">
          <p className="section-label flex items-center gap-2 mb-3">
            <Briefcase size={12} className="text-brand-red" /> Job details
          </p>
          <div>
            {jobDetailRows.map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-start gap-3 py-2 border-b border-border-sub last:border-0">
                <Icon size={11} className="text-text-muted shrink-0 mt-0.5" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted w-20 shrink-0 leading-tight pt-0.5">{label}</span>
                <span className="text-[13px] font-medium text-text-primary min-w-0 break-words">{value || '—'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Schedule */}
        <div className="md:col-span-1 bg-bg-secondary rounded-xl border border-border-main shadow-sm p-4">
          <p className="section-label flex items-center gap-2 mb-3">
            <Calendar size={11} className="text-brand-red" /> Schedule
          </p>
          <div className="space-y-4">
            {/* Date row */}
            <div className="flex items-baseline gap-3">
              <p className="font-bold text-text-primary leading-none" style={{ fontSize: '3.25rem', fontVariantNumeric: 'tabular-nums' }}>{dayNum}</p>
              <div>
                <p className="text-[13px] font-semibold text-text-primary leading-none">{monthStr}</p>
                <p className="text-[12px] text-text-muted leading-none mt-1">{dayName} · {yearStr}</p>
              </div>
            </div>
            {/* Time row */}
            <div className="space-y-2 border-t border-border-sub pt-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1 mb-1">
                  <Clock size={10} /> Start
                </p>
                <p className="text-2xl font-bold text-text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatTime(assignment.scheduleTime)}
                </p>
              </div>
              {endTime && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1 mb-1">
                    <Clock size={10} /> End
                  </p>
                  <p className="text-2xl font-bold text-text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatTime(endTime)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="md:col-span-3 bg-bg-secondary rounded-xl border border-border-main shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-sub shrink-0 gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin size={11} style={{ color: 'var(--text-green)' }} className="shrink-0" />
              <span className="text-[12px] font-medium text-text-primary truncate">{assignment.location || '—'}</span>
            </div>
            <button
              className="h-10 sm:h-8 px-2 text-[12px] font-semibold text-text-green flex items-center gap-1 shrink-0 transition-colors hover:underline"
              onClick={() => window.open(
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(assignment.location || '')}`,
                '_blank', 'noopener'
              )}
            >
              Open map <ExternalLink size={12} />
            </button>
          </div>

          <div className="flex-1" style={{ minHeight: 170 }}>
            <AssignmentMap location={assignment.location} lat={assignment.lat} lng={assignment.lng} />
          </div>

          <div className="grid grid-cols-3 divide-x divide-border-sub border-t border-border-sub shrink-0">
            {[
              { icon: Clock,      label: 'ETA',      value: '—' },
              { icon: Navigation, label: 'Distance', value: '—' },
              { icon: Activity,   label: 'Traffic',  value: '—' },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="py-2 px-1 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted flex items-center justify-center gap-1 mb-0.5">
                  <Icon size={10} /> {label}
                </p>
                <p className="text-[12px] font-semibold text-text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</p>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* Scope + History ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

        {/* Scope of Work */}
        <div className="lg:col-span-2 bg-bg-secondary rounded-xl border border-border-main shadow-sm flex flex-col">
          <div className="p-4 flex-1">
            <p className="section-label flex items-center gap-2 mb-3">
              <Wrench size={12} className="text-brand-red" /> Scope of work
            </p>
            <p className="text-[13px] text-text-secondary leading-relaxed whitespace-pre-wrap">
              {assignment.description || '—'}
            </p>
            {assignment.notes && (
              <p className="mt-3 pt-3 border-t border-border-sub text-[12px] text-text-muted leading-relaxed">
                {assignment.notes}
              </p>
            )}
          </div>

          {/* Status strip */}
          <div className="grid grid-cols-3 sm:grid-cols-5 divide-x divide-border-sub border-t border-border-sub">
            {statusStripItems.map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="py-3 px-2 flex flex-col items-center text-center gap-1">
                <Icon size={12} style={color ? { color } : {}} className={cn(!color && 'text-text-muted')} />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted leading-none">{label}</p>
                <p className={cn('text-[12px] font-semibold leading-tight', !color && 'text-text-primary')} style={color ? { color } : {}}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel: utility buttons + status actions */}
        <div className="lg:col-span-3 space-y-4">

          {/* Always-visible utility buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" className="h-10 gap-1.5 px-3 justify-start"
              onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(assignment.location || '')}`, '_blank', 'noopener')}>
              <Navigation size={14} /> Directions
            </Button>
            <Button size="sm" variant="outline" className="h-10 gap-1.5 px-3 justify-start"
              onClick={() => router.push('/tech/messaging')}>
              <MessageSquare size={14} /> Message
            </Button>
          </div>

          {/* Status action buttons */}
          {techActions.length > 0 && (
            <div className={cn('grid gap-2', techActions.length >= 2 ? 'grid-cols-2' : 'grid-cols-1')}>
              {techActions.map(action => (
                <Button key={action.key} size="sm" variant="outline"
                  className={cn('h-10 gap-1.5 px-3 justify-start', action.cls)}
                  disabled={actionLoading}
                  onClick={action.handler}>
                  <action.icon size={14} /> {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pay Ledger ─────────────────────────────────────────────────────── */}
      <div className="bg-bg-secondary rounded-xl border border-border-main shadow-sm p-4">
        <p className="section-label mb-3 flex items-center gap-2">
          <DollarSign size={12} className="text-brand-red" /> Pay
        </p>
        {relatedLogs.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {relatedLogs.map(log => (
              <div key={log.id} className="p-3 rounded-xl bg-bg-primary border border-border-main">
                <p className="text-[13px] font-semibold text-text-primary">Week of {log.weekOf}</p>
                <p className="text-sm font-mono font-bold mt-0.5" style={{ color: 'var(--text-green)' }}>
                  ${jobPayIn(log).toFixed(2)}
                </p>
                <p className="text-[12px] text-text-muted">This job&apos;s pay</p>
                <StatusBadge kind="log" value={logDisplayStatus(log)} className="mt-1" />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-text-muted">Not on a weekly log yet</p>
        )}
      </div>

      </> // end overview
      )}

      {detailView === 'history' && (
        <div className="bg-bg-secondary rounded-xl border border-border-main shadow-sm p-4 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <p className="section-label flex items-center gap-2">
              <Activity size={12} className="text-brand-red" /> Job history
            </p>
            <Select value={historyTypeFilter} onValueChange={setHistoryTypeFilter}>
              <SelectTrigger className="h-10 sm:h-8 w-[160px] bg-bg-primary border-border-main" aria-label="Event type">
                <SelectValue placeholder="All events" />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                <SelectItem value="all" className="text-[13px]">All events</SelectItem>
                <SelectItem value="status" className="text-[13px]">Status changes</SelectItem>
                <SelectItem value="assignment" className="text-[13px]">Assignments</SelectItem>
                <SelectItem value="note" className="text-[13px]">Notes</SelectItem>
                <SelectItem value="dispatch" className="text-[13px]">Dispatch</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(() => {
            const filtered = recentHistory.filter(ev =>
              historyTypeFilter === 'all' || (ev.type || '').includes(historyTypeFilter)
            );
            return filtered.length > 0 ? (
              <div className="space-y-0 max-h-[480px] overflow-y-auto">
                {filtered.map((ev, i) => {
                  const dotColor = HISTORY_COLORS[i % HISTORY_COLORS.length];
                  let evDate: Date | null = null;
                  evDate = parseLocalDate(ev.date) ?? undefined as any;
                  const dateStr = evDate ? format(evDate, 'MM-dd-yyyy') : ev.date?.slice(0, 10) || '';
                  const timeStr = evDate ? format(evDate, 'h:mm a') : '';
                  const typeLabel = statusLabel(ev.type || 'event');
                  return (
                    <div key={i} className="flex gap-3 py-2.5 border-b border-border-sub last:border-0">
                      <div className="flex flex-col items-center shrink-0 pt-1">
                        <div className="h-2 w-2 rounded-full shrink-0" style={{ background: dotColor }} />
                        {i < filtered.length - 1 && (
                          <div className="w-px mt-1.5 flex-1 min-h-[16px]" style={{ background: `${dotColor}30` }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-0.5">
                          <div>
                            <span className="text-[11px] font-mono text-text-muted">{dateStr}</span>
                            {timeStr && <span className="text-[11px] font-mono text-text-muted ml-2">{timeStr}</span>}
                          </div>
                          {ev.user && (
                            <span className="text-[11px] font-medium text-text-muted shrink-0">{ev.user}</span>
                          )}
                        </div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: dotColor }}>{typeLabel}</p>
                        {ev.details && <p className="text-[12px] text-text-secondary leading-snug">{ev.details}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState compact icon={Activity} title="No history yet" />
            );
          })()}
        </div>
      )}

      {weekDialog}
    </div>
  );
}
