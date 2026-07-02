'use client';

import { useState, useMemo, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, onSnapshot, query, where, doc, updateDoc, setDoc, addDoc } from 'firebase/firestore';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import { RequestsClient } from './components/requests-client';
import { NewRequestDialog } from './components/new-request-dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import {
  Inbox, Plus, Clock, MapPin, Building2, User, Calendar,
  CheckCircle2, XCircle, AlertTriangle, Loader2, UserCheck,
  ShieldCheck, Briefcase, Search,
} from 'lucide-react';
import type { ServiceRequest, WorkOrder, TimeOffRequest, SiteRequest, Technician } from '@/lib/types';
import type { AppRole } from '@/lib/types';

const PRIORITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

const ALL_ROLES: AppRole[] = [
  'super_admin', 'dispatch_admin', 'payroll_admin', 'project_manager',
  'project_lead', 'field_technician', 'client', 'sales',
  'safety_officer', 'training_coordinator',
];

function priorityCls(p: string) {
  if (p === 'critical') return 'bg-brand-red/10 text-brand-red border-brand-red/30';
  if (p === 'high') return 'bg-orange-400/10 text-orange-400 border-orange-400/30';
  if (p === 'medium') return 'bg-amber-400/10 text-amber-400 border-amber-400/30';
  return 'bg-bg-tertiary text-text-muted border-border-sub';
}

function statusCls(s: string) {
  if (s === 'approved') return 'bg-text-green/10 text-text-green border-text-green/30';
  if (s === 'denied' || s === 'rejected') return 'bg-brand-red/10 text-brand-red border-brand-red/30';
  if (s === 'reviewed') return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
  return 'bg-amber-400/10 text-amber-400 border-amber-400/30';
}

function TabCount({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-brand-red text-white text-[8px] font-black min-w-[16px] h-4 px-1 leading-none">
      {n > 99 ? '99+' : n}
    </span>
  );
}

// ── All tab: normalized unified pending view ────────────────────────────────
type NormalizedItem = {
  id: string;
  kind: 'service' | 'client' | 'personnel' | 'access';
  title: string;
  subtitle: string;
  meta: string;
  status: string;
  priority?: string;
  date: string;
};

// ── Personnel tab ────────────────────────────────────────────────────────────
function PersonnelTab({ requests, technicians }: { requests: TimeOffRequest[]; technicians: Technician[] }) {
  const { toast } = useToast();
  const pending = requests.filter(r => r.status === 'pending');
  const resolved = requests.filter(r => r.status !== 'pending');

  const approve = async (id: string) => {
    await updateDoc(doc(db, 'timeOffRequests', id), { status: 'approved' });
    toast({ title: 'Time Off Approved' });
  };
  const deny = async (id: string) => {
    await updateDoc(doc(db, 'timeOffRequests', id), { status: 'denied' });
    toast({ title: 'Request Denied', variant: 'destructive' } as any);
  };

  const card = (req: TimeOffRequest, showActions: boolean) => {
    const tech = technicians.find(t => t.id === req.techId);
    const initials = tech?.name?.split(' ').map(n => n[0]).join('') || '??';
    return (
      <div key={req.id} className="rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Avatar className="w-9 h-9 shrink-0">
            <AvatarImage src={(tech as any)?.avatarUrl} />
            <AvatarFallback className="text-[10px] font-black bg-bg-tertiary text-text-muted">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-text-primary">{tech?.name || req.techId}</p>
            <p className="text-[10px] text-text-muted">{req.type} · {req.startDate} – {req.endDate}</p>
          </div>
          <span className={cn('text-[9px] px-2 py-0.5 rounded border font-bold uppercase tracking-widest shrink-0', statusCls(req.status))}>
            {req.status}
          </span>
        </div>
        {req.reason && (
          <p className="text-[11px] text-text-secondary italic border-l-2 border-border-sub pl-3">&ldquo;{req.reason}&rdquo;</p>
        )}
        {showActions && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest bg-text-green hover:bg-text-green/90 text-white"
              onClick={() => approve(req.id)}>
              <CheckCircle2 size={12} className="mr-1.5" />Approve
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest border-brand-red/30 text-brand-red hover:bg-brand-red/5"
              onClick={() => deny(req.id)}>
              <XCircle size={12} className="mr-1.5" />Deny
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">Pending ({pending.length})</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pending.map(r => card(r, true))}
          </div>
        </div>
      )}
      {resolved.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">Resolved ({resolved.length})</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {resolved.map(r => card(r, false))}
          </div>
        </div>
      )}
      {requests.length === 0 && (
        <div className="py-16 text-center text-text-muted">
          <Calendar size={28} className="mx-auto mb-3 opacity-20" />
          <p className="text-[11px]">No time-off requests</p>
        </div>
      )}
    </div>
  );
}

