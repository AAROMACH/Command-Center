'use client';
import { onSharedSnapshot } from '@/lib/shared-snapshot';
import { statusTone, TONE_BADGE, TONE_DOT } from '@/lib/status-styles';

import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { mergeJobs } from '@/lib/jobs';
import type { WorkOrder } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  MapPin,
  Navigation,
  Calendar,
  Clock,
  ChevronRight,
  AlertCircle,
  Map as MapIcon,
  User,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react';
import Link from 'next/link';
import { format, addDays, subDays, isToday, parseISO } from 'date-fns';
import { cn, compareScheduleTime } from '@/lib/utils';

const AdminMapView = dynamic(() => import('./components/admin-map-view'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-bg-secondary rounded-lg border border-border-main">
      <div className="text-center space-y-3">
        <MapIcon size={32} className="mx-auto text-text-muted animate-pulse" />
        <p className="text-xs text-text-muted font-bold">Loading map…</p>
      </div>
    </div>
  ),
});

const STATUS_ORDER: Record<string, number> = {
  'in-progress': 0, 'on-my-way': 1, 'confirmed': 2, 'assigned': 3, 'scheduled': 4, 'completed': 5,
};

function getStatusVariant(status: string): any {
  return TONE_BADGE[statusTone('job', status)];
}

function getAccentColor(status: string) {
  return TONE_DOT[statusTone('job', status)];
}

