"use client";

import { useState, useMemo, useCallback } from 'react';
import type { Route, WorkOrder, Technician } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { 
    Plus, 
    Trash2, 
    Layers, 
    User, 
    ChevronRight, 
    Search,
    Wrench,
    Check,
    GripVertical,
    ClipboardList,
    Send,
    ExternalLink,
    Zap,
    Loader2,
    ShieldCheck,
    Clock,
    MapPin,
    RotateCcw,
    X,
    ShieldAlert,
    Eye
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { makeRouteId } from '@/lib/doc-ids';
import { Badge } from '@/components/ui/badge';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import { cn, formatCityState } from '@/lib/utils';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import { getOptimizedRoutes } from '../actions';
import { JobDetailDialog } from '@/components/job-detail-dialog';

type RoutesViewProps = {
    routes: Route[];
    onRoutesChange: (routes: Route[]) => void;
    allWorkOrders: WorkOrder[];
    onWorkOrdersChange: (orders: WorkOrder[]) => void;
    technicians: Technician[];
};

const getFieldNationLink = (id: string) => {
  const cleanId = id.replace(/^wo-/, '');
  return `https://app.fieldnation.com/workorders/${cleanId}`;
};

// --- DRAGGABLE JOB ITEM ---
function DraggableJob({ job, routeId, onRemove }: { job: WorkOrder, routeId: string, onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.id,
    data: {
      type: 'job',
      sourceRouteId: routeId,
    },
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: 100,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "p-1.5 rounded bg-bg-primary border border-border-sub flex items-center justify-between group cursor-default transition-all",
        isDragging && "opacity-50 ring-2 ring-brand-red ring-offset-2 ring-offset-bg-secondary"
      )}
    >
      <div className="flex items-center gap-2 overflow-hidden flex-1 text-left">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-text-muted hover:text-text-primary p-1 -ml-1">
          <GripVertical size={14} />
        </div>
        <div className="space-y-0 overflow-hidden text-left">
          <p className="text-[10px] font-bold text-text-primary uppercase tracking-wide truncate leading-tight">{job.description}</p>
          <div className="flex items-center gap-1.5">
            <p className="text-[8px] text-text-muted font-mono leading-tight">{job.id.toUpperCase()}</p>
            {job.source === 'Imported' && (
              <a 
                href={getFieldNationLink(job.id)} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-text-muted hover:text-brand-red transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={9} />
              </a>
            )}
          </div>
        </div>
      </div>
      <button 
        onClick={(e) => { e.stopPropagation(); onRemove(job.id); }}
        className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-red transition-all ml-1"
      >
        <Trash2 size={12}/>
      </button>
    </div>
  );
}

