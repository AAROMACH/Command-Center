
'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, formatCityState, isAssignableTechnician, isInactiveTechnician, sortTechniciansForDeployment, techDisplayName } from '@/lib/utils';
import {
  MapPin, Calendar, Clock, DollarSign,
  Check, AlertTriangle, ShieldCheck,
  History, Navigation,
  Phone, Mail, MessageSquare,
  RotateCcw, UserPlus,
  Wrench, Flag, Database,
  ClipboardList, ExternalLink, Building2,
  CheckCircle2, Loader2, Tag, Pencil,
} from 'lucide-react';
import { format } from 'date-fns';
import { db, auth } from '@/lib/firebase';
import { NotificationService } from '@/lib/notification-service';
import {
  collection, query, where, getDocs, getDoc, onSnapshot,
  orderBy, limit, doc, updateDoc, arrayUnion, arrayRemove, deleteField,
} from 'firebase/firestore';
import { useDirectory } from '@/hooks/use-directory';
import { useAuth } from '@/contexts/auth-context';
import { useTechJobActions } from '@/hooks/use-tech-job-actions';
import { canConfirm } from '@/lib/trip-flow';
import type { WorkOrder, WeeklyLog, WeeklyLogItem, AssignmentTimeLog, Technician, TripLog } from '@/lib/types';
import { displayWorkOrderNumber, isImported } from '@/lib/work-order-identity';
import { fileCompletedJob, moveJobLogOnSwap, describeSwapLogMove } from '@/lib/weekly-log';
import { PAY_TYPE_LABELS } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { onSiteSessions, formatClock } from '@/lib/time-on-site';
import { effectiveJobPay } from '@/lib/payroll';
import { parseLocalDate } from '@/lib/jobs';
import { statusLabel as statusLabelText, statusTone, TONE_TEXT } from '@/lib/status-styles';
import { EmptyState, LoadingState } from '@/components/empty-state';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Scope', 'Activity Ledger', 'Admin Review'] as const;
type Tab = typeof TABS[number];
// Visible labels (the keys above stay as internal tab ids).
const TAB_LABELS: Record<Tab, string> = { Overview: 'Overview', Scope: 'Scope', 'Activity Ledger': 'Timeline', 'Admin Review': 'Admin review' };

const FIELD_NATION_BASE = 'https://app.fieldnation.com/workorders/';
const getFieldNationUrl = (wo: WorkOrder) => {
  const id = wo.externalWorkOrderId || wo.id.replace(/^(wo-|asmt-)/, '');
  return `${FIELD_NATION_BASE}${id}`;
};

const AVATAR_COLORS = [
  '#e879f9', '#f43f5e', '#3b82f6', '#10b981',
  '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316',
];
function getAvatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// Handles "14:30", "2:30 PM" and ISO datetimes. (The old version split on
// ":" and dropped AM/PM, so every afternoon time displayed as morning.)
const displayTime = (t?: string) => formatClock(t);

// Format a history entry's timestamp for the timeline. A full ISO datetime
// (recorded events) shows date + time-of-day; a plain date shows just the date.
const displayStamp = (t?: string) => {
  if (!t) return 'TBD';
  const d = new Date(t);
  if (isNaN(d.getTime())) return t;
  return /[T:]/.test(t) ? format(d, 'MMM d, yyyy · h:mm a') : format(d, 'MMM d, yyyy');
};

// ─── Pay helper ───────────────────────────────────────────────────────────────

function calcPayout(wo: WorkOrder, hoursWorked?: number) {
  const type = wo.payType || 'fixed';
  if (type === 'fixed') return { label: 'Fixed Rate', amount: wo.pay || 0, lines: [{ label: 'Fixed Amount', value: `$${(wo.pay || 0).toFixed(2)}` }] };
  if (type === 'hourly') {
    const hrs = hoursWorked ?? 0; const rate = wo.pay || 0;
    return { label: 'Hourly Labor Rate', amount: hrs * rate, lines: [{ label: 'Rate', value: `$${rate.toFixed(2)}/hr` }, { label: 'Hours', value: hrs.toFixed(2) }, { label: 'Total', value: `$${(hrs * rate).toFixed(2)}` }] };
  }
  if (type === 'blended') {
    const base = wo.blendedFixedPay || 0; const baseHrs = wo.blendedIncludedHours || 0;
    const ovRate = wo.blendedHourlyRate || 0; const hrs = hoursWorked ?? 0;
    const ovHrs = Math.max(0, hrs - baseHrs); const total = base + ovHrs * ovRate;
    return { label: 'Blended Rate', amount: total, lines: [{ label: 'Base Pay', value: `$${base.toFixed(2)} (${baseHrs}h)` }, { label: 'OT Rate', value: `$${ovRate.toFixed(2)}/hr` }, { label: 'OT Hours', value: ovHrs.toFixed(2) }, { label: 'Total', value: `$${total.toFixed(2)}` }] };
  }
  return { label: 'Unknown', amount: 0, lines: [] };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <p className="text-[13px] font-semibold text-text-primary whitespace-nowrap">{children}</p>
      <div className="flex-1 h-px bg-border-sub" />
    </div>
  );
}

