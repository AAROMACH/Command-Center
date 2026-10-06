'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePaged, ListPager, PAGE_SIZES_LARGE } from '@/components/list-pager';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, updateDoc, doc, addDoc } from 'firebase/firestore';
import type { Lead, LeadActivity, Quote } from '@/lib/types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { NewLeadDialog } from './components/new-lead-dialog';
import { LeadDetailDrawer } from './components/lead-detail-drawer';
import { CloseDealDialog } from './components/close-deal-dialog';
import { ImportLeadsDialog } from './components/import-leads-dialog';
import { cn } from '@/lib/utils';
import {
  Target, Plus, Search, DollarSign, Phone, Mail, User, TrendingUp, CheckCircle2, XCircle,
  ChevronRight, LayoutGrid, List, ArrowUpDown, UserCheck, Building2, Upload, Download,
  AlertTriangle, Calendar, ListTodo, Trophy, Percent, Clock,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/permissions';
import { DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import {
  STAGES, STAGE_LABELS, OPEN_STAGES, SOURCES, SERVICE_LINES, STALE_DAYS, type Stage,
  isOpen, isStale, probabilityOf, weightedValue, daysSince, lastTouch, todayKey, formatMoney,
  sourceLabel, leadsToCsv, downloadText,
} from '@/lib/crm';
import { changeLeadStage } from '@/lib/crm-actions';

const thCls = 'text-[9px] font-black uppercase tracking-widest text-text-muted';

function StageBadge({ stage }: { stage: Stage }) {
  const s = STAGES.find(x => x.key === stage);
  return <Badge className={`text-[8px] h-5 uppercase border ${s?.bg} ${s?.color} border-current/20`}>{s?.label}</Badge>;
}

function LeadCard({ lead, onMoveNext, onOpen, onConvert }: {
  lead: Lead;
  onMoveNext: (lead: Lead) => void;
  onOpen: (lead: Lead) => void;
  onConvert: (lead: Lead) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const hasNext = OPEN_STAGES.indexOf(lead.stage) >= 0 && OPEN_STAGES.indexOf(lead.stage) < OPEN_STAGES.length - 1;
  const stale = isStale(lead);
  const today = todayKey();
  const followUpDue = isOpen(lead) && !!lead.followUpDate && lead.followUpDate <= today;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'rounded-lg border bg-bg-primary hover:border-border-main transition-colors cursor-grab active:cursor-grabbing group touch-none',
        stale ? 'border-amber-400/40' : 'border-border-sub',
        isDragging && 'opacity-60 shadow-xl z-50 relative',
      )}
      onClick={() => onOpen(lead)}
    >
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-text-primary truncate leading-tight">{lead.companyName}</p>
            {lead.contactName && (
              <p className="text-[10px] text-text-muted mt-0.5 flex items-center gap-1 truncate">
                <User size={9} className="shrink-0" /> {lead.contactName}
              </p>
            )}
          </div>
          {lead.estimatedValue > 0 && (
            <span className="text-[10px] font-black text-text-green shrink-0">{formatMoney(lead.estimatedValue, true)}</span>
          )}
        </div>

        {lead.nextStep && isOpen(lead) && (
          <p className="text-[10px] text-text-secondary truncate flex items-center gap-1">
            <ChevronRight size={9} className="shrink-0 text-brand-red" /> {lead.nextStep}
          </p>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          {stale && (
            <Badge className="text-[8px] h-4 uppercase bg-amber-400/10 text-amber-400 border border-amber-400/20">
              <AlertTriangle size={8} className="mr-0.5" /> {daysSince(lastTouch(lead))}d idle
            </Badge>
          )}
          {followUpDue && (
            <Badge className="text-[8px] h-4 uppercase bg-brand-red/10 text-brand-red border border-brand-red/20">
              <Calendar size={8} className="mr-0.5" /> Follow-up
            </Badge>
          )}
          {(lead.serviceLines || []).slice(0, 2).map(s => (
            <Badge key={s} className="text-[8px] h-4 uppercase bg-bg-tertiary border-border-sub text-text-muted">{s}</Badge>
          ))}
        </div>
      </div>

      <div className="border-t border-border-sub px-3 py-2 flex items-center justify-between gap-2">
        <p className="text-[9px] text-text-muted uppercase tracking-wider truncate">
          {lead.assignedToName || ''}{lead.expectedCloseDate ? ` · close ${lead.expectedCloseDate.slice(5)}` : ''}
        </p>
        {hasNext && (
          <Button size="sm" variant="ghost"
            className="h-6 px-2 text-[9px] font-bold uppercase opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-text-primary"
            onPointerDown={e => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onMoveNext(lead); }}>
            <ChevronRight size={11} />
          </Button>
        )}
        {lead.stage === 'won' && !lead.convertedToClient && (
          <Button size="sm"
            className="h-6 px-2 text-[8px] font-bold uppercase bg-text-green/10 text-text-green border border-text-green/20 hover:bg-text-green hover:text-white transition-colors"
            onPointerDown={e => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onConvert(lead); }}>
            <UserCheck size={9} className="mr-1" /> Convert
          </Button>
        )}
        {lead.stage === 'lost' && <XCircle size={12} className="text-text-red shrink-0" />}
      </div>
    </div>
  );
}

