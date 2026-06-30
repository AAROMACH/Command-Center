'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { WorkOrder } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronLeft, ChevronRight, Clock, MapPin, DollarSign,
  Building2, CalendarDays, X, Flag,
} from 'lucide-react';
import {
  format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, addMonths, subMonths,
  startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  isSameDay, isToday, parseISO, isSameMonth,
} from 'date-fns';
import { cn } from '@/lib/utils';

const MapView = dynamic(() => import('../map/components/map-view'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full bg-[#1a1f2e] text-[#6b7db3] text-[10px] uppercase tracking-widest">Loading map...</div>,
});

function getStatusBadge(status: string): { label: string; cls: string } {
  if (status === 'in-progress') return { label: 'In Progress', cls: 'bg-blue-500/15 text-blue-400' };
  if (status === 'on-my-way') return { label: 'On My Way', cls: 'bg-blue-500/15 text-blue-400' };
  if (status === 'confirmed') return { label: 'Confirmed', cls: 'bg-text-green/15 text-text-green' };
  if (status === 'completed') return { label: 'Completed', cls: 'bg-border-sub text-text-muted' };
  if (status === 'checked-out') return { label: 'Checked Out', cls: 'bg-border-sub text-text-muted' };
  return { label: 'Scheduled', cls: 'bg-amber-400/15 text-amber-400' };
}

export default function TechCalendarPage() {
  const [currentTechId, setCurrentTechId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [techWorkOrders, setTechWorkOrders] = useState<WorkOrder[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [miniCalMonth, setMiniCalMonth] = useState(() => new Date());
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerJob, setDrawerJob] = useState<WorkOrder | null>(null);
  const [mobileTab, setMobileTab] = useState<'sidebar' | 'jobs' | 'map'>('jobs');

  useEffect(() => {
    const userId = sessionStorage.getItem('currentUserId');
    setCurrentTechId(userId);
  }, []);

  useEffect(() => {
    if (!currentTechId) return;
    const q = query(
      collection(db, 'workOrders'),
      where('assignedTechnicianId', '==', currentTechId)
    );
    const unsub = onSnapshot(q, (snap) => {
      setTechWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [currentTechId]);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]);

  const miniCalDays = useMemo(() => {
    const start = startOfMonth(miniCalMonth);
    const end = endOfMonth(miniCalMonth);
    const days = eachDayOfInterval({ start, end });
    const startPad = getDay(start) === 0 ? 6 : getDay(start) - 1;
    const padBefore = Array.from({ length: startPad }, (_, i) => addDays(start, -(startPad - i)));
    const endPad = 6 - (getDay(end) === 0 ? 6 : getDay(end) - 1);
    const padAfter = Array.from({ length: endPad }, (_, i) => addDays(end, i + 1));
    return [...padBefore, ...days, ...padAfter];
  }, [miniCalMonth]);

  const jobsForSelectedDate = useMemo(() =>
    techWorkOrders
      .filter(wo => {
        if (!wo.scheduleDate) return false;
        try { return isSameDay(parseISO(wo.scheduleDate), selectedDate); } catch { return false; }
      })
      .sort((a, b) => (a.scheduleTime || '').localeCompare(b.scheduleTime || '')),
    [techWorkOrders, selectedDate]);

  const jobCountForDay = (day: Date) =>
    techWorkOrders.filter(wo => {
      if (!wo.scheduleDate) return false;
      try { return isSameDay(parseISO(wo.scheduleDate), day); } catch { return false; }
    }).length;

  const selectDay = (day: Date) => {
    setSelectedDate(day);
    setWeekStart(startOfWeek(day, { weekStartsOn: 1 }));
    if (!isSameMonth(day, miniCalMonth)) setMiniCalMonth(day);
    setSelectedJobId(null);
    setDrawerOpen(false);
    setDrawerJob(null);
  };

  const handleSelectJob = (wo: WorkOrder) => {
    if (drawerJob?.id === wo.id && drawerOpen) {
      setDrawerOpen(false);
      setDrawerJob(null);
      setSelectedJobId(null);
    } else {
      setSelectedJobId(wo.id);
      setDrawerJob(wo);
      setDrawerOpen(true);
    }
  };

  if (!currentTechId) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-32 ml-auto" />
        </div>
        <div className="flex rounded-xl border border-border-sub overflow-hidden" style={{ height: 560 }}>
          <Skeleton className="w-[220px] h-full" />
          <Skeleton className="flex-1 h-full" />
          <Skeleton className="w-[320px] h-full" />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile tab bar */}
      <div className="md:hidden flex border-b border-border-sub -mx-4 mb-0">
        {(['sidebar', 'jobs', 'map'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={cn(
              'flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors',
              mobileTab === tab ? 'border-b-2 border-brand-red text-brand-red' : 'text-text-muted hover:text-text-primary',
            )}
          >{tab === 'sidebar' ? 'Calendar' : tab}</button>
        ))}
      </div>

      <div className="flex flex-col rounded-xl border border-border-sub bg-bg-secondary overflow-hidden">

        {/* ── Topbar ── */}
        <div className="h-[52px] shrink-0 flex items-center gap-3 px-4 border-b border-border-sub bg-bg-secondary">
          <CalendarDays size={15} className="text-text-muted shrink-0" />
          <span className="text-[13px] font-medium text-text-primary tracking-[0.02em]">My Calendar</span>
          <span className="text-[12px] text-text-muted hidden sm:inline">Schedule Terminal</span>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
              <span className="font-medium text-text-primary">{techWorkOrders.filter(wo => wo.scheduleDate && wo.status !== 'completed').length}</span>
              <span>upcoming</span>
            </div>
          </div>
        </div>

        {/* ── 3-column body ── */}
        <div className="flex" style={{ height: 'calc(100svh - 200px)', minHeight: 500 }}>

          {/* SIDEBAR */}
          <div className={cn(
            'w-[220px] shrink-0 border-r border-border-sub overflow-y-auto bg-bg-secondary py-3',
            mobileTab !== 'sidebar' && 'hidden md:block',
          )}>
            {/* Mini calendar */}
            <div className="px-3 mb-4">
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setMiniCalMonth(m => subMonths(m, 1))}
                  className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors"
                  aria-label="Previous month"
                ><ChevronLeft size={14} /></button>
                <span className="text-[12px] font-medium text-text-primary">{format(miniCalMonth, 'MMMM yyyy')}</span>
                <button
                  onClick={() => setMiniCalMonth(m => addMonths(m, 1))}
                  className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors"
                  aria-label="Next month"
                ><ChevronRight size={14} /></button>
              </div>
              <div className="grid grid-cols-7 text-center mb-0.5">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                  <span key={i} className="text-[9px] text-text-muted py-0.5 font-medium">{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {miniCalDays.map((day, i) => {
                  const hasJobs = techWorkOrders.some(wo => {
                    if (!wo.scheduleDate) return false;
                    try { return isSameDay(parseISO(wo.scheduleDate), day); } catch { return false; }
                  });
                  const isSelected = isSameDay(day, selectedDate);
                  const isCurrentDay = isToday(day);
                  const inMonth = isSameMonth(day, miniCalMonth);
                  return (
                    <button
                      key={i}
                      onClick={() => selectDay(day)}
                      className={cn(
                        'text-[11px] py-0.5 w-full flex items-center justify-center relative cursor-pointer transition-colors rounded',
                        inMonth ? 'text-text-secondary' : 'text-text-muted opacity-40',
                        isCurrentDay && 'bg-brand-red text-white font-medium rounded-full',
                        isSelected && !isCurrentDay && 'outline outline-[1.5px] outline-brand-red/50 rounded',
                        !isCurrentDay && !isSelected && 'hover:bg-bg-primary',
                      )}
                    >
                      {format(day, 'd')}
                      {hasJobs && (
                        <span className={cn(
                          'absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full',
                          isCurrentDay ? 'bg-white' : 'bg-brand-red/60',
                        )} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Week strip */}
            <div className="px-3">
              <p className="text-[10px] font-medium text-text-muted uppercase tracking-[0.08em] mb-1.5 px-1">This week</p>
              <div className="space-y-0.5">
                {weekDays.map((day, i) => {
                  const count = jobCountForDay(day);
                  const isActive = isSameDay(day, selectedDate);
                  return (
                    <button
                      key={i}
                      onClick={() => selectDay(day)}
                      className={cn(
                        'w-full flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-colors',
                        isActive ? 'bg-brand-red/10' : 'hover:bg-bg-primary',
                      )}
                    >
                      <span className={cn('text-[12px]', isActive ? 'text-brand-red font-medium' : 'text-text-secondary')}>
                        {format(day, 'EEE MMM d')}
                      </span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md', isActive ? 'text-brand-red' : 'text-text-muted')}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1 mt-3">
                <button
                  onClick={() => setWeekStart(w => subWeeks(w, 1))}
                  className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors"
                ><ChevronLeft size={13} /></button>
                <button
                  onClick={() => { const w = startOfWeek(new Date(), { weekStartsOn: 1 }); setWeekStart(w); setSelectedDate(new Date()); setMiniCalMonth(new Date()); }}
                  className="flex-1 text-[9px] uppercase tracking-widest font-bold text-text-muted hover:text-text-primary transition-colors text-center py-1 rounded hover:bg-bg-primary"
                >This Week</button>
                <button
                  onClick={() => setWeekStart(w => addWeeks(w, 1))}
                  className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors"
                ><ChevronRight size={13} /></button>
              </div>
            </div>
          </div>

          {/* CENTER: job list */}
          <div className={cn(
            'flex-1 min-w-0 overflow-y-auto bg-bg-primary',
            mobileTab !== 'jobs' && 'hidden md:block',
          )}>
            <div className="sticky top-0 flex items-baseline gap-2 px-4 py-3 border-b border-border-sub bg-bg-primary z-10">
              <span className="text-[18px] font-medium text-text-primary leading-none">
                {format(selectedDate, 'EEEE, MMM d')}
              </span>
              <span className="text-[12px] text-text-muted">
                {jobsForSelectedDate.length} job{jobsForSelectedDate.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="p-3 space-y-2">
              {loading ? (
                <>
                  <Skeleton className="h-20 rounded-lg" />
                  <Skeleton className="h-20 rounded-lg" />
                </>
              ) : jobsForSelectedDate.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-[13px] text-text-muted">No assignments this day</p>
                </div>
              ) : (
                jobsForSelectedDate.map(wo => {
                  const badge = getStatusBadge(wo.status);
                  const isSelected = selectedJobId === wo.id;
                  return (
                    <div
                      key={wo.id}
                      onClick={() => handleSelectJob(wo)}
                      className={cn(
                        'rounded-[10px] border px-3 py-2.5 cursor-pointer transition-all',
                        isSelected
                          ? 'border-brand-red/40 bg-brand-red/5'
                          : 'border-border-sub bg-bg-secondary hover:border-border-main',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className={cn('text-[13px] font-medium leading-tight', isSelected ? 'text-brand-red' : 'text-text-primary')}>
                          {wo.title || wo.description || `#${wo.id.slice(0, 6)}`}
                        </span>
                        <span className={cn('text-[10px] px-2 py-0.5 rounded-md whitespace-nowrap shrink-0 font-medium', badge.cls)}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {wo.scheduleTime && (
                          <span className="flex items-center gap-1 text-[11px] text-text-muted">
                            <Clock size={11} />{wo.scheduleTime}
                          </span>
                        )}
                        {wo.location && (
                          <span className="flex items-center gap-1 text-[11px] text-text-muted">
                            <MapPin size={11} />{wo.location}
                          </span>
                        )}
                        {wo.clientName && (
                          <span className="flex items-center gap-1 text-[11px] text-text-muted">
                            <Building2 size={11} />{wo.clientName}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* MAP PANEL */}
          <div className={cn(
            'w-[320px] shrink-0 border-l border-border-sub flex flex-col overflow-hidden bg-bg-secondary',
            mobileTab !== 'map' && 'hidden md:flex',
          )}>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border-sub shrink-0">
              <span className="text-[11px] text-text-muted flex-1">
                {jobsForSelectedDate.length} job{jobsForSelectedDate.length !== 1 ? 's' : ''} · {format(selectedDate, 'EEE MMM d')}
              </span>
            </div>
            <div className="flex-1 relative overflow-hidden">
              {jobsForSelectedDate.length > 0 ? (
                <MapView
                  jobs={jobsForSelectedDate}
                  selectedJob={drawerJob}
                  onSelectJob={wo => {
                    if (wo) handleSelectJob(wo);
                    else { setDrawerOpen(false); setDrawerJob(null); setSelectedJobId(null); }
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full bg-[#1a1f2e]">
                  <p className="text-[9px] font-bold uppercase text-[#6b7db3] tracking-widest text-center px-4">
                    No jobs on {format(selectedDate, 'EEE, MMM d')}
                  </p>
                </div>
              )}

              {/* Slide-in drawer over map */}
              <div className={cn(
                'absolute inset-y-0 right-0 w-full bg-bg-elevated border-l border-border-sub flex flex-col z-10',
                'transition-transform duration-200 ease-out',
                drawerOpen && drawerJob ? 'translate-x-0' : 'translate-x-full',
              )}>
                {drawerJob && (
                  <>
                    <div className="flex items-start justify-between p-3.5 border-b border-border-sub shrink-0">
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className={cn('text-[10px] px-2 py-0.5 rounded-md font-medium', getStatusBadge(drawerJob.status).cls)}>
                            {getStatusBadge(drawerJob.status).label}
                          </span>
                          {drawerJob.projectType && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-bg-primary text-text-muted border border-border-sub">
                              {drawerJob.projectType}
                            </span>
                          )}
                        </div>
                        <p className="text-[14px] font-medium text-text-primary leading-tight">
                          {drawerJob.title || drawerJob.description || `#${drawerJob.id.slice(0, 6)}`}
                        </p>
                      </div>
                      <button
                        onClick={() => { setDrawerOpen(false); setSelectedJobId(null); setDrawerJob(null); }}
                        className="text-text-muted hover:text-text-primary p-0.5 shrink-0 mt-0.5"
                        aria-label="Close"
                      ><X size={16} /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
                      {drawerJob.clientName && (
                        <div className="flex items-start gap-2.5">
                          <Building2 size={14} className="text-text-muted mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] text-text-muted font-medium uppercase tracking-[0.07em] mb-0.5">Client</p>
                            <p className="text-[12px] text-text-primary">{drawerJob.clientName}</p>
                          </div>
                        </div>
                      )}
                      {drawerJob.location && (
                        <div className="flex items-start gap-2.5">
                          <MapPin size={14} className="text-text-muted mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] text-text-muted font-medium uppercase tracking-[0.07em] mb-0.5">Location</p>
                            <p className="text-[12px] text-text-primary">{drawerJob.location}</p>
                          </div>
                        </div>
                      )}
                      {drawerJob.scheduleTime && (
                        <div className="flex items-start gap-2.5">
                          <Clock size={14} className="text-text-muted mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] text-text-muted font-medium uppercase tracking-[0.07em] mb-0.5">Start Time</p>
                            <p className="text-[12px] text-text-primary">{drawerJob.scheduleDate} at {drawerJob.scheduleTime}</p>
                          </div>
                        </div>
                      )}
                      {drawerJob.pay != null && (
                        <div className="flex items-start gap-2.5">
                          <DollarSign size={14} className="text-text-muted mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] text-text-muted font-medium uppercase tracking-[0.07em] mb-0.5">Pay</p>
                            <p className="text-[12px] text-text-green">${Number(drawerJob.pay).toFixed(2)}</p>
                          </div>
                        </div>
                      )}
                      {(drawerJob as any).priority && (
                        <div className="flex items-start gap-2.5">
                          <Flag size={14} className="text-text-muted mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] text-text-muted font-medium uppercase tracking-[0.07em] mb-0.5">Priority</p>
                            <div className="flex items-center gap-1.5">
                              <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{
                                background: (drawerJob as any).priority === 'high' ? '#E24B4A' : (drawerJob as any).priority === 'medium' ? '#EF9F27' : '#639922',
                              }} />
                              <p className="text-[12px] text-text-primary capitalize">{(drawerJob as any).priority}</p>
                            </div>
                          </div>
                        </div>
                      )}
                      {drawerJob.description && (
                        <div className="border-t border-border-sub pt-3">
                          <p className="text-[10px] text-text-muted font-medium uppercase tracking-[0.07em] mb-1.5">Scope</p>
                          <p className="text-[12px] text-text-secondary leading-relaxed">{drawerJob.description}</p>
                        </div>
                      )}
                    </div>
                    <div className="p-3 border-t border-border-sub shrink-0">
                      <button
                        onClick={() => { setDrawerOpen(false); setSelectedJobId(null); setDrawerJob(null); }}
                        className="w-full py-1.5 text-[12px] rounded-md border border-border-main text-text-secondary hover:text-text-primary transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
