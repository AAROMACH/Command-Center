'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Project, Technician } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { MapPin, Calendar, Clock, User, ChevronLeft, ChevronRight } from 'lucide-react';
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
import { cn } from '@/lib/utils';

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

export function ProjectsClient({ projects, technicians }: { projects: Project[], technicians: Technician[] }) {
    const router = useRouter();
    
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    useEffect(() => {
        setCurrentPage(1);
    }, [projects.length, itemsPerPage]);

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
          else { d = parseISO(dateStr); }
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

    return (
        <div className="table-wrap">
            <table className="tbl">
                <thead>
                    <tr>
                        <th className="text-center w-[120px]">Status & ID</th>
                        <th className="text-left pl-0">Project Intelligence</th>
                        <th className="text-center">Project Lead</th>
                        <th className="text-left">Site Coordinates</th>
                        <th className="text-left">Schedule Date</th>
                        <th style={{ width: "220px" }} className="text-center">Operational Progress</th>
                    </tr>
                </thead>
                <tbody>
                    {paginatedProjects.map((project) => {
                        const progress = getProgress(project);
                        const progressColor = progress === 100 ? 'green' : progress > 5 ? 'gold' : 'red';
                        const completedTasks = getCompletedTasksCount(project);
                        const totalTasks = getTotalTasksCount(project);
                        const leadMember = project.team.find(m => m.role === 'Project Lead');
                        const lead = leadMember ? technicians.find(t => t.id === leadMember.technicianId) : null;

                        return (
                            <tr key={project.id} onClick={() => router.push(`/admin/projects/${project.id}`)} className="cursor-pointer group">
                                <td>
                                    <div className="flex flex-col items-center justify-center gap-1.5">
                                        <Badge variant={project.status} className="capitalize text-[8px] h-4 px-1.5">{project.status}</Badge>
                                        <div className="cell-id !text-[10px] font-mono !text-center">{project.id.toUpperCase()}</div>
                                    </div>
                                </td>
                                <td className="!py-4 text-left pl-0">
                                    <div className="flex flex-col min-w-0">
                                      <div className="text-xs font-bold text-text-primary uppercase tracking-wide leading-tight group-hover:text-brand-red transition-colors">{project.name}</div>
                                      <div className="text-[10px] font-bold text-text-muted uppercase tracking-widest mt-1.5">{project.client}</div>
                                    </div>
                                </td>
                                <td>
                                    <div className="flex flex-col items-center justify-center">
                                        {lead ? (
                                            <div className="flex items-center gap-2">
                                                <Avatar className="h-7 w-7 border border-border-sub">
                                                    <AvatarImage src={lead.avatarUrl} />
                                                    <AvatarFallback>{lead.name.charAt(0)}</AvatarFallback>
                                                </Avatar>
                                                <span className="text-[10px] font-bold text-text-primary uppercase truncate max-w-[100px]">{lead.name}</span>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] text-text-muted italic uppercase font-bold tracking-widest">Unallocated</span>
                                        )}
                                    </div>
                                </td>
                                <td>
                                    <div className="flex items-center justify-start gap-2 text-[10px] text-text-secondary font-bold uppercase">
                                        <MapPin className="h-3.5 w-3.5 text-brand-red shrink-0" />
                                        <span>{project.location}</span>
                                    </div>
                                </td>
                                <td>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2 text-[10px] text-text-secondary font-mono">
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
                                <td>
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
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Show</p>
                    <Select value={itemsPerPage.toString()} onValueChange={(v) => setItemsPerPage(parseInt(v))}>
                      <SelectTrigger className="h-7 w-[70px] bg-bg-primary text-[10px] font-bold border-border-sub">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
