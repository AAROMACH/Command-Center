'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { Flag, Milestone, RefreshCw, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Goal = { id: string; title: string; owner?: string; dueDate?: string; status: string };
type Milestone = { id: string; title: string; owner?: string; targetDate?: string; quarter: string; status: string };
type RecurringTask = { id: string; title: string; frequency: string; assignedTo?: string; lastCompleted?: string; nextDue?: string };

export default function CompanyPlanningPage() {
    const [goals, setGoals] = useState<Goal[]>([]);
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([]);

    const [goalDialogOpen, setGoalDialogOpen] = useState(false);
    const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
    const [taskDialogOpen, setTaskDialogOpen] = useState(false);

    const [goalForm, setGoalForm] = useState({ title: '', owner: '', dueDate: '', status: 'On Track' });
    const [milestoneForm, setMilestoneForm] = useState({ title: '', owner: '', targetDate: '', quarter: 'Q1', status: 'Planned' });
    const [taskForm, setTaskForm] = useState({ title: '', frequency: 'weekly', assignedTo: '', lastCompleted: '' });

    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const unsubGoals = onSnapshot(collection(db, 'companyGoals'), snap =>
            setGoals(snap.docs.map(d => ({ ...d.data(), id: d.id } as Goal))));
        const unsubMilestones = onSnapshot(collection(db, 'companyMilestones'), snap =>
            setMilestones(snap.docs.map(d => ({ ...d.data(), id: d.id } as Milestone))));
        const unsubTasks = onSnapshot(collection(db, 'recurringTasks'), snap =>
            setRecurringTasks(snap.docs.map(d => ({ ...d.data(), id: d.id } as RecurringTask))));
        return () => { unsubGoals(); unsubMilestones(); unsubTasks(); };
    }, []);

    const handleAddGoal = async () => {
        if (!goalForm.title) return;
        setSaving(true);
        await addDoc(collection(db, 'companyGoals'), { ...goalForm, createdAt: new Date().toISOString() });
        setGoalForm({ title: '', owner: '', dueDate: '', status: 'On Track' });
        setGoalDialogOpen(false);
        setSaving(false);
    };

    const handleAddMilestone = async () => {
        if (!milestoneForm.title) return;
        setSaving(true);
        await addDoc(collection(db, 'companyMilestones'), { ...milestoneForm, createdAt: new Date().toISOString() });
        setMilestoneForm({ title: '', owner: '', targetDate: '', quarter: 'Q1', status: 'Planned' });
        setMilestoneDialogOpen(false);
        setSaving(false);
    };

    const handleAddTask = async () => {
        if (!taskForm.title) return;
        setSaving(true);
        await addDoc(collection(db, 'recurringTasks'), { ...taskForm, createdAt: new Date().toISOString() });
        setTaskForm({ title: '', frequency: 'weekly', assignedTo: '', lastCompleted: '' });
        setTaskDialogOpen(false);
        setSaving(false);
    };

    const handleUpdateGoalStatus = async (id: string, status: string) => {
        await updateDoc(doc(db, 'companyGoals', id), { status });
    };

    const handleUpdateMilestoneStatus = async (id: string, status: string) => {
        await updateDoc(doc(db, 'companyMilestones', id), { status });
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <Flag size={12} /> Internal Operations
                    </p>
                    <h1 className="page-title">Company Planning</h1>
                    <p className="page-subtitle text-xs font-bold text-text-muted uppercase tracking-widest mt-1">
                        Strategic goals, roadmap milestones, and recurring operational tasks.
                    </p>
                </div>
            </header>

            <Tabs defaultValue="goals" className="w-full">
                <TabsList className="border-b border-border-sub bg-transparent rounded-none h-auto p-0 gap-8 justify-start mb-1">
                    {[
                        { value: 'goals', label: 'Goals', count: goals.length },
                        { value: 'roadmap', label: 'Roadmap', count: milestones.length },
                        { value: 'recurring', label: 'Recurring Tasks', count: recurringTasks.length },
                    ].map(t => (
                        <TabsTrigger key={t.value} value={t.value} className="tab-trigger-plans flex items-center gap-2">
                            {t.label}
                            {t.count > 0 && (
                                <span className="text-[8px] font-black bg-bg-tertiary text-text-muted border border-border-sub px-1.5 py-0.5 rounded">{t.count}</span>
                            )}
                        </TabsTrigger>
                    ))}
                </TabsList>

                {/* Goals */}
                <TabsContent value="goals" className="m-0 pt-4">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                            {goals.length} Strategic Goal{goals.length !== 1 ? 's' : ''}
                        </p>
                        <Button size="sm" className="h-8 text-[10px] font-bold uppercase bg-brand-red hover:bg-brand-red/90 text-white" onClick={() => setGoalDialogOpen(true)}>
                            <Plus size={11} className="mr-1.5" /> Add Goal
                        </Button>
                    </div>
                    <div className="space-y-2">
                        {goals.map(g => {
                            const statusColor =
                                g.status === 'On Track' ? 'bg-text-green/10 text-text-green border-text-green/20' :
                                g.status === 'At Risk' ? 'bg-amber-400/10 text-amber-400 border-amber-400/20' :
                                'bg-brand-red/10 text-brand-red border-brand-red/20';
                            return (
                                <div key={g.id} className="flex items-center justify-between p-3 rounded-lg border border-border-sub bg-bg-secondary">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Flag size={12} className="text-brand-red shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-bold text-text-primary uppercase truncate">{g.title}</p>
                                            {g.owner && <p className="text-[9px] text-text-muted">{g.owner}</p>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        {g.dueDate && <p className="text-[9px] text-text-muted">{new Date(g.dueDate).toLocaleDateString()}</p>}
                                        <Select value={g.status} onValueChange={v => handleUpdateGoalStatus(g.id, v)}>
                                            <SelectTrigger className={cn('h-6 text-[8px] font-black uppercase border px-2 rounded w-auto gap-1', statusColor)}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {['On Track', 'At Risk', 'Behind'].map(s => <SelectItem key={s} value={s} className="text-[11px]">{s}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            );
                        })}
                        {goals.length === 0 && (
                            <div className="text-center py-12 text-[10px] text-text-muted uppercase tracking-widest border border-dashed border-border-sub rounded-xl">
                                No strategic goals defined
                            </div>
                        )}
                    </div>
                </TabsContent>

                {/* Roadmap */}
                <TabsContent value="roadmap" className="m-0 pt-4">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                            {milestones.length} Milestone{milestones.length !== 1 ? 's' : ''}
                        </p>
                        <Button size="sm" className="h-8 text-[10px] font-bold uppercase bg-brand-red hover:bg-brand-red/90 text-white" onClick={() => setMilestoneDialogOpen(true)}>
                            <Plus size={11} className="mr-1.5" /> Add Milestone
                        </Button>
                    </div>
                    {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map(q => {
                        const qMilestones = milestones.filter(m => m.quarter === q);
                        return (
                            <div key={q} className="mb-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-text-muted bg-bg-tertiary border border-border-sub px-2 py-0.5 rounded">
                                        {q} {new Date().getFullYear()}
                                    </span>
                                    <div className="flex-1 h-px bg-border-sub" />
                                </div>
                                {qMilestones.length === 0 ? (
                                    <p className="text-[9px] text-text-muted uppercase text-center py-3">No milestones</p>
                                ) : qMilestones.map(m => {
                                    const statusColor =
                                        m.status === 'Completed' ? 'text-text-green' :
                                        m.status === 'In Progress' ? 'text-amber-400' :
                                        'text-text-muted';
                                    return (
                                        <div key={m.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border-sub bg-bg-secondary mb-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Milestone size={11} className={statusColor} />
                                                <div className="min-w-0">
                                                    <p className="text-[11px] font-bold text-text-primary uppercase truncate">{m.title}</p>
                                                    {m.owner && <p className="text-[9px] text-text-muted">{m.owner}</p>}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                {m.targetDate && <p className="text-[9px] text-text-muted">{new Date(m.targetDate).toLocaleDateString()}</p>}
                                                <Select value={m.status} onValueChange={v => handleUpdateMilestoneStatus(m.id, v)}>
                                                    <SelectTrigger className={cn('h-6 text-[8px] font-black uppercase w-auto gap-1', statusColor)}>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {['Planned', 'In Progress', 'Completed', 'Delayed'].map(s => <SelectItem key={s} value={s} className="text-[11px]">{s}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </TabsContent>

                {/* Recurring Tasks */}
                <TabsContent value="recurring" className="m-0 pt-4">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                            {recurringTasks.length} Recurring Task{recurringTasks.length !== 1 ? 's' : ''}
                        </p>
                        <Button size="sm" className="h-8 text-[10px] font-bold uppercase bg-brand-red hover:bg-brand-red/90 text-white" onClick={() => setTaskDialogOpen(true)}>
                            <Plus size={11} className="mr-1.5" /> Add Task
                        </Button>
                    </div>
                    <div className="space-y-2">
                        {recurringTasks.map(t => {
                            const nextDue = t.nextDue ? new Date(t.nextDue) : null;
                            const isOverdue = nextDue && nextDue < new Date();
                            return (
                                <div key={t.id} className={cn('flex items-center justify-between p-3 rounded-lg border bg-bg-secondary', isOverdue ? 'border-brand-red/30' : 'border-border-sub')}>
                                    <div className="flex items-center gap-3 min-w-0">
                                        <RefreshCw size={11} className={isOverdue ? 'text-brand-red' : 'text-text-muted'} />
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-bold text-text-primary uppercase truncate">{t.title}</p>
                                            <p className="text-[9px] text-text-muted capitalize">{t.frequency} · {t.assignedTo || 'Unassigned'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        {t.lastCompleted && (
                                            <p className="text-[9px] text-text-muted">Done: {new Date(t.lastCompleted).toLocaleDateString()}</p>
                                        )}
                                        {nextDue && (
                                            <span className={cn('text-[8px] font-black uppercase', isOverdue ? 'text-brand-red' : 'text-text-muted')}>
                                                Due: {nextDue.toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {recurringTasks.length === 0 && (
                            <div className="text-center py-12 text-[10px] text-text-muted uppercase tracking-widest border border-dashed border-border-sub rounded-xl">
                                No recurring tasks configured
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            {/* Add Goal Dialog */}
            <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
                            <Flag size={14} className="text-brand-red" /> Add Strategic Goal
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Goal Title</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" value={goalForm.title} onChange={e => setGoalForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Expand to 3 new markets" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Owner</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" value={goalForm.owner} onChange={e => setGoalForm(p => ({ ...p, owner: e.target.value }))} placeholder="Name or department" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Due Date</Label>
                            <Input type="date" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={goalForm.dueDate} onChange={e => setGoalForm(p => ({ ...p, dueDate: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Status</Label>
                            <Select value={goalForm.status} onValueChange={v => setGoalForm(p => ({ ...p, status: v }))}>
                                <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {['On Track', 'At Risk', 'Behind'].map(s => <SelectItem key={s} value={s} className="text-[11px]">{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" size="sm" onClick={() => setGoalDialogOpen(false)} className="text-[10px] font-black uppercase">Cancel</Button>
                        <Button size="sm" disabled={!goalForm.title || saving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase" onClick={handleAddGoal}>
                            {saving ? 'Saving...' : 'Add Goal'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Milestone Dialog */}
            <Dialog open={milestoneDialogOpen} onOpenChange={setMilestoneDialogOpen}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
                            <Milestone size={14} className="text-brand-red" /> Add Milestone
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Title</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" value={milestoneForm.title} onChange={e => setMilestoneForm(p => ({ ...p, title: e.target.value }))} placeholder="Milestone name" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Quarter</Label>
                            <Select value={milestoneForm.quarter} onValueChange={v => setMilestoneForm(p => ({ ...p, quarter: v }))}>
                                <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {['Q1', 'Q2', 'Q3', 'Q4'].map(q => <SelectItem key={q} value={q} className="text-[11px]">{q}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Target Date</Label>
                            <Input type="date" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={milestoneForm.targetDate} onChange={e => setMilestoneForm(p => ({ ...p, targetDate: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Owner</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" value={milestoneForm.owner} onChange={e => setMilestoneForm(p => ({ ...p, owner: e.target.value }))} placeholder="Name or department" />
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" size="sm" onClick={() => setMilestoneDialogOpen(false)} className="text-[10px] font-black uppercase">Cancel</Button>
                        <Button size="sm" disabled={!milestoneForm.title || saving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase" onClick={handleAddMilestone}>
                            {saving ? 'Saving...' : 'Add Milestone'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Recurring Task Dialog */}
            <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
                            <RefreshCw size={14} className="text-brand-red" /> Add Recurring Task
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Task Title</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Weekly team standup" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Frequency</Label>
                            <Select value={taskForm.frequency} onValueChange={v => setTaskForm(p => ({ ...p, frequency: v }))}>
                                <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {['daily', 'weekly', 'biweekly', 'monthly', 'quarterly'].map(f => (
                                        <SelectItem key={f} value={f} className="text-[11px] capitalize">{f}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Assigned To</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" value={taskForm.assignedTo} onChange={e => setTaskForm(p => ({ ...p, assignedTo: e.target.value }))} placeholder="Name or team" />
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" size="sm" onClick={() => setTaskDialogOpen(false)} className="text-[10px] font-black uppercase">Cancel</Button>
                        <Button size="sm" disabled={!taskForm.title || saving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase" onClick={handleAddTask}>
                            {saving ? 'Saving...' : 'Add Task'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <style jsx global>{`
                .tab-trigger-plans {
                    @apply px-0 pb-3 pt-0 h-auto bg-transparent rounded-none border-b-2 border-transparent text-[11px] font-black uppercase tracking-[0.2em] text-text-muted data-[state=active]:bg-transparent data-[state=active]:text-text-primary data-[state=active]:border-brand-red data-[state=active]:shadow-none transition-all;
                }
            `}</style>
        </div>
    );
}
