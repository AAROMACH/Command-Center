'use client';

import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { statusLabel } from '@/lib/status-styles';
import { useState, useMemo, useEffect } from 'react';
import type { Project, ProjectDailyLog, Technician, ProjectDocument, Task } from '@/lib/types';
import { TaskCompletionDialog, TaskRequirementIcons, taskHasRequirements } from '@/components/task-completion-dialog';
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
  Download,
  Save,
  Loader2,
  ShieldCheck,
  ChevronUp,
  FolderOpen,
  Pencil,
  SearchCheck
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { cn, getTacticalLocation, reverseGeocode, calculateDistance } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { db } from '@/lib/firebase';
import { doc, updateDoc, collection, setDoc } from 'firebase/firestore';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import { formatClock } from '@/lib/time-on-site';
import { NotificationService } from '@/lib/notification-service';
import { MilestonesTab as LeadMilestonesTab } from '@/app/admin/projects/[id]/components/milestones-tab';
import { DocumentsTab as LeadDocumentsTab } from '@/app/admin/projects/[id]/components/documents-tab';

// --- UTILITIES ---

function getProgress(project: Project): number {
    const phases = project.phases || [];
    if (phases.length === 0) return 0;
    
    const allTasks = phases.flatMap(phase => (phase.tasks || [])).filter(Boolean);
    if (allTasks.length === 0) return 0;
    
    const completedTasks = allTasks.filter(task => task && task.isCompleted).length;
    return Math.round((completedTasks / allTasks.length) * 100);
}

function formatDateDisplay(dateStr: string) {
    if (!dateStr) return 'TBD';
    try {
        const parts = dateStr.split(/[-/]/);
        if (parts[0].length === 4) {
            return format(parseISO(dateStr), "MM/dd/yyyy");
        } else {
            const [m, d, y] = parts;
            return `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${y}`;
        }
    } catch (e) {
        return dateStr;
    }
}

// AM/PM-aware (the old split-on-":" version showed afternoon times as morning).
const displayTime = (timeStr?: string) => formatClock(timeStr);

const ProximityDisplay = ({ lat, lng, project, label, size = 'default' }: { lat?: number, lng?: number, project: Project, label: string, size?: 'default' | 'large' }) => {
    const [cityName, setCityName] = useState<string>("");
    
    useEffect(() => {
        if (lat && lng) {
            reverseGeocode(lat, lng).then(setCityName);
        }
    }, [lat, lng]);

    if (!lat || !lng) return <span className="text-[12px] text-text-muted">No GPS location</span>;

    let status = "";
    
    if (project.lat && project.lng) {
        const dist = calculateDistance(lat, lng, project.lat, project.lng);
        const isOnsite = dist < 0.2;
        status = isOnsite ? "On site" : `Off site (${dist.toFixed(1)} mi)`;
    }

    const textClass = size === 'large' ? 'text-[13px]' : 'text-[11px]';
    const iconSize = size === 'large' ? 14 : 12;

    return (
        <span className={cn("flex flex-wrap items-center gap-2 font-medium", textClass)}>
            <MapPin size={iconSize} className="text-brand-red shrink-0" />
            <span className="text-text-primary">{label}: {cityName || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}</span>
            {status && (
                <Badge variant={status.startsWith('On site') ? 'active' : 'missed'} className={cn("px-2 font-bold", size === 'large' ? 'h-5 text-[11px]' : 'h-4 text-[10px]')}>
                    {status}
                </Badge>
            )}
        </span>
    );
};

// --- SUB-COMPONENTS ---

