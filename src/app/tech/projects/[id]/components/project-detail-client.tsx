'use client';

import { useState, useMemo, useEffect } from 'react';
import type { Project, ProjectDailyLog, Task, Technician, ProjectDocument, TimesheetLog } from '@/lib/types';
import Link from 'next/link';
import {
  ChevronLeft,
  MapPin,
  Calendar,
  Clock,
  Users,
  ChevronDown,
  Camera,
  Plus,
  Paperclip,
  Send,
  FileText,
  Hash,
  ListTodo,
  Signature,
  Upload,
  User,
  Trash2,
  Info,
  AlertTriangle,
  Building2,
  FileCheck,
  ShieldAlert,
  Download,
  ImageIcon,
  History,
  Circle,
  Play,
  LogOut,
  CheckCircle2,
  ExternalLink,
  X,
  Check
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';
import { format, parseISO, differenceInMinutes, addDays } from 'date-fns';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from '@/components/ui/scroll-area';

// --- HELPERS ---
function getProgress(project: Project): number {
    const allTasks = project.phases.flatMap(phase => phase.tasks);
    if (allTasks.length === 0) return 0;
    const completedTasks = allTasks.filter(task => task.isCompleted).length;
    return (completedTasks / allTasks.length) * 100;
}

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

// --- SUB-COMPONENTS ---

const OverviewTab = ({ project, technicians }: { project: Project, technicians: Technician[] }) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
            <div className="lg:col-span-2 space-y-6">
                <section className="field-group">
                    <h3 className="field-group-title"><FileText size={14}/> Operational Scope</h3>
                    <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-4">
                        <div className="space-y-1">
                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Primary Objective</p>
                            <p className="text-sm text-text-primary leading-relaxed uppercase font-medium">{project.scope}</p>
                        </div>
                    </div>
                </section>

                <section className="field-group">
                    <h3 className="field-group-title"><MapPin size={14}/> Site Logistics</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-3">
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Access Instructions</p>
                                <p className="text-xs text-text-secondary leading-relaxed">{project.siteAccessInstructions || 'No special instructions provided.'}</p>
                            </div>
                        </div>
                        <div className="p-4 rounded-lg bg-bg-primary border border-border-sub space-y-3">
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">On-Site Contact</p>
                                <p className="text-xs font-bold text-text-primary uppercase">{project.onsiteContact || 'Contact registry clear.'}</p>
                            </div>
                        </div>
                    </div>
                </section>

                {project.siteHazardNotes.length > 0 && (
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
                        {project.team.map(member => {
                            const t = technicians.find(tech => tech.id === member.technicianId);
                            return (
                                <div key={member.technicianId} className="flex items-center gap-3 p-3 rounded-lg bg-bg-primary border border-border-sub">
                                    <Avatar className="h-8 w-8 border border-border-sub">
                                        <AvatarImage src={t?.avatarUrl} />
                                        <AvatarFallback>{t?.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
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

const MilestonesTab = ({ project, onTaskToggle, documents }: { project: Project, onTaskToggle: (pid: string, tid: string) => void, documents: ProjectDocument[] }) => {
    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {project.phases.map(phase => (
                <PhaseBlock key={phase.id} phase={phase} onTaskToggle={onTaskToggle} documents={documents} />
            ))}
            {project.phases.length === 0 && (
                <div className="p-24 text-center border-2 border-dashed border-border-sub rounded-xl opacity-40 bg-bg-secondary/30">
                    <History size={48} className="mx-auto text-text-muted mb-2" />
                    <p className="text-[10px] font-bold uppercase tracking-widest">No milestones defined for this mission registry</p>
                </div>
            )}
        </div>
    );
};

const DocumentsTab = ({ documents }: { documents: ProjectDocument[] }) => {
    const { toast } = useToast();
    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex justify-between items-center mb-4 px-1">
                <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest">{documents.length} Site Assets Registry</p>
                <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold uppercase" onClick={() => toast({ title: "Upload terminal initialized", description: "Select field documents for project registry."})}>
                    <Plus size={14} className="mr-1.5"/> Add Document
                </Button>
            </div>
            <div className="space-y-2">
                {documents.map(doc => (
                    <Card key={doc.id} className="bg-bg-secondary border-border-sub hover:border-text-muted transition-all group">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                <div className={cn(
                                    "p-2.5 rounded border flex items-center justify-center",
                                    doc.type === 'pdf' ? "bg-brand-red-dim border-brand-red text-text-red" :
                                    doc.type === 'img' ? "bg-green-dim border-green-border text-text-green" :
                                    "bg-bg-tertiary border-border-sub text-text-muted"
                                )}>
                                    {doc.type === 'img' ? <ImageIcon size={20}/> : <FileText size={20}/>}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-text-primary uppercase tracking-wide truncate max-w-[400px]">{doc.name}</p>
                                    <div className="flex items-center gap-4 mt-0.5 text-[10px] text-text-muted font-bold uppercase tracking-widest">
                                        <span>{doc.size}</span>
                                        <span>•</span>
                                        <span className="flex items-center gap-1"><User size={10}/> {doc.uploader}</span>
                                        <span>•</span>
                                        <span>{doc.uploadDate}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" className="h-9 w-9 text-text-muted hover:text-text-primary" onClick={() => toast({ title: "Handshake Initiated", description: `${doc.name} download in progress.`})}>
                                    <Download size={18} />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-9 w-9 text-text-muted hover:text-text-red">
                                    <Trash2 size={18} />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {documents.length === 0 && (
                    <div className="col-span-full py-24 text-center border-2 border-dashed border-border-sub rounded-xl opacity-40 bg-bg-secondary/30">
                        <FileText size={48} className="mx-auto text-text-muted mb-2" />
                        <p className="text-[10px] font-bold uppercase tracking-widest">Project document registry is empty</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const TimesheetsTab = ({ dailyLogs, technicians, onCheckIn, onCheckOut, activeSession, onManualAdd }: { dailyLogs: ProjectDailyLog[], technicians: Technician[], onCheckIn: () => void, onCheckOut: () => void, activeSession: any, onManualAdd: (log: ProjectDailyLog) => void }) => {
    const [isManualOpen, setIsManualOpen] = useState(false);
    const [elapsedTime, setElapsedTime] = useState('00:00:00');
    const { toast } = useToast();

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (activeSession) {
            interval = setInterval(() => {
                const now = new Date();
                const diff = now.getTime() - activeSession.startTime.getTime();
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

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 gap-6">
                {/* Check-In / Check-Out Shared Console */}
                <section className="field-group border-2 border-brand-red/30 bg-brand-red-dim/5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="field-group-title !mb-0"><Clock size={14}/> Session Terminal</h3>
                        <div className="flex items-center gap-3">
                            <Button variant="outline" size="sm" className="h-7 text-[9px] uppercase font-bold tracking-widest border-accent-gold text-accent-gold hover:bg-accent-gold/10" onClick={() => setIsManualOpen(true)}>
                                <History size={12} className="mr-1.5"/> Manual Entry
                            </Button>
                            {activeSession ? (
                                <Badge variant="active" className="animate-pulse">LIVE SESSION</Badge>
                            ) : (
                                <Badge variant="outline" className="text-text-muted">IDLE</Badge>
                            )}
                        </div>
                    </div>
                    
                    <div className="p-6 rounded-xl bg-bg-primary border border-border-sub flex flex-col items-center text-center space-y-6">
                        {!activeSession ? (
                            <>
                                <div className="p-4 bg-bg-tertiary rounded-full border border-border-sub text-text-muted">
                                    <MapPin size={32} />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-bold text-text-primary uppercase tracking-wide">Awaiting On-Site Verification</p>
                                    <p className="text-xs text-text-muted max-w-xs">GPS-verified check-in is required to initiate a billable field session.</p>
                                </div>
                                <Button className="w-full max-w-sm h-12 bg-brand-red hover:bg-brand-red-hover text-sm font-bold uppercase tracking-widest" onClick={onCheckIn}>
                                    <Play size={18} className="mr-2 fill-current" /> Initialize Session
                                </Button>
                            </>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 gap-12 w-full max-w-sm">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Started At</p>
                                        <p className="text-xl font-mono font-bold text-text-green">{format(activeSession.startTime, 'hh:mm:ss a')}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Active Duration</p>
                                        <p className="text-xl font-mono font-bold text-text-primary">{elapsedTime}</p>
                                    </div>
                                </div>
                                <div className="w-full space-y-4">
                                    <div className="space-y-1.5 text-left">
                                        <label className="text-[10px] font-bold uppercase text-text-muted tracking-widest ml-1">EOD Mission Summary</label>
                                        <Textarea className="bg-bg-secondary min-h-[100px] text-xs leading-relaxed" placeholder="Document achievements and site conditions..."/>
                                    </div>
                                    <Button variant="destructive" className="w-full h-12 text-sm font-bold uppercase tracking-widest" onClick={onCheckOut}>
                                        <LogOut size={18} className="mr-2" /> Finalize & Check-Out
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                </section>

                <section className="space-y-3">
                    <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1">Timesheet Manifest</h3>
                    <div className="space-y-2">
                        {dailyLogs.map(log => {
                            const tech = technicians.find(t => t.id === log.technicianId);
                            return (
                                <div key={log.id} className="p-4 rounded-xl border border-border-sub bg-bg-secondary space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-7 w-7 border border-border-sub">
                                                <AvatarImage src={tech?.avatarUrl} />
                                                <AvatarFallback>{tech?.name.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{tech?.name || 'Field Operative'}</p>
                                                <p className="text-[9px] text-text-muted font-mono uppercase tracking-widest">{formatDateDisplay(log.date)}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <Badge variant="outline" className="text-[8px] bg-bg-primary border-border-sub text-text-green">{log.hoursWorked} HOURS</Badge>
                                        </div>
                                    </div>
                                    <p className="text-xs text-text-secondary leading-relaxed uppercase font-medium italic">&quot;{log.workSummary}&quot;</p>
                                </div>
                            )
                        })}
                        {dailyLogs.length === 0 && (
                            <div className="p-12 text-center border-2 border-dashed border-border-sub rounded-xl opacity-40 bg-bg-secondary/30">
                                <History size={32} className="mx-auto mb-2 text-text-muted" />
                                <p className="text-[10px] font-bold uppercase tracking-widest">No verified sessions found</p>
                            </div>
                        )}
                    </div>
                </section>
            </div>

            <ManualSessionDialog 
                isOpen={isManualOpen} 
                setIsOpen={setIsManualOpen} 
                onSave={(log) => {
                    onManualAdd(log);
                    setIsManualOpen(false);
                }}
            />
        </div>
    );
};

const ManualSessionDialog = ({ isOpen, setIsOpen, onSave }: { isOpen: boolean, setIsOpen: (val: boolean) => void, onSave: (log: ProjectDailyLog) => void }) => {
    const [formData, setFormData] = useState({
        date: format(new Date(), 'yyyy-MM-dd'),
        startTime: '09:00',
        endTime: '17:00',
        summary: ''
    });

    const handleSave = () => {
        if (!formData.summary) return;

        const start = new Date(`${formData.date}T${formData.startTime}`);
        const end = new Date(`${formData.date}T${formData.endTime}`);
        const durationMinutes = differenceInMinutes(end, start);
        const hours = (durationMinutes / 60).toFixed(1);

        const newLog: ProjectDailyLog = {
            id: `pdl-manual-${Date.now()}`,
            projectId: '', // Parent will set
            technicianId: localStorage.getItem('currentUserId') || 'unknown',
            date: formData.date,
            hoursWorked: parseFloat(hours),
            workSummary: formData.summary,
            taskIdsProgressed: [],
            taskIdsCompleted: [],
            phaseIdsWorked: [],
            materialsUsed: [],
            photoUrls: []
        };

        onSave(newLog);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default">
                <DialogHeader>
                    <div className="flex items-center gap-2 mb-1">
                        <History className="text-accent-gold h-5 w-5" />
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest">Log Manual Session</DialogTitle>
                    </div>
                    <DialogDescription className="text-xs">Provide historical work parameters for administrative audit.</DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-6">
                    <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-text-muted">Work Date</Label>
                        <Input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="bg-bg-primary h-10 text-xs" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-text-muted">Start Time</Label>
                            <Input type="time" value={formData.startTime} onChange={e => setFormData({...formData, startTime: e.target.value})} className="bg-bg-primary h-10 text-xs" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-text-muted">End Time</Label>
                            <Input type="time" value={formData.endTime} onChange={e => setFormData({...formData, endTime: e.target.value})} className="bg-bg-primary h-10 text-xs" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-text-muted">Mission Summary</Label>
                        <Textarea 
                            placeholder="Detailed account of tasks performed..." 
                            value={formData.summary}
                            onChange={e => setFormData({...formData, summary: e.target.value})}
                            className="bg-bg-primary min-h-[120px] text-xs leading-relaxed"
                        />
                    </div>
                </div>

                <DialogFooter className="bg-bg-tertiary/30 -mx-6 -mb-6 p-6 border-t border-border-default">
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                    <Button onClick={handleSave} className="bg-brand-red hover:bg-brand-red-hover px-8">
                        <Check size={16} className="mr-2"/> Commit to Registry
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const PhaseBlock = ({
  phase,
  onTaskToggle,
  documents,
}: {
  phase: Project['phases'][0];
  onTaskToggle: (phaseId: string, taskId: string) => void;
  documents: ProjectDocument[];
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const { toast } = useToast();
  
  const completedTasks = phase.tasks.filter((t) => t.isCompleted).length;
  const totalTasks = phase.tasks.length;
  const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  const status =
    progress === 100 ? 'completed' : progress > 0 ? 'inprogress' : 'pending';

  const findPhotosForTask = (taskId: string) => {
    return documents.filter(doc => doc.taskId === taskId && doc.type === 'img');
  };

  return (
    <div className="phase-block">
      <header className="phase-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="phase-num">{phase.phaseNumber}</div>
        <h3 className="phase-name">{phase.name}</h3>
        <div className="phase-meta">
          <span>{totalTasks} task{totalTasks !== 1 && 's'}</span>
          <Badge variant={status}>{status}</Badge>
        </div>
        <div className={cn("phase-chevron transition-transform", isOpen ? "rotate-180" : "")}>
          <ChevronDown size={16}/>
        </div>
      </header>
      {isOpen && (
        <>
          <div className="phase-progress">
            <div className="progress-wrap !mb-2">
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress}%` }}></div>
              </div>
              <div className="progress-pct">{Math.round(progress)}%</div>
            </div>
          </div>
          <div className="tasks-list">
            {phase.tasks.map((task) => {
              const taskPhotos = findPhotosForTask(task.id);
              return (
                <div key={task.id} className="p-3 border-b border-border-sub hover:bg-bg-tertiary/50 transition-colors">
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id={`task-${task.id}`}
                      checked={task.isCompleted}
                      onCheckedChange={() => onTaskToggle(phase.id, task.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                        <label
                          htmlFor={`task-${task.id}`}
                          className={cn("text-[13px] font-semibold text-text-primary block cursor-pointer", task.isCompleted ? 'text-text-muted line-through' : '')}
                        >
                          {task.name}
                        </label>
                        
                        <div className="flex flex-wrap gap-1 mt-1.5">
                            {task.requiresPhoto && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><Camera size={10}/> Photo</div>}
                            {task.requiresText && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><FileText size={10}/> Text</div>}
                            {task.requiresNumeric && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><Hash size={10}/> Number</div>}
                            {task.requiresDropdown && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><ListTodo size={10}/> List</div>}
                            {task.requiresSignature && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><Signature size={10}/> Sign</div>}
                            {task.requiresFileUpload && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><Upload size={10}/> File</div>}
                            {task.requiresOther && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><Plus size={10}/> {task.otherRequirementLabel || 'Req.'}</div>}
                        </div>

                        {taskPhotos.length > 0 && (
                            <div className="mt-3 grid grid-cols-3 gap-2">
                                {taskPhotos.map(photo => (
                                    <div key={photo.id} className="relative group aspect-video rounded border border-border-sub overflow-hidden bg-bg-primary">
                                        <Image src={photo.url || ''} alt={photo.name} fill className="object-cover" />
                                        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                                            <p className="text-[8px] text-white font-bold uppercase truncate">{photo.name}</p>
                                            <p className="text-[7px] text-text-secondary flex items-center gap-1"><User size={8}/> {photo.uploader}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    {task.requiresPhoto && (
                      <Button variant="outline" size="sm" className="h-7 text-[10px] uppercase font-bold tracking-widest px-2" onClick={() => toast({ title: "Terminal Initialized", description: "Select site photo for task verification."})}>
                        <Camera size={13} className="mr-1.5"/> Add Photo
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};


// --- MAIN COMPONENT ---
export function ProjectDetailClient({ project: initialProject, dailyLogs: initialDailyLogs, technicians, documents }: { project: Project, dailyLogs: ProjectDailyLog[], technicians: Technician[], documents: ProjectDocument[] }) {
    const [project, setProject] = useState(initialProject);
    const [dailyLogs, setDailyLogs] = useState(initialDailyLogs);
    const [activeTab, setActiveTab] = useState('overview');
    const [activeSession, setActiveSession] = useState<any>(null);
    const { toast } = useToast();

    useEffect(() => {
        setProject(initialProject);
    }, [initialProject]);

    const progress = useMemo(() => {
        const allTasks = project.phases.flatMap(phase => phase.tasks);
        if (allTasks.length === 0) return 0;
        const completedTasks = allTasks.filter(task => task.isCompleted).length;
        return (completedTasks / allTasks.length) * 100;
    }, [project.phases]);

    const progressColor = progress === 100 ? 'green' : progress > 0 ? 'gold' : 'red';
    
    const handleTaskToggle = (phaseId: string, taskId: string) => {
        setProject(currentProject => ({
            ...currentProject,
            phases: currentProject.phases.map(phase => {
                if (phase.id === phaseId) {
                    return {
                        ...phase,
                        tasks: phase.tasks.map(task => 
                            task.id === taskId ? { ...task, isCompleted: !task.isCompleted } : task
                        )
                    };
                }
                return phase;
            })
        }));
        toast({
            title: "Task Registry Updated",
            description: "Mission status has been synchronized with the Command Center."
        });
    };

    const handleCheckIn = () => {
        setActiveSession({
            startTime: new Date(),
            location: project.location
        });
        toast({ title: 'Checked In', description: 'GPS verified. Project session initialized.' });
    };

    const handleCheckOut = () => {
        setActiveSession(null);
        toast({ title: 'Session Finalized', description: 'Timesheet log committed to project registry.' });
    };

    const handleManualAdd = (log: ProjectDailyLog) => {
        setDailyLogs(prev => [log, ...prev]);
        toast({ title: 'Manual Entry Recorded', description: 'Timesheet record appended to mission manifest.' });
    };

    return (
        <div className="animate-in fade-in duration-500">
            <div className="detail-nav">
                <Link href="/tech/projects" className="detail-back">
                    <ChevronLeft size={16} />
                    Back to Projects
                </Link>
                <div className="detail-breadcrumb">/ <span>{project.id.toUpperCase()}</span> / <span className="text-text-primary">{project.name}</span></div>
            </div>

            <div className="project-detail-header">
                <div className="pdh-top">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="pdh-title">{project.name}</h1>
                             <Badge variant={project.status} className="capitalize">{project.status}</Badge>
                        </div>
                        <div className="pdh-meta">
                            <div className="pdh-meta-item"><MapPin size={12}/> {project.location}</div>
                            <div className="pdh-meta-item"><Calendar size={12}/> Started {formatDateDisplay(project.startDate)}</div>
                            <div className="pdh-meta-item"><Users size={12}/> {project.team.length} Team Members</div>
                        </div>
                    </div>
                </div>
                 <div className="pdh-progress">
                    <div className="pdh-progress-label">Phase Progress</div>
                    <div className="progress-wrap !flex-1">
                        <div className="progress-track !h-[10px]"><div className={cn("progress-fill flashy", progressColor)} style={{ width: `${progress}%` }}></div></div>
                        <div className={cn("progress-pct font-mono font-bold text-lg", `text-${progressColor}`)}>{Math.round(progress)}%</div>
                    </div>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex justify-center border-b border-border-main mb-6">
                    <TabsList className="tabs bg-transparent p-0 h-auto gap-8">
                        <TabsTrigger value="overview" className="tab-trigger-tech">Project Overview</TabsTrigger>
                        <TabsTrigger value="milestones" className="tab-trigger-tech">Milestones</TabsTrigger>
                        <TabsTrigger value="documents" className="tab-trigger-tech">Documents</TabsTrigger>
                        <TabsTrigger value="timesheets" className="tab-trigger-tech">Timesheets</TabsTrigger>
                    </TabsList>
                </div>

                <div className="min-h-[400px]">
                    <TabsContent value="overview" className="m-0">
                        <OverviewTab project={project} technicians={technicians} />
                    </TabsContent>
                    <TabsContent value="milestones" className="m-0">
                        <MilestonesTab project={project} onTaskToggle={handleTaskToggle} documents={documents} />
                    </TabsContent>
                    <TabsContent value="documents" className="m-0">
                        <DocumentsTab documents={documents} />
                    </TabsContent>
                    <TabsContent value="timesheets" className="m-0">
                        <TimesheetsTab 
                            dailyLogs={dailyLogs} 
                            technicians={technicians} 
                            onCheckIn={handleCheckIn} 
                            onCheckOut={handleCheckOut} 
                            activeSession={activeSession}
                            onManualAdd={handleManualAdd}
                        />
                    </TabsContent>
                </div>
            </Tabs>

            <style jsx global>{`
                .tab-trigger-tech {
                    @apply px-0 pb-3 pt-0 h-auto bg-transparent rounded-none border-b-2 border-transparent text-[11px] font-black uppercase tracking-[0.2em] text-text-muted data-[state=active]:bg-transparent data-[state=active]:text-text-primary data-[state=active]:border-brand-red data-[state=active]:shadow-none transition-all;
                }
            `}</style>
        </div>
    );
}
