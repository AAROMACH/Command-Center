'use client';

import { useState, useMemo } from 'react';
import type { Project, Technician, ProjectDocument, TimesheetLog } from '@/lib/types';
import Link from 'next/link';
import { 
  ChevronLeft, 
  MapPin, 
  Calendar, 
  Clock, 
  Users, 
  Edit, 
  Archive, 
  Check, 
  X, 
  ShieldAlert, 
  DollarSign, 
  Timer, 
  Building2, 
  User,
  FileText,
  Phone,
  LayoutDashboard
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OverviewTab } from './overview-tab';
import { MilestonesTab } from './milestones-tab';
import { DocumentsTab } from './documents-tab';
import { TimesheetsTab } from './timesheets-tab';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Separator } from '@/components/ui/separator';
import { format, parseISO } from 'date-fns';

type ProjectDetailClientProps = {
    project: Project;
    technicians: Technician[];
    documents: ProjectDocument[];
    timesheets: TimesheetLog[];
};

export function ProjectDetailClient({ project: initialProject, technicians, documents: initialDocuments, timesheets: initialTimesheets }: ProjectDetailClientProps) {
    const [project, setProject] = useState(initialProject);
    const [documents, setDocuments] = useState(initialDocuments);
    const [timesheets, setTimesheets] = useState(initialTimesheets);
    const [activeTab, setActiveTab] = useState('overview');
    
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editedProject, setEditedProject] = useState<Project>(initialProject);
    const { toast } = useToast();
    const router = useRouter();

    const progress = useMemo(() => {
        const allTasks = project.phases.flatMap(phase => phase.tasks);
        if (allTasks.length === 0) return 0;
        const completedTasks = allTasks.filter(task => task.isCompleted).length;
        return (completedTasks / allTasks.length) * 100;
    }, [project.phases]);

    const progressColor = progress === 100 ? 'green' : progress > 0 ? 'gold' : 'red';

    const formatDateDisplay = (dateStr: string) => {
        try {
          return format(parseISO(dateStr), "MM-dd-yyyy");
        } catch (e) {
          return dateStr;
        }
    };

    const handleSaveEdit = () => {
        setProject(editedProject);
        setIsEditOpen(false);
        toast({
            title: "Project Registry Updated",
            description: "New parameters have been committed to the project folder.",
        });
    };

    const handleArchive = () => {
        setIsEditOpen(false);
        toast({
            variant: "destructive",
            title: "Project Archived",
            description: `${project.name} has been moved to the historical archive.`,
        });
        router.push('/admin/projects');
    };

    return (
        <div>
            <div className="detail-nav">
                <Link href="/admin/projects" className="detail-back">
                    <ChevronLeft size={16} />
                    Back to Projects
                </Link>
                <div className="detail-breadcrumb">/ <span>{project.name}</span></div>
                <div className="ml-auto flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setEditedProject(project); setIsEditOpen(true); }} className="h-8 !text-[10px]">
                        <Edit size={12} className="mr-1.5"/> Edit Project
                    </Button>
                </div>
            </div>

            <div className="project-detail-header">
                <div className="pdh-top">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="pdh-title">{project.name} — {project.location}</h1>
                             <Badge variant={project.status} className="capitalize">{project.status}</Badge>
                        </div>
                        <div className="pdh-meta">
                            <div className="pdh-meta-item"><MapPin/>{project.location}</div>
                            <div className="pdh-meta-item"><Calendar/>Started {formatDateDisplay(project.startDate)}</div>
                            <div className="pdh-meta-item"><Clock/>Est. {project.estimatedDuration}</div>
                            <div className="pdh-meta-item"><Users/>{project.team.length} Technician(s)</div>
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
                <button className={`detail-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
                <button className={`detail-tab ${activeTab === 'milestones' ? 'active' : ''}`} onClick={() => setActiveTab('milestones')}>Milestones</button>
                <button className={`detail-tab ${activeTab === 'documents' ? 'active' : ''}`} onClick={() => setActiveTab('documents')}>Documents</button>
                <button className={`detail-tab ${activeTab === 'timesheets' ? 'active' : ''}`} onClick={() => setActiveTab('timesheets')}>Timesheets</button>
            </div>

            <div className="tab-content">
                {activeTab === 'overview' && <OverviewTab project={project} setProject={setProject} allTechnicians={technicians} />}
                {activeTab === 'milestones' && <MilestonesTab project={project} setProject={setProject} />}
                {activeTab === 'documents' && <DocumentsTab project={project} documents={documents} setDocuments={setDocuments} />}
                {activeTab === 'timesheets' && <TimesheetsTab timesheets={timesheets} setTimesheets={setTimesheets} technicians={technicians} projectId={project.id}/>}
            </div>

            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="sm:max-w-[900px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[95vh]">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30">
                        <div className="flex items-center justify-between">
                            <div>
                                <DialogTitle className="uppercase tracking-widest font-bold text-lg">Modify Project Registry</DialogTitle>
                                <DialogDescription>Update master parameters for project <span className="text-brand-red font-mono">{project.id.toUpperCase()}</span>.</DialogDescription>
                            </div>
                            <div className="flex items-center gap-3">
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" className="h-8 px-2 text-[9px] text-text-muted hover:text-text-red hover:bg-brand-red/10 uppercase tracking-widest font-bold">
                                            <Archive size={12} className="mr-1.5"/> Archive Project
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="bg-bg-elevated border-border-main">
                                        <AlertDialogHeader>
                                            <AlertDialogTitle className="uppercase tracking-widest font-bold">Authorize Archival?</AlertDialogTitle>
                                            <AlertDialogDescription className="text-xs">
                                                Warning: This will terminate the active lifecycle of project <span className="font-bold text-text-primary">{project.name}</span>. The folder will move to historical storage.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel className="text-[10px] uppercase font-bold">Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleArchive} className="bg-brand-red hover:bg-brand-red-hover text-[10px] uppercase font-bold">
                                                Confirm Archival
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                                
                                <Separator orientation="vertical" className="h-4 bg-border-sub" />

                                <Label className="text-[10px] font-bold uppercase text-text-muted">Status</Label>
                                <Select value={editedProject.status} onValueChange={(val: any) => setEditedProject({...editedProject, status: val})}>
                                    <SelectTrigger className="h-8 w-[140px] bg-bg-primary text-[10px] uppercase font-bold tracking-widest">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="on-hold">On Hold</SelectItem>
                                        <SelectItem value="completed">Completed</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                            {/* Section 1: Identity & Location */}
                            <div className="space-y-6">
                                <h3 className="text-[10px] font-bold text-brand-red uppercase tracking-[0.2em] flex items-center gap-2 border-b border-border-sub pb-2">
                                    <Building2 size={12}/> Identity & Coordinates
                                </h3>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-text-muted">Project Name</Label>
                                        <Input 
                                            value={editedProject.name} 
                                            onChange={e => setEditedProject({...editedProject, name: e.target.value})}
                                            className="bg-bg-primary h-10 text-xs font-bold uppercase"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-text-muted">Client Entity</Label>
                                        <Input 
                                            value={editedProject.client} 
                                            onChange={e => setEditedProject({...editedProject, client: e.target.value})}
                                            className="bg-bg-primary h-10 text-xs"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-text-muted">Operational Address</Label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
                                            <Input 
                                                value={editedProject.location} 
                                                onChange={e => setEditedProject({...editedProject, location: e.target.value})}
                                                className="bg-bg-primary h-10 text-xs pl-10"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-text-muted">On-Site Contact</Label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
                                            <Input 
                                                placeholder="Name and phone number..."
                                                value={editedProject.onsiteContact || ''} 
                                                onChange={e => setEditedProject({...editedProject, onsiteContact: e.target.value})}
                                                className="bg-bg-primary h-10 text-xs pl-10"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Operational Instructions */}
                            <div className="space-y-6">
                                <h3 className="text-[10px] font-bold text-accent-gold uppercase tracking-[0.2em] flex items-center gap-2 border-b border-border-sub pb-2">
                                    <ShieldAlert size={12}/> Operational Briefing
                                </h3>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-text-muted">Scope of Work</Label>
                                        <Textarea 
                                            value={editedProject.scope} 
                                            onChange={e => setEditedProject({...editedProject, scope: e.target.value})}
                                            className="bg-bg-primary h-24 text-[11px] leading-relaxed resize-none"
                                            placeholder="Define primary objectives and technical requirements..."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-text-muted">Access Instructions</Label>
                                        <Textarea 
                                            value={editedProject.siteAccessInstructions || ''} 
                                            onChange={e => setEditedProject({...editedProject, siteAccessInstructions: e.target.value})}
                                            className="bg-bg-primary h-20 text-[11px] leading-relaxed resize-none"
                                            placeholder="Parking, entry codes, badge requirements..."
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Section 3: Schedule & Duration */}
                            <div className="space-y-6">
                                <h3 className="text-[10px] font-bold text-brand-red uppercase tracking-[0.2em] flex items-center gap-2 border-b border-border-sub pb-2">
                                    <Clock size={12}/> Schedule & Duration
                                </h3>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase text-text-muted">Start Date</Label>
                                            <Input 
                                                type="date"
                                                value={editedProject.startDate} 
                                                onChange={e => setEditedProject({...editedProject, startDate: e.target.value})}
                                                className="bg-bg-primary h-10 text-xs"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase text-text-muted">Daily Start Time</Label>
                                            <Input 
                                                placeholder="e.g. 9:00 AM EDT"
                                                value={editedProject.startTime || ''} 
                                                onChange={e => setEditedProject({...editedProject, startTime: e.target.value})}
                                                className="bg-bg-primary h-10 text-xs"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-text-muted">Estimated Project Duration</Label>
                                        <div className="relative">
                                            <Timer className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
                                            <Input 
                                                placeholder="e.g. 3 weeks"
                                                value={editedProject.estimatedDuration} 
                                                onChange={e => setEditedProject({...editedProject, estimatedDuration: e.target.value})}
                                                className="bg-bg-primary h-10 text-xs pl-10"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 4: Economics */}
                            <div className="space-y-6">
                                <h3 className="text-[10px] font-bold text-text-green uppercase tracking-[0.2em] flex items-center gap-2 border-b border-border-sub pb-2">
                                    <DollarSign size={12}/> Project Economics
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-text-muted">Project Budget ($)</Label>
                                        <Input 
                                            type="number"
                                            value={editedProject.projectBudget || 0} 
                                            onChange={e => setEditedProject({...editedProject, projectBudget: parseFloat(e.target.value) || 0})}
                                            className="bg-bg-primary h-10 text-xs font-mono"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-text-muted">Allocated Hours</Label>
                                        <Input 
                                            type="number"
                                            value={editedProject.estimatedHours || 0} 
                                            onChange={e => setEditedProject({...editedProject, estimatedHours: parseFloat(e.target.value) || 0})}
                                            className="bg-bg-primary h-10 text-xs font-mono"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="bg-bg-tertiary/50 p-6 border-t border-border-default flex flex-row items-center justify-end gap-3">
                        <Button variant="outline" onClick={() => setIsEditOpen(false)} className="h-11 px-8 uppercase font-bold text-[10px] tracking-widest">
                            Discard
                        </Button>
                        <Button onClick={handleSaveEdit} className="h-11 px-12 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest">
                            <Check size={16} className="mr-2"/> Commit Registry Updates
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
