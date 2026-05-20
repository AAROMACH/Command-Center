
'use client';

import { useState, useMemo, useEffect } from 'react';
import { db } from "@/lib/firebase";
import { collection, doc, updateDoc, onSnapshot, query, where, deleteDoc } from 'firebase/firestore';
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
  ExternalLink,
  UserPlus,
  Trash2,
  ShieldCheck
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
import { isAdmin, isPayAdmin } from "@/lib/permissions";

type SortOption = 'date' | 'client' | 'status' | 'pay' | 'tech';

const getFieldNationLink = (id: string) => {
  const cleanId = id.replace(/^wo-/, '');
  return `https://app.fieldnation.com/workorders/${cleanId}`;
};

export default function AssignmentsHubPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [activePriorities, setActivePriorities] = useState<string[]>([]);
  const [activeSources, setActiveSources] = useState<string[]>([]);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editedOrder, setEditedOrder] = useState<WorkOrder | null>(null);

  const [currentUser, setCurrentUser] = useState<Technician | null>(null);

  const { toast } = useToast();

  // 1. Initialize Registry Listeners
  useEffect(() => {
    const q = query(collection(db, 'workOrders'));
    const unsub = onSnapshot(q, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as WorkOrder));
      setWorkOrders(orders);
    });

    const techQ = query(collection(db, 'users'));
    const techUnsub = onSnapshot(techQ, (snapshot) => {
      const techs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Technician));
      setTechnicians(techs);
    });

    return () => {
      unsub();
      techUnsub();
    };
  }, []);

  useEffect(() => {
    const userId = localStorage.getItem('currentUserId');
    if (userId) {
      setCurrentUser(technicians.find(t => t.id === userId) || null);
    }
  }, [technicians]);

  const filteredWorkOrders = useMemo(() => {
    return workOrders
      .filter(wo => {
        // Enforce Registry Rule: Assignment terminal requires a technician allocation
        if (wo.status === 'unassigned' || !wo.assignedTechnicianId) return false;

        const tech = technicians.find(t => t.id === wo.assignedTechnicianId);
        const queryStr = searchQuery.toLowerCase();
        
        const matchesSearch = (
          wo.id.toLowerCase().includes(queryStr) ||
          wo.description.toLowerCase().includes(queryStr) ||
          wo.clientName.toLowerCase().includes(queryStr) ||
          (tech && tech.name.toLowerCase().includes(queryStr))
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
  }, [workOrders, technicians, searchQuery, dateRange, sortBy, activePriorities, activeSources]);

  const activeWorkOrders = useMemo(() => 
    filteredWorkOrders.filter(wo => (wo.status === 'assigned' || wo.status === 'in-progress' || wo.status === 'confirmed' || wo.status === 'on-my-way')),
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
    setSelectedJob(order);
    setEditedOrder({ ...order });
    setIsEditDialogOpen(true);
  };

  const handleSaveChanges = async () => {
    if (!editedOrder || !selectedJob) return;
    
    let finalUpdate = { ...editedOrder };
    const payChanged = (editedOrder.pay || 0) !== (selectedJob.pay || 0) || editedOrder.payType !== selectedJob.payType;
    const payAdmin = isPayAdmin(currentUser);

    if (payChanged && !payAdmin) {
      finalUpdate.pay = selectedJob.pay;
      finalUpdate.payType = selectedJob.payType;
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
        toast({ title: "Registry Updated", description: "Assignment parameters committed to Firestore." });
    } catch (error: any) {
        toast({ variant: "destructive", title: "Update Failed", description: error.message });
    }
  };

  const handleDeleteOrder = async () => {
    if (!selectedJob) return;
    try {
        await deleteDoc(doc(db, 'workOrders', selectedJob.id));
        setIsEditDialogOpen(false);
        setIsDeleteDialogOpen(false);
        toast({ title: "Registry Purged", description: `Assignment ${selectedJob.id.toUpperCase()} removed from system.` });
    } catch (e: any) {
        toast({ variant: "destructive", title: "Purge Failed", description: e.message });
    }
  };

  const handleJobUpdate = async (woId: string, updates: Partial<WorkOrder>) => {
    try {
        const docRef = doc(db, 'workOrders', woId);
        await updateDoc(docRef, updates);
        if (selectedJob?.id === woId) {
            setSelectedJob(prev => prev ? { ...prev, ...updates } : null);
        }
    } catch (error: any) {
        toast({ variant: "destructive", title: "Registry Error", description: error.message });
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
                                                            <AvatarImage src={tech.avatarUrl} />
                                                            <AvatarFallback>{tech.name.charAt(0)}</AvatarFallback>
                                                        </Avatar>
                                                        <span className="text-[10px] font-bold text-text-primary uppercase">{tech.name}</span>
                                                    </div>
                                                ) : (
                                                    <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    className="h-8 !text-[10px] border-brand-red text-brand-red hover:bg-brand-red-dim uppercase font-bold tracking-widest"
                                                    onClick={(e) => { e.stopPropagation(); handleOpenEditDialog(wo); }}
                                                    >
                                                    <UserPlus size={14} className="mr-1.5"/> Assign
                                                    </Button>
                                                )}
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
              <DialogHeader className="p-6 pb-2 text-left border-b border-border-sub bg-bg-tertiary/30">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Update Assignment Parameters</DialogTitle>
                        <p className="text-xs text-text-muted">Adjust manual parameters for assignment <span className="font-bold text-text-primary">{selectedJob?.id.toUpperCase()}</span></p>
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
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Settlement Pay ($)</Label>
                            <Input type="number" value={editedOrder.pay || 0} onChange={(e) => setEditedOrder({...editedOrder, pay: parseFloat(e.target.value) || 0})} className="bg-bg-primary h-10 text-xs font-mono text-text-green" />
                        </div>
                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Pay Model</Label>
                            <Select value={editedOrder.payType} onValueChange={(val: any) => setEditedOrder({ ...editedOrder, payType: val })}>
                                <SelectTrigger className="h-10 bg-bg-primary text-xs uppercase font-bold"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="fixed">Fixed</SelectItem>
                                    <SelectItem value="hourly">Hourly</SelectItem>
                                    <SelectItem value="blended">Blended</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

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
                      <DialogFooter className="bg-bg-tertiary/30 -mx-6 -mb-6 p-6 border-t border-border-default mt-4">
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="h-11 px-8 uppercase font-bold text-[10px] tracking-widest">Cancel</Button>
                        <Button onClick={handleSaveChanges} className="h-11 px-12 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest text-white">Commit Registry Updates</Button>
                      </DialogFooter>
                  </div>
              )}
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
                        Critical Action: This will permanently remove assignment <span className="text-text-primary font-bold">{selectedJob?.id.toUpperCase()}</span> from the operational ledger. This operation cannot be reversed.
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
      </Tabs>
    </div>
  );
}
