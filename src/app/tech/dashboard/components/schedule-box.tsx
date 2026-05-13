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
  CircleCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { MissionDetailDialog } from '@/components/mission-detail-dialog';

type ViewMode = 'week' | 'month';

type ScheduleBoxProps = {
    workOrders: WorkOrder[];
};

export function ScheduleBox({ workOrders: initialWorkOrders }: ScheduleBoxProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('week');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDates, setSelectedDates] = useState<Date[]>([new Date()]);
    const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>(initialWorkOrders);
    const [selectedMission, setSelectedMission] = useState<WorkOrder | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const { toast } = useToast();

    const weekDays = useMemo(() => eachDayOfInterval({
        start: startOfWeek(currentDate, { weekStartsOn: 0 }),
        end: endOfWeek(currentDate, { weekStartsOn: 0 }),
    }), [currentDate]);

    const monthDays = useMemo(() => eachDayOfInterval({
        start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 }),
    }), [currentDate]);

    const activeSession = useMemo(() => {
        return allWorkOrders.find(wo => wo.status === 'in-progress');
    }, [allWorkOrders]);

    const isAllSelected = useMemo(() => {
        const currentDays = viewMode === 'week' ? weekDays : monthDays;
        return currentDays.every(day => selectedDates.some(sd => isSameDay(sd, day)));
    }, [viewMode, weekDays, monthDays, selectedDates]);

    const handleDayClick = (day: Date) => {
        const isAlreadySelected = selectedDates.some(d => isSameDay(d, day));
        if (isAlreadySelected) {
            setSelectedDates(selectedDates.filter(d => !isSameDay(d, day)));
        } else {
            setSelectedDates([...selectedDates, day]);
        }
    };

    const handleSeeAllToggle = () => {
        const currentDays = viewMode === 'week' ? weekDays : monthDays;
        if (isAllSelected) {
            setSelectedDates([new Date()]);
        } else {
            setSelectedDates(currentDays);
        }
    };

    const assignmentsForSelectedDays = useMemo(() => {
        return allWorkOrders.filter(wo => {
            try {
                const woDate = parseISO(wo.scheduleDate);
                return selectedDates.some(sd => isSameDay(woDate, sd));
            } catch (e) {
                return false;
            }
        });
    }, [allWorkOrders, selectedDates]);
    
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
    
    const handleCheckIn = (e: React.MouseEvent, workOrderId: string) => {
      e.stopPropagation();
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

    const handleCheckOut = (e: React.MouseEvent, workOrderId: string) => {
      e.stopPropagation();
      setAllWorkOrders(orders => orders.map(wo => wo.id === workOrderId ? {...wo, status: 'completed'} : wo));
      toast({ title: 'Checked Out', description: 'Your session has ended.' });
    };

    const handleCardClick = (wo: WorkOrder) => {
        setSelectedMission(wo);
        setIsDetailOpen(true);
    };

    return (
        <>
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
                        <span className="cal-period !min-w-[140px] !text-xs uppercase tracking-widest text-center">
                            {viewMode === 'week' 
                                ? `${format(startOfWeek(currentDate, { weekStartsOn: 0 }), 'MMM d')} – ${format(endOfWeek(currentDate, { weekStartsOn: 0 }), 'MMM d')}`
                                : format(currentDate, 'MMMM yyyy')
                            }
                        </span>
                        <button className="nav-btn" onClick={handleNext}><ChevronRight size={16}/></button>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={handleSeeAllToggle} 
                            className={cn(
                                "h-6 text-[9px] uppercase font-bold tracking-widest ml-2 px-2 border border-border-sub hover:bg-bg-tertiary transition-all",
                                isAllSelected && "bg-brand-red text-white border-brand-red hover:bg-brand-red-hover"
                            )}
                        >
                            {isAllSelected ? 'Reset View' : 'See All'}
                        </Button>
                    </div>
                    <div className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                       {selectedDates.length === 1 ? format(selectedDates[0], 'EEEE, MMM d') : `${selectedDates.length} Dates Selected`}
                    </div>
                </div>

                {viewMode === 'week' ? (
                    <div className="week-grid !mb-6">
                        {weekDays.map(day => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const isSelected = selectedDates.some(sd => isSameDay(sd, day));
                            return (
                                <div 
                                  key={day.toString()} 
                                  className={cn("day-pill", {
                                    'selected': isSelected,
                                    'today': isToday(day)
                                  })}
                                  onClick={() => handleDayClick(day)}
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
                                const isSelected = selectedDates.some(sd => isSameDay(sd, day));
                                return (
                                    <div 
                                      key={day.toString()}
                                      className={cn("month-day !h-10 !text-xs", {
                                        'selected': isSelected,
                                        'today': isToday(day),
                                        'other-month': !isSameMonth(day, currentDate)
                                      })}
                                      onClick={() => handleDayClick(day)}
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
                    {assignmentsForSelectedDays.length > 0 ? (
                        assignmentsForSelectedDays.map(wo => (
                            <div key={wo.id} 
                                className={cn("job-card !mb-0 cursor-pointer", { 'active': wo.status === 'in-progress'})}
                                onClick={() => handleCardClick(wo)}
                            >
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
                                                <div className="btn-completed !text-[10px]"><CircleCheck size={12}/> Done</div>
                                            ) : wo.status === 'in-progress' ? (
                                                <button className="btn-checkout !p-1.5 !text-[10px]" onClick={(e) => handleCheckOut(e, wo.id)}>
                                                    OUT
                                                </button>
                                            ) : (
                                                <button 
                                                    className="btn-checkin !p-1.5 !text-[10px]"
                                                    disabled={!!activeSession}
                                                    onClick={(e) => handleCheckIn(e, wo.id)}
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
                            <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted">No assignments for selected dates</div>
                        </div>
                    )}
                </div>
            </div>

            <MissionDetailDialog 
                isOpen={isDetailOpen} 
                setIsOpen={setIsDetailOpen} 
                mission={selectedMission} 
            />
        </>
    );
}