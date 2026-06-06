'use client';

import { useState, useEffect, useMemo } from 'react';
import type { WorkOrder, Technician, Recommendation } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { TERMINOLOGY } from '@/lib/constants';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  MapPin, 
  User, 
  Users,
  History, 
  Coins, 
  StickyNote, 
  Calendar,
  AlertTriangle,
  FileCheck,
  ChevronRight,
  UserCheck,
  ShieldCheck,
  ExternalLink,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  UserPlus,
  Sparkles,
  DollarSign,
  FileText,
  Activity,
  Navigation,
  Play,
  LogOut,
  Lock,
  CheckCircle2,
  ListTodo,
  Circle,
  Info
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn, formatCityState } from '@/lib/utils';
import { isAdmin, isTech } from '@/lib/permissions';
import { format, parseISO } from 'date-fns';
import { getRecommendation } from '@/app/admin/dispatch/actions';
import { useToast } from '@/hooks/use-toast';

type JobDetailDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  mission: WorkOrder | null;
  onEdit?: (mission: WorkOrder) => void;
  onUpdate?: (woId: string, updates: Partial<WorkOrder>) => void;
};

const getFieldNationLink = (id: string) => {
  const cleanId = id.replace(/^wo-/, '');
  return `https://app.fieldnation.com/workorders/${cleanId}`;
};

