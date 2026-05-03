
'use client';

import { useState, useMemo } from 'react';
import type { WorkOrder, Technician } from '@/lib/types';
import { 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval,
  addDays,
  subDays,
  format, 
  isSameDay, 
  isSameMonth, 
  isToday, 
  parseISO 
} from 'date-fns';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  LayoutGrid, 
  List, 
  MapPin, 
  Clock, 
  User,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

type ViewMode = 'week' | 'month';

type GlobalScheduleCalendarProps = {
    workOrders: WorkOrder[];
    technicians: Technician[];
};

export function GlobalScheduleCalendar({ workOrders, technicians }: GlobalScheduleCalendarProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('week');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());

    const assignmentsForSelectedDay = useMemo(() => {
        return workOrders.filter(wo => {
            try {
                return isSameDay(parseISO(wo.scheduleDate), selectedDate);
            } catch (e) {
                return false;
            }
        });
    }, [workOrders, selectedDate]);
    
    const eventsByDate = useMemo(() => {
      return workOrders.reduce((acc, wo) => {
        try {
            const dateStr = format(parseISO(wo.scheduleDate), 'yyyy-MM-dd');
            if (!acc[dateStr]) {
              acc[dateStr] = [];
            }
            acc[dateStr].push(wo);
        } catch (e) {
        }
        return acc;
      }, {} as Record<string, WorkOrder[]>);
    }, [workOrders]);

    const handlePrev = () => {
        if (viewMode === 'week') {
            setCurrentDate(subDays(currentDate, 7));
        } else {
            setCurrentDate(subMonths(currentDate, 1));
        }
    };

    const handleNext = () => {
        if (viewMode === 'week') {
            setCurrentDate(addDays(currentDate, 7));
        } else {
            setCurrentDate(addMonths(currentDate, 1));
        }
    };

    const weekDays = eachDayOfInterval({
        start: startOfWeek(currentDate, { weekStartsOn: 0 }),
        end: endOfWeek(currentDate, { weekStartsOn: 0 }),
    });

    const monthDays = eachDayOfInterval({
        start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 }),
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row gap-6">
                {/* CALENDAR NAVIGATION & GRID */}
                <div className="flex-1 rounded-lg border border-border-main bg-bg-secondary p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-border-main">
                        <div className="flex items-center gap-4">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                                <CalendarIcon size={14} className="text-brand-red"/>
                                Global Mission Schedule
                            </h3>
                            <div className="cal-nav">
                                <button className="nav-btn" onClick={handlePrev}><ChevronLeft size={16}/></button>
                                <span className="cal-period !min-w-[160px] !text-xs uppercase tracking-widest text-center font-bold text-text-primary">
                                    {viewMode === 'week' 
                                        ? `${format(startOfWeek(currentDate, { weekStartsOn: 0 }), 'MMM d')} – ${format(endOfWeek(currentDate, { weekStartsOn: 0 }), 'MMM d')}`
                                        : format(currentDate, 'MMMM yyyy')
                                    }
                                </span>
                                <button className="nav-btn" onClick={handleNext}><ChevronRight size={16}/></button>
                            </div>
                        </div>
                        <div className="view-toggle">
                            <button className={cn("view-btn", { active: viewMode === 'week' })} onClick={() => setViewMode('week')}>
                                <List size={11}/> Week
                            </button>
                            <button className={cn("view-btn", { active: viewMode === 'month' })} onClick={() => setViewMode('month')}>
                                <LayoutGrid size={11}/> Month
                            </button>
                        </div>
                    </div>

                    {viewMode === 'week' ? (
                        <div className="week-grid !mb-0">
                            {weekDays.map(day => {
                                const dateStr = format(day, 'yyyy-MM-dd');
                                const hasEvents = eventsByDate[dateStr] && eventsByDate[dateStr].length > 0;
                                return (
                                    <div 
                                      key={day.toString()} 
                                      className={cn("day-pill h-24 justify-start pt-3", {
                                        'selected': isSameDay(day, selectedDate),
                                        'today': isToday(day)
                                      })}
                                      onClick={() => setSelectedDate(day)}
                                    >
                                        <span className="day-name">{format(day, 'EEE')}</span>
                                        <span className="day-num">{format(day, 'd')}</span>
                                        {hasEvents && (
                                            <div className="mt-auto pb-2 flex flex-wrap justify-center gap-0.5 px-1">
                                                {eventsByDate[dateStr].slice(0, 3).map((_, i) => (
                                                    <div key={i} className="h-1 w-1 rounded-full bg-brand-red" />
                                                ))}
                                                {eventsByDate[dateStr].length > 3 && <span className="text-[7px] font-bold text-text-muted">+{eventsByDate[dateStr].length - 3}</span>}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="month-grid-wrap !mb-0">
                            <div className="month-header">
                                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(dayName => (
                                    <div key={dayName} className="month-header-cell">{dayName}</div>
                                ))}
                            </div>
                            <div className="month-days">
                                {monthDays.map(day => {
                                    const dateStr = format(day, 'yyyy-MM-dd');
                                    const hasEvents = eventsByDate[dateStr] && eventsByDate[dateStr].length > 0;
                                    return (
                                        <div 
                                          key={day.toString()}
                                          className={cn("month-day h-20", {
                                            'selected': isSameDay(day, selectedDate),
                                            'today': isToday(day),
                                            'other-month': !isSameMonth(day, currentDate)
                                          })}
                                          onClick={() => setSelectedDate(day)}
                                        >
                                            <span className="mb-auto">{format(day, 'd')}</span>
                                            {hasEvents && (
                                                <div className="mt-auto flex flex-wrap gap-0.5 justify-center pb-2">
                                                     {eventsByDate[dateStr].slice(0, 4).map((_, i) => (
                                                        <div key={i} className="h-1 w-1 rounded-full bg-brand-red" />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* DAILY MANIFEST SIDEBAR */}
                <div className="w-full lg:w-[400px] flex flex-col gap-4">
                    <div className="p-4 rounded-lg bg-bg-secondary border border-border-main flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Active Manifest</p>
                            <p className="text-sm font-bold text-text-primary uppercase">{format(selectedDate, 'EEEE, MMM d')}</p>
                        </div>
                        <Badge variant="outline" className="bg-bg-tertiary border-border-sub text-[10px] uppercase font-bold">
                            {assignmentsForSelectedDay.length} Jobs
                        </Badge>
                    </div>

                    <div className="flex-1 space-y-2">
                        {assignmentsForSelectedDay.length > 0 ? (
                            assignmentsForSelectedDay.map(wo => {
                                const tech = technicians.find(t => t.id === wo.assignedTechnicianId);
                                return (
                                    <div key={wo.id} className={cn("job-card !mb-0 transition-all hover:translate-x-1", { 'active': wo.status === 'in-progress'})}>
                                        <div className="job-card-inner">
                                            <div className={cn("job-accent", { 'active-accent': wo.status === 'in-progress' })}></div>
                                            <div className="job-body !p-4">
                                                <div className="job-left">
                                                    <div className="job-title-row !mb-1">
                                                        <span className="job-title !text-xs">{wo.description}</span>
                                                        <span className="job-wo !text-[9px]">{wo.id.toUpperCase()}</span>
                                                    </div>
                                                    <div className="job-meta !gap-4 !mt-2">
                                                        <div className="job-meta-item !text-[10px]"><Clock size={12}/> {wo.scheduleTime}</div>
                                                        <div className="job-meta-item !text-[10px]"><MapPin size={12}/> {wo.location}</div>
                                                    </div>
                                                    <div className="mt-3 pt-3 border-t border-border-sub flex items-center gap-2">
                                                        {tech ? (
                                                            <div className="flex items-center gap-2">
                                                                <Avatar className="h-5 w-5 border border-border-sub">
                                                                    <AvatarImage src={tech.avatarUrl} />
                                                                    <AvatarFallback>{tech.name.charAt(0)}</AvatarFallback>
                                                                </Avatar>
                                                                <span className="text-[10px] font-bold text-text-primary uppercase tracking-wide">{tech.name}</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-1.5 text-[10px] text-text-muted italic">
                                                                <User size={10}/> Unassigned
                                                            </div>
                                                        )}
                                                        {wo.status === 'in-progress' && (
                                                            <div className="ml-auto flex items-center gap-1.5 text-[9px] font-bold text-text-green uppercase tracking-widest">
                                                                <Activity size={10} className="animate-pulse" /> LIVE
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        ) : (
                            <div className="p-12 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30">
                                <p className="text-[10px] text-text-muted uppercase font-bold tracking-[0.2em] italic">No missions deployed for this coordinate</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
