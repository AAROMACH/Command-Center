'use client';
import type { Project, Phase, Task } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, ChevronDown, Camera, Pencil, Trash2, Check, Save, X, FileText, Hash, ListTodo, Signature, Upload } from 'lucide-react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

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
                            <div className="flex-1 min-w-0">
                                <label htmlFor={`task-${task.id}`} className={`task-name ${task.isCompleted ? 'done' : ''}`}>{task.name}</label>
                                
                                {/* Requirements Badges */}
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
        const i = editablePhases.findIndex(p => p.id === phaseId);
        if (i === -1) return;

        const newTask: Task = {
            id: `task-${Date.now()}`,
            name,
            isCompleted: false,
            requiresPhoto: false
        };

        const newPhases = [...editablePhases];
        newPhases[i] = { ...newPhases[i], tasks: [...newPhases[i].tasks, newTask] };
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
                <DialogContent className="sm:max-w-xl bg-bg-elevated border-border-default p-0 overflow-hidden flex flex-col max-h-[90vh]">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30">
                        <DialogTitle className="uppercase tracking-widest font-bold">Task Parameters</DialogTitle>
                        <DialogDescription className="text-[11px]">Define requirements for this project action.</DialogDescription>
                    </DialogHeader>
                    {editingTaskData && (
                        <ScrollArea className="flex-1">
                            <div className="p-6 space-y-5">
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted">Task Identifier / Name</Label>
                                    <Input 
                                        value={editingTaskData.task.name} 
                                        onChange={(e) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, name: e.target.value }})}
                                        className="bg-bg-primary h-9 text-xs"
                                    />
                                </div>

                                <div className="space-y-3">
                                    <h3 className="text-[9px] font-bold text-brand-red uppercase tracking-[0.2em] border-b border-border-sub pb-1.5">Submission Requirements</h3>
                                    
                                    <div className="grid grid-cols-1 gap-2">
                                        {/* Photo Toggle */}
                                        <div className="p-2 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-bg-primary rounded text-text-muted"><Camera size={14}/></div>
                                                <div className="space-y-0">
                                                    <p className="text-[10px] font-bold text-text-primary uppercase tracking-tight">Photo Documentation</p>
                                                    <p className="text-[9px] text-text-muted leading-tight">Requires field imagery for sign-off.</p>
                                                </div>
                                            </div>
                                            <Switch 
                                                className="scale-75"
                                                checked={editingTaskData.task.requiresPhoto} 
                                                onCheckedChange={(val) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, requiresPhoto: val }})}
                                            />
                                        </div>

                                        {/* Text Field Toggle */}
                                        <div className="p-2 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-bg-primary rounded text-text-muted"><FileText size={14}/></div>
                                                <div className="space-y-0">
                                                    <p className="text-[10px] font-bold text-text-primary uppercase tracking-tight">Text Feedback</p>
                                                    <p className="text-[9px] text-text-muted leading-tight">Requires a textual description or report.</p>
                                                </div>
                                            </div>
                                            <Switch 
                                                className="scale-75"
                                                checked={editingTaskData.task.requiresText} 
                                                onCheckedChange={(val) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, requiresText: val }})}
                                            />
                                        </div>

                                        {/* Numeric Toggle */}
                                        <div className="p-2 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-bg-primary rounded text-text-muted"><Hash size={14}/></div>
                                                <div className="space-y-0">
                                                    <p className="text-[10px] font-bold text-text-primary uppercase tracking-tight">Numeric Input</p>
                                                    <p className="text-[9px] text-text-muted leading-tight">Requires numeric data entry (e.g. counts).</p>
                                                </div>
                                            </div>
                                            <Switch 
                                                className="scale-75"
                                                checked={editingTaskData.task.requiresNumeric} 
                                                onCheckedChange={(val) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, requiresNumeric: val }})}
                                            />
                                        </div>

                                        {/* Dropdown Toggle */}
                                        <div className="space-y-2 p-2 rounded-lg bg-bg-secondary border border-border-sub">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1.5 bg-bg-primary rounded text-text-muted"><ListTodo size={14}/></div>
                                                    <div className="space-y-0">
                                                        <p className="text-[10px] font-bold text-text-primary uppercase tracking-tight">Dropdown Selection</p>
                                                        <p className="text-[9px] text-text-muted leading-tight">Requires selection from a list.</p>
                                                    </div>
                                                </div>
                                                <Switch 
                                                    className="scale-75"
                                                    checked={editingTaskData.task.requiresDropdown} 
                                                    onCheckedChange={(val) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, requiresDropdown: val }})}
                                                />
                                            </div>
                                            <div className={cn("pt-1.5 transition-all overflow-hidden", editingTaskData.task.requiresDropdown ? "max-h-20 opacity-100" : "max-h-0 opacity-0")}>
                                                <Label className="text-[8px] uppercase font-bold text-text-muted mb-1 block">Options (Comma separated)</Label>
                                                <Input 
                                                    placeholder="e.g. Pass, Fail, N/A"
                                                    value={editingTaskData.task.dropdownOptions?.join(', ') || ''}
                                                    onChange={(e) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, dropdownOptions: e.target.value.split(',').map(s => s.trim()) }})}
                                                    className="h-7 text-[10px] bg-bg-primary"
                                                />
                                            </div>
                                        </div>

                                        {/* Signature Toggle */}
                                        <div className="p-2 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-bg-primary rounded text-text-muted"><Signature size={14}/></div>
                                                <div className="space-y-0">
                                                    <p className="text-[10px] font-bold text-text-primary uppercase tracking-tight">Signature Capture</p>
                                                    <p className="text-[9px] text-text-muted leading-tight">Requires field sign-off signature.</p>
                                                </div>
                                            </div>
                                            <Switch 
                                                className="scale-75"
                                                checked={editingTaskData.task.requiresSignature} 
                                                onCheckedChange={(val) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, requiresSignature: val }})}
                                            />
                                        </div>

                                        {/* File Upload Toggle */}
                                        <div className="p-2 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-bg-primary rounded text-text-muted"><Upload size={14}/></div>
                                                <div className="space-y-0">
                                                    <p className="text-[10px] font-bold text-text-primary uppercase tracking-tight">File Upload</p>
                                                    <p className="text-[9px] text-text-muted leading-tight">Requires technical document upload.</p>
                                                </div>
                                            </div>
                                            <Switch 
                                                className="scale-75"
                                                checked={editingTaskData.task.requiresFileUpload} 
                                                onCheckedChange={(val) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, requiresFileUpload: val }})}
                                            />
                                        </div>

                                        {/* Other Requirement Toggle */}
                                        <div className="space-y-2 p-2 rounded-lg bg-bg-secondary border border-border-sub">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1.5 bg-bg-primary rounded text-text-muted"><Plus size={14}/></div>
                                                    <div className="space-y-0">
                                                        <p className="text-[10px] font-bold text-text-primary uppercase tracking-tight">Other Completion Criteria</p>
                                                        <p className="text-[9px] text-text-muted leading-tight">Custom field requirement.</p>
                                                    </div>
                                                </div>
                                                <Switch 
                                                    className="scale-75"
                                                    checked={editingTaskData.task.requiresOther} 
                                                    onCheckedChange={(val) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, requiresOther: val }})}
                                                />
                                            </div>
                                            <div className={cn("pt-1.5 transition-all overflow-hidden", editingTaskData.task.requiresOther ? "max-h-20 opacity-100" : "max-h-0 opacity-0")}>
                                                <Label className="text-[8px] uppercase font-bold text-text-muted mb-1 block">Requirement Label</Label>
                                                <Input 
                                                    placeholder="e.g. Serial Number, ID Verification"
                                                    value={editingTaskData.task.otherRequirementLabel || ''}
                                                    onChange={(e) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, otherRequirementLabel: e.target.value }})}
                                                    className="h-7 text-[10px] bg-bg-primary"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </ScrollArea>
                    )}
                    <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default flex gap-3">
                        <Button variant="outline" onClick={() => setTaskDialogOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest h-10">Discard</Button>
                        <Button onClick={handleSaveTaskDetails} className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest h-10">Update Registry</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
