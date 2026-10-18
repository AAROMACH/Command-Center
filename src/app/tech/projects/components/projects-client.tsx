'use client';

import { useRouter } from 'next/navigation';
import type { Project, Technician } from '@/lib/types';
import { Briefcase } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { statusLabel } from '@/lib/status-styles';
import { MapPin, Calendar, Timer, User } from 'lucide-react';
import { cn, formatCityState } from '@/lib/utils';

type ProjectsClientProps = {
    projects: Project[];
    technicians: Technician[];
    viewMode?: 'grid' | 'list';
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

export function ProjectsClient({ projects, technicians, viewMode = 'grid', filtered = false }: ProjectsClientProps & { filtered?: boolean }) {
    const router = useRouter();

    if (projects.length === 0) {
        return (
            <EmptyState
                icon={Briefcase}
                title={filtered ? 'No projects match your search' : 'No projects here'}
                description={filtered ? 'Try a different name, client or location.' : 'Projects you are added to show up here.'}
            />
        );
    }

    if (viewMode === 'list') {
        return (
            <div className="table-wrap">
                <table className="tbl">
                    <thead>
                        <tr className="bg-bg-tertiary">
                            <th className="text-left pl-0">Project</th>
                            <th className="text-left pl-0">Client</th>
                            <th className="text-center">Progress</th>
                            <th className="text-left pl-0">Start date</th>
                            <th className="text-left pl-0">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {projects.map(project => {
                            const progress = getProgress(project);
                            const progressColor = progress === 100 ? 'text-text-green' : progress > 5 ? 'text-accent-gold' : 'text-brand-red';
                            return (
                                <tr key={project.id} onClick={() => router.push(`/tech/projects/${project.id}`)} className="cursor-pointer hover:bg-bg-tertiary/50 transition-colors border-b border-border-sub">
                                    <td className="pl-0 py-3">
                                        <p className="text-[13px] font-semibold text-text-primary truncate">{project.name}</p>
                                        {project.location && <p className="text-[12px] text-text-muted truncate mt-0.5">{project.location}</p>}
                                    </td>
                                    <td className="pl-0">
                                        <p className="text-[12px] text-text-secondary truncate">{project.client}</p>
                                    </td>
                                    <td className="text-center">
                                        <p className={cn('text-[12px] font-mono font-semibold', progressColor)}>{Math.round(progress)}%</p>
                                    </td>
                                    <td className="pl-0">
                                        <p className="text-[12px] font-mono text-text-muted">{project.startDate || '—'}</p>
                                    </td>
                                    <td className="pl-0">
                                        <StatusBadge kind="job" value={project.status === 'active' ? 'in-progress' : project.status === 'on-hold' ? 'cancelled' : project.status} label={statusLabel(project.status)} />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
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
                        className="group flex flex-col cursor-pointer rounded-xl border border-border-main bg-bg-secondary shadow-sm hover:border-brand-red transition-all duration-200 overflow-hidden"
                    >
                        {/* Card body */}
                        <div className="flex flex-col flex-1 p-4 gap-3">
                            {/* Top row: status + lead */}
                            <div className="flex items-start justify-between gap-2">
                                <StatusBadge kind="job" value={project.status === 'active' ? 'in-progress' : project.status === 'on-hold' ? 'cancelled' : project.status} label={statusLabel(project.status)} className="shrink-0" />
                                <div className="flex items-center gap-1 text-[12px] text-text-muted">
                                    <User className="h-3 w-3 shrink-0" />
                                    <span className="truncate max-w-[160px]">Lead: {lead ? lead.name : 'Unassigned'}</span>
                                </div>
                            </div>

                            {/* Project name + client */}
                            <div>
                                <p className="text-[14px] font-semibold text-text-primary leading-tight group-hover:text-brand-red transition-colors">
                                    {project.name}
                                </p>
                                <p className="text-[12px] text-text-muted mt-0.5">{project.client}</p>
                            </div>

                            {/* Location */}
                            {project.location && (
                                <div className="flex items-center gap-1.5 text-[12px] text-text-secondary">
                                    <MapPin size={11} className="text-brand-red shrink-0" />
                                    <span className="truncate">{formatCityState(project.location)}</span>
                                </div>
                            )}

                            {/* Dates */}
                            <div className="flex items-center gap-4">
                                {project.startDate && (
                                    <div className="flex items-center gap-1.5 text-[12px] text-text-secondary font-mono">
                                        <Calendar size={10} className="text-text-muted shrink-0" />
                                        <span>{project.startDate}</span>
                                    </div>
                                )}
                                {project.estimatedDuration && (
                                    <div className="flex items-center gap-1.5 text-[12px] text-text-muted">
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
                                <span className={cn('text-[11px] font-mono font-bold shrink-0', `text-${progressColor}`)}>
                                    {Math.round(progress)}%
                                </span>
                            </div>
                            <p className="text-[12px] text-text-muted mt-1">
                                {completedTasks} of {totalTasks} tasks done
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
