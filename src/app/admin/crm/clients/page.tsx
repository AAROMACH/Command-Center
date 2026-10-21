'use client';
import { useSessionState } from '@/hooks/use-session-state';
import { onSharedSnapshot } from '@/lib/shared-snapshot';

import { useState, useEffect, useMemo } from 'react';
import { usePaged, ListPager, PAGE_SIZES_LARGE, PAGE_SIZES_SMALL } from '@/components/list-pager';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, doc, updateDoc } from 'firebase/firestore';
import type { Technician, SiteRequest, Project } from '@/lib/types';
import { isClient } from '@/lib/permissions';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Target, Phone, Mail, MapPin, UserCheck, UserPlus, Building2, Briefcase, ExternalLink, PenLine,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ViewToggle, useViewMode } from '@/components/view-toggle';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { SearchField } from '@/components/search-field';
import { SortControl } from '@/components/list-toolbar';
import { StatusBadge } from '@/components/status-badge';
import { AccountStatusBadge } from '@/app/admin/clients/account-status';

const CLIENT_SORTS = [
  { value: 'company', label: 'Company' },
  { value: 'contact', label: 'Contact' },
  { value: 'requests', label: 'Site requests' },
];

export default function ClientsPage() {
  const { toast } = useToast();
  const [clients, setClients] = useState<Technician[]>([]);
  const [siteRequests, setSiteRequests] = useState<SiteRequest[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useSessionState('admin/crm/clients:searchQuery', '');
  const [sortBy, setSortBy] = useSessionState('admin/crm/clients:sortBy', 'company');
  const [viewMode, setViewMode] = useViewMode('crm-clients');
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [newClientForm, setNewClientForm] = useState({ name: '', company: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Technician | null>(null);
  const [isEditClientOpen, setIsEditClientOpen] = useState(false);
  const [editClientForm, setEditClientForm] = useState({ name: '', company: '', email: '', phone: '' });
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    const unsubClients = onSharedSnapshot('users', (snap) => {
      setClients(snap.docs
        .map(d => ({ ...d.data(), id: d.id } as Technician))
        .filter(isClient)
      );
    });

    const unsubSiteReqs = onSharedSnapshot('siteRequests', (snap) => {
      setSiteRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as SiteRequest)));
    });
    const unsubProjects = onSharedSnapshot('projects', (snap) => {
      setProjects(snap.docs.map(d => ({ ...d.data(), id: d.id } as Project)));
    });

    return () => { unsubClients(); unsubSiteReqs(); unsubProjects(); };
  }, []);

  const filteredClients = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const rows = clients.filter(c =>
      !q ||
      (c.clientCompany || '').toLowerCase().includes(q) ||
      (c.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
    );
    const company = (c: Technician) => (c.clientCompany || c.name || '').toLowerCase();
    const reqCount = (c: Technician) => siteRequests.filter(r => r.clientId === c.id || r.clientName === c.clientCompany).length;
    return [...rows].sort((a, b) => {
      if (sortBy === 'contact') return (a.name || '').localeCompare(b.name || '') || company(a).localeCompare(company(b));
      if (sortBy === 'requests') return reqCount(b) - reqCount(a) || company(a).localeCompare(company(b));
      return company(a).localeCompare(company(b));
    });
  }, [clients, siteRequests, searchQuery, sortBy]);
  const pager = usePaged(filteredClients, PAGE_SIZES_SMALL, 'crm-clients', [searchQuery, sortBy]);

  const pendingSiteReqs = useMemo(() =>
    siteRequests.filter(r => r.status === 'pending').length,
    [siteRequests]
  );

  const handleAddClient = async () => {
    if (!newClientForm.company && !newClientForm.name) {
      toast({ variant: 'destructive', title: 'Required', description: 'Name or company is required.' });
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'users'), {
        name: newClientForm.name,
        clientCompany: newClientForm.company,
        email: newClientForm.email,
        phone: newClientForm.phone,
        roles: ['client'],
        role: 'Client',
        createdAt: new Date().toISOString(),
      });
      toast({ title: 'Client added', description: `${newClientForm.company || newClientForm.name} added.` });
      setNewClientForm({ name: '', company: '', email: '', phone: '' });
      setIsAddClientOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const openEditClient = (client: Technician) => {
    setEditClientForm({
      name: client.name || '',
      company: client.clientCompany || '',
      email: client.email || '',
      phone: client.phone || '',
    });
    setIsEditClientOpen(true);
  };

  const handleEditClient = async () => {
    if (!selectedClient) return;
    if (!editClientForm.company && !editClientForm.name) {
      toast({ variant: 'destructive', title: 'Required', description: 'Name or company is required.' });
      return;
    }
    setEditSaving(true);
    try {
      await updateDoc(doc(db, 'users', selectedClient.id), {
        name: editClientForm.name,
        clientCompany: editClientForm.company,
        email: editClientForm.email,
        phone: editClientForm.phone,
        updatedAt: new Date().toISOString(),
      });
      toast({ title: 'Client updated', description: `${editClientForm.company || editClientForm.name} saved.` });
      setSelectedClient(prev => prev ? {
        ...prev,
        name: editClientForm.name,
        clientCompany: editClientForm.company,
        email: editClientForm.email,
        phone: editClientForm.phone,
      } : prev);
      setIsEditClientOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e.message });
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="space-y-5 min-h-full">
      <PageHeader
        eyebrow="CRM"
        icon={Target}
        title="Clients"
        subtitle="Client accounts and the sites they've asked for."
        actions={<>
          <Link href="/admin/crm">
            <Button variant="outline" size="sm" className="h-9 border-border-main">
              Pipeline
            </Button>
          </Link>
          <Button
            size="sm"
            className="h-9 bg-brand-red hover:bg-brand-red/90 text-white"
            onClick={() => setIsAddClientOpen(true)}
          >
            <UserPlus size={14} className="mr-1.5" />
            Add client
          </Button>
        </>}
      />

      {/* Search + stats strip */}
      <div className="bg-bg-secondary p-3 rounded-xl border border-border-main shadow-sm flex items-center gap-2 flex-wrap">
        <SearchField className="flex-1 min-w-[200px]" placeholder="Search company, contact, email, phone…" value={searchQuery} onChange={setSearchQuery} />
        <SortControl value={sortBy} onChange={setSortBy} options={CLIENT_SORTS} dateAsc={false} onToggleDirection={() => {}} />
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-text-muted shrink-0">
          <UserCheck size={12} />
          {clients.length} client{clients.length !== 1 ? 's' : ''}
        </div>
        <ViewToggle value={viewMode} onChange={setViewMode} />
      </div>

      {/* Pending Site Requests Banner */}
      {pendingSiteReqs > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-accent-gold/5 border border-accent-gold/20">
          <MapPin size={14} className="text-accent-gold shrink-0" />
          <p className="text-[12px] font-semibold text-accent-gold">
            {pendingSiteReqs} pending site request{pendingSiteReqs > 1 ? 's' : ''} awaiting review
          </p>
        </div>
      )}

      {/* Clients grid */}
      {filteredClients.length === 0 ? (
        searchQuery ? (
          <EmptyState icon={UserCheck} title="No clients match your search"
            action={<Button size="sm" variant="outline" onClick={() => setSearchQuery('')}>Clear search</Button>} />
        ) : (
          <EmptyState icon={UserCheck} title="No clients yet" description="Convert a won lead or add a client directly." />
        )
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {pager.items.map(client => {
            const clientSiteReqs = siteRequests.filter(r => r.clientId === client.id || r.clientName === client.clientCompany);
            return (
              <div key={client.id} onClick={() => setSelectedClient(client)} className="rounded-xl border border-border-sub bg-bg-secondary hover:bg-bg-tertiary hover:border-brand-red transition-all p-4 space-y-3 cursor-pointer">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold tracking-tight text-text-primary truncate">
                      {client.clientCompany || client.name}
                    </p>
                    {client.clientCompany && client.name !== client.clientCompany && (
                      <p className="text-[12px] text-text-muted mt-0.5 truncate">{client.name}</p>
                    )}
                  </div>
                  <AccountStatusBadge status={client.accountStatus} />
                </div>
                <div className="space-y-1.5">
                  {client.email && (
                    <div className="flex items-center gap-1.5 text-[12px] text-text-muted">
                      <Mail size={10} className="text-brand-red shrink-0" />
                      <span className="truncate">{client.email}</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-1.5 text-[12px] text-text-muted">
                      <Phone size={10} className="shrink-0" />
                      <span>{client.phone}</span>
                    </div>
                  )}
                  {clientSiteReqs.length > 0 && (
                    <div className="flex items-center gap-1.5 text-[12px] text-accent-gold">
                      <MapPin size={10} className="shrink-0" />
                      <span>{clientSiteReqs.length} site request{clientSiteReqs.length > 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-1">
          {pager.items.map(client => {
            const clientSiteReqs = siteRequests.filter(r => r.clientId === client.id || r.clientName === client.clientCompany);
            return (
              <div key={client.id} onClick={() => setSelectedClient(client)}
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border-sub bg-bg-secondary hover:bg-bg-tertiary hover:border-brand-red transition-all cursor-pointer">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold tracking-tight text-text-primary truncate">{client.clientCompany || client.name}</p>
                  {client.clientCompany && client.name !== client.clientCompany && (
                    <p className="text-[12px] text-text-muted truncate">{client.name}</p>
                  )}
                </div>
                {client.email && (
                  <span className="hidden md:flex items-center gap-1.5 text-[12px] text-text-muted min-w-0 max-w-[220px]">
                    <Mail size={10} className="text-brand-red shrink-0" /><span className="truncate">{client.email}</span>
                  </span>
                )}
                {client.phone && (
                  <span className="hidden lg:flex items-center gap-1.5 text-[12px] text-text-muted shrink-0">
                    <Phone size={10} className="shrink-0" />{client.phone}
                  </span>
                )}
                {clientSiteReqs.length > 0 && (
                  <span className="flex items-center gap-1.5 text-[12px] text-accent-gold shrink-0">
                    <MapPin size={10} className="shrink-0" />{clientSiteReqs.length}
                  </span>
                )}
                <AccountStatusBadge status={client.accountStatus} />
              </div>
            );
          })}
        </div>
      )}
      <ListPager pager={pager} noun="clients" />

      {/* Client Detail Popup */}
      <Dialog open={!!selectedClient} onOpenChange={open => !open && setSelectedClient(null)}>
        <DialogContent className="bg-bg-elevated border-border-main max-w-lg">
          {selectedClient && (() => {
            const clientProjects = projects.filter(p =>
              p.client === (selectedClient.clientCompany || selectedClient.name) ||
              p.client?.toLowerCase().includes((selectedClient.name || '').toLowerCase())
            );
            const clientReqs = siteRequests.filter(r =>
              r.clientId === selectedClient.id || r.clientName === (selectedClient.clientCompany || selectedClient.name)
            );
            return (
              <>
                <DialogHeader>
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-brand-red/10 border border-brand-red/20 flex items-center justify-center shrink-0">
                      <Building2 size={16} className="text-brand-red" />
                    </div>
                    <div>
                      <DialogTitle className="text-base font-semibold">{selectedClient.clientCompany || selectedClient.name}</DialogTitle>
                      {selectedClient.clientCompany && selectedClient.name !== selectedClient.clientCompany && (
                        <p className="text-[12px] text-text-muted mt-0.5">{selectedClient.name}</p>
                      )}
                    </div>
                  </div>
                </DialogHeader>
                <div className="space-y-4 py-1">
                  {/* Contact info */}
                  <div className="grid grid-cols-2 gap-2">
                    {selectedClient.email && (
                      <a href={`mailto:${selectedClient.email}`} className="flex items-center gap-2 p-2 rounded-lg bg-bg-secondary border border-border-sub hover:border-brand-red/30 transition-colors">
                        <Mail size={11} className="text-brand-red shrink-0" />
                        <span className="text-[12px] font-bold text-text-secondary truncate">{selectedClient.email}</span>
                      </a>
                    )}
                    {selectedClient.phone && (
                      <a href={`tel:${selectedClient.phone}`} className="flex items-center gap-2 p-2 rounded-lg bg-bg-secondary border border-border-sub hover:border-brand-red/30 transition-colors">
                        <Phone size={11} className="text-text-muted shrink-0" />
                        <span className="text-[12px] font-bold text-text-secondary">{selectedClient.phone}</span>
                      </a>
                    )}
                  </div>
                  {/* Active projects */}
                  <div>
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Briefcase size={10} /> Active projects ({clientProjects.filter(p => p.status === 'active').length})
                    </p>
                    {clientProjects.filter(p => p.status === 'active').length === 0 ? (
                      <p className="text-[11px] text-text-muted py-1">No active projects</p>
                    ) : clientProjects.filter(p => p.status === 'active').map(p => (
                      <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-border-sub last:border-0">
                        <p className="text-[12px] font-bold text-text-primary truncate">{p.name}</p>
                        <Badge variant="active" className="text-[10px] h-4 shrink-0">Active</Badge>
                      </div>
                    ))}
                  </div>
                  {/* Site requests */}
                  {clientReqs.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <MapPin size={10} /> Site requests ({clientReqs.length})
                      </p>
                      {clientReqs.slice(0, 5).map(r => (
                        <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-border-sub last:border-0">
                          <p className="text-[12px] font-bold text-text-primary truncate">{r.siteName}</p>
                          <StatusBadge kind="request" value={r.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <DialogFooter className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedClient(null)} className="text-[10px] font-bold">Close</Button>
                  <Button variant="outline" size="sm" onClick={() => openEditClient(selectedClient)} className="text-[10px] font-bold">
                    <PenLine size={11} className="mr-1.5" /> Edit
                  </Button>
                  <Link href={`/admin/clients/${selectedClient.id}`}>
                    <Button size="sm" className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-bold">
                      <ExternalLink size={11} className="mr-1.5" /> Open client page
                    </Button>
                  </Link>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Add Client Dialog */}
      <Dialog open={isAddClientOpen} onOpenChange={setIsAddClientOpen}>
        <DialogContent className="bg-bg-elevated border-border-main max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Add client</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Company Name</Label>
              <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Acme Corp" value={newClientForm.company} onChange={e => setNewClientForm(f => ({ ...f, company: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Contact Name</Label>
              <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Jane Smith" value={newClientForm.name} onChange={e => setNewClientForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Email</Label>
              <Input type="email" className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="jane@acme.com" value={newClientForm.email} onChange={e => setNewClientForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Phone</Label>
              <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="555-000-0000" value={newClientForm.phone} onChange={e => setNewClientForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsAddClientOpen(false)} className="text-[10px] font-bold">Cancel</Button>
            <Button size="sm" onClick={handleAddClient} disabled={saving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-bold">
              {saving ? 'Adding...' : 'Add client'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Client Dialog */}
      <Dialog open={isEditClientOpen} onOpenChange={setIsEditClientOpen}>
        <DialogContent className="bg-bg-elevated border-border-main max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Edit client</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Company Name</Label>
              <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Acme Corp" value={editClientForm.company} onChange={e => setEditClientForm(f => ({ ...f, company: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Contact Name</Label>
              <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Jane Smith" value={editClientForm.name} onChange={e => setEditClientForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Email</Label>
              <Input type="email" className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="jane@acme.com" value={editClientForm.email} onChange={e => setEditClientForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Phone</Label>
              <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="555-000-0000" value={editClientForm.phone} onChange={e => setEditClientForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsEditClientOpen(false)} className="text-[10px] font-bold">Cancel</Button>
            <Button size="sm" onClick={handleEditClient} disabled={editSaving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-bold">
              {editSaving ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
