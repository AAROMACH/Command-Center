'use client';
import type { Project, Phase, Task } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, ChevronDown, Camera, Pencil, Trash2, Check, Save } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { Checkbox } from '@/components/ui/checkbox';

type MilestonesTabProps = {
    project: Project;
    setProject: React.Dispatch<React.SetStateAction<Project>>;
};

const PhaseBlock = ({ phase, onTaskToggle, isEditing }: { phase: Phase, onTaskToggle: (phaseId: string, taskId: string) => void, isEditing: boolean }) => {
    const [isOpen, setIsOpen] = useState(true);
    const completedTasks = phase.tasks.filter(t => t.isCompleted).length;
    const totalTasks = phase.tasks.length;
    const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    const status = progress === 100 ? 'completed' : progress > 0 ? 'inprogress' : 'pending';

    return (
        <div className="phase-block">
            <header className="phase-header" onClick={() => setIsOpen(!isOpen)}>
                <div className="phase-num">{phase.phaseNumber}</div>
                <h3 className="phase-name">{phase.name}</h3>
                <div className="phase-meta">
                    <span>{totalTasks} task{totalTasks !== 1 && 's'}</span>
                    <span>{Math.round(progress)}% done</span>
                    <Badge variant={status}>{status}</Badge>
                </div>
                <div className={`phase-chevron ${isOpen ? 'open' : ''}`}><ChevronDown/></div>
            </header>
            {isOpen && (
                <>
                <div className="phase-progress">
                    <div className="progress-wrap !mb-2">
                        <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }}></div></div>
                        <div className="progress-pct">{Math.round(progress)}%</div>
                    </div>
                </div>
                <div className="tasks-list">
                    {phase.tasks.map(task => (
                        <div key={task.id} className="task-row">
                            <Checkbox id={`task-${task.id}`} checked={task.isCompleted} onCheckedChange={() => onTaskToggle(phase.id, task.id)} className="task-check" disabled={!isEditing} />
                            <label htmlFor={`task-${task.id}`} className={`task-name ${task.isCompleted ? 'done' : ''}`}>{task.name}</label>
                            {task.requiresPhoto && (
                                <div className="task-photo-req"><Camera size={13}/> Photo Req.</div>
                            )}
                            {isEditing && (
                                <div className="task-actions">
                                    <button className="task-action-btn"><Pencil size={14}/></button>
                                    <button className="task-action-btn"><Trash2 size={14}/></button>
                                </div>
                            )}
                        </div>
                    ))}
                    {isEditing && (
                        <div className="add-task-row">
                            <Plus size={14} className="text-text-muted"/>
                            <Input className="add-task-input" placeholder="Add a task..." />
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

    const handleSaveChanges = () => {
        setProject(currentProject => ({ ...currentProject, phases: editablePhases }));
        setIsEditing(false);
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
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>Edit Milestones</Button>
                ) : (
                    <div className='flex items-center gap-2'>
                        <Button variant="outline" size="sm" onClick={handleCancel}>Cancel</Button>
                        <Button variant="default" size="sm" onClick={handleSaveChanges}><Save size={14} className="mr-2"/>Save Changes</Button>
                    </div>
                )}
            </div>
            <div className="space-y-3">
                {editablePhases.map(phase => (
                    <PhaseBlock key={phase.id} phase={phase} onTaskToggle={handleTaskToggle} isEditing={isEditing} />
                ))}
            </div>
            {isEditing && (
                 <Button variant="dashed" className="mt-4">
                    <Plus size={16}/> Add New Phase
                </Button>
            )}
        </div>
    );
}
