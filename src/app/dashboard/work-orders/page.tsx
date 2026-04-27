import { workOrders, technicians } from "@/lib/data";
import { WorkOrdersClient } from "./components/work-orders-client";

export default async function WorkOrdersPage() {
  // In a real app, you'd fetch this data from an API
  const allWorkOrders = workOrders;
  const availableTechnicians = technicians;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-headline text-2xl font-bold tracking-tight">
        Work Order Management
      </h1>
      <WorkOrdersClient
        workOrders={allWorkOrders}
        technicians={availableTechnicians}
      />
    </div>
  );
}
