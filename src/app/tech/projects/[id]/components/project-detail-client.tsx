'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
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
  FolderOpen
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { cn, formatCityState, getTacticalLocation, reverseGeocode, calculateDistance } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { db } from '@/lib/firebase';
import { doc, updateDoc, collection, addDoc } from 'firebase/firestore';

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

const displayTime = (timeStr?: string) => {
    if (!timeStr) return '';
    try {
        const [h, m] = timeStr.split(':');
        const d = new Date();
        d.setHours(parseInt(h), parseInt(m), 0);
        return format(d, 'h:mm a');
    } catch (e) {
        return timeStr;
    }
};

const ProximityDisplay = ({ lat, lng, project, label }: { lat?: number, lng?: number, project: Project, label: string }) => {
    const [cityName, setCityName] = useState<string>("");
    
    useEffect(() => {
        if (lat && lng) {
            reverseGeocode(lat, lng).then(setCityName);
        }
    }, [lat, lng]);

    if (!lat || !lng) return <span className="text-[8px] text-text-muted italic uppercase">GPS Unavailable</span>;

    let status = "";
    
    if (project.lat && project.lng) {
        const dist = calculateDistance(lat, lng, project.lat, project.lng);
        const isOnsite = dist < 0.2;
        status = isOnsite ? "Onsite" : `Offsite (${dist.toFixed(1)}mi)`;
    }

    return (
        <span className="flex items-center gap-1.5 text-[9px] font-bold text-text-muted uppercase tracking-tight">
            <MapPin size={10} className="text-accent-gold" />
            <span className="text-text-primary">{label}: {cityName || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}</span>
            {status && (
                <Badge variant={status.includes('Onsite') ? 'active' : 'missed'} className="h-3.5 px-1 text-[7px] tracking-tighter">
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
    isReadOnly 
}: { 
    phase: any, 
    onTaskToggle: (pid: string, tid: string) => void, 
    documents: any[], 
    isReadOnly: boolean 
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
                    <Badge variant={status}>{status}</Badge>
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
                            {task.requiresPhoto && <Camera size={12} className="text-text-muted" />}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

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
                                        <AvatarFallback>{t?.name?.charAt(0)}</AvatarFallback>
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

const DocumentsTab = ({ documents }: { documents: ProjectDocument[] }) => {
    return (
        <div className="space-y-4 animate-in fade-in duration-300">
             <div className="flex items-center justify-between px-1 border-b border-border-sub pb-2">
                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] text-left">Project Asset Registry</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {documents.map(doc => (
                    <div key={doc.id} className="p-4 rounded-xl border border-border-sub bg-bg-secondary flex items-center justify-between group hover:border-text-muted transition-all">
                        <div className="flex items-center gap-4 text-left">
                            <div className="p-2.5 bg-bg-primary rounded border border-border-sub text-brand-red">
                                <FileText size={18} />
                            </div>
                            <div className="text-left">
                                <p className="text-sm font-bold text-text-primary uppercase tracking-wide">{doc.name}</p>
                                <p className="text-[10px] text-text-muted uppercase tracking-widest mt-0.5">{doc.size} · Uploaded {doc.uploadDate}</p>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-text-muted hover:text-text-primary">
                            <Download size={16}/>
                        </Button>
                    </div>
                ))}
                {documents.length === 0 && (
                    <div className="col-span-full py-24 text-center border-2 border-dashed border-border-sub rounded-2xl opacity-40 bg-bg-secondary/30">
                        <FolderOpen size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                        <p className="text-[11px] font-bold uppercase tracking-widest text-center italic">No technical assets found in project folder</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const MilestonesTab = ({ project, onTaskToggle, isReadOnly }: { project: Project, onTaskToggle: (pid: string, tid: string) => void, documents: ProjectDocument[], isReadOnly: boolean }) => {
    return (
        <div className="space-y-4 animate-in fade-in duration-300">
             <div className="flex items-center justify-between px-1 border-b border-border-sub pb-2">
                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] text-left">Mission Objectives</h3>
                <Badge variant="outline" className="text-[8px] uppercase tracking-widest bg-bg-tertiary">{(project.phases || []).length} PHASES</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                {(project.phases || []).map(phase => (
                    <PhaseBlock 
                        key={phase.id} 
                        phase={phase} 
                        onTaskToggle={onTaskToggle} 
                        documents={[]} 
                        isReadOnly={isReadOnly} 
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
            toast({ title: "Registry Synced", description: "Field notes committed to registry." });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Sync Failure', description: e.message });
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

    const currentUserId = typeof window !== 'undefined' ? localStorage.getItem('currentUserId') : null;

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* TACTICAL SESSION TERMINAL - COMPACT STRIP */}
            <div className={cn(
                "rounded-xl border shadow-xl overflow-hidden transition-all duration-500",
                activeSession ? "bg-bg-secondary border-brand-red ring-1 ring-brand-red/20" : "bg-bg-tertiary/20 border-border-sub"
            )}>
                <div className="p-4 flex items-center justify-between bg-bg-tertiary/30 border-b border-border-sub">
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "p-2 rounded-lg border shadow-inner",
                            activeSession ? "bg-brand-red text-white border-brand-red" : "bg-bg-primary text-text-muted border-border-sub"
                        )}>
                            {activeSession ? <Activity size={20} className="animate-pulse" /> : <Timer size={20} />}
                        </div>
                        <div className="text-left">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-primary">
                                {activeSession ? "Mission Recording Active" : "Field Session Terminal"}
                            </p>
                            <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mt-0.5">
                                {activeSession ? `ID: ${activeSession.id.toUpperCase()} · Handshake Verified` : "Awaiting Site Arrival"}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        {activeSession && (
                            <div className="flex flex-col items-end">
                                <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">Active Duration</p>
                                <p className="text-2xl font-mono font-bold text-text-primary tabular-nums tracking-tighter">{elapsedTime}</p>
                            </div>
                        )}
                        {isReadOnly ? (
                            <Badge variant="outline" className="h-6 px-4 uppercase font-black text-[9px] tracking-widest">REGISTRY LOCKED</Badge>
                        ) : !activeSession ? (
                            <Button onClick={onCheckIn} className="bg-brand-red hover:bg-brand-red-hover h-11 px-10 text-[10px] font-black uppercase tracking-[0.2em] shadow-lg">
                                <Play size={16} className="mr-2 fill-current" /> Check In
                            </Button>
                        ) : (
                            <Button variant="destructive" onClick={() => onCheckOut(activeSession.id)} className="h-11 px-10 text-[10px] font-black uppercase tracking-[0.2em] shadow-lg">
                                <LogOut size={16} className="mr-2" /> Check Out
                            </Button>
                        )}
                    </div>
                </div>

                {activeSession && (
                    <div className="p-6 bg-bg-secondary space-y-4 animate-in slide-in-from-top-4 duration-500">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                             <div className="space-y-2 text-left">
                                <div className="flex items-center justify-between px-1">
                                    <Label className="text-[10px] font-black uppercase text-text-muted tracking-widest flex items-center gap-2">
                                        <FileText size={14} className="text-brand-red"/> Field Activity Notes
                                    </Label>
                                    <div className="flex items-center gap-2">
                                         {isSavingNotes && <Loader2 size={10} className="animate-spin text-accent-gold"/>}
                                         <p className="text-[8px] text-text-muted font-bold uppercase tracking-tighter">Autosave Enabled</p>
                                    </div>
                                </div>
                                <Textarea 
                                    value={liveNotes}
                                    onChange={e => setLiveNotes(e.target.value)}
                                    onBlur={() => handleSaveLiveNotes(activeSession.id, liveNotes)}
                                    placeholder="Document site conditions, task completion details, and field obstacles..."
                                    className="min-h-[120px] bg-bg-primary border-border-sub text-xs leading-relaxed uppercase font-medium focus:border-brand-red transition-all shadow-inner"
                                />
                             </div>
                             <div className="space-y-4">
                                <div className="p-4 rounded-xl bg-bg-primary border border-border-sub shadow-inner space-y-4">
                                    <div className="flex items-center justify-between border-b border-border-sub/50 pb-2">
                                        <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Session Metadata</p>
                                        <ShieldCheck size={14} className="text-text-green" />
                                    </div>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="space-y-1 text-left">
                                            <p className="text-[8px] font-black text-text-muted uppercase">Verified Site Presence</p>
                                            <ProximityDisplay lat={activeSession.checkInLat} lng={activeSession.checkInLng} project={project} label="In" />
                                        </div>
                                        <div className="space-y-1 text-left">
                                            <p className="text-[8px] font-black text-text-muted uppercase">Handshake Verification</p>
                                            <div className="flex items-center gap-2 text-text-primary">
                                                <Clock size={14} className="text-brand-red" />
                                                <p className="text-xs font-mono font-bold uppercase tracking-tight">{displayTime(activeSession.checkInTime)}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-4 rounded-xl border border-dashed border-border-sub bg-bg-tertiary/20 text-center">
                                     <p className="text-[9px] text-text-muted uppercase font-bold leading-relaxed italic">
                                         Terminal Note: All field notes are synchronized with the Command Center in real-time. Finalize all Milestones before checking out.
                                     </p>
                                </div>
                             </div>
                        </div>
                    </div>
                )}
            </div>

            <section className="space-y-4">
                <div className="flex items-center justify-between px-1 border-b border-border-sub pb-2">
                    <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] text-left">Historical Session Ledger</h3>
                    <Button variant="ghost" size="sm" className="h-5 text-[8px] uppercase font-bold text-text-muted hover:text-brand-red">
                        <Download size={10} className="mr-1"/> Export Audit manifest
                    </Button>
                </div>
                {groupedByDate.length > 0 ? (
                    <Accordion type="multiple" defaultValue={groupedByDate.map(g => g.date)} className="space-y-3">
                        {groupedByDate.map(group => (
                            <AccordionItem key={group.date} value={group.date} className="border border-border-sub rounded-xl overflow-hidden bg-bg-secondary shadow-sm">
                                <AccordionTrigger className="px-5 py-3 hover:bg-bg-tertiary transition-colors hover:no-underline border-none">
                                    <div className="flex items-center gap-3 text-left">
                                        <div className="p-1.5 bg-bg-primary rounded text-brand-red border border-border-sub">
                                            <CalendarIcon size={16} />
                                        </div>
                                        <span className="text-sm font-black uppercase tracking-widest text-text-primary">{group.date}</span>
                                        <Badge variant="outline" className="text-[8px] bg-bg-primary h-4 px-2 tracking-tighter">{group.logs.length} SESSION(S)</Badge>
                                    </div>
                                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mr-6">Daily Tally: <span className="text-text-primary font-mono text-sm">{group.total.toFixed(1)}h</span></span>
                                </AccordionTrigger>
                                <AccordionContent className="p-3 space-y-2 bg-bg-primary/10">
                                    {group.logs.map(log => {
                                        const tech = technicians.find(t => t.id === log.technicianId);
                                        const isLive = !log.checkOutTime;
                                        const canEditNotes = !isReadOnly && log.technicianId === currentUserId;

                                        return (
                                            <div key={log.id} className={cn(
                                                "p-4 rounded-xl border space-y-3 text-left transition-all",
                                                isLive ? "bg-brand-red-dim/5 border-brand-red ring-1 ring-brand-red/10" : "bg-bg-secondary border-border-sub"
                                            )}>
                                                <div className="flex justify-between items-start">
                                                    <div className="flex items-center gap-3">
                                                        <Avatar className="h-6 w-6 border border-border-sub shadow-sm">
                                                            <AvatarFallback className="text-[8px] font-bold">{(tech?.name || 'U').charAt(0)}</AvatarFallback>
                                                        </Avatar>
                                                        <div className="text-left">
                                                            <p className="text-[10px] font-bold text-text-primary uppercase tracking-tight">{tech?.name}</p>
                                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-0.5">
                                                                <span className="text-[9px] text-text-muted font-bold flex items-center gap-1">
                                                                    <Clock size={10} className="text-brand-red"/>
                                                                    {displayTime(log.checkInTime)} — {log.checkOutTime ? displayTime(log.checkOutTime) : 'Session Active'}
                                                                </span>
                                                                <ProximityDisplay lat={log.checkInLat} lng={log.checkInLng} project={project} label="Check-In" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className={cn("text-lg font-mono font-bold leading-none", isLive ? "text-brand-red" : "text-text-green")}>
                                                            {isLive ? 'LIVE' : (log.totalHours || `${(log.hoursWorked || 0).toFixed(1)}h`)}
                                                        </p>
                                                        {isLive && <Badge variant="active" className="h-3.5 px-1.5 text-[7px] mt-1.5 animate-pulse uppercase">RECORDING</Badge>}
                                                    </div>
                                                </div>
                                                <div className="space-y-1 text-left">
                                                    <p className="text-[8px] font-black text-text-muted uppercase tracking-widest ml-1">Activity Notes</p>
                                                    {canEditNotes ? (
                                                        <Textarea 
                                                            defaultValue={log.workSummary}
                                                            onBlur={(e) => handleSaveLiveNotes(log.id, e.target.value)}
                                                            className="min-h-[60px] bg-bg-primary/50 border-border-sub text-[10px] uppercase font-medium leading-relaxed italic"
                                                            placeholder="Click to add field notes..."
                                                        />
                                                    ) : (
                                                        <div className="p-3 rounded-lg bg-bg-primary/50 border border-border-sub/50">
                                                            <p className="text-[10px] text-text-secondary leading-relaxed uppercase font-medium italic">
                                                                {log.workSummary || 'No activity summary provided.'}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                ) : (
                    <div className="p-24 text-center border-2 border-dashed border-border-sub rounded-2xl opacity-40 bg-bg-secondary/30">
                        <History size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                        <p className="text-[11px] font-bold uppercase tracking-widest text-center italic">Session ledger clear for this mission registry</p>
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
        let lat = 0;
        let lng = 0;
        
        try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
            });
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
        } catch (e) {
            console.warn("GPS Handshake Restricted");
        }

        const newLog: Omit<ProjectDailyLog, 'id'> = {
            projectId: project.id,
            technicianId: currentUserId,
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
            await addDoc(collection(db, 'projectDailyLogs'), newLog);
            toast({ title: 'Check In Validated', description: `Registry initialized for ${project.name}.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Registry Error', description: e.message });
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
            console.warn("GPS Handshake Restricted");
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

            toast({ title: 'Check Out Confirmed', description: `Session manifest committed to registry.` });
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
                {activeTab === 'milestones' && <MilestonesTab project={project} onTaskToggle={handleTaskToggle} documents={documents} isReadOnly={isReadOnly} />}
                {change === 'documents' && <DocumentsTab documents={documents} />}
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
