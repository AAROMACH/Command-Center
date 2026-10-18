
'use client';
import type { Project, Phase, Task, Technician } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { NotificationService } from '@/lib/notification-service';
import { TaskCompletionDialog, TaskRequirementIcons, taskHasRequirements } from '@/components/task-completion-dialog';

type MilestonesTabProps = {
    project: Project;
    /** People lookup for the crew picker / assignee names (directory or users). */
    technicians?: Technician[];
};

const PhaseBlock = ({ 
    phase, 
    onTaskToggle, 
    isEditing, 
    onAddTask, 
    onDeleteTask, 
    onEditTask,
    onDeletePhase,
    onEditPhaseName,
    isReadOnly,
    nameOf,
}: { 
    phase: Phase, 
    onTaskToggle: (phaseId: string, taskId: string) => void, 
    isEditing: boolean,
    onAddTask: (phaseId: string, name: string) => void,
    onDeleteTask: (phaseId: string, taskId: string) => void,
    onEditTask: (phaseId: string, task: Task) => void,
    onDeletePhase: (phaseId: string) => void,
    onEditPhaseName: (phaseId: string, name: string) => void,
    isReadOnly: boolean,
    nameOf: (id: string) => string,
}) => {
    const [isOpen, setIsOpen] = useState(true);
    const [newTaskName, setNewTaskName] = useState("");
    const completedTasks = (phase.tasks || []).filter(t => t.isCompleted).length;
    const totalTasks = (phase.tasks || []).length;
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
                            className="bg-transparent border-none focus:ring-0 text-xs font-bold text-text-primary p-0 h-auto w-full"
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
                    {(phase.tasks || []).map(task => (
                        <div key={task.id} className="task-row group/task">
                            <Checkbox 
                                id={`task-${task.id}`} 
                                checked={task.isCompleted} 
                                onCheckedChange={() => !isReadOnly && onTaskToggle(phase.id, task.id)} 
                                className="task-check" 
                                disabled={!isEditing || isReadOnly} 
                            />
                            <div className="flex-1 min-w-0 text-left">
                                <label htmlFor={`task-${task.id}`} className={cn("task-name", task.isCompleted && 'done')}>{task.name}</label>
                                
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {task.assignedTechId && <div className="inline-flex items-center gap-1 rounded bg-brand-red/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-red border border-brand-red/30">{nameOf(task.assignedTechId)}</div>}
                                    {task.requiresPhoto && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><Camera size={10}/> Photo</div>}
                                    {task.requiresText && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><FileText size={10}/> Text</div>}
                                    {task.requiresNumeric && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><Hash size={10}/> Number</div>}
                                    {task.requiresDropdown && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><ListTodo size={10}/> List</div>}
                                    {task.requiresSignature && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><Signature size={10}/> Sign</div>}
                                    {task.requiresFileUpload && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><Upload size={10}/> File</div>}
                                    {task.isCompleted && <TaskRequirementIcons task={task} />}
                                    {task.requiresOther && <div className="inline-flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted border border-border-sub"><Plus size={10}/> {task.otherRequirementLabel || 'Req.'}</div>}
                                </div>
                            </div>
                            {isEditing && !isReadOnly && (
                                <div className="task-actions opacity-0 group-hover/task:opacity-100 transition-opacity">
                                    <button className="task-action-btn" onClick={() => onEditTask(phase.id, task)}><Pencil size={14}/></button>
                                    <button className="task-action-btn hover:text-text-red" onClick={() => onDeleteTask(phase.id, task.id)}><Trash2 size={14}/></button>
                                </div>
                            )}
                        </div>
                    ))}
                    {isEditing && !isReadOnly && (
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

export function MilestonesTab({ project, technicians = [] }: MilestonesTabProps) {
    const nameOf = (id: string) => technicians.find(t => t.id === id)?.name || 'Crew member';
    const crew = (project.team || []).map(m => ({ id: m.techId, name: nameOf(m.techId), role: m.role }));
    const [editablePhases, setEditablePhases] = useState<Phase[]>(project.phases || []);
    const [isEditing, setIsEditing] = useState(false);
    const [taskDialogOpen, setTaskDialogOpen] = useState(false);
    const [editingTaskData, setEditingTaskData] = useState<{ phaseId: string, task: Task } | null>(null);
    const { toast } = useToast();

    const isReadOnly = project.status === 'completed';

    useEffect(() => {
        setEditablePhases(project.phases || []);
    }, [project.phases]);

    const [completing, setCompleting] = useState<{ phaseId: string; task: Task } | null>(null);
    const applyCompletion = (patch: Partial<Task>) => {
        if (!completing) return;
        setEditablePhases(phases => phases.map(ph => ph.id !== completing.phaseId ? ph : {
            ...ph,
            tasks: (ph.tasks || []).map(t => t.id === completing.task.id ? { ...t, ...patch, completedAt: new Date().toISOString() } : t),
        }));
        toast({ title: 'Task completed', description: 'Save changes to keep it.' });
    };

    const handleTaskToggle = (phaseId: string, taskId: string) => {
        if (isReadOnly) return;

        const targetPhase = editablePhases.find(ph => ph.id === phaseId);
        const task = (targetPhase?.tasks || []).find(t => t.id === taskId);
        // Requirements (photo, notes, signature…) are filled in through the completion form.
        if (task && !task.isCompleted && taskHasRequirements(task)) { setCompleting({ phaseId, task }); return; }

        const newPhases = editablePhases.map(phase => {
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
        setEditablePhases(newPhases);
    };

    const handleAddTask = (phaseId: string, name: string) => {
        if (isReadOnly) return;
        const i = editablePhases.findIndex(p => p.id === phaseId);
        if (i === -1) return;

        const newTask: Task = {
            id: crypto.randomUUID(),
            name,
            isCompleted: false,
            requiresPhoto: false
        };

        const newPhases = [...editablePhases];
        newPhases[i] = { ...newPhases[i], tasks: [...(newPhases[i].tasks || []), newTask] };
        setEditablePhases(newPhases);
    };

    const handleDeleteTask = (phaseId: string, taskId: string) => {
        if (isReadOnly) return;
        const newPhases = editablePhases.map(phase => {
            if (phase.id === phaseId) {
                return { ...phase, tasks: (phase.tasks || []).filter(t => t.id !== taskId) };
            }
            return phase;
        });
        setEditablePhases(newPhases);
    };

    const handleOpenEditTask = (phaseId: string, task: Task) => {
        if (isReadOnly) return;
        setEditingTaskData({ phaseId, task: { ...task } });
        setTaskDialogOpen(true);
    };

    const handleSaveTaskDetails = () => {
        if (!editingTaskData || isReadOnly) return;
        const { phaseId, task: updatedTask } = editingTaskData;
        const newPhases = editablePhases.map(phase => {
            if (phase.id === phaseId) {
                return {
                    ...phase,
                    tasks: (phase.tasks || []).map(t => t.id === updatedTask.id ? updatedTask : t)
                };
            }
            return phase;
        });
        setEditablePhases(newPhases);
        setTaskDialogOpen(false);
        setEditingTaskData(null);
    };

    const handleAddPhase = () => {
        if (isReadOnly) return;
        const nextNum = editablePhases.length + 1;
        const newPhase: Phase = {
            id: crypto.randomUUID(),
            phaseNumber: nextNum,
            name: `Phase ${nextNum}: Untitled`,
            tasks: []
        };
        setEditablePhases([...editablePhases, newPhase]);
    };

    const handleDeletePhase = (phaseId: string) => {
        if (isReadOnly) return;
        setEditablePhases(editablePhases.filter(p => p.id !== phaseId).map((p, i) => ({ ...p, phaseNumber: i + 1 })));
    };

    const handleEditPhaseName = (phaseId: string, name: string) => {
        if (isReadOnly) return;
        setEditablePhases(editablePhases.map(p => p.id === phaseId ? { ...p, name } : p));
    };

    const handleSaveChanges = async () => {
        if (isReadOnly) return;
        try {
            const docRef = doc(db, 'projects', project.id);
            await updateDoc(docRef, { phases: editablePhases });
            // Tell each crew member about tasks newly assigned to them.
            const prevOwner = new Map((project.phases || []).flatMap(p => (p.tasks || []).map(t => [t.id, t.assignedTechId || null] as const)));
            const fresh = new Map<string, string[]>();
            editablePhases.forEach(p => (p.tasks || []).forEach(t => {
                if (t.assignedTechId && t.assignedTechId !== prevOwner.get(t.id) && !t.isCompleted) {
                    fresh.set(t.assignedTechId, [...(fresh.get(t.assignedTechId) || []), t.name]);
                }
            }));
            fresh.forEach((names, techId) => NotificationService.notify(techId,
                names.length === 1 ? 'Task assigned to you' : `${names.length} tasks assigned to you`,
                `${project.name}: ${names.slice(0, 5).join(', ')}${names.length > 5 ? '…' : ''}`,
                { id: project.id, type: 'project' }));
            setIsEditing(false);
            toast({ title: "Tasks saved", description: "Phases and tasks saved." });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e.message });
        }
    };

    const handleCancel = () => {
        setEditablePhases(project.phases || []);
        setIsEditing(false);
    };

    const totalTasks = editablePhases.reduce((acc, p) => acc + (p.tasks || []).length, 0);
    const completedTasks = editablePhases.reduce((acc, p) => acc + (p.tasks || []).filter(t => t.isCompleted).length, 0);

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <div className="text-sm text-text-secondary">{editablePhases.length} phases · {totalTasks} tasks · <span className="text-text-green">{completedTasks} completed</span></div>
                {!isEditing ? (
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => !isReadOnly && setIsEditing(true)} 
                        className={cn("h-8 !text-[10px]", isReadOnly && "opacity-50 cursor-not-allowed")}
                    >
                        {isReadOnly ? 'Read only' : 'Edit milestones'}
                    </Button>
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
                        isReadOnly={isReadOnly}
                        nameOf={nameOf}
                    />
                ))}
            </div>
            {isEditing && !isReadOnly && (
                 <Button variant="dashed" className="mt-4 h-12" onClick={handleAddPhase}>
                    <Plus size={16} className="mr-2"/> Add New Phase
                </Button>
            )}

            <TaskCompletionDialog
                task={completing?.task ?? null}
                projectId={project.id}
                open={!!completing}
                onOpenChange={o => { if (!o) setCompleting(null); }}
                onComplete={applyCompletion}
            />

            {/* TASK DETAIL DIALOG */}
            <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
                <DialogContent className="sm:max-w-xl bg-bg-elevated border-border-default p-0 overflow-hidden flex flex-col max-h-[90vh]">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30">
                        <DialogTitle className="font-bold">Task details</DialogTitle>
                        <DialogDescription className="text-[11px]">Define requirements for this project action.</DialogDescription>
                    </DialogHeader>
                    {editingTaskData && (
                        <ScrollArea className="flex-1">
                            <div className="p-6 space-y-5">
                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] font-bold text-text-muted">Task Identifier / Name</Label>
                                    <Input 
                                        value={editingTaskData.task.name} 
                                        onChange={(e) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, name: e.target.value }})}
                                        className="bg-bg-primary h-9 text-xs"
                                    />
                                </div>

                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] font-bold text-text-muted">Assigned To</Label>
                                    <Select
                                        value={editingTaskData.task.assignedTechId || 'none'}
                                        onValueChange={(v) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, assignedTechId: v === 'none' ? null : v }})}
                                    >
                                        <SelectTrigger className="bg-bg-primary h-9 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent className="bg-bg-elevated border-border-main">
                                            <SelectItem value="none" className="text-xs">Unassigned (whole crew)</SelectItem>
                                            {crew.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name} · {c.role}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    {crew.length === 0 && <p className="text-[11px] text-text-muted">Add crew in Manage Team to assign tasks.</p>}
                                </div>

                                <div className="space-y-3">
                                    <h3 className="text-[10px] font-bold text-brand-red uppercase tracking-wider border-b border-border-sub pb-1.5 text-left">Submission Requirements</h3>
                                    
                                    <div className="grid grid-cols-1 gap-2">
                                        <div className="p-2 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-bg-primary rounded text-text-muted"><Camera size={14}/></div>
                                                <div className="space-y-0 text-left">
                                                    <p className="text-[10px] font-bold text-text-primary uppercase tracking-tight">Photo Documentation</p>
                                                    <p className="text-[11px] text-text-muted leading-tight">Requires field imagery for sign-off.</p>
                                                </div>
                                            </div>
                                            <Switch 
                                                className="scale-75"
                                                checked={editingTaskData.task.requiresPhoto} 
                                                onCheckedChange={(val) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, requiresPhoto: val }})}
                                            />
                                        </div>

                                        <div className="p-2 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-bg-primary rounded text-text-muted"><FileText size={14}/></div>
                                                <div className="space-y-0 text-left">
                                                    <p className="text-[10px] font-bold text-text-primary uppercase tracking-tight">Text Feedback</p>
                                                    <p className="text-[11px] text-text-muted leading-tight">Requires a textual description or report.</p>
                                                </div>
                                            </div>
                                            <Switch 
                                                className="scale-75"
                                                checked={editingTaskData.task.requiresText} 
                                                onCheckedChange={(val) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, requiresText: val }})}
                                            />
                                        </div>

                                        <div className="p-2 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-bg-primary rounded text-text-muted"><Hash size={14}/></div>
                                                <div className="space-y-0 text-left">
                                                    <p className="text-[10px] font-bold text-text-primary uppercase tracking-tight">Numeric Input</p>
                                                    <p className="text-[11px] text-text-muted leading-tight">Requires numeric data entry (e.g. counts).</p>
                                                </div>
                                            </div>
                                            <Switch 
                                                className="scale-75"
                                                checked={editingTaskData.task.requiresNumeric} 
                                                onCheckedChange={(val) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, requiresNumeric: val }})}
                                            />
                                        </div>

                                        <div className="space-y-2 p-2 rounded-lg bg-bg-secondary border border-border-sub">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1.5 bg-bg-primary rounded text-text-muted"><ListTodo size={14}/></div>
                                                    <div className="space-y-0 text-left">
                                                        <p className="text-[10px] font-bold text-text-primary uppercase tracking-tight">Dropdown Selection</p>
                                                        <p className="text-[11px] text-text-muted leading-tight">Requires selection from a list.</p>
                                                    </div>
                                                </div>
                                                <Switch 
                                                    className="scale-75"
                                                    checked={editingTaskData.task.requiresDropdown} 
                                                    onCheckedChange={(val) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, requiresDropdown: val }})}
                                                />
                                            </div>
                                            <div className={cn("pt-1.5 transition-all overflow-hidden", editingTaskData.task.requiresDropdown ? "max-h-20 opacity-100" : "max-h-0 opacity-0")}>
                                                <Label className="text-[10px] font-bold text-text-muted mb-1 block text-left">Options (Comma separated)</Label>
                                                <Input 
                                                    placeholder="e.g. Pass, Fail, N/A"
                                                    value={editingTaskData.task.dropdownOptions?.join(', ') || ''}
                                                    onChange={(e) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, dropdownOptions: e.target.value.split(',').map(s => s.trim()) }})}
                                                    className="h-7 text-[10px] bg-bg-primary"
                                                />
                                            </div>
                                        </div>

                                        <div className="p-2 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-bg-primary rounded text-text-muted"><Signature size={14}/></div>
                                                <div className="space-y-0 text-left">
                                                    <p className="text-[10px] font-bold text-text-primary uppercase tracking-tight">Signature Capture</p>
                                                    <p className="text-[11px] text-text-muted leading-tight">Requires field sign-off signature.</p>
                                                </div>
                                            </div>
                                            <Switch 
                                                className="scale-75"
                                                checked={editingTaskData.task.requiresSignature} 
                                                onCheckedChange={(val) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, requiresSignature: val }})}
                                            />
                                        </div>

                                        <div className="p-2 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-bg-primary rounded text-text-muted"><Upload size={14}/></div>
                                                <div className="space-y-0 text-left">
                                                    <p className="text-[10px] font-bold text-text-primary uppercase tracking-tight">File Upload</p>
                                                    <p className="text-[11px] text-text-muted leading-tight">Requires technical document upload.</p>
                                                </div>
                                            </div>
                                            <Switch 
                                                className="scale-75"
                                                checked={editingTaskData.task.requiresFileUpload} 
                                                onCheckedChange={(val) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, requiresFileUpload: val }})}
                                            />
                                        </div>

                                        <div className="space-y-2 p-2 rounded-lg bg-bg-secondary border border-border-sub">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1.5 bg-bg-primary rounded text-text-muted"><Plus size={14}/></div>
                                                    <div className="space-y-0 text-left">
                                                        <p className="text-[10px] font-bold text-text-primary uppercase tracking-tight">Other Completion Criteria</p>
                                                        <p className="text-[11px] text-text-muted leading-tight">Custom field requirement.</p>
                                                    </div>
                                                </div>
                                                <Switch 
                                                    className="scale-75"
                                                    checked={editingTaskData.task.requiresOther} 
                                                    onCheckedChange={(val) => setEditingTaskData({ ...editingTaskData, task: { ...editingTaskData.task, requiresOther: val }})}
                                                />
                                            </div>
                                            <div className={cn("pt-1.5 transition-all overflow-hidden", editingTaskData.task.requiresOther ? "max-h-20 opacity-100" : "max-h-0 opacity-0")}>
                                                <Label className="text-[10px] font-bold text-text-muted mb-1 block text-left">Requirement Label</Label>
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
                        <Button variant="outline" onClick={() => setTaskDialogOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-wider h-10">Discard</Button>
                        <Button onClick={handleSaveTaskDetails} className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-wider h-10">Save task</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
