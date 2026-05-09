'use client';

import { projects as initialProjects, technicians } from "@/lib/data";
import { ProjectsTabs } from "./components/projects-tabs";
import { Button } from "@/components/ui/button";
import { FolderKanban, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useState, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { NewProjectDialog } from "./components/new-project-dialog";
import type { Project } from "@/lib/types";

export default function ProjectsPage() {
  const [allProjects, setAllProjects] = useState<Project[]>(initialProjects);
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  
  const allTechnicians = technicians;
  const { toast } = useToast();

  const handleNewProject = (newProject: Project) => {
    setAllProjects(prev => [newProject, ...prev]);
    toast({
      title: "Project Registry Initialized",
      description: `${newProject.name} has been staged in the operational registry.`,
    });
  };

  const filteredProjects = useMemo(() => {
    return allProjects.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.location.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [allProjects, searchQuery]);

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
            <Button variant="outline" size="sm" onClick={() => toast({ title: "Filter Terminal", description: "Search constraints updated." })}>
              <SlidersHorizontal size={14} className="mr-2"/>
              Filter
            </Button>
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
