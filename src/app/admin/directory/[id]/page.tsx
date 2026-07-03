'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase';
import { doc, collection, onSnapshot, addDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowLeft, Mail, Phone, MapPin, Briefcase, Clock, CheckCircle, AlertTriangle,
  Calendar, FileText, Upload, Shield, CheckSquare, Square,
  Star, Activity, TrendingUp, StickyNote, Plus, Users, Wrench,
  PhoneCall, UserCheck, BarChart2, Pencil,
} from 'lucide-react';
import { EditProfileDialog } from '../components/edit-profile-dialog';
import { cn } from '@/lib/utils';
import { getReliabilityTier, getTierBadgeVariant } from '@/lib/reliability';
import { hasPermission, ALL_PERMISSIONS, PERMISSION_TREE, getPortalAccess, type Permission } from '@/lib/permissions';
import { format, parseISO, differenceInDays } from 'date-fns';
import type { Technician, WorkOrder, PersonnelDocument, Project, ReliabilityEvent } from '@/lib/types';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DOC_TYPE_LABELS: Record<string, string> = {
  w9: 'W-9', insurance: 'Insurance', license: 'License', certification: 'Certification',
  agreement: 'Agreement', id: 'ID', training: 'Training', other: 'Other',
};

const DOC_TYPE_COLORS: Record<string, string> = {
  w9: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
  insurance: 'bg-purple-400/10 text-purple-400 border-purple-400/20',
  license: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
  certification: 'bg-text-green/10 text-text-green border-text-green/20',
  agreement: 'bg-orange-400/10 text-orange-400 border-orange-400/20',
  id: 'bg-pink-400/10 text-pink-400 border-pink-400/20',
  training: 'bg-sky-400/10 text-sky-400 border-sky-400/20',
  other: 'bg-bg-tertiary text-text-muted border-border-sub',
};

