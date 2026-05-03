"use client";

import { useState, useMemo } from 'react';
import type { Route, WorkOrder } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { 
    Plus, 
    Trash2, 
    Layers, 
    User, 
    ChevronRight, 
    Search,
    Wrench,
    DollarSign,
    Check
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type RoutesViewProps = {
    routes: Route[];
    onRoutesChange: (routes: Route[]) => void;
    allWorkOrders: WorkOrder[];
    onWorkOrdersChange: (orders: WorkOrder[]) => void;
};

export function RoutesView({ routes, onRoutesChange, allWorkOrders, onWorkOrdersChange }: RoutesViewProps) {
    const [isNewRouteOpen, setIsNewRouteOpen] = useState(false);
    const [newRouteName, setNewRouteName] = useState("");
    const [isAddJobsOpen, setIsAddJobsOpen] = useState(false);
    const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
    const [jobSearch, setJobSearch] = useState("");
    const { toast } = useToast();

    const handleCreateRoute = () => {
        if (!newRouteName.trim()) return;
        const newRoute: Route = {
            id: `route-${Date.now()}`,
            name: newRouteName,
            workOrderIds: [],
            technicianName: ""
        };
        onRoutesChange([...routes, newRoute]);
        setNewRouteName("");
        setIsNewRouteOpen(false);
        toast({ title: "Route Established", description: `${newRoute.name} initialized.` });
    };

    const handleDeleteRoute = (id: string) => {
        const route = routes.find(r => r.id === id);
        onRoutesChange(routes.filter(r => r.id !== id));
        // Unset routeId on work orders
        onWorkOrdersChange(allWorkOrders.map(wo => wo.routeId === id ? { ...wo, routeId: undefined } : wo));
        toast({ variant: "destructive", title: "Route Dissolved", description: `${route?.name} removed from registry.` });
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
            wo.id === woId ? { ...wo, routeId: undefined } : wo
        ));
    };

    const unassignedJobs = useMemo(() => 
        allWorkOrders.filter(wo => !wo.routeId && wo.status === 'unassigned'),
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

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-bg-secondary p-4 rounded-lg border border-border-sub">
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                        <Layers size={14} className="text-brand-red" />
                        Active Formations
                    </h3>
                </div>
                <Button onClick={() => setIsNewRouteOpen(true)} className="h-9 px-6 text-[10px]">
                    <Plus size={14} className="mr-2"/> New Route
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {routes.map(route => {
                    const routeJobs = allWorkOrders.filter(wo => route.workOrderIds.includes(wo.id));
                    const totalPay = getRouteTotalPay(route);
                    
                    return (
                        <Card key={route.id} className="bg-bg-secondary border-border-main flex flex-col overflow-hidden shadow-2xl">
                            <CardHeader className="bg-bg-tertiary/50 border-b border-border-sub pb-4">
                                <div className="flex justify-between items-start mb-2">
                                    <Badge variant="outline" className="text-[8px] bg-bg-primary uppercase font-bold tracking-widest text-brand-red border-brand-red/20">ROUTE ID: {route.id.split('-')[1]}</Badge>
                                    <button onClick={() => handleDeleteRoute(route.id)} className="text-text-muted hover:text-text-red transition-colors"><Trash2 size={14}/></button>
                                </div>
                                <CardTitle className="text-lg font-bold text-text-primary uppercase tracking-wide">{route.name}</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 flex-1 space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-bold uppercase tracking-widest text-text-muted ml-1">Assigned Technician</label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
                                        <Input 
                                            placeholder="Assign Tech..." 
                                            value={route.technicianName}
                                            onChange={(e) => handleTechNameChange(route.id, e.target.value)}
                                            className="h-9 pl-9 bg-bg-primary border-border-sub text-[11px] font-bold uppercase tracking-wider focus:border-brand-red"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-text-muted">Job Manifest ({routeJobs.length})</p>
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-6 text-[9px] uppercase font-bold text-brand-red hover:bg-brand-red/10"
                                            onClick={() => {
                                                setActiveRouteId(route.id);
                                                setIsAddJobsOpen(true);
                                            }}
                                        >
                                            <Plus size={10} className="mr-1"/> Add Jobs
                                        </Button>
                                    </div>
                                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                                        {routeJobs.map(job => (
                                            <div key={job.id} className="p-2.5 rounded bg-bg-primary border border-border-sub flex items-center justify-between group">
                                                <div className="space-y-0.5 overflow-hidden">
                                                    <p className="text-[10px] font-bold text-text-primary uppercase truncate">{job.description}</p>
                                                    <p className="text-[8px] text-text-muted font-mono">{job.id.toUpperCase()}</p>
                                                </div>
                                                <button 
                                                    onClick={() => handleRemoveJobFromRoute(job.id, route.id)}
                                                    className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-red transition-all ml-2"
                                                ><Trash2 size={12}/></button>
                                            </div>
                                        ))}
                                        {routeJobs.length === 0 && (
                                            <div className="p-8 text-center border border-dashed border-border-main rounded-md">
                                                <p className="text-[9px] text-text-muted uppercase font-bold italic">No jobs allocated</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="bg-bg-tertiary/30 border-t border-border-sub p-4">
                                <div className="flex justify-between items-center w-full">
                                    <div className="space-y-0.5">
                                        <p className="text-[8px] font-black uppercase text-text-muted tracking-widest">Est. Settlement Total</p>
                                        <p className="text-xl font-mono font-bold text-text-green">${totalPay.toFixed(2)}</p>
                                    </div>
                                    <ChevronRight size={16} className="text-text-muted" />
                                </div>
                            </CardFooter>
                        </Card>
                    )
                })}
                {routes.length === 0 && (
                    <div className="col-span-full py-24 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30">
                        <Layers size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted italic">Tactical formation required. Establish a new route to begin grouping jobs.</p>
                        <Button variant="outline" className="mt-6 uppercase font-bold text-[10px] tracking-widest" onClick={() => setIsNewRouteOpen(true)}>
                            Initialize Route Registry
                        </Button>
                    </div>
                )}
            </div>

            {/* NEW ROUTE DIALOG */}
            <Dialog open={isNewRouteOpen} onOpenChange={setIsNewRouteOpen}>
                <DialogContent className="sm:max-w-md bg-bg-elevated border-border-default">
                    <DialogHeader>
                        <DialogTitle className="uppercase font-bold tracking-widest text-text-primary">Establish New Route</DialogTitle>
                        <DialogDescription>Define a named tactical grouping for field assignments.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label className="text-[10px] font-bold uppercase text-text-muted mb-2 block">Route Identifier / Name</Label>
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

            {/* ADD JOBS DIALOG */}
            <Dialog open={isAddJobsOpen} onOpenChange={setIsAddJobsOpen}>
                <DialogContent className="sm:max-w-xl bg-bg-elevated border-border-default flex flex-col p-0 max-h-[80vh]">
                    <DialogHeader className="p-6 pb-2">
                        <DialogTitle className="uppercase font-bold tracking-widest text-text-primary">Allocation Terminal</DialogTitle>
                        <DialogDescription>Pull assignments from the unassigned job pool into this route.</DialogDescription>
                    </DialogHeader>
                    <div className="px-6 py-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                            <Input 
                                placeholder="Search Job Pool..." 
                                value={jobSearch}
                                onChange={(e) => setJobSearch(e.target.value)}
                                className="h-10 pl-10 bg-bg-primary border-border-sub text-xs uppercase"
                            />
                        </div>
                    </div>
                    <ScrollArea className="flex-1 p-6">
                        <div className="space-y-2">
                            {filteredUnassigned.map(job => (
                                <div key={job.id} className="p-4 rounded-lg bg-bg-primary border border-border-sub hover:bg-bg-secondary transition-colors flex items-center justify-between group">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-bg-tertiary rounded text-text-muted">
                                            <Wrench size={16} />
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide">{job.description}</p>
                                            <div className="flex items-center gap-3 text-[9px] text-text-muted uppercase font-bold tracking-widest mt-1">
                                                <span>{job.clientName}</span>
                                                <span>•</span>
                                                <span className="text-text-green">${job.pay.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <Button 
                                        size="sm" 
                                        className="h-8 bg-brand-red/10 border border-brand-red/30 text-brand-red hover:bg-brand-red hover:text-white"
                                        onClick={() => handleAddJobToRoute(job.id)}
                                    >
                                        <Check size={14} className="mr-1.5"/> Allocate
                                    </Button>
                                </div>
                            ))}
                            {filteredUnassigned.length === 0 && (
                                <div className="text-center py-12 border border-dashed border-border-sub rounded-lg">
                                    <p className="text-[10px] text-text-muted uppercase font-bold">Registry Clear: No Unassigned Jobs Found</p>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                    <div className="p-6 border-t border-border-default bg-bg-tertiary/30">
                        <Button variant="outline" className="w-full uppercase font-bold text-[10px] tracking-widest h-10" onClick={() => setIsAddJobsOpen(false)}>Close Terminal</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
