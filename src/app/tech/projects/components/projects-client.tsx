'use client';

import { useRouter } from 'next/navigation';
import type { Project, Technician } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { MapPin, Calendar, Clock, Timer, User } from 'lucide-react';
import { cn, formatCityState } from '@/lib/utils';

type ProjectsClientProps = {
    projects: Project[];
    technicians: Technician[];
};

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
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => {
                const progress = getProgress(project);
                const progressColor = progress === 100 ? 'green' : progress > 5 ? 'gold' : 'red';
                const completedTasks = getCompletedTasksCount(project);
                const totalTasks = getTotalTasksCount(project);
                const team = project.team || [];
                const leadMember = team.find(m => m.role === 'Project Lead');
                const lead = leadMember ? technicians.find(t => t.id === leadMember.techId) : null;

                return (
                    <div
                        key={project.id}
                        onClick={() => router.push(`/tech/projects/${project.id}`)}
                        className="group flex flex-col cursor-pointer rounded-xl border border-border-sub bg-bg-secondary hover:border-brand-red transition-all duration-200 overflow-hidden"
                    >
                        {/* Card body */}
                        <div className="flex flex-col flex-1 p-4 gap-3">
                            {/* Top row: status + lead */}
                            <div className="flex items-start justify-between gap-2">
                                <Badge variant={project.status} className="capitalize text-[8px] h-4 px-1.5 tracking-widest shrink-0">
                                    {project.status}
                                </Badge>
                                <div className="flex items-center gap-1 text-[9px] text-text-muted font-bold uppercase tracking-widest">
                                    <User className="h-3 w-3 shrink-0" />
                                    <span className="truncate max-w-[100px]">{lead ? lead.name : 'Unassigned'}</span>
                                </div>
                            </div>

                            {/* Project name + client */}
                            <div>
                                <p className="text-[13px] font-bold text-text-primary uppercase tracking-wide leading-tight group-hover:text-brand-red transition-colors">
                                    {project.name}
                                </p>
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mt-0.5">{project.client}</p>
                            </div>

                            {/* Location */}
                            {project.location && (
                                <div className="flex items-center gap-1.5 text-[10px] text-text-secondary font-bold uppercase">
                                    <MapPin size={11} className="text-brand-red shrink-0" />
                                    <span className="truncate">{formatCityState(project.location)}</span>
                                </div>
                            )}

                            {/* Dates */}
                            <div className="flex items-center gap-4">
                                {project.startDate && (
                                    <div className="flex items-center gap-1.5 text-[9px] text-text-secondary font-mono">
                                        <Calendar size={10} className="text-text-muted shrink-0" />
                                        <span>{project.startDate}</span>
                                    </div>
                                )}
                                {project.estimatedDuration && (
                                    <div className="flex items-center gap-1.5 text-[9px] text-text-muted font-bold uppercase">
                                        <Timer size={10} className="text-accent-gold shrink-0" />
                                        <span>{project.estimatedDuration}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Progress bar at bottom */}
                        <div className="border-t border-border-sub px-4 py-3 mt-auto bg-bg-primary/40">
                            <div className="flex items-center gap-2">
                                <div className="progress-track flex-1 !h-[5px]">
                                    <div
                                        className={cn('progress-fill flashy', progressColor)}
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                                <span className={cn('text-[9px] font-mono font-bold shrink-0', `text-${progressColor}`)}>
                                    {Math.round(progress)}%
                                </span>
                            </div>
                            <p className="text-[8px] font-bold text-text-muted uppercase tracking-widest mt-1">
                                {completedTasks} / {totalTasks} targets
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
