'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, onSnapshot, addDoc, updateDoc, setDoc } from 'firebase/firestore';
import type { Technician, Site, Project, WorkOrder, Invoice, Quote, ClientDocument, ClientContact, SiteAccessInfo, ClientNote } from '@/lib/types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
    ArrowLeft, Building2, Mail, Phone, MapPin, Briefcase,
    Receipt, Users, FileText, CheckCircle, AlertTriangle, Plus, DollarSign,
    Upload, Key, Shield, Lock, PenLine, User, ChevronRight, StickyNote,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO, differenceInDays } from 'date-fns';
import Link from 'next/link';

const ACCOUNT_STATUS_OPTIONS = [
    { value: 'lead', label: 'Lead' },
    { value: 'prospect', label: 'Prospect' },
    { value: 'active', label: 'Active' },
    { value: 'vip', label: 'VIP' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'past_client', label: 'Past Client' },
    { value: 'collections', label: 'Collections' },
    { value: 'do_not_service', label: 'Do Not Service' },
];

const ACCOUNT_STATUS_COLORS: Record<string, string> = {
    active: 'bg-text-green/10 text-text-green border-text-green/20',
    lead: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
    prospect: 'bg-sky-400/10 text-sky-400 border-sky-400/20',
    vip: 'bg-purple-400/10 text-purple-400 border-purple-400/20',
    inactive: 'bg-bg-tertiary text-text-muted border-border-sub',
    on_hold: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    past_client: 'bg-bg-tertiary text-text-muted border-border-sub',
    collections: 'bg-text-red/10 text-text-red border-text-red/20',
    do_not_service: 'bg-text-red/10 text-text-red border-text-red/20',
};

const CDOC_TYPE_LABELS: Record<string, string> = {
    contract: 'Contract', blueprint: 'Blueprint', compliance: 'Compliance',
    w9: 'W-9', insurance: 'Insurance', agreement: 'Agreement',
    permit: 'Permit', other: 'Other',
};

const CONTACT_TYPE_LABELS: Record<string, string> = {
    main: 'Main', billing: 'Billing', site: 'Site', emergency: 'Emergency',
    decision_maker: 'Decision Maker', accounts_payable: 'Accounts Payable',
    store_manager: 'Store Manager', regional_manager: 'Regional Manager',
};

