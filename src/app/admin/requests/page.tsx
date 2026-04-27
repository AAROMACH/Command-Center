import { serviceRequests } from "@/lib/data";
import { RequestsClient } from "./components/requests-client";
import { Button } from "@/components/ui/button";
import { ClipboardList, Plus, Search, SlidersHorizontal } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ServiceRequest } from '@/lib/types';

const priorityOrder: Record<ServiceRequest['priority'], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export default function RequestsPage() {
  const newRequests = serviceRequests
    .filter(p => p.status === 'new')
    .sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
    
  const reviewedRequests = serviceRequests.filter(p => p.status === 'reviewed');
  const approvedRequests = serviceRequests.filter(p => p.status === 'approved');
  const closedRequests = serviceRequests.filter(p => p.status === 'closed' || p.status === 'rejected');

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
          <RequestsClient requests={newRequests} />
        </TabsContent>
        <TabsContent value="reviewed" className="mt-0">
          <RequestsClient requests={reviewedRequests} />
        </TabsContent>
        <TabsContent value="approved" className="mt-0">
          <RequestsClient requests={approvedRequests} />
        </TabsContent>
        <TabsContent value="closed" className="mt-0">
          <RequestsClient requests={closedRequests} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
