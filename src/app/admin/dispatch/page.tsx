
'use client';

import { useState, useMemo, useEffect } from 'react';
import { db } from "@/lib/firebase";
import { collection, doc, setDoc, addDoc, onSnapshot, query, where } from 'firebase/firestore';
import { DispatchTabs } from "./components/dispatch-tabs";
import { RequestsTabs } from "../requests/components/requests-tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SlidersHorizontal, Plus, Search, Import as ImportIcon, Layers, ClipboardList, X, ArrowUpDown } from "lucide-react";
import { NewAssignmentDialog } from "./components/new-assignment-dialog";
import { ImportJobsDialog } from "./components/import-jobs-dialog";
import { NewRequestDialog } from "../requests/components/new-request-dialog";
import type { WorkOrder, Route, ServiceRequest, Technician } from "@/lib/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type SortOption = 'date' | 'client' | 'priority' | 'type';

export default function DispatchPage() {
  const searchParams = useSearchParams();
  const [activeMasterTab, setActiveMasterTab] = useState(searchParams.get('tab') === 'dispatch' ? 'dispatch' : 'requests');
  
  const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [allRequests, setAllRequests] = useState<ServiceRequest[]>([]);
  
  const [isNewDispatchOpen, setIsNewDispatchOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>('priority');

  const [activePriorities, setActivePriorities] = useState<string[]>([]);
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [activeSources, setActiveSources] = useState<string[]>([]);

  const { toast } = useToast();

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

  const togglePriority = (priority: string) => {
    setActivePriorities(prev => prev.includes(priority) ? prev.filter(p => p !== priority) : [...prev, priority]);
  };

  const toggleType = (type: string) => {
    setActiveTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const toggleSource = (source: string) => {
    setActiveSources(prev => prev.includes(source) ? prev.filter(s => s !== source) : [...prev, source]);
  };

  const filteredOrders = useMemo(() => {
    let results = allWorkOrders.filter(order => {
      const matchesSearch = (order.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (order.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (order.clientName || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPriority = activePriorities.length === 0 || activePriorities.includes(order.priority);
      const matchesType = activeTypes.length === 0 || activeTypes.includes(order.projectType);
      const matchesSource = activeSources.length === 0 || (order.source && activeSources.includes(order.source));
      return matchesSearch && matchesPriority && matchesType && matchesSource;
    });
    return results.sort((a, b) => {
        if (sortBy === 'priority') {
            const prio = { critical: 0, high: 1, medium: 2, low: 3 };
            return prio[a.priority as keyof typeof prio] - prio[b.priority as keyof typeof prio];
        }
        if (sortBy === 'client') return (a.clientName || '').localeCompare(b.clientName || '');
        return (a.scheduleDate || '').localeCompare(b.scheduleDate || '');
    });
  }, [allWorkOrders, searchQuery, activePriorities, activeTypes, activeSources, sortBy]);

  const filteredRequests = useMemo(() => {
    let results = allRequests.filter(req => {
      const matchesSearch = (req.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (req.clientName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (req.description || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPriority = activePriorities.length === 0 || activePriorities.includes(req.priority);
      const matchesType = activeTypes.length === 0 || activeTypes.includes(req.requestType);
      return matchesSearch && matchesPriority && matchesType;
    });
    return results.sort((a, b) => {
        if (sortBy === 'priority') {
            const prio = { critical: 0, high: 1, medium: 2, low: 3 };
            return prio[a.priority as keyof typeof prio] - prio[b.priority as keyof typeof prio];
        }
        return (a.submittedDate || '').localeCompare(a.submittedDate || '');
    });
  }, [allRequests, searchQuery, activePriorities, activeTypes, sortBy]);

  const resetFilters = () => {
    setSearchQuery("");
    setActivePriorities([]);
    setActiveTypes([]);
    setActiveSources([]);
    setSortBy('priority');
  };

  const hasActiveFilters = searchQuery !== "" || activePriorities.length > 0 || activeTypes.length > 0 || activeSources.length > 0 || sortBy !== 'priority';

  return (
    <div className="space-y-6">
        <header className="page-header">
            <div className="text-left">
              <p className="page-eyebrow flex items-center gap-2"><Layers size={12} />Operations Control Center</p>
              <h1 className="page-title">Dispatch & Intake</h1>
              <p className="page-subtitle text-left">Unified terminal for client requests and logistical job routing.</p>
            </div>
            <div className="page-header-right">
                {activeMasterTab === 'dispatch' ? (
                  <>
                    <Button variant="outline" onClick={() => setIsImportDialogOpen(true)} className="h-10 px-4 text-[10px]"><ImportIcon size={14} className="mr-2"/>Import Jobs</Button>
                    <Button variant="default" onClick={() => setIsNewDispatchOpen(true)} className="h-10 px-4 text-[10px]">+ New Dispatch Entry</Button>
                  </>
                ) : (
                  <Button variant="default" onClick={() => setIsNewRequestOpen(true)} className="h-10 px-4 text-[10px]"><Plus size={14} className="mr-2"/>New Service Request</Button>
                )}
            </div>
      </header>

      <Tabs value={activeMasterTab} onValueChange={setActiveMasterTab} className="w-full">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
            <TabsList className="tabs !p-0 !bg-bg-tertiary">
              <TabsTrigger value="requests" className="tab !px-8 !py-4 data-[state=active]:bg-bg-secondary data-[state=active]:border-2 data-[state=active]:border-brand-red data-[state=active]:text-brand-red">SERVICE REQUESTS</TabsTrigger>
              <TabsTrigger value="dispatch" className="tab !px-8 !py-4 data-[state=active]:bg-bg-secondary data-[state=active]:border-2 data-[state=active]:border-brand-red data-[state=active]:text-brand-red">DISPATCH HUB</TabsTrigger>
            </TabsList>
        </div>

        <div className="mb-6 flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-bg-secondary rounded-xl border border-border-sub shadow-sm">
          <div className="search-wrap flex-1 !mb-0 w-full md:w-auto">
            <Search className="h-4 w-4 text-text-muted" />
            <input 
              className="search-input !h-10 !text-xs font-bold uppercase !w-full bg-bg-primary" 
              placeholder={`Search ${activeMasterTab === 'dispatch' ? 'assignments' : 'intake'}...`} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
              <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                  <SelectTrigger className="w-[140px] h-10 bg-bg-primary text-[10px] uppercase font-bold tracking-widest border-border-main">
                      <div className="flex items-center gap-2">
                          <ArrowUpDown size={14} className="text-text-muted" />
                          <SelectValue placeholder="Sort" />
                      </div>
                  </SelectTrigger>
                  <SelectContent>
                      <SelectItem value="priority" className="text-[10px] uppercase font-bold">Priority</SelectItem>
                      <SelectItem value="date" className="text-[10px] uppercase font-bold">Date</SelectItem>
                      <SelectItem value="client" className="text-[10px] uppercase font-bold">Client</SelectItem>
                      {activeMasterTab === 'dispatch' && <SelectItem value="type" className="text-[10px] uppercase font-bold">Type</SelectItem>}
                  </SelectContent>
              </Select>

              <Popover>
                  <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("h-10 text-[10px]", hasActiveFilters && "border-brand-red text-brand-red")}>
                          <SlidersHorizontal size={14} className="mr-2"/>
                          Filters
                          {hasActiveFilters && (
                            <Badge variant="destructive" className="ml-2 h-4 w-4 p-0 flex items-center justify-center text-[8px]">
                              {(searchQuery !== "" ? 1 : 0) + activePriorities.length + activeTypes.length + activeSources.length}
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
                                              onCheckedChange={() => togglePriority(priority)}
                                          />
                                          <Label htmlFor={`prio-${priority}`} className="text-[10px] uppercase font-semibold cursor-pointer">{priority}</Label>
                                      </div>
                                  ))}
                              </div>
                          </div>

                          <div className="space-y-3">
                              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Technical Category</p>
                              <div className="space-y-2">
                                  {SERVICE_CATEGORIES.map(type => (
                                      <div key={type} className="flex items-center space-x-2">
                                          <Checkbox 
                                              id={`type-${type}`} 
                                              checked={activeTypes.includes(type)}
                                              onCheckedChange={() => toggleType(type)}
                                          />
                                          <Label htmlFor={`type-${type}`} className="text-[10px] uppercase font-semibold cursor-pointer">{type}</Label>
                                      </div>
                                  ))}
                              </div>
                          </div>

                          {activeMasterTab === 'dispatch' && (
                            <div className="space-y-3">
                                <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Source Registry</p>
                                <div className="space-y-2">
                                    {['Imported', 'Manual', 'Client'].map(source => (
                                        <div key={source} className="flex items-center space-x-2">
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
                          )}
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
              workOrders={filteredOrders} 
              technicians={technicians} 
              onWorkOrdersChange={(updated) => updated.forEach(wo => setDoc(doc(db, 'workOrders', wo.id), wo, { merge: true }))}
              routes={routes}
              onRoutesChange={(updated) => updated.forEach(r => setDoc(doc(db, 'routes', r.id), r, { merge: true }))}
           />
        </TabsContent>
      </Tabs>

      <NewAssignmentDialog isOpen={isNewDispatchOpen} setIsOpen={setIsNewDispatchOpen} onSave={handleAddNewOrder} />
      <ImportJobsDialog isOpen={isImportDialogOpen} setIsOpen={setIsImportDialogOpen} onImport={handleImportOrders} existingOrders={allWorkOrders} />
      <NewRequestDialog isOpen={isNewRequestOpen} setIsOpen={setIsNewRequestOpen} onSave={handleAddNewRequest} />
    </div>
  );
}
