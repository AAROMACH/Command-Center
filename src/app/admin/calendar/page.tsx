'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import type { WorkOrder, Technician, TimeOffRequest } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ChevronLeft, ChevronRight, Users, Filter, Clock, MapPin, AlertCircle,
  GripVertical, ChevronDown, X, Building2, AlertTriangle, Download, DollarSign, Flag,
} from 'lucide-react';
import {
  format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, addMonths, subMonths,
  startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  isSameDay, isToday, parseISO, isSameMonth,
} from 'date-fns';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import { DndContext, type DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

const AdminMapView = dynamic(() => import('@/app/admin/map/components/admin-map-view'), { ssr: false });

const TECH_PALETTE = [
  '#e53e3e', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

const STATUS_COLORS: Record<string, string> = {
  'in-progress': 'border-l-text-green',
  'on-my-way': 'border-l-blue-400',
  'confirmed': 'border-l-blue-400',
  'assigned': 'border-l-amber-400',
  'scheduled': 'border-l-brand-red',
  'completed': 'border-l-border-main',
  'default': 'border-l-border-sub',
};

function getStatusBorder(status: string) {
  return STATUS_COLORS[status] || STATUS_COLORS.default;
}

function getJobStatusBadge(wo: WorkOrder): { label: string; cls: string } {
  const tid = (wo as any).assignedTechnicianId || (wo as any).techId;
  if (!tid) return { label: 'Unassigned', cls: 'bg-brand-red/15 text-brand-red' };
  if (wo.status === 'completed') return { label: 'Completed', cls: 'bg-border-sub text-text-muted' };
  if (wo.status === 'in-progress' || wo.status === 'on-my-way') return { label: 'In Progress', cls: 'bg-blue-500/15 text-blue-400' };
  return { label: 'Assigned', cls: 'bg-text-green/15 text-text-green' };
}

function DroppableDay({
  day, children, className, onClick,
}: {
  day: Date;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: format(day, 'yyyy-MM-dd') });
  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={cn(className, isOver && 'ring-1 ring-inset ring-brand-red/50 bg-brand-red/5')}
    >
      {children}
    </div>
  );
}

function DraggableJobCard({
  wo, techColor, techName, isSelected, onSelect,
}: {
  wo: WorkOrder;
  techColor?: string;
  techName: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: wo.id });
  const dragStyle = transform ? { transform: CSS.Translate.toString(transform) } : {};
  return (
    <div
      ref={setNodeRef}
      style={{ ...dragStyle, ...(techColor ? { borderLeftColor: techColor } : {}) }}
      onClick={onSelect}
      className={cn(
        'rounded-md border bg-bg-secondary transition-all border-l-2 pl-1 pr-2 py-2 flex items-start gap-1 cursor-pointer',
        isDragging && 'opacity-40 shadow-2xl z-50',
        isSelected ? 'border-brand-red/50 bg-brand-red/5' : 'border-border-sub hover:border-border-main hover:bg-bg-tertiary',
        getStatusBorder(wo.status),
      )}
    >
      <div
        {...listeners}
        {...attributes}
        className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing p-0.5 touch-none"
        onClick={e => e.stopPropagation()}
      >
        <GripVertical size={9} className="text-text-muted/40" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black uppercase tracking-tight text-text-primary leading-tight truncate">
          {wo.title || wo.description || `#${wo.id.slice(0, 6)}`}
        </p>
        {wo.scheduleTime && (
          <p className="text-[9px] text-text-muted flex items-center gap-1 mt-0.5">
            <Clock size={8} className="shrink-0" />{wo.scheduleTime}
          </p>
        )}
        {wo.location && (
          <p className="text-[9px] text-text-muted flex items-center gap-1 mt-0.5 truncate">
            <MapPin size={8} className="shrink-0 text-brand-red" />
            <span className="truncate">{wo.location}</span>
          </p>
        )}
        {techName && (
          <p className="text-[9px] text-text-muted mt-0.5 truncate">{techName}</p>
        )}
      </div>
    </div>
  );
}

