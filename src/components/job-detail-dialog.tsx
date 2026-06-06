'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { 
  Tabs, 
  TabsList, 
  TabsTrigger, 
  TabsContent 
} from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatCityState } from '@/lib/utils';
import {
  X,
  MapPin,
  Calendar,
  Clock,
  Lock,
  ExternalLink,
  ChevronRight,
  Check,
  AlertTriangle,
  DollarSign,
  Users,
  FileText,
  Activity,
  ShieldCheck,
  ArrowRight,
  RotateCcw,
  Minus,
  Plus,
  Info,
  History,
  Navigation,
  RefreshCw
} from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { format, parseISO } from 'date-fns';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  orderBy,
  limit,
} from 'firebase/firestore';
import type { WorkOrder, WeeklyLog, AssignmentTimeLog, Technician } from '@/lib/types';
import { assignmentTimeLogs } from '@/lib/data';

// ─── Constants ───────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Scope', 'Activity Ledger', 'Admin Review'] as const;
type Tab = typeof TABS[number];

const FIELD_NATION_BASE = 'https://app.fieldnation.com/workorders/';

const getFieldNationUrl = (workOrder: WorkOrder) => {
  const id = workOrder.externalWorkOrderId || workOrder.id.replace(/^(wo-|asmt-)/, '');
  return `${FIELD_NATION_BASE}${id}`;
};

const PAY_TYPE_LABELS: Record<string, string> = {
  fixed:   'Fixed Rate',
  hourly:  'Hourly Labor Rate',
  blended: 'Blended Rate',
};

const displayTime = (timeStr?: string) => {
    if (!timeStr) return 'TBD';
    try {
        const [h, m] = timeStr.split(':');
        const d = new Date();
        d.setHours(parseInt(h), parseInt(m), 0);
        return format(d, 'h:mm a');
    } catch (e) {
        return timeStr;
    }
};

// ─── Pay calculation helpers ─────────────────────────────────────────────────

function calcPayout(wo: WorkOrder, hoursWorked?: number): {
  label: string;
  amount: number;
  lines: { label: string; value: string }[];
} {
  const type = wo.payType || 'fixed';

  if (type === 'fixed') {
    return {
      label: 'Fixed Rate',
      amount: wo.pay || 0,
      lines: [{ label: 'Fixed Amount', value: `$${(wo.pay || 0).toFixed(2)}` }],
    };
  }

  if (type === 'hourly') {
    const hrs = hoursWorked ?? 0;
    const rate = wo.pay || 0;
    return {
      label: 'Hourly Labor Rate',
      amount: hrs * rate,
      lines: [
        { label: 'Rate',  value: `$${rate.toFixed(2)}/hr` },
        { label: 'Hours', value: hrs.toFixed(2) },
        { label: 'Total', value: `$${(hrs * rate).toFixed(2)}` },
      ],
    };
  }

  if (type === 'blended') {
    const base     = wo.blendedFixedPay    || 0;
    const baseHrs  = wo.blendedIncludedHours  || 0;
    const ovRate   = wo.blendedHourlyRate || 0;
    const hrs      = hoursWorked ?? 0;
    const ovHrs    = Math.max(0, hrs - baseHrs);
    const total    = base + ovHrs * ovRate;
    return {
      label: 'Blended Rate',
      amount: total,
      lines: [
        { label: 'Base Pay',    value: `$${base.toFixed(2)} (${baseHrs}h)` },
        { label: 'OT Rate',     value: `$${ovRate.toFixed(2)}/hr` },
        { label: 'OT Hours',    value: ovHrs.toFixed(2) },
        { label: 'Total',       value: `$${total.toFixed(2)}` },
      ],
    };
  }

  return { label: 'Unknown', amount: 0, lines: [] };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MetaBox({ icon: Icon, value }: { icon: any; value: string }) {
  return (
    <div className="flex items-center gap-2 border border-border-sub px-3 py-1.5 rounded bg-bg-primary/30">
      <Icon size={12} className="text-brand-red shrink-0" />
      <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest truncate">{value}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] whitespace-nowrap">
        {children}
      </p>
      <div className="flex-1 h-px bg-border-sub/30" />
    </div>
  );
}

function InfoGrid({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-5">
      {items.map(({ label, value }) => (
        <div key={label} className="bg-bg-tertiary border border-border-sub rounded-xl p-3 text-left">
          <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.16em] mb-1">{label}</p>
          <p className="text-[12px] font-bold text-text-primary uppercase">{value}</p>
        </div>
      ))}
    </div>
  );
}

