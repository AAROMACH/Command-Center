
'use client';

import { useRouter } from 'next/navigation';
import type { Project, Technician } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { MapPin, Calendar, Clock, Timer, User } from 'lucide-react';
import { cn } from '@/lib/utils';

type ProjectsClientProps = {
    projects: Project[];
    technicians: Technician[];
};

/**
 * @fileOverview Defensive progress engine for field operatives.
 */
function getProgress(project: Project): number {
    const phases = project.phases || [];
    if (phases.length === 0) return 0;

    const allTasks = phases.flatMap(phase => phase.tasks || []);
    if (allTasks.length === 0) return 0;
    
    const completedTasks = allTasks.filter(task => task && task.isCompleted).length;
    return (completedTasks / allTasks.length) * 100;
}

function getCompletedTasksCount(project: Project): number {
    const phases = project.phases || [];
    return phases.reduce((acc, phase) => acc + (phase.tasks || []).filter(t => t && t.isCompleted).length, 0);
}

function getTotalTasksCount(project: Project): number {
    const phases = project.phases || [];
    return phases.reduce((acc, phase) => acc + (phase.tasks || []).length, 0);
}

export function ProjectsClient({ projects, technicians }: ProjectsClientProps) {
    const router = useRouter();
    
    if (projects.length === 0) {
        return (
            <div className="table-wrap">
                <div className="empty-state !py-12 text-center text-text-muted italic uppercase text-[10px] font-bold tracking-widest">
                    You are not assigned to any active projects.
                </div>
            </div>
        )
    }

    return (
        <div className="table-wrap">
            <table className="tbl">
                <thead>
                    <tr className="bg-bg-tertiary">
                        <th className="text-center w-[160px] pl-0">Project ID / Status</th>
                        <th className="text-left pl-0">Title & Client</th>
                        <th className="text-left pl-0">Site Location</th>
                        <th className="text-left pl-0">Scheduled Date</th>
                        <th style={{ width: "25%" }} className="text-center">Progress</th>
                    </tr>
                </thead>
                <tbody>
                    {projects.map((project) => {
                        const progress = getProgress(project);
                        const progressColor = progress === 100 ? 'green' : progress > 5 ? 'gold' : 'red';
                        const completedTasks = getCompletedTasksCount(project);
                        const totalTasks = getTotalTasksCount(project);
                        const team = project.team || [];
                        const leadMember = team.find(m => m.role === 'Project Lead');
                        const lead = leadMember ? technicians.find(t => t.id === leadMember.technicianId) : null;

                        return (
                            <tr key={project.id} onClick={() => router.push(`/tech/projects/${project.id}`)} className="cursor-pointer group">
                                <td className="pl-0 py-4">
                                    <div className="flex flex-col items-center justify-center gap-1.5">
                                        <div className="cell-id !text-[10px] font-mono font-bold !mt-0 !text-center">{(project.id || '').toUpperCase()}</div>
                                        <Badge variant={project.status} className="capitalize text-[8px] h-4 px-1.5 tracking-widest">{project.status}</Badge>
                                    </div>
                                </td>
                                <td className="!py-4 text-left pl-0">
                                    <div className="flex flex-col min-w-0">
                                      <div className="text-xs font-bold text-text-primary uppercase tracking-wide leading-tight group-hover:text-brand-red transition-colors whitespace-normal">{project.name}</div>
                                      <div className="text-[10px] font-bold text-text-muted uppercase tracking-widest mt-1">{project.client}</div>
                                      {lead && (
                                          <div className="flex items-center gap-1.5 text-[9px] text-text-muted mt-2 uppercase font-bold">
                                              <User className="h-3 w-3" />
                                              <span>Lead: {lead.name}</span>
                                          </div>
                                      )}
                                    </div>
                                </td>
                                <td className="py-4 pl-0">
                                    <div className="flex items-center justify-start gap-2 text-[10px] text-text-secondary font-bold uppercase">
                                        <MapPin size={11} className="text-brand-red shrink-0" />
                                        <span className="whitespace-normal text-left">{project.location}</span>
                                    </div>
                                </td>
                                <td className="py-4 pl-0">
                                    <div className="flex flex-col items-start justify-center gap-1.5">
                                        <div className="flex items-center gap-2 text-[10px] text-text-secondary font-mono font-bold">
                                            <Calendar size={12} className="text-text-muted shrink-0" />
                                            <span>{project.startDate}</span>
                                        </div>
                                        {project.startTime && (
                                            <div className="flex items-center gap-2 text-[10px] text-text-secondary font-mono">
                                                <Clock size={12} className="text-text-muted shrink-0" />
                                                <span>{project.startTime}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 text-[9px] text-text-muted font-bold uppercase tracking-tighter">
                                            <Timer size={11} className="text-accent-gold shrink-0" />
                                            <span>Est: {project.estimatedDuration}</span>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-4">
                                    <div className="flex flex-col items-center justify-center px-4">
                                        <div className="progress-wrap w-full">
                                            <div className="progress-track !h-[6px]"><div className={cn("progress-fill flashy", progressColor)} style={{ width: `${progress}%` }}></div></div>
                                            <div className={cn("progress-pct font-mono font-bold ml-2", `text-${progressColor}`)}>{Math.round(progress)}%</div>
                                        </div>
                                        <div className="text-[9px] font-bold text-text-muted uppercase tracking-widest mt-2">{completedTasks} / {totalTasks} TARGETS</div>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
