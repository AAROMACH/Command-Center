'use client';

import { useState, useMemo, useEffect } from 'react';
import type { Project, ProjectDailyLog, Technician, ProjectDocument } from '@/lib/types';
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
    if (!timeStr) return 'TBD';
    try {
        const [h, m] = timeStr.split(':');
        const d = new Date();
        d.setHours(parseInt(h), parseInt(m), 0);
        return format(d, 'h:mm a');
    } catch (e) {
        return timeStr;
    }
};

const ProximityDisplay = ({ lat, lng, project, label, size = 'default' }: { lat?: number, lng?: number, project: Project, label: string, size?: 'default' | 'large' }) => {
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

    const textClass = size === 'large' ? 'text-[13px]' : 'text-[11px]';
    const iconSize = size === 'large' ? 14 : 12;

    return (
        <span className={cn("flex items-center gap-2 font-black uppercase tracking-tight", textClass)}>
            <MapPin size={iconSize} className="text-brand-red shrink-0" />
            <span className="text-text-primary">{label}: {cityName || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}</span>
            {status && (
                <Badge variant={status.includes('Onsite') ? 'active' : 'missed'} className={cn("px-2 font-black uppercase tracking-widest", size === 'large' ? 'h-5 text-[9px]' : 'h-4 text-[8px]')}>
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
            toast({ title: "Registry Updated", description: "Operational briefing changes have been committed." });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Registry Error', description: e.message });
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
            <div className="lg:col-span-2 space-y-6">
                <section className="field-group">
                    <h3 className="field-group-title"><FileText size={14}/> Operational Scope</h3>
                    <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-4 text-left">
                        <div className="space-y-1 text-left">
                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest text-left">Primary Objective</p>
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
                    <h3 className="field-group-title"><MapPin size={14}/> Site Logistics</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-3 text-left">
                            <div className="space-y-1 text-left">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest text-left">Access Instructions</p>
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
                                <Label className="text-[10px] font-bold text-text-muted uppercase tracking-widest text-left">On-Site Contact</Label>
                                <Input 
                                    disabled={isReadOnly}
                                    className="h-8 text-xs font-bold uppercase"
                                    value={localProjectData.onsiteContactName || ''}
                                    onChange={e => setLocalProjectData({...localProjectData, onsiteContactName: e.target.value})}
                                />
                                <Input 
                                    disabled={isReadOnly}
                                    className="h-8 text-xs"
                                    value={localProjectData.onsiteContactPhone || ''}
                                    onChange={e => setLocalProjectData({...localProjectData, onsiteContactPhone: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {isDirty && !isReadOnly && (
                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="outline" className="h-9 px-6 uppercase text-[10px] font-bold tracking-widest" onClick={() => setLocalProjectData({
                            scope: project.scope,
                            onsiteContactName: project.onsiteContactName,
                            onsiteContactPhone: project.onsiteContactPhone,
                            siteAccessInstructions: project.siteAccessInstructions
                        })}>Discard Changes</Button>
                        <Button className="h-9 px-8 uppercase text-[10px] font-bold tracking-widest bg-brand-red" onClick={handleSaveChanges}>Commit Updates</Button>
                    </div>
                )}
            </div>

            <div className="space-y-6">
                <section className="field-group">
                    <h3 className="field-group-title"><Users size={14}/> Team Registry</h3>
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
                                        <p className="text-xs font-bold text-text-primary uppercase truncate text-left">{t?.name}</p>
                                        <p className="text-[9px] text-text-muted uppercase tracking-widest text-left">{member.role}</p>
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
                                <p className="text-sm font-bold text-text-primary uppercase tracking-wide text-left">{doc.name}</p>
                                <p className="text-[10px] text-text-muted uppercase tracking-widest mt-0.5 text-left">{doc.size} · Uploaded {doc.uploadDate}</p>
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

    const handleExportTimesheets = () => {
        const rows = [
            ['DATE', 'OPERATIVE', 'CHECK IN', 'CHECK OUT', 'HOURS', 'SUMMARY']
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
        toast({ title: "Export Complete", description: "Timesheet manifest has been generated." });
    };

    const currentUserId = typeof window !== 'undefined' ? sessionStorage.getItem('currentUserId') : null;

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* TACTICAL SESSION TERMINAL */}
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
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-primary text-left">
                                {activeSession ? "Mission Recording Active" : "Field Session Terminal"}
                            </p>
                            <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mt-0.5 text-left">
                                {activeSession ? `ID: ${activeSession.id?.split('-').pop()?.toUpperCase() || 'LIVE'} · Handshake Verified` : "Awaiting Site Arrival"}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        {activeSession && (
                            <div className="flex flex-col items-end">
                                <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">Active Duration</p>
                                <p className="text-3xl font-mono font-bold text-text-primary tabular-nums tracking-tighter">{elapsedTime}</p>
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
                                <div className="relative group/live-note">
                                    <Textarea 
                                        value={liveNotes}
                                        onChange={e => setLiveNotes(e.target.value)}
                                        onBlur={() => handleSaveLiveNotes(activeSession.id, liveNotes)}
                                        placeholder="Document site conditions, task completion details, and field obstacles..."
                                        className="min-h-[24px] bg-transparent border-none shadow-none focus-visible:ring-0 text-[8px] uppercase font-medium leading-relaxed italic resize-none p-0 text-left"
                                    />
                                    <Pencil size={10} className="absolute top-0 right-0 text-text-muted opacity-30 group-hover/live-note:opacity-100 transition-opacity pointer-events-none" />
                                </div>
                             </div>
                             <div className="space-y-4">
                                <div className="p-4 rounded-xl bg-bg-primary border border-border-sub shadow-inner space-y-4">
                                    <div className="flex items-center justify-between border-b border-border-sub/50 pb-2">
                                        <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Session Metadata</p>
                                        <ShieldCheck size={14} className="text-text-green" />
                                    </div>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="space-y-1 text-left">
                                            <p className="text-[8px] font-black text-text-muted uppercase text-left">Verified Site Presence</p>
                                            <ProximityDisplay lat={activeSession.checkInLat} lng={activeSession.checkInLng} project={project} label="Check-In" size="large" />
                                        </div>
                                        <div className="space-y-1 text-left">
                                            <p className="text-[8px] font-black text-text-muted uppercase text-left">Handshake Verification</p>
                                            <div className="flex items-center gap-2 text-text-primary">
                                                <Clock size={16} className="text-brand-red" />
                                                <p className="text-2xl font-mono font-bold uppercase tracking-tight">{displayTime(activeSession.checkInTime)}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-4 rounded-xl border border-dashed border-border-sub bg-bg-tertiary/20 text-center">
                                     <p className="text-[9px] text-text-muted uppercase font-bold leading-relaxed italic text-left">
                                         Terminal Note: All field notes are synchronized with the Command Center in real-time. Finalize all Milestones before checking out.
                                     </p>
                                </div>
                             </div>
                        </div>
                    </div>
                )}
            </div>

            <section className="space-y-2">
                <div className="flex items-center justify-between px-1 border-b border-border-sub pb-2">
                    <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] text-left">Historical Session Ledger</h3>
                    <Button variant="ghost" size="sm" className="h-5 text-[8px] uppercase font-bold text-text-muted hover:text-brand-red" onClick={handleExportTimesheets}>
                        <Download size={10} className="mr-1"/> Export Audit manifest
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
                                        <span className="text-sm font-black uppercase tracking-widest text-text-primary">{group.date}</span>
                                        <Badge variant="outline" className="text-[8px] bg-bg-primary h-4 px-2 tracking-tighter">{(group.logs || []).length} SESSION(S)</Badge>
                                    </div>
                                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mr-6">Daily Tally: <span className="text-text-primary font-mono text-sm">{group.total.toFixed(1)}h</span></span>
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
                                                                    <p className="text-[11px] font-black uppercase text-text-primary tracking-tight text-left">{tech?.name}</p>
                                                                    {isLive && <Badge variant="active" className="h-3.5 px-1.5 text-[7px] animate-pulse uppercase font-black">RECORDING</Badge>}
                                                                </div>
                                                                <div className="flex flex-col gap-2 text-left">
                                                                    <span className="text-[13px] text-text-primary font-black uppercase tracking-widest flex items-center gap-2 text-left">
                                                                        <Clock size={14} className="text-brand-red"/>
                                                                        {displayTime(log.checkInTime)} — {log.checkOutTime ? displayTime(log.checkOutTime) : 'Session Active'}
                                                                    </span>
                                                                    <div className="flex flex-wrap items-center gap-3 text-left">
                                                                        <ProximityDisplay lat={log.checkInLat} lng={log.checkInLng} project={project} label="Check-In" size="large" />
                                                                        {log.checkOutTime && <ProximityDisplay lat={log.checkOutLat} lng={log.checkOutLng} project={project} label="Check-Out" size="large" />}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className={cn("text-2xl font-mono font-bold leading-none tracking-tighter", isLive ? "text-brand-red" : "text-text-green")}>
                                                                {isLive ? 'LIVE' : (log.totalHours || `${(log.hoursWorked || 0).toFixed(1)}h`)}
                                                            </p>
                                                            <p className="text-[8px] font-black text-text-muted uppercase mt-1">Registry Log</p>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1.5 text-left border-t border-border-sub/30 pt-3">
                                                        <div className="flex items-center gap-2 text-text-muted mb-1 text-left">
                                                            <FileText size={12}/>
                                                            <p className="text-[9px] font-black uppercase tracking-widest text-left">Field Activity Report</p>
                                                        </div>
                                                        {canEditNotes ? (
                                                            <div className="relative group/hist-note text-left">
                                                                <Textarea 
                                                                    defaultValue={log.workSummary}
                                                                    onBlur={(e) => handleSaveLiveNotes(log.id, e.target.value)}
                                                                    className="min-h-[24px] bg-transparent border-none shadow-none focus-visible:ring-0 text-[8px] uppercase font-medium leading-relaxed italic resize-none p-0 text-left"
                                                                    placeholder="Click to add field notes..."
                                                                />
                                                                <Pencil size={10} className="absolute top-0 right-0 text-text-muted opacity-30 group-hover/hist-note:opacity-100 transition-opacity pointer-events-none" />
                                                            </div>
                                                        ) : (
                                                            <div className="p-3 rounded-lg bg-bg-primary/50 border border-border-sub/50 text-left">
                                                                <p className="text-[9px] text-text-secondary leading-relaxed uppercase font-medium italic text-left">
                                                                    {log.workSummary || 'No activity summary provided.'}
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

    const currentUserId = useMemo(() => typeof window !== 'undefined' ? sessionStorage.getItem('currentUserId') : null, []);
    const isReadOnly = project.status === 'completed';

    const activeSession = useMemo(() => 
        dailyLogs.find(log => log.techId === currentUserId && !log.checkOutTime),
    [dailyLogs, currentUserId]);

    const progress = getProgress(project);
    const progressColor = progress === 100 ? 'green' : progress > 0 ? 'gold' : 'red';
    
    const handleTaskToggle = async (phaseId: string, taskId: string) => {
        if (isReadOnly) return;

        const targetPhase = (project.phases || []).find(ph => ph.id === phaseId);
        const task = (targetPhase?.tasks || []).find(t => t.id === taskId);
        if (task && !task.isCompleted) {
            if (task.requiresPhoto && !task.photoUrl) {
                toast({ variant: 'destructive', title: 'Photo required', description: 'Upload a photo to complete this task.' }); return;
            }
            if (task.requiresText && !task.textValue?.trim()) {
                toast({ variant: 'destructive', title: 'Text required', description: 'Fill in the required text to complete this task.' }); return;
            }
            if (task.requiresNumeric && (task.numericValue === undefined || task.numericValue === null)) {
                toast({ variant: 'destructive', title: 'Count required', description: 'Enter a valid count to complete this task.' }); return;
            }
            if (task.requiresFileUpload && !task.fileUrl) {
                toast({ variant: 'destructive', title: 'Document required', description: 'Upload the required document to complete this task.' }); return;
            }
            if (task.requiresSignature && !task.signatureUrl) {
                toast({ variant: 'destructive', title: 'Signature required', description: 'Collect signature before completing.' }); return;
            }
        }

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
                        <div className="flex items-center gap-3 mb-1 text-left">
                            <h1 className="pdh-title text-left">{project.name}</h1>
                             <Badge variant={project.status} className="capitalize">{project.status}</Badge>
                        </div>
                        <div className="pdh-meta text-left">
                            <div className="pdh-meta-item text-left"><MapPin size={12}/>{project.location}</div>
                            <div className="pdh-meta-item text-left"><CalendarIcon size={12}/>Started {formatDateDisplay(project.startDate)}</div>
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
                <button className={`detail-tab ${activeTab === 'documents' ? 'active' : ''}`} onClick={() => setActiveTab('documents')}>Documents</button>
                <button className={`detail-tab ${activeTab === 'timesheets' ? 'active' : ''}`} onClick={() => setActiveTab('timesheets')}>Timesheets</button>
            </div>

            <div className="tab-content">
                {activeTab === 'overview' && <OverviewTab project={project} technicians={technicians} />}
                {activeTab === 'milestones' && <MilestonesTab project={project} onTaskToggle={handleTaskToggle} documents={documents} isReadOnly={isReadOnly} />}
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
