
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
    workOrders: WorkOrder[];
};

export function RequestsTabs({ serviceRequests, workOrders }: RequestsTabsProps) {
  // ORGANIZATIONAL LOGIC: Always sort New requests by Critical Priority first
  const newRequests = serviceRequests
    .filter(p => p.status === 'new')
    .sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
    
  const reviewedRequests = serviceRequests.filter(p => p.status === 'reviewed');
  const approvedRequests = serviceRequests.filter(p => p.status === 'approved');
  const closedRequests = serviceRequests.filter(p => p.status === 'closed' || p.status === 'rejected');

  return (
    <Tabs defaultValue="new" className="w-full">
        <TabsList className="tabs">
          <TabsTrigger value="new" className="tab">
            New <span className="tab-count">({newRequests.length})</span>
          </TabsTrigger>
          <TabsTrigger value="reviewed" className="tab">
            Reviewed <span className="tab-count">({reviewedRequests.length})</span>
          </TabsTrigger>
          <TabsTrigger value="approved" className="tab">
            Approved <span className="tab-count">({approvedRequests.length})</span>
          </TabsTrigger>
           <TabsTrigger value="closed" className="tab">
            Closed / Rejected <span className="tab-count">({closedRequests.length})</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="new" className="mt-0">
          <RequestsClient requests={newRequests} workOrders={workOrders} />
        </TabsContent>
        <TabsContent value="reviewed" className="mt-0">
          <RequestsClient requests={reviewedRequests} workOrders={workOrders} />
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
