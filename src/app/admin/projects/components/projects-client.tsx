'use client';

import { useRouter } from 'next/navigation';
import type { Project, Technician } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { MapPin, Calendar, Clock, ChevronLeft, ChevronRight, User, Briefcase, Building2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useMemo, useState, useEffect } from 'react';

type SortOption = 'name' | 'date' | 'progress' | 'client';

type ProjectsClientProps = {
    projects: Project[];
    technicians: Technician[];
    sortBy?: SortOption;
};

/**
 * @fileOverview Defensive calculation engine for Project Progress.
 * Hardened against undefined phases and tasks.
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

export function ProjectsClient({ projects, technicians, sortBy }: ProjectsClientProps) {
    const router = useRouter();
    
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    useEffect(() => {
        setCurrentPage(1);
    }, [projects.length, itemsPerPage, sortBy]);

    const groupedByClient = useMemo(() => {
        if (sortBy !== 'client') return null;
        const uniqueClientNames = Array.from(new Set(projects.map(p => p.client)));
        const registeredClients = technicians.filter(t => t.roles?.includes('client') || t.clientCompany);
        
        const regGroups = registeredClients
            .map(client => {
                const clientName = client.clientCompany || client.name;
                const clientProjects = projects.filter(p => p.client === clientName);
                if (clientProjects.length === 0) return null;
                return { client, projects: clientProjects, isRegistered: true };
            })
            .filter((group): group is { client: any; projects: Project[]; isRegistered: boolean } => group !== null);

        const unregNames = uniqueClientNames.filter(name => 
            !registeredClients.some(c => (c.clientCompany || c.name) === name)
        );

        const unregGroups = unregNames.map(name => ({
            client: { name, avatarUrl: '', businessType: 'Unregistered Entity' },
            projects: projects.filter(p => p.client === name),
            isRegistered: false
        }));

        return [...regGroups, ...unregGroups];
    }, [projects, sortBy, technicians]);

    const totalPages = Math.ceil(projects.length / itemsPerPage);
    const paginatedProjects = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return projects.slice(start, start + itemsPerPage);
    }, [projects, currentPage, itemsPerPage]);

    const formatDateDisplay = (dateStr: string) => {
        if (!dateStr) return 'TBD';
        try {
          const parts = dateStr.split(/[-/]/);
          let d;
          if (parts[0].length === 4) { d = new Date(dateStr); } 
          else { 
            const [m, day, y] = parts;
            d = new Date(`${y}-${m}-${day}T12:00:00`);
          }
          return format(d, 'MM-dd-yyyy');
        } catch (e) {
          return dateStr;
        }
    };
    
    if (projects.length === 0) {
        return (
            <div className="table-wrap">
                <div className="empty-state !py-12 text-center text-text-muted italic uppercase text-[10px] font-bold tracking-widest">
                    No projects found in this category.
                </div>
            </div>
        )
    }

    if (sortBy === 'client' && groupedByClient) {
        return (
            <div className="grid grid-cols-1 gap-8">
                {groupedByClient.map((group, idx) => (
                    <div key={group.client.name + idx} className="space-y-4">
                        <div className="flex items-center justify-start gap-3 border-b border-border-sub pb-2 px-1">
                            <div className="relative text-left">
                                <Avatar className="h-10 w-10 border border-border-sub">
                                    <AvatarImage src={group.client.avatarUrl} /><AvatarFallback><Building2 size={16} /></AvatarFallback>
                                </Avatar>
                                <div className="absolute -bottom-1 -right-1 bg-brand-red rounded-full p-1 border-2 border-bg-primary">
                                    <Briefcase size={8} className="text-white" />
                                </div>
                            </div>
                            <div className="text-left">
                                <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide">{group.client.name}</h3>
                                <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest">
                                    {group.client.businessType || 'Strategic Partner'} • {group.projects.length} Active Projects
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {group.projects.map(project => (
                                <ProjectCard key={project.id} project={project} technicians={technicians} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="table-wrap">
            <table className="tbl">
                <thead>
                    <tr className="bg-bg-tertiary">
                        <th className="text-center w-[160px] pl-0">Status & ID</th>
                        <th className="text-left pl-0">Project Identification</th>
                        <th className="text-center">Project Lead</th>
                        <th className="text-left pl-0">Site Coordinates</th>
                        <th className="text-left pl-0">Schedule Date</th>
                        <th style={{ width: "220px" }} className="text-center">Operational Progress</th>
                    </tr>
                </thead>
                <tbody>
                    {paginatedProjects.map((project) => {
                        const progress = getProgress(project);
                        const progressColor = progress === 100 ? 'green' : progress > 5 ? 'gold' : 'red';
                        const completedTasks = getCompletedTasksCount(project);
                        const totalTasks = getTotalTasksCount(project);
                        const team = project.team || [];
                        const leadMember = team.find(m => m.role === 'Project Lead');
                        const lead = leadMember ? technicians.find(t => t.id === leadMember.technicianId) : null;

                        return (
                            <tr key={project.id} onClick={() => router.push(`/admin/projects/${project.id}`)} className="cursor-pointer group">
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
                                    </div>
                                </td>
                                <td className="py-4">
                                    <div className="flex flex-col items-center justify-center">
                                        {lead ? (
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-8 w-8 border border-border-sub shadow-sm">
                                                    <AvatarImage src={lead.avatarUrl} />
                                                    <AvatarFallback className="text-[10px]">{lead.name ? lead.name.charAt(0) : 'U'}</AvatarFallback>
                                                </Avatar>
                                                <span className="text-[10px] font-bold text-text-primary uppercase">{lead.name}</span>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] text-text-muted italic uppercase font-bold tracking-widest">Unallocated</span>
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
                                            <Calendar size={13} className="text-text-muted shrink-0" />
                                            <span>{formatDateDisplay(project.startDate)}</span>
                                        </div>
                                        {project.startTime && (
                                            <div className="flex items-center gap-2 text-[10px] text-text-secondary font-mono">
                                                <Clock size={13} className="text-text-muted shrink-0" />
                                                <span>{project.startTime}</span>
                                            </div>
                                        )}
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

            {projects.length > 0 && (
              <div className="bg-bg-tertiary/50 px-4 py-3 flex items-center justify-between border-t border-border-sub">
                <div className="flex items-center gap-4">
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    Showing <span className="text-text-primary">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-text-primary">{Math.min(currentPage * itemsPerPage, projects.length)}</span> of <span className="text-text-primary">{projects.length}</span> entries
                  </p>
                </div>
                
                <div className="flex items-center gap-1">
                  <Button 
                    variant="outline" 
                    size="icon-sm" 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="h-7 w-7 border-border-sub bg-bg-primary"
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  <div className="flex items-center gap-1 px-2">
                    <span className="text-[10px] font-bold text-text-primary">Page {currentPage}</span>
                    <span className="text-[10px] font-bold text-text-muted">of {totalPages}</span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="icon-sm" 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="h-7 w-7 border-border-sub bg-bg-primary"
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
        </div>
    );
}

function ProjectCard({ project, technicians }: { project: Project; technicians: Technician[] }) {
    const router = useRouter();
    const progress = getProgress(project);
    const progressColor = progress === 100 ? 'green' : progress > 5 ? 'gold' : 'red';
    
    const team = project.team || [];
    const leadMember = team.find(m => m.role === 'Project Lead');
    const lead = leadMember ? technicians.find(t => t.id === leadMember.technicianId) : null;

    const formatDateDisplay = (dateStr: string) => {
        if (!dateStr) return 'TBD';
        try {
          const parts = dateStr.split(/[-/]/);
          let d;
          if (parts[0].length === 4) { d = new Date(dateStr); } 
          else { 
            const [m, day, y] = parts;
            d = new Date(`${y}-${m}-${day}T12:00:00`);
          }
          return format(d, 'MM-dd-yyyy');
        } catch (e) {
          return dateStr;
        }
    };

    return (
        <Card 
            className="bg-bg-secondary border-border-main hover:border-text-muted transition-all cursor-pointer shadow-sm group"
            onClick={() => router.push(`/admin/projects/${project.id}`)}
        >
            <CardContent className="p-4 space-y-4">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center">
                            <span className="font-mono text-[10px] text-brand-red font-bold">{(project.id || '').toUpperCase()}</span>
                            <Badge variant={project.status} className="h-4 uppercase text-[7px] tracking-widest mt-1">
                                {project.status}
                            </Badge>
                        </div>
                        <div className="flex flex-col min-w-0 text-left">
                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide leading-tight group-hover:text-brand-red transition-colors whitespace-normal">{project.name}</p>
                            <p className="text-[9px] text-text-muted uppercase font-bold tracking-tight mt-0.5">{project.client}</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="progress-wrap w-full">
                        <div className="progress-track !h-[4px]"><div className={cn("progress-fill flashy", progressColor)} style={{ width: `${progress}%` }}></div></div>
                        <div className={cn("progress-pct font-mono font-bold ml-2", `text-${progressColor}`)}>{Math.round(progress)}%</div>
                    </div>
                    
                    <div className="pt-2 border-t border-border-sub space-y-2 flex flex-col items-start">
                        <div className="flex items-center gap-2 text-[10px] text-text-secondary uppercase font-bold tracking-tight">
                            <Calendar size={12} className="text-brand-red" />
                            Start: {formatDateDisplay(project.startDate)}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-text-secondary uppercase font-bold tracking-tight text-left">
                            <MapPin size={12} className="text-brand-red shrink-0" />
                            <span className="whitespace-normal">{project.location}</span>
                        </div>
                        
                        {lead && (
                            <div className="flex items-center gap-2 pt-1">
                                <Avatar className="h-5 w-5 border border-border-sub">
                                    <AvatarImage src={lead.avatarUrl} />
                                    <AvatarFallback className="text-[7px]">{lead.name ? lead.name.charAt(0) : 'U'}</AvatarFallback>
                                </Avatar>
                                <span className="text-[9px] font-bold text-text-primary uppercase">Lead: {lead.name}</span>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