function StageColumn({ stage, leads, loading, children }: {
  stage: typeof STAGES[number]; leads: Lead[]; loading: boolean; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  const total = leads.reduce((s, l) => s + (l.estimatedValue || 0), 0);
  const weighted = leads.reduce((s, l) => s + weightedValue(l), 0);
  return (
    <div ref={setNodeRef} className={cn('w-[250px] flex-shrink-0 space-y-3 rounded-lg transition-colors', isOver && 'bg-brand-red/5 ring-1 ring-brand-red/30')}>
      <div className={cn('px-3 py-2 rounded-lg border border-border-sub', stage.bg)}>
        <div className="flex items-center justify-between">
          <span className={cn('text-[9px] font-black uppercase tracking-widest truncate', stage.color)}>{stage.label}</span>
          <span className={cn('text-[10px] font-black tabular-nums', stage.color)}>{leads.length}</span>
        </div>
        <p className="text-[9px] text-text-muted font-bold tabular-nums mt-0.5">
          {formatMoney(total, true)}{OPEN_STAGES.includes(stage.key) && total > 0 ? ` · ${formatMoney(weighted, true)} wtd` : ''}
        </p>
      </div>
      <div className="space-y-2 min-h-[100px]">
        {loading ? (
          <div className="h-20 rounded-lg bg-bg-tertiary border border-border-sub animate-pulse" />
        ) : leads.length === 0 ? (
          <div className="h-16 rounded-lg border border-dashed border-border-sub flex items-center justify-center">
            <p className="text-[9px] text-text-muted uppercase tracking-wider">Drop here</p>
          </div>
        ) : children}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, tone }: { icon: React.ElementType; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border-sub bg-bg-secondary p-4">
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-1.5"><Icon size={11} /> {label}</p>
      <p className={cn('text-xl font-black tabular-nums mt-1', tone || 'text-text-primary')}>{value}</p>
      {sub && <p className="text-[9px] text-text-muted uppercase tracking-wider mt-0.5">{sub}</p>}
    </div>
  );
}

function BarRows({ rows }: { rows: { label: string; value: number; display: string; sub?: string }[] }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  if (rows.length === 0) return <p className="text-[10px] text-text-muted uppercase tracking-wider py-4">No data yet</p>;
  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.label}>
          <div className="flex justify-between text-[10px] mb-1">
            <span className="font-bold uppercase tracking-wider text-text-secondary">{r.label}</span>
            <span className="font-black tabular-nums text-text-primary">{r.display}{r.sub ? <span className="text-text-muted font-bold"> · {r.sub}</span> : null}</span>
          </div>
          <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
            <div className="h-full bg-brand-red rounded-full" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
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
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [closing, setClosing] = useState<{ lead: Lead; outcome: 'won' | 'lost' } | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const { user: currentUser } = useAuth();
  const currentUserName = currentUser?.name || '';
  const canImportLeads = hasPermission(currentUser, 'admin.crm.import_leads');
  const [viewMode, _setViewModeRaw] = useState<'kanban' | 'list'>(() => { try { return (localStorage.getItem('cc:crm:view') as 'kanban' | 'list') || 'kanban'; } catch { return 'kanban'; } });
  const setViewMode = (v: 'kanban' | 'list') => { _setViewModeRaw(v); try { localStorage.setItem('cc:crm:view', v); } catch {} };
  const [listSort, setListSort] = useState<{ col: 'company' | 'stage' | 'value' | 'updated' | 'close'; dir: 'asc' | 'desc' }>({ col: 'updated', dir: 'desc' });
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [staleOnly, setStaleOnly] = useState(false);
  const [convertLead, setConvertLead] = useState<Lead | null>(null);
  const [savingClient, setSavingClient] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    setCurrentUserId(sessionStorage.getItem('currentUserId') || '');

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

  // Keep the open drawer in sync with live Firestore data.
  useEffect(() => {
    if (selectedLead) {
      const updated = leads.find(l => l.id === selectedLead.id);
      if (updated) setSelectedLead(updated);
    }
  }, [leads]);

  // Activities carry the real last-touch time for leads that predate lastActivityAt.
  const leadsWithTouch = useMemo(() => {
    const latest = new Map<string, string>();
    for (const a of activities) {
      if (a.type === 'task' && !a.completedAt) continue;
      const t = a.completedAt || a.createdAt;
      if (t && (!latest.has(a.leadId) || t > latest.get(a.leadId)!)) latest.set(a.leadId, t);
    }
    return leads.map(l => {
      const t = latest.get(l.id);
      return t && (!l.lastActivityAt || t > l.lastActivityAt) ? { ...l, lastActivityAt: t } : l;
    });
  }, [leads, activities]);

  const filteredLeads = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return leadsWithTouch.filter(l => {
      if (q && ![l.companyName, l.contactName, l.contactEmail, l.contactPhone, l.address, l.nextStep, ...(l.tags || [])]
        .some(v => (v || '').toLowerCase().includes(q))) return false;
      if (ownerFilter === 'mine' && l.assignedTo !== currentUserId) return false;
      if (ownerFilter === 'unassigned' && l.assignedTo) return false;
      if (sourceFilter !== 'all' && l.source !== sourceFilter) return false;
      if (serviceFilter !== 'all' && !(l.serviceLines || []).includes(serviceFilter)) return false;
      if (staleOnly && !isStale(l)) return false;
      return true;
    });
  }, [leadsWithTouch, searchQuery, ownerFilter, sourceFilter, serviceFilter, staleOnly, currentUserId]);

  const pipeline = useMemo(() =>
    STAGES.map(stage => ({ stage, leads: filteredLeads.filter(l => l.stage === stage.key) })),
  [filteredLeads]);

  const openLeads = filteredLeads.filter(isOpen);
  const totalValue = openLeads.reduce((s, l) => s + (l.estimatedValue || 0), 0);
  const weightedTotal = openLeads.reduce((s, l) => s + weightedValue(l), 0);
  const wonValue = filteredLeads.filter(l => l.stage === 'won').reduce((s, l) => s + (l.estimatedValue || 0), 0);
  const staleCount = openLeads.filter(isStale).length;

  const sortedListLeads = useMemo(() => {
    const sorted = [...filteredLeads];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (listSort.col === 'company') cmp = a.companyName.localeCompare(b.companyName);
      else if (listSort.col === 'stage') cmp = STAGES.findIndex(s => s.key === a.stage) - STAGES.findIndex(s => s.key === b.stage);
      else if (listSort.col === 'value') cmp = (b.estimatedValue || 0) - (a.estimatedValue || 0);
      else if (listSort.col === 'updated') cmp = (b.updatedAt || '').localeCompare(a.updatedAt || '');
      else if (listSort.col === 'close') cmp = (a.expectedCloseDate || '9').localeCompare(b.expectedCloseDate || '9');
      return listSort.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredLeads, listSort]);
  const pager = usePaged(sortedListLeads, PAGE_SIZES_LARGE, 'crm-leads', []);

  // ── My Day: everything that needs a touch today ──
  const today = todayKey();
  const leadById = useMemo(() => new Map(leadsWithTouch.map(l => [l.id, l])), [leadsWithTouch]);
  const myScope = (l?: Lead) => !!l && (ownerFilter === 'all' || (ownerFilter === 'mine' ? l.assignedTo === currentUserId : !l.assignedTo));
  const dueFollowUps = filteredLeads.filter(l => isOpen(l) && l.followUpDate && l.followUpDate <= today)
    .sort((a, b) => a.followUpDate!.localeCompare(b.followUpDate!));
  const upcomingFollowUps = filteredLeads.filter(l => isOpen(l) && l.followUpDate && l.followUpDate > today)
    .sort((a, b) => a.followUpDate!.localeCompare(b.followUpDate!)).slice(0, 15);
  const openTasks = activities
    .filter(a => a.type === 'task' && !a.completedAt && myScope(leadById.get(a.leadId)))
    .sort((a, b) => (a.scheduledAt || '9').localeCompare(b.scheduledAt || '9'));
  const noNextStep = openLeads.filter(l => !l.followUpDate && !l.nextStep);
  const myDayCount = dueFollowUps.length + openTasks.filter(t => t.scheduledAt && t.scheduledAt <= today).length;

  // ── Insights ──
  const insights = useMemo(() => {
    const closed = filteredLeads.filter(l => l.stage === 'won' || l.stage === 'lost');
    const won = closed.filter(l => l.stage === 'won');
    const winRate = closed.length ? Math.round((won.length / closed.length) * 100) : 0;
    const avgDeal = won.length ? won.reduce((s, l) => s + (l.estimatedValue || 0), 0) / won.length : 0;
    const cycles = won.map(l => l.closedAt && l.createdAt ? (new Date(l.closedAt).getTime() - new Date(l.createdAt).getTime()) / 86_400_000 : null)
      .filter((n): n is number => n !== null && n >= 0);
    const avgCycle = cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : 0;

    const forecastMap = new Map<string, { weighted: number; total: number; count: number }>();
    for (const l of filteredLeads.filter(isOpen)) {
      const key = l.expectedCloseDate ? l.expectedCloseDate.slice(0, 7) : 'No close date';
      const e = forecastMap.get(key) || { weighted: 0, total: 0, count: 0 };
      e.weighted += weightedValue(l); e.total += l.estimatedValue || 0; e.count++;
      forecastMap.set(key, e);
    }
    const forecast = [...forecastMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({
      label: k === 'No close date' ? k : new Date(`${k}-01T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
      value: v.weighted, display: formatMoney(v.weighted), sub: `${v.count} deals · ${formatMoney(v.total, true)} total`,
    }));

    const bySource = SOURCES.map(s => {
      const ls = filteredLeads.filter(l => l.source === s.key);
      const c = ls.filter(l => l.stage === 'won' || l.stage === 'lost');
      const w = ls.filter(l => l.stage === 'won');
      return { label: s.label, value: w.reduce((a, l) => a + (l.estimatedValue || 0), 0), count: ls.length,
        display: formatMoney(w.reduce((a, l) => a + (l.estimatedValue || 0), 0)), sub: `${ls.length} leads · ${c.length ? Math.round(w.length / c.length * 100) : 0}% win` };
    }).filter(r => r.count > 0).sort((a, b) => b.value - a.value || b.count - a.count);

    const byService = SERVICE_LINES.map(s => {
      const ls = filteredLeads.filter(l => isOpen(l) && (l.serviceLines || []).includes(s));
      return { label: s, value: ls.reduce((a, l) => a + (l.estimatedValue || 0), 0), count: ls.length };
    }).filter(r => r.count > 0).sort((a, b) => b.value - a.value)
      .map(r => ({ ...r, display: formatMoney(r.value), sub: `${r.count} open` }));

    const lostMap = new Map<string, number>();
    for (const l of closed.filter(l => l.stage === 'lost')) {
      const k = l.lostReasonCategory || 'Not recorded';
      lostMap.set(k, (lostMap.get(k) || 0) + 1);
    }
    const lostReasons = [...lostMap.entries()].sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, value: n, display: String(n) }));

    const ownerMap = new Map<string, { name: string; open: number; won: number; wonValue: number }>();
    for (const l of filteredLeads) {
      const key = l.assignedTo || 'unassigned';
      const e = ownerMap.get(key) || { name: l.assignedToName || (key === currentUserId ? currentUserName || 'You' : key === 'unassigned' ? 'Unassigned' : 'Unnamed rep'), open: 0, won: 0, wonValue: 0 };
      if (isOpen(l)) e.open++;
      if (l.stage === 'won') { e.won++; e.wonValue += l.estimatedValue || 0; }
      ownerMap.set(key, e);
    }
    const byOwner = [...ownerMap.values()].sort((a, b) => b.wonValue - a.wonValue)
      .map(o => ({ label: o.name, value: o.wonValue, display: formatMoney(o.wonValue), sub: `${o.won} won · ${o.open} open` }));

    const since = new Date(); since.setDate(since.getDate() - 7);
    const sinceIso = since.toISOString();
    const weekActs = activities.filter(a => a.createdAt >= sinceIso && a.type !== 'task' && !a.description.startsWith('Stage changed'));
    const actRows = ['call', 'email', 'meeting', 'site_walk', 'proposal', 'note'].map(t => {
      const n = weekActs.filter(a => a.type === t).length;
      return { label: t.replace('_', ' '), value: n, display: String(n) };
    });

    return { winRate, avgDeal, avgCycle, wonCount: won.length, closedCount: closed.length, forecast, bySource, byService, lostReasons, byOwner, actRows };
  }, [filteredLeads, activities, currentUserId, currentUserName]);

  function toggleSort(col: typeof listSort['col']) {
    setListSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  }

  async function handleSetStage(lead: Lead, stage: Stage) {
    if (stage === lead.stage) return;
    if (stage === 'won' || stage === 'lost') { setClosing({ lead, outcome: stage }); return; }
    try {
      await changeLeadStage(lead, stage, currentUserId, lead.closedAt ? { closedAt: null as any } : {});
      toast({ title: `Moved to ${STAGE_LABELS[stage]}` });
    } catch {
      toast({ title: 'Failed to update stage', variant: 'destructive' });
    }
  }

  function handleMoveNext(lead: Lead) {
    const i = OPEN_STAGES.indexOf(lead.stage);
    if (i >= 0 && i < OPEN_STAGES.length - 1) handleSetStage(lead, OPEN_STAGES[i + 1]);
  }

  function handleDragEnd(e: DragEndEvent) {
    const lead = leads.find(l => l.id === e.active.id);
    const stage = e.over?.id as Stage | undefined;
    if (lead && stage) handleSetStage(lead, stage);
  }

  function exportCsv() {
    downloadText(`aaromach-leads-${todayKey()}.csv`, leadsToCsv(sortedListLeads));
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
        ...(convertLead.address ? { address: convertLead.address } : {}),
        roles: ['client'],
        role: 'Client',
        subscriptionStatus: 'active',
        createdAt: new Date().toISOString(),
        convertedFromLeadId: convertLead.id,
      });
      await updateDoc(doc(db, 'leads', convertLead.id), { stage: 'won', convertedToClient: true, updatedAt: new Date().toISOString() });
      toast({ title: 'Client created', description: `${convertLead.companyName} is now an active client.` });
      setConvertLead(null);
      router.push('/admin/crm/clients');
    } catch (e: any) {
      const denied = e?.code === 'permission-denied';
      toast({ variant: 'destructive', title: 'Failed to convert', description: denied ? 'Creating client accounts requires an admin.' : e.message });
    } finally {
      setSavingClient(false);
    }
  };

  const leadRow = (lead: Lead, cells: React.ReactNode, extra?: string) => (
    <TableRow key={lead.id} className={cn('border-border-sub hover:bg-bg-secondary cursor-pointer', extra)} onClick={() => setSelectedLead(lead)}>
      {cells}
    </TableRow>
  );
  const emptyRow = (cols: number, text: string) => (
    <TableRow><TableCell colSpan={cols} className="text-center py-12 text-[10px] text-text-muted uppercase tracking-widest">{text}</TableCell></TableRow>
  );

  const filterTrigger = 'h-9 w-[140px] bg-bg-primary border-border-main text-[10px] font-bold uppercase tracking-widest';

  return (
    <div className="space-y-5 min-h-full">
      <header className="page-header">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2"><Target size={12} /> Sales Intelligence</p>
          <h1 className="page-title">CRM Pipeline</h1>
          <p className="page-subtitle">Leads & opportunities from first contact to closed deal.</p>
        </div>
        <div className="page-header-right gap-2">
          <Button variant="outline" size="sm" className="h-9 text-[10px] font-bold uppercase tracking-wider border-border-main" onClick={exportCsv}>
            <Download size={12} className="mr-1.5" /> Export
          </Button>
          {canImportLeads && (
            <Button variant="outline" size="sm" className="h-9 text-[10px] font-bold uppercase tracking-wider border-border-main" onClick={() => setIsImportOpen(true)}>
              <Upload size={12} className="mr-1.5" /> Import Leads
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-9 text-[10px] font-bold uppercase tracking-wider border-border-main" onClick={() => router.push('/admin/crm/clients')}>
            <Building2 size={12} className="mr-1.5" /> Go To Clients
          </Button>
        </div>
      </header>

      {/* Search / filter bar */}
      <div className="bg-bg-secondary p-3 rounded-xl border border-border-sub flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-main bg-bg-primary text-[11px] font-bold uppercase tracking-wide text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-red transition-colors"
            placeholder="Search company, contact, phone, tag..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={ownerFilter} onValueChange={(v: any) => setOwnerFilter(v)}>
          <SelectTrigger className={filterTrigger}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-[10px] uppercase font-bold">All Owners</SelectItem>
            <SelectItem value="mine" className="text-[10px] uppercase font-bold">My Leads</SelectItem>
            <SelectItem value="unassigned" className="text-[10px] uppercase font-bold">Unassigned</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className={filterTrigger}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-[10px] uppercase font-bold">All Sources</SelectItem>
            {SOURCES.map(s => <SelectItem key={s.key} value={s.key} className="text-[10px] uppercase font-bold">{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={serviceFilter} onValueChange={setServiceFilter}>
          <SelectTrigger className={filterTrigger}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-[10px] uppercase font-bold">All Services</SelectItem>
            {SERVICE_LINES.map(s => <SelectItem key={s} value={s} className="text-[10px] uppercase font-bold">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-text-muted cursor-pointer">
          <Checkbox checked={staleOnly} onCheckedChange={v => setStaleOnly(!!v)} /> Stale {STALE_DAYS}d+
        </label>
        <Select value={listSort.col} onValueChange={(v: any) => setListSort(prev => ({ ...prev, col: v }))}>
          <SelectTrigger className={filterTrigger}>
            <div className="flex items-center gap-2"><ArrowUpDown size={12} className="text-text-muted" /><SelectValue /></div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated" className="text-[10px] uppercase font-bold">Last Updated</SelectItem>
            <SelectItem value="close" className="text-[10px] uppercase font-bold">Close Date</SelectItem>
            <SelectItem value="stage" className="text-[10px] uppercase font-bold">By Stage</SelectItem>
            <SelectItem value="value" className="text-[10px] uppercase font-bold">By Value</SelectItem>
            <SelectItem value="company" className="text-[10px] uppercase font-bold">By Company</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center border border-border-main rounded-lg overflow-hidden h-9 bg-bg-primary">
          <button onClick={() => setViewMode('kanban')} className={cn('h-9 w-9 flex items-center justify-center transition-colors', viewMode === 'kanban' ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary')}>
            <LayoutGrid size={13} />
          </button>
          <div className="w-px h-full bg-border-main" />
          <button onClick={() => setViewMode('list')} className={cn('h-9 w-9 flex items-center justify-center transition-colors', viewMode === 'list' ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary')}>
            <List size={13} />
          </button>
        </div>
        <Button size="sm" className="h-9 ml-auto text-[10px] font-bold uppercase tracking-wider bg-brand-red hover:bg-brand-red/90 text-white" onClick={() => setIsNewLeadOpen(true)}>
          <Plus size={12} className="mr-1.5" /> New Lead
        </Button>
      </div>

      <Tabs value={crmTab} onValueChange={setCrmTab} className="w-full">
        <TabsList className="tabs border-b border-border-sub bg-transparent rounded-none h-auto p-0 gap-8 justify-start mb-1 flex-wrap">
          <TabsTrigger value="pipeline" className="crm-tab-trigger">Pipeline</TabsTrigger>
          <TabsTrigger value="myday" className="crm-tab-trigger flex items-center gap-2">
            My Day
            {myDayCount > 0 && <span className="text-[8px] font-black bg-brand-red text-white px-1.5 py-0.5 rounded">{myDayCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="opportunities" className="crm-tab-trigger">Opportunities</TabsTrigger>
          <TabsTrigger value="insights" className="crm-tab-trigger">Insights</TabsTrigger>
          <TabsTrigger value="quotes" className="crm-tab-trigger flex items-center gap-2">
            Quotes
            {quotes.length > 0 && <span className="text-[8px] font-black bg-bg-tertiary text-text-muted border border-border-sub px-1.5 py-0.5 rounded">{quotes.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="won" className="crm-tab-trigger">Won</TabsTrigger>
          <TabsTrigger value="lost" className="crm-tab-trigger">Lost</TabsTrigger>
        </TabsList>

        {/* ── Pipeline ── */}
        <TabsContent value="pipeline" className="m-0 pt-3 space-y-3">
          <div className="flex items-center gap-6 px-1 flex-wrap">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-text-muted"><TrendingUp size={12} /> {openLeads.length} Active</span>
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-text-muted"><DollarSign size={12} /> {formatMoney(totalValue)} Pipeline</span>
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-text-primary"><Percent size={12} /> {formatMoney(weightedTotal)} Weighted</span>
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-text-green"><CheckCircle2 size={12} /> {formatMoney(wonValue)} Won</span>
            {staleCount > 0 && (
              <button onClick={() => setStaleOnly(true)} className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-400 hover:underline">
                <AlertTriangle size={12} /> {staleCount} Stale
              </button>
            )}
          </div>

          {viewMode === 'list' && (
            <div className="rounded-xl border border-border-sub overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border-sub">
                    <TableHead className={cn(thCls, 'cursor-pointer hover:text-text-primary')} onClick={() => toggleSort('company')}><span className="flex items-center gap-1.5">Company <ArrowUpDown size={10} /></span></TableHead>
                    <TableHead className={thCls}>Contact</TableHead>
                    <TableHead className={cn(thCls, 'cursor-pointer hover:text-text-primary')} onClick={() => toggleSort('stage')}><span className="flex items-center gap-1.5">Stage <ArrowUpDown size={10} /></span></TableHead>
                    <TableHead className={cn(thCls, 'cursor-pointer hover:text-text-primary')} onClick={() => toggleSort('value')}><span className="flex items-center gap-1.5">Value <ArrowUpDown size={10} /></span></TableHead>
                    <TableHead className={thCls}>Owner</TableHead>
                    <TableHead className={cn(thCls, 'cursor-pointer hover:text-text-primary')} onClick={() => toggleSort('close')}><span className="flex items-center gap-1.5">Close <ArrowUpDown size={10} /></span></TableHead>
                    <TableHead className={cn(thCls, 'cursor-pointer hover:text-text-primary')} onClick={() => toggleSort('updated')}><span className="flex items-center gap-1.5">Last Touch <ArrowUpDown size={10} /></span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pager.items.map(lead => leadRow(lead, <>
                    <TableCell className="font-bold text-[11px] uppercase text-text-primary">
                      <span className="flex items-center gap-1.5">{isStale(lead) && <AlertTriangle size={10} className="text-amber-400" />}{lead.companyName}</span>
                    </TableCell>
                    <TableCell className="text-[10px] text-text-muted">
                      <div>{lead.contactName}</div>
                      {lead.contactEmail && <div className="text-[9px] mt-0.5">{lead.contactEmail}</div>}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Select value={lead.stage} onValueChange={v => handleSetStage(lead, v as Stage)}>
                        <SelectTrigger className={cn('h-7 text-[9px] font-black uppercase border-0 bg-transparent w-[140px]', STAGES.find(s => s.key === lead.stage)?.color)}><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-bg-elevated border-border-main">
                          {STAGES.map(s => <SelectItem key={s.key} value={s.key} className={cn('text-[9px] font-bold uppercase', s.color)}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-[11px] font-black font-mono text-text-green">
                      {lead.estimatedValue > 0 ? formatMoney(lead.estimatedValue) : '—'}
                      {isOpen(lead) && lead.estimatedValue > 0 && <span className="block text-[9px] text-text-muted font-bold">{probabilityOf(lead)}%</span>}
                    </TableCell>
                    <TableCell className="text-[10px] text-text-muted">{lead.assignedToName || '—'}</TableCell>
                    <TableCell className="text-[10px] text-text-muted">{lead.expectedCloseDate || '—'}</TableCell>
                    <TableCell className="text-[10px] text-text-muted">{(() => { const d = daysSince(lastTouch(lead)); return d === null ? '—' : d === 0 ? 'Today' : `${d}d ago`; })()}</TableCell>
                  </>))}
                  {sortedListLeads.length === 0 && emptyRow(7, 'No leads found')}
                </TableBody>
              </Table>
              <ListPager pager={pager} noun="leads" />
            </div>
          )}

          {viewMode === 'kanban' && (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <div className="overflow-x-auto pb-4">
                <div className="flex gap-3 min-w-max">
                  {pipeline.map(({ stage, leads: colLeads }) => (
                    <StageColumn key={stage.key} stage={stage} leads={colLeads} loading={loading}>
                      {colLeads.map(lead => (
                        <LeadCard key={lead.id} lead={lead} onMoveNext={handleMoveNext} onOpen={setSelectedLead} onConvert={setConvertLead} />
                      ))}
                    </StageColumn>
                  ))}
                </div>
              </div>
            </DndContext>
          )}
        </TabsContent>

        {/* ── My Day ── */}
        <TabsContent value="myday" className="m-0 pt-3">
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border-sub overflow-hidden">
              <p className="px-4 py-3 border-b border-border-sub text-[10px] font-black uppercase tracking-widest text-text-primary flex items-center gap-2">
                <Calendar size={12} className="text-brand-red" /> Follow-ups Due ({dueFollowUps.length})
              </p>
              <Table>
                <TableBody>
                  {dueFollowUps.map(lead => leadRow(lead, <>
                    <TableCell className="font-bold text-[11px] uppercase text-text-primary">
                      {lead.companyName}
                      {lead.nextStep && <span className="block text-[10px] normal-case font-normal text-text-muted">{lead.nextStep}</span>}
                    </TableCell>
                    <TableCell className="text-[10px]">
                      {lead.contactPhone && <a href={`tel:${lead.contactPhone}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-text-muted hover:text-text-primary"><Phone size={9} />{lead.contactPhone}</a>}
                      {lead.contactEmail && <a href={`mailto:${lead.contactEmail}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-text-muted hover:text-text-primary"><Mail size={9} />{lead.contactEmail}</a>}
                    </TableCell>
                    <TableCell className={cn('text-[10px] font-bold', lead.followUpDate! < today ? 'text-brand-red' : 'text-text-primary')}>
                      {lead.followUpDate! < today ? `Overdue · ${lead.followUpDate}` : 'Today'}
                    </TableCell>
                  </>, lead.followUpDate! < today ? 'bg-brand-red/5' : ''))}
                  {dueFollowUps.length === 0 && emptyRow(3, 'Nothing due — nice')}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-xl border border-border-sub overflow-hidden">
              <p className="px-4 py-3 border-b border-border-sub text-[10px] font-black uppercase tracking-widest text-text-primary flex items-center gap-2">
                <ListTodo size={12} className="text-brand-red" /> Open Tasks ({openTasks.length})
              </p>
              <Table>
                <TableBody>
                  {openTasks.map(t => {
                    const lead = leadById.get(t.leadId);
                    const overdue = t.scheduledAt && t.scheduledAt < today;
                    return (
                      <TableRow key={t.id} className="border-border-sub hover:bg-bg-secondary cursor-pointer" onClick={() => lead && setSelectedLead(lead)}>
                        <TableCell className="w-8" onClick={e => e.stopPropagation()}>
                          <Checkbox onCheckedChange={() => updateDoc(doc(db, 'leadActivities', t.id), { completedAt: new Date().toISOString() })} />
                        </TableCell>
                        <TableCell className="text-[11px] text-text-secondary">
                          {t.description}
                          <span className="block text-[9px] uppercase font-bold text-text-muted">{lead?.companyName}</span>
                        </TableCell>
                        <TableCell className={cn('text-[10px] font-bold', overdue ? 'text-brand-red' : 'text-text-muted')}>{t.scheduledAt || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                  {openTasks.length === 0 && emptyRow(3, 'No open tasks')}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-xl border border-border-sub overflow-hidden">
              <p className="px-4 py-3 border-b border-border-sub text-[10px] font-black uppercase tracking-widest text-text-primary flex items-center gap-2">
                <Clock size={12} className="text-text-muted" /> Upcoming Follow-ups
              </p>
              <Table>
                <TableBody>
                  {upcomingFollowUps.map(lead => leadRow(lead, <>
                    <TableCell className="font-bold text-[11px] uppercase text-text-primary">{lead.companyName}</TableCell>
                    <TableCell><StageBadge stage={lead.stage} /></TableCell>
                    <TableCell className="text-[10px] text-text-muted">{lead.followUpDate}</TableCell>
                  </>))}
                  {upcomingFollowUps.length === 0 && emptyRow(3, 'None scheduled')}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-xl border border-border-sub overflow-hidden">
              <p className="px-4 py-3 border-b border-border-sub text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-2">
                <AlertTriangle size={12} /> Needs Attention — stale or no next step
              </p>
              <Table>
                <TableBody>
                  {[...new Map([...openLeads.filter(isStale), ...noNextStep].map(l => [l.id, l])).values()].slice(0, 20).map(lead => leadRow(lead, <>
                    <TableCell className="font-bold text-[11px] uppercase text-text-primary">{lead.companyName}</TableCell>
                    <TableCell><StageBadge stage={lead.stage} /></TableCell>
                    <TableCell className="text-[10px] text-text-muted">
                      {isStale(lead) ? `${daysSince(lastTouch(lead))}d idle` : 'No next step'}
                    </TableCell>
                  </>))}
                  {openLeads.filter(isStale).length + noNextStep.length === 0 && emptyRow(3, 'Every deal has a next step')}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ── Opportunities ── */}
        <TabsContent value="opportunities" className="m-0 pt-3">
          {(() => {
            const opps = filteredLeads.filter(l => ['qualified', 'proposal_sent', 'negotiating'].includes(l.stage))
              .sort((a, b) => (a.expectedCloseDate || '9').localeCompare(b.expectedCloseDate || '9'));
            return (
              <>
                <div className="flex items-center gap-4 px-1 mb-4 text-[10px] font-bold uppercase tracking-widest text-text-muted">
                  <TrendingUp size={12} className="text-amber-400" /> {opps.length} Active Opportunities
                  <span>·</span> {formatMoney(opps.reduce((s, l) => s + (l.estimatedValue || 0), 0))} Pipeline
                  <span>·</span> <span className="text-text-primary">{formatMoney(opps.reduce((s, l) => s + weightedValue(l), 0))} Weighted</span>
                </div>
                <div className="rounded-xl border border-border-sub overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border-sub">
                        <TableHead className={thCls}>Company</TableHead>
                        <TableHead className={thCls}>Next Step</TableHead>
                        <TableHead className={thCls}>Value</TableHead>
                        <TableHead className={thCls}>Win %</TableHead>
                        <TableHead className={thCls}>Stage</TableHead>
                        <TableHead className={thCls}>Expected Close</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {opps.map(lead => leadRow(lead, <>
                        <TableCell className="font-bold text-[11px] uppercase text-text-primary">
                          {lead.companyName}
                          <span className="block text-[9px] font-normal normal-case text-text-muted">{lead.contactName}</span>
                        </TableCell>
                        <TableCell className="text-[10px] text-text-muted max-w-[220px] truncate">{lead.nextStep || '—'}</TableCell>
                        <TableCell className="text-[11px] font-black font-mono text-text-green">{lead.estimatedValue > 0 ? formatMoney(lead.estimatedValue) : '—'}</TableCell>
                        <TableCell className="text-[10px] font-bold text-text-primary">{probabilityOf(lead)}%</TableCell>
                        <TableCell><StageBadge stage={lead.stage} /></TableCell>
                        <TableCell className={cn('text-[10px]', lead.expectedCloseDate && lead.expectedCloseDate < today ? 'text-brand-red font-bold' : 'text-text-muted')}>
                          {lead.expectedCloseDate || '—'}
                        </TableCell>
                      </>))}
                      {opps.length === 0 && emptyRow(6, 'No active opportunities')}
                    </TableBody>
                  </Table>
                </div>
              </>
            );
          })()}
        </TabsContent>

        {/* ── Insights ── */}
        <TabsContent value="insights" className="m-0 pt-3 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat icon={DollarSign} label="Open Pipeline" value={formatMoney(totalValue, true)} sub={`${openLeads.length} deals`} />
            <Stat icon={Percent} label="Weighted Forecast" value={formatMoney(weightedTotal, true)} sub="value × win %" />
            <Stat icon={Trophy} label="Win Rate" value={`${insights.winRate}%`} sub={`${insights.wonCount} of ${insights.closedCount} closed`} tone="text-text-green" />
            <Stat icon={CheckCircle2} label="Avg Deal Size" value={formatMoney(insights.avgDeal, true)} sub="won deals" />
            <Stat icon={Clock} label="Avg Sales Cycle" value={`${insights.avgCycle}d`} sub="created → won" />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            {([
              ['Forecast by Expected Close (weighted)', insights.forecast],
              ['Won Revenue by Source', insights.bySource],
              ['Open Pipeline by Service Line', insights.byService],
              ['Lost Reasons', insights.lostReasons],
              ['By Owner', insights.byOwner],
              ['Activity — Last 7 Days', insights.actRows],
            ] as [string, any[]][]).map(([title, rows]) => (
              <div key={title} className="rounded-xl border border-border-sub bg-bg-secondary p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-text-primary mb-3">{title}</p>
                <BarRows rows={rows} />
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Quotes ── */}
        <TabsContent value="quotes" className="m-0 pt-3">
          <div className="rounded-xl border border-border-sub overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border-sub">
                  <TableHead className={thCls}>Title</TableHead>
                  <TableHead className={thCls}>Client</TableHead>
                  <TableHead className={thCls}>Total</TableHead>
                  <TableHead className={thCls}>Status</TableHead>
                  <TableHead className={thCls}>Created</TableHead>
                  <TableHead className={thCls}>Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...quotes].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).map(q => (
                  <TableRow key={q.id} className="border-border-sub hover:bg-bg-secondary cursor-pointer" onClick={() => router.push('/admin/quotes')}>
                    <TableCell className="font-bold text-[11px] uppercase text-text-primary">{q.title}</TableCell>
                    <TableCell className="text-[10px] text-text-muted">{q.customerName}</TableCell>
                    <TableCell className="text-[11px] font-black font-mono text-text-green">{formatMoney(q.total || 0)}</TableCell>
                    <TableCell>
                      <Badge className={`text-[8px] h-5 uppercase border ${
                        q.status === 'approved' ? 'bg-text-green/10 text-text-green border-text-green/20' :
                        q.status === 'rejected' ? 'bg-text-red/10 text-text-red border-text-red/20' :
                        'bg-amber-400/10 text-amber-400 border-amber-400/20'
                      }`}>{q.status}</Badge>
                    </TableCell>
                    <TableCell className="text-[10px] text-text-muted">{q.createdAt ? new Date(q.createdAt).toLocaleDateString() : '—'}</TableCell>
                    <TableCell className="text-[10px] text-text-muted">{q.expirationDate ? new Date(q.expirationDate).toLocaleDateString() : '—'}</TableCell>
                  </TableRow>
                ))}
                {quotes.length === 0 && emptyRow(6, 'No quotes yet')}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Won ── */}
        <TabsContent value="won" className="m-0 pt-3">
          {(() => {
            const won = filteredLeads.filter(l => l.stage === 'won').sort((a, b) => (b.closedAt || b.updatedAt || '').localeCompare(a.closedAt || a.updatedAt || ''));
            return (
              <>
                {won.length > 0 && (
                  <div className="flex items-center gap-4 px-1 mb-4 text-[10px] font-bold uppercase tracking-widest">
                    <CheckCircle2 size={12} className="text-text-green" />
                    <span className="text-text-green">{formatMoney(won.reduce((s, l) => s + (l.estimatedValue || 0), 0))} Total Won</span>
                    <span className="text-text-muted">· {won.length} Deals</span>
                  </div>
                )}
                <div className="rounded-xl border border-border-sub overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border-sub">
                        <TableHead className={thCls}>Company</TableHead>
                        <TableHead className={thCls}>Contact</TableHead>
                        <TableHead className={thCls}>Deal Value</TableHead>
                        <TableHead className={thCls}>Closed</TableHead>
                        <TableHead className={thCls}>Source</TableHead>
                        <TableHead className={thCls}>Client</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {won.map(lead => leadRow(lead, <>
                        <TableCell className="font-bold text-[11px] uppercase text-text-primary">{lead.companyName}</TableCell>
                        <TableCell className="text-[10px] text-text-muted">{lead.contactName}</TableCell>
                        <TableCell className="text-[12px] font-black font-mono text-text-green">{formatMoney(lead.estimatedValue || 0)}</TableCell>
                        <TableCell className="text-[10px] text-text-muted">{new Date(lead.closedAt || lead.updatedAt).toLocaleDateString()}</TableCell>
                        <TableCell className="text-[10px] text-text-muted uppercase">{sourceLabel(lead.source)}</TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          {lead.convertedToClient
                            ? <span className="text-[9px] font-bold uppercase text-text-green">Converted</span>
                            : <Button size="sm" variant="outline" className="h-6 px-2 text-[8px] font-bold uppercase" onClick={() => setConvertLead(lead)}><UserCheck size={9} className="mr-1" /> Convert</Button>}
                        </TableCell>
                      </>))}
                      {won.length === 0 && emptyRow(6, 'No won deals yet')}
                    </TableBody>
                  </Table>
                </div>
              </>
            );
          })()}
        </TabsContent>

        {/* ── Lost ── */}
        <TabsContent value="lost" className="m-0 pt-3">
          <div className="rounded-xl border border-border-sub overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border-sub">
                  <TableHead className={thCls}>Company</TableHead>
                  <TableHead className={thCls}>Est. Value</TableHead>
                  <TableHead className={thCls}>Reason</TableHead>
                  <TableHead className={thCls}>Details</TableHead>
                  <TableHead className={thCls}>Closed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.filter(l => l.stage === 'lost').sort((a, b) => (b.closedAt || b.updatedAt || '').localeCompare(a.closedAt || a.updatedAt || '')).map(lead => leadRow(lead, <>
                  <TableCell className="font-bold text-[11px] uppercase text-text-primary">{lead.companyName}</TableCell>
                  <TableCell className="text-[11px] font-black font-mono text-text-muted">{lead.estimatedValue > 0 ? formatMoney(lead.estimatedValue) : '—'}</TableCell>
                  <TableCell className="text-[10px] font-bold text-text-red">{lead.lostReasonCategory || '—'}</TableCell>
                  <TableCell className="text-[10px] text-text-muted max-w-[220px] truncate">{lead.lostReason || '—'}</TableCell>
                  <TableCell className="text-[10px] text-text-muted">{new Date(lead.closedAt || lead.updatedAt).toLocaleDateString()}</TableCell>
                </>, 'opacity-70 hover:opacity-100'))}
                {filteredLeads.filter(l => l.stage === 'lost').length === 0 && emptyRow(5, 'No lost deals')}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <NewLeadDialog
        open={isNewLeadOpen || !!editLead}
        lead={editLead}
        leads={leads}
        onClose={() => { setIsNewLeadOpen(false); setEditLead(null); }}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
      />

      <ImportLeadsDialog open={isImportOpen} onClose={() => setIsImportOpen(false)} currentUserId={currentUserId} />

      <LeadDetailDrawer
        lead={selectedLead}
        activities={activities}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        onClose={() => setSelectedLead(null)}
        onEdit={setEditLead}
        onCloseDeal={(lead, outcome) => setClosing({ lead, outcome })}
        onConvert={setConvertLead}
      />

      <CloseDealDialog lead={closing?.lead ?? null} outcome={closing?.outcome ?? null} currentUserId={currentUserId} onClose={() => setClosing(null)} />

      <Dialog open={!!convertLead} onOpenChange={v => !v && setConvertLead(null)}>
        <DialogContent className="bg-bg-elevated border-border-main max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
              <UserCheck size={14} className="text-text-green" /> Convert to Client
            </DialogTitle>
          </DialogHeader>
          {convertLead && (
            <div className="space-y-3 py-2">
              <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub space-y-1">
                <p className="text-[11px] font-black uppercase text-text-primary">{convertLead.companyName}</p>
                <p className="text-[10px] text-text-muted">{convertLead.contactName} · {convertLead.contactEmail}</p>
              </div>
              <p className="text-[10px] text-text-muted uppercase tracking-widest">This will create a new client account and mark the lead as converted.</p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConvertLead(null)} className="text-[10px] font-black uppercase">Cancel</Button>
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
