'use client';
import { onSharedSnapshot } from '@/lib/shared-snapshot';

import { useState, useMemo, useEffect } from 'react';
import { usePaged, ListPager, PAGE_SIZES_LARGE, PAGE_SIZES_SMALL } from '@/components/list-pager';
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
import { ViewToggle, useViewMode } from '@/components/view-toggle';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { SearchField } from '@/components/search-field';
import { SortControl, type SortOptionDef } from '@/components/list-toolbar';
import { downloadCsv } from '@/app/admin/reports/components/history-tabs';
import { TONE_BADGE, type Tone } from '@/lib/status-styles';
import {
  Inbox, Plus, Search, CheckCircle2, XCircle, Archive, RotateCcw,
  UserCheck, Wrench, Mail, Phone, MapPin, Globe, Building2,
  ExternalLink, Loader2, ArrowUpRight, Download, X,
} from 'lucide-react';
import type { ServiceRequest } from '@/lib/types';
import {
  normalizeRequest, formatRequestDate, dateMillis,
  CATEGORY_LABELS, STATUS_LABELS, SOURCE_LABELS,
  type GlobalRequest, type RequestCategory, type RequestStatus,
  type RequestSource, type RequestPriority,
} from '@/lib/request-intake';

// ── Visual helpers ─────────────────────────────────────────────────────────

/** Neutral chips for category / source; priority uses the shared tones. */
const PRIORITY_TONE: Record<RequestPriority, Tone> = { urgent: 'problem', high: 'progress', medium: 'scheduled', low: 'neutral' };

function Pill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <Badge variant={TONE_BADGE[tone]} className="text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">
      {label}
    </Badge>
  );
}

function TabCount({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-brand-red text-white text-[10px] font-bold min-w-[16px] h-4 px-1 leading-none">
      {n > 99 ? '99+' : n}
    </span>
  );
}

type SortId = 'newest' | 'oldest' | 'priority' | 'client';
const SORT_OPTIONS: SortOptionDef[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'priority', label: 'Priority' },
  { value: 'client', label: 'Client' },
];
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const clientOf = (r: GlobalRequest) => (r.companyName || r.displayName || '').trim();

