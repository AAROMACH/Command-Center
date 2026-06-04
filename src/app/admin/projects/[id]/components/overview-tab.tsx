'use client';
import type { Project, Technician, ProjectDailyLog, Expense, Invoice } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
    FileText, 
    DollarSign, 
    AlertTriangle, 
    Info, 
    Plus, 
    Users, 
    X, 
    Check,
    TrendingUp,
    ChevronDown,
    ChevronUp,
    Activity
} from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ManageTeamDialog } from './manage-team-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { expenses, invoices } from '@/lib/data';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

type OverviewTabProps = {
    project: Project;
    allTechnicians: Technician[];
    dailyLogs: ProjectDailyLog[];
};

export function OverviewTab({ project, allTechnicians, dailyLogs }: OverviewTabProps) {
    const [isTeamDialogOpen, setIsTeamDialogOpen] = useState(false);
    const [isAddingNote, setIsAddingNote] = useState(false);
    const [newNoteText, setNewNoteText] = useState("");
    const [isEconomicDetailsOpen, setIsEconomicDetailsOpen] = useState(false);
    const [localProjectData, setLocalProjectData] = useState<Partial<Project>>({});
    const { toast } = useToast();

    const isReadOnly = project.status === 'completed';

    useEffect(() => {
        setLocalProjectData({
            scope: project.scope,
            onsiteContactName: project.onsiteContactName,
            onsiteContactPhone: project.onsiteContactPhone,
            siteAccessInstructions: project.siteAccessInstructions
        });
    }, [project]);

    // DIRTY CHECK LOGIC: Only show actions if data changed
    const isDirty = useMemo(() => {
        return localProjectData.scope !== project.scope ||
               localProjectData.onsiteContactName !== project.onsiteContactName ||
               localProjectData.onsiteContactPhone !== project.onsiteContactPhone ||
               localProjectData.siteAccessInstructions !== project.siteAccessInstructions;
    }, [localProjectData, project]);

    // ECONOMIC CALCULATION ENGINE
    const projectEconomics = useMemo(() => {
        const projectExpenses = expenses.filter(e => e.projectId === project.id && e.status === 'Approved');
        const projectInvoices = invoices.filter(i => i.projectId === project.id && i.status === 'paid');

        const loggedHours = project.actualHours || 0;

        let estimatedHours = project.estimatedHours || 0;
        const taskEstSum = (project.phases || []).reduce((pAcc, phase) => 
            pAcc + (phase.tasks || []).reduce((tAcc, task) => tAcc + (task.estimatedHours || 0), 0)
        , 0);
        if (taskEstSum > 0) estimatedHours = taskEstSum;

        const laborCost = dailyLogs.reduce((acc, log) => {
            const tech = allTechnicians.find(t => t.id === log.technicianId);
            const rate = tech?.hourlyRate || 0;
            return acc + ((log.hoursWorked || 0) * rate);
        }, 0);

        const rateMissing = dailyLogs.some(log => {
             const tech = allTechnicians.find(t => t.id === log.technicianId);
             return !tech?.hourlyRate;
        });

        const materialCost = projectExpenses
            .filter(e => e.category === 'Materials')
            .reduce((acc, e) => acc + e.amount, 0);

        const otherExpenses = projectExpenses
            .filter(e => e.category !== 'Materials')
            .reduce((acc, e) => acc + e.amount, 0);

        const actualCost = laborCost + materialCost + otherExpenses;
        const revenue = projectInvoices.length > 0 
            ? projectInvoices.reduce((acc, i) => acc + i.total, 0)
            : (project.projectBudget || 0);
            
        const profit = revenue - actualCost;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        const remainingBudget = (project.projectBudget || 0) - actualCost;
        
        let budgetStatus: 'On Budget' | 'Near Limit' | 'Over Budget' | 'Not Enough Data' = 'On Budget';
        if (!project.projectBudget) budgetStatus = 'Not Enough Data';
        else if (remainingBudget < 0) budgetStatus = 'Over Budget';
        else if (remainingBudget < (project.projectBudget * 0.1)) budgetStatus = 'Near Limit';

        return {
            loggedHours,
            estimatedHours,
            laborCost,
            rateMissing,
            materialCost,
            otherExpenses,
            actualCost,
            remainingBudget,
            profit,
            isActualProfit: projectInvoices.length > 0,
            margin,
            budgetStatus,
            revenue
        };
    }, [project, dailyLogs, allTechnicians]);

    const getTechnician = (id: string) => allTechnicians.find(t => t.id === id);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    }

    const handleSaveNote = async () => {
        if (newNoteText.trim() && !isReadOnly) {
            const newNote = {
                id: `note-${Date.now()}`,
                text: newNoteText.trim(),
                type: 'info' as const
            };
            try {
                const docRef = doc(db, 'projects', project.id);
                await updateDoc(docRef, {
                    siteHazardNotes: [...(project.siteHazardNotes || []), newNote]
                });
                setNewNoteText("");
                setIsAddingNote(false);
                toast({ title: "Field Note Added", description: "Intelligence has been appended to the site briefing." });
            } catch (e: any) {
                toast({ variant: 'destructive', title: 'Registry Error', description: e.message });
            }
        }
    };

    const handleDeleteNote = async (id: string) => {
        if (isReadOnly) return;
        try {
            const docRef = doc(db, 'projects', project.id);
            await updateDoc(docRef, {
                siteHazardNotes: (project.siteHazardNotes || []).filter(n => n.id !== id)
            });
            toast({ title: "Note Removed", description: "Site intelligence has been updated." });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Registry Error', description: e.message });
        }
    };

    const handleSaveChanges = async () => {
        if (isReadOnly || !isDirty) return;
        try {
            const docRef = doc(db, 'projects', project.id);
            await updateDoc(docRef, {
                ...localProjectData
            });
            toast({
                title: "Registry Updated",
                description: "Operational briefing changes have been committed.",
            });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Registry Error', description: e.message });
        }
    };

    const handleCancelChanges = () => {
        setLocalProjectData({
            scope: project.scope,
            onsiteContactName: project.onsiteContactName,
            onsiteContactPhone: project.onsiteContactPhone,
            siteAccessInstructions: project.siteAccessInstructions
        });
        toast({ title: "Changes Discarded", description: "Project briefing remains at last authorized state." });
    }
    
    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-4 text-left">
                    <div className="field-group">
                        <h3 className="field-group-title uppercase font-bold tracking-widest"><FileText className="text-brand-red h-4 w-4"/> Site Briefing</h3>
                        
                        <div className="field-row">
                            <label className="field-label">Scope of Work</label>
                            <Textarea 
                                disabled={isReadOnly}
                                className="field-textarea" 
                                value={localProjectData.scope || ''}
                                onChange={e => setLocalProjectData({...localProjectData, scope: e.target.value})}
                            ></Textarea>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mb-2">
                            <div className="field-row">
                                <label className="field-label">Onsite Contact Name</label>
                                <Input 
                                    disabled={isReadOnly}
                                    className="field-input" 
                                    placeholder="Full Name" 
                                    value={localProjectData.onsiteContactName || ''}
                                    onChange={e => setLocalProjectData({...localProjectData, onsiteContactName: e.target.value})}
                                />
                            </div>
                            <div className="field-row">
                                <label className="field-label">Onsite Contact Phone</label>
                                <Input 
                                    disabled={isReadOnly}
                                    className="field-input" 
                                    placeholder="Phone Number" 
                                    value={localProjectData.onsiteContactPhone || ''}
                                    onChange={e => setLocalProjectData({...localProjectData, onsiteContactPhone: e.target.value})}
                                />
                            </div>
                        </div>
                        
                        <div className="field-row">
                            <label className="field-label">Field Intelligence & Site Notes</label>
                            <div className="note-chips">
                                {(project.siteHazardNotes || []).map(note => (
                                    <div key={note.id} className={`note-chip ${note.type === 'danger' ? 'danger' : 'info'} group/note`}>
                                        {note.type === 'danger' ? <AlertTriangle size={13}/> : <Info size={13}/>}
                                        <span>{note.text}</span>
                                        {!isReadOnly && (
                                            <button 
                                                onClick={() => handleDeleteNote(note.id)}
                                                className="ml-1 opacity-60 hover:opacity-100 hover:text-text-primary transition-opacity"
                                            >
                                                <X size={12} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                
                                {isAddingNote && !isReadOnly && (
                                    <div className="flex items-center gap-1.5 bg-bg-tertiary p-1 rounded-md border border-border-sub animate-in fade-in zoom-in-95 duration-200">
                                        <Input 
                                            className="h-6 text-[10px] w-32 bg-bg-primary border-none focus:ring-0 px-2" 
                                            placeholder="Enter site intel..." 
                                            value={newNoteText}
                                            autoFocus
                                            onChange={e => setNewNoteText(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') handleSaveNote();
                                                if (e.key === 'Escape') setIsAddingNote(false);
                                            }}
                                        />
                                        <button onClick={handleSaveNote} className="text-text-green hover:opacity-80 p-0.5"><Check size={14}/></button>
                                        <button onClick={() => setIsAddingNote(false)} className="text-text-muted hover:text-text-red p-0.5"><X size={14}/></button>
                                    </div>
                                )}
                                {!isAddingNote && !isReadOnly && (
                                    <button className="note-chip-add" onClick={() => setIsAddingNote(true)}><Plus size={13}/> Add Note</button>
                                )}
                            </div>
                            <Textarea 
                                disabled={isReadOnly}
                                className="field-textarea mt-2" 
                                placeholder="Parking, entry codes, badge requirements..." 
                                value={localProjectData.siteAccessInstructions || ''}
                                onChange={e => setLocalProjectData({...localProjectData, siteAccessInstructions: e.target.value})}
                            ></Textarea>
                        </div>
                    </div>

                     <div className="field-group !pb-2">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="field-group-title !mb-0 font-bold uppercase tracking-widest"><DollarSign className="text-brand-red h-4 w-4"/> Project Economics</h3>
                            <Badge 
                                variant={
                                    projectEconomics.budgetStatus === 'Over Budget' ? 'missed' : 
                                    projectEconomics.budgetStatus === 'Near Limit' ? 'onhold' : 'active'
                                }
                                className="text-[9px] uppercase tracking-widest px-3 h-5"
                            >
                                {projectEconomics.budgetStatus}
                            </Badge>
                        </div>
                        
                        <div className="grid grid-cols-5 gap-px bg-border-sub border border-border-sub rounded-lg overflow-hidden mb-4">
                            <div className="bg-bg-primary p-3 space-y-1">
                                <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">Master Budget</p>
                                <p className="text-xs font-mono font-bold text-text-primary">
                                    {project.projectBudget ? formatCurrency(project.projectBudget) : 'TBD'}
                                </p>
                            </div>
                            <div className="bg-bg-primary p-3 space-y-1">
                                <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">Est. Hours</p>
                                <p className="text-xs font-mono font-bold text-text-primary">
                                    {projectEconomics.estimatedHours ? `${projectEconomics.estimatedHours}h` : 'TBD'}
                                </p>
                            </div>
                            <div className="bg-bg-primary p-3 space-y-1">
                                <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">Logged Hours</p>
                                <p className={cn("text-xs font-mono font-bold", projectEconomics.loggedHours > 0 ? "text-accent-gold" : "text-text-muted")}>
                                    {projectEconomics.loggedHours.toFixed(1)}h
                                </p>
                            </div>
                            <div className="bg-bg-primary p-3 space-y-1">
                                <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">Remaining</p>
                                <p className={cn("text-xs font-mono font-bold", projectEconomics.remainingBudget < 0 ? "text-text-red" : "text-text-green")}>
                                    {project.projectBudget ? formatCurrency(projectEconomics.remainingBudget) : 'TBD'}
                                </p>
                            </div>
                            <div className="bg-bg-primary p-3 space-y-1">
                                <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">
                                    {projectEconomics.isActualProfit ? 'Actual Profit' : 'Est. Profit'}
                                </p>
                                <p className="text-xs font-mono font-bold text-text-primary">
                                    {project.projectBudget ? formatCurrency(projectEconomics.profit) : 'TBD'}
                                </p>
                            </div>
                        </div>

                        <Collapsible open={isEconomicDetailsOpen} onOpenChange={setIsEconomicDetailsOpen}>
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" className="w-full h-8 flex items-center justify-center gap-2 hover:bg-bg-tertiary transition-colors group">
                                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-[0.2em] group-hover:text-text-primary">View Economic details</p>
                                    {isEconomicDetailsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="pt-2 pb-4 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between border-b border-border-sub/50 pb-1.5 px-1">
                                            <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Cost Breakdown</p>
                                            <Activity size={12} className="text-brand-red opacity-50" />
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-[10px] font-bold text-text-secondary uppercase">Field Labor</span>
                                                <span className={cn("text-[10px] font-mono font-bold", projectEconomics.rateMissing ? "text-text-red" : "text-text-primary")}>
                                                    {projectEconomics.rateMissing ? 'Rate Missing' : formatCurrency(projectEconomics.laborCost)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-[10px] font-bold text-text-secondary uppercase">Materials & Parts</span>
                                                <span className="text-[10px] font-mono font-bold text-text-primary">
                                                    {projectEconomics.materialCost > 0 ? formatCurrency(projectEconomics.materialCost) : '$0.00'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-[10px] font-bold text-text-secondary uppercase">Incidentals</span>
                                                <span className="text-[10px] font-mono font-bold text-text-primary">
                                                    {projectEconomics.otherExpenses > 0 ? formatCurrency(projectEconomics.otherExpenses) : '$0.00'}
                                                </span>
                                            </div>
                                            <div className="pt-1 border-t border-border-sub mt-1 flex justify-between items-center px-1">
                                                <span className="text-[10px] font-black text-text-primary uppercase tracking-widest">Actual Cost</span>
                                                <span className="text-xs font-mono font-bold text-text-red">{formatCurrency(projectEconomics.actualCost)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between border-b border-border-sub/50 pb-1.5 px-1">
                                            <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Profit Analysis</p>
                                            <TrendingUp size={12} className="text-text-green opacity-50" />
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-[10px] font-bold text-text-secondary uppercase">Projected Revenue</span>
                                                <span className="text-[10px] font-mono font-bold text-text-primary">{formatCurrency(projectEconomics.revenue)}</span>
                                            </div>
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-[10px] font-bold text-text-secondary uppercase">Profit Margin</span>
                                                <span className={cn("text-[10px] font-mono font-bold", projectEconomics.margin > 20 ? "text-text-green" : "text-accent-gold")}>
                                                    {project.projectBudget ? `${projectEconomics.margin.toFixed(1)}%` : 'TBD'}
                                                </span>
                                            </div>
                                            <div className="p-3 mt-2 rounded bg-bg-primary border border-border-sub flex items-start gap-2">
                                                <Info size={12} className="text-text-muted shrink-0 mt-0.5" />
                                                <p className="text-[9px] text-text-muted leading-relaxed uppercase">
                                                    Economics are aggregated from project-linked work orders, time logs, and finalized invoices.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CollapsibleContent>
                        </Collapsible>
                    </div>
                </div>

                <div className="lg:col-span-1 space-y-4">
                    <div className="field-group">
                         <div className="flex justify-between items-center mb-4">
                            <h3 className="field-group-title !mb-0 font-bold uppercase tracking-widest"><Users size={14} className="text-brand-red h-4 w-4"/> Project Team</h3>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => !isReadOnly && setIsTeamDialogOpen(true)}
                                disabled={isReadOnly}
                                className="h-8 !text-[10px] uppercase font-bold tracking-widest"
                            >
                                Manage Team
                            </Button>
                        </div>
                        <div className="space-y-3 text-left">
                            {(project.team || []).map(member => {
                                const tech = getTechnician(member.technicianId);
                                if (!tech) return null;
                                return (
                                    <div key={tech.id} className="flex items-center gap-3 p-3 rounded-md bg-bg-primary border border-border-sub">
                                        <Avatar className="h-9 w-9 border border-border-sub">
                                            <AvatarImage src={tech.avatarUrl} alt={tech.name} />
                                            <AvatarFallback>{tech.name.split(' ').map(n=>n[0]).join('')}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 text-left overflow-hidden">
                                            <p className="font-bold text-xs text-text-primary uppercase truncate">{tech.name}</p>
                                            <p className="text-xs text-text-muted uppercase font-bold text-[9px] tracking-widest">{member.role}</p>
                                        </div>
                                    </div>
                                )
                            })}
                            {(project.team || []).length === 0 && (
                                <p className="text-[10px] text-text-muted uppercase font-bold text-center py-8 border border-dashed border-border-sub rounded-md italic">No personnel assigned</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {!isReadOnly && isDirty && (
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border-sub animate-in fade-in slide-in-from-top-2 duration-300">
                    <Button variant="outline" className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest" onClick={handleCancelChanges}>Discard Changes</Button>
                    <Button variant="default" className="h-10 px-10 uppercase font-bold text-[10px] tracking-widest bg-brand-red hover:bg-brand-red-hover" onClick={handleSaveChanges}>Commit Updates</Button>
                </div>
            )}
            
            <ManageTeamDialog 
              isOpen={isTeamDialogOpen}
              setIsOpen={setIsTeamDialogOpen}
              project={project}
              allTechnicians={allTechnicians}
            />
        </>
    );
}
