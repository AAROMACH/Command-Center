
"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WorkOrdersClient } from "./work-orders-client";
import type { WorkOrder, Technician } from "@/lib/types";

type AssignmentsTabsProps = {
  workOrders: WorkOrder[];
  technicians: Technician[];
  onWorkOrdersChange?: (orders: WorkOrder[]) => void;
};

export function AssignmentsTabs({ workOrders, technicians, onWorkOrdersChange }: AssignmentsTabsProps) {
  const unassignedWorkOrders = workOrders.filter(wo => wo.status === 'unassigned');
  const routesWorkOrders = workOrders.filter(wo => wo.status === 'in-progress');
  const scheduledWorkOrders = workOrders.filter(wo => wo.status === 'assigned' || wo.status === 'completed');
  
  const unassignedCount = unassignedWorkOrders.length;
  const routesCount = routesWorkOrders.length;
  const scheduledCount = scheduledWorkOrders.length;

  return (
    <Tabs defaultValue="unassigned">
      <TabsList className="tabs">
        <TabsTrigger value="unassigned" className="tab data-[state=active]:bg-brand-red data-[state=active]:text-white">
          Unassigned <span className="tab-count">({unassignedCount})</span>
        </TabsTrigger>
        <TabsTrigger value="routes" className="tab data-[state=active]:bg-brand-red data-[state=active]:text-white">
          Routes <span className="tab-count">({routesCount})</span>
        </TabsTrigger>
        <TabsTrigger value="scheduled" className="tab data-[state=active]:bg-brand-red data-[state=active]:text-white">
          Scheduled <span className="tab-count">({scheduledCount})</span>
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="unassigned" className="mt-0">
          <WorkOrdersClient
              workOrders={unassignedWorkOrders}
              allWorkOrders={workOrders}
              technicians={technicians}
              onWorkOrdersChange={onWorkOrdersChange}
          />
      </TabsContent>
      <TabsContent value="routes" className="mt-0">
           <WorkOrdersClient
              workOrders={routesWorkOrders}
              allWorkOrders={workOrders}
              technicians={technicians}
              onWorkOrdersChange={onWorkOrdersChange}
          />
      </TabsContent>
      <TabsContent value="scheduled" className="mt-0">
           <WorkOrdersClient
              workOrders={scheduledWorkOrders}
              allWorkOrders={workOrders}
              technicians={technicians}
              onWorkOrdersChange={onWorkOrdersChange}
          />
      </TabsContent>
    </Tabs>
  );
}
