'use client';

import { useState, useMemo, useEffect } from 'react';
import { db } from "@/lib/firebase";
import { collection, doc, setDoc, addDoc, onSnapshot, query, where, updateDoc } from 'firebase/firestore';
import { DispatchTabs } from "./components/dispatch-tabs";
import { RequestsTabs } from "../requests/components/requests-tabs";
import { WorkOrdersClient } from "./components/work-orders-client";
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
import { NewAssignmentDialog } from "./components/new-assignment-dialog";
import { ImportJobsDialog } from "./components/import-jobs-dialog";
import { NewRequestDialog } from "../requests/components/new-request-dialog";
import type { WorkOrder, Route, ServiceRequest, Technician } from "@/lib/types";
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

export default function DispatchPage() {
  const searchParams = useSearchParams();
  const [activeMasterTab, setActiveMasterTab] = useState(
    searchParams.get('tab') === 'dispatch' ? 'dispatch' : 
    searchParams.get('tab') === 'assignments' ? 'assignments' : 
    'requests'
  );
  
  const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [allRequests, setAllRequests] = useState<ServiceRequest[]>([]);
  
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

  // 1. Initialize Registry Listeners
  useEffect(() => {
    const unsubWO = onSnapshot(collection(db, 'workOrders'), (snap) => {
      setAllWorkOrders(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as WorkOrder)));
    });
    const unsubTech = onSnapshot(collection(db, 'users'), (snap) => {
      setTechnicians(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Technician)));
    });
    const unsubReq = onSnapshot(collection(db, 'clientRequests'), (snap) => {
      setAllRequests(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as ServiceRequest)));
    });
    const unsubRoutes = onSnapshot(collection(db, 'routes'), (snap) => {
      setRoutes(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Route)));
    });

    return () => {
      unsubWO();
      unsubTech();
      unsubReq();
      unsubRoutes();
    };
  }, []);

  const handleAddNewOrder = (order: WorkOrder) => {
    addDoc(collection(db, 'workOrders'), { ...order, source: 'Manual' })
      .then(() => toast({ title: "Assignment Staged", description: "Job entry committed to Firestore." }))
      .catch((e) => toast({ variant: "destructive", title: "Write Failed", description: e.message }));
  };

  const handleImportOrders = (newOrders: WorkOrder[]) => {
    newOrders.forEach(order => {
        setDoc(doc(db, 'workOrders', order.id), { ...order, source: 'Imported' })
            .catch(e => console.error("Import error", e));
    });
    toast({ title: "Import Processed", description: `${newOrders.length} records transmitted to registry.` });
  };

  const handleAddNewRequest = (request: ServiceRequest) => {
    addDoc(collection(db, 'clientRequests'), request)
      .then(() => toast({ title: "Request Logged", description: "Service ticket added to intake funnel." }))
      .catch((e) => toast({ variant: "destructive", title: "Write Failed", description: e.message }));
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

  const filteredOrders = useMemo(() => {
    let results = allWorkOrders.filter(order => {
      const q = searchQuery.toLowerCase();
      const techId = order.assignedTechnicianId || order.assignedTechIds?.[0];
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
              if (parts[0].length === 4) { woDate = startOfDay(new Date(order.scheduleDate)); } 
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
                const idA = a.assignedTechnicianId || a.assignedTechIds?.[0];
                const idB = b.assignedTechnicianId || b.assignedTechIds?.[0];
                const techA = technicians.find(t => t.id === idA)?.name || 'Unassigned';
                const techB = technicians.find(t => t.id === idB)?.name || 'Unassigned';
                return techA.localeCompare(techB);
            default:
                return (a.scheduleDate || '').localeCompare(b.scheduleDate || '');
        }
    });
  }, [allWorkOrders, searchQuery, dateRange, activePriorities, activeTypes, activeSources, sortBy, technicians]);

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
              <h1 className="page-title">Dispatch & Intake</h1>
              <p className="page-subtitle text-left">Unified terminal for client requests and logistical job routing.</p>
            </div>
            <div className="flex items-center gap-3">
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
              <TabsTrigger value="requests" className="tab">SERVICE REQUESTS</TabsTrigger>
              <TabsTrigger value="dispatch" className="tab">DISPATCH HUB</TabsTrigger>
              <TabsTrigger value="assignments" className="tab">ASSIGNMENTS</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="search-wrap flex-1 !mb-0">
                <Search className="h-4 w-4 text-text-muted" />
                <input 
                  className="search-input !h-9 !text-xs font-bold uppercase !w-full md:!w-[240px] bg-bg-primary" 
                  placeholder={`Search registry...`} 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                  <SelectTrigger className="w-[140px] h-9 bg-bg-primary text-[10px] uppercase font-bold tracking-widest border-border-main">
                      <div className="flex items-center gap-2">
                          <ArrowUpDown size={14} className="text-text-muted" />
                          <SelectValue placeholder="Sort" />
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
                        "flex items-center h-9 rounded-md border border-border-main bg-bg-primary px-3 cursor-pointer hover:bg-bg-tertiary transition-all group relative pr-8",
                        dateRange?.from && "border-brand-red ring-1 ring-brand-red"
                    )}>
                        <CalendarIcon size={12} className={cn("mr-2", dateRange?.from ? "text-brand-red" : "text-text-muted")} />
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
                      <div className="p-4 space-y-6 text-left">
                          <div className="space-y-3">
                              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Priority Audit</p>
                              <div className="grid grid-cols-2 gap-2">
                                  {['critical', 'high', 'medium', 'low'].map(priority => (
                                      <div key={priority} className="flex items-center space-x-2">
                                          <Checkbox 
                                              id={`prio-${priority}`} 
                                              checked={activePriorities.includes(priority)}
                                              onCheckedChange={(checked) => setActivePriorities(prev => checked ? [...prev, priority] : prev.filter(p => p !== priority))}
                                          />
                                          <Label htmlFor={`prio-${priority}`} className="text-[10px] uppercase font-semibold cursor-pointer">{priority}</Label>
                                      </div>
                                  ))}
                              </div>
                          </div>

                          <div className="space-y-3">
                              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Technical Category</p>
                              <ScrollArea className="h-[120px]">
                                <div className="space-y-2 pr-4">
                                    {SERVICE_CATEGORIES.map(type => (
                                        <div key={type} className="flex items-center space-x-2">
                                            <Checkbox 
                                                id={`type-${type}`} 
                                                checked={activeTypes.includes(type)}
                                                onCheckedChange={(checked) => setActiveTypes(prev => checked ? [...prev, type] : prev.filter(t => t !== type))}
                                            />
                                            <Label htmlFor={`type-${type}`} className="text-[10px] uppercase font-semibold cursor-pointer">{type}</Label>
                                        </div>
                                    ))}
                                </div>
                              </ScrollArea>
                          </div>

                          <div className="space-y-3">
                              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Source Registry</p>
                              <div className="space-y-2">
                                  {ASSIGNMENT_SOURCES.map(source => (
                                      <div key={source} className="flex items-center space-x-2">
                                          <Checkbox 
                                              id={`src-${source}`} 
                                              checked={activeSources.includes(source)}
                                              onCheckedChange={(checked) => setActiveSources(prev => checked ? [...prev, source] : prev.filter(s => s !== source))}
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
              workOrders={filteredOrders.filter(wo => {
                const techId = wo.assignedTechnicianId || wo.assignedTechIds?.[0];
                return wo.status === 'unassigned' || !techId;
              })} 
              technicians={technicians} 
              onWorkOrdersChange={(updated) => {
                // Bulk update support is limited in client-side Firestore without transactions, 
                // so we update individually for this prototype.
                updated.forEach(wo => {
                  const docRef = doc(db, 'workOrders', wo.id);
                  updateDoc(docRef, wo).catch(e => console.error("Update error", e));
                });
              }}
              routes={routes}
              onRoutesChange={(updated) => {
                updated.forEach(r => {
                  const docRef = doc(db, 'routes', r.id);
                  setDoc(docRef, r, { merge: true }).catch(e => console.error("Route update error", e));
                });
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

                <TabsContent value="active" className="m-0">
                   <WorkOrdersClient 
                      workOrders={filteredOrders.filter(wo => {
                        const techId = wo.assignedTechnicianId || wo.assignedTechIds?.[0];
                        return wo.status !== 'unassigned' && wo.status !== 'completed' && !!techId;
                      })} 
                      allWorkOrders={allWorkOrders} 
                      technicians={technicians} 
                      onWorkOrdersChange={(updated) => {
                        updated.forEach(wo => {
                          const docRef = doc(db, 'workOrders', wo.id);
                          updateDoc(docRef, wo).catch(e => console.error("Update error", e));
                        });
                      }}
                      routes={routes}
                      mode="assigned"
                   />
                </TabsContent>

                <TabsContent value="history" className="m-0">
                   <WorkOrdersClient 
                      workOrders={filteredOrders.filter(wo => wo.status === 'completed')} 
                      allWorkOrders={allWorkOrders} 
                      technicians={technicians} 
                      onWorkOrdersChange={(updated) => {
                        updated.forEach(wo => {
                          const docRef = doc(db, 'workOrders', wo.id);
                          updateDoc(docRef, wo).catch(e => console.error("Update error", e));
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
      <ImportJobsDialog isOpen={isImportDialogOpen} setIsOpen={setIsImportDialogOpen} onImport={handleImportOrders} existingOrders={allWorkOrders} />
      <NewRequestDialog isOpen={isNewRequestOpen} setIsOpen={setIsNewRequestOpen} onSave={handleAddNewRequest} />
    </div>
  );
}
