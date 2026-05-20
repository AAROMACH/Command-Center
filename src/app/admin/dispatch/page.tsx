
'use client';

import { useState, useMemo, useEffect } from 'react';
import { db } from "@/lib/firebase";
import { collection, doc, setDoc, addDoc, onSnapshot, query } from 'firebase/firestore';
import { DispatchTabs } from "./components/dispatch-tabs";
import { RequestsTabs } from "../requests/components/requests-tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SlidersHorizontal, Plus, Search, Import as ImportIcon, Layers, ClipboardList, X, ArrowUpDown } from "lucide-react";
import { NewAssignmentDialog } from "./components/new-assignment-dialog";
import { ImportJobsDialog } from "./components/import-jobs-dialog";
import { NewRequestDialog } from "../requests/components/new-request-dialog";
import type { WorkOrder, Route, ServiceRequest, Technician } from "@/lib/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSearchParams } from 'next/navigation';

const SERVICE_CATEGORIES = [
    'Installation',
    'Troubleshooting',
    'Maintenance',
    'Survey',
    'Repair',
    'Decommission'
];

const ASSIGNMENT_SOURCES = [
  'Imported',
  'Manual',
  'Client'
];

type SortOption = 'date' | 'client' | 'priority' | 'type';

export default function DispatchPage() {
  const searchParams = useSearchParams();
  const [activeMasterTab, setActiveMasterTab] = useState(searchParams.get('tab') === 'requests' ? 'requests' : 'dispatch');
  
  const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [allRequests, setAllRequests] = useState<ServiceRequest[]>([]);
  
  const [isNewDispatchOpen, setIsNewDispatchOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);
  const [dispatchSearchQuery, setDispatchSearchQuery] = useState("");
  const [requestSearchQuery, setRequestSearchQuery] = useState("");
  const [dispatchSortBy, setDispatchSortBy] = useState<SortOption>('date');
  const [requestSortBy, setRequestSortBy] = useState<SortOption>('priority');

  const [activePriorities, setActivePriorities] = useState<string[]>([]);
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [activeSources, setActiveSources] = useState<string[]>([]);

  const { toast } = useToast();

  useEffect(() => {
    const unsubWO = onSnapshot(collection(db, 'workOrders'), (snap) => {
      setAllWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
    });
    const unsubTech = onSnapshot(collection(db, 'users'), (snap) => {
      setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
    });
    const unsubReq = onSnapshot(collection(db, 'clientRequests'), (snap) => {
      setAllRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as ServiceRequest)));
    });
    const unsubRoutes = onSnapshot(collection(db, 'routes'), (snap) => {
      setRoutes(snap.docs.map(d => ({ ...d.data(), id: d.id } as Route)));
    });

    return () => {
      unsubWO();
      unsubTech();
      unsubReq();
      unsubRoutes();
    };
  }, []);

  const handleAddNewOrder = (order: WorkOrder) => {
    addDoc(collection(db, 'workOrders'), { ...order, source: 'Manual' })
      .then(() => toast({ title: "Assignment Staged", description: "Job entry committed to Firestore." }))
      .catch((e) => toast({ variant: "destructive", title: "Write Failed", description: e.message }));
  };

  const handleImportOrders = (newOrders: WorkOrder[]) => {
    newOrders.forEach(order => {
        setDoc(doc(db, 'workOrders', order.id), { ...order, source: 'Imported' })
            .catch(e => console.error("Import error", e));
    });
    toast({ title: "Import Processed", description: `${newOrders.length} records transmitted to registry.` });
  };

  const handleAddNewRequest = (request: ServiceRequest) => {
    addDoc(collection(db, 'clientRequests'), request)
      .then(() => toast({ title: "Request Logged", description: "Service ticket added to intake funnel." }))
      .catch((e) => toast({ variant: "destructive", title: "Write Failed", description: e.message }));
  };

  const togglePriority = (priority: string) => {
    setActivePriorities(prev => prev.includes(priority) ? prev.filter(p => p !== priority) : [...prev, priority]);
  };

  const toggleType = (type: string) => {
    setActiveTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const toggleSource = (source: string) => {
    setActiveSources(prev => prev.includes(source) ? prev.filter(s => s !== source) : [...prev, source]);
  };

  const filteredOrders = useMemo(() => {
    let results = allWorkOrders.filter(order => {
      const matchesSearch = order.id.toLowerCase().includes(dispatchSearchQuery.toLowerCase()) ||
        order.description.toLowerCase().includes(dispatchSearchQuery.toLowerCase()) ||
        order.clientName.toLowerCase().includes(dispatchSearchQuery.toLowerCase());
      const matchesPriority = activePriorities.length === 0 || activePriorities.includes(order.priority);
      const matchesType = activeTypes.length === 0 || activeTypes.includes(order.projectType);
      const matchesSource = activeSources.length === 0 || (order.source && activeSources.includes(order.source));
      return matchesSearch && matchesPriority && matchesType && matchesSource;
    });
    return results.sort((a, b) => {
        if (dispatchSortBy === 'priority') {
            const prio = { critical: 0, high: 1, medium: 2, low: 3 };
            return prio[a.priority] - prio[b.priority];
        }
        if (dispatchSortBy === 'client') return a.clientName.localeCompare(b.clientName);
        return a.scheduleDate.localeCompare(b.scheduleDate);
    });
  }, [allWorkOrders, dispatchSearchQuery, activePriorities, activeTypes, activeSources, dispatchSortBy]);

  const filteredRequests = useMemo(() => {
    let results = allRequests.filter(req => {
      const matchesSearch = req.id.toLowerCase().includes(requestSearchQuery.toLowerCase()) ||
        req.clientName.toLowerCase().includes(requestSearchQuery.toLowerCase()) ||
        req.description.toLowerCase().includes(requestSearchQuery.toLowerCase());
      const matchesPriority = activePriorities.length === 0 || activePriorities.includes(req.priority);
      const matchesType = activeTypes.length === 0 || activeTypes.includes(req.requestType);
      return matchesSearch && matchesPriority && matchesType;
    });
    return results.sort((a, b) => {
        if (requestSortBy === 'priority') {
            const prio = { critical: 0, high: 1, medium: 2, low: 3 };
            return prio[a.priority] - prio[b.priority];
        }
        return a.submittedDate.localeCompare(b.submittedDate);
    });
  }, [allRequests, requestSearchQuery, activePriorities, activeTypes, requestSortBy]);

  return (
    <div className="space-y-6">
        <header className="page-header">
            <div>
              <p className="page-eyebrow flex items-center gap-2"><Layers size={12} />Operations Control Center</p>
              <h1 className="page-title">Dispatch & Intake</h1>
              <p className="page-subtitle">Unified terminal for client requests and logistical job routing.</p>
            </div>
            <div className="page-header-right">
                {activeMasterTab === 'dispatch' ? (
                  <>
                    <Button variant="outline" onClick={() => setIsImportDialogOpen(true)}><ImportIcon size={14} className="mr-2"/>Import Jobs</Button>
                    <Button variant="default" onClick={() => setIsNewDispatchOpen(true)}>+ New Dispatch Entry</Button>
                  </>
                ) : (
                  <Button variant="default" onClick={() => setIsNewRequestOpen(true)}><Plus size={14} className="mr-2"/>New Service Request</Button>
                )}
            </div>
      </header>

      <Tabs value={activeMasterTab} onValueChange={setActiveMasterTab} className="w-full">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
            <TabsList className="tabs !p-0 !bg-bg-tertiary">
              <TabsTrigger value="dispatch" className="tab !px-8 !py-4 data-[state=active]:bg-bg-secondary data-[state=active]:border-2 data-[state=active]:border-brand-red data-[state=active]:text-brand-red">DISPATCH HUB</TabsTrigger>
              <TabsTrigger value="requests" className="tab !px-8 !py-4 data-[state=active]:bg-bg-secondary data-[state=active]:border-2 data-[state=active]:border-brand-red data-[state=active]:text-brand-red">SERVICE REQUESTS</TabsTrigger>
            </TabsList>
        </div>

        <TabsContent value="dispatch" className="mt-0">
           <DispatchTabs 
              workOrders={filteredOrders} 
              technicians={technicians} 
              onWorkOrdersChange={(updated) => updated.forEach(wo => setDoc(doc(db, 'workOrders', wo.id), wo, { merge: true }))}
              routes={routes}
              onRoutesChange={(updated) => updated.forEach(r => setDoc(doc(db, 'routes', r.id), r, { merge: true }))}
           />
        </TabsContent>

        <TabsContent value="requests" className="mt-0">
           <RequestsTabs serviceRequests={filteredRequests} />
        </TabsContent>
      </Tabs>

      <NewAssignmentDialog isOpen={isNewDispatchOpen} setIsOpen={setIsNewDispatchOpen} onSave={handleAddNewOrder} />
      <ImportJobsDialog isOpen={isImportDialogOpen} setIsOpen={setIsImportDialogOpen} onImport={handleImportOrders} existingOrders={allWorkOrders} />
      <NewRequestDialog isOpen={isNewRequestOpen} setIsOpen={setIsNewRequestOpen} onSave={handleAddNewRequest} />
    </div>
  );
}
