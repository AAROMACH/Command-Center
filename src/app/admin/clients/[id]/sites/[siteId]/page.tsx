'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, onSnapshot, addDoc, updateDoc } from 'firebase/firestore';
import type { Site, WorkOrder, Invoice, Quote, ClientNote, ClientDocument } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
    ArrowLeft, MapPin, Phone, User, AlertTriangle, Plus, Key, Lock,
    FileText, CheckCircle, Shield, Upload, PenLine, StickyNote, Briefcase, Receipt,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO, differenceInDays } from 'date-fns';
import Link from 'next/link';

const CDOC_TYPE_LABELS: Record<string, string> = {
    contract: 'Contract', blueprint: 'Blueprint', compliance: 'Compliance',
    w9: 'W-9', insurance: 'Insurance', agreement: 'Agreement',
    permit: 'Permit', other: 'Other',
};

export default function SiteDetailPage() {
    const { id, siteId } = useParams<{ id: string; siteId: string }>();
    const router = useRouter();

    const [site, setSite] = useState<Site | null>(null);
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [siteNotes, setSiteNotes] = useState<ClientNote[]>([]);
    const [siteDocs, setSiteDocs] = useState<ClientDocument[]>([]);
    const [clientName, setClientName] = useState('');
    const [loading, setLoading] = useState(true);

    // Access editing
    const [editingAccess, setEditingAccess] = useState(false);
    const [accessForm, setAccessForm] = useState({ accessInstructions: '', gateCode: '', lockboxCode: '' });
    const [accessSaving, setAccessSaving] = useState(false);

    // Note form
    const [noteText, setNoteText] = useState('');
    const [addingNote, setAddingNote] = useState(false);

    // Doc upload
    const [docOpen, setDocOpen] = useState(false);
    const [docForm, setDocForm] = useState({ name: '', documentType: 'other', expirationDate: '' });
    const [docSaving, setDocSaving] = useState(false);

    useEffect(() => {
        if (!id || !siteId) return;

        getDoc(doc(db, 'sites', siteId)).then(snap => {
            if (snap.exists()) {
                const s = { ...snap.data(), id: snap.id } as Site;
                setSite(s);
                setClientName(s.clientName || '');
                setAccessForm({
                    accessInstructions: s.accessInstructions || '',
                    gateCode: s.gateCode || '',
                    lockboxCode: s.lockboxCode || '',
                });
            }
            setLoading(false);
        });

        const unsubWO = onSnapshot(collection(db, 'workOrders'), snap => {
            setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });
        const unsubInv = onSnapshot(collection(db, 'invoices'), snap => {
            setInvoices(snap.docs.map(d => ({ ...d.data(), id: d.id } as Invoice)));
        });
        const unsubQ = onSnapshot(collection(db, 'quotes'), snap => {
            setQuotes(snap.docs.map(d => ({ ...d.data(), id: d.id } as Quote)));
        });
        const unsubNotes = onSnapshot(collection(db, `users/${id}/clientNotes`), snap => {
            const notes = snap.docs
                .map(d => ({ ...d.data(), id: d.id } as ClientNote))
                .filter(n => n.relatedSiteId === siteId || n.noteType === 'site' && n.relatedSiteId === siteId);
            setSiteNotes(notes.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
        });
        const unsubDocs = onSnapshot(collection(db, `users/${id}/clientDocuments`), snap => {
            const docs = snap.docs
                .map(d => ({ ...d.data(), id: d.id } as ClientDocument))
                .filter(d => d.siteId === siteId);
            setSiteDocs(docs);
        });

        return () => { unsubWO(); unsubInv(); unsubQ(); unsubNotes(); unsubDocs(); };
    }, [id, siteId]);

    const siteWOs = useMemo(() => {
        if (!site) return [];
        return workOrders.filter(wo =>
            wo.clientName === clientName && (
                wo.location === site.location ||
                wo.location === site.name ||
                wo.location?.includes(site.name)
            )
        );
    }, [workOrders, site, clientName]);

    const openJobs = useMemo(() => siteWOs.filter(wo => wo.status !== 'completed'), [siteWOs]);
    const completedJobs = useMemo(() => siteWOs.filter(wo => wo.status === 'completed'), [siteWOs]);
    const siteInvoices = useMemo(() => invoices.filter(inv => inv.clientName === clientName), [invoices, clientName]);
    const siteQuotes = useMemo(() => quotes.filter(q => q.clientName === clientName), [quotes, clientName]);

    const handleSaveAccess = async () => {
        if (!siteId) return;
        setAccessSaving(true);
        try {
            await updateDoc(doc(db, 'sites', siteId), {
                accessInstructions: accessForm.accessInstructions,
                gateCode: accessForm.gateCode,
                lockboxCode: accessForm.lockboxCode,
            });
            setSite(prev => prev ? { ...prev, ...accessForm } : prev);
            setEditingAccess(false);
        } finally {
            setAccessSaving(false);
        }
    };

    const handleAddNote = async () => {
        if (!noteText.trim() || !id) return;
        setAddingNote(true);
        try {
            await addDoc(collection(db, `users/${id}/clientNotes`), {
                text: noteText.trim(),
                createdBy: 'Admin',
                createdAt: new Date().toISOString(),
                noteType: 'site',
                relatedSiteId: siteId,
                isPinned: false,
                visibility: 'internal',
            });
            setNoteText('');
        } finally {
            setAddingNote(false);
        }
    };

    const handleUploadDoc = async () => {
        if (!docForm.name || !id) return;
        setDocSaving(true);
        try {
            await addDoc(collection(db, `users/${id}/clientDocuments`), {
                name: docForm.name,
                documentType: docForm.documentType,
                fileUrl: '#',
                uploadedBy: 'Admin',
                uploadedAt: new Date().toISOString(),
                expirationDate: docForm.expirationDate || null,
                siteId,
            });
            setDocOpen(false);
            setDocForm({ name: '', documentType: 'other', expirationDate: '' });
        } finally {
            setDocSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="h-16 w-16 rounded-full bg-bg-secondary animate-pulse mx-auto" />
            </div>
        );
    }

    if (!site) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                <AlertTriangle size={32} className="text-text-red" />
                <p className="text-[11px] font-bold text-text-muted uppercase">Site not found</p>
                <Button variant="ghost" size="sm" onClick={() => router.push(`/admin/clients/${id}`)} className="text-[10px] uppercase font-bold">
                    <ArrowLeft size={14} className="mr-2" /> Back to Client
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-[10px] text-text-muted">
                <button onClick={() => router.push('/admin/sites')} className="hover:text-text-primary transition-colors font-bold uppercase">Clients</button>
                <span>/</span>
                <button onClick={() => router.push(`/admin/clients/${id}`)} className="hover:text-text-primary transition-colors font-bold uppercase">{clientName || 'Client'}</button>
                <span>/</span>
                <span className="text-text-primary font-bold uppercase">{site.name}</span>
            </div>

            {/* Site hero */}
            <div className="p-5 rounded-xl border border-border-sub bg-bg-secondary">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-2xl font-black uppercase tracking-tight text-text-primary">{site.name}</h1>
                            <Badge variant={site.status === 'active' ? 'active' : 'completed'} className="text-[8px] uppercase h-5">{site.status || 'active'}</Badge>
                        </div>
                        {site.location && (
                            <p className="flex items-center gap-2 text-[11px] text-text-secondary">
                                <MapPin size={12} className="text-text-muted" />{site.location}
                            </p>
                        )}
                        {site.managerName && (
                            <p className="flex items-center gap-2 text-[11px] text-text-secondary">
                                <User size={12} className="text-text-muted" />{site.managerName}
                                {site.managerPhone && <span className="flex items-center gap-1"><Phone size={11} />{site.managerPhone}</span>}
                            </p>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <div className="p-3 rounded-lg bg-bg-primary border border-border-sub text-center min-w-[64px]">
                            <p className={cn('text-[18px] font-black font-mono', openJobs.length > 0 ? 'text-text-amber' : 'text-text-muted')}>{openJobs.length}</p>
                            <p className="text-[7px] font-bold text-text-muted uppercase tracking-widest">Open Jobs</p>
                        </div>
                        <div className="p-3 rounded-lg bg-bg-primary border border-border-sub text-center min-w-[64px]">
                            <p className="text-[18px] font-black font-mono text-text-secondary">{completedJobs.length}</p>
                            <p className="text-[7px] font-bold text-text-muted uppercase tracking-widest">Done</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    {/* Open Jobs */}
                    <section>
                        <div className="flex items-center justify-between border-b border-border-sub pb-2 mb-4">
                            <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                <Briefcase size={11} /> Open Jobs ({openJobs.length})
                            </p>
                        </div>
                        {openJobs.length === 0
                            ? <p className="text-[10px] text-text-muted uppercase py-4 text-center">No open jobs</p>
                            : openJobs.map(wo => (
                                <Link key={wo.id} href={`/admin/assignments/${wo.id}`} className="flex items-center justify-between p-3 rounded-xl border border-border-sub bg-bg-secondary hover:border-brand-red/30 transition-colors mb-2 group">
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-bold text-text-primary uppercase truncate group-hover:text-brand-red transition-colors">{wo.title || wo.description}</p>
                                        <p className="text-[9px] text-text-muted uppercase">{wo.scheduleDate} · {wo.projectType}</p>
                                    </div>
                                    <Badge variant={wo.status === 'unassigned' ? 'destructive' : 'scheduled'} className="text-[7px] uppercase h-4 shrink-0 ml-2">{wo.status}</Badge>
                                </Link>
                            ))}
                    </section>

                    {/* Completed Jobs */}
                    <section>
                        <div className="flex items-center justify-between border-b border-border-sub pb-2 mb-4">
                            <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                <CheckCircle size={11} /> Completed Jobs ({completedJobs.length})
                            </p>
                        </div>
                        {completedJobs.length === 0
                            ? <p className="text-[10px] text-text-muted uppercase py-4 text-center">No completed jobs</p>
                            : completedJobs.slice(0, 10).map(wo => (
                                <Link key={wo.id} href={`/admin/assignments/${wo.id}`} className="flex items-center justify-between p-2.5 rounded-lg border border-border-sub bg-bg-secondary/50 hover:bg-bg-secondary transition-colors mb-1.5 group">
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-bold text-text-secondary uppercase truncate group-hover:text-brand-red transition-colors">{wo.title || wo.description}</p>
                                        <p className="text-[9px] text-text-muted uppercase">{wo.scheduleDate}</p>
                                    </div>
                                    <Badge variant="active" className="text-[7px] uppercase h-4 shrink-0">Done</Badge>
                                </Link>
                            ))}
                    </section>

                    {/* Notes */}
                    <section>
                        <div className="flex items-center justify-between border-b border-border-sub pb-2 mb-4">
                            <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                <StickyNote size={11} /> Notes ({siteNotes.length})
                            </p>
                        </div>
                        <div className="flex gap-2 mb-4">
                            <Textarea
                                className="flex-1 text-[11px] bg-bg-secondary border-border-main min-h-[60px]"
                                placeholder="Add a note about this site..."
                                value={noteText}
                                onChange={e => setNoteText(e.target.value)}
                            />
                            <Button size="sm" onClick={handleAddNote} disabled={addingNote || !noteText.trim()} className="h-auto py-2 bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
                                <Plus size={12} />
                            </Button>
                        </div>
                        {siteNotes.length === 0
                            ? <p className="text-[10px] text-text-muted uppercase py-3 text-center">No notes for this site</p>
                            : siteNotes.map(note => (
                                <div key={note.id} className="p-3 rounded-lg border border-border-sub bg-bg-secondary mb-2">
                                    <p className="text-[11px] text-text-primary">{note.text}</p>
                                    <p className="text-[8px] text-text-muted mt-1.5 font-mono">
                                        {note.createdBy} · {note.createdAt ? format(parseISO(note.createdAt), 'MMM d, yyyy h:mm a') : ''}
                                    </p>
                                </div>
                            ))}
                    </section>

                    {/* Documents */}
                    <section>
                        <div className="flex items-center justify-between border-b border-border-sub pb-2 mb-4">
                            <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                <FileText size={11} /> Documents ({siteDocs.length})
                            </p>
                            <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase" onClick={() => setDocOpen(true)}>
                                <Upload size={10} className="mr-1.5" /> Upload
                            </Button>
                        </div>
                        {siteDocs.length === 0
                            ? <p className="text-[10px] text-text-muted uppercase py-3 text-center">No documents for this site</p>
                            : siteDocs.map(d => {
                                const daysLeft = d.expirationDate ? differenceInDays(new Date(d.expirationDate), new Date()) : null;
                                const expired = daysLeft !== null && daysLeft < 0;
                                return (
                                    <div key={d.id} className={cn('flex items-center justify-between p-3 rounded-lg border bg-bg-secondary mb-2', expired ? 'border-text-red/30' : 'border-border-sub')}>
                                        <div>
                                            <p className="text-[10px] font-bold text-text-primary uppercase">{d.name}</p>
                                            <p className="text-[8px] text-text-muted">{CDOC_TYPE_LABELS[d.documentType] || d.documentType} · {d.uploadedAt ? format(new Date(d.uploadedAt), 'MM/dd/yyyy') : ''}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {expired && <Badge variant="destructive" className="text-[7px] uppercase h-4">Expired</Badge>}
                                            {d.fileUrl && d.fileUrl !== '#' && (
                                                <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-[9px] text-brand-red hover:underline font-bold">View</a>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                    </section>
                </div>

                {/* Right column */}
                <div className="space-y-6">
                    {/* Access Info */}
                    <section>
                        <div className="flex items-center justify-between border-b border-border-sub pb-2 mb-4">
                            <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                <Key size={11} /> Access Info
                            </p>
                            {!editingAccess ? (
                                <Button size="sm" variant="outline" className="h-6 text-[8px] font-bold uppercase" onClick={() => setEditingAccess(true)}>
                                    <PenLine size={9} className="mr-1" /> Edit
                                </Button>
                            ) : (
                                <div className="flex gap-1">
                                    <Button size="sm" variant="outline" className="h-6 text-[8px] font-bold uppercase" onClick={() => setEditingAccess(false)}>Cancel</Button>
                                    <Button size="sm" className="h-6 text-[8px] font-bold uppercase bg-brand-red text-white" onClick={handleSaveAccess} disabled={accessSaving}>Save</Button>
                                </div>
                            )}
                        </div>
                        <div className="p-4 rounded-xl border border-border-sub bg-bg-secondary space-y-3">
                            {editingAccess ? (
                                <>
                                    {[
                                        { key: 'gateCode', label: 'Gate Code', icon: Lock },
                                        { key: 'lockboxCode', label: 'Lockbox Code', icon: Key },
                                        { key: 'accessInstructions', label: 'Access Instructions', icon: Shield },
                                    ].map(f => (
                                        <div key={f.key} className="space-y-1">
                                            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">{f.label}</Label>
                                            <Input
                                                className="h-8 text-[11px] bg-bg-primary border-border-main"
                                                value={(accessForm as any)[f.key] || ''}
                                                onChange={e => setAccessForm(p => ({ ...p, [f.key]: e.target.value }))}
                                            />
                                        </div>
                                    ))}
                                </>
                            ) : (
                                <>
                                    {!site.gateCode && !site.lockboxCode && !site.accessInstructions
                                        ? <p className="text-[10px] text-text-muted uppercase text-center py-2">No access info. Click Edit.</p>
                                        : (
                                            <div className="space-y-2">
                                                {site.gateCode && <div><p className="text-[9px] font-black text-text-muted uppercase">Gate Code</p><p className="text-[11px] text-text-primary font-mono">{site.gateCode}</p></div>}
                                                {site.lockboxCode && <div><p className="text-[9px] font-black text-text-muted uppercase">Lockbox</p><p className="text-[11px] text-text-primary font-mono">{site.lockboxCode}</p></div>}
                                                {site.accessInstructions && <div><p className="text-[9px] font-black text-text-muted uppercase">Instructions</p><p className="text-[11px] text-text-primary">{site.accessInstructions}</p></div>}
                                            </div>
                                        )}
                                </>
                            )}
                        </div>
                    </section>

                    {/* Quotes */}
                    {siteQuotes.length > 0 && (
                        <section>
                            <div className="border-b border-border-sub pb-2 mb-3">
                                <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                    <FileText size={11} /> Quotes ({siteQuotes.length})
                                </p>
                            </div>
                            {siteQuotes.slice(0, 5).map(q => (
                                <div key={q.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border-sub bg-bg-secondary mb-1.5">
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-bold text-text-primary uppercase truncate">{q.title}</p>
                                        <p className="text-[8px] text-text-muted">${q.total}</p>
                                    </div>
                                    <Badge className={cn('text-[7px] uppercase h-4 border shrink-0',
                                        q.status === 'accepted' ? 'bg-text-green/10 text-text-green border-text-green/20' :
                                        q.status === 'declined' ? 'bg-text-red/10 text-text-red border-text-red/20' :
                                        'bg-amber-400/10 text-amber-400 border-amber-400/20'
                                    )}>{q.status}</Badge>
                                </div>
                            ))}
                        </section>
                    )}

                    {/* Invoices */}
                    {siteInvoices.length > 0 && (
                        <section>
                            <div className="border-b border-border-sub pb-2 mb-3">
                                <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Receipt size={11} /> Invoices ({siteInvoices.length})
                                </p>
                            </div>
                            {siteInvoices.slice(0, 5).map(inv => (
                                <div key={inv.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border-sub bg-bg-secondary mb-1.5">
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-bold text-text-primary uppercase">{inv.invoiceNumber}</p>
                                        <p className="text-[8px] text-text-muted">Due {inv.dueDate}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className={cn('text-[10px] font-bold font-mono', inv.status === 'paid' ? 'text-text-green' : inv.status === 'overdue' ? 'text-text-red' : 'text-text-primary')}>${inv.total}</p>
                                        <Badge variant={inv.status === 'paid' ? 'active' : inv.status === 'overdue' ? 'destructive' : 'onhold'} className="text-[6px] uppercase h-3">{inv.status}</Badge>
                                    </div>
                                </div>
                            ))}
                        </section>
                    )}
                </div>
            </div>

            {/* Doc Upload Dialog */}
            <Dialog open={docOpen} onOpenChange={setDocOpen}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
                            <Upload size={14} className="text-brand-red" /> Upload Site Document
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Document Name</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. Floor Plan" value={docForm.name} onChange={e => setDocForm(p => ({ ...p, name: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Type</Label>
                            <Select value={docForm.documentType} onValueChange={v => setDocForm(p => ({ ...p, documentType: v }))}>
                                <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-bg-elevated border-border-main">
                                    {Object.entries(CDOC_TYPE_LABELS).map(([k, v]) => (
                                        <SelectItem key={k} value={k} className="text-[11px]">{v}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Expiration Date (optional)</Label>
                            <Input type="date" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={docForm.expirationDate} onChange={e => setDocForm(p => ({ ...p, expirationDate: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setDocOpen(false)} className="text-[10px] font-black uppercase">Cancel</Button>
                        <Button size="sm" onClick={handleUploadDoc} disabled={!docForm.name || docSaving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
                            {docSaving ? 'Saving...' : 'Upload'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
