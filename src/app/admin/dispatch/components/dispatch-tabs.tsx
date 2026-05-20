
"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WorkOrdersClient } from "./work-orders-client";
import { RoutesView } from "./routes-view";
import type { WorkOrder, Technician, Route } from "@/lib/types";

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
  const unassignedWorkOrders = workOrders.filter(wo => wo.status === 'unassigned' || !wo.assignedTechnicianId);
  const assignedWorkOrders = workOrders.filter(wo => wo.status !== 'unassigned' && !!wo.assignedTechnicianId);
  
  return (
    <Tabs defaultValue="unassigned">
      <TabsList className="tabs">
        <TabsTrigger value="unassigned" className="tab data-[state=active]:bg-brand-red data-[state=active]:text-white">
          Unassigned <span className="tab-count">({unassignedWorkOrders.length})</span>
        </TabsTrigger>
        <TabsTrigger value="routes" className="tab data-[state=active]:bg-brand-red data-[state=active]:text-white">
          Routes <span className="tab-count">({routes.length})</span>
        </TabsTrigger>
        <TabsTrigger value="assigned" className="tab data-[state=active]:bg-brand-red data-[state=active]:text-white">
          Assigned <span className="tab-count">({assignedWorkOrders.length})</span>
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
      
      <TabsContent value="assigned" className="mt-0">
          <WorkOrdersClient
              workOrders={assignedWorkOrders}
              allWorkOrders={workOrders}
              technicians={technicians}
              onWorkOrdersChange={onWorkOrdersChange}
              routes={routes}
              mode="assigned"
          />
      </TabsContent>
    </Tabs>
  );
}
