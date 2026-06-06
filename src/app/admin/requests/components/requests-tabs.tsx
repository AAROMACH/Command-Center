"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RequestsClient } from "./requests-client";
import type { ServiceRequest, WorkOrder } from '@/lib/types';

const priorityOrder: Record<ServiceRequest['priority'], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

type RequestsTabsProps = {
    serviceRequests: ServiceRequest[];
    workOrders?: WorkOrder[];
};

export function RequestsTabs({ serviceRequests, workOrders = [] }: RequestsTabsProps) {
  // ORGANIZATIONAL LOGIC: Group 'new' and 'reviewed' into 'Requested'
  const requestedRequests = serviceRequests
    .filter(p => p.status === 'new' || p.status === 'reviewed')
    .sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
    
  const approvedRequests = serviceRequests.filter(p => p.status === 'approved');
  const closedRequests = serviceRequests.filter(p => p.status === 'closed' || p.status === 'rejected');

  return (
    <Tabs defaultValue="requested" className="w-full">
        <TabsList className="tabs">
          <TabsTrigger value="requested" className="tab">
            Requested <span className="tab-count">({requestedRequests.length})</span>
          </TabsTrigger>
          <TabsTrigger value="approved" className="tab">
            Approved <span className="tab-count">({approvedRequests.length})</span>
          </TabsTrigger>
           <TabsTrigger value="closed" className="tab">
            resolved/closed <span className="tab-count">({closedRequests.length})</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="requested" className="mt-0">
          <RequestsClient requests={requestedRequests} workOrders={workOrders} />
        </TabsContent>
        <TabsContent value="approved" className="mt-0">
          <RequestsClient requests={approvedRequests} workOrders={workOrders} />
        </TabsContent>
        <TabsContent value="closed" className="mt-0">
          <RequestsClient requests={closedRequests} workOrders={workOrders} isHistory />
        </TabsContent>
      </Tabs>
  );
}