export function JobDetailDialog({ isOpen, setIsOpen, mission, onEdit, onUpdate }: JobDetailDialogProps) {
  const [currentUser, setCurrentUser] = useState<Technician | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignMode, setAssignMode] = useState<'lead' | 'support'>('lead');
  const [techSearchQuery, setTechSearchQuery] = useState("");
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    const unsubTech = onSnapshot(collection(db, 'users'), (snap) => {
        setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
    });
    return () => unsubTech();
  }, []);

  useEffect(() => {
    const userId = localStorage.getItem('currentUserId');
    if (userId) {
      setCurrentUser(technicians.find(t => t.id === userId) || null);
    }
  }, [technicians]);

  useEffect(() => {
    if (!isOpen) {
        setIsAssigning(false);
        setTechSearchQuery("");
        setRecommendation(null);
    }
  }, [isOpen]);

  const filteredTechs = useMemo(() => {
    return technicians
      .filter(t => {
          const roles = t.roles || [];
          const role = (t.role || '').toLowerCase();
          return !roles.includes('client') && !role.includes('client');
      })
      .filter(t => (t.name || '').toLowerCase().includes(techSearchQuery.toLowerCase()))
      .sort((a, b) => (b.reliabilityScore || 0) - (a.reliabilityScore || 0));
  }, [technicians, techSearchQuery]);

  if (!mission) return null;

  const userIsAdmin = isAdmin(currentUser);
  const userIsTech = isTech(currentUser);
  const leadTech = technicians.find(t => t.id === mission.assignedTechnicianId);
  const supportTechs = (mission.additionalTechnicianIds || []).map(id => technicians.find(t => t.id === id)).filter(Boolean) as Technician[];
  const isCompleted = mission.status === 'completed';

  const handleGetAiRecommendation = async () => {
    if (!mission) return;
    setIsAiLoading(true);
    try {
      const result = await getRecommendation({
        workOrder: {
          id: mission.id,
          description: mission.description,
          location: mission.location,
          requiredSkills: mission.requiredSkills || [],
          priority: mission.priority || 'medium',
        },
        availableTechnicians: technicians.map((t) => ({
          id: t.id,
          name: t.name || 'Unknown',
          currentLocation: t.currentLocation || 'Detroit, MI',
          reliabilityScore: t.reliabilityScore || 0,
          currentWorkload: t.currentWorkload || 0,
          skills: t.skills || [],
        })),
      });
      setRecommendation(result);
    } catch (error) {
      toast({ variant: "destructive", title: "Recommendation Failed", description: "Could not get an AI recommendation." });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAssign = (technicianId: string) => {
    if (isCompleted) return;
    const docRef = doc(db, 'assignments', mission.id);
    const targetTech = technicians.find(t => t.id === technicianId);
    const today = format(new Date(), 'MM-dd-yyyy');

    let updates: Partial<WorkOrder> = {};

    if (assignMode === 'lead') {
        updates = {
            assignedTechnicianId: technicianId,
            status: 'assigned',
            history: [
                ...(mission.history || []),
                { type: 'status_change', date: today, details: `Lead swap: -> ${targetTech?.name}.`, user: currentUser?.name || 'Admin' }
            ]
        };
    } else {
        const currentSupport = mission.additionalTechnicianIds || [];
        if (currentSupport.includes(technicianId)) return;
        updates = {
            additionalTechnicianIds: [...currentSupport, technicianId],
            history: [
                ...(mission.history || []),
                { type: 'note', date: today, details: `Added support: ${targetTech?.name}.`, user: currentUser?.name || 'Admin' }
            ]
        };
    }

    updateDoc(docRef, updates).catch((e: any) => {
        console.error("Assign Update Error:", e);
        toast({ variant: "destructive", title: "Registry Error", description: e.message });
    });

    setIsAssigning(false);
    toast({ title: "Registry Updated", description: "Allocation committed to Firestore." });
  };

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mission.location)}`;

  const getTacticalTime = (type: string) => {
      const entry = (mission.history || []).find(h => h.details.toLowerCase().includes(type.toLowerCase()));
      if (!entry) return null;
      const timeMatch = entry.details.match(/\d{1,2}:\d{2}\s?(?:AM|PM)?/i);
      return timeMatch ? timeMatch[0].trim() : 'LOGGED';
  };

  const tacticalEvents = [
    { label: 'Assignment Confirmed', type: 'confirmed', icon: CheckCircle2, color: 'text-accent-gold' },
    { label: 'Trip Initiated', type: 'Trip initiated', icon: Navigation, color: 'text-brand-red' },
    { label: 'Site Check-In', type: 'Arrival verified', icon: Play, color: 'text-text-green' },
    { label: 'Final Check-Out', type: 'finalized', icon: LogOut, color: 'text-text-muted' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[750px] bg-bg-elevated border-border-default flex flex-col p-0 max-h-[95vh] shadow-2xl">
        <DialogHeader className="p-6 pb-4 border-b border-border-sub bg-bg-tertiary/30 text-left shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-left">
                <span className="text-[10px] font-black text-brand-red uppercase tracking-[0.2em] font-mono text-left">WO: {mission.id.toUpperCase()}</span>
                <Badge variant={mission.status === 'completed' ? 'active' : mission.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="h-5 uppercase text-[9px] font-black tracking-widest px-2">
                    {mission.status}
                </Badge>
            </div>
            {isCompleted && (
                <div className="flex items-center gap-1.5 text-text-muted">
                    <Lock size={12}/>
                    <span className="text-[9px] font-black uppercase tracking-widest">Registry Locked</span>
                </div>
            )}
          </div>
          <DialogTitle className="text-2xl font-bold uppercase tracking-wide text-text-primary leading-tight text-left mb-1">{mission.title || mission.description}</DialogTitle>
          <div className="flex flex-wrap items-center gap-y-2 gap-x-6 text-[11px] font-bold text-text-muted uppercase tracking-widest text-left">
             <a 
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:text-brand-red hover:underline transition-all cursor-pointer group/loc"
             >
                <div className="p-1.5 bg-bg-secondary rounded border border-border-sub group-hover/loc:border-brand-red transition-colors">
                  <MapPin size={12} className="text-brand-red shrink-0" />
                </div>
                <span>{mission.location}</span>
             </a>
             <div className="flex items-center gap-2">
                <div className="p-1.5 bg-bg-secondary rounded border border-border-sub">
                  <Calendar size={12} className="text-text-muted shrink-0" />
                </div>
                <span>{mission.scheduleDate}</span>
             </div>
             <div className="flex items-center gap-2">
                <div className="p-1.5 bg-bg-secondary rounded border border-border-sub">
                  <Clock size={12} className="text-text-muted shrink-0" />
                </div>
                <span>{mission.scheduleTime}</span>
             </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue={userIsTech ? "tactical" : "details"} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 border-b border-border-sub bg-bg-secondary/20">
                <TabsList className="h-12 bg-transparent p-0 gap-10 justify-start">
                    <TabsTrigger value="details" className="tab-trigger-job">SOW & Requirements</TabsTrigger>
                    <TabsTrigger value="tactical" className="tab-trigger-job">Activity Ledger</TabsTrigger>
                    {!userIsTech && <TabsTrigger value="history" className="tab-trigger-job flex items-center gap-2">
                        <History size={14}/> Event Log
                    </TabsTrigger>}
                </TabsList>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-6">
                    <TabsContent value="details" className="m-0 space-y-10">
                        <div className="space-y-4 text-left">
                            <div className="flex items-center justify-between border-b border-border-sub/50 pb-2">
                              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2 text-left">
                                <StickyNote size={14} className="text-accent-gold shrink-0"/>
                                <span>Project Scope Briefing</span>
                              </h3>
                              {mission.source === 'Imported' && (
                                <a 
                                  href={getFieldNationLink(mission.id)} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-[9px] font-black text-brand-red hover:underline uppercase tracking-tighter"
                                >
                                  <ExternalLink size={10} />
                                  Field Nation Registry
                                </a>
                              )}
                            </div>
                            <div className="p-5 rounded-xl bg-bg-tertiary/20 border border-border-sub italic text-[13px] text-text-secondary leading-relaxed uppercase font-medium text-left">
                                {mission.description}
                            </div>
                        </div>

                        {userIsAdmin && (
                          <div className="space-y-4 text-left">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2 text-left border-b border-border-sub/50 pb-2">
                              <Coins size={14} className="text-text-green shrink-0"/>
                              <span>Financial Settlement Model</span>
                            </h3>
                            <div className="p-5 rounded-xl bg-bg-secondary border border-border-sub flex justify-between items-center shadow-inner">
                              <div className="space-y-1 text-left">
                                <p className="text-[10px] font-black text-text-muted uppercase tracking-widest text-left">Authorized Structure</p>
                                <p className="text-sm font-bold text-text-primary uppercase text-left">{(mission.payType || 'fixed').replace(/_/g, ' ')} labor rate</p>
                              </div>
                              <div className="text-right">
                                {mission.payType === 'blended' ? (
                                  <>
                                    <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Calculated Payout</p>
                                    <p className="text-2xl font-mono font-bold text-text-green">
                                      ${(mission.blendedFixedPay || 0).toFixed(2)} + ${(mission.blendedHourlyRate || 0).toFixed(2)}/hr
                                    </p>
                                    <p className="text-[9px] text-text-muted font-bold uppercase tracking-widest">after {mission.blendedIncludedHours} hours base</p>
                                  </>
                                ) : mission.payType === 'hourly' ? (
                                    <>
                                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Calculated Payout</p>
                                        <p className="text-2xl font-mono font-bold text-text-green">${(mission.pay || 0).toFixed(2)} / HR</p>
                                    </>
                                ) : (
                                  <>
                                    <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Calculated Payout</p>
                                    <p className="text-2xl font-mono font-bold text-text-primary">${(mission.pay || 0).toFixed(2)} FLAT</p>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-border-sub/50 pb-2">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2 text-left"><Users size={14} className="text-brand-red shrink-0"/><span>Personnel Allocation</span></h3>
                                {userIsAdmin && !isCompleted && !isAssigning && (
                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="sm" className="h-7 text-[9px] uppercase font-bold border border-border-sub bg-bg-secondary hover:bg-bg-tertiary" onClick={() => { setAssignMode('lead'); setIsAssigning(true); }}><RefreshCw size={12} className="mr-1.5"/> Swap Lead</Button>
                                        <Button variant="ghost" size="sm" className="h-7 text-[9px] uppercase font-bold border border-border-sub bg-bg-secondary hover:bg-bg-tertiary" onClick={() => { setAssignMode('support'); setIsAssigning(true); }}><Plus size={12} className="mr-1.5"/> Add Support</Button>
                                    </div>
                                )}
                            </div>
                            
                            {isAssigning ? (
                                <div className="p-5 rounded-xl bg-bg-secondary border border-brand-red/30 space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex items-center justify-between">
                                         <p className="text-[10px] font-black uppercase text-brand-red tracking-widest">Operative Registry Search</p>
                                         <button onClick={() => setIsAssigning(false)} className="text-text-muted hover:text-text-primary transition-colors"><X size={14}/></button>
                                    </div>
                                    <div className="relative">
                                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                                      <Input placeholder="Enter name or ID..." value={techSearchQuery} onChange={e => setTechSearchQuery(e.target.value)} className="h-11 pl-10 bg-bg-primary text-xs uppercase font-bold tracking-wider" />
                                    </div>
                                    
                                    <div className="space-y-4">
                                        {!recommendation && !isAiLoading && (
                                            <Button onClick={handleGetAiRecommendation} variant="secondary" className="w-full h-11 text-[10px] font-black uppercase tracking-[0.2em]">
                                                <Sparkles className="mr-2 h-4 w-4 text-accent-gold animate-pulse"/> Initialize Dispatch Analysis
                                            </Button>
                                        )}
                                        {isAiLoading && (
                                            <div className="p-4 rounded-xl bg-bg-tertiary border border-border-sub flex items-center justify-center gap-3 shadow-inner">
                                                 <Loader2 size={16} className="animate-spin text-accent-gold" />
                                                 <span className="text-[10px] font-black uppercase tracking-widest text-accent-gold">Calculating optimal deployment...</span>
                                            </div>
                                        )}
                                        {recommendation && (
                                            <div className="rounded-xl border border-accent-gold bg-accent-gold-dim/10 p-5 animate-in fade-in slide-in-from-top-1 duration-300 shadow-sm">
                                                <p className="text-[10px] text-accent-gold font-black uppercase tracking-widest mb-2 flex items-center gap-2 text-left">
                                                  <UserCheck size={12}/> Analysis Result
                                                </p>
                                                <p className="text-xs text-text-primary leading-relaxed uppercase font-bold text-left">{recommendation.reasoning}</p>
                                            </div>
                                        )}
                                    </div>

                                    <ScrollArea className="h-[250px] border border-border-sub rounded-lg bg-bg-primary shadow-inner">
                                        <div className="divide-y divide-border-sub">
                                          {filteredTechs.map(t => (
                                              <div key={t.id} className="p-4 flex items-center justify-between hover:bg-bg-tertiary cursor-pointer transition-colors group" onClick={() => handleAssign(t.id)}>
                                                  <div className="flex items-center gap-4 text-left">
                                                      <Avatar className="h-10 w-10 border border-border-sub group-hover:border-brand-red transition-all shadow-sm">
                                                        <AvatarImage src={t.avatarUrl}/>
                                                        <AvatarFallback className="text-[10px] font-bold">{(t.name || 'U').charAt(0)}</AvatarFallback>
                                                      </Avatar>
                                                      <div className="text-left">
                                                          <p className="text-sm font-bold uppercase group-hover:text-brand-red transition-colors text-left">{t.name}</p>
                                                          <p className="text-[10px] text-text-muted font-bold tracking-widest text-left">{t.role}</p>
                                                      </div>
                                                  </div>
                                                  <ChevronRight size={16} className="text-text-muted group-hover:text-text-primary transition-all" />
                                              </div>
                                          ))}
                                          {filteredTechs.length === 0 && (
                                            <div className="p-12 text-center text-[10px] font-bold text-text-muted uppercase tracking-widest italic">No operatives match current query</div>
                                          )}
                                        </div>
                                    </ScrollArea>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="p-5 rounded-xl bg-bg-secondary border border-border-sub flex items-center justify-between shadow-sm">
                                        <div className="flex items-center gap-5 text-left">
                                            <Avatar className="h-14 w-14 border-2 border-border-sub shadow-md">
                                              <AvatarImage src={leadTech?.avatarUrl} />
                                              <AvatarFallback className="text-lg font-black">{(leadTech?.name || 'U').charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <div className="text-left space-y-0.5">
                                                <div className="flex items-center gap-2">
                                                  <p className="text-base font-bold text-text-primary uppercase tracking-tight text-left">{leadTech?.name || 'UNALLOCATED'}</p>
                                                  <Badge variant="active" className="h-4 text-[7px] font-black uppercase px-1.5">LEAD</Badge>
                                                </div>
                                                <p className="text-[11px] text-text-muted font-black uppercase tracking-widest text-left">{leadTech?.role || 'Awaiting Authorization'}</p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {supportTechs.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] ml-1 text-left">Secondary Support Team</p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                              {supportTechs.map(tech => (
                                                  <div key={tech.id} className="p-3 rounded-xl bg-bg-primary border border-border-sub flex items-center justify-between group hover:border-text-muted transition-all">
                                                      <div className="flex items-center gap-3 text-left overflow-hidden">
                                                          <Avatar className="h-9 w-9 border border-border-sub">
                                                            <AvatarImage src={tech.avatarUrl} />
                                                            <AvatarFallback className="text-xs font-bold">{(tech.name || 'U').charAt(0)}</AvatarFallback>
                                                          </Avatar>
                                                          <div className="text-left min-w-0">
                                                              <p className="text-xs font-bold text-text-primary uppercase truncate text-left">{tech.name}</p>
                                                              <p className="text-[9px] text-text-muted uppercase font-black tracking-widest text-left">Field support</p>
                                                          </div>
                                                      </div>
                                                      {userIsAdmin && !isCompleted && (
                                                          <Button variant="ghost" size="icon" className="h-8 w-8 text-text-muted hover:text-text-red transition-colors opacity-0 group-hover:opacity-100">
                                                              <X size={16}/>
                                                          </Button>
                                                      )}
                                                  </div>
                                              ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="tactical" className="m-0">
                        <div className="space-y-6">
                            <div className="flex items-center justify-between px-1 border-b border-border-sub/50 pb-2">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                                  <ListTodo size={14} className="text-brand-red" />
                                  Operational Timeline
                                </h3>
                                <Badge variant="outline" className="text-[8px] bg-bg-tertiary border-border-sub tracking-tighter">UTC COORDINATED</Badge>
                            </div>
                            
                            <div className="relative pl-8 space-y-8 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-border-sub">
                                {tacticalEvents.map((evt, idx) => {
                                    const time = getTacticalTime(evt.type);
                                    const isActive = !!time;
                                    const Icon = evt.icon;
                                    
                                    return (
                                        <div key={idx} className={cn("relative group transition-opacity", !isActive && "opacity-40")}>
                                            <div className={cn(
                                                "absolute -left-8 p-1.5 rounded-full border bg-bg-elevated z-10 transition-all",
                                                isActive ? "border-brand-red text-brand-red shadow-[0_0_10px_rgba(204,34,0,0.1)]" : "border-border-sub text-text-muted"
                                            )}>
                                                <Icon size={14} />
                                            </div>
                                            <div className="flex items-center justify-between bg-bg-secondary p-4 rounded-xl border border-border-sub hover:border-text-muted transition-colors shadow-sm">
                                                <div className="text-left">
                                                    <p className={cn("text-[11px] font-black uppercase tracking-widest mb-0.5", isActive ? "text-text-primary" : "text-text-muted")}>
                                                        {evt.label}
                                                    </p>
                                                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest leading-relaxed">
                                                        {isActive ? "Handshake Verified" : "Awaiting Operational Handshake"}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    {isActive ? (
                                                        <p className="text-sm font-mono font-bold text-text-green uppercase tracking-tight">{time}</p>
                                                    ) : (
                                                        <span className="text-[10px] text-text-muted font-bold uppercase italic opacity-50">Pending</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            <div className="p-5 rounded-xl bg-bg-tertiary/20 border border-dashed border-border-sub flex items-start gap-4">
                                <Info size={20} className="text-accent-gold shrink-0 mt-0.5" />
                                <div className="space-y-1 text-left">
                                    <p className="text-[10px] font-black text-text-primary uppercase tracking-widest">Temporal Log Protocol</p>
                                    <p className="text-[10px] text-text-muted leading-relaxed uppercase font-medium">
                                        Registry timestamps are locked at the moment of terminal handshake. 
                                        Manual temporal overrides are restricted to administrative personnel via the Main Ledger.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="history" className="m-0 space-y-4">
                        <div className="flex items-center justify-between px-1 border-b border-border-sub/50 pb-2">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2 text-left">
                              <History size={14} className="text-brand-red" />
                              Assignment Event Ledger
                            </h3>
                        </div>
                        <div className="space-y-2">
                            {(mission.history || []).map((entry, idx) => (
                                <div key={idx} className="p-4 rounded-xl bg-bg-secondary border border-border-sub flex items-center justify-between group hover:border-text-muted transition-all text-left">
                                    <div className="flex items-center gap-5 text-left flex-1 min-w-0">
                                        <div className={cn(
                                            "p-2 rounded-lg border border-border-sub text-text-muted group-hover:text-brand-red transition-colors",
                                            entry.type === 'tech_swap' ? "bg-accent-gold-dim text-accent-gold border-accent-gold/20" : "bg-bg-tertiary"
                                        )}>
                                            {entry.type === 'tech_swap' ? <RefreshCw size={16}/> : <Activity size={16}/>}
                                        </div>
                                        <div className="text-left min-w-0">
                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide leading-relaxed truncate text-left">{entry.details}</p>
                                            <p className="text-[9px] text-text-muted font-black uppercase tracking-[0.2em] mt-1 text-left">
                                                {entry.date} · Authorized by {entry.user}
                                            </p>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="text-[8px] h-4 uppercase bg-bg-primary border-border-sub font-black tracking-widest shrink-0 ml-4">
                                        {entry.type.replace('_', ' ')}
                                    </Badge>
                                </div>
                            ))}
                            {(mission.history || []).length === 0 && (
                                <div className="py-24 text-center border-2 border-dashed border-border-sub rounded-2xl opacity-40 bg-bg-secondary/30">
                                    <History size={48} className="mx-auto text-text-muted mb-4" />
                                    <p className="text-[11px] font-bold uppercase tracking-widest italic text-center">Event registry clear for this assignment</p>
                                </div>
                            )}
                        </div>
                    </TabsContent>
                </div>
            </ScrollArea>

            <DialogFooter className="p-6 border-t border-border-default bg-bg-tertiary/30 shrink-0">
                <Button variant="outline" onClick={() => setIsOpen(false)} className="h-11 w-full uppercase font-black text-[11px] tracking-[0.2em] border-border-sub hover:bg-bg-primary transition-all">
                    Exit Operational Terminal
                </Button>
            </DialogFooter>
        </Tabs>
      </DialogContent>
      <style jsx global>{`
        .tab-trigger-job {
            @apply px-0 pb-3 pt-0 h-auto bg-transparent rounded-none border-b-2 border-transparent text-[11px] font-black uppercase tracking-[0.15em] text-text-muted data-[state=active]:bg-transparent data-[state=active]:text-text-primary data-[state=active]:border-brand-red data-[state=active]:shadow-none transition-all;
        }
      `}</style>
    </Dialog>
  );
}
