'use client';

import { useState, useEffect, useMemo } from 'react';
import type { WorkOrder, Technician, Recommendation, ReliabilityEvent, WeeklyLog } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, doc, updateDoc, onSnapshot, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { 
  Dialog, 
  DialogContent, 
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  MapPin, 
  Calendar,
  X,
  ShieldCheck,
  Download,
  Info,
  ExternalLink,
  Lock,
  Check,
  AlertTriangle,
  DollarSign,
  Users,
  FileText,
  Activity,
  Navigation,
  Play,
  LogOut,
  CheckCircle2,
  ListTodo,
  Circle,
  Briefcase,
  History,
  RotateCcw,
  RefreshCw,
  Pencil
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, formatCityState } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { PAY_TYPE_LABELS } from '@/lib/constants';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// ─── Sub-components for the new UI ───────────────────────────────────────────

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

const getFieldNationLink = (id: string) => {
  const cleanId = id.replace(/^wo-/, '');
  return `https://app.fieldnation.com/workorders/${cleanId}`;
};

// ─── Main Component ───────────────────────────────────────────────────────────

type JobDetailDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  mission: WorkOrder | null;
  onEdit?: (mission: WorkOrder) => void;
  onUpdate?: (woId: string, updates: Partial<WorkOrder>) => void;
};

