'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import type { WorkOrder, Technician, TimeOffRequest } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Calendar, ChevronLeft, ChevronRight, Users, Filter,
  Clock, MapPin, User, AlertCircle, Umbrella, LayoutGrid, List, CalendarCheck,
  GripVertical, ChevronDown,
} from 'lucide-react';
import {
  format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, subDays, addMonths, subMonths,
  startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  isSameDay, isToday, parseISO, isSameMonth,
} from 'date-fns';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import { DndContext, type DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

const AdminMapView = dynamic(() => import('@/app/admin/map/components/admin-map-view'), { ssr: false });

const STATUS_COLORS: Record<string, string> = {
  'in-progress': 'border-l-text-green',
  'on-my-way': 'border-l-blue-400',
  'confirmed': 'border-l-blue-400',
  'assigned': 'border-l-amber-400',
  'scheduled': 'border-l-brand-red',
  'completed': 'border-l-border-main',
  'default': 'border-l-border-sub',
};

const TECH_PALETTE = [
  '#e53e3e', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

function getStatusBorder(status: string) {
  return STATUS_COLORS[status] || STATUS_COLORS.default;
}

function getStatusVariant(status: string): any {
  switch (status) {
    case 'in-progress': return 'inprogress';
    case 'completed': return 'completed';
    case 'confirmed': case 'on-my-way': return 'active';
    default: return 'scheduled';
  }
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
        isSelected
          ? 'border-brand-red/50 bg-brand-red/5'
          : 'border-border-sub hover:border-border-main hover:bg-bg-tertiary',
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
          <p className="text-[9px] text-text-muted flex items-center gap-1 mt-0.5 truncate">
            <User size={8} className="shrink-0" />
            <span className="truncate">{techName}</span>
          </p>
        )}
        <Badge variant={getStatusVariant(wo.status)} className="text-[7px] h-3.5 uppercase mt-1">
          {wo.status}
        </Badge>
      </div>
    </div>
  );
}

