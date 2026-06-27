'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import type { WorkOrder } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
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
import { cn } from '@/lib/utils';

const AdminMapView = dynamic(() => import('./components/admin-map-view'), {
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

const STATUS_ORDER: Record<string, number> = {
  'in-progress': 0, 'on-my-way': 1, 'confirmed': 2, 'assigned': 3, 'scheduled': 4, 'completed': 5,
};

function getStatusVariant(status: string): any {
  switch (status) {
    case 'in-progress': return 'inprogress';
    case 'completed': return 'completed';
    case 'confirmed': case 'on-my-way': return 'active';
    default: return 'scheduled';
  }
}

function getAccentColor(status: string) {
  if (status === 'in-progress') return 'bg-text-green';
  if (status === 'on-my-way' || status === 'confirmed') return 'bg-blue-400';
  if (status === 'assigned') return 'bg-amber-400';
  if (status === 'completed') return 'bg-border-main';
  return 'bg-brand-red';
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

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'workOrders'), (snap) => {
      setAllWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const dateJobs = useMemo(() => {
    return allWorkOrders
      .filter(wo => wo.scheduleDate === selectedDate)
      .sort((a, b) => {
        const sa = STATUS_ORDER[a.status] ?? 99;
        const sb = STATUS_ORDER[b.status] ?? 99;
        if (sa !== sb) return sa - sb;
        return (a.scheduleTime || '').localeCompare(b.scheduleTime || '');
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
      <header className="page-header">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="text-left">
            <p className="page-eyebrow flex items-center gap-2">
              <MapPin size={12} />
              Operations Map
            </p>
            <h1 className="page-title">Job Map</h1>
            <p className="page-subtitle">Work orders by date — view site locations and technician assignments.</p>
          </div>

          {/* Date Selector */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={prevDay}
            >
              <ChevronLeft size={14} />
            </Button>
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={selectedDate}
                onChange={e => { setSelectedDate(e.target.value); setSelectedJob(null); }}
                className="h-8 text-[11px] font-bold uppercase tracking-wider bg-bg-secondary border-border-main w-[140px] cursor-pointer"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
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
        </div>
      </header>

      {/* Date summary strip */}
      <div className="flex items-center gap-3 px-0">
        <p className="text-sm font-black uppercase tracking-widest text-text-primary">{dateLabel}</p>
        <span className="text-text-muted text-xs">·</span>
        <p className="text-xs text-text-muted font-bold uppercase tracking-wider">
          {loading ? '...' : `${dateJobs.length} work order${dateJobs.length !== 1 ? 's' : ''}`}
        </p>
        {!loading && mappableJobs.length < dateJobs.length && dateJobs.length > 0 && (
          <>
            <span className="text-text-muted text-xs">·</span>
            <div className="flex items-center gap-1 text-[9px] text-accent-gold font-bold uppercase">
              <AlertCircle size={10} />
              {dateJobs.length - mappableJobs.length} without coordinates
            </div>
          </>
        )}
      </div>

      {/* Mobile tab switcher */}
      <div className="flex lg:hidden gap-1 p-1 bg-bg-secondary border border-border-main rounded-lg">
        <button
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold uppercase tracking-wider rounded-md transition-colors',
            mobileTab === 'map' ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-primary'
          )}
          onClick={() => setMobileTab('map')}
        >
          <MapIcon size={12} /> Map
        </button>
        <button
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold uppercase tracking-wider rounded-md transition-colors',
            mobileTab === 'jobs' ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-primary'
          )}
          onClick={() => setMobileTab('jobs')}
        >
          <Calendar size={12} />
          {dateJobs.length} Jobs
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
            <div className="flex items-center justify-center h-full bg-bg-secondary">
              <div className="text-center space-y-3">
                <MapPin size={32} className="mx-auto text-text-muted animate-pulse" />
                <p className="text-xs text-text-muted uppercase tracking-widest font-bold">Loading work orders...</p>
              </div>
            </div>
          ) : mappableJobs.length === 0 ? (
            <div className="flex items-center justify-center h-full bg-bg-secondary">
              <div className="text-center space-y-4 px-8">
                <div className="p-4 bg-bg-tertiary rounded-full w-fit mx-auto">
                  <MapPin size={32} className="text-text-muted" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-text-primary uppercase tracking-wide">No mapped jobs</p>
                  <p className="text-xs text-text-muted">
                    {dateJobs.length > 0
                      ? `${dateJobs.length} work order${dateJobs.length > 1 ? 's' : ''} scheduled — location coordinates not set.`
                      : `No work orders scheduled for ${dateLabel}.`}
                  </p>
                </div>
                {dateJobs.length === 0 && (
                  <p className="text-[10px] text-text-muted font-bold uppercase">Try a different date above.</p>
                )}
              </div>
            </div>
          ) : (
            <AdminMapView
              jobs={mappableJobs}
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
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              {dateJobs.length} Work Order{dateJobs.length !== 1 ? 's' : ''}
            </p>
          </div>

          {loading ? (
            [1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-lg" />)
          ) : dateJobs.length === 0 ? (
            <Card className="bg-bg-secondary border-border-main">
              <CardContent className="py-10 text-center space-y-2">
                <Calendar size={24} className="mx-auto text-text-muted opacity-40" />
                <p className="text-xs text-text-muted uppercase tracking-widest font-bold">No work orders</p>
                <p className="text-[10px] text-text-muted">Nothing scheduled for {dateLabel}.</p>
                <Button variant="outline" size="sm" className="h-7 text-[9px] uppercase font-bold mt-2" onClick={goToday}>
                  Go to Today
                </Button>
              </CardContent>
            </Card>
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
                        className="h-8 flex-1 text-[9px] uppercase font-bold"
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
                        <Button size="sm" variant="ghost" className="h-8 text-[9px] uppercase font-bold px-2">
                          <ChevronRight size={14} />
                        </Button>
                      </Link>
                    </div>

                    {!hasCoordsForMap && (
                      <p className="text-[9px] text-text-muted font-bold uppercase opacity-60">· No coordinates — not on map</p>
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