export default function AdminCalendarPage() {
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [miniCalMonth, setMiniCalMonth] = useState(() => new Date());
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTech, setFilterTech] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const [mobileTab, setMobileTab] = useState<'sidebar' | 'jobs' | 'map'>('jobs');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerJob, setDrawerJob] = useState<WorkOrder | null>(null);

  useEffect(() => {
    const unsubWO = onSnapshot(collection(db, 'workOrders'), (snap) => {
      setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
      setLoading(false);
    }, () => setLoading(false));
    const unsubTechs = onSnapshot(collection(db, 'users'), (snap) => {
      setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
    });
    const unsubPTO = onSnapshot(collection(db, 'timeOffRequests'), (snap) => {
      setTimeOffRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as TimeOffRequest)));
    });
    return () => { unsubWO(); unsubTechs(); unsubPTO(); };
  }, []);

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const weekOrders = useMemo(() => workOrders.filter(wo => {
    if (!wo.scheduleDate) return false;
    try {
      const d = parseISO(wo.scheduleDate);
      return d >= weekStart && d <= weekEnd;
    } catch { return false; }
  }), [workOrders, weekStart, weekEnd]);

  const filteredOrders = useMemo(() => weekOrders.filter(wo => {
    if (filterTech !== 'all' && (wo as any).assignedTechnicianId !== filterTech) return false;
    if (filterStatus !== 'all' && wo.status !== filterStatus) return false;
    return true;
  }), [weekOrders, filterTech, filterStatus]);

  const unscheduled = useMemo(() =>
    workOrders.filter(wo => !wo.scheduleDate && wo.status !== 'completed'),
    [workOrders]);

  const jobsForSelectedDate = useMemo(() =>
    workOrders
      .filter(wo => {
        if (!wo.scheduleDate) return false;
        if (filterTech !== 'all' && (wo as any).assignedTechnicianId !== filterTech) return false;
        if (filterStatus !== 'all' && wo.status !== filterStatus) return false;
        try { return isSameDay(parseISO(wo.scheduleDate), selectedDate); } catch { return false; }
      })
      .sort((a, b) => (a.scheduleTime || '').localeCompare(b.scheduleTime || '')),
    [workOrders, selectedDate, filterTech, filterStatus]);

  const adminTechs = useMemo(() =>
    technicians.filter(t => !t.roles?.includes('client')),
    [technicians]);

  const techColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    adminTechs.forEach((t, i) => { map[t.id] = TECH_PALETTE[i % TECH_PALETTE.length]; });
    return map;
  }, [adminTechs]);

  const monthDays = useMemo(() => {
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);
    const days = eachDayOfInterval({ start, end });
    const startPad = getDay(start) === 0 ? 6 : getDay(start) - 1;
    const padBefore = Array.from({ length: startPad }, (_, i) => addDays(start, -(startPad - i)));
    const endPad = 6 - (getDay(end) === 0 ? 6 : getDay(end) - 1);
    const padAfter = Array.from({ length: endPad }, (_, i) => addDays(end, i + 1));
    return [...padBefore, ...days, ...padAfter];
  }, [monthDate]);

  const miniCalDays = useMemo(() => {
    const start = startOfMonth(miniCalMonth);
    const end = endOfMonth(miniCalMonth);
    const days = eachDayOfInterval({ start, end });
    const startPad = getDay(start) === 0 ? 6 : getDay(start) - 1;
    const padBefore = Array.from({ length: startPad }, (_, i) => addDays(start, -(startPad - i)));
    const endPad = 6 - (getDay(end) === 0 ? 6 : getDay(end) - 1);
    const padAfter = Array.from({ length: endPad }, (_, i) => addDays(end, i + 1));
    return [...padBefore, ...days, ...padAfter];
  }, [miniCalMonth]);

  const unassignedCount = useMemo(() =>
    workOrders.filter(wo => {
      const tid = (wo as any).assignedTechnicianId || (wo as any).techId;
      return !tid && wo.status !== 'completed';
    }).length,
    [workOrders]);

  const uniqueStatuses = useMemo(() =>
    [...new Set(workOrders.map(wo => wo.status).filter(Boolean))],
    [workOrders]);

  const ordersForDayAll = (day: Date) =>
    workOrders.filter(wo => {
      if (!wo.scheduleDate) return false;
      if (filterTech !== 'all' && (wo as any).assignedTechnicianId !== filterTech) return false;
      try { return isSameDay(parseISO(wo.scheduleDate), day); } catch { return false; }
    });

  const ordersForDay = (day: Date) =>
    filteredOrders
      .filter(wo => { try { return isSameDay(parseISO(wo.scheduleDate), day); } catch { return false; } })
      .sort((a, b) => (a.scheduleTime || '').localeCompare(b.scheduleTime || ''));

  const ptoForDay = (day: Date) =>
    timeOffRequests.filter(req => {
      if (req.status !== 'approved') return false;
      try {
        const s = parseISO(req.startDate);
        const e = parseISO(req.endDate);
        return day >= s && day <= e;
      } catch { return false; }
    });

  const handleSelectJob = (wo: WorkOrder) => {
    if (drawerJob?.id === wo.id && drawerOpen) {
      setDrawerOpen(false);
      setDrawerJob(null);
      setSelectedJobId(null);
    } else {
      setSelectedJobId(wo.id);
      setDrawerJob(wo);
      setDrawerOpen(true);
      if (wo.scheduleDate) {
        try { setSelectedDate(parseISO(wo.scheduleDate)); } catch { }
      }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const woId = active.id as string;
    const newDateStr = over.id as string;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDateStr)) return;
    try {
      const newDate = parseISO(newDateStr);
      const wo = workOrders.find(w => w.id === woId);
      if (wo?.scheduleDate && isSameDay(parseISO(wo.scheduleDate), newDate)) return;
      await updateDoc(doc(db, 'workOrders', woId), { scheduleDate: newDateStr });
      setSelectedDate(newDate);
      setSelectedJobId(woId);
      if (drawerJob?.id === woId) setDrawerJob(prev => prev ? { ...prev, scheduleDate: newDateStr } : prev);
    } catch { /* silent */ }
  };

  const handleExportIcs = () => {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const toIcsDate = (dateStr: string) => {
      try {
        const d = parseISO(dateStr);
        return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
      } catch { return ''; }
    };
    const exportOrders = workOrders.filter(wo => wo.scheduleDate);
    const lines: string[] = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aaromach Command Center//EN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ];
    exportOrders.forEach(wo => {
      const dateStr = toIcsDate(wo.scheduleDate);
      if (!dateStr) return;
      const techId = (wo as any).assignedTechnicianId || (wo as any).techId;
      const tech = technicians.find(t => t.id === techId);
      const summary = (wo.title || wo.description || wo.id).replace(/,/g, '\\,');
      const description = [
        tech?.name ? `Tech: ${tech.name}` : '',
        wo.clientName ? `Client: ${wo.clientName}` : '',
      ].filter(Boolean).join('\\n');
      lines.push(
        'BEGIN:VEVENT',
        `UID:${wo.id}@aaromach.com`,
        `DTSTART;VALUE=DATE:${dateStr}`,
        `DTEND;VALUE=DATE:${dateStr}`,
        `SUMMARY:${summary}`,
        ...(wo.location ? [`LOCATION:${wo.location.replace(/,/g, '\\,')}`] : []),
        ...(description ? [`DESCRIPTION:${description}`] : []),
        'END:VEVENT',
      );
    });
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aaromach-calendar-${format(new Date(), 'yyyy-MM-dd')}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const selectDay = (day: Date) => {
    setSelectedDate(day);
    setWeekStart(startOfWeek(day, { weekStartsOn: 1 }));
    if (!isSameMonth(day, miniCalMonth)) setMiniCalMonth(day);
    if (viewMode === 'month') setMonthDate(day);
    setSelectedJobId(null);
    setDrawerOpen(false);
    setDrawerJob(null);
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
      {/* Mobile tab bar */}
      <div className="md:hidden flex border-b border-border-sub -mx-4 px-0 mb-0">
        {(['sidebar', 'jobs', 'map'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={cn(
              'flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors',
              mobileTab === tab ? 'border-b-2 border-brand-red text-brand-red' : 'text-text-muted hover:text-text-primary',
            )}
          >{tab === 'sidebar' ? 'Calendar' : tab}</button>
        ))}
      </div>

      <div className="flex flex-col rounded-xl border border-border-sub bg-bg-secondary overflow-hidden">

        {/* ── Topbar ── */}
        <div className="h-[52px] shrink-0 flex items-center gap-2 px-4 border-b border-border-sub bg-bg-secondary">
          <span className="text-[13px] font-medium text-text-primary tracking-[0.02em]">Schedule</span>
          <span className="text-[12px] text-text-muted hidden sm:inline">Dispatch Workspace</span>
          <div className="w-px h-5 bg-border-main mx-1" />
          {unassignedCount > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md bg-brand-red/10 text-brand-red shrink-0">
              <AlertTriangle size={11} />
              {unassignedCount} unassigned
            </div>
          )}
          <Select value={filterTech} onValueChange={setFilterTech}>
            <SelectTrigger className="h-7 text-[11px] w-[130px] bg-bg-primary border-border-sub shrink-0">
              <Users size={10} className="mr-1 shrink-0 text-text-muted" />
              <SelectValue placeholder="All Techs" />
            </SelectTrigger>
            <SelectContent className="bg-bg-elevated border-border-main">
              <SelectItem value="all">All Technicians</SelectItem>
              {adminTechs.map(t => <SelectItem key={t.id} value={t.id}>{t.name || t.id}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-7 text-[11px] w-[120px] bg-bg-primary border-border-sub shrink-0">
              <Filter size={10} className="mr-1 shrink-0 text-text-muted" />
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent className="bg-bg-elevated border-border-main">
              <SelectItem value="all">All Statuses</SelectItem>
              {uniqueStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-0.5 bg-bg-primary rounded-md p-0.5 border border-border-sub">
              <button
                onClick={() => setViewMode('week')}
                className={cn('px-2.5 py-0.5 rounded text-[12px] cursor-pointer transition-colors', viewMode === 'week' ? 'bg-bg-elevated text-text-primary font-medium' : 'text-text-muted hover:text-text-secondary')}
              >Week</button>
              <button
                onClick={() => setViewMode('month')}
                className={cn('px-2.5 py-0.5 rounded text-[12px] cursor-pointer transition-colors', viewMode === 'month' ? 'bg-bg-elevated text-text-primary font-medium' : 'text-text-muted hover:text-text-secondary')}
              >Month</button>
            </div>
            <button
              onClick={handleExportIcs}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[12px] text-text-secondary hover:text-text-primary rounded-md bg-bg-primary border border-border-sub hover:border-border-main transition-colors"
            >
              <Download size={12} />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>

        {/* ── 3-column body ── */}
        <div className="flex" style={{ height: 'calc(100svh - 200px)', minHeight: 500 }}>

          {/* SIDEBAR */}
          <div className={cn(
            'w-[220px] shrink-0 border-r border-border-sub overflow-y-auto bg-bg-secondary py-3',
            mobileTab !== 'sidebar' && 'hidden md:block',
          )}>
            {/* Mini calendar */}
            <div className="px-3 mb-4">
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setMiniCalMonth(m => subMonths(m, 1))}
                  className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors"
                  aria-label="Previous month"
                ><ChevronLeft size={14} /></button>
                <span className="text-[12px] font-medium text-text-primary">{format(miniCalMonth, 'MMMM yyyy')}</span>
                <button
                  onClick={() => setMiniCalMonth(m => addMonths(m, 1))}
                  className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors"
                  aria-label="Next month"
                ><ChevronRight size={14} /></button>
              </div>
              <div className="grid grid-cols-7 text-center mb-0.5">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                  <span key={i} className="text-[9px] text-text-muted py-0.5 font-medium">{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {miniCalDays.map((day, i) => {
                  const hasJobs = workOrders.some(wo => {
                    if (!wo.scheduleDate) return false;
                    try { return isSameDay(parseISO(wo.scheduleDate), day); } catch { return false; }
                  });
                  const isSelected = isSameDay(day, selectedDate);
                  const isCurrentDay = isToday(day);
                  const inMonth = isSameMonth(day, miniCalMonth);
                  return (
                    <button
                      key={i}
                      onClick={() => selectDay(day)}
                      className={cn(
                        'text-[11px] py-0.5 w-full flex items-center justify-center relative cursor-pointer transition-colors rounded',
                        inMonth ? 'text-text-secondary' : 'text-text-muted opacity-40',
                        isCurrentDay && 'bg-brand-red text-white font-medium rounded-full',
                        isSelected && !isCurrentDay && 'outline outline-[1.5px] outline-brand-red/50 rounded',
                        !isCurrentDay && !isSelected && 'hover:bg-bg-primary',
                      )}
                    >
                      {format(day, 'd')}
                      {hasJobs && (
                        <span className={cn(
                          'absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full',
                          isCurrentDay ? 'bg-white' : 'bg-brand-red/60',
                        )} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Week strip */}
            {viewMode === 'week' && (
              <div className="px-3">
                <p className="text-[10px] font-medium text-text-muted uppercase tracking-[0.08em] mb-1.5 px-1">This week</p>
                <div className="space-y-0.5">
                  {weekDays.map((day, i) => {
                    const count = ordersForDay(day).length;
                    const isActive = isSameDay(day, selectedDate);
                    return (
                      <button
                        key={i}
                        onClick={() => selectDay(day)}
                        className={cn(
                          'w-full flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-colors',
                          isActive ? 'bg-brand-red/10' : 'hover:bg-bg-primary',
                        )}
                      >
                        <span className={cn('text-[12px]', isActive ? 'text-brand-red font-medium' : 'text-text-secondary')}>
                          {format(day, 'EEE MMM d')}
                        </span>
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md', isActive ? 'text-brand-red' : 'text-text-muted')}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1 mt-3">
                  <button
                    onClick={() => setWeekStart(w => subWeeks(w, 1))}
                    className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors"
                  ><ChevronLeft size={13} /></button>
                  <button
                    onClick={() => { const w = startOfWeek(new Date(), { weekStartsOn: 1 }); setWeekStart(w); setSelectedDate(new Date()); setMiniCalMonth(new Date()); }}
                    className="flex-1 text-[9px] uppercase tracking-widest font-bold text-text-muted hover:text-text-primary transition-colors text-center py-1 rounded hover:bg-bg-primary"
                  >This Week</button>
                  <button
                    onClick={() => setWeekStart(w => addWeeks(w, 1))}
                    className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors"
                  ><ChevronRight size={13} /></button>
                </div>
              </div>
            )}

            {/* Month nav */}
            {viewMode === 'month' && (
              <div className="px-3">
                <p className="text-[10px] font-medium text-text-muted uppercase tracking-[0.08em] mb-1.5 px-1">Month</p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setMonthDate(d => subMonths(d, 1)); setMiniCalMonth(d => subMonths(d, 1)); }}
                    className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors"
                  ><ChevronLeft size={13} /></button>
                  <button
                    onClick={() => { const n = new Date(); setMonthDate(n); setMiniCalMonth(n); setSelectedDate(n); }}
                    className="flex-1 text-[9px] uppercase tracking-widest font-bold text-text-muted hover:text-text-primary transition-colors text-center py-1 rounded hover:bg-bg-primary"
                  >This Month</button>
                  <button
                    onClick={() => { setMonthDate(d => addMonths(d, 1)); setMiniCalMonth(d => addMonths(d, 1)); }}
                    className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors"
                  ><ChevronRight size={13} /></button>
                </div>
              </div>
            )}
          </div>

          {/* CENTER: job list or month grid */}
          <div className={cn(
            'flex-1 min-w-0 overflow-y-auto bg-bg-primary',
            mobileTab !== 'jobs' && 'hidden md:block',
          )}>
            {/* Sticky header */}
            <div className="sticky top-0 flex items-baseline gap-2 px-4 py-3 border-b border-border-sub bg-bg-primary z-10">
              <span className="text-[18px] font-medium text-text-primary leading-none">
                {viewMode === 'week' ? format(selectedDate, 'EEEE, MMM d') : format(monthDate, 'MMMM yyyy')}
              </span>
              <span className="text-[12px] text-text-muted">
                {viewMode === 'week'
                  ? `${jobsForSelectedDate.length} job${jobsForSelectedDate.length !== 1 ? 's' : ''}`
                  : `${filteredOrders.length} order${filteredOrders.length !== 1 ? 's' : ''}`}
              </span>
            </div>

            {/* Week view: job cards */}
            {viewMode === 'week' && (
              <div className="p-3 space-y-2">
                {loading ? (
                  <div className="h-20 rounded-lg bg-bg-secondary border border-border-sub animate-pulse" />
                ) : jobsForSelectedDate.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-[13px] text-text-muted">No jobs scheduled</p>
                  </div>
                ) : (
                  jobsForSelectedDate.map(wo => {
                    const badge = getJobStatusBadge(wo);
                    const isSelected = selectedJobId === wo.id;
                    return (
                      <div
                        key={wo.id}
                        onClick={() => handleSelectJob(wo)}
                        className={cn(
                          'rounded-[10px] border px-3 py-2.5 cursor-pointer transition-all',
                          isSelected
                            ? 'border-brand-red/40 bg-brand-red/5'
                            : 'border-border-sub bg-bg-secondary hover:border-border-main',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <span className={cn('text-[13px] font-medium leading-tight', isSelected ? 'text-brand-red' : 'text-text-primary')}>
                            {wo.title || wo.description || `#${wo.id.slice(0, 6)}`}
                          </span>
                          <span className={cn('text-[10px] px-2 py-0.5 rounded-md whitespace-nowrap shrink-0 font-medium', badge.cls)}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                          {wo.scheduleTime && (
                            <span className="flex items-center gap-1 text-[11px] text-text-muted">
                              <Clock size={11} />{wo.scheduleTime}
                            </span>
                          )}
                          {wo.location && (
                            <span className="flex items-center gap-1 text-[11px] text-text-muted">
                              <MapPin size={11} />{wo.location}
                            </span>
                          )}
                          {wo.clientName && (
                            <span className="flex items-center gap-1 text-[11px] text-text-muted">
                              <Building2 size={11} />{wo.clientName}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Unscheduled drag tray */}
                {unscheduled.length > 0 && (
                  <div className="rounded-lg border border-amber-400/30 bg-bg-secondary overflow-hidden mt-2">
                    <button
                      className="w-full flex items-center gap-2.5 p-3 text-left hover:bg-bg-tertiary transition-colors"
                      onClick={() => setShowUnscheduled(v => !v)}
                    >
                      <AlertCircle size={13} className="text-amber-400 shrink-0" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 flex-1">
                        {unscheduled.length} unscheduled — drag to month grid to schedule
                      </p>
                      <ChevronDown size={12} className={cn('text-text-muted transition-transform shrink-0', showUnscheduled && '-rotate-180')} />
                    </button>
                    {showUnscheduled && (
                      <div className="p-2 grid grid-cols-2 gap-2 border-t border-amber-400/15">
                        {unscheduled.map(wo => {
                          const techId = (wo as any).assignedTechnicianId || (wo as any).techId;
                          const techColor = techColorMap[techId];
                          const techName = adminTechs.find(t => t.id === techId)?.name || (wo as any).technicianName || '';
                          return (
                            <DraggableJobCard
                              key={wo.id}
                              wo={wo}
                              techColor={techColor}
                              techName={techName}
                              isSelected={selectedJobId === wo.id}
                              onSelect={() => setSelectedJobId(prev => prev === wo.id ? null : wo.id)}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Month view: full month grid */}
            {viewMode === 'month' && (
              <div className="p-4">
                <div className="grid grid-cols-7 mb-1">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                    <div key={d} className="text-center text-[9px] font-black uppercase tracking-widest text-text-muted py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-px bg-border-sub rounded-lg overflow-hidden border border-border-sub">
                  {monthDays.map((day, idx) => {
                    const dayOrders = ordersForDayAll(day);
                    const dayPto = ptoForDay(day);
                    const isCurrentMonth = isSameMonth(day, monthDate);
                    const isCurrentDay = isToday(day);
                    const isSelectedDay = isSameDay(day, selectedDate);
                    return (
                      <DroppableDay
                        key={idx}
                        day={day}
                        onClick={() => { setSelectedDate(day); setSelectedJobId(null); setDrawerOpen(false); setDrawerJob(null); }}
                        className={cn(
                          'min-h-[90px] p-1.5 bg-bg-secondary flex flex-col gap-0.5 cursor-pointer transition-colors hover:bg-bg-tertiary',
                          !isCurrentMonth && 'opacity-30',
                          isCurrentDay && 'bg-brand-red/5',
                          isSelectedDay && !isCurrentDay && 'bg-bg-tertiary',
                        )}
                      >
                        <p className={cn('text-[10px] font-black leading-none mb-1 pointer-events-none', isCurrentDay ? 'text-brand-red' : isSelectedDay ? 'text-text-primary' : 'text-text-muted')}>
                          {format(day, 'd')}
                        </p>
                        {dayPto.map(pto => {
                          const tech = technicians.find(t => t.id === pto.techId);
                          return (
                            <div key={pto.id} className="rounded px-1 py-0.5 bg-blue-400/10 border border-blue-400/20">
                              <p className="text-[8px] font-bold uppercase text-blue-400 truncate">{tech?.name?.split(' ')[0] || 'PTO'}</p>
                            </div>
                          );
                        })}
                        {dayOrders.slice(0, 3).map(wo => {
                          const techId = (wo as any).assignedTechnicianId || (wo as any).techId;
                          const color = techColorMap[techId] || '#94a3b8';
                          const isSelected = selectedJobId === wo.id;
                          return (
                            <div
                              key={wo.id}
                              onClick={e => { e.stopPropagation(); handleSelectJob(wo); }}
                              className={cn('rounded px-1 py-0.5 flex items-center gap-1 cursor-pointer', isSelected && 'ring-1 ring-inset ring-white/20')}
                              style={{ borderLeft: `2px solid ${color}`, background: `${color}${isSelected ? '30' : '15'}` }}
                            >
                              <p className="text-[8px] font-bold truncate pointer-events-none" style={{ color }}>
                                {wo.title || wo.description || wo.id.slice(0, 6)}
                              </p>
                            </div>
                          );
                        })}
                        {dayOrders.length > 3 && (
                          <p className="text-[8px] text-text-muted font-bold pointer-events-none">+{dayOrders.length - 3} more</p>
                        )}
                      </DroppableDay>
                    );
                  })}
                </div>
                {adminTechs.length > 0 && (
                  <div className="flex flex-wrap gap-3 mt-3 px-1">
                    {adminTechs.slice(0, 10).map(t => (
                      <div key={t.id} className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full" style={{ background: techColorMap[t.id] }} />
                        <span className="text-[9px] font-bold text-text-muted uppercase">{t.name?.split(' ')[0]}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* MAP PANEL */}
          <div className={cn(
            'w-[320px] shrink-0 border-l border-border-sub flex flex-col overflow-hidden bg-bg-secondary',
            mobileTab !== 'map' && 'hidden md:flex',
          )}>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border-sub shrink-0">
              <span className="text-[11px] text-text-muted flex-1">
                {jobsForSelectedDate.length} job{jobsForSelectedDate.length !== 1 ? 's' : ''} · {format(selectedDate, 'EEE MMM d')}
              </span>
            </div>
            <div className="flex-1 relative overflow-hidden">
              {jobsForSelectedDate.length > 0 ? (
                <AdminMapView
                  jobs={jobsForSelectedDate}
                  selectedJob={drawerJob}
                  onSelectJob={wo => handleSelectJob(wo)}
                />
              ) : (
                <div className="flex items-center justify-center h-full bg-[#1a1f2e]">
                  <p className="text-[9px] font-bold uppercase text-[#6b7db3] tracking-widest text-center px-4">
                    No jobs on {format(selectedDate, 'EEE, MMM d')}
                  </p>
                </div>
              )}

              {/* Slide-in drawer over map */}
              <div className={cn(
                'absolute inset-y-0 right-0 w-full bg-bg-elevated border-l border-border-sub flex flex-col z-10',
                'transition-transform duration-200 ease-out',
                drawerOpen && drawerJob ? 'translate-x-0' : 'translate-x-full',
              )}>
                {drawerJob && (
                  <>
                    <div className="flex items-start justify-between p-3.5 border-b border-border-sub shrink-0">
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className={cn('text-[10px] px-2 py-0.5 rounded-md font-medium', getJobStatusBadge(drawerJob).cls)}>
                            {getJobStatusBadge(drawerJob).label}
                          </span>
                          {drawerJob.projectType && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-bg-primary text-text-muted border border-border-sub">
                              {drawerJob.projectType}
                            </span>
                          )}
                        </div>
                        <p className="text-[14px] font-medium text-text-primary leading-tight">
                          {drawerJob.title || drawerJob.description || `#${drawerJob.id.slice(0, 6)}`}
                        </p>
                      </div>
                      <button
                        onClick={() => { setDrawerOpen(false); setSelectedJobId(null); setDrawerJob(null); }}
                        className="text-text-muted hover:text-text-primary p-0.5 shrink-0 mt-0.5"
                        aria-label="Close"
                      ><X size={16} /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
                      {drawerJob.clientName && (
                        <div className="flex items-start gap-2.5">
                          <Building2 size={14} className="text-text-muted mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] text-text-muted font-medium uppercase tracking-[0.07em] mb-0.5">Client</p>
                            <p className="text-[12px] text-text-primary">{drawerJob.clientName}</p>
                          </div>
                        </div>
                      )}
                      {drawerJob.location && (
                        <div className="flex items-start gap-2.5">
                          <MapPin size={14} className="text-text-muted mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] text-text-muted font-medium uppercase tracking-[0.07em] mb-0.5">Location</p>
                            <p className="text-[12px] text-text-primary">{drawerJob.location}</p>
                          </div>
                        </div>
                      )}
                      {drawerJob.scheduleTime && (
                        <div className="flex items-start gap-2.5">
                          <Clock size={14} className="text-text-muted mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] text-text-muted font-medium uppercase tracking-[0.07em] mb-0.5">Start Time</p>
                            <p className="text-[12px] text-text-primary">{drawerJob.scheduleTime}</p>
                          </div>
                        </div>
                      )}
                      {drawerJob.pay != null && (
                        <div className="flex items-start gap-2.5">
                          <DollarSign size={14} className="text-text-muted mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] text-text-muted font-medium uppercase tracking-[0.07em] mb-0.5">Pay</p>
                            <p className="text-[12px] text-text-green">${Number(drawerJob.pay).toFixed(2)}</p>
                          </div>
                        </div>
                      )}
                      {(drawerJob as any).priority && (
                        <div className="flex items-start gap-2.5">
                          <Flag size={14} className="text-text-muted mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] text-text-muted font-medium uppercase tracking-[0.07em] mb-0.5">Priority</p>
                            <div className="flex items-center gap-1.5">
                              <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{
                                background: (drawerJob as any).priority === 'high' ? '#E24B4A' : (drawerJob as any).priority === 'medium' ? '#EF9F27' : '#639922',
                              }} />
                              <p className="text-[12px] text-text-primary capitalize">{(drawerJob as any).priority}</p>
                            </div>
                          </div>
                        </div>
                      )}
                      {drawerJob.description && (
                        <div className="border-t border-border-sub pt-3">
                          <p className="text-[10px] text-text-muted font-medium uppercase tracking-[0.07em] mb-1.5">Scope</p>
                          <p className="text-[12px] text-text-secondary leading-relaxed">{drawerJob.description}</p>
                        </div>
                      )}
                      <div className="border-t border-border-sub pt-3">
                        <p className="text-[10px] text-text-muted font-medium uppercase tracking-[0.07em] mb-1.5">Assigned Tech</p>
                        {(() => {
                          const techId = (drawerJob as any).assignedTechnicianId || (drawerJob as any).techId;
                          const tech = adminTechs.find(t => t.id === techId);
                          return tech ? (
                            <p className="text-[12px] text-text-primary">{tech.name}</p>
                          ) : (
                            <p className="text-[12px] text-text-muted italic">No technician assigned yet</p>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="p-3 border-t border-border-sub flex gap-2 shrink-0">
                      <Link
                        href={`/admin/assignments/${drawerJob.id}`}
                        className="flex-1 py-1.5 text-center text-[12px] font-medium rounded-md bg-brand-red text-white hover:bg-brand-red/90 transition-colors"
                      >
                        Open Job
                      </Link>
                      <button
                        onClick={() => { setDrawerOpen(false); setSelectedJobId(null); setDrawerJob(null); }}
                        className="px-3 py-1.5 text-[12px] rounded-md border border-border-main text-text-secondary hover:text-text-primary transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </DndContext>
  );
}
