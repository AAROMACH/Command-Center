"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProjectsClient } from "./projects-client";
import type { Project, Technician } from "@/lib/types";

type ProjectsTabsProps = {
    projects: Project[];
    technicians: Technician[];
};

export function ProjectsTabs({ projects, technicians }: ProjectsTabsProps) {
    const activeProjects = projects.filter(p => p.status === 'active');
    const onHoldProjects = projects.filter(p => p.status === 'on-hold');
    const completedProjects = projects.filter(p => p.status === 'completed');

    return (
        <Tabs defaultValue="active" className="w-full">
            <TabsList className="tabs !mb-4">
              <TabsTrigger value="active" className="tab">
                Active Projects <span className="tab-count">({activeProjects.length})</span>
              </TabsTrigger>
              <TabsTrigger value="on-hold" className="tab">
                On Hold <span className="tab-count">({onHoldProjects.length})</span>
              </TabsTrigger>
              <TabsTrigger value="completed" className="tab">
                Completed <span className="tab-count">({completedProjects.length})</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="active" className="mt-0">
              <ProjectsClient projects={activeProjects} technicians={technicians} />
            </TabsContent>
            <TabsContent value="on-hold" className="mt-0">
              <ProjectsClient projects={onHoldProjects} technicians={technicians} />
            </TabsContent>
            <TabsContent value="completed" className="mt-0">
              <ProjectsClient projects={completedProjects} technicians={technicians} />
            </TabsContent>
      </Tabs>
    );
}
