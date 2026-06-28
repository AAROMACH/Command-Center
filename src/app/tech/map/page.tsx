'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import type { WorkOrder } from '@/lib/types';
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
        <p className="text-xs text-text-muted uppercase tracking-widest font-bold">Loading map...</p>
      </div>
    </div>
  ),
});

function getStatusVariant(status: string) {
  switch (status) {
    case 'in-progress': return 'inprogress';
    case 'completed': return 'completed';
    case 'confirmed': return 'active';
    case 'on-my-way': return 'active';
    default: return 'scheduled';
  }
}

function getAccentColor(status: string) {
  if (status === 'in-progress') return 'bg-text-green';
  if (status === 'on-my-way' || status === 'confirmed') return 'bg-blue-400';
  if (status === 'checked-out') return 'bg-border-main';
  return 'bg-brand-red';
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

    const q = query(
      collection(db, 'assignments'),
      where('techId', '==', userId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const jobs = snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder));
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
        if (!job.scheduleDate) return true; // unscheduled — still show
        const d = new Date(job.scheduleDate + 'T12:00:00');
        d.setHours(0, 0, 0, 0);
        return d >= today;
      })
      .sort((a, b) => {
        const da = a.scheduleDate ? new Date(a.scheduleDate).getTime() : Infinity;
        const db_ = b.scheduleDate ? new Date(b.scheduleDate).getTime() : Infinity;
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
      <header className="page-header">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2">
            <MapPin size={12} />
            Field Map
          </p>
          <h1 className="page-title">Job Map</h1>
          <p className="page-subtitle">Your upcoming assignments and site locations.</p>
        </div>
      </header>

      {/* Mobile tab switcher — hidden on lg+ where both panels show side by side */}
      <div className="flex lg:hidden gap-1 p-1 bg-bg-secondary border border-border-main rounded-lg">
        <button
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold uppercase tracking-wider rounded-md transition-colors',
            mobileTab === 'map' ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-primary'
          )}
          onClick={() => setMobileTab('map')}
        >
          <MapIcon size={12} />
          Map
        </button>
        <button
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold uppercase tracking-wider rounded-md transition-colors',
            mobileTab === 'jobs' ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-primary'
          )}
          onClick={() => setMobileTab('jobs')}
        >
          <Calendar size={12} />
          {todayJobs.length} Jobs
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: '70vh' }}>

        {/* Map Panel */}
        <div
          className={cn(
            'lg:col-span-2 rounded-lg overflow-hidden border border-border-main',
            mobileTab === 'jobs' ? 'hidden lg:block' : ''
          )}
          style={{ minHeight: '400px', height: '70vh' }}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full bg-bg-secondary">
              <div className="text-center space-y-3">
                <MapPin size={32} className="mx-auto text-text-muted animate-pulse" />
                <p className="text-xs text-text-muted uppercase tracking-widest font-bold">Loading assignments...</p>
              </div>
            </div>
          ) : todayJobs.length === 0 ? (
            <div className="flex items-center justify-center h-full bg-bg-secondary">
              <div className="text-center space-y-4 px-8">
                <div className="p-4 bg-bg-tertiary rounded-full w-fit mx-auto">
                  <MapPin size={32} className="text-text-muted" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-text-primary uppercase tracking-wide">No upcoming jobs</p>
                  <p className="text-xs text-text-muted">No upcoming assignments found in the registry.</p>
                </div>
              </div>
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
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              {todayJobs.length} Upcoming Job{todayJobs.length !== 1 ? 's' : ''}
            </p>
            {mappableJobs.length < todayJobs.length && (
              <div className="flex items-center gap-1 text-[9px] text-accent-gold font-bold uppercase">
                <AlertCircle size={10} />
                {todayJobs.length - mappableJobs.length} unmapped
              </div>
            )}
          </div>

          {loading ? (
            [1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-lg" />)
          ) : todayJobs.length === 0 ? (
            <Card className="bg-bg-secondary border-border-main">
              <CardContent className="py-10 text-center space-y-2">
                <Calendar size={24} className="mx-auto text-text-muted opacity-40" />
                <p className="text-xs text-text-muted uppercase tracking-widest font-bold">No upcoming jobs</p>
                <p className="text-[10px] text-text-muted">Check back when new assignments are dispatched.</p>
                <Link href="/tech/assignments">
                  <Button variant="outline" size="sm" className="h-7 text-[9px] uppercase font-bold mt-2">
                    View All Assignments
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            todayJobs.map((job, index) => {
              const isSelected = selectedJob?.id === job.id;
              const hasCoordsForMap = !!(job.lat && job.lng);

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
                  {/* Status accent bar */}
                  <div className={cn('absolute left-0 top-0 bottom-0 w-1', getAccentColor(job.status))} />
                  <div className="pl-4 pt-4 pb-2 pr-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex-shrink-0 h-5 w-5 rounded-full bg-bg-tertiary border border-border-sub flex items-center justify-center text-[9px] font-black text-text-muted">
                          {index + 1}
                        </span>
                        <p className="text-xs font-bold uppercase tracking-wide truncate text-text-primary">
                          {job.title || job.description || `Job ${job.id.slice(0, 6).toUpperCase()}`}
                        </p>
                      </div>
                      <Badge variant={getStatusVariant(job.status)} className="h-4 text-[8px] uppercase flex-shrink-0">
                        {job.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="px-4 pb-4 space-y-3">
                    <div className="space-y-1.5 text-[10px] text-text-muted">
                      <div className="flex items-start gap-2">
                        <MapPin size={10} className="text-brand-red mt-0.5 flex-shrink-0" />
                        <span className="break-words leading-tight">{job.location || 'Location TBD'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar size={10} className="flex-shrink-0" />
                        <span>{formatScheduleDate(job.scheduleDate)}</span>
                        {job.scheduleTime && (
                          <>
                            <Clock size={10} className="flex-shrink-0" />
                            <span>{job.scheduleTime}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 flex-1 text-[9px] uppercase font-bold"
                        onClick={(e) => { e.stopPropagation(); openDirections(job); }}
                      >
                        <Navigation size={10} className="mr-1.5" />
                        Directions
                      </Button>
                      <Link href="/tech/assignments" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-[9px] uppercase font-bold px-2"
                        >
                          <ChevronRight size={14} />
                        </Button>
                      </Link>
                    </div>

                    {!hasCoordsForMap && (
                      <p className="text-[9px] text-text-muted font-bold uppercase opacity-60">
                        · Not visible on map
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
