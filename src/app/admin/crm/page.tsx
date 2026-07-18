'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, updateDoc, doc, addDoc } from 'firebase/firestore';
import type { Lead, LeadActivity, Quote } from '@/lib/types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { NewLeadDialog } from './components/new-lead-dialog';
import { LeadDetailDrawer } from './components/lead-detail-drawer';
import { cn } from '@/lib/utils';
import {
  Target, Plus, Search, DollarSign, Phone, Mail, User, TrendingUp,
  CheckCircle2, XCircle, ChevronRight, LayoutGrid, List, ArrowUpDown,
  UserCheck, Building2, MapPin, Upload,
} from 'lucide-react';
import { ImportLeadsDialog } from './components/import-leads-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/permissions';

type Stage = Lead['stage'];

const STAGES: { key: Stage; label: string; color: string; bg: string }[] = [
  { key: 'new', label: 'New Lead', color: 'text-text-muted', bg: 'bg-bg-tertiary' },
  { key: 'contacted', label: 'Contacted', color: 'text-blue-400', bg: 'bg-blue-400/10' },
  { key: 'qualified', label: 'Qualified', color: 'text-amber-400', bg: 'bg-amber-400/10' },
  { key: 'proposal_sent', label: 'Proposal Sent', color: 'text-purple-400', bg: 'bg-purple-400/10' },
  { key: 'negotiating', label: 'Negotiating', color: 'text-orange-400', bg: 'bg-orange-400/10' },
  { key: 'won', label: 'Won', color: 'text-text-green', bg: 'bg-text-green/10' },
  { key: 'lost', label: 'Lost', color: 'text-text-red', bg: 'bg-text-red/10' },
];

function LeadCard({
  lead,
  onMoveNext,
  onOpen,
  onConvert,
}: {
  lead: Lead;
  onMoveNext: (lead: Lead) => void;
  onOpen: (lead: Lead) => void;
  onConvert: (lead: Lead) => void;
}) {
  const stage = STAGES.find(s => s.key === lead.stage);
  const stageIdx = STAGES.findIndex(s => s.key === lead.stage);
  const hasNext = stageIdx < STAGES.length - 1 && lead.stage !== 'won' && lead.stage !== 'lost';

  return (
    <div
      className="rounded-lg border border-border-sub bg-bg-primary hover:border-border-main transition-all cursor-pointer group"
      onClick={() => onOpen(lead)}
    >
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-text-primary truncate leading-tight">
              {lead.companyName}
            </p>
            {lead.contactName && (
              <p className="text-[10px] text-text-muted mt-0.5 flex items-center gap-1 truncate">
                <User size={9} className="shrink-0" />
                {lead.contactName}
              </p>
            )}
          </div>
          {lead.estimatedValue > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] font-black text-text-green shrink-0">
              <DollarSign size={9} />
              {lead.estimatedValue >= 1000
                ? `${(lead.estimatedValue / 1000).toFixed(0)}k`
                : lead.estimatedValue.toLocaleString()}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {lead.contactEmail && (
            <span className="flex items-center gap-1 text-[9px] text-text-muted">
              <Mail size={8} />
              <span className="truncate max-w-[90px]">{lead.contactEmail}</span>
            </span>
          )}
          {lead.contactPhone && (
            <span className="flex items-center gap-1 text-[9px] text-text-muted">
              <Phone size={8} />
              {lead.contactPhone}
            </span>
          )}
        </div>

        {lead.source && lead.source !== 'other' && (
          <Badge variant="default" className="text-[8px] h-4 uppercase bg-bg-tertiary border-border-sub text-text-muted">
            {lead.source.replace('_', ' ')}
          </Badge>
        )}
      </div>

      <div className="border-t border-border-sub px-3 py-2 flex items-center justify-between gap-2">
        <p className="text-[9px] text-text-muted uppercase tracking-wider truncate">
          {lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString() : ''}
        </p>
        {hasNext && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[9px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-text-primary"
            onClick={(e) => { e.stopPropagation(); onMoveNext(lead); }}
          >
            <ChevronRight size={11} />
          </Button>
        )}
        {lead.stage === 'won' && (
          <Button
            size="sm"
            className="h-6 px-2 text-[8px] font-bold uppercase bg-text-green/10 text-text-green border border-text-green/20 hover:bg-text-green hover:text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); onConvert(lead); }}
          >
            <UserCheck size={9} className="mr-1" /> Convert
          </Button>
        )}
        {lead.stage === 'lost' && <XCircle size={12} className="text-text-red shrink-0" />}
      </div>
    </div>
  );
}

