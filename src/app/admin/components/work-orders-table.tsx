"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import type { WorkOrder, Technician, Route } from "@/lib/types";
import { format } from "date-fns";

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
  Users,
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
  Type,
  FileText,
  RefreshCw,
  Trash2,
  Lock,
  CheckCircle2,
  Wrench,
  Target,
  Loader2,
  Timer
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCityState } from "@/lib/utils";
import { JobDetailDialog } from "@/components/job-detail-dialog";
import { isPayAdmin } from "@/lib/permissions";
import { getReliabilityTier, getTierBadgeVariant, getTierColor } from "@/lib/reliability";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, doc, updateDoc, deleteDoc, setDoc, getDocs } from 'firebase/firestore';
import { PAY_TYPE_LABELS, ID_PREFIXES } from '@/lib/constants';
import { generateId } from '@/lib/generateId';
import { computeSla, slaStatusColor, formatSlaCountdown } from '@/lib/sla';
import { auditFieldChange } from '@/lib/audit';

const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return 'TBD';
    try {
        const parts = dateStr.split(/[-/]/);
        let d: Date;
        if (parts[0].length === 4) {
            d = new Date(dateStr + 'T12:00:00');
        } else {
            const [m, day, y] = parts;
            if (y && m && day) {
                d = new Date(`${y}-${m}-${day}T12:00:00`);
            } else {
                return dateStr;
            }
        }
        return format(d, 'MM-dd-yyyy');
    } catch (e) {
        return dateStr;
    }
};

type WorkOrdersTableProps = {
  workOrders: WorkOrder[];
  allWorkOrders: WorkOrder[];
  technicians: Technician[];
  onWorkOrdersChange: (orders: WorkOrder[]) => void;
  routes: Route[];
  mode: 'unassigned' | 'scheduled' | 'assigned';
};

