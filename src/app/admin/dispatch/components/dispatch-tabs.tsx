
"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WorkOrdersClient } from "./work-orders-client";
import { ReviewQueueView } from "./review-queue-view";
import { RoutesView } from "./routes-view";
import type { WorkOrder, Technician, Route } from "@/lib/types";
import { useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';

type DispatchTabsProps = {
  workOrders: WorkOrder[];
  technicians: Technician[];
  onWorkOrdersChange: (orders: WorkOrder[]) => void;
  reviewQueueJobs: WorkOrder[];
  onReviewSendToDispatch: (wo: WorkOrder) => void;
  onReviewArchive: (wo: WorkOrder) => void;
  routes: Route[];
  onRoutesChange: (routes: Route[]) => void;
  allJobPool: WorkOrder[];
  dateAsc?: boolean;
  isDateSortActive?: boolean;
  onToggleDateSort?: () => void;
};

export function DispatchTabs({
  workOrders,
  technicians,
  onWorkOrdersChange,
  reviewQueueJobs,
  onReviewSendToDispatch,
  onReviewArchive,
  routes,
  onRoutesChange,
  allJobPool,
  dateAsc,
  isDateSortActive,
  onToggleDateSort,
}: DispatchTabsProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('subtab') || 'unassigned');

  useEffect(() => {
    const subtab = searchParams.get('subtab');
    if (subtab && (subtab === 'unassigned' || subtab === 'routes' || subtab === 'review')) {
      setActiveTab(subtab);
    }
  }, [searchParams]);

  const unassignedWorkOrders = workOrders.filter(wo => wo.status === 'unassigned' || !wo.assignedTechnicianId);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="tabs">
        <TabsTrigger value="unassigned" className="tab">
          Unassigned <span className="tab-count">({unassignedWorkOrders.length})</span>
        </TabsTrigger>
        <TabsTrigger value="routes" className="tab">
          Routes <span className="tab-count">({routes.length})</span>
        </TabsTrigger>
        <TabsTrigger value="review" className="tab">
          Review Queue <span className="tab-count">({reviewQueueJobs.length})</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="unassigned" className="mt-0">
          <WorkOrdersClient
              workOrders={unassignedWorkOrders}
              allWorkOrders={workOrders}
              technicians={technicians}
              onWorkOrdersChange={onWorkOrdersChange}
              mode="unassigned"
              dateAsc={dateAsc}
              isDateSortActive={isDateSortActive}
              onToggleDateSort={onToggleDateSort}
          />
      </TabsContent>

      <TabsContent value="routes" className="mt-0">
          <RoutesView
              routes={routes}
              allJobPool={allJobPool}
              technicians={technicians}
              onWorkOrdersChange={onWorkOrdersChange}
              onRoutesChange={onRoutesChange}
          />
      </TabsContent>

      <TabsContent value="review" className="mt-0">
          <ReviewQueueView
            jobs={reviewQueueJobs}
            technicians={technicians}
            onSendToDispatch={onReviewSendToDispatch}
            onArchive={onReviewArchive}
          />
      </TabsContent>
    </Tabs>
  );
}
