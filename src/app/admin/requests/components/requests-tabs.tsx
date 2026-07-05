"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RequestsClient } from "./requests-client";
import { normalizeRequestStatus } from '@/lib/request-intake';
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
  // Bucket on normalized status so legacy ('new', 'reviewed', 'rejected') and
  // newer ('pending_review', 'denied') vocabularies land in the right tab.
  const requestedRequests = serviceRequests
    .filter(p => ['new', 'pending_review'].includes(normalizeRequestStatus(p.status, p)))
    .sort((a, b) => (priorityOrder[b.priority] ?? 0) - (priorityOrder[a.priority] ?? 0));

  const approvedRequests = serviceRequests.filter(p => normalizeRequestStatus(p.status, p) === 'approved');
  const closedRequests = serviceRequests.filter(p =>
    ['closed', 'denied', 'converted', 'archived'].includes(normalizeRequestStatus(p.status, p)));

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
