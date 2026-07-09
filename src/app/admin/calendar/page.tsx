'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import type { WorkOrder, Technician } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  ChevronLeft, ChevronRight, Users, Filter, Clock, MapPin,
  X, Building2, DollarSign, Download, Calendar as CalendarIcon,
  Phone, Mail, Check, AlertTriangle, Loader2, UserCheck, Maximize2, Minimize2,
} from 'lucide-react';
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, isSameDay, isToday, parseISO,
} from 'date-fns';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import {
  DndContext, type DragEndEvent,
  useDraggable, useDroppable,
  DragOverlay, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

const AdminMapView = dynamic(() => import('@/app/admin/map/components/admin-map-view'), { ssr: false });

const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  critical: { label: 'Critical', cls: 'text-brand-red bg-brand-red/10 border-brand-red/30' },
  high:     { label: 'High',     cls: 'text-orange-400 bg-orange-400/10 border-orange-400/30' },
  medium:   { label: 'Medium',   cls: 'text-accent-gold bg-accent-gold/10 border-accent-gold/30' },
  low:      { label: 'Low',      cls: 'text-text-muted bg-bg-tertiary border-border-sub' },
};

type JobWithSrc = WorkOrder & { _src: 'workOrder' | 'assignment' };

function isAssigned(wo: WorkOrder) {
  return !!(wo.assignedTechnicianId || (wo as any).techId || (wo.assignedTechIds?.length));
}

// ── Draggable calendar chip ──────────────────────────────────────
function CalendarChip({ wo, index, onClick }: { wo: WorkOrder; index: number; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: wo.id });
  const assigned = isAssigned(wo);
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: CSS.Translate.toString(transform), zIndex: 999 } : {}}
      {...attributes}
      {...listeners}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        'flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-tight cursor-grab active:cursor-grabbing select-none truncate border w-full',
        assigned
          ? 'bg-text-green/15 text-text-green border-text-green/30'
          : 'bg-brand-red/15 text-brand-red border-brand-red/30',
        isDragging && 'opacity-30',
      )}
    >
      <span className={cn(
        'shrink-0 w-3.5 h-3.5 rounded-full text-[7px] flex items-center justify-center font-black',
        assigned ? 'bg-text-green/30' : 'bg-brand-red/30',
      )}>{index + 1}</span>
      <span className="truncate ml-0.5">{wo.title || wo.description || wo.id.slice(0, 6)}</span>
    </div>
  );
}

