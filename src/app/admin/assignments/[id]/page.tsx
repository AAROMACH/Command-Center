'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { db, auth } from '@/lib/firebase';
import {
  doc, getDoc, collection, query, where, onSnapshot,
  updateDoc, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import type { WorkOrder, Technician, WeeklyLog } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, ShieldCheck, Phone, Mail, Calendar, Clock, DollarSign,
  Briefcase, MapPin, Navigation, AlertTriangle, Users, UserPlus,
  ArrowLeftRight, Check, Flag, Activity, MessageSquare, ExternalLink, Wrench,
  Pencil, Type, FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn, sanitize, isAssignableTechnician, isInactiveTechnician, sortTechniciansForDeployment } from '@/lib/utils';
import { isPayAdmin } from '@/lib/permissions';
import { PAY_TYPE_LABELS } from '@/lib/constants';

const AssignmentMap = dynamic(() => import('./assignment-map'), { ssr: false });

// Deterministic avatar color from full name
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

// ── Tech card ────────────────────────────────────────────────────────────────
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
                background: isPrimary ? 'var(--green-dim)' : 'var(--accent-gold-dim)',
                color: isPrimary ? 'var(--text-green)' : 'var(--accent-gold)',
                borderColor: isPrimary ? 'var(--border-green)' : 'var(--border-gold)',
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

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AssignmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const assignmentId = params?.id as string;

  const [assignment, setAssignment] = useState<WorkOrder | null>(null);
  const [sourceCollection, setSourceCollection] = useState<'assignments' | 'workOrders'>('assignments');
  const [tech, setTech] = useState<Technician | null>(null);
  const [relatedLogs, setRelatedLogs] = useState<WeeklyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [allTechs, setAllTechs] = useState<Technician[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapTechId, setSwapTechId] = useState('');
  const [helperOpen, setHelperOpen] = useState(false);
  const [helperTechId, setHelperTechId] = useState('');
  const [detailView, setDetailView] = useState<'overview' | 'history'>('overview');
  const [historyTypeFilter, setHistoryTypeFilter] = useState('all');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editedOrder, setEditedOrder] = useState<WorkOrder | null>(null);

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

  // Weekly logs
  useEffect(() => {
    if (!assignment) return;
    const tid = assignment.techId || assignment.assignedTechnicianId || '';
    if (!tid) return;
    return onSnapshot(
      query(collection(db, 'weeklyLogs'), where('techId', '==', tid)),
      s => setRelatedLogs(
        s.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog))
          .filter(l => l.items?.some(i => i.workOrderId === assignmentId))
      )
    );
  }, [assignment, assignmentId]);

  // All techs (for dialogs)
  useEffect(() => onSnapshot(collection(db, 'users'), s => {
    setAllTechs(s.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
  }), []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSwapTech = async () => {
    if (!swapTechId || !assignment) return;
    const nt = allTechs.find(t => t.id === swapTechId);
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
      toast({ title: 'Technician Swapped', description: `Now assigned to ${nt?.name}` });
    } catch (e: any) { toast({ variant: 'destructive', title: 'Swap Failed', description: e.message }); }
  };

  const handleAddHelper = async () => {
    if (!helperTechId || !assignment) return;
    const ht = allTechs.find(t => t.id === helperTechId);
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
    try {
      await updateDoc(doc(db, 'assignments', assignment.id), {
        additionalTechnicianIds: arrayRemove(id),
        history: arrayUnion({ date: new Date().toISOString(), type: 'helper_removed',
          details: `${ht?.name || id} removed from team`, user: 'Admin' }),
      });
      setAssignment(p => p ? { ...p, additionalTechnicianIds: (p.additionalTechnicianIds || []).filter(x => x !== id) } : p);
      toast({ title: 'Helper Removed' });
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

    history.push({ type: 'note', date: format(new Date(), 'MM-dd-yyyy'), details: 'Registry parameters adjusted.', user: currentUser?.name || 'Admin' });
    finalUpdate.history = history;

    try {
      await updateDoc(doc(db, sourceCollection, editedOrder.id), sanitize(finalUpdate));
      setAssignment(finalUpdate as WorkOrder);
      setIsEditOpen(false);
      setEditedOrder(null);
      toast({ title: 'Registry Updated', description: 'Job entry synchronized.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save Failed', description: e.message });
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
  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <p className="text-xs font-bold uppercase text-text-muted tracking-widest animate-pulse">Loading assignment...</p>
    </div>
  );

  if (!assignment) return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="h-8 text-[10px] uppercase font-bold text-text-muted" onClick={() => router.back()}>
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
  const primTechId = assignment.assignedTechnicianId || assignment.techId;
  const helperIds = assignment.additionalTechnicianIds || [];

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
        : assignment.priority === 'medium' ? 'var(--priority-medium)'
        : undefined },
    { icon: ShieldCheck,   label: 'Status',     value: getStatusLabel(assignment.status),
      color: assignment.status === 'confirmed' || assignment.status === 'completed' ? 'var(--text-green)' : undefined },
    { icon: AlertTriangle, label: 'Risk Level', value: riskLabel,
      color: riskLabel === 'At Risk' || riskLabel === 'Breached' ? 'var(--accent-gold)' : undefined },
    { icon: DollarSign,    label: 'Pay Type',   value: assignment.payType
        ? assignment.payType.charAt(0).toUpperCase() + assignment.payType.slice(1) : '—',
      color: undefined },
    { icon: DollarSign,    label: 'Pay Amount', value: payLabel,
      color: 'var(--text-green)' },
  ];

  return (
    <div className="space-y-5 text-left pb-24">

      {/* Back ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm"
          className="h-8 text-[10px] uppercase font-bold text-text-muted -ml-2"
          onClick={() => router.back()}>
          <ArrowLeft size={13} className="mr-1.5" /> Back to Assignments
        </Button>
        <Button size="sm" variant="outline"
          className="h-8 text-[9px] uppercase font-black tracking-widest gap-1.5 px-3"
          onClick={handleOpenEdit}>
          <Pencil size={10} /> Edit
        </Button>
      </div>

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
            <Check size={9} /> {getStatusLabel(assignment.status)}
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

      {/* Team ───────────────────────────────────────────────────────────── */}
      <div className="bg-bg-secondary rounded-xl border border-border-sub p-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
            <Users size={11} className="text-brand-red" /> Team
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline"
              className="h-7 text-[9px] uppercase font-black tracking-widest gap-1.5 px-3"
              onClick={() => { setHelperTechId(''); setHelperOpen(true); }}>
              <UserPlus size={10} /> Add Helper
            </Button>
            <Button size="sm" variant="outline"
              className="h-7 text-[9px] uppercase font-black tracking-widest gap-1.5 px-3"
              onClick={() => { setSwapTechId(''); setSwapOpen(true); }}>
              <ArrowLeftRight size={10} /> Swap Tech
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {tech && <TechCard tech={tech} label="PRIMARY" />}
          {helperIds.map(hid => {
            const ht = allTechs.find(t => t.id === hid);
            if (!ht) return null;
            return (
              <div key={hid} className="relative group">
                <TechCard tech={ht} label="HELPER" />
                <button
                  className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 rounded-full bg-bg-primary/80 flex items-center justify-center text-text-muted hover:text-rose-400 text-xs font-bold"
                  onClick={() => handleRemoveHelper(hid)}
                >
                  ×
                </button>
              </div>
            );
          })}
          {!tech && helperIds.length === 0 && (
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
          {/* Location header */}
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

          {/* Map canvas */}
          <div className="flex-1" style={{ minHeight: 320 }}>
            <AssignmentMap location={assignment.location} lat={assignment.lat} lng={assignment.lng} />
          </div>

          {/* ETA / Distance / Traffic */}
          <div className="grid grid-cols-3 divide-x divide-border-sub border-t border-border-sub shrink-0">
            {[
              { icon: Clock,       label: 'ETA',      value: '—' },
              { icon: Navigation,  label: 'Distance', value: '—' },
              { icon: Activity,    label: 'Traffic',  value: '—' },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="py-2 px-1 text-center">
                <p className="text-[7px] font-black uppercase tracking-widest text-text-muted flex items-center justify-center gap-0.5 mb-0.5">
                  <Icon size={7} /> {label}
                </p>
                <p className="text-[11px] font-black text-text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {value}
                </p>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* Scope + Action Buttons ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">

        {/* Scope of Work */}
        <div className="lg:col-span-2 bg-bg-secondary rounded-xl border border-border-sub flex flex-col min-h-[240px]">
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
                <p
                  className={cn('text-[9px] font-black uppercase leading-none', !color && 'text-text-primary')}
                  style={color ? { color } : {}}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel: action buttons */}
        <div className="lg:col-span-3 min-h-[240px]">

          {/* 2×2 action buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline"
              className="h-9 text-[9px] font-black uppercase tracking-widest gap-1.5 px-3 justify-start"
              onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(assignment.location || '')}`, '_blank', 'noopener')}>
              <Navigation size={10} /> Directions
            </Button>
            <Button size="sm" variant="outline"
              className={cn('h-9 text-[9px] font-black uppercase tracking-widest gap-1.5 px-3 justify-start',
                assignment.isAudited && 'text-green-400 border-green-400/30')}
              onClick={handleVerify}>
              <ShieldCheck size={10} /> {assignment.isAudited ? 'Verified' : 'Verify Assignment'}
            </Button>
            <Button size="sm" variant="outline"
              className="h-9 text-[9px] font-black uppercase tracking-widest gap-1.5 px-3 justify-start">
              <Phone size={10} /> Call Client
            </Button>
            <Button size="sm" variant="outline"
              className="h-9 text-[9px] font-black uppercase tracking-widest gap-1.5 px-3 justify-start"
              onClick={() => router.push('/admin/messaging')}>
              <MessageSquare size={10} /> Message Client
            </Button>
          </div>
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
                  ${(log.totalPayout || 0).toFixed(2)}
                </p>
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
                  try { evDate = new Date(ev.date); } catch {}
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

      {/* Dialogs ────────────────────────────────────────────────────────── */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { if (!open) setEditedOrder(null); setIsEditOpen(open); }}>
        <DialogContent className="sm:max-w-[750px] bg-bg-elevated border-border-default max-h-[90vh] overflow-hidden flex flex-col p-0 shadow-2xl">
          <DialogHeader className="p-6 pb-2 text-left border-b border-border-sub bg-bg-tertiary/30">
            <div className="space-y-1 text-left">
              <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Update Parameters</DialogTitle>
              <p className="text-xs text-text-muted text-left">Adjust manual parameters for record <span className="font-bold text-text-primary">{assignmentId.toUpperCase()}</span></p>
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
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                      <Type size={12} className="text-brand-red" /> Job Title
                    </Label>
                    <Input placeholder="e.g. Network Audit" value={editedOrder.title || ''} onChange={(e) => setEditedOrder({ ...editedOrder, title: e.target.value })} className="bg-bg-primary border-border-sub h-10 text-xs font-bold uppercase" />
                  </div>
                  <div className="space-y-2 text-left">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                      <FileText size={12} className="text-accent-gold" /> Scope of Work
                    </Label>
                    <Textarea placeholder="Detailed requirements..." value={editedOrder.description || ''} onChange={(e) => setEditedOrder({ ...editedOrder, description: e.target.value })} className="bg-bg-primary border-border-sub h-24 text-xs" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 text-left">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Client / Entity</Label>
                    <Input value={editedOrder.clientName || ''} onChange={(e) => setEditedOrder({ ...editedOrder, clientName: e.target.value })} className="bg-bg-primary h-10 text-xs font-bold uppercase" />
                  </div>
                  <div className="space-y-2 text-left">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Site Location</Label>
                    <Input value={editedOrder.location || ''} onChange={(e) => setEditedOrder({ ...editedOrder, location: e.target.value })} className="bg-bg-primary h-10 text-xs" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 text-left">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Service Category</Label>
                    <Select value={editedOrder.projectType} onValueChange={(val) => setEditedOrder({ ...editedOrder, projectType: val })}>
                      <SelectTrigger className="h-10 bg-bg-primary text-xs uppercase font-bold"><SelectValue /></SelectTrigger>
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
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Priority Level</Label>
                    <Select value={editedOrder.priority} onValueChange={(val: any) => setEditedOrder({ ...editedOrder, priority: val })}>
                      <SelectTrigger className="h-10 bg-bg-primary text-xs uppercase font-bold"><SelectValue /></SelectTrigger>
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
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Schedule Date</Label>
                    <Input type="date" value={editedOrder.scheduleDate || ''} onChange={(e) => setEditedOrder({ ...editedOrder, scheduleDate: e.target.value })} className="h-10 bg-bg-primary text-xs" />
                  </div>
                  <div className="space-y-2 text-left">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Start Window</Label>
                    <Input placeholder="e.g. 10:00 AM EST" value={editedOrder.scheduleTime || ''} onChange={(e) => setEditedOrder({ ...editedOrder, scheduleTime: e.target.value })} className="h-10 bg-bg-primary text-xs" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 text-left">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Pay Model</Label>
                    <Select value={editedOrder.payType} onValueChange={(val: any) => setEditedOrder({ ...editedOrder, payType: val })}>
                      <SelectTrigger className="h-10 bg-bg-primary text-xs uppercase font-bold"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed" className="text-xs uppercase font-bold">{PAY_TYPE_LABELS.fixed}</SelectItem>
                        <SelectItem value="hourly" className="text-xs font-bold">{PAY_TYPE_LABELS.hourly}</SelectItem>
                        <SelectItem value="blended" className="text-xs font-bold">{PAY_TYPE_LABELS.blended}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {editedOrder.payType !== 'blended' && (
                    <div className="space-y-2 text-left">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Labor Rate ($)</Label>
                      <Input type="number" value={editedOrder.pay || 0} onChange={(e) => setEditedOrder({ ...editedOrder, pay: parseFloat(e.target.value) || 0 })} className="bg-bg-primary h-10 text-xs font-mono text-text-green" />
                    </div>
                  )}
                </div>

                {editedOrder.payType === 'blended' && (
                  <div className="grid grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2 duration-300 p-3 rounded-lg border border-border-sub bg-bg-secondary/50 text-left">
                    <div className="space-y-2 text-left">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Fixed Base ($)</Label>
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
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Incl. Hours</Label>
                      <Input
                        type="number"
                        value={editedOrder.blendedIncludedHours || ''}
                        onChange={(e) => setEditedOrder({ ...editedOrder, blendedIncludedHours: parseFloat(e.target.value) || 0 })}
                        className="bg-bg-primary h-9 font-mono text-text-primary text-[11px]"
                      />
                    </div>
                    <div className="space-y-2 text-left">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Post Rate ($/hr)</Label>
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
                    <p className="col-span-3 text-[9px] text-text-muted uppercase font-bold italic tracking-tighter text-left">Fixed amount for specified hours, then hourly rate applies.</p>
                  </div>
                )}

                <Separator className="bg-border-sub" />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 text-left">
                    <Label className="text-[10px] uppercase font-bold text-text-muted ml-1 text-center block">Technician Allocation</Label>
                    <Select value={editedOrder.assignedTechnicianId || (editedOrder as any).techId || 'unassigned'} onValueChange={(val) => setEditedOrder({ ...editedOrder, assignedTechnicianId: val === 'unassigned' ? undefined : val, status: val === 'unassigned' ? 'unassigned' : 'assigned' })}>
                      <SelectTrigger className="bg-bg-primary h-11 focus:ring-brand-red text-xs">
                        <SelectValue placeholder="Select Technician" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned" className="text-brand-red font-bold uppercase tracking-widest">UNASSIGNED</SelectItem>
                        {sortTechniciansForDeployment(allTechs.filter(isAssignableTechnician)).map(t => <SelectItem key={t.id} value={t.id} className="text-xs uppercase font-bold">{t.name}{isInactiveTechnician(t) ? ' · Inactive' : ''}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 text-left">
                    <Label className="text-[10px] uppercase font-bold text-text-muted ml-1 text-center block">Operational Status</Label>
                    <Select value={editedOrder.status} onValueChange={(val: any) => setEditedOrder({ ...editedOrder, status: val })}>
                      <SelectTrigger className="bg-bg-primary h-11 uppercase font-bold tracking-wider focus:ring-brand-red text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned" className="text-xs uppercase font-bold">UNASSIGNED</SelectItem>
                        <SelectItem value="assigned" className="text-xs uppercase font-bold">ASSIGNED</SelectItem>
                        <SelectItem value="confirmed" className="text-xs uppercase font-bold">CONFIRMED</SelectItem>
                        <SelectItem value="on-my-way" className="text-xs uppercase font-bold">ON MY WAY</SelectItem>
                        <SelectItem value="in-progress" className="text-xs uppercase font-bold">IN PROGRESS</SelectItem>
                        <SelectItem value="completed" className="text-xs uppercase font-bold">COMPLETED</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default mt-4 shrink-0 flex flex-row items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setIsEditOpen(false)} className="h-11 px-8 uppercase font-bold text-[10px] tracking-widest">Cancel</Button>
            <Button onClick={handleSaveEdit} className="h-11 px-10 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest text-white shadow-lg">
              Commit Registry Updates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={swapOpen} onOpenChange={setSwapOpen}>
        <DialogContent className="bg-bg-elevated border-border-main sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[13px] font-black uppercase tracking-widest">Swap Technician</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Select Replacement</Label>
            <Select value={swapTechId} onValueChange={setSwapTechId}>
              <SelectTrigger className="h-9 text-[10px] font-bold uppercase bg-bg-secondary border-border-main">
                <SelectValue placeholder="Choose technician..." />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                {sortTechniciansForDeployment(allTechs.filter(isAssignableTechnician)).map(t => (
                  <SelectItem key={t.id} value={t.id} className="text-[10px] font-bold uppercase">{t.name}{isInactiveTechnician(t) ? ' · Inactive' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="h-8 text-[10px] uppercase font-bold" onClick={() => setSwapOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-8 text-[10px] uppercase font-bold bg-brand-red hover:bg-brand-red/90 text-white" disabled={!swapTechId} onClick={handleSwapTech}>Confirm Swap</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={helperOpen} onOpenChange={setHelperOpen}>
        <DialogContent className="bg-bg-elevated border-border-main sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[13px] font-black uppercase tracking-widest">Add Helper</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Select Helper</Label>
            <Select value={helperTechId} onValueChange={setHelperTechId}>
              <SelectTrigger className="h-9 text-[10px] font-bold uppercase bg-bg-secondary border-border-main">
                <SelectValue placeholder="Choose technician..." />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                {sortTechniciansForDeployment(allTechs
                  .filter(t => isAssignableTechnician(t) && t.id !== primTechId))
                  .map(t => (
                    <SelectItem key={t.id} value={t.id} className="text-[10px] font-bold uppercase">{t.name}{isInactiveTechnician(t) ? ' · Inactive' : ''}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="h-8 text-[10px] uppercase font-bold" onClick={() => setHelperOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-8 text-[10px] uppercase font-bold bg-brand-red hover:bg-brand-red/90 text-white" disabled={!helperTechId} onClick={handleAddHelper}>Add to Team</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
