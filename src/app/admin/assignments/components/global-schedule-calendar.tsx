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
    selectedDate?: Date;
    onDateSelect?: (date: Date) => void;
    hideManifest?: boolean;
};

export function GlobalScheduleCalendar({ 
  workOrders, 
  technicians, 
  selectedDate, 
  onDateSelect,
  hideManifest = false
}: GlobalScheduleCalendarProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('week');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [internalSelectedDate, setInternalSelectedDate] = useState(new Date());

    const effectiveSelectedDate = selectedDate || internalSelectedDate;

    const handleDayClick = (day: Date) => {
        if (onDateSelect) {
            onDateSelect(day);
        } else {
            setInternalSelectedDate(day);
        }
    };

    const assignmentsForSelectedDay = useMemo(() => {
        return workOrders.filter(wo => {
            try {
                return isSameDay(parseISO(wo.scheduleDate), effectiveSelectedDate);
            } catch (e) {
                return false;
            }
        });
    }, [workOrders, effectiveSelectedDate]);
    
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
        <div className={cn("flex flex-col gap-6", !hideManifest && "xl:flex-row")}>
            {/* THIN CALENDAR NAVIGATION & GRID */}
            <div className={cn("w-full flex-shrink-0 rounded-lg border border-border-main bg-bg-secondary p-2 shadow-sm h-fit", !hideManifest && "xl:w-[400px]")}>
                <div className="flex items-center justify-between mb-2">
                    <div className="cal-nav !gap-1">
                        <button className="nav-btn !h-6 !w-6" onClick={handlePrev}><ChevronLeft size={12}/></button>
                        <span className="cal-period !min-w-[110px] !text-[9px] uppercase tracking-tighter text-center font-bold text-text-primary">
                            {viewMode === 'week' 
                                ? `${format(startOfWeek(currentDate, { weekStartsOn: 0 }), 'MMM d')} – ${format(endOfWeek(currentDate, { weekStartsOn: 0 }), 'MMM d')}`
                                : format(currentDate, 'MMMM yyyy')
                            }
                        </span>
                        <button className="nav-btn !h-6 !w-6" onClick={handleNext}><ChevronRight size={12}/></button>
                    </div>
                    <div className="view-toggle">
                        <button className={cn("view-btn !px-1.5 !py-0.5 !text-[8px]", { active: viewMode === 'week' })} onClick={() => setViewMode('week')}>
                            Week
                        </button>
                        <button className={cn("view-btn !px-1.5 !py-0.5 !text-[8px]", { active: viewMode === 'month' })} onClick={() => setViewMode('month')}>
                            Month
                        </button>
                    </div>
                </div>

                {viewMode === 'week' ? (
                    <div className="week-grid !gap-1 !mb-0">
                        {weekDays.map(day => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const hasEvents = eventsByDate[dateStr] && eventsByDate[dateStr].length > 0;
                            return (
                                <div 
                                  key={day.toString()} 
                                  className={cn("day-pill !h-10 !p-1 justify-center", {
                                    'selected': isSameDay(day, effectiveSelectedDate),
                                    'today': isToday(day)
                                  })}
                                  onClick={() => handleDayClick(day)}
                                >
                                    <span className="day-name !text-[7px] !mb-0">{format(day, 'EEE')}</span>
                                    <span className="day-num !text-xs !leading-none">{format(day, 'd')}</span>
                                    {hasEvents && <div className="day-dot !h-0.5 !w-0.5 !mt-0.5" />}
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="month-grid-wrap !mb-0 border-none bg-transparent">
                        <div className="month-header !border-none">
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(dayName => (
                                <div key={dayName} className="month-header-cell !p-0.5 !text-[7px]">{dayName}</div>
                            ))}
                        </div>
                        <div className="month-days !grid-cols-7 border border-border-sub rounded-md overflow-hidden">
                            {monthDays.map(day => {
                                const dateStr = format(day, 'yyyy-MM-dd');
                                const hasEvents = eventsByDate[dateStr] && eventsByDate[dateStr].length > 0;
                                return (
                                    <div 
                                      key={day.toString()}
                                      className={cn("month-day !h-8 !text-[9px] !border-border-sub", {
                                        'selected': isSameDay(day, effectiveSelectedDate),
                                        'today': isToday(day),
                                        'other-month': !isSameMonth(day, currentDate)
                                      })}
                                      onClick={() => handleDayClick(day)}
                                    >
                                        <span>{format(day, 'd')}</span>
                                        {hasEvents && <div className="h-0.5 w-0.5 rounded-full bg-brand-red" />}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* DAILY MANIFEST */}
            {!hideManifest && (
              <div className="flex-1 flex flex-col gap-4">
                  <div className="p-4 rounded-lg bg-bg-secondary border border-border-main flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-4">
                          <div className="p-2 bg-brand-red-dim rounded border border-brand-red/20">
                              <CalendarIcon size={18} className="text-brand-red" />
                          </div>
                          <div>
                              <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">Operational Manifest</p>
                              <p className="text-lg font-bold text-text-primary uppercase">{format(effectiveSelectedDate, 'EEEE, MMMM d, yyyy')}</p>
                          </div>
                      </div>
                      <Badge variant="outline" className="bg-bg-tertiary border-border-sub text-[10px] px-4 h-8 uppercase font-bold tracking-widest">
                          {assignmentsForSelectedDay.length} Active Missions
                      </Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {assignmentsForSelectedDay.length > 0 ? (
                          assignmentsForSelectedDay.map(wo => {
                              const tech = technicians.find(t => t.id === wo.assignedTechnicianId);
                              return (
                                  <div key={wo.id} className={cn("job-card !mb-0 transition-all hover:translate-y-[-2px] hover:shadow-xl", { 'border-text-green bg-green-dim/5': wo.status === 'in-progress'})}>
                                      <div className="job-card-inner">
                                          <div className={cn("job-accent", { 'active-accent': wo.status === 'in-progress' })}></div>
                                          <div className="job-body !p-5">
                                              <div className="job-left">
                                                  <div className="flex justify-between items-start mb-3">
                                                      <span className="job-wo !text-[10px]">{wo.id.toUpperCase()}</span>
                                                      <Badge variant={wo.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="text-[8px] h-4 uppercase tracking-widest">
                                                          {wo.status}
                                                      </Badge>
                                                  </div>
                                                  <h4 className="text-sm font-bold text-text-primary uppercase tracking-wide mb-3 leading-snug">{wo.description}</h4>
                                                  <div className="job-meta !gap-4 !mb-4">
                                                      <div className="job-meta-item !text-[11px]"><Clock size={12} className="text-brand-red"/> {wo.scheduleTime}</div>
                                                      <div className="job-meta-item !text-[11px]"><MapPin size={12} className="text-brand-red"/> {wo.location}</div>
                                                  </div>
                                                  <div className="pt-3 border-t border-border-sub flex items-center justify-between">
                                                      {tech ? (
                                                          <div className="flex items-center gap-2">
                                                              <Avatar className="h-6 w-6 border border-border-sub">
                                                                  <AvatarImage src={tech.avatarUrl} />
                                                                  <AvatarFallback>{tech.name.charAt(0)}</AvatarFallback>
                                                              </Avatar>
                                                              <div className="flex flex-col">
                                                                  <span className="text-[10px] font-bold text-text-primary uppercase tracking-wide leading-none">{tech.name}</span>
                                                                  <span className="text-[8px] text-text-muted uppercase tracking-widest mt-0.5">{tech.role}</span>
                                                              </div>
                                                          </div>
                                                      ) : (
                                                          <div className="flex items-center gap-1.5 text-[10px] text-text-muted italic">
                                                              <User size={10}/> Unassigned
                                                          </div>
                                                      )}
                                                      {wo.status === 'in-progress' && (
                                                          <div className="flex items-center gap-1.5 text-[9px] font-bold text-text-green uppercase tracking-widest bg-green-dim px-2 py-0.5 rounded border border-green-border">
                                                              <Activity size={10} className="animate-pulse" /> LIVE SESSION
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
                          <div className="col-span-full p-24 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30">
                              <Activity size={48} className="mx-auto text-text-muted mb-4 opacity-10" />
                              <p className="text-xs text-text-muted uppercase font-bold tracking-[0.3em] italic">No missions deployed for these coordinates</p>
                          </div>
                      )}
                  </div>
              </div>
            )}
        </div>
    );
}