function TimelineEntry({
  dot,
  time,
  title,
  note,
  by,
  isLast,
}: {
  dot: 'green' | 'gold' | 'blue' | 'red' | 'gray';
  time: string;
  title: string;
  note: string;
  by: string;
  isLast?: boolean;
}) {
  const dotClass = {
    green: 'border-green-border text-text-green',
    gold:  'border-accent-gold/40 text-accent-gold',
    blue:  'border-brand-red/30 text-brand-red',
    red:   'border-brand-red/60 text-text-red',
    gray:  'border-border-sub text-text-muted',
  }[dot];

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={cn('w-7 h-7 rounded-full border bg-bg-elevated flex items-center justify-center shrink-0 mt-0.5', dotClass)}>
          <div className="w-1.5 h-1.5 rounded-full bg-current" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border-sub/30 mt-2 mb-2 min-h-[20px]" />}
      </div>
      <div className="pb-6 flex-1 min-w-0 text-left">
        <div className="flex flex-col gap-1">
          <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">{time}</p>
          <p className="text-xs font-black text-text-primary uppercase tracking-wide leading-tight">{title}</p>
        </div>
        <p className="text-[11px] text-text-secondary mt-2 leading-relaxed font-medium">{note}</p>
        <p className="text-[8px] font-black text-text-muted/60 uppercase tracking-[0.2em] mt-2">
          BY: {by}
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type JobDetailDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  mission: WorkOrder | null;
  onEdit?: (mission: WorkOrder) => void;
  onUpdate?: (woId: string, updates: Partial<WorkOrder>) => void;
};

