'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  DndContext, type DragEndEvent,
  useDraggable, useDroppable,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, X, MapPin, Send, Route as RouteIcon, GripVertical, Map as MapIcon, PanelLeft, PanelRight } from 'lucide-react';
import { cn, isAssignableTechnician, isInactiveTechnician, sortTechniciansForDeployment } from '@/lib/utils';
import { displayWorkOrderNumber } from '@/lib/work-order-identity';
import { makeRouteId } from '@/lib/doc-ids';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import type { Route, WorkOrder, Technician } from '@/lib/types';

const RoutesMapView = dynamic(() => import('./routes-map-view'), { ssr: false });

// Firestore never enforces these fields as non-optional the way TypeScript
// does — a doc missing one used to crash this page's render synchronously.
// Every read of a route's jobs or a job's label/pay must go through these.
export const jobIdsOf = (route: Route | null | undefined): string[] => route?.workOrderIds || [];
export const jobLabel = (job: WorkOrder | null | undefined): string =>
  job?.title || job?.description || (job ? displayWorkOrderNumber(job) : '') || 'Untitled Job';
export const jobPay = (job: WorkOrder | null | undefined): number => job?.pay || 0;

export const ROUTE_COLORS = ['#e53e3e', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16'];

type RoutesViewProps = {
  routes: Route[];
  allJobPool: WorkOrder[];
  technicians: Technician[];
  onWorkOrdersChange: (orders: WorkOrder[]) => void;
  onRoutesChange: (routes: Route[]) => void;
};

function DraggableJob({ job, routeId, onRemove }: { job: WorkOrder; routeId: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.id,
    data: { routeId },
  });
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: CSS.Translate.toString(transform), zIndex: 999 } : {}}
      className={cn(
        'flex items-center gap-2 rounded-md border border-border-sub bg-bg-primary px-2 py-1.5 group',
        isDragging && 'opacity-30',
      )}
    >
      <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-text-muted shrink-0">
        <GripVertical size={12} />
      </span>
      <span className="flex-1 min-w-0 truncate text-[10px] font-bold uppercase tracking-wide">{jobLabel(job)}</span>
      <span className="text-[9px] font-mono text-text-muted shrink-0">${jobPay(job).toFixed(0)}</span>
      <button onClick={onRemove} className="text-text-muted hover:text-brand-red transition-colors shrink-0 opacity-0 group-hover:opacity-100">
        <X size={12} />
      </button>
    </div>
  );
}

function DroppableRoute({ route, children }: { route: Route; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: route.id });
  return (
    <div ref={setNodeRef} className={cn(
      'rounded-xl border border-border-sub bg-bg-secondary/50 p-4 space-y-3 transition-all',
      isOver && 'ring-2 ring-inset ring-brand-red/60 bg-brand-red/5',
    )}>
      {children}
    </div>
  );
}

