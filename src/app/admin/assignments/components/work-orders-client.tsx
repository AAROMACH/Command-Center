"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import type { WorkOrder, Technician, Recommendation, Route } from "@/lib/types";
import { getRecommendation } from "../actions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import {
  Rocket,
  User,
  Loader2,
  Sparkles,
  Wand2,
  MapPin,
  Briefcase,
  Calendar,
  Clock,
  DollarSign,
  Trash2,
  UserPlus,
  Pencil,
  Search,
  Check,
  Navigation,
  Layers
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type WorkOrdersClientProps = {
  workOrders: WorkOrder[];
  allWorkOrders: WorkOrder[];
  technicians: Technician[];
  onWorkOrdersChange: (orders: WorkOrder[]) => void;
  routes: Route[];
  mode: 'unassigned' | 'scheduled';
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
  const [filter, setFilter] = useState<'all' | 'unassigned' | 'assigned'>('all');

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editedOrder, setEditedOrder] = useState<WorkOrder | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const { toast } = useToast();

  const handleOpenDialog = (order: WorkOrder) => {
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
        ? { ...order, status: 'assigned' as const, assignedTechnicianId: technicianId }
        : order
    );
    onWorkOrdersChange(updated);
    setIsDialogOpen(false);
    toast({
      title: "Work Order Assigned!",
      description: `${selectedOrder.id.toUpperCase()} has been assigned.`,
    });
  }

  const handleSaveChanges = () => {
    if (!editedOrder) return;
    const updated = allWorkOrders.map(order =>
      order.id === editedOrder.id ? editedOrder : order
    );
    onWorkOrdersChange(updated);
    setIsEditDialogOpen(false);
    toast({ title: "Work Order Updated" });
  };

  const handleDelete = () => {
    if (!editedOrder) return;
    const updated = allWorkOrders.filter(order => order.id !== editedOrder.id);
    onWorkOrdersChange(updated);
    setIsEditDialogOpen(false);
    setIsDeleteDialogOpen(false);
    toast({ variant: "destructive", title: "Work Order Deleted" });
  };

  const filteredData = useMemo(() => {
    if (mode !== 'unassigned') return workOrders;
    if (filter === 'all') return workOrders;
    if (filter === 'unassigned') return workOrders.filter(wo => !wo.routeId);
    if (filter === 'assigned') return workOrders.filter(wo => !!wo.routeId);
    return workOrders;
  }, [workOrders, filter, mode]);

  const recommendedTechnician = useMemo(() => {
    if (!recommendation) return null;
    return technicians.find(t => t.id === recommendation.recommendedTechnicianId);
  }, [recommendation, technicians]);

  const techsWithProximity = useMemo(() => {
    if (!selectedOrder) return [];
    return technicians
      .filter(t => !t.roles?.includes('client') && !t.role.toLowerCase().includes('client'))
      .map(tech => {
        const charSum = (str: string) => str.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        const seed = Math.abs(charSum(tech.id) - charSum(selectedOrder.id));
        return { ...tech, distance: (seed % 35) + 1.2 };
      }).sort((a, b) => a.distance - b.distance);
  }, [technicians, selectedOrder]);

  return (
    <>
      {mode === 'unassigned' && (
        <div className="flex gap-1 mb-4 p-1 bg-bg-tertiary rounded-md w-fit">
          <Button 
            variant={filter === 'all' ? 'default' : 'ghost'} 
            size="sm" 
            className="h-8 text-[10px]"
            onClick={() => setFilter('all')}
          >All</Button>
          <Button 
            variant={filter === 'unassigned' ? 'default' : 'ghost'} 
            size="sm" 
            className="h-8 text-[10px]"
            onClick={() => setFilter('unassigned')}
          >Unassigned</Button>
          <Button 
            variant={filter === 'assigned' ? 'default' : 'ghost'} 
            size="sm" 
            className="h-8 text-[10px]"
            onClick={() => setFilter('assigned')}
          >Assigned</Button>
        </div>
      )}

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: "130px" }}>ID / Status</th>
              <th>Description & Client</th>
              <th style={{ width: "160px" }}>Schedule</th>
              <th style={{ width: "120px" }}>Route Status</th>
              <th style={{ width: "160px" }}>Site Location</th>
              <th style={{ width: "160px" }}>{mode === 'scheduled' ? 'Technician' : 'Pay ($)'}</th>
              <th style={{ width: "110px" }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((order) => {
              const technician = technicians.find(t => t.id === order.assignedTechnicianId);
              const route = routes.find(r => r.id === order.routeId);
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
                      <div className="cell-sched-date"><Calendar />{order.scheduleDate}</div>
                      <div className="cell-sched-time"><Clock />{order.scheduleTime}</div>
                    </div>
                  </td>
                  <td>
                    {route ? (
                        <Badge variant="outline" className="bg-bg-tertiary border-accent-gold/30 text-accent-gold text-[9px] uppercase tracking-widest gap-1">
                            <Layers size={10}/> {route.name}
                        </Badge>
                    ) : (
                        <span className="text-[10px] text-text-muted italic uppercase font-bold tracking-tighter">No Route</span>
                    )}
                  </td>
                  <td>
                    <div className="cell-loc">
                      <MapPin />
                      <span>{order.location}</span>
                    </div>
                  </td>
                  <td>
                    {mode === 'scheduled' ? (
                       technician ? (
                        <div className="cell-tech-assigned">
                           <Avatar className="h-8 w-8"><AvatarImage src={technician.avatarUrl} /><AvatarFallback>{technician.name.charAt(0)}</AvatarFallback></Avatar>
                           <span className="text-xs font-semibold">{technician.name}</span>
                        </div>
                      ) : <span className="text-xs text-text-muted italic">Unassigned</span>
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
                       <button className="btn-edit" onClick={() => handleOpenEditDialog(order)}>
                         <Pencil />
                       </button>
                     </div>
                  </td>
                </tr>
              );
            })}
             {filteredData.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-text-muted italic">Job pool clear.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[750px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[90vh]">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="page-title text-xl flex items-center gap-2">
              <UserPlus className="text-brand-red" size={20} />
              Dispatch Terminal
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden px-6 pb-6 space-y-6">
            <div className="space-y-4">
                {!recommendation && !isLoading && (
                    <Button onClick={handleGetRecommendation} variant="secondary" className="w-full">Initialize AI Analysis</Button>
                )}
                {recommendation && recommendedTechnician && (
                    <div className="rounded-lg border border-accent-gold bg-accent-gold-dim/10 p-4 flex items-center gap-4">
                        <Avatar className="h-12 w-12 border border-accent-gold/30"><AvatarImage src={recommendedTechnician.avatarUrl} /></Avatar>
                        <div className="flex-1">
                            <p className="text-sm font-bold uppercase">{recommendedTechnician.name}</p>
                            <p className="text-[10px] text-text-muted uppercase leading-relaxed">{recommendation.reasoning}</p>
                        </div>
                        <Button onClick={() => handleAssign(recommendedTechnician.id)}>Assign</Button>
                    </div>
                )}
            </div>
            <Separator className="bg-border-sub" />
            <ScrollArea className="flex-1 rounded-md border border-border-sub bg-bg-primary">
                <div className="divide-y divide-border-sub">
                    {techsWithProximity.map(tech => (
                        <div key={tech.id} className="p-3 flex items-center justify-between group hover:bg-bg-tertiary">
                            <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8"><AvatarImage src={tech.avatarUrl} /></Avatar>
                                <div>
                                    <p className="text-xs font-bold uppercase">{tech.name}</p>
                                    <p className="text-[9px] text-text-muted uppercase font-bold tracking-tight">{tech.distance.toFixed(1)} MI FROM SITE</p>
                                </div>
                            </div>
                            <Button size="sm" onClick={() => handleAssign(tech.id)}>Select</Button>
                        </div>
                    ))}
                </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
