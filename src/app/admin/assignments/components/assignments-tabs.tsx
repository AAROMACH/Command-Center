"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WorkOrdersClient } from "./work-orders-client";
import type { WorkOrder, Technician } from "@/lib/types";

type AssignmentsTabsProps = {
  workOrders: WorkOrder[];
  technicians: Technician[];
};

export function AssignmentsTabs({ workOrders, technicians }: AssignmentsTabsProps) {
  const unassignedWorkOrders = workOrders.filter(wo => wo.status === 'unassigned');
  const scheduledWorkOrders = workOrders.filter(wo => ['assigned', 'in-progress', 'completed'].includes(wo.status));
  
  const unassignedCount = unassignedWorkOrders.length;
  const scheduledCount = scheduledWorkOrders.length;

  return (
    <Tabs defaultValue="unassigned">
      <TabsList className="tabs">
        <TabsTrigger value="unassigned" className="tab data-[state=active]:bg-brand-red data-[state=active]:text-white">
          Unassigned <span className="tab-count">({unassignedCount})</span>
        </TabsTrigger>
        <TabsTrigger value="scheduled" className="tab data-[state=active]:bg-brand-red data-[state=active]:text-white">
          Scheduled <span className="tab-count">({scheduledCount})</span>
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="unassigned" className="mt-0">
          <WorkOrdersClient
              workOrders={unassignedWorkOrders}
              technicians={technicians}
          />
      </TabsContent>
      <TabsContent value="scheduled" className="mt-0">
           <WorkOrdersClient
              workOrders={scheduledWorkOrders}
              technicians={technicians}
          />
      </TabsContent>
    </Tabs>
  );
}
