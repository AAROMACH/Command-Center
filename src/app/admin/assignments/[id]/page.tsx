'use client';
import { ClientField, SiteAddressField, clientByName, useClientDirectory } from '@/components/client-fields';
import { JobInvoicePanel } from '@/components/job-invoice';
import { flagRemovedHelperEntries } from '@/lib/helper-progress';
import { onSharedSnapshot } from '@/lib/shared-snapshot';

import { helperProgressOf } from '@/lib/helper-progress';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { db, auth } from '@/lib/firebase';
import { NotificationService } from '@/lib/notification-service';
import {
  doc, getDoc, collection, onSnapshot,
  updateDoc, arrayUnion, arrayRemove, setDoc, deleteDoc, deleteField,
} from 'firebase/firestore';
import type { WorkOrder, Technician } from '@/lib/types';
import { StatusBadge } from '@/components/status-badge';
import { PageHeader } from '@/components/page-header';
import { EmptyState, LoadingState, PageLoading } from '@/components/empty-state';
import { statusLabel } from '@/lib/status-styles';
import { PayHistorySection, useAssignmentPayHistory } from './pay-history';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  ShieldCheck, Phone, Calendar, Clock, DollarSign,
  Briefcase, MapPin, Navigation, AlertTriangle, Users, UserPlus,
  ArrowLeftRight, Flag, Activity, MessageSquare, ExternalLink, Wrench,
  Pencil, Type, FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn, sanitize, isAssignableTechnician, isInactiveTechnician, sortTechniciansForDeployment } from '@/lib/utils';
import { isPayAdmin } from '@/lib/permissions';
import { PAY_TYPE_LABELS, ID_PREFIXES } from '@/lib/constants';
import { toUnassignedWorkOrder, parseLocalDate, jobTechId } from '@/lib/jobs';
import { createDocId } from '@/lib/generateId';
import { syncWeeklyLogForAdminStatusEdit, moveJobLogOnSwap, describeSwapLogMove } from '@/lib/weekly-log';

const AssignmentMap = dynamic(() => import('./assignment-map'), { ssr: false });

