import { projects, technicians, projectDocuments, timesheetLogs } from '@/lib/data';
import { notFound } from 'next/navigation';
import { ProjectDetailClient } from './components/project-detail-client';

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const project = projects.find(p => p.id === params.id);
  
  if (!project) {
    notFound();
  }

  // A real app would filter these by project ID
  const documentsForProject = projectDocuments;
  const timesheetsForProject = timesheetLogs.filter(log => log.projectId === params.id);

  return (
    <ProjectDetailClient 
        project={project}
        technicians={technicians}
        documents={documentsForProject}
        timesheets={timesheetsForProject}
    />
  );
}
