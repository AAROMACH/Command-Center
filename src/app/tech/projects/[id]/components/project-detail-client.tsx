'use client';

import { useState, useMemo, useEffect } from 'react';
import type { Project, ProjectDailyLog, Task, Technician, ProjectDocument } from '@/lib/types';
import Link from 'next/link';
import {
  ChevronLeft,
  MapPin,
  Calendar as CalendarIcon,
  Clock,
  Users,
  ChevronDown,
  Camera,
  Plus,
  FileText,
  User,
  Trash2,
  Info,
  AlertTriangle,
  Building2,
  ImageIcon,
  History,
  Circle,
  Play,
  LogOut,
  CheckCircle2,
  ExternalLink,
  X,
  Check,
  Eye,
  Activity,
  RotateCcw,
  Timer,
  Navigation,
  LocateFixed,
  Download
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { cn, formatCityState, getTacticalLocation } from '@/lib/utils';
import { format, parseISO, parse } from 'date-fns';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, collection, addDoc } from 'firebase/firestore';

// --- SUB-COMPONENTS ---

const OverviewTab = ({ project, technicians }: { project: Project, technicians: Technician[] }) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
            <div className="lg:col-span-2 space-y-6">
                <section className="field-group">
                    <h3 className="field-group-title"><FileText size={14}/> Operational Scope</h3>
                    <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-4 text-left">
                        <div className="space-y-1 text-left">
                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Primary Objective</p>
                            <p className="text-sm text-text-primary leading-relaxed uppercase font-medium">{project.scope}</p>
                        </div>
                    </div>
                </section>

                <section className="field-group">
                    <h3 className="field-group-title"><MapPin size={14}/> Site Logistics</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-3 text-left">
                            <div className="space-y-1 text-left">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Access Instructions</p>
                                <p className="text-xs text-text-secondary leading-relaxed">{project.siteAccessInstructions || 'No special instructions provided.'}</p>
                            </div>
                        </div>
                        <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-3 text-left">
                            <div className="space-y-1 text-left">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">On-Site Contact</p>
                                <p className="text-xs font-bold text-text-primary uppercase">
                                    {project.onsiteContactName} {project.onsiteContactPhone && `(${project.onsiteContactPhone})`}
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {(project.siteHazardNotes || []).length > 0 && (
                    <section className="field-group">
                        <h3 className="field-group-title"><ShieldAlert size={14}/> Site Intelligence</h3>
                        <div className="flex flex-wrap gap-2">
                            {project.siteHazardNotes.map(note => (
                                <div key={note.id} className={cn(
                                    "px-3 py-2 rounded border flex items-center gap-2",
                                    note.type === 'danger' ? "bg-brand-red-dim/20 border-brand-red text-text-red" : "bg-accent-gold-dim/20 border-accent-gold text-accent-gold"
                                )}>
                                    {note.type === 'danger' ? <AlertTriangle size={14}/> : <Info size={14}/>}
                                    <span className="text-[10px] font-bold uppercase tracking-widest">{note.text}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>

            <div className="space-y-6">
                <section className="field-group">
                    <h3 className="field-group-title"><Users size={14}/> Team Registry</h3>
                    <div className="space-y-2">
                        {(project.team || []).map(member => {
                            const t = technicians.find(tech => tech.id === member.technicianId);
                            return (
                                <div key={member.technicianId} className="flex items-center gap-3 p-3 rounded-lg bg-bg-primary border border-border-sub">
                                    <Avatar className="h-8 w-8 border border-border-sub">
                                        <AvatarImage src={t?.avatarUrl} />
                                        <AvatarFallback>{t?.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 text-left">
                                        <p className="text-xs font-bold text-text-primary uppercase truncate">{t?.name}</p>
                                        <p className="text-[9px] text-text-muted uppercase tracking-widest">{member.role}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </section>
            </div>
        </div>
    );
};

const PhaseBlock = ({ 
    phase, 
    onTaskToggle, 
    documents, 
    isReadOnly 
}: { 
    phase: any, 
    onTaskToggle: (pid: string, tid: string) => void, 
    documents: ProjectDocument[], 
    isReadOnly: boolean 
}) => {
    const completedTasks = (phase.tasks || []).filter((t: any) => t.isCompleted).length;
    const totalTasks = (phase.tasks || []).length;
    const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    return (
        <div className="phase-block">
            <header className="phase-header">
                <div className="flex items-center gap-2.5 flex-1">
                    <div className="phase-num">{phase.phaseNumber}</div>
                    <h3 className="phase-name">{phase.name}</h3>
                </div>
                <div className="phase-meta">
                    <span>{totalTasks} targets</span>
                    <Badge variant={progress === 100 ? 'active' : 'onhold'}>{Math.round(progress)}%</Badge>
                </div>
            </header>
            <div className="tasks-list">
                {(phase.tasks || []).map((task: any) => (
                    <div key={task.id} className="task-row group/task">
                        <Checkbox 
                            id={`task-${task.id}`} 
                            checked={task.isCompleted} 
                            onCheckedChange={() => onTaskToggle(phase.id, task.id)} 
                            className="task-check" 
                            disabled={isReadOnly} 
                        />
                        <div className="flex-1 min-w-0 text-left">
                            <label htmlFor={`task-${task.id}`} className={cn("task-name", task.isCompleted && 'done')}>{task.name}</label>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const TimesheetsTab = ({ 
    dailyLogs, 
    technicians, 
    onCheckIn, 
    onCheckOut, 
    activeSession, 
    isReadOnly,
    project
}: { 
    dailyLogs: ProjectDailyLog[], 
    technicians: Technician[], 
    onCheckIn: () => void, 
    onCheckOut: (logId: string) => void, 
    activeSession: ProjectDailyLog | undefined, 
    isReadOnly: boolean,
    project: Project
}) => {
    const [elapsedTime, setElapsedTime] = useState('00:00:00');

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (activeSession && activeSession.checkInTime) {
            const start = new Date(`${activeSession.date}T${activeSession.checkInTime}`);
            interval = setInterval(() => {
                const now = new Date();
                const diff = now.getTime() - start.getTime();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                setElapsedTime(
                    `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
                );
            }, 1000);
        } else {
            setElapsedTime('00:00:00');
        }
        return () => clearInterval(interval);
    }, [activeSession]);

    const groupedByDate = useMemo(() => {
        const groups = dailyLogs.reduce((acc, log) => {
            if (!acc[log.date]) acc[log.date] = { logs: [], total: 0 };
            acc[log.date].logs.push(log);
            acc[log.date].total += (log.hoursWorked || 0);
            return acc;
        }, {} as Record<string, { logs: ProjectDailyLog[], total: number }>);
        
        return Object.entries(groups)
            .map(([date, data]) => ({ date, ...data }))
            .sort((a, b) => b.date.localeCompare(a.date));
    }, [dailyLogs]);

    const displayTime = (timeStr?: string) => {
        if (!timeStr) return '';
        try {
            return format(parse(`2024-01-01T${timeStr}`, "yyyy-MM-dd'T'HH:mm", new Date()), 'h:mm a');
        } catch (e) {
            return timeStr;
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* TACTICAL SESSION TERMINAL - COMPACT STRIP */}
            <div className={cn(
                "p-3 rounded-xl border flex items-center justify-between transition-all shadow-lg overflow-hidden",
                activeSession ? "bg-brand-red-dim border-brand-red/40" : "bg-bg-secondary border-border-main"
            )}>
                <div className="flex items-center gap-6">
                    <div className={cn(
                        "p-2 rounded-lg border",
                        activeSession ? "bg-brand-red text-white" : "bg-bg-tertiary text-text-muted border-border-sub"
                    )}>
                        {activeSession ? <Activity size={20} className="animate-pulse" /> : <Timer size={20} />}
                    </div>
                    
                    <div className="text-left space-y-0.5">
                        <div className="flex items-center gap-2">
                             <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-primary">
                                {activeSession ? "Live Field Session" : "Session Terminal"}
                             </p>
                             {activeSession ? (
                                <Badge variant="active" className="h-4 px-1.5 text-[7px] animate-pulse">RECORDING</Badge>
                             ) : isReadOnly ? (
                                <Badge variant="outline" className="h-4 px-1.5 text-[7px] opacity-60">LOCKED</Badge>
                             ) : (
                                <Badge variant="outline" className="h-4 px-1.5 text-[7px]">STANDBY</Badge>
                             )}
                        </div>
                        <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">
                            {activeSession ? `Checked In: ${displayTime(activeSession.checkInTime)}` : `Master Tally: ${(project.actualHours || 0).toFixed(1)}h`}
                        </p>
                    </div>

                    {activeSession && (
                        <div className="flex items-center gap-10 border-l border-border-sub/30 pl-8">
                            <div className="text-left">
                                <p className="text-[8px] font-black text-text-muted uppercase">Duration</p>
                                <p className="text-lg font-mono font-bold text-brand-red leading-none">{elapsedTime}</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {isReadOnly ? (
                        <p className="text-[9px] font-black text-text-muted uppercase pr-4 text-right">Registry Archived</p>
                    ) : !activeSession ? (
                        <Button className="h-9 px-8 bg-brand-red hover:bg-brand-red-hover text-[10px] font-bold uppercase tracking-widest shadow-lg" onClick={onCheckIn}>
                            <Play size={14} className="mr-2 fill-current" /> Check In
                        </Button>
                    ) : (
                        <Button variant="destructive" className="h-9 px-8 text-[10px] font-bold uppercase tracking-widest shadow-lg" onClick={() => onCheckOut(activeSession.id)}>
                            <LogOut size={14} className="mr-2" /> Check Out
                        </Button>
                    )}
                </div>
            </div>

            <section className="space-y-3">
                <div className="flex items-center justify-between px-1 border-b border-border-sub pb-2">
                    <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] text-left">Daily Activity Registry</h3>
                    <Button variant="ghost" size="sm" className="h-5 text-[8px] uppercase font-bold text-text-muted hover:text-brand-red">
                        <Download size={10} className="mr-1"/> Export Audit
                    </Button>
                </div>
                {groupedByDate.length > 0 ? (
                    <Accordion type="multiple" defaultValue={groupedByDate.map(g => g.date)} className="space-y-2">
                        {groupedByDate.map(group => (
                            <AccordionItem key={group.date} value={group.date} className="border border-border-sub rounded-lg overflow-hidden bg-bg-secondary shadow-sm">
                                <AccordionTrigger className="px-4 py-2 hover:bg-bg-tertiary transition-colors hover:no-underline border-none">
                                    <div className="flex items-center gap-3">
                                        <CalendarIcon size={14} className="text-brand-red" />
                                        <span className="text-[11px] font-black uppercase tracking-widest text-text-primary">{group.date}</span>
                                        <Badge variant="outline" className="text-[8px] bg-bg-tertiary h-4">{group.logs.length} LOGS</Badge>
                                    </div>
                                    <span className="text-[9px] font-bold text-text-muted uppercase tracking-[0.2em] mr-4">Daily Hours: <span className="text-text-primary font-mono text-xs">{group.total.toFixed(1)}h</span></span>
                                </AccordionTrigger>
                                <AccordionContent className="p-2 space-y-1 bg-bg-primary/20">
                                    {group.logs.map(log => {
                                        const tech = technicians.find(t => t.id === log.technicianId);
                                        const isLive = !log.checkOutTime;
                                        return (
                                            <div key={log.id} className={cn(
                                                "p-3 rounded-lg border space-y-2 text-left transition-all",
                                                isLive ? "bg-brand-red-dim/5 border-brand-red shadow-sm" : "bg-bg-secondary border-border-sub"
                                            )}>
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-2">
                                                        <Avatar className="h-5 w-5 border border-border-sub">
                                                            <AvatarFallback className="text-[8px]">{tech?.name.charAt(0)}</AvatarFallback>
                                                        </Avatar>
                                                        <span className="text-[10px] font-bold text-text-primary uppercase tracking-tight">{tech?.name}</span>
                                                        {isLive && <Badge variant="active" className="h-3 px-1 text-[6px] animate-pulse">RECORDING</Badge>}
                                                    </div>
                                                    <span className={cn("text-[10px] font-mono font-bold", isLive ? "text-brand-red" : "text-text-green")}>
                                                        {isLive ? 'ACTIVE' : (log.totalHours || `${(log.hoursWorked || 0).toFixed(1)}h`)}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-text-secondary leading-relaxed italic text-left">&quot;{log.workSummary}&quot;</p>
                                                <div className="flex items-center gap-4 text-[8px] font-bold uppercase text-text-muted tracking-widest">
                                                    <span className="flex items-center gap-1"><Clock size={10}/> {displayTime(log.checkInTime)} — {log.checkOutTime ? displayTime(log.checkOutTime) : 'Present'}</span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                ) : (
                    <div className="p-12 text-center border-2 border-dashed border-border-sub rounded-xl opacity-40 bg-bg-secondary/30">
                        <History size={48} className="mx-auto text-text-muted mb-2" />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-center">No site activity reported yet</p>
                    </div>
                )}
            </section>
        </div>
    );
};

export function ProjectDetailClient({ project, dailyLogs, technicians, documents }: { project: Project, dailyLogs: ProjectDailyLog[], technicians: Technician[], documents: ProjectDocument[] }) {
    const [activeTab, setActiveTab] = useState('overview');
    const { toast } = useToast();

    const currentUserId = useMemo(() => typeof window !== 'undefined' ? localStorage.getItem('currentUserId') : null, []);
    const isReadOnly = project.status === 'completed';

    const activeSession = useMemo(() => 
        dailyLogs.find(log => log.technicianId === currentUserId && !log.checkOutTime),
    [dailyLogs, currentUserId]);

    const progress = getProgress(project);
    const progressColor = progress === 100 ? 'green' : progress > 0 ? 'gold' : 'red';
    
    const handleTaskToggle = async (phaseId: string, taskId: string) => {
        if (isReadOnly) return;
        
        const updatedPhases = (project.phases || []).map(phase => {
            if (phase.id === phaseId) {
                return {
                    ...phase,
                    tasks: (phase.tasks || []).map(task => 
                        task.id === taskId ? { ...task, isCompleted: !task.isCompleted } : task
                    )
                };
            }
            return phase;
        });

        try {
            const docRef = doc(db, 'projects', project.id);
            await updateDoc(docRef, { phases: updatedPhases });
            toast({
                title: "Task Registry Updated",
                description: "Mission status has been synchronized with the Command Center."
            });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Update Failed', description: e.message });
        }
    };

    const handleCheckIn = async () => {
        if (isReadOnly || !currentUserId) return;
        
        const now = new Date();
        const location = await getTacticalLocation();
        
        const newLog: Omit<ProjectDailyLog, 'id'> = {
            projectId: project.id,
            technicianId: currentUserId,
            date: format(now, 'yyyy-MM-dd'),
            hoursWorked: 0,
            totalHours: '0h 0m',
            checkInTime: format(now, 'HH:mm'),
            workSummary: `ACTIVE FIELD SESSION INITIALIZED. IDENTIFIED SITE LOCATION: [${location}].`,
            taskIdsProgressed: [],
            taskIdsCompleted: [],
            phaseIdsWorked: [],
            materialsUsed: [],
            photoUrls: []
        };

        try {
            await addDoc(collection(db, 'projectDailyLogs'), newLog);
            toast({ title: 'Checked In', description: `Location verified: [${location}]. Session initialized.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Registry Error', description: e.message });
        }
    };

    const handleCheckOut = async (logId: string) => {
        if (!activeSession) return;
        const now = new Date();
        const location = await getTacticalLocation();
        const checkoutDisplayTime = format(now, 'h:mm a');
        
        try {
            const startTime = new Date(`${activeSession.date}T${activeSession.checkInTime}`);
            const diffMs = now.getTime() - startTime.getTime();
            const totalMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));
            const h = Math.floor(totalMinutes / 60);
            const m = totalMinutes % 60;
            const hoursWorked = parseFloat((totalMinutes / 60).toFixed(1));

            const logRef = doc(db, 'projectDailyLogs', logId);
            await updateDoc(logRef, {
                checkOutTime: format(now, 'HH:mm'),
                hoursWorked,
                totalHours: `${h}h ${m}m`,
                workSummary: `${activeSession.workSummary} | FIELD SESSION FINALIZED AT ${checkoutDisplayTime}. EXIT LOCATION: [${location}].`
            });
            
            const projectRef = doc(db, 'projects', project.id);
            await updateDoc(projectRef, {
                actualHours: (project.actualHours || 0) + hoursWorked
            });

            toast({ title: 'Session Finalized', description: 'Timesheet log committed to project registry.' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Registry Error', description: e.message });
        }
    };

    return (
        <div>
            <div className="detail-nav">
                <Link href="/tech/projects" className="detail-back">
                    <ChevronLeft size={16} />
                    Back to Terminal
                </Link>
                <div className="detail-breadcrumb">/ <span>{project.name}</span></div>
            </div>

            <div className="project-detail-header">
                <div className="pdh-top">
                    <div className="text-left">
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="pdh-title">{project.name}</h1>
                             <Badge variant={project.status} className="capitalize">{project.status}</Badge>
                        </div>
                        <div className="pdh-meta">
                            <div className="pdh-meta-item"><MapPin size={12}/>{project.location}</div>
                            <div className="pdh-meta-item"><CalendarIcon size={12}/>Started {formatDateDisplay(project.startDate)}</div>
                        </div>
                    </div>
                </div>
                <div className="pdh-progress">
                    <div className="pdh-progress-label">Overall Progress</div>
                    <div className="progress-wrap !flex-1">
                        <div className="progress-track !h-[10px]"><div className={`progress-fill flashy ${progressColor}`} style={{ width: `${progress}%` }}></div></div>
                        <div className={`progress-pct !text-lg !text-${progressColor}`}>{Math.round(progress)}%</div>
                    </div>
                </div>
            </div>

            <div className="detail-tabs justify-center">
                <button className={`detail-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Briefing</button>
                <button className={`detail-tab ${activeTab === 'milestones' ? 'active' : ''}`} onClick={() => setActiveTab('milestones')}>Tasks</button>
                <button className={`detail-tab ${activeTab === 'documents' ? 'active' : ''}`} onClick={() => setActiveTab('documents')}>Assets</button>
                <button className={`detail-tab ${activeTab === 'timesheets' ? 'active' : ''}`} onClick={() => setActiveTab('timesheets')}>Timesheets</button>
            </div>

            <div className="tab-content">
                {activeTab === 'overview' && <OverviewTab project={project} technicians={technicians} />}
                {activeTab === 'milestones' && <MilestonesTab project={project} onTaskToggle={handleTaskToggle} documents={documents} />}
                {activeTab === 'documents' && <DocumentsTab documents={documents} />}
                {activeTab === 'timesheets' && (
                    <TimesheetsTab 
                        dailyLogs={dailyLogs} 
                        technicians={technicians} 
                        onCheckIn={handleCheckIn} 
                        onCheckOut={handleCheckOut} 
                        activeSession={activeSession}
                        isReadOnly={isReadOnly}
                        project={project}
                    />
                )}
            </div>
        </div>
    );
}