function exportRequestsCsv(rows: GlobalRequest[], name = 'requests') {
  downloadCsv(name,
    ['Request ID', 'Name', 'Company', 'Contact', 'Email', 'Phone', 'Category', 'Status', 'Priority', 'Source', 'Location', 'Created', 'Updated', 'Description'],
    rows.map(r => [r.rawId.toUpperCase(), r.displayName, r.companyName, r.contactName, r.email, r.phone,
      CATEGORY_LABELS[r.category], STATUS_LABELS[r.status], r.priority || '', SOURCE_LABELS[r.source], r.locationText,
      formatRequestDate(r.createdAt, true), formatRequestDate(r.updatedAt, true), r.description]));
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
      <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mr-0.5">{label}</span>
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cn(
            'text-[12px] font-medium px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap',
            value === o.value
              ? 'bg-brand-red/10 text-brand-red border-brand-red/40'
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
  const [viewMode, setViewMode] = useViewMode('requests');
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | RequestSource>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | RequestCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | RequestPriority>('all');
  const [sortBy, setSortBy] = useState<SortId>('newest');
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const u1 = onSharedSnapshot('clientRequests',
      snap => setClientRequestDocs(snap.docs.map(d => normalizeRequest(d.data(), d.id, 'clientRequests'))),
      err => console.error('clientRequests snapshot error', err),
    );
    // Legacy collection: old public-form submissions live here. New form
    // submissions write to clientRequests; this listener keeps history visible.
    const u2 = onSharedSnapshot('serviceRequests',
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
    const newest = (a: GlobalRequest, b: GlobalRequest) => dateMillis(b.createdAt) - dateMillis(a.createdAt);
    return [...items].sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return -newest(a, b);
        case 'priority': return ((PRIORITY_RANK[a.priority || ''] ?? 4) - (PRIORITY_RANK[b.priority || ''] ?? 4)) || newest(a, b);
        case 'client': return (clientOf(a) || '\uffff').localeCompare(clientOf(b) || '\uffff', undefined, { sensitivity: 'base' }) || newest(a, b);
        default: return newest(a, b);
      }
    });
  }, [allRequests, activeTab, sourceFilter, categoryFilter, statusFilter, priorityFilter, searchQuery, sortBy]);
  const pager = usePaged(filtered, PAGE_SIZES_SMALL, 'admin-requests', [activeTab, sourceFilter, categoryFilter, statusFilter, priorityFilter, searchQuery, sortBy]);

  // Selection follows the visible set: cleared whenever tab / search / filters change.
  useEffect(() => { setChecked(new Set()); }, [activeTab, sourceFilter, categoryFilter, statusFilter, priorityFilter, searchQuery]);
  const checkedRows = useMemo(() => filtered.filter(r => checked.has(r.id)), [filtered, checked]);
  const pageIds = pager.items.map(r => r.id);
  const pageAll = pageIds.length > 0 && pageIds.every(id => checked.has(id));
  const pageSome = pageIds.some(id => checked.has(id));
  const allMatching = filtered.length > 0 && checkedRows.length === filtered.length;
  const toggleOne = (id: string, on: boolean) => setChecked(prev => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n; });
  const togglePage = (on: boolean) => setChecked(prev => { const n = new Set(prev); pageIds.forEach(id => (on ? n.add(id) : n.delete(id))); return n; });

  const filtersOn = sourceFilter !== 'all' || categoryFilter !== 'all' || statusFilter !== 'all' || priorityFilter !== 'all' || !!searchQuery.trim();
  const resetFilters = () => { setSourceFilter('all'); setCategoryFilter('all'); setStatusFilter('all'); setPriorityFilter('all'); setSearchQuery(''); };

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
      <PageHeader
        eyebrow="Intake"
        icon={Inbox}
        title="Requests"
        subtitle="Review and route every incoming request — app, manual and public form."
        actions={canManage && (
          <Button onClick={() => setIsNewDialogOpen(true)}>
            <Plus size={14} className="mr-1.5" />New request
            </Button>
          )}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabId)} className="w-full">
        <div className="overflow-x-auto">
          <TabsList className="tabs w-max">
            {([
              { value: 'inbox', label: 'Inbox' },
              { value: 'service', label: 'Service' },
              { value: 'intake', label: 'Client Intake' },
              { value: 'approved', label: 'Approved' },
              { value: 'converted', label: 'Converted' },
              { value: 'archived', label: 'Archived' },
            ] as { value: TabId; label: string }[]).map(t => (
              <TabsTrigger key={t.value} value={t.value} className="tab shrink-0">
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
          <SearchField
              value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search name, company, email, phone, location…"
            className="flex-1 min-w-[200px]"
            />
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
          <SortControl value={sortBy} onChange={v => setSortBy(v as SortId)} options={SORT_OPTIONS}
            dateAsc={false} onToggleDirection={() => {}} className="shrink-0" />
          <Button variant="outline" className="h-9 shrink-0" disabled={filtered.length === 0}
            onClick={() => exportRequestsCsv(filtered)} title={`Export ${filtered.length} matching request${filtered.length === 1 ? '' : 's'}`}>
            <Download size={14} className="mr-1.5" />CSV ({filtered.length})
          </Button>
          <ViewToggle value={viewMode} onChange={setViewMode} />
          {filtersOn && (
            <Button variant="ghost" size="sm" className="shrink-0 text-brand-red" onClick={resetFilters}>
              <X size={14} className="mr-1" />Reset
            </Button>
          )}
        </div>
      </div>

      {/* Select all + bulk actions */}
      {filtered.length > 0 && (
        <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-2.5 text-[13px]',
          checkedRows.length > 0 ? 'border-brand-red/40 bg-brand-red/5' : 'border-border-main bg-bg-secondary')}>
          <label className="flex items-center gap-2 font-medium text-text-primary">
            <Checkbox checked={pageAll ? true : pageSome ? 'indeterminate' : false}
              onCheckedChange={c => togglePage(c === true)} aria-label="Select all requests on this page" />
            {checkedRows.length > 0 ? `${checkedRows.length} selected` : 'Select all'}
          </label>
          {checkedRows.length > 0 && (
            <>
              {!allMatching && pageAll && filtered.length > pager.items.length && (
                <button type="button" className="font-medium text-brand-red hover:underline" onClick={() => setChecked(new Set(filtered.map(r => r.id)))}>
                  Select all {filtered.length} matching
                </button>
              )}
              {allMatching && filtered.length > pager.items.length && (
                <span className="text-text-muted">All {filtered.length} matching requests selected</span>
              )}
              <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
                <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => exportRequestsCsv(checkedRows, 'requests_selected')}>
                  <Download size={14} className="mr-1.5" />Export selected (CSV)
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setChecked(new Set())} aria-label="Clear selection">
                  <X size={14} className="mr-1" />Clear
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Request list */}
      {filtered.length === 0 ? (
        filtersOn ? (
          <EmptyState icon={Search} title="No requests match these filters"
            action={<Button variant="outline" size="sm" onClick={resetFilters}>Reset filters</Button>} />
        ) : (
          <EmptyState icon={Inbox} title="No requests here yet" description="New requests from the app, the public form or manual entry show up here." />
        )
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {pager.items.map(req => (
            <div key={req.id} className={cn('relative rounded-xl border bg-bg-secondary shadow-sm transition-colors hover:border-text-muted',
              checked.has(req.id) ? 'border-brand-red/50' : 'border-border-main')}>
            <div className="absolute right-3 top-3 z-10">
              <Checkbox className="h-5 w-5" checked={checked.has(req.id)} onCheckedChange={c => toggleOne(req.id, c === true)}
                aria-label={`Select request ${req.displayName}`} />
            </div>
            <button type="button" onClick={() => setSelected(req)}
              className="h-full w-full p-4 pr-10 space-y-2.5 text-left flex flex-col">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Pill label={CATEGORY_LABELS[req.category]} />
                <StatusBadge kind="request" value={req.status} label={STATUS_LABELS[req.status]} />
                {req.priority && req.priority !== 'medium' && (
                  <Pill tone={PRIORITY_TONE[req.priority]} label={req.priority} />
                )}
              </div>
              <div className="space-y-0.5">
                <p className="text-[13px] font-bold text-text-primary leading-snug">{req.displayName}</p>
                {req.companyName && req.companyName !== req.displayName && (
                  <p className="text-[12px] text-text-secondary">{req.companyName}</p>
                )}
                {req.contactName && req.contactName !== req.displayName && (
                  <p className="text-[12px] text-text-muted">{req.contactName}</p>
                )}
              </div>
              {(req.email || req.phone) && (
                <div className="flex items-center gap-3 flex-wrap">
                  {req.email && <span className="flex items-center gap-1 text-[11px] text-text-muted truncate"><Mail size={11} className="shrink-0" />{req.email}</span>}
                  {req.phone && <span className="flex items-center gap-1 text-[11px] text-text-muted"><Phone size={11} className="shrink-0" />{req.phone}</span>}
                </div>
              )}
              {req.description && (
                <p className="text-[12px] text-text-secondary leading-relaxed line-clamp-2">{req.description}</p>
              )}
              <p className="text-[11px] text-text-muted mt-auto pt-1">
                {SOURCE_LABELS[req.source]} · {formatRequestDate(req.createdAt, true)}
                {req.updatedAt && <> · Updated {formatRequestDate(req.updatedAt)}</>}
              </p>
            </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {pager.items.map(req => (
            <div key={req.id} className={cn('flex items-center gap-3 rounded-lg border bg-bg-secondary pl-4 transition-colors hover:border-text-muted',
              checked.has(req.id) ? 'border-brand-red/50' : 'border-border-main')}>
            <Checkbox className="h-5 w-5 shrink-0" checked={checked.has(req.id)} onCheckedChange={c => toggleOne(req.id, c === true)}
              aria-label={`Select request ${req.displayName}`} />
            <button type="button" onClick={() => setSelected(req)}
              className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-4 text-left">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-text-primary truncate">{req.displayName}</p>
                <p className="text-[12px] text-text-muted truncate">
                  {[req.contactName, req.companyName].filter(Boolean).filter(v => v !== req.displayName).join(' · ')}
                  {(req.contactName || req.companyName) && ' · '}
                  {SOURCE_LABELS[req.source]} · {formatRequestDate(req.createdAt)}
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                <Pill label={CATEGORY_LABELS[req.category]} />
                {req.priority && req.priority !== 'medium' && <Pill tone={PRIORITY_TONE[req.priority]} label={req.priority} />}
              </div>
              <StatusBadge kind="request" value={req.status} label={STATUS_LABELS[req.status]} />
            </button>
            </div>
          ))}
        </div>
      )}

      <ListPager pager={pager} noun="requests" />

      {/* Detail panel */}
      <Sheet open={!!selected} onOpenChange={v => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg bg-bg-secondary border-border-main overflow-y-auto">
          {selected && (
            <div className="py-4 space-y-5">
              <div>
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  <Pill label={CATEGORY_LABELS[selected.category]} />
                  <StatusBadge kind="request" value={selected.status} label={STATUS_LABELS[selected.status]} />
                  <Pill label={SOURCE_LABELS[selected.source]} />
                  {selected.priority && <Pill tone={PRIORITY_TONE[selected.priority]} label={selected.priority} />}
                </div>
                <p className="text-[15px] font-bold text-text-primary">{selected.displayName}</p>
                <p className="text-[11px] text-text-muted font-mono mt-0.5">{selected.rawId.toUpperCase()}</p>
              </div>

              {/* Contact */}
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Contact</p>
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
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Details</p>
                  <p className="text-[12px] text-text-primary leading-relaxed whitespace-pre-wrap">{selected.description}</p>
                </div>
              )}
              {Array.isArray(selected.raw.serviceTypes) && selected.raw.serviceTypes.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Services</p>
                  <div className="flex flex-wrap gap-1">
                    {selected.raw.serviceTypes.map((t: string) => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-bg-tertiary border border-border-sub text-text-secondary font-medium">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(selected.raw.serviceInterests) && selected.raw.serviceInterests.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Service interests</p>
                  <div className="flex flex-wrap gap-1">
                    {selected.raw.serviceInterests.map((t: string) => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-bg-tertiary border border-border-sub text-text-secondary font-medium">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {selected.locationText && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Location</p>
                  <p className="text-[11px] text-text-secondary flex items-center gap-1"><MapPin size={10} />{selected.locationText}</p>
                </div>
              )}

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Created</p>
                  <p className="text-[11px] text-text-primary">{formatRequestDate(selected.createdAt, true)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Updated</p>
                  <p className="text-[11px] text-text-primary">{formatRequestDate(selected.updatedAt, true)}</p>
                </div>
              </div>

              {/* Linked records */}
              {(selected.convertedId || selected.convertedClientId) && (
                <div className="space-y-1.5 p-3 rounded-lg bg-bg-tertiary border border-border-sub">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Linked records</p>
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
                      Job: <span className="font-mono text-brand-red">{selected.convertedId.toUpperCase()}</span><ArrowUpRight size={10} />
                    </Link>
                  )}
                </div>
              )}

              {/* Actions */}
              {canManage && (
                <div className="border-t border-border-sub pt-4 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Actions</p>
                  <div className="grid grid-cols-2 gap-2">
                    {isOpen(selected) && (
                      <>
                        <Button size="sm" disabled={acting} className="text-[12px] font-semibold h-8 bg-text-green hover:bg-text-green/90 text-white"
                          onClick={() => writeStatus(selected, 'approved')}>
                          <CheckCircle2 size={12} className="mr-1.5" />Approve
                        </Button>
                        <Button size="sm" variant="outline" disabled={acting} className="text-[12px] font-semibold h-8 border-brand-red/30 text-brand-red hover:bg-brand-red/5"
                          onClick={() => writeStatus(selected, 'denied')}>
                          <XCircle size={12} className="mr-1.5" />Deny
                        </Button>
                      </>
                    )}
                    {selected.category === 'client_intake' && selected.status !== 'converted' && (
                      <Button size="sm" disabled={acting} className="text-[12px] font-semibold h-8 bg-brand-blue hover:bg-brand-blue/90 text-white col-span-2"
                        onClick={() => convertToClient(selected)}>
                        {acting ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <UserCheck size={12} className="mr-1.5" />}
                        Convert to client
                      </Button>
                    )}
                    {/* Ticket → work order / project conversion lives in the Dispatch
                        Hub requests tab (existing flow) — link there instead of
                        duplicating the conversion dialog. */}
                    {selected.category === 'service_ticket' && selected.status === 'approved' && selected.rawCollection === 'clientRequests' && (
                      <Link href="/admin/dispatch" className="col-span-2">
                        <Button size="sm" variant="outline" className="text-[12px] font-semibold h-8 w-full">
                          <Wrench size={12} className="mr-1.5" />Convert in Dispatch<ExternalLink size={10} className="ml-1.5" />
                        </Button>
                      </Link>
                    )}
                    {(selected.status === 'approved' || selected.status === 'denied' || selected.status === 'closed') && (
                      <Button size="sm" variant="outline" disabled={acting} className="text-[12px] font-semibold h-8 col-span-2"
                        onClick={() => writeStatus(selected, 'archived')}>
                        <Archive size={12} className="mr-1.5" />Archive
                      </Button>
                    )}
                    {(selected.status === 'archived' || selected.status === 'denied') && (
                      <Button size="sm" variant="outline" disabled={acting} className="text-[12px] font-semibold h-8 col-span-2"
                        onClick={() => writeStatus(selected, 'pending_review')}>
                        <RotateCcw size={12} className="mr-1.5" />Restore to review
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
