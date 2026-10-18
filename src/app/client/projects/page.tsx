'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { useClientProjects } from '@/hooks/use-client-data';
import { useDirectory } from '@/hooks/use-directory';
import type { Project, ProjectDailyLog, Technician } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
    Briefcase, 
    Search,
    MapPin,
    Calendar,
    Clock,
    User,
    CheckCircle2,
    Circle,
    ScrollText,
    History,
    ShieldCheck
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { ViewToggle, useViewMode, type ViewMode } from '@/components/view-toggle';
import { PageHeader } from '@/components/page-header';
import { SearchField } from '@/components/search-field';
import { EmptyState } from '@/components/empty-state';

export default function ClientProjectsPage() {
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [allLogs, setAllLogs] = useState<ProjectDailyLog[]>([]);
    // Crew names/avatars from the public directory (clients can't read `users`).
    const technicians = useDirectory();
    const [mounted, setMounted] = useState(false);
    const [viewMode, setViewMode] = useViewMode('client-projects');
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        setMounted(true);
        const userId = sessionStorage.getItem('currentUserId');
        if (!userId) return;
        return onSnapshot(doc(db, 'users', userId), (d) => {
            if (d.exists()) setCurrentUser({ ...d.data(), id: d.id } as Technician);
        });
    }, []);

    const allProjects = useClientProjects(currentUser);

    // Daily logs per project — a client may read only their own projects'
    // logs, so an unfiltered collection read was rejected outright.
    const projectIdsKey = allProjects.map(p => p.id).sort().join(',');
    useEffect(() => {
        const ids = projectIdsKey ? projectIdsKey.split(',') : [];
        if (ids.length === 0) { setAllLogs([]); return; }
        const parts = new Map<string, ProjectDailyLog[]>();
        const unsubs = ids.map(pid => onSnapshot(
            query(collection(db, 'projectDailyLogs'), where('projectId', '==', pid)),
            snap => { parts.set(pid, snap.docs.map(d => ({ ...d.data(), id: d.id } as ProjectDailyLog))); setAllLogs([...parts.values()].flat()); },
            () => {},
        ));
        return () => unsubs.forEach(u => u());
    }, [projectIdsKey]);

    const filteredProjects = useMemo(() => {
        // Older projects may lack name/location — guard every field.
        const q = searchQuery.toLowerCase();
        return allProjects.filter(p => 
            (p.name || '').toLowerCase().includes(q) ||
            (p.id || '').toLowerCase().includes(q) ||
            (p.location || '').toLowerCase().includes(q)
        );
    }, [allProjects, searchQuery]);

    const activeProjects = filteredProjects.filter(p => p.status === 'active');
    const onHoldProjects = filteredProjects.filter(p => p.status === 'on-hold');
    const completedProjects = filteredProjects.filter(p => p.status === 'completed');

    const getProjectProgress = (project: Project) => {
        const totalTasks = project.phases?.reduce((acc, phase) => acc + (phase.tasks?.length || 0), 0) || 0;
        if (totalTasks === 0) return 0;
        const completedTasks = project.phases?.reduce((acc, phase) => {
            return acc + (phase.tasks?.filter(task => task.isCompleted).length || 0);
        }, 0) || 0;
        return Math.round((completedTasks / totalTasks) * 100);
    };

    const formatDateStr = (dateStr: string) => {
        if (!dateStr) return 'TBD';
        try {
            return dateStr.replace(/-/g, '/');
        } catch (e) {
            return dateStr;
        }
    };

    if (!mounted) return null;

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Client portal"
                icon={Briefcase}
                title="Projects"
                subtitle="Progress on your multi-day projects, phase by phase."
            />

            <div className="flex items-center justify-between gap-3">
                <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search by name, ID or location" className="sm:max-w-md" />
                <ViewToggle value={viewMode} onChange={setViewMode} />
            </div>

            <Tabs defaultValue="active" className="w-full">
                <TabsList className="tabs mb-4">
                    <TabsTrigger value="active" className="tab">
                        Active <span className="tab-count">({activeProjects.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="on-hold" className="tab">
                        On hold <span className="tab-count">({onHoldProjects.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="completed" className="tab">
                        Completed <span className="tab-count">({completedProjects.length})</span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="active" className="space-y-6 mt-0">
                    <ProjectsList projects={activeProjects} getProjectProgress={getProjectProgress} formatDateStr={formatDateStr} technicians={technicians} viewMode={viewMode} searching={!!searchQuery} />
                </TabsContent>
                <TabsContent value="on-hold" className="space-y-6 mt-0">
                    <ProjectsList projects={onHoldProjects} getProjectProgress={getProjectProgress} formatDateStr={formatDateStr} technicians={technicians} viewMode={viewMode} searching={!!searchQuery} />
                </TabsContent>
                <TabsContent value="completed" className="space-y-6 mt-0">
                    <ProjectsList projects={completedProjects} getProjectProgress={getProjectProgress} formatDateStr={formatDateStr} technicians={technicians} viewMode={viewMode} searching={!!searchQuery} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

function ProjectsList({ projects, getProjectProgress, formatDateStr, technicians, viewMode, searching }: { projects: Project[], getProjectProgress: (p: Project) => number, formatDateStr: (s: string) => string, technicians: Technician[], viewMode: ViewMode, searching: boolean }) {
    if (projects.length === 0) {
        return (
            <EmptyState icon={Briefcase} title={searching ? 'No projects match your search' : 'No projects here yet'} />
        );
    }

    if (viewMode === 'list') {
        return (
            <div className="space-y-1">
                {projects.map(project => {
                    const progress = getProjectProgress(project);
                    const phaseCount = project.phases?.length || 0;
                    return (
                        <div key={project.id} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border-sub bg-bg-secondary">
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-semibold text-text-primary truncate">{project.name}</p>
                                <p className="text-[11px] text-text-muted truncate">
                                    <span className="font-mono">{(project.id || '').toUpperCase()}</span>
                                    {project.location ? ` · ${project.location}` : ''} · {phaseCount} phase{phaseCount !== 1 ? 's' : ''}
                                </p>
                            </div>
                            <div className="hidden md:flex items-center gap-2 w-32 shrink-0">
                                <Progress value={progress} className="h-1.5 flex-1" />
                                <span className="text-[11px] font-mono text-text-muted w-8 text-right">{progress}%</span>
                            </div>
                            <Badge variant={project.status} className="shrink-0 text-[10px] uppercase tracking-wide">{project.status}</Badge>
                        </div>
                    );
                })}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {projects.map(project => {
                const progress = getProjectProgress(project);
                const leadMember = project.team?.find(m => m.role === 'Project Lead');
                const leadTech = leadMember ? technicians.find(t => t.id === leadMember.techId) : null;

                return (
                    <Card key={project.id} className="rounded-xl bg-bg-secondary border-border-main overflow-hidden shadow-sm text-left">
                        <CardHeader className="border-b border-border-sub pb-6 text-left">
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 text-left">
                                <div className="space-y-1 text-left">
                                    <div className="flex items-center gap-3 text-left">
                                        <span className="text-[11px] font-semibold text-text-muted font-mono">{(project.id || '').toUpperCase()}</span>
                                        <Badge variant={project.status} className="text-[10px] uppercase tracking-wide">
                                            {project.status}
                                        </Badge>
                                    </div>
                                    <CardTitle className="text-xl font-semibold text-text-primary text-left">{project.name}</CardTitle>
                                    <div className="flex flex-wrap items-center gap-4 text-[12px] text-text-muted text-left mt-2">
                                        <span className="flex items-center gap-1.5"><MapPin size={12}/> {project.location}</span>
                                        <span className="flex items-center gap-1.5"><Calendar size={12}/> Started {formatDateStr(project.startDate)}</span>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-3 w-full md:flex-1 md:max-w-[480px]">
                                    <div className="text-right">
                                        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">Complete</p>
                                        <p className="text-3xl font-bold tabular-nums text-text-primary">{progress}%</p>
                                    </div>
                                    <Progress value={progress} className="relative overflow-hidden rounded-full w-full h-2 bg-bg-tertiary" />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Accordion type="single" collapsible className="w-full">
                                <AccordionItem value="phases" className="border-none">
                                    <AccordionTrigger className="px-6 py-4 hover:bg-bg-tertiary transition-colors hover:no-underline border-b border-border-sub">
                                        <div className="flex items-center gap-2 text-[13px] font-medium text-text-secondary">
                                            <History size={14} className="text-text-muted"/> Phases and tasks
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="p-6 bg-bg-primary/30">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
                                            {(project.phases || []).map(phase => (
                                                <div key={phase.id} className="space-y-4 text-left">
                                                    <div className="flex items-center gap-3 text-left">
                                                        <div className="h-6 w-6 rounded-full bg-bg-tertiary border border-border-main text-text-primary flex items-center justify-center text-[11px] font-semibold">
                                                            {phase.phaseNumber}
                                                        </div>
                                                        <p className="text-[13px] font-semibold text-text-primary text-left">{phase.name}</p>
                                                    </div>
                                                    <div className="space-y-2 border-l border-border-sub pl-6 ml-3 text-left">
                                                        {(phase.tasks || []).map(task => (
                                                            <div key={task.id} className="flex items-center gap-2 text-left">
                                                                {task.isCompleted ? (
                                                                    <CheckCircle2 size={12} className="text-text-green" />
                                                                ) : (
                                                                    <Circle size={12} className="text-text-muted" />
                                                                )}
                                                                <span className={cn("text-[12px]", task.isCompleted ? "text-text-muted line-through" : "text-text-secondary")}>
                                                                    {task.name}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>

                            <div className="px-6 py-4 border-t border-border-sub flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center gap-4 text-left">
                                    <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider text-left">Project lead</p>
                                    {leadTech ? (
                                        <div className="flex items-center gap-2 bg-bg-secondary px-3 py-1.5 rounded-lg border border-border-sub shadow-sm text-left">
                                            <Avatar className="h-6 w-6 border border-border-main">
                                                <AvatarImage src={leadTech.avatarUrl} />
                                                <AvatarFallback className="text-[10px] font-semibold">{leadTech.name.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <span className="text-[13px] font-medium text-text-primary text-left">{leadTech.name}</span>
                                        </div>
                                    ) : leadMember ? (
                                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-bg-tertiary">Assigned</Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-bg-tertiary">Not assigned yet</Badge>
                                    )}
                                </div>
                                <div className="flex items-center gap-6 text-[12px] text-text-muted text-left">
                                    {project.estimatedDuration && <span className="flex items-center gap-1.5 text-left"><Clock size={12}/> Estimated {project.estimatedDuration}</span>}
                                    <span className="flex items-center gap-1.5 text-left"><ShieldCheck size={12} className="text-text-green"/> Scope of work confirmed</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
