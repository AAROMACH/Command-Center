import { projects, projectDailyLogs, technicians } from '@/lib/data';
import { notFound } from 'next/navigation';
import { ProjectDetailClient } from './components/project-detail-client';

export default async function TechProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = projects.find(p => p.id === id);
  
  if (!project) {
    notFound();
  }

  const dailyLogs = projectDailyLogs.filter(log => log.projectId === id);

  return (
    <ProjectDetailClient 
        project={project}
        dailyLogs={dailyLogs}
        technicians={technicians}
    />
  );
}