function getStatusLabel(status: string) {
  return ({
    unassigned: 'Unassigned', assigned: 'Assigned', confirmed: 'Confirmed',
    'on-my-way': 'En route', 'in-progress': 'In progress',
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

// ── Tech card ────────────────────────────────────────────────────────────────
function TechCard({ tech, role }: { tech: Technician; role: 'lead' | 'helper' }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-sub bg-bg-primary/40 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-tertiary text-sm font-semibold text-text-primary">
        {tech.name.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-1.5">
          <p className="truncate text-[13px] font-semibold text-text-primary">{tech.name}</p>
          <StatusBadge kind="log" value={role === 'lead' ? 'paid' : 'submitted'} label={role === 'lead' ? 'Lead' : 'Helper'} className="shrink-0" />
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <Calendar size={11} />
          <span className="font-mono text-text-secondary">{tech.currentWorkload ?? '—'}</span>
          <span>active jobs</span>
        </p>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AssignmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const assignmentId = params?.id as string;

  const [assignment, setAssignment] = useState<WorkOrder | null>(null);
  const [sourceCollection, setSourceCollection] = useState<'assignments' | 'workOrders'>('assignments');
  const [tech, setTech] = useState<Technician | null>(null);
  const [loading, setLoading] = useState(true);
  const [allTechs, setAllTechs] = useState<Technician[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapTechId, setSwapTechId] = useState('');
  const [helperOpen, setHelperOpen] = useState(false);
  const [helperTechId, setHelperTechId] = useState('');
  const [detailView, setDetailView] = useState<'overview' | 'pay' | 'history'>('overview');
  const [historyTypeFilter, setHistoryTypeFilter] = useState('all');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editedOrder, setEditedOrder] = useState<WorkOrder | null>(null);
  const dir = useClientDirectory();

  useEffect(() => {
    setCurrentUserId(typeof window !== 'undefined' ? sessionStorage.getItem('currentUserId') : null);
  }, []);

  const currentUser = allTechs.find(t => t.id === currentUserId) || null;

  // Load assignment (assignments collection first, fallback to workOrders)
  useEffect(() => {
    if (!assignmentId) return;
    (async () => {
      const aSnap = await getDoc(doc(db, 'assignments', assignmentId));
      if (aSnap.exists()) {
        setAssignment({ ...aSnap.data(), id: aSnap.id } as WorkOrder);
        setSourceCollection('assignments');
        setLoading(false);
        return;
      }
      const wSnap = await getDoc(doc(db, 'workOrders', assignmentId));
      if (wSnap.exists()) {
        setAssignment({ ...wSnap.data(), id: wSnap.id } as WorkOrder);
        setSourceCollection('workOrders');
      }
      setLoading(false);
    })();
  }, [assignmentId]);

  // Live-subscribe to primary tech
  useEffect(() => {
    if (!assignment) return;
    const tid = assignment.assignedTechnicianId || assignment.techId || assignment.assignedTechIds?.[0];
    if (!tid) return;
    return onSnapshot(doc(db, 'users', tid), s => {
      if (s.exists()) setTech({ ...s.data(), id: s.id } as Technician);
    });
  }, [assignment?.assignedTechnicianId, assignment?.techId]);

  // All techs (for dialogs)
  useEffect(() => onSharedSnapshot('users', s => {
    setAllTechs(s.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
  }), []);

  // Pay history: every weekly-log line (lead + helpers), approvals, holds,
  // disputes and pay adjustments for this job (lib/assignment-pay-history).
  const payHistory = useAssignmentPayHistory(assignment, assignmentId, allTechs);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSwapTech = async () => {
    if (!swapTechId || !assignment) return;
    const nt = allTechs.find(t => t.id === swapTechId);
    if (nt && isInactiveTechnician(nt)) return;
    const prevTechId = assignment.assignedTechnicianId || assignment.techId || '';
    const prevTech = allTechs.find(t => t.id === prevTechId);
    const admin = auth.currentUser?.displayName || 'Admin';
    try {
      await updateDoc(doc(db, 'assignments', assignment.id), {
        assignedTechnicianId: swapTechId, techId: swapTechId,
        technicianName: nt?.name || '',
        history: arrayUnion({ date: new Date().toISOString(), type: 'tech_swapped',
          previousTechnicianId: prevTechId, previousTechnicianName: prevTech?.name || prevTechId,
          newTechnicianId: swapTechId, newTechnicianName: nt?.name || swapTechId,
          details: `Reassigned from ${prevTech?.name || 'unassigned'} to ${nt?.name || swapTechId}`, user: admin }),
      });
      setAssignment(p => p ? { ...p, assignedTechnicianId: swapTechId, techId: swapTechId } : p);
      setSwapOpen(false); setSwapTechId('');
      NotificationService.notifyJobChange(assignment, { ...assignment, assignedTechnicianId: swapTechId, techId: swapTechId }).catch(() => {});
      const moved = await moveJobLogOnSwap({ job: assignment, fromTechIds: [(assignment as any).techId, assignment.assignedTechnicianId], toTechId: swapTechId });
      const note = describeSwapLogMove(moved, prevTech?.name || 'the previous tech', nt?.name || 'the new tech');
      toast({ variant: note?.warn ? 'destructive' : undefined, title: 'Technician Swapped', description: `Now assigned to ${nt?.name}.${note ? ' ' + note.text : ''}` });
    } catch (e: any) { toast({ variant: 'destructive', title: 'Swap Failed', description: e.message }); }
  };

  const handleAddHelper = async () => {
    if (!helperTechId || !assignment) return;
    const ht = allTechs.find(t => t.id === helperTechId);
    if (ht && isInactiveTechnician(ht)) return;
    try {
      await updateDoc(doc(db, 'assignments', assignment.id), {
        additionalTechnicianIds: arrayUnion(helperTechId),
        history: arrayUnion({ date: new Date().toISOString(), type: 'helper_added',
          details: `${ht?.name || helperTechId} added as helper`, user: 'Admin' }),
      });
      setAssignment(p => p ? { ...p, additionalTechnicianIds: [...(p.additionalTechnicianIds || []), helperTechId] } : p);
      setHelperOpen(false); setHelperTechId('');
      toast({ title: 'Helper Added', description: `${ht?.name} added to team.` });
    } catch (e: any) { toast({ variant: 'destructive', title: 'Failed', description: e.message }); }
  };

  const handleRemoveHelper = async (id: string) => {
    if (!assignment) return;
    const ht = allTechs.find(t => t.id === id);
    if (!confirm(`Remove ${ht?.name || 'this helper'} from the job? Their weekly log entry moves to a "Removed as helper" section and won't be paid unless they show they worked it.`)) return;
    try {
      await updateDoc(doc(db, 'assignments', assignment.id), {
        additionalTechnicianIds: arrayRemove(id),
        // Re-adding them later starts their own workflow fresh.
        [`helperProgress.${id}`]: deleteField(),
        history: arrayUnion({ date: new Date().toISOString(), type: 'helper_removed',
          details: `${ht?.name || id} removed from team`, user: 'Admin' }),
      });
      setAssignment(p => p ? { ...p, additionalTechnicianIds: (p.additionalTechnicianIds || []).filter(x => x !== id) } : p);
      const { flagged, approved } = await flagRemovedHelperEntries(assignment.id, id, currentUser?.name || 'Admin');
      toast({ title: 'Helper Removed', description: [
        flagged ? `Their log entry is marked "Removed as helper" for them to confirm.` : '',
        approved ? `${approved} entry is on an already-approved week — adjust it in Payroll.` : '',
      ].filter(Boolean).join(' ') || undefined });
    } catch (e: any) { toast({ variant: 'destructive', title: 'Failed', description: e.message }); }
  };

  const handleOpenEdit = () => {
    if (!assignment) return;
    setEditedOrder({ ...assignment });
    setIsEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editedOrder || !assignment) return;

    let finalUpdate: any = { ...editedOrder };
    const payAdmin = isPayAdmin(currentUser);
    const payChanged = (editedOrder.pay || 0) !== (assignment.pay || 0) || editedOrder.payType !== assignment.payType;

    if (payChanged && !payAdmin) {
      finalUpdate.pay = assignment.pay;
      finalUpdate.payType = assignment.payType;
      finalUpdate.payChangeRequest = {
        pay: editedOrder.pay || 0,
        payType: editedOrder.payType || 'fixed',
        requestedBy: currentUser?.id || 'unknown',
        requestedAt: new Date().toISOString(),
      };
      toast({ title: 'Pay Change Requested', description: 'Financial modifications require authorization.' });
    }

    const now = new Date().toISOString();
    const history = [...(editedOrder.history || [])];

    // Read the RAW legacy field, not the assignedTechnicianId-preferring
    // helper — a doc left desynced by a pre-fix swap has techId still
    // pointing at the old tech even though assignedTechnicianId is already
    // correct, and we need that mismatch to register as a change below.
    const prevTechId = (assignment as any).techId || assignment.assignedTechnicianId || '';
    const newTechId = finalUpdate.assignedTechnicianId || '';
    // Always keep techId in sync with the selected tech, even if the
    // dropdown wasn't touched this save — self-heals any doc left stale by
    // a swap that happened before techId syncing existed.
    finalUpdate.techId = newTechId || null;
    if (newTechId !== prevTechId) {
      const prevTechName = allTechs.find(t => t.id === prevTechId)?.name || (prevTechId ? prevTechId : 'Unassigned');
      const newTechName = allTechs.find(t => t.id === newTechId)?.name || (newTechId ? newTechId : 'Unassigned');
      history.push({
        type: 'tech_swap',
        date: now,
        previousTechnicianId: prevTechId || null,
        previousTechnicianName: prevTechName,
        newTechnicianId: newTechId || null,
        newTechnicianName: newTechName,
        details: `Reassigned from ${prevTechName} to ${newTechName}`,
        user: currentUser?.name || 'Admin',
      } as any);
    }

    history.push({ type: 'note', date: format(new Date(), 'MM-dd-yyyy'), details: 'Job details edited.', user: currentUser?.name || 'Admin' });
    finalUpdate.history = history;

    // A doc's collection follows its assignment state: unassigned jobs live
    // in `workOrders`, assigned ones in `assignments`. A plain updateDoc()
    // only ever touches the doc's CURRENT collection, so clearing/setting
    // the tech here must also migrate the doc across collections —
    // otherwise an "unassigned" job stays stuck in `assignments` (invisible
    // to the Unassigned tab, which only reads workOrders).
    const wasInAssignments = sourceCollection === 'assignments';
    const nowUnassigned = !finalUpdate.assignedTechnicianId;

    try {
      if (wasInAssignments && nowUnassigned) {
        const targetWo = toUnassignedWorkOrder(finalUpdate as WorkOrder, [{
          type: 'status_change', date: now,
          details: `Unassigned by ${currentUser?.name || 'Admin'} and returned to the Unassigned pool.`,
          user: currentUser?.name || 'Admin',
        }]);
        await setDoc(doc(db, 'workOrders', targetWo.id), sanitize(targetWo));
        await deleteDoc(doc(db, 'assignments', editedOrder.id));
        NotificationService.notifyJobChange(assignment, finalUpdate).catch(() => {});
        toast({ title: 'Saved', description: 'Job returned to the Unassigned pool.' });
        router.push('/admin/assignments');
        return;
      }
      if (!wasInAssignments && !nowUnassigned) {
        const assignmentId = await createDocId(ID_PREFIXES.ASSIGNMENT);
        const assignmentData = sanitize({
          ...finalUpdate,
          id: assignmentId,
          workOrderId: editedOrder.id,
          updatedAt: new Date().toISOString(),
        });
        await setDoc(doc(db, 'assignments', assignmentId), assignmentData);
        await deleteDoc(doc(db, 'workOrders', editedOrder.id));
        NotificationService.notifyJobChange(assignment, finalUpdate, assignmentId).catch(() => {});
        await syncWeeklyLogForAdminStatusEdit({ prevStatus: assignment.status, job: { ...(finalUpdate as WorkOrder), id: assignmentId }, techId: newTechId });
        toast({ title: 'Saved', description: 'Job updated.' });
        router.push(`/admin/assignments/${assignmentId}`);
        return;
      }

      await updateDoc(doc(db, sourceCollection, editedOrder.id), sanitize(finalUpdate));
      if (sourceCollection === 'assignments') NotificationService.notifyJobChange(assignment, finalUpdate).catch(() => {});
      if (newTechId !== prevTechId) {
        const moved = await moveJobLogOnSwap({ job: finalUpdate as WorkOrder, fromTechIds: [prevTechId, assignment.assignedTechnicianId], toTechId: newTechId });
        const note = describeSwapLogMove(moved, allTechs.find(t => t.id === prevTechId)?.name || 'the previous tech', allTechs.find(t => t.id === newTechId)?.name || 'the new tech');
        if (note) toast({ variant: note.warn ? 'destructive' : undefined, title: 'Weekly Log', description: note.text });
      } else {
        await syncWeeklyLogForAdminStatusEdit({ prevStatus: assignment.status, job: finalUpdate as WorkOrder, techId: newTechId });
      }
      setAssignment(finalUpdate as WorkOrder);
      setIsEditOpen(false);
      setEditedOrder(null);
      toast({ title: 'Saved', description: 'Job updated.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e.message });
    }
  };

  const handleVerify = async () => {
    if (!assignment) return;
    try {
      await updateDoc(doc(db, 'assignments', assignment.id), {
        isAudited: true, auditedAt: new Date().toISOString(),
      });
      setAssignment(p => p ? { ...p, isAudited: true } : p);
      toast({ title: 'Assignment Verified' });
    } catch (e: any) { toast({ variant: 'destructive', title: 'Verify Failed', description: e.message }); }
  };

  // ── Loading / not found ───────────────────────────────────────────────────
  if (loading) return <PageLoading label="Loading assignment…" />;

  if (!assignment) return (
    <div className="space-y-4 text-left">
      <PageHeader back={{ href: '/admin/assignments', label: 'Assignments' }} eyebrow="Assignment" icon={Briefcase} title="Assignment not found" />
      <EmptyState icon={AlertTriangle} title="Assignment not found" description={<span className="font-mono">{assignmentId}</span>} />
    </div>
  );

  // ── Derived values ────────────────────────────────────────────────────────
  const primTechId = assignment.assignedTechnicianId || assignment.techId;
  const helperIds = assignment.additionalTechnicianIds || [];

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
  const monthStr = dateObj ? format(dateObj, 'MMMM') : '—';
  const dayNum   = dateObj ? format(dateObj, 'd') : '—';
  const yearStr  = dateObj ? format(dateObj, 'yyyy') : '—';

  const HISTORY_DOTS = ['bg-text-green', 'bg-accent-gold', 'bg-brand-blue', 'bg-brand-red'];
  const recentHistory = [...(assignment.history || [])].reverse().slice(0, 6);

  const jobDetailRows: { label: string; value?: string; icon: React.ElementType; mono?: boolean }[] = [
    { label: 'Client',      value: assignment.clientName,                                          icon: Users },
    { label: 'Location',    value: assignment.location,                                             icon: MapPin },
    { label: 'Job type',    value: assignment.jobType || assignment.projectType,                   icon: Wrench },
    { label: 'Pay',         value: payLabel,                                                        icon: DollarSign },
    { label: 'Work order',  value: assignment.externalWorkOrderId || assignmentId.toUpperCase(),   icon: ExternalLink, mono: true },
    { label: 'Source',      value: assignment.source || '—',                                       icon: Activity },
  ];

  const cap = (s?: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
  const statusStripItems: { icon: React.ElementType; label: string; value: React.ReactNode; tone?: string }[] = [
    { icon: Flag,          label: 'Priority',   value: cap(assignment.priority),
      tone: assignment.priority === 'critical' || assignment.priority === 'high' ? 'text-text-red'
        : assignment.priority === 'medium' ? 'text-accent-gold' : undefined },
    { icon: ShieldCheck,   label: 'Status',     value: <StatusBadge kind="job" value={assignment.status} label={getStatusLabel(assignment.status)} /> },
    { icon: AlertTriangle, label: 'Risk level', value: riskLabel,
      tone: riskLabel === 'At risk' || riskLabel === 'Breached' ? 'text-accent-gold' : undefined },
    { icon: DollarSign,    label: 'Pay type',   value: cap(assignment.payType) },
    { icon: DollarSign,    label: 'Pay amount', value: payLabel, tone: 'text-text-green' },
  ];

  const titleText = assignment.title || assignment.description?.split('\n')[0]?.slice(0, 80) || assignmentId.toUpperCase();
  const cardCls = 'rounded-xl border border-border-sub bg-bg-secondary';
  const sectionTitle = 'flex items-center gap-2 text-[13px] font-semibold text-text-primary';
  const lineCount = payHistory?.lines.length ?? 0;

  return (
    <div className="space-y-5 text-left pb-24 min-w-0">

      <PageHeader
        back={{ href: '/admin/assignments', label: 'Assignments' }}
        eyebrow="Assignment"
        icon={Briefcase}
        title={<span className="break-words">{titleText}</span>}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge kind="job" value={assignment.status} label={getStatusLabel(assignment.status)} />
            {assignment.priority && <StatusBadge kind="job" value={assignment.priority === 'critical' || assignment.priority === 'high' ? 'missed' : 'scheduled'} label={`${cap(assignment.priority)} priority`} />}
            {assignment.isAudited && <StatusBadge kind="job" value="completed" label="Verified" />}
            <span className="font-mono text-[12px] text-text-muted">{assignmentId.toUpperCase()}</span>
            {assignment.shortId && assignment.shortId.toLowerCase() !== assignmentId.toLowerCase() && (
              <span className="font-mono text-[12px] text-text-muted">· {assignment.shortId.toUpperCase()}</span>
            )}
            {assignment.source && <StatusBadge kind="job" value="confirmed" label={assignment.source} />}
          </span>
        }
        actions={
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={handleOpenEdit}>
            <Pencil size={13} /> Edit
          </Button>
        }
      />

      {/* Client invoice (manual jobs) */}
      <JobInvoicePanel job={{ ...assignment, id: assignmentId } as WorkOrder} />

      {/* Team */}
      <section className={cn(cardCls, 'p-4')}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className={sectionTitle}><Users size={14} className="text-text-muted" /> Team</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1.5"
              onClick={() => { setHelperTechId(''); setHelperOpen(true); }}>
              <UserPlus size={13} /> Add helper
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5"
              onClick={() => { setSwapTechId(''); setSwapOpen(true); }}>
              <ArrowLeftRight size={13} /> Swap tech
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tech && <TechCard tech={tech} role="lead" />}
          {helperIds.map(hid => {
            const ht = allTechs.find(t => t.id === hid);
            if (!ht) return null;
            // The helper's own progress on this job (lib/helper-progress).
            const hp = helperProgressOf(assignment, hid);
            const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            return (
              <div key={hid} className="space-y-1">
                <TechCard tech={ht} role="helper" />
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <p className={cn('text-[11px] font-medium',
                    hp.status === 'completed' ? 'text-text-green' : hp.status === 'assigned' ? 'text-text-muted' : 'text-accent-gold')}>
                    {cap(hp.status.replace(/-/g, ' '))}
                    {hp.checkInAt ? ` · in ${time(hp.checkInAt)}` : ''}
                    {hp.completedAt ? ` · done ${time(hp.completedAt)}` : ''}
                  </p>
                  <button
                    title="Remove helper"
                    className="text-[11px] font-medium text-text-muted hover:text-text-red"
                    onClick={() => handleRemoveHelper(hid)}
                  >
                    Remove helper
                  </button>
                </div>
              </div>
            );
          })}
          {!tech && helperIds.length === 0 && (
            <EmptyState compact icon={Users} title="No team assigned" className="col-span-full" />
          )}
        </div>
      </section>

      {/* Page view tabs */}
      <div className="detail-tabs !justify-start">
        {([
          ['overview', 'Overview'],
          ['pay', `Pay history${lineCount ? ` (${lineCount})` : ''}`],
          ['history', 'Event history'],
        ] as const).map(([v, label]) => (
          <button key={v} onClick={() => setDetailView(v)} className={cn('detail-tab', detailView === v && 'active')}>
            {label}
          </button>
        ))}
      </div>

      {detailView === 'overview' && (
      <>

      {/* Job details | Schedule | Map */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-6">

        <section className={cn(cardCls, 'p-4 md:col-span-2 min-w-0')}>
          <h2 className={cn(sectionTitle, 'mb-2')}><Briefcase size={14} className="text-text-muted" /> Job details</h2>
          <dl>
            {jobDetailRows.map(({ label, value, icon: Icon, mono }) => (
              <div key={label} className="flex items-start gap-3 border-b border-border-sub py-2 last:border-0">
                <Icon size={13} className="mt-0.5 shrink-0 text-text-muted" />
                <dt className="w-20 shrink-0 text-[12px] text-text-muted">{label}</dt>
                <dd className={cn('min-w-0 break-words text-[13px] font-medium text-text-primary', mono && 'font-mono')}>{value || '—'}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={cn(cardCls, 'p-4 md:col-span-1 min-w-0')}>
          <h2 className={cn(sectionTitle, 'mb-3')}><Calendar size={14} className="text-text-muted" /> Schedule</h2>
          <div className="space-y-4">
            <div className="flex items-baseline gap-3">
              <p className="text-5xl font-bold leading-none tabular-nums text-text-primary">{dayNum}</p>
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-text-primary">{monthStr}</p>
                <p className="text-[12px] text-text-muted">{dayName} · {yearStr}</p>
              </div>
            </div>
            <div className="space-y-2 border-t border-border-sub pt-3">
              <div>
                <p className="mb-0.5 flex items-center gap-1 text-[12px] text-text-muted"><Clock size={12} /> Start window</p>
                <p className="text-xl font-bold tabular-nums text-text-primary">{formatTime(assignment.scheduleTime)}</p>
              </div>
              {endTime && (
                <div>
                  <p className="mb-0.5 flex items-center gap-1 text-[12px] text-text-muted"><Clock size={12} /> End window</p>
                  <p className="text-xl font-bold tabular-nums text-text-primary">{formatTime(endTime)}</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className={cn(cardCls, 'flex min-w-0 flex-col overflow-hidden md:col-span-3')}>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-sub px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <MapPin size={13} className="shrink-0 text-text-green" />
              <span className="truncate text-[12px] font-medium text-text-primary">{assignment.location || '—'}</span>
            </div>
            <button
              className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-text-green hover:underline"
              onClick={() => window.open(
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(assignment.location || '')}`,
                '_blank', 'noopener'
              )}
            >
              View full map <ExternalLink size={12} />
            </button>
          </div>

          <div className="flex-1" style={{ minHeight: 320 }}>
            <AssignmentMap location={assignment.location} lat={assignment.lat} lng={assignment.lng} />
          </div>

          <div className="grid shrink-0 grid-cols-3 divide-x divide-border-sub border-t border-border-sub">
            {[
              { icon: Clock,       label: 'ETA',      value: '—' },
              { icon: Navigation,  label: 'Distance', value: '—' },
              { icon: Activity,    label: 'Traffic',  value: '—' },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="px-1 py-2 text-center">
                <p className="mb-0.5 flex items-center justify-center gap-1 text-[11px] text-text-muted"><Icon size={11} /> {label}</p>
                <p className="text-[12px] font-semibold tabular-nums text-text-primary">{value}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Scope + actions */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-5">

        <section className={cn(cardCls, 'flex min-h-[240px] min-w-0 flex-col lg:col-span-3')}>
          <div className="flex-1 p-4">
            <h2 className={cn(sectionTitle, 'mb-3')}><Wrench size={14} className="text-text-muted" /> Scope of work</h2>
            <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text-secondary">
              {assignment.description || '—'}
            </p>
            {assignment.notes && (
              <p className="mt-3 border-t border-border-sub pt-3 text-[12px] leading-relaxed text-text-muted">
                {assignment.notes}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-px border-t border-border-sub bg-border-sub sm:grid-cols-5">
            {statusStripItems.map(({ icon: Icon, label, value, tone }, i) => (
              <div key={label} className={cn('flex flex-col items-center gap-1 bg-bg-secondary px-2 py-3 text-center',
                i === statusStripItems.length - 1 && 'col-span-2 sm:col-span-1')}>
                <Icon size={13} className={tone || 'text-text-muted'} />
                <p className="text-[11px] text-text-muted">{label}</p>
                <div className={cn('text-[12px] font-semibold', tone || 'text-text-primary')}>{value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className={cn(cardCls, 'p-4 lg:col-span-2 min-w-0')}>
          <h2 className={cn(sectionTitle, 'mb-3')}><Activity size={14} className="text-text-muted" /> Actions</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button size="sm" variant="outline" className="h-9 justify-start gap-1.5"
              onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(assignment.location || '')}`, '_blank', 'noopener')}>
              <Navigation size={13} /> Directions
            </Button>
            <Button size="sm" variant="outline"
              className={cn('h-9 justify-start gap-1.5', assignment.isAudited && 'border-text-green/30 text-text-green')}
              onClick={handleVerify}>
              <ShieldCheck size={13} /> {assignment.isAudited ? 'Verified' : 'Verify assignment'}
            </Button>
            <Button size="sm" variant="outline" className="h-9 justify-start gap-1.5">
              <Phone size={13} /> Call client
            </Button>
            <Button size="sm" variant="outline" className="h-9 justify-start gap-1.5"
              onClick={() => router.push('/admin/messaging')}>
              <MessageSquare size={13} /> Message client
            </Button>
          </div>
        </section>
      </div>

      {/* Pay ledger: this job's pay on each weekly log (FN fee/split applied) */}
      <section className={cn(cardCls, 'p-4')}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className={sectionTitle}><DollarSign size={14} className="text-text-muted" /> Pay ledger</h2>
          {lineCount > 0 && (
            <button className="text-[12px] font-medium text-brand-blue hover:underline" onClick={() => setDetailView('pay')}>
              Full pay history
            </button>
          )}
        </div>
        {payHistory && payHistory.lines.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 md:grid-cols-4">
            {payHistory.lines.map(l => (
              <div key={`${l.logId}-${l.itemId}`} className="min-w-0 rounded-lg border border-border-sub bg-bg-primary p-3">
                <p className="text-[12px] font-semibold text-text-primary">Week of {l.weekOf}</p>
                <p className={cn('mt-0.5 font-mono text-sm font-semibold tabular-nums', l.held ? 'text-text-muted line-through' : 'text-text-green')}>
                  ${l.pay.toFixed(2)}
                </p>
                <p className="truncate text-[11px] text-text-muted">{l.techName} · {l.isHelper ? 'helper' : 'lead'}</p>
                <StatusBadge kind="log" value={l.status} className="mt-1" />
              </div>
            ))}
          </div>
        ) : payHistory ? (
          <p className="text-[12px] text-text-muted">No pay logs linked</p>
        ) : (
          <LoadingState rows={1} label="Loading pay…" />
        )}
      </section>

      </> // end overview
      )}

      {detailView === 'pay' && <PayHistorySection history={payHistory} />}

      {detailView === 'history' && (
        <section className={cn(cardCls, 'flex flex-col p-4')}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className={sectionTitle}><Activity size={14} className="text-text-muted" /> Event history</h2>
            <Select value={historyTypeFilter} onValueChange={setHistoryTypeFilter}>
              <SelectTrigger className="h-8 w-[160px] border-border-main bg-bg-primary text-[12px]">
                <SelectValue placeholder="All events" />
              </SelectTrigger>
              <SelectContent className="border-border-main bg-bg-elevated">
                <SelectItem value="all" className="text-[12px]">All events</SelectItem>
                <SelectItem value="status" className="text-[12px]">Status changes</SelectItem>
                <SelectItem value="assignment" className="text-[12px]">Assignments</SelectItem>
                <SelectItem value="note" className="text-[12px]">Notes</SelectItem>
                <SelectItem value="dispatch" className="text-[12px]">Dispatch</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(() => {
            const filtered = recentHistory.filter(ev =>
              historyTypeFilter === 'all' || (ev.type || '').includes(historyTypeFilter)
            );
            return filtered.length > 0 ? (
              <ol className="max-h-[480px] overflow-y-auto">
                {filtered.map((ev, i) => {
                  const evDate = parseLocalDate(ev.date);
                  const dateStr = evDate ? format(evDate, 'MM-dd-yyyy') : ev.date?.slice(0, 10) || '';
                  const timeStr = evDate ? format(evDate, 'h:mm a') : '';
                  return (
                    <li key={i} className="flex gap-3 border-b border-border-sub py-2.5 last:border-0">
                      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', HISTORY_DOTS[i % HISTORY_DOTS.length])} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <p className="text-[13px] font-medium text-text-primary">{statusLabel(ev.type || 'event')}</p>
                          {ev.user && <span className="shrink-0 text-[11px] text-text-muted">{ev.user}</span>}
                        </div>
                        <p className="font-mono text-[11px] text-text-muted">{dateStr}{timeStr && ` ${timeStr}`}</p>
                        {ev.details && <p className="mt-0.5 break-words text-[12px] leading-snug text-text-secondary">{ev.details}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyState compact icon={Activity} title="No history recorded" />
            );
          })()}
        </section>
      )}

      {/* Dialogs ────────────────────────────────────────────────────────── */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { if (!open) setEditedOrder(null); setIsEditOpen(open); }}>
        <DialogContent className="sm:max-w-[750px] bg-bg-elevated border-border-default max-h-[90vh] overflow-hidden flex flex-col p-0 shadow-2xl">
          <DialogHeader className="p-6 pb-2 text-left border-b border-border-sub bg-bg-tertiary/30">
            <div className="space-y-1 text-left">
              <DialogTitle className="text-lg font-bold text-text-primary">Edit job</DialogTitle>
              <p className="text-xs text-text-muted text-left">Update the details for job <span className="font-bold text-text-primary">{assignmentId.toUpperCase()}</span></p>
            </div>
          </DialogHeader>
          {editedOrder && (
            // Plain native scroll, not Radix's ScrollArea — its internal
            // Viewport hardcodes an inline position:relative that blocks
            // percentage/flex height from reliably reaching it inside a
            // flex-col dialog, so tall content silently got clipped instead
            // of scrolling. Confirmed with a live browser test.
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-6 py-4 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2 text-left">
                    <Label className="text-[12px] font-medium text-text-muted flex items-center gap-2">
                      <Type size={12} className="text-brand-red" /> Job Title
                    </Label>
                    <Input placeholder="e.g. Network Audit" value={editedOrder.title || ''} onChange={(e) => setEditedOrder({ ...editedOrder, title: e.target.value })} className="bg-bg-primary border-border-sub h-10 text-xs font-bold" />
                  </div>
                  <div className="space-y-2 text-left">
                    <Label className="text-[12px] font-medium text-text-muted flex items-center gap-2">
                      <FileText size={12} className="text-accent-gold" /> Scope of Work
                    </Label>
                    <Textarea placeholder="Detailed requirements..." value={editedOrder.description || ''} onChange={(e) => setEditedOrder({ ...editedOrder, description: e.target.value })} className="bg-bg-primary border-border-sub h-24 text-xs" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 text-left">
                    <Label className="text-[12px] font-medium text-text-muted">Client</Label>
                    <ClientField value={editedOrder.clientName || ''} clientId={(editedOrder as { clientId?: string | null }).clientId} clients={dir.clients}
                      className="bg-bg-primary h-10 text-xs font-bold"
                      onChange={(name, c) => setEditedOrder({ ...editedOrder, clientName: name, ...(c ? { clientId: c.id } : {}) } as typeof editedOrder)} />
                  </div>
                  <div className="space-y-2 text-left">
                    <Label className="text-[12px] font-medium text-text-muted">Location</Label>
                    <SiteAddressField value={editedOrder.location || ''} sites={dir.sites}
                      clientId={(editedOrder as { clientId?: string | null }).clientId || clientByName(dir.clients, editedOrder.clientName)?.id}
                      className="bg-bg-primary h-10 text-xs"
                      onChange={addr => setEditedOrder({ ...editedOrder, location: addr })} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 text-left">
                    <Label className="text-[12px] font-medium text-text-muted">Service category</Label>
                    <Select value={editedOrder.projectType} onValueChange={(val) => setEditedOrder({ ...editedOrder, projectType: val })}>
                      <SelectTrigger className="h-10 bg-bg-primary text-xs font-bold"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Installation">Installation</SelectItem>
                        <SelectItem value="Troubleshooting">Troubleshooting</SelectItem>
                        <SelectItem value="Maintenance">Maintenance</SelectItem>
                        <SelectItem value="Survey">Survey</SelectItem>
                        <SelectItem value="Repair">Repair</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 text-left">
                    <Label className="text-[12px] font-medium text-text-muted">Priority</Label>
                    <Select value={editedOrder.priority} onValueChange={(val: any) => setEditedOrder({ ...editedOrder, priority: val })}>
                      <SelectTrigger className="h-10 bg-bg-primary text-xs font-bold"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 text-left">
                    <Label className="text-[12px] font-medium text-text-muted">Date</Label>
                    <Input type="date" value={editedOrder.scheduleDate || ''} onChange={(e) => setEditedOrder({ ...editedOrder, scheduleDate: e.target.value })} className="h-10 bg-bg-primary text-xs" />
                  </div>
                  <div className="space-y-2 text-left">
                    <Label className="text-[12px] font-medium text-text-muted">Start time</Label>
                    <Input placeholder="e.g. 10:00 AM EST" value={editedOrder.scheduleTime || ''} onChange={(e) => setEditedOrder({ ...editedOrder, scheduleTime: e.target.value })} className="h-10 bg-bg-primary text-xs" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 text-left">
                    <Label className="text-[12px] font-medium text-text-muted">Pay type</Label>
                    <Select value={editedOrder.payType} onValueChange={(val: any) => setEditedOrder({ ...editedOrder, payType: val })}>
                      <SelectTrigger className="h-10 bg-bg-primary text-xs font-bold"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed" className="text-xs font-bold">{PAY_TYPE_LABELS.fixed}</SelectItem>
                        <SelectItem value="hourly" className="text-xs font-bold">{PAY_TYPE_LABELS.hourly}</SelectItem>
                        <SelectItem value="blended" className="text-xs font-bold">{PAY_TYPE_LABELS.blended}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {editedOrder.payType !== 'blended' && (
                    <div className="space-y-2 text-left">
                      <Label className="text-[12px] font-medium text-text-muted">Labor rate ($)</Label>
                      <Input type="number" value={editedOrder.pay || 0} onChange={(e) => setEditedOrder({ ...editedOrder, pay: parseFloat(e.target.value) || 0 })} className="bg-bg-primary h-10 text-xs font-mono text-text-green" />
                    </div>
                  )}
                </div>

                {editedOrder.payType === 'blended' && (
                  <div className="grid grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2 duration-300 p-3 rounded-lg border border-border-sub bg-bg-secondary/50 text-left">
                    <div className="space-y-2 text-left">
                      <Label className="text-[12px] font-medium text-text-muted">Fixed base ($)</Label>
                      <div className="relative">
                        <DollarSign size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                        <Input
                          type="number"
                          value={editedOrder.blendedFixedPay || ''}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setEditedOrder({ ...editedOrder, blendedFixedPay: val, pay: val });
                          }}
                          className="bg-bg-primary h-9 pl-6 font-mono text-text-green text-[11px]"
                        />
                      </div>
                    </div>
                    <div className="space-y-2 text-left">
                      <Label className="text-[12px] font-medium text-text-muted">Included hours</Label>
                      <Input
                        type="number"
                        value={editedOrder.blendedIncludedHours || ''}
                        onChange={(e) => setEditedOrder({ ...editedOrder, blendedIncludedHours: parseFloat(e.target.value) || 0 })}
                        className="bg-bg-primary h-9 font-mono text-text-primary text-[11px]"
                      />
                    </div>
                    <div className="space-y-2 text-left">
                      <Label className="text-[12px] font-medium text-text-muted">Then ($/hr)</Label>
                      <div className="relative">
                        <DollarSign size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                        <Input
                          type="number"
                          value={editedOrder.blendedHourlyRate || ''}
                          onChange={(e) => setEditedOrder({ ...editedOrder, blendedHourlyRate: parseFloat(e.target.value) || 0 })}
                          className="bg-bg-primary h-9 font-mono text-text-green text-[11px]"
                        />
                      </div>
                    </div>
                    <p className="col-span-3 text-[11px] text-text-muted">Fixed amount for the included hours, then the hourly rate applies.</p>
                  </div>
                )}

                <Separator className="bg-border-sub" />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 text-left">
                    <Label className="text-[12px] font-medium text-text-muted">Technician</Label>
                    <Select value={editedOrder.assignedTechnicianId || (editedOrder as any).techId || 'unassigned'} onValueChange={(val) => setEditedOrder({ ...editedOrder, assignedTechnicianId: val === 'unassigned' ? null : val, status: val === 'unassigned' ? 'unassigned' : 'assigned' })}>
                      <SelectTrigger className="bg-bg-primary h-11 focus:ring-brand-red text-xs">
                        <SelectValue placeholder="Select technician" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned" className="text-text-red font-medium">Unassigned</SelectItem>
                        {sortTechniciansForDeployment(allTechs.filter(isAssignableTechnician)).map(t => <SelectItem key={t.id} value={t.id} disabled={isInactiveTechnician(t)} className="text-xs font-bold">{t.name}{isInactiveTechnician(t) ? ' · Inactive' : ''}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 text-left">
                    <Label className="text-[12px] font-medium text-text-muted">Status</Label>
                    <Select value={editedOrder.status} onValueChange={(val: any) => setEditedOrder({ ...editedOrder, status: val })}>
                      <SelectTrigger className="bg-bg-primary h-11 focus:ring-brand-red text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned" className="text-xs font-bold">Unassigned</SelectItem>
                        <SelectItem value="assigned" className="text-xs font-bold">Assigned</SelectItem>
                        <SelectItem value="confirmed" className="text-xs font-bold">Confirmed</SelectItem>
                        <SelectItem value="on-my-way" className="text-xs font-bold">On my way</SelectItem>
                        <SelectItem value="in-progress" className="text-xs font-bold">In progress</SelectItem>
                        <SelectItem value="completed" className="text-xs font-bold">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default mt-4 shrink-0 flex flex-row items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setIsEditOpen(false)} className="h-11 px-8 text-[12px]">Cancel</Button>
            <Button onClick={handleSaveEdit} className="h-11 px-10 bg-brand-red hover:bg-brand-red-hover text-[12px] text-white shadow-lg">
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={swapOpen} onOpenChange={setSwapOpen}>
        <DialogContent className="bg-bg-elevated border-border-main sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[13px] font-bold">Swap technician</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-[12px] font-medium text-text-muted">Replacement</Label>
            <Select value={swapTechId} onValueChange={setSwapTechId}>
              <SelectTrigger className="h-9 text-[11px] font-bold bg-bg-secondary border-border-main">
                <SelectValue placeholder="Choose technician..." />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                {sortTechniciansForDeployment(allTechs.filter(isAssignableTechnician)).map(t => (
                  <SelectItem key={t.id} value={t.id} disabled={isInactiveTechnician(t)} className="text-[11px] font-bold">{t.name}{isInactiveTechnician(t) ? ' · Inactive' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="h-8 text-[11px] font-bold" onClick={() => setSwapOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-8 text-[11px] font-bold bg-brand-red hover:bg-brand-red/90 text-white" disabled={!swapTechId} onClick={handleSwapTech}>Confirm swap</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={helperOpen} onOpenChange={setHelperOpen}>
        <DialogContent className="bg-bg-elevated border-border-main sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[13px] font-bold">Add helper</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-[12px] font-medium text-text-muted">Helper</Label>
            <Select value={helperTechId} onValueChange={setHelperTechId}>
              <SelectTrigger className="h-9 text-[11px] font-bold bg-bg-secondary border-border-main">
                <SelectValue placeholder="Choose technician..." />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                {sortTechniciansForDeployment(allTechs
                  .filter(t => isAssignableTechnician(t) && t.id !== primTechId))
                  .map(t => (
                    <SelectItem key={t.id} value={t.id} disabled={isInactiveTechnician(t)} className="text-[11px] font-bold">{t.name}{isInactiveTechnician(t) ? ' · Inactive' : ''}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="h-8 text-[11px] font-bold" onClick={() => setHelperOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-8 text-[11px] font-bold bg-brand-red hover:bg-brand-red/90 text-white" disabled={!helperTechId} onClick={handleAddHelper}>Add to team</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
