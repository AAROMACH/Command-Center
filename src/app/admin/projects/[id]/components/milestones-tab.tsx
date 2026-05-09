'use client';
import type { Project, Phase, Task } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, ChevronDown, Camera, Pencil, Trash2, Check, Save, X } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

type MilestonesTabProps = {
    project: Project;
    setProject: React.Dispatch<React.SetStateAction<Project>>;
};

const PhaseBlock = ({ 
    phase, 
    onTaskToggle, 
    isEditing, 
    onAddTask, 
    onDeleteTask, 
    onEditTask,
    onDeletePhase,
    onEditPhaseName
}: { 
    phase: Phase, 
    onTaskToggle: (phaseId: string, taskId: string) => void, 
    isEditing: boolean,
    onAddTask: (phaseId: string, name: string) => void,
    onDeleteTask: (phaseId: string, taskId: string) => void,
    onEditTask: (phaseId: string, task: Task) => void,
    onDeletePhase: (phaseId: string) => void,
    onEditPhaseName: (phaseId: string, name: string) => void
}) => {
    const [isOpen, setIsOpen] = useState(true);
    const [newTaskName, setNewTaskName] = useState("");
    const completedTasks = phase.tasks.filter(t => t.isCompleted).length;
    const totalTasks = phase.tasks.length;
    const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    const status = progress === 100 ? 'completed' : progress > 0 ? 'inprogress' : 'pending';

    const handleAddTaskSubmit = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && newTaskName.trim()) {
            onAddTask(phase.id, newTaskName.trim());
            setNewTaskName("");
        }
    };

    return (
        <div className="phase-block">
            <header className="phase-header group/phase">
                <div className="flex items-center gap-2.5 flex-1" onClick={() => setIsOpen(!isOpen)}>
                    <div className="phase-num">{phase.phaseNumber}</div>
                    {isEditing ? (
                        <input 
                            className="bg-transparent border-none focus:ring-0 text-xs font-bold text-text-primary p-0 h-auto w-full uppercase"
                            value={phase.name}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => onEditPhaseName(phase.id, e.target.value)}
                        />
                    ) : (
                        <h3 className="phase-name">{phase.name}</h3>
                    )}
                </div>
                <div className="phase-meta">
                    <span>{totalTasks} task{totalTasks !== 1 && 's'}</span>
                    <Badge variant={status}>{status}</Badge>
                </div>
                <div className="flex items-center gap-1 ml-2">
                    {isEditing && (
                        <button 
                            className="p-1 text-text-muted hover:text-text-red opacity-0 group-hover/phase:opacity-100 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); onDeletePhase(phase.id); }}
                        >
                            <Trash2 size={14}/>
                        </button>
                    )}
                    <div className={`phase-chevron ${isOpen ? 'open' : ''}`} onClick={() => setIsOpen(!isOpen)}><ChevronDown/></div>
                </div>
            </header>
            {isOpen && (
                <>
                <div className="phase-progress">
                    <div className="progress-wrap !mb-2">
                        <div className="progress-track"><div className={`progress-fill ${status === 'completed' ? 'green' : 'gold'}`} style={{ width: `${progress}%` }}></div></div>
                        <div className="progress-pct">{Math.round(progress)}%</div>
                    </div>
                </div>
                <div className="tasks-list">
                    {phase.tasks.map(task => (
                        <div key={task.id} className="task-row group/task">
                            <Checkbox id={`task-${task.id}`} checked={task.isCompleted} onCheckedChange={() => onTaskToggle(phase.id, task.id)} className="task-check" disabled={!isEditing} />
                            <label htmlFor={`task-${task.id}`} className={`task-name ${task.isCompleted ? 'done' : ''}`}>{task.name}</label>
                            {task.requiresPhoto && (
                                <div className="task-photo-req"><Camera size={13}/> Photo Req.</div>
                            )}
                            {isEditing && (
                                <div className="task-actions opacity-0 group-hover/task:opacity-100 transition-opacity">
                                    <button className="task-action-btn" onClick={() => onEditTask(phase.id, task)}><Pencil size={14}/></button>
                                    <button className="task-action-btn hover:text-text-red" onClick={() => onDeleteTask(phase.id, task.id)}><Trash2 size={14}/></button>
                                </div>
                            )}
                        </div>
                    ))}
                    {isEditing && (
                        <div className="add-task-row">
                            <Plus size={14} className="text-text-muted"/>
                            <Input 
                                className="add-task-input" 
                                placeholder="Add a task (Press Enter)..." 
                                value={newTaskName}
                                onChange={(e) => setNewTaskName(e.target.value)}
                                onKeyDown={handleAddTaskSubmit}
                            />
                        </div>
                    )}
                </div>
                </>
            )}
        </div>
    )
}