function permissionLabel(perm: string): string {
  const parts = perm.split('.');
  if (parts.length === 3) {
    const [, page, action] = parts;
    return `${page}: ${action}`.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  return perm.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function DirectoryPersonPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [person, setPerson] = useState<Technician | null>(null);
  const [assignments, setAssignments] = useState<WorkOrder[]>([]);
  const [documents, setDocuments] = useState<PersonnelDocument[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [penaltyEvents, setPenaltyEvents] = useState<ReliabilityEvent[]>([]);
  const [techNotes, setTechNotes] = useState<{ id: string; text: string; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({ name: '', type: 'other', expiryDate: '', url: '' });
  const [uploadSaving, setUploadSaving] = useState(false);

  const [permOverrides, setPermOverrides] = useState<Record<string, boolean>>({});
  const [savingPerms, setSavingPerms] = useState(false);
  const [permsDirty, setPermsDirty] = useState(false);

  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  useEffect(() => {
    if (!id) return;

    const unsubUser = onSnapshot(doc(db, 'users', id), snap => {
      if (snap.exists()) {
        const data = { ...snap.data(), id: snap.id } as Technician;
        setPerson(data);
        setPermOverrides(data.permissionOverrides || {});
      }
      setLoading(false);
    });

    const unsubDocs = onSnapshot(collection(db, 'users', id, 'documents'), snap => {
      setDocuments(snap.docs.map(d => ({ ...d.data(), id: d.id } as PersonnelDocument)));
    });
    const unsubPenalty = onSnapshot(collection(db, 'penaltyEvents'), snap => {
      const all = snap.docs.map(d => ({ ...d.data(), id: d.id } as ReliabilityEvent));
      setPenaltyEvents(all.filter(e => e.techId === id).sort((a, b) => b.createdAt?.localeCompare(a.createdAt || '') || 0));
    });
    const unsubNotes = onSnapshot(collection(db, 'users', id, 'techNotes'), snap => {
      setTechNotes(
        snap.docs.map(d => ({ ...d.data(), id: d.id } as { id: string; text: string; createdAt: string }))
          .sort((a, b) => b.createdAt?.localeCompare(a.createdAt || '') || 0)
      );
    });
    return () => { unsubUser(); unsubDocs(); unsubPenalty(); unsubNotes(); };
  }, [id]);

  const activeJobs = useMemo(() => assignments.filter(wo => wo.status !== 'completed'), [assignments]);
  const completedJobs = useMemo(() => assignments.filter(wo => wo.status === 'completed'), [assignments]);
  const reliabilityScore = person?.reliabilityScore ?? 0;
  const tier = getReliabilityTier(reliabilityScore);

  const isTech = useMemo(() => {
    if (!person) return false;
    return (
      person.roles?.some(r => r === 'field_technician' || r === 'project_lead') ||
      (person.role || '').toLowerCase().includes('tech') ||
      (person.role || '').toLowerCase().includes('lead') ||
      (person.role || '').toLowerCase().includes('operative')
    ) ?? false;
  }, [person]);

  const certDocuments = useMemo(() => documents.filter(d => d.type === 'certification'), [documents]);
  const roles: string[] = Array.isArray(person?.roles) ? (person!.roles as string[]) : (person?.role ? [person.role] : ['Staff']);
  const activePortals = useMemo(() => getPortalAccess(person), [person]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try { return format(parseISO(dateStr), 'MM/dd/yyyy'); } catch { return dateStr; }
  };

  const handleUploadDoc = async () => {
    if (!uploadForm.name || !id) return;
    setUploadSaving(true);
    try {
      await addDoc(collection(db, 'users', id, 'documents'), {
        name: uploadForm.name,
        type: uploadForm.type,
        url: uploadForm.url || '#',
        uploadedAt: new Date().toISOString(),
        expiryDate: uploadForm.expiryDate || null,
        approvalStatus: 'pending',
      });
      setUploadOpen(false);
      setUploadForm({ name: '', type: 'other', expiryDate: '', url: '' });
    } finally {
      setUploadSaving(false);
    }
  };

  const handleApproveDoc = async (docId: string) => {
    if (!id) return;
    await updateDoc(doc(db, 'users', id, 'documents', docId), { approvalStatus: 'approved' });
  };

  const handleToggleRole = async (role: string, add: boolean) => {
    if (!id || !person) return;
    await updateDoc(doc(db, 'users', id), {
      roles: add ? arrayUnion(role) : arrayRemove(role),
    });
    setPerson(prev => prev ? {
      ...prev,
      roles: add
        ? [...(prev.roles || []), role as any]
        : (prev.roles || []).filter(r => r !== role),
    } : prev);
  };

  const handleTogglePerm = (perm: Permission, value: boolean | null) => {
    setPermOverrides(prev => {
      const next = { ...prev };
      if (value === null) { delete next[perm]; } else { next[perm] = value; }
      return next;
    });
    setPermsDirty(true);
  };

  const handleSavePerms = async () => {
    if (!id) return;
    setSavingPerms(true);
    try {
      await updateDoc(doc(db, 'users', id), { permissionOverrides: permOverrides });
      setPermsDirty(false);
    } finally {
      setSavingPerms(false);
    }
  };

  const handleSelectAllForPortal = (portal: 'admin' | 'tech' | 'client') => {
    const portalPerms = Object.values(PERMISSION_TREE[portal]).flat() as Permission[];
    setPermOverrides(prev => {
      const next = { ...prev };
      portalPerms.forEach(p => { next[p] = true; });
      return next;
    });
    setPermsDirty(true);
  };

  const handleClearAllForPortal = (portal: 'admin' | 'tech' | 'client') => {
    const portalPerms = Object.values(PERMISSION_TREE[portal]).flat() as Permission[];
    setPermOverrides(prev => {
      const next = { ...prev };
      portalPerms.forEach(p => { delete next[p]; });
      return next;
    });
    setPermsDirty(true);
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !id) return;
    setAddingNote(true);
    try {
      await addDoc(collection(db, 'users', id, 'techNotes'), {
        text: noteText.trim(),
        createdAt: new Date().toISOString(),
      });
      setNoteText('');
    } finally {
      setAddingNote(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="space-y-2 text-center">
          <div className="h-16 w-16 rounded-full bg-bg-secondary animate-pulse mx-auto" />
          <div className="h-4 w-32 bg-bg-secondary animate-pulse rounded mx-auto" />
        </div>
      </div>
    );
  }

  if (!person) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertTriangle size={32} className="text-text-red" />
        <p className="text-[11px] font-bold text-text-muted uppercase">Personnel record not found</p>
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-[10px] uppercase font-bold">
          <ArrowLeft size={14} className="mr-2" /> Back
        </Button>
      </div>
    );
  }

  const tabTriggerClass = "px-0 pb-3 pt-0 h-auto bg-transparent rounded-none border-b-2 border-transparent text-[10px] font-black uppercase tracking-[0.15em] text-text-muted data-[state=active]:bg-transparent data-[state=active]:text-text-primary data-[state=active]:border-brand-red data-[state=active]:shadow-none transition-all flex items-center gap-1.5";

  const techTabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'contact', label: 'Contact' },
    { value: 'skills', label: 'Skills', badge: (person.skills?.length || 0) + certDocuments.length || undefined },
    { value: 'availability', label: 'Availability' },
    { value: 'documents', label: 'Documents', badge: documents.length || undefined },
    { value: 'permissions', label: 'Permissions' },
    { value: 'notes', label: 'Notes', badge: techNotes.length || undefined },
    { value: 'reliability', label: 'Reliability' },
  ];

  const staffTabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'contact', label: 'Contact' },
    { value: 'role', label: 'Role & Duties' },
    { value: 'permissions', label: 'Permissions' },
    { value: 'documents', label: 'Documents', badge: documents.length || undefined },
    { value: 'notes', label: 'Notes', badge: techNotes.length || undefined },
  ];

  const activeTabs = isTech ? techTabs : staffTabs;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/directory')} className="h-8 text-[10px] uppercase font-bold text-text-muted">
          <ArrowLeft size={14} className="mr-2" /> Directory
        </Button>
        <Button
          size="sm"
          onClick={() => setIsEditOpen(true)}
          className="h-8 text-[10px] font-black uppercase tracking-wider bg-brand-red hover:bg-brand-red/90 text-white"
        >
          <Pencil size={11} className="mr-1.5" /> Edit Profile
        </Button>
      </div>

      {/* Profile hero */}
      <div className="flex flex-col md:flex-row gap-6 p-6 rounded-xl border border-border-sub bg-bg-secondary">
        <div className="flex flex-col items-center gap-3 md:w-48 shrink-0">
          <Avatar className="h-20 w-20 border-2 border-brand-red">
            <AvatarImage src={person.avatarUrl} />
            <AvatarFallback className="text-lg font-bold">{(person.name || 'U')[0]}</AvatarFallback>
          </Avatar>
          {isTech && <Badge variant={getTierBadgeVariant(tier)} className="text-[8px] uppercase tracking-widest px-3">{tier}</Badge>}
        </div>
        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-text-primary">{person.name || 'Unnamed'}</h1>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {roles.map(r => <Badge key={r} variant="scheduled" className="text-[8px] uppercase h-4 px-2">{r}</Badge>)}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {person.email && (
              <a href={`mailto:${person.email}`} className="flex items-center gap-2 text-[11px] text-text-secondary hover:text-brand-red transition-colors">
                <Mail size={12} className="text-text-muted shrink-0" />{person.email}
              </a>
            )}
            {person.phone && (
              <a href={`tel:${person.phone}`} className="flex items-center gap-2 text-[11px] text-text-secondary hover:text-brand-red transition-colors">
                <Phone size={12} className="text-text-muted shrink-0" />{person.phone}
              </a>
            )}
            {person.currentLocation && (
              <span className="flex items-center gap-2 text-[11px] text-text-secondary">
                <MapPin size={12} className="text-text-muted shrink-0" />{person.currentLocation}
              </span>
            )}
            {person.clientCompany && (
              <span className="flex items-center gap-2 text-[11px] text-text-secondary">
                <Briefcase size={12} className="text-text-muted shrink-0" />{person.clientCompany}
              </span>
            )}
          </div>
        </div>
        <div className="md:w-48 shrink-0 grid grid-cols-2 md:grid-cols-1 gap-3">
          {[
            { label: 'Active Jobs', value: activeJobs.length, color: 'text-text-amber' },
            { label: 'Completed', value: completedJobs.length, color: 'text-text-green' },
          ].map(stat => (
            <div key={stat.label} className="p-2.5 rounded-lg bg-bg-primary border border-border-sub">
              <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">{stat.label}</p>
              <p className={cn('text-lg font-bold font-mono mt-0.5', stat.color)}>{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <div className="overflow-x-auto">
          <TabsList className="border-b border-border-sub bg-transparent rounded-none h-auto p-0 gap-6 justify-start mb-1 min-w-max w-full">
            {activeTabs.map(t => (
              <TabsTrigger key={t.value} value={t.value} className={tabTriggerClass}>
                {t.label}
                {t.badge !== undefined && t.badge > 0 && (
                  <span className="text-[8px] font-black bg-bg-tertiary text-text-muted border border-border-sub px-1.5 py-0.5 rounded">{t.badge}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ── OVERVIEW ── */}
        <TabsContent value="overview" className="m-0 pt-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {isTech && (
              <div className="p-4 rounded-xl border border-border-sub bg-bg-secondary space-y-3">
                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                  <Star size={11} className="text-brand-red" /> Reliability
                </h3>
                <div className="flex items-center gap-4">
                  <div className="text-4xl font-black font-mono text-text-primary">{reliabilityScore}</div>
                  <div>
                    <Badge variant={getTierBadgeVariant(tier)} className="text-[9px] uppercase">{tier}</Badge>
                    <p className="text-[9px] text-text-muted uppercase mt-1">{penaltyEvents.length} events logged</p>
                  </div>
                </div>
                {reliabilityScore > 0 && (
                  <div className="h-1.5 rounded-full bg-bg-primary overflow-hidden">
                    <div className="h-full bg-brand-red rounded-full transition-all" style={{ width: `${Math.min(reliabilityScore, 100)}%` }} />
                  </div>
                )}
              </div>
            )}
            <div className="p-4 rounded-xl border border-border-sub bg-bg-secondary space-y-2">
              <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                <Activity size={11} /> Recent Assignments
              </h3>
              {activeJobs.length === 0 ? (
                <p className="text-[10px] text-text-muted uppercase py-3 text-center">No active assignments</p>
              ) : activeJobs.slice(0, 3).map(wo => (
                <div key={wo.id} className="flex items-center justify-between p-2 rounded-lg border border-border-sub bg-bg-primary">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-text-primary uppercase truncate">{wo.title || wo.description || wo.id}</p>
                    <p className="text-[9px] text-text-muted uppercase">{wo.clientName}</p>
                  </div>
                  <Badge variant={wo.status === 'in-progress' ? 'active' : 'scheduled'} className="text-[7px] uppercase h-4 shrink-0 ml-2">{wo.status}</Badge>
                </div>
              ))}
            </div>
            <div className="p-4 rounded-xl border border-border-sub bg-bg-secondary space-y-2">
              <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                <CheckCircle size={11} className="text-text-green" /> Completion Stats
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-3 rounded-lg bg-bg-primary border border-border-sub">
                  <p className="text-2xl font-black font-mono text-text-green">{completedJobs.length}</p>
                  <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">Completed</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-bg-primary border border-border-sub">
                  <p className="text-2xl font-black font-mono text-text-amber">{activeJobs.length}</p>
                  <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">Active</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-bg-primary border border-border-sub">
                  <p className="text-2xl font-black font-mono text-text-primary">{projects.length}</p>
                  <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">Projects</p>
                </div>
              </div>
            </div>
            {person.workPreferences && (
              <div className="p-4 rounded-xl border border-border-sub bg-bg-secondary space-y-2">
                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                  <Wrench size={11} /> Work Preferences
                </h3>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-text-muted uppercase font-bold">Preferred Radius</span>
                    <span className="text-text-primary font-mono">{person.workPreferences.preferredRadius} mi</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-text-muted uppercase font-bold">Max Distance</span>
                    <span className="text-text-primary font-mono">{person.workPreferences.maxTravelDistance} mi</span>
                  </div>
                  {person.workPreferences.preferredJobTypes?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {person.workPreferences.preferredJobTypes.map(jt => (
                        <Badge key={jt} variant="scheduled" className="text-[8px] h-4 px-1.5">{jt}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── CONTACT ── */}
        <TabsContent value="contact" className="m-0 pt-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="p-5 rounded-xl border border-border-sub bg-bg-secondary space-y-4">
              <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 flex items-center gap-2">
                <Mail size={11} /> Contact Information
              </h3>
              <div className="space-y-3">
                {person.email && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-bg-primary border border-border-sub">
                      <Mail size={13} className="text-text-muted" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Email</p>
                      <a href={`mailto:${person.email}`} className="text-[11px] text-text-primary hover:text-brand-red">{person.email}</a>
                    </div>
                  </div>
                )}
                {person.phone && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-bg-primary border border-border-sub">
                      <Phone size={13} className="text-text-muted" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Phone</p>
                      <a href={`tel:${person.phone}`} className="text-[11px] text-text-primary hover:text-brand-red">{person.phone}</a>
                    </div>
                  </div>
                )}
                {(person.address || person.currentLocation) && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-bg-primary border border-border-sub">
                      <MapPin size={13} className="text-text-muted" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Address</p>
                      <p className="text-[11px] text-text-primary">{person.address || person.currentLocation}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-5 rounded-xl border border-border-sub bg-bg-secondary space-y-4">
              <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 flex items-center gap-2">
                <PhoneCall size={11} className="text-brand-red" /> Emergency Contact
              </h3>
              {person.emergencyContact ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-bg-primary border border-border-sub">
                      <UserCheck size={13} className="text-text-muted" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Name</p>
                      <p className="text-[11px] text-text-primary">{person.emergencyContact.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-bg-primary border border-border-sub">
                      <Users size={13} className="text-text-muted" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Relation</p>
                      <p className="text-[11px] text-text-primary">{person.emergencyContact.relation}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-bg-primary border border-border-sub">
                      <Phone size={13} className="text-text-muted" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Phone</p>
                      <a href={`tel:${person.emergencyContact.phone}`} className="text-[11px] text-text-primary hover:text-brand-red">{person.emergencyContact.phone}</a>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-text-muted uppercase py-4 text-center">No emergency contact on file</p>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── SKILLS & CERTS (tech) ── */}
        {isTech && (
          <TabsContent value="skills" className="m-0 pt-5">
            <div className="space-y-5">
              <div className="p-5 rounded-xl border border-border-sub bg-bg-secondary">
                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 mb-3 flex items-center gap-2">
                  <Wrench size={11} /> Skills ({person.skills?.length || 0})
                </h3>
                {person.skills && person.skills.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {person.skills.map(skill => (
                      <Badge key={skill} variant="scheduled" className="text-[9px] uppercase px-2.5 py-1 h-auto">{skill}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-text-muted uppercase py-3 text-center">No skills listed</p>
                )}
              </div>
              <div className="p-5 rounded-xl border border-border-sub bg-bg-secondary">
                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 mb-3 flex items-center gap-2">
                  <CheckCircle size={11} className="text-text-green" /> Certifications ({certDocuments.length})
                </h3>
                {certDocuments.length > 0 ? (
                  <div className="space-y-2">
                    {certDocuments.map(d => {
                      const daysToExpiry = d.expiryDate ? differenceInDays(new Date(d.expiryDate), new Date()) : null;
                      const expiringSoon = daysToExpiry !== null && daysToExpiry <= 30 && daysToExpiry >= 0;
                      const expired = daysToExpiry !== null && daysToExpiry < 0;
                      return (
                        <div key={d.id} className={cn('flex items-center justify-between p-3 rounded-lg border', expiringSoon && 'border-amber-400/30 bg-amber-400/5', expired && 'border-text-red/30 bg-text-red/5', !expiringSoon && !expired && 'border-border-sub bg-bg-primary')}>
                          <div>
                            <p className="text-[11px] font-bold text-text-primary">{d.name}</p>
                            <p className="text-[9px] text-text-muted uppercase">Expires: {d.expiryDate ? formatDate(d.expiryDate) : 'No expiry'}</p>
                          </div>
                          <Badge className={`text-[8px] h-5 uppercase border ${d.approvalStatus === 'approved' ? 'bg-text-green/10 text-text-green border-text-green/20' : 'bg-amber-400/10 text-amber-400 border-amber-400/20'}`}>
                            {d.approvalStatus}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-text-muted uppercase py-3 text-center">No certifications on file</p>
                )}
              </div>
            </div>
          </TabsContent>
        )}

        {/* ── AVAILABILITY (tech) ── */}
        {isTech && (
          <TabsContent value="availability" className="m-0 pt-5">
            <div className="rounded-xl border border-border-sub overflow-hidden">
              <div className="p-3 bg-bg-tertiary border-b border-border-sub">
                <p className="text-[10px] font-black text-text-muted uppercase tracking-widest flex items-center gap-2">
                  <Calendar size={11} /> Weekly Availability Schedule
                </p>
              </div>
              <div className="divide-y divide-border-sub">
                {DAYS.map(day => {
                  const slot = person.availability?.[day];
                  const isOff = !slot;
                  return (
                    <div key={day} className={cn('flex items-center justify-between px-4 py-3', isOff && 'bg-bg-tertiary/30')}>
                      <div className="flex items-center gap-3">
                        <div className={cn('w-2 h-2 rounded-full', isOff ? 'bg-text-muted/30' : 'bg-text-green')} />
                        <p className="text-[11px] font-bold text-text-primary uppercase w-24">{day}</p>
                      </div>
                      {isOff ? (
                        <Badge variant="onhold" className="text-[8px] uppercase">Day Off</Badge>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge variant="scheduled" className="text-[9px] font-mono px-2">{slot.start}</Badge>
                          <span className="text-text-muted text-[10px]">→</span>
                          <Badge variant="scheduled" className="text-[9px] font-mono px-2">{slot.end}</Badge>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>
        )}

        {/* ── ROLE & DUTIES (staff) ── */}
        {!isTech && (
          <TabsContent value="role" className="m-0 pt-5">
            <div className="space-y-5">
              <div className="p-5 rounded-xl border border-border-sub bg-bg-secondary">
                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 mb-3 flex items-center gap-2">
                  <UserCheck size={11} /> Assigned Roles
                </h3>
                <div className="flex flex-wrap gap-2">
                  {roles.map(r => (
                    <div key={r} className="px-3 py-2 rounded-lg border border-border-sub bg-bg-primary">
                      <p className="text-[10px] font-bold text-text-primary uppercase">{r.replace(/_/g, ' ')}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-5 rounded-xl border border-border-sub bg-bg-secondary">
                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 mb-3 flex items-center gap-2">
                  <Shield size={11} /> Permission Summary
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ALL_PERMISSIONS.slice(0, 18).map(perm => {
                    const granted = hasPermission(person, perm);
                    return granted ? (
                      <div key={perm} className="flex items-center gap-1.5 p-1.5 rounded bg-text-green/5 border border-text-green/20">
                        <CheckSquare size={10} className="text-text-green shrink-0" />
                        <p className="text-[8px] font-bold text-text-primary truncate">{permissionLabel(perm)}</p>
                      </div>
                    ) : null;
                  }).filter(Boolean)}
                </div>
              </div>
            </div>
          </TabsContent>
        )}


        {/* ── DOCUMENTS ── */}
        <TabsContent value="documents" className="m-0 pt-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-black text-text-muted uppercase tracking-widest flex items-center gap-2">
              <FileText size={11} /> {documents.length} Document{documents.length !== 1 ? 's' : ''}
            </p>
            <Button size="sm" className="h-8 text-[10px] font-bold uppercase tracking-wider bg-brand-red hover:bg-brand-red/90 text-white" onClick={() => setUploadOpen(true)}>
              <Upload size={11} className="mr-1.5" /> Upload Document
            </Button>
          </div>
          <div className="rounded-xl border border-border-sub overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border-sub">
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Document</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Type</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Uploaded</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Expiry</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Status</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted w-20">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map(d => {
                  const daysToExpiry = d.expiryDate ? differenceInDays(new Date(d.expiryDate), new Date()) : null;
                  const expiringSoon = daysToExpiry !== null && daysToExpiry <= 30 && daysToExpiry >= 0;
                  const expired = daysToExpiry !== null && daysToExpiry < 0;
                  return (
                    <TableRow key={d.id} className={cn('border-border-sub', expiringSoon && 'bg-amber-500/5', expired && 'bg-text-red/5')}>
                      <TableCell className="font-bold text-[11px] text-text-primary">{d.name}</TableCell>
                      <TableCell>
                        <Badge className={`text-[8px] h-5 uppercase border ${DOC_TYPE_COLORS[d.type] || DOC_TYPE_COLORS.other}`}>
                          {DOC_TYPE_LABELS[d.type] || d.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[10px] text-text-muted">
                        {d.uploadedAt ? format(new Date(d.uploadedAt), 'MM/dd/yyyy') : '—'}
                      </TableCell>
                      <TableCell className={cn('text-[10px]', expiringSoon ? 'text-amber-400 font-bold' : expired ? 'text-text-red font-bold' : 'text-text-muted')}>
                        {d.expiryDate ? format(new Date(d.expiryDate), 'MM/dd/yyyy') : '—'}
                        {expiringSoon && <span className="ml-1 text-[8px]">({daysToExpiry}d)</span>}
                        {expired && <span className="ml-1 text-[8px]">Expired</span>}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[8px] h-5 uppercase border ${
                          d.approvalStatus === 'approved' ? 'bg-text-green/10 text-text-green border-text-green/20' :
                          d.approvalStatus === 'rejected' ? 'bg-text-red/10 text-text-red border-text-red/20' :
                          'bg-amber-400/10 text-amber-400 border-amber-400/20'
                        }`}>
                          {d.approvalStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {d.approvalStatus === 'pending' && (
                          <Button size="sm" variant="ghost" className="h-6 text-[9px] font-bold text-text-green hover:bg-text-green/10" onClick={() => handleApproveDoc(d.id)}>
                            Approve
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {documents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-[10px] text-text-muted uppercase tracking-widest">No documents uploaded</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── PERMISSIONS ── */}
        <TabsContent value="permissions" className="m-0 pt-5">
          <div className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 flex items-center gap-2">
                <Shield size={11} /> Portal Access
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { role: 'super_admin', label: 'Admin Portal', desc: 'Full platform access' },
                  { role: 'field_technician', label: 'Technician Portal', desc: 'Field app access' },
                  { role: 'client', label: 'Client Portal', desc: 'Client dashboard access' },
                ].map(portal => {
                  const active = roles.includes(portal.role);
                  return (
                    <div
                      key={portal.role}
                      className={cn(
                        'p-3 rounded-lg border cursor-pointer transition-all',
                        active ? 'bg-brand-red/10 border-brand-red/30 text-text-primary' : 'border-border-sub bg-bg-secondary text-text-muted hover:border-border-main'
                      )}
                      onClick={() => handleToggleRole(portal.role, !active)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-black uppercase tracking-wider">{portal.label}</p>
                        {active ? <CheckSquare size={13} className="text-brand-red" /> : <Square size={13} className="text-text-muted" />}
                      </div>
                      <p className="text-[9px] text-text-muted">{portal.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-border-sub pb-2">
                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                  <CheckSquare size={11} /> Permission Overrides
                </h3>
                <Button size="sm" onClick={handleSavePerms} disabled={!permsDirty || savingPerms} className="h-7 text-[9px] font-bold uppercase bg-brand-red hover:bg-brand-red/90 text-white disabled:opacity-40">
                  {savingPerms ? 'Saving...' : 'Save Permissions'}
                </Button>
              </div>
              <p className="text-[9px] text-text-muted uppercase tracking-wider">Overrides take precedence over role defaults. Sections reflect active portal access.</p>
              {!activePortals.admin && !activePortals.tech && !activePortals.client ? (
                <div className="py-12 text-center">
                  <Shield size={24} className="mx-auto text-text-muted mb-3 opacity-30" />
                  <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">No Active Portal Access</p>
                  <p className="text-[9px] text-text-muted mt-1">Assign a role above to manage permissions</p>
                </div>
              ) : (
                <div className="space-y-6 pt-1">
                  {(['admin', 'tech', 'client'] as const).map(portal => {
                    if (!activePortals[portal]) return null;
                    const portalLabel = portal === 'admin' ? 'Admin Portal' : portal === 'tech' ? 'Technician Portal' : 'Client Portal';
                    const dotColor = portal === 'admin' ? 'bg-brand-red' : portal === 'tech' ? 'bg-blue-400' : 'bg-text-green';
                    return (
                      <div key={portal} className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] flex items-center gap-1.5">
                            <span className={cn('inline-block w-2 h-2 rounded-full', dotColor)} />
                            {portalLabel}
                          </h4>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleSelectAllForPortal(portal)} className="text-[8px] font-black uppercase tracking-wider text-text-muted hover:text-text-primary transition-colors">Select All</button>
                            <span className="text-text-muted text-[8px]">·</span>
                            <button onClick={() => handleClearAllForPortal(portal)} className="text-[8px] font-black uppercase tracking-wider text-text-muted hover:text-text-primary transition-colors">Clear All</button>
                          </div>
                        </div>
                        {Object.entries(PERMISSION_TREE[portal]).map(([page, perms]) => (
                          <div key={page} className="pl-3 border-l-2 border-border-sub space-y-1.5">
                            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-muted">{page.replace(/_/g, ' ')}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                              {(perms as Permission[]).map(perm => {
                                const roleDefault = hasPermission(person, perm);
                                const override = permOverrides[perm];
                                const effective = override !== undefined ? override : roleDefault;
                                return (
                                  <div key={perm} className={cn('flex items-center justify-between p-2 rounded-lg border transition-all', effective ? 'bg-text-green/5 border-text-green/20' : 'bg-bg-secondary border-border-sub')}>
                                    <div className="min-w-0">
                                      <p className="text-[9px] font-bold text-text-primary truncate">{permissionLabel(perm)}</p>
                                      {override !== undefined && <p className="text-[8px] text-amber-400 uppercase">Override</p>}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0 ml-2">
                                      <button
                                        onClick={() => handleTogglePerm(perm, effective ? false : true)}
                                        className={cn('h-5 w-5 rounded flex items-center justify-center transition-colors border', effective ? 'bg-text-green/20 border-text-green/30 text-text-green' : 'bg-bg-primary border-border-sub text-text-muted hover:border-border-main')}
                                      >
                                        {effective ? <CheckSquare size={11} /> : <Square size={11} />}
                                      </button>
                                      {override !== undefined && (
                                        <button onClick={() => handleTogglePerm(perm, null)} className="text-[8px] text-text-muted hover:text-text-primary uppercase font-bold px-1" title="Reset to role default">✕</button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── NOTES ── */}
        <TabsContent value="notes" className="m-0 pt-5">
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-border-sub bg-bg-secondary space-y-3">
              <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                <Plus size={11} /> Add Note
              </h3>
              <Textarea
                className="min-h-[80px] text-[11px] bg-bg-primary border-border-main resize-none"
                placeholder="Enter note..."
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleAddNote}
                  disabled={!noteText.trim() || addingNote}
                  className="h-8 text-[10px] font-bold uppercase bg-brand-red hover:bg-brand-red/90 text-white"
                >
                  {addingNote ? 'Saving...' : 'Save Note'}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 flex items-center gap-2">
                <StickyNote size={11} /> Notes ({techNotes.length})
              </h3>
              {techNotes.length === 0 ? (
                <p className="text-[10px] text-text-muted uppercase py-6 text-center">No notes yet</p>
              ) : techNotes.map(note => (
                <div key={note.id} className="p-3 rounded-lg border border-border-sub bg-bg-secondary">
                  <p className="text-[11px] text-text-primary whitespace-pre-wrap">{note.text}</p>
                  <p className="text-[9px] text-text-muted uppercase mt-2">
                    {note.createdAt ? format(new Date(note.createdAt), 'MMM d, yyyy h:mm a') : '—'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ── RELIABILITY (tech) ── */}
        {isTech && (
          <TabsContent value="reliability" className="m-0 pt-5">
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Score', value: reliabilityScore, color: reliabilityScore >= 80 ? 'text-text-green' : reliabilityScore >= 60 ? 'text-text-amber' : 'text-text-red' },
                  { label: 'Tier', value: tier, color: 'text-text-primary' },
                  { label: 'Events', value: penaltyEvents.length, color: 'text-text-muted' },
                ].map(s => (
                  <div key={s.label} className="p-3 rounded-xl border border-border-sub bg-bg-secondary text-center">
                    <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">{s.label}</p>
                    <p className={cn('text-xl font-black font-mono mt-1', s.color)}>{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 flex items-center gap-2">
                  <BarChart2 size={11} /> Event History ({penaltyEvents.length})
                </h3>
                {penaltyEvents.length === 0 ? (
                  <p className="text-[10px] text-text-muted uppercase py-6 text-center">No reliability events</p>
                ) : (
                  <div className="rounded-xl border border-border-sub overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border-sub">
                          <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Event</TableHead>
                          <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Category</TableHead>
                          <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted text-right">Score Δ</TableHead>
                          <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {penaltyEvents.map(ev => (
                          <TableRow key={ev.id} className="border-border-sub">
                            <TableCell className="text-[10px] text-text-primary font-bold">{ev.eventType?.replace(/_/g, ' ')}</TableCell>
                            <TableCell>
                              <Badge className={`text-[7px] uppercase h-4 border ${
                                ev.category === 'critical_failure' ? 'bg-text-red/10 text-text-red border-text-red/20' :
                                ev.category === 'positive_recovery' ? 'bg-text-green/10 text-text-green border-text-green/20' :
                                'bg-amber-400/10 text-amber-400 border-amber-400/20'
                              }`}>
                                {ev.category?.replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className={cn('text-[10px] font-bold font-mono text-right', ev.scoreChange > 0 ? 'text-text-green' : 'text-text-red')}>
                              {ev.scoreChange > 0 ? '+' : ''}{ev.scoreChange}
                            </TableCell>
                            <TableCell className="text-[10px] text-text-muted">
                              {ev.createdAt ? format(new Date(ev.createdAt), 'MM/dd/yy') : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Profile Dialog */}
      {person && (
        <EditProfileDialog
          open={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          person={person}
        />
      )}

      {/* Upload Document Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="bg-bg-elevated border-border-main max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
              <Upload size={14} className="text-brand-red" /> Upload Document
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Document Name</Label>
              <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. Driver's License" value={uploadForm.name} onChange={e => setUploadForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Document Type</Label>
              <Select value={uploadForm.type} onValueChange={v => setUploadForm(p => ({ ...p, type: v }))}>
                <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-bg-elevated border-border-main">
                  {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k} className="text-[11px]">{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Expiry Date (optional)</Label>
              <Input type="date" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={uploadForm.expiryDate} onChange={e => setUploadForm(p => ({ ...p, expiryDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Document URL (optional)</Label>
              <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="https://..." value={uploadForm.url} onChange={e => setUploadForm(p => ({ ...p, url: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setUploadOpen(false)} className="text-[10px] font-black uppercase">Cancel</Button>
            <Button size="sm" onClick={handleUploadDoc} disabled={!uploadForm.name || uploadSaving} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
              {uploadSaving ? 'Saving...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
