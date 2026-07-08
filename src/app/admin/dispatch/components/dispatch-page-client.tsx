
'use client';

import { useState, useMemo, useEffect } from 'react';
import { db } from "@/lib/firebase";
import { collection, doc, setDoc, addDoc, onSnapshot, query, where, updateDoc, deleteDoc } from 'firebase/firestore';
import { DispatchTabs } from "./dispatch-tabs";
import { RequestsTabs } from "../../requests/components/requests-tabs";
import { WorkOrdersClient } from "./work-orders-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  SlidersHorizontal, 
  Plus, 
  Search, 
  Import as ImportIcon, 
  Layers, 
  ClipboardList, 
  X, 
  ArrowUpDown, 
  Calendar as CalendarIcon, 
  History as HistoryIcon, 
  Wrench,
  Activity
} from "lucide-react";
import { NewAssignmentDialog } from "./new-assignment-dialog";
import { ImportJobsDialog, type ExistingRef as ImportExistingRef } from "./import-jobs-dialog";
import { normalizeExternalId, isImported } from "@/lib/work-order-identity";
import { NewRequestDialog } from "../../requests/components/new-request-dialog";
import type { WorkOrder, Route, ServiceRequest, Technician } from "@/lib/types";
import { isServiceTicketDoc, toDateSafe } from '@/lib/request-intake';
import { makeAssignmentId } from '@/lib/doc-ids';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { format, isSameDay, parseISO, startOfDay } from 'date-fns';
import { useSearchParams } from 'next/navigation';
import { NotificationService } from '@/lib/notification-service';

const SERVICE_CATEGORIES = [
    'Installation',
    'Troubleshooting',
    'Maintenance',
    'Survey',
    'Repair',
    'Decommission'
];

const ASSIGNMENT_SOURCES = [
  'Imported',
  'Manual',
  'Client'
];

type SortOption = 'priority' | 'date' | 'client' | 'status' | 'pay' | 'tech' | 'type';

