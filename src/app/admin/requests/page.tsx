'use client';

import { useState, useMemo, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { NewRequestDialog } from './components/new-request-dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Inbox, Plus, Clock, CheckCircle2, XCircle, Loader2,
  Search, LayoutGrid, LayoutList, RefreshCw, AlertCircle, AlertTriangle, FileText,
} from 'lucide-react';
import type {
  ServiceRequest, TimeOffRequest, SiteRequest,
  Technician, NewServiceRequest, ClientIntakeRequest, AppRole,
} from '@/lib/types';

import { KIND_CFG, statusCls, priorityCls, priorityLabel, mapSource, type NormalizedItem } from './lib/helpers';
import { Pill, TabCount } from './components/pill';
import { StatCard } from './components/stat-card';
import { FilterGroup } from './components/filter-group';
import { RequestDetailSheet } from './components/request-detail-sheet';
import { UnifiedRequestCard } from './components/unified-request-card';
import { PersonnelTab } from './components/personnel-tab';
import { AccountAccessTab } from './components/account-access-tab';
import { NewServiceTab } from './components/new-service-tab';
import { ClientIntakeTab } from './components/client-intake-tab';
import { SubscriptionTab } from './components/subscription-tab';

const ALL_ROLES: AppRole[] = [
  'super_admin', 'dispatch_admin', 'payroll_admin', 'project_manager',
  'project_lead', 'field_technician', 'client', 'sales',
  'safety_officer', 'training_coordinator',
];

