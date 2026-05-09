
'use client';

import { useState, useMemo, useEffect } from 'react';
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
  Activity,
  ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { JobDetailDialog } from '@/components/job-detail-dialog';

type ViewMode = 'week' | 'month';

type GlobalScheduleCalendarProps = {
    workOrders: WorkOrder[];
    technicians: Technician[];
    selectedDates?: Date[];
    onDatesChange?: (dates: Date[]) => void;
    hideManifest?: boolean;
};

export function GlobalScheduleCalendar({ 
  workOrders, 
  technicians, 
  selectedDates = [], 
  onDatesChange,
  hideManifest = false
}: GlobalScheduleCalendarProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('week');
    const [currentDate, setCurrentDate] = useState<Date | null>(null);
    const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    useEffect(() => {
        setCurrentDate(new Date());
    }, []);

    const handleDayClick = (day: Date) => {
        const isAlreadySelected = selectedDates.some(selected => isSameDay(selected, day));
        let newDates: Date[];

        if (isAlreadySelected) {
            newDates = selectedDates.filter(selected => !isSameDay(selected, day));
        } else {
            newDates = [...selectedDates, day];
        }

        if (onDatesChange) {
            onDatesChange(newDates);
        }
    };

    const assignmentsForSelectedDays = useMemo(() => {
        if (selectedDates.length === 0) return [];
        return workOrders.filter(wo => {
            try {
                const woDate = parseISO(wo.scheduleDate);
                return selectedDates.some(selected => isSameDay(woDate, selected));
            } catch (e) {
                return false;
            }
        });
    }, [workOrders, selectedDates]);
    
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
        if (!currentDate) return;
        if (viewMode === 'week') {
            setCurrentDate(subDays(currentDate, 7));
        } else {
            setCurrentDate(subMonths(currentDate, 1));
        }
    };

    const handleNext = () => {
        if (!currentDate) return;
        if (viewMode === 'week') {
            setCurrentDate(addDays(currentDate, 7));
        } else {
            setCurrentDate(addMonths(currentDate, 1));
        }
    };

    const handleCardClick = (wo: WorkOrder) => {
        setSelectedJob(wo);
        setIsDetailOpen(true);
    };

    const getFieldNationLink = (id: string) => {
      const cleanId = id.replace(/^wo-/, '');
      return `https://app.fieldnation.com/workorders/${cleanId}`;
    };

    if (!currentDate) return null;

    const weekDays = eachDayOfInterval({
        start: startOfWeek(currentDate, { weekStartsOn: 0 }),
        end: endOfWeek(currentDate, { weekStartsOn: 0 }),
    });

    const monthDays = eachDayOfInterval({
        start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 }),
    });

    const isDateSelected = (day: Date) => selectedDates.some(selected => isSameDay(selected, day));

    return (
        <>
            <div className={cn("flex flex-col gap-6", !hideManifest && "xl:flex-row")}>
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
                                        'selected': isDateSelected(day),
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
                                            'selected': isDateSelected(day),
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

                {!hideManifest && (
                  <div className="flex-1 flex flex-col gap-4">
                      <div className="p-4 rounded-lg bg-bg-secondary border border-border-main flex items-center justify-between shadow-sm">
                          <div className="flex items-center gap-4">
                              <div className="p-2 bg-brand-red-dim rounded border border-brand-red/20">
                                  <CalendarIcon size={18} className="text-brand-red" />
                              </div>
                              <div>
                                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">Schedule Manifest</p>
                                  <p className="text-sm font-bold text-text-primary uppercase">
                                    {selectedDates.length > 0 
                                        ? selectedDates.map(d => format(d, 'MMM d')).join(', ')
                                        : 'All Dates'
                                    }
                                  </p>
                              </div>
                          </div>
                          <Badge variant="outline" className="bg-bg-tertiary border-border-sub text-[10px] px-4 h-8 uppercase font-bold tracking-widest">
                              {assignmentsForSelectedDays.length} Active Jobs
                          </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {assignmentsForSelectedDays.length > 0 ? (
                              assignmentsForSelectedDays.map(wo => {
                                  const tech = technicians.find(t => t.id === wo.assignedTechnicianId);
                                  return (
                                      <div 
                                        key={wo.id} 
                                        className={cn("job-card !mb-0 transition-all hover:translate-y-[-2px] hover:shadow-xl cursor-pointer", { 'border-text-green bg-green-dim/5': wo.status === 'in-progress'})}
                                        onClick={() => handleCardClick(wo)}
                                      >
                                          <div className="job-card-inner">
                                              <div className={cn("job-accent", { 'active-accent': wo.status === 'in-progress' })}></div>
                                              <div className="job-body !p-5">
                                                  <div className="job-left">
                                                      <div className="flex justify-between items-start mb-3">
                                                          <div className="flex items-center gap-2">
                                                            <span className="job-wo !text-[10px]">{wo.id.toUpperCase()}</span>
                                                            {wo.source === 'Imported' && (
                                                              <a href={getFieldNationLink(wo.id)} target="_blank" rel="noopener noreferrer" title="View on FieldNation" className="text-text-muted hover:text-brand-red transition-colors" onClick={(e) => e.stopPropagation()}>
                                                                <ExternalLink size={10} />
                                                              </a>
                                                            )}
                                                          </div>
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
                                  <p className="text-xs text-text-muted uppercase font-bold tracking-[0.2em] italic">No jobs assigned for these coordinates</p>
                              </div>
                          )}
                      </div>
                  </div>
                )}
            </div>

            <JobDetailDialog 
                isOpen={isDetailOpen} 
                setIsOpen={setIsDetailOpen} 
                mission={selectedJob} 
            />
        </>
    );
}
