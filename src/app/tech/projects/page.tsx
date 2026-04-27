import { projects, technicians } from '@/lib/data';
import { Briefcase } from 'lucide-react';
import { ProjectsClient } from './components/projects-client';

const CURRENT_TECH_ID = 'tech-001';

export default function TechProjectsPage() {
  const techProjects = projects.filter(p => 
    p.assignedTechnicianIds.includes(CURRENT_TECH_ID)
  );

  return (
    <div>
      <header className="page-header">
        <div>
          <p className="page-eyebrow flex items-center gap-2">
            <Briefcase size={12} />
            My Deployments
          </p>
          <h1 className="page-title">My Projects</h1>
          <p className="page-subtitle">Manage your large-scale, multi-day deployments.</p>
        </div>
      </header>
      <ProjectsClient projects={techProjects} technicians={technicians} />
    </div>
  );
}
