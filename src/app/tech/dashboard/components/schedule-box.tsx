'use client';

import { useState, useMemo } from 'react';
import type { WorkOrder } from '@/lib/types';
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
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type ViewMode = 'week' | 'month';

type ScheduleBoxProps = {
    workOrders: WorkOrder[];
};

export function ScheduleBox({ workOrders: initialWorkOrders }: ScheduleBoxProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('week');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>(initialWorkOrders);
    const { toast } = useToast();

    const activeSession = useMemo(() => {
        return allWorkOrders.find(wo => wo.status === 'in-progress');
    }, [allWorkOrders]);

    const assignmentsForSelectedDay = useMemo(() => {
        return allWorkOrders.filter(wo => {
            try {
                return isSameDay(parseISO(wo.scheduleDate), selectedDate);
            } catch (e) {
                return false;
            }
        });
    }, [allWorkOrders, selectedDate]);
    
    const eventsByDate = useMemo(() => {
      return allWorkOrders.reduce((acc, wo) => {
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
    }, [allWorkOrders]);

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
    
    const handleCheckIn = (workOrderId: string) => {
      if (activeSession) {
        toast({
          variant: 'destructive',
          title: 'Active session exists',
          description: 'You must check out of your current job before starting another.',
        });
        return;
      }
      setAllWorkOrders(orders => orders.map(wo => wo.id === workOrderId ? {...wo, status: 'in-progress'} : wo));
      toast({ title: 'Checked In', description: 'Your session has started.' });
    };

    const handleCheckOut = (workOrderId: string) => {
      setAllWorkOrders(orders => orders.map(wo => wo.id === workOrderId ? {...wo, status: 'completed'} : wo));
      toast({ title: 'Checked Out', description: 'Your session has ended.' });
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
        <div className="rounded-lg border border-border-main bg-bg-secondary p-5 overflow-hidden shadow-sm">
             <div className="flex items-center justify-between mb-4 pb-4 border-b border-border-main">
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                        <CalendarIcon size={14} className="text-brand-red"/>
                        Operational Schedule
                    </h3>
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

            <div className="cal-controls !mb-6">
                <div className="cal-nav">
                    <button className="nav-btn" onClick={handlePrev}><ChevronLeft size={16}/></button>
                    <span className="cal-period !min-w-[140px] !text-xs uppercase tracking-widest">
                        {viewMode === 'week' 
                            ? `${format(startOfWeek(currentDate, { weekStartsOn: 0 }), 'MMM d')} – ${format(endOfWeek(currentDate, { weekStartsOn: 0 }), 'MMM d')}`
                            : format(currentDate, 'MMMM yyyy')
                        }
                    </span>
                    <button className="nav-btn" onClick={handleNext}><ChevronRight size={16}/></button>
                </div>
                <div className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                   {format(selectedDate, 'EEEE, MMM d')}
                </div>
            </div>

            {viewMode === 'week' ? (
                <div className="week-grid !mb-6">
                    {weekDays.map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        return (
                            <div 
                              key={day.toString()} 
                              className={cn("day-pill", {
                                'selected': isSameDay(day, selectedDate),
                                'today': isToday(day)
                              })}
                              onClick={() => setSelectedDate(day)}
                            >
                                <span className="day-name">{format(day, 'EEE')}</span>
                                <span className="day-num">{format(day, 'd')}</span>
                                {eventsByDate[dateStr] && eventsByDate[dateStr].length > 0 && <div className="day-dot"></div>}
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="month-grid-wrap !mb-6">
                    <div className="month-header">
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(dayName => (
                            <div key={dayName} className="month-header-cell">{dayName}</div>
                        ))}
                    </div>
                    <div className="month-days">
                        {monthDays.map(day => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            return (
                                <div 
                                  key={day.toString()}
                                  className={cn("month-day !h-10 !text-xs", {
                                    'selected': isSameDay(day, selectedDate),
                                    'today': isToday(day),
                                    'other-month': !isSameMonth(day, currentDate)
                                  })}
                                  onClick={() => setSelectedDate(day)}
                                >
                                    {format(day, 'd')}
                                    {eventsByDate[dateStr] && eventsByDate[dateStr].length > 0 && <div className="month-day-dot"></div>}
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            <div className="space-y-2 mt-4">
                {assignmentsForSelectedDay.length > 0 ? (
                    assignmentsForSelectedDay.map(wo => (
                        <div key={wo.id} className={cn("job-card !mb-0", { 'active': wo.status === 'in-progress'})}>
                            <div className="job-card-inner">
                                <div className={cn("job-accent", { 'active-accent': wo.status === 'in-progress' })}></div>
                                <div className="job-body !p-3">
                                    <div className="job-left">
                                        <div className="job-title-row !mb-1">
                                            <span className="job-title !text-[11px]">{wo.description}</span>
                                            <span className="job-wo !text-[9px] !px-1.5">{wo.id.toUpperCase()}</span>
                                        </div>
                                        <div className="job-meta !gap-3">
                                            <div className="job-meta-item !text-[10px]"><Clock size={11}/> {wo.scheduleTime}</div>
                                            <div className="job-meta-item !text-[10px]"><MapPin size={11}/> {wo.location}</div>
                                        </div>
                                    </div>
                                    <div className="job-right">
                                        {wo.status === 'completed' ? (
                                            <div className="btn-completed !text-[10px]"><CheckCircle2 size={12}/> Done</div>
                                        ) : wo.status === 'in-progress' ? (
                                            <button className="btn-checkout !p-1.5 !text-[10px]" onClick={() => handleCheckOut(wo.id)}>
                                                OUT
                                            </button>
                                        ) : (
                                            <button 
                                                className="btn-checkin !p-1.5 !text-[10px]"
                                                disabled={!!activeSession}
                                                onClick={() => handleCheckIn(wo.id)}
                                            >
                                                IN
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="p-8 text-center border border-dashed border-border-main rounded-md">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted">No assignments for this date</div>
                    </div>
                )}
            </div>
        </div>
    );
}
