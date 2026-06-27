'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import type { Lead, LeadActivity } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { NewLeadDialog } from './components/new-lead-dialog';
import { LeadDetailDrawer } from './components/lead-detail-drawer';
import { cn } from '@/lib/utils';
import {
  Target, Plus, Search, DollarSign, Phone, Mail, User, TrendingUp,
  CheckCircle2, XCircle, ChevronRight, LayoutGrid, List, ArrowUpDown,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

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
}: {
  lead: Lead;
  onMoveNext: (lead: Lead) => void;
  onOpen: (lead: Lead) => void;
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
        {lead.stage === 'won' && <CheckCircle2 size={12} className="text-text-green shrink-0" />}
        {lead.stage === 'lost' && <XCircle size={12} className="text-text-red shrink-0" />}
      </div>
    </div>
  );
}

export default function CRMPage() {
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewLeadOpen, setIsNewLeadOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [listSort, setListSort] = useState<{ col: 'company' | 'stage' | 'value' | 'updated'; dir: 'asc' | 'desc' }>({ col: 'updated', dir: 'desc' });

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

    return () => { unsubLeads(); unsubActivities(); };
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
        <div className="page-header-right items-center gap-2">
          <div className="search-wrap">
            <Search />
            <input
              className="search-input !w-full md:!w-[220px]"
              placeholder="Search leads..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          {/* View toggle */}
          <div className="flex items-center border border-border-main rounded-md overflow-hidden h-8">
            <button
              onClick={() => setViewMode('kanban')}
              className={cn('h-8 w-8 flex items-center justify-center transition-colors', viewMode === 'kanban' ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary')}
            >
              <LayoutGrid size={13} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn('h-8 w-8 flex items-center justify-center transition-colors', viewMode === 'list' ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary')}
            >
              <List size={13} />
            </button>
          </div>
          <Button
            size="sm"
            className="h-8 text-[10px] font-bold uppercase tracking-wider bg-brand-red hover:bg-brand-red/90 text-white shrink-0"
            onClick={() => setIsNewLeadOpen(true)}
          >
            <Plus size={12} className="mr-1.5" />
            New Lead
          </Button>
        </div>
      </header>

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
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>}

      <NewLeadDialog
        open={isNewLeadOpen}
        onClose={() => setIsNewLeadOpen(false)}
        currentUserId={currentUserId}
      />

      <LeadDetailDrawer
        lead={selectedLead}
        activities={activities}
        currentUserId={currentUserId}
        onClose={() => setSelectedLead(null)}
      />
    </div>
  );
}
