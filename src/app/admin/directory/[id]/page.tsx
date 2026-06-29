'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, onSnapshot, addDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowLeft, Mail, Phone, MapPin, Briefcase, Clock, CheckCircle, AlertTriangle,
  DollarSign, Calendar, FileText, Upload, Shield, CheckSquare, Square,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getReliabilityTier, getTierBadgeVariant } from '@/lib/reliability';
import { hasPermission, ALL_PERMISSIONS, type Permission } from '@/lib/permissions';
import { format, parseISO, differenceInDays } from 'date-fns';
import type { Technician, WorkOrder, WeeklyLog, PersonnelDocument } from '@/lib/types';

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
  return perm.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function DirectoryPersonPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [person, setPerson] = useState<Technician | null>(null);
  const [assignments, setAssignments] = useState<WorkOrder[]>([]);
  const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
  const [documents, setDocuments] = useState<PersonnelDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Documents upload
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({ name: '', type: 'other', expiryDate: '', url: '' });
  const [uploadSaving, setUploadSaving] = useState(false);

  // Permissions
  const [permOverrides, setPermOverrides] = useState<Record<string, boolean>>({});
  const [savingPerms, setSavingPerms] = useState(false);
  const [permsDirty, setPermsDirty] = useState(false);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'users', id)).then(snap => {
      if (snap.exists()) {
        const data = { ...snap.data(), id: snap.id } as Technician;
        setPerson(data);
        setPermOverrides(data.permissionOverrides || {});
      }
      setLoading(false);
    });

    const unsubA = onSnapshot(collection(db, 'assignments'), snap => {
      const all = snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder));
      setAssignments(all.filter(wo => wo.assignedTechnicianId === id || wo.techId === id));
    });
    const unsubL = onSnapshot(collection(db, 'weeklyLogs'), snap => {
      const all = snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog));
      setWeeklyLogs(all.filter(l => l.techId === id).sort((a, b) => b.weekOf?.localeCompare(a.weekOf || '') || 0));
    });
    const unsubDocs = onSnapshot(collection(db, 'users', id, 'documents'), snap => {
      setDocuments(snap.docs.map(d => ({ ...d.data(), id: d.id } as PersonnelDocument)));
    });
    return () => { unsubA(); unsubL(); unsubDocs(); };
  }, [id]);

  const activeJobs = assignments.filter(wo => wo.status !== 'completed');
  const completedJobs = assignments.filter(wo => wo.status === 'completed');
  const pendingPay = weeklyLogs.filter(l => l.status === 'Submitted').reduce((s, l) => s + (l.totalPayout || 0), 0);
  const totalEarned = weeklyLogs.filter(l => l.status === 'Approved').reduce((s, l) => s + (l.totalPayout || 0), 0);
  const reliabilityScore = person?.reliabilityScore ?? (completedJobs.length > 0 ? Math.round((completedJobs.length / assignments.length) * 100) : 0);
  const tier = getReliabilityTier(reliabilityScore);

  const formatDate = (dateStr: string) => {
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

  const roles: string[] = Array.isArray(person.roles) ? person.roles : (person.role ? [person.role] : ['Staff']);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/directory')} className="h-8 text-[10px] uppercase font-bold text-text-muted">
          <ArrowLeft size={14} className="mr-2" /> Directory
        </Button>
      </div>

      {/* Profile hero */}
      <div className="flex flex-col md:flex-row gap-6 p-6 rounded-xl border border-border-sub bg-bg-secondary">
        <div className="flex flex-col items-center gap-3 md:w-48 shrink-0">
          <Avatar className="h-20 w-20 border-2 border-brand-red">
            <AvatarImage src={person.avatarUrl} />
            <AvatarFallback className="text-lg font-bold">{(person.name || 'U')[0]}</AvatarFallback>
          </Avatar>
          <Badge variant={getTierBadgeVariant(tier)} className="text-[8px] uppercase tracking-widest px-3">{tier}</Badge>
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
            { label: 'Active Jobs', value: activeJobs.length, icon: Clock, color: 'text-text-amber' },
            { label: 'Completed', value: completedJobs.length, icon: CheckCircle, color: 'text-text-green' },
            { label: 'Pending Pay', value: `$${pendingPay.toFixed(0)}`, icon: DollarSign, color: 'text-text-amber' },
            { label: 'Total Earned', value: `$${totalEarned.toFixed(0)}`, icon: DollarSign, color: 'text-text-green' },
          ].map(stat => (
            <div key={stat.label} className="p-2.5 rounded-lg bg-bg-primary border border-border-sub">
              <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">{stat.label}</p>
              <p className={cn('text-lg font-bold font-mono mt-0.5', stat.color)}>{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info" className="w-full">
        <TabsList className="border-b border-border-sub bg-transparent rounded-none h-auto p-0 gap-8 justify-start mb-1">
          {[
            { value: 'info', label: 'Info' },
            { value: 'documents', label: 'Documents', badge: documents.length || undefined },
            { value: 'permissions', label: 'Permissions' },
          ].map(t => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="px-0 pb-3 pt-0 h-auto bg-transparent rounded-none border-b-2 border-transparent text-[11px] font-black uppercase tracking-[0.2em] text-text-muted data-[state=active]:bg-transparent data-[state=active]:text-text-primary data-[state=active]:border-brand-red data-[state=active]:shadow-none transition-all flex items-center gap-2"
            >
              {t.label}
              {t.badge !== undefined && (
                <span className="text-[8px] font-black bg-bg-tertiary text-text-muted border border-border-sub px-1.5 py-0.5 rounded">{t.badge}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Info Tab ── */}
        <TabsContent value="info" className="m-0 pt-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-2">
              <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 flex items-center gap-2">
                <Briefcase size={11} /> Active Assignments ({activeJobs.length})
              </h3>
              {activeJobs.length === 0 ? (
                <p className="text-[10px] text-text-muted uppercase py-4 text-center">No active assignments</p>
              ) : activeJobs.map(wo => (
                <div key={wo.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border-sub bg-bg-secondary">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-text-primary uppercase truncate">{wo.title || wo.description || wo.id}</p>
                    <p className="text-[9px] text-text-muted uppercase">{wo.clientName} — {wo.scheduleDate ? formatDate(wo.scheduleDate) : 'TBD'}</p>
                  </div>
                  <Badge variant={wo.status === 'in-progress' ? 'active' : 'scheduled'} className="text-[7px] uppercase h-4 shrink-0 ml-2">{wo.status}</Badge>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 flex items-center gap-2">
                <Calendar size={11} /> Weekly Logs ({weeklyLogs.length})
              </h3>
              {weeklyLogs.length === 0 ? (
                <p className="text-[10px] text-text-muted uppercase py-4 text-center">No weekly logs</p>
              ) : weeklyLogs.slice(0, 10).map(log => (
                <div key={log.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border-sub bg-bg-secondary">
                  <div>
                    <p className="text-[11px] font-bold text-text-primary uppercase">Week of {log.weekOf}</p>
                    <p className="text-[9px] text-text-muted uppercase">${(log.totalPayout || 0).toFixed(2)} payout</p>
                  </div>
                  <Badge
                    variant={log.status === 'Approved' ? 'active' : log.status === 'Submitted' ? 'scheduled' : 'onhold'}
                    className="text-[7px] uppercase h-4 shrink-0"
                  >{log.status}</Badge>
                </div>
              ))}
            </div>

            <div className="lg:col-span-2 space-y-2">
              <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 flex items-center gap-2">
                <CheckCircle size={11} className="text-text-green" /> Completed Jobs ({completedJobs.length})
              </h3>
              {completedJobs.length === 0 ? (
                <p className="text-[10px] text-text-muted uppercase py-4 text-center">No completed assignments</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {completedJobs.slice(0, 20).map(wo => (
                    <div key={wo.id} className="flex items-center justify-between p-2 rounded-lg border border-border-sub bg-bg-secondary">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-text-primary uppercase truncate">{wo.title || wo.description || wo.id}</p>
                        <p className="text-[9px] text-text-muted uppercase">{wo.clientName} · ${wo.pay || 0}</p>
                      </div>
                      <Badge variant="active" className="text-[7px] uppercase h-4 shrink-0 ml-2">Done</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Documents Tab ── */}
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

        {/* ── Permissions Tab ── */}
        <TabsContent value="permissions" className="m-0 pt-5">
          <div className="space-y-6">
            {/* Portal Access */}
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
                        {active
                          ? <CheckSquare size={13} className="text-brand-red" />
                          : <Square size={13} className="text-text-muted" />
                        }
                      </div>
                      <p className="text-[9px] text-text-muted">{portal.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Permission Overrides */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-border-sub pb-2">
                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                  <CheckSquare size={11} /> Permission Overrides
                </h3>
                <Button
                  size="sm"
                  onClick={handleSavePerms}
                  disabled={!permsDirty || savingPerms}
                  className="h-7 text-[9px] font-bold uppercase bg-brand-red hover:bg-brand-red/90 text-white disabled:opacity-40"
                >
                  {savingPerms ? 'Saving...' : 'Save Permissions'}
                </Button>
              </div>
              <p className="text-[9px] text-text-muted uppercase tracking-wider">
                Overrides take precedence over role defaults. Leave unchecked to use role defaults.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {ALL_PERMISSIONS.map(perm => {
                  const roleDefault = hasPermission(person, perm);
                  const override = permOverrides[perm];
                  const effective = override !== undefined ? override : roleDefault;
                  return (
                    <div key={perm} className={cn(
                      'flex items-center justify-between p-2 rounded-lg border transition-all',
                      effective ? 'bg-text-green/5 border-text-green/20' : 'bg-bg-secondary border-border-sub'
                    )}>
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold text-text-primary truncate">{permissionLabel(perm)}</p>
                        {override !== undefined && (
                          <p className="text-[8px] text-amber-400 uppercase">Override</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <button
                          onClick={() => handleTogglePerm(perm, effective ? false : true)}
                          className={cn(
                            'h-5 w-5 rounded flex items-center justify-center transition-colors border',
                            effective ? 'bg-text-green/20 border-text-green/30 text-text-green' : 'bg-bg-primary border-border-sub text-text-muted hover:border-border-main'
                          )}
                        >
                          {effective ? <CheckSquare size={11} /> : <Square size={11} />}
                        </button>
                        {override !== undefined && (
                          <button
                            onClick={() => handleTogglePerm(perm, null)}
                            className="text-[8px] text-text-muted hover:text-text-primary uppercase font-bold px-1"
                            title="Reset to role default"
                          >✕</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

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
              <Input
                className="h-9 text-[11px] bg-bg-secondary border-border-main"
                placeholder="e.g. Driver's License"
                value={uploadForm.name}
                onChange={e => setUploadForm(p => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Document Type</Label>
              <Select value={uploadForm.type} onValueChange={v => setUploadForm(p => ({ ...p, type: v }))}>
                <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-bg-elevated border-border-main">
                  {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k} className="text-[11px]">{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Expiry Date (optional)</Label>
              <Input
                type="date"
                className="h-9 text-[11px] bg-bg-secondary border-border-main"
                value={uploadForm.expiryDate}
                onChange={e => setUploadForm(p => ({ ...p, expiryDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Document URL (optional)</Label>
              <Input
                className="h-9 text-[11px] bg-bg-secondary border-border-main"
                placeholder="https://..."
                value={uploadForm.url}
                onChange={e => setUploadForm(p => ({ ...p, url: e.target.value }))}
              />
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
