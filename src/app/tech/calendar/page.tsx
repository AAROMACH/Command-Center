'use client';

import { subscribeTechAssignments } from '@/lib/tech-assignments';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { WorkOrder, Technician } from '@/lib/types';
import { displayWorkOrderNumber } from '@/lib/work-order-identity';
import { isArchivedJob, isAssignedTo, parseLocalDate } from '@/lib/jobs';
import { removeJobFromDraftLogs } from '@/lib/weekly-log';
import { useTechJobActions } from '@/hooks/use-tech-job-actions';
import { ACTION_FOR_STATUS, type TechJobAction } from '@/lib/tech-job-actions';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import {
  ChevronLeft, ChevronRight, Clock, MapPin, DollarSign,
  Building2, Calendar as CalendarIcon, X, Download,
  Check, Play, LogIn, LogOut, CheckCircle2, RotateCcw, ExternalLink,
  Loader2, Maximize2, Minimize2, Route as RouteIcon,
} from 'lucide-react';
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, isSameDay, isToday, addDays, startOfWeek,
} from 'date-fns';
import { cn, techDisplayName, getTacticalLocation, geocodeAddress, sumRouteMileage, compareScheduleTime, calculateDistance, formatDistance } from '@/lib/utils';
import { canConfirm, canStartTrip, canCheckIn, canCheckOut, canComplete } from '@/lib/trip-flow';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { statusTone, TONE_DOT, TONE_HEX, type Tone } from '@/lib/status-styles';

const MapView = dynamic(() => import('../map/components/map-view'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-bg-tertiary text-text-muted text-[12px]">
      Loading map…
    </div>
  ),
});

type JobWithSrc = WorkOrder & { _src: 'workOrder' | 'assignment' };

// Calendar chip colors follow the shared status map (lib/status-styles.ts).
const CHIP_CLS: Record<Tone, string> = {
  done: 'bg-green-dim text-text-green border-green-border',
  progress: 'bg-accent-gold-dim text-accent-gold border-accent-gold/40',
  scheduled: 'bg-bg-tertiary text-text-secondary border-border-sub',
  problem: 'bg-brand-red-dim text-text-red border-border-red',
  info: 'bg-brand-blue/10 text-brand-blue border-brand-blue/30',
  neutral: 'bg-bg-tertiary text-text-muted border-border-sub',
};
function getStatusChipCls(status: string) {
  return CHIP_CLS[statusTone('job', status)];
}

function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    assigned: 'Scheduled', confirmed: 'Confirmed', 'on-my-way': 'On my way',
    'in-progress': 'In progress', 'checked-out': 'Checked out', completed: 'Completed',
  };
  return map[status] || status;
}

type RoutePreference = 'optimized' | 'by-time' | 'by-mileage';

/**
 * Orders a day's jobs per the tech's Route Preference setting (Settings ->
 * Work Preferences). Jobs without resolved coordinates can't be placed
 * geographically, so they're always time-sorted and appended at the end.
 */
function orderJobsByPreference<T extends WorkOrder>(
  jobs: T[],
  preference: RoutePreference,
  home: { lat: number; lng: number } | null,
): T[] {
  const byTime = (a: T, b: T) => compareScheduleTime(a.scheduleTime, b.scheduleTime);
  if (preference === 'by-time' || !home) return [...jobs].sort(byTime);

  const withCoords = jobs.filter((j): j is T & { lat: number; lng: number } => typeof j.lat === 'number' && typeof j.lng === 'number');
  const withoutCoords = jobs.filter(j => !(typeof j.lat === 'number' && typeof j.lng === 'number')).sort(byTime);

  if (preference === 'by-mileage') {
    const sorted = [...withCoords].sort((a, b) =>
      calculateDistance(home.lat, home.lng, a.lat, a.lng) - calculateDistance(home.lat, home.lng, b.lat, b.lng));
    return [...sorted, ...withoutCoords];
  }

  // 'optimized' — greedy nearest-neighbor chain starting from home.
  const remaining = [...withCoords];
  const route: T[] = [];
  let cur = home;
  while (remaining.length) {
    let bestIdx = 0, bestDist = Infinity;
    remaining.forEach((j, i) => {
      const d = calculateDistance(cur.lat, cur.lng, j.lat, j.lng);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    });
    const [next] = remaining.splice(bestIdx, 1);
    route.push(next);
    cur = { lat: next.lat, lng: next.lng };
  }
  return [...route, ...withoutCoords];
}

