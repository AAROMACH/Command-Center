'use client';

import { useState } from 'react';
import { workOrders as initialWorkOrders, technicians } from "@/lib/data";
import { AssignmentsTabs } from "./components/assignments-tabs";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal, Plus, Search, Briefcase, Import as ImportIcon } from "lucide-react";
import { NewAssignmentDialog } from "./components/new-assignment-dialog";
import { ImportJobsDialog } from "./components/import-jobs-dialog";
import type { WorkOrder, Route } from "@/lib/types";

export default function AssignmentsPage() {
  const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>(initialWorkOrders);
  const [routes, setRoutes] = useState<Route[]>([
    { id: 'route-1', name: 'Detroit North AM', workOrderIds: ['wo-101'], technicianName: 'Alex Johnson' }
  ]);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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

  const filteredOrders = allWorkOrders.filter(order => 
    order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.clientName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
        <header className="page-header">
            <div>
              <p className="page-eyebrow flex items-center gap-2">
                <Briefcase size={12} />
                Field Service Logistics
              </p>
              <h1 className="page-title">Dispatch Command</h1>
              <p className="page-subtitle">Strategic job pooling, route formation, and field deployment terminal.</p>
            </div>
            <div className="page-header-right">
                <Button variant="outline" size="default" onClick={() => setIsImportDialogOpen(true)}>
                  <ImportIcon size={14} className="mr-2"/>
                  Import Jobs
                </Button>
                <Button variant="default" size="default" onClick={() => setIsNewDialogOpen(true)}>
                  + New Assignment
                </Button>
            </div>
      </header>

      <div className="mb-4 flex items-center justify-between">
        <div className="search-wrap">
          <Search />
          <input 
            className="search-input" 
            placeholder="Search Job Pool..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" size="default"><SlidersHorizontal size={14} className="mr-2"/> Filters</Button>
      </div>

       <AssignmentsTabs 
          workOrders={filteredOrders} 
          technicians={technicians} 
          onWorkOrdersChange={handleWorkOrdersChange}
          routes={routes}
          onRoutesChange={handleRoutesChange}
       />

       <NewAssignmentDialog 
          isOpen={isNewDialogOpen} 
          setIsOpen={setIsNewDialogOpen} 
          onSave={handleAddNewOrder} 
       />

       <ImportJobsDialog 
          isOpen={isImportDialogOpen} 
          setIsOpen={setIsImportDialogOpen} 
          onImport={handleImportOrders} 
          existingOrders={allWorkOrders}
       />
    </div>
  );
}
