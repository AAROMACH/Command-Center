
"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WorkOrdersClient } from "./work-orders-client";
import { RoutesView } from "./routes-view";
import type { WorkOrder, Technician, Route } from "@/lib/types";
import { useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';

type DispatchTabsProps = {
  workOrders: WorkOrder[];
  technicians: Technician[];
  onWorkOrdersChange: (orders: WorkOrder[]) => void;
  routes: Route[];
  onRoutesChange: (routes: Route[]) => void;
};

export function DispatchTabs({ 
  workOrders, 
  technicians, 
  onWorkOrdersChange, 
  routes, 
  onRoutesChange 
}: DispatchTabsProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('subtab') || 'unassigned');
  
  useEffect(() => {
    const subtab = searchParams.get('subtab');
    if (subtab && (subtab === 'unassigned' || subtab === 'routes')) {
      setActiveTab(subtab);
    }
  }, [searchParams]);

  const unassignedWorkOrders = workOrders.filter(wo => wo.status === 'unassigned' || !wo.assignedTechnicianId);
  
  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="tabs">
        <TabsTrigger value="unassigned" className="tab data-[state=active]:bg-brand-red data-[state=active]:text-white">
          Unassigned <span className="tab-count">({unassignedWorkOrders.length})</span>
        </TabsTrigger>
        <TabsTrigger value="routes" className="tab data-[state=active]:bg-brand-red data-[state=active]:text-white">
          Groups <span className="tab-count">({routes.length})</span>
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="unassigned" className="mt-0">
          <WorkOrdersClient
              workOrders={unassignedWorkOrders}
              allWorkOrders={workOrders}
              technicians={technicians}
              onWorkOrdersChange={onWorkOrdersChange}
              routes={routes}
              mode="unassigned"
          />
      </TabsContent>

      <TabsContent value="routes" className="mt-0">
          <RoutesView 
            routes={routes}
            onRoutesChange={onRoutesChange}
            allWorkOrders={workOrders}
            onWorkOrdersChange={onWorkOrdersChange}
            technicians={technicians}
          />
      </TabsContent>
    </Tabs>
  );
}
