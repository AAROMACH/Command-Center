'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, query, orderBy } from 'firebase/firestore';
import { makeSiteId } from '@/lib/doc-ids';
import type { Site, Technician } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Plus, MapPin, Search, Phone, User, ChevronRight, Activity, Clock, DollarSign, LayoutGrid, Rows3, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export default function AdminSitesPage() {
  const router = useRouter();
  const [sites, setSites] = useState<Site[]>([]);
  const [clients, setClients] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'client' | 'status'>('name');
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'grouped'>('grid');
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ name: '', clientName: '', location: '', managerName: '', managerPhone: '' });
  const { toast } = useToast();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'sites'), (snap) => {
      setSites(snap.docs.map(d => ({ ...d.data(), id: d.id } as Site)));
      setLoading(false);
    }, () => setLoading(false));
    const unsubC = onSnapshot(collection(db, 'users'), snap => {
      setClients(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician))
        .filter(u => u.roles?.includes('client') || u.role?.toLowerCase().includes('client')));
    });
    return () => { unsub(); unsubC(); };
  }, []);

  const filtered = useMemo(() => {
    const list = sites.filter(s =>
      !search ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.clientName?.toLowerCase().includes(search.toLowerCase()) ||
      s.location?.toLowerCase().includes(search.toLowerCase())
    );
    return [...list].sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'client') return (a.clientName || '').localeCompare(b.clientName || '');
      if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '');
      return 0;
    });
  }, [sites, search, sortBy]);

  const grouped = useMemo(() => {
    const map = new Map<string, Site[]>();
    filtered.forEach(s => {
      const key = s.clientName || 'No Client';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const toggleClient = (name: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!form.name || !form.location) {
      toast({ variant: 'destructive', title: 'Required fields missing', description: 'Site name and location are required.' });
      return;
    }
    setSaving(true);
    try {
      const id = await makeSiteId();
      await addDoc(collection(db, 'sites'), {
        ...form,
        id,
        status: 'active',
        createdAt: new Date().toISOString(),
      });
      toast({ title: 'Site created', description: `${form.name} has been added.` });
      setForm({ name: '', clientName: '', location: '', managerName: '', managerPhone: '' });
      setIsNewOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed to create site', description: e.message });
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
            Site Management
          </p>
          <h1 className="page-title">Sites</h1>
          <p className="page-subtitle">Manage customer sites and their service history.</p>
        </div>
      </header>

      {/* Dispatch-style search bar */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-bg-secondary/50 p-4 rounded-xl border border-border-sub shadow-sm">
        <div className="flex items-center gap-3 w-full md:w-auto flex-1">
          <div className="search-wrap flex-1 !mb-0 text-left">
            <Search className="h-4 w-4 text-text-muted" />
            <input
              className="search-input"
              placeholder="Search sites, clients, locations..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 bg-bg-primary px-3 h-9 rounded-md border border-border-sub shrink-0">
            <p className="text-[9px] font-black text-text-muted uppercase tracking-widest whitespace-nowrap">Sort by:</p>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-20 h-7 bg-transparent text-[10px] font-bold uppercase border-none shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                <SelectItem value="name" className="text-[10px] font-bold uppercase">Name</SelectItem>
                <SelectItem value="client" className="text-[10px] font-bold uppercase">Client</SelectItem>
                <SelectItem value="status" className="text-[10px] font-bold uppercase">Status</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <div className="flex items-center gap-2 px-3 py-1 bg-bg-primary rounded-full border border-border-sub">
            <Building2 size={12} className="text-text-muted" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">{filtered.length} site{filtered.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1 bg-bg-primary rounded-md border border-border-sub p-0.5">
            <button onClick={() => setViewMode('grid')} className={cn("h-7 w-8 flex items-center justify-center rounded transition-colors", viewMode === 'grid' ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary')}>
              <LayoutGrid size={12} />
            </button>
            <button onClick={() => setViewMode('grouped')} className={cn("h-7 w-8 flex items-center justify-center rounded transition-colors", viewMode === 'grouped' ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary')}>
              <Rows3 size={12} />
            </button>
          </div>
          <Button size="sm" className="h-9 bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase tracking-widest" onClick={() => setIsNewOpen(true)}>
            <Plus size={12} className="mr-1.5" />
            New Site
          </Button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-bg-secondary border border-border-sub animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-sub p-16 text-center">
          <Building2 size={32} className="text-text-muted mx-auto mb-3" />
          <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest">
            {search ? 'No sites match your search' : 'No sites yet'}
          </p>
          {!search && (
            <Button size="sm" variant="outline" className="mt-4 text-[10px] font-black uppercase tracking-wider" onClick={() => setIsNewOpen(true)}>
              <Plus size={11} className="mr-1.5" />
              Add First Site
            </Button>
          )}
        </div>
      ) : viewMode === 'grouped' ? (
        <div className="space-y-3">
          {grouped.map(([clientName, clientSites]) => (
            <div key={clientName} className="rounded-xl border border-border-sub overflow-hidden">
              <div className="flex items-stretch bg-bg-secondary hover:bg-bg-tertiary transition-colors">
                <button
                  onClick={() => {
                    const match = clients.find(c => (c.clientCompany || c.name) === clientName);
                    if (match) router.push('/admin/clients/' + match.id);
                    else toggleClient(clientName);
                  }}
                  className="flex-1 flex items-center gap-3 px-4 py-3 text-left"
                >
                  <Building2 size={14} className="text-brand-red" />
                  <span className="text-[12px] font-black uppercase tracking-wide text-text-primary">{clientName}</span>
                  <span className="text-[9px] font-bold text-text-muted bg-bg-primary border border-border-sub rounded-full px-2 py-0.5">{clientSites.length} site{clientSites.length !== 1 ? 's' : ''}</span>
                </button>
                <button onClick={() => toggleClient(clientName)} className="px-4 border-l border-border-sub hover:bg-bg-primary transition-colors">
                  <ChevronDown size={14} className={cn("text-text-muted transition-transform", expandedClients.has(clientName) ? 'rotate-180' : '')} />
                </button>
              </div>
              {expandedClients.has(clientName) && (
                <div className="border-t border-border-sub divide-y divide-border-sub">
                  {clientSites.map(site => (
                    <Link key={site.id} href={`/admin/sites/${site.id}`} className="flex items-center justify-between px-6 py-3 bg-bg-primary hover:bg-bg-secondary transition-colors group">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="text-[11px] font-bold uppercase text-text-primary group-hover:text-brand-red transition-colors">{site.name}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            {site.location && <span className="flex items-center gap-1 text-[9px] text-text-muted"><MapPin size={9} />{site.location}</span>}
                            {site.managerName && <span className="flex items-center gap-1 text-[9px] text-text-muted"><User size={9} />{site.managerName}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={site.status === 'active' ? 'active' : 'completed'} className="text-[7px] h-4 uppercase">{site.status || 'active'}</Badge>
                        <ChevronRight size={12} className="text-text-muted group-hover:text-text-primary" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(site => (
            <Link key={site.id} href={`/admin/sites/${site.id}`}>
              <div className="rounded-xl border border-border-sub bg-bg-secondary hover:bg-bg-tertiary hover:border-border-main hover:shadow-lg transition-all cursor-pointer group flex flex-col overflow-hidden">
                {/* Card header band */}
                <div className="bg-bg-tertiary/50 border-b border-border-sub px-4 py-2.5 flex items-center justify-between gap-2">
                  <Building2 size={12} className="text-brand-red shrink-0" />
                  <Badge variant={site.status === 'active' ? 'active' : 'completed'} className="text-[7px] h-4 uppercase shrink-0 ml-auto">
                    {site.status || 'active'}
                  </Badge>
                </div>
                {/* Main content */}
                <div className="p-4 space-y-3 flex-1">
                  <div className="min-w-0">
                    <p className="text-[14px] font-black uppercase tracking-tight text-text-primary truncate group-hover:text-brand-red transition-colors">{site.name}</p>
                    {site.clientName && (
                      <p className="text-[10px] font-bold text-text-muted mt-0.5 truncate">{site.clientName}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {site.location && (
                      <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                        <MapPin size={10} className="text-brand-red shrink-0" />
                        <span className="truncate">{site.location}</span>
                      </div>
                    )}
                    {site.managerName && (
                      <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                        <User size={10} className="shrink-0" />
                        <span className="truncate">{site.managerName}</span>
                      </div>
                    )}
                    {site.managerPhone && (
                      <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                        <Phone size={10} className="shrink-0" />
                        <span>{site.managerPhone}</span>
                      </div>
                    )}
                  </div>
                </div>
                {/* Footer */}
                <div className="bg-bg-tertiary/20 border-t border-border-sub px-4 py-2 flex items-center justify-between">
                  <p className="text-[8px] font-bold text-text-muted uppercase tracking-widest">View Details</p>
                  <ChevronRight size={12} className="text-text-muted group-hover:text-text-primary transition-colors" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* New Site Dialog */}
      <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
        <DialogContent className="bg-bg-elevated border-border-main max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[13px] font-black uppercase tracking-widest">New Site</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Site Name *</Label>
              <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. Retail Branch - Miami" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Client / Company</Label>
              <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Client name" value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Location / Address *</Label>
              <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Full address" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Site Manager</Label>
                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Name" value={form.managerName} onChange={e => setForm(f => ({ ...f, managerName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Manager Phone</Label>
                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="555-000-0000" value={form.managerPhone} onChange={e => setForm(f => ({ ...f, managerPhone: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsNewOpen(false)} className="text-[10px] font-black uppercase">Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={saving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
              {saving ? 'Creating...' : 'Create Site'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
