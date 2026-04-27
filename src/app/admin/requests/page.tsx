import { serviceRequests } from "@/lib/data";
import { RequestsClient } from "./components/requests-client";
import { Button } from "@/components/ui/button";
import { ClipboardList, Plus, Search, SlidersHorizontal } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function RequestsPage() {
  const newRequests = serviceRequests.filter(p => p.status === 'new');
  const quotedRequests = serviceRequests.filter(p => p.status === 'quoted');
  const scheduledRequests = serviceRequests.filter(p => p.status === 'scheduled');
  const closedRequests = serviceRequests.filter(p => p.status === 'closed');

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
          <TabsTrigger value="quoted" className="tab">
            Quoted <span className="tab-count">({quotedRequests.length})</span>
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="tab">
            Scheduled <span className="tab-count">({scheduledRequests.length})</span>
          </TabsTrigger>
           <TabsTrigger value="closed" className="tab">
            Closed <span className="tab-count">({closedRequests.length})</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="new" className="mt-0">
          <RequestsClient requests={newRequests} />
        </TabsContent>
        <TabsContent value="quoted" className="mt-0">
          <RequestsClient requests={quotedRequests} />
        </TabsContent>
        <TabsContent value="scheduled" className="mt-0">
          <RequestsClient requests={scheduledRequests} />
        </TabsContent>
        <TabsContent value="closed" className="mt-0">
          <RequestsClient requests={closedRequests} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
