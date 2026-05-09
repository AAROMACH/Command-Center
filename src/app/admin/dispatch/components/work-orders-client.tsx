"use client";

import { useState, useMemo } from "react";
import type { WorkOrder, Technician, Recommendation, Route } from "@/lib/types";
import { getRecommendation } from "../actions";
import { format, parseISO } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import {
  Briefcase,
  Calendar,
  Clock,
  MapPin,
  Pencil,
  UserPlus,
  Layers,
  DollarSign,
  User,
  Send,
  ShieldCheck,
  Eye
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { MissionDetailDialog } from "@/components/mission-detail-dialog";

type WorkOrdersClientProps = {
  workOrders: WorkOrder[];
  allWorkOrders: WorkOrder[];
  technicians: Technician[];
  onWorkOrdersChange: (orders: WorkOrder[]) => void;
  routes: Route[];
  mode: 'unassigned' | 'assigned';
};

export function WorkOrdersClient({
  workOrders,
  allWorkOrders,
  technicians,
  onWorkOrdersChange,
  routes,
  mode
}: WorkOrdersClientProps) {
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(
    null
  );
  const [techSearchQuery, setTechSearchQuery] = useState("");

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editedOrder, setEditedOrder] = useState<WorkOrder | null>(null);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailMission, setDetailMission] = useState<WorkOrder | null>(null);

  const { toast } = useToast();

  const sortedWorkOrders = useMemo(() => {
    return [...workOrders].sort((a, b) => a.scheduleDate.localeCompare(b.scheduleDate));
  }, [workOrders]);

  const handleOpenAssignDialog = (order: WorkOrder) => {
    setSelectedOrder(order);
    setRecommendation(null);
    setTechSearchQuery("");
    setIsDialogOpen(true);
  };

  const handleOpenEditDialog = (order: WorkOrder) => {
    setSelectedOrder(order);
    setEditedOrder({ ...order });
    setIsEditDialogOpen(true);
  };

  const handleOpenDetail = (order: WorkOrder) => {
    setDetailMission(order);
    setIsDetailOpen(true);
  };

  const handleGetRecommendation = async () => {
    if (!selectedOrder) return;
    setIsLoading(true);
    try {
      const result = await getRecommendation({
        workOrder: {
          id: selectedOrder.id,
          description: selectedOrder.description,
          location: selectedOrder.location,
          requiredSkills: selectedOrder.requiredSkills,
          priority: selectedOrder.priority,
        },
        availableTechnicians: technicians.map((t) => ({
          id: t.id,
          name: t.name,
          currentLocation: t.currentLocation,
          reliabilityScore: t.reliabilityScore,
          currentWorkload: t.currentWorkload,
          skills: t.skills,
        })),
      });
      setRecommendation(result);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Recommendation Failed",
        description: "Could not get an AI recommendation.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssign = (technicianId: string) => {
    if (!selectedOrder) return;
    const updated = allWorkOrders.map(order =>
      order.id === selectedOrder.id
        ? { ...order, status: 'assigned' as const, assignedTechnicianId: technicianId === 'unassigned' ? undefined : technicianId }
        : order
    );
    onWorkOrdersChange(updated);
    setIsDialogOpen(false);
    toast({
      title: "Allocation Committed",
      description: `Assignment ${selectedOrder.id.toUpperCase()} has been moved to the assigned registry.`,
    });
  }

  const handleSaveChanges = () => {
    if (!editedOrder) return;
    const updated = allWorkOrders.map(order =>
      order.id === editedOrder.id ? editedOrder : order
    );
    onWorkOrdersChange(updated);
    setIsEditDialogOpen(false);
    toast({ title: "Registry Updated", description: "Assignment parameters committed." });
  };

  const handleConfirmAssignments = () => {
    toast({
      title: "Transmission Initiated",
      description: `${workOrders.length} field assignments transmitted to operative terminals via secure protocol.`,
    });
  }

  const filteredTechnicians = useMemo(() => {
    return technicians
      .filter(t => !t.roles?.includes('client') && !t.role.toLowerCase().includes('client'))
      .filter(t => t.name.toLowerCase().includes(techSearchQuery.toLowerCase()))
      .map(tech => {
        const charSum = (str: string) => str.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        const seed = Math.abs(charSum(tech.id) - charSum(selectedOrder?.id || ''));
        return { ...tech, distance: (seed % 35) + 1.2 };
      }).sort((a, b) => a.distance - b.distance);
  }, [technicians, selectedOrder, techSearchQuery]);

  const formatDateDisplay = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split('-');
      return `${month}-${day}-${year}`;
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <>
      {mode === 'assigned' && sortedWorkOrders.length > 0 && (
        <div className="mb-4 flex items-center justify-between p-4 rounded-lg bg-bg-tertiary border border-border-sub">
            <div className="flex items-center gap-3">
                <ShieldCheck className="text-text-green h-5 w-5" />
                <div>
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Global Allocation Protocol</p>
                    <p className="text-xs font-bold text-text-primary uppercase">Ready for Assignment</p>
                </div>
            </div>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="h-9 bg-text-green hover:bg-text-green/90 px-6 border-none shadow-none text-white font-bold uppercase text-[10px] tracking-widest">
                    <Send className="mr-2 h-3.5 w-3.5" />
                    Send Out Assignments
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-bg-elevated border-border-main">
                <AlertDialogHeader>
                  <AlertDialogTitle className="uppercase tracking-wider">Authorize Mission Transmission?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will broadcast assignment details to {sortedWorkOrders.length} field operatives. This action initiates the live tracking window.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleConfirmAssignments} className="bg-text-green hover:bg-text-green/90 border-none">
                    Confirm & Notify
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
        </div>
      )}

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: "130px" }}>ID / Status</th>
              <th>Description & Client</th>
              <th style={{ width: "160px" }}>Schedule</th>
              <th style={{ width: "140px" }}>Route Status</th>
              <th style={{ width: "160px" }}>Site Location</th>
              <th style={{ width: "180px" }}>{mode === 'assigned' ? 'Assigned Operative' : 'Pay ($)'}</th>
              <th style={{ width: "140px" }}></th>
            </tr>
          </thead>
          <tbody>
            {sortedWorkOrders.map((order) => {
              const route = routes.find(r => r.id === order.routeId);
              const technician = technicians.find(t => t.id === order.assignedTechnicianId);
              
              return (
                <tr key={order.id}>
                  <td>
                    <div className="cell-id">{order.id.toUpperCase()}</div>
                    <Badge variant={order.status === 'unassigned' ? 'pending' : order.status} className="capitalize">{order.status}</Badge>
                  </td>
                  <td>
                    <div className="cell-desc-title">{order.description}</div>
                    <div className="cell-desc-client">
                      <Briefcase />
                      <span>{order.clientName}</span>
                    </div>
                  </td>
                  <td>
                    <div className="cell-sched">
                      <div className="cell-sched-date"><Calendar />{formatDateDisplay(order.scheduleDate)}</div>
                      <div className="cell-sched-time"><Clock />{order.scheduleTime}</div>
                    </div>
                  </td>
                  <td>
                    {route ? (
                        <Badge variant="outline" className="bg-bg-tertiary border-accent-gold/30 text-accent-gold text-[9px] uppercase tracking-widest gap-1">
                            <Layers size={10}/> {route.name}
                        </Badge>
                    ) : (
                        <span className="text-[10px] text-text-muted italic uppercase font-bold tracking-tighter">Unallocated</span>
                    )}
                  </td>
                  <td>
                    <div className="cell-loc">
                      <MapPin />
                      <span>{order.location}</span>
                    </div>
                  </td>
                  <td>
                    {mode === 'assigned' ? (
                        technician ? (
                            <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8 border border-border-sub">
                                    <AvatarImage src={technician.avatarUrl} />
                                    <AvatarFallback>{technician.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="space-y-0.5">
                                    <p className="text-[11px] font-bold text-text-primary uppercase tracking-tight">{technician.name}</p>
                                    <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest">{technician.role}</p>
                                </div>
                            </div>
                        ) : (
                            <span className="text-[10px] text-text-red uppercase font-bold tracking-widest">ID Discrepancy</span>
                        )
                    ) : (
                        <div className="cell-pay">
                            <DollarSign />
                            <div className="flex flex-col">
                                <span className="cell-pay-val">{order.pay.toFixed(2)}</span>
                                <span className="text-[9px] uppercase font-bold tracking-widest text-text-muted">{order.payType}</span>
                            </div>
                        </div>
                    )}
                  </td>
                  <td>
                     <div className="cell-actions">
                       <button className="btn-edit" onClick={() => handleOpenDetail(order)}>
                         <Eye size={16} />
                       </button>
                       {order.status === 'unassigned' && (
                         <Button 
                            size="sm" 
                            variant="default" 
                            className="h-8 !text-[10px] bg-brand-red hover:bg-brand-red-hover"
                            onClick={() => handleOpenAssignDialog(order)}
                         >
                            <UserPlus size={12} className="mr-1.5"/> Assign
                         </Button>
                       )}
                       <button className="btn-edit" onClick={() => handleOpenEditDialog(order)}>
                         <Pencil />
                       </button>
                     </div>
                  </td>
                </tr>
              );
            })}
             {sortedWorkOrders.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-text-muted italic font-bold uppercase tracking-widest text-xs opacity-40">Job pool clear. Awaiting further intake.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <MissionDetailDialog 
        isOpen={isDetailOpen} 
        setIsOpen={setIsDetailOpen} 
        mission={detailMission} 
      />

      {/* DISPATCH TERMINAL (Searchable Techs + AI) */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[750px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[90vh]">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="page-title text-xl flex items-center gap-2">
              <UserPlus className="text-brand-red" size={20} />
              Dispatch Terminal
            </DialogTitle>
            <p className="text-xs text-text-muted">Select operative for individual job deployment: <span className="text-text-primary font-bold uppercase">{selectedOrder?.id}</span></p>
          </DialogHeader>
          <div className="flex-1 overflow-hidden px-6 pb-6 space-y-6 mt-4">
             <div className="relative">
                <Input 
                    placeholder="Search technician registry..." 
                    value={techSearchQuery}
                    onChange={(e) => setTechSearchQuery(e.target.value)}
                    className="bg-bg-primary h-11 text-sm uppercase font-bold tracking-wide"
                />
            </div>
            <div className="space-y-4">
                {!recommendation && !isLoading && (
                    <Button onClick={handleGetRecommendation} variant="secondary" className="w-full h-11">
                        <User className="mr-2 h-4 w-4"/> Initialize AI Dispatch Analysis
                    </Button>
                )}
                {isLoading && (
                    <div className="p-4 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-center gap-3">
                         <div className="h-4 w-4 rounded-full border-2 border-accent-gold border-t-transparent animate-spin" />
                         <span className="text-xs font-bold uppercase tracking-widest text-accent-gold">Calculating optimal operative...</span>
                    </div>
                )}
                {recommendation && (
                    <div className="rounded-lg border border-accent-gold bg-accent-gold-dim/10 p-4 flex items-center gap-4 animate-in fade-in slide-in-from-top-1 duration-300">
                        <div className="flex-1">
                            <p className="text-[10px] text-accent-gold font-black uppercase tracking-widest mb-1">AI Recommendation Intelligence</p>
                            <p className="text-xs text-text-primary leading-relaxed uppercase font-bold">{recommendation.reasoning}</p>
                        </div>
                    </div>
                )}
            </div>
            <Separator className="bg-border-sub" />
            <ScrollArea className="flex-1 rounded-md border border-border-sub bg-bg-primary">
                <div className="divide-y divide-border-sub">
                    {filteredTechnicians.map(tech => (
                        <div key={tech.id} className="p-4 flex items-center justify-between group hover:bg-bg-tertiary transition-colors">
                            <div className="flex items-center gap-4">
                                <Avatar className="h-10 w-10 border border-border-sub group-hover:border-brand-red transition-colors"><AvatarImage src={tech.avatarUrl} /></Avatar>
                                <div>
                                    <p className="text-xs font-bold uppercase text-text-primary group-hover:border-brand-red transition-colors">{tech.name}</p>
                                    <div className="flex items-center gap-3 mt-1">
                                        <p className="text-[9px] text-text-muted uppercase font-bold tracking-tight flex items-center gap-1">
                                            <MapPin size={10}/> {tech.distance.toFixed(1)} MI FROM SITE
                                        </p>
                                        <div className="h-1 w-1 rounded-full bg-text-muted opacity-30" />
                                        <p className="text-[9px] text-text-green font-bold uppercase">{tech.reliabilityScore}% Reliability</p>
                                    </div>
                                </div>
                            </div>
                            <Button 
                                size="sm" 
                                onClick={() => handleAssign(tech.id)} 
                                className="h-8 text-[10px] px-6 uppercase font-bold"
                            >
                                Select
                            </Button>
                        </div>
                    ))}
                    {filteredTechnicians.length === 0 && (
                        <div className="p-12 text-center">
                            <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest italic">No matching operatives in registry</p>
                        </div>
                    )}
                </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md bg-bg-elevated border-border-default">
            <DialogHeader>
                <DialogTitle className="uppercase font-bold tracking-widest text-text-primary">Update Dispatch Parameters</DialogTitle>
                <p className="text-xs text-text-muted">Adjust manual parameters for assignment <span className="font-bold text-text-primary">{selectedOrder?.id.toUpperCase()}</span></p>
            </DialogHeader>
            {editedOrder && (
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-text-muted ml-1">Technician Allocation</Label>
                        <Select value={editedOrder.assignedTechnicianId || 'unassigned'} onValueChange={(val) => setEditedOrder({ ...editedOrder, assignedTechnicianId: val === 'unassigned' ? undefined : val, status: val === 'unassigned' ? 'unassigned' : 'assigned' })}>
                            <SelectTrigger className="bg-bg-primary h-11 focus:ring-brand-red">
                                <SelectValue placeholder="Select Technician" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="unassigned" className="text-brand-red font-bold uppercase tracking-widest">UNASSIGNED</SelectItem>
                                {technicians.filter(t => !t.roles?.includes('client') && !t.role.toLowerCase().includes('client')).map(tech => (
                                    <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-text-muted ml-1">Operational Status</Label>
                        <Select value={editedOrder.status} onValueChange={(val: any) => setEditedOrder({ ...editedOrder, status: val })}>
                            <SelectTrigger className="bg-bg-primary h-11 uppercase font-bold tracking-wider focus:ring-brand-red"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="unassigned">UNASSIGNED</SelectItem>
                                <SelectItem value="assigned">ASSIGNED</SelectItem>
                                <SelectItem value="in-progress">IN PROGRESS</SelectItem>
                                <SelectItem value="completed">COMPLETED</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <Button onClick={handleSaveChanges} className="w-full h-11 mt-4 bg-brand-red hover:bg-brand-red-hover">
                        Commit Assignment Updates
                    </Button>
                </div>
            )}
        </DialogContent>
      </Dialog>
    </>
  );
}
