"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import type { WorkOrder, Technician, Recommendation } from "@/lib/types";
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
  Navigation
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type WorkOrdersClientProps = {
  workOrders: WorkOrder[]; // The filtered list for the current tab
  allWorkOrders: WorkOrder[]; // The complete list from parent state
  technicians: Technician[];
  onWorkOrdersChange?: (orders: WorkOrder[]) => void;
};

export function WorkOrdersClient({
  workOrders,
  allWorkOrders,
  technicians,
  onWorkOrdersChange,
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
    setEditedOrder({ ...order }); // Create a mutable copy for the form
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
        description: "Could not get an AI recommendation. Please try again.",
      });
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssign = (technicianId: string) => {
    if (!selectedOrder) return;

    if (onWorkOrdersChange) {
      const updated = allWorkOrders.map(order =>
        order.id === selectedOrder.id
          ? { ...order, status: 'assigned' as const, assignedTechnicianId: technicianId }
          : order
      );
      onWorkOrdersChange(updated);
    }

    setIsDialogOpen(false);

    const assignedTechnician = technicians.find(t => t.id === technicianId);

    toast({
      title: "Work Order Assigned!",
      description: `${selectedOrder.id.toUpperCase()} has been assigned to ${
        assignedTechnician?.name
      }.`,
    });
  }

  const handleSaveChanges = () => {
    if (!editedOrder) return;

    if (onWorkOrdersChange) {
      const updated = allWorkOrders.map(order =>
        order.id === editedOrder.id ? editedOrder : order
      );
      onWorkOrdersChange(updated);
    }
    
    setIsEditDialogOpen(false);
    toast({
      title: "Work Order Updated",
      description: `Work Order ${editedOrder.id.toUpperCase()} has been successfully updated.`,
    });
  };

  const handleDelete = () => {
    if (!editedOrder) return;
    const orderIdToDelete = editedOrder.id;
    
    if (onWorkOrdersChange) {
      const updated = allWorkOrders.filter(order => order.id !== orderIdToDelete);
      onWorkOrdersChange(updated);
    }

    setIsEditDialogOpen(false);
    setIsDeleteDialogOpen(false);
    toast({
      variant: "destructive",
      title: "Work Order Deleted",
      description: `Work Order ${orderIdToDelete.toUpperCase()} has been removed.`,
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!editedOrder) return;
    const { name, value } = e.target;
    let processedValue: string | number = value;
    if (name === 'pay') {
        processedValue = Number(value);
    }
    setEditedOrder({ ...editedOrder, [name]: processedValue });
  };
  
  const handleSelectChange = (name: string, value: string) => {
    if (!editedOrder) return;
    
    if (name === 'assignedTechnicianId') {
        const isUnassigned = value === 'unassigned';
        const newStatus = isUnassigned ? 'unassigned' as const : 'assigned' as const;
        setEditedOrder({ 
            ...editedOrder, 
            assignedTechnicianId: isUnassigned ? undefined : value, 
            status: newStatus 
        });
    } else {
        setEditedOrder({ ...editedOrder, [name]: value as any });
    }
  }

  const recommendedTechnician = useMemo(() => {
    if (!recommendation) return null;
    return technicians.find(
      (t) => t.id === recommendation.recommendedTechnicianId
    );
  }, [recommendation, technicians]);

  const alternativeTechnicians = useMemo(() => {
    if (!recommendation?.alternativeTechnicianIds) return [];
    return recommendation.alternativeTechnicianIds
      .map((id) => technicians.find((t) => t.id === id))
      .filter((t): t is Technician => t !== undefined);
  }, [recommendation, technicians]);

  const filteredTechnicians = useMemo(() => {
    const lowerQuery = techSearchQuery.toLowerCase();
    return technicians
      .filter(t => !t.roles?.includes('client') && !t.role.toLowerCase().includes('client')) // Internal only
      .filter(t => 
        t.name.toLowerCase().includes(lowerQuery) || 
        t.id.toLowerCase().includes(lowerQuery) ||
        t.role.toLowerCase().includes(lowerQuery)
      );
  }, [technicians, techSearchQuery]);

  // Simulate proximity data for the Dispatch Terminal
  const techsWithProximity = useMemo(() => {
    if (!selectedOrder) return [];
    return filteredTechnicians.map(tech => {
      // Logic-based distance simulation for prototyping
      const charSum = (str: string) => str.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
      const seed = Math.abs(charSum(tech.id) - charSum(selectedOrder.id));
      const simulatedDistance = (seed % 35) + 1.2;
      return {
        ...tech,
        distance: simulatedDistance
      };
    }).sort((a, b) => a.distance - b.distance);
  }, [filteredTechnicians, selectedOrder]);


  return (
    <>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: "140px" }}>ID / Status</th>
              <th>Description & Client</th>
              <th style={{ width: "160px" }}>Schedule</th>
              <th style={{ width: "130px" }}>Pay ($)</th>
              <th style={{ width: "180px" }}>Site Location</th>
              <th style={{ width: "160px" }}>Assigned Technician</th>
              <th style={{ width: "110px" }}></th>
            </tr>
          </thead>
          <tbody>
            {workOrders.map((order) => {
              const technician = technicians.find(
                (t) => t.id === order.assignedTechnicianId
              );
              return (
                <tr key={order.id}>
                  <td>
                    <div className="cell-id">{order.id.toUpperCase()}</div>
                    <div className="cell-status-stack">
                       <Badge variant={order.priority === 'critical' || order.priority === 'high' ? 'high' : order.priority === 'medium' ? 'medium' : 'low'} className="normal-case">{order.priority}</Badge>
                       <Badge variant={order.status === 'unassigned' ? 'pending' : order.status === 'in-progress' ? 'inprogress' : order.status} className="capitalize">{order.status}</Badge>
                    </div>
                  </td>
                  <td>
                    <div className="cell-desc-title">{order.description}</div>
                    <div className="cell-desc-client">
                      <Briefcase />
                      <span>{order.projectType} - {order.clientName}</span>
                    </div>
                  </td>
                  <td>
                    <div className="cell-sched">
                      <div className="cell-sched-date">
                        <Calendar />
                        <span>{order.scheduleDate}</span>
                      </div>
                      <div className="cell-sched-time">
                        <Clock />
                        <span>{order.scheduleTime}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="cell-pay">
                      <DollarSign />
                      <div className="flex flex-col">
                        <span className="cell-pay-val">{order.pay.toFixed(2)}</span>
                        <span className="text-[9px] uppercase font-bold tracking-widest text-text-muted">{order.payType}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="cell-loc">
                      <MapPin />
                      <span>{order.location}</span>
                    </div>
                  </td>
                  <td>
                    {technician ? (
                      <div className="cell-tech-assigned">
                         <Avatar className="h-8 w-8">
                           <AvatarImage asChild src={technician.avatarUrl} alt={technician.name}>
                             <Image src={technician.avatarUrl} alt={technician.name} width={32} height={32} />
                            </AvatarImage>
                            <AvatarFallback>{technician.name.charAt(0)}</AvatarFallback>
                         </Avatar>
                         <span className="text-sm font-semibold text-text-primary">{technician.name}</span>
                      </div>
                    ) : (
                      <div className="cell-tech-awaiting">
                        <User />
                        Awaiting Staff
                      </div>
                    )}
                  </td>
                  <td>
                     <div className="cell-actions">
                      {order.status === "unassigned" && (
                         <button className="btn-assign" onClick={() => handleOpenDialog(order)}>
                           <UserPlus />
                           Assign
                         </button>
                      )}
                       <button className="btn-edit" onClick={() => handleOpenEditDialog(order)}>
                         <Pencil />
                       </button>
                     </div>
                  </td>
                </tr>
              );
            })}
             {workOrders.length === 0 && (
                <tr>
                    <td colSpan={7} className="text-center py-12 text-text-muted italic">
                        Registry clear. Awaiting tactical assignment data.
                    </td>
                </tr>
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
            <DialogDescription className="page-subtitle">
              Authorize technician for Work Order: {selectedOrder?.id.toUpperCase()}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden px-6 pb-6 space-y-6">
            {/* AI Segment */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                        <Wand2 size={12} className="text-accent-gold" />
                        AI Recommendation Engine
                    </h3>
                </div>
                
                {!recommendation && !isLoading && (
                    <div className="p-6 rounded-lg border-2 border-dashed border-border-sub bg-bg-primary/50 text-center space-y-3">
                        <p className="text-xs text-text-secondary">Analyze the technician registry to find the best match based on skills, location, and workload.</p>
                        <Button onClick={handleGetRecommendation} variant="secondary" className="h-9">
                            <Sparkles className="mr-2 h-4 w-4" /> Initialize Analysis
                        </Button>
                    </div>
                )}

                {isLoading && (
                    <div className="p-8 flex flex-col items-center justify-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-brand-red" />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-accent-gold animate-pulse">Running Dispatch Algorithms...</p>
                    </div>
                )}

                {recommendation && recommendedTechnician && (
                    <div className="rounded-lg border border-accent-gold bg-accent-gold-dim/10 overflow-hidden animate-in fade-in slide-in-from-top-2">
                        <div className="flex flex-row items-center gap-4 p-4">
                            <Avatar className="h-12 w-12 border border-accent-gold/30">
                                <AvatarImage src={recommendedTechnician.avatarUrl} />
                                <AvatarFallback>{recommendedTechnician.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-base font-bold text-text-primary uppercase tracking-wide">{recommendedTechnician.name}</span>
                                    <Badge variant="active" className="text-[8px] h-4">TOP MATCH</Badge>
                                </div>
                                <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest mt-1">
                                    Reliability: {recommendedTechnician.reliabilityScore}% | Load: {recommendedTechnician.currentWorkload}
                                </p>
                            </div>
                            <Button onClick={() => handleAssign(recommendedTechnician.id)} className="bg-accent-gold hover:bg-accent-gold/80 text-black">
                                <Rocket className="mr-2 h-4 w-4" /> Assign Recommendation
                            </Button>
                        </div>
                        <div className="p-3 bg-accent-gold-dim/20 border-t border-accent-gold/20">
                            <p className="text-[10px] font-bold text-text-primary uppercase tracking-widest mb-1 italic">Intelligence Logic:</p>
                            <p className="text-[11px] text-text-secondary leading-relaxed">{recommendation.reasoning}</p>
                        </div>
                    </div>
                )}
            </div>

            <Separator className="bg-border-sub" />

            {/* Manual Registry Segment */}
            <div className="space-y-4 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                        <Search size={12} />
                        Manual Registry Selection
                    </h3>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-text-muted" />
                        <Input 
                            placeholder="Filter Technicians..."
                            className="h-8 pl-8 text-[10px] bg-bg-primary border-border-sub w-[200px] uppercase font-bold tracking-widest"
                            value={techSearchQuery}
                            onChange={(e) => setTechSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <ScrollArea className="flex-1 rounded-md border border-border-sub bg-bg-primary">
                    <div className="divide-y divide-border-sub">
                        {techsWithProximity.map(tech => (
                            <div 
                                key={tech.id} 
                                className="p-3 flex items-center justify-between group hover:bg-bg-tertiary transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src={tech.avatarUrl} />
                                        <AvatarFallback>{tech.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors">{tech.name}</p>
                                            <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-bg-secondary uppercase font-bold text-text-muted border-border-sub">{tech.id}</Badge>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <p className="text-[9px] text-text-muted font-bold uppercase tracking-widest">{tech.role}</p>
                                            <span className="text-text-muted opacity-30 text-[10px]">•</span>
                                            <p className={cn("text-[9px] font-mono font-bold", tech.reliabilityScore > 90 ? 'text-text-green' : 'text-accent-gold')}>
                                                {tech.reliabilityScore}% REL
                                            </p>
                                            <span className="text-text-muted opacity-30 text-[10px]">•</span>
                                            <div className="flex items-center gap-1 text-[9px] font-bold text-brand-red uppercase tracking-tight">
                                                <Navigation size={10} className="fill-current" />
                                                {tech.distance.toFixed(1)} MI FROM SITE
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 text-[9px] uppercase font-black tracking-widest opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => handleAssign(tech.id)}
                                >
                                    <Check size={12} className="mr-1"/> Select
                                </Button>
                            </div>
                        ))}
                        {techsWithProximity.length === 0 && (
                            <div className="py-12 text-center text-[10px] text-text-muted uppercase font-bold italic tracking-widest">
                                Registry clear. No technicians found.
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>
          </div>
          
          <DialogFooter className="p-6 border-t border-border-default bg-bg-tertiary/30">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest">Abort Dispatch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[625px] bg-bg-elevated border-border-default">
          <DialogHeader>
            <DialogTitle className="page-title text-xl">
              Edit Work Order
            </DialogTitle>
            <DialogDescription className="page-subtitle">
              Editing Work Order: {selectedOrder?.id.toUpperCase()}
            </DialogDescription>
          </DialogHeader>
          {editedOrder && (
            <div className="py-4 space-y-4 text-sm">
              <div className="space-y-2">
                <Label htmlFor="description" className="text-text-muted">Description</Label>
                <Textarea id="description" name="description" value={editedOrder.description} onChange={handleInputChange} className="bg-bg-primary border-border-subtle" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="location" className="text-text-muted">Location</Label>
                  <Input id="location" name="location" value={editedOrder.location} onChange={handleInputChange} className="bg-bg-primary border-border-subtle" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="payType" className="text-text-muted">Pay Model</Label>
                    <Select value={editedOrder.payType} onValueChange={(value) => handleSelectChange('payType', value)}>
                        <SelectTrigger id="payType" className="bg-bg-primary border-border-subtle">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="fixed">Fixed</SelectItem>
                            <SelectItem value="hourly">Hourly</SelectItem>
                            <SelectItem value="blended">Blended</SelectItem>
                        </SelectContent>
                    </Select>
                 </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pay" className="text-text-muted">Settlement Pay ($)</Label>
                  <Input id="pay" name="pay" type="number" value={editedOrder.pay} onChange={handleInputChange} className="bg-bg-primary border-border-subtle" />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="priority" className="text-text-muted">Priority</Label>
                    <Select value={editedOrder.priority} onValueChange={(value) => handleSelectChange('priority', value)}>
                        <SelectTrigger id="priority" className="bg-bg-primary border-border-subtle">
                            <SelectValue placeholder="Set priority" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                    </Select>
                 </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assignedTechnicianId" className="text-text-muted">Assigned Technician</Label>
                <Select value={editedOrder.assignedTechnicianId || 'unassigned'} onValueChange={(value) => handleSelectChange('assignedTechnicianId', value)}>
                    <SelectTrigger id="assignedTechnicianId" className="bg-bg-primary border-border-subtle">
                        <SelectValue placeholder="Select a technician" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {technicians.map(tech => (
                            <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="pt-4">
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="mr-auto">
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete work order <span className="font-bold">{editedOrder?.id.toUpperCase()}</span>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>
                            Yes, delete work order
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveChanges}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