// --- DROPPABLE ROUTE CONTAINER ---
function DroppableRoute({ 
    route, 
    routeJobs, 
    totalPay, 
    onDelete, 
    onTechChange, 
    onRemoveJob, 
    onAssignClick,
    technicians
}: { 
    route: Route, 
    routeJobs: WorkOrder[], 
    totalPay: number, 
    onDelete: (id: string) => void, 
    onTechChange: (id: string, name: string) => void,
    onRemoveJob: (jobId: string, routeId: string) => void,
    onAssignClick: (routeId: string) => void,
    technicians: Technician[]
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: route.id,
  });

  return (
    <Card 
        ref={setNodeRef}
        className={cn(
            "bg-bg-secondary border-border-main flex flex-col overflow-hidden shadow-2xl transition-all h-full",
            isOver && "border-brand-red ring-1 ring-brand-red bg-bg-tertiary scale-[1.02]"
        )}
    >
        <CardHeader className="bg-bg-tertiary/50 border-b border-border-sub p-3">
            <div className="flex justify-between items-start mb-1.5">
                <Badge variant="outline" className="text-[8px] bg-bg-primary uppercase font-bold tracking-widest text-brand-red border-brand-red/20 h-4">ROUTE ID: {route.id.split('-').pop()?.toUpperCase()}</Badge>
                <button onClick={() => onDelete(route.id)} className="text-text-muted hover:text-text-red transition-colors"><Trash2 size={14}/></button>
            </div>
            <CardTitle className="text-sm font-bold text-text-primary uppercase tracking-wide leading-none text-left">{route.name}</CardTitle>
        </CardHeader>
        <CardContent className="p-3 flex-1 space-y-3">
            <div className="space-y-1">
                <label className="text-[8px] font-bold uppercase tracking-widest text-text-muted ml-1 flex">Assigned Technician</label>
                <Select value={route.technicianName || ""} onValueChange={(val) => onTechChange(route.id, val)}>
                    <SelectTrigger className="h-8 bg-bg-primary border-border-sub text-[10px] font-bold uppercase tracking-wider focus:ring-brand-red">
                        <div className="flex items-center gap-2">
                            <User size={10} className="text-text-muted" />
                            <SelectValue placeholder="Select operative..." />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        {technicians.filter(t => !t.roles?.includes('client') && !t.role.toLowerCase().includes('client')).map(tech => (
                            <SelectItem key={tech.id} value={tech.name} className="text-[10px] font-bold uppercase">
                                {tech.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-muted">Assignments ({routeJobs.length})</p>
                </div>
                <div className="space-y-1 min-h-[100px] max-h-[180px] overflow-y-auto pr-1">
                    {routeJobs.map(job => (
                        <DraggableJob key={job.id} job={job} routeId={route.id} onRemove={(id) => onRemoveJob(id, route.id)} />
                    ))}
                    {routeJobs.length === 0 && (
                        <div className={cn(
                            "min-h-[90px] flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed transition-colors",
                            isOver ? "border-brand-red bg-brand-red/5" : "border-border-sub bg-bg-primary/30"
                        )}>
                            <ClipboardList size={16} className="text-text-muted opacity-40" />
                            <p className="text-[8px] text-text-muted uppercase font-bold tracking-widest text-center">
                                Drop jobs here
                            </p>
                            <p className="text-[7px] text-text-muted uppercase font-bold tracking-widest opacity-60">
                                or use + Assign Jobs below
                            </p>
                        </div>
                    )}
                </div>
                <Button 
                    variant="default" 
                    className="w-full h-8 text-[9px] font-bold uppercase tracking-widest bg-brand-red/10 border border-brand-red/30 text-brand-red hover:bg-brand-red hover:text-white transition-all"
                    onClick={() => onAssignClick(route.id)}
                >
                    <Plus size={12} className="mr-1" /> Assign Jobs
                </Button>
            </div>
        </CardContent>
        <CardFooter className="bg-bg-tertiary/30 border-t border-border-sub p-3">
            <div className="flex justify-between items-center w-full">
                <div className="space-y-0 text-left">
                    <p className="text-[7px] font-black uppercase text-text-muted tracking-widest">Est. Settlement Total</p>
                    <p className="text-lg font-mono font-bold text-text-green leading-none">${totalPay.toFixed(2)}</p>
                </div>
                <ChevronRight size={14} className="text-text-muted" />
            </div>
        </CardFooter>
    </Card>
  );
}

export function RoutesView({ routes, onRoutesChange, allWorkOrders, onWorkOrdersChange, technicians }: RoutesViewProps) {
    const [isNewRouteOpen, setIsNewRouteOpen] = useState(false);
    const [newRouteName, setNewRouteName] = useState("");
    const [isAddJobsOpen, setIsAddJobsOpen] = useState(false);
    const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
    const [jobSearch, setJobSearch] = useState("");
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [targetRouteCount, setTargetRouteCount] = useState("3");
    
    const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
    const [isJobDetailOpen, setIsJobDetailOpen] = useState(false);

    const { toast } = useToast();

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor)
    );

    const handleCreateRoute = async () => {
        const name = newRouteName.trim() || `Route ${routes.length + 1}`;
        const newRoute: Route = {
            id: await makeRouteId(),
            name,
            workOrderIds: [],
            technicianName: ""
        };
        onRoutesChange([...routes, newRoute]);
        setNewRouteName("");
        setIsNewRouteOpen(false);
        toast({ title: "Route Created", description: `${newRoute.name} is ready for job assignments.` });
    };

    const handleDeleteRoute = (id: string) => {
        const route = routes.find(r => r.id === id);
        if (!route) return;
        onRoutesChange(routes.filter(r => r.id !== id));
        onWorkOrdersChange(allWorkOrders.map(wo => wo.routeId === id ? { ...wo, routeId: null } : wo));
        toast({ variant: "destructive", title: "Route Dissolved", description: `${route.name} removed from registry.` });
    };

    const handleClearAllRoutes = () => {
        onRoutesChange([]);
        onWorkOrdersChange(allWorkOrders.map(wo => wo.routeId ? { ...wo, routeId: null } : wo));
        toast({ variant: "destructive", title: "Registry Reset", description: "All routes dissolved and jobs returned to unassigned pool." });
    };

    const handleTechNameChange = (routeId: string, name: string) => {
        onRoutesChange(routes.map(r => r.id === routeId ? { ...r, technicianName: name } : r));
    };

    const handleAddJobToRoute = (woId: string) => {
        if (!activeRouteId) return;
        onRoutesChange(routes.map(r => 
            r.id === activeRouteId 
            ? { ...r, workOrderIds: [...r.workOrderIds, woId] } 
            : r
        ));
        onWorkOrdersChange(allWorkOrders.map(wo => 
            wo.id === woId ? { ...wo, routeId: activeRouteId } : wo
        ));
    };

    const handleRemoveJobFromRoute = (woId: string, routeId: string) => {
        onRoutesChange(routes.map(r => 
            r.id === routeId 
            ? { ...r, workOrderIds: r.workOrderIds.filter(id => id !== woId) } 
            : r
        ));
        onWorkOrdersChange(allWorkOrders.map(wo => 
            wo.id === woId ? { ...wo, routeId: null } : wo
        ));
    };

    const handleTacticalOptimization = async () => {
        const unassigned = allWorkOrders.filter(wo => !wo.routeId && (!wo.assignedTechnicianId || wo.status === 'unassigned'));
        if (unassigned.length === 0) {
            toast({ variant: 'destructive', title: 'Optimization Aborted', description: 'No unassigned jobs found in mission pool.' });
            return;
        }

        setIsOptimizing(true);
        try {
            const availableTechs = technicians.filter(t => 
                !t.roles?.includes('client') && 
                t.name && 
                (t.address || t.currentLocation)
            );

            const result = await getOptimizedRoutes({
                unassignedJobs: unassigned,
                availableTechnicians: availableTechs,
                targetRouteCount: parseInt(targetRouteCount)
            });

            if (result.warnings && result.warnings.length > 0) {
                toast({ 
                    variant: result.routes.length > 0 ? "default" : "destructive", 
                    title: "Optimization Alert", 
                    description: result.warnings[0] 
                });
            }

            if (result.routes && result.routes.length > 0) {
                const newRoutes: Route[] = await Promise.all(result.routes.map(async (p) => ({
                    id: await makeRouteId(),
                    name: p.estimatedRouteLabel || `Area: ${p.technicianName || 'Unassigned'}`,
                    technicianName: p.technicianName || "",
                    workOrderIds: p.jobIds
                })));

                const updatedWorkOrders = allWorkOrders.map(wo => {
                    const foundRoute = newRoutes.find(r => r.workOrderIds.includes(wo.id));
                    if (foundRoute) {
                        return { ...wo, routeId: foundRoute.id };
                    }
                    return wo;
                });

                onRoutesChange([...routes, ...newRoutes]);
                onWorkOrdersChange(updatedWorkOrders);
                
                toast({
                    title: "Area Optimization Applied",
                    description: `Successfully architected ${newRoutes.length} service areas based on geographic city anchors.`,
                });
            }
        } catch (e: any) {
            toast({ variant: "destructive", title: "Optimization Failure", description: "Internal routing engine encountered an error." });
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleBatchAssign = () => {
        const jobsToUpdate: Record<string, string> = {};
        routes.forEach(route => {
            if (route.technicianName) {
                const tech = technicians.find(t => t.name === route.technicianName);
                if (tech) {
                    route.workOrderIds.forEach(id => {
                        jobsToUpdate[id] = tech.id;
                    });
                }
            }
        });

        const updatedWorkOrders = allWorkOrders.map(wo => {
            if (jobsToUpdate[wo.id]) {
                return {
                    ...wo,
                    status: 'assigned' as const,
                    assignedTechnicianId: jobsToUpdate[wo.id]
                };
            }
            return wo;
        });

        onWorkOrdersChange(updatedWorkOrders);
        onRoutesChange([]); // Registry Reset: Purge routes after successful transmission
        toast({ title: "Batch Assignment Executed", description: "Job data transferred to the Assigned registry." });
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;
        const jobId = active.id as string;
        const targetRouteId = over.id as string;
        const sourceRouteId = active.data.current?.sourceRouteId;
        if (sourceRouteId === targetRouteId) return;

        onRoutesChange(routes.map(r => {
            if (r.id === sourceRouteId) {
                return { ...r, workOrderIds: r.workOrderIds.filter(id => id !== jobId) };
            }
            if (r.id === targetRouteId) {
                return { ...r, workOrderIds: [...r.workOrderIds, jobId] };
            }
            return r;
        }));

        onWorkOrdersChange(allWorkOrders.map(wo => 
            wo.id === jobId ? { ...wo, routeId: targetRouteId } : wo
        ));

        toast({ title: "Registry Relocated", description: `Job ${jobId.toUpperCase()} moved to ${routes.find(r => r.id === targetRouteId)?.name}.` });
    };

    const unassignedJobs = useMemo(() =>
        allWorkOrders.filter(wo => !wo.routeId && (!wo.assignedTechnicianId || wo.status === 'unassigned')),
    [allWorkOrders]);

    const filteredUnassigned = useMemo(() => 
        unassignedJobs.filter(wo => 
            wo.description.toLowerCase().includes(jobSearch.toLowerCase()) ||
            wo.id.toLowerCase().includes(jobSearch.toLowerCase())
        ),
    [unassignedJobs, jobSearch]);

    const getRouteTotalPay = (route: Route) => {
        return allWorkOrders
            .filter(wo => route.workOrderIds.includes(wo.id))
            .reduce((acc, wo) => acc + wo.pay, 0);
    };

    const jobsInRoutesCount = useMemo(() => {
        return routes.reduce((acc, r) => acc + r.workOrderIds.length, 0);
    }, [routes]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col xl:flex-row justify-between items-center bg-bg-secondary p-4 rounded-lg border border-border-sub gap-4">
                <div className="flex items-center gap-6 w-full xl:w-auto">
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2 text-left">
                        <Layers size={14} className="text-brand-red" />
                        Area Optimization
                    </h3>
                    <div className="flex items-center gap-2 px-3 py-1 bg-bg-primary rounded-full border border-border-sub">
                        <ClipboardList size={12} className="text-accent-gold" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Unassigned Jobs:</span>
                        <span className="text-xs font-mono font-bold text-text-primary">{unassignedJobs.length}</span>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-end">
                    <div className="flex items-center gap-2 bg-bg-primary px-3 h-9 rounded-md border border-border-sub">
                        <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Route Quantity:</p>
                        <Select value={targetRouteCount} onValueChange={setTargetRouteCount}>
                            <SelectTrigger className="w-16 h-7 bg-bg-secondary text-[10px] font-mono font-bold border-none shadow-none focus:ring-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main">
                                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                                    <SelectItem key={n} value={n.toString()} className="text-[10px] font-mono font-bold">{n}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button 
                        onClick={handleTacticalOptimization} 
                        disabled={isOptimizing || unassignedJobs.length === 0}
                        className="h-9 px-6 text-[10px] bg-brand-red hover:bg-brand-red-hover shadow-[0_0_15px_rgba(204,34,0,0.1)]"
                    >
                        {isOptimizing ? <Loader2 size={14} className="mr-2 animate-spin"/> : <Zap size={14} className="mr-2" />}
                        Optimize ({targetRouteCount} Areas)
                    </Button>
                    <Separator orientation="vertical" className="h-9 bg-border-sub hidden md:block" />
                    <Button variant="outline" onClick={() => setIsNewRouteOpen(true)} className="h-9 px-6 text-[10px] border-border-main">
                        <Plus size={14} className="mr-2"/> New Route
                    </Button>
                    <Button variant="ghost" onClick={handleClearAllRoutes} disabled={routes.length === 0} className="h-9 px-4 text-[10px] uppercase font-bold text-text-muted hover:text-text-red">
                        <RotateCcw size={14} className="mr-2"/> Reset
                    </Button>
                    <Button 
                        onClick={handleBatchAssign} 
                        disabled={jobsInRoutesCount === 0}
                        className="h-9 px-6 text-[10px] bg-accent-gold hover:bg-accent-gold/90"
                    >
                        <Send size={14} className="mr-2"/> Send to Assigned
                    </Button>
                </div>
            </div>

            <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {routes.map(route => {
                        const routeJobs = allWorkOrders.filter(wo => route.workOrderIds.includes(wo.id));
                        const totalPay = getRouteTotalPay(route);
                        return (
                            <DroppableRoute 
                                key={route.id}
                                route={route}
                                routeJobs={routeJobs}
                                totalPay={totalPay}
                                onDelete={handleDeleteRoute}
                                onTechChange={handleTechNameChange}
                                onRemoveJob={handleRemoveJobFromRoute}
                                onAssignClick={(id) => {
                                    setActiveRouteId(id);
                                    setIsAddJobsOpen(true);
                                }}
                                technicians={technicians}
                            />
                        )
                    })}
                    {routes.length === 0 && (
                        <div className="col-span-full py-24 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30">
                            <Layers size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted italic text-center">No active areas. Establish a new route or execute area optimization to begin grouping jobs.</p>
                        </div>
                    )}
                </div>
            </DndContext>

            {/* NEW ROUTE DIALOG */}
            <Dialog open={isNewRouteOpen} onOpenChange={setIsNewRouteOpen}>
                <DialogContent className="sm:max-w-md bg-bg-elevated border-border-default shadow-2xl">
                    <DialogHeader className="text-left">
                        <DialogTitle className="uppercase tracking-widest font-bold text-left">New Route</DialogTitle>
                        <DialogDescription className="text-xs text-left">Create a named route to group and dispatch field assignments.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 text-left">
                        <Label className="text-[10px] font-bold uppercase text-text-muted mb-2 block text-left">Route Identifier / Name</Label>
                        <Input 
                            placeholder="e.g. Detroit North AM" 
                            value={newRouteName}
                            onChange={(e) => setNewRouteName(e.target.value)}
                            className="bg-bg-primary h-11 text-sm uppercase font-bold tracking-wide"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsNewRouteOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateRoute} className="px-8">Create Route</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ALLOCATION TERMINAL */}
            <Dialog open={isAddJobsOpen} onOpenChange={setIsAddJobsOpen}>
                <DialogContent className="sm:max-w-xl bg-bg-elevated border-border-default flex flex-col p-0 max-h-[80vh] shadow-2xl">
                    <DialogHeader className="p-6 pb-2">
                        <div className="flex items-center gap-2 mb-1 text-left">
                            <Wrench className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary text-left">Allocation Terminal</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs text-left">Select jobs from the unassigned pool to allocate to <span className="text-text-primary font-bold">{routes.find(r => r.id === activeRouteId)?.name}</span>.</DialogDescription>
                    </DialogHeader>
                    <div className="px-6 py-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                            <Input 
                                placeholder="Search Job Pool..." 
                                value={jobSearch}
                                onChange={(e) => setJobSearch(e.target.value)}
                                className="h-10 pl-10 bg-bg-primary border-border-sub text-xs uppercase font-bold"
                            />
                        </div>
                    </div>
                    <ScrollArea className="flex-1 p-6">
                        <div className="space-y-2 text-left">
                            {filteredUnassigned.map(job => (
                                <div key={job.id} className="p-4 rounded-lg bg-bg-primary border border-border-sub hover:bg-bg-tertiary transition-colors flex items-center justify-between group">
                                    <div className="flex items-center gap-4 text-left">
                                        <div className="p-2 bg-bg-tertiary rounded text-text-muted border border-border-sub">
                                            <Wrench size={16} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide text-left">{job.description}</p>
                                            <div className="flex items-center gap-3 text-[9px] text-text-muted uppercase font-bold tracking-widest mt-1 text-left">
                                                <span>{job.clientName}</span>
                                                <span>•</span>
                                                <span className="text-text-green font-mono font-bold">${job.pay.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-8 w-8 text-text-muted hover:text-text-primary"
                                            onClick={() => { setSelectedJob(job); setIsJobDetailOpen(true); }}
                                        >
                                            <Eye size={16}/>
                                        </Button>
                                        <Button 
                                            size="sm" 
                                            className="h-8 bg-brand-red/10 border border-brand-red/30 text-brand-red hover:bg-brand-red hover:text-white"
                                            onClick={() => handleAddJobToRoute(job.id)}
                                        >
                                            <Check size={14} className="mr-1.5"/> Allocate
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            {filteredUnassigned.length === 0 && (
                                <div className="text-center py-12 border border-dashed border-border-sub rounded-lg">
                                    <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest italic text-center">Registry clear: No unassigned jobs found</p>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                    <div className="p-6 border-t border-border-default bg-bg-tertiary/30">
                        <Button variant="outline" className="w-full uppercase font-bold text-[10px] tracking-widest h-10" onClick={() => setIsAddJobsOpen(false)}>Close Terminal</Button>
                    </div>
                </DialogContent>
            </Dialog>
            
            <JobDetailDialog 
                isOpen={isJobDetailOpen} 
                setIsOpen={setIsJobDetailOpen} 
                mission={selectedJob} 
            />
        </div>
    );
}
