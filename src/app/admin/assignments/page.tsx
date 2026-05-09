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
  X
} from "lucide-react";
import type { WorkOrder } from "@/lib/types";
import { GlobalScheduleCalendar } from "./components/global-schedule-calendar";
import { format, isSameDay, parseISO } from 'date-fns';
import { JobDetailDialog } from '@/components/job-detail-dialog';
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
import { Label } from "@/components/ui/label";
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function AssignmentsHubPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(initialWorkOrders);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDates, setFilterDates] = useState<Date[]>([]);
  const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Edit Logic
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editedOrder, setEditedOrder] = useState<WorkOrder | null>(null);
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
      const [year, month, day] = dateStr.split('-');
      return `${month}-${day}-${year}`;
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
                                <div className="flex items-center gap-3 border-b border-border-sub pb-2">
                                    <Avatar className="h-10 w-10 border border-border-sub">
                                        <AvatarImage src={tech.avatarUrl} />
                                        <AvatarFallback>{tech.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div>
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
                                                    <Badge variant={job.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="h-5 uppercase text-[9px] tracking-widest">
                                                        {job.status === 'in-progress' && <div className="h-1.5 w-1.5 rounded-full bg-text-green mr-1.5 animate-pulse" />}
                                                        {job.status}
                                                    </Badge>
                                                    <span className="font-mono text-[10px] text-text-muted">ID: {job.id.toUpperCase()}</span>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-text-primary uppercase leading-tight line-clamp-1">{job.description}</p>
                                                    <p className="text-[10px] text-text-muted uppercase font-bold tracking-tight mt-1">{job.clientName}</p>
                                                </div>
                                                <div className="pt-2 border-t border-border-sub space-y-1.5">
                                                    <div className="flex items-center gap-2 text-[10px] text-text-secondary uppercase font-bold tracking-tight">
                                                        <Clock size={12} className="text-text-muted" />
                                                        {job.scheduleTime} • {formatDateDisplay(job.scheduleDate)}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] text-text-secondary uppercase font-bold tracking-tight">
                                                        <MapPin size={12} className="text-text-muted" />
                                                        <span className="truncate">{job.location}</span>
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
                            <th>Work Order</th>
                            <th>Client & Service Result</th>
                            <th>Deployment Coordinates</th>
                            <th>Finalized Date</th>
                            <th className="text-right">Audit Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {archivedWorkOrders.map(wo => {
                            const tech = technicians.find(t => t.id === wo.assignedTechnicianId);
                            return (
                                <tr key={wo.id} className="cursor-pointer" onClick={() => handleCardClick(wo)}>
                                    <td>
                                        <div className="cell-id">{wo.id.toUpperCase()}</div>
                                        <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{wo.description}</p>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1">
                                            <Briefcase size={12}/> {wo.clientName}
                                        </div>
                                        <div className="flex items-center gap-1.5 text-xs text-text-green font-bold uppercase">
                                            <CheckCircle2 size={14}/> Successfully Finalized
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex items-start gap-2 text-[10px] text-text-secondary uppercase font-bold tracking-tight">
                                            <MapPin size={12} className="mt-0.5 text-text-muted" />
                                            <span>{wo.location}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-text-primary uppercase">{formatDateDisplay(wo.scheduleDate)}</span>
                                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-text-muted font-bold uppercase">
                                                <User size={10}/> {tech?.name || 'Field Ops'}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="text-right">
                                        <Badge variant="active" className="uppercase text-[9px] tracking-widest px-3 h-6">Audit Passed</Badge>
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

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md bg-bg-elevated border-border-default">
            <DialogHeader>
                <DialogTitle className="uppercase font-bold tracking-widest text-text-primary">Update Dispatch Parameters</DialogTitle>
                <p className="text-xs text-text-muted">Adjust manual parameters for assignment <span className="font-bold text-text-primary">{selectedJob?.id.toUpperCase()}</span></p>
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
    </div>
  );
}
