'use client';

import { useState } from 'react';
import type { Project, Technician, ProjectDocument, TimesheetLog } from '@/lib/types';
import Link from 'next/link';
import { ChevronLeft, MapPin, Calendar, Clock, Users, Plus, Edit, Archive, Check, X } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

type ProjectDetailClientProps = {
    project: Project;
    technicians: Technician[];
    documents: ProjectDocument[];
    timesheets: TimesheetLog[];
};

function getProgress(project: Project): number {
    const totalTasks = project.phases.reduce((acc, phase) => acc + phase.tasks.length, 0);
    if (totalTasks === 0) return 0;
    const completedTasks = project.phases.reduce((acc, phase) => {
        return acc + phase.tasks.filter(task => task.isCompleted).length;
    }, 0);
    return (completedTasks / totalTasks) * 100;
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
                    <Button variant="outline" size="sm" onClick={() => { setEditedProject(project); setIsEditOpen(true); }}>
                        <Edit size={12} className="mr-1.5"/> Edit Project
                    </Button>
                    
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive-outline" size="sm">
                                <Archive size={12} className="mr-1.5"/> Archive
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-bg-elevated border-border-main">
                            <AlertDialogHeader>
                                <AlertDialogTitle className="uppercase tracking-wider">Archive Project Folder?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will move {project.name} to the historical archive. Active field jobs and phase tracking will be suspended.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleArchive} className="bg-brand-red hover:bg-brand-red-hover border-none">
                                    Confirm Archival
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>

            <div className="project-detail-header">
                <div className="pdh-top">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
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
                <DialogContent className="sm:max-w-[600px] bg-bg-elevated border-border-default p-0 flex flex-col">
                    <DialogHeader className="p-6 pb-2">
                        <DialogTitle className="uppercase tracking-widest font-bold">Edit Project Parameters</DialogTitle>
                        <DialogDescription>Modify core registry details for project <span className="text-text-primary font-bold">{project.id}</span>.</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase text-text-muted">Project Name</Label>
                            <Input 
                                value={editedProject.name} 
                                onChange={e => setEditedProject({...editedProject, name: e.target.value})}
                                className="bg-bg-primary h-11 text-sm font-bold uppercase tracking-wide"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase text-text-muted">Target Site Address</Label>
                                <Input 
                                    value={editedProject.location} 
                                    onChange={e => setEditedProject({...editedProject, location: e.target.value})}
                                    className="bg-bg-primary"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase text-text-muted">Start Date</Label>
                                <Input 
                                    type="date"
                                    value={editedProject.startDate} 
                                    onChange={e => setEditedProject({...editedProject, startDate: e.target.value})}
                                    className="bg-bg-primary"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase text-text-muted">Strategic Scope</Label>
                            <Textarea 
                                value={editedProject.scope} 
                                onChange={e => setEditedProject({...editedProject, scope: e.target.value})}
                                className="bg-bg-primary h-32 text-xs leading-relaxed"
                            />
                        </div>
                    </div>
                    <DialogFooter className="bg-bg-secondary/30 p-6 border-t border-border-default">
                        <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveEdit} className="px-10 bg-brand-red hover:bg-brand-red-hover">
                            <Check size={16} className="mr-2"/> Commit Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
