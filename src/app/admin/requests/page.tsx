'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { db, auth } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import { NewRequestDialog } from './components/new-request-dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';
import {
  Inbox, Plus, Search, CheckCircle2, XCircle, Archive, RotateCcw,
  UserCheck, Wrench, Mail, Phone, MapPin, Globe, Building2,
  ExternalLink, Loader2, ArrowUpRight,
} from 'lucide-react';
import type { ServiceRequest } from '@/lib/types';
import {
  normalizeRequest, formatRequestDate, dateMillis,
  CATEGORY_LABELS, STATUS_LABELS, SOURCE_LABELS,
  type GlobalRequest, type RequestCategory, type RequestStatus,
  type RequestSource, type RequestPriority,
} from '@/lib/request-intake';

// ── Visual helpers ─────────────────────────────────────────────────────────

const STATUS_CLS: Record<RequestStatus, string> = {
  new: 'bg-amber-400/10 text-amber-400 border-amber-400/30',
  pending_review: 'bg-amber-400/10 text-amber-400 border-amber-400/30',
  approved: 'bg-text-green/10 text-text-green border-text-green/30',
  denied: 'bg-brand-red/10 text-brand-red border-brand-red/30',
  converted: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  archived: 'bg-bg-tertiary text-text-muted border-border-sub',
  closed: 'bg-bg-tertiary text-text-muted border-border-sub',
};

const CATEGORY_CLS: Record<RequestCategory, string> = {
  service_ticket: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  client_intake: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  project_request: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
  quote_request: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  general: 'bg-bg-tertiary text-text-muted border-border-sub',
};

const PRIORITY_CLS: Record<RequestPriority, string> = {
  urgent: 'bg-brand-red/10 text-brand-red border-brand-red/30',
  high: 'bg-orange-400/10 text-orange-400 border-orange-400/30',
  medium: 'bg-amber-400/10 text-amber-400 border-amber-400/30',
  low: 'bg-bg-tertiary text-text-muted border-border-sub',
};

function Pill({ cls, label }: { cls: string; label: string }) {
  return (
    <span className={cn('text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border whitespace-nowrap', cls)}>
      {label}
    </span>
  );
}

function TabCount({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-brand-red text-white text-[8px] font-black min-w-[16px] h-4 px-1 leading-none">
      {n > 99 ? '99+' : n}
    </span>
  );
}

// ── Tabs / filters ─────────────────────────────────────────────────────────

type TabId = 'inbox' | 'service' | 'intake' | 'approved' | 'converted' | 'archived';

const TAB_FILTERS: Record<TabId, (r: GlobalRequest) => boolean> = {
  inbox: r => r.status === 'new' || r.status === 'pending_review',
  service: r => r.category === 'service_ticket',
  intake: r => r.category === 'client_intake',
  approved: r => r.status === 'approved',
  converted: r => r.status === 'converted',
  archived: r => r.status === 'archived' || r.status === 'closed' || r.status === 'denied',
};

