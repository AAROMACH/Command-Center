import { workOrders, technicians } from "@/lib/data";
import { WorkOrdersClient } from "./components/work-orders-client";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal, Upload, Search, Briefcase } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default async function AssignmentsPage() {
  const allWorkOrders = workOrders;
  const availableTechnicians = technicians;
  const unassignedCount = allWorkOrders.filter(wo => wo.status === 'unassigned').length;
  const scheduledCount = allWorkOrders.filter(wo => ['assigned', 'in-progress', 'completed'].includes(wo.status)).length;

  return (
    <div>
        <header className="page-header">
            <div>
              <p className="page-eyebrow flex items-center gap-2">
                <Briefcase size={12} />
                Field Service Schedule
              </p>
              <h1 className="page-title">Assignments</h1>
              <p className="page-subtitle">Master schedule management for all active technician engagements.</p>
            </div>
            <div className="page-header-right">
                <Button variant="outline" size="default">
                  <Upload size={14} className="mr-2"/>
                  Import Jobs (CSV)
                </Button>
                <Button variant="default" size="default">New Assignment</Button>
            </div>
      </header>

      <div className="mb-4 flex items-center justify-between">
        <div className="search-wrap">
          <Search />
          <input className="search-input" placeholder="Search by ID, Project, or Client..." />
        </div>
        <Button variant="outline" size="default"><SlidersHorizontal size={14} className="mr-2"/> Filters</Button>
      </div>

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
                workOrders={allWorkOrders.filter(wo => wo.status === 'unassigned')}
                technicians={availableTechnicians}
            />
        </TabsContent>
        <TabsContent value="scheduled" className="mt-0">
             <WorkOrdersClient
                workOrders={allWorkOrders.filter(wo => wo.status === 'assigned' || wo.status === 'in-progress' || wo.status === 'completed')}
                technicians={availableTechnicians}
            />
        </TabsContent>
      </Tabs>
    </div>
  );
}
