
'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, formatCityState, isAssignableTechnician } from '@/lib/utils';
import {
  MapPin, Calendar, Clock, DollarSign,
  Check, AlertTriangle, ShieldCheck,
  History, Navigation, RefreshCw,
  Phone, Mail, MessageSquare,
  RotateCcw, UserPlus,
  Wrench, Flag, Database,
  ClipboardList, ExternalLink, Building2,
} from 'lucide-react';
import { format } from 'date-fns';
import { db, auth } from '@/lib/firebase';
import {
  collection, query, where, getDocs, onSnapshot,
  orderBy, limit, doc, updateDoc, arrayUnion,
} from 'firebase/firestore';
import type { WorkOrder, WeeklyLog, AssignmentTimeLog, Technician } from '@/lib/types';
import { displayWorkOrderNumber } from '@/lib/work-order-identity';
import { assignmentTimeLogs } from '@/lib/data';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Scope', 'Activity Ledger', 'Admin Review'] as const;
type Tab = typeof TABS[number];

const FIELD_NATION_BASE = 'https://app.fieldnation.com/workorders/';
const getFieldNationUrl = (wo: WorkOrder) => {
  const id = wo.externalWorkOrderId || wo.id.replace(/^(wo-|asmt-)/, '');
  return `${FIELD_NATION_BASE}${id}`;
};

const AVATAR_COLORS = [
  '#e879f9', '#f43f5e', '#3b82f6', '#10b981',
  '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316',
];
function getAvatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

const displayTime = (t?: string) => {
  if (!t) return 'TBD';
  try {
    const [h, m] = t.split(':');
    const d = new Date();
    d.setHours(parseInt(h), parseInt(m), 0);
    return format(d, 'h:mm a');
  } catch { return t; }
};

// ─── Pay helper ───────────────────────────────────────────────────────────────

function calcPayout(wo: WorkOrder, hoursWorked?: number) {
  const type = wo.payType || 'fixed';
  if (type === 'fixed') return { label: 'Fixed Rate', amount: wo.pay || 0, lines: [{ label: 'Fixed Amount', value: `$${(wo.pay || 0).toFixed(2)}` }] };
  if (type === 'hourly') {
    const hrs = hoursWorked ?? 0; const rate = wo.pay || 0;
    return { label: 'Hourly Labor Rate', amount: hrs * rate, lines: [{ label: 'Rate', value: `$${rate.toFixed(2)}/hr` }, { label: 'Hours', value: hrs.toFixed(2) }, { label: 'Total', value: `$${(hrs * rate).toFixed(2)}` }] };
  }
  if (type === 'blended') {
    const base = wo.blendedFixedPay || 0; const baseHrs = wo.blendedIncludedHours || 0;
    const ovRate = wo.blendedHourlyRate || 0; const hrs = hoursWorked ?? 0;
    const ovHrs = Math.max(0, hrs - baseHrs); const total = base + ovHrs * ovRate;
    return { label: 'Blended Rate', amount: total, lines: [{ label: 'Base Pay', value: `$${base.toFixed(2)} (${baseHrs}h)` }, { label: 'OT Rate', value: `$${ovRate.toFixed(2)}/hr` }, { label: 'OT Hours', value: ovHrs.toFixed(2) }, { label: 'Total', value: `$${total.toFixed(2)}` }] };
  }
  return { label: 'Unknown', amount: 0, lines: [] };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] whitespace-nowrap">{children}</p>
      <div className="flex-1 h-px bg-border-sub/30" />
    </div>
  );
}

function TimelineEntry({ dot, time, title, note, by, isLast }: {
  dot: 'green' | 'gold' | 'blue' | 'red' | 'gray';
  time: string; title: string; note: string; by: string; isLast?: boolean;
}) {
  const dotClass = { green: 'border-green-border text-text-green', gold: 'border-accent-gold/40 text-accent-gold', blue: 'border-brand-red/30 text-brand-red', red: 'border-brand-red/60 text-text-red', gray: 'border-border-sub text-text-muted' }[dot];
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={cn('w-7 h-7 rounded-full border bg-bg-elevated flex items-center justify-center shrink-0 mt-0.5', dotClass)}>
          <div className="w-1.5 h-1.5 rounded-full bg-current" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border-sub/30 mt-2 mb-2 min-h-[20px]" />}
      </div>
      <div className="pb-6 flex-1 min-w-0">
        <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">{time}</p>
        <p className="text-xs font-black text-text-primary uppercase tracking-wide leading-tight mt-0.5">{title}</p>
        <p className="text-[11px] text-text-secondary mt-2 leading-relaxed font-medium">{note}</p>
        <p className="text-[8px] font-black text-text-muted/60 uppercase tracking-[0.2em] mt-2">BY: {by}</p>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type JobDetailDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  mission: WorkOrder | null;
  onEdit?: (mission: WorkOrder) => void;
  onUpdate?: (woId: string, updates: Partial<WorkOrder>) => void;
};

