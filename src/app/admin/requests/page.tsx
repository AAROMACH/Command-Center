
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
    <div className="space-y-4">
      <header className="page-header !mb-2">
        <div>
          <p className="page-eyebrow flex items-center gap-2">
            <ClipboardList size={12} />
            Service Funnel
          </p>
          <h1 className="page-title !text-xl">Intake Registry</h1>
          <p className="page-subtitle text-[11px]">Audit and route stakeholder service requests.</p>
        </div>
        <div className="page-header-right items-center">
            <Button variant="default" size="sm" onClick={() => setIsNewDialogOpen(true)} className="h-8 !text-[10px]">
                <Plus size={14} className="mr-2"/>
                Manual Request
            </Button>
        </div>
      </header>

       <div className="mb-4 flex items-center justify-between gap-3 p-2 bg-bg-secondary/30 rounded-lg border border-border-sub">
        <div className="search-wrap !mb-0 flex-1 md:max-w-[400px]">
          <Search className="!h-3.5 !w-3.5" />
          <input 
            className="search-input !h-8 !text-[11px] !w-full" 
            placeholder="Search registry by client or coordinates..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" size="sm" className="h-8 !text-[10px]"><SlidersHorizontal size={12} className="mr-1.5"/> Filter</Button>
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

