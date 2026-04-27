import { workOrders, technicians } from "@/lib/data";
import { AssignmentsTabs } from "./components/assignments-tabs";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal, Upload, Search, Briefcase } from "lucide-react";

export default async function AssignmentsPage() {
  const allWorkOrders = workOrders;
  const availableTechnicians = technicians;

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

       <AssignmentsTabs workOrders={allWorkOrders} technicians={availableTechnicians} />
    </div>
  );
}
