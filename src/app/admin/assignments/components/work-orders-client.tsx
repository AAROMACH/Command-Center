
"use client";

import { useState, useMemo, useEffect } from "react";
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
  Briefcase,
  Calendar,
  Clock,
  MapPin,
  Pencil,
  UserPlus,
  Layers,
  DollarSign,
  User,
  Search,
  Building2,
  Check,
  Users,
  Navigation,
  Eye,
  ShieldCheck,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/avatar";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { JobDetailDialog } from "@/components/job-detail-dialog";
import { isPayAdmin } from "@/lib/permissions";

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

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editedOrder, setEditedOrder] = useState<WorkOrder | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Registry Popup States for Edit Flow
  const [isRegistryOpen, setIsRegistryOpen] = useState(false);
  const [isSiteRegistryOpen, setIsSiteRegistryOpen] = useState(false);
  const [registrySearch, setRegistrySearch] = useState("");

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

  // Reset page when data changes
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
    setDetailJob(order);
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
      title: "Dispatch Confirmed",
      description: `Assignment ${selectedOrder.id.toUpperCase()} transmitted to operative.`,
    });
  }

  const handleSaveChanges = () => {
    if (!editedOrder || !selectedOrder) return;
    
    let finalUpdate = { ...editedOrder };
    const payChanged = editedOrder.pay !== selectedOrder.pay || editedOrder.payType !== selectedOrder.payType;
    const payAdmin = isPayAdmin(currentUser);

    if (payChanged && !payAdmin) {
      // Revert pay on the master object but add a request
      finalUpdate.pay = selectedOrder.pay;
      finalUpdate.payType = selectedOrder.payType;
      finalUpdate.payChangeRequest = {
        pay: editedOrder.pay,
        payType: editedOrder.payType,
        requestedBy: currentUser?.id || 'unknown',
        requestedAt: new Date().toISOString()
      };
      toast({
        title: "Pay Change Requested",
        description: "Financial modifications require Super Admin or Payroll Admin authorization. Request staged.",
      });
    } else if (payChanged && payAdmin) {
      // Direct update and clear any pending
      finalUpdate.payChangeRequest = undefined;
      toast({ title: "Pay Parameters Updated", description: "Financial changes authorized and committed." });
    }

    const updated = allWorkOrders.map(order =>
      order.id === editedOrder.id ? finalUpdate : order
    );
    onWorkOrdersChange(updated);
    setIsEditDialogOpen(false);
  };

  const handleApprovePay = (orderId: string) => {
    const order = allWorkOrders.find(o => o.id === orderId);
    if (!order?.payChangeRequest) return;

    const updated = allWorkOrders.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          pay: o.payChangeRequest!.pay,
          payType: o.payChangeRequest!.payType,
          payChangeRequest: undefined,
          history: [
            ...(o.history || []),
            { type: 'note' as const, date: new Date().toISOString().split('T')[0], details: `Pay change approved. New rate: $${o.payChangeRequest!.pay}`, user: currentUser?.name || 'Super Admin' }
          ]
        };
      }
      return o;
    });

    onWorkOrdersChange(updated);
    toast({ title: "Pay Authorized", description: "Technician terminal updated with new settlement rate." });
  };

  const filteredTechnicians = useMemo(() => {
    return technicians
      .filter(t => !t.roles?.includes('client') && !t.role.toLowerCase().includes('client'))
      .filter(t => t.name.toLowerCase().includes(techSearchQuery.toLowerCase()))
      .map(tech => {
        // Simple distance simulation
        const charSum = (str: string) => str.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        const seed = Math.abs(charSum(tech.id) - charSum(selectedOrder?.id || ''));
        return { ...tech, distance: (seed % 35) + 1.2 };
      }).sort((a, b) => a.distance - b.distance);
  }, [technicians, selectedOrder, techSearchQuery]);

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return 'TBD';
    try {
      const parts = dateStr.split(/[-/]/);
      if (parts.length === 3) {
          let m, d, y;
          if (parts[0].length === 4) { [y, m, d] = parts; } else { [m, d, y] = parts; }
          return `${m}-${d}-${y}`;
      }
      return dateStr;
    } catch (e) {
      return dateStr;
    }
  };

  const getFieldNationLink = (id: string) => {
    const cleanId = id.replace(/^wo-/, '');
    return `https://app.fieldnation.com/workorders/${cleanId}`;
  };

  // Registry Selection Logic
  const clients = useMemo(() => {
    return technicians.filter(t => 
        t.roles?.includes('client') || 
        t.role.toLowerCase().includes('client') || 
        t.clientCompany
    );
  }, []);

  const selectedClient = useMemo(() => {
    return clients.find(c => (c.clientCompany || c.name) === editedOrder?.clientName);
  }, [editedOrder?.clientName, clients]);

  const filteredRegistry = useMemo(() => {
    return clients.filter(c => 
        (c.clientCompany || '').toLowerCase().includes(registrySearch.toLowerCase()) ||
        c.name.toLowerCase().includes(registrySearch.toLowerCase()) ||
        c.id.toLowerCase().includes(registrySearch.toLowerCase())
    );
  }, [registrySearch, clients]);

  const selectClientFromRegistry = (client: Technician) => {
    const name = client.clientCompany || client.name;
    if (editedOrder) {
        setEditedOrder({
            ...editedOrder,
            clientName: name,
            location: '' 
        });
    }
    setIsRegistryOpen(false);
  };

  const selectSiteFromRegistry = (site: { name: string, location: string }) => {
    if (editedOrder) {
        setEditedOrder({ ...editedOrder, location: site.location });
    }
    setIsSiteRegistryOpen(false);
  };

  return (
    <>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: "500px" }} className="text-center">Assignment & Identification</th>
              <th style={{ width: "160px" }} className="text-center">Schedule</th>
              <th style={{ width: "140px" }} className="text-center">Route Status</th>
              <th style={{ width: "250px" }} className="text-center">Site Coordinates</th>
              <th style={{ width: "160px" }} className="text-center">{mode === 'scheduled' ? 'Operative' : 'Settlement Pay'}</th>
              <th style={{ width: "140px" }} className="text-center"></th>
            </tr>
          </thead>
          <tbody>
            {paginatedOrders.map((order) => {
              const technician = technicians.find(t => t.id === order.assignedTechnicianId);
              const route = routes.find(r => r.id === order.routeId);
              return (
                <tr key={order.id}>
                  <td className="!py-3">
                    <div className="flex items-center gap-4 px-4">
                      <div className="flex flex-col items-center gap-1.5 shrink-0">
                        <div className="flex items-center gap-1.5">
                            <div className="cell-id !text-[10px] font-mono">{order.id.toUpperCase()}</div>
                            {order.source === 'Imported' && (
                                <a href={getFieldNationLink(order.id)} target="_blank" rel="noopener noreferrer" title="View on FieldNation" className="text-text-muted hover:text-brand-red transition-colors">
                                    <ExternalLink size={10} />
                                </a>
                            )}
                        </div>
                        <Badge variant={order.status === 'unassigned' ? 'pending' : order.status} className="capitalize text-[8px] h-4 px-1.5">{order.status}</Badge>
                      </div>
                      <div className="flex flex-col items-start text-left min-w-0">
                        <div className="text-xs font-bold text-text-primary uppercase tracking-wide leading-tight">{order.description}</div>
                        <div className="flex items-center gap-1.5 mt-1 text-[9px] text-text-muted font-bold uppercase tracking-widest">
                          <Briefcase className="h-2.5 w-2.5" />
                          <span>{order.clientName}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="cell-sched">
                      <div className="cell-sched-date font-mono"><Calendar />{formatDateDisplay(order.scheduleDate)}</div>
                      <div className="cell-sched-time font-mono"><Clock />{order.scheduleTime}</div>
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-col items-center justify-center">
                      {route ? (
                          <Badge variant="outline" className="bg-bg-tertiary border-accent-gold/30 text-accent-gold text-[8px] uppercase tracking-widest gap-1 h-4 px-1.5">
                              <Layers size={10}/> {route.name}
                          </Badge>
                      ) : (
                          <span className="text-[10px] text-text-muted italic uppercase font-bold tracking-tighter">Unallocated</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center justify-center gap-2 text-[10px] text-text-secondary font-bold uppercase">
                      <MapPin size={10} className="text-brand-red shrink-0" />
                      <span className="px-1 text-center">{order.location}</span>
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-col items-center justify-center">
                        {mode === 'scheduled' || order.status === 'assigned' || order.status === 'completed' || order.status === 'in-progress' ? (
                        technician ? (
                            <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8 border border-border-sub">
                                    <AvatarImage src={technician.avatarUrl} />
                                    <AvatarFallback>{technician.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="text-left">
                                    <span className="text-[10px] font-bold text-text-primary uppercase tracking-tight leading-tight">{technician.name}</span>
                                </div>
                            </div>
                        ) : <span className="text-[10px] text-text-muted italic uppercase">Unallocated</span>
                        ) : (
                            <div className="flex items-center gap-1.5 text-text-green">
                                <DollarSign size={12} />
                                <div className="flex flex-col items-start leading-none">
                                    <span className="font-mono text-xs font-bold">{order.pay.toFixed(2)}</span>
                                    <span className="text-[8px] uppercase font-bold tracking-widest text-text-muted mt-0.5">{order.payType}</span>
                                </div>
                            </div>
                        )}
                        {order.payChangeRequest && (
                            <Badge variant="missed" className="mt-1 text-[7px] uppercase tracking-widest h-3.5 gap-1">
                                <AlertTriangle size={8}/> Pending
                            </Badge>
                        )}
                    </div>
                  </td>
                  <td>
                     <div className="flex items-center justify-center gap-1">
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

        {/* REGISTRY PAGINATION CONTROLS */}
        {sortedWorkOrders.length > 0 && (
          <div className="bg-bg-tertiary/50 px-4 py-3 flex items-center justify-between border-t border-border-sub">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Show</p>
                <Select value={itemsPerPage.toString()} onValueChange={(v) => setItemsPerPage(parseInt(v))}>
                  <SelectTrigger className="h-7 w-[70px] bg-bg-primary text-[10px] font-bold border-border-sub">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                Showing <span className="text-text-primary">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-text-primary">{Math.min(currentPage * itemsPerPage, sortedWorkOrders.length)}</span> of <span className="text-text-primary">{sortedWorkOrders.length}</span> entries
              </p>
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
                <span className="text-[10px] font-bold text-text-primary">Page {currentPage}</span>
                <span className="text-[10px] font-bold text-text-muted">of {totalPages}</span>
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
      />

      {/* DISPATCH TERMINAL */}
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
                                            <MapPin size={10} className="text-brand-red" /> {tech.distance.toFixed(1)} MI FROM SITE
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

      {/* FULL EDIT DIALOG */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[700px] bg-bg-elevated border-border-default max-h-[90vh] overflow-y-auto p-0 shadow-2xl">
            <DialogHeader className="p-6 pb-2">
                <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Update Assignment Parameters</DialogTitle>
                <p className="text-xs text-text-muted">Adjust manual parameters for assignment <span className="font-bold text-text-primary">{selectedOrder?.id.toUpperCase()}</span></p>
            </DialogHeader>
            {editedOrder && (
                <div className="px-6 py-4 space-y-6">
                    {editedOrder.payChangeRequest && (
                        <div className="p-4 rounded-lg bg-brand-red-dim/10 border border-brand-red/30 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <AlertTriangle className="text-brand-red h-5 w-5" />
                                <div>
                                    <p className="text-xs font-bold text-text-primary uppercase tracking-wide">Pay Change Pending Approval</p>
                                    <p className="text-[10px] text-text-muted uppercase tracking-widest">Requested: ${editedOrder.payChangeRequest.pay} ({editedOrder.payChangeRequest.payType})</p>
                                </div>
                            </div>
                            {isPayAdmin(currentUser) && (
                                <Button size="sm" className="h-8 bg-brand-red" onClick={() => handleApprovePay(editedOrder.id)}>
                                    <ShieldCheck size={14} className="mr-1.5"/> Authorize
                                </Button>
                            )}
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Job Title / Description</Label>
                        <Textarea 
                            placeholder="Primary objective and requirements..." 
                            value={editedOrder.description}
                            onChange={(e) => setEditedOrder({...editedOrder, description: e.target.value})}
                            className="bg-bg-primary border-border-sub h-20 text-xs"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Client / Entity</Label>
                            <div className="space-y-1.5">
                                <Input 
                                    placeholder="Type client name..." 
                                    value={editedOrder.clientName}
                                    onChange={(e) => setEditedOrder({...editedOrder, clientName: e.target.value})}
                                    className="bg-bg-primary h-10 text-xs font-bold uppercase tracking-wide focus:border-brand-red transition-all"
                                />
                                <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-6 text-[9px] uppercase font-bold tracking-widest text-brand-red hover:bg-brand-red/10 p-0 flex items-center gap-1.5"
                                    onClick={() => setIsRegistryOpen(true)}
                                >
                                    <Search size={12}/> Search Registry
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Site Location</Label>
                            <div className="space-y-1.5">
                                <Input 
                                    placeholder="Full address or coordinates..." 
                                    value={editedOrder.location}
                                    onChange={(e) => setEditedOrder({...editedOrder, location: e.target.value})}
                                    className="bg-bg-primary h-10 text-xs focus:border-brand-red transition-all"
                                />
                                <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="sm" 
                                    disabled={!selectedClient?.managedSites || selectedClient.managedSites.length === 0}
                                    className={cn(
                                        "h-6 text-[9px] uppercase font-bold tracking-widest p-0 flex items-center gap-1.5",
                                        (!selectedClient?.managedSites || selectedClient.managedSites.length === 0) 
                                            ? "text-text-muted opacity-50 cursor-not-allowed" 
                                            : "text-accent-gold hover:bg-accent-gold/10"
                                    )}
                                    onClick={() => setIsSiteRegistryOpen(true)}
                                >
                                    <MapPin size={12}/> {selectedClient?.managedSites ? 'Select Managed Site' : 'No Sites Found'}
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Settlement Pay ($)</Label>
                        <Input 
                            type="number"
                            placeholder="0.00"
                            value={editedOrder.pay || ''}
                            onChange={(e) => setEditedOrder({...editedOrder, pay: parseFloat(e.target.value) || 0})}
                            className="bg-bg-primary h-10 font-mono text-text-green text-sm"
                        />
                        </div>
                        <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Pay Model</Label>
                        <Select value={editedOrder.payType} onValueChange={(val: any) => setEditedOrder({...editedOrder, payType: val})}>
                            <SelectTrigger className="bg-bg-primary h-10 text-xs uppercase font-bold tracking-wider focus:ring-brand-red"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="fixed">Fixed Rate</SelectItem>
                                <SelectItem value="hourly">Hourly Logic</SelectItem>
                                <SelectItem value="blended">Blended / Complex</SelectItem>
                            </SelectContent>
                        </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Schedule Date</Label>
                        <Input 
                            type="date"
                            value={editedOrder.scheduleDate}
                            onChange={(e) => setEditedOrder({...editedOrder, scheduleDate: e.target.value})}
                            className="bg-bg-primary h-10 text-xs"
                        />
                        </div>
                        <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Start Window</Label>
                        <Input 
                            placeholder="e.g. 10:00 AM EST"
                            value={editedOrder.scheduleTime}
                            onChange={(e) => setEditedOrder({...editedOrder, scheduleTime: e.target.value})}
                            className="bg-bg-primary h-10 text-xs"
                        />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Priority</Label>
                        <Select value={editedOrder.priority} onValueChange={(val: any) => setEditedOrder({...editedOrder, priority: val})}>
                            <SelectTrigger className="bg-bg-primary h-10 text-xs uppercase font-bold tracking-wider focus:ring-brand-red"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="low">Low</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="critical">Critical</SelectItem>
                            </SelectContent>
                        </Select>
                        </div>
                        <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Service Category</Label>
                        <Select value={editedOrder.projectType} onValueChange={(val: any) => setEditedOrder({...editedOrder, projectType: val})}>
                            <SelectTrigger className="bg-bg-primary h-10 text-xs uppercase font-bold tracking-wider focus:ring-brand-red"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Installation">Installation</SelectItem>
                                <SelectItem value="Troubleshooting">Troubleshooting</SelectItem>
                                <SelectItem value="Maintenance">Maintenance</SelectItem>
                                <SelectItem value="Survey">Survey</SelectItem>
                                <SelectItem value="Repair">Repair</SelectItem>
                                <SelectItem value="Decommission">Decommission</SelectItem>
                            </SelectContent>
                        </Select>
                        </div>
                    </div>

                    <Separator className="bg-border-sub" />

                    <div className="grid grid-cols-2 gap-4">
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
                    </div>

                    <DialogFooter className="bg-bg-tertiary/30 -mx-6 -mb-6 p-6 border-t border-border-default mt-4">
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="h-11 px-8 uppercase font-bold text-[10px] tracking-widest">Cancel</Button>
                        <Button onClick={handleSaveChanges} className="h-11 px-10 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest">
                            Commit Assignment Updates
                        </Button>
                    </DialogFooter>
                </div>
            )}
        </DialogContent>
      </Dialog>

      {/* CLIENT REGISTRY POPUP */}
      <Dialog open={isRegistryOpen} onOpenChange={setIsRegistryOpen}>
          <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[80vh] shadow-2xl">
              <DialogHeader className="p-6 pb-2">
                  <div className="flex items-center gap-2 mb-1">
                      <Users className="text-brand-red h-5 w-5" />
                      <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Client Registry</DialogTitle>
                  </div>
                  <DialogDescription className="text-xs">Select existing client to link to this assignment.</DialogDescription>
              </DialogHeader>
              <div className="px-6 py-2">
                  <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                      <Input 
                          placeholder="Filter registry by name or ID..." 
                          value={registrySearch}
                          onChange={(e) => setRegistrySearch(e.target.value)}
                          className="bg-bg-primary h-10 pl-10 text-xs font-bold uppercase"
                      />
                  </div>
              </div>
              <ScrollArea className="flex-1 px-6 py-4">
                  <div className="space-y-1">
                      {filteredRegistry.map(client => (
                          <button
                              key={client.id}
                              type="button"
                              onClick={() => selectClientFromRegistry(client)}
                              className="w-full flex items-center gap-3 p-3 rounded hover:bg-bg-tertiary transition-colors text-left group active:bg-brand-red-dim border border-transparent hover:border-border-sub"
                          >
                              <div className="p-1.5 bg-bg-secondary rounded border border-border-sub text-text-muted group-hover:text-brand-red transition-colors">
                                  <Building2 size={16} />
                              </div>
                              <div className="flex-1 overflow-hidden">
                                  <p className="text-xs font-bold text-text-primary uppercase truncate">{client.clientCompany || client.name}</p>
                                  {client.businessType && (
                                      <p className="text-[8px] text-accent-gold uppercase font-black tracking-tighter leading-none mt-0.5">{client.businessType}</p>
                                  )}
                                  <p className="text-[9px] text-text-muted uppercase tracking-widest">ID: {client.id.toUpperCase()}</p>
                              </div>
                              <Check size={14} className="text-text-green opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                      ))}
                      {filteredRegistry.length === 0 && (
                          <div className="text-center py-12 border border-dashed border-border-sub rounded-lg bg-bg-primary/50">
                              <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest italic">No registry matches found</p>
                          </div>
                      )}
                  </div>
              </ScrollArea>
              <DialogFooter className="p-4 bg-bg-secondary/30 border-t border-border-default">
                  <Button variant="outline" className="w-full text-[10px] uppercase font-bold tracking-widest h-9" onClick={() => setIsRegistryOpen(false)}>Close Registry</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      {/* SITE REGISTRY POPUP */}
      <Dialog open={isSiteRegistryOpen} onOpenChange={setIsSiteRegistryOpen}>
          <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[80vh] shadow-2xl">
              <DialogHeader className="p-6 pb-2">
                  <div className="flex items-center gap-2 mb-1">
                      <Navigation className="text-accent-gold h-5 w-5" />
                      <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Site Registry</DialogTitle>
                  </div>
                  <DialogDescription className="text-xs">Select verified coordinates for <span className="text-text-primary font-bold">{editedOrder?.clientName}</span>.</DialogDescription>
              </DialogHeader>
              <ScrollArea className="flex-1 px-6 py-4">
                  <div className="space-y-1">
                      {selectedClient?.managedSites?.map(site => (
                          <button
                              key={site.id}
                              type="button"
                              onClick={() => selectSiteFromRegistry(site)}
                              className="w-full p-4 rounded hover:bg-bg-tertiary transition-colors text-left group active:bg-brand-red-dim border border-transparent hover:border-border-sub"
                          >
                              <div className="flex justify-between items-start gap-3">
                                  <div className="space-y-0.5">
                                      <p className="text-xs font-bold text-text-primary uppercase tracking-tight group-hover:text-accent-gold transition-colors">{site.name}</p>
                                      <p className="text-[10px] text-text-muted flex items-center gap-1.5">
                                          <MapPin size={10} className="text-brand-red" />
                                          {site.location}
                                      </p>
                                  </div>
                                  <Check size={14} className="text-text-green opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                              </div>
                          </button>
                      ))}
                      {(!selectedClient?.managedSites || selectedClient.managedSites.length === 0) && (
                          <div className="text-center py-12 border border-dashed border-border-sub rounded-lg bg-bg-primary/50">
                              <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest italic">No verified sites on record for this client</p>
                          </div>
                      )}
                  </div>
              </ScrollArea>
              <DialogFooter className="p-4 bg-bg-secondary/30 border-t border-border-default">
                  <Button variant="outline" className="w-full text-[10px] uppercase font-bold tracking-widest h-9" onClick={() => setIsSiteRegistryOpen(false)}>Close Terminal</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </>
  );
}
