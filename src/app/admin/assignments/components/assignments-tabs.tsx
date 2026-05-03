"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WorkOrdersClient } from "./work-orders-client";
import { RoutesView } from "./routes-view";
import type { WorkOrder, Technician, Route } from "@/lib/types";

type AssignmentsTabsProps = {
  workOrders: WorkOrder[];
  technicians: Technician[];
  onWorkOrdersChange: (orders: WorkOrder[]) => void;
  routes: Route[];
  onRoutesChange: (routes: Route[]) => void;
};

export function AssignmentsTabs({ 
  workOrders, 
  technicians, 
  onWorkOrdersChange, 
  routes, 
  onRoutesChange 
}: AssignmentsTabsProps) {
  const unassignedWorkOrders = workOrders.filter(wo => wo.status === 'unassigned');
  const scheduledWorkOrders = workOrders.filter(wo => wo.status === 'assigned' || wo.status === 'completed');
  
  return (
    <Tabs defaultValue="unassigned">
      <TabsList className="tabs">
        <TabsTrigger value="unassigned" className="tab data-[state=active]:bg-brand-red data-[state=active]:text-white">
          Unassigned <span className="tab-count">({unassignedWorkOrders.length})</span>
        </TabsTrigger>
        <TabsTrigger value="routes" className="tab data-[state=active]:bg-brand-red data-[state=active]:text-white">
          Routes <span className="tab-count">({routes.length})</span>
        </TabsTrigger>
        <TabsTrigger value="scheduled" className="tab data-[state=active]:bg-brand-red data-[state=active]:text-white">
          Scheduled <span className="tab-count">({scheduledWorkOrders.length})</span>
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
          />
      </TabsContent>
      
      <TabsContent value="scheduled" className="mt-0">
           <WorkOrdersClient
              workOrders={scheduledWorkOrders}
              allWorkOrders={workOrders}
              technicians={technicians}
              onWorkOrdersChange={onWorkOrdersChange}
              routes={routes}
              mode="scheduled"
          />
      </TabsContent>
    </Tabs>
  );
}
