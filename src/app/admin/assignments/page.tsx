import { workOrders, technicians } from "@/lib/data";
import { WorkOrdersClient } from "./components/work-orders-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SlidersHorizontal } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default async function AssignmentsPage() {
  const allWorkOrders = workOrders;
  const availableTechnicians = technicians;
  const unassignedCount = allWorkOrders.filter(wo => wo.status === 'unassigned').length;
  const scheduledCount = allWorkOrders.filter(wo => wo.status === 'assigned').length;

  return (
    <div>
        <header className="page-header">
            <div>
            <p className="page-eyebrow">Field Service Schedule</p>
            <h1 className="page-title">Assignments</h1>
            </div>
            <div className="page-header-right">
                <Button variant="outline">Import Jobs (CSV)</Button>
                <Button variant="default">New Assignment</Button>
            </div>
      </header>

      <div className="mb-5 flex items-center gap-4">
        <Input placeholder="Search assignments..." className="max-w-xs bg-bg-secondary" />
        <Button variant="outline" size="default"><SlidersHorizontal size={14} className="mr-2"/> Filters</Button>
      </div>

       <Tabs defaultValue="unassigned">
        <TabsList className="mb-4 bg-transparent p-0">
          <TabsTrigger value="unassigned" className="rounded-full data-[state=active]:bg-brand-red data-[state=active]:text-white">Unassigned <span className="ml-2 opacity-80">{unassignedCount}</span></TabsTrigger>
          <TabsTrigger value="scheduled" className="rounded-full data-[state=active]:bg-brand-red data-[state=active]:text-white">Scheduled <span className="ml-2 opacity-80">{scheduledCount}</span></TabsTrigger>
        </TabsList>
        
        <TabsContent value="unassigned">
            <WorkOrdersClient
                workOrders={allWorkOrders.filter(wo => wo.status === 'unassigned')}
                technicians={availableTechnicians}
            />
        </TabsContent>
        <TabsContent value="scheduled">
             <WorkOrdersClient
                workOrders={allWorkOrders.filter(wo => wo.status === 'assigned' || wo.status === 'in-progress')}
                technicians={availableTechnicians}
            />
        </TabsContent>
      </Tabs>
    </div>
  );
}