export function DispatchPageClient() {
  const searchParams = useSearchParams();
  const [activeMasterTab, _setActiveMasterTabRaw] = useState(() => {
    const sp = searchParams.get('tab');
    if (sp === 'requests' || sp === 'assignments' || sp === 'dispatch') return sp;
    try { return localStorage.getItem('cc:dispatch:tab') || 'dispatch'; } catch { return 'dispatch'; }
  });
  const setActiveMasterTab = (v: string) => { _setActiveMasterTabRaw(v); try { localStorage.setItem('cc:dispatch:tab', v); } catch {} };
  
  const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>([]);
  const [allAssignments, setAllAssignments] = useState<WorkOrder[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [allRequests, setAllRequests] = useState<ServiceRequest[]>([]);
  const [archivedJobs, setArchivedJobs] = useState<any[]>([]);
  
  const [isNewDispatchOpen, setIsNewDispatchOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [sortBy, setSortBy] = useState<SortOption>('priority');

  const [activePriorities, setActivePriorities] = useState<string[]>([]);
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [activeSources, setActiveSources] = useState<string[]>([]);

  const { toast } = useToast();

  /**
   * Recursive Sanitize Protocol.
   * Hardened against undefined values to ensure Firestore compatibility.
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

  // 1. Initialize Data Listeners
  useEffect(() => {
    const unsubWO = onSnapshot(collection(db, 'workOrders'), (snap) => {
      setAllWorkOrders(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as WorkOrder)));
    });
    const unsubAsmt = onSnapshot(collection(db, 'assignments'), (snap) => {
      setAllAssignments(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as WorkOrder)));
    });
    const unsubTech = onSnapshot(
      collection(db, 'users'),
      (snap) => { setTechnicians(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Technician))); }
    );
    const unsubReq = onSnapshot(collection(db, 'clientRequests'), (snap) => {
      // Only dispatchable service tickets belong in the dispatch funnel —
      // client-intake / partnership applications are reviewed on /admin/requests.
      setAllRequests(
        snap.docs
          .filter(doc => isServiceTicketDoc(doc.data()))
          .map(doc => {
            const data = doc.data();
            // Public-form tickets carry createdAt (Firestore Timestamp) but no
            // submittedDate — derive it so table dates and sorting stay correct.
            const created = toDateSafe(data.createdAt);
            const submittedDate = data.submittedDate || (created ? created.toISOString().split('T')[0] : '');
            return { ...data, submittedDate, id: doc.id } as ServiceRequest;
          })
      );
    });
    const unsubRoutes = onSnapshot(collection(db, 'routes'), (snap) => {
      setRoutes(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Route)));
    });
    // Archived deletions — so re-importing a work order number that was deleted
    // and archived is still flagged as a duplicate.
    const unsubArchive = onSnapshot(collection(db, 'activityArchive'), (snap) => {
      setArchivedJobs(snap.docs.map(doc => doc.data()));
    }, () => { /* archive rule may be undeployed; dup check still covers active jobs */ });

    return () => {
      unsubWO(); unsubAsmt(); unsubTech(); unsubReq(); unsubRoutes(); unsubArchive();
    };
  }, []);

  // Every external work order number already known to the app, for import
  // duplicate detection across active, assigned, completed, and archived jobs.
  const existingImportRefs = useMemo<ImportExistingRef[]>(() => {
    const refs: ImportExistingRef[] = [];
    const push = (o: any, where: string) => {
      const ext = normalizeExternalId((o?.externalWorkOrderId) || o?.workOrderId || o?.id);
      if (!ext) return;
      const techName = technicians.find(t => t.id === (o.assignedTechnicianId || o.techId))?.name;
      refs.push({
        externalId: ext,
        label: ((o.externalWorkOrderId) || o.workOrderId || o.id || '').toString().toUpperCase(),
        status: o.status,
        techName,
        scheduleDate: o.scheduleDate,
        where,
      });
    };
    allWorkOrders.forEach(o => { if (isImported(o)) push(o, 'work order pool'); });
    allAssignments.forEach(o => { if (isImported(o)) push(o, `assignment (${o.status || 'active'})`); });
    archivedJobs.forEach(a => {
      let rec: any = a;
      if (a?.archivedRecordJson) { try { rec = JSON.parse(a.archivedRecordJson); } catch { rec = a; } }
      if (isImported(rec)) push(rec, 'archived');
    });
    return refs;
  }, [allWorkOrders, allAssignments, archivedJobs, technicians]);

  const handleAddNewOrder = async (order: WorkOrder) => {
    try {
        await setDoc(doc(db, 'workOrders', order.id), { ...sanitize(order), source: 'Manual' });
        toast({ title: "Assignment Staged", description: "Job entry committed to Firestore." });
        
        const client = technicians.find(t => t.clientCompany === order.clientName);
        if (client) {
            await NotificationService.notify(
                client.id, 
                "New Assignment Staged", 
                `A new work order [${order.title}] has been initialized for your site at ${order.location}.`,
                { id: order.id, type: 'assignment' }
            );
        }
    } catch (e: any) {
        toast({ variant: "destructive", title: "Write Failed", description: e.message });
    }
  };

  const handleImportOrders = (newOrders: WorkOrder[]) => {
    newOrders.forEach(order => {
        setDoc(doc(db, 'workOrders', order.id), { ...sanitize(order), source: 'Imported' })
            .catch(e => console.error("Import error", e));
    });
    toast({ title: "Import Processed", description: `${newOrders.length} records transmitted to registry.` });
  };

  const handleAddNewRequest = async (request: ServiceRequest) => {
    try {
        const now = new Date().toISOString();
        await setDoc(doc(db, 'clientRequests', request.id), {
            ...sanitize(request),
            requestCategory: 'service_ticket',
            source: 'manual',
            createdAt: now,
            updatedAt: now,
        });
        toast({ title: "Request Logged", description: "Service ticket added to intake funnel." });
        
        const adminIds = technicians.filter(t => t.roles?.includes('super_admin') || t.roles?.includes('dispatch_admin')).map(t => t.id);
        await NotificationService.broadcast(
            adminIds,
            "Urgent Intake Ticket",
            `New service request received from ${request.clientName} for site ${request.location}.`,
            { id: request.id, type: 'request' }
        );
    } catch (e: any) {
        toast({ variant: "destructive", title: "Write Failed", description: e.message });
    }
  };

  const resetFilters = () => {
    setSearchQuery("");
    setDateRange(undefined);
    setActivePriorities([]);
    setActiveTypes([]);
    setActiveSources([]);
    setSortBy('priority');
    toast({ title: "Filters Cleared", description: "Operational registry constraints removed." });
  };

  const filterAndSort = (items: WorkOrder[]) => {
    let results = items.filter(order => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        (order.id || '').toLowerCase().includes(q) ||
        (order.title || '').toLowerCase().includes(q) ||
        (order.description || '').toLowerCase().includes(q) ||
        (order.clientName || '').toLowerCase().includes(q);
      
      const matchesPriority = activePriorities.length === 0 || activePriorities.includes(order.priority);
      const matchesType = activeTypes.length === 0 || activeTypes.includes(order.projectType);
      const matchesSource = activeSources.length === 0 || (order.source && activeSources.includes(order.source));
      
      const matchesDate = !dateRange?.from || (order.scheduleDate && (() => {
          try {
              const parts = (order.scheduleDate || '').split(/[-/]/);
              let woDate;
              if (parts[0] && parts[0].length === 4) { woDate = startOfDay(new Date(order.scheduleDate + 'T12:00:00')); } 
              else { 
                const [m, d, y] = parts;
                if (y && m && d) {
                    woDate = startOfDay(new Date(parseInt(y), parseInt(m) - 1, parseInt(d)));
                } else {
                    return true;
                }
              }
              
              if (dateRange.from && dateRange.to) {
                  return woDate >= startOfDay(dateRange.from) && woDate <= startOfDay(dateRange.to);
              }
              if (dateRange.from) {
                  return isSameDay(woDate, dateRange.from);
              }
              return true;
          } catch (e) { return false; }
      })());

      return matchesSearch && matchesPriority && matchesType && matchesSource && matchesDate;
    });

    return results.sort((a, b) => {
        switch (sortBy) {
            case 'priority':
                const prio = { critical: 0, high: 1, medium: 2, low: 3 };
                return prio[a.priority as keyof typeof prio] - prio[b.priority as keyof typeof prio];
            case 'client': return (a.clientName || '').localeCompare(b.clientName || '');
            case 'status': return (a.status || '').localeCompare(b.status || '');
            case 'pay': return (b.pay || 0) - (a.pay || 0);
            case 'type': return (a.projectType || '').localeCompare(b.projectType || '');
            case 'tech':
                const idA = a.assignedTechnicianId || a.assignedTechIds?.[0] || a.techId;
                const idB = b.assignedTechnicianId || b.assignedTechIds?.[0] || b.techId;
                const techA = technicians.find(t => t.id === idA)?.name || 'Unassigned';
                const techB = technicians.find(t => t.id === idB)?.name || 'Unassigned';
                return techA.localeCompare(techB);
            default:
                return (a.scheduleDate || '').localeCompare(b.scheduleDate || '');
        }
    });
  };

  const filteredOrders = useMemo(() => filterAndSort(allWorkOrders), [allWorkOrders, searchQuery, dateRange, activePriorities, activeTypes, activeSources, sortBy, technicians]);
  const filteredAssignments = useMemo(() => filterAndSort(allAssignments), [allAssignments, searchQuery, dateRange, activePriorities, activeTypes, activeSources, sortBy, technicians]);

  const filteredRequests = useMemo(() => {
    let results = allRequests.filter(req => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        (req.id || '').toLowerCase().includes(q) ||
        (req.clientName || '').toLowerCase().includes(q) ||
        (req.description || '').toLowerCase().includes(q) ||
        (req.location || '').toLowerCase().includes(q);
      
      const matchesPriority = activePriorities.length === 0 || activePriorities.includes(req.priority);
      const matchesType = activeTypes.length === 0 || activeTypes.includes(req.requestType);
      
      const matchesDate = !dateRange?.from || (req.submittedDate && (() => {
          try {
              const parts = (req.submittedDate || '').split(/[-/]/);
              let reqDate;
              if (parts[0] && parts[0].length === 4) { reqDate = startOfDay(new Date(req.submittedDate)); } 
              else { 
                const [m, d, y] = parts;
                if (y && m && d) {
                    reqDate = startOfDay(new Date(parseInt(y), parseInt(m) - 1, parseInt(d)));
                } else {
                    return true;
                }
              }
              
              if (dateRange.from && dateRange.to) {
                  return reqDate >= startOfDay(dateRange.from) && reqDate <= startOfDay(dateRange.to);
              }
              if (dateRange.from) {
                  return isSameDay(reqDate, dateRange.from);
              }
              return true;
          } catch (e) { return false; }
      })());

      return matchesSearch && matchesPriority && matchesType && matchesDate;
    });

    return results.sort((a, b) => {
        if (sortBy === 'priority') {
            const prio = { critical: 0, high: 1, medium: 2, low: 3 };
            return prio[a.priority as keyof typeof prio] - prio[b.priority as keyof typeof prio];
        }
        if (sortBy === 'client') return (a.clientName || '').localeCompare(b.clientName || '');
        if (sortBy === 'type') return (a.requestType || '').localeCompare(b.requestType || '');
        return (b.submittedDate || '').localeCompare(a.submittedDate || '');
    });
  }, [allRequests, searchQuery, dateRange, activePriorities, activeTypes, sortBy]);

  const hasActiveFilters = searchQuery !== "" || !!dateRange?.from || activePriorities.length > 0 || activeTypes.length > 0 || activeSources.length > 0 || sortBy !== 'priority';

  return (
    <div className="space-y-6">
        <header className="page-header flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="text-left">
              <p className="page-eyebrow flex items-center gap-2"><Layers size={12} />Operations Control Center</p>
              <h1 className="page-title text-left">Dispatch & Intake</h1>
              <p className="page-subtitle text-left">Unified terminal for client requests and logistical job routing.</p>
            </div>
            <div className="flex items-center gap-3">
                {activeMasterTab !== 'assignments' && (
                  <Button variant="outline" onClick={() => setIsNewRequestOpen(true)} className="h-10 px-4 text-[10px] uppercase font-bold tracking-widest border-border-main">+ New Service Request</Button>
                )}
                {activeMasterTab !== 'requests' && (
                  <>
                    <Button variant="outline" onClick={() => setIsImportDialogOpen(true)} className="h-10 px-4 text-[10px] uppercase font-bold tracking-widest border-border-main"><ImportIcon size={14} className="mr-2"/>Import Jobs</Button>
                    <Button variant="default" onClick={() => setIsNewDispatchOpen(true)} className="h-10 px-4 text-[10px] uppercase font-bold tracking-widest">+ New Dispatch Entry</Button>
                  </>
                )}
            </div>
      </header>

      <Tabs value={activeMasterTab} onValueChange={(val: any) => setActiveMasterTab(val)} className="w-full">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 bg-bg-secondary/50 p-4 rounded-xl border border-border-sub shadow-sm">
            <TabsList className="tabs !mb-0 !p-0 !bg-bg-tertiary">
              <TabsTrigger value="dispatch" className="tab">DISPATCH HUB</TabsTrigger>
              <TabsTrigger value="requests" className="tab">SERVICE REQUESTS</TabsTrigger>
              <TabsTrigger value="assignments" className="tab">ASSIGNMENTS</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="search-wrap flex-1 !mb-0 text-left">
                <Search className="h-4 w-4 text-text-muted" />
                <input 
                  className="search-input !h-9 !text-xs font-bold uppercase !w-full md:!w-[240px] bg-bg-primary text-left" 
                  placeholder={`Search registry...`} 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                  <SelectTrigger className="w-[140px] h-9 bg-bg-primary text-[10px] uppercase font-bold tracking-widest border-border-main">
                      <div className="flex items-center gap-2 text-left">
                          <ArrowUpDown size={14} className="text-text-muted" />
                          <SelectValue placeholder="Sort Registry" />
                      </div>
                  </SelectTrigger>
                  <SelectContent>
                      <SelectItem value="priority" className="text-[10px] uppercase font-bold">Priority</SelectItem>
                      <SelectItem value="date" className="text-[10px] uppercase font-bold">Date</SelectItem>
                      <SelectItem value="client" className="text-[10px] uppercase font-bold">Client</SelectItem>
                      <SelectItem value="status" className="text-[10px] uppercase font-bold">Status</SelectItem>
                      <SelectItem value="pay" className="text-[10px] uppercase font-bold">Labor Rate</SelectItem>
                      <SelectItem value="tech" className="text-[10px] uppercase font-bold">Technician</SelectItem>
                      <SelectItem value="type" className="text-[10px] uppercase font-bold">Type</SelectItem>
                  </SelectContent>
              </Select>

              <Popover>
                  <PopoverTrigger asChild>
                    <div className={cn(
                        "flex items-center h-8 rounded-md border border-border-main bg-bg-primary px-2 cursor-pointer hover:bg-bg-tertiary transition-all group relative pr-7",
                        dateRange?.from && "border-brand-red ring-1 ring-brand-red"
                    )}>
                        <CalendarIcon size={12} className={cn("mr-1.5", dateRange?.from ? "text-brand-red" : "text-text-muted")} />
                        <span className={cn(
                            "text-[10px] font-bold uppercase tracking-widest whitespace-nowrap",
                            dateRange?.from ? "text-text-primary" : "text-text-muted"
                        )}>
                            {dateRange?.from ? (
                                dateRange.to ? <>{format(dateRange.from, "MM-dd-yyyy")} – {format(dateRange.to, "MM-dd-yyyy")}</> : format(dateRange.from, "MM-dd-yyyy")
                            ) : "Date Filter"}
                        </span>
                        {dateRange?.from && (
                            <button 
                                className="absolute right-1.5 p-0.5 rounded-full hover:bg-brand-red/20 text-text-muted hover:text-brand-red transition-colors"
                                onClick={(e) => { e.stopPropagation(); setDateRange(undefined); }}
                            >
                                <X size={10} />
                            </button>
                        )}
                    </div>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-bg-elevated border-border-main shadow-2xl z-[1000]" align="end">
                    <Calendar initialFocus mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={1} />
                  </PopoverContent>
              </Popover>

              <Popover>
                  <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("h-9 text-[10px]", hasActiveFilters && "border-brand-red text-brand-red")}>
                          <SlidersHorizontal size={14} className="mr-2"/>
                          Filters
                          {hasActiveFilters && (
                            <Badge variant="destructive" className="ml-2 h-4 w-4 p-0 flex items-center justify-center text-[8px]">
                              {(searchQuery !== "" ? 1 : 0) + (dateRange?.from ? 1 : 0) + activePriorities.length + activeTypes.length + activeSources.length}
                            </Badge>
                          )}
                      </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-0 bg-bg-elevated border-border-main shadow-2xl" align="end">
                      <div className="p-4 border-b border-border-sub bg-bg-tertiary text-left">
                          <div className="flex items-center justify-between text-left">
                              <p className="text-[10px] font-black uppercase tracking-widest text-text-primary">Filters</p>
                              {hasActiveFilters && (
                                  <button onClick={resetFilters} className="text-[9px] font-bold text-brand-red hover:underline flex items-center gap-1">
                                      <X size={10} /> Reset
                                  </button>
                              )}
                          </div>
                      </div>
                      <div className="p-4 space-y-6 text-left">
                          <div className="space-y-3 text-left">
                              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Priority Audit</p>
                              <div className="grid grid-cols-2 gap-2 text-left">
                                  {['critical', 'high', 'medium', 'low'].map(priority => (
                                      <div key={priority} className="flex items-center space-x-2 text-left">
                                          <Checkbox 
                                              id={`prio-${priority}`} 
                                              checked={activePriorities.includes(priority)}
                                              onCheckedChange={() => togglePriority(priority)}
                                          />
                                          <Label htmlFor={`prio-${priority}`} className="text-[10px] uppercase font-semibold cursor-pointer">{priority}</Label>
                                      </div>
                                  ))}
                              </div>
                          </div>

                          <div className="space-y-3 text-left">
                              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Technical Category</p>
                              <ScrollArea className="h-[120px] text-left">
                                <div className="space-y-2 pr-4 text-left">
                                    {SERVICE_CATEGORIES.map(type => (
                                        <div key={type} className="flex items-center space-x-2 text-left">
                                            <Checkbox 
                                                id={`type-${type}`} 
                                                checked={activeTypes.includes(type)}
                                                onCheckedChange={() => toggleType(type)}
                                            />
                                            <Label htmlFor={`type-${type}`} className="text-[10px] uppercase font-semibold cursor-pointer">{type}</Label>
                                        </div>
                                    ))}
                                </div>
                              </ScrollArea>
                          </div>

                          <div className="space-y-3 text-left">
                              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Source Registry</p>
                              <div className="space-y-2 text-left">
                                  {ASSIGNMENT_SOURCES.map(source => (
                                      <div key={source} className="flex items-center space-x-2 text-left">
                                          <Checkbox 
                                              id={`src-${source}`} 
                                              checked={activeSources.includes(source)}
                                              onCheckedChange={() => toggleSource(source)}
                                          />
                                          <Label htmlFor={`src-${source}`} className="text-[10px] uppercase font-semibold cursor-pointer">{source}</Label>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      </div>
                  </PopoverContent>
              </Popover>
          </div>
        </div>

        <TabsContent value="requests" className="mt-0">
           <RequestsTabs serviceRequests={filteredRequests} workOrders={allWorkOrders} />
        </TabsContent>

        <TabsContent value="dispatch" className="mt-0">
           <DispatchTabs
              workOrders={filteredOrders.filter(wo => !wo.assignedTechnicianId)}
              allJobPool={allWorkOrders}
              technicians={technicians}
              onWorkOrdersChange={async (updated) => {
                // Find and process assignments
                const newlyAssigned = updated.filter(u => u.status === 'assigned' && u.assignedTechnicianId && !allAssignments.some(a => a.workOrderId === u.id));
                
                for (const wo of newlyAssigned) {
                    const asmtId = await makeAssignmentId();
                    const asmtRef = doc(db, 'assignments', asmtId);
                    const woRef = doc(db, 'workOrders', wo.id);
                    
                    const asmtData = sanitize({
                        ...wo,
                        id: asmtId,
                        workOrderId: wo.id,
                        techId: wo.assignedTechnicianId,
                        assignedAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    });
                    
                    await setDoc(asmtRef, asmtData);
                    await deleteDoc(woRef);
                    
                    await NotificationService.notify(
                        wo.assignedTechnicianId!,
                        "Priority Mission Dispatched",
                        `New mission [${wo.id.toUpperCase()}] assigned. Confirm schedule via terminal.`,
                        { id: asmtId, type: 'assignment' }
                    );
                }

                // Surgically update unassigned changes to minimize network overhead
                const unassignedChanges = updated.filter(u => {
                    if (u.status !== 'unassigned') return false;
                    const current = allWorkOrders.find(wo => wo.id === u.id);
                    // Compare serialized objects to detect actual property mutations (e.g. routeId transition)
                    return !current || JSON.stringify(sanitize(current)) !== JSON.stringify(sanitize(u));
                });

                for (const wo of unassignedChanges) {
                    const docRef = doc(db, 'workOrders', wo.id);
                    await updateDoc(docRef, sanitize(wo)).catch(e => console.error("WO Update Error:", e));
                }
              }}
              routes={routes}
              onRoutesChange={async (updated) => {
                // Optimistic update: show immediately without waiting for Firestore round-trip
                const prev = routes;
                setRoutes(updated);

                const prevById = new Map(prev.map(r => [r.id, r]));
                const nextIds = new Set(updated.map(r => r.id));

                // Remove only the routes that were actually dissolved
                for (const r of prev) {
                  if (nextIds.has(r.id)) continue;
                  try {
                    await deleteDoc(doc(db, 'routes', r.id));
                  } catch (e: any) {
                    console.error("Route delete error", e);
                    toast({ variant: "destructive", title: "Route Sync Error", description: `Failed to remove "${r.name || 'route'}": ${e?.message || 'check your connection.'}` });
                  }
                }

                // Upsert only the routes that actually changed — re-writing every
                // route on each edit turns one bad/legacy doc into a total failure.
                for (const r of updated) {
                  const before = prevById.get(r.id);
                  if (before && JSON.stringify(sanitize(before)) === JSON.stringify(sanitize(r))) continue;
                  // Never persist an empty name or drift updatedAt out of sync
                  const payload = sanitize({
                    ...r,
                    name: (r.name || '').trim() || 'Untitled Route',
                    workOrderIds: r.workOrderIds || [],
                    updatedAt: new Date().toISOString(),
                  });
                  try {
                    await setDoc(doc(db, 'routes', r.id), payload, { merge: true });
                  } catch (e: any) {
                    console.error("Route save error", e);
                    toast({ variant: "destructive", title: "Route Not Saved", description: `"${payload.name}" could not be saved: ${e?.message || 'unknown error'}` });
                  }
                }
              }}
           />
        </TabsContent>

        <TabsContent value="assignments" className="mt-0">
            <Tabs defaultValue="active">
                <div className="flex items-center justify-between gap-4 mb-4 bg-bg-secondary/50 p-3 rounded-lg border border-border-sub">
                    <TabsList className="tabs !mb-0 !p-0 !bg-bg-tertiary">
                        <TabsTrigger value="active" className="tab flex items-center gap-2">
                            <Wrench size={12} /> Active Assignments
                        </TabsTrigger>
                        <TabsTrigger value="history" className="tab flex items-center gap-2">
                            <HistoryIcon size={12} /> Assignment History
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="active" className="m-0 text-left">
                   <WorkOrdersClient 
                      workOrders={filteredAssignments.filter(wo => wo.status !== 'completed')} 
                      allWorkOrders={allAssignments} 
                      technicians={technicians} 
                      onWorkOrdersChange={(updated) => {
                        updated.forEach(wo => {
                          const docRef = doc(db, 'assignments', wo.id);
                          updateDoc(docRef, sanitize(wo)).catch(e => console.error("Update error", e));
                        });
                      }}
                      routes={routes}
                      mode="assigned"
                   />
                </TabsContent>

                <TabsContent value="history" className="m-0 text-left">
                   <WorkOrdersClient 
                      workOrders={filteredAssignments.filter(wo => wo.status === 'completed')} 
                      allWorkOrders={allAssignments} 
                      technicians={technicians} 
                      onWorkOrdersChange={(updated) => {
                        updated.forEach(wo => {
                          const docRef = doc(db, 'assignments', wo.id);
                          updateDoc(docRef, sanitize(wo)).catch(e => console.error("Update error", e));
                        });
                      }}
                      routes={routes}
                      mode="assigned"
                   />
                </TabsContent>
            </Tabs>
        </TabsContent>
      </Tabs>

      <NewAssignmentDialog isOpen={isNewDispatchOpen} setIsOpen={setIsNewDispatchOpen} onSave={handleAddNewOrder} />
      <ImportJobsDialog isOpen={isImportDialogOpen} setIsOpen={setIsImportDialogOpen} onImport={handleImportOrders} existingOrders={allWorkOrders} existingRefs={existingImportRefs} currentUserName={technicians.find(t => t.id === (typeof window !== 'undefined' ? sessionStorage.getItem('currentUserId') : null))?.name || 'Admin'} />
      <NewRequestDialog isOpen={isNewRequestOpen} setIsOpen={setIsNewRequestOpen} onSave={handleAddNewRequest} />
    </div>
  );

  function togglePriority(priority: string) {
    setActivePriorities(prev => prev.includes(priority) ? prev.filter(p => p !== priority) : [...prev, priority]);
  }
  function toggleType(type: string) {
    setActiveTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  }
  function toggleSource(source: string) {
    setActiveSources(prev => prev.includes(source) ? prev.filter(s => s !== source) : [...prev, source]);
  }
}
