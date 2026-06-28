'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import type { Technician, SiteRequest } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Target, Search, Phone, Mail, MapPin, UserCheck, UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function ClientsPage() {
  const { toast } = useToast();
  const [clients, setClients] = useState<Technician[]>([]);
  const [siteRequests, setSiteRequests] = useState<SiteRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [newClientForm, setNewClientForm] = useState({ name: '', company: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubClients = onSnapshot(collection(db, 'users'), (snap) => {
      setClients(snap.docs
        .map(d => ({ ...d.data(), id: d.id } as Technician))
        .filter(u => u.roles?.includes('client') || u.role?.toLowerCase().includes('client'))
      );
    });

    const unsubSiteReqs = onSnapshot(collection(db, 'siteRequests'), (snap) => {
      setSiteRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as SiteRequest)));
    });

    return () => { unsubClients(); unsubSiteReqs(); };
  }, []);

  const filteredClients = useMemo(() =>
    clients.filter(c =>
      !searchQuery ||
      (c.clientCompany || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.email || '').toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [clients, searchQuery]
  );

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
        subscriptionStatus: 'active',
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

  return (
    <div className="space-y-5 min-h-full">
      <header className="page-header">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2">
            <Target size={12} />
            CRM Terminal
          </p>
          <h1 className="page-title">All Clients</h1>
          <p className="page-subtitle">Manage active client accounts and site relationships.</p>
        </div>
        <div className="page-header-right flex items-center gap-2">
          <Link href="/admin/crm">
            <Button variant="outline" size="sm" className="h-9 text-[10px] font-bold uppercase tracking-wider border-border-main">
              Pipeline
            </Button>
          </Link>
          <Button
            size="sm"
            className="h-9 text-[10px] font-bold uppercase tracking-wider bg-brand-red hover:bg-brand-red/90 text-white"
            onClick={() => setIsAddClientOpen(true)}
          >
            <UserPlus size={12} className="mr-1.5" />
            Add Client
          </Button>
        </div>
      </header>

      {/* Search + stats strip */}
      <div className="bg-bg-secondary p-3 rounded-xl border border-border-sub flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-main bg-bg-primary text-[11px] font-bold uppercase tracking-wide text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-red transition-colors"
            placeholder="Search clients..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-text-muted tracking-widest shrink-0">
          <UserCheck size={12} />
          {clients.length} client{clients.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Pending Site Requests Banner */}
      {pendingSiteReqs > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-accent-gold/5 border border-accent-gold/20">
          <MapPin size={14} className="text-accent-gold shrink-0" />
          <p className="text-[10px] font-bold text-accent-gold uppercase tracking-widest">
            {pendingSiteReqs} pending site request{pendingSiteReqs > 1 ? 's' : ''} awaiting review
          </p>
        </div>
      )}

      {/* Clients grid */}
      {filteredClients.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-sub p-16 text-center">
          <UserCheck size={32} className="text-text-muted mx-auto mb-3" />
          <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest">
            {searchQuery ? 'No clients match your search' : 'No clients yet'}
          </p>
          {!searchQuery && (
            <p className="text-[10px] text-text-muted mt-1">Convert a Won lead or add a client directly.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredClients.map(client => {
            const clientSiteReqs = siteRequests.filter(r => r.clientId === client.id || r.clientName === client.clientCompany);
            return (
              <div key={client.id} className="rounded-xl border border-border-sub bg-bg-secondary hover:bg-bg-tertiary hover:border-border-main transition-all p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-black uppercase tracking-tight text-text-primary truncate">
                      {client.clientCompany || client.name}
                    </p>
                    {client.clientCompany && client.name !== client.clientCompany && (
                      <p className="text-[10px] font-bold text-text-muted mt-0.5 truncate">{client.name}</p>
                    )}
                  </div>
                  <span className="text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded border text-text-green bg-text-green/10 border-text-green/20 shrink-0">Active</span>
                </div>
                <div className="space-y-1.5">
                  {client.email && (
                    <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                      <Mail size={10} className="text-brand-red shrink-0" />
                      <span className="truncate">{client.email}</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                      <Phone size={10} className="shrink-0" />
                      <span>{client.phone}</span>
                    </div>
                  )}
                  {clientSiteReqs.length > 0 && (
                    <div className="flex items-center gap-1.5 text-[10px] text-accent-gold">
                      <MapPin size={10} className="shrink-0" />
                      <span>{clientSiteReqs.length} site request{clientSiteReqs.length > 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Client Dialog */}
      <Dialog open={isAddClientOpen} onOpenChange={setIsAddClientOpen}>
        <DialogContent className="bg-bg-elevated border-border-main max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[13px] font-black uppercase tracking-widest">Add Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Company Name</Label>
              <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Acme Corp" value={newClientForm.company} onChange={e => setNewClientForm(f => ({ ...f, company: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Contact Name</Label>
              <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Jane Smith" value={newClientForm.name} onChange={e => setNewClientForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Email</Label>
              <Input type="email" className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="jane@acme.com" value={newClientForm.email} onChange={e => setNewClientForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Phone</Label>
              <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="555-000-0000" value={newClientForm.phone} onChange={e => setNewClientForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsAddClientOpen(false)} className="text-[10px] font-black uppercase">Cancel</Button>
            <Button size="sm" onClick={handleAddClient} disabled={saving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
              {saving ? 'Adding...' : 'Add Client'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
