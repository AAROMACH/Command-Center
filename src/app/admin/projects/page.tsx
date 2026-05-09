
'use client';

import { projects as initialProjects, technicians } from "@/lib/data";
import { ProjectsTabs } from "./components/projects-tabs";
import { Button } from "@/components/ui/button";
import { FolderKanban, Plus, Search, SlidersHorizontal, X } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export default function ProjectsPage() {
  const [allProjects, setAllProjects] = useState<Project[]>(initialProjects);
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  
  const [activeStatuses, setActiveStatuses] = useState<string[]>([]);
  const [activeClients, setActiveClients] = useState<string[]>([]);

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
    setActiveStatuses([]);
    setActiveClients([]);
    toast({ title: "Filters Cleared", description: "Operational registry constraints removed." });
  };

  const filteredProjects = useMemo(() => {
    return allProjects.filter(p => {
      const matchesSearch = 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.location.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = activeStatuses.length === 0 || activeStatuses.includes(p.status);
      const matchesClient = activeClients.length === 0 || activeClients.includes(p.client);

      return matchesSearch && matchesStatus && matchesClient;
    });
  }, [allProjects, searchQuery, activeStatuses, activeClients]);

  const hasActiveFilters = activeStatuses.length > 0 || activeClients.length > 0;

  return (
    <div>
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
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-10", hasActiveFilters && "border-brand-red text-brand-red")}>
                  <SlidersHorizontal size={14} className="mr-2"/>
                  Filter
                  {hasActiveFilters && <Badge variant="destructive" className="ml-2 h-4 w-4 p-0 flex items-center justify-center text-[8px]">{activeStatuses.length + activeClients.length}</Badge>}
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
                  <div className="p-4 bg-bg-tertiary/50 border-t border-border-sub">
                    <p className="text-[8px] text-text-muted uppercase font-medium leading-tight">
                      Constraints are applied globally to the Project Registry.
                    </p>
                  </div>
              </PopoverContent>
            </Popover>

            <Button variant="default" size="default" onClick={() => setIsNewDialogOpen(true)}>
                <Plus size={14} className="mr-2"/>
                New Project
            </Button>
        </div>
      </header>

      <ProjectsTabs projects={filteredProjects} technicians={allTechnicians} />

      <NewProjectDialog 
        isOpen={isNewDialogOpen} 
        setIsOpen={setIsNewDialogOpen} 
        onSave={handleNewProject} 
      />
    </div>
  );
}
