
'use client';

import { useState, useMemo } from 'react';
import { workOrders as initialWorkOrders, technicians } from "@/lib/data";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Calendar as CalendarIcon, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  Search,
  User,
  Briefcase,
  Activity,
  X,
  Building2,
  Check,
  Users,
  Navigation,
  ExternalLink
} from "lucide-react";
import type { WorkOrder, Technician } from "@/lib/types";
import { GlobalScheduleCalendar } from "./components/global-schedule-calendar";
import { format, isSameDay, parseISO } from 'date-fns';
import { JobDetailDialog } from '@/components/job-detail-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export default function AssignmentsHubPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(initialWorkOrders);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDates, setFilterDates] = useState<Date[]>([]);
  const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Edit Logic
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editedOrder, setEditedOrder] = useState<WorkOrder | null>(null);

  // Registry Popup States for Edit Flow
  const [isRegistryOpen, setIsRegistryOpen] = useState(false);
  const [isSiteRegistryOpen, setIsSiteRegistryOpen] = useState(false);
  const [registrySearch, setRegistrySearch] = useState("");

  const { toast } = useToast();

  const filteredWorkOrders = useMemo(() => {
    return workOrders.filter(wo => {
      const tech = technicians.find(t => t.id === wo.assignedTechnicianId);
      const query = searchQuery.toLowerCase();
      
      const matchesSearch = (
        wo.id.toLowerCase().includes(query) ||
        wo.description.toLowerCase().includes(query) ||
        wo.clientName.toLowerCase().includes(query) ||
        (tech && tech.name.toLowerCase().includes(query))
      );

      const matchesDate = filterDates.length === 0 || (wo.scheduleDate && filterDates.some(d => isSameDay(parseISO(wo.scheduleDate), d)));

      return matchesSearch && matchesDate;
    }).sort((a, b) => a.scheduleDate.localeCompare(b.scheduleDate));
  }, [workOrders, searchQuery, filterDates]);

  const activeWorkOrders = useMemo(() => 
    filteredWorkOrders.filter(wo => wo.status !== 'completed' && wo.assignedTechnicianId),
  [filteredWorkOrders]);

  const archivedWorkOrders = useMemo(() => 
    filteredWorkOrders.filter(wo => wo.status === 'completed'),
  [filteredWorkOrders]);

  const formatDateDisplay = (dateStr: string) => {
    try {
      const parts = dateStr.split(/[-/]/);
      if (parts.length === 3) {
          if (parts[0].length === 4) {
              const [y, m, d] = parts;
              return `${m}-${d}-${y}`;
          }
          const [a, b, c] = parts;
          return `${a}-${b}-${c}`;
      }
      return dateStr;
    } catch (e) {
      return dateStr;
    }
  };

  const handleRemoveDate = (dateToRemove: Date) => {
    setFilterDates(filterDates.filter(d => !isSameDay(d, dateToRemove)));
  };

  const handleCardClick = (wo: WorkOrder) => {
    setSelectedJob(wo);
    setIsDetailOpen(true);
  };

  const handleOpenEditDialog = (order: WorkOrder) => {
    setEditedOrder({ ...order });
    setIsEditDialogOpen(true);
  };

  const handleSaveChanges = () => {
    if (!editedOrder) return;
    setWorkOrders(prev => prev.map(order =>
      order.id === editedOrder.id ? editedOrder : order
    ));
    setIsEditDialogOpen(false);
    toast({ title: "Registry Updated", description: "Assignment parameters committed." });
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
    <div className="space-y-6">
      <header className="page-header flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="page-eyebrow flex items-center gap-2">
            <CalendarIcon size={12} />
            Job Schedule Terminal
          </p>
          <h1 className="page-title">Assignments</h1>
          <p className="page-subtitle">Operational schedule oversight and historical job audit.</p>
        </div>
        <div className="search-wrap">
          <Search className="h-4 w-4" />
          <input 
            placeholder="Search Tech, ID, or Description..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input !w-full md:!w-[350px] bg-bg-secondary border-border-main h-10"
          />
        </div>
      </header>

      <Tabs defaultValue="schedule" className="w-full">
        <TabsList className="tabs">
          <TabsTrigger value="schedule" className="tab">
            Assignments <span className="tab-count">({activeWorkOrders.length})</span>
          </TabsTrigger>
          <TabsTrigger value="archive" className="tab">
            Job Archive <span className="tab-count">({archivedWorkOrders.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="mt-6 space-y-6">
            {/* IN-PAGE TACTICAL CALENDAR (ULTRA-THIN VIEW) */}
            <div className="rounded-lg border border-border-sub bg-bg-secondary/30 p-2 shadow-sm">
                <GlobalScheduleCalendar 
                    workOrders={workOrders.filter(wo => wo.status !== 'completed')} 
                    technicians={technicians} 
                    selectedDates={filterDates}
                    hideManifest={true}
                    onDatesChange={(dates) => setFilterDates(dates)}
                />
            </div>

            <div className="space-y-6">
                <div className="flex justify-between items-center bg-bg-secondary/50 p-4 rounded-lg border border-border-sub">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3">
                            <Activity size={16} className="text-brand-red" />
                            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">Operative Deployments</h2>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {filterDates.map((date, idx) => (
                                <Badge key={idx} variant="secondary" className="h-7 gap-2 border-brand-red/30 bg-brand-red-dim/20 text-brand-red px-3">
                                    <CalendarIcon size={12} />
                                    <span className="text-[10px] uppercase font-bold tracking-widest">{format(date, 'MM-dd-yyyy')}</span>
                                    <button 
                                        onClick={() => handleRemoveDate(date)}
                                        className="hover:bg-brand-red/20 rounded-full p-0.5 transition-colors"
                                    >
                                        <X size={12} />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-8">
                    {technicians.filter(t => !t.roles?.includes('client') && !t.role.toLowerCase().includes('client')).map(tech => {
                        const techJobs = activeWorkOrders.filter(wo => wo.assignedTechnicianId === tech.id);
                        if (techJobs.length === 0) return null;

                        return (
                            <div key={tech.id} className="space-y-4">
                                <div className="flex items-center justify-center gap-3 border-b border-border-sub pb-2">
                                    <Avatar className="h-10 w-10 border border-border-sub">
                                        <AvatarImage src={tech.avatarUrl} />
                                        <AvatarFallback>{tech.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div className="text-center">
                                        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide">{tech.name}</h3>
                                        <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest">{tech.role} • {techJobs.length} Assigned</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {techJobs.map(job => (
                                        <Card 
                                            key={job.id} 
                                            className="bg-bg-secondary border-border-main hover:border-text-muted transition-all cursor-pointer"
                                            onClick={() => handleCardClick(job)}
                                        >
                                            <CardContent className="p-4 space-y-3">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex flex-col">
                                                            <span className="font-mono text-[10px] text-brand-red font-bold">{job.id.toUpperCase()}</span>
                                                            <Badge variant={job.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="h-4 uppercase text-[7px] tracking-widest mt-1">
                                                                {job.status}
                                                            </Badge>
                                                        </div>
                                                        <div className="flex flex-col min-w-0">
                                                            <p className="text-xs font-bold text-text-primary uppercase leading-tight">{job.description}</p>
                                                            <p className="text-[9px] text-text-muted uppercase font-bold tracking-tight mt-0.5">{job.clientName}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="pt-2 border-t border-border-sub space-y-1.5 flex flex-col items-center">
                                                    <div className="flex items-center gap-2 text-[10px] text-text-secondary uppercase font-bold tracking-tight">
                                                        <Clock size={12} className="text-text-muted" />
                                                        {job.scheduleTime} • {formatDateDisplay(job.scheduleDate)}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] text-text-secondary uppercase font-bold tracking-tight text-center">
                                                        <MapPin size={12} className="text-text-muted shrink-0" />
                                                        <span className="max-w-[200px]">{job.location}</span>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    {activeWorkOrders.length === 0 && (
                        <div className="p-12 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30">
                            <Activity size={32} className="mx-auto text-text-muted mb-4 opacity-20" />
                            <p className="text-[10px] text-text-muted uppercase font-bold tracking-[0.2em] italic">
                                {filterDates.length > 0 
                                    ? `No active jobs found for selected dates`
                                    : "No active jobs matching search criteria"
                                }
                            </p>
                            {filterDates.length > 0 && (
                                <button className="mt-4 text-[10px] font-bold uppercase tracking-widest text-brand-red hover:underline" onClick={() => setFilterDates([])}>
                                    Reset Date Selection
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </TabsContent>

        <TabsContent value="archive" className="mt-6">
            <div className="table-wrap">
                <table className="tbl">
                    <thead>
                        <tr>
                            <th className="text-center">Work Order</th>
                            <th className="text-center">Client & Service Result</th>
                            <th className="text-center">Deployment Coordinates</th>
                            <th className="text-center">Finalized Date</th>
                            <th className="text-center">Audit Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {archivedWorkOrders.map(wo => {
                            const tech = technicians.find(t => t.id === wo.assignedTechnicianId);
                            return (
                                <tr key={wo.id} className="cursor-pointer" onClick={() => handleCardClick(wo)}>
                                    <td>
                                        <div className="flex items-center gap-3 px-6">
                                            <div className="flex flex-col items-start">
                                                <div className="cell-id">{wo.id.toUpperCase()}</div>
                                                <Badge variant="completed" className="text-[8px] h-3.5 mt-1">CLOSED</Badge>
                                            </div>
                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide truncate max-w-[250px]">{wo.description}</p>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1">
                                                <Briefcase size={12}/> {wo.clientName}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-xs text-text-green font-bold uppercase">
                                                <CheckCircle2 size={14}/> Successfully Finalized
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex items-center justify-center text-center gap-2 text-[10px] text-text-secondary uppercase font-bold tracking-tight">
                                            <MapPin size={12} className="text-text-muted shrink-0" />
                                            <span className="max-w-[150px]">{wo.location}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex flex-col items-center justify-center text-center">
                                            <span className="text-xs font-bold text-text-primary uppercase">{formatDateDisplay(wo.scheduleDate)}</span>
                                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-text-muted font-bold uppercase">
                                                <User size={10}/> {tech?.name || 'Field Ops'}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="text-center">
                                        <div className="flex items-center justify-center">
                                          <Badge variant="active" className="uppercase text-[9px] tracking-widest px-3 h-6">Audit Passed</Badge>
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                        {archivedWorkOrders.length === 0 && (
                            <tr>
                                <td colSpan={5} className="h-32 text-center text-text-muted uppercase text-[10px] tracking-[0.2em] italic">No historical records found matching criteria.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </TabsContent>
      </Tabs>

      <JobDetailDialog 
        isOpen={isDetailOpen} 
        setIsOpen={setIsDetailOpen} 
        mission={selectedJob} 
        onEdit={(m) => {
          setIsDetailOpen(false);
          handleOpenEditDialog(m);
        }}
      />

      {/* FULL EDIT DIALOG */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[700px] bg-bg-elevated border-border-default max-h-[90vh] overflow-y-auto p-0 shadow-2xl">
            <DialogHeader className="p-6 pb-2">
                <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Update Assignment Parameters</DialogTitle>
                <p className="text-xs text-text-muted">Adjust manual parameters for assignment <span className="font-bold text-text-primary">{selectedJob?.id.toUpperCase()}</span></p>
            </DialogHeader>
            {editedOrder && (
                <div className="px-6 py-4 space-y-6">
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
                                <button 
                                    type="button" 
                                    className="h-6 text-[9px] uppercase font-bold tracking-widest text-brand-red hover:bg-brand-red/10 p-0 flex items-center gap-1.5 bg-transparent"
                                    onClick={() => setIsRegistryOpen(true)}
                                >
                                    <Search size={12}/> Search Registry
                                </button>
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
                                <button 
                                    type="button" 
                                    disabled={!selectedClient?.managedSites || selectedClient.managedSites.length === 0}
                                    className={cn(
                                        "h-6 text-[9px] uppercase font-bold tracking-widest p-0 flex items-center gap-1.5 bg-transparent",
                                        (!selectedClient?.managedSites || selectedClient.managedSites.length === 0) 
                                            ? "text-text-muted opacity-50 cursor-not-allowed" 
                                            : "text-accent-gold hover:bg-accent-gold/10"
                                    )}
                                    onClick={() => setIsSiteRegistryOpen(true)}
                                >
                                    <MapPin size={12}/> {selectedClient?.managedSites ? 'Select Managed Site' : 'No Sites Found'}
                                </button>
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
                            <Label className="text-[10px] uppercase font-bold text-text-muted ml-1 text-center block">Technician Allocation</Label>
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
                            <Label className="text-[10px] uppercase font-bold text-text-muted ml-1 text-center block">Operational Status</Label>
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
    </div>
  );
}