export function JobDetailDialog({ isOpen, setIsOpen, mission }: JobDetailDialogProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [adminData, setAdminData] = useState<{
    weeklyLog: WeeklyLog | null;
    sessionLogs: AssignmentTimeLog[];
  }>({
    weeklyLog: null,
    sessionLogs: []
  });
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [technicians, setTechnicians] = useState<Technician[]>([]);

  useEffect(() => {
    const unsubTech = onSnapshot(collection(db, 'users'), (snap) => {
        setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
    });
    return () => unsubTech();
  }, []);

  useEffect(() => {
    if (!isOpen || !mission) return;
    if (activeTab !== 'Admin Review') return;

    setLoadingAdmin(true);
    const woId = mission.id;

    Promise.all([
      getDocs(query(collection(db, 'weeklyLogs'), where('items', 'array-contains', { workOrderId: woId }))),
    ]).then(([logSnap]) => {
      const linkedSessionLogs = assignmentTimeLogs.filter(l => l.workOrderId === woId);
      
      setAdminData({
        weeklyLog: !logSnap.empty ? { ...logSnap.docs[0].data(), id: logSnap.docs[0].id } as WeeklyLog : null,
        sessionLogs: linkedSessionLogs
      });
    }).catch(console.error).finally(() => setLoadingAdmin(false));
  }, [activeTab, mission, isOpen]);

  const timeline = useMemo(() => {
    if (!mission) return [];
    
    const baseHistory = mission.history || [];
    const entries = [...baseHistory];

    if (!entries.some(e => e.type === 'note' && e.details.toLowerCase().includes('created'))) {
        entries.unshift({
            type: 'note',
            date: mission.scheduleDate || 'TBD',
            details: 'Assignment Created — Mission initialized in operational registry.',
            user: mission.source === 'Imported' ? 'Field Nation System' : 'Command Center'
        });
    }

    return entries.reverse();
  }, [mission]);

  if (!mission) return null;

  const isLocked = mission.status === 'completed';
  const leadTech = technicians.find(t => t.id === (mission.assignedTechnicianId || mission.techId));
  const payout = calcPayout(mission);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="p-0 gap-0 max-w-2xl w-full bg-bg-elevated border-border-default shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <DialogHeader className="shrink-0 px-8 pt-8 pb-0 text-left space-y-0">
          <div className="flex items-center justify-between mb-4">
            <DialogTitle className="font-mono text-[10px] font-bold text-brand-red uppercase tracking-[0.2em]">
              WO: {mission.id.toUpperCase()}
            </DialogTitle>
            <div className="flex items-center gap-4">
               {isLocked && (
                <div className="flex items-center gap-2 text-text-muted">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Registry Locked</span>
                    <div className="w-6 h-6 border border-border-sub rounded flex items-center justify-center bg-bg-secondary">
                        <Lock size={12}/>
                    </div>
                </div>
               )}
               <button 
                  onClick={() => setIsOpen(false)}
                  className="w-6 h-6 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
                >
                  <X size={18}/>
                </button>
            </div>
          </div>

          <div className="space-y-1 mb-6">
            <Badge variant={mission.status === 'completed' ? 'active' : 'onhold'} className="h-5 px-3 uppercase text-[9px] font-black tracking-widest mb-2">
                {mission.status}
            </Badge>
            <h2 className="text-2xl font-black uppercase tracking-wide text-text-primary leading-tight">
                {mission.title || mission.description}
            </h2>
            <DialogDescription className="hidden">Detailed mission audit terminal for assignment oversight.</DialogDescription>
          </div>

          <div className="flex flex-wrap items-center gap-4 mb-6">
            <MetaBox icon={MapPin} value={formatCityState(mission.location)} />
            <MetaBox icon={Calendar} value={mission.scheduleDate} />
            <MetaBox icon={Clock} value={mission.scheduleTime} />
          </div>

          <div className="flex gap-2 border-b border-border-sub/30">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'text-[10px] font-black uppercase tracking-widest px-6 py-3 border border-b-0 border-transparent rounded-t-lg transition-all',
                  activeTab === tab
                    ? 'bg-bg-secondary border-border-sub text-text-primary'
                    : 'text-text-muted hover:text-text-secondary hover:bg-bg-secondary/30'
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        </DialogHeader>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <Tabs value={activeTab} className="w-full h-full">
            
            {/* ══ Overview ════════════════════════════════════════════════════ */}
            <TabsContent value="Overview" className="m-0 space-y-8 animate-in fade-in duration-300">
                <div className="grid grid-cols-2 gap-8 text-left">
                    <div className="space-y-4">
                        <SectionLabel>Assignment Logic</SectionLabel>
                        <InfoGrid items={[
                            { label: 'Job Type', value: mission.projectType || '—' },
                            { label: 'Priority', value: mission.priority },
                            { label: 'Settlement', value: `${PAY_TYPE_LABELS[mission.payType || 'fixed']}` },
                            { label: 'Registry', value: mission.source || 'Manual' },
                        ]} />
                    </div>
                    <div className="space-y-4">
                        <SectionLabel>Lead Allocation</SectionLabel>
                        <div className="space-y-4">
                          {leadTech ? (
                              <div className="p-3 rounded-xl bg-bg-secondary border border-border-sub flex items-center gap-3 shadow-sm">
                                  <Avatar className="h-10 w-10 border border-border-sub">
                                      <AvatarImage src={leadTech.avatarUrl}/>
                                      <AvatarFallback>{leadTech.name.charAt(0)}</AvatarFallback>
                                  </Avatar>
                                  <div className="text-left">
                                      <p className="text-xs font-black text-text-primary uppercase tracking-tight">{leadTech.name}</p>
                                      <p className="text-[9px] text-text-muted font-bold uppercase tracking-widest">{leadTech.role}</p>
                                  </div>
                              </div>
                          ) : (
                              <div className="p-8 border border-dashed border-border-sub rounded-xl text-center opacity-40">
                                  <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Unallocated</p>
                              </div>
                          )}
                          <div className="p-4 rounded-xl bg-bg-tertiary/20 border border-dashed border-border-sub flex items-start gap-3">
                               <Info size={16} className="text-accent-gold shrink-0 mt-0.5" />
                               <p className="text-[9px] text-text-muted uppercase font-bold leading-relaxed text-left">
                                   Personnel allocation is restricted to authorized Command Center administrators.
                               </p>
                          </div>
                        </div>
                    </div>
                </div>
            </TabsContent>

            {/* ══ Scope ════════════════════════════════════════════════════ */}
            <TabsContent value="Scope" className="m-0 space-y-8 animate-in fade-in duration-300">
                <div className="text-left">
                    <div className="flex justify-between items-center mb-4">
                        <SectionLabel>Operational Briefing</SectionLabel>
                        {mission.source === 'Imported' && (
                            <a 
                                href={getFieldNationUrl(mission)} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-[9px] font-black text-brand-red uppercase tracking-tighter hover:underline flex items-center gap-1"
                            >
                                <ExternalLink size={10} /> Link to Registry
                            </a>
                        )}
                    </div>
                    <div className="p-5 rounded-xl bg-bg-secondary border border-border-sub text-[12px] text-text-secondary leading-relaxed uppercase font-medium italic shadow-inner text-left">
                        &quot;{mission.description}&quot;
                    </div>
                </div>

                {Array.isArray(mission.requiredSkills) && mission.requiredSkills.length > 0 && (
                  <div className="text-left">
                    <SectionLabel>Requirement Assets</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {mission.requiredSkills.map((skill, idx) => (
                        <Badge key={idx} variant="outline" className="bg-bg-secondary text-[9px] uppercase tracking-widest px-3 py-1">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
            </TabsContent>

            {/* ══ Activity Ledger ═════════════════════════════════════════════════ */}
            <TabsContent value="Activity Ledger" className="m-0 space-y-6 animate-in fade-in duration-300">
                <SectionLabel>Operational Timeline</SectionLabel>
                <div className="space-y-0 text-left">
                    {timeline.length > 0 ? (
                      timeline.map((entry, idx) => {
                        const isLast = idx === timeline.length - 1;
                        let dot: 'blue' | 'gold' | 'green' | 'red' | 'gray' = 'gray';
                        
                        const details = entry.details.toLowerCase();

                        if (details.includes('complete') || details.includes('finalized')) dot = 'green';
                        else if (details.includes('check') || details.includes('arrival')) dot = 'green';
                        else if (details.includes('route') || details.includes('start trip')) dot = 'gold';
                        else if (details.includes('confirm')) dot = 'blue';
                        else if (entry.type === 'revisit') dot = 'red';

                        return (
                          <TimelineEntry 
                            key={idx}
                            dot={dot}
                            time={entry.date}
                            title={entry.type.replace(/_/g, ' ')}
                            note={entry.details}
                            by={entry.user}
                            isLast={isLast}
                          />
                        );
                      })
                    ) : (
                      <div className="p-12 text-center border-2 border-dashed border-border-sub rounded-2xl opacity-40 bg-bg-secondary/30">
                        <History size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                        <p className="text-[11px] font-bold uppercase tracking-widest text-center italic">No operational events logged in registry</p>
                      </div>
                    )}
                </div>
            </TabsContent>

            {/* ══ Admin Review ═════════════════════════════════════════════════ */}
            <TabsContent value="Admin Review" className="m-0 space-y-8 animate-in fade-in duration-300">
                {loadingAdmin ? (
                    <div className="py-24 text-center space-y-4">
                        <RefreshCw className="h-10 w-10 animate-spin mx-auto text-brand-red opacity-30" />
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.3em]">Accessing Audit Data...</p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-4 text-left">
                            <SectionLabel>Settlement Manifest</SectionLabel>
                            {adminData.weeklyLog ? (
                                <Card className="bg-bg-secondary border-border-sub overflow-hidden shadow-inner">
                                    <div className="p-4 flex items-center justify-between border-b border-border-sub bg-bg-tertiary/20">
                                        <div className="text-left">
                                            <p className="text-[8px] font-black text-text-muted uppercase mb-1">Final Disbursement</p>
                                            <p className="text-2xl font-mono font-bold text-text-green">${(adminData.weeklyLog.totalPayout || 0).toFixed(2)}</p>
                                        </div>
                                        <Badge variant="active" className="h-6 px-4 uppercase text-[9px] tracking-widest font-black">Audit Verified</Badge>
                                    </div>
                                    <div className="p-4 text-left">
                                         <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest text-left">
                                            Linked Weeklog: <span className="text-text-primary">WK-{adminData.weeklyLog.weekOf}</span>
                                         </p>
                                    </div>
                                </Card>
                            ) : (
                                <div className="p-12 border-2 border-dashed border-border-sub rounded-xl text-center opacity-40 bg-bg-secondary/30">
                                    <Clock size={32} className="mx-auto text-text-muted mb-2" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest italic text-center">Awaiting payroll submission</p>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4 text-left">
                            <SectionLabel>Field Session Registry</SectionLabel>
                            <div className="space-y-2">
                                {adminData.sessionLogs.length > 0 ? adminData.sessionLogs.map(log => (
                                    <div key={log.id} className="p-4 rounded-xl border border-border-sub bg-bg-secondary flex items-center justify-between group hover:border-text-muted transition-all">
                                        <div className="flex items-center gap-4 text-left">
                                            <div className="p-2.5 bg-bg-primary rounded border border-border-sub text-text-muted">
                                                <Navigation size={18} />
                                            </div>
                                            <div className="text-left">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-xs font-bold text-text-primary uppercase tracking-wide">
                                                        {displayTime(log.checkInTime)} — {log.checkOutTime ? displayTime(log.checkOutTime) : 'ACTIVE'}
                                                    </p>
                                                    {log.checkOutTime ? (
                                                        <Badge variant="active" className="text-[7px] h-3.5 px-1.5 uppercase">Verified</Badge>
                                                    ) : (
                                                        <Badge variant="inprogress" className="text-[7px] h-3.5 px-1.5 uppercase animate-pulse">Live Session</Badge>
                                                    )}
                                                </div>
                                                <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest mt-0.5">
                                                    {log.minutesWorked ? `${(log.minutesWorked / 60).toFixed(1)}h Logged` : 'Recording Duration'} · {log.location}
                                                </p>
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
                    </>
                )}
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="shrink-0 px-8 py-6 border-t border-border-sub bg-bg-tertiary/30 flex items-center justify-between">
           <div className="flex items-center gap-3 text-text-muted opacity-40">
                <Lock size={12}/>
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                  {isLocked ? 'Terminal Locked' : 'Terminal Active'}
                </span>
           </div>
           <Button 
                onClick={() => setIsOpen(false)}
                className="h-11 px-12 bg-transparent border-2 border-border-sub hover:bg-bg-primary hover:border-text-primary text-text-primary font-black uppercase text-[11px] tracking-[0.2em] rounded-lg transition-all"
            >
                Exit Operational Terminal
            </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
