
'use client';

import { useState, useMemo } from 'react';
import { workOrders as initialWorkOrders, technicians, serviceRequests as initialServiceRequests } from "@/lib/data";
import { DispatchTabs } from "./components/dispatch-tabs";
import { RequestsTabs } from "../requests/components/requests-tabs";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal, Plus, Search, Import as ImportIcon, Wrench, ClipboardList, Layers } from "lucide-react";
import { NewAssignmentDialog } from "./components/new-assignment-dialog";
import { ImportJobsDialog } from "./components/import-jobs-dialog";
import { NewRequestDialog } from "../requests/components/new-request-dialog";
import type { WorkOrder, Route, ServiceRequest } from "@/lib/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';

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

  const { toast } = useToast();

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
        description: `Request ${request.id.toUpperCase()} has been added to the mission funnel.`,
    });
  };

  // Filtered Data
  const filteredOrders = useMemo(() => 
    allWorkOrders.filter(order => 
      order.id.toLowerCase().includes(dispatchSearchQuery.toLowerCase()) ||
      order.description.toLowerCase().includes(dispatchSearchQuery.toLowerCase()) ||
      order.clientName.toLowerCase().includes(dispatchSearchQuery.toLowerCase())
    )
  , [allWorkOrders, dispatchSearchQuery]);

  const filteredRequests = useMemo(() => 
    allRequests.filter(req => 
      req.id.toLowerCase().includes(requestSearchQuery.toLowerCase()) ||
      req.clientName.toLowerCase().includes(requestSearchQuery.toLowerCase()) ||
      req.description.toLowerCase().includes(requestSearchQuery.toLowerCase())
    )
  , [allRequests, requestSearchQuery]);

  return (
    <div className="space-y-6">
        <header className="page-header">
            <div>
              <p className="page-eyebrow flex items-center gap-2">
                <Wrench size={12} />
                Operations Control Center
              </p>
              <h1 className="page-title">Dispatch & Intake</h1>
              <p className="page-subtitle">Unified terminal for stakeholder requests and logistical mission routing.</p>
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
              <TabsTrigger value="dispatch" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white flex items-center gap-2">
                <Layers size={14} />
                DISPATCH HUB
              </TabsTrigger>
              <TabsTrigger value="requests" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white flex items-center gap-2">
                <ClipboardList size={14} />
                SERVICE REQUESTS
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
              <Button variant="outline" size="default" className="h-10">
                <SlidersHorizontal size={14} className="mr-2"/> Filters
              </Button>
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