export function JobDetailDialog({ isOpen, setIsOpen, mission }: JobDetailDialogProps) {
  const [activeTab, setActiveTab] = useState<'SOW' | 'LEDGER' | 'REVIEW'>('SOW');
  const [adminData, setAdminData] = useState<{
    penalties: ReliabilityEvent[];
    weeklyLog: WeeklyLog | null;
  }>({
    penalties: [],
    weeklyLog: null,
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
    if (activeTab !== 'REVIEW') return;

    setLoadingAdmin(true);
    const woId = mission.id;

    Promise.all([
      getDocs(query(collection(db, 'penaltyEvents'), where('relatedAssignmentId', '==', woId))),
      getDocs(query(collection(db, 'weeklyLogs'), where('items', 'array-contains', { workOrderId: woId }))),
    ]).then(([penSnap, logSnap]) => {
      setAdminData({
        penalties: penSnap.docs.map(d => ({ ...d.data(), id: d.id } as ReliabilityEvent)),
        weeklyLog: !logSnap.empty ? { ...logSnap.docs[0].data(), id: logSnap.docs[0].id } as WeeklyLog : null
      });
    }).catch(console.error).finally(() => setLoadingAdmin(false));
  }, [activeTab, mission, isOpen]);

  if (!mission) return null;

  const isLocked = mission.status === 'completed';
  const leadTech = technicians.find(t => t.id === mission.assignedTechnicianId);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="p-0 gap-0 max-w-2xl w-full bg-bg-elevated border-border-default shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="shrink-0 px-8 pt-8 pb-0 text-left">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[10px] font-bold text-brand-red uppercase tracking-[0.2em]">
              WO: {mission.id.toUpperCase()}
            </span>
            <div className="flex items-center gap-6">
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
          </div>

          <div className="flex flex-wrap items-center gap-4 mb-6">
            <MetaBox icon={MapPin} value={formatCityState(mission.location)} />
            <MetaBox icon={Calendar} value={mission.scheduleDate} />
            <MetaBox icon={Clock} value={mission.scheduleTime} />
          </div>

          <div className="flex gap-2 border-b border-border-sub/30">
            {[
              { id: 'SOW', label: 'SOW & Requirements' },
              { id: 'LEDGER', label: 'Activity Ledger' },
              { id: 'REVIEW', label: 'Admin Review' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  'text-[10px] font-black uppercase tracking-widest px-6 py-3 border border-b-0 border-transparent rounded-t-lg transition-all',
                  activeTab === tab.id
                    ? 'bg-bg-secondary border-border-sub text-text-primary'
                    : 'text-text-muted hover:text-text-secondary hover:bg-bg-secondary/30'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <Tabs value={activeTab} className="w-full h-full">
            
            {/* ══ SOW ════════════════════════════════════════════════════ */}
            <TabsContent value="SOW" className="m-0 space-y-8 animate-in fade-in duration-300">
                <div className="text-left">
                    <div className="flex justify-between items-center mb-4">
                        <SectionLabel>Operational Briefing</SectionLabel>
                        {mission.source === 'Imported' && (
                            <a 
                                href={getFieldNationLink(mission.id)} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-[9px] font-black text-brand-red uppercase tracking-tighter hover:underline flex items-center gap-1"
                            >
                                <ExternalLink size={10} /> Link to Registry
                            </a>
                        )}
                    </div>
                    <div className="p-5 rounded-xl bg-bg-secondary border border-border-sub text-[12px] text-text-secondary leading-relaxed uppercase font-medium italic shadow-inner">
                        &quot;{mission.description}&quot;
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-8 text-left">
                    <div className="space-y-4">
                        <SectionLabel>Assignment Logic</SectionLabel>
                        <div className="grid grid-cols-1 gap-2">
                             <div className="flex justify-between p-3 rounded-lg bg-bg-secondary border border-border-sub">
                                <span className="text-[9px] font-black text-text-muted uppercase">Priority</span>
                                <Badge variant={mission.priority === 'critical' || mission.priority === 'high' ? 'high' : 'outline'} className="h-4 px-2 text-[8px] uppercase">{mission.priority}</Badge>
                             </div>
                             <div className="flex justify-between p-3 rounded-lg bg-bg-secondary border border-border-sub">
                                <span className="text-[9px] font-black text-text-muted uppercase">Job Type</span>
                                <span className="text-[10px] font-bold text-text-primary uppercase">{mission.projectType}</span>
                             </div>
                             <div className="flex justify-between p-3 rounded-lg bg-bg-secondary border border-border-sub">
                                <span className="text-[9px] font-black text-text-muted uppercase">Settlement</span>
                                <span className="text-[10px] font-mono font-bold text-text-green">${mission.pay.toFixed(2)} {PAY_TYPE_LABELS[mission.payType as keyof typeof PAY_TYPE_LABELS]}</span>
                             </div>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <SectionLabel>Personnel Allocation</SectionLabel>
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
                    </div>
                </div>
            </TabsContent>

            {/* ══ LEDGER ═════════════════════════════════════════════════ */}
            <TabsContent value="LEDGER" className="m-0 space-y-6 animate-in fade-in duration-300">
                <SectionLabel>Operational Timeline</SectionLabel>
                <div className="space-y-0 text-left">
                    <TimelineEntry 
                        dot="blue"
                        time="APR 9 · 2:30 PM"
                        title="Assignment dispatched"
                        note="Work order created and pushed to Field Terminal."
                        by="ADMIN — COMMAND CENTER"
                    />
                    <TimelineEntry 
                        dot="gold"
                        time="APR 10 · 9:52 AM"
                        title="Acknowledgment received"
                        note="Technician confirmed receipt of assignment via Field Terminal."
                        by="FIELD TECH — FIELD TERMINAL"
                    />
                    <TimelineEntry 
                        dot="gold"
                        time="APR 10 · 10:03 AM"
                        title="En route — status update"
                        note="Technician set status to On My Way. GPS ping recorded."
                        by="FIELD TECH — FIELD TERMINAL"
                    />
                    <TimelineEntry 
                        dot="green"
                        time="APR 10 · 10:18 AM"
                        title="Check-in — on site"
                        note="Technician checked in at job location. GPS coordinates verified."
                        by="FIELD TECH — FIELD TERMINAL"
                    />
                    <TimelineEntry 
                        dot="green"
                        time="APR 10 · 12:21 PM"
                        title="Check-out — work complete"
                        note="2h 03m on-site. Outcome: Worked — Completed. No revisit required."
                        by="FIELD TECH — FIELD TERMINAL"
                    />
                    <TimelineEntry 
                        dot="blue"
                        time="APR 10 · 12:25 PM"
                        title="Registry locked — assignment closed"
                        note={`Assignment finalized. Payout of $${mission.pay.toFixed(2)} queued for payroll processing.`}
                        by="SYSTEM — AUTO"
                        isLast
                    />
                </div>
            </TabsContent>

            {/* ══ REVIEW ═════════════════════════════════════════════════ */}
            <TabsContent value="REVIEW" className="m-0 space-y-8 animate-in fade-in duration-300">
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
                                    <div className="p-4">
                                         <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">
                                            Linked Weeklog: <span className="text-text-primary">WK-{adminData.weeklyLog.weekOf}</span>
                                         </p>
                                    </div>
                                </Card>
                            ) : (
                                <div className="p-12 border-2 border-dashed border-border-sub rounded-xl text-center opacity-40 bg-bg-secondary/30">
                                    <Clock size={32} className="mx-auto text-text-muted mb-2" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest italic">Awaiting payroll submission</p>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4 text-left">
                            <SectionLabel>Reliability Audit</SectionLabel>
                            {adminData.penalties.length > 0 ? (
                                <div className="space-y-2">
                                    {adminData.penalties.map(p => (
                                        <div key={p.id} className="p-4 rounded-xl border border-border-alert bg-brand-red-dim/5 flex items-center justify-between text-left">
                                            <div className="flex items-center gap-4 text-left">
                                                <div className="p-2 bg-brand-red-dim rounded border border-brand-red/30 text-text-red">
                                                    <AlertTriangle size={14} />
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-xs font-bold text-text-primary uppercase tracking-wide text-left">{p.eventType.replace(/_/g, ' ')}</p>
                                                    <p className="text-[10px] text-text-muted leading-relaxed text-left italic">&quot;{p.reason}&quot;</p>
                                                </div>
                                            </div>
                                            <span className="font-mono text-sm font-bold text-text-red">{p.scoreChange}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-6 bg-green-dim/10 border border-green-border/20 rounded-xl flex items-center gap-3">
                                    <ShieldCheck size={16} className="text-text-green" />
                                    <p className="text-[10px] font-bold text-text-green uppercase tracking-widest">Nominal performance Handshake</p>
                                </div>
                            )}
                        </div>

                        <div className="p-5 rounded-xl bg-bg-tertiary/20 border border-dashed border-border-sub flex items-start gap-4">
                            <Info size={20} className="text-accent-gold shrink-0 mt-0.5" />
                            <div className="space-y-1 text-left">
                                <p className="text-[10px] font-black text-text-primary uppercase tracking-widest">Temporal Log Protocol</p>
                                <p className="text-[10px] text-text-muted leading-relaxed uppercase font-medium">
                                    Audit data is aggregated from the rolling reliability ledger and submitted technician manifests.
                                </p>
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
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Terminal Locked</span>
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
