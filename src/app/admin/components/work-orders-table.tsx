"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import type { WorkOrder, Technician, Recommendation, Route } from "@/lib/types";
import { getRecommendation } from "../dispatch/actions";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  Gauge,
  Sparkles,
  Trash2
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { JobDetailDialog } from "@/components/job-detail-dialog";
import { isPayAdmin } from "@/lib/permissions";
import { getReliabilityTier, getTierBadgeVariant } from "@/lib/reliability";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, doc, updateDoc, deleteDoc } from 'firebase/firestore';

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
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [techSearchQuery, setTechSearchQuery] = useState("");

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
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
    return [...workOrders].sort((a, b) => (a.scheduleDate || '').localeCompare(b.scheduleDate || ''));
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
    setIsAiLoading(true);
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
          name: t.name || 'Unknown',
          currentLocation: t.currentLocation || 'Detroit, MI',
          reliabilityScore: t.reliabilityScore || 0,
          currentWorkload: t.currentWorkload || 0,
          skills: t.skills || [],
        })),
      });
      setRecommendation(result);
    } catch (error) {
      toast({ variant: "destructive", title: "Recommendation Failed", description: "Could not get an AI recommendation." });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAssign = useCallback(async (technicianId: string) => {
    if (!selectedOrder) return;
    try {
        const docRef = doc(db, 'workOrders', selectedOrder.id);
        await updateDoc(docRef, {
            status: 'assigned',
            assignedTechnicianId: technicianId === 'unassigned' ? null : technicianId
        });
        setIsDialogOpen(false);
        setSelectedOrder(null);
        toast({ title: "Dispatch Confirmed", description: `Assignment ${selectedOrder.id.toUpperCase()} transmitted to operative.` });
    } catch (e: any) {
        toast({ variant: "destructive", title: "Dispatch Failed", description: e.message });
    }
  }, [selectedOrder, toast]);

  const handleSaveChanges = async () => {
    if (!editedOrder || !selectedOrder) return;
    
    let finalUpdate = { ...editedOrder };
    const payChanged = (editedOrder.pay || 0) !== (selectedOrder.pay || 0) || editedOrder.payType !== selectedOrder.payType;
    const payAdmin = isPayAdmin(currentUser);

    if (payChanged && !payAdmin) {
      finalUpdate.pay = selectedOrder.pay;
      finalUpdate.payType = selectedOrder.payType;
      finalUpdate.payChangeRequest = {
        pay: editedOrder.pay || 0,
        payType: editedOrder.payType || 'fixed',
        requestedBy: currentUser?.id || 'unknown',
        requestedAt: new Date().toISOString()
      };
      toast({ title: "Pay Change Requested", description: "Financial modifications require authorization." });
    }

    try {
        const docRef = doc(db, 'workOrders', editedOrder.id);
        await updateDoc(docRef, { ...finalUpdate });
        setIsEditDialogOpen(false);
        setSelectedOrder(null);
        setEditedOrder(null);
        if (payChanged && payAdmin) {
            toast({ title: "Pay Parameters Updated", description: "Financial changes authorized." });
        } else {
            toast({ title: "Registry Updated", description: "Job entry synchronized." });
        }
    } catch (e: any) {
        toast({ variant: "destructive", title: "Save Failed", description: e.message });
    }
  };

  const handleDeleteOrder = async () => {
    if (!selectedOrder) return;
    try {
        const orderId = selectedOrder.id;
        await deleteDoc(doc(db, 'workOrders', orderId));
        setIsEditDialogOpen(false);
        setIsDeleteDialogOpen(false);
        setSelectedOrder(null);
        setEditedOrder(null);
        toast({ title: "Registry Purged", description: `Mission ${orderId.toUpperCase()} has been removed from the registry.` });
    } catch (e: any) {
        toast({ variant: "destructive", title: "Purge Failed", description: e.message });
    }
  };

  const handleJobUpdate = useCallback(async (woId: string, updates: Partial<WorkOrder>) => {
    try {
        const docRef = doc(db, 'workOrders', woId);
        await updateDoc(docRef, updates);
    } catch (e: any) {
        toast({ variant: "destructive", title: "Update Failed", description: e.message });
    }
  }, [toast]);

  const filteredTechniciansRegistry = useMemo(() => {
    return technicians
      .filter(t => {
          const roles = t.roles || [];
          const role = (t.role || '').toLowerCase();
          return !roles.includes('client') && !role.includes('client');
      })
      .filter(t => (t.name || '').toLowerCase().includes(techSearchQuery.toLowerCase()))
      .sort((a, b) => (b.reliabilityScore || 0) - (a.reliabilityScore || 0));
  }, [technicians, techSearchQuery]);

  return (
    <>
      <div className="table-wrap border-none rounded-none">
        <table className="tbl">
          <thead>
            <tr className="bg-bg-tertiary">
              <th className="text-center w-[160px] pl-0">Status & ID</th>
              <th className="text-left pl-0">Assignment Identification</th>
              <th className="text-center w-[160px]">Schedule</th>
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
                    <div className="flex items-center justify-start gap-2 text-[10px] text-text-secondary font-bold uppercase pl-0 text-left">
                      <MapPin size={11} className="text-brand-red shrink-0" />
                      <span className="truncate max-w-[200px]">{order.location}</span>
                    </div>
                  </td>
                  <td className="py-4">
                    <div className="flex flex-col items-center justify-center">
                        {mode === 'scheduled' || mode === 'assigned' || order.status === 'assigned' || order.status === 'completed' || order.status === 'in-progress' ? (
                        technician ? (
                            <div className="flex items-center gap-3 text-left">
                                <Avatar className="h-8 w-8 border border-border-sub shadow-sm">
                                    <AvatarImage src={technician.avatarUrl} />
                                    <AvatarFallback className="text-[10px]">{technician.name ? technician.name.charAt(0) : 'U'}</AvatarFallback>
                                </Avatar>
                                <div className="text-left">
                                    <span className="text-[10px] font-bold text-text-primary uppercase tracking-tight leading-tight">{technician.name}</span>
                                </div>
                            </div>
                        ) : (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 !text-[10px] border-brand-red text-brand-red hover:bg-brand-red-dim uppercase font-bold tracking-widest"
                            onClick={(e) => { e.stopPropagation(); handleOpenAssignDialog(order); }}
                          >
                            <UserPlus size={14} className="mr-1.5"/> Assign
                          </Button>
                        )
                        ) : (
                            <div className="flex items-center gap-1.5 text-text-green text-left">
                                <DollarSign size={12} className="shrink-0" />
                                <div className="flex flex-col items-start leading-none text-left">
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
              <div className="flex items-center gap-1 px-2 text-left">
                <span className="text-[10px] font-bold text-text-primary uppercase tracking-widest">Page {currentPage} of {totalPages}</span>
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

      <Dialog open={isDialogOpen} onOpenChange={(open) => { if(!open) setSelectedOrder(null); setIsDialogOpen(open); }}>
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
                {!recommendation && !isAiLoading && (
                    <Button onClick={handleGetAiRecommendation} variant="secondary" className="w-full h-11">
                        <User className="mr-2 h-4 w-4"/> Initialize AI Dispatch Analysis
                    </Button>
                )}
                {isAiLoading && (
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
                        const tier = getReliabilityTier(tech.reliabilityScore || 0);
                        return (
                            <div key={tech.id} className="p-4 flex items-center justify-between group hover:bg-bg-tertiary transition-colors">
                                <div className="flex items-center gap-4 text-left">
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

      <Dialog open={isEditDialogOpen} onOpenChange={(open) => { if(!open) { setSelectedOrder(null); setEditedOrder(null); } setIsEditDialogOpen(open); }}>
        <DialogContent className="sm:max-w-[750px] bg-bg-elevated border-border-default max-h-[90vh] overflow-hidden flex flex-col p-0 shadow-2xl">
            <DialogHeader className="p-6 pb-2 text-left border-b border-border-sub bg-bg-tertiary/30">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Update Assignment Parameters</DialogTitle>
                        <p className="text-xs text-text-muted">Adjust manual parameters for assignment <span className="font-bold text-text-primary">{selectedOrder?.id.toUpperCase()}</span></p>
                    </div>
                    <Button 
                        variant="destructive-outline" 
                        size="sm" 
                        className="h-8 text-[9px] font-bold uppercase tracking-widest"
                        onClick={() => setIsDeleteDialogOpen(true)}
                    >
                        <Trash2 size={14} className="mr-1.5"/> Purge Registry Entry
                    </Button>
                </div>
            </DialogHeader>
            {editedOrder && (
                <ScrollArea className="flex-1">
                    <div className="px-6 py-4 space-y-6">
                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Job Title / Description</Label>
                            <Textarea placeholder="Primary objective..." value={editedOrder.description || ''} onChange={(e) => setEditedOrder({...editedOrder, description: e.target.value})} className="bg-bg-primary border-border-sub h-20 text-xs" />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Client / Entity</Label>
                                <Input value={editedOrder.clientName || ''} onChange={(e) => setEditedOrder({...editedOrder, clientName: e.target.value})} className="bg-bg-primary h-10 text-xs font-bold uppercase" />
                            </div>
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Site Location</Label>
                                <Input value={editedOrder.location || ''} onChange={(e) => setEditedOrder({...editedOrder, location: e.target.value})} className="bg-bg-primary h-10 text-xs" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Service Category</Label>
                                <Select value={editedOrder.projectType} onValueChange={(val) => setEditedOrder({...editedOrder, projectType: val})}>
                                    <SelectTrigger className="h-10 bg-bg-primary text-xs uppercase font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Installation">Installation</SelectItem>
                                        <SelectItem value="Troubleshooting">Troubleshooting</SelectItem>
                                        <SelectItem value="Maintenance">Maintenance</SelectItem>
                                        <SelectItem value="Survey">Survey</SelectItem>
                                        <SelectItem value="Repair">Repair</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Priority Level</Label>
                                <Select value={editedOrder.priority} onValueChange={(val: any) => setEditedOrder({...editedOrder, priority: val})}>
                                    <SelectTrigger className="h-10 bg-bg-primary text-xs uppercase font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                        <SelectItem value="critical">Critical</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Schedule Date</Label>
                                <Input type="date" value={editedOrder.scheduleDate || ''} onChange={(e) => setEditedOrder({...editedOrder, scheduleDate: e.target.value})} className="bg-bg-primary h-10 text-xs" />
                            </div>
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Start Window</Label>
                                <Input placeholder="e.g. 10:00 AM EST" value={editedOrder.scheduleTime || ''} onChange={(e) => setEditedOrder({...editedOrder, scheduleTime: e.target.value})} className="bg-bg-primary h-10 text-xs" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Pay Model</Label>
                                <Select value={editedOrder.payType} onValueChange={(val: any) => setEditedOrder({...editedOrder, payType: val})}>
                                    <SelectTrigger className="h-10 bg-bg-primary text-xs uppercase font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="fixed">Fixed</SelectItem>
                                        <SelectItem value="hourly">Hourly</SelectItem>
                                        <SelectItem value="blended">Blended</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {editedOrder.payType !== 'blended' && (
                                <div className="space-y-2 text-left">
                                  <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Settlement Pay ($)</Label>
                                  <Input type="number" value={editedOrder.pay || 0} onChange={(e) => setEditedOrder({...editedOrder, pay: parseFloat(e.target.value) || 0})} className="bg-bg-primary h-10 text-xs font-mono text-text-green" />
                                </div>
                            )}
                        </div>

                        {editedOrder.payType === 'blended' && (
                            <div className="grid grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2 duration-300 p-3 rounded-lg border border-border-sub bg-bg-secondary/50">
                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Fixed Base ($)</Label>
                                    <div className="relative">
                                        <DollarSign size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                                        <Input 
                                            type="number"
                                            value={editedOrder.blendedFixedPay || ''}
                                            onChange={(e) => {
                                              const val = parseFloat(e.target.value) || 0;
                                              setEditedOrder({...editedOrder, blendedFixedPay: val, pay: val});
                                            }}
                                            className="bg-bg-primary h-9 pl-6 font-mono text-text-green text-[11px]"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Incl. Hours</Label>
                                    <Input 
                                        type="number"
                                        value={editedOrder.blendedIncludedHours || ''}
                                        onChange={(e) => setEditedOrder({...editedOrder, blendedIncludedHours: parseFloat(e.target.value) || 0})}
                                        className="bg-bg-primary h-9 font-mono text-text-primary text-[11px]"
                                    />
                                </div>
                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Post Rate ($/hr)</Label>
                                    <div className="relative">
                                        <DollarSign size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                                        <Input 
                                            type="number"
                                            value={editedOrder.blendedHourlyRate || ''}
                                            onChange={(e) => setEditedOrder({...editedOrder, blendedHourlyRate: parseFloat(e.target.value) || 0})}
                                            className="bg-bg-primary h-9 pl-6 font-mono text-text-green text-[11px]"
                                        />
                                    </div>
                                </div>
                                <p className="col-span-3 text-[9px] text-text-muted uppercase font-bold italic tracking-tighter text-left">Fixed amount for specified hours, then hourly rate applies.</p>
                            </div>
                        )}

                        <Separator className="bg-border-sub" />

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] uppercase font-bold text-text-muted ml-1 text-center block">Technician Allocation</Label>
                                <Select value={editedOrder.assignedTechnicianId || 'unassigned'} onValueChange={(val) => setEditedOrder({ ...editedOrder, assignedTechnicianId: val === 'unassigned' ? undefined : val, status: val === 'unassigned' ? 'unassigned' : 'assigned' })}>
                                    <SelectTrigger className="bg-bg-primary h-11 focus:ring-brand-red text-xs">
                                        <SelectValue placeholder="Select Technician" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unassigned" className="text-brand-red font-bold uppercase tracking-widest">UNASSIGNED</SelectItem>
                                        {technicians.filter(t => !t.roles?.includes('client')).map(tech => <SelectItem key={tech.id} value={tech.id} className="text-xs uppercase font-bold">{tech.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] uppercase font-bold text-text-muted ml-1 text-center block">Operational Status</Label>
                                <Select value={editedOrder.status} onValueChange={(val: any) => setEditedOrder({ ...editedOrder, status: val })}>
                                    <SelectTrigger className="bg-bg-primary h-11 uppercase font-bold tracking-wider focus:ring-brand-red text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unassigned" className="text-xs uppercase font-bold">UNASSIGNED</SelectItem>
                                        <SelectItem value="assigned" className="text-xs uppercase font-bold">ASSIGNED</SelectItem>
                                        <SelectItem value="confirmed" className="text-xs uppercase font-bold">CONFIRMED</SelectItem>
                                        <SelectItem value="on-my-way" className="text-xs uppercase font-bold">ON MY WAY</SelectItem>
                                        <SelectItem value="in-progress" className="text-xs uppercase font-bold">IN PROGRESS</SelectItem>
                                        <SelectItem value="completed" className="text-xs uppercase font-bold">COMPLETED</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            )}
            <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default mt-4 shrink-0">
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="h-11 px-8 uppercase font-bold text-[10px] tracking-widest">Cancel</Button>
                <Button onClick={handleSaveChanges} className="h-11 px-10 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest text-white">Commit Registry Updates</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-bg-elevated border-border-default shadow-2xl">
            <AlertDialogHeader className="text-left">
                <AlertDialogTitle className="uppercase tracking-widest font-bold flex items-center gap-2">
                    <ShieldCheck className="text-brand-red" size={18}/>
                    Authorize Registry Purge
                </AlertDialogTitle>
                <AlertDialogDescription className="text-xs leading-relaxed uppercase font-medium">
                    Critical Action: This will permanently remove assignment <span className="text-text-primary font-bold">{selectedOrder?.id.toUpperCase()}</span> from the operational ledger. This operation cannot be reversed.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel className="text-[10px] font-bold uppercase tracking-widest">Abort</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteOrder} className="bg-brand-red hover:bg-brand-red-hover text-[10px] font-bold uppercase tracking-widest">
                    Confirm Purge
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

WorkOrdersTable.displayName = "WorkOrdersTable";
