'use client';

import { useClientSubscriptions, useServicePlans } from '@/hooks/use-billing';
import { formatMoney, INTERVAL_LABELS, isLiveSubscription, subscriptionAmount, SUBSCRIPTION_STATUS_LABELS } from '@/lib/billing';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase';
import { doc, collection, onSnapshot, addDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, query, where } from 'firebase/firestore';
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
  Calendar, FileText, Upload, Shield, CheckSquare, Square, Minus,
  Star, Activity, TrendingUp, StickyNote, Plus, Users, Wrench,
  PhoneCall, UserCheck, BarChart2, Pencil, Ban, ChevronDown, ChevronRight,
  Landmark, ExternalLink, Trash2, XCircle, Link2,
} from 'lucide-react';
import { EditProfileDialog } from '../components/edit-profile-dialog';
import { uploadFile } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { hasPermission, PERMISSION_TREE, getPortalAccess, getSubroles, SUBROLE_DEFINITIONS, isTech as isTechRole, isClient as isClientRole, type Permission } from '@/lib/permissions';
import { auditEvent, auditFieldChange } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { canEditUserAccess } from '@/lib/profile-permissions';
import {
  vendorReadiness, customerReadiness, customerDisplayName, hasW9OnFile, WORKER_TYPE_LABELS, type Readiness,
} from '@/lib/accounting-readiness';
import { format, parseISO, differenceInDays } from 'date-fns';
import type { Technician, WorkOrder, PersonnelDocument, Project, ReliabilityEvent, QboLink } from '@/lib/types';
import { isAssignedTo, isArchivedJob } from '@/lib/jobs';
import { PageHeader } from '@/components/page-header';
import { PageLoading, EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { TONE_BADGE, statusLabel, type Tone } from '@/lib/status-styles';
import { AccountStatusBadge, accountStatusLabel } from '@/app/admin/clients/account-status';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DOC_TYPE_LABELS: Record<string, string> = {
  w9: 'W-9', insurance: 'Insurance', license: 'License', certification: 'Certification',
  agreement: 'Agreement', id: 'ID', training: 'Training', other: 'Other',
};

// Reliability event category → shared status tone.
const EVENT_TONE: Record<string, Tone> = { critical_failure: 'problem', positive_recovery: 'done' };

type PortalKey = 'admin' | 'sales' | 'tech' | 'client';
const PORTAL_ORDER: PortalKey[] = ['admin', 'sales', 'tech', 'client'];
const PORTAL_META: Record<PortalKey, { label: string; dot: string }> = {
  admin: { label: 'Admin portal', dot: 'bg-brand-red' },
  sales: { label: 'Sales portal', dot: 'bg-accent-gold' },
  tech: { label: 'Tech portal', dot: 'bg-brand-blue' },
  client: { label: 'Client portal', dot: 'bg-text-green' },
};
// The Sales Portal has no permission group of its own — its subrole is built
// from the admin.crm.* actions (see SUBROLE_DEFINITIONS.sales).
const PORTAL_PERMISSION_SECTIONS: Record<PortalKey, Record<string, Permission[]>> = {
  admin: PERMISSION_TREE.admin as Record<string, Permission[]>,
  sales: { crm: PERMISSION_TREE.admin.crm as Permission[] },
  tech: PERMISSION_TREE.tech as Record<string, Permission[]>,
  client: PERMISSION_TREE.client as Record<string, Permission[]>,
};

// Documents uploaded by the old directory pop-up before documents moved to
// users/{id}/documents. Shown read-only beside the canonical ones.
type DirectoryDocument = PersonnelDocument & { _legacy?: boolean };

/** QuickBooks readiness checklist for a vendor (tech) or customer (client). */
function ReadinessPanel({ title, readiness, link }: { title: string; readiness: Readiness; link?: QboLink }) {
  const done = readiness.checks.filter(c => c.ok).length;
  return (
    <div className="p-5 rounded-xl border border-border-sub bg-bg-secondary space-y-3">
      <div className="flex items-center justify-between border-b border-border-sub pb-2">
        <h3 className="text-[13px] font-semibold text-text-primary flex items-center gap-2">
          <Link2 size={11} className="text-brand-red" /> {title}
        </h3>
        {readiness.applies && (
          <Badge variant={readiness.ready ? 'approved' : 'inprogress'} className="text-[10px] font-semibold uppercase tracking-wide">
            {readiness.ready ? 'Ready' : `${done}/${readiness.checks.length}`}
          </Badge>
        )}
      </div>
      {!readiness.applies ? (
        <p className="text-[12px] text-text-muted">{readiness.note}</p>
      ) : (
        <ul className="space-y-1.5">
          {readiness.checks.map(c => (
            <li key={c.key} className="flex items-start gap-2">
              {c.ok
                ? <CheckCircle size={12} className="text-text-green mt-0.5 shrink-0" />
                : <XCircle size={12} className="text-text-red mt-0.5 shrink-0" />}
              <div className="min-w-0">
                <p className={cn('text-[12px]', c.ok ? 'text-text-secondary' : 'text-text-primary font-semibold')}>{c.label}</p>
                {!c.ok && c.hint && <p className="text-[11px] text-text-muted">{c.hint}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="pt-2 border-t border-border-sub flex items-center justify-between text-[12px]">
        <span className="text-text-muted font-medium">QuickBooks link</span>
        {link?.id ? (
          <span className={cn('font-mono', link.error ? 'text-text-red' : 'text-text-green')}>
            #{link.id}{link.error ? ` · ${link.error}` : link.syncedAt ? ` · synced ${format(parseISO(link.syncedAt), 'MM/dd/yy')}` : ''}
          </span>
        ) : (
          <span className="text-text-muted">Not linked yet</span>
        )}
      </div>
    </div>
  );
}

function permissionLabel(perm: string): string {
  const parts = perm.split('.');
  if (parts.length === 3) {
    const [, page, action] = parts;
    return statusLabel(`${page}: ${action}`).replace(/\bcrm\b/gi, "CRM").replace(/\bqbo\b/gi, "QuickBooks");
  }
  return statusLabel(perm);
}

export default function DirectoryPersonPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [person, setPerson] = useState<Technician | null>(null);
  const [assignments, setAssignments] = useState<WorkOrder[]>([]);
  const [canonicalDocs, setCanonicalDocs] = useState<DirectoryDocument[]>([]);
  const [legacyDocs, setLegacyDocs] = useState<DirectoryDocument[]>([]);
  const documents = useMemo(() => [...canonicalDocs, ...legacyDocs], [canonicalDocs, legacyDocs]);
  const { toast } = useToast();
  const { user: me } = useAuth();
  const canEditAccess = canEditUserAccess(me);
  const [projects, setProjects] = useState<Project[]>([]);
  const [penaltyEvents, setPenaltyEvents] = useState<ReliabilityEvent[]>([]);
  const [techNotes, setTechNotes] = useState<{ id: string; text: string; createdAt: string; authorName?: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({ name: '', type: 'other', expiryDate: '', url: '' });
  const [uploadSaving, setUploadSaving] = useState(false);
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('url');
  const [uploadFileObj, setUploadFileObj] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [permOverrides, setPermOverrides] = useState<Record<string, boolean>>({});
  const [savingPerms, setSavingPerms] = useState(false);
  const [permsDirty, setPermsDirty] = useState(false);

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [allClients, setAllClients] = useState<Technician[]>([]);

  useEffect(() => {
    if (!id) return;

    const unsubUser = onSnapshot(doc(db, 'users', id), snap => {
      if (snap.exists()) {
        const data = { ...snap.data(), id: snap.id } as Technician;
        setPerson(data);
        setPermOverrides(data.permissionOverrides || {});
        setPermsDirty(false);
      }
      setLoading(false);
    });

    const unsubDocs = onSnapshot(collection(db, 'users', id, 'documents'), snap => {
      setCanonicalDocs(snap.docs.map(d => ({ ...d.data(), id: d.id } as DirectoryDocument)));
    });
    const unsubLegacyDocs = onSnapshot(query(collection(db, 'personnelDocuments'), where('personnelId', '==', id)), snap => {
      setLegacyDocs(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id, name: data.name || 'Document', type: data.type === 'w9' ? 'w9' : 'other', url: data.url || '',
          uploadedAt: data.uploadedAt || '', approvalStatus: data.approvalStatus || 'approved', _legacy: true,
        } as DirectoryDocument;
      }));
    }, () => setLegacyDocs([]));
    // Only this person's events (was a listener on the whole collection).
    const unsubPenalty = onSnapshot(query(collection(db, 'penaltyEvents'), where('techId', '==', id)), snap => {
      const mine = snap.docs.map(d => ({ ...d.data(), id: d.id } as ReliabilityEvent));
      setPenaltyEvents(mine.sort((a, b) => b.createdAt?.localeCompare(a.createdAt || '') || 0));
    });
    const unsubNotes = onSnapshot(collection(db, 'users', id, 'techNotes'), snap => {
      setTechNotes(
        snap.docs.map(d => ({ ...d.data(), id: d.id } as { id: string; text: string; createdAt: string }))
          .sort((a, b) => b.createdAt?.localeCompare(a.createdAt || '') || 0)
      );
    });
    // This person's jobs and projects — these were declared but never loaded,
    // so every tech showed 0 active / 0 completed jobs and 0 projects.
    // Jobs: the person is the job's assigned tech (jobTechId — what every
    // admin screen shows); both owner fields are queried because a doc left
    // out of sync by an old swap may only carry one of them.
    let byTechId: WorkOrder[] = [];
    let byAssigned: WorkOrder[] = [];
    let byHelper: WorkOrder[] = [];
    const publishJobs = () => {
      const merged = new Map<string, WorkOrder>();
      [...byTechId, ...byAssigned, ...byHelper].forEach(j => merged.set(j.id, j));
      // Lead tech, or a helper on the job — helpers' jobs belong in their history too.
      setAssignments([...merged.values()].filter(j =>
        (isAssignedTo(j, id) || (j.additionalTechnicianIds || []).includes(id)) && !isArchivedJob(j)));
    };
    const unsubJobsA = onSnapshot(query(collection(db, 'assignments'), where('techId', '==', id)), snap => {
      byTechId = snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder));
      publishJobs();
    });
    const unsubJobsB = onSnapshot(query(collection(db, 'assignments'), where('assignedTechnicianId', '==', id)), snap => {
      byAssigned = snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder));
      publishJobs();
    });
    const unsubJobsC = onSnapshot(query(collection(db, 'assignments'), where('additionalTechnicianIds', 'array-contains', id)), snap => {
      byHelper = snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder));
      publishJobs();
    }, () => { byHelper = []; publishJobs(); });
    const unsubProjects = onSnapshot(query(collection(db, 'projects'), where('assignedTechnicianIds', 'array-contains', id)), snap => {
      setProjects(snap.docs.map(d => ({ ...d.data(), id: d.id } as Project)));
    }, () => setProjects([]));
    return () => { unsubUser(); unsubDocs(); unsubLegacyDocs(); unsubPenalty(); unsubNotes(); unsubJobsA(); unsubJobsB(); unsubJobsC(); unsubProjects(); };
  }, [id]);

  useEffect(() => {
    const unsubClients = onSnapshot(
      query(collection(db, 'users'), where('roles', 'array-contains', 'client')),
      snap => setAllClients(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)))
    );
    return unsubClients;
  }, []);

  const activeJobs = useMemo(() => assignments.filter(wo => wo.status !== 'completed' && wo.status !== 'cancelled'), [assignments]);
  const completedJobs = useMemo(() => assignments.filter(wo => wo.status === 'completed'), [assignments]);

  const isTech = useMemo(() => (person ? isTechRole(person) : false), [person]);

  const isClient = useMemo(() => (person ? isClientRole(person) : false), [person]);

  const certDocuments = useMemo(() => documents.filter(d => d.type === 'certification'), [documents]);
  const roles: string[] = useMemo(() => getSubroles(person), [person]);
  const activePortals = useMemo(() => getPortalAccess(person), [person]);
  const userPortals = useMemo(() => PORTAL_ORDER.filter(p => activePortals[p]), [activePortals]);
  const [pickedPortal, setSelectedPortal] = useState<PortalKey | null>(null);
  const selectedPortal: PortalKey | null = pickedPortal && userPortals.includes(pickedPortal) ? pickedPortal : (userPortals[0] ?? null);
  const { subscriptions: clientSubs } = useClientSubscriptions(person && isClientRole(person) ? person.id : null);
  const { plans: allPlans } = useServicePlans();
  const clientSub = clientSubs.find(isLiveSubscription) || clientSubs.find(s => s.status === 'pending') || null;
  const clientPlan = allPlans.find(p => p.id === clientSub?.planId);
  const vendorStatus = useMemo(() => (person ? vendorReadiness(person, documents) : null), [person, documents]);
  const customerStatus = useMemo(() => (person ? customerReadiness(person) : null), [person]);
  const adminName = () => auth.currentUser?.displayName || 'Admin';
  const adminId = () => auth.currentUser?.uid || '';

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try { return format(parseISO(dateStr), 'MM/dd/yyyy'); } catch { return dateStr; }
  };

  const handleUploadDoc = async () => {
    if (!uploadForm.name || !id) return;
    setUploadSaving(true);
    try {
      let resolvedUrl = uploadForm.url.trim();
      if (uploadMode === 'file' && uploadFileObj) {
        const safeName = uploadFileObj.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        // Store under personnelDocuments/{userId} so it uses the deployed storage
        // rule (admin + owning tech); the Firestore record still lives in the
        // canonical users/{id}/documents subcollection below.
        const result = await uploadFile(`personnelDocuments/${id}/${Date.now()}_${safeName}`, uploadFileObj, { contentType: uploadFileObj.type });
        resolvedUrl = result.url;
      }
      await addDoc(collection(db, 'users', id, 'documents'), {
        name: uploadForm.name,
        type: uploadForm.type,
        url: resolvedUrl,
        uploadedAt: new Date().toISOString(),
        expiryDate: uploadForm.expiryDate || null,
        approvalStatus: 'pending',
      });
      setUploadOpen(false);
      setUploadForm({ name: '', type: 'other', expiryDate: '', url: '' });
      setUploadFileObj(null);
      setUploadMode('url');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Upload failed', description: e.message });
    } finally {
      setUploadSaving(false);
    }
  };

  const handleReviewDoc = async (d: DirectoryDocument, approvalStatus: 'approved' | 'rejected') => {
    if (!id || d._legacy) return;
    try {
      await updateDoc(doc(db, 'users', id, 'documents', d.id), {
        approvalStatus, approvedBy: adminId(), reviewedAt: new Date().toISOString(),
      });
      await auditEvent('users', id, adminId(), adminName(), `document_${approvalStatus}`, `${DOC_TYPE_LABELS[d.type] || d.type} "${d.name}" ${approvalStatus} by ${adminName()}`);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Update failed', description: e.message });
    }
  };

  const handleDeleteDoc = async (d: DirectoryDocument) => {
    if (!id || !window.confirm(`Delete "${d.name}"? This can't be undone.`)) return;
    try {
      await deleteDoc(d._legacy ? doc(db, 'personnelDocuments', d.id) : doc(db, 'users', id, 'documents', d.id));
      await auditEvent('users', id, adminId(), adminName(), 'document_deleted', `${DOC_TYPE_LABELS[d.type] || d.type} "${d.name}" deleted by ${adminName()}`);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Delete failed', description: e.message });
    }
  };

  // A user's permission = their override if one is set, else their subroles'
  // preset. Overrides are only kept where they differ from the preset, so
  // "on" for something the role already grants stores nothing.
  const roleDefaultPerm = (perm: Permission) => hasPermission({ ...person, permissionOverrides: undefined }, perm);
  const effectivePerm = (perm: Permission) => permOverrides[perm] ?? roleDefaultPerm(perm);

  const setAllPerms = (perms: Permission[], value: boolean) => {
    setPermOverrides(prev => {
      const next = { ...prev };
      perms.forEach(p => { if (roleDefaultPerm(p) === value) delete next[p]; else next[p] = value; });
      return next;
    });
    setPermsDirty(true);
  };
  const setPerm = (perm: Permission, value: boolean) => setAllPerms([perm], value);

  // Subroles (and so portal access) are edited in Edit Profile only. This tab
  // saves individual overrides.
  const handleSavePerms = async () => {
    if (!id || !person) return;
    setSavingPerms(true);
    try {
      await auditFieldChange('users', id, adminId(), adminName(),
        { permissionOverrides: person.permissionOverrides || {} }, { permissionOverrides: permOverrides });
      await updateDoc(doc(db, 'users', id), { permissionOverrides: permOverrides });
      setPermsDirty(false);
      toast({ title: 'Permissions saved' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e.message });
    } finally {
      setSavingPerms(false);
    }
  };

  const handleMessagingRoleChange = async (value: string) => {
    if (!id) return;
    await updateDoc(doc(db, 'users', id), { messagingAllowedRoles: value });
  };

  const resetPerms = (perms: Permission[]) => {
    setPermOverrides(prev => {
      const next = { ...prev };
      perms.forEach(p => { delete next[p]; });
      return next;
    });
    setPermsDirty(true);
  };

  const handleToggleClientRestriction = async (clientId: string, blocked: boolean) => {
    if (!id) return;
    await updateDoc(doc(db, 'users', id), {
      messagingBlockedClientIds: blocked ? arrayUnion(clientId) : arrayRemove(clientId),
    });
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !id) return;
    setAddingNote(true);
    try {
      await addDoc(collection(db, 'users', id, 'techNotes'), {
        text: noteText.trim(),
        authorName: auth.currentUser?.displayName || 'Admin',
        createdBy: auth.currentUser?.uid || '',
        createdAt: new Date().toISOString(),
      });
      setNoteText('');
    } finally {
      setAddingNote(false);
    }
  };

  if (loading) {
    return <PageLoading label="Loading profile…" />;
  }

  if (!person) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Person not found"
        description="This profile may have been removed."
        action={<Button variant="outline" size="sm" onClick={() => router.push('/admin/directory')}><ArrowLeft size={14} className="mr-2" /> Back to directory</Button>}
      />
    );
  }

  const tabTriggerClass = "tab-underline";

  const techTabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'contact', label: 'Contact' },
    { value: 'skills', label: 'Skills', badge: (person.skills?.length || 0) + certDocuments.length || undefined },
    { value: 'availability', label: 'Availability' },
    { value: 'pay', label: 'Pay & Tax' },
    { value: 'documents', label: 'Documents', badge: documents.length || undefined },
    { value: 'permissions', label: 'Permissions' },
    { value: 'notes', label: 'Notes', badge: techNotes.length || undefined },
    { value: 'reliability', label: 'Reliability' },
  ];

  const staffTabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'contact', label: 'Contact' },
    { value: 'permissions', label: 'Permissions' },
    { value: 'documents', label: 'Documents', badge: documents.length || undefined },
    { value: 'notes', label: 'Notes', badge: techNotes.length || undefined },
  ];

  const clientTabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'contact', label: 'Contact' },
    { value: 'business', label: 'Billing & Accounting' },
    { value: 'documents', label: 'Documents', badge: documents.length || undefined },
    { value: 'permissions', label: 'Permissions' },
    { value: 'notes', label: 'Notes', badge: techNotes.length || undefined },
  ];

  const activeTabs = isClient ? clientTabs : (isTech ? techTabs : staffTabs);

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        back={{ href: '/admin/directory', label: 'Directory' }}
        eyebrow={isClient ? 'Client' : isTech ? 'Technician' : 'Staff'}
        title={person.name || 'Unnamed'}
        subtitle={roles.length ? roles.map(r => statusLabel(r)).join(' · ') : undefined}
        actions={<>
          {isClient && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push(`/admin/clients/${id}`)}
              className="h-9 border-border-main"
            >
              <Briefcase size={14} className="mr-1.5" /> Client page
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => setIsEditOpen(true)}
            className="h-9 bg-brand-red hover:bg-brand-red/90 text-white"
          >
            <Pencil size={14} className="mr-1.5" /> Edit profile
          </Button>
        </>}
      />

      {/* Profile hero */}
      <div className="flex flex-col md:flex-row gap-6 p-6 rounded-xl border border-border-main bg-bg-secondary shadow-sm">
        <div className="flex flex-col items-center gap-3 md:w-48 shrink-0">
          <Avatar className="h-20 w-20 border-2 border-brand-red">
            <AvatarImage src={person.avatarUrl} />
            <AvatarFallback className="text-lg font-bold">{(person.name || 'U')[0]}</AvatarFallback>
          </Avatar>
        </div>
        <div className="flex-1 space-y-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Roles</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {roles.map(r => <Badge key={r} variant="scheduled" className="text-[10px] h-5 px-2 font-semibold uppercase tracking-wide">{statusLabel(r)}</Badge>)}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {person.email && (
              <a href={`mailto:${person.email}`} className="flex items-center gap-2 text-[12px] text-text-secondary hover:text-brand-red transition-colors">
                <Mail size={12} className="text-text-muted shrink-0" />{person.email}
              </a>
            )}
            {person.phone && (
              <a href={`tel:${person.phone}`} className="flex items-center gap-2 text-[12px] text-text-secondary hover:text-brand-red transition-colors">
                <Phone size={12} className="text-text-muted shrink-0" />{person.phone}
              </a>
            )}
            {person.currentLocation && (
              <span className="flex items-center gap-2 text-[12px] text-text-secondary">
                <MapPin size={12} className="text-text-muted shrink-0" />{person.currentLocation}
              </span>
            )}
            {person.clientCompany && (
              <span className="flex items-center gap-2 text-[12px] text-text-secondary">
                <Briefcase size={12} className="text-text-muted shrink-0" />{person.clientCompany}
              </span>
            )}
          </div>
        </div>
        <div className="md:w-48 shrink-0 grid grid-cols-2 md:grid-cols-1 gap-3">
          {isClient ? [
            { label: 'Service plan', value: clientPlan?.name || (clientSub ? 'Plan' : 'None'), color: clientSub?.status === 'active' ? 'text-text-green' : 'text-text-muted' },
            { label: 'Account', value: person.accountStatus ? accountStatusLabel(person.accountStatus) : 'Unknown', color: 'text-text-primary' },
          ].map(stat => (
            <div key={stat.label} className="p-2.5 rounded-lg bg-bg-primary border border-border-sub">
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{stat.label}</p>
              <p className={cn('text-[13px] font-semibold mt-0.5', stat.color)}>{stat.value}</p>
            </div>
          )) : isTech ? [
            { label: 'Active jobs', value: activeJobs.length, color: 'text-text-amber' },
            { label: 'Completed', value: completedJobs.length, color: 'text-text-green' },
          ].map(stat => (
            <div key={stat.label} className="p-2.5 rounded-lg bg-bg-primary border border-border-sub">
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{stat.label}</p>
              <p className={cn('text-lg font-bold font-mono mt-0.5', stat.color)}>{stat.value}</p>
            </div>
          )) : null}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <div className="overflow-x-auto">
          <TabsList className="grid grid-cols-3 sm:flex border-b border-border-sub bg-transparent rounded-none h-auto p-0 gap-x-3 gap-y-1 sm:gap-6 justify-start mb-1 w-full sm:min-w-max">
            {activeTabs.map(t => (
              <TabsTrigger key={t.value} value={t.value} className={tabTriggerClass}>
                {t.label}
                {t.badge !== undefined && t.badge > 0 && (
                  <span className="text-[10px] font-bold bg-bg-tertiary text-text-muted border border-border-sub px-1.5 py-0.5 rounded">{t.badge}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ── OVERVIEW ── */}
        <TabsContent value="overview" className="m-0 pt-5">
          {isClient ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="p-5 rounded-xl border border-border-sub bg-bg-secondary space-y-4">
                <h3 className="text-[13px] font-semibold text-text-primary border-b border-border-sub pb-2 flex items-center gap-2">
                  <Briefcase size={11} className="text-brand-red" /> Company info
                </h3>
                <div className="space-y-3">
                  {person.clientCompany && (
                    <div>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Company</p>
                      <p className="text-[13px] font-bold text-text-primary">{person.clientCompany}</p>
                    </div>
                  )}
                  {person.businessType && (
                    <div>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Business Type</p>
                      <p className="text-[12px] text-text-secondary">{person.businessType}</p>
                    </div>
                  )}
                  {person.accountStatus && (
                    <div>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Account Status</p>
                      <AccountStatusBadge status={person.accountStatus} className="mt-0.5" />
                    </div>
                  )}
                </div>
              </div>
              <div className="p-5 rounded-xl border border-border-sub bg-bg-secondary space-y-3">
                <h3 className="text-[13px] font-semibold text-text-primary border-b border-border-sub pb-2 flex items-center gap-2">
                  <BarChart2 size={11} /> Subscription
                </h3>
                {/* From the client's subscription record (Service Plans). */}
                {clientSub ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-text-muted font-bold">Plan</span>
                      <span className="text-[12px] font-bold text-text-primary">{clientPlan?.name || clientSub.planId}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-text-muted font-bold">Status</span>
                      <Badge variant={clientSub.status === 'active' ? 'active' : 'outline'} className="text-[11px]">
                        {SUBSCRIPTION_STATUS_LABELS[clientSub.status]}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-text-muted font-bold">Billing</span>
                      <span className="text-[12px] text-text-primary font-mono">{formatMoney(subscriptionAmount(clientSub, clientPlan))} · {INTERVAL_LABELS[clientSub.interval]}</span>
                    </div>
                    {clientSub.startDate && (
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-text-muted font-bold">Since</span>
                        <span className="text-[12px] text-text-primary font-mono">{formatDate(clientSub.startDate)}</span>
                      </div>
                    )}
                    {clientSub.nextBillingDate && (
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-text-muted font-bold">Next Bill</span>
                        <span className="text-[12px] text-text-primary font-mono">{formatDate(clientSub.nextBillingDate)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-text-muted">Not on a service plan.</p>
                )}
                <a href="/admin/plans" className="text-[10px] font-bold text-brand-red hover:underline">Manage on Service Plans →</a>
              </div>
              {(person as any).managedSites && (person as any).managedSites.length > 0 && (
                <div className="lg:col-span-2 p-5 rounded-xl border border-border-sub bg-bg-secondary space-y-3">
                  <h3 className="text-[13px] font-semibold text-text-primary border-b border-border-sub pb-2 flex items-center gap-2">
                    <MapPin size={11} /> Managed sites ({(person as any).managedSites.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(person as any).managedSites.map((site: any) => (
                      <div key={site.id} className="p-3 rounded-lg border border-border-sub bg-bg-primary">
                        <p className="text-[12px] font-bold text-text-primary">{site.name}</p>
                        {site.location && <p className="text-[10px] text-text-muted flex items-center gap-1 mt-0.5"><MapPin size={9} />{site.location}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="p-4 rounded-xl border border-border-sub bg-bg-secondary space-y-2">
              <h3 className="text-[13px] font-semibold text-text-primary flex items-center gap-2">
                <Activity size={11} /> Recent assignments
              </h3>
              {activeJobs.length === 0 ? (
                <p className="text-[12px] text-text-muted py-3 text-center">No active assignments</p>
              ) : activeJobs.slice(0, 3).map(wo => (
                <div key={wo.id} className="flex items-center justify-between p-2 rounded-lg border border-border-sub bg-bg-primary">
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-text-primary truncate">{wo.title || wo.description || wo.id}</p>
                    <p className="text-[11px] text-text-muted">{wo.clientName}</p>
                  </div>
                  <StatusBadge kind="job" value={wo.status} className="ml-2" />
                </div>
              ))}
            </div>
            <div className="p-4 rounded-xl border border-border-sub bg-bg-secondary space-y-2">
              <h3 className="text-[13px] font-semibold text-text-primary flex items-center gap-2">
                <CheckCircle size={11} className="text-text-green" /> Completion stats
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-3 rounded-lg bg-bg-primary border border-border-sub">
                  <p className="text-2xl font-bold tabular-nums text-text-green">{completedJobs.length}</p>
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Completed</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-bg-primary border border-border-sub">
                  <p className="text-2xl font-bold tabular-nums text-text-amber">{activeJobs.length}</p>
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Active</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-bg-primary border border-border-sub">
                  <p className="text-2xl font-bold tabular-nums text-text-primary">{projects.length}</p>
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Projects</p>
                </div>
              </div>
            </div>
            {person.workPreferences && (
              <div className="p-4 rounded-xl border border-border-sub bg-bg-secondary space-y-2">
                <h3 className="text-[13px] font-semibold text-text-primary flex items-center gap-2">
                  <Wrench size={11} /> Work preferences
                </h3>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-text-muted font-bold">Preferred Radius</span>
                    <span className="text-text-primary font-mono">{person.workPreferences.preferredRadius} mi</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-text-muted font-bold">Max Distance</span>
                    <span className="text-text-primary font-mono">{person.workPreferences.maxTravelDistance} mi</span>
                  </div>
                  {person.workPreferences.preferredJobTypes?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {person.workPreferences.preferredJobTypes.map(jt => (
                        <Badge key={jt} variant="scheduled" className="text-[10px] h-4 px-1.5">{jt}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          )}
        </TabsContent>

        {/* ── CLIENT BUSINESS PROFILE ── */}
        {isClient && (
          <TabsContent value="business" className="m-0 pt-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="p-5 rounded-xl border border-border-sub bg-bg-secondary space-y-4">
                <h3 className="text-[13px] font-semibold text-text-primary border-b border-border-sub pb-2 flex items-center gap-2">
                  <Briefcase size={11} className="text-brand-red" /> Business profile
                </h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Company Name</p>
                    <p className="text-[12px] font-bold text-text-primary">{person.clientCompany || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Business Type</p>
                    <p className="text-[12px] text-text-secondary">{person.businessType || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Account Status</p>
                    <p className="text-[12px] text-text-secondary">{person.accountStatus ? accountStatusLabel(person.accountStatus) : '—'}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditOpen(true)}
                  className="w-full h-8 mt-2"
                >
                  <Pencil size={11} className="mr-1.5" /> Edit Billing &amp; Accounting
                </Button>
              </div>
              {customerStatus && (
                <ReadinessPanel title="QuickBooks Customer" readiness={customerStatus} link={person.accounting?.qboCustomer} />
              )}
              <div className="p-5 rounded-xl border border-border-sub bg-bg-secondary space-y-3">
                <h3 className="text-[13px] font-semibold text-text-primary border-b border-border-sub pb-2 flex items-center gap-2">
                  <Landmark size={11} /> Accounting
                </h3>
                <div className="space-y-2.5">
                  <div>
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Customer Name in QuickBooks</p>
                    <p className="text-[12px] text-text-primary">{customerDisplayName(person) || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Billing Address</p>
                    <p className="text-[12px] text-text-primary">{person.accounting?.billingAddress || person.address || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Sales Tax</p>
                    <p className="text-[12px] text-text-primary">
                      {person.accounting?.taxExempt === true ? `Exempt — ${person.accounting.taxExemptReason || 'no reason given'}`
                        : person.accounting?.taxExempt === false ? 'Taxable' : 'Not set'}
                    </p>
                  </div>
                </div>
              </div>
              {person.billingDetails && (
                <div className="p-5 rounded-xl border border-border-sub bg-bg-secondary space-y-3">
                  <h3 className="text-[13px] font-semibold text-text-primary border-b border-border-sub pb-2 flex items-center gap-2">
                    <FileText size={11} /> Billing details
                  </h3>
                  <div className="space-y-2.5">
                    <div>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Billing Contact</p>
                      <p className="text-[12px] text-text-primary">{person.billingDetails.contactName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Billing Email</p>
                      <p className="text-[12px] text-text-primary">{person.billingDetails.email || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Payment Terms</p>
                      <p className="text-[12px] text-text-primary">{person.billingDetails.terms || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Invoice Delivery</p>
                      <p className="text-[12px] text-text-primary">{person.billingDetails.deliveryMethod || '—'}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        )}

        {/* ── CONTACT ── */}
        <TabsContent value="contact" className="m-0 pt-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="p-5 rounded-xl border border-border-sub bg-bg-secondary space-y-4">
              <h3 className="text-[13px] font-semibold text-text-primary border-b border-border-sub pb-2 flex items-center gap-2">
                <Mail size={11} /> Contact information
              </h3>
              <div className="space-y-3">
                {person.email && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-bg-primary border border-border-sub">
                      <Mail size={13} className="text-text-muted" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Email</p>
                      <a href={`mailto:${person.email}`} className="text-[12px] text-text-primary hover:text-brand-red">{person.email}</a>
                    </div>
                  </div>
                )}
                {person.phone && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-bg-primary border border-border-sub">
                      <Phone size={13} className="text-text-muted" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Phone</p>
                      <a href={`tel:${person.phone}`} className="text-[12px] text-text-primary hover:text-brand-red">{person.phone}</a>
                    </div>
                  </div>
                )}
                {(person.address || person.currentLocation) && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-bg-primary border border-border-sub">
                      <MapPin size={13} className="text-text-muted" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Address</p>
                      <p className="text-[12px] text-text-primary">{person.address || person.currentLocation}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-5 rounded-xl border border-border-sub bg-bg-secondary space-y-4">
              <h3 className="text-[13px] font-semibold text-text-primary border-b border-border-sub pb-2 flex items-center gap-2">
                <PhoneCall size={11} className="text-brand-red" /> Emergency contact
              </h3>
              {person.emergencyContact ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-bg-primary border border-border-sub">
                      <UserCheck size={13} className="text-text-muted" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Name</p>
                      <p className="text-[12px] text-text-primary">{person.emergencyContact.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-bg-primary border border-border-sub">
                      <Users size={13} className="text-text-muted" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Relation</p>
                      <p className="text-[12px] text-text-primary">{person.emergencyContact.relation}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-bg-primary border border-border-sub">
                      <Phone size={13} className="text-text-muted" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Phone</p>
                      <a href={`tel:${person.emergencyContact.phone}`} className="text-[12px] text-text-primary hover:text-brand-red">{person.emergencyContact.phone}</a>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-text-muted py-4 text-center">No emergency contact on file</p>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── SKILLS & CERTS (tech) ── */}
        {isTech && (
          <TabsContent value="skills" className="m-0 pt-5">
            <div className="space-y-5">
              <div className="p-5 rounded-xl border border-border-sub bg-bg-secondary">
                <h3 className="text-[13px] font-semibold text-text-primary border-b border-border-sub pb-2 mb-3 flex items-center gap-2">
                  <Wrench size={11} /> Skills ({person.skills?.length || 0})
                </h3>
                {person.skills && person.skills.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {person.skills.map(skill => (
                      <Badge key={skill} variant="scheduled" className="text-[11px] px-2.5 py-1 h-auto">{skill}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-text-muted py-3 text-center">No skills listed</p>
                )}
              </div>
              <div className="p-5 rounded-xl border border-border-sub bg-bg-secondary">
                <h3 className="text-[13px] font-semibold text-text-primary border-b border-border-sub pb-2 mb-3 flex items-center gap-2">
                  <CheckCircle size={11} className="text-text-green" /> Certifications ({certDocuments.length})
                </h3>
                {certDocuments.length > 0 ? (
                  <div className="space-y-2">
                    {certDocuments.map(d => {
                      const daysToExpiry = d.expiryDate ? differenceInDays(new Date(d.expiryDate), new Date()) : null;
                      const expiringSoon = daysToExpiry !== null && daysToExpiry <= 30 && daysToExpiry >= 0;
                      const expired = daysToExpiry !== null && daysToExpiry < 0;
                      return (
                        <div key={d.id} className={cn('flex items-center justify-between p-3 rounded-lg border', expiringSoon && 'border-accent-gold/30 bg-accent-gold/5', expired && 'border-text-red/30 bg-text-red/5', !expiringSoon && !expired && 'border-border-sub bg-bg-primary')}>
                          <div>
                            <p className="text-[12px] font-bold text-text-primary">{d.name}</p>
                            <p className="text-[11px] text-text-muted">Expires: {d.expiryDate ? formatDate(d.expiryDate) : 'No expiry'}</p>
                          </div>
                          <StatusBadge kind="request" value={d.approvalStatus} />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[12px] text-text-muted py-3 text-center">No certifications on file</p>
                )}
              </div>
            </div>
          </TabsContent>
        )}

        {/* ── AVAILABILITY (tech) ── */}
        {isTech && (
          <TabsContent value="availability" className="m-0 pt-5">
            {!Object.values(person.availability || {}).some(Boolean) && (
              <p className="text-[10px] text-text-muted mb-3">No weekly availability has been set for this tech, so every day shows as off.</p>
            )}
            <div className="rounded-xl border border-border-sub overflow-hidden">
              <div className="p-3 bg-bg-tertiary border-b border-border-sub">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                  <Calendar size={11} /> Weekly Availability Schedule
                </p>
              </div>
              <div className="divide-y divide-border-sub">
                {DAYS.map(day => {
                  const slot = person.availability?.[day.toLowerCase()] ?? person.availability?.[day];
                  const isOff = !slot;
                  return (
                    <div key={day} className={cn('flex items-center justify-between px-4 py-3', isOff && 'bg-bg-tertiary/30')}>
                      <div className="flex items-center gap-3">
                        <div className={cn('w-2 h-2 rounded-full', isOff ? 'bg-text-muted/30' : 'bg-text-green')} />
                        <p className="text-[12px] font-bold text-text-primary w-24">{day}</p>
                      </div>
                      {isOff ? (
                        <Badge variant="onhold" className="text-[10px]">Day Off</Badge>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge variant="scheduled" className="text-[11px] font-mono px-2">{slot.start}</Badge>
                          <span className="text-text-muted text-[10px]">→</span>
                          <Badge variant="scheduled" className="text-[11px] font-mono px-2">{slot.end}</Badge>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>
        )}

        {/* ── PAY & TAX (tech → QuickBooks Vendor) ── */}
        {isTech && (
          <TabsContent value="pay" className="m-0 pt-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="p-5 rounded-xl border border-border-sub bg-bg-secondary space-y-3">
                <h3 className="text-[13px] font-semibold text-text-primary border-b border-border-sub pb-2 flex items-center gap-2">
                  <Landmark size={11} className="text-brand-red" /> Pay &amp; tax profile
                </h3>
                {[
                  { label: 'Worker Classification', value: person.accounting?.workerType ? WORKER_TYPE_LABELS[person.accounting.workerType] : 'Not set' },
                  { label: 'Payout Method', value: person.payoutPreferences?.method
                    ? `${person.payoutPreferences.method}${person.payoutPreferences.notes ? ` — ${person.payoutPreferences.notes}` : ''}` : 'Not on file' },
                  { label: 'Project Hourly Rate', value: person.hourlyRate ? `$${person.hourlyRate.toFixed(2)} / hr` : 'Not set' },
                  { label: 'Legal Name (W-9)', value: person.accounting?.payeeLegalName || '—' },
                  { label: 'Business Name', value: person.accounting?.payeeBusinessName || '—' },
                  { label: 'Tax ID', value: person.accounting?.taxIdLast4
                    ? `${person.accounting.taxIdType || 'ID'} ending ${person.accounting.taxIdLast4}` : '—' },
                  { label: '1099 Mailing Address', value: person.address || '—' },
                  { label: 'W-9', value: hasW9OnFile(documents) ? 'Approved, on file' : documents.some(d => d.type === 'w9') ? 'Uploaded — needs approval' : 'Missing' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between gap-4 text-[11px]">
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider pt-0.5">{row.label}</span>
                    <span className="text-text-primary text-right">{row.value}</span>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setIsEditOpen(true)} className="w-full h-8 mt-2">
                  <Pencil size={11} className="mr-1.5" /> Edit Pay &amp; Tax
                </Button>
              </div>
              {vendorStatus && (
                <ReadinessPanel title="QuickBooks Vendor (1099)" readiness={vendorStatus} link={person.accounting?.qboVendor} />
              )}
            </div>
          </TabsContent>
        )}

        {/* ── DOCUMENTS ── */}
        <TabsContent value="documents" className="m-0 pt-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
              <FileText size={11} /> {documents.length} Document{documents.length !== 1 ? 's' : ''}
            </p>
            <Button size="sm" className="h-8 bg-brand-red hover:bg-brand-red/90 text-white" onClick={() => setUploadOpen(true)}>
              <Upload size={11} className="mr-1.5" /> Upload Document
            </Button>
          </div>
          <div className="rounded-xl border border-border-sub overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border-sub">
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Document</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Type</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Uploaded</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Expiry</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Status</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted w-36">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map(d => {
                  const daysToExpiry = d.expiryDate ? differenceInDays(new Date(d.expiryDate), new Date()) : null;
                  const expiringSoon = daysToExpiry !== null && daysToExpiry <= 30 && daysToExpiry >= 0;
                  const expired = daysToExpiry !== null && daysToExpiry < 0;
                  return (
                    <TableRow key={d.id} className={cn('border-border-sub', expiringSoon && 'bg-accent-gold/5', expired && 'bg-text-red/5')}>
                      <TableCell className="font-bold text-[12px] text-text-primary">
                        {d.url ? (
                          <a href={d.url} target="_blank" rel="noopener noreferrer" className="hover:text-brand-red inline-flex items-center gap-1">
                            {d.name} <ExternalLink size={10} className="text-text-muted" />
                          </a>
                        ) : d.name}
                        {d._legacy && <span className="ml-1.5 text-[10px] text-text-muted">(older upload)</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="scheduled" className="h-5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">
                          {DOC_TYPE_LABELS[d.type] || d.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[12px] text-text-muted">
                        {d.uploadedAt ? format(new Date(d.uploadedAt), 'MM/dd/yyyy') : '—'}
                      </TableCell>
                      <TableCell className={cn('text-[12px]', expiringSoon ? 'text-accent-gold font-bold' : expired ? 'text-text-red font-bold' : 'text-text-muted')}>
                        {d.expiryDate ? format(new Date(d.expiryDate), 'MM/dd/yyyy') : '—'}
                        {expiringSoon && <span className="ml-1 text-[10px]">({daysToExpiry}d)</span>}
                        {expired && <span className="ml-1 text-[10px]">Expired</span>}
                      </TableCell>
                      <TableCell>
                        <StatusBadge kind="request" value={d.approvalStatus} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {!d._legacy && d.approvalStatus !== 'approved' && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-text-green hover:bg-text-green/10" onClick={() => handleReviewDoc(d, 'approved')}>
                              Approve
                            </Button>
                          )}
                          {!d._legacy && d.approvalStatus === 'pending' && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-text-red hover:bg-text-red/10" onClick={() => handleReviewDoc(d, 'rejected')}>
                              Reject
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-text-muted hover:text-text-red" onClick={() => handleDeleteDoc(d)} title="Delete document">
                            <Trash2 size={11} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {documents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-[13px] text-text-muted">No documents uploaded yet</TableCell>
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
              <div className="flex items-center justify-between border-b border-border-sub pb-2">
                <h3 className="text-[13px] font-semibold text-text-primary flex items-center gap-2">
                  <Shield size={11} /> Portal access &amp; permissions
                </h3>
                <Button size="sm" onClick={handleSavePerms} disabled={!canEditAccess || !permsDirty || savingPerms} className="h-7 text-[11px] font-bold bg-brand-red hover:bg-brand-red/90 text-white disabled:opacity-40">
                  {savingPerms ? 'Saving...' : 'Save Permissions'}
                </Button>
              </div>
              {!canEditAccess && (
                <p className="text-[11px] text-accent-gold">View only — only a super admin can change permissions.</p>
              )}
              {userPortals.length === 0 ? (
                <div className="py-12 text-center">
                  <Shield size={24} className="mx-auto text-text-muted mb-3 opacity-30" />
                  <p className="text-[13px] font-semibold text-text-muted">No portal access</p>
                  <p className="text-[11px] text-text-muted mt-1">
                    <button onClick={() => setIsEditOpen(true)} className="text-brand-red font-bold hover:underline">Assign a subrole in Edit Profile</button> to give this user a portal.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-[11px] text-text-muted">
                    Select a portal to see and change this user&apos;s permissions in it. Portals come from subroles —{' '}
                    <button onClick={() => setIsEditOpen(true)} className="text-brand-red font-bold hover:underline">change subroles in Edit Profile</button>.
                  </p>
                  <div className={cn('grid gap-3', userPortals.length > 2 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2')}>
                    {userPortals.map(portal => {
                      const perms = Object.values(PORTAL_PERMISSION_SECTIONS[portal]).flat();
                      const on = perms.filter(effectivePerm).length;
                      const overrides = perms.filter(p => permOverrides[p] !== undefined).length;
                      const selected = portal === selectedPortal;
                      return (
                        <button
                          key={portal}
                          type="button"
                          onClick={() => setSelectedPortal(portal)}
                          aria-pressed={selected}
                          className={cn('p-3 rounded-lg border text-left transition-all',
                            selected ? 'bg-brand-red/10 border-brand-red text-text-primary' : 'border-border-sub bg-bg-secondary text-text-secondary hover:border-border-main')}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                              <span className={cn('inline-block w-2 h-2 rounded-full', PORTAL_META[portal].dot)} />
                              {PORTAL_META[portal].label}
                            </p>
                            {selected ? <ChevronDown size={12} className="text-brand-red" /> : <ChevronRight size={12} className="text-text-muted" />}
                          </div>
                          <p className="text-[11px] text-text-muted mt-1.5 truncate">
                            {roles.filter(r => SUBROLE_DEFINITIONS[r as keyof typeof SUBROLE_DEFINITIONS]?.portal === portal)
                              .map(r => SUBROLE_DEFINITIONS[r as keyof typeof SUBROLE_DEFINITIONS].label).join(', ') || 'Legacy access'}
                          </p>
                          <p className="text-[12px] font-mono mt-1 text-text-secondary">
                            {on}/{perms.length} on{overrides > 0 && <span className="text-accent-gold"> · {overrides} override{overrides !== 1 ? 's' : ''}</span>}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {selectedPortal && (() => {
                    const sections = PORTAL_PERMISSION_SECTIONS[selectedPortal];
                    const allPerms = Object.values(sections).flat();
                    const allOn = allPerms.every(effectivePerm);
                    return (
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[13px] font-semibold text-text-primary flex items-center gap-1.5">
                            <span className={cn('inline-block w-2 h-2 rounded-full', PORTAL_META[selectedPortal].dot)} />
                            {PORTAL_META[selectedPortal].label} Permissions
                          </h4>
                          <div className="flex items-center gap-3">
                            <button onClick={() => setAllPerms(allPerms, !allOn)} className="text-[12px] font-bold text-text-muted hover:text-text-primary">
                              {allOn ? 'Turn all off' : 'Turn all on'}
                            </button>
                            <button onClick={() => resetPerms(allPerms)} className="text-[12px] font-bold text-text-muted hover:text-text-primary">
                              Reset to role defaults
                            </button>
                          </div>
                        </div>
                        {selectedPortal === 'sales' && (
                          <p className="text-[11px] text-text-muted">Sales Portal access is controlled by the CRM permissions below.</p>
                        )}
                        {Object.entries(sections).map(([page, perms]) => {
                          const sectionKey = `${selectedPortal}:${page}`;
                          const isCollapsed = collapsedSections.has(sectionKey);
                          const allSel = perms.every(effectivePerm);
                          const someSel = perms.some(effectivePerm);
                          return (
                            <div key={page} className="pl-3 border-l-2 border-border-sub space-y-1.5">
                              <div className="flex items-center justify-between">
                                <button
                                  type="button"
                                  className="flex items-center gap-1.5"
                                  onClick={() => setCollapsedSections(prev => {
                                    const next = new Set(prev);
                                    if (next.has(sectionKey)) next.delete(sectionKey); else next.add(sectionKey);
                                    return next;
                                  })}
                                >
                                  {isCollapsed ? <ChevronRight size={10} className="text-text-muted" /> : <ChevronDown size={10} className="text-text-muted" />}
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{page.replace(/_/g, ' ')}</span>
                                </button>
                                <button
                                  onClick={() => setAllPerms(perms, !allSel)}
                                  className="h-4 w-4 rounded border border-border-main flex items-center justify-center transition-colors hover:border-text-primary"
                                  title={allSel ? 'Turn section off' : 'Turn section on'}
                                >
                                  {allSel ? <CheckSquare size={10} className="text-text-green" /> : someSel ? <Minus size={10} className="text-text-muted" /> : null}
                                </button>
                              </div>
                              {!isCollapsed && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                  {perms.map(perm => {
                                    const override = permOverrides[perm];
                                    const effective = effectivePerm(perm);
                                    return (
                                      <div key={perm} className={cn('flex items-center justify-between p-2 rounded-lg border transition-all', effective ? 'bg-text-green/5 border-text-green/20' : 'bg-bg-secondary border-border-sub')}>
                                        <div className="min-w-0">
                                          <p className="text-[12px] font-bold text-text-primary truncate">{permissionLabel(perm)}</p>
                                          {override !== undefined && <p className="text-[10px] text-accent-gold">Override</p>}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0 ml-2">
                                          <button
                                            onClick={() => setPerm(perm, !effective)}
                                            aria-label={`${effective ? 'Turn off' : 'Turn on'} ${permissionLabel(perm)}`}
                                            className={cn('h-5 w-5 rounded flex items-center justify-center transition-colors border', effective ? 'bg-text-green/20 border-text-green/30 text-text-green' : 'bg-bg-primary border-border-sub text-text-muted hover:border-border-main')}
                                          >
                                            {effective ? <CheckSquare size={11} /> : <Square size={11} />}
                                          </button>
                                          {override !== undefined && (
                                            <button onClick={() => resetPerms([perm])} className="text-[12px] text-text-muted hover:text-text-primary font-bold px-1" title="Reset to role default">✕</button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
            {/* ── MESSAGE RESTRICTIONS ── */}
            <div className="space-y-3">
              <div className="border-b border-border-sub pb-2">
                <h3 className="text-[13px] font-semibold text-text-primary flex items-center gap-2">
                  <Ban size={11} className="text-brand-red" /> Message restrictions
                </h3>
                <p className="text-[11px] text-text-muted mt-1">Control who this user can message</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Who can this user message?</p>
                <Select
                  value={(person.messagingAllowedRoles as string) || 'all'}
                  onValueChange={handleMessagingRoleChange}
                >
                  <SelectTrigger className="h-8 text-[10px] bg-bg-primary border-border-main">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-bg-elevated border-border-main">
                    <SelectItem value="all">All Users</SelectItem>
                    <SelectItem value="admins">Admins Only</SelectItem>
                    <SelectItem value="techs">Techs &amp; Admins</SelectItem>
                    <SelectItem value="clients">Clients &amp; Admins</SelectItem>
                    <SelectItem value="none">No One</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Blocked Clients</p>
                {/* Show only currently blocked clients */}
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {allClients
                    .filter(c => (person.messagingBlockedClientIds || []).includes(c.id))
                    .map(client => (
                      <div key={client.id} className="flex items-center justify-between p-2 rounded-lg border border-brand-red/20 bg-brand-red/5">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-6 w-6 shrink-0">
                            <AvatarImage src={client.avatarUrl} />
                            <AvatarFallback className="text-[10px]">{(client.name || '?').charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-[12px] font-bold text-text-primary truncate">{client.name}</p>
                            <p className="text-[10px] text-text-muted truncate">{client.clientCompany || client.email}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleToggleClientRestriction(client.id, false)}
                          className="h-6 px-2.5 rounded text-[10px] font-bold border border-brand-red/40 bg-brand-red/10 text-brand-red hover:bg-brand-red/20 transition-colors shrink-0 ml-2"
                        >
                          Unblock
                        </button>
                      </div>
                    ))}
                  {!allClients.some(c => (person.messagingBlockedClientIds || []).includes(c.id)) && (
                    <p className="text-[12px] text-text-muted py-3 text-center">No blocked clients</p>
                  )}
                </div>
                {/* Add a new block */}
                <Select onValueChange={v => v && handleToggleClientRestriction(v, true)}>
                  <SelectTrigger className="h-8 text-[10px] bg-bg-primary border-border-main">
                    <SelectValue placeholder="+ Block a client..." />
                  </SelectTrigger>
                  <SelectContent className="bg-bg-elevated border-border-main">
                    {allClients
                      .filter(c => !(person.messagingBlockedClientIds || []).includes(c.id))
                      .map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}{c.clientCompany ? ` — ${c.clientCompany}` : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── NOTES ── */}
        <TabsContent value="notes" className="m-0 pt-5">
          <div className="space-y-4">
            {person?.adminNotes && (
              <div className="p-4 rounded-xl border border-accent-gold/30 bg-accent-gold/5 space-y-2">
                <h3 className="text-[13px] font-semibold text-accent-gold flex items-center gap-2">
                  <Shield size={11} /> Admin notes <span className="text-text-muted normal-case font-medium">(admins only — change in Edit profile)</span>
                </h3>
                <p className="text-[12px] text-text-primary whitespace-pre-wrap">{person.adminNotes}</p>
              </div>
            )}
            <div className="p-4 rounded-xl border border-border-sub bg-bg-secondary space-y-3">
              <h3 className="text-[13px] font-semibold text-text-primary flex items-center gap-2">
                <Plus size={11} /> Add note
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
                  className="h-8 text-[10px] font-bold bg-brand-red hover:bg-brand-red/90 text-white"
                >
                  {addingNote ? 'Saving...' : 'Save Note'}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-[13px] font-semibold text-text-primary border-b border-border-sub pb-2 flex items-center gap-2">
                <StickyNote size={11} /> Notes ({techNotes.length})
              </h3>
              {techNotes.length === 0 ? (
                <p className="text-[12px] text-text-muted py-6 text-center">No notes yet</p>
              ) : techNotes.map(note => (
                <div key={note.id} className="p-3 rounded-lg border border-border-sub bg-bg-secondary">
                  <p className="text-[12px] text-text-primary whitespace-pre-wrap">{note.text}</p>
                  <p className="text-[11px] text-text-muted mt-2">
                    {note.authorName ? `${note.authorName} · ` : ''}{note.createdAt ? format(new Date(note.createdAt), 'MMM d, yyyy h:mm a') : '—'}
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
              <p className="text-[10px] text-text-muted">The reliability score is turned off for now; events are still recorded here.</p>
              <div className="space-y-2">
                <h3 className="text-[13px] font-semibold text-text-primary border-b border-border-sub pb-2 flex items-center gap-2">
                  <BarChart2 size={11} /> Event history ({penaltyEvents.length})
                </h3>
                {penaltyEvents.length === 0 ? (
                  <p className="text-[12px] text-text-muted py-6 text-center">No reliability events</p>
                ) : (
                  <div className="rounded-xl border border-border-sub overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border-sub">
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Event</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Category</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted text-right">Score Δ</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {penaltyEvents.map(ev => (
                          <TableRow key={ev.id} className="border-border-sub">
                            <TableCell className="text-[12px] text-text-primary font-semibold">{statusLabel(ev.eventType)}</TableCell>
                            <TableCell>
                              <Badge variant={TONE_BADGE[EVENT_TONE[ev.category] || 'progress']} className="h-5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">
                                {statusLabel(ev.category)}
                              </Badge>
                            </TableCell>
                            <TableCell className={cn('text-[10px] font-bold font-mono text-right', ev.scoreChange > 0 ? 'text-text-green' : 'text-text-red')}>
                              {ev.scoreChange > 0 ? '+' : ''}{ev.scoreChange}
                            </TableCell>
                            <TableCell className="text-[12px] text-text-muted">
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
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Upload size={14} className="text-brand-red" /> Upload Document
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Document Name</Label>
              <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="e.g. Driver's License" value={uploadForm.name} onChange={e => setUploadForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Document Type</Label>
              <Select value={uploadForm.type} onValueChange={v => setUploadForm(p => ({ ...p, type: v }))}>
                <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-bg-elevated border-border-main">
                  {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Expiry Date (optional)</Label>
              <Input type="date" className="h-9 text-[11px] bg-bg-secondary border-border-main" value={uploadForm.expiryDate} onChange={e => setUploadForm(p => ({ ...p, expiryDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between mb-1">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Source</Label>
                <div className="flex rounded-md border border-border-main overflow-hidden">
                  <button
                    onClick={() => setUploadMode('file')}
                    className={cn('px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors', uploadMode === 'file' ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary')}
                  >Device</button>
                  <button
                    onClick={() => setUploadMode('url')}
                    className={cn('px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors border-l border-border-main', uploadMode === 'url' ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary')}
                  >URL</button>
                </div>
              </div>
              {uploadMode === 'file' ? (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={e => setUploadFileObj(e.target.files?.[0] || null)}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-9 rounded-md border border-dashed border-border-main bg-bg-secondary text-[12px] font-bold text-text-muted hover:text-text-primary hover:border-border-main transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Upload size={11} />
                    {uploadFileObj ? uploadFileObj.name : 'Choose file…'}
                  </button>
                </div>
              ) : (
                <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="https://..." value={uploadForm.url} onChange={e => setUploadForm(p => ({ ...p, url: e.target.value }))} />
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setUploadOpen(false); setUploadFileObj(null); setUploadMode('url'); }} className="text-[10px] font-bold">Cancel</Button>
            <Button size="sm" onClick={handleUploadDoc} disabled={!uploadForm.name || uploadSaving || (uploadMode === 'file' ? !uploadFileObj : !/^https?:\/\//.test(uploadForm.url.trim()))} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-bold">
              {uploadSaving ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
