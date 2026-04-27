'use client';

import { useState } from 'react';
import type { Project, Technician, ProjectDocument, TimesheetLog } from '@/lib/types';
import Link from 'next/link';
import { ChevronLeft, MapPin, Calendar, Clock, Users, Plus, Edit, Archive } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OverviewTab } from './overview-tab';
import { MilestonesTab } from './milestones-tab';
import { DocumentsTab } from './documents-tab';
import { TimesheetsTab } from './timesheets-tab';

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

    const progress = getProgress(project);
    const progressColor = progress === 100 ? 'green' : progress > 0 ? 'gold' : 'red';

    return (
        <div>
            <div className="detail-nav">
                <Link href="/admin/projects" className="detail-back">
                    <ChevronLeft size={16} />
                    Back to Projects
                </Link>
                <div className="detail-breadcrumb">/ <span>{project.name}</span></div>
                <div className="ml-auto flex gap-2">
                    <Button variant="outline" size="sm"><Edit size={12} className="mr-1.5"/> Edit Project</Button>
                    <Button variant="destructive-outline" size="sm"><Archive size={12} className="mr-1.5"/> Archive</Button>
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
                {activeTab === 'documents' && <DocumentsTab documents={documents} />}
                {activeTab === 'timesheets' && <TimesheetsTab timesheets={timesheets} setTimesheets={setTimesheets} technicians={technicians} projectId={project.id}/>}
            </div>
        </div>
    );
}
