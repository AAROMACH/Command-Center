'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import type { WorkOrder, Technician, TimeOffRequest } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Calendar, ChevronLeft, ChevronRight, Users, Filter,
  Clock, MapPin, User, AlertCircle, Umbrella, LayoutGrid, List, CalendarCheck, Download,
} from 'lucide-react';
import {
  format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, addMonths, subMonths,
  startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  isSameDay, isToday, parseISO, isSameMonth,
} from 'date-fns';
import { cn } from '@/lib/utils';
import Link from 'next/link';

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

  const weekOrders = useMemo(() => {
    return workOrders.filter(wo => {
      if (!wo.scheduleDate) return false;
      try {
        const d = parseISO(wo.scheduleDate);
        return d >= weekStart && d <= weekEnd;
      } catch { return false; }
    });
  }, [workOrders, weekStart, weekEnd]);

  const filteredOrders = useMemo(() => {
    return weekOrders.filter(wo => {
      if (filterTech !== 'all' && (wo as any).assignedTechnicianId !== filterTech) return false;
      if (filterStatus !== 'all' && wo.status !== filterStatus) return false;
      return true;
    });
  }, [weekOrders, filterTech, filterStatus]);

  const unscheduled = useMemo(() =>
    workOrders.filter(wo => !wo.scheduleDate && wo.status !== 'completed'),
    [workOrders]
  );

  const adminTechs = useMemo(() =>
    technicians.filter(t => !t.roles?.includes('client')),
    [technicians]
  );

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

  const ordersForDayAll = (day: Date) =>
    workOrders.filter(wo => {
      if (!wo.scheduleDate) return false;
      if (filterTech !== 'all' && (wo as any).assignedTechnicianId !== filterTech) return false;
      try { return isSameDay(parseISO(wo.scheduleDate), day); } catch { return false; }
    });

  const ordersForDay = (day: Date) => {
    if (filterEvent === 'pto') return [];
    return filteredOrders
      .filter(wo => {
        try { return isSameDay(parseISO(wo.scheduleDate), day); } catch { return false; }
      })
      .sort((a, b) => (a.scheduleTime || '').localeCompare(b.scheduleTime || ''));
  };

  const ptoForDay = (day: Date) => {
    if (filterEvent === 'jobs') return [];
    return timeOffRequests.filter(req => {
      if (req.status !== 'approved') return false;
      try {
        const start = parseISO(req.startDate);
        const end = parseISO(req.endDate);
        return day >= start && day <= end;
      } catch { return false; }
    });
  };

  const uniqueStatuses = useMemo(() =>
    [...new Set(workOrders.map(wo => wo.status).filter(Boolean))],
    [workOrders]
  );

  const handleExportIcs = () => {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const toIcsDate = (dateStr: string) => {
      try {
        const d = parseISO(dateStr);
        return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}`;
      } catch { return ''; }
    };

    const exportOrders = workOrders.filter(wo => wo.scheduleDate);
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Aaromach Command Center//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    exportOrders.forEach(wo => {
      const dateStr = toIcsDate(wo.scheduleDate);
      if (!dateStr) return;
      const techId = (wo as any).assignedTechnicianId || (wo as any).techId;
      const tech = technicians.find(t => t.id === techId);
      const summary = (wo.title || wo.description || wo.id).replace(/,/g, '\\,');
      const description = [tech?.name ? `Tech: ${tech.name}` : '', wo.clientName ? `Client: ${wo.clientName}` : ''].filter(Boolean).join('\\n');
      lines.push(
        'BEGIN:VEVENT',
        `UID:${wo.id}@aaromach.com`,
        `DTSTART;VALUE=DATE:${dateStr}`,
        `DTEND;VALUE=DATE:${dateStr}`,
        `SUMMARY:${summary}`,
        wo.location ? `LOCATION:${wo.location.replace(/,/g, '\\,')}` : '',
        description ? `DESCRIPTION:${description}` : '',
        'END:VEVENT',
      ).filter(l => l !== '');
    });

    lines.push('END:VCALENDAR');
    const icsContent = lines.join('\r\n');
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
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
    <div className="space-y-5">
      <header className="page-header">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2">
            <Calendar size={12} />
            Schedule View
          </p>
          <h1 className="page-title">Operations Calendar</h1>
          <p className="page-subtitle">Weekly view of all work orders by date and technician.</p>
        </div>

        <div className="page-header-right items-center gap-2 flex-wrap">
          {/* Calendar Sync */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[10px] font-bold uppercase tracking-wider border-border-main shrink-0"
            onClick={handleExportIcs}
          >
            <CalendarCheck size={12} className="mr-1.5" />
            Export .ics
          </Button>

          {/* View toggle */}
          <div className="flex items-center rounded-md border border-border-main overflow-hidden h-8 bg-bg-secondary shrink-0">
            <button
              onClick={() => setViewMode('week')}
              className={cn("px-3 h-full flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors", viewMode === 'week' ? "bg-bg-tertiary text-text-primary" : "text-text-muted hover:text-text-primary")}
            ><List size={12} /> Week</button>
            <div className="w-px h-full bg-border-main" />
            <button
              onClick={() => setViewMode('month')}
              className={cn("px-3 h-full flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors", viewMode === 'month' ? "bg-bg-tertiary text-text-primary" : "text-text-muted hover:text-text-primary")}
            ><LayoutGrid size={12} /> Month</button>
          </div>

          {/* Event filter */}
          <div className="flex items-center rounded-md border border-border-main overflow-hidden h-8 bg-bg-secondary shrink-0">
            {(['all','jobs','pto'] as const).map((v, i) => (
              <>
                {i > 0 && <div key={`d${v}`} className="w-px h-full bg-border-main" />}
                <button
                  key={v}
                  onClick={() => setFilterEvent(v)}
                  className={cn("px-3 h-full text-[10px] font-bold uppercase tracking-widest transition-colors", filterEvent === v ? "bg-bg-tertiary text-text-primary" : "text-text-muted hover:text-text-primary")}
                >{v === 'all' ? 'All' : v === 'jobs' ? 'Jobs' : 'PTO'}</button>
              </>
            ))}
          </div>

          {/* Filters */}
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

          {/* Navigation */}
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

      {/* Period label */}
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
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
              <div key={d} className="text-center text-[9px] font-black uppercase tracking-widest text-text-muted py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-border-sub rounded-lg overflow-hidden border border-border-sub">
            {monthDays.map((day, idx) => {
              const dayOrders = filterEvent !== 'pto' ? ordersForDayAll(day) : [];
              const dayPto = filterEvent !== 'jobs' ? ptoForDay(day) : [];
              const isCurrentMonth = isSameMonth(day, monthDate);
              const isCurrentDay = isToday(day);
              return (
                <div
                  key={idx}
                  className={cn(
                    'min-h-[90px] p-1.5 bg-bg-secondary flex flex-col gap-0.5',
                    !isCurrentMonth && 'opacity-30',
                    isCurrentDay && 'bg-brand-red/5'
                  )}
                >
                  <p className={cn('text-[10px] font-black leading-none mb-1', isCurrentDay ? 'text-brand-red' : 'text-text-muted')}>
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
                    return (
                      <div key={wo.id} className="rounded px-1 py-0.5 flex items-center gap-1" style={{ borderLeft: `2px solid ${color}`, background: `${color}15` }}>
                        <p className="text-[8px] font-bold truncate" style={{ color }}>{wo.title || wo.description || wo.id.slice(0,6)}</p>
                      </div>
                    );
                  })}
                  {dayOrders.length > 3 && (
                    <p className="text-[8px] text-text-muted font-bold">+{dayOrders.length - 3} more</p>
                  )}
                </div>
              );
            })}
          </div>
          {/* Tech color legend */}
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
      {viewMode === 'week' && <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {weekDays.map((day) => {
          const dayOrders = ordersForDay(day);
          const isCurrentDay = isToday(day);

          return (
            <div key={day.toISOString()} className="space-y-2">
              {/* PTO blocks */}
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

              {/* Day header */}
              <div className={cn(
                'rounded-lg px-2.5 py-2 border text-center',
                isCurrentDay
                  ? 'bg-brand-red/10 border-brand-red/30'
                  : 'bg-bg-secondary border-border-sub'
              )}>
                <p className={cn(
                  'text-[9px] font-black uppercase tracking-widest',
                  isCurrentDay ? 'text-brand-red' : 'text-text-muted'
                )}>
                  {format(day, 'EEE')}
                </p>
                <p className={cn(
                  'text-lg font-black tabular-nums leading-none mt-0.5',
                  isCurrentDay ? 'text-brand-red' : 'text-text-primary'
                )}>
                  {format(day, 'd')}
                </p>
                <p className={cn(
                  'text-[8px] font-bold uppercase tracking-wider mt-0.5',
                  dayOrders.length > 0 ? 'text-text-muted' : 'text-text-muted/40'
                )}>
                  {dayOrders.length} job{dayOrders.length !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Job cards for this day */}
              <div className="space-y-1.5">
                {loading ? (
                  <div className="h-16 rounded-md bg-bg-secondary border border-border-sub animate-pulse" />
                ) : dayOrders.length === 0 ? (
                  <div className="h-12 rounded-md border border-dashed border-border-sub flex items-center justify-center">
                    <span className="text-[8px] text-text-muted uppercase tracking-wider">Open</span>
                  </div>
                ) : (
                  dayOrders.map(wo => {
                    const techName = (wo as any).technicianName || '';
                    const techId = (wo as any).assignedTechnicianId || (wo as any).techId;
                    const techColor = techColorMap[techId];
                    return (
                      <Link key={wo.id} href="/admin/dispatch">
                        <div className={cn(
                          'rounded-md border border-border-sub bg-bg-secondary hover:bg-bg-tertiary hover:border-border-main transition-all cursor-pointer border-l-2 pl-2.5 pr-2 py-2',
                          getStatusBorder(wo.status)
                        )} style={techColor ? { borderLeftColor: techColor } : undefined}>
                          <p className="text-[10px] font-black uppercase tracking-tight text-text-primary leading-tight truncate">
                            {wo.title || wo.description || `#${wo.id.slice(0, 6)}`}
                          </p>
                          {wo.scheduleTime && (
                            <p className="text-[9px] text-text-muted flex items-center gap-1 mt-0.5">
                              <Clock size={8} className="shrink-0" />
                              {wo.scheduleTime}
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
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>}

      {/* Unscheduled jobs warning */}
      {unscheduled.length > 0 && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                {unscheduled.length} Unscheduled Work Order{unscheduled.length !== 1 ? 's' : ''}
              </p>
              <p className="text-[10px] text-text-muted mt-1">
                These jobs have no scheduled date and are not shown on the calendar.{' '}
                <Link href="/admin/dispatch" className="text-amber-400 hover:underline font-bold">
                  View in Dispatch →
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
