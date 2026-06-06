
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
  startOfDay
} from 'date-fns';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  LayoutGrid, 
  List, 
  MapPin, 
  Clock, 
  CircleCheck,
  Building2,
  Briefcase,
  Wrench
} from 'lucide-react';
import { cn, formatCityState } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { JobDetailDialog } from '@/components/job-detail-dialog';
import { Badge } from '@/components/ui/badge';

type ViewMode = 'week' | 'month';

type ScheduleBoxProps = {
    workOrders: WorkOrder[];
    onStatusTransition?: (woId: string, status: WorkOrder['status']) => void;
};

/**
 * Tactical Operational Schedule.
 * Hardened date parsing for cross-registry format synchronization.
 */
export function ScheduleBox({ workOrders, onStatusTransition }: ScheduleBoxProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('week');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDates, setSelectedDates] = useState<Date[]>([new Date()]);
    const [selectedMission, setSelectedMission] = useState<WorkOrder | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    /**
     * Unified Local Date Parser.
     * Prevents UTC shifts by manually extracting parts for local-time construction.
     */
    const parseTacticalDate = (dateStr: string) => {
        if (!dateStr) return null;
        try {
            const parts = dateStr.split(/[-/]/);
            if (parts.length !== 3) return null;
            
            let year, month, day;
            if (parts[0].length === 4) {
                // YYYY-MM-DD
                year = parseInt(parts[0]);
                month = parseInt(parts[1]) - 1;
                day = parseInt(parts[2]);
            } else {
                // MM-DD-YYYY
                month = parseInt(parts[0]) - 1;
                day = parseInt(parts[1]);
                year = parseInt(parts[2]);
            }
            // new Date(y, m, d) is always interpreted as local time
            return startOfDay(new Date(year, month, day));
        } catch (e) {
            return null;
        }
    };

    const weekDays = useMemo(() => eachDayOfInterval({
        start: startOfWeek(currentDate, { weekStartsOn: 0 }),
        end: endOfWeek(currentDate, { weekStartsOn: 0 }),
    }), [currentDate]);

    const monthDays = useMemo(() => eachDayOfInterval({
        start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 }),
    }), [currentDate]);

    const activeSession = useMemo(() => {
        return workOrders.find(wo => wo.status === 'in-progress');
    }, [workOrders]);

    const isAllSelected = useMemo(() => {
        const currentDays = viewMode === 'week' 
            ? weekDays 
            : monthDays.filter(day => isSameMonth(day, currentDate));
        return currentDays.every(day => selectedDates.some(sd => isSameDay(sd, day)));
    }, [viewMode, weekDays, monthDays, selectedDates, currentDate]);

    const handleDayClick = (day: Date) => {
        const isAlreadySelected = selectedDates.some(d => isSameDay(d, day));
        if (isAlreadySelected) {
            setSelectedDates(selectedDates.filter(d => !isSameDay(d, day)));
        } else {
            setSelectedDates([...selectedDates, day]);
        }
    };

    const handleSeeAllToggle = () => {
        if (isAllSelected) {
            setSelectedDates([new Date()]);
        } else {
            const daysToSelect = viewMode === 'week' 
                ? weekDays 
                : monthDays.filter(day => isSameMonth(day, currentDate));
            setSelectedDates(daysToSelect);
        }
    };

    const assignmentsForSelectedDays = useMemo(() => {
        return workOrders.filter(wo => {
            const woDate = parseTacticalDate(wo.scheduleDate);
            if (!woDate) return false;
            return selectedDates.some(sd => isSameDay(woDate, sd));
        });
    }, [workOrders, selectedDates]);
    
    const eventsByDate = useMemo(() => {
      return workOrders.reduce((acc, wo) => {
        const woDate = parseTacticalDate(wo.scheduleDate);
        if (woDate) {
            const dateStr = format(woDate, 'yyyy-MM-dd');
            if (!acc[dateStr]) acc[dateStr] = [];
            acc[dateStr].push(wo);
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
    
    const handleCheckIn = (e: React.MouseEvent, workOrderId: string) => {
      e.stopPropagation();
      if (onStatusTransition) onStatusTransition(workOrderId, 'in-progress');
    };

    const handleCheckOut = (e: React.MouseEvent, workOrderId: string) => {
      e.stopPropagation();
      if (onStatusTransition) onStatusTransition(workOrderId, 'checked-out');
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
                        {weekDays.map((day, idx) => {
                            const isSelected = selectedDates.some(sd => isSameDay(sd, day));
                            return (
                                <div 
                                  key={`${day.toISOString()}-${idx}`} 
                                  className={cn("day-pill", {
                                    'selected': isSelected,
                                    'today': isToday(day)
                                  })}
                                  onClick={() => handleDayClick(day)}
                                >
                                    <span className="day-name">{format(day, 'EEE')}</span>
                                    <span className="day-num">{format(day, 'd')}</span>
                                    {eventsByDate[format(day, 'yyyy-MM-dd')] && <div className="day-dot"></div>}
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="month-grid-wrap !mb-6">
                        <div className="month-header">
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((dayName, idx) => (
                                <div key={`${dayName}-${idx}`} className="month-header-cell">{dayName}</div>
                            ))}
                        </div>
                        <div className="month-days">
                            {monthDays.map((day, idx) => {
                                const isSelected = selectedDates.some(sd => isSameDay(sd, day));
                                return (
                                    <div 
                                      key={`${day.toISOString()}-${idx}`}
                                      className={cn("month-day !h-10 !text-xs", {
                                        'selected': isSelected,
                                        'today': isToday(day),
                                        'other-month': !isSameMonth(day, currentDate)
                                      })}
                                      onClick={() => handleDayClick(day)}
                                    >
                                        {format(day, 'd')}
                                        {eventsByDate[format(day, 'yyyy-MM-dd')] && <div className="month-day-dot"></div>}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                <div className="space-y-3 mt-4">
                    {assignmentsForSelectedDays.length > 0 ? (
                        assignmentsForSelectedDays.map(wo => (
                            <div key={wo.id} 
                                className={cn("job-card !mb-0 cursor-pointer group hover:border-border-main", { 'active': wo.status === 'in-progress'})}
                                onClick={() => handleCardClick(wo)}
                            >
                                <div className="job-card-inner">
                                    <div className={cn("job-accent", { 'active-accent': wo.status === 'in-progress' })}></div>
                                    <div className="job-body !p-3">
                                        <div className="job-left">
                                            <div className="flex items-center gap-2 mb-1 w-full justify-start text-left">
                                                <Badge variant="outline" className="text-[7px] uppercase h-3.5 px-1 bg-bg-tertiary">
                                                    {wo.projectType === 'Project' ? <Briefcase size={8} className="mr-1"/> : <Wrench size={8} className="mr-1"/>}
                                                    {wo.projectType}
                                                </Badge>
                                                <span className="job-wo !text-[9px] !px-1.5">{wo.id.toUpperCase()}</span>
                                            </div>
                                            <div className="job-title-row !mb-1 !justify-start text-left">
                                                <span className="job-title !text-[11px] text-left truncate w-full">{wo.title || wo.description}</span>
                                            </div>
                                            <div className="job-meta !gap-3 !justify-start text-left">
                                                <div className="job-meta-item !text-[10px]"><Building2 size={11} className="text-text-muted"/> {wo.clientName}</div>
                                                <div className="job-meta-item !text-[10px]"><Clock size={11} className="text-accent-gold"/> {wo.scheduleTime}</div>
                                                <div className="job-meta-item !text-[10px]"><MapPin size={11} className="text-brand-red"/> {formatCityState(wo.location)}</div>
                                            </div>
                                        </div>
                                        <div className="job-right shrink-0">
                                            {wo.status === 'completed' ? (
                                                <div className="text-[10px] font-bold text-text-green flex items-center gap-1 uppercase"><CircleCheck size={12}/> Done</div>
                                            ) : wo.status === 'in-progress' ? (
                                                <button className="h-7 px-3 rounded bg-bg-primary border border-border-sub text-[10px] text-text-red uppercase font-bold hover:bg-brand-red-dim" onClick={(e) => handleCheckOut(e, wo.id)}>
                                                    OUT
                                                </button>
                                            ) : (
                                                <button 
                                                    className="h-7 px-3 rounded bg-brand-red text-white text-[10px] uppercase font-bold hover:bg-brand-red-hover"
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
                            <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted italic">No missions scheduled for selected coordinates</div>
                        </div>
                    )}
                </div>
            </div>

            <JobDetailDialog 
                isOpen={isDetailOpen} 
                setIsOpen={setIsDetailOpen} 
                mission={selectedMission} 
            />
        </>
    );
}