// Non-draggable clickable chip
function CalendarChip({ wo, index, onClick }: { wo: JobWithSrc; index: number; onClick: () => void }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        'flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium cursor-pointer select-none truncate border w-full transition-opacity hover:opacity-80',
        getStatusChipCls(wo.status),
      )}
    >
      <span className="shrink-0 w-3.5 h-3.5 rounded-full text-[10px] flex items-center justify-center font-semibold opacity-70">
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
  // Phones skip the month grid: a day picker, then the day's list or map.
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list');
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  const [currentTech, setCurrentTech] = useState<Technician | null>(null);
  const { run: runAction, weekDialog } = useTechJobActions(currentTechId, techDisplayName(currentTech));
  const [homeCoords, setHomeCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [routeMileage, setRouteMileage] = useState<number | null>(null);
  const [mileageLoading, setMileageLoading] = useState(false);

  useEffect(() => {
    const uid = sessionStorage.getItem('currentUserId') || auth.currentUser?.uid || null;
    setCurrentTechId(uid);
  }, []);

  useEffect(() => {
    if (!currentTechId) return;
    // Jobs they lead + jobs they help on (archived never resurface).
    const u1 = subscribeTechAssignments(currentTechId, jobs => {
      setRawAssignments(jobs.map(j => ({ ...j, _src: 'assignment' } as JobWithSrc)));
      setLoading(false);
    }, () => setLoading(false));

    const q2 = query(collection(db, 'workOrders'), where('assignedTechnicianId', '==', currentTechId));
    const u2 = onSnapshot(q2, snap => {
      setRawWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id, _src: 'workOrder' } as JobWithSrc)).filter(wo => !isArchivedJob(wo) && isAssignedTo(wo, currentTechId)));
    });

    const u3 = onSnapshot(doc(db, 'users', currentTechId), snap => {
      setCurrentTech(snap.exists() ? ({ ...snap.data(), id: snap.id } as Technician) : null);
    });

    return () => { u1(); u2(); u3(); };
  }, [currentTechId]);

  // Resolve the tech's home address to coordinates once per address value —
  // every day's route starts and ends there.
  useEffect(() => {
    const address = currentTech?.address;
    if (!address) { setHomeCoords(null); return; }
    let cancelled = false;
    geocodeAddress(address).then(coords => { if (!cancelled) setHomeCoords(coords); });
    return () => { cancelled = true; };
  }, [currentTech?.address]);

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

  const routePreference: RoutePreference = currentTech?.routePreference || 'by-time';

  const jobsForDate = useCallback((day: Date) =>
    orderJobsByPreference(
      allJobs.filter(wo => {
        if (!wo.scheduleDate) return false;
        const d = parseLocalDate(wo.scheduleDate); return !!d && isSameDay(d, day);
      }),
      routePreference,
      homeCoords,
    ),
    [allJobs, routePreference, homeCoords]);

  const selectedDateJobs = useMemo(() => jobsForDate(selectedDate), [selectedDate, jobsForDate]);

  // Route mileage for the selected day: home -> stop 1 -> ... -> stop N -> home.
  // Jobs already carry resolved lat/lng from the schedule map fix; anything
  // missing coords gets geocoded from its address on the fly.
  useEffect(() => {
    if (!homeCoords || selectedDateJobs.length === 0) { setRouteMileage(null); return; }
    let cancelled = false;
    setMileageLoading(true);
    (async () => {
      const stops: { lat: number; lng: number }[] = [];
      for (const job of selectedDateJobs) {
        if (typeof job.lat === 'number' && typeof job.lng === 'number') {
          stops.push({ lat: job.lat, lng: job.lng });
          continue;
        }
        const address = job.location || (job as any).locationText;
        if (address) {
          const coords = await geocodeAddress(address);
          if (coords) stops.push(coords);
        }
      }
      if (cancelled) return;
      setRouteMileage(stops.length > 0 ? sumRouteMileage(homeCoords, stops) : null);
      setMileageLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedDateJobs, homeCoords]);

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
  const pickDay = (day: Date) => { handleSelectDate(day); setMonthDate(day); };

  // Tech status actions
  const withLoading = async (fn: () => Promise<void>) => {
    setActionLoading(true);
    try { await fn(); } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not update job', description: e.message });
    } finally { setActionLoading(false); }
  };

  // Same shared workflow as the dashboard, assignments list and detail page
  // (lib/tech-job-actions.ts): trip records, history, weekly-log filing.
  // Re-open returns the job to the step before completion, like everywhere else.
  const statusAction = async (wo: JobWithSrc, newStatus: string, _label: string) => {
    const action: TechJobAction | undefined =
      newStatus === 'assigned' ? 'reopen' : ACTION_FOR_STATUS[newStatus as WorkOrder['status']];
    if (action) await runAction(wo, action);
  };

  const techActions = (wo: JobWithSrc) => [
    { key: 'confirm',   label: 'Confirm',       icon: Check,        show: canConfirm(wo),   newStatus: 'confirmed',   cls: 'bg-text-green hover:bg-text-green/90 text-white' },
    { key: 'trip',      label: 'Start trip',    icon: Play,         show: canStartTrip(wo), newStatus: 'on-my-way',   cls: 'bg-brand-blue hover:bg-brand-blue/90 text-white' },
    { key: 'checkin',   label: 'Check in',      icon: LogIn,        show: canCheckIn(wo),   newStatus: 'in-progress', cls: 'bg-text-green hover:bg-text-green/90 text-white' },
    { key: 'checkout',  label: 'Check out',     icon: LogOut,       show: canCheckOut(wo),  newStatus: 'checked-out', cls: 'bg-accent-gold hover:bg-accent-gold/90 text-white' },
    { key: 'complete',  label: 'Mark complete', icon: CheckCircle2, show: canComplete(wo),  newStatus: 'completed',   cls: 'bg-text-green hover:bg-text-green/90 text-white' },
    { key: 'reopen',    label: 'Re-open',       icon: RotateCcw,    show: wo.status === 'completed',   newStatus: 'assigned',    cls: 'bg-bg-tertiary hover:bg-bg-primary border border-border-main text-text-secondary' },
  ].filter(a => a.show);

  const handleExportIcs = () => {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const toIcs = (s: string) => {
      const d = parseLocalDate(s); return d ? `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` : '';
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
      <PageHeader
        eyebrow="Schedule"
        icon={CalendarIcon}
        title="My schedule"
        subtitle="Your jobs by day, with the day's route on a map."
        actions={
          <Button variant="outline" onClick={handleExportIcs} className="h-10 sm:h-9">
            <Download size={14} className="mr-1.5" /> Export to calendar
          </Button>
        }
      />

      <div className="flex flex-col rounded-xl border border-border-main bg-bg-secondary shadow-sm overflow-hidden">

        {/* ── Topbar ── */}
        <div className="hidden md:flex min-h-[52px] shrink-0 items-center gap-2 px-3 sm:px-4 py-1.5 border-b border-border-sub">
          <div className="flex items-center gap-1">
            <button onClick={() => setMonthDate(d => subMonths(d, 1))} aria-label="Previous month"
              className="h-10 w-10 sm:h-8 sm:w-8 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => setMonthDate(d => addMonths(d, 1))} aria-label="Next month"
              className="h-10 w-10 sm:h-8 sm:w-8 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors">
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => { setMonthDate(new Date()); setSelectedDate(new Date()); }}
              className="h-10 sm:h-8 px-3 text-[12px] font-medium rounded-md border border-border-main hover:bg-bg-primary text-text-secondary hover:text-text-primary transition-colors">
              Today
            </button>
          </div>
          <span className="text-[15px] sm:text-[16px] font-semibold text-text-primary ml-1">{format(monthDate, 'MMMM yyyy')}</span>
        </div>

        {/* ── Phones: day picker (week strip) ── */}
        <div className="md:hidden border-b border-border-sub px-3 py-2.5 space-y-2.5">
          <div className="flex items-center gap-1">
            <button onClick={() => pickDay(addDays(selectedDate, -1))} aria-label="Previous day"
              className="h-10 w-10 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="flex-1 text-center text-[15px] font-semibold text-text-primary">
              {isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEE, MMM d')}
            </span>
            <button onClick={() => pickDay(addDays(selectedDate, 1))} aria-label="Next day"
              className="h-10 w-10 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors">
              <ChevronRight size={16} />
            </button>
            {!isToday(selectedDate) && (
              <button onClick={() => pickDay(new Date())}
                className="h-10 px-3 text-[12px] font-medium rounded-md border border-border-main text-text-secondary hover:text-text-primary transition-colors">
                Today
              </button>
            )}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(selectedDate), i)).map(day => {
              const n = jobsForDate(day).length;
              const sel = isSameDay(day, selectedDate);
              return (
                <button key={day.toISOString()} type="button" onClick={() => pickDay(day)}
                  aria-label={`${format(day, 'EEEE, MMM d')}: ${n} job${n === 1 ? '' : 's'}`}
                  aria-pressed={sel}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-lg py-1.5 transition-colors',
                    sel ? 'bg-brand-red text-white' : 'text-text-secondary hover:bg-bg-tertiary',
                    !sel && isToday(day) && 'text-brand-red',
                  )}>
                  <span className="text-[10px] font-medium uppercase">{format(day, 'EEEEE')}</span>
                  <span className="text-[14px] font-semibold leading-none">{format(day, 'd')}</span>
                  <span className={cn('h-1.5 w-1.5 rounded-full', n ? (sel ? 'bg-white' : 'bg-brand-red') : 'bg-transparent')} />
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Full-width Monthly Calendar (md and up) ── */}
        <div className="hidden md:block border-b border-border-sub">
          <div className="grid grid-cols-7 bg-bg-tertiary border-b border-border-sub">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-text-muted">{d}</div>
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
                    'self-start text-[11px] font-semibold w-5 h-5 flex items-center justify-center rounded-full mb-0.5 pointer-events-none leading-none',
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
                    <span className="text-[10px] font-medium text-text-muted pl-0.5 pointer-events-none">
                      +{overflow} more
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Legend ── */}
        <div className={cn("flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2 border-b border-border-sub shrink-0 [&>.legend-key]:hidden md:[&>.legend-key]:flex", selectedDateJobs.length ? "flex" : "hidden md:flex")}>
          {([['scheduled', 'Scheduled'], ['info', 'Confirmed / on my way'], ['progress', 'In progress'], ['done', 'Done']] as const).map(([tone, label]) => (
            <div key={tone} className="legend-key items-center gap-1.5">
              <span className={cn('w-2 h-2 rounded-full', TONE_DOT[tone])} />
              <span className="text-[11px] text-text-muted">{label}</span>
            </div>
          ))}
          {selectedDateJobs.length > 0 && (
            <div className="flex items-center gap-1.5 pl-3 border-l border-border-sub" title={`Round-trip mileage from your home address, through each job (ordered by your "${routePreference.replace('-', ' ')}" route preference), and back`}>
              <RouteIcon size={11} className="text-brand-red" />
              {!currentTech?.address ? (
                <span className="text-[11px] text-text-muted">Add your home address in Profile to see route mileage</span>
              ) : mileageLoading ? (
                <span className="text-[11px] text-text-muted">Calculating route…</span>
              ) : routeMileage !== null ? (
                <span className="text-[11px] font-medium text-text-primary">
                  {formatDistance(routeMileage, currentTech?.mileageUnit || 'mi')} round trip · home to home
                </span>
              ) : (
                <span className="text-[11px] text-text-muted">Route mileage unavailable</span>
              )}
            </div>
          )}
          <span className="hidden md:inline ml-auto text-[11px] text-text-muted font-medium">
            {format(selectedDate, 'EEE, MMM d')} · {selectedDateJobs.length} job{selectedDateJobs.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Phones: switch the day section between its job list and map */}
        <div className="tabs md:hidden flex-nowrap px-3 pt-3" role="tablist">
          {([['list', 'Day list'], ['map', 'Map']] as const).map(([t, label]) => (
            <button key={t} type="button" role="tab" aria-selected={mobileTab === t} onClick={() => setMobileTab(t)}
              className={cn('tab flex-1 text-center', mobileTab === t && 'active')}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Below section: Map + Job List + Drawer ── */}
        <div className="flex overflow-hidden md:h-[420px]">

          {/* LEFT: Map */}
          <div className={cn(
            'shrink-0 border-r border-border-sub flex flex-col overflow-hidden transition-all duration-300',
            mobileTab === 'map' ? 'flex-1 w-full h-[360px] md:h-auto' : 'hidden md:flex',
            isMapExpanded ? 'md:w-[600px]' : 'md:w-[360px]',
          )}>
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-sub shrink-0">
              <MapPin size={12} className="text-brand-red" />
              <span className="text-[12px] font-medium text-text-muted flex-1">
                {format(selectedDate, 'EEE, MMM d')} — {selectedDateJobs.length} job{selectedDateJobs.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setIsMapExpanded(v => !v)}
                className="hidden md:flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:text-text-primary transition-colors"
                title={isMapExpanded ? 'Collapse map' : 'Expand map'}
                aria-label={isMapExpanded ? 'Collapse map' : 'Expand map'}
              >
                {isMapExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
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
                <div className="flex items-center justify-center h-full bg-bg-tertiary">
                  <p className="text-[12px] text-text-muted text-center px-4">
                    No jobs on {format(selectedDate, 'EEE, MMM d')}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* CENTER: Job list */}
          <div className={cn(
            'flex-1 min-w-0 flex flex-col overflow-hidden',
            mobileTab === 'list' ? 'w-full' : 'hidden md:flex',
            drawerJob && 'border-r border-border-sub',
            isMapExpanded && 'md:max-w-[380px]',
          )}>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border-sub shrink-0">
              <span className="text-[12px] font-medium text-text-primary flex-1">
                Jobs for <span className="font-semibold">{format(selectedDate, 'EEE, MMM d, yyyy')}</span>
              </span>
              <span className="text-[11px] font-medium text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded-full border border-border-sub">
                {selectedDateJobs.length} {selectedDateJobs.length === 1 ? 'job' : 'jobs'}
              </span>
            </div>
            <div className="flex-1 md:overflow-y-auto p-2 space-y-1.5">
              {loading ? (
                <LoadingState label="Loading your jobs…" rows={3} />
              ) : selectedDateJobs.length === 0 ? (
                <EmptyState compact icon={CalendarIcon} title="No jobs this day" description="Pick another day." className="h-full border-0" />
              ) : (
                selectedDateJobs.map((wo, idx) => {
                  const isSelected = selectedJobId === wo.id;
                  return (
                    <div
                      key={wo.id}
                      onClick={() => { if (drawerJob?.id === wo.id) closeDrawer(); else openDrawer(wo); }}
                      className={cn(
                        'rounded-xl border px-3 py-2.5 cursor-pointer transition-all',
                        isSelected
                          ? 'border-brand-red/40 bg-brand-red/5'
                          : 'border-border-sub bg-bg-secondary hover:border-border-main hover:bg-bg-tertiary',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span
                            className="shrink-0 w-5 h-5 rounded-full text-[11px] font-bold text-white flex items-center justify-center leading-none"
                            style={{ background: TONE_HEX[statusTone('job', wo.status)] }}
                          >{idx + 1}</span>
                          <span className={cn('text-[13px] font-semibold truncate', isSelected ? 'text-brand-red' : 'text-text-primary')}>
                            {wo.title || wo.description || `#${wo.id.slice(0, 6)}`}
                          </span>
                        </div>
                        <StatusBadge kind="job" value={wo.status} label={getStatusLabel(wo.status)} className="shrink-0" />
                      </div>
                      {wo.clientName && (
                        <p className="text-[12px] text-text-muted mb-0.5 flex items-center gap-1 truncate">
                          <Building2 size={12} className="shrink-0" />{wo.clientName}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-text-muted">
                        {wo.scheduleTime && (
                          <span className="flex items-center gap-1">
                            <Clock size={12} />{wo.scheduleTime}
                          </span>
                        )}
                        {wo.location && (
                          <span className="flex items-center gap-1 min-w-0">
                            <MapPin size={12} className="shrink-0" />
                            <span className="truncate">{wo.location}</span>
                          </span>
                        )}
                        {wo.pay != null && (
                          <span className="flex items-center gap-1 font-mono font-semibold text-text-green">
                            <DollarSign size={12} />{Number(wo.pay).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT: Job detail drawer — full-screen overlay on phones, inline panel from md up */}
          {drawerJob && (
            <div className="fixed inset-0 z-50 w-full md:static md:inset-auto md:z-auto md:w-[340px] md:shrink-0 flex flex-col overflow-hidden bg-bg-elevated border-l border-border-sub md:border-l-0">
              {/* Header */}
              <div className="flex items-start justify-between p-3.5 border-b border-border-sub shrink-0">
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <StatusBadge kind="job" value={drawerJob.status} label={getStatusLabel(drawerJob.status)} />
                    <span className="text-[11px] text-text-muted font-mono">
                      {displayWorkOrderNumber(drawerJob)}
                    </span>
                  </div>
                  <p className="text-[15px] font-semibold text-text-primary leading-tight">
                    {drawerJob.title || drawerJob.description || `#${drawerJob.id.slice(0, 6)}`}
                  </p>
                </div>
                <button onClick={closeDrawer} aria-label="Close" className="flex h-10 w-10 -mr-2 -mt-2 items-center justify-center rounded-md text-text-muted hover:text-text-primary shrink-0 transition-colors">
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto">
                <div className="p-3.5 space-y-3 divide-y divide-border-sub">
                  {drawerJob.clientName && (
                    <div className="pb-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Client</p>
                      <p className="text-[13px] text-text-primary font-medium">{drawerJob.clientName}</p>
                    </div>
                  )}
                  {drawerJob.location && (
                    <div className="py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Location</p>
                      <p className="text-[12px] text-text-primary flex items-start gap-1.5">
                        <MapPin size={11} className="text-brand-red shrink-0 mt-0.5" />
                        {drawerJob.location}
                      </p>
                    </div>
                  )}
                  {(drawerJob.scheduleDate || drawerJob.scheduleTime) && (
                    <div className="py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Schedule</p>
                      <p className="text-[12px] text-text-primary flex items-center gap-1.5">
                        <Clock size={11} className="text-text-muted shrink-0" />
                        {parseLocalDate(drawerJob.scheduleDate) && format(parseLocalDate(drawerJob.scheduleDate)!, 'EEE, MMM d')}
                        {drawerJob.scheduleTime && ` at ${drawerJob.scheduleTime}`}
                      </p>
                    </div>
                  )}
                  {drawerJob.pay != null && (
                    <div className="py-3 flex items-center gap-5">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-0.5">Pay</p>
                        <p className="text-[16px] font-mono font-bold text-text-green">${Number(drawerJob.pay).toFixed(2)}</p>
                      </div>
                      {drawerJob.payType && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-0.5">Type</p>
                          <p className="text-[12px] text-text-secondary capitalize">{drawerJob.payType}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {drawerJob.description && (
                    <div className="py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Scope</p>
                      <p className="text-[12px] text-text-secondary leading-relaxed">{drawerJob.description}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer: tech action buttons */}
              <div className="p-3 border-t border-border-sub flex flex-col gap-2 shrink-0">
                {/* Open full detail */}
                <Button
                  className="w-full h-10 bg-bg-tertiary border border-border-main text-text-secondary hover:bg-bg-primary hover:text-text-primary transition-all"
                  onClick={() => router.push('/tech/assignments/' + drawerJob.id)}
                >
                  <ExternalLink size={14} className="mr-1.5" />
                  Open job
                </Button>

                {/* Status action buttons */}
                {techActions(drawerJob).map(action => {
                  const Icon = action.icon;
                  return (
                    <Button
                      key={action.key}
                      className={cn('w-full h-10', action.cls)}
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
      {weekDialog}
    </>
  );
}
