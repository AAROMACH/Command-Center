import { serviceRequests } from "@/lib/data";
import { RequestsTabs } from "./components/requests-tabs";
import { Button } from "@/components/ui/button";
import { ClipboardList, Plus, Search, SlidersHorizontal } from "lucide-react";

export default function RequestsPage() {
  const allServiceRequests = serviceRequests;

  return (
    <div>
      <header className="page-header">
        <div>
          <p className="page-eyebrow flex items-center gap-2">
            <ClipboardList size={12} />
            Client Service Funnel
          </p>
          <h1 className="page-title">Service Requests</h1>
          <p className="page-subtitle">Manage all incoming client requests from intake to assignment.</p>
        </div>
        <div className="page-header-right items-center">
            <Button variant="default" size="default">
                <Plus size={14} className="mr-2"/>
                New Request
            </Button>
        </div>
      </header>

       <div className="mb-4 flex items-center justify-between">
        <div className="search-wrap">
          <Search />
          <input className="search-input" placeholder="Search by client, location, or description..." />
        </div>
        <Button variant="outline" size="default"><SlidersHorizontal size={14} className="mr-2"/> Filters</Button>
      </div>

      <RequestsTabs serviceRequests={allServiceRequests} />
    </div>
  );
}
