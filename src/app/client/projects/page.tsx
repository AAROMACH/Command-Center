'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
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

export default function ClientProjectsPage() {
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [allProjects, setAllProjects] = useState<Project[]>([]);
    const [allLogs, setAllLogs] = useState<ProjectDailyLog[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        setMounted(true);
        const userId = localStorage.getItem('currentUserId');
        if (!userId) return;

        const unsubUser = onSnapshot(doc(db, 'users', userId), (d) => {
            if (d.exists()) {
                const userData = { ...d.data(), id: d.id } as Technician;
                setCurrentUser(userData);
                
                const clientName = userData.clientCompany || userData.name;

                const unsubProj = onSnapshot(query(collection(db, 'projects'), where('client', '==', clientName)), (snap) => {
                    setAllProjects(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project)));
                });

                const unsubLogs = onSnapshot(collection(db, 'projectDailyLogs'), (snap) => {
                    setAllLogs(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as ProjectDailyLog)));
                });

                const unsubTech = onSnapshot(collection(db, 'users'), (snap) => {
                    setTechnicians(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Technician)));
                });

                return () => { unsubProj(); unsubLogs(); unsubTech(); };
            }
        });

        return () => unsubUser();
    }, []);

    const filteredProjects = useMemo(() => {
        return allProjects.filter(p => 
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.location.toLowerCase().includes(searchQuery.toLowerCase())
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
        <div className="space-y-8">
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <Briefcase size={12} />
                        Low Voltage infrastructure
                    </p>
                    <h1 className="page-title">Active Projects</h1>
                    <p className="page-subtitle text-left">Real-time oversight of multi-day field initiatives and phase completion.</p>
                </div>
            </header>

            <div className="mb-6 flex items-center justify-between">
                <div className="search-wrap">
                    <Search />
                    <input 
                        className="search-input" 
                        placeholder="Search project folders..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <Tabs defaultValue="active" className="w-full">
                <TabsList className="tabs !mb-8">
                    <TabsTrigger value="active" className="tab">
                        Active <span className="tab-count">({activeProjects.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="on-hold" className="tab">
                        On Hold <span className="tab-count">({onHoldProjects.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="completed" className="tab">
                        Completed <span className="tab-count">({completedProjects.length})</span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="active" className="space-y-6 mt-0">
                    <ProjectsList projects={activeProjects} getProjectProgress={getProjectProgress} formatDateStr={formatDateStr} technicians={technicians} />
                </TabsContent>
                <TabsContent value="on-hold" className="space-y-6 mt-0">
                    <ProjectsList projects={onHoldProjects} getProjectProgress={getProjectProgress} formatDateStr={formatDateStr} technicians={technicians} />
                </TabsContent>
                <TabsContent value="completed" className="space-y-6 mt-0">
                    <ProjectsList projects={completedProjects} getProjectProgress={getProjectProgress} formatDateStr={formatDateStr} technicians={technicians} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

function ProjectsList({ projects, getProjectProgress, formatDateStr, technicians }: { projects: Project[], getProjectProgress: (p: Project) => number, formatDateStr: (s: string) => string, technicians: Technician[] }) {
    if (projects.length === 0) {
        return (
            <div className="p-24 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30">
                <Briefcase size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted italic">No job folders found in this category.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {projects.map(project => {
                const progress = getProjectProgress(project);
                const leadMember = project.team?.find(m => m.role === 'Project Lead');
                const leadTech = leadMember ? technicians.find(t => t.id === leadMember.technicianId) : null;

                return (
                    <Card key={project.id} className="bg-bg-secondary border-border-main overflow-hidden shadow-sm text-left">
                        <CardHeader className="bg-bg-tertiary/30 border-b border-border-sub pb-6 text-left">
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 text-left">
                                <div className="space-y-1 text-left">
                                    <div className="flex items-center gap-3 text-left">
                                        <span className="text-[10px] font-bold text-brand-red uppercase tracking-widest font-mono">ID: {(project.id || '').toUpperCase()}</span>
                                        <Badge variant={project.status} className="h-5 uppercase">
                                            {project.status}
                                        </Badge>
                                    </div>
                                    <CardTitle className="text-2xl font-bold text-text-primary uppercase tracking-wide text-left">{project.name}</CardTitle>
                                    <div className="flex items-center gap-4 text-[11px] text-text-muted font-bold uppercase tracking-widest text-left mt-2">
                                        <span className="flex items-center gap-1.5"><MapPin size={12} className="text-brand-red"/> {project.location}</span>
                                        <span className="flex items-center gap-1.5"><Calendar size={12}/> Started {formatDateStr(project.startDate)}</span>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-3 w-full md:flex-1 md:max-w-[480px]">
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] mb-1">Deployment Readiness</p>
                                        <p className="text-3xl font-mono font-bold text-text-primary">{progress}%</p>
                                    </div>
                                    <Progress value={progress} className="relative overflow-hidden rounded-full w-full h-4 bg-bg-primary border border-border-sub shadow-inner" />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Accordion type="single" collapsible className="w-full">
                                <AccordionItem value="phases" className="border-none">
                                    <AccordionTrigger className="px-6 py-4 hover:bg-bg-tertiary transition-colors hover:no-underline border-b border-border-sub">
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">
                                            <History size={14} className="text-brand-red"/> Phase Breakdown & Tasks
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="p-6 bg-bg-primary/30">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
                                            {(project.phases || []).map(phase => (
                                                <div key={phase.id} className="space-y-4 text-left">
                                                    <div className="flex items-center gap-3 text-left">
                                                        <div className="h-6 w-6 rounded-full bg-brand-red text-white flex items-center justify-center text-[10px] font-bold">
                                                            {phase.phaseNumber}
                                                        </div>
                                                        <p className="text-xs font-bold text-text-primary uppercase tracking-wide text-left">{phase.name}</p>
                                                    </div>
                                                    <div className="space-y-2 border-l border-border-sub pl-6 ml-3 text-left">
                                                        {(phase.tasks || []).map(task => (
                                                            <div key={task.id} className="flex items-center gap-2 text-left">
                                                                {task.isCompleted ? (
                                                                    <CheckCircle2 size={12} className="text-text-green" />
                                                                ) : (
                                                                    <Circle size={12} className="text-text-muted" />
                                                                )}
                                                                <span className={cn("text-[11px] font-semibold", task.isCompleted ? "text-text-muted line-through" : "text-text-secondary")}>
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

                            <div className="px-6 py-4 bg-bg-tertiary/20 border-t border-border-sub flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center gap-4 text-left">
                                    <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] text-left">Project Lead</p>
                                    {leadTech ? (
                                        <div className="flex items-center gap-2 bg-bg-secondary px-3 py-1.5 rounded-lg border border-border-sub shadow-sm text-left">
                                            <Avatar className="h-6 w-6 border border-border-main">
                                                <AvatarImage src={leadTech.avatarUrl} />
                                                <AvatarFallback className="text-[10px] font-bold">{leadTech.name.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <span className="text-[11px] font-bold text-text-primary uppercase tracking-tight text-left">{leadTech.name}</span>
                                        </div>
                                    ) : (
                                        <Badge variant="outline" className="text-[8px] uppercase tracking-widest bg-bg-tertiary">Unallocated</Badge>
                                    )}
                                </div>
                                <div className="flex items-center gap-6 text-[9px] font-bold text-text-muted uppercase tracking-widest text-left">
                                    <span className="flex items-center gap-1.5 text-left"><Clock size={12} className="text-accent-gold"/> Est: {project.estimatedDuration}</span>
                                    <span className="flex items-center gap-1.5 text-left"><ShieldCheck size={12} className="text-text-green"/> SOW Verified</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
