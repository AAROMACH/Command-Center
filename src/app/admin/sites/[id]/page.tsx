'use client';
import { useClientSubscriptions, useServicePlans } from '@/hooks/use-billing';
import { isLiveSubscription, SUBSCRIPTION_STATUS_LABELS } from '@/lib/billing';
import { onSharedSnapshot } from '@/lib/shared-snapshot';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, collection, query, where, addDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import type { Site, SiteNote, WorkOrder, Technician } from '@/lib/types';
import { isClient } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, MapPin, User, Phone, Plus, Trash2, Clock, DollarSign, FileText, ChevronLeft, Activity, CheckCircle2, AlertTriangle, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { mergeJobs } from '@/lib/jobs';

const TABS = ['Site Info', 'Assignment History', 'Pay History', 'Notes', 'Documents'] as const;
type Tab = typeof TABS[number];

export default function SiteDetailPage() {
  const params = useParams();
  const siteId = params.id as string;
  const [site, setSite] = useState<Site | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('Site Info');
  const [woDocs, setWoDocs] = useState<WorkOrder[]>([]);
  const [assignmentDocs, setAssignmentDocs] = useState<WorkOrder[]>([]);
  // Assigning a job moves it from workOrders into assignments — read both.
  const workOrders = useMemo(() => mergeJobs(woDocs, assignmentDocs), [woDocs, assignmentDocs]);
  const [notes, setNotes] = useState<SiteNote[]>([]);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Site>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [clientUser, setClientUser] = useState<Technician | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const unsubSite = onSnapshot(doc(db, 'sites', siteId), (snap) => {
      if (snap.exists()) {
        const data = { ...snap.data(), id: snap.id } as Site;
        setSite(data);
        setEditForm(data);
      }
    });

    const unsubWO = onSnapshot(
      query(collection(db, 'workOrders'), where('siteId', '==', siteId)),
      (snap) => setWoDocs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)))
    );
    const unsubAsg = onSnapshot(
      query(collection(db, 'assignments'), where('siteId', '==', siteId)),
      (snap) => setAssignmentDocs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)))
    );

    const unsubNotes = onSnapshot(
      collection(db, 'sites', siteId, 'notes'),
      (snap) => {
        const ns = snap.docs.map(d => ({ ...d.data(), id: d.id } as SiteNote));
        setNotes(ns.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      }
    );

    return () => { unsubSite(); unsubWO(); unsubAsg(); unsubNotes(); };
  }, [siteId]);

  useEffect(() => {
    if (!site) return;
    const lookupId = (site as any).clientId || '';
    const lookupName = site.clientName || '';
    const unsubClient = onSharedSnapshot('users', snap => {
      const users = snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician));
      // By id first, then by company name. There used to be a third
      // fallback — "any client" — so an unmatched site showed some other
      // client's details and subscription.
      const found = (lookupId && users.find(u => u.id === lookupId))
        || (lookupName && users.find(u => isClient(u) && (u.clientCompany === lookupName || u.name === lookupName)))
        || undefined;
      setClientUser(found || null);
    });
    return () => { unsubClient(); };
  }, [site?.clientName, (site as any)?.clientId]);

  const totalPay = useMemo(() =>
    workOrders.filter(wo => wo.status === 'completed').reduce((sum, wo) => sum + (wo.finalPay || wo.pay || 0), 0),
    [workOrders]
  );

  const handleSaveInfo = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'sites', siteId), editForm);
      toast({ title: 'Site updated' });
      setIsEditing(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed to update', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    const currentUser = typeof window !== 'undefined' ? sessionStorage.getItem('currentUserName') || 'Admin' : 'Admin';
    try {
      await addDoc(collection(db, 'sites', siteId, 'notes'), {
        text: noteText.trim(),
        author: currentUser,
        createdAt: new Date().toISOString(),
      });
      setNoteText('');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed to add note', description: e.message });
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteDoc(doc(db, 'sites', siteId, 'notes', noteId));
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed to delete note' });
    }
  };


  if (!site) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const completedJobs = workOrders.filter(wo => wo.status === 'completed');
  const activeJobs = workOrders.filter(wo => wo.status !== 'completed');

  return (
    <div className="space-y-5">
      <header className="page-header">
        <div className="text-left">
          <Link href="/admin/sites" className="flex items-center gap-1.5 text-[10px] font-bold text-text-muted uppercase tracking-wider hover:text-text-primary mb-2">
            <ChevronLeft size={11} />
            Back to Sites
          </Link>
          <p className="page-eyebrow flex items-center gap-2">
            <Building2 size={12} />
            Site Detail
          </p>
          <h1 className="page-title">{site.name}</h1>
          {site.clientName && <p className="page-subtitle">{site.clientName}</p>}
        </div>
        <div className="page-header-right gap-3">
          <Badge variant={site.status === 'active' ? 'active' : 'completed'} className="text-[11px] h-6 px-3">
            {site.status || 'active'}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} className="h-8 text-[10px] font-bold uppercase tracking-wider">
            Edit Site
          </Button>
        </div>
      </header>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-bg-secondary rounded-xl border border-border-sub p-3 space-y-1 text-left">
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5"><Activity size={9} />Total Jobs</p>
          <p className="text-2xl font-black font-mono text-text-primary">{workOrders.length}</p>
        </div>
        <div className="bg-bg-secondary rounded-xl border border-border-sub p-3 space-y-1 text-left">
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5"><CheckCircle2 size={9} className="text-text-green" />Completed</p>
          <p className="text-2xl font-black font-mono text-text-green">{completedJobs.length}</p>
        </div>
        <div className="bg-bg-secondary rounded-xl border border-border-sub p-3 space-y-1 text-left">
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5"><Clock size={9} className="text-accent-gold" />Active</p>
          <p className="text-2xl font-black font-mono text-accent-gold">{activeJobs.length}</p>
        </div>
        <div className="bg-bg-secondary rounded-xl border border-green-500/20 p-3 space-y-1 text-left">
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5"><DollarSign size={9} className="text-text-green" />Total Paid</p>
          <p className="text-2xl font-black font-mono text-text-green">${totalPay.toFixed(0)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border-sub -mt-2">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'text-[10px] font-bold uppercase tracking-wider px-4 py-3 border-b-2 transition-colors whitespace-nowrap',
              activeTab === tab
                ? 'border-brand-red text-brand-red'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Site Info Tab */}
      {activeTab === 'Site Info' && (
        <div className="max-w-lg space-y-4">
          {isEditing ? (
            <>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Site Name</Label>
                  <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Client</Label>
                  <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" value={editForm.clientName || ''} onChange={e => setEditForm(f => ({ ...f, clientName: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Location</Label>
                  <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" value={editForm.location || ''} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Manager</Label>
                    <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" value={editForm.managerName || ''} onChange={e => setEditForm(f => ({ ...f, managerName: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Phone</Label>
                    <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" value={editForm.managerPhone || ''} onChange={e => setEditForm(f => ({ ...f, managerPhone: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Status</Label>
                  <Select value={editForm.status || 'active'} onValueChange={v => setEditForm(f => ({ ...f, status: v as any }))}>
                    <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-bg-elevated border-border-main">
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveInfo} disabled={saving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-bold">
                  {saving ? 'Saving...' : 'Save'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setIsEditing(false); setEditForm(site); }} className="text-[10px] font-bold">
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <div className="bg-bg-secondary border border-border-sub rounded-xl p-4 space-y-3">
              <InfoRow icon={Building2} label="Site Name" value={site.name} />
              {site.clientName && <InfoRow icon={User} label="Client" value={site.clientName} />}
              <InfoRow icon={MapPin} label="Location" value={site.location} />
              {site.managerName && <InfoRow icon={User} label="Site Manager" value={site.managerName} />}
              {site.managerPhone && <InfoRow icon={Phone} label="Manager Phone" value={site.managerPhone} />}
            </div>
          )}

          {/* Subscription — read from the client's real subscription;
              managed on Service Plans (it used to cycle a status flag here). */}
          {clientUser && <SiteSubscriptionCard clientId={clientUser.id} />}
        </div>
      )}

      {/* Assignment History Tab */}
      {activeTab === 'Assignment History' && (
        <div className="space-y-2">
          {workOrders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-sub p-12 text-center">
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">No assignments linked to this site</p>
            </div>
          ) : (
            workOrders.map(wo => (
              <div key={wo.id} className="bg-bg-secondary border border-border-sub rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-text-primary truncate">{wo.title || wo.description || wo.id}</p>
                  <p className="text-[11px] text-text-muted mt-0.5">{wo.scheduleDate} {wo.scheduleTime && `· ${wo.scheduleTime}`}</p>
                </div>
                <Badge variant="scheduled" className="text-[10px] shrink-0">{wo.status}</Badge>
              </div>
            ))
          )}
        </div>
      )}

      {/* Pay History Tab */}
      {activeTab === 'Pay History' && (
        <div className="space-y-4">
          <div className="bg-bg-secondary border border-green-border/20 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Total Paid (Completed Jobs)</p>
              <p className="text-2xl font-black font-mono text-text-green">${totalPay.toFixed(2)}</p>
            </div>
            <DollarSign size={24} className="text-text-green/30" />
          </div>
          <div className="space-y-2">
            {workOrders.filter(wo => wo.status === 'completed').map(wo => (
              <div key={wo.id} className="bg-bg-secondary border border-border-sub rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-text-primary truncate">{wo.title || wo.id}</p>
                  <p className="text-[11px] text-text-muted mt-0.5">{wo.scheduleDate}</p>
                </div>
                <p className="text-[12px] font-bold font-mono text-text-green shrink-0">${(wo.finalPay || wo.pay || 0).toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes Tab */}
      {activeTab === 'Notes' && (
        <div className="space-y-4 max-w-lg">
          <div className="space-y-2">
            <Textarea
              placeholder="Add a note..."
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              className="min-h-[80px] text-[11px] bg-bg-secondary border-border-main resize-none"
            />
            <Button size="sm" onClick={handleAddNote} disabled={!noteText.trim()} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-bold">
              <Plus size={11} className="mr-1.5" />
              Add Note
            </Button>
          </div>
          <div className="space-y-2">
            {notes.length === 0 ? (
              <p className="text-[10px] text-text-muted uppercase tracking-wider text-center py-8">No notes yet</p>
            ) : notes.map(note => (
              <div key={note.id} className="bg-bg-secondary border border-border-sub rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] text-text-secondary leading-relaxed flex-1">{note.text}</p>
                  <button onClick={() => handleDeleteNote(note.id)} className="text-text-muted hover:text-text-red transition-colors shrink-0">
                    <Trash2 size={12} />
                  </button>
                </div>
                <p className="text-[10px] font-bold text-text-muted/60 uppercase tracking-wider mt-2">
                  {note.author} · {note.createdAt ? format(parseISO(note.createdAt), 'MMM d, yyyy h:mm a') : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === 'Documents' && (
        <div className="rounded-xl border border-dashed border-border-sub p-16 text-center">
          <FileText size={32} className="text-text-muted mx-auto mb-3" />
          <p className="text-[11px] font-bold text-text-muted">Document management</p>
          <p className="text-[11px] text-text-muted mt-1">File upload and document storage coming soon.</p>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={13} className="text-brand-red shrink-0 mt-0.5" />
      <div>
        <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{label}</p>
        <p className="text-[11px] text-text-primary font-medium mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function SiteSubscriptionCard({ clientId }: { clientId: string }) {
  const { subscriptions } = useClientSubscriptions(clientId);
  const { plans } = useServicePlans();
  const sub = subscriptions.find(isLiveSubscription) || subscriptions.find(x => x.status === 'pending');
  const plan = plans.find(p => p.id === sub?.planId);
  return (
    <div className="bg-bg-secondary border border-border-sub rounded-xl p-4 space-y-2">
      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Service Plan</p>
      {sub ? (
        <>
          <div className="flex items-center gap-2">
            <p className="text-[12px] font-bold text-text-primary">{plan?.name || sub.planId}</p>
            <Badge variant={sub.status === 'active' ? 'active' : sub.status === 'pending' ? 'scheduled' : 'outline'} className="text-[10px] h-5 px-2">
              {SUBSCRIPTION_STATUS_LABELS[sub.status]}
            </Badge>
          </div>
          {plan && <p className="text-[10px] text-text-muted">{plan.benefits.responseHours}h response · {plan.benefits.laborDiscountPct}% off labor</p>}
        </>
      ) : (
        <p className="text-[11px] text-text-muted">No plan.</p>
      )}
      <Link href="/admin/plans" className="text-[10px] font-bold text-brand-red hover:underline">Manage on Service Plans →</Link>
    </div>
  );
}