function FilterGroup<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
      <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest mr-0.5">{label}:</span>
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cn(
            'text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border transition-colors whitespace-nowrap',
            value === o.value
              ? 'bg-bg-tertiary text-text-primary border-border-main'
              : 'text-text-muted border-border-sub hover:border-border-main hover:text-text-secondary'
          )}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function RequestsPage() {
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('admin.requests.manage');

  const [clientRequestDocs, setClientRequestDocs] = useState<GlobalRequest[]>([]);
  const [legacyServiceDocs, setLegacyServiceDocs] = useState<GlobalRequest[]>([]);
  const [selected, setSelected] = useState<GlobalRequest | null>(null);
  const [acting, setActing] = useState(false);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<TabId>('inbox');
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | RequestSource>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | RequestCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | RequestPriority>('all');

  useEffect(() => {
    const u1 = onSnapshot(
      collection(db, 'clientRequests'),
      snap => setClientRequestDocs(snap.docs.map(d => normalizeRequest(d.data(), d.id, 'clientRequests'))),
      err => console.error('clientRequests snapshot error', err),
    );
    // Legacy collection: old public-form submissions live here. New form
    // submissions write to clientRequests; this listener keeps history visible.
    const u2 = onSnapshot(
      collection(db, 'serviceRequests'),
      snap => setLegacyServiceDocs(snap.docs.map(d => normalizeRequest(d.data(), d.id, 'serviceRequests'))),
      err => console.error('serviceRequests snapshot error', err),
    );
    return () => { u1(); u2(); };
  }, []);

  const allRequests = useMemo(
    () => [...clientRequestDocs, ...legacyServiceDocs].sort((a, b) => dateMillis(b.createdAt) - dateMillis(a.createdAt)),
    [clientRequestDocs, legacyServiceDocs]
  );

  // Keep the open detail panel in sync with live data
  useEffect(() => {
    if (!selected) return;
    const fresh = allRequests.find(r => r.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [allRequests]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabCounts = useMemo(() => {
    const counts = {} as Record<TabId, number>;
    (Object.keys(TAB_FILTERS) as TabId[]).forEach(tab => {
      counts[tab] = allRequests.filter(TAB_FILTERS[tab]).length;
    });
    return counts;
  }, [allRequests]);

  const filtered = useMemo(() => {
    let items = allRequests.filter(TAB_FILTERS[activeTab]);
    if (sourceFilter !== 'all') items = items.filter(r => r.source === sourceFilter);
    if (categoryFilter !== 'all') items = items.filter(r => r.category === categoryFilter);
    if (statusFilter !== 'all') items = items.filter(r => r.status === statusFilter);
    if (priorityFilter !== 'all') items = items.filter(r => r.priority === priorityFilter);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      items = items.filter(r =>
        [r.displayName, r.companyName, r.contactName, r.title, r.email, r.phone, r.locationText, r.description]
          .some(v => (v || '').toLowerCase().includes(q))
      );
    }
    return items;
  }, [allRequests, activeTab, sourceFilter, categoryFilter, statusFilter, priorityFilter, searchQuery]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const writeStatus = async (req: GlobalRequest, status: RequestStatus, extra?: Record<string, unknown>) => {
    setActing(true);
    try {
      await updateDoc(doc(db, req.rawCollection, req.rawId), {
        status,
        reviewedBy: auth.currentUser?.uid || null,
        reviewedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...extra,
      });
      toast({ title: STATUS_LABELS[status] });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Update failed', description: e.message });
    } finally { setActing(false); }
  };

  // Existing intake→client conversion (creates a `clients` record and marks
  // the request converted), carried over from the previous intake workflow.
  const convertToClient = async (req: GlobalRequest) => {
    setActing(true);
    try {
      const raw = req.raw;
      const clientId = await createDocId(ID_PREFIXES.CLIENT);
      await setDoc(doc(db, 'clients', clientId), {
        companyName: raw.companyName || null,
        primaryContactName: raw.primaryContactName || null,
        email: raw.email || null,
        phoneNumber: raw.phoneNumber || null,
        companyWebsiteUrl: raw.companyWebsiteUrl || null,
        industryType: raw.industryType || null,
        numberOfLocations: raw.numberOfLocations || null,
        totalEmployeeCount: raw.totalEmployeeCount || null,
        primaryOperatingRegion: raw.primaryOperatingRegion || null,
        serviceInterests: raw.serviceInterests || [],
        subscriptionTier: raw.subscriptionTier || null,
        preferredCommunicationMethod: raw.preferredCommunicationMethod || null,
        sourceClientRequestId: req.rawId,
        status: 'active',
        portalAccessStatus: 'pending_user_setup',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, req.rawCollection, req.rawId), {
        status: 'converted_to_client',
        convertedClientId: clientId,
        reviewedBy: auth.currentUser?.uid || null,
        reviewedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      toast({ title: 'Converted to client', description: `Client record created: ${clientId}` });
      setSelected(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Conversion failed', description: e.message });
    } finally { setActing(false); }
  };

  // Manual request creation reuses the existing dispatch dialog and writes
  // the normalized intake fields.
  const handleAddManualRequest = async (request: ServiceRequest) => {
    try {
      const now = new Date().toISOString();
      const sanitized = Object.fromEntries(Object.entries(request).filter(([, v]) => v !== undefined));
      await setDoc(doc(db, 'clientRequests', request.id), {
        ...sanitized,
        requestCategory: 'service_ticket',
        source: 'manual',
        createdAt: now,
        updatedAt: now,
      });
      toast({ title: 'Request logged' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e.message });
    }
  };

  const isOpen = (r: GlobalRequest) => r.status === 'new' || r.status === 'pending_review';

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <header className="page-header">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2"><Inbox size={12} />Universal Intake</p>
          <h1 className="page-title">Requests</h1>
          <p className="page-subtitle">Review and route every inbound request — app, manual, and public form.</p>
        </div>
        <div className="page-header-right items-center gap-2">
          {canManage && (
            <Button variant="default" size="default" className="h-9 text-[10px] font-bold uppercase tracking-widest" onClick={() => setIsNewDialogOpen(true)}>
              <Plus size={14} className="mr-1.5" />New Request
            </Button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabId)} className="w-full">
        <div className="overflow-x-auto">
          <TabsList className="tabs h-auto gap-0 p-0 bg-transparent border-b border-border-sub rounded-none w-max">
            {([
              { value: 'inbox', label: 'Inbox' },
              { value: 'service', label: 'Service' },
              { value: 'intake', label: 'Client Intake' },
              { value: 'approved', label: 'Approved' },
              { value: 'converted', label: 'Converted' },
              { value: 'archived', label: 'Archived' },
            ] as { value: TabId; label: string }[]).map(t => (
              <TabsTrigger key={t.value} value={t.value}
                className={cn(
                  'relative h-10 px-4 rounded-none border-0 border-b-2 text-[10px] font-bold uppercase tracking-widest transition-colors shrink-0',
                  activeTab === t.value
                    ? 'border-brand-red text-text-primary'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                )}>
                {t.label}{(t.value === 'inbox') && <TabCount n={tabCounts.inbox} />}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {/* Filters + search */}
      <div className="space-y-2.5 py-1 border-b border-border-sub pb-3">
        <div className="flex items-center gap-4 flex-wrap">
          <FilterGroup label="Source" value={sourceFilter} onChange={setSourceFilter}
            options={[{ value: 'all', label: 'All' }, { value: 'app', label: 'App' }, { value: 'manual', label: 'Manual' }, { value: 'form', label: 'Form' }]} />
          <FilterGroup label="Priority" value={priorityFilter} onChange={setPriorityFilter}
            options={[{ value: 'all', label: 'All' }, { value: 'urgent', label: 'Urgent' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }]} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-main bg-bg-primary text-[11px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-red transition-colors"
              placeholder="Search name, company, title, email, phone, location, description..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={categoryFilter} onValueChange={v => setCategoryFilter(v as typeof categoryFilter)}>
            <SelectTrigger className="h-9 w-[160px] text-[10px] font-bold bg-bg-secondary border-border-main shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-bg-elevated border-border-main">
              <SelectItem value="all" className="text-[10px] font-bold">Category: All</SelectItem>
              {(Object.keys(CATEGORY_LABELS) as RequestCategory[]).map(c => (
                <SelectItem key={c} value={c} className="text-[10px] font-bold">{CATEGORY_LABELS[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="h-9 w-[160px] text-[10px] font-bold bg-bg-secondary border-border-main shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-bg-elevated border-border-main">
              <SelectItem value="all" className="text-[10px] font-bold">Status: All</SelectItem>
              {(Object.keys(STATUS_LABELS) as RequestStatus[]).map(s => (
                <SelectItem key={s} value={s} className="text-[10px] font-bold">{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Request list */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-text-muted">
          <Inbox size={28} className="mx-auto mb-3 opacity-20" />
          <p className="text-[11px]">No requests match the current filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(req => (
            <button key={req.id} type="button" onClick={() => setSelected(req)}
              className="rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-2.5 text-left hover:border-border-main transition-colors flex flex-col">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Pill cls={CATEGORY_CLS[req.category]} label={CATEGORY_LABELS[req.category]} />
                <Pill cls={STATUS_CLS[req.status]} label={STATUS_LABELS[req.status]} />
                {req.priority && req.priority !== 'medium' && (
                  <Pill cls={PRIORITY_CLS[req.priority]} label={req.priority} />
                )}
              </div>
              <div className="space-y-0.5">
                <p className="text-[13px] font-bold text-text-primary leading-snug">{req.displayName}</p>
                {req.companyName && req.companyName !== req.displayName && (
                  <p className="text-[10px] text-text-secondary">{req.companyName}</p>
                )}
                {req.contactName && req.contactName !== req.displayName && (
                  <p className="text-[10px] text-text-muted">{req.contactName}</p>
                )}
              </div>
              {(req.email || req.phone) && (
                <div className="flex items-center gap-3 flex-wrap">
                  {req.email && <span className="flex items-center gap-1 text-[9px] text-text-muted truncate"><Mail size={8} className="shrink-0" />{req.email}</span>}
                  {req.phone && <span className="flex items-center gap-1 text-[9px] text-text-muted"><Phone size={8} className="shrink-0" />{req.phone}</span>}
                </div>
              )}
              {req.description && (
                <p className="text-[10px] text-text-secondary leading-relaxed line-clamp-2">{req.description}</p>
              )}
              <p className="text-[9px] text-text-muted mt-auto pt-1">
                {SOURCE_LABELS[req.source]} · {formatRequestDate(req.createdAt, true)}
                {req.updatedAt && <> · Updated {formatRequestDate(req.updatedAt)}</>}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Detail panel */}
      <Sheet open={!!selected} onOpenChange={v => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg bg-bg-secondary border-border-main overflow-y-auto">
          {selected && (
            <div className="py-4 space-y-5">
              <div>
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  <Pill cls={CATEGORY_CLS[selected.category]} label={CATEGORY_LABELS[selected.category]} />
                  <Pill cls={STATUS_CLS[selected.status]} label={STATUS_LABELS[selected.status]} />
                  <Pill cls="bg-bg-tertiary text-text-muted border-border-sub" label={SOURCE_LABELS[selected.source]} />
                  {selected.priority && <Pill cls={PRIORITY_CLS[selected.priority]} label={selected.priority} />}
                </div>
                <p className="text-[15px] font-black text-text-primary">{selected.displayName}</p>
                <p className="text-[9px] text-text-muted font-mono mt-0.5">{selected.rawId.toUpperCase()}</p>
              </div>

              {/* Contact */}
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Contact</p>
                {selected.contactName && <p className="text-[13px] font-bold text-text-primary">{selected.contactName}</p>}
                {selected.companyName && <p className="text-[11px] text-text-secondary flex items-center gap-1"><Building2 size={10} />{selected.companyName}</p>}
                {selected.email && <p className="text-[11px] text-text-muted flex items-center gap-1"><Mail size={10} />{selected.email}</p>}
                {selected.phone && <p className="text-[11px] text-text-muted flex items-center gap-1"><Phone size={10} />{selected.phone}</p>}
                {selected.raw.companyWebsiteUrl && (
                  <a href={selected.raw.companyWebsiteUrl} target="_blank" rel="noreferrer" className="text-[11px] text-text-muted flex items-center gap-1 hover:text-text-primary transition-colors">
                    <Globe size={10} />{selected.raw.companyWebsiteUrl}
                  </a>
                )}
              </div>

              {/* Details */}
              {selected.description && (
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Details</p>
                  <p className="text-[12px] text-text-primary leading-relaxed whitespace-pre-wrap">{selected.description}</p>
                </div>
              )}
              {Array.isArray(selected.raw.serviceTypes) && selected.raw.serviceTypes.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Services</p>
                  <div className="flex flex-wrap gap-1">
                    {selected.raw.serviceTypes.map((t: string) => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-bg-tertiary border border-border-sub text-text-secondary font-medium">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(selected.raw.serviceInterests) && selected.raw.serviceInterests.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Service Interests</p>
                  <div className="flex flex-wrap gap-1">
                    {selected.raw.serviceInterests.map((t: string) => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-bg-tertiary border border-border-sub text-text-secondary font-medium">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {selected.locationText && (
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Location</p>
                  <p className="text-[11px] text-text-secondary flex items-center gap-1"><MapPin size={10} />{selected.locationText}</p>
                </div>
              )}

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Created</p>
                  <p className="text-[11px] text-text-primary">{formatRequestDate(selected.createdAt, true)}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Updated</p>
                  <p className="text-[11px] text-text-primary">{formatRequestDate(selected.updatedAt, true)}</p>
                </div>
              </div>

              {/* Linked records */}
              {(selected.convertedId || selected.convertedClientId) && (
                <div className="space-y-1.5 p-3 rounded-lg bg-bg-tertiary border border-border-sub">
                  <p className="text-[9px] font-black uppercase tracking-widest text-text-muted">Linked Records</p>
                  {selected.convertedClientId && (
                    <p className="text-[10px] text-text-secondary">Client record: <span className="font-mono text-brand-red">{selected.convertedClientId.toUpperCase()}</span></p>
                  )}
                  {selected.convertedId && selected.conversionType === 'project' && (
                    <Link href={`/admin/projects/${selected.convertedId}`} className="text-[10px] text-text-secondary hover:text-text-primary flex items-center gap-1">
                      Project: <span className="font-mono text-brand-red">{selected.convertedId.toUpperCase()}</span><ArrowUpRight size={10} />
                    </Link>
                  )}
                  {selected.convertedId && selected.conversionType !== 'project' && (
                    <Link href={`/admin/assignments/${selected.convertedId}`} className="text-[10px] text-text-secondary hover:text-text-primary flex items-center gap-1">
                      Assignment: <span className="font-mono text-brand-red">{selected.convertedId.toUpperCase()}</span><ArrowUpRight size={10} />
                    </Link>
                  )}
                </div>
              )}

              {/* Actions */}
              {canManage && (
                <div className="border-t border-border-sub pt-4 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Actions</p>
                  <div className="grid grid-cols-2 gap-2">
                    {isOpen(selected) && (
                      <>
                        <Button size="sm" disabled={acting} className="text-[10px] font-bold h-8 bg-text-green hover:bg-text-green/90 text-white"
                          onClick={() => writeStatus(selected, 'approved')}>
                          <CheckCircle2 size={12} className="mr-1.5" />Approve
                        </Button>
                        <Button size="sm" variant="outline" disabled={acting} className="text-[10px] font-bold h-8 border-brand-red/30 text-brand-red hover:bg-brand-red/5"
                          onClick={() => writeStatus(selected, 'denied')}>
                          <XCircle size={12} className="mr-1.5" />Deny
                        </Button>
                      </>
                    )}
                    {selected.category === 'client_intake' && selected.status !== 'converted' && (
                      <Button size="sm" disabled={acting} className="text-[10px] font-bold h-8 bg-blue-600 hover:bg-blue-600/90 text-white col-span-2"
                        onClick={() => convertToClient(selected)}>
                        {acting ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <UserCheck size={12} className="mr-1.5" />}
                        Convert to Client
                      </Button>
                    )}
                    {/* Ticket → work order / project conversion lives in the Dispatch
                        Hub requests tab (existing flow) — link there instead of
                        duplicating the conversion dialog. */}
                    {selected.category === 'service_ticket' && selected.status === 'approved' && selected.rawCollection === 'clientRequests' && (
                      <Link href="/admin/dispatch" className="col-span-2">
                        <Button size="sm" variant="outline" className="text-[10px] font-bold h-8 w-full">
                          <Wrench size={12} className="mr-1.5" />Convert in Dispatch Hub<ExternalLink size={10} className="ml-1.5" />
                        </Button>
                      </Link>
                    )}
                    {(selected.status === 'approved' || selected.status === 'denied' || selected.status === 'closed') && (
                      <Button size="sm" variant="outline" disabled={acting} className="text-[10px] font-bold h-8 col-span-2"
                        onClick={() => writeStatus(selected, 'archived')}>
                        <Archive size={12} className="mr-1.5" />Archive
                      </Button>
                    )}
                    {(selected.status === 'archived' || selected.status === 'denied') && (
                      <Button size="sm" variant="outline" disabled={acting} className="text-[10px] font-bold h-8 col-span-2"
                        onClick={() => writeStatus(selected, 'pending_review')}>
                        <RotateCcw size={12} className="mr-1.5" />Restore to Review
                      </Button>
                    )}
                  </div>
                  {/* NOTE: quote_request / project_request conversions have no
                      supporting backend flow yet — intentionally not offered. */}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <NewRequestDialog
        isOpen={isNewDialogOpen}
        setIsOpen={setIsNewDialogOpen}
        onSave={handleAddManualRequest}
      />
    </div>
  );
}
