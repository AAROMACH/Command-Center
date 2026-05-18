"use client";

import { WorkOrdersTable } from "../../components/work-orders-table";
import type { WorkOrder, Technician, Route } from "@/lib/types";

type WorkOrdersClientProps = {
  workOrders: WorkOrder[];
  allWorkOrders: WorkOrder[];
  technicians: Technician[];
  onWorkOrdersChange: (orders: WorkOrder[]) => void;
  routes: Route[];
  mode: 'unassigned' | 'assigned';
};

export function WorkOrdersClient(props: WorkOrdersClientProps) {
  return <WorkOrdersTable {...props} />;
}
