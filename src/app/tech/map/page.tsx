'use client';

import { PageHeader } from '@/components/page-header';
import { EmptyState, PageLoading } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { subscribeTechAssignments } from '@/lib/tech-assignments';
import { statusTone, TONE_BADGE, TONE_DOT } from '@/lib/status-styles';
import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import type { WorkOrder } from '@/lib/types';
import { isArchivedJob, isAssignedTo, parseLocalDate } from '@/lib/jobs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MapPin,
  Navigation,
  Calendar,
  Clock,
  ChevronRight,
  AlertCircle,
  Map as MapIcon,
} from 'lucide-react';
import Link from 'next/link';
import { format, isToday, isTomorrow } from 'date-fns';
import { cn } from '@/lib/utils';

// Leaflet must be loaded client-side only — no SSR
const MapView = dynamic(() => import('./components/map-view'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-bg-secondary rounded-lg border border-border-main">
      <div className="text-center space-y-3">
        <MapIcon size={32} className="mx-auto text-text-muted animate-pulse" />
        <p className="text-[12px] text-text-muted">Loading map…</p>
      </div>
    </div>
  ),
});

function getStatusVariant(status: string): any {
  return TONE_BADGE[statusTone('job', status)];
}

function getAccentColor(status: string) {
  return TONE_DOT[statusTone('job', status)];
}

function formatScheduleDate(dateStr: string) {
  if (!dateStr) return 'TBD';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    if (isToday(d)) return 'Today';
    if (isTomorrow(d)) return 'Tomorrow';
    return format(d, 'MMM d');
  } catch {
    return dateStr;
  }
}

