'use client';

import { useState, useMemo } from 'react';
import { workOrders as initialWorkOrders, technicians, serviceRequests as initialServiceRequests } from "@/lib/data";
import { DispatchTabs } from "./components/dispatch-tabs";
import { RequestsTabs } from "../requests/components/requests-tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SlidersHorizontal, Plus, Search, Import as ImportIcon, Wrench, ClipboardList, Layers, X } from "lucide-react";
import { NewAssignmentDialog } from "./components/new-assignment-dialog";
import { ImportJobsDialog } from "./components/import-jobs-dialog";
import { NewRequestDialog } from "../requests/components/new-request-dialog";
import type { WorkOrder, Route, ServiceRequest } from "@/lib/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const SERVICE_CATEGORIES = [
    'Installation',
    'Troubleshooting',
    'Maintenance',
    'Survey',
    'Upgrade',
    'Repair',
    'Decommission'
];

export default function DispatchPage() {
  // Master Tab State
  const [activeMasterTab, setActiveMasterTab] = useState('dispatch');
  
  // Work Order / Dispatch State
  const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>(initialWorkOrders);
  const [routes, setRoutes] = useState<Route[]>([
    { id: 'route-1', name: 'Detroit North AM', workOrderIds: ['wo-101'], technicianName: 'Alex Johnson' }
  ]);
  const [isNewDispatchOpen, setIsNewDispatchOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [dispatchSearchQuery, setDispatchSearchQuery] = useState("");

  // Service Request State
  const [allRequests, setAllRequests] = useState<ServiceRequest[]>(initialServiceRequests);
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);
  const [requestSearchQuery, setRequestSearchQuery] = useState("");

  // Filter State
  const [activePriorities, setActivePriorities] = useState<string[]>([]);
  const [activeTypes, setActiveTypes] = useState<string[]>([]);

  const { toast } = useToast();

  // Notification Counts
  const unassignedCount = useMemo(() => allWorkOrders.filter(wo => wo.status === 'unassigned').length, [allWorkOrders]);
  const newRequestsCount = useMemo(() => allRequests.filter(req => req.status === 'new').length, [allRequests]);

  // Handlers - Dispatch
  const handleAddNewOrder = (order: WorkOrder) => {
    setAllWorkOrders(prev => [order, ...prev]);
  };

  const handleImportOrders = (newOrders: WorkOrder[]) => {
    setAllWorkOrders(prev => [...newOrders, ...prev]);
  };

  const handleWorkOrdersChange = (updated: WorkOrder[]) => {
    setAllWorkOrders(updated);
  };

  const handleRoutesChange = (updated: Route[]) => {
    setRoutes(updated);
  };

  // Handlers - Requests
  const handleAddNewRequest = (request: ServiceRequest) => {
    setAllRequests(prev => [request, ...prev]);
    toast({
        title: "Intake Buffer Updated",
        description: `Request ${request.id.toUpperCase()} has been added to the job funnel.`,
    });
  };

  // Filter Logic
  const togglePriority = (priority: string) => {
    setActivePriorities(prev => 
      prev.includes(priority) ? prev.filter(p => p !== priority) : [...prev, priority]
    );
  };

  const toggleType = (type: string) => {
    setActiveTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const resetFilters = () => {
    setActivePriorities([]);
    setActiveTypes([]);
    toast({ title: "Filters Cleared", description: "All search constraints have been removed." });
  };

  // Filtered Data
  const filteredOrders = useMemo(() => 
    allWorkOrders.filter(order => {
      const matchesSearch = order.id.toLowerCase().includes(dispatchSearchQuery.toLowerCase()) ||
        order.description.toLowerCase().includes(dispatchSearchQuery.toLowerCase()) ||
        order.clientName.toLowerCase().includes(dispatchSearchQuery.toLowerCase());
      
      const matchesPriority = activePriorities.length === 0 || activePriorities.includes(order.priority);
      const matchesType = activeTypes.length === 0 || activeTypes.includes(order.projectType);
      
      return matchesSearch && matchesPriority && matchesType;
    })
  , [allWorkOrders, dispatchSearchQuery, activePriorities, activeTypes]);

  const filteredRequests = useMemo(() => 
    allRequests.filter(req => {
      const matchesSearch = req.id.toLowerCase().includes(requestSearchQuery.toLowerCase()) ||
        req.clientName.toLowerCase().includes(requestSearchQuery.toLowerCase()) ||
        req.description.toLowerCase().includes(requestSearchQuery.toLowerCase());
      
      const matchesPriority = activePriorities.length === 0 || activePriorities.includes(req.priority);
      const matchesType = activeTypes.length === 0 || activeTypes.includes(req.requestType);
      
      return matchesSearch && matchesPriority && matchesType;
    })
  , [allRequests, requestSearchQuery, activePriorities, activeTypes]);

  const hasActiveFilters = activePriorities.length > 0 || activeTypes.length > 0;

  return (
    <div className="space-y-6">
        <header className="page-header">
            <div>
              <p className="page-eyebrow flex items-center gap-2">
                <Wrench size={12} />
                Operations Control Center
              </p>
              <h1 className="page-title">Dispatch & Intake</h1>
              <p className="page-subtitle">Unified terminal for stakeholder requests and logistical job routing.</p>
            </div>
            <div className="page-header-right">
                {activeMasterTab === 'dispatch' ? (
                  <>
                    <Button variant="outline" size="default" onClick={() => setIsImportDialogOpen(true)}>
                      <ImportIcon size={14} className="mr-2"/>
                      Import Jobs
                    </Button>
                    <Button variant="default" size="default" onClick={() => setIsNewDispatchOpen(true)}>
                      + New Dispatch Entry
                    </Button>
                  </>
                ) : (
                  <Button variant="default" size="default" onClick={() => setIsNewRequestOpen(true)}>
                      <Plus size={14} className="mr-2"/>
                      New Service Request
                  </Button>
                )}
            </div>
      </header>

      <Tabs value={activeMasterTab} onValueChange={setActiveMasterTab} className="w-full">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
            <TabsList className="tabs !p-0 !bg-bg-tertiary">
              <TabsTrigger 
                value="dispatch" 
                className="tab !px-8 !py-4 data-[state=active]:bg-bg-secondary data-[state=active]:border-2 data-[state=active]:border-brand-red data-[state=active]:text-brand-red flex items-center gap-2 transition-all"
              >
                <Layers size={14} />
                DISPATCH HUB
                {unassignedCount > 0 && (
                  <Badge className="ml-1 h-5 min-w-[20px] px-1 text-[10px] font-bold bg-brand-red text-white border-none shadow-[0_0_8px_rgba(204,34,0,0.4)]">
                    {unassignedCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="requests" 
                className="tab !px-8 !py-4 data-[state=active]:bg-bg-secondary data-[state=active]:border-2 data-[state=active]:border-brand-red data-[state=active]:text-brand-red flex items-center gap-2 transition-all"
              >
                <ClipboardList size={14} />
                SERVICE REQUESTS
                {newRequestsCount > 0 && (
                  <Badge className="ml-1 h-5 min-w-[20px] px-1 text-[10px] font-bold bg-brand-red text-white border-none shadow-[0_0_8px_rgba(204,34,0,0.4)]">
                    {newRequestsCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="search-wrap flex-1 md:w-[350px]">
                <Search />
                <input 
                  className="search-input !w-full" 
                  placeholder={activeMasterTab === 'dispatch' ? "Search Job Pool..." : "Search Request Funnel..."}
                  value={activeMasterTab === 'dispatch' ? dispatchSearchQuery : requestSearchQuery}
                  onChange={(e) => activeMasterTab === 'dispatch' ? setDispatchSearchQuery(e.target.value) : setRequestSearchQuery(e.target.value)}
                />
              </div>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="default" className={cn("h-10", hasActiveFilters && "border-brand-red text-brand-red")}>
                    <SlidersHorizontal size={14} className="mr-2"/>
                    Filters
                    {hasActiveFilters && <Badge variant="destructive" className="ml-2 h-4 w-4 p-0 flex items-center justify-center text-[8px]">{activePriorities.length + activeTypes.length}</Badge>}
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
                    {/* Priority Filter */}
                    <div className="space-y-3">
                      <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Priority Level</p>
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

                    {/* Category Filter */}
                    <div className="space-y-3">
                      <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Service Category</p>
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
                  </div>
                  <div className="p-4 bg-bg-tertiary/50 border-t border-border-sub">
                    <p className="text-[8px] text-text-muted uppercase font-medium leading-tight">
                      Constraints are applied globally to the {activeMasterTab === 'dispatch' ? 'Job Pool' : 'Mission Funnel'}.
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
        </div>

        <TabsContent value="dispatch" className="mt-0">
           <DispatchTabs 
              workOrders={filteredOrders} 
              technicians={technicians} 
              onWorkOrdersChange={handleWorkOrdersChange}
              routes={routes}
              onRoutesChange={handleRoutesChange}
           />
        </TabsContent>

        <TabsContent value="requests" className="mt-0">
           <RequestsTabs serviceRequests={filteredRequests} />
        </TabsContent>
      </Tabs>

      {/* DIALOGS */}
      <NewAssignmentDialog 
          isOpen={isNewDispatchOpen} 
          setIsOpen={setIsNewDispatchOpen} 
          onSave={handleAddNewOrder} 
      />

      <ImportJobsDialog 
          isOpen={isImportDialogOpen} 
          setIsOpen={setIsImportDialogOpen} 
          onImport={handleImportOrders} 
          existingOrders={allWorkOrders}
      />

      <NewRequestDialog 
        isOpen={isNewRequestOpen}
        setIsOpen={setIsNewRequestOpen}
        onSave={handleAddNewRequest}
      />
    </div>
  );
}