export default function ClientWorkspacePage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();

    const [client, setClient] = useState<Technician | null>(null);
    const [sites, setSites] = useState<Site[]>([]);
    const [contacts, setContacts] = useState<ClientContact[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [clientDocuments, setClientDocuments] = useState<ClientDocument[]>([]);
    const [clientNotes, setClientNotes] = useState<ClientNote[]>([]);
    const [accessInfo, setAccessInfo] = useState<Partial<SiteAccessInfo>>({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

    // Note form
    const [noteText, setNoteText] = useState('');
    const [noteType, setNoteType] = useState<'client' | 'site'>('client');
    const [noteSiteId, setNoteSiteId] = useState('');
    const [addingNote, setAddingNote] = useState(false);

    // Contact form
    const [contactOpen, setContactOpen] = useState(false);
    const [contactForm, setContactForm] = useState({ name: '', title: '', phone: '', email: '', contactType: 'main', siteId: '', notes: '' });
    const [contactSaving, setContactSaving] = useState(false);
    const [contactFilter, setContactFilter] = useState<string>('all');

    // Document upload
    const [cdocOpen, setCdocOpen] = useState(false);
    const [cdocForm, setCdocForm] = useState({ name: '', documentType: 'other', expirationDate: '', notes: '' });
    const [cdocSaving, setCdocSaving] = useState(false);

    // Access info editing
    const [editingAccess, setEditingAccess] = useState(false);
    const [accessForm, setAccessForm] = useState<Partial<SiteAccessInfo>>({});
    const [accessSaving, setAccessSaving] = useState(false);

    // Jobs filter
    const [jobsStatusFilter, setJobsStatusFilter] = useState<string>('all');

    // Edit client
    const [editClientOpen, setEditClientOpen] = useState(false);
    const [editClientForm, setEditClientForm] = useState({ name: '', company: '', email: '', phone: '', accountStatus: 'active' });
    const [editClientSaving, setEditClientSaving] = useState(false);

    useEffect(() => {
        if (!id) return;

        getDoc(doc(db, 'users', id)).then(snap => {
            if (snap.exists()) setClient({ ...snap.data(), id: snap.id } as Technician);
            setLoading(false);
        });

        const unsubNotes = onSnapshot(collection(db, `users/${id}/clientNotes`), snap => {
            const notes = snap.docs.map(d => ({ ...d.data(), id: d.id } as ClientNote));
            setClientNotes(notes.sort((a, b) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                return (b.createdAt || '').localeCompare(a.createdAt || '');
            }));
        });
        const unsubCDocs = onSnapshot(collection(db, `users/${id}/clientDocuments`), snap => {
            setClientDocuments(snap.docs.map(d => ({ ...d.data(), id: d.id } as ClientDocument)));
        });
        const unsubContacts = onSnapshot(collection(db, `users/${id}/contacts`), snap => {
            setContacts(snap.docs.map(d => ({ ...d.data(), id: d.id } as ClientContact)));
        });
        const unsubAccess = onSnapshot(doc(db, `users/${id}/accessInfo/main`), snap => {
            if (snap.exists()) setAccessInfo(snap.data() as Partial<SiteAccessInfo>);
        });
        const unsubSites = onSnapshot(collection(db, 'sites'), snap => {
            setSites(snap.docs.map(d => ({ ...d.data(), id: d.id } as Site)));
        });
        const unsubProjects = onSnapshot(collection(db, 'projects'), snap => {
            setProjects(snap.docs.map(d => ({ ...d.data(), id: d.id } as Project)));
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

        return () => { unsubNotes(); unsubCDocs(); unsubContacts(); unsubAccess(); unsubSites(); unsubProjects(); unsubWO(); unsubInv(); unsubQ(); };
    }, [id]);

    const clientName = client?.clientCompany || client?.name || '';

    const clientSites = useMemo(() => sites.filter(s => s.clientName === clientName || s.clientId === id), [sites, clientName, id]);
    const clientProjects = useMemo(() => projects.filter(p => p.client === clientName), [projects, clientName]);
    const clientWOs = useMemo(() => workOrders.filter(wo => wo.clientName === clientName), [workOrders, clientName]);
    const clientInvoices = useMemo(() => invoices.filter(inv => inv.clientName === clientName || inv.clientId === id), [invoices, clientName, id]);
    const clientQuotes = useMemo(() => quotes.filter(q => q.customerName === clientName || q.clientId === id), [quotes, clientName, id]);

    const filteredContacts = useMemo(() => {
        if (contactFilter === 'all') return contacts;
        return contacts.filter(c => c.contactType === contactFilter);
    }, [contacts, contactFilter]);

    const filteredJobs = useMemo(() => {
        if (jobsStatusFilter === 'all') return clientWOs;
        if (jobsStatusFilter === 'open') return clientWOs.filter(wo => wo.status !== 'completed');
        if (jobsStatusFilter === 'completed') return clientWOs.filter(wo => wo.status === 'completed');
        return clientWOs.filter(wo => wo.status === jobsStatusFilter);
    }, [clientWOs, jobsStatusFilter]);

    const stats = useMemo(() => ({
        openWOs: clientWOs.filter(wo => wo.status !== 'completed').length,
        completedWOs: clientWOs.filter(wo => wo.status === 'completed').length,
        outstandingBalance: clientInvoices.filter(inv => inv.status === 'sent' || inv.status === 'overdue').reduce((s, inv) => s + inv.total, 0),
        totalRevenue: clientInvoices.filter(inv => inv.status === 'paid').reduce((s, inv) => s + inv.total, 0),
        lastJobDate: clientWOs.filter(wo => wo.status === 'completed' && wo.scheduleDate).sort((a, b) => b.scheduleDate.localeCompare(a.scheduleDate))[0]?.scheduleDate || null,
    }), [clientWOs, clientInvoices]);

    const handleAddNote = async () => {
        if (!noteText.trim() || !id) return;
        setAddingNote(true);
        try {
            await addDoc(collection(db, `users/${id}/clientNotes`), {
                text: noteText.trim(),
                createdBy: 'Admin',
                createdAt: new Date().toISOString(),
                noteType,
                relatedSiteId: noteType === 'site' ? noteSiteId : null,
                isPinned: false,
                visibility: 'internal',
            });
            setNoteText('');
            setNoteType('client');
            setNoteSiteId('');
        } finally {
            setAddingNote(false);
        }
    };

    const handleAddContact = async () => {
        if (!contactForm.name || !id) return;
        setContactSaving(true);
        try {
            await addDoc(collection(db, `users/${id}/contacts`), {
                ...contactForm,
                clientId: id,
                createdAt: new Date().toISOString(),
            });
            setContactOpen(false);
            setContactForm({ name: '', title: '', phone: '', email: '', contactType: 'main', siteId: '', notes: '' });
        } finally {
            setContactSaving(false);
        }
    };

    const handleUploadCDoc = async () => {
        if (!cdocForm.name || !id) return;
        setCdocSaving(true);
        try {
            await addDoc(collection(db, `users/${id}/clientDocuments`), {
                name: cdocForm.name,
                documentType: cdocForm.documentType,
                fileUrl: '#',
                uploadedBy: 'Admin',
                uploadedAt: new Date().toISOString(),
                expirationDate: cdocForm.expirationDate || null,
                notes: cdocForm.notes || null,
            });
            setCdocOpen(false);
            setCdocForm({ name: '', documentType: 'other', expirationDate: '', notes: '' });
        } finally {
            setCdocSaving(false);
        }
    };

    const handleSaveAccess = async () => {
        if (!id) return;
        setAccessSaving(true);
        try {
            await setDoc(doc(db, `users/${id}/accessInfo/main`), {
                ...accessForm,
                clientId: id,
                updatedAt: new Date().toISOString(),
            }, { merge: true });
            setEditingAccess(false);
        } finally {
            setAccessSaving(false);
        }
    };

    const openEditClient = () => {
        if (!client) return;
        setEditClientForm({
            name: client.name || '',
            company: client.clientCompany || '',
            email: client.email || '',
            phone: client.phone || '',
            accountStatus: client.accountStatus || 'active',
        });
        setEditClientOpen(true);
    };

    const handleSaveClient = async () => {
        if (!id) return;
        setEditClientSaving(true);
        try {
            await updateDoc(doc(db, 'users', id), {
                name: editClientForm.name,
                clientCompany: editClientForm.company,
                email: editClientForm.email,
                phone: editClientForm.phone,
                accountStatus: editClientForm.accountStatus,
                updatedAt: new Date().toISOString(),
            });
            setClient(prev => prev ? {
                ...prev,
                name: editClientForm.name,
                clientCompany: editClientForm.company,
                email: editClientForm.email,
                phone: editClientForm.phone,
                accountStatus: editClientForm.accountStatus as Technician['accountStatus'],
            } : prev);
            setEditClientOpen(false);
        } finally {
            setEditClientSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="space-y-2 text-center">
                    <div className="h-16 w-16 rounded-full bg-bg-secondary animate-pulse mx-auto" />
                    <div className="h-4 w-40 bg-bg-secondary animate-pulse rounded mx-auto" />
                </div>
            </div>
        );
    }

    if (!client) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                <AlertTriangle size={32} className="text-text-red" />
                <p className="text-[11px] font-bold text-text-muted uppercase">Client not found</p>
                <Button variant="ghost" size="sm" onClick={() => router.push('/admin/sites')} className="text-[10px] uppercase font-bold">
                    <ArrowLeft size={14} className="mr-2" /> Back to Clients
                </Button>
            </div>
        );
    }

    const tabTriggerClass = "px-0 pb-4 pt-0 h-auto bg-transparent rounded-none border-b-2 border-transparent text-[10px] font-black uppercase tracking-[0.15em] text-text-muted data-[state=active]:bg-transparent data-[state=active]:text-text-primary data-[state=active]:border-brand-red data-[state=active]:shadow-none transition-all";
    const currentAccountStatus = client.accountStatus || 'active';

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => router.push('/admin/sites')} className="h-8 text-[10px] uppercase font-bold text-text-muted">
                    <ArrowLeft size={14} className="mr-2" /> Clients
                </Button>
            </div>

            {/* Client hero */}
            <div className="flex flex-col md:flex-row gap-5 p-5 rounded-xl border border-border-sub bg-bg-secondary">
                <div className="h-16 w-16 rounded-xl bg-brand-red/10 border border-brand-red/20 flex items-center justify-center shrink-0">
                    <Building2 size={24} className="text-brand-red" />
                </div>
                <div className="flex-1 space-y-3">
                    <div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-2xl font-black uppercase tracking-tight text-text-primary">{clientName || 'Unnamed Client'}</h1>
                            <Badge className={cn('text-[8px] uppercase border h-5', ACCOUNT_STATUS_COLORS[currentAccountStatus] || ACCOUNT_STATUS_COLORS.active)}>
                                {currentAccountStatus.replace(/_/g, ' ')}
                            </Badge>
                            <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase" onClick={openEditClient}>
                                <PenLine size={10} className="mr-1.5" /> Edit
                            </Button>
                        </div>
                        {client.name && client.clientCompany && <p className="text-[11px] text-text-muted mt-0.5">{client.name}</p>}
                    </div>
                    <div className="flex flex-wrap gap-4">
                        {client.email && (
                            <a href={`mailto:${client.email}`} className="flex items-center gap-2 text-[11px] text-text-secondary hover:text-brand-red transition-colors">
                                <Mail size={12} className="text-text-muted" />{client.email}
                            </a>
                        )}
                        {client.phone && (
                            <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-[11px] text-text-secondary hover:text-brand-red transition-colors">
                                <Phone size={12} className="text-text-muted" />{client.phone}
                            </a>
                        )}
                    </div>
                    {client.billingDetails && (
                        <p className="text-[9px] text-text-muted uppercase">
                            Billing: {client.billingDetails.terms} · {client.billingDetails.deliveryMethod}
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap md:flex-col gap-2 md:w-48 shrink-0">
                    {[
                        { label: 'Open Jobs', value: stats.openWOs, color: 'text-text-amber' },
                        { label: 'Sites', value: clientSites.length, color: 'text-text-secondary' },
                        { label: 'Outstanding', value: `$${stats.outstandingBalance.toFixed(0)}`, color: 'text-text-red' },
                        { label: 'Revenue', value: `$${stats.totalRevenue.toFixed(0)}`, color: 'text-text-green' },
                    ].map(kpi => (
                        <div key={kpi.label} className="flex-1 p-2.5 rounded-lg bg-bg-primary border border-border-sub text-center">
                            <p className={cn('text-[14px] font-bold font-mono', kpi.color)}>{kpi.value}</p>
                            <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">{kpi.label}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="overflow-x-auto">
                    <TabsList className="border-b-2 border-border-sub bg-transparent rounded-none h-auto p-0 gap-6 mb-6 min-w-max w-full">
                        {[
                            { value: 'overview', label: 'Overview' },
                            { value: 'sites', label: `Sites (${clientSites.length})` },
                            { value: 'contacts', label: `Contacts (${contacts.length})` },
                            { value: 'jobs', label: `Jobs (${clientWOs.length})` },
                            { value: 'quotes', label: `Quotes (${clientQuotes.length})` },
                            { value: 'invoices', label: `Invoices (${clientInvoices.length})` },
                            { value: 'notes', label: `Notes (${clientNotes.length})` },
                            { value: 'documents', label: `Documents (${clientDocuments.length})` },
                            { value: 'accessInfo', label: 'Access Info' },
                        ].map(tab => (
                            <TabsTrigger key={tab.value} value={tab.value} className={tabTriggerClass}>{tab.label}</TabsTrigger>
                        ))}
                    </TabsList>
                </div>

                {/* Overview */}
                <TabsContent value="overview" className="m-0">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        <div className="lg:col-span-2 space-y-5">
                            <div>
                                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 mb-3">Recent Jobs</h3>
                                {clientWOs.length === 0
                                    ? <p className="text-[10px] text-text-muted uppercase py-3">No work orders</p>
                                    : clientWOs.slice(0, 5).map(wo => (
                                        <Link key={wo.id} href={`/admin/assignments/${wo.id}`} className="flex items-center justify-between p-2.5 rounded-lg border border-border-sub bg-bg-secondary hover:border-brand-red/30 transition-colors mb-2 group">
                                            <div className="min-w-0">
                                                <p className="text-[11px] font-bold text-text-primary uppercase truncate group-hover:text-brand-red transition-colors">{wo.title || wo.description}</p>
                                                <p className="text-[9px] text-text-muted uppercase">{wo.scheduleDate} · {wo.location}</p>
                                            </div>
                                            <Badge variant={wo.status === 'completed' ? 'active' : 'scheduled'} className="text-[7px] uppercase h-4 shrink-0 ml-2">{wo.status}</Badge>
                                        </Link>
                                    ))}
                            </div>
                            <div>
                                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 mb-3">Active Projects</h3>
                                {clientProjects.filter(p => p.status === 'active').length === 0
                                    ? <p className="text-[10px] text-text-muted uppercase py-3">No active projects</p>
                                    : clientProjects.filter(p => p.status === 'active').map(p => (
                                        <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border-sub bg-bg-secondary mb-2">
                                            <div className="min-w-0">
                                                <p className="text-[11px] font-bold text-text-primary uppercase truncate">{p.name}</p>
                                                <p className="text-[9px] text-text-muted uppercase">{p.location} · {p.phases?.length || 0} phase{p.phases?.length !== 1 ? 's' : ''}</p>
                                            </div>
                                            <Badge variant="active" className="text-[7px] uppercase h-4 shrink-0">Active</Badge>
                                        </div>
                                    ))}
                            </div>
                        </div>
                        <div className="space-y-5">
                            <div>
                                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 mb-3">Sites ({clientSites.length})</h3>
                                {clientSites.slice(0, 5).map(s => (
                                    <Link key={s.id} href={`/admin/clients/${id}/sites/${s.id}`} className="flex items-center gap-2 p-2 rounded-lg hover:bg-bg-secondary transition-colors mb-1 group">
                                        <MapPin size={10} className="text-brand-red shrink-0" />
                                        <p className="text-[10px] font-bold text-text-primary uppercase group-hover:text-brand-red transition-colors truncate">{s.name}</p>
                                    </Link>
                                ))}
                            </div>
                            <div>
                                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 mb-3">Outstanding Invoices</h3>
                                {clientInvoices.filter(i => i.status !== 'paid' && i.status !== 'void').slice(0, 4).map(inv => (
                                    <div key={inv.id} className="flex items-center justify-between p-2 rounded-lg border border-border-sub bg-bg-secondary mb-1">
                                        <div>
                                            <p className="text-[10px] font-bold text-text-primary uppercase">{inv.invoiceNumber}</p>
                                            <p className="text-[8px] text-text-muted uppercase">Due {inv.dueDate}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[11px] font-bold text-text-red font-mono">${inv.total}</p>
                                            <Badge variant={inv.status === 'overdue' ? 'destructive' : 'onhold'} className="text-[6px] uppercase h-3">{inv.status}</Badge>
                                        </div>
                                    </div>
                                ))}
                                {clientInvoices.filter(i => i.status !== 'paid' && i.status !== 'void').length === 0 &&
                                    <p className="text-[10px] text-text-muted uppercase py-2">No outstanding invoices</p>}
                            </div>
                            {stats.lastJobDate && (
                                <div className="p-3 rounded-lg border border-border-sub bg-bg-secondary">
                                    <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Last Job Date</p>
                                    <p className="text-[11px] font-bold text-text-primary mt-0.5">{stats.lastJobDate}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </TabsContent>

                {/* Sites */}
                <TabsContent value="sites" className="m-0">
                    {clientSites.length === 0
                        ? <p className="text-[10px] text-text-muted uppercase py-8 text-center">No sites registered for this client</p>
                        : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {clientSites.map(s => {
                                const siteJobs = clientWOs.filter(wo => wo.location === s.location || wo.location === s.name);
                                const openSiteJobs = siteJobs.filter(wo => wo.status !== 'completed').length;
                                const lastService = siteJobs.filter(wo => wo.status === 'completed').sort((a, b) => b.scheduleDate.localeCompare(a.scheduleDate))[0]?.scheduleDate;
                                return (
                                    <Link key={s.id} href={`/admin/clients/${id}/sites/${s.id}`} className="p-4 rounded-xl border border-border-sub bg-bg-secondary hover:border-brand-red transition-colors group flex flex-col gap-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-[12px] font-black uppercase text-text-primary group-hover:text-brand-red transition-colors truncate">{s.name}</p>
                                                {s.location && <p className="flex items-center gap-1 text-[9px] text-text-muted mt-0.5"><MapPin size={9} />{s.location}</p>}
                                            </div>
                                            <Badge variant={s.status === 'active' ? 'active' : 'completed'} className="text-[7px] uppercase h-4 shrink-0">{s.status || 'active'}</Badge>
                                        </div>
                                        {s.managerName && <p className="flex items-center gap-1 text-[9px] text-text-muted"><User size={9} />{s.managerName}</p>}
                                        <div className="flex items-center gap-4 pt-1 border-t border-border-sub">
                                            <div className="text-center">
                                                <p className={cn('text-[13px] font-black font-mono', openSiteJobs > 0 ? 'text-text-amber' : 'text-text-muted')}>{openSiteJobs}</p>
                                                <p className="text-[7px] font-bold text-text-muted uppercase">Open Jobs</p>
                                            </div>
                                            {lastService && (
                                                <div>
                                                    <p className="text-[9px] font-bold text-text-muted uppercase">Last service</p>
                                                    <p className="text-[9px] text-text-secondary">{lastService}</p>
                                                </div>
                                            )}
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>}
                </TabsContent>

                {/* Contacts */}
                <TabsContent value="contacts" className="m-0">
                    <div className="flex items-center justify-between mb-4 gap-3">
                        <div className="flex items-center gap-2 overflow-x-auto">
                            {['all', 'main', 'billing', 'site', 'emergency', 'decision_maker'].map(f => (
                                <button
                                    key={f}
                                    onClick={() => setContactFilter(f)}
                                    className={cn('text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap',
                                        contactFilter === f
                                            ? 'bg-brand-red text-white border-brand-red'
                                            : 'bg-bg-primary text-text-muted border-border-sub hover:border-border-main'
                                    )}
                                >
                                    {f === 'all' ? 'All' : CONTACT_TYPE_LABELS[f] || f}
                                </button>
                            ))}
                        </div>
                        <Button size="sm" className="h-8 text-[10px] font-bold uppercase bg-brand-red hover:bg-brand-red/90 text-white shrink-0" onClick={() => setContactOpen(true)}>
                            <Plus size={11} className="mr-1.5" /> Add Contact
                        </Button>
                    </div>
                    {filteredContacts.length === 0
                        ? <p className="text-[10px] text-text-muted uppercase py-8 text-center">No contacts found</p>
                        : <div className="rounded-xl border border-border-sub overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-border-sub">
                                        <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Name</TableHead>
                                        <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Phone</TableHead>
                                        <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Email</TableHead>
                                        <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Type</TableHead>
                                        <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Site</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredContacts.map(c => (
                                        <TableRow key={c.id} className="border-border-sub">
                                            <TableCell>
                                                <p className="text-[10px] font-bold text-text-primary uppercase">{c.name}</p>
                                                {c.title && <p className="text-[9px] text-text-muted">{c.title}</p>}
                                            </TableCell>
                                            <TableCell className="text-[10px] text-text-secondary">{c.phone || '—'}</TableCell>
                                            <TableCell className="text-[10px] text-text-secondary">{c.email || '—'}</TableCell>
                                            <TableCell>
                                                <Badge variant="scheduled" className="text-[7px] uppercase h-4">{CONTACT_TYPE_LABELS[c.contactType] || c.contactType}</Badge>
                                            </TableCell>
                                            <TableCell className="text-[9px] text-text-muted">
                                                {c.siteId ? clientSites.find(s => s.id === c.siteId)?.name || c.siteId : '—'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>}
                </TabsContent>

                {/* Jobs */}
                <TabsContent value="jobs" className="m-0">
                    <div className="flex items-center gap-2 mb-4 overflow-x-auto">
                        {[
                            { value: 'all', label: 'All' },
                            { value: 'open', label: 'Open' },
                            { value: 'completed', label: 'Completed' },
                            { value: 'unassigned', label: 'Unassigned' },
                        ].map(f => (
                            <button
                                key={f.value}
                                onClick={() => setJobsStatusFilter(f.value)}
                                className={cn('text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap',
                                    jobsStatusFilter === f.value
                                        ? 'bg-brand-red text-white border-brand-red'
                                        : 'bg-bg-primary text-text-muted border-border-sub hover:border-border-main'
                                )}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                    {filteredJobs.length === 0
                        ? <p className="text-[10px] text-text-muted uppercase py-8 text-center">No jobs match filter</p>
                        : <div className="space-y-2">
                            {filteredJobs.map(wo => (
                                <Link key={wo.id} href={`/admin/assignments/${wo.id}`} className="flex items-center justify-between p-3.5 rounded-xl border border-border-sub bg-bg-secondary hover:border-brand-red/30 transition-colors group">
                                    <div className="min-w-0">
                                        <p className="text-[12px] font-bold text-text-primary uppercase group-hover:text-brand-red transition-colors truncate">{wo.title || wo.description}</p>
                                        <p className="text-[9px] text-text-muted uppercase">{wo.scheduleDate} · {wo.location}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[10px] font-bold font-mono text-text-primary">${wo.pay}</span>
                                        <Badge variant={wo.status === 'completed' ? 'active' : wo.status === 'unassigned' ? 'destructive' : 'scheduled'} className="text-[7px] uppercase h-4">{wo.status}</Badge>
                                        <ChevronRight size={12} className="text-text-muted group-hover:text-text-primary" />
                                    </div>
                                </Link>
                            ))}
                        </div>}
                </TabsContent>

                {/* Quotes */}
                <TabsContent value="quotes" className="m-0">
                    {clientQuotes.length === 0
                        ? <p className="text-[10px] text-text-muted uppercase py-8 text-center">No quotes on file</p>
                        : (
                            <div className="rounded-xl border border-border-sub overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-border-sub">
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Title</TableHead>
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Scope</TableHead>
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted text-right">Total</TableHead>
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Expires</TableHead>
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {clientQuotes.map(q => (
                                            <TableRow key={q.id} className="border-border-sub">
                                                <TableCell className="font-bold text-[10px] text-text-primary">{q.title}</TableCell>
                                                <TableCell className="text-[9px] text-text-muted max-w-[200px] truncate">{q.scopeSummary}</TableCell>
                                                <TableCell className="text-[10px] font-mono text-text-primary text-right">${q.total}</TableCell>
                                                <TableCell className="text-[10px] text-text-muted">{q.expirationDate || '—'}</TableCell>
                                                <TableCell>
                                                    <Badge className={cn('text-[7px] uppercase h-4 border',
                                                        q.status === 'approved' ? 'bg-text-green/10 text-text-green border-text-green/20' :
                                                        q.status === 'rejected' ? 'bg-text-red/10 text-text-red border-text-red/20' :
                                                        'bg-amber-400/10 text-amber-400 border-amber-400/20'
                                                    )}>{q.status}</Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                </TabsContent>

                {/* Invoices */}
                <TabsContent value="invoices" className="m-0">
                    {clientInvoices.length === 0
                        ? <p className="text-[10px] text-text-muted uppercase py-8 text-center">No invoices on file</p>
                        : <div className="space-y-2">
                            {clientInvoices.map(inv => (
                                <div key={inv.id} className="flex items-center justify-between p-3.5 rounded-xl border border-border-sub bg-bg-secondary">
                                    <div className="min-w-0">
                                        <p className="text-[12px] font-bold text-text-primary uppercase">{inv.invoiceNumber}</p>
                                        <p className="text-[9px] text-text-muted uppercase">Issued {inv.issueDate} · Due {inv.dueDate}</p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <p className={cn('text-[13px] font-bold font-mono', inv.status === 'paid' ? 'text-text-green' : inv.status === 'overdue' ? 'text-text-red' : 'text-text-primary')}>${inv.total}</p>
                                        <Badge variant={inv.status === 'paid' ? 'active' : inv.status === 'overdue' ? 'destructive' : 'onhold'} className="text-[7px] uppercase h-4">{inv.status}</Badge>
                                    </div>
                                </div>
                            ))}
                        </div>}
                </TabsContent>

                {/* Notes */}
                <TabsContent value="notes" className="m-0">
                    <div className="space-y-4 max-w-2xl">
                        <div className="p-4 rounded-xl border border-border-sub bg-bg-secondary space-y-3">
                            <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Add Note</p>
                            <Textarea
                                className="text-[11px] bg-bg-primary border-border-main min-h-[80px]"
                                placeholder="Add a note about this client..."
                                value={noteText}
                                onChange={e => setNoteText(e.target.value)}
                            />
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-2">
                                    <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted whitespace-nowrap">Type:</Label>
                                    <Select value={noteType} onValueChange={v => setNoteType(v as 'client' | 'site')}>
                                        <SelectTrigger className="h-7 w-24 text-[10px] bg-bg-primary border-border-main">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-bg-elevated border-border-main">
                                            <SelectItem value="client" className="text-[10px]">Client</SelectItem>
                                            <SelectItem value="site" className="text-[10px]">Site</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {noteType === 'site' && clientSites.length > 0 && (
                                    <Select value={noteSiteId} onValueChange={setNoteSiteId}>
                                        <SelectTrigger className="h-7 w-40 text-[10px] bg-bg-primary border-border-main">
                                            <SelectValue placeholder="Select site" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-bg-elevated border-border-main">
                                            {clientSites.map(s => (
                                                <SelectItem key={s.id} value={s.id} className="text-[10px]">{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                                <Button size="sm" onClick={handleAddNote} disabled={addingNote || !noteText.trim()} className="h-7 bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase ml-auto">
                                    <Plus size={11} className="mr-1" /> Add
                                </Button>
                            </div>
                        </div>
                        {clientNotes.length === 0
                            ? <p className="text-[10px] text-text-muted uppercase py-4 text-center">No notes yet</p>
                            : clientNotes.map(note => (
                                <div key={note.id} className={cn('p-3 rounded-lg border bg-bg-secondary', note.isPinned ? 'border-brand-red/30' : 'border-border-sub')}>
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <Badge variant={note.noteType === 'site' ? 'scheduled' : 'onhold'} className="text-[7px] uppercase h-4">{note.noteType}</Badge>
                                        {note.relatedSiteId && <span className="text-[8px] text-text-muted">{clientSites.find(s => s.id === note.relatedSiteId)?.name}</span>}
                                        {note.isPinned && <span className="text-[8px] text-brand-red font-bold uppercase">Pinned</span>}
                                    </div>
                                    <p className="text-[11px] text-text-primary">{note.text}</p>
                                    <p className="text-[8px] text-text-muted mt-1.5 font-mono">
                                        {note.createdBy} · {note.createdAt ? format(parseISO(note.createdAt), 'MMM d, yyyy h:mm a') : ''}
                                    </p>
                                </div>
                            ))}
                    </div>
                </TabsContent>

                {/* Documents */}
                <TabsContent value="documents" className="m-0">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest flex items-center gap-2">
                            <FileText size={11} /> {clientDocuments.length} Document{clientDocuments.length !== 1 ? 's' : ''}
                        </p>
                        <Button size="sm" className="h-8 text-[10px] font-bold uppercase bg-brand-red hover:bg-brand-red/90 text-white" onClick={() => setCdocOpen(true)}>
                            <Upload size={11} className="mr-1.5" /> Upload Document
                        </Button>
                    </div>
                    {clientDocuments.length === 0
                        ? <p className="text-[10px] text-text-muted uppercase py-8 text-center">No documents on file</p>
                        : (
                            <div className="rounded-xl border border-border-sub overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-border-sub">
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Name</TableHead>
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Type</TableHead>
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Uploaded</TableHead>
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Expires</TableHead>
                                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted w-20">File</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {clientDocuments.map(d => {
                                            const daysLeft = d.expirationDate ? differenceInDays(new Date(d.expirationDate), new Date()) : null;
                                            const expiringSoon = daysLeft !== null && daysLeft <= 30 && daysLeft >= 0;
                                            const expired = daysLeft !== null && daysLeft < 0;
                                            return (
                                                <TableRow key={d.id} className={cn('border-border-sub', expiringSoon && 'bg-amber-400/5', expired && 'bg-text-red/5')}>
                                                    <TableCell className="font-bold text-[10px] text-text-primary">{d.name}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="scheduled" className="text-[7px] uppercase h-4">{CDOC_TYPE_LABELS[d.documentType] || d.documentType}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-[10px] text-text-muted">
                                                        {d.uploadedAt ? format(new Date(d.uploadedAt), 'MM/dd/yyyy') : '—'}
                                                    </TableCell>
                                                    <TableCell className={cn('text-[10px]', expiringSoon ? 'text-amber-400 font-bold' : expired ? 'text-text-red font-bold' : 'text-text-muted')}>
                                                        {d.expirationDate ? format(new Date(d.expirationDate), 'MM/dd/yyyy') : '—'}
                                                        {expiringSoon && <span className="ml-1 text-[8px]">({daysLeft}d)</span>}
                                                        {expired && <span className="ml-1 text-[8px]">Expired</span>}
                                                    </TableCell>
                                                    <TableCell>
                                                        {d.fileUrl && d.fileUrl !== '#' && (
                                                            <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-[9px] text-brand-red hover:underline font-bold">View</a>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                </TabsContent>

                {/* Access Info */}
                <TabsContent value="accessInfo" className="m-0">
                    <div className="space-y-5 max-w-2xl">
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black text-text-muted uppercase tracking-widest flex items-center gap-2">
                                <Key size={11} /> Client-Wide Access Info
                            </p>
                            {!editingAccess ? (
                                <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase" onClick={() => { setAccessForm(accessInfo); setEditingAccess(true); }}>
                                    <PenLine size={10} className="mr-1.5" /> Edit
                                </Button>
                            ) : (
                                <div className="flex gap-2">
                                    <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase" onClick={() => setEditingAccess(false)}>Cancel</Button>
                                    <Button size="sm" className="h-7 text-[9px] font-bold uppercase bg-brand-red hover:bg-brand-red/90 text-white" onClick={handleSaveAccess} disabled={accessSaving}>
                                        {accessSaving ? 'Saving...' : 'Save'}
                                    </Button>
                                </div>
                            )}
                        </div>

                        <div className="p-4 rounded-xl border border-border-sub bg-bg-secondary space-y-4">
                            {editingAccess ? (
                                <div className="grid grid-cols-1 gap-3">
                                    {[
                                        { key: 'checkInProcess', label: 'Check-In Process' },
                                        { key: 'securityDesk', label: 'Security Desk' },
                                        { key: 'gateCode', label: 'Gate Code' },
                                        { key: 'lockboxCode', label: 'Lockbox Code' },
                                        { key: 'alarmInstructions', label: 'Alarm Instructions' },
                                        { key: 'parkingInstructions', label: 'Parking Instructions' },
                                        { key: 'afterHoursAccess', label: 'After-Hours Access' },
                                        { key: 'emergencyContact', label: 'Emergency Contact' },
                                        { key: 'specialSafetyRequirements', label: 'Special Safety Requirements' },
                                    ].map(field => (
                                        <div key={field.key} className="space-y-1">
                                            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">{field.label}</Label>
                                            <Input
                                                className="h-9 text-[11px] bg-bg-primary border-border-main"
                                                value={(accessForm as any)[field.key] || ''}
                                                onChange={e => setAccessForm(f => ({ ...f, [field.key]: e.target.value }))}
                                            />
                                        </div>
                                    ))}
                                    <div className="flex gap-4">
                                        {[
                                            { key: 'badgeRequired', label: 'Badge Required' },
                                            { key: 'escortRequired', label: 'Escort Required' },
                                        ].map(toggle => (
                                            <label key={toggle.key} className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={(accessForm as any)[toggle.key] || false}
                                                    onChange={e => setAccessForm(f => ({ ...f, [toggle.key]: e.target.checked }))}
                                                    className="accent-brand-red"
                                                />
                                                <span className="text-[10px] font-bold uppercase text-text-muted">{toggle.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ) : Object.keys(accessInfo).filter(k => k !== 'clientId' && k !== 'updatedAt' && k !== 'id').length === 0 ? (
                                <p className="text-[10px] text-text-muted uppercase py-4 text-center">No access info on file. Click Edit to add.</p>
                            ) : (
                                <div className="space-y-2">
                                    {[
                                        { key: 'checkInProcess', label: 'Check-In', icon: CheckCircle },
                                        { key: 'securityDesk', label: 'Security Desk', icon: Shield },
                                        { key: 'gateCode', label: 'Gate Code', icon: Lock },
                                        { key: 'lockboxCode', label: 'Lockbox Code', icon: Key },
                                        { key: 'alarmInstructions', label: 'Alarm', icon: AlertTriangle },
                                        { key: 'parkingInstructions', label: 'Parking', icon: MapPin },
                                        { key: 'afterHoursAccess', label: 'After Hours', icon: Key },
                                        { key: 'emergencyContact', label: 'Emergency Contact', icon: Phone },
                                        { key: 'specialSafetyRequirements', label: 'Safety', icon: Shield },
                                    ].filter(f => (accessInfo as any)[f.key]).map(f => (
                                        <div key={f.key} className="flex items-start gap-3">
                                            <f.icon size={11} className="text-text-muted shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-[9px] font-black uppercase tracking-widest text-text-muted">{f.label}</p>
                                                <p className="text-[11px] text-text-primary">{(accessInfo as any)[f.key]}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {(accessInfo.badgeRequired || accessInfo.escortRequired) && (
                                        <div className="flex gap-3 pt-1">
                                            {accessInfo.badgeRequired && <Badge variant="destructive" className="text-[7px] uppercase h-4">Badge Required</Badge>}
                                            {accessInfo.escortRequired && <Badge variant="destructive" className="text-[7px] uppercase h-4">Escort Required</Badge>}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Per-site access */}
                        {clientSites.some(s => s.gateCode || s.lockboxCode || s.accessInstructions) && (
                            <div>
                                <p className="text-[10px] font-black text-text-muted uppercase tracking-widest flex items-center gap-2 mb-3 border-t border-border-sub pt-4">
                                    <MapPin size={11} /> Site-Specific Access
                                </p>
                                {clientSites.filter(s => s.gateCode || s.lockboxCode || s.accessInstructions).map(s => (
                                    <div key={s.id} className="p-4 rounded-xl border border-border-sub bg-bg-secondary space-y-2 mb-3">
                                        <p className="text-[11px] font-black uppercase text-text-primary">{s.name}</p>
                                        {s.gateCode && <p className="text-[10px] text-text-secondary"><span className="font-bold text-text-muted">Gate: </span>{s.gateCode}</p>}
                                        {s.lockboxCode && <p className="text-[10px] text-text-secondary"><span className="font-bold text-text-muted">Lockbox: </span>{s.lockboxCode}</p>}
                                        {s.accessInstructions && <p className="text-[10px] text-text-secondary"><span className="font-bold text-text-muted">Instructions: </span>{s.accessInstructions}</p>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            {/* Add Contact Dialog */}
            <Dialog open={contactOpen} onOpenChange={setContactOpen}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
                            <User size={14} className="text-brand-red" /> Add Contact
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Name *</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Full name" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Title / Role</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. Site Manager" value={contactForm.title} onChange={e => setContactForm(f => ({ ...f, title: e.target.value }))} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Phone</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="555-000-0000" value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Email</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="email@co.com" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Contact Type</Label>
                                <Select value={contactForm.contactType} onValueChange={v => setContactForm(f => ({ ...f, contactType: v }))}>
                                    <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        {Object.entries(CONTACT_TYPE_LABELS).map(([k, v]) => (
                                            <SelectItem key={k} value={k} className="text-[11px]">{v}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Site (optional)</Label>
                                <Select value={contactForm.siteId} onValueChange={v => setContactForm(f => ({ ...f, siteId: v }))}>
                                    <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main"><SelectValue placeholder="None" /></SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        <SelectItem value="" className="text-[11px]">None (client-level)</SelectItem>
                                        {clientSites.map(s => (
                                            <SelectItem key={s.id} value={s.id} className="text-[11px]">{s.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setContactOpen(false)} className="text-[10px] font-black uppercase">Cancel</Button>
                        <Button size="sm" onClick={handleAddContact} disabled={contactSaving || !contactForm.name} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
                            {contactSaving ? 'Saving...' : 'Add Contact'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Upload Client Document Dialog */}
            <Dialog open={cdocOpen} onOpenChange={setCdocOpen}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
                            <Upload size={14} className="text-brand-red" /> Upload Document
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Document Name</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. Master Service Agreement" value={cdocForm.name} onChange={e => setCdocForm(p => ({ ...p, name: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Document Type</Label>
                            <Select value={cdocForm.documentType} onValueChange={v => setCdocForm(p => ({ ...p, documentType: v }))}>
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
                            <Input type="date" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={cdocForm.expirationDate} onChange={e => setCdocForm(p => ({ ...p, expirationDate: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" size="sm" onClick={() => setCdocOpen(false)} className="text-[10px] font-black uppercase">Cancel</Button>
                        <Button size="sm" onClick={handleUploadCDoc} disabled={!cdocForm.name || cdocSaving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
                            {cdocSaving ? 'Saving...' : 'Upload'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Client Dialog */}
            <Dialog open={editClientOpen} onOpenChange={setEditClientOpen}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
                            <PenLine size={14} className="text-brand-red" /> Edit Client
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Company Name</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Acme Corp" value={editClientForm.company} onChange={e => setEditClientForm(f => ({ ...f, company: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Contact Name</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Jane Smith" value={editClientForm.name} onChange={e => setEditClientForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Email</Label>
                                <Input type="email" className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="jane@acme.com" value={editClientForm.email} onChange={e => setEditClientForm(f => ({ ...f, email: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Phone</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="555-000-0000" value={editClientForm.phone} onChange={e => setEditClientForm(f => ({ ...f, phone: e.target.value }))} />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Account Status</Label>
                            <Select value={editClientForm.accountStatus} onValueChange={v => setEditClientForm(f => ({ ...f, accountStatus: v }))}>
                                <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-bg-elevated border-border-main">
                                    {ACCOUNT_STATUS_OPTIONS.map(o => (
                                        <SelectItem key={o.value} value={o.value} className="text-[11px]">{o.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditClientOpen(false)} className="text-[10px] font-black uppercase">Cancel</Button>
                        <Button size="sm" onClick={handleSaveClient} disabled={editClientSaving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
                            {editClientSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