export default function RequestsPage() {
  const { toast } = useToast();

  const [serviceRequests, setServiceRequests] = useState<NewServiceRequest[]>([]);
  const [clientIntakeRequests, setClientIntakeRequests] = useState<ClientIntakeRequest[]>([]);
  const [siteRequests, setSiteRequests] = useState<SiteRequest[]>([]);
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [pendingUsers, setPendingUsers] = useState<Technician[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);

  // Filters
  const [activeTab, _setActiveTabRaw] = useState(() => { try { return localStorage.getItem('cc:requests:tab') || 'all'; } catch { return 'all'; } });
  const setActiveTab = (v: string) => { _setActiveTabRaw(v); try { localStorage.setItem('cc:requests:tab', v); } catch {} };
  const [viewMode, _setViewModeRaw] = useState<'grid' | 'list'>(() => { try { return (localStorage.getItem('cc:requests:view') as 'grid' | 'list') || 'grid'; } catch { return 'grid'; } });
  const setViewMode = (v: 'grid' | 'list') => { _setViewModeRaw(v); try { localStorage.setItem('cc:requests:view', v); } catch {} };
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'urgent' | 'normal' | 'low'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'App' | 'Form' | 'Manual'>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'priority'>('newest');

  // Detail sheet (All tab)
  const [detailItem, setDetailItem] = useState<NormalizedItem | null>(null);

  // All-tab access approval dialog
  const [allTabApproveUser, setAllTabApproveUser] = useState<Technician | null>(null);
  const [allTabRoles, setAllTabRoles] = useState<AppRole[]>([]);
  const [allTabPrimary, setAllTabPrimary] = useState<AppRole | ''>('');
  const [allTabApproving, setAllTabApproving] = useState(false);

  useEffect(() => {
    const u1 = onSnapshot(
      collection(db, 'serviceRequests'),
      snap => {
        try {
          setServiceRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as NewServiceRequest)));
        } catch (e) { console.error('serviceRequests mapping error', e); }
      },
      err => { console.error('serviceRequests snapshot error', err); },
    );
    const u2 = onSnapshot(
      collection(db, 'siteRequests'),
      snap => {
        try {
          setSiteRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as SiteRequest)));
        } catch (e) { console.error('siteRequests mapping error', e); }
      },
      err => { console.error('siteRequests snapshot error', err); },
    );
    const u3 = onSnapshot(
      collection(db, 'timeOffRequests'),
      snap => {
        try {
          setTimeOffRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as TimeOffRequest)));
        } catch (e) { console.error('timeOffRequests mapping error', e); }
      },
      err => { console.error('timeOffRequests snapshot error', err); },
    );
    const u4 = onSnapshot(
      collection(db, 'users'),
      snap => {
        try {
          const all = snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician));
          setTechnicians(all);
          setPendingUsers(all.filter(u => (u as any).approvalStatus === 'pending'));
        } catch (e) { console.error('users mapping error', e); }
      },
      err => { console.error('users snapshot error', err); },
    );
    const u6 = onSnapshot(
      collection(db, 'clientRequests'),
      snap => {
        try {
          setClientIntakeRequests(
            snap.docs.map(d => ({ ...d.data(), id: d.id } as ClientIntakeRequest))
              .filter(r => r.source === 'app_client_intake' || r.source === 'public_client_intake' || r.source === 'client_intake_form' || !!r.companyName)
          );
        } catch (e) { console.error('clientRequests mapping error', e); }
      },
      err => { console.error('clientRequests snapshot error', err); },
    );
    return () => { u1(); u2(); u3(); u4(); u6(); };
  }, []);

  const handleAddNewRequest = async (request: ServiceRequest) => {
    try {
      await setDoc(doc(db, 'clientRequests', request.id), { ...request });
      toast({ title: 'Request Added' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };

  // ── Counts ──────────────────────────────────────────────────────────────────
  const servicePending = serviceRequests.filter(r => ['pending_review', 'contacted', 'needs_more_info'].includes(r.status)).length;
  const clientPending = clientIntakeRequests.filter(r => ['pending_review', 'contacted'].includes(r.status)).length + siteRequests.filter(r => r.status === 'pending').length;
  const personnelPending = timeOffRequests.filter(r => r.status === 'pending').length;
  const accessPending = pendingUsers.length;
  const totalPending = servicePending + clientPending + personnelPending + accessPending;

  const archivedService = serviceRequests.filter(r => ['rejected', 'closed', 'converted_to_work_order', 'converted_to_project'].includes(r.status));
  const archivedIntake = clientIntakeRequests.filter(r => ['rejected', 'approved', 'converted_to_client'].includes(r.status));
  const archivedSiteReqs = siteRequests.filter(r => r.status !== 'pending');
  const archivedPersonnel = timeOffRequests.filter(r => r.status === 'approved' || r.status === 'denied');
  const archivedTotalCount = archivedService.length + archivedIntake.length + archivedSiteReqs.length + archivedPersonnel.length;

  const urgentCount = serviceRequests.filter(r => ['critical', 'high'].includes(r.priorityLevel) && ['pending_review', 'contacted'].includes(r.status)).length;
  const approvedCount = [
    ...serviceRequests.filter(r => ['approved', 'converted_to_work_order'].includes(r.status)),
    ...clientIntakeRequests.filter(r => ['approved', 'converted_to_client'].includes(r.status)),
    ...timeOffRequests.filter(r => r.status === 'approved'),
  ].length;
  const rejectedCount = [
    ...serviceRequests.filter(r => ['rejected', 'closed'].includes(r.status)),
    ...clientIntakeRequests.filter(r => ['denied', 'rejected'].includes(r.status)),
    ...timeOffRequests.filter(r => r.status === 'denied'),
  ].length;

  // ── Normalized items for "All" tab ─────────────────────────────────────────
  const allNormalized = useMemo<NormalizedItem[]>(() => {
    try {
      const items: NormalizedItem[] = [];

      (serviceRequests || []).filter(r => r?.status && ['pending_review', 'contacted', 'needs_more_info'].includes(r.status)).forEach(r => {
        try {
          items.push({
            id: r.id ?? '',
            kind: 'service',
            title: (r.serviceTypes || [])[0] || r.fullName || 'Service Request',
            company: r.companyName || '',
            contactName: r.fullName || '',
            phone: r.phoneNumber || '',
            email: r.email || '',
            source: mapSource(r.source),
            date: r.createdAt || '',
            description: r.detailedDescription || '',
            status: r.status || 'pending_review',
            priority: r.priorityLevel || 'medium',
            rawServiceReq: r,
          });
        } catch { /* skip malformed item */ }
      });

      (clientIntakeRequests || []).filter(r => r?.status && ['pending_review', 'contacted'].includes(r.status)).forEach(r => {
        try {
          items.push({
            id: r.id ?? '',
            kind: 'client',
            title: r.companyName || 'Client Onboarding',
            company: r.companyName || '',
            contactName: r.primaryContactName || '',
            phone: r.phoneNumber || '',
            email: r.email || '',
            source: mapSource(r.source),
            date: r.createdAt || '',
            description: r.currentPainPoints || '',
            status: r.status || 'pending_review',
            priority: 'medium',
            rawClientReq: r,
          });
        } catch { /* skip malformed item */ }
      });

      (timeOffRequests || []).filter(r => r?.status === 'pending').forEach(r => {
        try {
          const tech = (technicians || []).find(t => t.id === r.techId);
          items.push({
            id: r.id ?? '',
            kind: 'personnel',
            title: `${r.type || 'Time Off'} Request`,
            company: '',
            contactName: tech?.name || r.techId || '',
            phone: (tech as any)?.phone || '',
            email: (tech as any)?.email || '',
            source: 'App',
            date: r.startDate || '',
            description: r.reason || '',
            status: r.status || 'pending',
            priority: 'medium',
            rawTimeOff: r,
          });
        } catch { /* skip malformed item */ }
      });

      (pendingUsers || []).forEach(u => {
        try {
          items.push({
            id: u.id ?? '',
            kind: 'access',
            title: 'Account Access Request',
            company: '',
            contactName: u.name || 'Unknown',
            phone: (u as any).phone || '',
            email: u.email || '',
            source: mapSource((u as any).createdVia),
            date: (u as any).requestedAt || (u as any).createdAt || '',
            description: `Requesting access as ${(u as any).requestedRole || 'a team member'}.`,
            status: 'pending',
            priority: 'medium',
            rawUser: u,
          });
        } catch { /* skip malformed item */ }
      });

      return items.sort((a, b) => {
        const da = a.date || '';
        const dbv = b.date || '';
        if (sortOrder === 'oldest') return da.localeCompare(dbv);
        return dbv.localeCompare(da);
      });
    } catch (e) {
      console.error('allNormalized useMemo error', e);
      return [];
    }
  }, [serviceRequests, clientIntakeRequests, siteRequests, timeOffRequests, pendingUsers, technicians, sortOrder]);

  // Apply All-tab filters
  const filteredAll = useMemo(() => {
    try {
      let items = allNormalized || [];
      const q = (searchQuery || '').toLowerCase();
      if (q) items = items.filter(i =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.company || '').toLowerCase().includes(q) ||
        (i.contactName || '').toLowerCase().includes(q) ||
        (i.email || '').toLowerCase().includes(q) ||
        (i.phone || '').includes(q)
      );
      if (statusFilter === 'pending') items = items.filter(i => ['pending_review', 'pending', 'contacted', 'needs_more_info'].includes(i.status || ''));
      if (statusFilter === 'approved') items = items.filter(i => ['approved', 'converted_to_client', 'converted_to_work_order'].includes(i.status || ''));
      if (statusFilter === 'rejected') items = items.filter(i => ['rejected', 'denied', 'closed'].includes(i.status || ''));
      if (priorityFilter === 'urgent') items = items.filter(i => ['critical', 'high'].includes(i.priority || ''));
      if (priorityFilter === 'normal') items = items.filter(i => i.priority === 'medium');
      if (priorityFilter === 'low') items = items.filter(i => i.priority === 'low');
      if (sourceFilter !== 'all') items = items.filter(i => i.source === sourceFilter);
      return items;
    } catch (e) {
      console.error('filteredAll useMemo error', e);
      return [];
    }
  }, [allNormalized, searchQuery, statusFilter, priorityFilter, sourceFilter]);

  // Filtered service requests (for Service tab)
  const filteredServiceRequests = useMemo(() => {
    try {
      const q = (searchQuery || '').toLowerCase();
      let items = serviceRequests || [];
      if (q) items = items.filter(r =>
        (r.fullName || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.companyName || '').toLowerCase().includes(q) ||
        (r.id || '').toLowerCase().includes(q)
      );
      if (statusFilter === 'pending') items = items.filter(r => ['pending_review', 'contacted', 'needs_more_info'].includes(r.status || ''));
      if (statusFilter === 'approved') items = items.filter(r => ['approved', 'converted_to_work_order', 'converted_to_project'].includes(r.status || ''));
      if (statusFilter === 'rejected') items = items.filter(r => ['rejected', 'closed'].includes(r.status || ''));
      return items;
    } catch (e) {
      console.error('filteredServiceRequests useMemo error', e);
      return serviceRequests || [];
    }
  }, [serviceRequests, searchQuery, statusFilter]);

  // All-tab actions
  const handleAllApprove = async (item: NormalizedItem) => {
    if (item.kind === 'access' && item.rawUser) {
      setAllTabApproveUser(item.rawUser);
      setAllTabRoles([]);
      setAllTabPrimary('');
      setDetailItem(null);
      return;
    }
    try {
      if (item.kind === 'service' && item.rawServiceReq) {
        await updateDoc(doc(db, 'serviceRequests', item.id), { status: 'approved', reviewedBy: auth.currentUser?.uid || null, reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      } else if (item.kind === 'client' && item.rawClientReq) {
        await updateDoc(doc(db, 'clientRequests', item.id), { status: 'approved', reviewedBy: auth.currentUser?.uid || null, reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      } else if (item.kind === 'personnel' && item.rawTimeOff) {
        await updateDoc(doc(db, 'timeOffRequests', item.id), { status: 'approved' });
      }
      toast({ title: 'Approved' });
      setDetailItem(null);
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const handleAllTabGrantAccess = async () => {
    if (!allTabApproveUser || allTabRoles.length === 0 || !allTabPrimary) return;
    setAllTabApproving(true);
    try {
      const adminUid = auth.currentUser?.uid || '';
      await updateDoc(doc(db, 'users', allTabApproveUser.id), {
        roles: allTabRoles, role: allTabPrimary, primaryRole: allTabPrimary,
        approvalStatus: 'approved', status: 'active',
        approvedAt: new Date().toISOString(), approvedBy: adminUid, updatedAt: new Date().toISOString(),
      });
      toast({ title: 'Access Granted', description: `${allTabApproveUser.name} approved as ${allTabPrimary}.` });
      setAllTabApproveUser(null); setAllTabRoles([]); setAllTabPrimary('');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setAllTabApproving(false); }
  };

  const handleAllReject = async (item: NormalizedItem) => {
    try {
      if (item.kind === 'service') {
        await updateDoc(doc(db, 'serviceRequests', item.id), { status: 'rejected', reviewedBy: auth.currentUser?.uid || null, reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      } else if (item.kind === 'client') {
        await updateDoc(doc(db, 'clientRequests', item.id), { status: 'denied', reviewedBy: auth.currentUser?.uid || null, reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      } else if (item.kind === 'personnel') {
        await updateDoc(doc(db, 'timeOffRequests', item.id), { status: 'denied' });
      }
      toast({ title: 'Rejected' });
      setDetailItem(null);
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const handleAllConvert = (_item: NormalizedItem) => {
    toast({ title: 'Convert to Job', description: 'Navigate to the Service tab to convert this request.' });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="page-header">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2"><Inbox size={12} />Universal Intake</p>
          <h1 className="page-title">Requests</h1>
          <p className="page-subtitle">Triage, approve, and route all incoming requests across operations.</p>
        </div>
        <div className="page-header-right items-center gap-2">
          <Button variant="outline" size="default" className="text-[10px] font-bold uppercase tracking-widest h-9" onClick={() => toast({ title: 'Sync Google Forms', description: 'Google Forms sync is not configured.' })}>
            <RefreshCw size={13} className="mr-1.5" />Sync Google Forms
          </Button>
          {activeTab === 'service' && (
            <Button variant="default" size="default" className="h-9 text-[10px] font-bold uppercase tracking-widest" onClick={() => setIsNewDialogOpen(true)}>
              <Plus size={14} className="mr-1.5" />New Service Request
            </Button>
          )}
        </div>
      </header>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Pending Review" count={totalPending} icon={AlertCircle} description="Needs admin action" variant="default" />
        <StatCard label="Urgent" count={urgentCount} icon={AlertTriangle} description="High priority items" variant="urgent" />
        <StatCard label="Approved" count={approvedCount} icon={CheckCircle2} description="Recently approved" variant="approved" />
        <StatCard label="Rejected" count={rejectedCount} icon={XCircle} description="Not approved" variant="muted" />
        <StatCard label="Archived" count={archivedTotalCount} icon={Clock} description="Completed / closed" variant="muted" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-between gap-3 mb-0">
          <div className="overflow-x-auto">
            <TabsList className="tabs h-auto gap-0 p-0 bg-transparent border-b border-border-sub rounded-none w-max">
              {[
                { value: 'all', label: 'All', count: totalPending },
                { value: 'service', label: 'Service', count: servicePending },
                { value: 'client', label: 'Client', count: clientPending },
                { value: 'personnel', label: 'Personnel', count: personnelPending },
                { value: 'access', label: 'Account Access', count: accessPending },
                { value: 'subscription', label: 'Subscription', count: 0 },
                { value: 'archived', label: 'Archived', count: archivedTotalCount },
              ].map(t => (
                <TabsTrigger key={t.value} value={t.value}
                  className={cn(
                    'relative h-10 px-4 rounded-none border-0 border-b-2 text-[10px] font-bold uppercase tracking-widest transition-colors shrink-0',
                    activeTab === t.value
                      ? 'border-brand-red text-text-primary'
                      : 'border-transparent text-text-muted hover:text-text-secondary'
                  )}>
                  {t.label}{t.count > 0 && <TabCount n={t.count} />}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button type="button" onClick={() => setViewMode('grid')}
              className={cn('p-1.5 rounded transition-colors', viewMode === 'grid' ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-primary')}>
              <LayoutGrid size={14} />
            </button>
            <button type="button" onClick={() => setViewMode('list')}
              className={cn('p-1.5 rounded transition-colors', viewMode === 'list' ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-primary')}>
              <LayoutList size={14} />
            </button>
          </div>
        </div>

        {/* Filter + search row */}
        <div className="py-3 border-b border-border-sub space-y-2.5">
          <div className="flex items-center gap-4 flex-wrap">
            <FilterGroup
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'pending', label: 'Pending' },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' },
              ]}
            />
            <FilterGroup
              label="Priority"
              value={priorityFilter}
              onChange={setPriorityFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'urgent', label: 'Urgent' },
                { value: 'normal', label: 'Normal' },
                { value: 'low', label: 'Low' },
              ]}
            />
            <FilterGroup
              label="Source"
              value={sourceFilter}
              onChange={setSourceFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'App', label: 'App' },
                { value: 'Form', label: 'Form' },
                { value: 'Manual', label: 'Manual' },
              ]}
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="search-wrap flex-1 !mb-0">
              <Search className="h-4 w-4 text-text-muted" />
              <input
                className="search-input !h-9 !text-xs !w-full bg-bg-primary"
                placeholder="Search requests, company, contact, email, phone..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={sortOrder} onValueChange={v => setSortOrder(v as typeof sortOrder)}>
              <SelectTrigger className="h-9 w-[170px] text-[10px] font-bold bg-bg-secondary border-border-main shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                <SelectItem value="newest" className="text-[10px] font-bold">Sort: Newest First</SelectItem>
                <SelectItem value="oldest" className="text-[10px] font-bold">Sort: Oldest First</SelectItem>
                <SelectItem value="priority" className="text-[10px] font-bold">Sort: Priority</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── All ── */}
        <TabsContent value="all" className="mt-4">
          {filteredAll.length === 0 ? (
            <div className="py-16 text-center text-text-muted">
              <Inbox size={28} className="mx-auto mb-3 opacity-20" />
              <p className="text-[11px]">No pending requests across any category</p>
            </div>
          ) : (
            <div className={viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'
              : 'space-y-1'
            }>
              {filteredAll.map(item => (
                viewMode === 'grid' ? (
                  <UnifiedRequestCard
                    key={`${item.kind}-${item.id}`}
                    item={item}
                    onOpen={() => setDetailItem(item)}
                    onApprove={() => handleAllApprove(item)}
                    onReject={() => handleAllReject(item)}
                  />
                ) : (
                  <div key={`${item.kind}-${item.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border-sub bg-bg-secondary hover:border-border-main transition-colors">
                    <Pill cls={KIND_CFG[item.kind].cls} label={KIND_CFG[item.kind].label} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-text-primary truncate">{item.title}</p>
                      <p className="text-[10px] text-text-muted">{item.contactName}{item.company ? ` · ${item.company}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.priority && <Pill cls={priorityCls(item.priority)} label={priorityLabel(item.priority)} />}
                      <Pill cls={statusCls(item.status)} label={(item.status || '').replace(/_/g, ' ')} />
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[9px] font-bold" onClick={() => setDetailItem(item)}>
                        <FileText size={9} className="mr-1" />Open
                      </Button>
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Service ── */}
        <TabsContent value="service" className="mt-4">
          <NewServiceTab requests={filteredServiceRequests} viewMode={viewMode} />
        </TabsContent>

        {/* ── Client ── */}
        <TabsContent value="client" className="mt-4">
          <ClientIntakeTab requests={clientIntakeRequests} siteReqs={siteRequests} viewMode={viewMode} />
        </TabsContent>

        {/* ── Personnel ── */}
        <TabsContent value="personnel" className="mt-4">
          <PersonnelTab requests={timeOffRequests} technicians={technicians} viewMode={viewMode} />
        </TabsContent>

        {/* ── Account Access ── */}
        <TabsContent value="access" className="mt-4">
          <AccountAccessTab pendingUsers={pendingUsers} />
        </TabsContent>

        {/* ── Subscription ── */}
        <TabsContent value="subscription" className="mt-4">
          <SubscriptionTab />
        </TabsContent>

        {/* ── Archived ── */}
        <TabsContent value="archived" className="mt-4">
          <div className="space-y-8">
            {(archivedService || []).length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">Service Requests ({(archivedService || []).length})</p>
                <NewServiceTab requests={archivedService || []} viewMode={viewMode} />
              </div>
            )}
            {(archivedIntake || []).length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">Client Applications ({(archivedIntake || []).length})</p>
                <ClientIntakeTab requests={archivedIntake || []} siteReqs={[]} viewMode={viewMode} />
              </div>
            )}
            {(archivedPersonnel || []).length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">Personnel ({(archivedPersonnel || []).length})</p>
                <PersonnelTab requests={archivedPersonnel || []} technicians={technicians || []} viewMode={viewMode} />
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

      {/* Detail sheet (All tab) */}
      <RequestDetailSheet
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onApprove={handleAllApprove}
        onReject={handleAllReject}
        onConvert={handleAllConvert}
      />

      <NewRequestDialog
        isOpen={isNewDialogOpen}
        setIsOpen={setIsNewDialogOpen}
        onSave={handleAddNewRequest}
      />

      {/* All-tab access approval dialog */}
      <Dialog open={!!allTabApproveUser} onOpenChange={v => !v && setAllTabApproveUser(null)}>
        <DialogContent className="bg-bg-secondary border-border-main max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[12px] font-black uppercase tracking-widest">Assign Role — {allTabApproveUser?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-2">Roles</p>
              <div className="grid grid-cols-2 gap-2">
                {ALL_ROLES.map(role => (
                  <div key={role} className="flex items-center gap-2">
                    <Checkbox id={`all-role-${role}`} checked={allTabRoles.includes(role)} onCheckedChange={() => setAllTabRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role])} />
                    <Label htmlFor={`all-role-${role}`} className="text-[10px] font-bold uppercase cursor-pointer">{role.replace(/_/g, ' ')}</Label>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1.5">Primary Role</p>
              <Select value={allTabPrimary} onValueChange={v => setAllTabPrimary(v as AppRole)} disabled={allTabRoles.length === 0}>
                <SelectTrigger className="h-8 text-[11px] bg-bg-tertiary border-border-main"><SelectValue placeholder="Select primary role" /></SelectTrigger>
                <SelectContent className="bg-bg-elevated border-border-main">
                  {allTabRoles.map(r => <SelectItem key={r} value={r} className="text-[10px] font-bold uppercase">{r.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" className="text-[10px] uppercase font-bold" onClick={() => setAllTabApproveUser(null)} disabled={allTabApproving}>Cancel</Button>
            <Button size="sm" className="text-[10px] uppercase font-bold bg-text-green hover:bg-text-green/90 text-white"
              onClick={handleAllTabGrantAccess} disabled={allTabApproving || allTabRoles.length === 0 || !allTabPrimary}>
              {allTabApproving && <Loader2 size={11} className="animate-spin mr-1.5" />}{allTabApproving ? 'Granting...' : 'Grant Access'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
