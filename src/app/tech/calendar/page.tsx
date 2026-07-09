'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { WorkOrder } from '@/lib/types';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import {
  ChevronLeft, ChevronRight, Clock, MapPin, DollarSign,
  Building2, Calendar as CalendarIcon, X, Download,
  Check, Play, LogIn, LogOut, CheckCircle2, RotateCcw, ExternalLink,
  Loader2, Maximize2, Minimize2,
} from 'lucide-react';
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, isSameDay, isToday, parseISO,
} from 'date-fns';
import { cn, getTacticalLocation } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const MapView = dynamic(() => import('../map/components/map-view'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-[#1a1f2e] text-[#6b7db3] text-[10px] uppercase tracking-widest">
      Loading map...
    </div>
  ),
});

type JobWithSrc = WorkOrder & { _src: 'workOrder' | 'assignment' };

function getStatusChipCls(status: string) {
  if (status === 'completed' || status === 'checked-out') return 'bg-border-sub/80 text-text-muted border-border-sub';
  if (status === 'in-progress' || status === 'on-my-way') return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
  if (status === 'confirmed') return 'bg-text-green/15 text-text-green border-text-green/30';
  return 'bg-amber-400/15 text-amber-400 border-amber-400/30';
}

function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    assigned: 'Scheduled', confirmed: 'Confirmed', 'on-my-way': 'En Route',
    'in-progress': 'In Progress', 'checked-out': 'Checked Out', completed: 'Completed',
  };
  return map[status] || status;
}

// Non-draggable clickable chip
function CalendarChip({ wo, index, onClick }: { wo: JobWithSrc; index: number; onClick: () => void }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        'flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-tight cursor-pointer select-none truncate border w-full transition-opacity hover:opacity-80',
        getStatusChipCls(wo.status),
      )}
    >
      <span className="shrink-0 w-3.5 h-3.5 rounded-full text-[7px] flex items-center justify-center font-black opacity-60">
        {index + 1}
      </span>
      <span className="truncate ml-0.5">{wo.title || wo.description || wo.id.slice(0, 6)}</span>
    </div>
  );
}