function TimelineEntry({ dot, time, title, note, by, isLast }: {
  dot: 'green' | 'gold' | 'blue' | 'red' | 'gray';
  time: string; title: string; note: string; by: string; isLast?: boolean;
}) {
  const dotClass = { green: 'border-green-border text-text-green', gold: 'border-accent-gold/40 text-accent-gold', blue: 'border-brand-blue/30 text-brand-blue', red: 'border-brand-red/60 text-text-red', gray: 'border-border-sub text-text-muted' }[dot];
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={cn('w-7 h-7 rounded-full border bg-bg-elevated flex items-center justify-center shrink-0 mt-0.5', dotClass)}>
          <div className="w-1.5 h-1.5 rounded-full bg-current" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border-sub/30 mt-2 mb-2 min-h-[20px]" />}
      </div>
      <div className="pb-5 flex-1 min-w-0">
        <p className="text-[11px] text-text-muted">{time}</p>
        <p className="text-[13px] font-semibold text-text-primary leading-tight mt-0.5">{title}</p>
        <p className="text-[12px] text-text-secondary mt-1 leading-relaxed">{note}</p>
        <p className="text-[11px] text-text-muted mt-1">By {by}</p>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type JobDetailDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  mission: WorkOrder | null;
  onEdit?: (mission: WorkOrder) => void;
  onUpdate?: (woId: string, updates: Partial<WorkOrder>) => void;
  /** Mask pay amounts (for viewers who aren't super / payroll admins). */
  hidePay?: boolean;
};