export function RoutesView({ routes, allJobPool, technicians, onWorkOrdersChange, onRoutesChange }: RoutesViewProps) {
  const safeRoutes = routes || [];
  const safeJobPool = allJobPool || [];
  const safeTechnicians = technicians || [];
  const { toast } = useToast();

  const [isNewRouteOpen, setIsNewRouteOpen] = useState(false);
  const [newRouteName, setNewRouteName] = useState('');
  const [creatingRoute, setCreatingRoute] = useState(false);
  const [addJobsRouteId, setAddJobsRouteId] = useState<string | null>(null);
  const [addJobsSearch, setAddJobsSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [mapOpen, setMapOpen] = useState(true);
  const [mapSide, setMapSide] = useState<'left' | 'right'>('right');

  const jobsById = useMemo(() => {
    const map: Record<string, WorkOrder> = {};
    safeJobPool.forEach(j => { map[j.id] = j; });
    return map;
  }, [safeJobPool]);

  const routedJobIds = useMemo(() => {
    const set = new Set<string>();
    safeRoutes.forEach(r => jobIdsOf(r).forEach(id => set.add(id)));
    return set;
  }, [safeRoutes]);

  const unroutedJobs = useMemo(
    () => safeJobPool.filter(j => !routedJobIds.has(j.id)),
    [safeJobPool, routedJobIds],
  );

  const assignableTechs = useMemo(
    () => sortTechniciansForDeployment(safeTechnicians.filter(isAssignableTechnician)),
    [safeTechnicians],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const jobId = String(active.id);
    const sourceRouteId = (active.data.current as { routeId?: string } | undefined)?.routeId;
    const targetRouteId = String(over.id);
    if (!sourceRouteId || sourceRouteId === targetRouteId) return;

    const nextRoutes = safeRoutes.map(r => {
      if (r.id === sourceRouteId) {
        return { ...r, workOrderIds: jobIdsOf(r).filter(id => id !== jobId) };
      }
      if (r.id === targetRouteId) {
        const current = jobIdsOf(r);
        return current.includes(jobId) ? r : { ...r, workOrderIds: [...current, jobId] };
      }
      return r;
    });
    onRoutesChange(nextRoutes);
  };

  const handleCreateRoute = async () => {
    if (!newRouteName.trim()) return;
    setCreatingRoute(true);
    try {
      const id = await makeRouteId();
      const newRoute: Route = {
        id,
        name: newRouteName.trim(),
        workOrderIds: [],
        status: 'draft',
        createdAt: new Date().toISOString(),
      };
      onRoutesChange([...safeRoutes, newRoute]);
      setNewRouteName('');
      setIsNewRouteOpen(false);
    } finally {
      setCreatingRoute(false);
    }
  };

  const handleDeleteRoute = (routeId: string) => {
    onRoutesChange(safeRoutes.filter(r => r.id !== routeId));
  };

  const handleAssignTech = (routeId: string, techId: string) => {
    onRoutesChange(safeRoutes.map(r => r.id === routeId ? { ...r, technicianId: techId === 'unassigned' ? undefined : techId } : r));
  };

  const handleRemoveJob = (routeId: string, jobId: string) => {
    onRoutesChange(safeRoutes.map(r => r.id === routeId ? { ...r, workOrderIds: jobIdsOf(r).filter(id => id !== jobId) } : r));
  };

  const handleAddJob = (routeId: string, jobId: string) => {
    onRoutesChange(safeRoutes.map(r => {
      if (r.id !== routeId) return r;
      const current = jobIdsOf(r);
      return current.includes(jobId) ? r : { ...r, workOrderIds: [...current, jobId] };
    }));
  };

  const readyRoutes = safeRoutes.filter(r => r.technicianId && jobIdsOf(r).length > 0);

  const handleSendToAssigned = () => {
    if (readyRoutes.length === 0) {
      toast({ variant: 'destructive', title: 'Nothing to dispatch', description: 'Assign a technician and at least one job to a route first.' });
      return;
    }
    setSending(true);
    try {
      const jobsToPromote: WorkOrder[] = [];
      readyRoutes.forEach(route => {
        jobIdsOf(route).forEach(jobId => {
          const job = jobsById[jobId];
          if (!job) return;
          jobsToPromote.push({ ...job, status: 'assigned', assignedTechnicianId: route.technicianId });
        });
      });
      onWorkOrdersChange(jobsToPromote);
      onRoutesChange([]);
      toast({ title: 'Routes Dispatched', description: `${jobsToPromote.length} job(s) sent to assigned technicians.` });
    } finally {
      setSending(false);
    }
  };

  const addJobsRoute = safeRoutes.find(r => r.id === addJobsRouteId) || null;
  const addJobsFiltered = unroutedJobs.filter(j =>
    jobLabel(j).toLowerCase().includes(addJobsSearch.toLowerCase())
    || (j.clientName || '').toLowerCase().includes(addJobsSearch.toLowerCase()),
  );

  const mapPanel = (
    <div className="w-full lg:w-[380px] shrink-0 rounded-xl border border-border-sub overflow-hidden h-[420px] lg:h-[calc(100vh-260px)] lg:min-h-[560px]">
      <RoutesMapView
        routes={safeRoutes}
        jobsById={jobsById}
        unroutedJobs={unroutedJobs}
        onResolveCoords={(jobId, lat, lng, address) => {
          updateDoc(doc(db, 'workOrders', jobId), { lat, lng, geocodedAddress: address }).catch(() => {});
        }}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
          {safeRoutes.length} route{safeRoutes.length !== 1 ? 's' : ''} · {safeJobPool.length} unassigned job{safeJobPool.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border-main bg-bg-primary p-0.5">
            <button
              onClick={() => setMapOpen(o => !o)}
              className={cn(
                'h-8 px-2.5 rounded flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest transition-colors',
                mapOpen ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary',
              )}
            >
              <MapIcon size={12} /> Map
            </button>
            {mapOpen && (
              <>
                <button
                  onClick={() => setMapSide('left')}
                  title="Open map on left"
                  className={cn(
                    'h-8 w-8 rounded flex items-center justify-center transition-colors',
                    mapSide === 'left' ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  <PanelLeft size={13} />
                </button>
                <button
                  onClick={() => setMapSide('right')}
                  title="Open map on right"
                  className={cn(
                    'h-8 w-8 rounded flex items-center justify-center transition-colors',
                    mapSide === 'right' ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  <PanelRight size={13} />
                </button>
              </>
            )}
          </div>
          <Button variant="outline" size="sm" className="h-9 text-[10px]" onClick={() => setIsNewRouteOpen(true)}>
            <Plus size={14} className="mr-2" /> New Route
          </Button>
          <Button
            size="sm"
            className="h-9 text-[10px] bg-brand-red hover:bg-brand-red/90 text-white"
            onClick={handleSendToAssigned}
            disabled={sending || readyRoutes.length === 0}
          >
            <Send size={14} className="mr-2" /> Send to Assigned ({readyRoutes.length})
          </Button>
        </div>
      </div>

      <div className={cn('flex flex-col gap-4', mapSide === 'left' ? 'lg:flex-row' : 'lg:flex-row-reverse')}>
        {mapOpen && mapPanel}

        <div className="flex-1 min-w-0">
          {safeRoutes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border-sub rounded-xl">
              <RouteIcon size={28} className="text-text-muted mb-3" />
              <p className="text-xs font-bold uppercase tracking-widest text-text-muted">No routes yet</p>
              <p className="text-[10px] text-text-muted uppercase mt-1">Create a route and add jobs to start batch-assigning.</p>
            </div>
          ) : (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <div className={cn('grid grid-cols-1 gap-4', mapOpen ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3')}>
                {safeRoutes.map((route, idx) => {
                  const jobs = jobIdsOf(route).map(id => jobsById[id]).filter((j): j is WorkOrder => !!j);
                  const total = jobs.reduce((sum, j) => sum + jobPay(j), 0);
                  const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
                  return (
                    <DroppableRoute key={route.id} route={route}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                          <p className="text-xs font-black uppercase tracking-widest truncate">{route.name}</p>
                        </div>
                        <button onClick={() => handleDeleteRoute(route.id)} className="text-text-muted hover:text-brand-red transition-colors shrink-0">
                          <X size={14} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-text-muted">
                        <span>{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>
                        <span className="font-mono">${total.toFixed(0)}</span>
                      </div>

                      <Select value={route.technicianId || 'unassigned'} onValueChange={(val) => handleAssignTech(route.id, val)}>
                        <SelectTrigger className="bg-bg-primary h-9 text-[10px] uppercase font-bold">
                          <SelectValue placeholder="Assign Technician" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned" className="text-brand-red font-bold uppercase tracking-widest text-[10px]">UNASSIGNED</SelectItem>
                          {assignableTechs.map(tech => (
                            <SelectItem key={tech.id} value={tech.id} disabled={isInactiveTechnician(tech)} className="text-[10px] uppercase font-bold">
                              {tech.name}{isInactiveTechnician(tech) ? ' · Inactive' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="space-y-1.5 min-h-[40px]">
                        {jobs.length === 0 ? (
                          <p className="text-[9px] text-text-muted uppercase text-center py-3">Drop jobs here or add below</p>
                        ) : jobs.map(job => (
                          <DraggableJob key={job.id} job={job} routeId={route.id} onRemove={() => handleRemoveJob(route.id, job.id)} />
                        ))}
                      </div>

                      <Button variant="outline" size="sm" className="w-full h-8 text-[9px]" onClick={() => { setAddJobsRouteId(route.id); setAddJobsSearch(''); }}>
                        <Plus size={12} className="mr-1.5" /> Add Jobs
                      </Button>
                    </DroppableRoute>
                  );
                })}
              </div>
            </DndContext>
          )}
        </div>
      </div>

      {/* New Route dialog */}
      <Dialog open={isNewRouteOpen} onOpenChange={setIsNewRouteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Route</DialogTitle>
            <DialogDescription>Name this route to start grouping jobs into it.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="e.g. North Detroit — Tuesday"
            value={newRouteName}
            onChange={e => setNewRouteName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateRoute(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewRouteOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateRoute} disabled={creatingRoute || !newRouteName.trim()}>
              {creatingRoute ? 'Creating...' : 'Create Route'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Jobs dialog */}
      <Dialog open={!!addJobsRouteId} onOpenChange={(open) => { if (!open) setAddJobsRouteId(null); }}>
        <DialogContent className="max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Jobs to {addJobsRoute?.name}</DialogTitle>
            <DialogDescription>Only unrouted jobs are shown — a job can belong to one route at a time.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search unrouted jobs..."
            value={addJobsSearch}
            onChange={e => setAddJobsSearch(e.target.value)}
          />
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
            {addJobsFiltered.length === 0 ? (
              <p className="text-[10px] text-text-muted uppercase text-center py-6">No unrouted jobs match.</p>
            ) : addJobsFiltered.map(job => (
              <button
                key={job.id}
                onClick={() => addJobsRouteId && handleAddJob(addJobsRouteId, job.id)}
                className="w-full flex items-center justify-between gap-2 rounded-md border border-border-sub bg-bg-primary px-3 py-2 hover:border-brand-red transition-colors text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold uppercase tracking-wide truncate">{jobLabel(job)}</span>
                  <span className="flex items-center gap-1 text-[9px] text-text-muted uppercase">
                    <MapPin size={9} /> {job.location || 'No location'}
                  </span>
                </span>
                <span className="text-[9px] font-mono text-text-muted shrink-0">${jobPay(job).toFixed(0)}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddJobsRouteId(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