export function JobDetailDialog({ isOpen, setIsOpen, mission }: JobDetailDialogProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [adminData, setAdminData] = useState<{ weeklyLog: WeeklyLog | null; sessionLogs: AssignmentTimeLog[] }>({ weeklyLog: null, sessionLogs: [] });
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [swapOpen, setSwapOpen] = useState(false);
  const [helperOpen, setHelperOpen] = useState(false);
  const [swapTechId, setSwapTechId] = useState('');
  const [helperTechId, setHelperTechId] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isOpen || !mission || activeTab !== 'Admin Review') return;
    setLoadingAdmin(true);
    const woId = mission.id;
    Promise.all([
      getDocs(query(collection(db, 'weeklyLogs'), where('items', 'array-contains', { workOrderId: woId }))),
      getDocs(query(collection(db, 'auditLog', woId, 'events'), orderBy('changedAt', 'desc'), limit(50))),
    ]).then(([logSnap, auditSnap]) => {
      setAdminData({
        weeklyLog: !logSnap.empty ? { ...logSnap.docs[0].data(), id: logSnap.docs[0].id } as WeeklyLog : null,
        sessionLogs: assignmentTimeLogs.filter(l => l.workOrderId === woId),
      });
      setAuditEvents(auditSnap.docs.map(d => d.data()));
    }).catch(console.error).finally(() => setLoadingAdmin(false));
  }, [activeTab, mission, isOpen]);

  const timeline = useMemo(() => {
    if (!mission) return [];
    const entries = [...(mission.history || [])];
    if (!entries.some(e => e.details.toLowerCase().includes('created'))) {
      entries.push({ type: 'note', date: mission.scheduleDate || 'TBD', details: 'Assignment Created — Job initialized in system.', user: mission.source === 'Imported' ? 'Field Nation System' : 'Command Center' } as any);
    }
    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [mission]);

  const handleSwapTech = async () => {
    if (!swapTechId || !mission) return;
    const nt = technicians.find(t => t.id === swapTechId);
    const prevTechId = mission.assignedTechnicianId || mission.techId || '';
    const prevTech = technicians.find(t => t.id === prevTechId);
    const admin = auth.currentUser?.displayName || 'Admin';
    // Ownership moves to the new tech (assignedTechnicianId + techId) so the
    // previous tech immediately loses access via Firestore rules and their
    // live queries. Record the full reassignment for the audit trail.
    await updateDoc(doc(db, 'assignments', mission.id), {
      assignedTechnicianId: swapTechId, techId: swapTechId,
      history: arrayUnion({ date: new Date().toISOString(), type: 'tech_swapped',
        previousTechnicianId: prevTechId, previousTechnicianName: prevTech?.name || prevTechId,
        newTechnicianId: swapTechId, newTechnicianName: nt?.name || swapTechId,
        details: `Reassigned from ${prevTech?.name || 'unassigned'} to ${nt?.name || swapTechId}`, user: admin }),
    });
    setSwapOpen(false); setSwapTechId('');
  };

  const handleAddHelper = async () => {
    if (!helperTechId || !mission) return;
    const ht = technicians.find(t => t.id === helperTechId);
    await updateDoc(doc(db, 'assignments', mission.id), {
      additionalTechnicianIds: arrayUnion(helperTechId),
      history: arrayUnion({ date: new Date().toISOString(), type: 'helper_added',
        details: `${ht?.name || helperTechId} added as helper`, user: 'Admin' }),
    });
    setHelperOpen(false); setHelperTechId('');
  };

  if (!mission) return null;

  const leadTech = technicians.find(t => t.id === (mission.assignedTechnicianId || mission.techId));

  // ── Derived values ─────────────────────────────────────────────────────────
  const isConfirmed = mission.status === 'confirmed' || mission.status === 'completed';
  const isInProgress = mission.status === 'in-progress' || mission.status === 'on-my-way';

  const statusLabel = (() => {
    const map: Record<string, string> = { unassigned: 'Unassigned', assigned: 'Assigned', confirmed: 'Confirmed', 'on-my-way': 'On My Way', 'in-progress': 'In Progress', 'checked-out': 'Checked Out', completed: 'Completed' };
    return map[mission.status] || mission.status;
  })();

  const payDisplay = mission.payType === 'hourly' ? `$${mission.pay}/hr` : `$${(mission.pay || 0).toFixed(2)}`;

  const riskLabel = mission.slaStatus === 'breached' ? 'Breached' : mission.slaStatus === 'at-risk' ? 'At Risk' : mission.slaStatus === 'met' ? 'Met' : mission.slaStatus === 'on-track' ? 'On Track' : 'Normal';
  const riskColor = mission.slaStatus === 'breached' ? 'text-[#ef4444]' : mission.slaStatus === 'at-risk' ? 'text-[#f59e0b]' : (mission.slaStatus === 'met' || mission.slaStatus === 'on-track') ? 'text-[#00d36f]' : 'text-text-muted';

  const checkInEntry = mission.history?.find(h => h.details?.toLowerCase().includes('check-in') || h.details?.toLowerCase().includes('arrival'));
  const checkInLabel = checkInEntry ? 'Checked In' : 'Not Checked In';
  const checkInColor = checkInEntry ? 'text-[#00d36f]' : 'text-[#f59e0b]';

  const lastUpdated = mission.history?.length
    ? [...mission.history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date
    : mission.scheduleDate || '';

  const handleVerify = async () => {
    try { await updateDoc(doc(db, 'workOrders', mission.id), { status: 'confirmed' }); }
    catch (e) { console.error('Verify failed:', e); }
  };

  const logicGrid = [
    { icon: Wrench,        label: 'Job Type',    value: mission.projectType || '—',  cls: 'text-text-primary' },
    { icon: Flag,          label: 'Priority',    value: mission.priority,             cls: mission.priority === 'critical' ? 'text-[#ef4444]' : mission.priority === 'high' ? 'text-[#f97316]' : mission.priority === 'medium' ? 'text-[#f59e0b]' : 'text-text-muted' },
    { icon: DollarSign,    label: 'Settlement',  value: payDisplay,                   cls: 'text-[#00d36f]' },
    { icon: Database,      label: 'Registry',    value: mission.source || 'Manual',   cls: 'text-text-primary' },
    { icon: AlertTriangle, label: 'Risk Level',  value: riskLabel,                    cls: riskColor },
    { icon: ShieldCheck,   label: 'Status',      value: statusLabel,                  cls: isConfirmed ? 'text-[#00d36f]' : isInProgress ? 'text-[#3b82f6]' : 'text-text-muted' },
  ];

  const actionButtons = [
    { icon: Navigation,  label: 'Directions',        onClick: () => window.open(`https://maps.google.com/?q=${encodeURIComponent(mission.location || '')}`, '_blank') },
    { icon: Phone,       label: 'Call Client',       onClick: () => {} },
    { icon: MessageSquare, label: 'Message Client',  onClick: () => {} },
    { icon: ShieldCheck, label: 'Verify Assignment', onClick: handleVerify },
    { icon: RotateCcw,   label: 'Swap Tech',         onClick: () => { setSwapTechId(''); setSwapOpen(true); } },
    { icon: UserPlus,    label: 'Add Helper',        onClick: () => { setHelperTechId(''); setHelperOpen(true); } },
  ];

  const footerItems = [
    { label: 'Assignment Status', value: statusLabel, cls: isConfirmed ? 'text-[#00d36f]' : isInProgress ? 'text-[#3b82f6]' : 'text-[#f59e0b]' },
    { label: 'Check-In Status',   value: checkInLabel, cls: checkInColor },
    { label: 'GPS Status',        value: 'Restricted', cls: 'text-[#f59e0b]' },
    { label: 'Last Updated',      value: lastUpdated || '—', cls: 'text-text-primary' },
  ];

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent
        side="right"
        className="sm:max-w-[680px] w-full p-0 gap-0 bg-bg-elevated border-l border-[#252525] shadow-2xl overflow-hidden flex flex-col [&>button]:top-5 [&>button]:right-5 [&>button]:text-text-muted [&>button]:hover:text-text-primary"
      >

        {/* a11y */}
        <SheetTitle className="sr-only">{mission.title || mission.description}</SheetTitle>
        <SheetDescription className="sr-only">Assignment detail and audit view.</SheetDescription>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="shrink-0 px-6 pt-5 pb-0">

          {/* WO ID + badges */}
          <div className="flex items-center gap-2.5 flex-wrap pr-8">
            <span className="font-mono text-[11px] font-bold text-brand-red uppercase tracking-[0.15em]">
              WO: {displayWorkOrderNumber(mission)}
            </span>
            <span className={cn(
              'flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider',
              isConfirmed ? 'border-[#00d36f]/40 bg-[#00d36f]/10 text-[#00d36f]'
                : isInProgress ? 'border-[#3b82f6]/30 bg-[#3b82f6]/10 text-[#3b82f6]'
                : 'border-border-sub bg-bg-secondary text-text-muted'
            )}>
              {isConfirmed && <Check size={8} strokeWidth={3} />}
              {statusLabel}
            </span>
            {mission.source && (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[#3b82f6]/30 bg-[#3b82f6]/10 text-[#3b82f6] text-[9px] font-black uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] shrink-0" />
                {mission.source}
              </span>
            )}
          </div>

          {/* Title */}
          <h2 className="text-xl font-black text-text-primary leading-tight mt-3 mb-3 pr-8">
            {mission.title || mission.description}
          </h2>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5">
              <MapPin size={12} className="text-[#00d36f] shrink-0" />
              <span className="text-[11px] text-text-secondary font-medium">{formatCityState(mission.location)}</span>
            </span>
            <span className="text-[#333] select-none">|</span>
            <span className="flex items-center gap-1.5">
              <Calendar size={12} className="text-[#f59e0b] shrink-0" />
              <span className="text-[11px] text-text-secondary font-medium">{mission.scheduleDate || 'TBD'}</span>
            </span>
            <span className="text-[#333] select-none">|</span>
            <span className="flex items-center gap-1.5">
              <Clock size={12} className="text-[#f43f5e] shrink-0" />
              <span className="text-[11px] text-text-secondary font-medium">{displayTime(mission.scheduleTime)}</span>
            </span>
            <span className="text-[#333] select-none">|</span>
            <span className="flex items-center gap-1.5">
              <DollarSign size={12} className="text-[#00d36f] shrink-0" />
              <span className="text-[11px] text-text-secondary font-medium">{payDisplay}</span>
            </span>
            {mission.clientName && (
              <>
                <span className="text-[#333] select-none">|</span>
                <span className="flex items-center gap-1.5">
                  <Building2 size={12} className="text-[#8b5cf6] shrink-0" />
                  <span className="text-[11px] text-text-secondary font-medium">{mission.clientName}</span>
                </span>
              </>
            )}
          </div>

          {/* Tab bar */}
          <div className="flex gap-0 border-b border-[#252525] mt-4">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'text-[10px] font-black uppercase tracking-widest px-4 py-3 transition-colors border-b-2 -mb-px',
                  activeTab === tab
                    ? 'text-white border-[#00d36f]'
                    : 'text-[#555] border-transparent hover:text-[#888]'
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <Tabs value={activeTab} className="h-full">

            {/* OVERVIEW */}
            <TabsContent value="Overview" className="m-0 p-6 space-y-4 animate-in fade-in duration-200">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Assignment Logic */}
                <div className="rounded-xl border border-[#2a2a2a] bg-bg-secondary overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#222]">
                    <Wrench size={12} className="text-text-muted" />
                    <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em]">Assignment Logic</p>
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-[#222]">
                    {logicGrid.map(({ icon: Icon, label, value, cls }) => (
                      <div key={label} className="flex items-start gap-3 p-3 bg-bg-secondary">
                        <Icon size={13} className="text-text-muted mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[8px] font-black text-text-muted uppercase tracking-widest mb-0.5">{label}</p>
                          <p className={cn('text-[11px] font-bold', cls)}>{value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Lead Allocation */}
                <div className="rounded-xl border border-[#2a2a2a] bg-bg-secondary overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#222]">
                    <UserPlus size={12} className="text-[#8b5cf6]" />
                    <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em]">Lead Allocation</p>
                  </div>
                  {leadTech ? (
                    <>
                      <div className="flex items-center gap-3 p-4">
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center text-base font-black text-white shrink-0"
                          style={{ background: getAvatarColor(leadTech.name) }}
                        >
                          {leadTech.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-black text-text-primary leading-tight">{leadTech.name}</p>
                          <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">{leadTech.role || 'Field Technician'}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <a href={`tel:${leadTech.phone}`} className="w-8 h-8 rounded-lg border border-[#333] bg-bg-primary flex items-center justify-center hover:border-[#555] transition-colors">
                            <Phone size={13} className="text-text-muted" />
                          </a>
                          <a href={`mailto:${leadTech.email}`} className="w-8 h-8 rounded-lg border border-[#333] bg-bg-primary flex items-center justify-center hover:border-[#555] transition-colors">
                            <Mail size={13} className="text-text-muted" />
                          </a>
                        </div>
                      </div>
                      <div className="h-px bg-[#222] mx-4" />
                      <div className="flex items-stretch divide-x divide-[#222]">
                        {[
                          { icon: ShieldCheck, stat: leadTech.reliabilityScore ?? '—', sub: 'Reliability' },
                          { icon: ClipboardList, stat: leadTech.currentWorkload ?? '—', sub: 'Jobs Completed' },
                          { icon: Clock, stat: '—', sub: 'On-Time' },
                        ].map(({ icon: Icon, stat, sub }) => (
                          <div key={sub} className="flex-1 flex flex-col items-center gap-1 py-3 px-2">
                            <Icon size={14} className="text-text-muted" />
                            <p className="text-sm font-black text-text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>{String(stat)}</p>
                            <p className="text-[8px] font-bold text-text-muted uppercase tracking-widest text-center leading-tight">{sub}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="p-10 flex flex-col items-center justify-center opacity-40">
                      <UserPlus size={28} className="text-text-muted mb-2" />
                      <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Unallocated</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {actionButtons.map(({ icon: Icon, label, onClick }) => (
                  <button
                    key={label}
                    onClick={onClick}
                    className="flex flex-col items-center gap-1.5 py-3 px-1 rounded-lg border border-[#2a2a2a] bg-bg-secondary hover:bg-bg-tertiary hover:border-[#444] transition-colors"
                  >
                    <Icon size={14} className="text-text-muted" />
                    <span className="text-[8px] font-black uppercase tracking-wider text-text-muted leading-tight text-center">{label}</span>
                  </button>
                ))}
              </div>
            </TabsContent>

            {/* SCOPE */}
            <TabsContent value="Scope" className="m-0 p-6 space-y-8 animate-in fade-in duration-200">
              <div>
                <div className="flex justify-between items-center mb-4">
                  <SectionLabel>Operational Briefing</SectionLabel>
                  {mission.source === 'Imported' && (
                    <a href={getFieldNationUrl(mission)} target="_blank" rel="noopener noreferrer" className="text-[9px] font-black text-brand-red uppercase tracking-tighter hover:underline flex items-center gap-1 shrink-0 ml-4">
                      <ExternalLink size={10} /> Link to Registry
                    </a>
                  )}
                </div>
                <div className="p-5 rounded-xl bg-bg-secondary border border-border-sub text-[12px] text-text-secondary leading-relaxed uppercase font-medium italic shadow-inner">
                  &quot;{mission.description}&quot;
                </div>
              </div>
              {Array.isArray(mission.requiredSkills) && mission.requiredSkills.length > 0 && (
                <div>
                  <SectionLabel>Requirement Assets</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {mission.requiredSkills.map((skill, idx) => (
                      <Badge key={idx} variant="outline" className="bg-bg-secondary text-[9px] uppercase tracking-widest px-3 py-1">{skill}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ACTIVITY LEDGER */}
            <TabsContent value="Activity Ledger" className="m-0 p-6 space-y-6 animate-in fade-in duration-200">
              <SectionLabel>Assignment Timeline</SectionLabel>
              <div className="space-y-0">
                {timeline.length > 0 ? timeline.map((entry, idx) => {
                  const isLast = idx === timeline.length - 1;
                  let dot: 'blue' | 'gold' | 'green' | 'red' | 'gray' = 'gray';
                  const details = (entry.details || '').toLowerCase();
                  const type = (entry.type || '').toLowerCase();
                  let title = type.replace(/_/g, ' ') || 'Log Entry';
                  if (details.includes('complete') || details.includes('finalized') || type === 'completed') { dot = 'green'; title = 'Mission Finalized'; }
                  else if (details.includes('check-in') || details.includes('arrival') || details.includes('in-progress')) { dot = 'green'; title = 'Site Arrival / Check-In'; }
                  else if (details.includes('checked out') || details.includes('paused')) { dot = 'gold'; title = 'Mission Paused / Check-Out'; }
                  else if (details.includes('trip') || details.includes('en route')) { dot = 'gold'; title = 'Trip Initiated / En Route'; }
                  else if (details.includes('confirmed')) { dot = 'blue'; title = 'Mission Confirmed'; }
                  else if ((type === 'note' && details.includes('created')) || details.includes('initialized')) { dot = 'blue'; title = 'Registry Entry Created'; }
                  return <TimelineEntry key={idx} dot={dot} time={entry.date || 'TBD'} title={title} note={entry.details || 'No additional notes recorded.'} by={entry.user || 'System'} isLast={isLast} />;
                }) : (
                  <div className="p-12 text-center border-2 border-dashed border-border-sub rounded-2xl opacity-40 bg-bg-secondary/30">
                    <History size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                    <p className="text-[11px] font-bold uppercase tracking-widest italic text-center">No operational events logged</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ADMIN REVIEW */}
            <TabsContent value="Admin Review" className="m-0 p-6 space-y-8 animate-in fade-in duration-200">
              {loadingAdmin ? (
                <div className="py-24 text-center space-y-4">
                  <RefreshCw className="h-10 w-10 animate-spin mx-auto text-brand-red opacity-30" />
                  <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.3em]">Accessing Audit Data...</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    <SectionLabel>Settlement Manifest</SectionLabel>
                    {adminData.weeklyLog ? (
                      <Card className="bg-bg-secondary border-border-sub overflow-hidden shadow-inner">
                        <div className="p-4 flex items-center justify-between border-b border-border-sub bg-bg-tertiary/20">
                          <div>
                            <p className="text-[8px] font-black text-text-muted uppercase mb-1">Final Disbursement</p>
                            <p className="text-2xl font-mono font-bold text-text-green">${(adminData.weeklyLog.totalPayout || 0).toFixed(2)}</p>
                          </div>
                          <Badge variant="active" className="h-6 px-4 uppercase text-[9px] tracking-widest font-black">Audit Verified</Badge>
                        </div>
                        <div className="p-4">
                          <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Linked Weeklog: <span className="text-text-primary">WK-{adminData.weeklyLog.weekOf}</span></p>
                        </div>
                      </Card>
                    ) : (
                      <div className="p-12 border-2 border-dashed border-border-sub rounded-xl text-center opacity-40 bg-bg-secondary/30">
                        <Clock size={32} className="mx-auto text-text-muted mb-2" />
                        <p className="text-[10px] font-bold uppercase tracking-widest italic text-center">Awaiting payroll submission</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <SectionLabel>Field Session Registry</SectionLabel>
                    <div className="space-y-2">
                      {adminData.sessionLogs.length > 0 ? adminData.sessionLogs.map(log => (
                        <div key={log.id} className="p-4 rounded-xl border border-border-sub bg-bg-secondary flex items-center justify-between group hover:border-text-muted transition-all">
                          <div className="flex items-center gap-4">
                            <div className="p-2.5 bg-bg-primary rounded border border-border-sub text-text-muted"><Navigation size={18} /></div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{displayTime(log.checkInTime)} — {log.checkOutTime ? displayTime(log.checkOutTime) : 'ACTIVE'}</p>
                                {log.checkOutTime ? <Badge variant="active" className="text-[7px] h-3.5 px-1.5 uppercase">Verified</Badge> : <Badge variant="inprogress" className="text-[7px] h-3.5 px-1.5 uppercase animate-pulse">Live Session</Badge>}
                              </div>
                              <p className="text-[9px] text-text-muted font-bold uppercase tracking-widest mt-0.5">{log.minutesWorked ? `${(log.minutesWorked / 60).toFixed(1)}h Logged` : 'Recording Duration'} · {log.location}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[8px] bg-bg-tertiary border-border-sub font-mono">GPS LOCKED</Badge>
                        </div>
                      )) : (
                        <div className="p-12 border-2 border-dashed border-border-sub rounded-xl text-center opacity-40 bg-bg-secondary/30">
                          <Navigation size={32} className="mx-auto text-text-muted mb-2" />
                          <p className="text-[10px] font-bold uppercase tracking-widest italic text-center">No field sessions recorded</p>
                        </div>
                      )}
                    </div>
                  </div>
                  {auditEvents.length > 0 && (
                    <div className="space-y-4 mt-8">
                      <SectionLabel>Field Audit Trail</SectionLabel>
                      <div className="space-y-1">
                        {auditEvents.map((ev, idx) => (
                          <div key={idx} className="flex items-start gap-3 px-3 py-2 rounded border border-border-sub/40 bg-bg-secondary">
                            <div className="flex-shrink-0 w-1.5 h-1.5 mt-1.5 rounded-full bg-text-muted opacity-40" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[9px] font-black text-text-primary uppercase tracking-widest">{ev.field === '__action__' ? ev.newValue : ev.field}</span>
                                {ev.field !== '__action__' && (
                                  <span className="text-[9px] text-text-muted font-mono">
                                    <span className="text-text-red">{String(ev.oldValue ?? '—')}</span>
                                    <span className="mx-1 text-text-muted">→</span>
                                    <span className="text-text-green">{String(ev.newValue ?? '—')}</span>
                                  </span>
                                )}
                                {ev.details && <span className="text-[9px] text-text-muted">{ev.details}</span>}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[8px] text-text-muted font-mono">{ev.changedByName || ev.changedBy}</span>
                                <span className="text-[8px] text-text-muted">·</span>
                                <span className="text-[8px] text-text-muted font-mono">{ev.changedAt ? new Date(ev.changedAt).toLocaleString() : '—'}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

          </Tabs>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-[#222] bg-[#0d0d0d]">
          <div className="flex items-stretch divide-x divide-[#222]">
            {footerItems.map(({ label, value, cls }) => (
              <div key={label} className="flex-1 flex flex-col gap-0.5 px-4 py-3 min-w-0">
                <p className="text-[8px] font-black text-[#444] uppercase tracking-widest truncate">{label}</p>
                <p className={cn('text-[11px] font-bold truncate', cls)}>{value}</p>
              </div>
            ))}
          </div>
        </div>

      </SheetContent>

      {/* Swap Tech Dialog */}
      <Dialog open={swapOpen} onOpenChange={setSwapOpen}>
        <DialogContent className="bg-bg-elevated border-border-main sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[13px] font-black uppercase tracking-widest">Swap Technician</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Select Replacement</Label>
            <Select value={swapTechId} onValueChange={setSwapTechId}>
              <SelectTrigger className="h-9 text-[10px] font-bold uppercase bg-bg-secondary border-border-main">
                <SelectValue placeholder="Choose technician..." />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                {technicians.filter(isAssignableTechnician).map(t => (
                  <SelectItem key={t.id} value={t.id} className="text-[10px] font-bold uppercase">{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="h-8 text-[10px] uppercase font-bold" onClick={() => setSwapOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-8 text-[10px] uppercase font-bold bg-brand-red hover:bg-brand-red/90 text-white" disabled={!swapTechId} onClick={handleSwapTech}>Confirm Swap</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Helper Dialog */}
      <Dialog open={helperOpen} onOpenChange={setHelperOpen}>
        <DialogContent className="bg-bg-elevated border-border-main sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[13px] font-black uppercase tracking-widest">Add Helper</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Select Helper</Label>
            <Select value={helperTechId} onValueChange={setHelperTechId}>
              <SelectTrigger className="h-9 text-[10px] font-bold uppercase bg-bg-secondary border-border-main">
                <SelectValue placeholder="Choose technician..." />
              </SelectTrigger>
              <SelectContent className="bg-bg-elevated border-border-main">
                {technicians
                  .filter(t => isAssignableTechnician(t) && t.id !== (mission?.assignedTechnicianId || mission?.techId))
                  .map(t => (
                    <SelectItem key={t.id} value={t.id} className="text-[10px] font-bold uppercase">{t.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="h-8 text-[10px] uppercase font-bold" onClick={() => setHelperOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-8 text-[10px] uppercase font-bold bg-brand-red hover:bg-brand-red/90 text-white" disabled={!helperTechId} onClick={handleAddHelper}>Add to Team</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
