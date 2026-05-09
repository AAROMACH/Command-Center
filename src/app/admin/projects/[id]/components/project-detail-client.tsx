'use client';

import { useState } from 'react';
import type { Project, Technician, ProjectDocument, TimesheetLog } from '@/lib/types';
import Link from 'next/link';
import { ChevronLeft, MapPin, Calendar, Clock, Users, Edit, Archive, Check, X, ShieldAlert, DollarSign, Timer, Building2, User } from 'lucide-react';
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

function getProgress(project: Project): number {
    const allTasks = project.phases.flatMap(phase => phase.tasks);
    if (allTasks.length === 0) return 0;
    const completedTasks = allTasks.filter(task => task.isCompleted).length;
    return (completedTasks / allTasks.length) * 100;
}

export function ProjectDetailClient({ project: initialProject, technicians, documents, timesheets: initialTimesheets }: ProjectDetailClientProps) {
    const [project, setProject] = useState(initialProject);
    const [timesheets, setTimesheets] = useState(initialTimesheets);
    const [activeTab, setActiveTab] = useState('overview');
    
    // UI States
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editedProject, setEditedProject] = useState<Project>(initialProject);
    const { toast } = useToast();
    const router = useRouter();

    const progress = getProgress(project);
    const progressColor = progress === 100 ? 'green' : progress > 0 ? 'gold' : 'red';

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
                            <div className="pdh-meta-item"><Calendar/>Started {project.startDate}</div>
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

            <div className="detail-tabs">
                <button className={`detail-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
                <button className={`detail-tab ${activeTab === 'milestones' ? 'active' : ''}`} onClick={() => setActiveTab('milestones')}>Milestones</button>
                <button className={`detail-tab ${activeTab === 'documents' ? 'active' : ''}`} onClick={() => setActiveTab('documents')}>Documents</button>
                <button className={`detail-tab ${activeTab === 'timesheets' ? 'active' : ''}`} onClick={() => setActiveTab('timesheets')}>Timesheets</button>
            </div>

            <div className="tab-content">
                {activeTab === 'overview' && <OverviewTab project={project} setProject={setProject} allTechnicians={technicians} />}
                {activeTab === 'milestones' && <MilestonesTab project={project} setProject={setProject} />}
                {activeTab === 'documents' && <DocumentsTab project={project} documents={documents} />}
                {activeTab === 'timesheets' && <TimesheetsTab timesheets={timesheets} setTimesheets={setTimesheets} technicians={technicians} projectId={project.id}/>}
            </div>

            {/* EDIT PROJECT DIALOG */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="sm:max-w-[850px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[90vh]">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30">
                        <div className="flex items-center justify-between">
                            <div>
                                <DialogTitle className="uppercase tracking-widest font-bold text-lg">Modify Project Registry</DialogTitle>
                                <DialogDescription>Update high-fidelity parameters and operational briefing for project <span className="text-brand-red font-mono">{project.id.toUpperCase()}</span>.</DialogDescription>
                            </div>
                            <Badge variant={editedProject.status} className="h-6 px-3">{editedProject.status.toUpperCase()}</Badge>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-bold text-brand-red uppercase tracking-[0.2em] flex items-center gap-2">
                                        <Building2 size={12}/> Identity & Coordinates
                                    </h3>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-text-muted">Project Identifier / Name</Label>
                                        <Input 
                                            value={editedProject.name} 
                                            onChange={e => setEditedProject({...editedProject, name: e.target.value})}
                                            className="bg-bg-primary h-10 text-xs font-bold uppercase tracking-wide"
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
                                </div>

                                <div className="space-y-4 pt-2">
                                    <h3 className="text-[10px] font-bold text-accent-gold uppercase tracking-[0.2em] flex items-center gap-2">
                                        <Calendar size={12}/> Temporal Constraints
                                    </h3>
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
                                            <Label className="text-[10px] font-bold uppercase text-text-muted">Operational Status</Label>
                                            <Select value={editedProject.status} onValueChange={(val: any) => setEditedProject({...editedProject, status: val})}>
                                                <SelectTrigger className="h-10 text-xs bg-bg-primary border-border-sub">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="active">ACTIVE</SelectItem>
                                                    <SelectItem value="on-hold">ON HOLD</SelectItem>
                                                    <SelectItem value="completed">COMPLETED</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase text-text-muted">Start window</Label>
                                            <Input 
                                                value={editedProject.startTime || ''} 
                                                onChange={e => setEditedProject({...editedProject, startTime: e.target.value})}
                                                className="bg-bg-primary h-10 text-xs"
                                                placeholder="e.g. 08:00 AM EDT"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase text-text-muted">Duration (Est.)</Label>
                                            <Input 
                                                value={editedProject.estimatedDuration} 
                                                onChange={e => setEditedProject({...editedProject, estimatedDuration: e.target.value})}
                                                className="bg-bg-primary h-10 text-xs"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                        <ShieldAlert size={12} className="text-brand-red"/> Operational Briefing
                                    </h3>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-text-muted">Scope of Work</Label>
                                        <Textarea 
                                            value={editedProject.scope} 
                                            onChange={e => setEditedProject({...editedProject, scope: e.target.value})}
                                            className="bg-bg-primary h-24 text-[11px] leading-relaxed resize-none"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-text-muted">On-Site Stakeholder Contact</Label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
                                            <Input 
                                                value={editedProject.onsiteContact || ''} 
                                                onChange={e => setEditedProject({...editedProject, onsiteContact: e.target.value})}
                                                className="bg-bg-primary h-10 text-xs pl-10"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold uppercase text-text-muted">Site Access Intelligence</Label>
                                        <Textarea 
                                            value={editedProject.siteAccessInstructions || ''} 
                                            onChange={e => setEditedProject({...editedProject, siteAccessInstructions: e.target.value})}
                                            className="bg-bg-primary h-16 text-[11px] leading-relaxed resize-none"
                                            placeholder="Codes, parking, safety gear protocols..."
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4 pt-2">
                                    <h3 className="text-[10px] font-bold text-text-green uppercase tracking-[0.2em] flex items-center gap-2">
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
                                            <Label className="text-[10px] font-bold uppercase text-text-muted">Hours Allocation (Est.)</Label>
                                            <div className="relative">
                                                <Timer className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
                                                <Input 
                                                    type="number"
                                                    value={editedProject.estimatedHours || 0} 
                                                    onChange={e => setEditedProject({...editedProject, estimatedHours: parseFloat(e.target.value) || 0})}
                                                    className="bg-bg-primary h-10 text-xs pl-10 font-mono"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase text-text-muted">Actual spend ($)</Label>
                                            <Input 
                                                type="number"
                                                value={editedProject.actualBudget || 0} 
                                                onChange={e => setEditedProject({...editedProject, actualBudget: parseFloat(e.target.value) || 0})}
                                                className="bg-bg-primary h-10 text-xs font-mono text-text-green"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-bold uppercase text-text-muted">Actual Hours Logged</Label>
                                            <Input 
                                                type="number"
                                                value={editedProject.actualHours || 0} 
                                                onChange={e => setEditedProject({...editedProject, actualHours: parseFloat(e.target.value) || 0})}
                                                className="bg-bg-primary h-10 text-xs font-mono text-accent-gold"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="bg-bg-tertiary/50 p-6 border-t border-border-default flex flex-row items-center justify-between gap-4">
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" className="h-8 px-2 text-[9px] text-text-muted hover:text-text-red hover:bg-brand-red/10 uppercase tracking-widest font-bold">
                                    <Archive size={12} className="mr-1.5"/> Archive Folder
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-bg-elevated border-border-main shadow-2xl">
                                <AlertDialogHeader>
                                    <div className="flex items-center gap-3 mb-2 text-brand-red">
                                        <Archive size={24} />
                                        <AlertDialogTitle className="uppercase tracking-widest">Authorize Archival?</AlertDialogTitle>
                                    </div>
                                    <AlertDialogDescription className="text-sm text-text-secondary leading-relaxed">
                                        Warning: This will terminate the active lifecycle of project <span className="font-bold text-text-primary">{project.name}</span>. All field logs and phase tracking for this folder will be moved to history.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter className="mt-6 gap-3">
                                    <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleArchive} className="h-11 bg-brand-red hover:bg-brand-red-hover px-10 border-none font-bold uppercase tracking-widest text-xs">
                                        Confirm & Terminate
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>

                        <div className="flex items-center gap-3">
                            <Button variant="outline" onClick={() => setIsEditOpen(false)} className="h-11 px-8 uppercase font-bold text-[10px] tracking-widest">
                                Discard
                            </Button>
                            <Button onClick={handleSaveEdit} className="h-11 px-12 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest">
                                <Check size={16} className="mr-2"/> Commit Registry Updates
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

type ProjectDetailClientProps = {
    project: Project;
    technicians: Technician[];
    documents: ProjectDocument[];
    timesheets: TimesheetLog[];
};
