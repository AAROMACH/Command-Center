'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import type { WorkOrder, Technician } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Calendar, ChevronLeft, ChevronRight, Users, Filter,
  Clock, MapPin, User, AlertCircle,
} from 'lucide-react';
import {
  format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays,
  isSameDay, isToday, parseISO,
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
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTech, setFilterTech] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    const unsubWO = onSnapshot(collection(db, 'workOrders'), (snap) => {
      setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
      setLoading(false);
    }, () => setLoading(false));
    const unsubTechs = onSnapshot(collection(db, 'users'), (snap) => {
      setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
    });
    return () => { unsubWO(); unsubTechs(); };
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

  const ordersForDay = (day: Date) =>
    filteredOrders
      .filter(wo => {
        try { return isSameDay(parseISO(wo.scheduleDate), day); } catch { return false; }
      })
      .sort((a, b) => (a.scheduleTime || '').localeCompare(b.scheduleTime || ''));

  const adminTechs = useMemo(() =>
    technicians.filter(t => !t.roles?.includes('client')),
    [technicians]
  );

  const uniqueStatuses = useMemo(() =>
    [...new Set(workOrders.map(wo => wo.status).filter(Boolean))],
    [workOrders]
  );

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

          {/* Week nav */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setWeekStart(w => subWeeks(w, 1))}>
              <ChevronLeft size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-[10px] font-bold uppercase tracking-wider px-3"
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            >
              This Week
            </Button>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setWeekStart(w => addWeeks(w, 1))}>
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      </header>

      {/* Week label */}
      <div className="flex items-center gap-2 px-0">
        <p className="text-sm font-black uppercase tracking-widest text-text-primary">
          {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
        </p>
        <span className="text-text-muted text-xs">·</span>
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
          {filteredOrders.length} work order{filteredOrders.length !== 1 ? 's' : ''} this week
        </p>
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {weekDays.map((day) => {
          const dayOrders = ordersForDay(day);
          const isCurrentDay = isToday(day);

          return (
            <div key={day.toISOString()} className="space-y-2">
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
                    return (
                      <Link key={wo.id} href="/admin/dispatch">
                        <div className={cn(
                          'rounded-md border border-border-sub bg-bg-secondary hover:bg-bg-tertiary hover:border-border-main transition-all cursor-pointer border-l-2 pl-2.5 pr-2 py-2',
                          getStatusBorder(wo.status)
                        )}>
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
      </div>

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
