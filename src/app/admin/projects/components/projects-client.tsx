
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Project, Technician } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { MapPin, Calendar, Clock, Timer, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    // Reset pagination when list length changes
    useEffect(() => {
        setCurrentPage(1);
    }, [projects.length, itemsPerPage]);

    const totalPages = Math.ceil(projects.length / itemsPerPage);
    const paginatedProjects = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return projects.slice(start, start + itemsPerPage);
    }, [projects, currentPage, itemsPerPage]);

    const formatDateDisplay = (dateStr: string) => {
        try {
          return format(parseISO(dateStr), "MM-dd-yyyy");
        } catch (e) {
          return dateStr;
        }
    };
    
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
                        <th>Project ID / Status</th>
                        <th>Title & Client</th>
                        <th>Site Location</th>
                        <th>Scheduled Date</th>
                        <th style={{ width: "25%" }}>Progress</th>
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
                            <tr key={project.id} onClick={() => router.push(`/admin/projects/${project.id}`)} className="cursor-pointer">
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
                                            <span>{formatDateDisplay(project.startDate)}</span>
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

            {/* REGISTRY PAGINATION CONTROLS */}
            {projects.length > 0 && (
              <div className="bg-bg-tertiary/50 px-4 py-3 flex items-center justify-between border-t border-border-sub">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
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
