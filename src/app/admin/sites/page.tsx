'use client';
import { PageHeader } from '@/components/page-header';
import { StatCard, StatGrid } from '@/components/stat-card';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { SearchField } from '@/components/search-field';
import { AccountStatusBadge } from '@/app/admin/clients/account-status';
import { onSharedSnapshot } from '@/lib/shared-snapshot';

import { useState, useEffect, useMemo } from 'react';
import { usePaged, ListPager, PAGE_SIZES_LARGE, PAGE_SIZES_SMALL } from '@/components/list-pager';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import type { Technician, Site, WorkOrder, Quote, Invoice } from '@/lib/types';
import { isClient } from '@/lib/permissions';
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
import { jobDateTimeValue, mergeJobs } from '@/lib/jobs';

const ACCOUNT_STATUS_OPTIONS = [
    { value: 'lead', label: 'Lead' },
    { value: 'prospect', label: 'Prospect' },
    { value: 'active', label: 'Active' },
    { value: 'vip', label: 'VIP' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'on_hold', label: 'On hold' },
    { value: 'past_client', label: 'Past client' },
    { value: 'collections', label: 'Collections' },
    { value: 'do_not_service', label: 'Do not service' },
];


export default function AdminClientsPage() {
    const router = useRouter();
    const [clients, setClients] = useState<Technician[]>([]);
    const [sites, setSites] = useState<Site[]>([]);
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [assignments, setAssignments] = useState<WorkOrder[]>([]);
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

        const unsubC = onSharedSnapshot('users', snap => {
            setClients(
                snap.docs
                    .map(d => ({ ...d.data(), id: d.id } as Technician))
                    .filter(isClient)
            );
            check();
        }, check);
        const unsubS = onSharedSnapshot('sites', snap => {
            setSites(snap.docs.map(d => ({ ...d.data(), id: d.id } as Site)));
            check();
        }, check);
        const unsubWO = onSharedSnapshot('workOrders', snap => {
            setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });
        // Assigning a job moves it from workOrders into assignments.
        const unsubA = onSharedSnapshot('assignments', snap => {
            setAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });
        const unsubQ = onSharedSnapshot('quotes', snap => {
            setQuotes(snap.docs.map(d => ({ ...d.data(), id: d.id } as Quote)));
        });
        const unsubI = onSharedSnapshot('invoices', snap => {
            setInvoices(snap.docs.map(d => ({ ...d.data(), id: d.id } as Invoice)));
        });

        return () => { unsubC(); unsubS(); unsubWO(); unsubA(); unsubQ(); unsubI(); };
    }, []);

    const enrichedClients = useMemo(() => {
        const jobs = mergeJobs(workOrders, assignments);
        return clients.map(client => {
            const company = client.clientCompany || client.name || '';
            const clientSites = sites.filter(s => s.clientName === company || s.clientId === client.id);
            const clientWOs = jobs.filter(wo => wo.clientName === company);
            const openJobs = clientWOs.filter(wo => wo.status !== 'completed').length;
            const activeQuotes = quotes.filter(q => q.customerName === company || q.clientId === client.id).filter(q => q.status === 'sent' || q.status === 'viewed').length;
            const openInvoices = invoices.filter(inv => inv.clientName === company || inv.clientId === client.id).filter(inv => inv.status !== 'paid' && inv.status !== 'void').length;
            const lastJob = clientWOs
                .filter(wo => wo.status === 'completed' && wo.scheduleDate)
                .sort((a, b) => jobDateTimeValue(b.scheduleDate, b.scheduleTime) - jobDateTimeValue(a.scheduleDate, a.scheduleTime))[0]?.scheduleDate || null;
            return { client, company, siteCount: clientSites.length, openJobs, activeQuotes, openInvoices, lastJob };
        });
    }, [clients, sites, workOrders, assignments, quotes, invoices]);

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
    const pager = usePaged(filtered, PAGE_SIZES_SMALL, 'admin-sites', [search, sortBy, statusFilter]);

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
            <PageHeader
                eyebrow="Clients"
                icon={Building2}
                title="Clients"
                subtitle="Client accounts, their sites, contacts and service history."
                actions={
                    <Button size="sm" className="h-9 bg-brand-red hover:bg-brand-red/90 text-white" onClick={() => setIsNewOpen(true)}>
                        <Plus size={14} className="mr-1.5" />
                        Add client
                    </Button>
                }
            />

            {/* Stats bar */}
            <StatGrid className="md:grid-cols-4 xl:grid-cols-4">
                <StatCard label="Total clients" value={stats.total} />
                <StatCard label="Active" value={stats.active} tone="done" />
                <StatCard label="Leads & prospects" value={stats.leads} tone="info" />
                <StatCard label="VIP" value={stats.vip} />
            </StatGrid>

            {/* Search & controls */}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 bg-bg-secondary p-3 rounded-xl border border-border-main shadow-sm">
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto flex-1">
                    <SearchField className="flex-1 min-w-[200px]" placeholder="Search clients, contacts, emails…" value={search} onChange={setSearch} />
                    <div className="flex items-center gap-2 bg-bg-primary px-3 h-9 rounded-md border border-border-sub shrink-0">
                        <p className="text-[12px] text-text-muted whitespace-nowrap">Status:</p>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-32 h-7 bg-transparent border-none shadow-none focus:ring-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main">
                                <SelectItem value="all">All</SelectItem>
                                {ACCOUNT_STATUS_OPTIONS.map(o => (
                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2 bg-bg-primary px-3 h-9 rounded-md border border-border-sub shrink-0">
                        <p className="text-[12px] text-text-muted whitespace-nowrap">Sort:</p>
                        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                            <SelectTrigger className="w-28 h-7 bg-transparent border-none shadow-none focus:ring-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main">
                                <SelectItem value="name">Name</SelectItem>
                                <SelectItem value="status">Status</SelectItem>
                                <SelectItem value="jobs">Open jobs</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                    <div className="flex items-center gap-2 px-3 py-1 bg-bg-primary rounded-full border border-border-sub">
                        <Building2 size={12} className="text-text-muted" />
                        <span className="text-[12px] font-medium text-text-muted">{filtered.length} client{filtered.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-bg-primary rounded-md border border-border-sub p-0.5">
                        <button onClick={() => setViewMode('grid')} className={cn('h-7 w-8 flex items-center justify-center rounded transition-colors', viewMode === 'grid' ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary')}>
                            <LayoutGrid size={12} />
                        </button>
                        <button onClick={() => setViewMode('list')} className={cn('h-7 w-8 flex items-center justify-center rounded transition-colors', viewMode === 'list' ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary')}>
                            <List size={12} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Client list */}
            {loading ? (
                <LoadingState label="Loading clients…" />
            ) : filtered.length === 0 ? (
                (search || statusFilter !== 'all') ? (
                    <EmptyState icon={Building2} title="No clients match these filters"
                        action={<Button size="sm" variant="outline" onClick={() => { setSearch(''); setStatusFilter('all'); }}>Reset filters</Button>} />
                ) : (
                    <EmptyState icon={Building2} title="No clients yet"
                        action={<Button size="sm" variant="outline" onClick={() => setIsNewOpen(true)}><Plus size={14} className="mr-1.5" />Add first client</Button>} />
                )
            ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pager.items.map(({ client, company, siteCount, openJobs, activeQuotes, openInvoices, lastJob }) => {
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
                                        <p className="text-[12px] font-bold text-text-primary group-hover:text-brand-red transition-colors truncate">{company}</p>
                                    </div>
                                    <AccountStatusBadge status={status} />
                                </div>

                                {/* Contact info */}
                                <div className="p-4 space-y-2 flex-1">
                                    {client.name && client.clientCompany && (
                                        <p className="flex items-center gap-1.5 text-[12px] text-text-secondary font-bold">
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
                                        { icon: FileText, value: activeQuotes, label: 'Quotes', color: activeQuotes > 0 ? 'text-brand-blue' : '' },
                                        { icon: Receipt, value: openInvoices, label: 'Invoices', color: openInvoices > 0 ? 'text-text-red' : '' },
                                    ].map(m => (
                                        <div key={m.label} className="text-center">
                                            <p className={cn('text-[13px] font-bold font-mono', m.color || 'text-text-secondary')}>{m.value}</p>
                                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{m.label}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Footer */}
                                <div className="bg-bg-tertiary/20 border-t border-border-sub px-4 py-2 flex items-center justify-between">
                                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
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
                        {['Company', 'Sites', 'Open jobs', 'Quotes', 'Invoices', ''].map(h => (
                            <p key={h} className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{h}</p>
                        ))}
                    </div>
                    {pager.items.map(({ client, company, siteCount, openJobs, activeQuotes, openInvoices }) => {
                        const status = client.accountStatus || 'active';
                        return (
                            <div
                                key={client.id}
                                onClick={() => router.push('/admin/clients/' + client.id)}
                                className="grid grid-cols-[1fr_60px_80px_60px_60px_24px] gap-0 items-center px-4 py-3 border-b border-border-sub hover:bg-bg-secondary transition-colors cursor-pointer group"
                            >
                                <div className="min-w-0 pr-4">
                                    <div className="flex items-center gap-2">
                                        <p className="text-[12px] font-bold text-text-primary group-hover:text-brand-red transition-colors truncate">{company}</p>
                                        <AccountStatusBadge status={status} />
                                    </div>
                                    {client.email && <p className="text-[11px] text-text-muted truncate mt-0.5">{client.email}</p>}
                                </div>
                                <p className="text-[12px] font-mono text-text-secondary text-center">{siteCount}</p>
                                <p className={cn('text-[11px] font-mono text-center', openJobs > 0 ? 'text-text-amber font-bold' : 'text-text-muted')}>{openJobs}</p>
                                <p className={cn('text-[11px] font-mono text-center', activeQuotes > 0 ? 'text-brand-blue font-bold' : 'text-text-muted')}>{activeQuotes}</p>
                                <p className={cn('text-[11px] font-mono text-center', openInvoices > 0 ? 'text-text-red font-bold' : 'text-text-muted')}>{openInvoices}</p>
                                <ChevronRight size={12} className="text-text-muted group-hover:text-text-primary transition-colors" />
                            </div>
                        );
                    })}
                </div>
            )}

            <ListPager pager={pager} noun="clients" />

            {/* Add Client Dialog */}
            <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
                <DialogContent className="bg-bg-elevated border-border-main max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold flex items-center gap-2">
                            <Building2 size={14} className="text-brand-red" /> New Client
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Company Name *</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. Acme Corporation" value={form.clientCompany} onChange={e => setForm(f => ({ ...f, clientCompany: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Primary Contact Name *</Label>
                            <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Email</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="email@company.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Phone</Label>
                                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="555-000-0000" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Account Status</Label>
                                <Select value={form.accountStatus} onValueChange={v => setForm(f => ({ ...f, accountStatus: v }))}>
                                    <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        {ACCOUNT_STATUS_OPTIONS.map(o => (
                                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Billing Terms</Label>
                                <Select value={form.billingTerms} onValueChange={v => setForm(f => ({ ...f, billingTerms: v }))}>
                                    <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        {['Net 15', 'Net 30', 'Net 60', 'Due on Receipt'].map(t => (
                                            <SelectItem key={t} value={t}>{t}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setIsNewOpen(false)} className="text-[10px] font-bold">Cancel</Button>
                        <Button size="sm" onClick={handleCreate} disabled={saving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-bold">
                            {saving ? 'Creating...' : 'Create Client'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
