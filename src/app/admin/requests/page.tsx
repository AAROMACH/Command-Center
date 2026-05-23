
'use client';

import { useState, useMemo, useEffect } from 'react';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, addDoc } from 'firebase/firestore';
import { RequestsTabs } from "./components/requests-tabs";
import { Button } from "@/components/ui/button";
import { ClipboardList, Plus, Search, SlidersHorizontal, ArrowUpDown, X } from "lucide-react";
import { NewRequestDialog } from "./components/new-request-dialog";
import type { ServiceRequest, WorkOrder, Technician } from "@/lib/types";
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Badge } from '@/components/ui/badge';
import { useSearchParams } from 'next/navigation';

const SERVICE_CATEGORIES = [
    'Installation',
    'Troubleshooting',
    'Maintenance',
    'Survey',
    'Repair',
    'Decommission'
];

type SortOption = 'date' | 'client' | 'priority' | 'type';

export default function RequestsPage() {
  const searchParams = useSearchParams();
  const [allRequests, setAllRequests] = useState<ServiceRequest[]>([]);
  const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>([]);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>('priority');
  
  // Filter State
  const [activePriorities, setActivePriorities] = useState<string[]>([]);
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  
  const { toast } = useToast();

  // 1. Initialize Registry Listeners
  useEffect(() => {
    const q = query(collection(db, 'clientRequests'));
    const unsub = onSnapshot(q, (snapshot) => {
      const requests = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ServiceRequest));
      setAllRequests(requests);
    });

    const unsubWO = onSnapshot(collection(db, 'workOrders'), (snapshot) => {
      setAllWorkOrders(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as WorkOrder)));
    });

    return () => {
      unsub();
      unsubWO();
    };
  }, []);

  const handleAddNewRequest = async (request: ServiceRequest) => {
    try {
        const { id, ...data } = request;
        await addDoc(collection(db, 'clientRequests'), data);
        toast({
            title: "Intake Buffer Updated",
            description: `Request ${request.id.toUpperCase()} has been added to the mission funnel.`,
        });
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Intake Error', description: e.message });
    }
  };

  const togglePriority = (priority: string) => {
    setActivePriorities(prev => 
      prev.includes(priority) ? prev.filter(p => p !== priority) : [...prev, priority]
    );
  };

  const toggleType = (type: string) => {
    setActiveTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const resetFilters = () => {
    setActivePriorities([]);
    setActiveTypes([]);
    setSortBy('priority');
    toast({ title: "Filters Cleared", description: "Operational registry constraints removed." });
  };

  const filteredRequests = useMemo(() => {
    let results = allRequests.filter(req => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        (req.id || '').toLowerCase().includes(q) ||
        (req.clientName || '').toLowerCase().includes(q) ||
        (req.description || '').toLowerCase().includes(q) ||
        (req.location || '').toLowerCase().includes(q);
      
      const matchesPriority = activePriorities.length === 0 || activePriorities.includes(req.priority);
      const matchesType = activeTypes.length === 0 || activeTypes.includes(req.requestType);
      
      return matchesSearch && matchesPriority && matchesType;
    });

    return results.sort((a, b) => {
        if (sortBy === 'priority') {
            const prio = { critical: 0, high: 1, medium: 2, low: 3 };
            return prio[a.priority as keyof typeof prio] - prio[b.priority as keyof typeof prio];
        }
        if (sortBy === 'client') return (a.clientName || '').localeCompare(b.clientName || '');
        if (sortBy === 'type') return (a.requestType || '').localeCompare(b.requestType || '');
        return (b.submittedDate || '').localeCompare(a.submittedDate || '');
    });
  }, [allRequests, searchQuery, activePriorities, activeTypes, sortBy]);

  const hasActiveFilters = activePriorities.length > 0 || activeTypes.length > 0 || sortBy !== 'priority';

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2">
            <ClipboardList size={12} />
            Service Funnel
          </p>
          <h1 className="page-title">Intake Registry</h1>
          <p className="page-subtitle">Audit and route strategic client service requests.</p>
        </div>
        <div className="page-header-right items-center">
            <Button variant="default" size="default" onClick={() => setIsNewDialogOpen(true)}>
                <Plus size={16} className="mr-2"/>
                Manual Intake
            </Button>
        </div>
      </header>

       <div className="mb-6 flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-bg-secondary rounded-xl border border-border-sub shadow-sm">
        <div className="search-wrap flex-1 !mb-0 w-full md:w-auto">
          <Search className="h-4 w-4 text-text-muted" />
          <input 
            className="search-input !h-10 !text-xs font-bold uppercase !w-full bg-bg-primary" 
            placeholder="Search registry by ID, client, or scope..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
            <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                <SelectTrigger className="w-[140px] h-10 bg-bg-primary text-[10px] uppercase font-bold tracking-widest border-border-main">
                    <div className="flex items-center gap-2">
                        <ArrowUpDown size={14} className="text-text-muted" />
                        <SelectValue placeholder="Sort Registry" />
                    </div>
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="priority" className="text-[10px] uppercase font-bold">Priority First</SelectItem>
                    <SelectItem value="date" className="text-[10px] uppercase font-bold">Submission Date</SelectItem>
                    <SelectItem value="client" className="text-[10px] uppercase font-bold">Client Entity</SelectItem>
                    <SelectItem value="type" className="text-[10px] uppercase font-bold">Technical Category</SelectItem>
                </SelectContent>
            </Select>

            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("h-10", hasActiveFilters && "border-brand-red text-brand-red")}>
                        <SlidersHorizontal size={14} className="mr-2"/>
                        Filters
                        {hasActiveFilters && <Badge variant="destructive" className="ml-2 h-4 w-4 p-0 flex items-center justify-center text-[8px]">{(sortBy !== 'priority' ? 1 : 0) + activePriorities.length + activeTypes.length}</Badge>}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-0 bg-bg-elevated border-border-main shadow-2xl" align="end">
                    <div className="p-4 border-b border-border-sub bg-bg-tertiary">
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black uppercase tracking-widest text-text-primary">Registry Constraints</p>
                            {hasActiveFilters && (
                                <button onClick={resetFilters} className="text-[9px] font-bold text-brand-red hover:underline flex items-center gap-1">
                                    <X size={10} /> Reset
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="p-4 space-y-6 text-left">
                        <div className="space-y-3">
                            <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Priority Audit</p>
                            <div className="grid grid-cols-2 gap-2">
                                {['critical', 'high', 'medium', 'low'].map(priority => (
                                    <div key={priority} className="flex items-center space-x-2">
                                        <Checkbox 
                                            id={`prio-${priority}`} 
                                            checked={activePriorities.includes(priority)}
                                            onCheckedChange={() => togglePriority(priority)}
                                        />
                                        <Label htmlFor={`prio-${priority}`} className="text-[10px] uppercase font-semibold cursor-pointer">{priority}</Label>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Technical Path</p>
                            <div className="space-y-2">
                                {SERVICE_CATEGORIES.map(type => (
                                    <div key={type} className="flex items-center space-x-2">
                                        <Checkbox 
                                            id={`type-${type}`} 
                                            checked={activeTypes.includes(type)}
                                            onCheckedChange={() => toggleType(type)}
                                        />
                                        <Label htmlFor={`type-${type}`} className="text-[10px] uppercase font-semibold cursor-pointer">{type}</Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
      </div>

      <RequestsTabs serviceRequests={filteredRequests} workOrders={allWorkOrders} />

      <NewRequestDialog 
        isOpen={isNewDialogOpen}
        setIsOpen={setIsNewDialogOpen}
        onSave={handleAddNewRequest}
      />
    </div>
  );
}
