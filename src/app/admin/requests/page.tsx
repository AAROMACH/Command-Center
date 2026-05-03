'use client';

import { useState } from 'react';
import { serviceRequests as initialServiceRequests } from "@/lib/data";
import { RequestsTabs } from "./components/requests-tabs";
import { Button } from "@/components/ui/button";
import { ClipboardList, Plus, Search, SlidersHorizontal } from "lucide-react";
import { NewRequestDialog } from "./components/new-request-dialog";
import type { ServiceRequest } from "@/lib/types";
import { useToast } from '@/hooks/use-toast';

export default function RequestsPage() {
  const [allRequests, setAllRequests] = useState<ServiceRequest[]>(initialServiceRequests);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const handleAddNewRequest = (request: ServiceRequest) => {
    setAllRequests(prev => [request, ...prev]);
    toast({
        title: "Intake Buffer Updated",
        description: `Request ${request.id.toUpperCase()} has been added to the mission funnel.`,
    });
  };

  const filteredRequests = allRequests.filter(req => 
    req.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    req.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    req.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            <Button variant="default" size="default" onClick={() => setIsNewDialogOpen(true)}>
                <Plus size={14} className="mr-2"/>
                New Request
            </Button>
        </div>
      </header>

       <div className="mb-4 flex items-center justify-between">
        <div className="search-wrap">
          <Search />
          <input 
            className="search-input" 
            placeholder="Search by client, location, or description..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" size="default"><SlidersHorizontal size={14} className="mr-2"/> Filters</Button>
      </div>

      <RequestsTabs serviceRequests={filteredRequests} />

      <NewRequestDialog 
        isOpen={isNewDialogOpen}
        setIsOpen={setIsNewDialogOpen}
        onSave={handleAddNewRequest}
      />
    </div>
  );
}
