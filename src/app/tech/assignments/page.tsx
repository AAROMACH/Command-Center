
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { WorkOrder } from '@/lib/types';
import { workOrders } from '@/lib/data';
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
  DollarSign, 
  LogIn, 
  LogOut, 
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type ViewMode = 'week' | 'month';

export default function TechSchedulePage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('week');
    // Set a consistent date for mock data purposes
    const [currentDate, setCurrentDate] = useState(new Date('2026-04-29T12:00:00Z'));
    const [selectedDate, setSelectedDate] = useState(new Date('2026-04-29T12:00:00Z'));
    const { toast } = useToast();

    useEffect(() => {
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);
    }, []);
    
    const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>(workOrders);

    const techWorkOrders = useMemo(() => {
        if (!currentTechId) return [];
        return allWorkOrders.filter(wo => wo.assignedTechnicianId === currentTechId);
    }, [allWorkOrders, currentTechId]);

    const activeSession = useMemo(() => {
        return techWorkOrders.find(wo => wo.status === 'in-progress');
    }, [techWorkOrders]);

    const assignmentsForSelectedDay = useMemo(() => {
        return techWorkOrders.filter(wo => {
            try {
                return isSameDay(parseISO(wo.scheduleDate), selectedDate);
            } catch (e) {
                return false;
            }
        });
    }, [techWorkOrders, selectedDate]);
    
    const eventsByDate = useMemo(() => {
      return techWorkOrders.reduce((acc, wo) => {
        try {
            const date = format(parseISO(wo.scheduleDate), 'yyyy-MM-dd');
            if (!acc[date]) {
              acc[date] = [];
            }
            acc[date].push(wo);
        } catch (e) {
            // Ignore invalid dates
        }
        return acc;
      }, {} as Record<string, WorkOrder[]>);
    }, [techWorkOrders]);


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
        <div className="page">
            {activeSession && (
                <div className="session-banner">
                    <div className="flex items-center gap-2.5">
                        <div className="session-dot"></div>
                        <span className="session-label">Active Session</span>
                        <span className="session-detail">Checked in to {activeSession.id.toUpperCase()} — {activeSession.description}</span>
                    </div>
                    <span className="session-time">Since {format(new Date(), 'h:mm a')}</span>
                </div>
            )}

            <div className="page-header">
                <div>
                    <div className="eyebrow">
                        <CalendarIcon size={12} />
                        Fleet Assignments
                    </div>
                    <div className="page-title">Schedule</div>
                    <p className="page-subtitle">Operational overview of assigned IT infrastructure deployments.</p>
                </div>
            </div>

            <div className="cal-controls">
                <div className="cal-nav">
                    <button className="nav-btn" onClick={handlePrev}>&#8249;</button>
                    <span className="cal-period">
                        {viewMode === 'week' 
                            ? `${format(startOfWeek(currentDate, { weekStartsOn: 0 }), 'MMM d')} – ${format(endOfWeek(currentDate, { weekStartsOn: 0 }), 'MMM d, yyyy')}`
                            : format(currentDate, 'MMMM yyyy')
                        }
                    </span>
                    <button className="nav-btn" onClick={handleNext}>&#8250;</button>
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
                <div className="week-grid">
                    {weekDays.map(day => (
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
                            {eventsByDate[format(day, 'yyyy-MM-dd')] && <div className="day-dot"></div>}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="month-grid-wrap">
                    <div className="month-header">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(dayName => (
                            <div key={dayName} className="month-header-cell">{dayName}</div>
                        ))}
                    </div>
                    <div className="month-days">
                        {monthDays.map(day => (
                            <div 
                              key={day.toString()}
                              className={cn("month-day", {
                                'selected': isSameDay(day, selectedDate),
                                'today': isToday(day),
                                'other-month': !isSameMonth(day, currentDate)
                              })}
                              onClick={() => setSelectedDate(day)}
                            >
                                {format(day, 'd')}
                                {eventsByDate[format(day, 'yyyy-MM-dd')] && <div className="month-day-dot"></div>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="intel-header">
                <span className="intel-label">Operational Intel</span>
                <span className="intel-date">{format(selectedDate, 'EEEE, MMMM d')}</span>
                <span className="intel-count">{assignmentsForSelectedDay.length} assignments</span>
            </div>

            {assignmentsForSelectedDay.length > 0 ? (
                assignmentsForSelectedDay.map(wo => (
                    <div key={wo.id} className={cn("job-card", { 'active': wo.status === 'in-progress'})}>
                        <div className="job-card-inner">
                            <div className={cn("job-accent", { 'active-accent': wo.status === 'in-progress' })}></div>
                            <div className="job-body">
                                <div className="job-left">
                                    <div className="job-title-row">
                                        <span className="job-title">{wo.description}</span>
                                        <span className="job-wo">{wo.id.toUpperCase()}</span>
                                        {wo.status === 'in-progress' && (
                                            <div className="job-active-badge">
                                                <div className="job-active-badge-dot"></div>
                                                Active
                                            </div>
                                        )}
                                    </div>
                                    <div className="job-meta">
                                        <div className="job-meta-item"><Clock size={12}/> {wo.scheduleTime}</div>
                                        <div className="job-meta-item"><MapPin size={12} className="text-brand-red"/> {wo.location}</div>
                                        <div className="job-meta-item"><DollarSign size={12} className="text-text-green"/> ${wo.pay.toFixed(2)} <span className="text-text-muted font-normal normal-case">(fixed)</span></div>
                                        <div className="job-meta-item job-meta-divider">{wo.clientName}</div>
                                    </div>
                                </div>
                                <div className="job-right">
                                    {wo.status === 'completed' ? (
                                        <div className="btn-completed"><CheckCircle2 size={14}/> Completed</div>
                                    ) : wo.status === 'in-progress' ? (
                                        <button className="btn-checkout" onClick={() => handleCheckOut(wo.id)}>
                                            <LogOut size={13}/> Check Out
                                        </button>
                                    ) : (
                                        <button 
                                            className="btn-checkin"
                                            disabled={!!activeSession}
                                            onClick={() => handleCheckIn(wo.id)}
                                        >
                                            <LogIn size={13}/> Check In
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))
            ) : (
                <div className="empty-state">
                    <CalendarIcon size={40} className="text-[#333]" strokeWidth={1} />
                    <div className="empty-state-text">No assignments scheduled for this date</div>
                </div>
            )}
        </div>
    );
}
