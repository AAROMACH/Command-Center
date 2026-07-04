'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import type { Technician, Site, WorkOrder, Quote, Invoice } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Building2, Plus, MapPin, Search, Phone, Mail, User,
    ChevronRight, Briefcase, FileText, Receipt, LayoutGrid, List,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

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

export default function AdminClientsPage() {
    const router = useRouter();
    const [clients, setClients] = useState<Technician[]>([]);
    const [sites, setSites] = useState<Site[]>([]);
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<'name' | 'status' | 'jobs'>('name');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [viewMode, _setViewModeRaw] = useState<'grid' | 'list'>(() => { try { return (localStorage.getItem('cc:sites:view') as 'grid' | 'list') || 'grid'; } catch { return 'grid'; } });
    const setViewMode = (v: 'grid' | 'list') => { _setViewModeRaw(v); try { localStorage.setItem('cc:sites:view', v); } catch {} };
    const [isNewOpen, setIsNewOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        clientCompany: '',
        name: '',
        email: '',
        phone: '',
        accountStatus: 'active',
        billingTerms: 'Net 30',
    });
    const { toast } = useToast();

    useEffect(() => {
        let loaded = 0;
        const check = () => { loaded++; if (loaded >= 2) setLoading(false); };

        const unsubC = onSnapshot(collection(db, 'users'), snap => {
            setClients(
                snap.docs
                    .map(d => ({ ...d.data(), id: d.id } as Technician))
                    .filter(u => u.roles?.includes('client') || u.role?.toLowerCase().includes('client'))
            );
            check();
        }, check);
        const unsubS = onSnapshot(collection(db, 'sites'), snap => {
            setSites(snap.docs.map(d => ({ ...d.data(), id: d.id } as Site)));
            check();
        }, check);
        const unsubWO = onSnapshot(collection(db, 'workOrders'), snap => {
            setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });
        const unsubQ = onSnapshot(collection(db, 'quotes'), snap => {
            setQuotes(snap.docs.map(d => ({ ...d.data(), id: d.id } as Quote)));
        });
        const unsubI = onSnapshot(collection(db, 'invoices'), snap => {
            setInvoices(snap.docs.map(d => ({ ...d.data(), id: d.id } as Invoice)));
        });

        return () => { unsubC(); unsubS(); unsubWO(); unsubQ(); unsubI(); };
    }, []);

    const enrichedClients = useMemo(() => {
        return clients.map(client => {
            const company = client.clientCompany || client.name || '';
            const clientSites = sites.filter(s => s.clientName === company || s.clientId === client.id);
            const clientWOs = workOrders.filter(wo => wo.clientName === company);
            const openJobs = clientWOs.filter(wo => wo.status !== 'completed').length;
            const activeQuotes = quotes.filter(q => q.customerName === company || q.clientId === client.id).filter(q => q.status === 'sent' || q.status === 'viewed').length;
            const openInvoices = invoices.filter(inv => inv.clientName === company || inv.clientId === client.id).filter(inv => inv.status !== 'paid' && inv.status !== 'void').length;
            const lastJob = clientWOs
                .filter(wo => wo.status === 'completed' && wo.scheduleDate)
                .sort((a, b) => b.scheduleDate.localeCompare(a.scheduleDate))[0]?.scheduleDate || null;
            return { client, company, siteCount: clientSites.length, openJobs, activeQuotes, openInvoices, lastJob };
        });
    }, [clients, sites, workOrders, quotes, invoices]);

    const filtered = useMemo(() => {
        let list = enrichedClients.filter(ec => {
            const q = search.toLowerCase();
            if (q && !(
                ec.company.toLowerCase().includes(q) ||
                (ec.client.name || '').toLowerCase().includes(q) ||
                (ec.client.email || '').toLowerCase().includes(q)
            )) return false;
            if (statusFilter !== 'all' && (ec.client.accountStatus || 'active') !== statusFilter) return false;
            return true;
        });
        return [...list].sort((a, b) => {
            if (sortBy === 'name') return a.company.localeCompare(b.company);
            if (sortBy === 'status') return (a.client.accountStatus || 'active').localeCompare(b.client.accountStatus || 'active');
            if (sortBy === 'jobs') return b.openJobs - a.openJobs;
            return 0;
        });
    }, [enrichedClients, search, sortBy, statusFilter]);

    const stats = useMemo(() => ({
        total: clients.length,
        active: clients.filter(c => (c.accountStatus || 'active') === 'active').length,
        leads: clients.filter(c => c.accountStatus === 'lead' || c.accountStatus === 'prospect').length,
        vip: clients.filter(c => c.accountStatus === 'vip').length,
    }), [clients]);

    const handleCreate = async () => {
        if (!form.clientCompany || !form.name) {
            toast({ variant: 'destructive', title: 'Required fields missing', description: 'Company name and contact name are required.' });
            return;
        }
        setSaving(true);
        try {
            await addDoc(collection(db, 'users'), {
                name: form.name,
                clientCompany: form.clientCompany,
                email: form.email,
                phone: form.phone,
                roles: ['client'],
                role: 'client',
                accountStatus: form.accountStatus,
                billingDetails: {
                    contactName: form.name,
                    email: form.email,
                    terms: form.billingTerms,
                    deliveryMethod: 'Email',
                },
                skills: [],
                availability: {},
                workPreferences: { preferredRadius: 0, maxTravelDistance: 0, preferredJobTypes: [], availabilityOverride: false },
                reliabilityScore: 0,
                currentWorkload: 0,
                currentLocation: '',
                avatarUrl: '',
                createdAt: new Date().toISOString(),
            });
            toast({ title: 'Client created', description: `${form.clientCompany} has been added.` });
            setForm({ clientCompany: '', name: '', email: '', phone: '', accountStatus: 'active', billingTerms: 'Net 30' });
            setIsNewOpen(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Failed to create client', description: e.message });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-5">
            <header className="page-header">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <Building2 size={12} />
                        Client Management
                    </p>
                    <h1 className="page-title">Clients</h1>
                    <p className="page-subtitle">Manage client accounts, sites, contacts, and service history.</p>
                </div>
            </header>

            {/* Stats bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: 'Total Clients', value: stats.total, color: 'text-text-primary' },
                    { label: 'Active', value: stats.active, color: 'text-text-green' },
                    { label: 'Leads & Prospects', value: stats.leads, color: 'text-blue-400' },
                    { label: 'VIP', value: stats.vip, color: 'text-purple-400' },
                ].map(s => (
                    <div key={s.label} className="p-3 rounded-xl border border-border-sub bg-bg-secondary text-center">
                        <p className={cn('text-[22px] font-black font-mono', s.color)}>{s.value}</p>
                        <p className="text-[8px] font-black text-text-muted uppercase tracking-widest mt-0.5">{s.label}</p>
                    </div>
                ))}
            </div>

            {/* Search & controls */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-bg-secondary/50 p-4 rounded-xl border border-border-sub shadow-sm">
                <div className="flex items-center gap-3 w-full md:w-auto flex-1">
                    <div className="search-wrap flex-1 !mb-0 text-left">
                        <Search className="h-4 w-4 text-text-muted" />
                        <input
                            className="search-input"
                            placeholder="Search clients, contacts, emails..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 bg-bg-primary px-3 h-9 rounded-md border border-border-sub shrink-0">
                        <p className="text-[9px] font-black text-text-muted uppercase tracking-widest whitespace-nowrap">Status:</p>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-24 h-7 bg-transparent text-[10px] font-bold uppercase border-none shadow-none focus:ring-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main">
                                <SelectItem value="all" className="text-[10px] font-bold uppercase">All</SelectItem>
                                {ACCOUNT_STATUS_OPTIONS.map(o => (
                                    <SelectItem key={o.value} value={o.value} className="text-[10px] font-bold uppercase">{o.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2 bg-bg-primary px-3 h-9 rounded-md border border-border-sub shrink-0">
                        <p className="text-[9px] font-black text-text-muted uppercase tracking-widest whitespace-nowrap">Sort:</p>
                        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                            <SelectTrigger className="w-20 h-7 bg-transparent text-[10px] font-bold uppercase border-none shadow-none focus:ring-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main">
                                <SelectItem value="name" className="text-[10px] font-bold uppercase">Name</SelectItem>
                                <SelectItem value="status" className="text-[10px] font-bold uppercase">Status</SelectItem>
                                <SelectItem value="jobs" className="text-[10px] font-bold uppercase">Open Jobs</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                    <div className="flex items-center gap-2 px-3 py-1 bg-bg-primary rounded-full border border-border-sub">
                        <Building2 size={12} className="text-text-muted" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">{filtered.length} client{filtered.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-bg-primary rounded-md border border-border-sub p-0.5">
                        <button onClick={() => setViewMode('grid')} className={cn('h-7 w-8 flex items-center justify-center rounded transition-colors', viewMode === 'grid' ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary')}>
                            <LayoutGrid size={12} />
                        </button>
                        <button onClick={() => setViewMode('list')} className={cn('h-7 w-8 flex items-center justify-center rounded transition-colors', viewMode === 'list' ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary')}>
                            <List size={12} />
                        </button>
                    </div>
                    <Button size="sm" className="h-9 bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase tracking-widest" onClick={() => setIsNewOpen(true)}>
                        <Plus size={12} className="mr-1.5" />
                        Add Client
                    </Button>
                </div>
            </div>

            {/* Client list */}
            {loading ? (
                <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-40 rounded-xl bg-bg-secondary border border-border-sub animate-pulse" />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-sub p-16 text-center">
                    <Building2 size={32} className="text-text-muted mx-auto mb-3" />
                    <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest">
                        {search || statusFilter !== 'all' ? 'No clients match your filters' : 'No clients yet'}
                    </p>
                    {!search && statusFilter === 'all' && (
                        <Button size="sm" variant="outline" className="mt-4 text-[10px] font-black uppercase tracking-wider" onClick={() => setIsNewOpen(true)}>
                            <Plus size={11} className="mr-1.5" />
                            Add First Client
                        </Button>
                    )}
                </div>
            ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(({ client, company, siteCount, openJobs, activeQuotes, openInvoices, lastJob }) => {
                        const status = client.accountStatus || 'active';
                        return (
                            <div
                                key={client.id}
                                onClick={() => router.push('/admin/clients/' + client.id)}
                                className="rounded-xl border border-border-sub bg-bg-secondary hover:bg-bg-tertiary hover:border-border-main hover:shadow-lg transition-all cursor-pointer group flex flex-col overflow-hidden"
                            >
                                {/* Card header */}
                                <div className="bg-bg-tertiary/50 border-b border-border-sub px-4 py-2.5 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Building2 size={12} className="text-brand-red shrink-0" />
                                        <p className="text-[11px] font-black uppercase text-text-primary group-hover:text-brand-red transition-colors truncate">{company}</p>
                                    </div>
                                    <Badge className={cn('text-[7px] uppercase border h-4 shrink-0', ACCOUNT_STATUS_COLORS[status] || ACCOUNT_STATUS_COLORS.active)}>
                                        {status.replace(/_/g, ' ')}
                                    </Badge>
                                </div>

                                {/* Contact info */}
                                <div className="p-4 space-y-2 flex-1">
                                    {client.name && client.clientCompany && (
                                        <p className="flex items-center gap-1.5 text-[10px] text-text-secondary font-bold">
                                            <User size={10} className="text-text-muted shrink-0" />
                                            {client.name}
                                        </p>
                                    )}
                                    {client.email && (
                                        <p className="flex items-center gap-1.5 text-[10px] text-text-muted truncate">
                                            <Mail size={10} className="shrink-0" />
                                            {client.email}
                                        </p>
                                    )}
                                    {client.phone && (
                                        <p className="flex items-center gap-1.5 text-[10px] text-text-muted">
                                            <Phone size={10} className="shrink-0" />
                                            {client.phone}
                                        </p>
                                    )}
                                </div>

                                {/* Metrics row */}
                                <div className="border-t border-border-sub px-4 py-2.5 grid grid-cols-4 gap-2">
                                    {[
                                        { icon: MapPin, value: siteCount, label: 'Sites', color: '' },
                                        { icon: Briefcase, value: openJobs, label: 'Jobs', color: openJobs > 0 ? 'text-text-amber' : '' },
                                        { icon: FileText, value: activeQuotes, label: 'Quotes', color: activeQuotes > 0 ? 'text-blue-400' : '' },
                                        { icon: Receipt, value: openInvoices, label: 'Inv', color: openInvoices > 0 ? 'text-text-red' : '' },
                                    ].map(m => (
                                        <div key={m.label} className="text-center">
                                            <p className={cn('text-[13px] font-black font-mono', m.color || 'text-text-secondary')}>{m.value}</p>
                                            <p className="text-[7px] font-bold text-text-muted uppercase tracking-widest">{m.label}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Footer */}
                                <div className="bg-bg-tertiary/20 border-t border-border-sub px-4 py-2 flex items-center justify-between">
                                    <p className="text-[8px] font-bold text-text-muted uppercase tracking-widest">
                                        {lastJob ? `Last job: ${lastJob}` : 'No completed jobs'}
                                    </p>
                                    <ChevronRight size={12} className="text-text-muted group-hover:text-text-primary transition-colors" />
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* List view */
                <div className="rounded-xl border border-border-sub overflow-hidden">
                    <div className="grid grid-cols-[1fr_60px_80px_60px_60px_24px] gap-0 bg-bg-tertiary/50 border-b border-border-sub px-4 py-2">
                        {['Company', 'Sites', 'Open Jobs', 'Quotes', 'Inv', ''].map(h => (
                            <p key={h} className="text-[9px] font-black uppercase tracking-widest text-text-muted">{h}</p>
                        ))}
                    </div>
                    {filtered.map(({ client, company, siteCount, openJobs, activeQuotes, openInvoices }) => {
                        const status = client.accountStatus || 'active';
                        return (
                            <div
                                key={client.id}
                                onClick={() => router.push('/admin/clients/' + client.id)}
                                className="grid grid-cols-[1fr_60px_80px_60px_60px_24px] gap-0 items-center px-4 py-3 border-b border-border-sub hover:bg-bg-secondary transition-colors cursor-pointer group"
                            >
                                <div className="min-w-0 pr-4">
                                    <div className="flex items-center gap-2">
                                        <p className="text-[11px] font-bold uppercase text-text-primary group-hover:text-brand-red transition-colors truncate">{company}</p>
                                        <Badge className={cn('text-[7px] uppercase border h-4 shrink-0', ACCOUNT_STATUS_COLORS[status] || ACCOUNT_STATUS_COLORS.active)}>
                                            {status.replace(/_/g, ' ')}
                                        </Badge>
                                    </div>
                                    {client.email && <p className="text-[9px] text-text-muted truncate mt-0.5">{client.email}</p>}
                                </div>
                                <p className="text-[11px] font-mono text-text-secondary text-center">{siteCount}</p>
                                <p className={cn('text-[11px] font-mono text-center', openJobs > 0 ? 'text-text-amber font-bold' : 'text-text-muted')}>{openJobs}</p>
                                <p className={cn('text-[11px] font-mono text-center', activeQuotes > 0 ? 'text-blue-400 font-bold' : 'text-text-muted')}>{activeQuotes}</p>
                                <p className={cn('text-[11px] font-mono text-center', openInvoices > 0 ? 'text-text-red font-bold' : 'text-text-muted')}>{openInvoices}</p>
                                <ChevronRight size={12} className="text-text-muted group-hover:text-text-primary transition-colors" />
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Add Client Dialog */}
            <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
                            <Building2 size={14} className="text-brand-red" /> New Client
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Company Name *</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. Acme Corporation" value={form.clientCompany} onChange={e => setForm(f => ({ ...f, clientCompany: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Primary Contact Name *</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Email</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="email@company.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Phone</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="555-000-0000" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Account Status</Label>
                                <Select value={form.accountStatus} onValueChange={v => setForm(f => ({ ...f, accountStatus: v }))}>
                                    <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        {ACCOUNT_STATUS_OPTIONS.map(o => (
                                            <SelectItem key={o.value} value={o.value} className="text-[11px]">{o.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Billing Terms</Label>
                                <Select value={form.billingTerms} onValueChange={v => setForm(f => ({ ...f, billingTerms: v }))}>
                                    <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        {['Net 15', 'Net 30', 'Net 60', 'Due on Receipt'].map(t => (
                                            <SelectItem key={t} value={t} className="text-[11px]">{t}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setIsNewOpen(false)} className="text-[10px] font-black uppercase">Cancel</Button>
                        <Button size="sm" onClick={handleCreate} disabled={saving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
                            {saving ? 'Creating...' : 'Create Client'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