export const WorkOrdersTable = React.memo(({
  workOrders,
  technicians,
  mode
}: WorkOrdersTableProps) => {
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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
    return [...workOrders].sort((a, b) => (a.scheduleDate || '').localeCompare(b.scheduleDate || ''));
  }, [workOrders]);

  const totalPages = Math.ceil(sortedWorkOrders.length / (itemsPerPage || 1));
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedWorkOrders.slice(start, start + itemsPerPage);
  }, [sortedWorkOrders, currentPage, itemsPerPage]);

  const handleOpenAssignDialog = useCallback((order: WorkOrder) => {
    setSelectedOrder(order);
    setTechSearchQuery("");
    setIsDialogOpen(true);
  }, []);

  const handleOpenEditDialog = useCallback((order: WorkOrder) => {
    if (order.status === 'completed') return;
    setSelectedOrder(order);
    setEditedOrder({ ...order });
    setIsEditDialogOpen(true);
  }, []);

  const handleOpenDetail = useCallback((order: WorkOrder) => {
    setDetailJob(order);
    setIsDetailOpen(true);
  }, []);

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

  const handleAssign = useCallback(async (techId: string) => {
    if (!selectedOrder) return;

    try {
      const snapshot = await getDocs(collection(db, 'assignments'));
      const count = snapshot.size + 1;
      const shortId = `ASM-${String(count).padStart(3, '0')}`;

      const assignmentId = await generateId(ID_PREFIXES.ASSIGNMENT);
      const assignmentRef = doc(db, 'assignments', assignmentId);
      const woRef = doc(db, 'workOrders', selectedOrder.id);
      const today = format(new Date(), 'MM-dd-yyyy');

      const assignmentData = {
          ...selectedOrder,
          id: assignmentId,
          shortId: shortId,
          workOrderId: selectedOrder.id,
          techId: techId,
          assignedTechnicianId: techId,
          status: 'assigned',
          assignedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          history: [
            ...(selectedOrder.history || []),
            { type: 'status_change', date: today, details: `Job assigned to ${technicians.find(t => t.id === techId)?.name}.`, user: currentUser?.name || 'Admin' }
          ]
      };

      await setDoc(assignmentRef, assignmentData);
      await deleteDoc(woRef);

      setIsDialogOpen(false);
      setSelectedOrder(null);
      toast({ title: "Dispatch Confirmed", description: `Assignment ${shortId} initialized in deployment registry.` });
    } catch (e: any) {
      console.error("Assign Update Error:", e);
      toast({ variant: "destructive", title: "Dispatch Failed", description: e.message });
    }
  }, [selectedOrder, technicians, currentUser, toast]);

  const handleSaveChanges = () => {
    if (!editedOrder || !selectedOrder) return;
    
    let finalUpdate = { ...editedOrder };
    
    const payAdmin = isPayAdmin(currentUser);
    const payChanged = (editedOrder.pay || 0) !== (selectedOrder.pay || 0) || editedOrder.payType !== selectedOrder.payType;

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

    const today = format(new Date(), 'MM-dd-yyyy');
    finalUpdate.history = [
        ...(editedOrder.history || []),
        { type: 'note', date: today, details: `Registry parameters adjusted.`, user: currentUser?.name || 'Admin' }
    ];

    const collectionName = mode === 'unassigned' ? 'workOrders' : 'assignments';
    const docRef = doc(db, collectionName, editedOrder.id);
    updateDoc(docRef, { ...finalUpdate }).then(() => {
      const auditableFields = ['status', 'priority', 'pay', 'payType', 'scheduleDate', 'scheduleTime', 'assignedTechnicianId', 'location', 'slaResponseTarget', 'slaResolutionTarget'];
      const oldVals: Record<string, unknown> = {};
      const newVals: Record<string, unknown> = {};
      for (const f of auditableFields) {
        oldVals[f] = (selectedOrder as any)[f];
        newVals[f] = (finalUpdate as any)[f];
      }
      auditFieldChange(collectionName, editedOrder.id, currentUser?.id || 'unknown', currentUser?.name || 'Admin', oldVals, newVals).catch(console.warn);
    }).catch((e: any) => {
        console.error("Save Changes Error:", e);
        toast({ variant: "destructive", title: "Save Failed", description: e.message });
    });

    setIsEditDialogOpen(false);
    setSelectedOrder(null);
    setEditedOrder(null);
    toast({ title: "Registry Updated", description: "Job entry synchronized." });
  };

  const handleDeleteOrder = () => {
    if (!selectedOrder) return;
    const collectionName = mode === 'unassigned' ? 'workOrders' : 'assignments';
    const docRef = doc(db, collectionName, selectedOrder.id);
    deleteDoc(docRef).catch((e: any) => {
      console.error("Purge Error:", e);
      toast({ variant: "destructive", title: "Purge Failed", description: e.message });
    });
    setIsEditDialogOpen(false);
    setSelectedOrder(null);
    setEditedOrder(null);
    toast({ title: "Registry Purged", description: "Assignment removed from operational ledger." });
  };

  const handleJobUpdate = useCallback((woId: string, updates: Partial<WorkOrder>) => {
    const collectionName = mode === 'unassigned' ? 'workOrders' : 'assignments';
    const docRef = doc(db, collectionName, woId);
    updateDoc(docRef, updates).catch((e: any) => {
        console.error("Job Update Error:", e);
        toast({ variant: "destructive", title: "Update Failed", description: e.message });
    });
  }, [mode, toast]);

  const getFieldNationLink = (order: WorkOrder) => {
    const sourceId = order.workOrderId || order.id;
    const cleanId = sourceId.replace(/^wo-/, '');
    return `https://app.fieldnation.com/workorders/${cleanId}`;
  };

  return (
    <div className="w-full space-y-4">
      <div className="table-wrap border-none rounded-none overflow-x-auto">
        <table className="tbl min-w-[700px]">
          <thead>
            <tr className="bg-bg-tertiary">
              <th className="text-center w-[160px] pl-0">Status & ID</th>
              <th className="text-left pl-0">Assignment Identification</th>
              <th className="text-center w-[160px]">Schedule</th>
              <th className="text-left pl-0 w-[250px]">Site Coordinates</th>
              <th className="text-center w-[180px]">{mode === 'scheduled' || mode === 'assigned' ? 'Operative' : 'Labor Rate'}</th>
              <th className="text-center w-[120px]"></th>
            </tr>
          </thead>
          <tbody>
            {paginatedOrders.map((order) => {
              const techId = order.assignedTechnicianId || order.assignedTechIds?.[0] || order.techId;
              const technician = technicians.find(t => t.id === techId);
              const displayId = order.shortId || order.id;
              const isLocked = order.status === 'completed';
              
              return (
                <tr key={order.id} className="group hover:bg-bg-tertiary transition-colors cursor-pointer" onClick={() => handleOpenDetail(order)}>
                  <td className="pl-0 py-4">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <Badge variant={order.status === 'unassigned' ? 'pending' : order.status === 'completed' ? 'completed' : order.status === 'checked-out' ? 'checked-out' : order.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="capitalize text-[8px] h-4 px-1.5 tracking-widest">{order.status}</Badge>
                      <div className="flex items-center gap-1.5">
                        <div className="cell-id !text-[10px] font-mono font-bold group-hover:text-brand-red transition-colors">{(displayId || '').toUpperCase()}</div>
                        {order.source === 'Imported' && (
                          <a href={getFieldNationLink(order)} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-brand-red transition-colors" onClick={(e) => e.stopPropagation()}>
                            <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                      {order.status !== 'completed' && (() => {
                        const sla = computeSla(order);
                        if (sla.status === 'on-track') return null;
                        return (
                          <div className={`flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest ${slaStatusColor(sla.status)}`}>
                            <Timer size={8} />
                            {sla.status === 'breached' ? 'SLA Breached' : sla.status === 'at-risk' ? `SLA ${formatSlaCountdown(sla.hoursUntilResolutionBreach)}` : ''}
                          </div>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="!py-4 text-left pl-0">
                    <div className="flex flex-col min-w-0 text-left">
                      <div className="text-xs font-bold text-text-primary uppercase tracking-wide leading-tight group-hover:text-brand-red transition-colors whitespace-normal text-left">{order.title || order.description}</div>
                      <div className="text-[10px] font-bold text-text-muted uppercase tracking-widest mt-1 text-left">{order.clientName}</div>
                    </div>
                  </td>
                  <td className="py-4">
                    <div className="flex flex-col items-start justify-center gap-1.5 pl-0">
                      <div className="flex items-center gap-2 text-[10px] text-text-secondary font-mono font-bold">
                        <Calendar size={13} className="text-text-muted shrink-0" />
                        <span>{formatDateDisplay(order.scheduleDate)}</span>
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
                      <span className="truncate max-w-[200px] text-left">{formatCityState(order.location)}</span>
                    </div>
                  </td>
                  <td className="py-4">
                    <div className="flex flex-col items-center justify-center">
                        {mode === 'scheduled' || mode === 'assigned' || order.status === 'assigned' || order.status === 'completed' || order.status === 'in-progress' ? (
                        technician ? (
                            <div className="flex items-center gap-3 text-left">
                                <Avatar className="h-8 w-8 border border-border-sub shadow-sm">
                                    <AvatarImage src={technician.avatarUrl} />
                                    <AvatarFallback className="text-[10px]">{(technician.name || 'U').charAt(0)}</AvatarFallback>
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
                            <div className="flex flex-col items-start leading-none text-left">
                                {order.payType === 'blended' ? (
                                    <>
                                        <span className="font-mono text-xs font-bold text-text-green text-left">
                                            ${(order.blendedFixedPay || 0).toFixed(2)} + ${(order.blendedHourlyRate || 0).toFixed(2)}/hr
                                        </span>
                                        <span className="text-[8px] uppercase font-bold tracking-widest text-text-muted mt-0.5 text-left">
                                            after {order.blendedIncludedHours} hrs
                                        </span>
                                    </>
                                ) : order.payType === 'hourly' ? (
                                    <>
                                        <span className="font-mono text-xs font-bold text-text-green text-left">${order.pay.toFixed(2)}/hr</span>
                                        <span className="text-[8px] uppercase font-bold tracking-widest text-text-muted mt-0.5 text-left">hourly labor rate</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="font-mono text-xs font-bold text-text-green text-left">${order.pay.toFixed(2)}</span>
                                        <span className="text-[8px] uppercase font-bold tracking-widest text-text-muted mt-0.5 text-left">fixed labor rate</span>
                                    </>
                                )}
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
                       {!isLocked ? (
                          <button className="h-6 w-6 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors" onClick={() => handleOpenEditDialog(order)}>
                            <Pencil size={14} />
                          </button>
                       ) : (
                          <div className="h-6 w-6 flex items-center justify-center text-text-muted opacity-30" title="Historical Record Locked">
                            <Lock size={12} />
                          </div>
                       )}
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
            <div className="flex items-center gap-4 text-left">
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[85vh]">
          <DialogHeader className="p-6 pb-2 text-left border-b border-border-sub bg-bg-tertiary/30 text-left">
            <div className="flex items-center justify-between">
                <div className="text-left">
                    <DialogTitle className="text-xl font-bold uppercase tracking-widest flex items-center gap-2">
                        <UserPlus className="text-brand-red" size={20} />
                        Dispatch Terminal
                    </DialogTitle>
                    <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest mt-1">Manual operative allocation: <span className="text-text-primary font-bold">{(selectedOrder?.id || '').toUpperCase()}</span></p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[8px] bg-bg-primary border-border-sub px-2 h-4 uppercase">{selectedOrder?.projectType}</Badge>
                    <Badge variant={selectedOrder?.priority === 'critical' ? 'high' : 'outline'} className="text-[8px] h-4 uppercase">{selectedOrder?.priority}</Badge>
                </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-hidden px-6 pb-6 space-y-6 mt-4">
             <div className="space-y-4 text-left">
                <h3 className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-1.5 flex items-center gap-2">
                    <Target size={14} className="text-brand-red"/> Mission Parameters
                </h3>
                <div className="p-4 rounded-xl bg-bg-secondary border border-border-sub shadow-inner">
                    <div className="space-y-1">
                        <p className="text-[8px] font-black text-text-muted uppercase">Required Credentials</p>
                        <div className="flex flex-wrap gap-1.5">
                            {selectedOrder?.requiredSkills?.map(skill => (
                                <Badge key={skill} variant="outline" className="text-[7px] font-bold uppercase bg-bg-primary">{skill}</Badge>
                            )) || <span className="text-[9px] text-text-muted italic uppercase">No skill constraints logged</span>}
                        </div>
                    </div>
                    <div className="space-y-1 pt-2">
                        <p className="text-[8px] font-black text-text-muted uppercase">Tactical Objective</p>
                        <p className="text-[11px] font-bold text-text-primary uppercase leading-tight line-clamp-2">
                            {selectedOrder?.title || selectedOrder?.description}
                        </p>
                    </div>
                </div>
             </div>

             <Separator className="bg-border-sub" />

             <div className="space-y-3 text-left">
                <div className="flex items-center justify-between px-1">
                    <h3 className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                        <Users size={14} className="text-brand-red"/> Field Operative Registry
                    </h3>
                    <div className="relative w-[240px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
                        <Input 
                            placeholder="Filter registry..." 
                            value={techSearchQuery}
                            onChange={(e) => setTechSearchQuery(e.target.value)}
                            className="bg-bg-primary h-8 pl-8 text-[10px] uppercase font-bold tracking-wide"
                        />
                    </div>
                </div>
                <ScrollArea className="h-[250px] rounded-xl border border-border-sub bg-bg-primary shadow-inner">
                    <div className="divide-y divide-border-sub">
                        {filteredTechniciansRegistry.map(tech => {
                            const tier = getReliabilityTier(tech.reliabilityScore || 0);
                            const tierColor = getTierColor(tier);

                            return (
                                <div key={tech.id} className="p-4 flex items-center justify-between group transition-all hover:bg-bg-tertiary">
                                    <div className="flex items-center gap-4 text-left">
                                        <Avatar className="h-10 w-10 border border-border-sub transition-all group-hover:scale-105">
                                          <AvatarImage src={tech.avatarUrl} />
                                          <AvatarFallback>{(tech.name || 'U').charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div className="text-left">
                                            <div className="flex items-center gap-2">
                                                <p className="text-xs font-black uppercase tracking-tight text-left">{tech.name}</p>
                                                <Badge variant={getTierBadgeVariant(tier)} className="text-[7px] h-3.5 uppercase px-1.5">{tier}</Badge>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    <Gauge size={10} className={tierColor} />
                                                    <p className={cn("text-[9px] font-black uppercase", tierColor)}>{tech.reliabilityScore || 0}% INDEX</p>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <Navigation size={10} className="text-text-muted" />
                                                    <p className="text-[9px] text-text-muted font-bold uppercase truncate max-w-[120px]">{tech.address || tech.currentLocation}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <Button 
                                        size="sm" 
                                        onClick={() => handleAssign(tech.id)} 
                                        className="h-9 text-[10px] px-8 uppercase font-black tracking-widest bg-bg-tertiary text-text-muted hover:bg-brand-red hover:text-white"
                                    >
                                        Deploy
                                    </Button>
                                </div>
                            )
                        })}
                    </div>
                </ScrollArea>
             </div>
          </div>

          <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default shrink-0">
             <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full h-11 uppercase font-bold text-[10px] tracking-widest">Abort Dispatch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={(open) => { if(!open) { setSelectedOrder(null); setEditedOrder(null); } setIsEditDialogOpen(open); }}>
        <DialogContent className="sm:max-w-[750px] bg-bg-elevated border-border-default max-h-[90vh] overflow-hidden flex flex-col p-0 shadow-2xl">
            <DialogHeader className="p-6 pb-2 text-left border-b border-border-sub bg-bg-tertiary/30 text-left">
                <div className="flex items-center justify-between">
                    <div className="space-y-1 text-left">
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Update Parameters</DialogTitle>
                        <p className="text-xs text-text-muted text-left">Adjust manual parameters for record <span className="font-bold text-text-primary">{selectedOrder?.id.toUpperCase()}</span></p>
                    </div>
                </div>
            </DialogHeader>
            {editedOrder && (
                <ScrollArea className="flex-1">
                    <div className="px-6 py-4 space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                                  <Type size={12} className="text-brand-red"/> Job Title
                                </Label>
                                <Input placeholder="e.g. Network Audit" value={editedOrder.title || ''} onChange={(e) => setEditedOrder({...editedOrder, title: e.target.value})} className="bg-bg-primary border-border-sub h-10 text-xs font-bold uppercase" />
                            </div>
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                                  <FileText size={12} className="text-accent-gold"/> Scope of Work
                                </Label>
                                <Textarea placeholder="Detailed requirements..." value={editedOrder.description || ''} onChange={(e) => setEditedOrder({...editedOrder, description: e.target.value})} className="bg-bg-primary border-border-sub h-24 text-xs" />
                            </div>
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
                                <Input type="date" value={editedOrder.scheduleDate || ''} onChange={(e) => setEditedOrder({...editedOrder, scheduleDate: e.target.value})} className="h-10 bg-bg-primary text-xs" />
                            </div>
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Start Window</Label>
                                <Input placeholder="e.g. 10:00 AM EST" value={editedOrder.scheduleTime || ''} onChange={(e) => setEditedOrder({...editedOrder, scheduleTime: e.target.value})} className="h-10 bg-bg-primary h-10 text-xs" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Pay Model</Label>
                                <Select value={editedOrder.payType} onValueChange={(val: any) => setEditedOrder({...editedOrder, payType: val})}>
                                    <SelectTrigger className="h-10 bg-bg-primary text-xs uppercase font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="fixed" className="text-xs uppercase font-bold">{PAY_TYPE_LABELS.fixed}</SelectItem>
                                        <SelectItem value="hourly" className="text-xs font-bold">{PAY_TYPE_LABELS.hourly}</SelectItem>
                                        <SelectItem value="blended" className="text-xs font-bold">{PAY_TYPE_LABELS.blended}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {editedOrder.payType !== 'blended' && (
                                <div className="space-y-2 text-left">
                                  <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Labor Rate ($)</Label>
                                  <Input type="number" value={editedOrder.pay || 0} onChange={(e) => setEditedOrder({...editedOrder, pay: parseFloat(e.target.value) || 0})} className="bg-bg-primary h-10 text-xs font-mono text-text-green" />
                                </div>
                            )}
                        </div>

                        {editedOrder.payType === 'blended' && (
                            <div className="grid grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2 duration-300 p-3 rounded-lg border border-border-sub bg-bg-secondary/50 text-left">
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
                                            className="bg-bg-primary h-9 font-mono text-text-green text-[11px]"
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
            <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default mt-4 shrink-0 flex flex-row items-center justify-between gap-3">
                <Button variant="destructive-outline" onClick={handleDeleteOrder} className="h-11 px-8 uppercase font-bold text-[10px] tracking-widest border-brand-red text-text-red hover:bg-brand-red-dim">
                    <Trash2 size={16} className="mr-2" />
                    Delete
                </Button>
                <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="h-11 px-8 uppercase font-bold text-[10px] tracking-widest">Cancel</Button>
                    <Button onClick={handleSaveChanges} className="h-11 px-10 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest text-white shadow-lg">
                        Commit Registry Updates
                    </Button>
                </div>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

WorkOrdersTable.displayName = "WorkOrdersTable";