const PhaseBlock = ({ 
    phase, 
    onTaskToggle, 
    isReadOnly,
    nameOf,
}: { 
    phase: any, 
    onTaskToggle: (pid: string, tid: string) => void, 
    documents: any[], 
    isReadOnly: boolean,
    nameOf: (id: string) => string,
}) => {
    const [isOpen, setIsOpen] = useState(true);
    const completedTasks = (phase.tasks || []).filter((t: any) => t.isCompleted).length;
    const totalTasks = (phase.tasks || []).length;
    const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    const status = progress === 100 ? 'completed' : progress > 0 ? 'inprogress' : 'pending';

    return (
        <div className="phase-block">
            <header className="phase-header" onClick={() => setIsOpen(!isOpen)}>
                <div className="phase-num">{phase.phaseNumber}</div>
                <h3 className="phase-name">{phase.name}</h3>
                <div className="phase-meta">
                    <span>{totalTasks} tasks</span>
                    <Badge variant={status} className="text-[10px] uppercase tracking-wide">{status === 'completed' ? 'Done' : status === 'inprogress' ? 'In progress' : 'Not started'}</Badge>
                </div>
                <div className={cn("phase-chevron transition-transform", isOpen && "rotate-180")}><ChevronDown size={14}/></div>
            </header>
            {isOpen && (
                <div className="tasks-list">
                    {(phase.tasks || []).map((task: any) => (
                        <div key={task.id} className="task-row">
                            <Checkbox 
                                checked={task.isCompleted} 
                                onCheckedChange={() => !isReadOnly && onTaskToggle(phase.id, task.id)}
                                disabled={isReadOnly}
                            />
                            <span className={cn("task-name", task.isCompleted && "line-through text-text-muted")}>{task.name}</span>
                            {task.assignedTechId && <span className="text-[11px] font-medium text-brand-red border border-brand-red/30 bg-brand-red/10 rounded-full px-2 py-0.5 whitespace-nowrap">{nameOf(task.assignedTechId)}</span>}
                            <TaskRequirementIcons task={task} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const OverviewTab = ({ project, technicians }: { project: Project, technicians: Technician[] }) => {
    const [localProjectData, setLocalProjectData] = useState<Partial<Project>>({});
    const { toast } = useToast();

    useEffect(() => {
        setLocalProjectData({
            scope: project.scope,
            onsiteContactName: project.onsiteContactName,
            onsiteContactPhone: project.onsiteContactPhone,
            siteAccessInstructions: project.siteAccessInstructions
        });
    }, [project]);

    const isDirty = useMemo(() => {
        return localProjectData.scope !== project.scope ||
               localProjectData.onsiteContactName !== project.onsiteContactName ||
               localProjectData.onsiteContactPhone !== project.onsiteContactPhone ||
               localProjectData.siteAccessInstructions !== project.siteAccessInstructions;
    }, [localProjectData, project]);

    const isReadOnly = project.status === 'completed';

    const handleSaveChanges = async () => {
        if (isReadOnly || !isDirty) return;
        try {
            const docRef = doc(db, 'projects', project.id);
            await updateDoc(docRef, { ...localProjectData });
            toast({ title: "Saved", description: "Briefing saved." });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e.message });
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
            <div className="lg:col-span-2 space-y-6">
                <section className="field-group">
                    <h3 className="field-group-title"><FileText size={14}/> Scope</h3>
                    <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-4 text-left">
                        <div className="space-y-1 text-left">
                            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider text-left">What we're doing</p>
                            <Textarea 
                                disabled={isReadOnly}
                                className="field-textarea h-24" 
                                value={localProjectData.scope || ''}
                                onChange={e => setLocalProjectData({...localProjectData, scope: e.target.value})}
                            />
                        </div>
                    </div>
                </section>

                <section className="field-group">
                    <h3 className="field-group-title"><MapPin size={14}/> Site access</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-3 text-left">
                            <div className="space-y-1 text-left">
                                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider text-left">Access instructions</p>
                                <Textarea 
                                    disabled={isReadOnly}
                                    className="field-textarea h-20" 
                                    value={localProjectData.siteAccessInstructions || ''}
                                    onChange={e => setLocalProjectData({...localProjectData, siteAccessInstructions: e.target.value})}
                                />
                            </div>
                        </div>
                        <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-3 text-left">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider text-left">On-site contact</Label>
                                <Input 
                                    disabled={isReadOnly}
                                    className="h-10 text-[13px]"
                                    value={localProjectData.onsiteContactName || ''}
                                    onChange={e => setLocalProjectData({...localProjectData, onsiteContactName: e.target.value})}
                                />
                                <Input 
                                    disabled={isReadOnly}
                                    className="h-10 text-[13px]"
                                    value={localProjectData.onsiteContactPhone || ''}
                                    onChange={e => setLocalProjectData({...localProjectData, onsiteContactPhone: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {isDirty && !isReadOnly && (
                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="outline" className="h-10 px-5" onClick={() => setLocalProjectData({
                            scope: project.scope,
                            onsiteContactName: project.onsiteContactName,
                            onsiteContactPhone: project.onsiteContactPhone,
                            siteAccessInstructions: project.siteAccessInstructions
                        })}>Discard changes</Button>
                        <Button className="h-10 px-6 bg-brand-red" onClick={handleSaveChanges}>Save changes</Button>
                    </div>
                )}
            </div>

            <div className="space-y-6">
                <section className="field-group">
                    <h3 className="field-group-title"><Users size={14}/> Team</h3>
                    <div className="space-y-2">
                        {(project.team || []).map(member => {
                            const t = technicians.find(tech => tech.id === member.techId);
                            return (
                                <div key={member.techId} className="flex items-center gap-3 p-3 rounded-lg bg-bg-primary border border-border-sub">
                                    <Avatar className="h-8 w-8 border border-border-sub">
                                        <AvatarImage src={t?.avatarUrl} />
                                        <AvatarFallback>{t?.name?.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 text-left">
                                        <p className="text-[13px] font-semibold text-text-primary truncate text-left">{t?.name}</p>
                                        <p className="text-[12px] text-text-muted text-left">{member.role}</p>
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

const DocumentRow = ({ doc, taskName }: { doc: ProjectDocument, taskName?: string }) => (
    <div className="p-3 rounded-xl border border-border-main bg-bg-secondary flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 text-left">
            <div className="p-2 bg-bg-primary rounded border border-border-sub text-brand-red shrink-0">
                <FileText size={16} />
            </div>
            <div className="min-w-0 text-left">
                <p className="text-[13px] font-semibold text-text-primary truncate">{doc.name}</p>
                <p className="text-[12px] text-text-muted truncate">
                    {taskName && !doc.name.startsWith(taskName) ? `${taskName} · ` : ''}{doc.uploader ? `${doc.uploader} · ` : ''}{doc.uploadDate}
                </p>
            </div>
        </div>
        {doc.url ? (
            <a href={doc.url} target="_blank" rel="noreferrer" aria-label={`Open ${doc.name}`}
               className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-bg-tertiary">
                <Download size={16}/>
            </a>
        ) : null}
    </div>
);

/** Crew view: documents grouped like the admin tab — before the job, then each phase. */
const DocumentsTab = ({ project, documents }: { project: Project, documents: ProjectDocument[] }) => {
    const phases = project.phases || [];
    const phaseIds = new Set(phases.map(p => p.id));
    const taskName = (phaseId?: string, taskId?: string) =>
        taskId ? phases.find(p => p.id === phaseId)?.tasks?.find(t => t.id === taskId)?.name : undefined;
    // Docs tagged with a phase that no longer exists fall back to the general group.
    const general = documents.filter(d => !d.phaseId || !phaseIds.has(d.phaseId));
    const groups = [
        { id: 'general', title: 'Before the job', docs: general },
        ...phases.map(p => ({ id: p.id, title: `Phase ${p.phaseNumber}: ${p.name.replace(/^Phase\s*\d+\s*:\s*/i, '')}`, docs: documents.filter(d => d.phaseId === p.id) })),
    ];

    if (documents.length === 0) {
        return <EmptyState icon={FolderOpen} title="No documents yet" description="Documents added to this project show up here, by phase." />;
    }

    return (
        <div className="space-y-5 animate-in fade-in duration-300">
            {groups.map(g => (
                <section key={g.id} className="space-y-2">
                    <div className="flex items-center justify-between px-1 border-b border-border-sub pb-2">
                        <h3 className="section-label text-left">{g.title}</h3>
                        <span className="text-[12px] text-text-muted">{g.docs.length} {g.docs.length === 1 ? 'file' : 'files'}</span>
                    </div>
                    {g.docs.length ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {g.docs.map(d => <DocumentRow key={d.id} doc={d} taskName={taskName(d.phaseId, d.taskId)} />)}
                        </div>
                    ) : (
                        <p className="px-1 text-[12px] text-text-muted">Nothing here yet.</p>
                    )}
                </section>
            ))}
        </div>
    );
};

const MilestonesTab = ({ project, onTaskToggle, isReadOnly, nameOf }: { project: Project, onTaskToggle: (pid: string, tid: string) => void, documents: ProjectDocument[], isReadOnly: boolean, nameOf: (id: string) => string }) => {
    return (
        <div className="space-y-4 animate-in fade-in duration-300">
             <div className="flex items-center justify-between px-1 border-b border-border-sub pb-2">
                <h3 className="section-label text-left">Tasks by phase</h3>
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-bg-tertiary">{(project.phases || []).length} {(project.phases || []).length === 1 ? 'phase' : 'phases'}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                {(project.phases || []).map(phase => (
                    <PhaseBlock 
                        key={phase.id} 
                        phase={phase} 
                        onTaskToggle={onTaskToggle} 
                        documents={[]} 
                        isReadOnly={isReadOnly} 
                        nameOf={nameOf}
                    />
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
    const [liveNotes, setLiveNotes] = useState("");
    const [isSavingNotes, setIsSavingNotes] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        if (activeSession) {
            setLiveNotes(activeSession.workSummary || "");
        }
    }, [activeSession]);

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

    const handleSaveLiveNotes = async (logId: string, notes: string) => {
        setIsSavingNotes(true);
        try {
            await updateDoc(doc(db, 'projectDailyLogs', logId), {
                workSummary: notes
            });
            toast({ title: "Saved", description: "Field notes saved." });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not save notes', description: e.message });
        } finally {
            setIsSavingNotes(false);
        }
    };

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

    const handleExportTimesheets = () => {
        const rows = [
            ['Date', 'Technician', 'Check in', 'Check out', 'Hours', 'Summary']
        ];
        
        dailyLogs.forEach(log => {
            const tech = technicians.find(t => t.id === log.techId);
            rows.push([
                log.date,
                tech?.name || 'Unknown',
                log.checkInTime || '',
                log.checkOutTime || '',
                log.hoursWorked?.toString() || '0',
                log.workSummary.replace(/\n/g, ' ')
            ]);
        });

        const csvContent = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Timesheets_${project.id}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast({ title: "Export ready", description: "Timesheet CSV downloaded." });
    };

    const currentUserId = typeof window !== 'undefined' ? sessionStorage.getItem('currentUserId') : null;

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Check-in session */}
            <div className={cn(
                "rounded-xl border shadow-sm overflow-hidden transition-all duration-500",
                activeSession ? "bg-bg-secondary border-brand-red ring-1 ring-brand-red/20" : "bg-bg-secondary border-border-main"
            )}>
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-bg-tertiary/30 border-b border-border-sub">
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "p-2 rounded-lg border shadow-inner",
                            activeSession ? "bg-brand-red text-white border-brand-red" : "bg-bg-primary text-text-muted border-border-sub"
                        )}>
                            {activeSession ? <Activity size={20} className="animate-pulse" /> : <Timer size={20} />}
                        </div>
                        <div className="text-left">
                            <p className="text-[14px] font-semibold text-text-primary text-left">
                                {activeSession ? "You're checked in" : "On-site time"}
                            </p>
                            <p className="text-[12px] text-text-muted mt-0.5 text-left">
                                {activeSession ? `Session ${activeSession.id?.split('-').pop()?.toUpperCase() || ''}` : "Check in when you arrive on site"}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-6">
                        {activeSession && (
                            <div className="flex flex-col items-end">
                                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Time on site</p>
                                <p className="text-3xl font-mono font-bold text-text-primary tabular-nums tracking-tighter">{elapsedTime}</p>
                            </div>
                        )}
                        {isReadOnly ? (
                            <Badge variant="outline" className="h-6 px-3 text-[10px] uppercase tracking-wider">Project closed</Badge>
                        ) : !activeSession ? (
                            <Button onClick={onCheckIn} className="bg-brand-red hover:bg-brand-red-hover h-11 px-8 shadow-sm">
                                <Play size={16} className="mr-2 fill-current" /> Check in
                            </Button>
                        ) : (
                            <Button variant="destructive" onClick={() => onCheckOut(activeSession.id)} className="h-11 px-8 shadow-sm">
                                <LogOut size={16} className="mr-2" /> Check out
                            </Button>
                        )}
                    </div>
                </div>

                {activeSession && (
                    <div className="p-4 sm:p-6 bg-bg-secondary space-y-4 animate-in slide-in-from-top-4 duration-500">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                             <div className="space-y-2 text-left">
                                <div className="flex items-center justify-between px-1">
                                    <Label className="text-[10px] font-semibold uppercase text-text-muted tracking-wider flex items-center gap-2">
                                        <FileText size={14} className="text-brand-red"/> Field notes
                                    </Label>
                                    <div className="flex items-center gap-2">
                                         {isSavingNotes && <Loader2 size={10} className="animate-spin text-accent-gold"/>}
                                         <p className="text-[11px] text-text-muted">Saves automatically</p>
                                    </div>
                                </div>
                                <div className="relative group/live-note">
                                    <Textarea 
                                        value={liveNotes}
                                        onChange={e => setLiveNotes(e.target.value)}
                                        onBlur={() => handleSaveLiveNotes(activeSession.id, liveNotes)}
                                        placeholder="Site conditions, work done, anything that slowed you down…"
                                        className="min-h-[24px] bg-transparent border-none shadow-none focus-visible:ring-0 text-[13px] leading-relaxed resize-none p-0 text-left"
                                    />
                                    <Pencil size={10} className="absolute top-0 right-0 text-text-muted opacity-30 group-hover/live-note:opacity-100 transition-opacity pointer-events-none" />
                                </div>
                             </div>
                             <div className="space-y-4">
                                <div className="p-4 rounded-xl bg-bg-primary border border-border-sub shadow-inner space-y-4">
                                    <div className="flex items-center justify-between border-b border-border-sub/50 pb-2">
                                        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">This session</p>
                                        <ShieldCheck size={14} className="text-text-green" />
                                    </div>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="space-y-1 text-left">
                                            <p className="text-[12px] font-medium text-text-muted text-left">Check-in location</p>
                                            <ProximityDisplay lat={activeSession.checkInLat} lng={activeSession.checkInLng} project={project} label="Check-In" size="large" />
                                        </div>
                                        <div className="space-y-1 text-left">
                                            <p className="text-[12px] font-medium text-text-muted text-left">Checked in at</p>
                                            <div className="flex items-center gap-2 text-text-primary">
                                                <Clock size={16} className="text-brand-red" />
                                                <p className="text-2xl font-mono font-bold tracking-tight">{displayTime(activeSession.checkInTime)}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-4 rounded-xl border border-dashed border-border-main bg-bg-tertiary/20 text-center">
                                     <p className="text-[12px] text-text-muted leading-relaxed text-left">
                                         Your notes save as you type and the office sees them right away. Finish your tasks before you check out.
                                     </p>
                                </div>
                             </div>
                        </div>
                    </div>
                )}
            </div>

            <section className="space-y-2">
                <div className="flex items-center justify-between px-1 border-b border-border-sub pb-2">
                    <h3 className="section-label text-left">Past sessions</h3>
                    <Button variant="ghost" size="sm" className="h-10 sm:h-8 text-text-muted hover:text-brand-red" onClick={handleExportTimesheets}>
                        <Download size={14} className="mr-1"/> Export CSV
                    </Button>
                </div>
                {groupedByDate.length > 0 ? (
                    <Accordion type="multiple" defaultValue={groupedByDate.map(g => g.date)} className="space-y-1.5">
                        {groupedByDate.map(group => (
                            <AccordionItem key={group.date} value={group.date} className="border border-border-sub rounded-xl overflow-hidden bg-bg-secondary shadow-sm">
                                <AccordionTrigger className="px-3 py-2 hover:bg-bg-tertiary transition-colors hover:no-underline border-none text-left">
                                    <div className="flex items-center gap-3 text-left">
                                        <div className="p-1.5 bg-bg-primary rounded text-brand-red border border-border-sub">
                                            <CalendarIcon size={16} />
                                        </div>
                                        <span className="text-[14px] font-semibold text-text-primary">{group.date}</span>
                                        <Badge variant="outline" className="text-[10px] uppercase tracking-wide bg-bg-primary">{(group.logs || []).length} {(group.logs || []).length === 1 ? 'session' : 'sessions'}</Badge>
                                    </div>
                                    <span className="text-[12px] text-text-muted mr-3 sm:mr-6">Total <span className="text-text-primary font-mono font-semibold text-[13px]">{group.total.toFixed(1)}h</span></span>
                                </AccordionTrigger>
                                <AccordionContent className="p-2 bg-bg-primary/10">
                                    <div className="space-y-2">
                                        {group.logs.map(log => {
                                            const tech = technicians.find(t => t.id === log.techId);
                                            const isLive = !log.checkOutTime;
                                            const canEditNotes = !isReadOnly && log.techId === currentUserId;

                                            return (
                                                <div key={log.id} className={cn(
                                                    "p-2.5 rounded-xl border space-y-2 text-left transition-all",
                                                    isLive ? "bg-brand-red-dim/5 border-brand-red ring-1 ring-brand-red/10" : "bg-bg-secondary border-border-sub"
                                                )}>
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex items-center gap-4 text-left">
                                                            <Avatar className="h-8 w-8 border border-border-sub shadow-sm">
                                                                <AvatarFallback className="text-[10px] font-bold">{(tech?.name || 'U').charAt(0)}</AvatarFallback>
                                                            </Avatar>
                                                            <div className="text-left space-y-1">
                                                                <div className="flex items-center gap-2 text-left">
                                                                    <p className="text-[13px] font-semibold text-text-primary text-left">{tech?.name}</p>
                                                                    {isLive && <Badge variant="active" className="text-[10px] uppercase tracking-wide">On site now</Badge>}
                                                                </div>
                                                                <div className="flex flex-col gap-2 text-left">
                                                                    <span className="text-[13px] text-text-primary font-semibold flex items-center gap-2 text-left">
                                                                        <Clock size={14} className="text-brand-red"/>
                                                                        {displayTime(log.checkInTime)} — {log.checkOutTime ? displayTime(log.checkOutTime) : 'still on site'}
                                                                    </span>
                                                                    <div className="flex flex-wrap items-center gap-3 text-left">
                                                                        <ProximityDisplay lat={log.checkInLat} lng={log.checkInLng} project={project} label="Check-In" size="large" />
                                                                        {log.checkOutTime && <ProximityDisplay lat={log.checkOutLat} lng={log.checkOutLng} project={project} label="Check-Out" size="large" />}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className={cn("text-2xl font-mono font-bold leading-none", isLive ? "text-brand-red" : "text-text-green")}>
                                                                {isLive ? 'Live' : (log.totalHours || `${(log.hoursWorked || 0).toFixed(1)}h`)}
                                                            </p>
                                                            <p className="text-[11px] text-text-muted mt-1">Hours</p>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1.5 text-left border-t border-border-sub/30 pt-3">
                                                        <div className="flex items-center gap-2 text-text-muted mb-1 text-left">
                                                            <FileText size={12}/>
                                                            <p className="text-[10px] font-semibold uppercase tracking-wider text-left">Field notes</p>
                                                        </div>
                                                        {canEditNotes ? (
                                                            <div className="relative group/hist-note text-left">
                                                                <Textarea 
                                                                    defaultValue={log.workSummary}
                                                                    onBlur={(e) => handleSaveLiveNotes(log.id, e.target.value)}
                                                                    className="min-h-[24px] bg-transparent border-none shadow-none focus-visible:ring-0 text-[13px] leading-relaxed resize-none p-0 text-left"
                                                                    placeholder="Tap to add field notes…"
                                                                />
                                                                <Pencil size={10} className="absolute top-0 right-0 text-text-muted opacity-30 group-hover/hist-note:opacity-100 transition-opacity pointer-events-none" />
                                                            </div>
                                                        ) : (
                                                            <div className="p-3 rounded-lg bg-bg-primary/50 border border-border-sub/50 text-left">
                                                                <p className="text-[12px] text-text-secondary leading-relaxed text-left">
                                                                    {log.workSummary || 'No notes added.'}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                ) : (
                    <EmptyState icon={History} title="No sessions yet" description="Your check-ins on this project show up here." />
                )}
            </section>
        </div>
    );
};

export function ProjectDetailClient({ project, dailyLogs, technicians, documents, canLead = false }: {
    project: Project, dailyLogs: ProjectDailyLog[], technicians: Technician[], documents: ProjectDocument[],
    /** Named lead (or PM): adds the Plan tab and document upload/delete. */
    canLead?: boolean,
}) {
    const nameOf = (id: string) => technicians.find(t => t.id === id)?.name || 'Crew member';
    const [activeTab, _setActiveTabRaw] = useState(() => { try { return localStorage.getItem('cc:project-detail:tab') || 'overview'; } catch { return 'overview'; } });
    const setActiveTab = (v: string) => { _setActiveTabRaw(v); try { localStorage.setItem('cc:project-detail:tab', v); } catch {} };
    // A saved "Plan" tab from a project they lead falls back to Tasks elsewhere.
    useEffect(() => { if (!canLead && activeTab === 'plan') setActiveTab('milestones'); }, [canLead, activeTab]);
    const { toast } = useToast();

    const currentUserId = useMemo(() => typeof window !== 'undefined' ? sessionStorage.getItem('currentUserId') : null, []);
    const isReadOnly = project.status === 'completed';

    const activeSession = useMemo(() => 
        dailyLogs.find(log => log.techId === currentUserId && !log.checkOutTime),
    [dailyLogs, currentUserId]);

    const progress = getProgress(project);
    const progressColor = progress === 100 ? 'green' : progress > 0 ? 'gold' : 'red';
    
    // Task with requirements → completion form; otherwise toggle directly.
    const [completing, setCompleting] = useState<{ phaseId: string; task: Task } | null>(null);

    const saveTask = async (phaseId: string, taskId: string, patch: Partial<Task>) => {
        const task = (project.phases || []).find(ph => ph.id === phaseId)?.tasks?.find(t => t.id === taskId);
        const updatedPhases = (project.phases || []).map(phase => phase.id !== phaseId ? phase : {
            ...phase,
            tasks: (phase.tasks || []).map(t => t.id === taskId ? { ...t, ...patch } : t),
        });
        await updateDoc(doc(db, 'projects', project.id), { phases: updatedPhases });
        toast({ title: patch.isCompleted ? 'Task completed' : 'Task reopened', description: task?.name });
        if (task && patch.isCompleted) {
            const allDone = updatedPhases.every(ph => (ph.tasks || []).every(t => t.isCompleted)) && updatedPhases.some(ph => (ph.tasks || []).length);
            NotificationService.notifyProjectManagers(project.id,
                allDone ? 'Project tasks complete' : 'Task completed',
                `${nameOf(currentUserId || '')} completed "${task.name}" on ${project.name}.${allDone ? '\nEvery task is done — ready to close out.' : ''}`,
                !allDone);
        }
    };

    const handleTaskToggle = async (phaseId: string, taskId: string) => {
        if (isReadOnly) return;
        const task = (project.phases || []).find(ph => ph.id === phaseId)?.tasks?.find(t => t.id === taskId);
        if (!task) return;
        if (!task.isCompleted && taskHasRequirements(task)) { setCompleting({ phaseId, task }); return; }
        try {
            await saveTask(phaseId, taskId, task.isCompleted
                ? { isCompleted: false, completedAt: '', completedBy: null }
                : { isCompleted: true, completedAt: new Date().toISOString(), completedBy: currentUserId });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e.message });
        }
    };

    const handleCheckIn = async () => {
        if (isReadOnly || !currentUserId) return;
        
        const now = new Date();
        let lat = 0;
        let lng = 0;
        
        try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
            });
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
        } catch (e) {
            console.warn("Location unavailable");
        }

        const newLog: Omit<ProjectDailyLog, 'id'> = {
            projectId: project.id,
            techId: currentUserId,
            date: format(now, 'yyyy-MM-dd'),
            hoursWorked: 0,
            totalHours: '0h 0m',
            checkInTime: format(now, 'HH:mm'),
            checkInLat: lat,
            checkInLng: lng,
            workSummary: "",
            taskIdsProgressed: [],
            taskIdsCompleted: [],
            phaseIdsWorked: [],
            materialsUsed: [],
            photoUrls: []
        };

        try {
            const logId = await createDocId(ID_PREFIXES.PROJECT_DAILY_LOG);
            await setDoc(doc(db, 'projectDailyLogs', logId), { ...newLog, id: logId });
            toast({ title: 'Checked in', description: `You are checked in on ${project.name}.` });
            NotificationService.notifyProjectManagers(project.id, 'Crew checked in', `${nameOf(currentUserId)} checked in on ${project.name}.`);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e.message });
        }
    };

    const handleCheckOut = async (logId: string) => {
        if (!activeSession) return;
        const now = new Date();
        let lat = 0;
        let lng = 0;
        
        try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
            });
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
        } catch (e) {
            console.warn("Location unavailable");
        }
        
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
                checkOutLat: lat,
                checkOutLng: lng,
                hoursWorked,
                totalHours: `${h}h ${m}m`,
            });
            
            const projectRef = doc(db, 'projects', project.id);
            await updateDoc(projectRef, {
                actualHours: (project.actualHours || 0) + hoursWorked
            });

            toast({ title: 'Checked out', description: `Your hours were logged.` });
            NotificationService.notifyProjectManagers(project.id, 'Crew checked out', `${nameOf(currentUserId || '')} checked out of ${project.name} after ${hoursWorked}h.`);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e.message });
        }
    };

    return (
        <div>
            <div className="detail-nav">
                <Link href="/tech/projects" className="detail-back min-h-[40px]">
                    <ChevronLeft size={16} />
                    My projects
                </Link>
                <div className="detail-breadcrumb">/ <span>{project.name}</span></div>
            </div>

            <div className="project-detail-header">
                <div className="pdh-top">
                    <div className="text-left">
                        <div className="flex items-center gap-3 mb-1 text-left">
                            <h1 className="pdh-title text-left">{project.name}</h1>
                             <StatusBadge kind="job" value={project.status === 'active' ? 'in-progress' : project.status === 'on-hold' ? 'cancelled' : project.status} label={statusLabel(project.status)} />
                        </div>
                        <div className="pdh-meta text-left">
                            <div className="pdh-meta-item text-left"><MapPin size={12}/>{project.location}</div>
                            <div className="pdh-meta-item text-left"><CalendarIcon size={12}/>Started {formatDateDisplay(project.startDate)}</div>
                        </div>
                    </div>
                </div>
                <div className="pdh-progress">
                    <div className="pdh-progress-label">Overall progress</div>
                    <div className="progress-wrap !flex-1">
                        <div className="progress-track !h-[10px]"><div className={`progress-fill flashy ${progressColor}`} style={{ width: `${progress}%` }}></div></div>
                        <div className={`progress-pct !text-lg !text-${progressColor}`}>{Math.round(progress)}%</div>
                    </div>
                </div>
            </div>

            <div className="detail-tabs overflow-x-auto sm:justify-center">
                <button className={`detail-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
                <button className={`detail-tab ${activeTab === 'milestones' ? 'active' : ''}`} onClick={() => setActiveTab('milestones')}>Milestones</button>
                {canLead && <button className={`detail-tab ${activeTab === 'plan' ? 'active' : ''}`} onClick={() => setActiveTab('plan')}>Plan</button>}
                <button className={`detail-tab ${activeTab === 'documents' ? 'active' : ''}`} onClick={() => setActiveTab('documents')}>Documents</button>
                <button className={`detail-tab ${activeTab === 'timesheets' ? 'active' : ''}`} onClick={() => setActiveTab('timesheets')}>Timesheets</button>
            </div>

            <TaskCompletionDialog
                task={completing?.task ?? null}
                projectId={project.id}
                phaseId={completing?.phaseId}
                open={!!completing}
                onOpenChange={o => { if (!o) setCompleting(null); }}
                onComplete={patch => completing ? saveTask(completing.phaseId, completing.task.id,
                    { ...patch, completedAt: new Date().toISOString(), completedBy: currentUserId }) : undefined}
            />
            <div className="tab-content">
                {activeTab === 'overview' && <OverviewTab project={project} technicians={technicians} />}
                {activeTab === 'milestones' && <MilestonesTab project={project} onTaskToggle={handleTaskToggle} documents={documents} isReadOnly={isReadOnly} nameOf={nameOf} />}
                {/* Lead tools reuse the office editors: phases/tasks/assignees and document upload. */}
                {activeTab === 'plan' && canLead && <LeadMilestonesTab project={project} technicians={technicians} />}
                {activeTab === 'documents' && (canLead ? <LeadDocumentsTab project={project} documents={documents} /> : <DocumentsTab project={project} documents={documents} />)}
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