function toISODate(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

export default function AdminMapPage() {
  const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(toISODate(new Date()));
  const [mobileTab, setMobileTab] = useState<'map' | 'jobs'>('map');

  // Both the unassigned pool and dispatched jobs — this used to read the pool
  // only, so every job assigned to a tech was missing from the map.
  const [pool, setPool] = useState<WorkOrder[]>([]);
  const [dispatched, setDispatched] = useState<WorkOrder[]>([]);
  useEffect(() => {
    let left = 2;
    const done = () => { if (--left <= 0) setLoading(false); };
    const u1 = onSharedSnapshot('workOrders', (snap) => {
      setPool(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder))); done();
    }, done);
    const u2 = onSharedSnapshot('assignments', (snap) => {
      setDispatched(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder))); done();
    }, done);
    return () => { u1(); u2(); };
  }, []);
  useEffect(() => { setAllWorkOrders(mergeJobs(pool, dispatched) as WorkOrder[]); }, [pool, dispatched]);

  const dateJobs = useMemo(() => {
    return allWorkOrders
      .filter(wo => wo.scheduleDate === selectedDate && !wo.archived && wo.status !== 'archived')
      .sort((a, b) => {
        const sa = STATUS_ORDER[a.status] ?? 99;
        const sb = STATUS_ORDER[b.status] ?? 99;
        if (sa !== sb) return sa - sb;
        return compareScheduleTime(a.scheduleTime, b.scheduleTime);
      });
  }, [allWorkOrders, selectedDate]);

  const mappableJobs = useMemo(() => dateJobs.filter(j => j.lat && j.lng), [dateJobs]);

  const selectedDateObj = useMemo(() => {
    try { return parseISO(selectedDate); } catch { return new Date(); }
  }, [selectedDate]);

  function prevDay() { setSelectedDate(toISODate(subDays(selectedDateObj, 1))); setSelectedJob(null); }
  function nextDay() { setSelectedDate(toISODate(addDays(selectedDateObj, 1))); setSelectedJob(null); }
  function goToday() { setSelectedDate(toISODate(new Date())); setSelectedJob(null); }

  const dateLabel = isToday(selectedDateObj)
    ? 'Today'
    : format(selectedDateObj, 'EEE, MMM d');

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Schedule"
        icon={MapPin}
        title="Job map"
        subtitle="Jobs by date — see site locations and who is assigned."
        actions={
          <div className="flex items-center gap-2 shrink-0" aria-label="Date">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Previous day"
              onClick={prevDay}
            >
              <ChevronLeft size={14} />
            </Button>
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={selectedDate}
                onChange={e => { setSelectedDate(e.target.value); setSelectedJob(null); }}
                className="h-8 text-[11px] font-bold tracking-wider bg-bg-secondary border-border-main w-[140px] cursor-pointer"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Next day"
              onClick={nextDay}
            >
              <ChevronRightIcon size={14} />
            </Button>
            {!isToday(selectedDateObj) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-[10px] font-bold uppercase tracking-wider text-text-muted hover:text-text-primary"
                onClick={goToday}
              >
                Today
              </Button>
            )}
          </div>
        }
      />

      {/* Date summary strip */}
      <div className="flex items-center gap-3 px-0">
        <p className="text-sm font-bold text-text-primary">{dateLabel}</p>
        <span className="text-text-muted text-xs">·</span>
        <p className="text-xs text-text-muted font-bold tracking-wider">
          {loading ? '...' : `${dateJobs.length} job${dateJobs.length !== 1 ? 's' : ''}`}
        </p>
        {!loading && mappableJobs.length < dateJobs.length && dateJobs.length > 0 && (
          <>
            <span className="text-text-muted text-xs">·</span>
            <div className="flex items-center gap-1 text-[11px] text-accent-gold font-bold">
              <AlertCircle size={10} />
              {dateJobs.length - mappableJobs.length} without a map location
            </div>
          </>
        )}
      </div>

      {/* Mobile tab switcher */}
      <div className="tabs lg:hidden" role="tablist" aria-label="Map view">
        <button type="button" role="tab" aria-selected={mobileTab === 'map'}
          data-state={mobileTab === 'map' ? 'active' : 'inactive'} className="tab flex-1 flex items-center justify-center gap-1.5"
          onClick={() => setMobileTab('map')}
        >
          <MapIcon size={12} /> Map
        </button>
        <button type="button" role="tab" aria-selected={mobileTab === 'jobs'}
          data-state={mobileTab === 'jobs' ? 'active' : 'inactive'} className="tab flex-1 flex items-center justify-center gap-1.5"
          onClick={() => setMobileTab('jobs')}
        >
          <Calendar size={12} />
          {dateJobs.length} jobs
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: '65vh' }}>

        {/* Map Panel */}
        <div
          className={cn(
            'lg:col-span-2 rounded-lg overflow-hidden border border-border-main',
            mobileTab === 'jobs' ? 'hidden lg:block' : ''
          )}
          style={{ minHeight: '400px', height: '65vh' }}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full bg-bg-secondary p-6">
              <LoadingState label="Loading jobs…" rows={3} className="w-full max-w-sm" />
            </div>
          ) : dateJobs.length === 0 ? (
            <div className="flex items-center justify-center h-full bg-bg-secondary p-6">
              <EmptyState icon={MapPin} title="No jobs on this date" description={`Nothing is scheduled for ${dateLabel}. Try a different date above.`} className="w-full max-w-sm border-none" />
            </div>
          ) : (
            <AdminMapView
              jobs={dateJobs}
              selectedJob={selectedJob}
              onSelectJob={setSelectedJob}
            />
          )}
        </div>

        {/* Job List Panel */}
        <div
          className={cn(
            'space-y-3 overflow-y-auto',
            mobileTab === 'map' ? 'hidden lg:block' : ''
          )}
          style={{ maxHeight: '65vh' }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              {dateJobs.length} job{dateJobs.length !== 1 ? 's' : ''}
            </p>
          </div>

          {loading ? (
            [1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-lg" />)
          ) : dateJobs.length === 0 ? (
            <EmptyState compact icon={Calendar} title="No jobs on this date" description={`Nothing is scheduled for ${dateLabel}.`}
              action={<Button variant="outline" size="sm" onClick={goToday}>Go to today</Button>} />
          ) : (
            dateJobs.map((job, index) => {
              const isSelected = selectedJob?.id === job.id;
              const hasCoordsForMap = !!(job.lat && job.lng);
              const techName = (job as any).technicianName || 'Unassigned';

              return (
                <div
                  key={job.id}
                  className={cn(
                    'relative overflow-hidden rounded-lg border cursor-pointer transition-all',
                    isSelected
                      ? 'border-brand-red bg-brand-red-dim/10 shadow-sm'
                      : 'border-border-sub bg-bg-secondary hover:border-border-main hover:bg-bg-tertiary'
                  )}
                  onClick={() => setSelectedJob(isSelected ? null : job)}
                >
                  <div className={cn('absolute left-0 top-0 bottom-0 w-1', getAccentColor(job.status))} />
                  <div className="pl-4 pt-4 pb-2 pr-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex-shrink-0 h-5 w-5 rounded-full bg-bg-tertiary border border-border-sub flex items-center justify-center text-[11px] font-bold text-text-muted">
                          {index + 1}
                        </span>
                        <p className="text-xs font-bold tracking-wide truncate text-text-primary">
                          {job.title || job.description || `Job ${job.id.slice(0, 6).toUpperCase()}`}
                        </p>
                      </div>
                      <StatusBadge kind="job" value={job.status} className="flex-shrink-0" />
                    </div>
                  </div>
                  <div className="px-4 pb-4 space-y-3">
                    <div className="space-y-1.5 text-[10px] text-text-muted">
                      <div className="flex items-start gap-2">
                        <MapPin size={10} className="text-brand-red mt-0.5 flex-shrink-0" />
                        <span className="break-words leading-tight">{job.location || 'Location TBD'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <User size={10} className="flex-shrink-0" />
                        <span className={cn(techName === 'Unassigned' ? 'text-text-muted opacity-60' : '')}>{techName}</span>
                      </div>
                      {job.scheduleTime && (
                        <div className="flex items-center gap-2">
                          <Clock size={10} className="flex-shrink-0" />
                          <span>{job.scheduleTime}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 flex-1 text-[11px] font-bold"
                        onClick={(e) => {
                          e.stopPropagation();
                          const q = encodeURIComponent(job.location || '');
                          window.open(`https://www.google.com/maps/dir/?api=1&destination=${q}`, '_blank', 'noopener');
                        }}
                      >
                        <Navigation size={10} className="mr-1.5" />
                        Directions
                      </Button>
                      <Link href={`/admin/dispatch`} onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" className="h-8 text-[11px] font-bold px-2">
                          <ChevronRight size={14} />
                        </Button>
                      </Link>
                    </div>

                    {!hasCoordsForMap && (
                      <p className="text-[11px] text-text-muted font-bold opacity-60">· No map location — not shown on map</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
