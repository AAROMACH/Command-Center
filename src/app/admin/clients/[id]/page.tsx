'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, onSnapshot, addDoc, updateDoc } from 'firebase/firestore';
import type { Technician, Site, Project, WorkOrder, Invoice, SiteRequest, Quote, ClientDocument } from '@/lib/types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    ArrowLeft, Building2, Mail, Phone, MapPin, Briefcase, ClipboardList,
    Receipt, Users, FileText, Clock, CheckCircle, AlertTriangle, Plus, DollarSign,
    Ticket, Upload, Settings2, StickyNote,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO, differenceInDays } from 'date-fns';
import Link from 'next/link';

const ACCOUNT_STATUS_OPTIONS = [
    { value: 'active', label: 'Active' },
    { value: 'lead', label: 'Lead' },
    { value: 'prospect', label: 'Prospect' },
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

export default function ClientWorkspacePage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();

    const [client, setClient] = useState<Technician | null>(null);
    const [sites, setSites] = useState<Site[]>([]);
    const [contacts, setContacts] = useState<Technician[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [siteRequests, setSiteRequests] = useState<SiteRequest[]>([]);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [clientDocuments, setClientDocuments] = useState<ClientDocument[]>([]);
    const [notes, setNotes] = useState<{ id: string; text: string; createdAt: string }[]>([]);
    const [noteInput, setNoteInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

    // Client document upload
    const [cdocOpen, setCdocOpen] = useState(false);
    const [cdocForm, setCdocForm] = useState({ name: '', documentType: 'other', expirationDate: '', notes: '' });
    const [cdocSaving, setCdocSaving] = useState(false);

    // Account settings save state
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [accountStatus, setAccountStatus] = useState('active');

    useEffect(() => {
        if (!id) return;
        getDoc(doc(db, 'users', id)).then(snap => {
            if (snap.exists()) {
                const data = { ...snap.data(), id: snap.id } as Technician;
                setClient(data);
                setAccountStatus((data as any).accountStatus || 'active');
            }
            setLoading(false);
        });

        const unsubNotes = onSnapshot(collection(db, `users/${id}/clientNotes`), snap => {
            setNotes(snap.docs.map(d => ({ ...d.data(), id: d.id } as { id: string; text: string; createdAt: string }))
                .sort((a, b) => b.createdAt?.localeCompare(a.createdAt || '') || 0));
        });
        const unsubCDocs = onSnapshot(collection(db, `users/${id}/clientDocuments`), snap => {
            setClientDocuments(snap.docs.map(d => ({ ...d.data(), id: d.id } as ClientDocument)));
        });
        const unsubSites = onSnapshot(collection(db, 'sites'), snap => {
            setSites(snap.docs.map(d => ({ ...d.data(), id: d.id } as Site)));
        });
        const unsubContacts = onSnapshot(collection(db, 'users'), snap => {
            setContacts(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
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
        const unsubSR = onSnapshot(collection(db, 'siteRequests'), snap => {
            setSiteRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as SiteRequest)));
        });
        const unsubQ = onSnapshot(collection(db, 'quotes'), snap => {
            setQuotes(snap.docs.map(d => ({ ...d.data(), id: d.id } as Quote)));
        });

        return () => { unsubNotes(); unsubCDocs(); unsubSites(); unsubContacts(); unsubProjects(); unsubWO(); unsubInv(); unsubSR(); unsubQ(); };
    }, [id]);

    const clientName = client?.clientCompany || client?.name || '';

    const clientSites = useMemo(() => sites.filter(s => s.clientName === clientName), [sites, clientName]);
    const clientContacts = useMemo(() => contacts.filter(c => c.clientCompany === clientName || c.id === id), [contacts, clientName, id]);
    const clientProjects = useMemo(() => projects.filter(p => p.client === clientName), [projects, clientName]);
    const clientWOs = useMemo(() => workOrders.filter(wo => wo.clientName === clientName), [workOrders, clientName]);
    const clientInvoices = useMemo(() => invoices.filter(inv => inv.clientName === clientName || inv.clientId === id), [invoices, clientName, id]);
    const clientSiteReqs = useMemo(() => siteRequests.filter(r => r.clientId === id || r.clientName === clientName), [siteRequests, id, clientName]);
    const clientQuotes = useMemo(() => quotes.filter(q => q.clientName === clientName || q.clientId === id), [quotes, clientName, id]);

    const stats = useMemo(() => ({
        openWOs: clientWOs.filter(wo => wo.status !== 'completed').length,
        completedWOs: clientWOs.filter(wo => wo.status === 'completed').length,
        activeProjects: clientProjects.filter(p => p.status === 'active').length,
        outstandingBalance: clientInvoices.filter(inv => inv.status === 'sent' || inv.status === 'overdue').reduce((s, inv) => s + inv.total, 0),
        totalRevenue: clientInvoices.filter(inv => inv.status === 'paid').reduce((s, inv) => s + inv.total, 0),
    }), [clientWOs, clientProjects, clientInvoices]);

    const handleAddNote = async () => {
        if (!noteInput.trim() || !id) return;
        await addDoc(collection(db, `users/${id}/clientNotes`), {
            text: noteInput.trim(),
            createdAt: new Date().toISOString(),
        });
        setNoteInput('');
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

    const handleSaveSettings = async () => {
        if (!id) return;
        setSettingsSaving(true);
        try {
            await updateDoc(doc(db, 'users', id), { accountStatus });
            setClient(prev => prev ? { ...prev, accountStatus } as any : prev);
        } finally {
            setSettingsSaving(false);
        }
    };

    const history = useMemo(() => {
        const events: { id: string; time: string; label: string; detail: string; color: string }[] = [];
        clientWOs.filter(wo => wo.status === 'completed').forEach(wo => {
            events.push({ id: `wo-${wo.id}`, time: wo.scheduleDate || '', label: 'Job Completed', detail: wo.title || wo.id, color: 'text-text-green' });
        });
        clientInvoices.filter(inv => inv.status === 'paid').forEach(inv => {
            events.push({ id: `inv-${inv.id}`, time: inv.issueDate || '', label: 'Invoice Paid', detail: `${inv.invoiceNumber} · $${inv.total}`, color: 'text-blue-400' });
        });
        clientSiteReqs.forEach(r => {
            events.push({ id: `sr-${r.id}`, time: r.submittedDate || '', label: 'Site Request', detail: r.siteName, color: 'text-text-amber' });
        });
        return events.filter(e => e.time).sort((a, b) => b.time.localeCompare(a.time)).slice(0, 40);
    }, [clientWOs, clientInvoices, clientSiteReqs]);

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

    const currentAccountStatus = (client as any).accountStatus || 'active';

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
                            <Badge className={`text-[8px] uppercase border h-5 ${ACCOUNT_STATUS_COLORS[currentAccountStatus] || ACCOUNT_STATUS_COLORS.active}`}>
                                {currentAccountStatus.replace(/_/g, ' ')}
                            </Badge>
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
                </div>
                <div className="flex flex-wrap md:flex-col gap-2 md:w-48 shrink-0">
                    {[
                        { label: 'Open Jobs', value: stats.openWOs, color: 'text-text-amber' },
                        { label: 'Active Projects', value: stats.activeProjects, color: 'text-blue-400' },
                        { label: 'Outstanding', value: `$${stats.outstandingBalance.toFixed(0)}`, color: 'text-text-red' },
                        { label: 'Revenue', value: `$${stats.totalRevenue.toFixed(0)}`, color: 'text-text-green' },
                    ].map(kpi => (
                        <div key={kpi.label} className="flex-1 p-2.5 rounded-lg bg-bg-primary border border-border-sub text-center">
                            <p className={cn("text-[14px] font-bold font-mono", kpi.color)}>{kpi.value}</p>
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
                            { value: 'contacts', label: `Contacts (${clientContacts.length})` },
                            { value: 'projects', label: `Projects (${clientProjects.length})` },
                            { value: 'workorders', label: `Work Orders (${clientWOs.length})` },
                            { value: 'billing', label: `Billing (${clientInvoices.length + clientQuotes.length})` },
                            { value: 'tickets', label: `Tickets (${clientSiteReqs.length})` },
                            { value: 'documents', label: `Documents (${clientDocuments.length})` },
                            { value: 'notes', label: 'Notes' },
                            { value: 'history', label: 'History' },
                            { value: 'settings', label: 'Settings' },
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
                                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 mb-3">Recent Work Orders</h3>
                                {clientWOs.length === 0 ? <p className="text-[10px] text-text-muted uppercase py-3">No work orders</p> :
                                    clientWOs.slice(0, 5).map(wo => (
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
                                {clientSites.slice(0, 4).map(s => (
                                    <Link key={s.id} href={`/admin/sites/${s.id}`} className="flex items-center gap-2 p-2 rounded-lg hover:bg-bg-secondary transition-colors mb-1 group">
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
                        </div>
                    </div>
                </TabsContent>

                {/* Sites */}
                <TabsContent value="sites" className="m-0">
                    {clientSites.length === 0
                        ? <p className="text-[10px] text-text-muted uppercase py-8 text-center">No sites registered for this client</p>
                        : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {clientSites.map(s => (
                                <Link key={s.id} href={`/admin/sites/${s.id}`} className="p-4 rounded-xl border border-border-sub bg-bg-secondary hover:border-brand-red transition-colors group">
                                    <p className="text-[12px] font-black uppercase text-text-primary group-hover:text-brand-red transition-colors">{s.name}</p>
                                    {s.location && <p className="flex items-center gap-1.5 text-[9px] text-text-muted mt-1"><MapPin size={9} />{s.location}</p>}
                                    {s.managerName && <p className="flex items-center gap-1.5 text-[9px] text-text-muted mt-0.5"><Users size={9} />{s.managerName}</p>}
                                    <Badge variant={s.status === 'active' ? 'active' : 'completed'} className="text-[7px] uppercase h-4 mt-2">{s.status || 'active'}</Badge>
                                </Link>
                            ))}
                        </div>}
                </TabsContent>

                {/* Contacts */}
                <TabsContent value="contacts" className="m-0">
                    {clientContacts.length === 0
                        ? <p className="text-[10px] text-text-muted uppercase py-8 text-center">No contacts found</p>
                        : <div className="space-y-2">
                            {clientContacts.map(c => (
                                <div key={c.id} className="flex items-center gap-4 p-3 rounded-xl border border-border-sub bg-bg-secondary">
                                    <Avatar className="h-10 w-10 border border-border-sub shrink-0">
                                        <AvatarImage src={c.avatarUrl} />
                                        <AvatarFallback className="text-[10px]">{(c.name || 'U')[0]}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[12px] font-bold text-text-primary uppercase">{c.name}</p>
                                        <div className="flex gap-3 mt-0.5">
                                            {c.email && <span className="flex items-center gap-1 text-[9px] text-text-muted"><Mail size={9} />{c.email}</span>}
                                            {c.phone && <span className="flex items-center gap-1 text-[9px] text-text-muted"><Phone size={9} />{c.phone}</span>}
                                        </div>
                                    </div>
                                    <Badge variant="scheduled" className="text-[7px] uppercase h-4 shrink-0">{c.role || 'Client'}</Badge>
                                </div>
                            ))}
                        </div>}
                </TabsContent>

                {/* Projects */}
                <TabsContent value="projects" className="m-0">
                    {clientProjects.length === 0
                        ? <p className="text-[10px] text-text-muted uppercase py-8 text-center">No projects for this client</p>
                        : <div className="space-y-2">
                            {clientProjects.map(p => (
                                <div key={p.id} className="flex items-center justify-between p-3.5 rounded-xl border border-border-sub bg-bg-secondary">
                                    <div className="min-w-0">
                                        <p className="text-[12px] font-bold text-text-primary uppercase">{p.name}</p>
                                        <p className="text-[9px] text-text-muted uppercase">{p.location} · Started {p.startDate}</p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className="text-[9px] text-text-muted">{p.phases?.length || 0} phases</span>
                                        <Badge variant={p.status === 'active' ? 'active' : p.status === 'on-hold' ? 'onhold' : 'completed'} className="text-[7px] uppercase h-4">{p.status}</Badge>
                                    </div>
                                </div>
                            ))}
                        </div>}
                </TabsContent>

                {/* Work Orders */}
                <TabsContent value="workorders" className="m-0">
                    {clientWOs.length === 0
                        ? <p className="text-[10px] text-text-muted uppercase py-8 text-center">No work orders for this client</p>
                        : <div className="space-y-2">
                            {clientWOs.map(wo => (
                                <Link key={wo.id} href={`/admin/assignments/${wo.id}`} className="flex items-center justify-between p-3.5 rounded-xl border border-border-sub bg-bg-secondary hover:border-brand-red/30 transition-colors group">
                                    <div className="min-w-0">
                                        <p className="text-[12px] font-bold text-text-primary uppercase group-hover:text-brand-red transition-colors truncate">{wo.title || wo.description}</p>
                                        <p className="text-[9px] text-text-muted uppercase">{wo.scheduleDate} · {wo.location}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[10px] font-bold font-mono text-text-primary">${wo.pay}</span>
                                        <Badge variant={wo.status === 'completed' ? 'active' : wo.status === 'unassigned' ? 'destructive' : 'scheduled'} className="text-[7px] uppercase h-4">{wo.status}</Badge>
                                    </div>
                                </Link>
                            ))}
                        </div>}
                </TabsContent>

                {/* Billing — Quotes & Invoices */}
                <TabsContent value="billing" className="m-0">
                    <div className="space-y-6">
                        {/* Quotes section */}
                        <div>
                            <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 mb-3 flex items-center gap-2">
                                <FileText size={11} /> Quotes ({clientQuotes.length})
                            </h3>
                            {clientQuotes.length === 0
                                ? <p className="text-[10px] text-text-muted uppercase py-3 text-center">No quotes on file</p>
                                : (
                                    <div className="rounded-xl border border-border-sub overflow-hidden">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="border-border-sub">
                                                    <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Title</TableHead>
                                                    <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted text-right">Total</TableHead>
                                                    <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Expires</TableHead>
                                                    <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Status</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {clientQuotes.map(q => (
                                                    <TableRow key={q.id} className="border-border-sub">
                                                        <TableCell className="font-bold text-[10px] text-text-primary">{q.title}</TableCell>
                                                        <TableCell className="text-[10px] font-mono text-text-primary text-right">${q.total}</TableCell>
                                                        <TableCell className="text-[10px] text-text-muted">{q.expiresAt || '—'}</TableCell>
                                                        <TableCell>
                                                            <Badge className={`text-[7px] uppercase h-4 border ${
                                                                q.status === 'accepted' ? 'bg-text-green/10 text-text-green border-text-green/20' :
                                                                q.status === 'declined' ? 'bg-text-red/10 text-text-red border-text-red/20' :
                                                                'bg-amber-400/10 text-amber-400 border-amber-400/20'
                                                            }`}>{q.status}</Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                        </div>
                        {/* Invoices section */}
                        <div>
                            <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 mb-3 flex items-center gap-2">
                                <Receipt size={11} /> Invoices ({clientInvoices.length})
                            </h3>
                            {clientInvoices.length === 0
                                ? <p className="text-[10px] text-text-muted uppercase py-3 text-center">No invoices on file</p>
                                : (
                                    <div className="space-y-2">
                                        {clientInvoices.map(inv => (
                                            <div key={inv.id} className="flex items-center justify-between p-3.5 rounded-xl border border-border-sub bg-bg-secondary">
                                                <div className="min-w-0">
                                                    <p className="text-[12px] font-bold text-text-primary uppercase">{inv.invoiceNumber}</p>
                                                    <p className="text-[9px] text-text-muted uppercase">Issued {inv.issueDate} · Due {inv.dueDate}</p>
                                                </div>
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <p className={cn("text-[13px] font-bold font-mono", inv.status === 'paid' ? 'text-text-green' : inv.status === 'overdue' ? 'text-text-red' : 'text-text-primary')}>${inv.total}</p>
                                                    <Badge variant={inv.status === 'paid' ? 'active' : inv.status === 'overdue' ? 'destructive' : 'onhold'} className="text-[7px] uppercase h-4">{inv.status}</Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                        </div>
                    </div>
                </TabsContent>

                {/* Tickets */}
                <TabsContent value="tickets" className="m-0">
                    {clientSiteReqs.length === 0
                        ? <p className="text-[10px] text-text-muted uppercase py-8 text-center">No service tickets or site requests</p>
                        : (
                            <div className="space-y-2">
                                {clientSiteReqs.map(r => (
                                    <div key={r.id} className="flex items-center justify-between p-3.5 rounded-xl border border-border-sub bg-bg-secondary">
                                        <div className="min-w-0 flex items-start gap-3">
                                            <div className="p-2 rounded-lg bg-bg-primary border border-border-sub shrink-0 mt-0.5">
                                                <Ticket size={13} className="text-text-muted" />
                                            </div>
                                            <div>
                                                <p className="text-[12px] font-bold text-text-primary uppercase truncate">{r.siteName || 'Site Request'}</p>
                                                <p className="text-[9px] text-text-muted uppercase">{r.submittedDate} · {r.location}</p>
                                                {r.managerName && <p className="text-[9px] text-text-muted mt-0.5">Contact: {r.managerName}</p>}
                                            </div>
                                        </div>
                                        <Badge
                                            variant={r.status === 'approved' ? 'active' : r.status === 'pending' ? 'scheduled' : 'onhold'}
                                            className="text-[7px] uppercase h-4 shrink-0 ml-3"
                                        >{r.status}</Badge>
                                    </div>
                                ))}
                            </div>
                        )}
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

                {/* Notes */}
                <TabsContent value="notes" className="m-0">
                    <div className="space-y-4 max-w-2xl">
                        <div className="flex gap-2">
                            <Input
                                className="flex-1 h-9 text-[11px] bg-bg-secondary border-border-main"
                                placeholder="Add a note about this client..."
                                value={noteInput}
                                onChange={e => setNoteInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                            />
                            <Button size="sm" onClick={handleAddNote} className="h-9 bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
                                <Plus size={12} className="mr-1" /> Add
                            </Button>
                        </div>
                        {notes.length === 0
                            ? <p className="text-[10px] text-text-muted uppercase py-4 text-center">No notes yet</p>
                            : notes.map(note => (
                                <div key={note.id} className="p-3 rounded-lg border border-border-sub bg-bg-secondary">
                                    <p className="text-[11px] text-text-primary">{note.text}</p>
                                    <p className="text-[8px] text-text-muted mt-1.5 font-mono">{note.createdAt ? format(parseISO(note.createdAt), 'MMM d, yyyy h:mm a') : ''}</p>
                                </div>
                            ))}
                    </div>
                </TabsContent>

                {/* History */}
                <TabsContent value="history" className="m-0">
                    {history.length === 0
                        ? <p className="text-[10px] text-text-muted uppercase py-8 text-center">No history events found</p>
                        : <div className="space-y-1 border-l border-border-sub pl-4 max-w-2xl">
                            {history.map(event => (
                                <div key={event.id} className="relative flex gap-4 py-2">
                                    <div className="absolute -left-[18px] top-3 h-2 w-2 rounded-full bg-border-sub" />
                                    <span className="text-[9px] font-mono text-text-muted w-20 shrink-0 mt-0.5">{event.time}</span>
                                    <div className="flex-1 min-w-0">
                                        <span className={cn("text-[9px] font-black uppercase tracking-widest", event.color)}>{event.label}</span>
                                        <p className="text-[10px] text-text-primary truncate">{event.detail}</p>
                                    </div>
                                </div>
                            ))}
                        </div>}
                </TabsContent>

                {/* Settings */}
                <TabsContent value="settings" className="m-0">
                    <div className="space-y-6 max-w-lg">
                        <div className="p-5 rounded-xl border border-border-sub bg-bg-secondary space-y-4">
                            <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 flex items-center gap-2">
                                <Settings2 size={11} /> Account Status
                            </h3>
                            <div className="space-y-1">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Status</Label>
                                <Select value={accountStatus} onValueChange={setAccountStatus}>
                                    <SelectTrigger className="h-9 text-[11px] bg-bg-primary border-border-main">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        {ACCOUNT_STATUS_OPTIONS.map(opt => (
                                            <SelectItem key={opt.value} value={opt.value} className="text-[11px]">{opt.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button
                                size="sm"
                                onClick={handleSaveSettings}
                                disabled={settingsSaving || accountStatus === currentAccountStatus}
                                className="h-8 text-[10px] font-bold uppercase bg-brand-red hover:bg-brand-red/90 text-white disabled:opacity-40"
                            >
                                {settingsSaving ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </div>
                        {client.billingDetails && (
                            <div className="p-5 rounded-xl border border-border-sub bg-bg-secondary space-y-3">
                                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 flex items-center gap-2">
                                    <Receipt size={11} /> Billing Details
                                </h3>
                                <div className="space-y-2">
                                    {[
                                        { label: 'Contact', value: client.billingDetails.contactName },
                                        { label: 'Email', value: client.billingDetails.email },
                                        { label: 'Terms', value: client.billingDetails.terms },
                                        { label: 'Delivery', value: client.billingDetails.deliveryMethod },
                                    ].map(row => row.value && (
                                        <div key={row.label} className="flex justify-between text-[10px]">
                                            <span className="text-text-muted uppercase font-bold">{row.label}</span>
                                            <span className="text-text-primary">{row.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

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
        </div>
    );
}
