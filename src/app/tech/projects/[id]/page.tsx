import { projects, projectDailyLogs, technicians } from '@/lib/data';
import { notFound } from 'next/navigation';
import { ProjectDetailClient } from './components/project-detail-client';

export default function TechProjectDetailPage({ params }: { params: { id: string } }) {
  const project = projects.find(p => p.id === params.id);
  
  if (!project) {
    notFound();
  }

  const dailyLogs = projectDailyLogs.filter(log => log.projectId === params.id);

  return (
    <ProjectDetailClient 
        project={project}
        dailyLogs={dailyLogs}
        technicians={technicians}
    />
  );
}