export default function CRMPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [crmTab, setCrmTab] = useState('pipeline');
  const [isNewLeadOpen, setIsNewLeadOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const { user: currentUser } = useAuth();
  const canImportLeads = hasPermission(currentUser, 'admin.crm.import_leads');
  const [viewMode, _setViewModeRaw] = useState<'kanban' | 'list'>(() => { try { return (localStorage.getItem('cc:crm:view') as 'kanban' | 'list') || 'kanban'; } catch { return 'kanban'; } });
  const setViewMode = (v: 'kanban' | 'list') => { _setViewModeRaw(v); try { localStorage.setItem('cc:crm:view', v); } catch {} };
  const [listSort, setListSort] = useState<{ col: 'company' | 'stage' | 'value' | 'updated'; dir: 'asc' | 'desc' }>({ col: 'updated', dir: 'desc' });
  const [convertLead, setConvertLead] = useState<Lead | null>(null);
  const [isConvertOpen, setIsConvertOpen] = useState(false);
  const [savingClient, setSavingClient] = useState(false);

  useEffect(() => {
    const userId = sessionStorage.getItem('currentUserId') || '';
    setCurrentUserId(userId);

    const unsubLeads = onSnapshot(collection(db, 'leads'), (snap) => {
      setLeads(snap.docs.map(d => ({ ...d.data(), id: d.id } as Lead)));
      setLoading(false);
    }, () => setLoading(false));

    const unsubActivities = onSnapshot(collection(db, 'leadActivities'), (snap) => {
      setActivities(snap.docs.map(d => ({ ...d.data(), id: d.id } as LeadActivity)));
    });

    const unsubQuotes = onSnapshot(collection(db, 'quotes'), (snap) => {
      setQuotes(snap.docs.map(d => ({ ...d.data(), id: d.id } as Quote)));
    });

    return () => { unsubLeads(); unsubActivities(); unsubQuotes(); };
  }, []);

  // Keep selectedLead in sync with latest Firestore data
  useEffect(() => {
    if (selectedLead) {
      const updated = leads.find(l => l.id === selectedLead.id);
      if (updated) setSelectedLead(updated);
    }
  }, [leads]);

  const filteredLeads = useMemo(() => {
    if (!searchQuery) return leads;
    const q = searchQuery.toLowerCase();
    return leads.filter(l =>
      l.companyName.toLowerCase().includes(q) ||
      l.contactName.toLowerCase().includes(q) ||
      l.contactEmail.toLowerCase().includes(q)
    );
  }, [leads, searchQuery]);

  const pipeline = useMemo(() =>
    STAGES.map(stage => ({
      ...stage,
      leads: filteredLeads.filter(l => l.stage === stage.key),
    })),
    [filteredLeads]
  );

  const totalValue = useMemo(() =>
    leads.filter(l => l.stage !== 'lost').reduce((s, l) => s + (l.estimatedValue || 0), 0),
    [leads]
  );

  const wonValue = useMemo(() =>
    leads.filter(l => l.stage === 'won').reduce((s, l) => s + (l.estimatedValue || 0), 0),
    [leads]
  );

  const sortedListLeads = useMemo(() => {
    const sorted = [...filteredLeads];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (listSort.col === 'company') cmp = a.companyName.localeCompare(b.companyName);
      else if (listSort.col === 'stage') cmp = STAGES.findIndex(s => s.key === a.stage) - STAGES.findIndex(s => s.key === b.stage);
      else if (listSort.col === 'value') cmp = (b.estimatedValue || 0) - (a.estimatedValue || 0);
      else if (listSort.col === 'updated') cmp = (b.updatedAt || '').localeCompare(a.updatedAt || '');
      return listSort.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredLeads, listSort]);

  function toggleSort(col: typeof listSort['col']) {
    setListSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  }

  async function handleSetStage(lead: Lead, stage: Stage) {
    if (stage === lead.stage) return;
    try {
      await updateDoc(doc(db, 'leads', lead.id), { stage, updatedAt: new Date().toISOString() });
    } catch {
      toast({ title: 'Failed to update stage', variant: 'destructive' });
    }
  }

  async function handleMoveNext(lead: Lead) {
    const stageIdx = STAGES.findIndex(s => s.key === lead.stage);
    const nextStage = STAGES[stageIdx + 1];
    if (!nextStage || lead.stage === 'won' || lead.stage === 'lost') return;
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        stage: nextStage.key,
        updatedAt: new Date().toISOString(),
      });
      toast({ title: `Moved to ${nextStage.label}` });
    } catch {
      toast({ title: 'Failed to move lead', variant: 'destructive' });
    }
  }

  const handleConvertToClient = async () => {
    if (!convertLead) return;
    setSavingClient(true);
    try {
      await addDoc(collection(db, 'users'), {
        name: convertLead.contactName,
        clientCompany: convertLead.companyName,
        email: convertLead.contactEmail,
        phone: convertLead.contactPhone,
        roles: ['client'],
        role: 'Client',
        subscriptionStatus: 'active',
        createdAt: new Date().toISOString(),
        convertedFromLeadId: convertLead.id,
      });
      await updateDoc(doc(db, 'leads', convertLead.id), {
        stage: 'won',
        convertedToClient: true,
        updatedAt: new Date().toISOString(),
      });
      toast({ title: 'Client created', description: `${convertLead.companyName} is now an active client.` });
      setIsConvertOpen(false);
      setConvertLead(null);
      router.push('/admin/crm/clients');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed to convert', description: e.message });
    } finally {
      setSavingClient(false);
    }
  };

  return (
    <div className="space-y-5 min-h-full">
      <header className="page-header">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2">
            <Target size={12} />
            Sales Intelligence
          </p>
          <h1 className="page-title">CRM Pipeline</h1>
          <p className="page-subtitle">Leads & opportunities from first contact to closed deal.</p>
        </div>
        <div className="page-header-right gap-2">
          {canImportLeads && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-[10px] font-bold uppercase tracking-wider border-border-main"
            onClick={() => setIsImportOpen(true)}
          >
            <Upload size={12} className="mr-1.5" />
            Import Leads
          </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-[10px] font-bold uppercase tracking-wider border-border-main"
            onClick={() => router.push('/admin/crm/clients')}
          >
            <Building2 size={12} className="mr-1.5" />
            Go To Clients
          </Button>
        </div>
      </header>

      {/* Universal Search/Sort/Filter Bar */}
      <div className="bg-bg-secondary p-3 rounded-xl border border-border-sub flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-main bg-bg-primary text-[11px] font-bold uppercase tracking-wide text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-red transition-colors"
            placeholder="Search leads..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={listSort.col} onValueChange={(v: any) => setListSort(prev => ({ ...prev, col: v }))}>
          <SelectTrigger className="h-9 w-[150px] bg-bg-primary border-border-main text-[10px] font-bold uppercase tracking-widest">
            <div className="flex items-center gap-2">
              <ArrowUpDown size={12} className="text-text-muted" />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated" className="text-[10px] uppercase font-bold">Last Updated</SelectItem>
            <SelectItem value="stage" className="text-[10px] uppercase font-bold">By Stage</SelectItem>
            <SelectItem value="value" className="text-[10px] uppercase font-bold">By Value</SelectItem>
            <SelectItem value="company" className="text-[10px] uppercase font-bold">By Company</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center border border-border-main rounded-lg overflow-hidden h-9 bg-bg-primary">
          <button
            onClick={() => setViewMode('kanban')}
            className={cn('h-9 w-9 flex items-center justify-center transition-colors', viewMode === 'kanban' ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary')}
          >
            <LayoutGrid size={13} />
          </button>
          <div className="w-px h-full bg-border-main" />
          <button
            onClick={() => setViewMode('list')}
            className={cn('h-9 w-9 flex items-center justify-center transition-colors', viewMode === 'list' ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary')}
          >
            <List size={13} />
          </button>
        </div>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <Button
            size="sm"
            className="h-9 text-[10px] font-bold uppercase tracking-wider bg-brand-red hover:bg-brand-red/90 text-white"
            onClick={() => setIsNewLeadOpen(true)}
          >
            <Plus size={12} className="mr-1.5" />
            New Lead
          </Button>
        </div>
      </div>

      {/* CRM Tabs */}
      <Tabs value={crmTab} onValueChange={setCrmTab} className="w-full">
        <TabsList className="tabs border-b border-border-sub bg-transparent rounded-none h-auto p-0 gap-8 justify-start mb-1">
          <TabsTrigger value="pipeline" className="crm-tab-trigger">Pipeline</TabsTrigger>
          <TabsTrigger value="opportunities" className="crm-tab-trigger flex items-center gap-2">
            Opportunities
            {leads.filter(l => ['qualified','proposal_sent','negotiating'].includes(l.stage)).length > 0 && (
              <span className="text-[8px] font-black bg-bg-tertiary text-text-muted border border-border-sub px-1.5 py-0.5 rounded">
                {leads.filter(l => ['qualified','proposal_sent','negotiating'].includes(l.stage)).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="quotes" className="crm-tab-trigger flex items-center gap-2">
            Quotes
            {quotes.length > 0 && <span className="text-[8px] font-black bg-bg-tertiary text-text-muted border border-border-sub px-1.5 py-0.5 rounded">{quotes.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="followups" className="crm-tab-trigger flex items-center gap-2">
            Follow-ups
            {leads.filter(l => !!(l as any).followUpDate).length > 0 && (
              <span className="text-[8px] font-black bg-amber-500 text-white px-1.5 py-0.5 rounded">
                {leads.filter(l => !!(l as any).followUpDate).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="won" className="crm-tab-trigger flex items-center gap-2">
            Won
            {leads.filter(l => l.stage === 'won').length > 0 && (
              <span className="text-[8px] font-black bg-text-green/20 text-text-green border border-text-green/30 px-1.5 py-0.5 rounded">
                {leads.filter(l => l.stage === 'won').length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="lost" className="crm-tab-trigger">Lost</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="m-0 pt-3">
      {/* Pipeline Stats */}
      <div className="flex items-center gap-6 px-1">
        <div className="flex items-center gap-1.5">
          <TrendingUp size={12} className="text-text-muted" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            {leads.filter(l => l.stage !== 'lost' && l.stage !== 'won').length} Active
          </span>
        </div>
        <span className="text-text-muted text-xs">·</span>
        <div className="flex items-center gap-1.5">
          <DollarSign size={12} className="text-text-muted" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            ${totalValue.toLocaleString()} Pipeline
          </span>
        </div>
        <span className="text-text-muted text-xs">·</span>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 size={12} className="text-text-green" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-green">
            ${wonValue.toLocaleString()} Won
          </span>
        </div>
      </div>

      {/* List View */}
      {viewMode === 'list' && (
        <div className="rounded-xl border border-border-sub overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border-sub">
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted cursor-pointer hover:text-text-primary" onClick={() => toggleSort('company')}>
                  <span className="flex items-center gap-1.5">Company <ArrowUpDown size={10} /></span>
                </TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Contact</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted cursor-pointer hover:text-text-primary" onClick={() => toggleSort('stage')}>
                  <span className="flex items-center gap-1.5">Stage <ArrowUpDown size={10} /></span>
                </TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted cursor-pointer hover:text-text-primary" onClick={() => toggleSort('value')}>
                  <span className="flex items-center gap-1.5">Value <ArrowUpDown size={10} /></span>
                </TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted cursor-pointer hover:text-text-primary" onClick={() => toggleSort('updated')}>
                  <span className="flex items-center gap-1.5">Updated <ArrowUpDown size={10} /></span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedListLeads.map(lead => {
                const stageInfo = STAGES.find(s => s.key === lead.stage);
                return (
                  <TableRow key={lead.id} className="border-border-sub hover:bg-bg-secondary cursor-pointer" onClick={() => setSelectedLead(lead)}>
                    <TableCell className="font-bold text-[11px] uppercase text-text-primary">{lead.companyName}</TableCell>
                    <TableCell className="text-[10px] text-text-muted">
                      <div>{lead.contactName}</div>
                      {lead.contactEmail && <div className="text-[9px] mt-0.5">{lead.contactEmail}</div>}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Select value={lead.stage} onValueChange={v => handleSetStage(lead, v as Stage)}>
                        <SelectTrigger className={cn('h-7 text-[9px] font-black uppercase border-0 bg-transparent w-[140px]', stageInfo?.color)}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-bg-elevated border-border-main">
                          {STAGES.map(s => <SelectItem key={s.key} value={s.key} className={cn('text-[9px] font-bold uppercase', s.color)}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-[11px] font-black font-mono text-text-green">
                      {lead.estimatedValue > 0 ? `$${lead.estimatedValue.toLocaleString()}` : '—'}
                    </TableCell>
                    <TableCell className="text-[10px] text-text-muted">
                      {lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString() : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
              {sortedListLeads.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-[10px] text-text-muted uppercase tracking-widest">
                    No leads found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Kanban Board */}
      {viewMode === 'kanban' && <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {pipeline.map((col) => (
            <div key={col.key} className="w-[240px] flex-shrink-0 space-y-3">
              {/* Column header */}
              <div className={cn('flex items-center justify-between px-3 py-2 rounded-lg border border-border-sub', col.bg)}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn('text-[9px] font-black uppercase tracking-widest truncate', col.color)}>
                    {col.label}
                  </span>
                </div>
                <span className={cn('text-[10px] font-black tabular-nums shrink-0 ml-2', col.color)}>
                  {col.leads.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2 min-h-[100px]">
                {loading ? (
                  <div className="h-20 rounded-lg bg-bg-tertiary border border-border-sub animate-pulse" />
                ) : col.leads.length === 0 ? (
                  <div className="h-16 rounded-lg border border-dashed border-border-sub flex items-center justify-center">
                    <p className="text-[9px] text-text-muted uppercase tracking-wider">Empty</p>
                  </div>
                ) : (
                  col.leads.map(lead => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onMoveNext={handleMoveNext}
                      onOpen={setSelectedLead}
                      onConvert={(l) => { setConvertLead(l); setIsConvertOpen(true); }}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>}

        </TabsContent>

        {/* ── Opportunities ── */}
        <TabsContent value="opportunities" className="m-0 pt-3">
          <div className="flex items-center gap-4 px-1 mb-4">
            <TrendingUp size={12} className="text-amber-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              {leads.filter(l => ['qualified','proposal_sent','negotiating'].includes(l.stage)).length} Active Opportunities
            </span>
            <span className="text-text-muted text-xs">·</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              ${leads.filter(l => ['qualified','proposal_sent','negotiating'].includes(l.stage)).reduce((s,l) => s + (l.estimatedValue||0), 0).toLocaleString()} Pipeline
            </span>
          </div>
          <div className="rounded-xl border border-border-sub overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border-sub">
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Company</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Contact</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Value</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Stage</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads
                  .filter(l => ['qualified','proposal_sent','negotiating'].includes(l.stage))
                  .sort((a,b) => (b.updatedAt||'').localeCompare(a.updatedAt||''))
                  .map(lead => {
                    const stageInfo = STAGES.find(s => s.key === lead.stage);
                    return (
                      <TableRow key={lead.id} className="border-border-sub hover:bg-bg-secondary cursor-pointer" onClick={() => setSelectedLead(lead)}>
                        <TableCell className="font-bold text-[11px] uppercase text-text-primary">{lead.companyName}</TableCell>
                        <TableCell className="text-[10px] text-text-muted">
                          <div>{lead.contactName}</div>
                          {lead.contactEmail && <div className="text-[9px] mt-0.5">{lead.contactEmail}</div>}
                        </TableCell>
                        <TableCell className="text-[11px] font-black font-mono text-text-green">
                          {lead.estimatedValue > 0 ? `$${lead.estimatedValue.toLocaleString()}` : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[8px] h-5 uppercase border ${stageInfo?.bg} ${stageInfo?.color} border-current/20`}>
                            {stageInfo?.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[10px] text-text-muted">
                          {lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString() : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                {leads.filter(l => ['qualified','proposal_sent','negotiating'].includes(l.stage)).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-[10px] text-text-muted uppercase tracking-widest">No active opportunities</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Quotes ── */}
        <TabsContent value="quotes" className="m-0 pt-3">
          <div className="rounded-xl border border-border-sub overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border-sub">
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Title</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Client</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Total</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Status</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Created</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')).map(q => (
                  <TableRow key={q.id} className="border-border-sub hover:bg-bg-secondary cursor-pointer">
                    <TableCell className="font-bold text-[11px] uppercase text-text-primary">{q.title}</TableCell>
                    <TableCell className="text-[10px] text-text-muted">{q.customerName}</TableCell>
                    <TableCell className="text-[11px] font-black font-mono text-text-green">${(q.total||0).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge className={`text-[8px] h-5 uppercase border ${
                        q.status === 'approved' ? 'bg-text-green/10 text-text-green border-text-green/20' :
                        q.status === 'rejected' ? 'bg-text-red/10 text-text-red border-text-red/20' :
                        'bg-amber-400/10 text-amber-400 border-amber-400/20'
                      }`}>
                        {q.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[10px] text-text-muted">
                      {q.createdAt ? new Date(q.createdAt).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell className="text-[10px] text-text-muted">
                      {q.expirationDate ? new Date(q.expirationDate).toLocaleDateString() : '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {quotes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-[10px] text-text-muted uppercase tracking-widest">No quotes yet</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Follow-ups ── */}
        <TabsContent value="followups" className="m-0 pt-3">
          <div className="rounded-xl border border-border-sub overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border-sub">
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Company</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Contact</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Follow-up Date</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Stage</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads
                  .filter(l => !!(l as any).followUpDate)
                  .sort((a,b) => ((a as any).followUpDate||'').localeCompare((b as any).followUpDate||''))
                  .map(lead => {
                    const stageInfo = STAGES.find(s => s.key === lead.stage);
                    const followUpDate = (lead as any).followUpDate as string;
                    const isPast = followUpDate && new Date(followUpDate) < new Date();
                    return (
                      <TableRow key={lead.id} className={`border-border-sub hover:bg-bg-secondary cursor-pointer ${isPast ? 'bg-brand-red/5' : ''}`} onClick={() => setSelectedLead(lead)}>
                        <TableCell className="font-bold text-[11px] uppercase text-text-primary">{lead.companyName}</TableCell>
                        <TableCell className="text-[10px] text-text-muted">{lead.contactName}</TableCell>
                        <TableCell className={`text-[10px] font-bold ${isPast ? 'text-brand-red' : 'text-text-primary'}`}>
                          {followUpDate ? new Date(followUpDate).toLocaleDateString() : '—'}
                          {isPast && <span className="ml-2 text-[8px] bg-brand-red/10 text-brand-red border border-brand-red/20 px-1.5 py-0.5 rounded uppercase">Overdue</span>}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[8px] h-5 uppercase border ${stageInfo?.bg} ${stageInfo?.color} border-current/20`}>
                            {stageInfo?.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[11px] font-black font-mono text-text-green">
                          {lead.estimatedValue > 0 ? `$${lead.estimatedValue.toLocaleString()}` : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                {leads.filter(l => !!(l as any).followUpDate).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-[10px] text-text-muted uppercase tracking-widest">No follow-ups scheduled</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Won ── */}
        <TabsContent value="won" className="m-0 pt-3">
          {leads.filter(l => l.stage === 'won').length > 0 && (
            <div className="flex items-center gap-4 px-1 mb-4">
              <CheckCircle2 size={12} className="text-text-green" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-green">
                ${leads.filter(l => l.stage === 'won').reduce((s,l) => s + (l.estimatedValue||0), 0).toLocaleString()} Total Won
              </span>
              <span className="text-text-muted text-xs">·</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                {leads.filter(l => l.stage === 'won').length} Deals
              </span>
            </div>
          )}
          <div className="rounded-xl border border-border-sub overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border-sub">
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Company</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Contact</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Deal Value</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Closed</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads
                  .filter(l => l.stage === 'won')
                  .sort((a,b) => (b.closedAt||b.updatedAt||'').localeCompare(a.closedAt||a.updatedAt||''))
                  .map(lead => (
                    <TableRow key={lead.id} className="border-border-sub hover:bg-bg-secondary cursor-pointer" onClick={() => setSelectedLead(lead)}>
                      <TableCell className="font-bold text-[11px] uppercase text-text-primary flex items-center gap-2">
                        <CheckCircle2 size={11} className="text-text-green shrink-0" />
                        {lead.companyName}
                      </TableCell>
                      <TableCell className="text-[10px] text-text-muted">{lead.contactName}</TableCell>
                      <TableCell className="text-[12px] font-black font-mono text-text-green">
                        ${(lead.estimatedValue||0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-[10px] text-text-muted">
                        {lead.closedAt ? new Date(lead.closedAt).toLocaleDateString() : (lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString() : '—')}
                      </TableCell>
                      <TableCell>
                        {lead.source && (
                          <Badge variant="default" className="text-[8px] h-4 uppercase bg-bg-tertiary border-border-sub text-text-muted">
                            {lead.source.replace('_',' ')}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                {leads.filter(l => l.stage === 'won').length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-[10px] text-text-muted uppercase tracking-widest">No won deals yet</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Lost ── */}
        <TabsContent value="lost" className="m-0 pt-3">
          <div className="rounded-xl border border-border-sub overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border-sub">
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Company</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Contact</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Est. Value</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Lost Reason</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-text-muted">Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads
                  .filter(l => l.stage === 'lost')
                  .sort((a,b) => (b.updatedAt||'').localeCompare(a.updatedAt||''))
                  .map(lead => (
                    <TableRow key={lead.id} className="border-border-sub hover:bg-bg-secondary cursor-pointer opacity-70 hover:opacity-100" onClick={() => setSelectedLead(lead)}>
                      <TableCell className="font-bold text-[11px] uppercase text-text-primary flex items-center gap-2">
                        <XCircle size={11} className="text-text-red shrink-0" />
                        {lead.companyName}
                      </TableCell>
                      <TableCell className="text-[10px] text-text-muted">{lead.contactName}</TableCell>
                      <TableCell className="text-[11px] font-black font-mono text-text-muted">
                        {lead.estimatedValue > 0 ? `$${lead.estimatedValue.toLocaleString()}` : '—'}
                      </TableCell>
                      <TableCell className="text-[10px] text-text-muted max-w-[200px] truncate">
                        {lead.lostReason || '—'}
                      </TableCell>
                      <TableCell className="text-[10px] text-text-muted">
                        {lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString() : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                {leads.filter(l => l.stage === 'lost').length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-[10px] text-text-muted uppercase tracking-widest">No lost deals</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

      </Tabs>

      <NewLeadDialog
        open={isNewLeadOpen}
        onClose={() => setIsNewLeadOpen(false)}
        currentUserId={currentUserId}
      />

      <ImportLeadsDialog
        open={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        currentUserId={currentUserId}
      />

      <LeadDetailDrawer
        lead={selectedLead}
        activities={activities}
        currentUserId={currentUserId}
        onClose={() => setSelectedLead(null)}
      />

      {/* CONVERT TO CLIENT DIALOG */}
      <Dialog open={isConvertOpen} onOpenChange={setIsConvertOpen}>
        <DialogContent className="bg-bg-elevated border-border-main max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
              <UserCheck size={14} className="text-text-green" />
              Convert to Client
            </DialogTitle>
          </DialogHeader>
          {convertLead && (
            <div className="space-y-3 py-2">
              <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub space-y-1">
                <p className="text-[11px] font-black uppercase text-text-primary">{convertLead.companyName}</p>
                <p className="text-[10px] text-text-muted">{convertLead.contactName} · {convertLead.contactEmail}</p>
              </div>
              <p className="text-[10px] text-text-muted uppercase tracking-widest">
                This will create a new client account and move the lead to Won status.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsConvertOpen(false)} className="text-[10px] font-black uppercase">Cancel</Button>
            <Button size="sm" onClick={handleConvertToClient} disabled={savingClient} className="bg-text-green hover:bg-text-green/90 text-white text-[10px] font-black uppercase">
              {savingClient ? 'Converting...' : 'Convert to Client'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        .crm-tab-trigger {
          @apply px-0 pb-3 pt-0 h-auto bg-transparent rounded-none border-b-2 border-transparent text-[11px] font-black uppercase tracking-[0.2em] text-text-muted data-[state=active]:bg-transparent data-[state=active]:text-text-primary data-[state=active]:border-brand-red data-[state=active]:shadow-none transition-all;
        }
      `}</style>
    </div>
  );
}