export default function TechMapPage() {
  const [assignments, setAssignments] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
  const [techId, setTechId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'map' | 'jobs'>('map');

  useEffect(() => {
    const userId = sessionStorage.getItem('currentUserId');
    if (!userId) return;
    setTechId(userId);

    // Jobs they lead + jobs they help on (archived never plotted).
    const unsub = subscribeTechAssignments(userId, (jobs) => {
      setAssignments(jobs);
      setLoading(false);
    }, () => setLoading(false));

    return () => unsub();
  }, []);

  // Jobs scheduled for today or in the future (not completed)
  const todayJobs = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return assignments
      .filter(job => {
        if (job.status === 'completed') return false;
        if (job.archived || job.status === 'archived') return false;
        if (!job.scheduleDate) return true; // unscheduled — still show
        const d = new Date(job.scheduleDate + 'T12:00:00');
        d.setHours(0, 0, 0, 0);
        return d >= today;
      })
      .sort((a, b) => {
        const da = parseLocalDate(a.scheduleDate)?.getTime() ?? Infinity;
        const db_ = parseLocalDate(b.scheduleDate)?.getTime() ?? Infinity;
        return da - db_;
      });
  }, [assignments]);

  // Only jobs that have coordinates for the map
  const mappableJobs = useMemo(() =>
    todayJobs.filter(job => job.lat && job.lng),
  [todayJobs]);

  function openDirections(job: WorkOrder) {
    const query = encodeURIComponent(job.location || '');
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${query}`, '_blank', 'noopener');
  }

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Map" icon={MapPin} title="Job map" subtitle="Your upcoming jobs and where they are." />

      {/* Mobile tab switcher — hidden on lg+ where both panels show side by side */}
      <div className="tabs !mb-0 flex-nowrap lg:hidden" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'map'}
          className={cn('tab flex-1 inline-flex items-center justify-center gap-1.5', mobileTab === 'map' && 'active')}
          onClick={() => setMobileTab('map')}
        >
          <MapIcon size={14} />
          Map
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'jobs'}
          className={cn('tab flex-1 inline-flex items-center justify-center gap-1.5', mobileTab === 'jobs' && 'active')}
          onClick={() => setMobileTab('jobs')}
        >
          <Calendar size={14} />
          {todayJobs.length} {todayJobs.length === 1 ? 'job' : 'jobs'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: '70vh' }}>

        {/* Map Panel */}
        <div
          className={cn(
            'lg:col-span-2 rounded-xl overflow-hidden border border-border-main shadow-sm',
            mobileTab === 'jobs' ? 'hidden lg:block' : ''
          )}
          style={{ minHeight: '400px', height: '70vh' }}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full bg-bg-secondary">
              <PageLoading label="Loading your jobs…" />
            </div>
          ) : todayJobs.length === 0 ? (
            <div className="flex items-center justify-center h-full bg-bg-secondary">
              <EmptyState icon={MapPin} title="No upcoming jobs" description="Jobs assigned to you show up on the map." className="border-0" />
            </div>
          ) : (
            <MapView
              jobs={todayJobs}
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
          style={{ maxHeight: '70vh' }}
        >
          <div className="flex items-center justify-between">
            <p className="section-label">
              {todayJobs.length} upcoming job{todayJobs.length !== 1 ? 's' : ''}
            </p>
            {mappableJobs.length < todayJobs.length && (
              <div className="flex items-center gap-1 text-[12px] text-accent-gold font-medium">
                <AlertCircle size={12} />
                {todayJobs.length - mappableJobs.length} unmapped
              </div>
            )}
          </div>

          {loading ? (
            [1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-lg" />)
          ) : todayJobs.length === 0 ? (
            <EmptyState compact icon={Calendar} title="No upcoming jobs" description="Check back when new jobs are assigned to you." action={<Link href="/tech/assignments"><Button variant="outline" className="h-10">See all my jobs</Button></Link>} />
          ) : (
            todayJobs.map((job, index) => {
              const isSelected = selectedJob?.id === job.id;
              const hasCoordsForMap = !!(job.lat && job.lng);

              return (
                <div
                  key={job.id}
                  className={cn(
                    'relative overflow-hidden rounded-xl border cursor-pointer shadow-sm transition-all',
                    isSelected
                      ? 'border-brand-red bg-brand-red-dim/10 shadow-sm'
                      : 'border-border-main bg-bg-secondary hover:bg-bg-tertiary'
                  )}
                  onClick={() => setSelectedJob(isSelected ? null : job)}
                >
                  {/* Status accent bar */}
                  <div className={cn('absolute left-0 top-0 bottom-0 w-1', getAccentColor(job.status))} />
                  <div className="pl-4 pt-4 pb-2 pr-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex-shrink-0 h-5 w-5 rounded-full bg-bg-tertiary border border-border-sub flex items-center justify-center text-[11px] font-bold text-text-muted">
                          {index + 1}
                        </span>
                        <p className="text-[14px] font-semibold truncate text-text-primary">
                          {job.title || job.description || `Job ${job.id.slice(0, 6).toUpperCase()}`}
                        </p>
                      </div>
                      <StatusBadge kind="job" value={job.status} className="flex-shrink-0" />
                    </div>
                  </div>
                  <div className="px-4 pb-4 space-y-3">
                    <div className="space-y-1.5 text-[12px] text-text-muted">
                      <div className="flex items-start gap-2">
                        <MapPin size={12} className="text-brand-red mt-0.5 flex-shrink-0" />
                        <span className="break-words leading-tight">{job.location || 'Location TBD'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar size={12} className="flex-shrink-0" />
                        <span>{formatScheduleDate(job.scheduleDate)}</span>
                        {job.scheduleTime && (
                          <>
                            <Clock size={12} className="flex-shrink-0" />
                            <span>{job.scheduleTime}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="h-10 flex-1"
                        onClick={(e) => { e.stopPropagation(); openDirections(job); }}
                      >
                        <Navigation size={14} className="mr-1.5" />
                        Directions
                      </Button>
                      <Link href={`/tech/assignments/${job.id}`} onClick={(e) => e.stopPropagation()} aria-label="Open job">
                        <Button
                          variant="ghost"
                          className="h-10 w-10 p-0"
                        >
                          <ChevronRight size={14} />
                        </Button>
                      </Link>
                    </div>

                    {!hasCoordsForMap && (
                      <p className="text-[12px] text-text-muted">
                        Not shown on the map (no address match)
                      </p>
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
