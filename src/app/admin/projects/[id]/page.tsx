import { projects, technicians, projectDocuments, timesheetLogs } from '@/lib/data';
import { notFound } from 'next/navigation';
import { ProjectDetailClient } from './components/project-detail-client';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = projects.find(p => p.id === id);
  
  if (!project) {
    notFound();
  }

  // A real app would filter these by project ID
  const documentsForProject = projectDocuments;
  const timesheetsForProject = timesheetLogs.filter(log => log.projectId === id);

  return (
    <ProjectDetailClient 
        project={project}
        technicians={technicians}
        documents={documentsForProject}
        timesheets={timesheetsForProject}
    />
  );
}
