'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { Project, Technician } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Folder, MapPin, Layers } from 'lucide-react';

type ProjectsClientProps = {
    projects: Project[];
    technicians: Technician[];
};

function getProgress(project: Project): number {
    const totalTasks = project.phases.reduce((acc, phase) => acc + phase.tasks.length, 0);
    if (totalTasks === 0) return 0;
    const completedTasks = project.phases.reduce((acc, phase) => {
        return acc + phase.tasks.filter(task => task.isCompleted).length;
    }, 0);
    return (completedTasks / totalTasks) * 100;
}

function getCompletedTasksCount(project: Project): number {
    return project.phases.reduce((acc, phase) => acc + phase.tasks.filter(t => t.isCompleted).length, 0);
}

function getTotalTasksCount(project: Project): number {
    return project.phases.reduce((acc, phase) => acc + phase.tasks.length, 0);
}

export function ProjectsClient({ projects, technicians }: ProjectsClientProps) {
    const router = useRouter();
    
    if (projects.length === 0) {
        return (
            <div className="table-wrap">
                <div className="empty-state !py-12">
                    No projects found in this category.
                </div>
            </div>
        )
    }

    return (
        <div className="table-wrap">
            <table className="tbl">
                <thead>
                    <tr>
                        <th>Mission / Status</th>
                        <th>Client & Location</th>
                        <th style={{ width: "20%" }}>Progress</th>
                        <th style={{width: '15%'}}>Assigned Techs</th>
                        <th style={{ width: "10%" }}>Phases</th>
                        <th style={{ width: "10%" }}></th>
                    </tr>
                </thead>
                <tbody>
                    {projects.map((project) => {
                        const progress = getProgress(project);
                        const progressColor = progress === 100 ? 'green' : progress > 5 ? 'gold' : 'red';
                        const completedTasks = getCompletedTasksCount(project);
                        const totalTasks = getTotalTasksCount(project);

                        return (
                            <tr key={project.id}>
                                <td>
                                    <div className="cell-desc-title !normal-case">{project.name}</div>
                                    <Badge variant={project.status} className="capitalize">{project.status}</Badge>
                                </td>
                                <td>
                                    <div className="font-semibold text-text-primary text-sm mb-1">{project.client}</div>
                                    <div className="flex items-center gap-1.5 text-xs text-text-muted">
                                        <MapPin className="h-3 w-3" />
                                        <span>{project.location}</span>
                                    </div>
                                </td>
                                <td>
                                    <div className="progress-wrap">
                                        <div className="progress-track"><div className={`progress-fill ${progressColor}`} style={{ width: `${progress}%` }}></div></div>
                                        <div className={`progress-pct !text-${progressColor}`}>{Math.round(progress)}%</div>
                                    </div>
                                    <div className="text-xs text-text-muted mt-1">{completedTasks} of {totalTasks} tasks complete</div>
                                </td>
                                <td>
                                    <div className="tech-stack">
                                        {project.team.map(member => {
                                            const tech = technicians.find(t => t.id === member.technicianId);
                                            const fallback = tech ? tech.name.split(' ').map(n => n[0]).join('') : '?';
                                            return(
                                                <Avatar key={member.technicianId} className="tech-avatar" title={tech?.name}>
                                                    {tech && <AvatarImage asChild src={tech.avatarUrl} alt={tech.name}>
                                                        <Image src={tech.avatarUrl} alt={tech.name} width={26} height={26} />
                                                    </AvatarImage>}
                                                    <AvatarFallback>{fallback}</AvatarFallback>
                                                </Avatar>
                                            )
                                        })}
                                    </div>
                                </td>
                                <td>
                                     <div className="flex items-center gap-2 text-sm text-text-secondary">
                                        <Layers size={14} />
                                        <span>{project.phases.length}</span>
                                     </div>
                                     <div className="text-xs text-text-muted mt-1">Started {project.startDate}</div>
                                </td>
                                <td className="text-right">
                                    <Button variant="folder" size="sm" onClick={() => router.push(`/admin/projects/${project.id}`)}>
                                        <Folder size={12} className="mr-1.5" />
                                        Open Folder
                                    </Button>
                                </td>
                            </tr>
                        );
                    })}
                     <tr>
                      <td colSpan={6} className="text-center text-xs text-text-muted py-4">
                        + Add more projects with "New Project"
                      </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
