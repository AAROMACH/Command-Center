'use client';

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
    'on-my-way': 'En Route', 'in-progress': 'In Progress',
    'checked-out': 'Checked Out', completed: 'Completed',
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
  const isPrimary = label === 'PRIMARY';
  return (
    <div className="flex items-center gap-3 p-3 bg-bg-primary/40 rounded-xl border border-border-sub h-full">
      <div
        className="h-9 w-9 rounded-full flex items-center justify-center text-white font-black text-sm shrink-0 uppercase"
        style={{ background: bg }}
      >
        {tech.name.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-1">
          <p className="text-[11px] font-black uppercase text-text-primary truncate">{tech.name}</p>
          {label && (
            <span
              className="shrink-0 text-[7px] font-black uppercase tracking-widest px-1.5 py-px rounded border"
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
          <ShieldCheck size={8} style={{ color: 'var(--text-green)' }} />
          <span className="text-[9px] font-mono text-text-secondary">{(tech.reliabilityScore ?? 0).toFixed(1)}</span>
          <Calendar size={8} />
          <span className="text-[9px] font-mono text-text-secondary">{tech.currentWorkload ?? '—'}</span>
          <Clock size={8} />
          <span className="text-[9px] font-mono text-text-secondary">—</span>
        </div>
      </div>
    </div>
  );
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
        setAssignment({ ...aSnap.data(), id: aSnap.id } as WorkOrder);
        setLoading(false);
        // Live updates
        unsub = onSnapshot(doc(db, 'assignments', assignmentId), s => {
          if (s.exists()) setAssignment({ ...s.data(), id: s.id } as WorkOrder);
        });
        return;
      }
      const wSnap = await getDoc(doc(db, 'workOrders', assignmentId));
      if (wSnap.exists()) {
        setAssignment({ ...wSnap.data(), id: wSnap.id } as WorkOrder);
        unsub = onSnapshot(doc(db, 'workOrders', assignmentId), s => {
          if (s.exists()) setAssignment({ ...s.data(), id: s.id } as WorkOrder);
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

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <p className="text-xs font-bold uppercase text-text-muted tracking-widest animate-pulse">Loading assignment...</p>
    </div>
  );

  if (!assignment) return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="h-8 text-[10px] uppercase font-bold text-text-muted"
        onClick={() => router.push('/tech/assignments')}>
        <ArrowLeft size={13} className="mr-1.5" /> Back
      </Button>
      <div className="py-24 text-center border border-dashed border-border-sub rounded-xl">
        <AlertTriangle size={32} className="mx-auto text-text-muted mb-2 opacity-40" />
        <p className="text-xs font-bold uppercase text-text-muted">Assignment not found</p>
        <p className="text-[10px] text-text-muted mt-1 uppercase">{assignmentId}</p>
      </div>
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
    assignment.slaStatus === 'at-risk' ? 'At Risk'
    : assignment.slaStatus === 'breached' ? 'Breached'
    : (assignment.revisitCount || 0) > 0 ? 'At Risk'
    : assignment.slaStatus === 'on-track' ? 'On Track'
    : assignment.slaStatus === 'met' ? 'Met'
    : '—';

  const dateObj = parseScheduleDate(assignment.scheduleDate);
  const dayName  = dateObj ? format(dateObj, 'EEEE').toUpperCase() : '—';
  const monthStr = dateObj ? format(dateObj, 'MMM').toUpperCase() : '—';
  const dayNum   = dateObj ? format(dateObj, 'd') : '—';
  const yearStr  = dateObj ? format(dateObj, 'yyyy') : '—';

  const HISTORY_COLORS = ['var(--text-green)', 'var(--accent-gold)', 'var(--brand-blue)', 'var(--priority-critical)'];
  const recentHistory = [...(assignment.history || [])].reverse().slice(0, 6);

  const jobDetailRows: { label: string; value?: string; icon: React.ElementType }[] = [
    { label: 'Client',      value: assignment.clientName,                                          icon: Users },
    { label: 'Location',    value: assignment.location,                                             icon: MapPin },
    { label: 'Job Type',    value: assignment.jobType || assignment.projectType,                   icon: Wrench },
    { label: 'Pay',         value: payLabel,                                                        icon: DollarSign },
    { label: 'Work Order',  value: assignment.externalWorkOrderId || assignmentId.toUpperCase(),   icon: ExternalLink },
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
    { icon: AlertTriangle, label: 'Risk Level', value: riskLabel,
      color: riskLabel === 'At Risk' || riskLabel === 'Breached' ? 'var(--accent-gold)' : undefined },
    { icon: DollarSign,    label: 'Pay Type',   value: assignment.payType
        ? assignment.payType.charAt(0).toUpperCase() + assignment.payType.slice(1) : '—',
      color: undefined },
    { icon: DollarSign,    label: 'Pay Amount', value: payLabel, color: 'var(--text-green)' },
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
      key: 'start-trip', label: 'Start Trip', icon: Play,
      show: canStartTrip(assignment),
      handler: handleStartTrip,
      cls: 'bg-blue-600 hover:bg-blue-500 text-white border-0',
    },
    {
      key: 'check-in', label: 'Check In', icon: LogIn,
      show: canCheckIn(assignment),
      handler: handleCheckIn,
      cls: 'bg-text-green hover:bg-text-green/90 text-white border-0',
    },
    {
      key: 'check-out', label: 'Check Out', icon: LogOut,
      show: canCheckOut(assignment),
      handler: handleCheckOut,
      cls: '',
    },
    {
      key: 'complete', label: 'Mark Complete', icon: CheckCircle2,
      show: canComplete(assignment),
      handler: handleMarkComplete,
      cls: 'bg-text-green hover:bg-text-green/90 text-white border-0',
    },
    {
      key: 'reopen', label: 'Re-open', icon: RotateCcw,
      show: status === 'completed',
      handler: handleReopen,
      cls: '',
    },
  // Status actions belong to the assigned tech only — a helper can view the
  // job but not move it through confirm / trip / complete.
  ].filter(a => a.show && isAssignedTo(assignment, currentTechId));

  return (
    <div className="space-y-5 text-left pb-24">

      {/* Back ───────────────────────────────────────────────────────────── */}
      <Button variant="ghost" size="sm"
        className="h-8 text-[10px] uppercase font-bold text-text-muted -ml-2"
        onClick={() => router.push('/tech/assignments')}>
        <ArrowLeft size={13} className="mr-1.5" /> Back to Assignments
      </Button>

      {/* Header ─────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-start gap-3 flex-wrap">
          <h1 className="text-xl font-black uppercase tracking-tight text-text-primary leading-none">
            {assignment.title || assignment.description?.split('\n')[0]?.slice(0, 80) || assignmentId.toUpperCase()}
          </h1>
          <ShieldCheck size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--text-green)' }} />
          {assignment.priority && (
            <span
              className="text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded border shrink-0 self-start"
              style={{ background: 'color-mix(in srgb, var(--accent-gold) 10%, transparent)', color: 'var(--accent-gold)', borderColor: 'color-mix(in srgb, var(--accent-gold) 30%, transparent)' }}
            >
              {assignment.priority} Priority
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded"
            style={{ background: 'color-mix(in srgb, var(--text-green) 12%, transparent)', color: 'var(--text-green)', border: '1px solid color-mix(in srgb, var(--text-green) 25%, transparent)' }}
          >
            <Check size={9} /> {getStatusLabel(status)}
          </span>
          <span className="text-[10px] font-mono font-bold text-text-muted uppercase">{assignmentId.toUpperCase()}</span>
          {assignment.shortId && (
            <>
              <span className="text-text-muted text-[10px]">•</span>
              <span className="text-[10px] font-mono text-text-muted">{assignment.shortId.toUpperCase()}</span>
            </>
          )}
          {assignment.source && (
            <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded bg-brand-blue/10 text-brand-blue border border-brand-blue/20">
              <span className="h-1.5 w-1.5 rounded-full inline-block bg-brand-blue" />
              {assignment.source}
            </span>
          )}
        </div>
      </div>

      {/* Team (read-only for techs) ──────────────────────────────────────── */}
      <div className="bg-bg-secondary rounded-xl border border-border-sub p-4">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2 mb-4">
          <Users size={11} className="text-brand-red" /> Team
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {tech && <TechCard tech={tech} label="PRIMARY" />}
          {helperTechs.map(ht => (
            <TechCard key={ht.id} tech={ht} label="HELPER" />
          ))}
          {!tech && helperTechs.length === 0 && (
            <div className="col-span-full py-6 text-center">
              <p className="text-[9px] font-bold uppercase text-text-muted opacity-40">No team assigned</p>
            </div>
          )}
        </div>
      </div>

      {/* Page view tabs */}
      <div className="flex gap-0 border-b border-border-sub">
        {(['overview', 'history'] as const).map(v => (
          <button
            key={v}
            onClick={() => setDetailView(v)}
            className={cn(
              'px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors',
              detailView === v
                ? 'text-text-primary border-b-2 border-brand-red -mb-px'
                : 'text-text-muted hover:text-text-primary'
            )}
          >
            {v}
          </button>
        ))}
      </div>

      {detailView === 'overview' && (
      <>

      {/* 3-column: Job Details | Schedule | Map ────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-5">

        {/* Job Details */}
        <div className="md:col-span-2 bg-bg-secondary rounded-xl border border-border-sub p-4">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2 mb-3">
            <Briefcase size={11} className="text-brand-red" /> Job Details
          </p>
          <div>
            {jobDetailRows.map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-start gap-3 py-2 border-b border-border-sub last:border-0">
                <Icon size={11} className="text-text-muted shrink-0 mt-0.5" />
                <span className="text-[9px] font-black uppercase tracking-widest text-text-muted w-20 shrink-0 leading-tight">{label}</span>
                <span className="text-[11px] font-bold text-text-primary min-w-0 break-words">{value || '—'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Schedule */}
        <div className="md:col-span-1 bg-bg-secondary rounded-xl border border-border-sub p-4">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2 mb-3">
            <Calendar size={11} className="text-brand-red" /> Schedule
          </p>
          <div className="space-y-4">
            {/* Date row */}
            <div className="flex items-baseline gap-3">
              <p className="font-black text-text-primary leading-none" style={{ fontSize: '3.25rem', fontVariantNumeric: 'tabular-nums' }}>{dayNum}</p>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted leading-none">{monthStr}</p>
                <p className="text-[8px] font-black uppercase tracking-[0.12em] text-text-muted leading-none mt-0.5">{dayName} · {yearStr}</p>
              </div>
            </div>
            {/* Time row */}
            <div className="space-y-2 border-t border-border-sub pt-3">
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.15em] text-text-muted flex items-center gap-1 mb-1">
                  <Clock size={8} /> Start Window
                </p>
                <p className="text-2xl font-black text-text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatTime(assignment.scheduleTime)}
                </p>
              </div>
              {endTime && (
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[0.15em] text-text-muted flex items-center gap-1 mb-1">
                    <Clock size={8} /> End Window
                  </p>
                  <p className="text-2xl font-black text-text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatTime(endTime)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="md:col-span-3 bg-bg-secondary rounded-xl border border-border-sub overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-sub shrink-0 gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin size={11} style={{ color: 'var(--text-green)' }} className="shrink-0" />
              <span className="text-[10px] font-bold text-text-primary truncate">{assignment.location || '—'}</span>
            </div>
            <button
              className="text-[8px] font-black uppercase tracking-widest flex items-center gap-0.5 shrink-0 transition-colors"
              style={{ color: 'var(--text-green)' }}
              onClick={() => window.open(
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(assignment.location || '')}`,
                '_blank', 'noopener'
              )}
            >
              View Full Map <ExternalLink size={8} />
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
                <p className="text-[7px] font-black uppercase tracking-widest text-text-muted flex items-center justify-center gap-0.5 mb-0.5">
                  <Icon size={7} /> {label}
                </p>
                <p className="text-[11px] font-black text-text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</p>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* Scope + History ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

        {/* Scope of Work */}
        <div className="lg:col-span-2 bg-bg-secondary rounded-xl border border-border-sub flex flex-col">
          <div className="p-4 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2 mb-3">
              <Wrench size={11} className="text-brand-red" /> Scope of Work
            </p>
            <p className="text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap">
              {assignment.description || '—'}
            </p>
            {assignment.notes && (
              <p className="mt-3 pt-3 border-t border-border-sub text-[10px] text-text-muted leading-relaxed italic">
                {assignment.notes}
              </p>
            )}
          </div>

          {/* Status strip */}
          <div className="grid grid-cols-5 divide-x divide-border-sub border-t border-border-sub">
            {statusStripItems.map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="py-3 px-2 flex flex-col items-center text-center gap-1">
                <Icon size={10} style={color ? { color } : {}} className={cn(!color && 'text-text-muted')} />
                <p className="text-[7px] font-black uppercase tracking-widest text-text-muted leading-none">{label}</p>
                <p className={cn('text-[9px] font-black uppercase leading-none', !color && 'text-text-primary')} style={color ? { color } : {}}>
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
            <Button size="sm" variant="outline" className="h-9 text-[9px] font-black uppercase tracking-widest gap-1.5 px-3 justify-start"
              onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(assignment.location || '')}`, '_blank', 'noopener')}>
              <Navigation size={10} /> Directions
            </Button>
            <Button size="sm" variant="outline" className="h-9 text-[9px] font-black uppercase tracking-widest gap-1.5 px-3 justify-start"
              onClick={() => router.push('/tech/messaging')}>
              <MessageSquare size={10} /> Message
            </Button>
          </div>

          {/* Status action buttons */}
          {techActions.length > 0 && (
            <div className={cn('grid gap-2', techActions.length >= 2 ? 'grid-cols-2' : 'grid-cols-1')}>
              {techActions.map(action => (
                <Button key={action.key} size="sm" variant="outline"
                  className={cn('h-9 text-[9px] font-black uppercase tracking-widest gap-1.5 px-3 justify-start', action.cls)}
                  disabled={actionLoading}
                  onClick={action.handler}>
                  <action.icon size={10} /> {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pay Ledger ─────────────────────────────────────────────────────── */}
      <div className="bg-bg-secondary rounded-xl border border-border-sub p-4">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted mb-3 flex items-center gap-2">
          <DollarSign size={11} className="text-brand-red" /> Pay Ledger
        </p>
        {relatedLogs.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {relatedLogs.map(log => (
              <div key={log.id} className="p-3 rounded-lg bg-bg-primary border border-border-sub">
                <p className="text-[9px] font-bold uppercase text-text-primary">Week of {log.weekOf}</p>
                <p className="text-sm font-mono font-bold mt-0.5" style={{ color: 'var(--text-green)' }}>
                  ${jobPayIn(log).toFixed(2)}
                </p>
                <p className="text-[8px] text-text-muted uppercase">This job&apos;s pay</p>
                <Badge variant="outline" className="h-4 text-[7px] mt-1 uppercase">{log.status}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[9px] text-text-muted opacity-40 font-bold uppercase">No pay logs linked</p>
        )}
      </div>

      </> // end overview
      )}

      {detailView === 'history' && (
        <div className="bg-bg-secondary rounded-xl border border-border-sub p-4 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
              <Activity size={11} className="text-brand-red" /> Event History
            </p>
            <Select value={historyTypeFilter} onValueChange={setHistoryTypeFilter}>
              <SelectTrigger className="h-7 w-[150px] text-[9px] bg-bg-primary border-border-main uppercase font-bold">
                <SelectValue placeholder="All Events" />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                <SelectItem value="all" className="text-[9px] uppercase font-bold">All Events</SelectItem>
                <SelectItem value="status" className="text-[9px] uppercase font-bold">Status Changes</SelectItem>
                <SelectItem value="assignment" className="text-[9px] uppercase font-bold">Assignments</SelectItem>
                <SelectItem value="note" className="text-[9px] uppercase font-bold">Notes</SelectItem>
                <SelectItem value="dispatch" className="text-[9px] uppercase font-bold">Dispatch</SelectItem>
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
                  const timeStr = evDate ? format(evDate, 'h:mm a').toUpperCase() : '';
                  const typeLabel = (ev.type || 'event').replace(/_/g, ' ').toUpperCase();
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
                            <span className="text-[8px] font-mono text-text-muted">{dateStr}</span>
                            {timeStr && <span className="text-[8px] font-mono text-text-muted ml-2">{timeStr}</span>}
                          </div>
                          {ev.user && (
                            <span className="text-[8px] font-black uppercase text-text-muted shrink-0 tracking-wide">{ev.user}</span>
                          )}
                        </div>
                        <p className="text-[8px] font-black uppercase tracking-widest mb-0.5" style={{ color: dotColor }}>{typeLabel}</p>
                        {ev.details && <p className="text-[10px] text-text-secondary leading-snug">{ev.details}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center py-8">
                <p className="text-[9px] font-bold uppercase text-text-muted opacity-40">No history recorded</p>
              </div>
            );
          })()}
        </div>
      )}

      {weekDialog}
    </div>
  );
}
