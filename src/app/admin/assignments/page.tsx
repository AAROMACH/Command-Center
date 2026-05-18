'use client';

import { useState, useMemo, useEffect } from 'react';
import { workOrders as initialWorkOrders, technicians } from "@/lib/data";
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
  ArrowUpDown,
  SlidersHorizontal,
  Building2,
  ChevronRight,
  DollarSign,
  Pencil,
  Eye,
  ExternalLink
} from "lucide-react";
import type { WorkOrder, Technician } from "@/lib/types";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type SortOption = 'date' | 'client' | 'status' | 'pay' | 'tech';

const getFieldNationLink = (id: string) => {
  const cleanId = id.replace(/^wo-/, '');
  return `https://app.fieldnation.com/workorders/${cleanId}`;
};

export default function AssignmentsHubPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(initialWorkOrders);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [activePriorities, setActivePriorities] = useState<string[]>([]);
  const [activeSources, setActiveSources] = useState<string[]>([]);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editedOrder, setEditedOrder] = useState<WorkOrder | null>(null);

  const { toast } = useToast();

  const filteredWorkOrders = useMemo(() => {
    return workOrders
      .filter(wo => {
        // EXCLUDE UNASSIGNED FROM ACTIVE REGISTRY
        if (wo.status === 'unassigned') return false;

        const tech = technicians.find(t => t.id === (wo.assignedTechnicianId || ''));
        const query = searchQuery.toLowerCase();
        
        const matchesSearch = (
          wo.id.toLowerCase().includes(query) ||
          wo.description.toLowerCase().includes(query) ||
          wo.clientName.toLowerCase().includes(query) ||
          (tech && tech.name.toLowerCase().includes(query))
        );

        const matchesDate = !dateRange?.from || (wo.scheduleDate && (() => {
            try {
                const parts = wo.scheduleDate.split(/[-/]/);
                let woDate;
                if (parts[0].length === 4) { woDate = new Date(wo.scheduleDate); } 
                else { 
                  const [m, d, y] = parts;
                  woDate = new Date(`${y}-${m}-${d}T12:00:00`);
                }
                
                if (dateRange.from && dateRange.to) {
                    return woDate >= dateRange.from && woDate <= dateRange.to;
                }
                if (dateRange.from) {
                    return isSameDay(woDate, dateRange.from);
                }
                return true;
            } catch (e) { return false; }
        })());

        const matchesPriority = activePriorities.length === 0 || activePriorities.includes(wo.priority);
        const matchesSource = activeSources.length === 0 || (wo.source && activeSources.includes(wo.source));

        return matchesSearch && matchesDate && matchesPriority && matchesSource;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'client': return a.clientName.localeCompare(b.clientName);
          case 'status': return a.status.localeCompare(b.status);
          case 'pay': return b.pay - a.pay;
          case 'tech': 
            const techA = technicians.find(t => t.id === a.assignedTechnicianId)?.name || 'Unassigned';
            const techB = technicians.find(t => t.id === b.assignedTechnicianId)?.name || 'Unassigned';
            return techA.localeCompare(techB);
          case 'date':
          default:
            return a.scheduleDate.localeCompare(b.scheduleDate);
        }
      });
  }, [workOrders, searchQuery, dateRange, sortBy, activePriorities, activeSources]);

  const activeWorkOrders = useMemo(() => 
    filteredWorkOrders.filter(wo => (wo.status === 'assigned' || wo.status === 'in-progress')),
  [filteredWorkOrders]);

  const archivedWorkOrders = useMemo(() => 
    filteredWorkOrders.filter(wo => wo.status === 'completed'),
  [filteredWorkOrders]);

  const groupedByClient = useMemo(() => {
    if (sortBy !== 'client') return null;
    const uniqueClientNames = Array.from(new Set(activeWorkOrders.map(wo => wo.clientName)));
    const registeredClients = technicians.filter(t => t.roles?.includes('client') || t.clientCompany);
    
    const regGroups = registeredClients
        .map(client => {
            const clientName = client.clientCompany || client.name;
            const jobs = activeWorkOrders.filter(wo => wo.clientName === clientName);
            if (jobs.length === 0) return null;
            return { client, jobs, isRegistered: true };
        })
        .filter((group): group is { client: Technician; jobs: WorkOrder[]; isRegistered: boolean } => group !== null);

    const unregNames = uniqueClientNames.filter(name => 
        !registeredClients.some(c => (c.clientCompany || c.name) === name)
    );

    const unregGroups = unregNames.map(name => ({
        client: { name, avatarUrl: '', businessType: 'Unregistered Entity' } as Technician,
        jobs: activeWorkOrders.filter(wo => wo.clientName === name),
        isRegistered: false
    }));

    return [...regGroups, ...unregGroups];
  }, [activeWorkOrders, sortBy]);

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return 'TBD';
    try {
      const parts = dateStr.split(/[-/]/);
      let d;
      if (parts[0].length === 4) { d = new Date(dateStr); } 
      else { 
        const [m, day, y] = parts;
        d = new Date(`${y}-${m}-${day}T12:00:00`);
      }
      return format(d, 'MM-dd-yyyy');
    } catch (e) {
      return dateStr;
    }
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

  const handleJobUpdate = (woId: string, updates: Partial<WorkOrder>) => {
    setWorkOrders(prev => prev.map(order => 
        order.id === woId ? { ...order, ...updates } : order
    ));
    if (selectedJob?.id === woId) {
        setSelectedJob(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  const hasActiveFilters = !!dateRange?.from || activePriorities.length > 0 || activeSources.length > 0 || sortBy !== 'date';

  return (
    <div className="space-y-6">
      <header className="page-header flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2">
            <CalendarIcon size={12} />
            Assignment Registry Audit
          </p>
          <h1 className="page-title">Assignments</h1>
          <p className="page-subtitle">Operational schedule oversight and historical job audit.</p>
        </div>
        <div className="flex items-center gap-3">
            <div className="search-wrap">
              <Search className="h-4 w-4" />
              <input 
                placeholder="Search Tech, ID, or Description..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input !w-full md:!w-[300px] bg-bg-secondary border-border-main h-10"
              />
            </div>
            
            <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                <SelectTrigger className="w-[140px] h-10 bg-bg-secondary border-border-main text-[10px] uppercase font-bold tracking-widest">
                    <div className="flex items-center gap-2">
                        <ArrowUpDown size={14} className="text-text-muted" />
                        <SelectValue placeholder="Sort" />
                    </div>
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="date" className="text-[10px] uppercase font-bold">By Date</SelectItem>
                    <SelectItem value="tech" className="text-[10px] uppercase font-bold">By Technician</SelectItem>
                    <SelectItem value="client" className="text-[10px] uppercase font-bold">By Client</SelectItem>
                    <SelectItem value="status" className="text-[10px] uppercase font-bold">By Status</SelectItem>
                    <SelectItem value="pay" className="text-[10px] uppercase font-bold">By Pay</SelectItem>
                </SelectContent>
            </Select>

            <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("h-10", hasActiveFilters && "border-brand-red text-brand-red")}>
                    <SlidersHorizontal size={14} className="mr-2"/>
                    Filters
                    {hasActiveFilters && <Badge variant="destructive" className="ml-2 h-4 w-4 p-0 flex items-center justify-center text-[8px]">{(dateRange?.from ? 1 : 0) + activePriorities.length + activeSources.length}</Badge>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-0 bg-bg-elevated border-border-main shadow-2xl" align="end">
                  <div className="p-4 border-b border-border-sub bg-bg-tertiary">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-text-primary">Registry Constraints</p>
                      {hasActiveFilters && (
                        <button onClick={() => { setDateRange(undefined); setActivePriorities([]); setActiveSources([]); setSortBy('date'); }} className="text-[9px] font-bold text-brand-red hover:underline flex items-center gap-1">
                          <X size={10} /> Reset
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="p-4 space-y-6">
                    <div className="space-y-3">
                      <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Priority Audit</p>
                      <div className="grid grid-cols-2 gap-2">
                        {['critical', 'high', 'medium', 'low'].map(priority => (
                          <div key={priority} className="flex items-center space-x-2">
                            <Checkbox 
                              id={`prio-${priority}`} 
                              checked={activePriorities.includes(priority)}
                              onCheckedChange={(checked) => {
                                setActivePriorities(prev => checked ? [...prev, priority] : prev.filter(p => p !== priority));
                              }}
                            />
                            <Label htmlFor={`prio-${priority}`} className="text-[10px] uppercase font-semibold cursor-pointer">{priority}</Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Job Source</p>
                      <div className="space-y-2">
                        {['Imported', 'Manual', 'Client'].map(source => (
                          <div key={source} className="flex items-center space-x-2">
                            <Checkbox 
                              id={`source-${source}`} 
                              checked={activeSources.includes(source)}
                              onCheckedChange={(checked) => {
                                setActiveSources(prev => checked ? [...prev, source] : prev.filter(s => s !== source));
                              }}
                            />
                            <Label htmlFor={`source-${source}`} className="text-[10px] uppercase font-semibold cursor-pointer">{source}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </PopoverContent>
            </Popover>
        </div>
      </header>

      <Tabs defaultValue="schedule" className="w-full">
        <div className="flex items-center justify-between gap-4 mb-6 bg-bg-secondary/50 p-4 rounded-lg border border-border-sub">
          <TabsList className="tabs !mb-0">
            <TabsTrigger value="schedule" className="tab">
              Active Assignments <span className="tab-count">({activeWorkOrders.length})</span>
            </TabsTrigger>
            <TabsTrigger value="archive" className="tab">
              Job Archive <span className="tab-count">({archivedWorkOrders.length})</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <div className={cn(
                    "flex items-center h-8 rounded-md border border-border-main bg-bg-secondary px-3 cursor-pointer hover:bg-bg-tertiary transition-all group relative pr-8",
                    dateRange?.from && "border-brand-red ring-1 ring-brand-red"
                )}>
                    <CalendarIcon size={12} className={cn("mr-2", dateRange?.from ? "text-brand-red" : "text-text-muted")} />
                    <span className={cn(
                        "text-[10px] font-bold uppercase tracking-widest whitespace-nowrap",
                        dateRange?.from ? "text-text-primary" : "text-text-muted"
                    )}>
                        {dateRange?.from ? (
                            dateRange.to ? <>{format(dateRange.from, "MM-dd-yyyy")} – {format(dateRange.to, "MM-dd-yyyy")}</> : format(dateRange.from, "MM-dd-yyyy")
                        ) : "Select Date"}
                    </span>
                    {dateRange?.from && (
                        <button 
                            className="absolute right-2 p-0.5 rounded-full hover:bg-brand-red/20 text-text-muted hover:text-brand-red transition-colors"
                            onClick={(e) => { e.stopPropagation(); setDateRange(undefined); }}
                        >
                            <X size={10} />
                        </button>
                    )}
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-bg-elevated border-border-main shadow-2xl" align="end">
                <Calendar initialFocus mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={1} />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="space-y-6">
            <TabsContent value="schedule" className="mt-0 space-y-6">
                {sortBy === 'tech' && (
                    <div className="grid grid-cols-1 gap-8">
                        {technicians.filter(t => !t.roles?.includes('client') && !t.role.toLowerCase().includes('client')).map(tech => {
                            const techJobs = activeWorkOrders.filter(wo => wo.assignedTechnicianId === tech.id);
                            if (techJobs.length === 0) return null;
                            return (
                                <div key={tech.id} className="space-y-4">
                                    <div className="flex items-center justify-start gap-3 border-b border-border-sub pb-2 px-1">
                                        <Avatar className="h-10 w-10 border border-border-sub">
                                            <AvatarImage src={tech.avatarUrl} /><AvatarFallback>{tech.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div className="text-left">
                                            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide">{tech.name}</h3>
                                            <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest">{tech.role} • {techJobs.length} Assigned</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {techJobs.map(job => <AssignmentCard key={job.id} job={job} onCardClick={handleCardClick} />)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {sortBy === 'client' && groupedByClient && (
                    <div className="grid grid-cols-1 gap-8">
                        {groupedByClient.map((group, idx) => (
                            <div key={group.client.name + idx} className="space-y-4">
                                <div className="flex items-center justify-start gap-3 border-b border-border-sub pb-2 px-1">
                                    <div className="relative">
                                        <Avatar className="h-10 w-10 border border-border-sub">
                                            <AvatarImage src={group.client.avatarUrl} /><AvatarFallback><Building2 size={16} /></AvatarFallback>
                                        </Avatar>
                                        <div className="absolute -bottom-1 -right-1 bg-brand-red rounded-full p-1 border-2 border-bg-primary"><Briefcase size={8} className="text-white" /></div>
                                    </div>
                                    <div className="text-left">
                                        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide">{group.client.name}</h3>
                                        <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest">{group.client.businessType || 'Strategic Partner'} • {group.jobs.length} Active Jobs</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {group.jobs.map(job => <AssignmentCard key={job.id} job={job} onCardClick={handleCardClick} />)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {(sortBy === 'date' || sortBy === 'status' || sortBy === 'pay') && (
                    <div className="table-wrap">
                        <table className="tbl">
                            <thead>
                                <tr className="bg-bg-tertiary">
                                    <th className="text-left pl-6 w-[180px]">Status & ID</th>
                                    <th className="text-left pl-0">Assignment Identification</th>
                                    <th className="text-center">Operative</th>
                                    <th className="text-left pl-0">Site Coordinates</th>
                                    <th className="text-left pl-0">Schedule Date</th>
                                    <th className="text-right pr-6">Financials</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeWorkOrders.map(wo => {
                                    const tech = technicians.find(t => t.id === wo.assignedTechnicianId);
                                    return (
                                        <tr key={wo.id} className="cursor-pointer group hover:bg-bg-tertiary transition-colors" onClick={() => handleCardClick(wo)}>
                                            <td className="text-left pl-6 py-4">
                                                <div className="flex flex-col items-start gap-1.5">
                                                    <div className="flex items-center gap-1.5">
                                                      <div className="cell-id font-mono text-brand-red font-bold">{wo.id.toUpperCase()}</div>
                                                      {wo.source === 'Imported' && (
                                                        <a href={getFieldNationLink(wo.id)} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-brand-red transition-colors" onClick={(e) => e.stopPropagation()}>
                                                          <ExternalLink size={10} />
                                                        </a>
                                                      )}
                                                    </div>
                                                    <Badge variant={wo.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="text-[8px] h-4 px-1.5 uppercase tracking-widest">{wo.status}</Badge>
                                                </div>
                                            </td>
                                            <td className="text-left pl-0 py-4">
                                                <div className="flex flex-col min-w-0">
                                                    <p className="text-xs font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors whitespace-normal">{wo.description}</p>
                                                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mt-1">{wo.clientName}</p>
                                                </div>
                                            </td>
                                            <td className="py-4">
                                                <div className="flex flex-col items-center justify-center">
                                                    {tech ? (
                                                        <div className="flex items-center gap-3">
                                                            <Avatar className="h-8 w-8 border border-border-sub shadow-sm">
                                                                <AvatarImage src={tech.avatarUrl} /><AvatarFallback>{tech.name.charAt(0)}</AvatarFallback>
                                                            </Avatar>
                                                            <span className="text-[10px] font-bold text-text-primary uppercase">{tech.name}</span>
                                                        </div>
                                                    ) : <span className="text-[10px] text-text-muted italic">Unallocated</span>}
                                                </div>
                                            </td>
                                            <td className="py-4 pl-0">
                                                <div className="flex items-center justify-start gap-2 text-[10px] text-text-secondary font-bold uppercase">
                                                    <MapPin size={11} className="text-brand-red shrink-0" /><span className="whitespace-normal text-left">{wo.location}</span>
                                                </div>
                                            </td>
                                            <td className="py-4 pl-0">
                                                <div className="flex flex-col items-start justify-center gap-1.5">
                                                    <div className="flex items-center gap-2 text-[10px] text-text-secondary font-mono font-bold"><CalendarIcon size={13} className="text-text-muted shrink-0" /><span>{formatDateDisplay(wo.scheduleDate)}</span></div>
                                                    <div className="flex items-center gap-2 text-[10px] text-text-secondary font-mono"><Clock size={13} className="text-text-muted shrink-0" /><span>{wo.scheduleTime}</span></div>
                                                </div>
                                            </td>
                                            <td className="text-right pr-6 py-4">
                                                <div className="flex flex-col items-end"><span className="text-sm font-mono font-bold text-text-green">${wo.pay.toFixed(2)}</span><span className="text-[8px] text-text-muted uppercase font-bold tracking-widest">{wo.payType}</span></div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeWorkOrders.length === 0 && (
                    <div className="p-12 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30">
                        <Activity size={32} className="mx-auto text-text-muted mb-4 opacity-20" />
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] italic text-center">No active jobs found matching search criteria</p>
                    </div>
                )}
            </TabsContent>

            <TabsContent value="archive" className="mt-0">
                <div className="table-wrap">
                    <table className="tbl">
                        <thead>
                            <tr className="bg-bg-tertiary">
                                <th className="text-left pl-6 w-[200px]">Assignment Identification</th>
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
                                    <tr key={wo.id} className="cursor-pointer group hover:bg-bg-tertiary transition-colors" onClick={() => handleCardClick(wo)}>
                                        <td className="text-left pl-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex flex-col items-center">
                                                    <div className="flex items-center gap-1.5">
                                                      <div className="cell-id font-mono text-brand-red">{wo.id.toUpperCase()}</div>
                                                      {wo.source === 'Imported' && (
                                                        <a href={getFieldNationLink(wo.id)} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-brand-red transition-colors" onClick={(e) => e.stopPropagation()}>
                                                          <ExternalLink size={10} />
                                                        </a>
                                                      )}
                                                    </div>
                                                    <Badge variant="completed" className="text-[8px] h-3.5 mt-1">CLOSED</Badge>
                                                </div>
                                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors whitespace-normal text-left">{wo.description}</p>
                                            </div>
                                        </td>
                                        <td className="py-4">
                                            <div className="flex flex-col items-center justify-center">
                                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1"><Briefcase size={12}/> {wo.clientName}</div>
                                                <div className="flex items-center gap-1.5 text-xs text-text-green font-bold uppercase"><CheckCircle2 size={14}/> Successfully Finalized</div>
                                            </div>
                                        </td>
                                        <td className="py-4">
                                            <div className="flex items-center justify-center text-center gap-2 text-[10px] text-text-secondary font-bold uppercase"><MapPin size={12} className="text-brand-red shrink-0" /><span className="whitespace-normal">{wo.location}</span></div>
                                        </td>
                                        <td className="py-4 text-center">
                                            <div className="flex flex-col items-center justify-center">
                                                <div className="flex items-center gap-2 text-[10px] text-text-primary font-bold uppercase tracking-tight"><CalendarIcon size={12} className="text-text-muted" />{formatDateDisplay(wo.scheduleDate)}</div>
                                                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-text-muted font-bold uppercase"><User size={10}/> {tech?.name || 'Field Ops'}</div>
                                            </div>
                                        </td>
                                        <td className="py-4 text-center">
                                            <div className="flex items-center justify-center"><Badge variant="active" className="uppercase text-[9px] tracking-widest px-3 h-6">Audit Passed</Badge></div>
                                        </td>
                                    </tr>
                                )
                            })}
                            {archivedWorkOrders.length === 0 && (
                                <tr><td colSpan={5} className="h-32 text-center text-text-muted uppercase text-[10px] tracking-[0.2em] italic">No historical records found matching current filters.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </TabsContent>
        </div>

        <JobDetailDialog 
            isOpen={isDetailOpen} 
            setIsOpen={setIsDetailOpen} 
            mission={selectedJob} 
            onEdit={(m) => { setIsDetailOpen(false); handleOpenEditDialog(m); }} 
            onUpdate={handleJobUpdate}
        />
        
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[700px] bg-bg-elevated border-border-default max-h-[90vh] overflow-y-auto p-0 shadow-2xl">
              <DialogHeader className="p-6 pb-2 text-left">
                <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Update Assignment Parameters</DialogTitle>
                <p className="text-xs text-text-muted">Adjust manual parameters for assignment <span className="font-bold text-text-primary">{selectedJob?.id.toUpperCase()}</span></p>
              </DialogHeader>
              {editedOrder && (
                  <div className="px-6 py-4 space-y-6">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex">Job Title / Description</Label>
                        <Textarea placeholder="Primary objective..." value={editedOrder.description} onChange={(e) => setEditedOrder({...editedOrder, description: e.target.value})} className="bg-bg-primary border-border-sub h-20 text-xs" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex">Client / Entity</Label>
                            <Input value={editedOrder.clientName} onChange={(e) => setEditedOrder({...editedOrder, clientName: e.target.value})} className="bg-bg-primary h-10 text-xs font-bold uppercase" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex">Site Location</Label>
                            <Input value={editedOrder.location} onChange={(e) => setEditedOrder({...editedOrder, location: e.target.value})} className="bg-bg-primary h-10 text-xs" />
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
                                {technicians.filter(t => !t.roles?.includes('client')).map(tech => <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-text-muted ml-1 text-center block">Operational Status</Label>
                            <Select value={editedOrder.status} onValueChange={(val: any) => setEditedOrder({ ...editedOrder, status: val })}>
                              <SelectTrigger className="bg-bg-primary h-11 uppercase font-bold tracking-wider focus:ring-brand-red">
                                <SelectValue />
                              </SelectTrigger>
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
                        <Button onClick={handleSaveChanges} className="h-11 px-10 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest">Commit Assignment Updates</Button>
                      </DialogFooter>
                  </div>
              )}
          </DialogContent>
        </Dialog>
      </Tabs>
    </div>
  );
}

function AssignmentCard({ job, onCardClick }: { job: WorkOrder; onCardClick: (wo: WorkOrder) => void }) {
    const formatDateDisplay = (dateStr: string) => {
        if (!dateStr) return 'TBD';
        try {
          const parts = dateStr.split(/[-/]/);
          let d;
          if (parts[0].length === 4) { d = new Date(dateStr); } 
          else { 
            const [m, day, y] = parts;
            d = new Date(`${y}-${m}-${day}T12:00:00`);
          }
          return format(d, 'MM-dd-yyyy');
        } catch (e) {
          return dateStr;
        }
    };

    return (
        <Card key={job.id} className="bg-bg-secondary border-border-main hover:border-text-muted transition-all cursor-pointer shadow-sm group text-left" onClick={() => onCardClick(job)}>
            <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[10px] text-brand-red font-bold">{job.id.toUpperCase()}</span>
                              {job.source === 'Imported' && (
                                <a href={getFieldNationLink(job.id)} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-brand-red transition-colors" onClick={(e) => e.stopPropagation()}>
                                  <ExternalLink size={10} />
                                </a>
                              )}
                            </div>
                            <Badge variant={job.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="h-4 uppercase text-[7px] tracking-widest mt-1">{job.status}</Badge>
                        </div>
                        <div className="flex flex-col min-w-0 text-left"><p className="text-xs font-bold text-text-primary uppercase leading-tight group-hover:text-brand-red transition-colors whitespace-normal">{job.description}</p><p className="text-[9px] text-text-muted uppercase font-bold tracking-tight mt-0.5">{job.clientName}</p></div>
                    </div>
                </div>
                <div className="pt-2 border-t border-border-sub space-y-1.5 flex flex-col items-start">
                    <div className="flex items-center gap-2 text-[10px] text-text-secondary uppercase font-bold tracking-tight"><Clock size={12} className="text-brand-red" />{job.scheduleTime} • {formatDateDisplay(job.scheduleDate)}</div>
                    <div className="flex items-center gap-2 text-[10px] text-text-secondary uppercase font-bold tracking-tight text-left"><MapPin size={12} className="text-brand-red shrink-0" /><span className="whitespace-normal">{job.location}</span></div>
                </div>
            </CardContent>
        </Card>
    );
}
