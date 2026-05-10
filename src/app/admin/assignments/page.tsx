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
  ExternalLink,
  ArrowUpDown,
  SlidersHorizontal
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

type SortOption = 'date' | 'client' | 'status' | 'pay';

export default function AssignmentsHubPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(initialWorkOrders);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [activePriorities, setActivePriorities] = useState<string[]>([]);
  const [activeSources, setActiveSources] = useState<string[]>([]);

  // Edit Logic
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editedOrder, setEditedOrder] = useState<WorkOrder | null>(null);

  // Registry Popup States for Edit Flow
  const [isRegistryOpen, setIsRegistryOpen] = useState(false);
  const [isSiteRegistryOpen, setIsSiteRegistryOpen] = useState(false);
  const [registrySearch, setRegistrySearch] = useState("");

  const { toast } = useToast();

  const filteredWorkOrders = useMemo(() => {
    return workOrders
      .filter(wo => {
        const tech = technicians.find(t => t.id === wo.assignedTechnicianId);
        const query = searchQuery.toLowerCase();
        
        const matchesSearch = (
          wo.id.toLowerCase().includes(query) ||
          wo.description.toLowerCase().includes(query) ||
          wo.clientName.toLowerCase().includes(query) ||
          (tech && tech.name.toLowerCase().includes(query))
        );

        const matchesDate = !dateRange?.from || (wo.scheduleDate && (() => {
            try {
                const woDate = parseISO(wo.scheduleDate);
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
          case 'date':
          default:
            return a.scheduleDate.localeCompare(b.scheduleDate);
        }
      });
  }, [workOrders, searchQuery, dateRange, sortBy, activePriorities, activeSources]);

  const activeWorkOrders = useMemo(() => 
    filteredWorkOrders.filter(wo => wo.status !== 'completed' && wo.assignedTechnicianId),
  [filteredWorkOrders]);

  const archivedWorkOrders = useMemo(() => 
    filteredWorkOrders.filter(wo => wo.status === 'completed'),
  [filteredWorkOrders]);

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return 'TBD';
    try {
      const parts = dateStr.split(/[-/]/);
      let d;
      if (parts[0].length === 4) { d = new Date(dateStr); } 
      else { d = parseISO(dateStr); }
      return format(d, 'MM-dd-yyyy');
    } catch (e) {
      return dateStr;
    }
  };

  const resetFilters = () => {
    setDateRange(undefined);
    setActivePriorities([]);
    setActiveSources([]);
    setSortBy('date');
    toast({ title: "Audit Constraints Reset", description: "Search parameters and filters cleared." });
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

  const hasActiveFilters = !!dateRange?.from || activePriorities.length > 0 || activeSources.length > 0 || sortBy !== 'date';

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
                        <button onClick={resetFilters} className="text-[9px] font-bold text-brand-red hover:underline flex items-center gap-1">
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
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
          <TabsList className="tabs !mb-0">
            <TabsTrigger value="schedule" className="tab">
              Assignments <span className="tab-count">({activeWorkOrders.length})</span>
            </TabsTrigger>
            <TabsTrigger value="archive" className="tab">
              Job Archive <span className="tab-count">({archivedWorkOrders.length})</span>
            </TabsTrigger>
          </TabsList>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("h-10 px-6 border-border-main bg-bg-secondary text-[11px] font-bold uppercase tracking-widest", dateRange?.from && "border-brand-red text-brand-red")}>
                <CalendarIcon size={14} className="mr-2 text-brand-red" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>{format(dateRange.from, "MM-dd-yyyy")} – {format(dateRange.to, "MM-dd-yyyy")}</>
                  ) : (
                    format(dateRange.from, "MM-dd-yyyy")
                  )
                ) : (
                  "Select Date"
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-bg-elevated border-border-main shadow-2xl" align="end">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={1}
              />
            </PopoverContent>
          </Popover>
        </div>

        <TabsContent value="schedule" className="mt-0 space-y-6">
            <div className="space-y-6">
                <div className="flex justify-between items-center bg-bg-secondary/50 p-4 rounded-lg border border-border-sub">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3">
                            <Activity size={16} className="text-brand-red" />
                            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">Operative Deployments</h2>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {dateRange?.from && (
                                <Badge variant="secondary" className="h-7 gap-2 border-brand-red/30 bg-brand-red-dim/20 text-brand-red px-3">
                                    <CalendarIcon size={12} />
                                    <span className="text-[10px] uppercase font-bold tracking-widest">
                                      {format(dateRange.from, 'MM-dd-yyyy')}
                                      {dateRange.to && ` – ${format(dateRange.to, 'MM-dd-yyyy')}`}
                                    </span>
                                    <button 
                                        onClick={() => setDateRange(undefined)}
                                        className="hover:bg-brand-red/20 rounded-full p-0.5 transition-colors"
                                    >
                                        <X size={12} />
                                    </button>
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-8">
                    {technicians.filter(t => !t.roles?.includes('client') && !t.role.toLowerCase().includes('client')).map(tech => {
                        const techJobs = activeWorkOrders.filter(wo => wo.assignedTechnicianId === tech.id);
                        if (techJobs.length === 0) return null;

                        return (
                            <div key={tech.id} className="space-y-4">
                                <div className="flex items-center justify-start gap-3 border-b border-border-sub pb-2">
                                    <Avatar className="h-10 w-10 border border-border-sub">
                                        <AvatarImage src={tech.avatarUrl} />
                                        <AvatarFallback>{tech.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div className="text-left">
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
                                                        <div className="flex flex-col items-center">
                                                            <span className="font-mono text-[10px] text-brand-red font-bold">{job.id.toUpperCase()}</span>
                                                            <Badge variant={job.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="h-4 uppercase text-[7px] tracking-widest mt-1">
                                                                {job.status}
                                                            </Badge>
                                                        </div>
                                                        <div className="flex flex-col min-w-0 text-left">
                                                            <p className="text-xs font-bold text-text-primary uppercase leading-tight">{job.description}</p>
                                                            <p className="text-[9px] text-text-muted uppercase font-bold tracking-tight mt-0.5">{job.clientName}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="pt-2 border-t border-border-sub space-y-1.5 flex flex-col items-start">
                                                    <div className="flex items-center gap-2 text-[10px] text-text-secondary uppercase font-bold tracking-tight">
                                                        <Clock size={12} className="text-brand-red" />
                                                        {job.scheduleTime} • {formatDateDisplay(job.scheduleDate)}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] text-text-secondary uppercase font-bold tracking-tight text-left">
                                                        <MapPin size={12} className="text-brand-red shrink-0" />
                                                        <span className="max-w-[220px] truncate">{job.location}</span>
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
                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] italic">
                                {dateRange?.from 
                                    ? `No active jobs found for selected range`
                                    : "No active jobs matching search criteria"
                                }
                            </p>
                            {hasActiveFilters && (
                                <button className="mt-4 text-[10px] font-bold uppercase tracking-widest text-brand-red hover:underline" onClick={resetFilters}>
                                    Reset All Constraints
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </TabsContent>

        <TabsContent value="archive" className="mt-0">
            <div className="table-wrap">
                <table className="tbl">
                    <thead>
                        <tr>
                            <th className="text-left pl-6">Assignment Identification</th>
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
                                    <td className="text-left pl-6">
                                        <div className="flex items-center gap-3">
                                            <div className="flex flex-col items-center">
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
                                            <MapPin size={12} className="text-brand-red shrink-0" />
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
    </div>
  );
}
