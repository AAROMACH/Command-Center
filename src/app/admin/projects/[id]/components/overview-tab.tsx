'use client';
import { UnlockableField } from '@/components/unlockable-field';
import { ProjectBillingPanel } from './project-billing-panel';
import type { Quote, Project, Technician, ProjectDailyLog, Expense, Invoice } from '@/lib/types';
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
    Activity,
    Pencil
} from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ManageTeamDialog } from './manage-team-dialog';
import { ProjectEconomicsCard, useServerProjectEconomics } from './project-economics-card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { db } from '@/lib/firebase';
import { doc, updateDoc, collection, onSnapshot, query, where } from 'firebase/firestore';
import { computeProjectEconomics } from '@/lib/project-economics';

type OverviewTabProps = {
    project: Project;
    allTechnicians: Technician[];
    dailyLogs: ProjectDailyLog[];
    /** Project Economics (labor cost from pay rates, invoices, profit). */
    showMoney?: boolean;
    /** Read the economics from the server instead of live listeners — for a
     *  project manager assigned to this project, who can't read invoices,
     *  expenses or pay rates directly. Totals only; no individual rates. */
    economicsFromServer?: boolean;
};

export function OverviewTab({ project, allTechnicians, dailyLogs, showMoney = true, economicsFromServer = false }: OverviewTabProps) {
    // Project economics from the real expenses / invoices linked to this
    // project (was the demo lists in lib/data).
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    useEffect(() => {
        if (!project?.id || !showMoney || economicsFromServer) return;
        const unsubE = onSnapshot(query(collection(db, 'expenses'), where('projectId', '==', project.id)),
            snap => setExpenses(snap.docs.map(d => ({ ...d.data(), id: d.id } as Expense))), () => setExpenses([]));
        const unsubI = onSnapshot(query(collection(db, 'invoices'), where('projectId', '==', project.id)),
            snap => setInvoices(snap.docs.map(d => ({ ...d.data(), id: d.id } as Invoice))), () => setInvoices([]));
        return () => { unsubE(); unsubI(); };
    }, [project?.id, showMoney, economicsFromServer]);
    // The linked quote — its labor and materials are the project's estimate.
    const [quote, setQuote] = useState<Quote | null>(null);
    useEffect(() => {
        if (!project?.sourceQuoteId || !showMoney || economicsFromServer) { setQuote(null); return; }
        return onSnapshot(doc(db, 'quotes', project.sourceQuoteId),
            snap => setQuote(snap.exists() ? ({ ...snap.data(), id: snap.id } as Quote) : null), () => setQuote(null));
    }, [project?.sourceQuoteId, showMoney, economicsFromServer]);
    const serverEconomics = useServerProjectEconomics(project, showMoney && economicsFromServer, dailyLogs.length);
    const [isTeamDialogOpen, setIsTeamDialogOpen] = useState(false);
    const [isAddingNote, setIsAddingNote] = useState(false);
    const [newNoteText, setNewNoteText] = useState("");
    const [localProjectData, setLocalProjectData] = useState<Partial<Project>>({});
    // Site notes stay locked until someone double-clicks a box or taps its
    // pencil, so a stray click and Backspace can't wipe them.
    const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
    const unlock = (k: string) => setUnlocked(prev => new Set(prev).add(k));
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

    const isDirty = useMemo(() => {
        return localProjectData.scope !== project.scope ||
               localProjectData.onsiteContactName !== project.onsiteContactName ||
               localProjectData.onsiteContactPhone !== project.onsiteContactPhone ||
               localProjectData.siteAccessInstructions !== project.siteAccessInstructions;
    }, [localProjectData, project]);

    const liveEconomics = useMemo(() => computeProjectEconomics(
        project, dailyLogs, id => allTechnicians.find(t => t.id === id)?.hourlyRate, expenses, invoices,
        { nameOf: id => allTechnicians.find(t => t.id === id)?.name, quote },
    ), [project, dailyLogs, allTechnicians, expenses, invoices, quote]);
    const projectEconomics = economicsFromServer ? serverEconomics : liveEconomics;

    const getTechnician = (id: string) => allTechnicians.find(t => t.id === id);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    }

    const handleSaveNote = async () => {
        if (newNoteText.trim() && !isReadOnly) {
            const newNote = {
                id: crypto.randomUUID(),
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
                toast({ title: "Note Added" });
            } catch (e: any) {
                toast({ variant: 'destructive', title: 'Save failed', description: e.message });
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
            toast({ variant: 'destructive', title: 'Save failed', description: e.message });
        }
    };

    const handleSaveChanges = async () => {
        if (isReadOnly || !isDirty) return;
        try {
            const docRef = doc(db, 'projects', project.id);
            await updateDoc(docRef, {
                ...localProjectData
            });
            setUnlocked(new Set());
            toast({
                title: "Project Updated",
                description: "Changes saved.",
            });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e.message });
        }
    };

    const handleCancelChanges = () => {
        setLocalProjectData({
            scope: project.scope,
            onsiteContactName: project.onsiteContactName,
            onsiteContactPhone: project.onsiteContactPhone,
            siteAccessInstructions: project.siteAccessInstructions
        });
        setUnlocked(new Set());
        toast({ title: "Changes discarded", description: "The project details were not changed." });
    }
    
    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-4 text-left">
                    <div className="field-group">
                        <h3 className="field-group-title font-bold"><FileText className="text-brand-red h-4 w-4"/> Site notes</h3>
                        
                        <div className="field-row">
                            <label className="field-label">Scope of work</label>
                            <UnlockableField locked={!unlocked.has('scope')} onUnlock={() => unlock('scope')} canEdit={!isReadOnly}>
                                <Textarea 
                                    disabled={isReadOnly}
                                    readOnly={!unlocked.has('scope')}
                                    className="field-textarea" 
                                    value={localProjectData.scope || ''}
                                    onChange={e => setLocalProjectData({...localProjectData, scope: e.target.value})}
                                ></Textarea>
                            </UnlockableField>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mb-2">
                            <div className="field-row">
                                <label className="field-label">Onsite Contact Name</label>
                                <UnlockableField locked={!unlocked.has('onsiteContactName')} onUnlock={() => unlock('onsiteContactName')} canEdit={!isReadOnly}>
                                    <Input 
                                        disabled={isReadOnly}
                                        readOnly={!unlocked.has('onsiteContactName')}
                                        className="field-input" 
                                        placeholder="Full Name" 
                                        value={localProjectData.onsiteContactName || ''}
                                        onChange={e => setLocalProjectData({...localProjectData, onsiteContactName: e.target.value})}
                                    />
                                </UnlockableField>
                            </div>
                            <div className="field-row">
                                <label className="field-label">Onsite Contact Phone</label>
                                <UnlockableField locked={!unlocked.has('onsiteContactPhone')} onUnlock={() => unlock('onsiteContactPhone')} canEdit={!isReadOnly}>
                                    <Input 
                                        disabled={isReadOnly}
                                        readOnly={!unlocked.has('onsiteContactPhone')}
                                        className="field-input" 
                                        placeholder="Phone Number" 
                                        value={localProjectData.onsiteContactPhone || ''}
                                        onChange={e => setLocalProjectData({...localProjectData, onsiteContactPhone: e.target.value})}
                                    />
                                </UnlockableField>
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
                                            placeholder="Site access, contacts, notes…" 
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
                            <UnlockableField locked={!unlocked.has('siteAccessInstructions')} onUnlock={() => unlock('siteAccessInstructions')} canEdit={!isReadOnly}>
                                <Textarea 
                                    disabled={isReadOnly}
                                    readOnly={!unlocked.has('siteAccessInstructions')}
                                    className="field-textarea mt-2" 
                                    placeholder="Parking, entry codes, badge requirements..." 
                                    value={localProjectData.siteAccessInstructions || ''}
                                    onChange={e => setLocalProjectData({...localProjectData, siteAccessInstructions: e.target.value})}
                                ></Textarea>
                            </UnlockableField>
                        </div>
                    </div>

                     {showMoney && projectEconomics && <ProjectEconomicsCard project={project} projectEconomics={projectEconomics} />}
                     {/* Office only: quote link, parts added on site, the invoice. */}
                     {showMoney && !economicsFromServer && <ProjectBillingPanel project={project} />}
                </div>

                <div className="lg:col-span-1 space-y-4">
                    <div className="field-group">
                         <div className="flex justify-between items-center mb-4">
                            <h3 className="field-group-title !mb-0 font-bold"><Users size={14} className="text-brand-red h-4 w-4"/> Project Team</h3>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => !isReadOnly && setIsTeamDialogOpen(true)}
                                disabled={isReadOnly}
                                className="h-8 !text-[10px] uppercase font-bold tracking-wider"
                            >
                                Manage Team
                            </Button>
                        </div>
                        <div className="space-y-3 text-left">
                            {(project.team || []).map(member => {
                                const tech = getTechnician(member.techId);
                                if (!tech) return null;
                                return (
                                    <div key={tech.id} className="flex items-center gap-3 p-3 rounded-md bg-bg-primary border border-border-sub">
                                        <Avatar className="h-9 w-9 border border-border-sub">
                                            <AvatarImage src={tech.avatarUrl} alt={tech.name} />
                                            <AvatarFallback>{tech.name.split(' ').map(n=>n[0]).join('')}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 text-left overflow-hidden">
                                            <p className="font-bold text-xs text-text-primary truncate text-left">{tech.name}</p>
                                            <p className="text-xs text-text-muted uppercase font-bold text-[10px] tracking-wider text-left">{member.role}</p>
                                        </div>
                                    </div>
                                )
                            })}
                            {(project.team || []).length === 0 && (
                                <p className="text-[10px] text-text-muted font-bold text-center py-8 border border-dashed border-border-sub rounded-md ">No personnel assigned</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {!isReadOnly && isDirty && (
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border-sub animate-in fade-in slide-in-from-top-2 duration-300">
                    <Button variant="outline" className="h-10 px-8 uppercase font-bold text-[10px] tracking-wider" onClick={handleCancelChanges}>Discard Changes</Button>
                    <Button variant="default" className="h-10 px-10 uppercase font-bold text-[10px] tracking-wider bg-brand-red hover:bg-brand-red-hover" onClick={handleSaveChanges}>Commit Updates</Button>
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