export function JobDetailDialog({ isOpen, setIsOpen, mission, onEdit, hidePay = false }: JobDetailDialogProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [adminData, setAdminData] = useState<{ weeklyLog: WeeklyLog | null; jobItem: WeeklyLogItem | null; sessionLogs: AssignmentTimeLog[] }>({ weeklyLog: null, jobItem: null, sessionLogs: [] });
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  // Full user records for admins; the public directory for techs (who can't
  // read `users`, so names here used to be blank on the tech side).
  const technicians = useDirectory();
  const { user: authUser, isAdmin: isAdminUser } = useAuth();
  const { run: runTechAction } = useTechJobActions(authUser?.id || null, techDisplayName(authUser));
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [swapOpen, setSwapOpen] = useState(false);
  const [helperOpen, setHelperOpen] = useState(false);
  const [swapTechId, setSwapTechId] = useState('');
  const [helperTechId, setHelperTechId] = useState('');
  // Optimistic assigned-tech override so a swap shows the new tech instantly,
  // even though the `mission` prop is a snapshot from when the dialog opened.
  const [optimisticTechId, setOptimisticTechId] = useState<string | null>(null);
  const [optimisticHelperIds, setOptimisticHelperIds] = useState<string[]>([]);
  const [removedHelperIds, setRemovedHelperIds] = useState<string[]>([]);
  // Admin force-complete (close out a job on behalf of a tech who can't).
  const [forceOpen, setForceOpen] = useState(false);
  // Defaults ON: a completed job that isn't filed never reaches payroll. An
  // admin who unchecks it marks the job payrollExcluded so the Unlogged audit
  // and the tech-side sync leave it alone.
  const [forceFilePayroll, setForceFilePayroll] = useState(true);
  const [forcing, setForcing] = useState(false);
  const [forcedDone, setForcedDone] = useState(false);
  const { toast } = useToast();


  // Clear per-assignment UI state whenever a different assignment is shown.
  useEffect(() => {
    setOptimisticTechId(null);
    setOptimisticHelperIds([]);
    setForceOpen(false);
    setForceFilePayroll(true); // filing to the weekly log is the default
    setForcedDone(false);
  }, [mission?.id]);

  useEffect(() => {
    if (!isOpen || !mission || activeTab !== 'Admin Review') return;
    setLoadingAdmin(true);
    const woId = mission.id;
    // The weekly log holding this job: an array-contains on { workOrderId }
    // never matched (log items carry many more fields), so this always came
    // back empty. Read the assigned tech's logs and find the item instead.
    const ownerId = mission.assignedTechnicianId || mission.techId || '';
    Promise.all([
      ownerId ? getDocs(query(collection(db, 'weeklyLogs'), where('techId', '==', ownerId))) : Promise.resolve(null),
      getDocs(query(collection(db, 'auditLog', woId, 'events'), orderBy('changedAt', 'desc'), limit(50))),
      // Real on-site sessions from the trip records (was demo data).
      getDocs(query(collection(db, 'tripLogs'), where('assignmentId', '==', woId))).catch(() => null),
    ]).then(([logSnap, auditSnap, tripSnap]) => {
      const logDoc = logSnap?.docs.find(d => ((d.data().items || []) as { workOrderId: string }[]).some(i => i.workOrderId === woId));
      const weeklyLog = logDoc ? ({ ...logDoc.data(), id: logDoc.id } as WeeklyLog) : null;
      setAdminData({
        weeklyLog,
        jobItem: weeklyLog?.items?.find(i => i.workOrderId === woId) || null,
        sessionLogs: tripSnap ? onSiteSessions(tripSnap.docs.map(d => ({ ...d.data(), id: d.id } as TripLog))) : [],
      });
      setAuditEvents(auditSnap.docs.map(d => d.data()));
    }).catch(console.error).finally(() => setLoadingAdmin(false));
  }, [activeTab, mission, isOpen]);

  const timeline = useMemo(() => {
    if (!mission) return [];
    const entries = [...(mission.history || [])];
    if (!entries.some(e => e.details.toLowerCase().includes('created'))) {
      entries.push({ type: 'note', date: mission.scheduleDate || 'TBD', details: 'Job created.', user: mission.source === 'Imported' ? 'Field Nation import' : 'Command Center' } as any);
    }
    return entries.sort((a, b) => (parseLocalDate(b.date)?.getTime() ?? 0) - (parseLocalDate(a.date)?.getTime() ?? 0));
  }, [mission]);

  const handleSwapTech = async () => {
    if (!swapTechId || !mission) return;
    const nt = technicians.find(t => t.id === swapTechId);
    if (nt && isInactiveTechnician(nt)) return;
    const prevTechId = mission.assignedTechnicianId || mission.techId || '';
    const prevTech = technicians.find(t => t.id === prevTechId);
    const admin = auth.currentUser?.displayName || 'Admin';
    // Reflect the new tech immediately in this dialog (the mission prop is a
    // stale snapshot until the parent's listener re-passes it).
    setOptimisticTechId(swapTechId);
    setSwapOpen(false); setSwapTechId('');
    // Ownership moves to the new tech (assignedTechnicianId + techId) so the
    // previous tech immediately loses access via Firestore rules and their
    // live queries. Record the full reassignment for the audit trail.
    try {
      await updateDoc(doc(db, 'assignments', mission.id), {
        assignedTechnicianId: swapTechId, techId: swapTechId,
        technicianName: nt?.name || '',
        history: arrayUnion({ date: new Date().toISOString(), type: prevTechId ? 'tech_swapped' : 'tech_assigned',
          previousTechnicianId: prevTechId, previousTechnicianName: prevTech?.name || prevTechId,
          newTechnicianId: swapTechId, newTechnicianName: nt?.name || swapTechId,
          details: prevTechId
            ? `Reassigned from ${prevTech?.name || prevTechId} to ${nt?.name || swapTechId}`
            : `Assigned to ${nt?.name || swapTechId}`,
          user: admin }),
      });
    } catch (e) {
      setOptimisticTechId(null); // revert the optimistic display if the write failed
      throw e;
    }
    NotificationService.notifyJobChange(mission, { ...mission, assignedTechnicianId: swapTechId, techId: swapTechId }).catch(() => {});
    // The job has left the previous tech's views; move its weekly-log entry too.
    try {
      const moved = await moveJobLogOnSwap({ job: mission, fromTechIds: [mission.techId, mission.assignedTechnicianId], toTechId: swapTechId });
      const note = describeSwapLogMove(moved, prevTech?.name || 'the previous tech', nt?.name || 'the new tech');
      if (note) toast({ variant: note.warn ? 'destructive' : undefined, title: 'Weekly log', description: note.text });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Swapped, but weekly log not moved', description: e?.message || 'Fix it from Insights → Flags → Wrong tech.' });
    }
  };

  const handleAddHelper = async () => {
    if (!helperTechId || !mission) return;
    const ht = technicians.find(t => t.id === helperTechId);
    if (ht && isInactiveTechnician(ht)) return;
    // Helpers live on dispatched jobs (assignments). On a pool job this write
    // used to fail silently while the panel still showed the helper as added.
    try {
      const ref = doc(db, 'assignments', mission.id);
      if (!(await getDoc(ref)).exists()) {
        toast({ variant: 'destructive', title: 'Assign a lead tech first', description: 'Helpers can be added once the job is dispatched to a lead tech.' });
        return;
      }
      await updateDoc(ref, {
        additionalTechnicianIds: arrayUnion(helperTechId),
        history: arrayUnion({ date: new Date().toISOString(), type: 'helper_added',
          details: `${ht?.name || helperTechId} added as helper`, user: 'Admin' }),
      });
      toast({ title: 'Helper added', description: `${ht?.name || 'Helper'} will see this job on their Assignments page.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not add helper', description: e?.message || 'Please try again.' });
      return;
    }
    setOptimisticHelperIds(ids => ids.includes(helperTechId) ? ids : [...ids, helperTechId]);
    setRemovedHelperIds(ids => ids.filter(x => x !== helperTechId));
    setHelperOpen(false); setHelperTechId('');
  };

  const handleRemoveHelper = async (helperId: string) => {
    if (!mission) return;
    const ht = technicians.find(t => t.id === helperId);
    if (!confirm(`Remove ${ht?.name || 'this helper'} from the job? Their weekly log entry stays — remove it in Payroll if needed.`)) return;
    await updateDoc(doc(db, 'assignments', mission.id), {
      additionalTechnicianIds: arrayRemove(helperId),
      // Re-adding them later starts their own workflow fresh.
      [`helperProgress.${helperId}`]: deleteField(),
      history: arrayUnion({ date: new Date().toISOString(), type: 'helper_removed',
        details: `${ht?.name || helperId} removed as helper`, user: 'Admin' }),
    });
    setOptimisticHelperIds(ids => ids.filter(x => x !== helperId));
    setRemovedHelperIds(ids => [...ids, helperId]);
  };

  if (!mission) return null;

  const assignedTechId = optimisticTechId ?? mission.assignedTechnicianId ?? mission.techId ?? '';
  const hasAssignedTech = Boolean(assignedTechId);
  const leadTech = technicians.find(t => t.id === assignedTechId);
  const helperIds = Array.from(new Set([
    ...(mission.additionalTechnicianIds || []),
    ...optimisticHelperIds,
  ])).filter(id => id !== assignedTechId && !removedHelperIds.includes(id));
  const helperTechs = helperIds.map(id => ({
    id,
    tech: technicians.find(t => t.id === id),
  }));

  // The job's tech id straight off the record — a departed tech may no longer
  // exist in the users list (so leadTech is undefined), but we can still file
  // their completed work to payroll by this id.
  const jobTechId = mission.assignedTechnicianId || mission.techId || mission.assignedTechIds?.[0] || '';
  const isCompleted = mission.status === 'completed' || forcedDone;

  // Admin override: close out a job the tech can't finish themselves (e.g. an
  // operative who has left). Writes to whichever collection actually holds the
  // doc, records who did it, and optionally files the work to the tech's
  // weekly log so it flows to payroll.
  const handleForceComplete = async () => {
    if (!mission || forcing) return;
    setForcing(true);
    try {
      const asmtRef = doc(db, 'assignments', mission.id);
      const ref = (await getDoc(asmtRef)).exists() ? asmtRef : doc(db, 'workOrders', mission.id);
      const adminName = auth.currentUser?.displayName || 'Admin';
      const filing = forceFilePayroll && !!jobTechId;
      await updateDoc(ref, {
        status: 'completed',
        activeTripLogId: null,
        payrollExcluded: !filing,
        history: arrayUnion({
          type: 'status_change',
          date: format(new Date(), 'MM-dd-yyyy'),
          details: `Force-completed by ${adminName}${filing ? ' · filed to weekly log' : ' · not filed to payroll'}.`,
          user: adminName,
        }),
      });
      if (filing) {
        try {
          await fileCompletedJob({ techId: jobTechId, job: mission, filedVia: 'admin_force_complete' });
        } catch (fileErr) {
          // The status write already landed — say so plainly instead of the
          // generic "could not complete", so payroll knows to file it from
          // Intel → Flags → Unlogged Jobs.
          console.error('Force complete: weekly-log filing failed', fileErr);
          setForcedDone(true);
          setForceOpen(false);
          toast({ variant: 'destructive', title: 'Completed, but not filed', description: 'The job is marked completed but could not be added to the weekly log. File it from Insights → Flags → Unlogged jobs.' });
          return;
        }
      }
      setForcedDone(true);
      setForceOpen(false);
      toast({
        title: 'Job force-completed',
        description: forceFilePayroll && jobTechId
          ? 'Marked completed and filed to the weekly log.'
          : 'Marked completed.',
      });
    } catch (e) {
      console.error('Force complete failed', e);
      toast({ variant: 'destructive', title: 'Could not complete', description: 'Please try again.' });
    } finally {
      setForcing(false);
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const statusLabel = (() => {
    const map: Record<string, string> = { unassigned: 'Unassigned', assigned: 'Assigned', confirmed: 'Confirmed', 'on-my-way': 'On my way', 'in-progress': 'In progress', 'checked-out': 'Checked out', completed: 'Completed' };
    return map[mission.status] || statusLabelText(mission.status);
  })();

  const originalPayDisplay = hidePay ? 'Restricted' : mission.payType === 'blended'
    ? `$${(mission.blendedFixedPay ?? mission.pay ?? 0).toFixed(2)} + $${(mission.blendedHourlyRate ?? 0).toFixed(2)}/hr`
    : mission.payType === 'hourly'
      ? `$${(mission.pay ?? 0).toFixed(2)}/hr`
      : `$${(mission.pay ?? 0).toFixed(2)}`;
  const finalPayDisplay = hidePay ? 'Restricted' : mission.finalPay != null ? `$${mission.finalPay.toFixed(2)}` : 'Not set';

  const riskLabel = mission.slaStatus === 'breached' ? 'Breached' : mission.slaStatus === 'at-risk' ? 'At risk' : mission.slaStatus === 'met' ? 'Met' : mission.slaStatus === 'on-track' ? 'On track' : 'Normal';
  const riskColor = mission.slaStatus === 'breached' ? 'text-priority-critical' : mission.slaStatus === 'at-risk' ? 'text-accent-gold' : (mission.slaStatus === 'met' || mission.slaStatus === 'on-track') ? 'text-text-green' : 'text-text-muted';

  // Trip status follows the operative's trip-log path:
  // Start Trip → En Route (on-my-way) → Checked In (in-progress) →
  // Checked Out → Completed.
  const tripStatus = (() => {
    switch (mission.status) {
      case 'on-my-way':   return { label: 'En route',     cls: 'text-brand-blue' };
      case 'in-progress': return { label: 'Checked in',   cls: 'text-text-green' };
      case 'checked-out': return { label: 'Checked out',  cls: 'text-accent-gold' };
      case 'completed':   return { label: 'Completed',    cls: 'text-text-green' };
      default:            return { label: 'Not started',  cls: 'text-text-muted' };
    }
  })();

  const lastUpdated = mission.history?.length
    ? [...mission.history].sort((a, b) => (parseLocalDate(b.date)?.getTime() ?? 0) - (parseLocalDate(a.date)?.getTime() ?? 0))[0].date
    : mission.scheduleDate || '';

  // Techs confirm through the shared workflow (same as every tech screen);
  // admins mark it confirmed on whichever collection the job lives in — this
  // used to always write to workOrders, so it did nothing for dispatched jobs.
  const handleVerify = async () => {
    if (!isAdminUser) {
      await runTechAction(mission, 'confirm');
      return;
    }
    try {
      const coll = (await getDoc(doc(db, 'assignments', mission.id))).exists() ? 'assignments' : 'workOrders';
      await updateDoc(doc(db, coll, mission.id), { status: 'confirmed', isAcknowledged: true });
      toast({ title: 'Job confirmed' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Verify failed', description: e?.message });
    }
  };

  const logicGrid = [
    { icon: Wrench,        label: 'Job type',     value: mission.projectType || '—',              cls: 'text-text-primary' },
    { icon: Flag,          label: 'Priority',     value: mission.priority ? statusLabelText(mission.priority) : '—', cls: mission.priority === 'critical' ? 'text-priority-critical' : mission.priority === 'high' ? 'text-priority-high' : mission.priority === 'medium' ? 'text-accent-gold' : 'text-text-primary' },
    { icon: Tag,           label: 'Pay type',     value: statusLabelText(PAY_TYPE_LABELS[mission.payType] || mission.payType), cls: 'text-text-primary' },
    { icon: DollarSign,    label: 'Original pay', value: originalPayDisplay,                      cls: 'text-text-secondary' },
    { icon: DollarSign,    label: 'Final pay',    value: finalPayDisplay,                         cls: 'text-text-green' },
    { icon: Database,      label: 'Source',       value: mission.source || 'Manual',              cls: 'text-text-primary' },
    { icon: AlertTriangle, label: 'SLA',   value: riskLabel,                                cls: riskColor },
    { icon: ShieldCheck,   label: 'Status',       value: statusLabel,                             cls: TONE_TEXT[statusTone('job', mission.status)] },
  ];

  const actionButtons = [
    { icon: Navigation,  label: 'Directions',        onClick: () => window.open(`https://maps.google.com/?q=${encodeURIComponent(mission.location || '')}`, '_blank') },
    { icon: Phone,       label: 'Call client',       onClick: () => {} },
    { icon: MessageSquare, label: 'Message client',  onClick: () => {} },
    ...(isAdminUser || canConfirm(mission) ? [{ icon: ShieldCheck, label: isAdminUser ? 'Mark confirmed' : 'Confirm', onClick: handleVerify }] : []),
    // Reassigning is admin-only (the rules reject it for techs).
    ...(isAdminUser ? [
      { icon: hasAssignedTech ? RotateCcw : UserPlus, label: hasAssignedTech ? 'Swap tech' : 'Assign tech', onClick: () => { setSwapTechId(''); setSwapOpen(true); } },
      { icon: UserPlus,    label: 'Add helper',        onClick: () => { setHelperTechId(''); setHelperOpen(true); } },
    ] : []),
  ];

  const footerItems = [
    { label: 'Job status',        value: statusLabel, cls: TONE_TEXT[statusTone('job', mission.status)] },
    { label: 'Trip',       value: tripStatus.label, cls: tripStatus.cls },
        { label: 'Last updated',      value: lastUpdated || '—', cls: 'text-text-primary' },
  ];

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent
        side="right"
        className="sm:max-w-[680px] w-full p-0 gap-0 bg-bg-elevated border-l border-border-main shadow-2xl overflow-hidden flex flex-col [&>button]:top-5 [&>button]:right-5 [&>button]:text-text-muted [&>button]:hover:text-text-primary"
      >

        {/* a11y */}
        <SheetTitle className="sr-only">{mission.title || mission.description}</SheetTitle>
        <SheetDescription className="sr-only">Job details, timeline and admin review.</SheetDescription>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="shrink-0 px-6 pt-5 pb-0">

          {/* WO ID + badges */}
          <div className="flex items-center gap-2.5 flex-wrap pr-8">
            <span className="font-mono text-[12px] font-semibold text-brand-red">
              WO {displayWorkOrderNumber(mission)}
            </span>
            {isImported(mission) && (
              <span className="font-mono text-[12px] text-text-muted">
                Assignment {mission.id.toUpperCase()}
              </span>
            )}
            <StatusBadge kind="job" value={mission.status} label={statusLabel} />
            {mission.source && (
              <Badge variant="info" className="text-[10px] font-semibold uppercase tracking-wide">{mission.source}</Badge>
            )}
          </div>

          {/* Title */}
          <h2 className="text-lg font-semibold text-text-primary leading-snug mt-3 mb-3 pr-8">
            {mission.title || mission.description}
          </h2>

          {/* Edit — offered by screens that can edit (Dispatch). It was the
              only way in on a phone, where the table's pencil isn't shown,
              but this panel never rendered it. Completed jobs stay locked,
              same as the table. */}
          {onEdit && mission.status !== 'completed' && (
            <Button
              size="sm"
              onClick={() => onEdit(mission)}
              className="mb-3"
            >
              <Pencil size={13} className="mr-1.5" /> Edit job
            </Button>
          )}

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5">
              <MapPin size={13} className="text-text-muted shrink-0" />
              <span className="text-[12px] text-text-secondary">{formatCityState(mission.location)}</span>
            </span>
            <span className="text-border-sub select-none">|</span>
            <span className="flex items-center gap-1.5">
              <Calendar size={13} className="text-text-muted shrink-0" />
              <span className="text-[12px] text-text-secondary">{mission.scheduleDate || 'TBD'}</span>
            </span>
            <span className="text-border-sub select-none">|</span>
            <span className="flex items-center gap-1.5">
              <Clock size={13} className="text-text-muted shrink-0" />
              <span className="text-[12px] text-text-secondary">{displayTime(mission.scheduleTime)}</span>
            </span>
            <span className="text-border-sub select-none">|</span>
            <span className="flex items-center gap-1.5">
              <DollarSign size={13} className="text-text-muted shrink-0" />
              <span className="text-[12px] text-text-secondary">{originalPayDisplay}</span>
            </span>
            {mission.clientName && (
              <>
                <span className="text-border-sub select-none">|</span>
                <span className="flex items-center gap-1.5">
                  <Building2 size={13} className="text-text-muted shrink-0" />
                  <span className="text-[12px] text-text-secondary">{mission.clientName}</span>
                </span>
              </>
            )}
          </div>

          {/* Tab bar */}
          <div className="flex flex-wrap gap-x-5 border-b border-border-main mt-4">
            {TABS.map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                data-state={activeTab === tab ? 'active' : 'inactive'}
                className="tab-underline -mb-px whitespace-nowrap"
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <Tabs value={activeTab} className="h-full">

            {/* OVERVIEW */}
            <TabsContent value="Overview" className="m-0 p-6 space-y-4 animate-in fade-in duration-200">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Assignment Logic */}
                <div className="rounded-xl border border-border-main bg-bg-secondary overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-sub">
                    <Wrench size={13} className="text-text-muted" />
                    <p className="text-[13px] font-semibold text-text-primary">Job details</p>
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-border-sub">
                    {logicGrid.map(({ icon: Icon, label, value, cls }) => (
                      <div key={label} className="flex items-start gap-3 p-3 bg-bg-secondary">
                        <Icon size={13} className="text-text-muted mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[11px] text-text-muted mb-0.5">{label}</p>
                          <p className={cn('text-[13px] font-semibold', cls)}>{value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Lead Allocation */}
                <div className="rounded-xl border border-border-main bg-bg-secondary overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-sub">
                    <UserPlus size={13} className="text-text-muted" />
                    <p className="text-[13px] font-semibold text-text-primary">Lead tech</p>
                  </div>
                  {leadTech ? (
                    <>
                      <div className="flex items-center gap-3 p-4">
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0"
                          style={{ background: getAvatarColor(leadTech.name) }}
                        >
                          {leadTech.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold text-text-primary leading-tight">{leadTech.name}</p>
                          <p className="text-[12px] text-text-muted mt-0.5">{leadTech.role ? statusLabelText(leadTech.role) : 'Field technician'}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <a href={`tel:${leadTech.phone}`} className="w-8 h-8 rounded-lg border border-border-sub bg-bg-primary flex items-center justify-center hover:border-border-main transition-colors">
                            <Phone size={13} className="text-text-muted" />
                          </a>
                          <a href={`mailto:${leadTech.email}`} className="w-8 h-8 rounded-lg border border-border-sub bg-bg-primary flex items-center justify-center hover:border-border-main transition-colors">
                            <Mail size={13} className="text-text-muted" />
                          </a>
                        </div>
                      </div>
                      <div className="h-px bg-border-sub mx-4" />
                      <div className="flex items-stretch divide-x divide-border-sub">
                        {[
                          { icon: ClipboardList, stat: leadTech.currentWorkload ?? '—', sub: 'Jobs completed' },
                          { icon: Clock, stat: '—', sub: 'On time' },
                        ].map(({ icon: Icon, stat, sub }) => (
                          <div key={sub} className="flex-1 flex flex-col items-center gap-1 py-3 px-2">
                            <Icon size={14} className="text-text-muted" />
                            <p className="text-sm font-semibold text-text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>{String(stat)}</p>
                            <p className="text-[11px] text-text-muted text-center leading-tight">{sub}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="p-10 flex flex-col items-center justify-center">
                      <UserPlus size={24} className="text-text-muted/60 mb-2" />
                      <p className="text-[12px] text-text-muted">No tech assigned yet</p>
                    </div>
                  )}
                  {helperTechs.length > 0 && (
                    <div className="border-t border-border-sub px-4 py-3">
                      <p className="text-[12px] font-semibold text-text-primary mb-2">Helpers</p>
                      <div className="space-y-2">
                        {helperTechs.map(({ id, tech }) => {
                          const name = tech?.name || id;
                          return (
                            <div key={id} className="flex items-center gap-2.5 rounded-lg border border-border-sub bg-bg-primary px-3 py-2">
                              <div
                                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                style={{ background: getAvatarColor(name) }}
                              >
                                {name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-medium text-text-primary truncate">{name}</p>
                                <p className="text-[11px] text-text-muted">Helper</p>
                              </div>
                              <button
                                type="button"
                                title="Remove helper"
                                onClick={() => handleRemoveHelper(id)}
                                className="shrink-0 text-[12px] font-medium text-text-muted hover:text-text-red px-1.5"
                              >
                                Remove
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {actionButtons.map(({ icon: Icon, label, onClick }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={onClick}
                    className="flex flex-col items-center gap-1.5 py-3 px-1 rounded-md border border-border-main bg-bg-secondary hover:bg-bg-tertiary hover:border-border-main transition-colors"
                  >
                    <Icon size={15} className="text-text-muted" />
                    <span className="text-[11px] font-medium text-text-secondary leading-tight text-center">{label}</span>
                  </button>
                ))}
              </div>
            </TabsContent>

            {/* SCOPE */}
            <TabsContent value="Scope" className="m-0 p-6 space-y-6 animate-in fade-in duration-200">
              <div>
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0"><SectionLabel>Description</SectionLabel></div>
                  {mission.source === 'Imported' && (
                    <a href={getFieldNationUrl(mission)} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium text-brand-red hover:underline flex items-center gap-1 shrink-0 ml-4">
                      <ExternalLink size={12} /> Open in Field Nation
                    </a>
                  )}
                </div>
                <div className="p-4 rounded-xl bg-bg-secondary border border-border-main text-[13px] text-text-secondary leading-relaxed whitespace-pre-wrap">
                  {mission.description || 'No description.'}
                </div>
              </div>
              {Array.isArray(mission.requiredSkills) && mission.requiredSkills.length > 0 && (
                <div>
                  <SectionLabel>Required skills</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {mission.requiredSkills.map((skill, idx) => (
                      <Badge key={idx} variant="outline" className="bg-bg-secondary text-[12px] font-medium px-2.5 py-0.5">{skill}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ACTIVITY LEDGER */}
            <TabsContent value="Activity Ledger" className="m-0 p-6 space-y-4 animate-in fade-in duration-200">
              <SectionLabel>Timeline</SectionLabel>
              <div className="space-y-0">
                {timeline.length > 0 ? timeline.map((entry, idx) => {
                  const isLast = idx === timeline.length - 1;
                  let dot: 'blue' | 'gold' | 'green' | 'red' | 'gray' = 'gray';
                  const details = (entry.details || '').toLowerCase();
                  const type = (entry.type || '').toLowerCase();
                  let title = statusLabelText(type) === '—' ? 'Update' : statusLabelText(type);
                  if (details.includes('complete') || details.includes('finalized') || type === 'completed') { dot = 'green'; title = 'Completed'; }
                  else if (details.includes('check-in') || details.includes('arrival') || details.includes('in-progress')) { dot = 'green'; title = 'Checked in on site'; }
                  else if (details.includes('checked out') || details.includes('paused')) { dot = 'gold'; title = 'Checked out / paused'; }
                  else if (details.includes('trip') || details.includes('en route')) { dot = 'gold'; title = 'On the way'; }
                  else if (details.includes('confirmed')) { dot = 'blue'; title = 'Confirmed'; }
                  else if ((type === 'note' && details.includes('created')) || details.includes('initialized')) { dot = 'blue'; title = 'Job created'; }
                  return <TimelineEntry key={idx} dot={dot} time={displayStamp(entry.date)} title={title} note={entry.details || 'No additional notes recorded.'} by={entry.user || 'System'} isLast={isLast} />;
                }) : (
                  <EmptyState compact icon={History} title="No activity yet" description="Status changes, check-ins and reassignments show up here." />
                )}
              </div>
            </TabsContent>

            {/* ADMIN REVIEW */}
            <TabsContent value="Admin Review" className="m-0 p-6 space-y-6 animate-in fade-in duration-200">
              {loadingAdmin ? (
                <LoadingState label="Loading payroll and on-site records…" rows={3} />
              ) : (
                <>
                  {/* Administrative override — force-complete a job the tech can't close themselves */}
                  <div>
                    <SectionLabel>Close out job</SectionLabel>
                    {isCompleted ? (
                      <div className="flex items-center gap-3 p-4 rounded-xl border border-border-green bg-green-dim">
                        <CheckCircle2 size={18} className="text-text-green shrink-0" />
                        <div>
                          <p className="text-[13px] font-semibold text-text-green">Job completed</p>
                          <p className="text-[12px] text-text-muted mt-0.5">This job is closed out.</p>
                        </div>
                      </div>
                    ) : !forceOpen ? (
                      <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border-sub bg-bg-secondary">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-text-primary">Force complete</p>
                          <p className="text-[12px] text-text-muted mt-1 leading-relaxed">
                            Close out this job on the tech&apos;s behalf — for work already done by a tech who can&apos;t mark it complete themselves.
                          </p>
                        </div>
                        <Button variant="secondary" className="shrink-0" onClick={() => setForceOpen(true)}>
                          <CheckCircle2 size={13} /> Force complete
                        </Button>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl border border-accent-gold/40 bg-accent-gold-dim space-y-3">
                        <p className="text-[13px] font-semibold text-text-primary">Confirm force completion</p>
                        <p className="text-[12px] text-text-muted leading-relaxed">
                          Marks <span className="font-mono font-bold text-text-primary">{displayWorkOrderNumber(mission)}</span> as{' '}
                          <span className="text-text-green font-bold">completed</span>
                          {leadTech ? <> on behalf of <span className="font-bold text-text-primary">{leadTech.name}</span></> : ''}. This is recorded in the job's history.
                        </p>
                        {jobTechId && (
                          <label className="flex items-start gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={forceFilePayroll}
                              onChange={e => setForceFilePayroll(e.target.checked)}
                              className="mt-0.5 h-4 w-4 accent-brand-red"
                            />
                            <span className="text-[12px] text-text-secondary leading-tight">
                              Also file to {leadTech?.name || 'the tech'}&apos;s weekly log (payroll)
                            </span>
                          </label>
                        )}
                        <div className="flex items-center gap-2 pt-1">
                          <Button variant="default" disabled={forcing} onClick={handleForceComplete}>
                            {forcing ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Confirm complete
                          </Button>
                          <Button variant="outline" disabled={forcing} onClick={() => { setForceOpen(false); setForceFilePayroll(true); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <SectionLabel>Payroll</SectionLabel>
                    {adminData.weeklyLog ? (
                      <Card className="rounded-xl bg-bg-secondary border-border-main overflow-hidden shadow-sm">
                        <div className="p-4 flex items-center justify-between gap-3 border-b border-border-sub">
                          <div>
                            <p className="text-[12px] text-text-muted mb-1">Pay for this job</p>
                            <p className="text-2xl font-mono font-bold text-text-green">{hidePay ? 'Restricted' : adminData.jobItem ? `$${effectiveJobPay(adminData.jobItem, mission).toFixed(2)}` : '—'}</p>
                          </div>
                          <StatusBadge kind="log" value={adminData.weeklyLog.status} label={`Log ${statusLabelText(adminData.weeklyLog.status).toLowerCase()}`} />
                        </div>
                        <div className="p-4">
                          <p className="text-[12px] text-text-muted">Weekly log: <span className="font-medium text-text-primary">week of {adminData.weeklyLog.weekOf}</span></p>
                        </div>
                      </Card>
                    ) : (
                      <EmptyState compact icon={Clock} title="Not on a weekly log yet" description="It appears here once the job is filed to the tech's weekly log." />
                    )}
                  </div>
                  <div>
                    <SectionLabel>Time on site</SectionLabel>
                    <div className="space-y-2">
                      {adminData.sessionLogs.length > 0 ? adminData.sessionLogs.map(log => (
                        <div key={log.id} className="p-3 rounded-xl border border-border-main bg-bg-secondary flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 bg-bg-primary rounded-md border border-border-sub text-text-muted"><Navigation size={16} /></div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-[13px] font-semibold text-text-primary">{displayTime(log.checkInTime)} – {log.checkOutTime ? displayTime(log.checkOutTime) : 'now'}</p>
                                {log.checkOutTime ? <Badge variant="approved" className="text-[10px] font-semibold uppercase tracking-wide">Checked out</Badge> : <Badge variant="inprogress" className="text-[10px] font-semibold uppercase tracking-wide">On site now</Badge>}
                              </div>
                              <p className="text-[12px] text-text-muted mt-0.5 truncate">{log.minutesWorked ? `${(log.minutesWorked / 60).toFixed(1)}h on site` : 'In progress'}{log.location ? ` · ${log.location}` : ''}</p>
                            </div>
                          </div>
                        </div>
                      )) : (
                        <EmptyState compact icon={Navigation} title="No on-site time recorded" description="Check-ins and check-outs from the tech's trips show up here." />
                      )}
                    </div>
                  </div>
                  {auditEvents.length > 0 && (
                    <div>
                      <SectionLabel>Activity</SectionLabel>
                      <div className="space-y-1">
                        {auditEvents.map((ev, idx) => (
                          <div key={idx} className="flex items-start gap-3 px-3 py-2 rounded-md border border-border-sub bg-bg-secondary">
                            <div className="flex-shrink-0 w-1.5 h-1.5 mt-2 rounded-full bg-text-muted/50" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[12px] font-semibold text-text-primary">{statusLabelText(String(ev.field === '__action__' ? ev.newValue : ev.field).replace(/([a-z])([A-Z])/g, '$1 $2'))}</span>
                                {ev.field !== '__action__' && (
                                  <span className="text-[12px] text-text-muted font-mono">
                                    <span className="text-text-red">{String(ev.oldValue ?? '—')}</span>
                                    <span className="mx-1 text-text-muted">→</span>
                                    <span className="text-text-green">{String(ev.newValue ?? '—')}</span>
                                  </span>
                                )}
                                {ev.details && <span className="text-[12px] text-text-muted">{ev.details}</span>}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[11px] text-text-muted">{ev.changedByName || ev.changedBy}</span>
                                <span className="text-[11px] text-text-muted">·</span>
                                <span className="text-[11px] text-text-muted">{ev.changedAt ? new Date(ev.changedAt).toLocaleString() : '—'}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

          </Tabs>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-border-sub bg-bg-primary">
          <div className="flex items-stretch divide-x divide-border-sub">
            {footerItems.map(({ label, value, cls }) => (
              <div key={label} className="flex-1 flex flex-col gap-0.5 px-4 py-3 min-w-0">
                <p className="text-[11px] text-text-muted truncate">{label}</p>
                <p className={cn('text-[13px] font-semibold truncate', cls)}>{value}</p>
              </div>
            ))}
          </div>
        </div>

      </SheetContent>

      {/* Assign / Swap Tech Dialog */}
      <Dialog open={swapOpen} onOpenChange={setSwapOpen}>
        <DialogContent className="bg-bg-elevated border-border-main sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">{hasAssignedTech ? 'Swap technician' : 'Assign technician'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-[12px] font-medium text-text-secondary">{hasAssignedTech ? 'Replacement technician' : 'Technician'}</Label>
            <Select value={swapTechId} onValueChange={setSwapTechId}>
              <SelectTrigger className="h-9 text-[13px] bg-bg-secondary border-border-main">
                <SelectValue placeholder="Choose a technician…" />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                {sortTechniciansForDeployment(technicians.filter(isAssignableTechnician)).map(t => (
                  <SelectItem key={t.id} value={t.id} disabled={isInactiveTechnician(t)} className="text-[13px]">
                    {t.name}{isInactiveTechnician(t) ? ' · Inactive' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setSwapOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!swapTechId} onClick={handleSwapTech}>{hasAssignedTech ? 'Confirm swap' : 'Assign technician'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Helper Dialog */}
      <Dialog open={helperOpen} onOpenChange={setHelperOpen}>
        <DialogContent className="bg-bg-elevated border-border-main sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Add helper</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-[12px] font-medium text-text-secondary">Helper</Label>
            <Select value={helperTechId} onValueChange={setHelperTechId}>
              <SelectTrigger className="h-9 text-[13px] bg-bg-secondary border-border-main">
                <SelectValue placeholder="Choose a technician…" />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                {sortTechniciansForDeployment(technicians
                  .filter(t => isAssignableTechnician(t) && t.id !== assignedTechId && !helperIds.includes(t.id)))
                  .map(t => (
                    <SelectItem key={t.id} value={t.id} disabled={isInactiveTechnician(t)} className="text-[13px]">
                      {t.name}{isInactiveTechnician(t) ? ' · Inactive' : ''}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setHelperOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!helperTechId} onClick={handleAddHelper}>Add helper</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