// ── Droppable day cell ───────────────────────────────────────────
function DroppableDay({ day, children, className, onClick }: {
  day: Date; children: React.ReactNode; className?: string; onClick?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: format(day, 'yyyy-MM-dd') });
  return (
    <div ref={setNodeRef} onClick={onClick}
      className={cn(className, isOver && 'ring-2 ring-inset ring-brand-red/60 bg-brand-red/5')}>
      {children}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────
export default function AdminCalendarPage() {
  const { toast } = useToast();

  // Data
  const [rawWorkOrders, setRawWorkOrders] = useState<JobWithSrc[]>([]);
  const [rawAssignments, setRawAssignments] = useState<JobWithSrc[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'workOrders'), snap => {
      setRawWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id, _src: 'workOrder' } as JobWithSrc)));
      setLoading(false);
    }, () => setLoading(false));
    const u2 = onSnapshot(collection(db, 'assignments'), snap => {
      setRawAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id, _src: 'assignment' } as JobWithSrc)));
    });
    const u3 = onSnapshot(collection(db, 'users'), snap => {
      setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
    });
    return () => { u1(); u2(); u3(); };
  }, []);

  // Deduplicate — assignments take precedence (same id means job was assigned & moved)
  const allJobs = useMemo<JobWithSrc[]>(() => {
    const seen = new Set<string>();
    const out: JobWithSrc[] = [];
    [...rawAssignments, ...rawWorkOrders].forEach(j => {
      if (!seen.has(j.id)) { seen.add(j.id); out.push(j); }
    });
    return out;
  }, [rawWorkOrders, rawAssignments]);

  const adminTechs = useMemo(() =>
    technicians.filter(t => !t.roles?.includes('client')), [technicians]);

  // UI state
  const [monthDate, setMonthDate]         = useState(() => new Date());
  const [selectedDate, setSelectedDate]   = useState<Date>(() => new Date());
  const [filterTech, setFilterTech]       = useState('all');
  const [filterStatus, setFilterStatus]   = useState('all');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [drawerJob, setDrawerJob]         = useState<JobWithSrc | null>(null);
  const [mobileTab, setMobileTab]         = useState<'calendar' | 'map' | 'list'>('calendar');
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [dismissTarget, setDismissTarget] = useState<JobWithSrc | null>(null);
  const [dismissing, setDismissing]       = useState(false);
  const [showAssignPanel, setShowAssignPanel] = useState(false);
  const [savingEdit, setSavingEdit]       = useState(false);
  const [activeId, setActiveId]           = useState<string | null>(null);
  const [editForm, setEditForm]           = useState({
    scheduleDate: '', scheduleTime: '', scheduleEndTime: '',
    priority: '', assignedTechnicianId: '', notes: '',
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Filtered jobs
  const filteredJobs = useMemo(() => allJobs.filter(wo => {
    if (wo.archived || wo.status === 'archived') return false;
    if (filterTech !== 'all') {
      const tid = wo.assignedTechnicianId || (wo as any).techId;
      if (tid !== filterTech) return false;
    }
    if (filterStatus !== 'all' && wo.status !== filterStatus) return false;
    return true;
  }), [allJobs, filterTech, filterStatus]);

  // Calendar grid (Sunday-start per mockup)
  const monthDays = useMemo(() => {
    const start = startOfMonth(monthDate);
    const end   = endOfMonth(monthDate);
    const days  = eachDayOfInterval({ start, end });
    const startPad = getDay(start);
    const padBefore = Array.from({ length: startPad }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() - (startPad - i)); return d;
    });
    const endPad = 6 - getDay(end);
    const padAfter = Array.from({ length: endPad }, (_, i) => {
      const d = new Date(end); d.setDate(d.getDate() + i + 1); return d;
    });
    return [...padBefore, ...days, ...padAfter];
  }, [monthDate]);

  const jobsForDate = useCallback((day: Date) =>
    filteredJobs
      .filter(wo => {
        if (!wo.scheduleDate) return false;
        try { return isSameDay(parseISO(wo.scheduleDate), day); } catch { return false; }
      })
      .sort((a, b) => (a.scheduleTime || '').localeCompare(b.scheduleTime || '')),
    [filteredJobs]);

  const selectedDateJobs = useMemo(() => jobsForDate(selectedDate), [selectedDate, jobsForDate]);

  const unassignedCount = useMemo(() =>
    allJobs.filter(wo => !isAssigned(wo) && wo.status !== 'completed' && (wo as any).status !== 'cancelled').length,
    [allJobs]);

  const uniqueStatuses = useMemo(() =>
    [...new Set(allJobs.map(j => j.status).filter(Boolean))], [allJobs]);

  // Keep drawer in sync with live data
  useEffect(() => {
    if (!drawerJob) return;
    const updated = allJobs.find(j => j.id === drawerJob.id);
    if (updated) setDrawerJob(updated);
  }, [allJobs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Init edit form when a new job is opened in drawer
  useEffect(() => {
    if (!drawerJob) return;
    setEditForm({
      scheduleDate:    drawerJob.scheduleDate || '',
      scheduleTime:    drawerJob.scheduleTime || '',
      scheduleEndTime: (drawerJob as any).scheduleEndTime || '',
      priority:        drawerJob.priority || '',
      assignedTechnicianId: drawerJob.assignedTechnicianId || (drawerJob as any).techId || '',
      notes:           drawerJob.notes || '',
    });
    setShowAssignPanel(false);
  }, [drawerJob?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handlers
  const openDrawer = useCallback((wo: JobWithSrc) => {
    setSelectedJobId(wo.id);
    setDrawerJob(wo);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerJob(null);
    setSelectedJobId(null);
    setShowAssignPanel(false);
  }, []);

  const handleChipClick = useCallback((day: Date, wo: JobWithSrc) => {
    setSelectedDate(day);
    if (drawerJob?.id === wo.id) { closeDrawer(); } else { openDrawer(wo); }
  }, [drawerJob?.id, openDrawer, closeDrawer]);

  const handleJobCardClick = useCallback((wo: JobWithSrc) => {
    if (drawerJob?.id === wo.id) { closeDrawer(); } else { openDrawer(wo); }
  }, [drawerJob?.id, openDrawer, closeDrawer]);

  const handleSelectDate = (day: Date) => {
    setSelectedDate(day);
    closeDrawer();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const woId = active.id as string;
    const newDateStr = over.id as string;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDateStr)) return;
    const job = allJobs.find(j => j.id === woId);
    if (!job) return;
    if (job.scheduleDate && isSameDay(parseISO(job.scheduleDate), parseISO(newDateStr))) return;
    try {
      const coll = job._src === 'assignment' ? 'assignments' : 'workOrders';
      await updateDoc(doc(db, coll, woId), { scheduleDate: newDateStr });
      setSelectedDate(parseISO(newDateStr));
      if (drawerJob?.id === woId) setDrawerJob(p => p ? { ...p, scheduleDate: newDateStr } : p);
      toast({ title: `Job moved to ${format(parseISO(newDateStr), 'EEE, MMM d')}` });
    } catch {
      toast({ title: 'Failed to move job', variant: 'destructive' });
    }
  };

  const handleSaveEdit = async () => {
    if (!drawerJob) return;
    setSavingEdit(true);
    try {
      const coll = drawerJob._src === 'assignment' ? 'assignments' : 'workOrders';
      const updates: Record<string, any> = {
        scheduleDate:    editForm.scheduleDate || drawerJob.scheduleDate,
        scheduleTime:    editForm.scheduleTime,
        scheduleEndTime: editForm.scheduleEndTime,
        notes:           editForm.notes,
      };
      if (editForm.priority) updates.priority = editForm.priority;
      const prevTech = drawerJob.assignedTechnicianId || (drawerJob as any).techId;
      if (editForm.assignedTechnicianId && editForm.assignedTechnicianId !== prevTech) {
        updates.assignedTechnicianId = editForm.assignedTechnicianId;
        updates.status = 'assigned';
        const t = adminTechs.find(x => x.id === editForm.assignedTechnicianId);
        if (t) updates.technicianName = t.name;
      }
      await updateDoc(doc(db, coll, drawerJob.id), updates);
      if (editForm.scheduleDate) {
        try { setSelectedDate(parseISO(editForm.scheduleDate)); } catch { }
      }
      toast({ title: 'Job updated' });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAssignTech = async (techId: string) => {
    if (!drawerJob) return;
    setShowAssignPanel(false);
    try {
      const coll = drawerJob._src === 'assignment' ? 'assignments' : 'workOrders';
      const tech = adminTechs.find(t => t.id === techId);
      await updateDoc(doc(db, coll, drawerJob.id), {
        assignedTechnicianId: techId,
        technicianName: tech?.name || '',
        status: 'assigned',
      });
      setEditForm(f => ({ ...f, assignedTechnicianId: techId }));
      toast({ title: `Assigned to ${tech?.name || techId}` });
    } catch {
      toast({ title: 'Assignment failed', variant: 'destructive' });
    }
  };

  const handleDismiss = async () => {
    if (!dismissTarget) return;
    setDismissing(true);
    try {
      const coll = dismissTarget._src === 'assignment' ? 'assignments' : 'workOrders';
      await updateDoc(doc(db, coll, dismissTarget.id), { status: 'cancelled' });
      toast({ title: 'Job dismissed' });
      if (drawerJob?.id === dismissTarget.id) closeDrawer();
      setDismissTarget(null);
    } catch {
      toast({ title: 'Dismiss failed', variant: 'destructive' });
    } finally {
      setDismissing(false);
    }
  };

  const handleExportIcs = () => {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const toIcs = (s: string) => {
      try { const d = parseISO(s); return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`; } catch { return ''; }
    };
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aaromach//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    allJobs.filter(j => j.scheduleDate).forEach(wo => {
      const ds = toIcs(wo.scheduleDate);
      if (!ds) return;
      const t = technicians.find(x => x.id === (wo.assignedTechnicianId || (wo as any).techId));
      lines.push(
        'BEGIN:VEVENT', `UID:${wo.id}@aaromach.com`,
        `DTSTART;VALUE=DATE:${ds}`, `DTEND;VALUE=DATE:${ds}`,
        `SUMMARY:${(wo.title || wo.description || wo.id).replace(/,/g, '\\,')}`,
        ...(wo.location ? [`LOCATION:${wo.location.replace(/,/g, '\\,')}`] : []),
        ...(t?.name ? [`DESCRIPTION:Tech: ${t.name}`] : []),
        'END:VEVENT',
      );
    });
    lines.push('END:VCALENDAR');
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `schedule-${format(new Date(), 'yyyy-MM-dd')}.ics` });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Derived
  const drawerAssignedTech = drawerJob
    ? adminTechs.find(t => t.id === (drawerJob.assignedTechnicianId || (drawerJob as any).techId || editForm.assignedTechnicianId))
    : null;
  const activeDragJob = activeId ? allJobs.find(j => j.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      onDragEnd={handleDragEnd}
      onDragStart={({ active }) => setActiveId(active.id as string)}
    >
      {/* Mobile tab bar */}
      <div className="md:hidden flex border-b border-border-sub -mx-4 mb-0">
        {(['calendar', 'map', 'list'] as const).map(t => (
          <button key={t} onClick={() => setMobileTab(t)}
            className={cn('flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors',
              mobileTab === t ? 'border-b-2 border-brand-red text-brand-red' : 'text-text-muted hover:text-text-primary')}>
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-col rounded-xl border border-border-sub bg-bg-secondary overflow-hidden">

        {/* ── Topbar ── */}
        <div className="h-[52px] shrink-0 flex items-center gap-2 px-4 border-b border-border-sub">
          <div className="flex items-center gap-1">
            <button onClick={() => setMonthDate(d => subMonths(d, 1))}
              className="h-7 w-7 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => setMonthDate(d => addMonths(d, 1))}
              className="h-7 w-7 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors">
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => { setMonthDate(new Date()); setSelectedDate(new Date()); }}
              className="h-7 px-2.5 text-[11px] font-bold uppercase tracking-widest rounded border border-border-sub hover:bg-bg-primary text-text-muted hover:text-text-primary transition-colors">
              Today
            </button>
          </div>
          <span className="text-[16px] font-medium text-text-primary ml-1">{format(monthDate, 'MMMM yyyy')}</span>

          {unassignedCount > 0 && (
            <div className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-brand-red/10 text-brand-red font-medium ml-1 shrink-0">
              <AlertTriangle size={11} />{unassignedCount} unassigned
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Select value={filterTech} onValueChange={setFilterTech}>
              <SelectTrigger className="h-7 text-[11px] w-[120px] bg-bg-primary border-border-sub">
                <Users size={10} className="mr-1 text-text-muted shrink-0" />
                <SelectValue placeholder="All Techs" />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                <SelectItem value="all">All Techs</SelectItem>
                {adminTechs.map(t => <SelectItem key={t.id} value={t.id}>{t.name || t.id}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-7 text-[11px] w-[110px] bg-bg-primary border-border-sub">
                <Filter size={10} className="mr-1 text-text-muted shrink-0" />
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                <SelectItem value="all">All Statuses</SelectItem>
                {uniqueStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <button onClick={handleExportIcs}
              className="h-7 px-2.5 flex items-center gap-1.5 text-[11px] text-text-secondary hover:text-text-primary rounded-md border border-border-sub hover:border-border-main bg-bg-primary transition-colors">
              <Download size={12} /><span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>

        {/* ── Full-width Monthly Calendar ── */}
        <div className={cn('border-b border-border-sub', mobileTab !== 'calendar' && 'hidden md:block')}>
          <div className="grid grid-cols-7 bg-bg-tertiary border-b border-border-sub">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="py-2 text-center text-[9px] font-black uppercase tracking-widest text-text-muted">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 divide-x divide-y divide-border-sub">
            {monthDays.map((day, idx) => {
              const dayJobs  = jobsForDate(day);
              const visible  = dayJobs.slice(0, 3);
              const overflow = dayJobs.length - 3;
              const inMonth       = day.getMonth() === monthDate.getMonth();
              const isCurrentDay  = isToday(day);
              const isSelectedDay = isSameDay(day, selectedDate);
              return (
                <DroppableDay
                  key={idx}
                  day={day}
                  onClick={() => inMonth && handleSelectDate(day)}
                  className={cn(
                    'min-h-[80px] p-1.5 flex flex-col gap-0.5 transition-colors',
                    inMonth ? 'cursor-pointer' : 'opacity-25 pointer-events-none',
                    inMonth && !isCurrentDay && !isSelectedDay && 'hover:bg-bg-tertiary',
                    isCurrentDay && 'bg-brand-red/5',
                    isSelectedDay && !isCurrentDay && 'bg-bg-tertiary ring-1 ring-inset ring-brand-red/30',
                  )}
                >
                  <span className={cn(
                    'self-start text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full mb-0.5 pointer-events-none leading-none',
                    isCurrentDay  && 'bg-brand-red text-white',
                    !isCurrentDay && isSelectedDay  && 'text-brand-red',
                    !isCurrentDay && !isSelectedDay && 'text-text-muted',
                  )}>{format(day, 'd')}</span>
                  {visible.map((wo, i) => (
                    <CalendarChip
                      key={wo.id}
                      wo={wo}
                      index={i}
                      onClick={() => handleChipClick(day, wo)}
                    />
                  ))}
                  {overflow > 0 && (
                    <span className="text-[8px] font-bold text-text-muted pl-0.5 pointer-events-none">
                      +{overflow} more
                    </span>
                  )}
                </DroppableDay>
              );
            })}
          </div>
        </div>

        {/* ── Legend ── */}
        <div className="flex items-center gap-4 px-4 py-2 border-b border-border-sub shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-text-green" />
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Assigned</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-brand-red" />
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Unassigned</span>
          </div>
          <span className="text-[10px] text-text-muted">+  Drag to reschedule</span>
          <span className="ml-auto text-[10px] text-text-muted font-medium">
            {format(selectedDate, 'EEE, MMM d')} · {selectedDateJobs.length} job{selectedDateJobs.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── Below section: Map + Job List + Drawer ── */}
        <div className="flex overflow-hidden" style={{ height: 420 }}>

          {/* LEFT: Map */}
          <div className={cn(
            'shrink-0 border-r border-border-sub flex flex-col overflow-hidden transition-all duration-300',
            isMapExpanded ? 'md:w-[600px]' : 'md:w-[360px]',
            mobileTab === 'map' ? 'flex-1 w-full' : (mobileTab !== 'calendar' ? 'hidden md:flex' : 'hidden md:flex'),
          )}>
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-sub shrink-0">
              <MapPin size={10} className="text-brand-red" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex-1">
                {format(selectedDate, 'EEE, MMM d')} — {selectedDateJobs.length} job{selectedDateJobs.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setIsMapExpanded(v => !v)}
                className="text-text-muted hover:text-text-primary transition-colors hidden md:flex"
                title={isMapExpanded ? 'Collapse map' : 'Expand map'}
              >
                {isMapExpanded ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
              </button>
            </div>
            <div className="flex-1 relative overflow-hidden">
              {selectedDateJobs.length > 0 ? (
                <AdminMapView
                  jobs={selectedDateJobs}
                  selectedJob={drawerJob}
                  onSelectJob={(wo) => handleJobCardClick(wo as JobWithSrc)}
                  onResolveCoords={(jobId, lat, lng, address) => {
                    // Save the geocode back to the job so it isn't re-fetched.
                    const job = selectedDateJobs.find(j => j.id === jobId);
                    const coll = job?._src === 'assignment' ? 'assignments' : 'workOrders';
                    updateDoc(doc(db, coll, jobId), { lat, lng, geocodedAddress: address }).catch(() => {});
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full bg-[#1a1f2e]">
                  <p className="text-[9px] font-bold uppercase text-[#6b7db3] tracking-widest text-center px-4">
                    No jobs on {format(selectedDate, 'EEE, MMM d')}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* CENTER: Job list */}
          <div className={cn(
            'flex-1 min-w-0 flex flex-col overflow-hidden',
            mobileTab === 'list' ? 'w-full' : (mobileTab !== 'calendar' ? 'hidden md:flex' : 'hidden md:flex'),
            drawerJob && 'border-r border-border-sub',
            isMapExpanded && 'md:max-w-[380px]',
          )}>
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-sub shrink-0">
              <span className="text-[11px] font-medium text-text-primary flex-1">
                Jobs for <span className="font-bold">{format(selectedDate, 'EEE, MMM d, yyyy')}</span>
              </span>
              <span className="text-[9px] font-bold text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded border border-border-sub">
                {selectedDateJobs.length} Jobs
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-[72px] rounded-lg bg-bg-tertiary animate-pulse" />
                ))
              ) : selectedDateJobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <CalendarIcon size={24} className="text-text-muted opacity-20" />
                  <p className="text-[11px] text-text-muted">No jobs scheduled for this day</p>
                </div>
              ) : (
                selectedDateJobs.map((wo, idx) => {
                  const assigned  = isAssigned(wo);
                  const tech      = adminTechs.find(t => t.id === (wo.assignedTechnicianId || (wo as any).techId));
                  const isSelected = selectedJobId === wo.id;
                  const pm        = PRIORITY_META[wo.priority] || PRIORITY_META.low;
                  return (
                    <div
                      key={wo.id}
                      onClick={() => handleJobCardClick(wo)}
                      className={cn(
                        'rounded-lg border px-3 py-2.5 cursor-pointer transition-all',
                        isSelected
                          ? 'border-brand-red/40 bg-brand-red/5'
                          : 'border-border-sub bg-bg-secondary hover:border-border-main hover:bg-bg-tertiary',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span
                            className="shrink-0 w-5 h-5 rounded-full text-[9px] font-black text-white flex items-center justify-center leading-none"
                            style={{ background: assigned ? '#22c55e' : '#cc2200' }}
                          >{idx + 1}</span>
                          <span className={cn('text-[12px] font-medium truncate', isSelected ? 'text-brand-red' : 'text-text-primary')}>
                            {wo.title || wo.description || `#${wo.id.slice(0, 6)}`}
                          </span>
                        </div>
                        <span className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded border whitespace-nowrap shrink-0 font-bold uppercase tracking-wider',
                          assigned ? 'bg-text-green/10 text-text-green border-text-green/20' : 'bg-brand-red/10 text-brand-red border-brand-red/20',
                        )}>{assigned ? 'Assigned' : 'Unassigned'}</span>
                      </div>
                      {wo.clientName && (
                        <p className="text-[10px] text-text-muted mb-0.5 flex items-center gap-1 truncate">
                          <Building2 size={9} className="shrink-0" />{wo.clientName}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 text-[9px] text-text-muted mb-1">
                        {wo.scheduleTime && (
                          <span className="flex items-center gap-1">
                            <Clock size={9} />{wo.scheduleTime}
                            {(wo as any).scheduleEndTime && ` – ${(wo as any).scheduleEndTime}`}
                          </span>
                        )}
                        {wo.location && (
                          <span className="flex items-center gap-1 min-w-0">
                            <MapPin size={9} className="shrink-0" />
                            <span className="truncate">{wo.location}</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={cn('text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border', pm.cls)}>{pm.label}</span>
                        {wo.payType && (
                          <span className="text-[8px] text-text-muted bg-bg-tertiary border border-border-sub px-1.5 py-0.5 rounded uppercase">{wo.payType}</span>
                        )}
                        {wo.pay != null && (
                          <span className="text-[9px] font-mono font-bold text-text-green">${Number(wo.pay).toFixed(2)}</span>
                        )}
                        {tech && <span className="text-[8px] text-text-muted truncate">{tech.name}</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT: Job detail drawer */}
          {drawerJob && (
            <div className="w-[340px] shrink-0 flex flex-col overflow-hidden bg-bg-elevated">
              {/* Header */}
              <div className="flex items-start justify-between p-3.5 border-b border-border-sub shrink-0">
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className={cn(
                      'text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-widest',
                      isAssigned(drawerJob) ? 'bg-text-green/10 text-text-green border-text-green/20' : 'bg-brand-red/10 text-brand-red border-brand-red/20',
                    )}>{isAssigned(drawerJob) ? 'Assigned' : 'Unassigned'}</span>
                    <span className="text-[9px] text-text-muted font-mono uppercase">
                      {drawerJob.workOrderId || `#${drawerJob.id.slice(0, 10).toUpperCase()}`}
                    </span>
                  </div>
                  <p className="text-[13px] font-medium text-text-primary leading-tight">
                    {drawerJob.title || drawerJob.description || `#${drawerJob.id.slice(0, 6)}`}
                  </p>
                </div>
                <button onClick={closeDrawer} className="text-text-muted hover:text-text-primary p-0.5 shrink-0 transition-colors">
                  <X size={15} />
                </button>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto">
                <div className="p-3.5 space-y-4 divide-y divide-border-sub">

                  {/* Client */}
                  {drawerJob.clientName && (
                    <div className="pb-4">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">Client</p>
                      <p className="text-[12px] text-text-primary font-medium">{drawerJob.clientName}</p>
                      {(drawerJob as any).clientPhone && (
                        <a href={`tel:${(drawerJob as any).clientPhone}`}
                          className="text-[11px] text-text-muted flex items-center gap-1 mt-0.5 hover:text-brand-red transition-colors">
                          <Phone size={10} />{(drawerJob as any).clientPhone}
                        </a>
                      )}
                      {(drawerJob as any).clientEmail && (
                        <a href={`mailto:${(drawerJob as any).clientEmail}`}
                          className="text-[11px] text-text-muted flex items-center gap-1 mt-0.5 hover:text-brand-red transition-colors">
                          <Mail size={10} />{(drawerJob as any).clientEmail}
                        </a>
                      )}
                    </div>
                  )}

                  {/* Location */}
                  {drawerJob.location && (
                    <div className="py-4">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">Location</p>
                      <p className="text-[12px] text-text-primary flex items-start gap-1.5">
                        <MapPin size={11} className="text-brand-red shrink-0 mt-0.5" />
                        {drawerJob.location}
                      </p>
                    </div>
                  )}

                  {/* Editable: Schedule */}
                  <div className="py-4">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-2">Schedule</p>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-[9px] text-text-muted font-bold uppercase tracking-widest">Date</Label>
                        <Input
                          type="date"
                          value={editForm.scheduleDate}
                          onChange={e => setEditForm(f => ({ ...f, scheduleDate: e.target.value }))}
                          className="h-8 text-[11px] bg-bg-tertiary border-border-main mt-0.5"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[9px] text-text-muted font-bold uppercase tracking-widest">Start</Label>
                          <Input
                            type="time"
                            value={editForm.scheduleTime}
                            onChange={e => setEditForm(f => ({ ...f, scheduleTime: e.target.value }))}
                            className="h-8 text-[11px] bg-bg-tertiary border-border-main mt-0.5"
                          />
                        </div>
                        <div>
                          <Label className="text-[9px] text-text-muted font-bold uppercase tracking-widest">End</Label>
                          <Input
                            type="time"
                            value={editForm.scheduleEndTime}
                            onChange={e => setEditForm(f => ({ ...f, scheduleEndTime: e.target.value }))}
                            className="h-8 text-[11px] bg-bg-tertiary border-border-main mt-0.5"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Pay */}
                  {drawerJob.pay != null && (
                    <div className="py-4 flex items-center gap-5">
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-0.5">Pay</p>
                        <p className="text-[16px] font-mono font-bold text-text-green">${Number(drawerJob.pay).toFixed(2)}</p>
                      </div>
                      {drawerJob.payType && (
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-0.5">Type</p>
                          <p className="text-[11px] text-text-secondary capitalize">{drawerJob.payType}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Editable: Priority */}
                  <div className="py-4">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1.5">Priority</p>
                    <Select
                      value={editForm.priority || drawerJob.priority || ''}
                      onValueChange={v => setEditForm(f => ({ ...f, priority: v }))}
                    >
                      <SelectTrigger className="h-8 text-[11px] bg-bg-tertiary border-border-main">
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent className="bg-bg-elevated border-border-main">
                        {Object.entries(PRIORITY_META).map(([k, v]) => (
                          <SelectItem key={k} value={k} className="text-[11px] font-bold uppercase">{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Editable: Notes/Scope */}
                  <div className="py-4">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1.5">Scope / Notes</p>
                    <textarea
                      rows={3}
                      value={editForm.notes}
                      onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder={drawerJob.description || 'Add notes...'}
                      className="w-full text-[11px] bg-bg-tertiary border border-border-main rounded-md p-2 text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-brand-red/40 transition-all"
                    />
                  </div>

                  {/* Assignment display */}
                  <div className="py-4">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1.5">Assignment</p>
                    {drawerAssignedTech ? (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-bg-tertiary border border-border-sub">
                        <UserCheck size={12} className="text-text-green shrink-0" />
                        <span className="text-[11px] font-bold text-text-primary flex-1">{drawerAssignedTech.name}</span>
                        <span className="text-[9px] text-text-muted capitalize">{drawerJob.status}</span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-text-muted italic">No technician assigned</p>
                    )}
                  </div>

                  {/* Save button */}
                  <div className="pt-2">
                    <Button
                      size="sm"
                      onClick={handleSaveEdit}
                      disabled={savingEdit}
                      className="w-full h-8 text-[10px] font-bold uppercase tracking-widest bg-bg-tertiary border border-border-main text-text-secondary hover:bg-bg-primary hover:text-text-primary transition-all"
                    >
                      {savingEdit
                        ? <><Loader2 size={11} className="animate-spin mr-1.5" />Saving...</>
                        : <><Check size={11} className="mr-1.5" />Save Changes</>}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Footer: action buttons */}
              <div className="p-3 border-t border-border-sub flex flex-col gap-2 shrink-0">
                {/* Assign Tech */}
                <div className="relative">
                  <Button
                    className="w-full h-9 text-[11px] font-bold uppercase tracking-widest bg-brand-red hover:bg-brand-red/90 text-white"
                    onClick={() => setShowAssignPanel(v => !v)}
                  >
                    <UserCheck size={13} className="mr-1.5" />
                    Assign Tech
                  </Button>
                  {showAssignPanel && (
                    <div className="absolute bottom-full left-0 right-0 mb-1 bg-bg-elevated border border-border-main rounded-lg shadow-2xl z-[500] max-h-[180px] overflow-y-auto">
                      {adminTechs.map(t => {
                        const currentId = drawerJob.assignedTechnicianId || (drawerJob as any).techId;
                        const isCurrent = currentId === t.id;
                        return (
                          <button
                            key={t.id}
                            onClick={() => handleAssignTech(t.id)}
                            className={cn(
                              'w-full text-left px-3 py-2 text-[11px] hover:bg-bg-tertiary transition-colors flex items-center gap-2',
                              isCurrent && 'text-brand-red font-bold bg-brand-red/5',
                            )}
                          >
                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', isCurrent ? 'bg-brand-red' : 'bg-text-green')} />
                            {t.name || t.id}
                          </button>
                        );
                      })}
                      {adminTechs.length === 0 && (
                        <div className="px-3 py-4 text-[10px] text-text-muted text-center uppercase tracking-widest">No technicians</div>
                      )}
                    </div>
                  )}
                </div>
                {/* Dismiss Job */}
                <Button
                  variant="outline"
                  className="w-full h-9 text-[11px] font-bold uppercase tracking-widest border-brand-red/30 text-brand-red/70 hover:text-brand-red hover:bg-brand-red/5 transition-all"
                  onClick={() => setDismissTarget(drawerJob)}
                >
                  Dismiss Job
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dismiss confirmation dialog */}
      <Dialog open={!!dismissTarget} onOpenChange={v => !v && setDismissTarget(null)}>
        <DialogContent className="bg-bg-secondary border-border-main max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase tracking-widest">Dismiss Job?</DialogTitle>
            <DialogDescription className="text-[11px] text-text-muted leading-relaxed">
              This will mark &ldquo;<span className="font-bold text-text-primary">
                {dismissTarget?.title || dismissTarget?.description}
              </span>&rdquo; as cancelled. The status can be restored later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="ghost" size="sm" className="text-[10px] uppercase font-bold"
              onClick={() => setDismissTarget(null)} disabled={dismissing}>
              Cancel
            </Button>
            <Button size="sm"
              className="text-[10px] uppercase font-bold bg-brand-red hover:bg-brand-red/90 text-white"
              onClick={handleDismiss} disabled={dismissing}>
              {dismissing && <Loader2 size={11} className="animate-spin mr-1.5" />}
              {dismissing ? 'Dismissing...' : 'Dismiss Job'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DragOverlay */}
      <DragOverlay dropAnimation={null}>
        {activeDragJob ? (
          <div className={cn(
            'flex items-center gap-1 rounded px-2 py-1 border text-[8px] font-bold uppercase tracking-tight shadow-2xl rotate-1 cursor-grabbing',
            isAssigned(activeDragJob)
              ? 'bg-text-green/20 text-text-green border-text-green/40'
              : 'bg-brand-red/20 text-brand-red border-brand-red/40',
          )}>
            {activeDragJob.title || activeDragJob.description || activeDragJob.id.slice(0, 8)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
