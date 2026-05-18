"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import type { WorkOrder, Technician, Recommendation, Route } from "@/lib/types";
import { getRecommendation } from "../assignments/actions";
import { format, parseISO } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
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
  Calendar,
  Clock,
  MapPin,
  Pencil,
  UserPlus,
  DollarSign,
  User,
  Search,
  Building2,
  Check,
  Navigation,
  Eye,
  ShieldCheck,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Activity,
  Gauge
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { JobDetailDialog } from "@/components/job-detail-dialog";
import { isPayAdmin } from "@/lib/permissions";
import { getReliabilityTier, getTierBadgeVariant } from "@/lib/reliability";

type WorkOrdersTableProps = {
  workOrders: WorkOrder[];
  allWorkOrders: WorkOrder[];
  technicians: Technician[];
  onWorkOrdersChange: (orders: WorkOrder[]) => void;
  routes: Route[];
  mode: 'unassigned' | 'scheduled' | 'assigned';
};

/**
 * @fileOverview Unified Tactical Table for Assignment Management.
 * Performance: Uses React.memo for rows and useCallback for mission handlers.
 */
export const WorkOrdersTable = React.memo(({
  workOrders,
  allWorkOrders,
  technicians,
  onWorkOrdersChange,
  routes,
  mode
}: WorkOrdersTableProps) => {
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [techSearchQuery, setTechSearchQuery] = useState("");

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editedOrder, setEditedOrder] = useState<WorkOrder | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailJob, setDetailJob] = useState<WorkOrder | null>(null);

  const [currentUser, setCurrentUser] = useState<Technician | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    const userId = localStorage.getItem('currentUserId');
    if (userId) {
      setCurrentUser(technicians.find(t => t.id === userId) || null);
    }
  }, [technicians]);

  useEffect(() => {
    setCurrentPage(1);
  }, [workOrders.length, itemsPerPage]);

  const sortedWorkOrders = useMemo(() => {
    return [...workOrders].sort((a, b) => a.scheduleDate.localeCompare(b.scheduleDate));
  }, [workOrders]);

  const totalPages = Math.ceil(sortedWorkOrders.length / itemsPerPage);
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedWorkOrders.slice(start, start + itemsPerPage);
  }, [sortedWorkOrders, currentPage, itemsPerPage]);

  const handleOpenAssignDialog = useCallback((order: WorkOrder) => {
    setSelectedOrder(order);
    setRecommendation(null);
    setTechSearchQuery("");
    setIsDialogOpen(true);
  }, []);

  const handleOpenEditDialog = useCallback((order: WorkOrder) => {
    setSelectedOrder(order);
    setEditedOrder({ ...order });
    setIsEditDialogOpen(true);
  }, []);

  const handleOpenDetail = useCallback((order: WorkOrder) => {
    setDetailJob(order);
    setIsDetailOpen(true);
  }, []);

  const handleGetAiRecommendation = async () => {
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
      toast({ variant: "destructive", title: "Recommendation Failed", description: "Could not get an AI recommendation." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssign = useCallback((technicianId: string) => {
    if (!selectedOrder) return;
    const updated = allWorkOrders.map(order =>
      order.id === selectedOrder.id
        ? { ...order, status: 'assigned' as const, assignedTechnicianId: technicianId === 'unassigned' ? undefined : technicianId }
        : order
    );
    onWorkOrdersChange(updated);
    setIsDialogOpen(false);
    toast({ title: "Dispatch Confirmed", description: `Assignment ${selectedOrder.id.toUpperCase()} transmitted to operative.` });
  }, [selectedOrder, allWorkOrders, onWorkOrdersChange, toast]);

  const handleSaveChanges = () => {
    if (!editedOrder || !selectedOrder) return;
    
    let finalUpdate = { ...editedOrder };
    const payChanged = editedOrder.pay !== selectedOrder.pay || editedOrder.payType !== selectedOrder.payType;
    const payAdmin = isPayAdmin(currentUser);

    if (payChanged && !payAdmin) {
      finalUpdate.pay = selectedOrder.pay;
      finalUpdate.payType = selectedOrder.payType;
      finalUpdate.payChangeRequest = {
        pay: editedOrder.pay,
        payType: editedOrder.payType,
        requestedBy: currentUser?.id || 'unknown',
        requestedAt: new Date().toISOString()
      };
      toast({ title: "Pay Change Requested", description: "Financial modifications require authorization." });
    } else if (payChanged && payAdmin) {
      finalUpdate.payChangeRequest = undefined;
      toast({ title: "Pay Parameters Updated", description: "Financial changes authorized." });
    }

    const updated = allWorkOrders.map(order =>
      order.id === editedOrder.id ? finalUpdate : order
    );
    onWorkOrdersChange(updated);
    setIsEditDialogOpen(false);
  };

  const handleJobUpdate = useCallback((woId: string, updates: Partial<WorkOrder>) => {
    const updated = allWorkOrders.map(order => 
        order.id === woId ? { ...order, ...updates } : order
    );
    onWorkOrdersChange(updated);
    if (detailJob?.id === woId) {
        setDetailJob(prev => prev ? { ...prev, ...updates } : null);
    }
  }, [allWorkOrders, onWorkOrdersChange, detailJob]);

  const filteredTechniciansRegistry = useMemo(() => {
    return technicians
      .filter(t => !t.roles?.includes('client') && !t.role.toLowerCase().includes('client'))
      .filter(t => t.name.toLowerCase().includes(techSearchQuery.toLowerCase()))
      .sort((a, b) => b.reliabilityScore - a.reliabilityScore);
  }, [technicians, techSearchQuery]);

  return (
    <>
      <div className="table-wrap border-none rounded-none">
        <table className="tbl">
          <thead>
            <tr className="bg-bg-tertiary">
              <th className="text-center w-[160px] pl-0">Status & ID</th>
              <th className="text-left pl-0">Assignment Intelligence</th>
              <th className="text-left pl-0 w-[160px]">Schedule</th>
              <th className="text-left pl-0 w-[250px]">Site Coordinates</th>
              <th className="text-center w-[180px]">{mode === 'scheduled' || mode === 'assigned' ? 'Operative' : 'Settlement Pay'}</th>
              <th className="text-center w-[120px]"></th>
            </tr>
          </thead>
          <tbody>
            {paginatedOrders.map((order) => {
              const technician = technicians.find(t => t.id === order.assignedTechnicianId);
              return (
                <tr key={order.id} className="group hover:bg-bg-tertiary transition-colors cursor-pointer" onClick={() => handleOpenDetail(order)}>
                  <td className="pl-0 py-4">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <Badge variant={order.status === 'unassigned' ? 'pending' : order.status} className="capitalize text-[8px] h-4 px-1.5 tracking-widest">{order.status}</Badge>
                      <div className="flex items-center gap-1.5">
                        <div className="cell-id !text-[10px] font-mono font-bold group-hover:text-brand-red transition-colors">{order.id.toUpperCase()}</div>
                      </div>
                    </div>
                  </td>
                  <td className="!py-4 text-left pl-0">
                    <div className="flex flex-col min-w-0">
                      <div className="text-xs font-bold text-text-primary uppercase tracking-wide leading-tight group-hover:text-brand-red transition-colors whitespace-normal">{order.description}</div>
                      <div className="text-[10px] font-bold text-text-muted uppercase tracking-widest mt-1">{order.clientName}</div>
                    </div>
                  </td>
                  <td className="py-4">
                    <div className="flex flex-col items-start justify-center gap-1.5 pl-0">
                      <div className="flex items-center gap-2 text-[10px] text-text-secondary font-mono font-bold">
                        <Calendar size={13} className="text-text-muted shrink-0" />
                        <span>{order.scheduleDate}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-text-secondary font-mono font-bold">
                        <Clock size={13} className="text-text-muted shrink-0" />
                        <span>{order.scheduleTime}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-4">
                    <div className="flex items-center justify-start gap-2 text-[10px] text-text-secondary font-bold uppercase pl-0">
                      <MapPin size={11} className="text-brand-red shrink-0" />
                      <span className="truncate max-w-[200px]">{order.location}</span>
                    </div>
                  </td>
                  <td className="py-4">
                    <div className="flex flex-col items-center justify-center">
                        {mode === 'scheduled' || mode === 'assigned' || order.status === 'assigned' || order.status === 'completed' || order.status === 'in-progress' ? (
                        technician ? (
                            <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8 border border-border-sub shadow-sm">
                                    <AvatarImage src={technician.avatarUrl} />
                                    <AvatarFallback className="text-[10px]">{technician.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="text-left">
                                    <span className="text-[10px] font-bold text-text-primary uppercase tracking-tight leading-tight">{technician.name}</span>
                                </div>
                            </div>
                        ) : <span className="text-[10px] text-text-muted italic uppercase font-bold tracking-widest">Unallocated</span>
                        ) : (
                            <div className="flex items-center gap-1.5 text-text-green">
                                <DollarSign size={12} className="shrink-0" />
                                <div className="flex flex-col items-start leading-none">
                                    <span className="font-mono text-xs font-bold">{order.pay.toFixed(2)}</span>
                                    <span className="text-[8px] uppercase font-bold tracking-widest text-text-muted mt-0.5">{order.payType}</span>
                                </div>
                            </div>
                        )}
                    </div>
                  </td>
                  <td className="py-4">
                     <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                       {order.status === 'unassigned' && (
                         <button 
                            className="h-6 rounded bg-brand-red hover:bg-brand-red-hover px-2 text-[9px] font-bold uppercase text-white flex items-center gap-1 transition-colors"
                            onClick={() => handleOpenAssignDialog(order)}
                         >
                            <UserPlus size={10}/> Assign
                         </button>
                       )}
                       <button className="h-6 w-6 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors" onClick={() => handleOpenEditDialog(order)}>
                         <Pencil size={14} />
                       </button>
                       <button className="h-6 w-6 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors" onClick={() => handleOpenDetail(order)}>
                         <Eye size={14} />
                       </button>
                     </div>
                  </td>
                </tr>
              );
            })}
             {sortedWorkOrders.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-text-muted italic font-bold uppercase tracking-widest text-xs opacity-40">Job pool clear. Awaiting further intake.</td></tr>
            )}
          </tbody>
        </table>

        {sortedWorkOrders.length > 0 && (
          <div className="bg-bg-tertiary/50 px-4 py-3 flex items-center justify-between border-t border-border-sub">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Show</p>
                <Select value={itemsPerPage.toString()} onValueChange={(v) => setItemsPerPage(parseInt(v))}>
                  <SelectTrigger className="h-7 w-[70px] bg-bg-primary text-[10px] font-bold border-border-sub">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <Button 
                variant="outline" 
                size="icon-sm" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="h-7 w-7 border-border-sub bg-bg-primary"
              >
                <ChevronLeft size={14} />
              </Button>
              <div className="flex items-center gap-1 px-2">
                <span className="text-[10px] font-bold text-text-primary">Page {currentPage} of {totalPages}</span>
              </div>
              <Button 
                variant="outline" 
                size="icon-sm" 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="h-7 w-7 border-border-sub bg-bg-primary"
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>

      <JobDetailDialog 
        isOpen={isDetailOpen} 
        setIsOpen={setIsDetailOpen} 
        mission={detailJob} 
        onEdit={(m) => {
          setIsDetailOpen(false);
          handleOpenEditDialog(m);
        }}
        onUpdate={handleJobUpdate}
      />

      {/* Unified Dialogs Moved inside component */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[750px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[90vh]">
          <DialogHeader className="p-6 pb-2 text-left">
            <DialogTitle className="page-title text-xl flex items-center gap-2">
              <UserPlus className="text-brand-red" size={20} />
              Dispatch Terminal
            </DialogTitle>
            <p className="text-xs text-text-muted uppercase font-bold tracking-widest">Individual job deployment: <span className="text-text-primary font-bold">{selectedOrder?.id}</span></p>
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
                    <Button onClick={handleGetAiRecommendation} variant="secondary" className="w-full h-11">
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
                    <div className="rounded-lg border border-accent-gold bg-accent-gold-dim/10 p-4 animate-in fade-in slide-in-from-top-1 duration-300">
                        <p className="text-[10px] text-accent-gold font-black uppercase tracking-widest mb-1 text-left">AI Recommendation Intelligence</p>
                        <p className="text-xs text-text-primary leading-relaxed uppercase font-bold text-left">{recommendation.reasoning}</p>
                    </div>
                )}
            </div>
            <Separator className="bg-border-sub" />
            <ScrollArea className="flex-1 rounded-md border border-border-sub bg-bg-primary">
                <div className="divide-y divide-border-sub">
                    {filteredTechniciansRegistry.map(tech => {
                        const tier = getReliabilityTier(tech.reliabilityScore);
                        return (
                            <div key={tech.id} className="p-4 flex items-center justify-between group hover:bg-bg-tertiary transition-colors">
                                <div className="flex items-center gap-4">
                                    <Avatar className="h-10 w-10 border border-border-sub group-hover:border-brand-red transition-colors"><AvatarImage src={tech.avatarUrl} /></Avatar>
                                    <div className="text-left">
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs font-bold uppercase text-text-primary group-hover:border-brand-red transition-colors">{tech.name}</p>
                                            <Badge variant={getTierBadgeVariant(tier)} className="text-[7px] h-3.5 uppercase px-1.5">{tier}</Badge>
                                        </div>
                                        <div className="flex items-center gap-3 mt-1">
                                            <div className="flex items-center gap-1.5">
                                                <Gauge size={10} className="text-text-green" />
                                                <p className="text-[9px] text-text-green font-bold uppercase">{tech.reliabilityScore}% INDEX</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <Button size="sm" onClick={() => handleAssign(tech.id)} className="h-8 text-[10px] px-6 uppercase font-bold">Select</Button>
                            </div>
                        )
                    })}
                </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});

WorkOrdersTable.displayName = "WorkOrdersTable";