// ── Client / Site Requests tab ───────────────────────────────────────────────
function ClientTab({ requests }: { requests: SiteRequest[] }) {
  const { toast } = useToast();
  const [actioning, setActioning] = useState<string | null>(null);

  const pending = requests.filter(r => r.status === 'pending');
  const resolved = requests.filter(r => r.status !== 'pending');

  const approve = async (req: SiteRequest) => {
    setActioning(req.id);
    try {
      const siteId = await createDocId(ID_PREFIXES.SITE || 'SITE');
      await setDoc(doc(db, 'sites', siteId), {
        id: siteId,
        name: req.siteName,
        clientId: req.clientId,
        clientName: req.clientName,
        location: req.location,
        managerName: req.managerName || '',
        managerPhone: req.managerPhone || '',
        status: 'active',
        createdAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, 'siteRequests', req.id), { status: 'approved' });
      toast({ title: 'Site Approved', description: `${req.siteName} added to ${req.clientName}.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setActioning(null);
    }
  };

  const deny = async (id: string) => {
    await updateDoc(doc(db, 'siteRequests', id), { status: 'denied' });
    toast({ title: 'Request Denied' });
  };

  const card = (req: SiteRequest, showActions: boolean) => (
    <div key={req.id} className="rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[12px] font-bold text-text-primary">{req.siteName}</p>
          <p className="text-[10px] text-text-muted flex items-center gap-1 mt-0.5">
            <Building2 size={9} />{req.clientName}
          </p>
        </div>
        <span className={cn('text-[9px] px-2 py-0.5 rounded border font-bold uppercase tracking-widest shrink-0', statusCls(req.status))}>
          {req.status}
        </span>
      </div>
      {req.location && (
        <p className="text-[11px] text-text-muted flex items-center gap-1.5">
          <MapPin size={11} className="shrink-0" />{req.location}
        </p>
      )}
      <p className="text-[9px] text-text-muted">Submitted {req.submittedDate}</p>
      {showActions && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest bg-text-green hover:bg-text-green/90 text-white"
            onClick={() => approve(req)}
            disabled={actioning === req.id}>
            {actioning === req.id ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <CheckCircle2 size={12} className="mr-1.5" />}
            Approve
          </Button>
          <Button size="sm" variant="outline" className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest border-brand-red/30 text-brand-red hover:bg-brand-red/5"
            onClick={() => deny(req.id)}
            disabled={actioning === req.id}>
            <XCircle size={12} className="mr-1.5" />Reject
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">Pending ({pending.length})</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pending.map(r => card(r, true))}
          </div>
        </div>
      )}
      {resolved.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">Resolved ({resolved.length})</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {resolved.map(r => card(r, false))}
          </div>
        </div>
      )}
      {requests.length === 0 && (
        <div className="py-16 text-center text-text-muted">
          <MapPin size={28} className="mx-auto mb-3 opacity-20" />
          <p className="text-[11px]">No client / site requests</p>
        </div>
      )}
    </div>
  );
}

// ── Account Access tab ───────────────────────────────────────────────────────
function AccountAccessTab({ pendingUsers }: { pendingUsers: Technician[] }) {
  const { toast } = useToast();
  const [approveTarget, setApproveTarget] = useState<Technician | null>(null);
  const [denyTarget, setDenyTarget] = useState<Technician | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>([]);
  const [primaryRole, setPrimaryRole] = useState<AppRole | ''>('');
  const [denyReason, setDenyReason] = useState('');
  const [approving, setApproving] = useState(false);
  const [denying, setDenying] = useState(false);

  const toggleRole = (role: AppRole) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const handleApprove = async () => {
    if (!approveTarget || selectedRoles.length === 0 || !primaryRole) return;
    setApproving(true);
    try {
      const adminUid = auth.currentUser?.uid || '';
      await updateDoc(doc(db, 'users', approveTarget.id), {
        roles: selectedRoles,
        role: primaryRole,
        primaryRole,
        approvalStatus: 'approved',
        status: 'active',
        approvedAt: new Date().toISOString(),
        approvedBy: adminUid,
        updatedAt: new Date().toISOString(),
      });
      toast({ title: 'Access Granted', description: `${approveTarget.name} approved as ${primaryRole}.` });
      setApproveTarget(null);
      setSelectedRoles([]);
      setPrimaryRole('');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setApproving(false);
    }
  };

  const handleDeny = async () => {
    if (!denyTarget) return;
    setDenying(true);
    try {
      const adminUid = auth.currentUser?.uid || '';
      await updateDoc(doc(db, 'users', denyTarget.id), {
        approvalStatus: 'denied',
        status: 'inactive',
        deniedAt: new Date().toISOString(),
        deniedBy: adminUid,
        denialReason: denyReason.trim(),
        updatedAt: new Date().toISOString(),
      });
      toast({ title: 'Access Denied', description: `${denyTarget.name}'s request has been denied.` });
      setDenyTarget(null);
      setDenyReason('');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setDenying(false);
    }
  };

  return (
    <>
      {pendingUsers.length === 0 ? (
        <div className="py-16 text-center text-text-muted">
          <ShieldCheck size={28} className="mx-auto mb-3 opacity-20" />
          <p className="text-[11px]">No pending account requests</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {pendingUsers.map(user => {
            const initials = user.name?.split(' ').map(n => n[0]).join('') || '??';
            return (
              <div key={user.id} className="rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Avatar className="w-9 h-9 shrink-0">
                    <AvatarImage src={(user as any).photoURL || (user as any).avatarUrl} />
                    <AvatarFallback className="text-[10px] font-black bg-bg-tertiary text-text-muted">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-text-primary truncate">{user.name || 'Unknown'}</p>
                    <p className="text-[10px] text-text-muted truncate">{user.email}</p>
                  </div>
                  <span className="text-[9px] px-2 py-0.5 rounded border font-bold uppercase tracking-widest shrink-0 bg-amber-400/10 text-amber-400 border-amber-400/30">
                    Pending
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
                  <span className="px-1.5 py-0.5 rounded bg-bg-tertiary border border-border-sub text-[9px] font-bold">
                    {(user as any).createdVia === 'google_sso' ? 'Google SSO' : 'Email'}
                  </span>
                  {(user as any).requestedAt && (
                    <span>Requested {format(parseISO((user as any).requestedAt), 'MMM d, yyyy')}</span>
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest bg-text-green hover:bg-text-green/90 text-white"
                    onClick={() => { setApproveTarget(user); setSelectedRoles([]); setPrimaryRole(''); }}>
                    <UserCheck size={12} className="mr-1.5" />Approve
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest border-brand-red/30 text-brand-red hover:bg-brand-red/5"
                    onClick={() => { setDenyTarget(user); setDenyReason(''); }}>
                    <XCircle size={12} className="mr-1.5" />Deny
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Approve dialog */}
      <Dialog open={!!approveTarget} onOpenChange={v => !v && setApproveTarget(null)}>
        <DialogContent className="bg-bg-secondary border-border-main max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[12px] font-black uppercase tracking-widest">
              Assign Role — {approveTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-2">Roles (select all that apply)</p>
              <div className="grid grid-cols-2 gap-2">
                {ALL_ROLES.map(role => (
                  <div key={role} className="flex items-center gap-2">
                    <Checkbox
                      id={`role-${role}`}
                      checked={selectedRoles.includes(role)}
                      onCheckedChange={() => toggleRole(role)}
                    />
                    <Label htmlFor={`role-${role}`} className="text-[10px] font-bold uppercase cursor-pointer">
                      {role.replace(/_/g, ' ')}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1.5">Primary Role</p>
              <Select
                value={primaryRole}
                onValueChange={v => setPrimaryRole(v as AppRole)}
                disabled={selectedRoles.length === 0}
              >
                <SelectTrigger className="h-8 text-[11px] bg-bg-tertiary border-border-main">
                  <SelectValue placeholder="Select primary role" />
                </SelectTrigger>
                <SelectContent className="bg-bg-elevated border-border-main">
                  {selectedRoles.map(r => (
                    <SelectItem key={r} value={r} className="text-[10px] font-bold uppercase">
                      {r.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" className="text-[10px] uppercase font-bold"
              onClick={() => setApproveTarget(null)} disabled={approving}>
              Cancel
            </Button>
            <Button size="sm"
              className="text-[10px] uppercase font-bold bg-text-green hover:bg-text-green/90 text-white"
              onClick={handleApprove}
              disabled={approving || selectedRoles.length === 0 || !primaryRole}>
              {approving && <Loader2 size={11} className="animate-spin mr-1.5" />}
              {approving ? 'Granting...' : 'Grant Access'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deny dialog */}
      <Dialog open={!!denyTarget} onOpenChange={v => !v && setDenyTarget(null)}>
        <DialogContent className="bg-bg-secondary border-border-main max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[12px] font-black uppercase tracking-widest">
              Deny Access — {denyTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Reason (optional)</Label>
            <textarea
              rows={3}
              value={denyReason}
              onChange={e => setDenyReason(e.target.value)}
              placeholder="Explain why access is being denied..."
              className="mt-1.5 w-full text-[11px] bg-bg-tertiary border border-border-main rounded-md p-2 text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-brand-red/40"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" className="text-[10px] uppercase font-bold"
              onClick={() => setDenyTarget(null)} disabled={denying}>
              Cancel
            </Button>
            <Button size="sm"
              className="text-[10px] uppercase font-bold bg-brand-red hover:bg-brand-red/90 text-white"
              onClick={handleDeny} disabled={denying}>
              {denying && <Loader2 size={11} className="animate-spin mr-1.5" />}
              {denying ? 'Denying...' : 'Deny Access'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Subscription placeholder ─────────────────────────────────────────────────
function SubscriptionTab() {
  return (
    <div className="py-16 text-center text-text-muted">
      <Briefcase size={28} className="mx-auto mb-3 opacity-20" />
      <p className="text-[12px] font-bold">Subscription Requests</p>
      <p className="text-[11px] mt-1">Subscription and service plan inquiries will appear here.</p>
      <p className="text-[10px] mt-3 text-text-muted/60">Coming soon — connect to CRM or service plan intake.</p>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function RequestsPage() {
  const { toast } = useToast();

  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [siteRequests, setSiteRequests] = useState<SiteRequest[]>([]);
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [pendingUsers, setPendingUsers] = useState<Technician[]>([]);
  const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'clientRequests'), snap => {
      setServiceRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as ServiceRequest)));
      setLoading(false);
    }, () => setLoading(false));

    const u2 = onSnapshot(collection(db, 'siteRequests'), snap => {
      setSiteRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as SiteRequest)));
    });

    const u3 = onSnapshot(collection(db, 'timeOffRequests'), snap => {
      setTimeOffRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as TimeOffRequest)));
    });

    const u4 = onSnapshot(collection(db, 'users'), snap => {
      const all = snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician));
      setTechnicians(all);
      setPendingUsers(all.filter(u => (u as any).approvalStatus === 'pending'));
    });

    const u5 = onSnapshot(collection(db, 'workOrders'), snap => {
      setAllWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
    });

    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, []);

  const handleAddNewRequest = async (request: ServiceRequest) => {
    try {
      await setDoc(doc(db, 'clientRequests', request.id), { ...request });
      toast({ title: 'Request Added', description: `${request.id.toUpperCase()} added to service queue.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };

  // Counts for tab badges
  const servicePending = serviceRequests.filter(r => r.status === 'new' || r.status === 'reviewed').length;
  const clientPending  = siteRequests.filter(r => r.status === 'pending').length;
  const personnelPending = timeOffRequests.filter(r => r.status === 'pending').length;
  const accessPending  = pendingUsers.length;
  const totalPending   = servicePending + clientPending + personnelPending + accessPending;

  // Service tab: filtered for RequestsClient
  const filteredServiceRequests = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return serviceRequests;
    return serviceRequests.filter(r =>
      (r.id || '').toLowerCase().includes(q) ||
      (r.clientName || '').toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q) ||
      (r.location || '').toLowerCase().includes(q)
    );
  }, [serviceRequests, searchQuery]);

  const serviceRequested = filteredServiceRequests
    .filter(r => r.status === 'new' || r.status === 'reviewed')
    .sort((a, b) => (PRIORITY_ORDER[b.priority] || 0) - (PRIORITY_ORDER[a.priority] || 0));
  const serviceApproved  = filteredServiceRequests.filter(r => r.status === 'approved');
  const serviceArchived  = filteredServiceRequests.filter(r => r.status === 'closed' || r.status === 'rejected');

  // All tab: normalized across types, pending only
  const allNormalized = useMemo<NormalizedItem[]>(() => {
    const items: NormalizedItem[] = [];
    serviceRequests.filter(r => r.status === 'new' || r.status === 'reviewed').forEach(r => {
      items.push({
        id: r.id, kind: 'service',
        title: r.clientName || r.id,
        subtitle: r.requestType || 'Service Request',
        meta: r.location || '',
        status: r.status, priority: r.priority,
        date: r.submittedDate || '',
      });
    });
    siteRequests.filter(r => r.status === 'pending').forEach(r => {
      items.push({
        id: r.id, kind: 'client',
        title: r.siteName || r.clientName,
        subtitle: `Site Request — ${r.clientName}`,
        meta: r.location || '',
        status: 'pending',
        date: r.submittedDate || '',
      });
    });
    timeOffRequests.filter(r => r.status === 'pending').forEach(r => {
      const tech = technicians.find(t => t.id === r.techId);
      items.push({
        id: r.id, kind: 'personnel',
        title: tech?.name || r.techId,
        subtitle: `${r.type} — ${r.startDate} to ${r.endDate}`,
        meta: r.reason || '',
        status: 'pending',
        date: r.startDate || '',
      });
    });
    pendingUsers.forEach(u => {
      items.push({
        id: u.id, kind: 'access',
        title: u.name || u.email || u.id,
        subtitle: `Account Access Request`,
        meta: u.email || '',
        status: 'pending',
        date: (u as any).requestedAt || '',
      });
    });
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [serviceRequests, siteRequests, timeOffRequests, pendingUsers, technicians]);

  const kindMeta: Record<string, { label: string; cls: string }> = {
    service:   { label: 'Service',   cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
    client:    { label: 'Client',    cls: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
    personnel: { label: 'Personnel', cls: 'bg-amber-400/10 text-amber-400 border-amber-400/30' },
    access:    { label: 'Access',    cls: 'bg-text-green/10 text-text-green border-text-green/30' },
  };

  // Archived: closed from all types
  const archivedService  = serviceRequests.filter(r => r.status === 'closed' || r.status === 'rejected');
  const archivedClient   = siteRequests.filter(r => r.status !== 'pending');
  const archivedPersonnel = timeOffRequests.filter(r => r.status === 'approved' || r.status === 'denied');
  const archivedTotalCount = archivedService.length + archivedClient.length + archivedPersonnel.length;

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2">
            <Inbox size={12} />
            Universal Intake
          </p>
          <h1 className="page-title">Requests</h1>
          <p className="page-subtitle">Triage, approve, and route all incoming requests across operations.</p>
        </div>
        <div className="page-header-right items-center">
          <Button variant="default" size="default" onClick={() => setIsNewDialogOpen(true)}>
            <Plus size={16} className="mr-2" />
            New Service Request
          </Button>
        </div>
      </header>

      <Tabs defaultValue="all" className="w-full">
        <div className="flex items-center gap-3 mb-4">
          <TabsList className="tabs flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="all" className="tab">
              All<TabCount n={totalPending} />
            </TabsTrigger>
            <TabsTrigger value="service" className="tab">
              Service<TabCount n={servicePending} />
            </TabsTrigger>
            <TabsTrigger value="client" className="tab">
              Client<TabCount n={clientPending} />
            </TabsTrigger>
            <TabsTrigger value="personnel" className="tab">
              Personnel<TabCount n={personnelPending} />
            </TabsTrigger>
            <TabsTrigger value="access" className="tab">
              Account Access<TabCount n={accessPending} />
            </TabsTrigger>
            <TabsTrigger value="subscription" className="tab">
              Subscription
            </TabsTrigger>
            <TabsTrigger value="archived" className="tab">
              Archived<TabCount n={archivedTotalCount} />
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── All ── */}
        <TabsContent value="all" className="mt-0">
          {allNormalized.length === 0 ? (
            <div className="py-16 text-center text-text-muted">
              <Inbox size={28} className="mx-auto mb-3 opacity-20" />
              <p className="text-[11px]">No pending requests across any category</p>
            </div>
          ) : (
            <div className="space-y-2">
              {allNormalized.map(item => {
                const km = kindMeta[item.kind];
                return (
                  <div key={`${item.kind}-${item.id}`}
                    className="rounded-xl border border-border-sub bg-bg-secondary px-4 py-3 flex items-start gap-4">
                    <div className="shrink-0 mt-0.5">
                      <span className={cn('text-[9px] px-2 py-0.5 rounded border font-bold uppercase tracking-widest', km.cls)}>
                        {km.label}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-text-primary truncate">{item.title}</p>
                      <p className="text-[10px] text-text-muted">{item.subtitle}</p>
                      {item.meta && (
                        <p className="text-[10px] text-text-muted/70 mt-0.5 truncate">{item.meta}</p>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {item.priority && (
                        <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase', priorityCls(item.priority))}>
                          {item.priority}
                        </span>
                      )}
                      <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase', statusCls(item.status))}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Service ── */}
        <TabsContent value="service" className="mt-0">
          <div className="mb-4">
            <div className="search-wrap !mb-0">
              <Search className="h-4 w-4 text-text-muted" />
              <input
                className="search-input !h-10 !text-xs font-bold uppercase !w-full bg-bg-primary"
                placeholder="Search by ID, client, or scope..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <Tabs defaultValue="requested" className="w-full">
            <TabsList className="tabs">
              <TabsTrigger value="requested" className="tab">
                Requested <span className="tab-count">({serviceRequested.length})</span>
              </TabsTrigger>
              <TabsTrigger value="approved" className="tab">
                Approved <span className="tab-count">({serviceApproved.length})</span>
              </TabsTrigger>
              <TabsTrigger value="closed" className="tab">
                Resolved/Closed <span className="tab-count">({serviceArchived.length})</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="requested" className="mt-0">
              <RequestsClient requests={serviceRequested} workOrders={allWorkOrders} />
            </TabsContent>
            <TabsContent value="approved" className="mt-0">
              <RequestsClient requests={serviceApproved} workOrders={allWorkOrders} />
            </TabsContent>
            <TabsContent value="closed" className="mt-0">
              <RequestsClient requests={serviceArchived} workOrders={allWorkOrders} isHistory />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ── Client ── */}
        <TabsContent value="client" className="mt-0">
          <ClientTab requests={siteRequests} />
        </TabsContent>

        {/* ── Personnel ── */}
        <TabsContent value="personnel" className="mt-0">
          <PersonnelTab requests={timeOffRequests} technicians={technicians} />
        </TabsContent>

        {/* ── Account Access ── */}
        <TabsContent value="access" className="mt-0">
          <AccountAccessTab pendingUsers={pendingUsers} />
        </TabsContent>

        {/* ── Subscription ── */}
        <TabsContent value="subscription" className="mt-0">
          <SubscriptionTab />
        </TabsContent>

        {/* ── Archived ── */}
        <TabsContent value="archived" className="mt-0">
          <div className="space-y-8">
            {archivedService.length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">
                  Service ({archivedService.length})
                </p>
                <RequestsClient requests={archivedService} workOrders={allWorkOrders} isHistory />
              </div>
            )}
            {archivedClient.length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">
                  Client / Site ({archivedClient.length})
                </p>
                <ClientTab requests={archivedClient} />
              </div>
            )}
            {archivedPersonnel.length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">
                  Personnel ({archivedPersonnel.length})
                </p>
                <PersonnelTab requests={archivedPersonnel} technicians={technicians} />
              </div>
            )}
            {archivedTotalCount === 0 && (
              <div className="py-16 text-center text-text-muted">
                <Clock size={28} className="mx-auto mb-3 opacity-20" />
                <p className="text-[11px]">No archived requests yet</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <NewRequestDialog
        isOpen={isNewDialogOpen}
        setIsOpen={setIsNewDialogOpen}
        onSave={handleAddNewRequest}
      />
    </div>
  );
}
