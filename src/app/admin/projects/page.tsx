import { projects, technicians } from "@/lib/data";
import { ProjectsTabs } from "./components/projects-tabs";
import { Button } from "@/components/ui/button";
import { FolderKanban, Plus, Search, SlidersHorizontal } from "lucide-react";

export default function ProjectsPage() {
  const allProjects = projects;
  const allTechnicians = technicians;

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
              <input className="search-input !w-[220px]" placeholder="Search project folders..." />
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

      <ProjectsTabs projects={allProjects} technicians={allTechnicians} />
    </div>
  );
}
