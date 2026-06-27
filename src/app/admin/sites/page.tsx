'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, query, orderBy } from 'firebase/firestore';
import { makeSiteId } from '@/lib/doc-ids';
import type { Site } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Plus, MapPin, Search, Phone, User } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export default function AdminSitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', clientName: '', location: '', managerName: '', managerPhone: '' });
  const { toast } = useToast();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'sites'), (snap) => {
      setSites(snap.docs.map(d => ({ ...d.data(), id: d.id } as Site)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const filtered = useMemo(() =>
    sites.filter(s =>
      !search ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.clientName?.toLowerCase().includes(search.toLowerCase()) ||
      s.location?.toLowerCase().includes(search.toLowerCase())
    ),
    [sites, search]
  );

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
        <div className="page-header-right">
          <Button size="sm" className="h-8 bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase tracking-widest" onClick={() => setIsNewOpen(true)}>
            <Plus size={12} className="mr-1.5" />
            New Site
          </Button>
        </div>
      </header>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <Input
          placeholder="Search sites..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-9 text-[11px] bg-bg-secondary border-border-main"
        />
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(site => (
            <Link key={site.id} href={`/admin/sites/${site.id}`}>
              <div className="rounded-xl border border-border-sub bg-bg-secondary hover:bg-bg-tertiary hover:border-border-main transition-all cursor-pointer p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-black uppercase tracking-tight text-text-primary truncate">{site.name}</p>
                    {site.clientName && (
                      <p className="text-[10px] font-bold text-text-muted mt-0.5 truncate">{site.clientName}</p>
                    )}
                  </div>
                  <Badge variant={site.status === 'active' ? 'active' : 'completed'} className="text-[7px] h-3.5 uppercase shrink-0">
                    {site.status}
                  </Badge>
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
