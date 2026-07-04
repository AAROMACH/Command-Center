
'use client';

import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, doc, setDoc } from 'firebase/firestore';
import { ProjectsTabs } from "./components/projects-tabs";
import { Button } from "@/components/ui/button";
import { FolderKanban, Plus, Search, SlidersHorizontal, X, ArrowUpDown, Calendar as CalendarIcon, Activity, LayoutList, LayoutGrid } from "lucide-react";
import { useState, useMemo, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { NewProjectDialog } from "./components/new-project-dialog";
import type { Project, Technician } from "@/lib/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { format, isSameDay, parseISO, startOfDay } from 'date-fns';

type SortOption = 'name' | 'date' | 'progress' | 'client';

export default function ProjectsPage() {
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [activeStatuses, setActiveStatuses] = useState<string[]>([]);
  const [activeClients, setActiveClients] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [viewMode, _setViewModeRaw] = useState<'list' | 'grid'>(() => { try { return (localStorage.getItem('cc:projects:view') as 'list' | 'grid') || 'list'; } catch { return 'list'; } });
  const setViewMode = (v: 'list' | 'grid') => { _setViewModeRaw(v); try { localStorage.setItem('cc:projects:view', v); } catch {} };

  const { toast } = useToast();

  useEffect(() => {
    const unsubProj = onSnapshot(collection(db, 'projects'), (snap) => {
        setAllProjects(snap.docs.map(d => ({ ...d.data(), id: d.id } as Project)));
    });
    const unsubTech = onSnapshot(collection(db, 'users'), (snap) => {
        setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
    });
    return () => { unsubProj(); unsubTech(); };
  }, []);

  const handleNewProject = async (newProject: Project) => {
    try {
        await setDoc(doc(db, 'projects', newProject.id), { ...newProject });
        toast({
          title: "Create Record",
          description: `${newProject.name} has been staged in the system.`,
        });
    } catch (e: any) {
        toast({ variant: "destructive", title: "Creation Failed", description: e.message });
    }
  };

  const clients = useMemo(() => {
    const unique = new Set(allProjects.map(p => p.client));
    return Array.from(unique).sort();
  }, [allProjects]);

  const toggleStatus = (status: string) => {
    setActiveStatuses(prev => 
      prev.includes(status) ? prev.filter(p => p !== status) : [...prev, status]
    );
  };

  const toggleClient = (client: string) => {
    setActiveClients(prev => 
      prev.includes(client) ? prev.filter(c => c !== client) : [...prev, client]
    );
  };

  const resetFilters = () => {
    setDateRange(undefined);
    setActiveStatuses([]);
    setActiveClients([]);
    setSortBy('date');
    toast({ title: "Filters Cleared", description: "Operational registry constraints removed." });
  };

  const filteredProjects = useMemo(() => {
    const getProgressValue = (project: Project) => {
        const phases = project.phases || [];
        const allTasks = phases.flatMap(phase => phase.tasks || []);
        if (allTasks.length === 0) return 0;
        const completedTasks = allTasks.filter(task => task && task.isCompleted).length;
        return (completedTasks / allTasks.length) * 100;
    };

    return allProjects
      .filter(p => {
        const matchesSearch = 
          (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.client || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.location || '').toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesStatus = activeStatuses.length === 0 || activeStatuses.includes(p.status);
        const matchesClient = activeClients.length === 0 || activeClients.includes(p.client);
        
        const matchesDate = !dateRange?.from || (p.startDate && (() => {
            try {
                const parts = p.startDate.split('-');
                let pDate;
                if (parts[0].length === 4) {
                    pDate = startOfDay(new Date(p.startDate));
                } else {
                    const [m, d, y] = parts;
                    pDate = startOfDay(new Date(parseInt(y), parseInt(m) - 1, parseInt(d)));
                }
                
                if (dateRange.from && dateRange.to) {
                    return pDate >= startOfDay(dateRange.from) && pDate <= startOfDay(dateRange.to);
                }
                if (dateRange.from) {
                    return isSameDay(pDate, dateRange.from);
                }
                return true;
            } catch (e) { return false; }
        })());

        return matchesSearch && matchesStatus && matchesClient && matchesDate;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'name': return (a.name || '').localeCompare(b.name || '');
          case 'client': return (a.client || '').localeCompare(b.client || '');
          case 'progress': return getProgressValue(b) - getProgressValue(a);
          default:
            return (b.startDate || '').localeCompare(a.startDate || '');
        }
      });
  }, [allProjects, searchQuery, activeStatuses, activeClients, dateRange, sortBy]);

  const hasActiveFilters = !!dateRange?.from || activeStatuses.length > 0 || activeClients.length > 0 || sortBy !== 'date';

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2">
            <FolderKanban size={12} />
            Infrastructure Deployment Control
          </p>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">Large-scale network and cabling deployments with phase-based job management.</p>
        </div>
        <div className="page-header-right items-center">
            <div className="search-wrap">
              <Search />
              <input 
                className="search-input !w-[220px]" 
                placeholder="Search project folders..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-2">
                <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                    <SelectTrigger className="w-[160px] h-10 bg-bg-secondary border-border-main text-[10px] uppercase font-bold tracking-widest">
                        <SelectValue placeholder="Sort By" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="date" className="text-[10px] uppercase font-bold">Start Date</SelectItem>
                        <SelectItem value="name" className="text-[10px] uppercase font-bold">Project Name</SelectItem>
                        <SelectItem value="client" className="text-[10px] uppercase font-bold">Client Entity</SelectItem>
                        <SelectItem value="progress" className="text-[10px] uppercase font-bold">Progress %</SelectItem>
                    </SelectContent>
                </Select>
                <div className="flex items-center border border-border-main rounded-md overflow-hidden h-10">
                    <button onClick={() => setViewMode('list')} className={cn('px-2.5 h-full flex items-center transition-colors', viewMode === 'list' ? 'bg-brand-red text-white' : 'bg-bg-secondary text-text-muted hover:text-text-primary')}>
                        <LayoutList size={14} />
                    </button>
                    <button onClick={() => setViewMode('grid')} className={cn('px-2.5 h-full flex items-center transition-colors border-l border-border-main', viewMode === 'grid' ? 'bg-brand-red text-white' : 'bg-bg-secondary text-text-muted hover:text-text-primary')}>
                        <LayoutGrid size={14} />
                    </button>
                </div>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("h-10", hasActiveFilters && "border-brand-red text-brand-red")}>
                      <SlidersHorizontal size={14} className="mr-2"/>
                      Filter
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-0 bg-bg-elevated border-border-main shadow-2xl" align="end">
                      <div className="p-4 border-b border-border-sub bg-bg-tertiary text-left">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black uppercase tracking-widest text-text-primary">Filters</p>
                          {hasActiveFilters && (
                            <button onClick={resetFilters} className="text-[9px] font-bold text-brand-red hover:underline flex items-center gap-1">
                              <X size={10} /> Reset
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="p-4 space-y-6 text-left">
                        <div className="space-y-3">
                          <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Status Audit</p>
                          <div className="space-y-2">
                            {['active', 'on-hold', 'completed'].map(status => (
                              <div key={status} className="flex items-center space-x-2">
                                <Checkbox 
                                  id={`status-${status}`} 
                                  checked={activeStatuses.includes(status)}
                                  onCheckedChange={() => toggleStatus(status)}
                                />
                                <Label htmlFor={`status-${status}`} className="text-[10px] uppercase font-semibold cursor-pointer capitalize">{status}</Label>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Client Entities</p>
                          <ScrollArea className="h-[120px]">
                            <div className="space-y-2 pr-4">
                              {clients.map(client => (
                                <div key={client} className="flex items-center space-x-2">
                                  <Checkbox 
                                    id={`client-${client}`} 
                                    checked={activeClients.includes(client)}
                                    onCheckedChange={() => toggleClient(client)}
                                  />
                                  <Label htmlFor={`client-${client}`} className="text-[10px] uppercase font-semibold cursor-pointer truncate">{client}</Label>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>
                      </div>
                  </PopoverContent>
                </Popover>

                <Button variant="default" size="default" onClick={() => setIsNewDialogOpen(true)}>
                    <Plus size={14} className="mr-2"/>
                    New Project
                </Button>
            </div>
        </div>
      </header>

      <div className="w-full space-y-6">
        <ProjectsTabs
          projects={filteredProjects}
          technicians={technicians}
          dateRange={dateRange}
          setDateRange={setDateRange}
          sortBy={sortBy}
          viewMode={viewMode}
        />
      </div>

      <NewProjectDialog 
        isOpen={isNewDialogOpen} 
        setIsOpen={setIsNewDialogOpen} 
        onSave={handleNewProject} 
      />
    </div>
  );
}
