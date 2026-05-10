'use client';

import { projects as initialProjects, technicians } from "@/lib/data";
import { ProjectsTabs } from "./components/projects-tabs";
import { Button } from "@/components/ui/button";
import { FolderKanban, Plus, Search, SlidersHorizontal, X, ArrowUpDown, Calendar as CalendarIcon, Activity } from "lucide-react";
import { useState, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { NewProjectDialog } from "./components/new-project-dialog";
import type { Project } from "@/lib/types";
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
import { format, isSameDay, parseISO } from 'date-fns';

type SortOption = 'name' | 'date' | 'progress' | 'client';

export default function ProjectsPage() {
  const [allProjects, setAllProjects] = useState<Project[]>(initialProjects);
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [activeStatuses, setActiveStatuses] = useState<string[]>([]);
  const [activeClients, setActiveClients] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('date');

  const allTechnicians = technicians;
  const { toast } = useToast();

  const handleNewProject = (newProject: Project) => {
    setAllProjects(prev => [newProject, ...prev]);
    toast({
      title: "Project Registry Initialized",
      description: `${newProject.name} has been staged in the operational registry.`,
    });
  };

  const clients = useMemo(() => {
    const unique = new Set(allProjects.map(p => p.client));
    return Array.from(unique).sort();
  }, [allProjects]);

  const toggleStatus = (status: string) => {
    setActiveStatuses(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
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
    const getProgress = (project: Project) => {
        const allTasks = project.phases.flatMap(phase => phase.tasks);
        if (allTasks.length === 0) return 0;
        const completedTasks = allTasks.filter(task => task.isCompleted).length;
        return (completedTasks / allTasks.length) * 100;
    };

    return allProjects
      .filter(p => {
        const matchesSearch = 
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.location.toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesStatus = activeStatuses.length === 0 || activeStatuses.includes(p.status);
        const matchesClient = activeClients.length === 0 || activeClients.includes(p.client);
        
        const matchesDate = !dateRange?.from || (p.startDate && (() => {
            try {
                const pDate = parseISO(p.startDate);
                if (dateRange.from && dateRange.to) {
                    return pDate >= dateRange.from && pDate <= dateRange.to;
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
          case 'name': return a.name.localeCompare(b.name);
          case 'client': return a.client.localeCompare(b.client);
          case 'progress': return getProgress(b) - getProgress(a);
          case 'date': 
          default:
            return b.startDate.localeCompare(a.startDate);
        }
      });
  }, [allProjects, searchQuery, activeStatuses, activeClients, dateRange, sortBy]);

  const hasActiveFilters = !!dateRange?.from || activeStatuses.length > 0 || activeClients.length > 0 || sortBy !== 'date';

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <p className="page-eyebrow flex items-center gap-2">
            <FolderKanban size={12} />
            Low Voltage infrastructure
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
                        <div className="flex items-center gap-2">
                            <ArrowUpDown size={14} className="text-text-muted" />
                            <SelectValue placeholder="Sort By" />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="date" className="text-[10px] uppercase font-bold">Start Date</SelectItem>
                        <SelectItem value="name" className="text-[10px] uppercase font-bold">Project Name</SelectItem>
                        <SelectItem value="client" className="text-[10px] uppercase font-bold">Client Entity</SelectItem>
                        <SelectItem value="progress" className="text-[10px] uppercase font-bold">Progress %</SelectItem>
                    </SelectContent>
                </Select>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("h-10", hasActiveFilters && "border-brand-red text-brand-red")}>
                      <SlidersHorizontal size={14} className="mr-2"/>
                      Filter
                      {hasActiveFilters && <Badge variant="destructive" className="ml-2 h-4 w-4 p-0 flex items-center justify-center text-[8px]">{(dateRange?.from ? 1 : 0) + activeStatuses.length + activeClients.length}</Badge>}
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
                      <div className="p-4 space-y-6">
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
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-2">
          <ProjectsTabs projects={filteredProjects} technicians={allTechnicians} />
        </div>

        <div className="flex justify-between items-center bg-bg-secondary/50 p-4 rounded-lg border border-border-sub">
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                    <Activity size={16} className="text-brand-red" />
                    <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">Infrastructure Projects Registry</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                    {dateRange?.from && (
                        <Badge variant="secondary" className="h-7 gap-2 border-brand-red/30 bg-brand-red-dim/20 text-brand-red px-3">
                            <CalendarIcon size={12} />
                            <span className="text-[10px] uppercase font-bold tracking-widest">
                                {format(dateRange.from, 'MM-dd-yyyy')}
                                {dateRange.to && ` – ${format(dateRange.to, 'MM-dd-yyyy')}`}
                            </span>
                            <button 
                                onClick={() => setDateRange(undefined)}
                                className="hover:bg-brand-red/20 rounded-full p-0.5 transition-colors"
                            >
                                <X size={12} />
                            </button>
                        </Badge>
                    )}
                </div>
            </div>

            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("h-10 px-6 border-border-main bg-bg-secondary text-[11px] font-bold uppercase tracking-widest", dateRange?.from && "border-brand-red text-brand-red")}>
                        <CalendarIcon size={14} className="mr-2 text-brand-red" />
                        {dateRange?.from ? (
                            dateRange.to ? (
                                <>{format(dateRange.from, "MM-dd-yyyy")} – {format(dateRange.to, "MM-dd-yyyy")}</>
                            ) : (
                                format(dateRange.from, "MM-dd-yyyy")
                            )
                        ) : (
                            "Select Date"
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-bg-elevated border-border-main shadow-2xl" align="end">
                    <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={dateRange?.from}
                        selected={dateRange}
                        onSelect={setDateRange}
                        numberOfMonths={1}
                    />
                </PopoverContent>
            </Popover>
        </div>
      </div>

      <NewProjectDialog 
        isOpen={isNewDialogOpen} 
        setIsOpen={setIsNewDialogOpen} 
        onSave={handleNewProject} 
      />
    </div>
  );
}
