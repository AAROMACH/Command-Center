import { projects } from "@/lib/data";
import { ProjectsClient } from "./components/projects-client";
import { Button } from "@/components/ui/button";
import { FolderKanban, Plus, Search, SlidersHorizontal } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function ProjectsPage() {
  const activeProjects = projects.filter(p => p.status === 'active');
  const onHoldProjects = projects.filter(p => p.status === 'on-hold');
  const completedProjects = projects.filter(p => p.status === 'completed');

  return (
    <div>
      <header className="page-header">
        <div>
          <p className="page-eyebrow flex items-center gap-2">
            <FolderKanban size={12} />
            Strategic Deployments
          </p>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">Large-scale multi-tech deployments with phase and milestone management.</p>
        </div>
        <div className="page-header-right items-center">
            <div className="search-wrap">
              <Search />
              <input className="search-input !w-[220px]" placeholder="Search mission folders..." />
            </div>
            <Button variant="outline" size="sm">
              <SlidersHorizontal size={14} className="mr-2"/>
              Filter
            </Button>
            <Button variant="default" size="default">
                <Plus size={14} className="mr-2"/>
                New Project
            </Button>
        </div>
      </header>

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
          <ProjectsClient projects={activeProjects} />
        </TabsContent>
        <TabsContent value="on-hold" className="mt-0">
          <ProjectsClient projects={onHoldProjects} />
        </TabsContent>
        <TabsContent value="completed" className="mt-0">
          <ProjectsClient projects={completedProjects} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
