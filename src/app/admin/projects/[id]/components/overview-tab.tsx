'use client';
import { useProjectParts } from '@/lib/project-parts';
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

    // Any box unlocked = editing: Save / Cancel show in the Site notes header.
    const editing = unlocked.size > 0;
    // Ctrl/Cmd+Enter saves; Escape cancels.
    const saveKeys = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSaveChanges(); }
        if (e.key === 'Escape' && editing) { e.preventDefault(); handleCancelChanges(); }
    };
    const isDirty = useMemo(() => {
        return localProjectData.scope !== project.scope ||
               localProjectData.onsiteContactName !== project.onsiteContactName ||
               localProjectData.onsiteContactPhone !== project.onsiteContactPhone ||
               localProjectData.siteAccessInstructions !== project.siteAccessInstructions;
    }, [localProjectData, project]);

    const parts = useProjectParts(showMoney && !economicsFromServer ? project : null);
    const liveEconomics = useMemo(() => computeProjectEconomics(
        { ...project, addedParts: parts }, dailyLogs, id => allTechnicians.find(t => t.id === id)?.hourlyRate, expenses, invoices,
        { nameOf: id => allTechnicians.find(t => t.id === id)?.name, quote },
    ), [project, parts, dailyLogs, allTechnicians, expenses, invoices, quote]);
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
        if (isReadOnly) return;
        if (!isDirty) { setUnlocked(new Set()); return; }
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
        if (isDirty) toast({ title: "Changes discarded", description: "The project details were not changed." });
    }
    
    return (
        <>
            {/* Site notes, full width: the scope reads as a paragraph on the
                left; contact and field intelligence on the right. */}
            <div className="field-group mb-4 text-left">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="field-group-title !mb-0 font-bold"><FileText className="text-brand-red h-4 w-4"/> Site notes</h3>
                    {!isReadOnly && editing && (
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] text-text-muted hidden sm:inline">{isDirty ? 'Unsaved changes' : 'Editing'}</span>
                            <Button variant="outline" size="sm" className="h-8" onClick={handleCancelChanges}>Cancel</Button>
                            <Button size="sm" className="h-8 bg-brand-red hover:bg-brand-red-hover text-white" onClick={handleSaveChanges} disabled={!isDirty}>
                                <Check size={13} className="mr-1" /> Save
                            </Button>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-x-6 gap-y-4">
                    <div className="field-row lg:col-span-3 !mb-0">
                        <label className="field-label">Scope of work</label>
                        <UnlockableField locked={!unlocked.has('scope')} onUnlock={() => unlock('scope')} canEdit={!isReadOnly}>
                            <Textarea
                                disabled={isReadOnly}
                                readOnly={!unlocked.has('scope')}
                                className="field-textarea min-h-[260px] lg:min-h-[340px] !text-[13px] leading-relaxed whitespace-pre-wrap"
                                placeholder="What we're doing on this job."
                                value={localProjectData.scope || ''}
                                onChange={e => setLocalProjectData({...localProjectData, scope: e.target.value})}
                                onKeyDown={saveKeys}
                            ></Textarea>
                        </UnlockableField>
                    </div>

                    <div className="lg:col-span-2 space-y-3">
                        <div className="field-row !mb-0">
                            <label className="field-label">Site contact name</label>
                            <UnlockableField locked={!unlocked.has('onsiteContactName')} onUnlock={() => unlock('onsiteContactName')} canEdit={!isReadOnly}>
                                <Input
                                    disabled={isReadOnly}
                                    readOnly={!unlocked.has('onsiteContactName')}
                                    className="field-input !text-[13px]"
                                    placeholder="Full name"
                                    value={localProjectData.onsiteContactName || ''}
                                    onChange={e => setLocalProjectData({...localProjectData, onsiteContactName: e.target.value})}
                                    onKeyDown={saveKeys}
                                />
                            </UnlockableField>
                        </div>
                        <div className="field-row !mb-0">
                            <label className="field-label">Site contact phone</label>
                            <UnlockableField locked={!unlocked.has('onsiteContactPhone')} onUnlock={() => unlock('onsiteContactPhone')} canEdit={!isReadOnly}>
                                <Input
                                    disabled={isReadOnly}
                                    readOnly={!unlocked.has('onsiteContactPhone')}
                                    className="field-input !text-[13px]"
                                    placeholder="Phone number"
                                    value={localProjectData.onsiteContactPhone || ''}
                                    onChange={e => setLocalProjectData({...localProjectData, onsiteContactPhone: e.target.value})}
                                    onKeyDown={saveKeys}
                                />
                            </UnlockableField>
                            {localProjectData.onsiteContactPhone && !unlocked.has('onsiteContactPhone') && (
                                <a href={`tel:${localProjectData.onsiteContactPhone.replace(/[^\d+]/g, '')}`} className="mt-1 inline-block text-[12px] text-brand-red hover:underline">Call</a>
                            )}
                        </div>

                        <div className="field-row !mb-0">
                            <label className="field-label">Field intelligence</label>
                            <p className="text-[11px] text-text-muted mb-1.5">What the crew should know and why — e.g. &ldquo;Extra slack left above the ceiling in room 204: the old run was pulling out of the back of the jack.&rdquo;</p>
                            <div className="space-y-1.5">
                                {(project.siteHazardNotes || []).map(note => (
                                    <div key={note.id} className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-[12px] ${note.type === 'danger' ? 'border-border-alert bg-brand-red-dim text-text-red' : 'border-accent/50 bg-accent-gold-dim text-accent-gold'}`}>
                                        {note.type === 'danger' ? <AlertTriangle size={13} className="mt-0.5 shrink-0"/> : <Info size={13} className="mt-0.5 shrink-0"/>}
                                        <span className="flex-1 min-w-0 whitespace-pre-wrap break-words text-text-primary">{note.text}</span>
                                        {!isReadOnly && (
                                            <button onClick={() => handleDeleteNote(note.id)} aria-label="Remove note" className="opacity-60 hover:opacity-100 hover:text-text-primary shrink-0">
                                                <X size={13} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {isAddingNote && !isReadOnly ? (
                                    <div className="rounded-md border border-border-sub bg-bg-tertiary p-2 space-y-1.5">
                                        <Textarea
                                            className="field-textarea min-h-[70px] !text-[12px]"
                                            placeholder="What you found and why it matters…"
                                            value={newNoteText}
                                            autoFocus
                                            onChange={e => setNewNoteText(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSaveNote();
                                                if (e.key === 'Escape') setIsAddingNote(false);
                                            }}
                                        />
                                        <div className="flex justify-end gap-2">
                                            <Button variant="outline" size="sm" className="h-7" onClick={() => setIsAddingNote(false)}>Cancel</Button>
                                            <Button size="sm" className="h-7" onClick={handleSaveNote} disabled={!newNoteText.trim()}><Check size={13} className="mr-1"/> Add note</Button>
                                        </div>
                                    </div>
                                ) : !isReadOnly && (
                                    <button className="note-chip-add" onClick={() => setIsAddingNote(true)}><Plus size={13}/> Add note</button>
                                )}
                            </div>
                        </div>

                        <div className="field-row !mb-0">
                            <label className="field-label">Site access</label>
                            <UnlockableField locked={!unlocked.has('siteAccessInstructions')} onUnlock={() => unlock('siteAccessInstructions')} canEdit={!isReadOnly}>
                                <Textarea
                                    disabled={isReadOnly}
                                    readOnly={!unlocked.has('siteAccessInstructions')}
                                    className="field-textarea min-h-[80px] !text-[12px]"
                                    placeholder="Parking, entry codes, badge requirements..."
                                    value={localProjectData.siteAccessInstructions || ''}
                                    onChange={e => setLocalProjectData({...localProjectData, siteAccessInstructions: e.target.value})}
                                    onKeyDown={saveKeys}
                                ></Textarea>
                            </UnlockableField>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-4 text-left">
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

            
            <ManageTeamDialog 
              isOpen={isTeamDialogOpen}
              setIsOpen={setIsTeamDialogOpen}
              project={project}
              allTechnicians={allTechnicians}
            />
        </>
    );
}
