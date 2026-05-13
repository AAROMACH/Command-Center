'use client';

import { useState, useMemo } from 'react';
import type { Project, ProjectDailyLog, Task, Technician, ProjectDocument } from '@/lib/types';
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
  History
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {documents.map(doc => (
                    <Card key={doc.id} className="bg-bg-secondary border-border-sub hover:border-text-muted transition-all group">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className={cn(
                                    "p-2.5 rounded border flex items-center justify-center",
                                    doc.type === 'pdf' ? "bg-brand-red-dim border-brand-red text-text-red" :
                                    doc.type === 'img' ? "bg-green-dim border-green-border text-text-green" :
                                    "bg-bg-tertiary border-border-sub text-text-muted"
                                )}>
                                    {doc.type === 'img' ? <ImageIcon size={20}/> : <FileText size={20}/>}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-text-primary uppercase truncate tracking-tight">{doc.name}</p>
                                    <div className="flex items-center gap-2 mt-0.5 text-[9px] text-text-muted font-bold uppercase tracking-widest">
                                        <span>{doc.size}</span>
                                        <span>•</span>
                                        <span>{doc.uploader}</span>
                                    </div>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-text-muted hover:text-text-primary" onClick={() => toast({ title: "Handshake Initiated", description: `${doc.name} download in progress.`})}>
                                <Download size={16} />
                            </Button>
                        </CardContent>
                    </Card>
                ))}
                {documents.length === 0 && (
                    <div className="col-span-full py-12 text-center border-2 border-dashed border-border-sub rounded-xl opacity-40 bg-bg-secondary/30">
                        <FileText size={48} className="mx-auto text-text-muted mb-2" />
                        <p className="text-[10px] font-bold uppercase tracking-widest">Project document registry is empty</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const LogsTab = ({ dailyLogs, technicians, onSubmit }: { dailyLogs: ProjectDailyLog[], technicians: Technician[], onSubmit: () => void }) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
            <div className="lg:col-span-2 space-y-6">
                <section className="field-group">
                    <h3 className="field-group-title"><Clock size={14}/> Submit Daily Activity Log</h3>
                    <div className="space-y-4 pt-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-text-muted tracking-widest ml-1">Hours Logged</label>
                                <Input type="number" placeholder="e.g., 8.5" className="bg-bg-primary h-10 text-xs"/>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-text-muted tracking-widest ml-1">Reporting Date</label>
                                <Input type="date" defaultValue={new Date().toISOString().split('T')[0]} className="bg-bg-primary h-10 text-xs"/>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-text-muted tracking-widest ml-1">Mission Summary</label>
                            <Textarea className="bg-bg-primary min-h-[120px] text-xs leading-relaxed" placeholder="Summarize achievements, site conditions, or technical obstacles..."/>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                            <Button variant="outline" size="sm" className="h-9 px-6"><Paperclip size={14} className="mr-2"/> Attach Photo</Button>
                            <Button className="h-9 px-10" onClick={onSubmit}><Send size={16} className="mr-2"/> Commit Log</Button>
                        </div>
                    </div>
                </section>

                <section className="space-y-3">
                    <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1">Activity Timeline</h3>
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
                                        <Badge variant="outline" className="text-[8px] bg-bg-primary border-border-sub">{log.hoursWorked} HOURS</Badge>
                                    </div>
                                    <p className="text-xs text-text-secondary leading-relaxed uppercase font-medium italic">&quot;{log.workSummary}&quot;</p>
                                </div>
                            )
                        })}
                        {dailyLogs.length === 0 && (
                            <div className="p-12 text-center border-2 border-dashed border-border-sub rounded-xl opacity-40 bg-bg-secondary/30">
                                <History size={32} className="mx-auto mb-2 text-text-muted" />
                                <p className="text-[10px] font-bold uppercase tracking-widest">Timeline registry clear</p>
                            </div>
                        )}
                    </div>
                </section>
            </div>

            <div className="space-y-6">
                <Card className="bg-bg-tertiary/30 border-border-sub">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-[10px] uppercase tracking-widest flex items-center gap-2">
                            <ShieldAlert size={14} className="text-accent-gold"/> Reporting Protocol
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-[10px] text-text-secondary leading-relaxed uppercase font-medium">
                            Daily logs are used to verify mission progress and trigger logistical updates in the Command Center. Ensure all significant site anomalies are documented.
                        </p>
                        <div className="p-3 rounded bg-bg-primary border border-border-sub">
                            <p className="text-[9px] font-bold text-text-muted uppercase mb-1">Standard Cutoff</p>
                            <p className="text-[11px] font-bold text-text-primary uppercase">EOD 20:00 LOCAL</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
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
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
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
export function ProjectDetailClient({ project: initialProject, dailyLogs, technicians, documents }: { project: Project, dailyLogs: ProjectDailyLog[], technicians: Technician[], documents: ProjectDocument[] }) {
    const [project, setProject] = useState(initialProject);
    const [activeTab, setActiveTab] = useState('overview');
    const { toast } = useToast();

    const progress = getProgress(project);
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

    const handleSubmitLog = () => {
        toast({ title: 'Daily Log Committed', description: 'Activity has been recorded in the project registry.' });
    }

    return (
        <div>
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
                            <div className="pdh-meta-item"><MapPin/>{project.location}</div>
                            <div className="pdh-meta-item"><Calendar/>Started {formatDateDisplay(project.startDate)}</div>
                            <div className="pdh-meta-item"><Users/>{project.team.length} Team Members</div>
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
                        <TabsTrigger value="logs" className="tab-trigger-tech">Logs</TabsTrigger>
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
                    <TabsContent value="logs" className="m-0">
                        <LogsTab dailyLogs={dailyLogs} technicians={technicians} onSubmit={handleSubmitLog} />
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