export function MilestonesTab({ project, setProject }: MilestonesTabProps) {
    const [editablePhases, setEditablePhases] = useState<Phase[]>(project.phases);
    const [isEditing, setIsEditing] = useState(false);
    const [taskDialogOpen, setTaskDialogOpen] = useState(false);
    const [editingTaskData, setEditingTaskData] = useState<{ phaseId: string, task: Task } | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        setEditablePhases(project.phases);
    }, [project.phases]);

    const handleTaskToggle = (phaseId: string, taskId: string) => {
        const newPhases = editablePhases.map(phase => {
            if (phase.id === phaseId) {
                return {
                    ...phase,
                    tasks: phase.tasks.map(task => 
                        task.id === taskId ? { ...task, isCompleted: !task.isCompleted } : task
                    )
                };
            }
            return phase;
        });
        setEditablePhases(newPhases);
    };

    const handleAddTask = (phaseId: string, name: string) => {
        const newPhases = editablePhases.map(phase => {
            if (phase.id === phaseId) {
                const newTask: Task = {
                    id: `task-${Date.now()}`,
                    name,
                    isCompleted: false,
                    requiresPhoto: false
                };
                return { ...phase, tasks: [...phase.tasks, newTask] };
            }
            return phase;
        });
        setEditablePhases(newPhases);
    };

    const handleDeleteTask = (phaseId: string, taskId: string) => {
        const newPhases = editablePhases.map(phase => {
            if (phase.id === phaseId) {
                return { ...phase, tasks: phase.tasks.filter(t => t.id !== taskId) };
            }
            return phase;
        });
        setEditablePhases(newPhases);
    };

    const handleOpenEditTask = (phaseId: string, task: Task) => {
        setEditingTaskData({ phaseId, task: { ...task } });
        setTaskDialogOpen(true);
    };

    const handleSaveTaskDetails = () => {
        if (!editingTaskData) return;
        const { phaseId, task: updatedTask } = editingTaskData;
        const newPhases = editablePhases.map(phase => {
            if (phase.id === phaseId) {
                return {
                    ...phase,
                    tasks: phase.tasks.map(t => t.id === updatedTask.id ? updatedTask : t)
                };
            }
            return phase;
        });
        setEditablePhases(newPhases);
        setTaskDialogOpen(false);
        setEditingTaskData(null);
    };

    const handleAddPhase = () => {
        const nextNum = editablePhases.length + 1;
        const newPhase: Phase = {
            id: `phase-${Date.now()}`,
            phaseNumber: nextNum,
            name: `Phase ${nextNum}: Untitled`,
            tasks: []
        };
        setEditablePhases([...editablePhases, newPhase]);
    };

    const handleDeletePhase = (phaseId: string) => {
        setEditablePhases(editablePhases.filter(p => p.id !== phaseId).map((p, i) => ({ ...p, phaseNumber: i + 1 })));
    };

    const handleEditPhaseName = (phaseId: string, name: string) => {
        setEditablePhases(editablePhases.map(p => p.id === phaseId ? { ...p, name } : p));
    };

    const handleSaveChanges = () => {
        setProject(currentProject => ({ ...currentProject, phases: editablePhases }));
        setIsEditing(false);
        toast({ title: "Milestones Updated", description: "Project phases and tasks committed to registry." });
    };

    const handleCancel = () => {
        setEditablePhases(project.phases);
        setIsEditing(false);
    };

    const totalTasks = editablePhases.reduce((acc, p) => acc + p.tasks.length, 0);
    const completedTasks = editablePhases.reduce((acc, p) => acc + p.tasks.filter(t => t.isCompleted).length, 0);

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <div className="text-sm text-text-secondary">{editablePhases.length} phases · {totalTasks} tasks · <span className="text-text-green">{completedTasks} completed</span></div>
                {!isEditing ? (
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="h-8 !text-[10px]">Edit Milestones</Button>
                ) : (
                    <div className='flex items-center gap-2'>
                        <Button variant="outline" size="sm" onClick={handleCancel} className="h-8 !text-[10px]">Cancel</Button>
                        <Button variant="default" size="sm" onClick={handleSaveChanges} className="h-8 !text-[10px]"><Save size={14} className="mr-2"/>Save Changes</Button>
                    </div>
                )}
            </div>
            <div className="space-y-3">
                {editablePhases.map(phase => (
                    <PhaseBlock 
                        key={phase.id} 
                        phase={phase} 
                        onTaskToggle={handleTaskToggle} 
                        isEditing={isEditing}
                        onAddTask={handleAddTask}
                        onDeleteTask={handleDeleteTask}
                        onEditTask={handleOpenEditTask}
                        onDeletePhase={handleDeletePhase}
                        onEditPhaseName={handleEditPhaseName}
                    />
                ))}
            </div>
            {isEditing && (
                 <Button variant="dashed" className="mt-4 h-12" onClick={handleAddPhase}>
                    <Plus size={16} className="mr-2"/> Add New Phase
                </Button>
            )}

            {/* TASK DETAIL DIALOG */}
            <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
                <DialogContent className="sm:max-w-md bg-bg-elevated border-border-default">
                    <DialogHeader>
                        <DialogTitle className="uppercase tracking-widest font-bold">Task Parameters</DialogTitle>
                        <DialogDescription>Define mission requirements for this project action.</DialogDescription>
                    </DialogHeader>
                    {editingTaskData && (
                        <div className="py-4 space-y-6">
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Task Identifier / Name</Label>
                                <Input 
                                    value={editingTaskData.task.name} 
                                    onChange={(e) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, name: e.target.value }})}
                                    className="bg-bg-primary h-11 text-xs"
                                />
                            </div>
                            <div className="p-4 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between">
                                <div className="space-y-1">
                                    <p className="text-[11px] font-bold text-text-primary uppercase tracking-tight">Photo Documentation</p>
                                    <p className="text-[10px] text-text-muted leading-tight">Field operative must upload imagery for sign-off.</p>
                                </div>
                                <Switch 
                                    checked={editingTaskData.task.requiresPhoto} 
                                    onCheckedChange={(val) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, requiresPhoto: val }})}
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter className="bg-bg-tertiary/30 -mx-6 -mb-6 p-6 border-t border-border-default flex gap-3">
                        <Button variant="outline" onClick={() => setTaskDialogOpen(false)} className="flex-1">Discard</Button>
                        <Button onClick={handleSaveTaskDetails} className="flex-1 bg-brand-red hover:bg-brand-red-hover">Update Task</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
