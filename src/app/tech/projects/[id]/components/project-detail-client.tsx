'use client';

import { useState } from 'react';
import type { Project, ProjectDailyLog, Task, Technician } from '@/lib/types';
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
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';

function getProgress(project: Project): number {
    const totalTasks = project.phases.reduce((acc, phase) => acc + phase.tasks.length, 0);
    if (totalTasks === 0) return 0;
    const completedTasks = project.phases.reduce((acc, phase) => {
        return acc + phase.tasks.filter(task => task.isCompleted).length;
    }, 0);
    return (completedTasks / totalTasks) * 100;
}

const PhaseBlock = ({
  phase,
  onTaskToggle,
  onPhotoUpload,
}: {
  phase: Project['phases'][0];
  onTaskToggle: (phaseId: string, taskId: string) => void;
  onPhotoUpload: (taskId: string, file: File) => void;
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const completedTasks = phase.tasks.filter((t) => t.isCompleted).length;
  const totalTasks = phase.tasks.length;
  const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  const status =
    progress === 100 ? 'completed' : progress > 0 ? 'inprogress' : 'pending';

  return (
    <div className="phase-block">
      <header className="phase-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="phase-num">{phase.phaseNumber}</div>
        <h3 className="phase-name">{phase.name}</h3>
        <div className="phase-meta">
          <span>{totalTasks} task{totalTasks !== 1 && 's'}</span>
          <Badge variant={status}>{status}</Badge>
        </div>
        <div className={`phase-chevron ${isOpen ? 'open' : ''}`}>
          <ChevronDown />
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
            {phase.tasks.map((task) => (
              <div key={task.id} className="task-row">
                <Checkbox
                  id={`task-${task.id}`}
                  checked={task.isCompleted}
                  onCheckedChange={() => onTaskToggle(phase.id, task.id)}
                  className="task-check"
                />
                <div className="flex-1 min-w-0">
                    <label
                      htmlFor={`task-${task.id}`}
                      className={`task-name ${task.isCompleted ? 'done' : ''}`}
                    >
                      {task.name}
                    </label>
                    
                    {/* Requirement Visibility for Techs */}
                    <div className="flex flex-wrap gap-1 mt-1">
                        {task.requiresPhoto && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><Camera size={10}/> Photo</div>}
                        {task.requiresText && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><FileText size={10}/> Text</div>}
                        {task.requiresNumeric && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><Hash size={10}/> Number</div>}
                        {task.requiresDropdown && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><ListTodo size={10}/> List</div>}
                        {task.requiresSignature && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><Signature size={10}/> Sign</div>}
                        {task.requiresFileUpload && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><Upload size={10}/> File</div>}
                        {task.requiresOther && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><Plus size={10}/> {task.otherRequirementLabel || 'Req.'}</div>}
                    </div>
                </div>
                
                {task.requiresPhoto && (
                  <Button variant="outline" size="sm" className="h-7 text-[10px] uppercase font-bold tracking-widest px-2">
                    <Camera size={13} className="mr-1.5"/> Upload Photo
                  </Button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};


export function ProjectDetailClient({ project: initialProject, dailyLogs, technicians }: { project: Project, dailyLogs: ProjectDailyLog[], technicians: Technician[] }) {
    const [project, setProject] = useState(initialProject);
    const [activeTab, setActiveTab] = useState('tasks');
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
    };
    
    const handlePhotoUpload = (taskId: string, file: File) => {
        console.log(`Uploading photo for task ${taskId}:`, file.name);
        toast({ title: 'Photo Uploaded', description: 'Your photo has been attached to the task.' });
    };

    const handleSubmitLog = () => {
        toast({ title: 'Daily Log Submitted', description: 'Your log for today has been recorded.' });
    }

    return (
        <div>
            <div className="detail-nav">
                <Link href="/tech/projects" className="detail-back">
                    <ChevronLeft size={16} />
                    Back to Projects
                </Link>
                <div className="detail-breadcrumb">/ <span>{project.name}</span></div>
            </div>

            <div className="project-detail-header">
                <div className="pdh-top">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="pdh-title">{project.name}</h1>
                             <Badge variant={project.status} className="capitalize">{project.status}</Badge>
                        </div>
                        <div className="pdh-meta">
                            <div className="pdh-meta-item"><MapPin/>{project.location}</div>
                            <div className="pdh-meta-item"><Calendar/>Started {project.startDate}</div>
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
                <button className={`detail-tab ${activeTab === 'tasks' ? 'active' : ''}`} onClick={() => setActiveTab('tasks')}>Tasks & Phases</button>
                <button className={`detail-tab ${activeTab === 'logging' ? 'active' : ''}`} onClick={() => setActiveTab('logging')}>Daily Log</button>
                <button className={`detail-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>Log History</button>
            </div>

            <div className="tab-content">
                {activeTab === 'tasks' && (
                    <div className="space-y-3">
                        {project.phases.map(phase => (
                           <PhaseBlock key={phase.id} phase={phase} onTaskToggle={handleTaskToggle} onPhotoUpload={handlePhotoUpload} />
                        ))}
                    </div>
                )}
                {activeTab === 'logging' && (
                    <div className="field-group">
                        <h3 className="field-group-title">Submit Daily Log for {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="field-label">Hours Worked Today</label>
                                <Input type="number" placeholder="e.g., 8.5" className="field-input"/>
                            </div>
                            <div>
                                <label className="field-label">Work Summary</label>
                                <Textarea className="field-textarea" placeholder="Summarize what you accomplished, any issues, and next steps..."/>
                            </div>
                            <div>
                                <label className="field-label">Materials Used</label>
                                <div className="flex gap-2">
                                <Input placeholder="e.g., Cat6 Cable" className="field-input"/>
                                <Input type="number" placeholder="Quantity" className="field-input w-28"/>
                                <Button variant="outline" size="icon" className="h-10 w-10"><Plus size={16}/></Button>
                                </div>
                            </div>
                            <div>
                                <label className="field-label">Attach Photos</label>
                                <Button variant="outline" className="w-full"><Paperclip size={14} className="mr-2"/> Add photo from today</Button>
                            </div>
                             <div className="flex justify-end pt-2">
                                <Button size="lg" onClick={handleSubmitLog}><Send size={16} className="mr-2"/> Submit Today's Log</Button>
                            </div>
                        </div>
                    </div>
                )}
                 {activeTab === 'history' && (
                    <div className="space-y-4">
                        {dailyLogs.map(log => {
                            const tech = technicians.find(t => t.id === log.technicianId);
                            return (
                            <div key={log.id} className="ts-card">
                                <header className="ts-card-header">
                                    {tech && (
                                        <>
                                            <div className="ts-tech-avatar !h-8 !w-8"><Image src={tech.avatarUrl} alt={tech.name} width={32} height={32}/></div>
                                            <div>
                                                <div className="ts-tech-name">{tech.name}</div>
                                                <div className="ts-tech-date">{log.date}</div>
                                            </div>
                                        </>
                                    )}
                                    <div className="ts-badge-wrap">
                                        <div className="font-semibold text-sm text-text-primary">{log.hoursWorked} hours</div>
                                    </div>
                                </header>
                                <div className="p-3 border-t border-border-subtle">
                                    <p className="text-sm text-text-secondary">{log.workSummary}</p>
                                </div>
                            </div>
                        )})}
                    </div>
                )}
            </div>
        </div>
    );
}