export default function TechCalendarPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [currentTechId, setCurrentTechId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rawAssignments, setRawAssignments] = useState<JobWithSrc[]>([]);
  const [rawWorkOrders, setRawWorkOrders] = useState<JobWithSrc[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [drawerJob, setDrawerJob] = useState<JobWithSrc | null>(null);
  const [mobileTab, setMobileTab] = useState<'calendar' | 'map' | 'list'>('calendar');
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  useEffect(() => {
    const uid = sessionStorage.getItem('currentUserId') || auth.currentUser?.uid || null;
    setCurrentTechId(uid);
  }, []);

  useEffect(() => {
    if (!currentTechId) return;
    const q1 = query(collection(db, 'assignments'), where('techId', '==', currentTechId));
    const u1 = onSnapshot(q1, snap => {
      setRawAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id, _src: 'assignment' } as JobWithSrc)));
      setLoading(false);
    }, () => setLoading(false));

    const q2 = query(collection(db, 'workOrders'), where('assignedTechnicianId', '==', currentTechId));
    const u2 = onSnapshot(q2, snap => {
      setRawWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id, _src: 'workOrder' } as JobWithSrc)));
    });

    return () => { u1(); u2(); };
  }, [currentTechId]);

  // Deduplicate — assignments take precedence
  const allJobs = useMemo<JobWithSrc[]>(() => {
    const seen = new Set<string>();
    const out: JobWithSrc[] = [];
    [...rawAssignments, ...rawWorkOrders].forEach(j => {
      if (j.archived || j.status === 'archived') return;
      if (!seen.has(j.id)) { seen.add(j.id); out.push(j); }
    });
    return out;
  }, [rawAssignments, rawWorkOrders]);

  // Keep drawer in sync with live data
  useEffect(() => {
    if (!drawerJob) return;
    const updated = allJobs.find(j => j.id === drawerJob.id);
    if (updated) setDrawerJob(updated);
  }, [allJobs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calendar grid (Sunday-start)
  const monthDays = useMemo(() => {
    const start = startOfMonth(monthDate);
    const end   = endOfMonth(monthDate);
    const days  = eachDayOfInterval({ start, end });
    const startPad = getDay(start);
    const padBefore = Array.from({ length: startPad }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() - (startPad - i)); return d;
    });
    const endPad = 6 - getDay(end);
    const padAfter = Array.from({ length: endPad }, (_, i) => {
      const d = new Date(end); d.setDate(d.getDate() + i + 1); return d;
    });
    return [...padBefore, ...days, ...padAfter];
  }, [monthDate]);

  const jobsForDate = useCallback((day: Date) =>
    allJobs
      .filter(wo => {
        if (!wo.scheduleDate) return false;
        try { return isSameDay(parseISO(wo.scheduleDate), day); } catch { return false; }
      })
      .sort((a, b) => (a.scheduleTime || '').localeCompare(b.scheduleTime || '')),
    [allJobs]);

  const selectedDateJobs = useMemo(() => jobsForDate(selectedDate), [selectedDate, jobsForDate]);

  const openDrawer = useCallback((wo: JobWithSrc) => {
    setSelectedJobId(wo.id);
    setDrawerJob(wo);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerJob(null);
    setSelectedJobId(null);
  }, []);

  const handleChipClick = useCallback((day: Date, wo: JobWithSrc) => {
    setSelectedDate(day);
    if (drawerJob?.id === wo.id) { closeDrawer(); } else { openDrawer(wo); }
  }, [drawerJob?.id, openDrawer, closeDrawer]);

  const handleSelectDate = (day: Date) => {
    setSelectedDate(day);
    closeDrawer();
  };

  // Tech status actions
  const withLoading = async (fn: () => Promise<void>) => {
    setActionLoading(true);
    try { await fn(); } catch (e: any) {
      toast({ variant: 'destructive', title: 'Action Failed', description: e.message });
    } finally { setActionLoading(false); }
  };

  const statusAction = async (wo: JobWithSrc, newStatus: string, label: string) => {
    const coll = wo._src === 'assignment' ? 'assignments' : 'workOrders';
    const loc = await getTacticalLocation();
    await updateDoc(doc(db, coll, wo.id), {
      status: newStatus,
      history: arrayUnion({
        type: 'status_change',
        date: format(new Date(), 'MM-dd-yyyy'),
        details: `${label} at ${format(new Date(), 'h:mm a')}. Location: [${loc}].`,
        user: currentTechId || 'Field Operative',
      }),
    });
    toast({ title: label });
  };

  const techActions = (wo: JobWithSrc) => [
    { key: 'confirm',   label: 'Confirm',       icon: Check,        show: wo.status === 'assigned',    newStatus: 'confirmed',   cls: 'bg-text-green hover:bg-text-green/90 text-white' },
    { key: 'trip',      label: 'Start Trip',    icon: Play,         show: wo.status === 'confirmed',   newStatus: 'on-my-way',   cls: 'bg-blue-600 hover:bg-blue-600/90 text-white' },
    { key: 'checkin',   label: 'Check In',      icon: LogIn,        show: wo.status === 'on-my-way',   newStatus: 'in-progress', cls: 'bg-text-green hover:bg-text-green/90 text-white' },
    { key: 'checkout',  label: 'Check Out',     icon: LogOut,       show: wo.status === 'in-progress', newStatus: 'checked-out', cls: 'bg-amber-500 hover:bg-amber-500/90 text-white' },
    { key: 'complete',  label: 'Mark Complete', icon: CheckCircle2, show: wo.status === 'checked-out', newStatus: 'completed',   cls: 'bg-text-green hover:bg-text-green/90 text-white' },
    { key: 'reopen',    label: 'Re-open',       icon: RotateCcw,    show: wo.status === 'completed',   newStatus: 'assigned',    cls: 'bg-bg-tertiary hover:bg-bg-primary border border-border-main text-text-secondary' },
  ].filter(a => a.show);

  const handleExportIcs = () => {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const toIcs = (s: string) => {
      try { const d = parseISO(s); return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`; } catch { return ''; }
    };
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aaromach//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    allJobs.filter(j => j.scheduleDate).forEach(wo => {
      const ds = toIcs(wo.scheduleDate);
      if (!ds) return;
      lines.push(
        'BEGIN:VEVENT', `UID:${wo.id}@aaromach.com`,
        `DTSTART;VALUE=DATE:${ds}`, `DTEND;VALUE=DATE:${ds}`,
        `SUMMARY:${(wo.title || wo.description || wo.id).replace(/,/g, '\\,')}`,
        ...(wo.location ? [`LOCATION:${wo.location.replace(/,/g, '\\,')}`] : []),
        'END:VEVENT',
      );
    });
    lines.push('END:VCALENDAR');
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `my-schedule-${format(new Date(), 'yyyy-MM-dd')}.ics` });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Mobile tab bar */}
      <div className="md:hidden flex border-b border-border-sub -mx-4 mb-0">
        {(['calendar', 'map', 'list'] as const).map(t => (
          <button key={t} onClick={() => setMobileTab(t)}
            className={cn('flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors',
              mobileTab === t ? 'border-b-2 border-brand-red text-brand-red' : 'text-text-muted hover:text-text-primary')}>
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-col rounded-xl border border-border-sub bg-bg-secondary overflow-hidden">

        {/* ── Topbar ── */}
        <div className="h-[52px] shrink-0 flex items-center gap-2 px-4 border-b border-border-sub">
          <div className="flex items-center gap-1">
            <button onClick={() => setMonthDate(d => subMonths(d, 1))}
              className="h-7 w-7 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => setMonthDate(d => addMonths(d, 1))}
              className="h-7 w-7 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors">
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => { setMonthDate(new Date()); setSelectedDate(new Date()); }}
              className="h-7 px-2.5 text-[11px] font-bold uppercase tracking-widest rounded border border-border-sub hover:bg-bg-primary text-text-muted hover:text-text-primary transition-colors">
              Today
            </button>
          </div>
          <span className="text-[16px] font-medium text-text-primary ml-1">{format(monthDate, 'MMMM yyyy')}</span>

          <div className="ml-auto flex items-center gap-2">
            <button onClick={handleExportIcs}
              className="h-7 px-2.5 flex items-center gap-1.5 text-[11px] text-text-secondary hover:text-text-primary rounded-md border border-border-sub hover:border-border-main bg-bg-primary transition-colors">
              <Download size={12} /><span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>

        {/* ── Full-width Monthly Calendar ── */}
        <div className={cn('border-b border-border-sub', mobileTab !== 'calendar' && 'hidden md:block')}>
          <div className="grid grid-cols-7 bg-bg-tertiary border-b border-border-sub">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="py-2 text-center text-[9px] font-black uppercase tracking-widest text-text-muted">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 divide-x divide-y divide-border-sub">
            {monthDays.map((day, idx) => {
              const dayJobs   = jobsForDate(day);
              const visible   = dayJobs.slice(0, 3);
              const overflow  = dayJobs.length - 3;
              const inMonth       = day.getMonth() === monthDate.getMonth();
              const isCurrentDay  = isToday(day);
              const isSelectedDay = isSameDay(day, selectedDate);
              return (
                <div
                  key={idx}
                  onClick={() => inMonth && handleSelectDate(day)}
                  className={cn(
                    'min-h-[80px] p-1.5 flex flex-col gap-0.5 transition-colors',
                    inMonth ? 'cursor-pointer' : 'opacity-25 pointer-events-none',
                    inMonth && !isCurrentDay && !isSelectedDay && 'hover:bg-bg-tertiary',
                    isCurrentDay && 'bg-brand-red/5',
                    isSelectedDay && !isCurrentDay && 'bg-bg-tertiary ring-1 ring-inset ring-brand-red/30',
                  )}
                >
                  <span className={cn(
                    'self-start text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full mb-0.5 pointer-events-none leading-none',
                    isCurrentDay  && 'bg-brand-red text-white',
                    !isCurrentDay && isSelectedDay  && 'text-brand-red',
                    !isCurrentDay && !isSelectedDay && 'text-text-muted',
                  )}>{format(day, 'd')}</span>
                  {visible.map((wo, i) => (
                    <CalendarChip
                      key={wo.id}
                      wo={wo}
                      index={i}
                      onClick={() => handleChipClick(day, wo)}
                    />
                  ))}
                  {overflow > 0 && (
                    <span className="text-[8px] font-bold text-text-muted pl-0.5 pointer-events-none">
                      +{overflow} more
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Legend ── */}
        <div className="flex items-center gap-4 px-4 py-2 border-b border-border-sub shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-text-green" />
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Active</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Scheduled</span>
          </div>
          <span className="ml-auto text-[10px] text-text-muted font-medium">
            {format(selectedDate, 'EEE, MMM d')} · {selectedDateJobs.length} job{selectedDateJobs.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── Below section: Map + Job List + Drawer ── */}
        <div className="flex overflow-hidden" style={{ height: 420 }}>

          {/* LEFT: Map */}
          <div className={cn(
            'shrink-0 border-r border-border-sub flex flex-col overflow-hidden transition-all duration-300',
            mobileTab === 'map' ? 'flex-1 w-full' : (mobileTab !== 'calendar' ? 'hidden md:flex' : 'hidden md:flex'),
            isMapExpanded ? 'md:w-[600px]' : 'md:w-[360px]',
          )}>
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-sub shrink-0">
              <MapPin size={10} className="text-brand-red" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex-1">
                {format(selectedDate, 'EEE, MMM d')} — {selectedDateJobs.length} job{selectedDateJobs.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setIsMapExpanded(v => !v)}
                className="text-text-muted hover:text-text-primary transition-colors"
                title={isMapExpanded ? 'Collapse map' : 'Expand map'}
              >
                {isMapExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              </button>
            </div>
            <div className="flex-1 relative overflow-hidden">
              {selectedDateJobs.length > 0 ? (
                <MapView
                  jobs={selectedDateJobs}
                  selectedJob={drawerJob}
                  onSelectJob={(wo) => { if (wo) openDrawer(wo as JobWithSrc); else closeDrawer(); }}
                />
              ) : (
                <div className="flex items-center justify-center h-full bg-[#1a1f2e]">
                  <p className="text-[9px] font-bold uppercase text-[#6b7db3] tracking-widest text-center px-4">
                    No jobs on {format(selectedDate, 'EEE, MMM d')}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* CENTER: Job list */}
          <div className={cn(
            'flex-1 min-w-0 flex flex-col overflow-hidden',
            mobileTab === 'list' ? 'w-full' : (mobileTab !== 'calendar' ? 'hidden md:flex' : 'hidden md:flex'),
            drawerJob && 'border-r border-border-sub',
            isMapExpanded && 'md:max-w-[380px]',
          )}>
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-sub shrink-0">
              <span className="text-[11px] font-medium text-text-primary flex-1">
                Jobs for <span className="font-bold">{format(selectedDate, 'EEE, MMM d, yyyy')}</span>
              </span>
              <span className="text-[9px] font-bold text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded border border-border-sub">
                {selectedDateJobs.length} Jobs
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-[72px] rounded-lg bg-bg-tertiary animate-pulse" />
                ))
              ) : selectedDateJobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <CalendarIcon size={24} className="text-text-muted opacity-20" />
                  <p className="text-[11px] text-text-muted">No jobs scheduled for this day</p>
                </div>
              ) : (
                selectedDateJobs.map((wo, idx) => {
                  const isSelected = selectedJobId === wo.id;
                  return (
                    <div
                      key={wo.id}
                      onClick={() => { if (drawerJob?.id === wo.id) closeDrawer(); else openDrawer(wo); }}
                      className={cn(
                        'rounded-lg border px-3 py-2.5 cursor-pointer transition-all',
                        isSelected
                          ? 'border-brand-red/40 bg-brand-red/5'
                          : 'border-border-sub bg-bg-secondary hover:border-border-main hover:bg-bg-tertiary',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span
                            className="shrink-0 w-5 h-5 rounded-full text-[9px] font-black text-white flex items-center justify-center leading-none"
                            style={{ background: wo.status === 'completed' ? '#6b7db3' : wo.status === 'in-progress' || wo.status === 'confirmed' || wo.status === 'on-my-way' ? '#22c55e' : '#EF9F27' }}
                          >{idx + 1}</span>
                          <span className={cn('text-[12px] font-medium truncate', isSelected ? 'text-brand-red' : 'text-text-primary')}>
                            {wo.title || wo.description || `#${wo.id.slice(0, 6)}`}
                          </span>
                        </div>
                        <span className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded border whitespace-nowrap shrink-0 font-bold uppercase tracking-wider',
                          getStatusChipCls(wo.status),
                        )}>{getStatusLabel(wo.status)}</span>
                      </div>
                      {wo.clientName && (
                        <p className="text-[10px] text-text-muted mb-0.5 flex items-center gap-1 truncate">
                          <Building2 size={9} className="shrink-0" />{wo.clientName}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 text-[9px] text-text-muted">
                        {wo.scheduleTime && (
                          <span className="flex items-center gap-1">
                            <Clock size={9} />{wo.scheduleTime}
                          </span>
                        )}
                        {wo.location && (
                          <span className="flex items-center gap-1 min-w-0">
                            <MapPin size={9} className="shrink-0" />
                            <span className="truncate">{wo.location}</span>
                          </span>
                        )}
                        {wo.pay != null && (
                          <span className="flex items-center gap-1 font-mono font-bold text-text-green">
                            <DollarSign size={9} />{Number(wo.pay).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT: Job detail drawer */}
          {drawerJob && (
            <div className="w-[340px] shrink-0 flex flex-col overflow-hidden bg-bg-elevated">
              {/* Header */}
              <div className="flex items-start justify-between p-3.5 border-b border-border-sub shrink-0">
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className={cn(
                      'text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-widest',
                      getStatusChipCls(drawerJob.status),
                    )}>{getStatusLabel(drawerJob.status)}</span>
                    <span className="text-[9px] text-text-muted font-mono uppercase">
                      {(drawerJob as any).workOrderId || `#${drawerJob.id.slice(0, 10).toUpperCase()}`}
                    </span>
                  </div>
                  <p className="text-[13px] font-medium text-text-primary leading-tight">
                    {drawerJob.title || drawerJob.description || `#${drawerJob.id.slice(0, 6)}`}
                  </p>
                </div>
                <button onClick={closeDrawer} className="text-text-muted hover:text-text-primary p-0.5 shrink-0 transition-colors">
                  <X size={15} />
                </button>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto">
                <div className="p-3.5 space-y-3 divide-y divide-border-sub">
                  {drawerJob.clientName && (
                    <div className="pb-3">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">Client</p>
                      <p className="text-[12px] text-text-primary font-medium">{drawerJob.clientName}</p>
                    </div>
                  )}
                  {drawerJob.location && (
                    <div className="py-3">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">Location</p>
                      <p className="text-[12px] text-text-primary flex items-start gap-1.5">
                        <MapPin size={11} className="text-brand-red shrink-0 mt-0.5" />
                        {drawerJob.location}
                      </p>
                    </div>
                  )}
                  {(drawerJob.scheduleDate || drawerJob.scheduleTime) && (
                    <div className="py-3">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">Schedule</p>
                      <p className="text-[12px] text-text-primary flex items-center gap-1.5">
                        <Clock size={11} className="text-text-muted shrink-0" />
                        {drawerJob.scheduleDate && format(parseISO(drawerJob.scheduleDate), 'EEE, MMM d')}
                        {drawerJob.scheduleTime && ` at ${drawerJob.scheduleTime}`}
                      </p>
                    </div>
                  )}
                  {drawerJob.pay != null && (
                    <div className="py-3 flex items-center gap-5">
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-0.5">Pay</p>
                        <p className="text-[16px] font-mono font-bold text-text-green">${Number(drawerJob.pay).toFixed(2)}</p>
                      </div>
                      {drawerJob.payType && (
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-0.5">Type</p>
                          <p className="text-[11px] text-text-secondary capitalize">{drawerJob.payType}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {drawerJob.description && (
                    <div className="py-3">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">Scope</p>
                      <p className="text-[11px] text-text-secondary leading-relaxed">{drawerJob.description}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer: tech action buttons */}
              <div className="p-3 border-t border-border-sub flex flex-col gap-2 shrink-0">
                {/* Open full detail */}
                <Button
                  className="w-full h-9 text-[11px] font-bold uppercase tracking-widest bg-bg-tertiary border border-border-main text-text-secondary hover:bg-bg-primary hover:text-text-primary transition-all"
                  onClick={() => router.push('/tech/assignments/' + drawerJob.id)}
                >
                  <ExternalLink size={13} className="mr-1.5" />
                  Open Full Detail
                </Button>

                {/* Status action buttons */}
                {techActions(drawerJob).map(action => {
                  const Icon = action.icon;
                  return (
                    <Button
                      key={action.key}
                      className={cn('w-full h-9 text-[11px] font-bold uppercase tracking-widest', action.cls)}
                      disabled={actionLoading}
                      onClick={() => withLoading(() => statusAction(drawerJob, action.newStatus, action.label))}
                    >
                      {actionLoading
                        ? <Loader2 size={13} className="animate-spin mr-1.5" />
                        : <Icon size={13} className="mr-1.5" />}
                      {action.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
