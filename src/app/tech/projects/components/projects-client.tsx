'use client';

import { useRouter } from 'next/navigation';
import type { Project, Technician } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { MapPin, Calendar, Clock, Timer, User } from 'lucide-react';

type ProjectsClientProps = {
    projects: Project[];
    technicians: Technician[];
};

function getProgress(project: Project): number {
    const allTasks = project.phases.flatMap(phase => phase.tasks);
    if (allTasks.length === 0) return 0;
    const completedTasks = allTasks.filter(task => task.isCompleted).length;
    return (completedTasks / allTasks.length) * 100;
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
                    You are not assigned to any active projects.
                </div>
            </div>
        )
    }

    return (
        <div className="table-wrap">
            <table className="tbl">
                <thead>
                    <tr>
                        <th>Project ID / Status</th>
                        <th>Title & Client</th>
                        <th>Site Location</th>
                        <th>Scheduled Date</th>
                        <th style={{ width: "25%" }}>Progress</th>
                    </tr>
                </thead>
                <tbody>
                    {projects.map((project) => {
                        const progress = getProgress(project);
                        const progressColor = progress === 100 ? 'green' : progress > 5 ? 'gold' : 'red';
                        const completedTasks = getCompletedTasksCount(project);
                        const totalTasks = getTotalTasksCount(project);
                        const leadMember = project.team.find(m => m.role === 'Project Lead');
                        const lead = leadMember ? technicians.find(t => t.id === leadMember.technicianId) : null;

                        return (
                            <tr key={project.id} onClick={() => router.push(`/tech/projects/${project.id}`)} className="cursor-pointer">
                                <td>
                                    <div className="cell-id">{project.id.toUpperCase()}</div>
                                    <Badge variant={project.status} className="capitalize">{project.status}</Badge>
                                </td>
                                <td>
                                    <div className="cell-desc-title !normal-case">{project.name}</div>
                                    <div className="font-semibold text-text-primary text-sm">{project.client}</div>
                                     {lead && (
                                        <div className="flex items-center gap-1.5 text-xs text-text-muted mt-2">
                                            <User className="h-3.5 w-3.5" />
                                            <span>Lead: {lead.name}</span>
                                        </div>
                                    )}
                                </td>
                                <td>
                                    <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                                        <MapPin className="h-3.5 w-3.5 text-text-muted" />
                                        <span>{project.location}</span>
                                    </div>
                                </td>
                                <td>
                                    <div className="cell-sched">
                                        <div className="cell-sched-date">
                                            <Calendar />
                                            <span>{project.startDate}</span>
                                        </div>
                                        {project.startTime && (
                                            <div className="cell-sched-time">
                                                <Clock />
                                                <span>{project.startTime}</span>
                                            </div>
                                        )}
                                        <div className="cell-sched-time">
                                            <Timer />
                                            <span>{project.estimatedDuration}</span>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div className="progress-wrap">
                                        <div className="progress-track"><div className={`progress-fill ${progressColor}`} style={{ width: `${progress}%` }}></div></div>
                                        <div className={`progress-pct !text-${progressColor}`}>{Math.round(progress)}%</div>
                                    </div>
                                    <div className="text-xs text-text-muted mt-1">{completedTasks} of {totalTasks} tasks complete</div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
