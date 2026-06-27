
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
  ShieldCheck,
  StickyNote,
  Type,
  FileText,
  Trash2,
  Check,
  List,
  Map
} from "lucide-react";
import AdminMapView from '@/app/admin/map/components/admin-map-view';
import type { WorkOrder, Technician } from "@/lib/types";
import { format, isSameDay, startOfDay } from 'date-fns';
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
import { cn, formatCityState } from '@/lib/utils';
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { isAdmin, isPayAdmin } from "@/lib/permissions";
import { PAY_TYPE_LABELS } from '@/lib/constants';

const getFieldNationLink = (id: string) => {
  const cleanId = id.replace(/^wo-/, '');
  return `https://app.fieldnation.com/workorders/${cleanId}`;
};

type SortOption = 'date' | 'client' | 'status' | 'pay' | 'tech';

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
  const [editedOrder, setEditedOrder] = useState<WorkOrder | null>(null);

  const [currentUser, setCurrentUser] = useState<Technician | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  const { toast } = useToast();

  /**
   * Recursive Sanitize Protocol.
   * Purges undefined properties to ensure document update integrity.
   */
  const sanitize = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sanitize);
    
    const result: any = {};
    Object.keys(obj).forEach(key => {
        const val = obj[key];
        if (val !== undefined) {
            result[key] = sanitize(val);
        }
    });
    return result;
  };

  /**
   * Unified Tactical Date Parser.
   * Consistently handles mixed MM-DD-YYYY and YYYY-MM-DD formats in local time.
   */
  const parseTacticalDate = (dateStr: string) => {
    if (!dateStr) return null;
    try {
        const parts = dateStr.split(/[-/]/);
        if (parts.length !== 3) return null;
        let year, month, day;
        if (parts[0].length === 4) {
            year = parseInt(parts[0]);
            month = parseInt(parts[1]) - 1;
            day = parseInt(parts[2]);
        } else {
            month = parseInt(parts[0]) - 1;
            day = parseInt(parts[1]);
            year = parseInt(parts[2]);
        }
        return startOfDay(new Date(year, month, day));
    } catch (e) {
        return null;
    }
  };

  // 1. Initialize Data Listeners
  useEffect(() => {
    const q = query(collection(db, 'assignments'));
    const unsub = onSnapshot(q, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as WorkOrder));
      setWorkOrders(orders);
    });

    const techQ = query(collection(db, 'users'));
    const techUnsub = onSnapshot(techQ, (snapshot) => {
      const techs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Technician));
      setTechnicians(techs);
      
      const userId = sessionStorage.getItem('currentUserId');
      if (userId) {
        setCurrentUser(techs.find(t => t.id === userId) || null);
      }
    });

    return () => {
      unsub();
      techUnsub();
    };
  }, []);

  const filteredWorkOrders = useMemo(() => {
    return workOrders
      .filter(wo => {
        const techId = wo.assignedTechnicianId || (wo.assignedTechIds && wo.assignedTechIds[0]) || wo.techId;
        
        const tech = technicians.find(t => t.id === techId);
        const queryStr = searchQuery.toLowerCase();
        
        const matchesSearch = (
          (wo.id || '').toLowerCase().includes(queryStr) ||
          (wo.title || '').toLowerCase().includes(queryStr) ||
          (wo.description || '').toLowerCase().includes(queryStr) ||
          (wo.clientName || '').toLowerCase().includes(queryStr) ||
          (tech && (tech.name || '').toLowerCase().includes(queryStr))
        );

        const matchesDate = !dateRange?.from || (() => {
            const woDate = parseTacticalDate(wo.scheduleDate);
            if (!woDate) return true;
            const start = startOfDay(dateRange.from!);
            const end = dateRange.to ? startOfDay(dateRange.to) : start;
            return woDate >= start && woDate <= end;
        })();

        const matchesPriority = activePriorities.length === 0 || activePriorities.includes(wo.priority);
        const matchesSource = activeSources.length === 0 || (wo.source && activeSources.includes(wo.source));

        return matchesSearch && matchesDate && matchesPriority && matchesSource;
      })
      .sort((a, b) => {
        const safeA = { 
            date: a.scheduleDate || '', 
            client: a.clientName || '', 
            status: a.status || '', 
            title: a.title || a.description || '',
            id: a.id || ''
        };
        const safeB = { 
            date: b.scheduleDate || '', 
            client: b.clientName || '', 
            status: b.status || '', 
            title: b.title || b.description || '',
            id: b.id || ''
        };

        switch (sortBy) {
          case 'client': return safeA.client.localeCompare(safeB.client);
          case 'status': return safeA.status.localeCompare(safeB.status);
          case 'pay': return (b.pay || 0) - (a.pay || 0);
          case 'tech': 
            const idA = a.assignedTechnicianId || a.assignedTechIds?.[0] || a.techId;
            const idB = b.assignedTechnicianId || b.assignedTechIds?.[0] || b.techId;
            const techA = technicians.find(t => t.id === idA)?.name || 'Unassigned';
            const techB = technicians.find(t => t.id === idB)?.name || 'Unassigned';
            return techA.localeCompare(techB);
          case 'date':
          default:
            return safeA.date.localeCompare(safeB.date);
        }
      });
  }, [workOrders, technicians, searchQuery, dateRange, sortBy, activePriorities, activeSources]);

  const activeWorkOrders = useMemo(() => 
    filteredWorkOrders.filter(wo => wo.status !== 'completed'),
  [filteredWorkOrders]);

  const archivedWorkOrders = useMemo(() => 
    filteredWorkOrders.filter(wo => wo.status === 'completed'),
  [filteredWorkOrders]);

  const formatDateDisplay = (dateStr: string) => {
    const woDate = parseTacticalDate(dateStr);
    return woDate ? format(woDate, 'MM-dd-yyyy') : dateStr;
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

  const handleSaveChanges = () => {
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

    const docRef = doc(db, 'assignments', editedOrder.id);
    updateDoc(docRef, sanitize(finalUpdate)).catch((error: any) => {
        console.error("Registry Update Error:", error);
        toast({ variant: "destructive", title: "Update Failed", description: error.message });
    });

    setIsEditDialogOpen(false);
    setSelectedJob(null);
    setEditedOrder(null);
    toast({ title: "Updated", description: "Assignment parameters committed to Firestore." });
  };

  const handleDeleteOrder = () => {
    if (!selectedJob) return;
    const docRef = doc(db, 'assignments', selectedJob.id);
    deleteDoc(docRef).catch((e: any) => {
      console.error("Purge Error:", e);
      toast({ variant: "destructive", title: "Delete Failed", description: e.message });
    });
    setIsEditDialogOpen(false);
    setSelectedJob(null);
    setEditedOrder(null);
    toast({ title: "Deleted", description: "Assignment removed from record." });
  };

  const handleVerifyAssignment = async (woId: string) => {
    const docRef = doc(db, 'assignments', woId);
    try {
        await updateDoc(docRef, { 
            isAudited: true, 
            auditedAt: new Date().toISOString(), 
            auditedBy: currentUser?.name || 'Admin' 
        });
        toast({ title: "Verified", description: `Job ${woId.toUpperCase()} has been confirmed.` });
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Audit Failure', description: e.message });
    }
  };

  const handleJobUpdate = (woId: string, updates: Partial<WorkOrder>) => {
    const docRef = doc(db, 'assignments', woId);
    updateDoc(docRef, sanitize(updates)).catch((error: any) => {
        const woRef = doc(db, 'workOrders', woId);
        updateDoc(woRef, sanitize(updates)).catch(err => {
            console.error("Field Update Error:", err);
            toast({ variant: "destructive", title: "Update Failed", description: err.message });
        });
    });
    
    if (selectedJob?.id === woId) {
        setSelectedJob(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  const hasActiveFilters = !!dateRange?.from || activePriorities.length > 0 || activeSources.length > 0 || sortBy !== 'date';

  return (
    <div className="space-y-6 text-left">
      <header className="page-header flex flex-col md:flex-row md:items-end justify-between gap-4 text-left">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2 text-left">
            <CalendarIcon size={12} />
            Assignment Tracker
          </p>
          <h1 className="page-title text-left">Assignments</h1>
          <p className="page-subtitle text-left">Schedule and history and historical job audit.</p>
        </div>
        <div className="flex items-center gap-3 text-left">
            <div className="flex items-center rounded-md border border-border-main overflow-hidden h-10 bg-bg-secondary shrink-0">
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  "px-3 h-full flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors",
                  viewMode === 'list' ? "bg-bg-tertiary text-text-primary" : "text-text-muted hover:text-text-primary"
                )}
              >
                <List size={13} /> List
              </button>
              <div className="w-px h-full bg-border-main" />
              <button
                onClick={() => setViewMode('map')}
                className={cn(
                  "px-3 h-full flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors",
                  viewMode === 'map' ? "bg-bg-tertiary text-text-primary" : "text-text-muted hover:text-text-primary"
                )}
              >
                <Map size={13} /> Map
              </button>
            </div>
            <div className="search-wrap text-left">
              <Search className="h-4 w-4" />
              <input 
                placeholder="Search Tech, ID, or Title..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input !w-full md:!w-[300px] bg-bg-secondary border-border-main h-10"
              />
            </div>
            
            <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                <SelectTrigger className="w-[140px] h-10 bg-bg-secondary border-border-main text-[10px] uppercase font-bold tracking-widest">
                    <div className="flex items-center gap-2 text-left">
                        <ArrowUpDown size={14} className="text-text-muted" />
                        <SelectValue placeholder="Sort" />
                    </div>
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="date" className="text-[10px] uppercase font-bold">By Date</SelectItem>
                    <SelectItem value="tech" className="text-[10px] uppercase font-bold">By Technician</SelectItem>
                    <SelectItem value="client" className="text-[10px] uppercase font-bold">By Client</SelectItem>
                    <SelectItem value="status" className="text-[10px] uppercase font-bold">By Status</SelectItem>
                    <SelectItem value="pay" className="text-[10px] uppercase font-bold">By Labor Rate</SelectItem>
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
                  <div className="p-4 border-b border-border-sub bg-bg-tertiary text-left">
                    <div className="flex items-center justify-between text-left">
                      <p className="text-[10px] font-black uppercase tracking-widest text-text-primary text-left">Filters</p>
                      {hasActiveFilters && (
                        <button onClick={() => { setDateRange(undefined); setActivePriorities([]); setActiveSources([]); setSortBy('date'); }} className="text-[9px] font-bold text-brand-red hover:underline flex items-center gap-1">
                          <X size={10} /> Reset
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="p-4 space-y-6 text-left">
                    <div className="space-y-3 text-left">
                      <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest text-left">Priority Audit</p>
                      <div className="grid grid-cols-2 gap-2 text-left">
                        {['critical', 'high', 'medium', 'low'].map(priority => (
                          <div key={priority} className="flex items-center space-x-2 text-left">
                            <Checkbox 
                              id={`prio-${priority}`} 
                              checked={activePriorities.includes(priority)}
                              onCheckedChange={(checked) => {
                                setActivePriorities(prev => checked ? [...prev, priority] : prev.filter(p => p !== priority));
                              }}
                            />
                            <Label htmlFor={`prio-${priority}`} className="text-[10px] uppercase font-semibold cursor-pointer text-left">{priority}</Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3 text-left">
                      <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest text-left">Job Source</p>
                      <div className="space-y-2 text-left">
                        {['Imported', 'Manual', 'Client'].map(source => (
                          <div key={source} className="flex items-center space-x-2 text-left">
                            <Checkbox 
                              id={`source-${source}`} 
                              checked={activeSources.includes(source)}
                              onCheckedChange={(checked) => {
                                setActiveSources(prev => checked ? [...prev, source] : prev.filter(s => s !== source));
                              }}
                            />
                            <Label htmlFor={`source-${source}`} className="text-[10px] uppercase font-semibold cursor-pointer text-left">{source}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </PopoverContent>
            </Popover>
        </div>
      </header>

      {viewMode === 'map' && (
        <div className="h-[70vh] rounded-lg overflow-hidden border border-border-main">
          <AdminMapView
            jobs={filteredWorkOrders}
            selectedJob={selectedJob}
            onSelectJob={(job) => { setSelectedJob(job); setIsDetailOpen(true); }}
          />
        </div>
      )}

      {viewMode === 'list' && <Tabs defaultValue="schedule" className="w-full text-left">
        <div className="flex items-center justify-between gap-4 mb-6 bg-bg-secondary/50 p-4 rounded-lg border border-border-sub text-left shadow-sm">
          <TabsList className="tabs !mb-0 text-left">
            <TabsTrigger value="schedule" className="tab">
              Active Assignments <span className="tab-count">({activeWorkOrders.length})</span>
            </TabsTrigger>
            <TabsTrigger value="archive" className="tab">
              Job Archive <span className="tab-count">({archivedWorkOrders.length})</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-1.5 text-left">
            <Popover>
              <PopoverTrigger asChild>
                <div className={cn(
                    "flex items-center h-8 rounded-md border border-border-main bg-bg-secondary px-3 cursor-pointer hover:bg-bg-tertiary transition-all group relative pr-8 text-left",
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

        <div className="space-y-6 text-left">
            <TabsContent value="schedule" className="mt-0 space-y-6 text-left">
                <div className="table-wrap text-left">
                    <table className="tbl">
                        <thead>
                            <tr className="bg-bg-tertiary">
                                <th className="text-left pl-6 w-[180px]">Status & ID</th>
                                <th className="text-left pl-0">Assignment Identification</th>
                                <th className="text-center">Operative</th>
                                <th className="text-left pl-0">Site Coordinates</th>
                                <th className="text-left pl-0">Schedule Date</th>
                                <th className="text-right pr-6">Labor Rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activeWorkOrders.map(wo => {
                                const techId = wo.assignedTechnicianId || wo.assignedTechIds?.[0] || wo.techId;
                                const tech = technicians.find(t => t.id === techId);
                                return (
                                    <tr key={wo.id} className="cursor-pointer group hover:bg-bg-tertiary transition-colors text-left" onClick={() => handleCardClick(wo)}>
                                        <td className="text-left pl-6 py-4">
                                            <div className="flex flex-col items-start gap-1.5 text-left">
                                                <div className="flex items-center gap-1.5 text-left">
                                                    <div className="cell-id font-mono text-brand-red font-bold text-left">{(wo.id || '').toUpperCase()}</div>
                                                    {wo.source === 'Imported' && (
                                                    <a href={getFieldNationLink(wo.id)} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-brand-red transition-colors" onClick={(e) => e.stopPropagation()}>
                                                        <ExternalLink size={10} />
                                                    </a>
                                                    )}
                                                </div>
                                                <Badge variant={wo.status === 'in-progress' ? 'inprogress' : wo.status === 'checked-out' ? 'checked-out' : 'scheduled'} className="text-[8px] h-4 px-1.5 uppercase tracking-widest">{wo.status}</Badge>
                                            </div>
                                        </td>
                                        <td className="text-left pl-0 py-4 text-left">
                                            <div className="flex flex-col min-w-0 text-left">
                                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors whitespace-normal text-left">{wo.title || wo.description}</p>
                                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mt-1 text-left">{wo.clientName}</p>
                                            </div>
                                        </td>
                                        <td className="py-4 text-center">
                                            <div className="flex flex-col items-center justify-center text-center">
                                                {tech ? (
                                                    <div className="flex items-center gap-3 text-left">
                                                        <Avatar className="h-8 w-8 border border-border-sub shadow-sm">
                                                            <AvatarImage src={tech.avatarUrl} />
                                                            <AvatarFallback>{tech.name?.charAt(0)}</AvatarFallback>
                                                        </Avatar>
                                                        <span className="text-[10px] font-bold text-text-primary uppercase text-left">{tech.name}</span>
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
                                        <td className="py-4 pl-0 text-left">
                                            <div className="flex items-center justify-start gap-2 text-[10px] text-text-secondary font-bold uppercase text-left">
                                                <MapPin size={11} className="text-brand-red shrink-0" /><span className="whitespace-normal text-left">{formatCityState(wo.location)}</span>
                                            </div>
                                        </td>
                                        <td className="py-4 pl-0 text-left">
                                            <div className="flex flex-col items-start justify-center gap-1.5 text-left">
                                                <div className="flex items-center gap-2 text-[10px] text-text-secondary font-mono font-bold text-left"><CalendarIcon size={13} className="text-text-muted shrink-0" /><span>{formatDateDisplay(wo.scheduleDate)}</span></div>
                                                <div className="flex items-center gap-2 text-[10px] text-text-secondary font-mono text-left"><Clock size={13} className="text-text-muted shrink-0" /><span>{wo.scheduleTime}</span></div>
                                            </div>
                                        </td>
                                        <td className="text-right pr-6 py-4 text-right">
                                            <div className="flex flex-col items-end text-right">
                                                {wo.payType === 'blended' ? (
                                                    <>
                                                        <span className="text-sm font-mono font-bold text-text-green text-right">
                                                            ${(wo.blendedFixedPay || 0).toFixed(2)} + ${(wo.blendedHourlyRate || 0).toFixed(2)}/hr
                                                        </span>
                                                        <span className="text-[8px] text-text-muted uppercase font-bold tracking-widest mt-0.5 text-right">
                                                            after {wo.blendedIncludedHours || 0} hrs
                                                        </span>
                                                    </>
                                                ) : wo.payType === 'hourly' ? (
                                                    <>
                                                        <span className="text-sm font-mono font-bold text-text-green text-right">${(wo.pay || 0).toFixed(2)}/hr</span>
                                                        <span className="text-[8px] text-text-muted uppercase font-bold tracking-widest mt-0.5 text-right">hourly labor rate</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="text-sm font-mono font-bold text-text-green text-right">${(wo.pay || 0).toFixed(2)}</span>
                                                        <span className="text-[8px] text-text-muted uppercase font-bold tracking-widest mt-0.5 text-right">fixed labor rate</span>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {activeWorkOrders.length === 0 && (
                    <div className="p-12 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30 text-left">
                        <Activity size={32} className="mx-auto text-text-muted mb-4 opacity-20" />
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] italic text-center">No active jobs found matching search criteria</p>
                    </div>
                )}
            </TabsContent>

            <TabsContent value="archive" className="mt-0 text-left">
                <div className="table-wrap text-left">
                    <table className="tbl">
                        <thead>
                            <tr className="bg-bg-tertiary">
                                <th className="text-left pl-6 w-[200px]">Assignment Identification</th>
                                <th className="text-center">Client & Service Result</th>
                                <th className="text-center">Deployment Coordinates</th>
                                <th className="text-center">Finalized Date</th>
                                <th className="text-right pr-6">Audit Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {archivedWorkOrders.map(wo => {
                                const techId = wo.assignedTechnicianId || wo.assignedTechIds?.[0] || wo.techId;
                                const tech = technicians.find(t => t.id === techId);
                                return (
                                    <tr key={wo.id} className="cursor-pointer group hover:bg-bg-tertiary transition-colors text-left" onClick={() => handleCardClick(wo)}>
                                        <td className="text-left pl-6 py-4 text-left">
                                            <div className="flex items-center gap-3 text-left">
                                                <div className="flex flex-col items-center text-center">
                                                    <div className="flex items-center gap-1.5 text-center">
                                                      <div className="cell-id font-mono text-brand-red text-center">{(wo.id || '').toUpperCase()}</div>
                                                      {wo.source === 'Imported' && (
                                                        <a href={getFieldNationLink(wo.id)} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-brand-red transition-colors" onClick={(e) => e.stopPropagation()}>
                                                          <ExternalLink size={10} />
                                                        </a>
                                                      )}
                                                    </div>
                                                    <Badge variant="completed" className="text-[8px] h-3.5 mt-1">CLOSED</Badge>
                                                </div>
                                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors whitespace-normal text-left">{wo.title || wo.description}</p>
                                            </div>
                                        </td>
                                        <td className="py-4 text-center">
                                            <div className="flex flex-col items-center justify-center text-center">
                                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1 text-center"><Briefcase size={12}/> {wo.clientName}</div>
                                                <div className="flex items-center gap-1.5 text-xs text-text-green font-bold uppercase text-center"><CheckCircle2 size={14}/> Successfully Finalized</div>
                                            </div>
                                        </td>
                                        <td className="py-4 text-center">
                                            <div className="flex items-center justify-center text-center gap-2 text-[10px] text-text-secondary font-bold uppercase text-center"><MapPin size={12} className="text-brand-red shrink-0 text-center" /><span className="whitespace-normal text-center">{formatCityState(wo.location)}</span></div>
                                        </td>
                                        <td className="py-4 text-center text-center">
                                            <div className="flex flex-col items-center justify-center text-center">
                                                <div className="flex items-center gap-2 text-[10px] text-text-primary font-bold uppercase tracking-tight text-center"><CalendarIcon size={12} className="text-text-muted" />{formatDateDisplay(wo.scheduleDate)}</div>
                                                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-text-muted font-bold uppercase text-center"><User size={10}/> {tech?.name || 'Field Ops'}</div>
                                            </div>
                                        </td>
                                        <td className="py-4 text-right pr-6 text-right">
                                            <div className="flex items-center justify-end gap-2 text-right" onClick={e => e.stopPropagation()}>
                                                {wo.isAudited ? (
                                                    <Badge variant="active" className="h-7 px-4 uppercase text-[9px] tracking-widest font-black flex items-center gap-1.5 text-right">
                                                        <ShieldCheck size={14} className="text-text-green"/>
                                                        Verified
                                                    </Badge>
                                                ) : (
                                                    <div className="flex gap-2 text-right">
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="h-7 text-[9px] font-bold uppercase tracking-widest border-text-green text-text-green hover:bg-green-dim"
                                                            onClick={() => handleVerifyAssignment(wo.id)}
                                                        >
                                                            <Check size={14} className="mr-1.5"/>
                                                            Verify
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="h-7 w-7 text-text-muted hover:text-text-red"
                                                            onClick={() => { setSelectedJob(wo); handleDeleteOrder(); }}
                                                        >
                                                            <Trash2 size={14}/>
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
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
        
        <Dialog open={isEditDialogOpen} onOpenChange={(open) => { if(!open) { setSelectedJob(null); setEditedOrder(null); } setIsEditDialogOpen(open); }}>
          <DialogContent className="sm:max-w-[700px] bg-bg-elevated border-border-default max-h-[90vh] overflow-hidden flex flex-col p-0 shadow-2xl text-left">
              <DialogHeader className="p-6 pb-2 text-left border-b border-border-sub bg-bg-tertiary/30">
                <div className="flex items-center justify-between text-left">
                    <div className="space-y-1 text-left">
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary text-left">Update Assignment Parameters</DialogTitle>
                        <p className="text-xs text-text-muted text-left">Adjust manual parameters for assignment <span className="font-bold text-text-primary">{(selectedJob?.id || '').toUpperCase()}</span></p>
                    </div>
                </div>
              </DialogHeader>
              {editedOrder && (
                  <ScrollArea className="flex-1 text-left">
                    <div className="px-6 py-4 space-y-6 text-left">
                        <div className="space-y-4 text-left">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2 text-left">
                                  <Type size={12} className="text-brand-red"/> Job Title
                                </Label>
                                <Input placeholder="e.g. Fiber Audit" value={editedOrder.title || ''} onChange={(e) => setEditedOrder({...editedOrder, title: e.target.value})} className="bg-bg-primary border-border-sub h-10 text-xs font-bold uppercase" />
                            </div>
                            <div className="space-y-2 text-left text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2 text-left">
                                  <FileText size={12} className="text-accent-gold"/> Scope of Work
                                </Label>
                                <Textarea placeholder="Detailed requirements..." value={editedOrder.description || ''} onChange={(e) => setEditedOrder({...editedOrder, description: e.target.value})} className="bg-bg-primary border-border-sub h-24 text-xs text-left" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-left">
                            <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Client / Entity</Label>
                              <Input value={editedOrder.clientName || ''} onChange={(e) => setEditedOrder({...editedOrder, clientName: e.target.value})} className="bg-bg-primary h-10 text-xs font-bold uppercase text-left" />
                            </div>
                            <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Site Location</Label>
                              <Input value={editedOrder.location || ''} onChange={(e) => setEditedOrder({...editedOrder, location: e.target.value})} className="bg-bg-primary h-10 text-xs text-left" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-left">
                          <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Service Category</Label>
                              <Select value={editedOrder.projectType} onValueChange={(val) => setEditedOrder({...editedOrder, projectType: val})}>
                                  <SelectTrigger className="h-10 bg-bg-primary text-xs uppercase font-bold text-left"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                      <SelectItem value="Installation">Installation</SelectItem>
                                      <SelectItem value="Troubleshooting">Troubleshooting</SelectItem>
                                      <SelectItem value="Maintenance">Maintenance</SelectItem>
                                      <SelectItem value="Survey">Survey</SelectItem>
                                      <SelectItem value="Repair">Repair</SelectItem>
                                  </SelectContent>
                              </Select>
                          </div>
                          <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Priority Level</Label>
                              <Select value={editedOrder.priority} onValueChange={(val: any) => setEditedOrder({...editedOrder, priority: val})}>
                                  <SelectTrigger className="h-10 bg-bg-primary text-xs uppercase font-bold text-left"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                      <SelectItem value="low">Low</SelectItem>
                                      <SelectItem value="medium">Medium</SelectItem>
                                      <SelectItem value="high">High</SelectItem>
                                      <SelectItem value="critical">Critical</SelectItem>
                                  </SelectContent>
                              </Select>
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-left">
                          <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Schedule Date</Label>
                              <Input type="date" value={editedOrder.scheduleDate || ''} onChange={(e) => setEditedOrder({...editedOrder, scheduleDate: e.target.value})} className="bg-bg-primary h-10 text-xs text-left" />
                          </div>
                          <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Start Window</Label>
                              <Input placeholder="e.g. 10:00 AM EST" value={editedOrder.scheduleTime || ''} onChange={(e) => setEditedOrder({...editedOrder, scheduleTime: e.target.value})} className="bg-bg-primary h-10 text-xs text-left" />
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-left">
                          <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Pay Model</Label>
                              <Select value={editedOrder.payType} onValueChange={(val: any) => setEditedOrder({ ...editedOrder, payType: val })}>
                                  <SelectTrigger className="h-10 bg-bg-primary text-xs uppercase font-bold text-left"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                      <SelectItem value="fixed" className="text-xs uppercase font-bold">{PAY_TYPE_LABELS.fixed}</SelectItem>
                                      <SelectItem value="hourly" className="text-xs font-bold">{PAY_TYPE_LABELS.hourly}</SelectItem>
                                      <SelectItem value="blended" className="text-xs font-bold">{PAY_TYPE_LABELS.blended}</SelectItem>
                                  </SelectContent>
                              </Select>
                          </div>
                          {editedOrder.payType !== 'blended' && (
                              <div className="space-y-2 text-left text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Labor Rate ($)</Label>
                                <Input type="number" value={editedOrder.pay || 0} onChange={(e) => setEditedOrder({...editedOrder, pay: parseFloat(e.target.value) || 0})} className="bg-bg-primary h-10 text-xs font-mono text-text-green text-left" />
                              </div>
                          )}
                      </div>

                      {editedOrder.payType === 'blended' && (
                          <div className="grid grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2 duration-300 p-3 rounded-lg border border-border-sub bg-bg-secondary/50 text-left">
                              <div className="space-y-2 text-left text-left">
                                  <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Fixed Base ($)</Label>
                                  <div className="relative text-left">
                                      <DollarSign size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                                      <Input 
                                          type="number"
                                          value={editedOrder.blendedFixedPay || ''}
                                          onChange={(e) => {
                                            const val = parseFloat(e.target.value) || 0;
                                            setEditedOrder({...editedOrder, blendedFixedPay: val, pay: val});
                                          }}
                                          className="bg-bg-primary h-9 pl-6 font-mono text-text-green text-[11px] text-left"
                                      />
                                  </div>
                              </div>
                              <div className="space-y-2 text-left text-left">
                                  <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Incl. Hours</Label>
                                  <Input 
                                      type="number"
                                      value={editedOrder.blendedIncludedHours || ''}
                                      onChange={(e) => setEditedOrder({...editedOrder, blendedIncludedHours: parseFloat(e.target.value) || 0})}
                                      className="bg-bg-primary h-9 font-mono text-text-primary text-[11px] text-left"
                                  />
                              </div>
                              <div className="space-y-2 text-left text-left">
                                  <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Post Rate ($/hr)</Label>
                                  <div className="relative text-left">
                                      <DollarSign size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                                      <Input 
                                          type="number"
                                          value={editedOrder.blendedHourlyRate || ''}
                                          onChange={(e) => setEditedOrder({...editedOrder, blendedHourlyRate: parseFloat(e.target.value) || 0})}
                                          className="bg-bg-primary h-9 font-mono text-text-green text-[11px] text-left"
                                      />
                                  </div>
                              </div>
                              <p className="col-span-3 text-[9px] text-text-muted uppercase font-bold italic tracking-tighter text-left">Fixed amount for specified hours, then hourly rate applies.</p>
                          </div>
                      )}

                        <Separator className="bg-border-sub text-left" />
                        <div className="grid grid-cols-2 gap-4 text-left">
                            <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] uppercase font-bold text-text-muted ml-1 text-center block text-left">Technician Allocation</Label>
                              <Select value={editedOrder.assignedTechnicianId || editedOrder.techId || 'unassigned'} onValueChange={(val) => setEditedOrder({ ...editedOrder, assignedTechnicianId: val === 'unassigned' ? null : val, status: val === 'unassigned' ? 'unassigned' : 'assigned' })}>
                                <SelectTrigger className="bg-bg-primary h-11 focus:ring-brand-red text-xs text-left">
                                  <SelectValue placeholder="Select Technician" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned" className="text-brand-red font-bold uppercase tracking-widest">UNASSIGNED</SelectItem>
                                  {technicians.filter(t => !t.roles?.includes('client')).map(tech => <SelectItem key={tech.id} value={tech.id} className="text-xs uppercase font-bold">{tech.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] uppercase font-bold text-text-muted ml-1 text-center block text-left">Operational Status</Label>
                              <Select value={editedOrder.status} onValueChange={(val: any) => setEditedOrder({ ...editedOrder, status: val })}>
                                <SelectTrigger className="bg-bg-primary h-11 uppercase font-bold tracking-wider focus:ring-brand-red text-xs text-left">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned" className="text-xs uppercase font-bold">UNASSIGNED</SelectItem>
                                  <SelectItem value="assigned" className="text-xs uppercase font-bold">ASSIGNED</SelectItem>
                                  <SelectItem value="confirmed" className="text-xs uppercase font-bold">CONFIRMED</SelectItem>
                                  <SelectItem value="on-my-way" className="text-xs uppercase font-bold">ON MY WAY</SelectItem>
                                  <SelectItem value="in-progress" className="text-xs uppercase font-bold">IN PROGRESS</SelectItem>
                                  <SelectItem value="checked-out" className="text-xs uppercase font-bold">CHECKED OUT</SelectItem>
                                  <SelectItem value="completed" className="text-xs uppercase font-bold">COMPLETED</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                        </div>
                    </div>
                  </ScrollArea>
              )}
              <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default mt-4 shrink-0 flex flex-row items-center justify-between text-left">
                <Button variant="destructive-outline" onClick={handleDeleteOrder} className="h-11 px-8 uppercase font-bold text-[10px] tracking-widest border-brand-red text-text-red hover:bg-brand-red-dim">
                    <Trash2 size={16} className="mr-2" />
                    Delete
                </Button>
                <div className="flex gap-3 text-left">
                    <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="h-11 px-8 uppercase font-bold text-[10px] tracking-widest">Cancel</Button>
                    <Button onClick={handleSaveChanges} className="h-11 px-12 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest text-white">Save Changes</Button>
                </div>
              </DialogFooter>
          </DialogContent>
        </Dialog>
      </Tabs>}
    </div>
  );
}