export default function AdminCalendarPage() {
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTech, setFilterTech] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterEvent, setFilterEvent] = useState<'all' | 'jobs' | 'pto'>('all');
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const [mobileTab, setMobileTab] = useState<'calendar' | 'jobs' | 'map'>('calendar');

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
        try { return isSameDay(parseISO(wo.scheduleDate), selectedDate); } catch { return false; }
      })
      .sort((a, b) => (a.scheduleTime || '').localeCompare(b.scheduleTime || '')),
    [workOrders, selectedDate]);

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

  const selectedJob = useMemo(() =>
    selectedJobId ? workOrders.find(w => w.id === selectedJobId) ?? null : null,
    [selectedJobId, workOrders]);

  const ordersForDayAll = (day: Date) =>
    workOrders.filter(wo => {
      if (!wo.scheduleDate) return false;
      if (filterTech !== 'all' && (wo as any).assignedTechnicianId !== filterTech) return false;
      try { return isSameDay(parseISO(wo.scheduleDate), day); } catch { return false; }
    });

  const ordersForDay = (day: Date) => {
    if (filterEvent === 'pto') return [];
    return filteredOrders
      .filter(wo => { try { return isSameDay(parseISO(wo.scheduleDate), day); } catch { return false; } })
      .sort((a, b) => (a.scheduleTime || '').localeCompare(b.scheduleTime || ''));
  };

  const ptoForDay = (day: Date) => {
    if (filterEvent === 'jobs') return [];
    return timeOffRequests.filter(req => {
      if (req.status !== 'approved') return false;
      try {
        const s = parseISO(req.startDate);
        const e = parseISO(req.endDate);
        return day >= s && day <= e;
      } catch { return false; }
    });
  };

  const uniqueStatuses = useMemo(() =>
    [...new Set(workOrders.map(wo => wo.status).filter(Boolean))],
    [workOrders]);

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
    } catch { /* silent */ }
  };

  const handleSelectJob = (wo: WorkOrder) => {
    setSelectedJobId(prev => prev === wo.id ? null : wo.id);
    if (wo.scheduleDate) {
      try { setSelectedDate(parseISO(wo.scheduleDate)); } catch { /* */ }
    }
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

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="space-y-5">
        <header className="page-header">
          <div className="text-left">
            <p className="page-eyebrow flex items-center gap-2">
              <Calendar size={12} />
              Dispatch Workspace
            </p>
            <h1 className="page-title">Schedule</h1>
            <p className="page-subtitle">Calendar, jobs, and map — all synced.</p>
          </div>

          <div className="page-header-right items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-[10px] font-bold uppercase tracking-wider border-border-main shrink-0"
              onClick={handleExportIcs}
            >
              <CalendarCheck size={12} className="mr-1.5" />
              Export .ics
            </Button>

            <div className="flex items-center rounded-md border border-border-main overflow-hidden h-8 bg-bg-secondary shrink-0">
              <button
                onClick={() => setViewMode('week')}
                className={cn('px-3 h-full flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors', viewMode === 'week' ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-primary')}
              ><List size={12} /> Week</button>
              <div className="w-px h-full bg-border-main" />
              <button
                onClick={() => setViewMode('month')}
                className={cn('px-3 h-full flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors', viewMode === 'month' ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-primary')}
              ><LayoutGrid size={12} /> Month</button>
            </div>

            <div className="flex items-center rounded-md border border-border-main overflow-hidden h-8 bg-bg-secondary shrink-0">
              {(['all', 'jobs', 'pto'] as const).map((v, i) => (
                <>
                  {i > 0 && <div key={`d${v}`} className="w-px h-full bg-border-main" />}
                  <button
                    key={v}
                    onClick={() => setFilterEvent(v)}
                    className={cn('px-3 h-full text-[10px] font-bold uppercase tracking-widest transition-colors', filterEvent === v ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-primary')}
                  >{v === 'all' ? 'All' : v === 'jobs' ? 'Jobs' : 'PTO'}</button>
                </>
              ))}
            </div>

            <Select value={filterTech} onValueChange={setFilterTech}>
              <SelectTrigger className="h-8 text-[10px] font-bold uppercase w-[160px] bg-bg-secondary border-border-main">
                <Users size={10} className="mr-1.5 shrink-0" />
                <SelectValue placeholder="All Techs" />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                <SelectItem value="all">All Technicians</SelectItem>
                {adminTechs.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name || t.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {viewMode === 'week' && (
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 text-[10px] font-bold uppercase w-[140px] bg-bg-secondary border-border-main">
                  <Filter size={10} className="mr-1.5 shrink-0" />
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent className="bg-bg-elevated border-border-main">
                  <SelectItem value="all">All Statuses</SelectItem>
                  {uniqueStatuses.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {viewMode === 'week' ? (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setWeekStart(w => subWeeks(w, 1))}>
                  <ChevronLeft size={14} />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 text-[10px] font-bold uppercase tracking-wider px-3" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
                  This Week
                </Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setWeekStart(w => addWeeks(w, 1))}>
                  <ChevronRight size={14} />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setMonthDate(d => subMonths(d, 1))}>
                  <ChevronLeft size={14} />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 text-[10px] font-bold uppercase tracking-wider px-3" onClick={() => setMonthDate(new Date())}>
                  This Month
                </Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setMonthDate(d => addMonths(d, 1))}>
                  <ChevronRight size={14} />
                </Button>
              </div>
            )}
          </div>
        </header>

        {/* Mobile tab bar */}
        <div className="md:hidden flex border-b border-border-sub">
          {(['calendar', 'jobs', 'map'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={cn(
                'flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors capitalize',
                mobileTab === tab
                  ? 'border-b-2 border-brand-red text-brand-red'
                  : 'text-text-muted hover:text-text-primary',
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex gap-4 items-start">

          {/* Left: Job List Panel */}
          <div className={cn(
            'w-full md:w-56 shrink-0 border border-border-sub rounded-lg bg-bg-secondary flex flex-col overflow-hidden',
            mobileTab !== 'jobs' && 'hidden md:flex',
          )}>
            <div className="flex items-center justify-between p-2.5 border-b border-border-sub bg-bg-tertiary shrink-0">
              <button
                onClick={() => { setSelectedDate(d => subDays(d, 1)); setSelectedJobId(null); }}
                className="h-6 w-6 flex items-center justify-center text-text-muted hover:text-text-primary rounded transition-colors"
              >
                <ChevronLeft size={13} />
              </button>
              <p className="text-[10px] font-black uppercase tracking-widest text-text-primary">
                {isToday(selectedDate) ? 'Today' : format(selectedDate, 'MMM d')}
              </p>
              <button
                onClick={() => { setSelectedDate(d => addDays(d, 1)); setSelectedJobId(null); }}
                className="h-6 w-6 flex items-center justify-center text-text-muted hover:text-text-primary rounded transition-colors"
              >
                <ChevronRight size={13} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 max-h-[calc(100vh-280px)]">
              {jobsForSelectedDate.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-[9px] font-bold uppercase text-text-muted tracking-widest">No jobs scheduled</p>
                </div>
              ) : (
                <div className="p-1.5 space-y-1">
                  {jobsForSelectedDate.map(wo => {
                    const woTechId = (wo as any).assignedTechnicianId || (wo as any).techId;
                    const techColor = techColorMap[woTechId] || '#555';
                    const techName = adminTechs.find(t => t.id === woTechId)?.name || (wo as any).technicianName || '';
                    return (
                      <div
                        key={wo.id}
                        onClick={() => handleSelectJob(wo)}
                        className={cn(
                          'p-2 rounded-md border border-l-2 transition-colors cursor-pointer',
                          selectedJobId === wo.id
                            ? 'bg-brand-red/5 border-brand-red/40'
                            : 'border-border-sub hover:bg-bg-tertiary',
                          getStatusBorder(wo.status),
                        )}
                        style={{ borderLeftColor: techColor }}
                      >
                        {wo.scheduleTime && (
                          <p className="text-[8px] font-mono text-text-muted">{wo.scheduleTime}</p>
                        )}
                        <p className="text-[9px] font-black uppercase text-text-primary leading-tight truncate">
                          {wo.title || wo.description || `#${wo.id.slice(0, 6)}`}
                        </p>
                        <p className="text-[8px] text-text-muted truncate">{wo.clientName}</p>
                        {techName && <p className="text-[8px] text-text-muted truncate">{techName}</p>}
                        <Link
                          href={`/admin/assignments/${wo.id}`}
                          className="text-[8px] text-brand-red hover:underline font-bold mt-0.5 inline-block"
                          onClick={e => e.stopPropagation()}
                        >
                          Open →
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Center: Calendar */}
          <div className={cn(
            'flex-1 min-w-0 space-y-5',
            mobileTab !== 'calendar' && 'hidden md:block',
          )}>

            <div className="flex items-center gap-2 px-0">
              <p className="text-sm font-black uppercase tracking-widest text-text-primary">
                {viewMode === 'week'
                  ? `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`
                  : format(monthDate, 'MMMM yyyy')}
              </p>
              {viewMode === 'week' && (
                <>
                  <span className="text-text-muted text-xs">·</span>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                    {filteredOrders.length} work order{filteredOrders.length !== 1 ? 's' : ''} this week
                  </p>
                </>
              )}
            </div>

            {/* Month grid */}
            {viewMode === 'month' && (
              <div>
                <div className="grid grid-cols-7 mb-1">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                    <div key={d} className="text-center text-[9px] font-black uppercase tracking-widest text-text-muted py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-px bg-border-sub rounded-lg overflow-hidden border border-border-sub">
                  {monthDays.map((day, idx) => {
                    const dayOrders = filterEvent !== 'pto' ? ordersForDayAll(day) : [];
                    const dayPto = filterEvent !== 'jobs' ? ptoForDay(day) : [];
                    const isCurrentMonth = isSameMonth(day, monthDate);
                    const isCurrentDay = isToday(day);
                    const isSelectedDay = isSameDay(day, selectedDate);
                    return (
                      <DroppableDay
                        key={idx}
                        day={day}
                        onClick={() => { setSelectedDate(day); setSelectedJobId(null); }}
                        className={cn(
                          'min-h-[90px] p-1.5 bg-bg-secondary flex flex-col gap-0.5 cursor-pointer transition-colors hover:bg-bg-tertiary',
                          !isCurrentMonth && 'opacity-30',
                          isCurrentDay && 'bg-brand-red/5',
                          isSelectedDay && !isCurrentDay && 'bg-bg-tertiary',
                        )}
                      >
                        <p className={cn(
                          'text-[10px] font-black leading-none mb-1 pointer-events-none',
                          isCurrentDay ? 'text-brand-red' : isSelectedDay ? 'text-text-primary' : 'text-text-muted',
                        )}>
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
                              className={cn(
                                'rounded px-1 py-0.5 flex items-center gap-1 cursor-pointer transition-opacity',
                                isSelected && 'ring-1 ring-inset ring-white/20',
                              )}
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

            {/* Week grid */}
            {viewMode === 'week' && (
              <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                {weekDays.map((day) => {
                  const dayOrders = ordersForDay(day);
                  const isCurrentDay = isToday(day);
                  const isSelectedDay = isSameDay(day, selectedDate);

                  return (
                    <DroppableDay key={day.toISOString()} day={day} className="space-y-2">
                      {ptoForDay(day).map(pto => {
                        const tech = technicians.find(t => t.id === pto.techId);
                        return (
                          <div key={pto.id} className="rounded-md border border-blue-400/30 bg-blue-400/5 px-2.5 py-1.5 flex items-center gap-1.5">
                            <Umbrella size={9} className="text-blue-400 shrink-0" />
                            <span className="text-[9px] font-bold uppercase tracking-wider text-blue-400 truncate">
                              {tech?.name || 'Tech'} — {pto.type}
                            </span>
                          </div>
                        );
                      })}

                      <button
                        onClick={() => { setSelectedDate(day); setSelectedJobId(null); }}
                        className={cn(
                          'w-full rounded-lg px-2.5 py-2 border text-center transition-colors',
                          isCurrentDay
                            ? 'bg-brand-red/10 border-brand-red/30'
                            : isSelectedDay
                            ? 'bg-bg-tertiary border-border-main ring-1 ring-brand-red/20'
                            : 'bg-bg-secondary border-border-sub hover:bg-bg-tertiary hover:border-border-main',
                        )}
                      >
                        <p className={cn(
                          'text-[9px] font-black uppercase tracking-widest',
                          isCurrentDay ? 'text-brand-red' : 'text-text-muted',
                        )}>
                          {format(day, 'EEE')}
                        </p>
                        <p className={cn(
                          'text-lg font-black tabular-nums leading-none mt-0.5',
                          isCurrentDay ? 'text-brand-red' : 'text-text-primary',
                        )}>
                          {format(day, 'd')}
                        </p>
                        <p className={cn(
                          'text-[8px] font-bold uppercase tracking-wider mt-0.5',
                          dayOrders.length > 0 ? 'text-text-muted' : 'text-text-muted/40',
                        )}>
                          {dayOrders.length} job{dayOrders.length !== 1 ? 's' : ''}
                        </p>
                      </button>

                      <div className="space-y-1.5">
                        {loading ? (
                          <div className="h-16 rounded-md bg-bg-secondary border border-border-sub animate-pulse" />
                        ) : dayOrders.length === 0 ? (
                          <div className="h-12 rounded-md border border-dashed border-border-sub flex items-center justify-center">
                            <span className="text-[8px] text-text-muted uppercase tracking-wider">Open</span>
                          </div>
                        ) : (
                          dayOrders.map(wo => {
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
                                onSelect={() => handleSelectJob(wo)}
                              />
                            );
                          })
                        )}
                      </div>
                    </DroppableDay>
                  );
                })}
              </div>
            )}

            {/* Unscheduled jobs */}
            {unscheduled.length > 0 && (
              <div className="rounded-lg border border-amber-400/30 bg-bg-secondary overflow-hidden">
                <button
                  className="w-full flex items-center gap-2.5 p-3 text-left hover:bg-bg-tertiary transition-colors"
                  onClick={() => setShowUnscheduled(v => !v)}
                >
                  <AlertCircle size={13} className="text-amber-400 shrink-0" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 flex-1">
                    {unscheduled.length} unscheduled — drag onto calendar to schedule
                  </p>
                  <ChevronDown size={12} className={cn('text-text-muted transition-transform shrink-0', showUnscheduled && '-rotate-180')} />
                </button>
                {showUnscheduled && (
                  <div className="p-2 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 border-t border-amber-400/15">
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

          {/* Right: Map Panel */}
          <div className={cn(
            'w-full md:w-72 shrink-0 border border-border-sub rounded-lg bg-bg-secondary flex flex-col overflow-hidden',
            mobileTab !== 'map' && 'hidden md:flex',
          )}>
            <div className="p-2.5 border-b border-border-sub bg-bg-tertiary shrink-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-text-primary flex items-center gap-1.5">
                <MapPin size={11} className="text-brand-red" />
                {format(selectedDate, 'MMM d')}
                <span className="text-text-muted font-normal">
                  — {jobsForSelectedDate.length} job{jobsForSelectedDate.length !== 1 ? 's' : ''}
                </span>
              </p>
            </div>
            <div className="relative" style={{ height: 'calc(100vh - 320px)', minHeight: 300 }}>
              {jobsForSelectedDate.length > 0 ? (
                <AdminMapView
                  jobs={jobsForSelectedDate}
                  selectedJob={selectedJob}
                  onSelectJob={wo => {
                    setSelectedJobId(prev => prev === wo.id ? null : wo.id);
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-[9px] font-bold uppercase text-text-muted tracking-widest text-center px-4">
                    No jobs on {format(selectedDate, 'EEE, MMM d')}
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </DndContext>
  );
}
