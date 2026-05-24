
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
  CheckCircle2
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
import { format } from 'date-fns';
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
                { type: 'tech_swap', date: today, details: `Lead swap: -> ${targetTech?.name}.`, user: currentUser?.name || 'Admin' }
            ]
        };
    } else {
        const currentSupport = mission.additionalTechnicianIds || [];
        if (currentSupport.includes(technicianId)) return;
        updates = {
            additionalTechnicianIds: [...currentSupport, technicianId],
            history: [
                ...(mission.history || []),
                { type: 'tech_add', date: today, details: `Added support: ${targetTech?.name}.`, user: currentUser?.name || 'Admin' }
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
      if (!entry) return 'N/A';
      const timeMatch = entry.details.match(/\d{2}:\d{2}/);
      return timeMatch ? timeMatch[0] : 'LOGGED';
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[750px] bg-bg-elevated border-border-default flex flex-col p-0 max-h-[90vh] shadow-2xl">
        <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30 text-left">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-brand-red uppercase tracking-widest font-mono text-left">ID: {mission.id.toUpperCase()}</span>
                <Badge variant={mission.status === 'completed' ? 'active' : mission.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="h-5 uppercase text-[9px] tracking-widest">
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
          <DialogTitle className="text-xl font-bold uppercase tracking-wide text-text-primary leading-tight text-left">{mission.title || mission.description}</DialogTitle>
          <div className="flex items-center gap-4 text-xs font-bold text-text-muted uppercase tracking-widest mt-1 text-left">
             <a 
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-brand-red hover:underline transition-all cursor-pointer group/loc"
             >
                <MapPin size={12} className="text-brand-red shrink-0 group-hover/loc:scale-110 transition-transform" />
                <span>{mission.location}</span>
             </a>
             <span className="flex items-center gap-1.5">
                <Calendar size={12} className="text-text-muted shrink-0" />
                <span>{mission.scheduleDate}</span>
             </span>
          </div>
        </DialogHeader>

        <Tabs defaultValue={userIsTech ? "tactical" : "details"} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 border-b border-border-sub bg-bg-secondary/20">
                <TabsList className="h-10 bg-transparent p-0 gap-8 justify-start">
                    <TabsTrigger value="details" className="tab-trigger-job">Mission Briefing</TabsTrigger>
                    <TabsTrigger value="tactical" className="tab-trigger-job">Tactical Windows</TabsTrigger>
                    {!userIsTech && <TabsTrigger value="history" className="tab-trigger-job flex items-center gap-2">
                        <History size={14}/> Activity Ledger
                    </TabsTrigger>}
                </TabsList>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-6">
                    <TabsContent value="details" className="m-0 space-y-8">
                        <div className="space-y-4 text-left">
                            <div className="flex items-center justify-between">
                              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2 text-left">
                                <StickyNote size={14} className="text-accent-gold shrink-0"/>
                                <span>Scope of Work</span>
                              </h3>
                              {mission.source === 'Imported' && (
                                <a 
                                  href={getFieldNationLink(mission.id)} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-[9px] font-black text-brand-red hover:underline uppercase tracking-tighter"
                                >
                                  <ExternalLink size={10} />
                                  View Field Nation Registry
                                </a>
                              )}
                            </div>
                            <div className="p-4 rounded-lg bg-accent-gold-dim/5 border border-accent-gold/20 italic text-xs text-text-secondary leading-relaxed uppercase text-left">
                                {mission.description}
                            </div>
                        </div>

                        {userIsAdmin && (
                          <div className="space-y-4 text-left">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2 text-left">
                              <Coins size={14} className="text-text-green shrink-0"/>
                              <span>Labor Rate</span>
                            </h3>
                            <div className="p-4 rounded-lg bg-bg-secondary border border-border-sub flex justify-between items-center">
                              <div className="space-y-1 text-left">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest text-left">Pricing Model</p>
                                <p className="text-xs font-bold text-text-primary uppercase text-left">{(mission.payType || 'fixed').replace(/_/g, ' ')} labor rate</p>
                              </div>
                              <div className="text-right">
                                {mission.payType === 'blended' ? (
                                  <>
                                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">payout signature</p>
                                    <p className="text-sm font-mono font-bold text-text-green">
                                      ${(mission.blendedFixedPay || 0).toFixed(2)} + ${(mission.blendedHourlyRate || 0).toFixed(2)}/hr
                                    </p>
                                    <p className="text-[9px] text-text-muted font-bold uppercase">after {mission.blendedIncludedHours} hrs</p>
                                  </>
                                ) : mission.payType === 'hourly' ? (
                                    <>
                                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">payout signature</p>
                                        <p className="text-sm font-mono font-bold text-text-green">${(mission.pay || 0).toFixed(2)}/hr</p>
                                    </>
                                ) : (
                                  <>
                                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">payout signature</p>
                                    <p className="text-sm font-mono font-bold text-text-primary">${(mission.pay || 0).toFixed(2)}</p>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2 text-left"><User size={14} className="text-brand-red shrink-0"/><span>Assigned Techs</span></h3>
                                {userIsAdmin && !isCompleted && !isAssigning && (
                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="sm" className="h-7 text-[9px] uppercase font-bold" onClick={() => { setAssignMode('lead'); setIsAssigning(true); }}><RefreshCw size={12} className="mr-1.5"/> Swap Lead</Button>
                                        <Button variant="ghost" size="sm" className="h-7 text-[9px] uppercase font-bold" onClick={() => { setAssignMode('support'); setIsAssigning(true); }}><Plus size={12} className="mr-1.5"/> Add Support</Button>
                                    </div>
                                )}
                            </div>
                            
                            {isAssigning ? (
                                <div className="p-4 rounded-xl bg-bg-secondary border border-brand-red/30 space-y-4">
                                    <div className="flex items-center justify-between">
                                         <p className="text-[10px] font-black uppercase text-brand-red tracking-widest">Select Operative</p>
                                         <button onClick={() => setIsAssigning(false)} className="text-text-muted hover:text-text-primary"><X size={14}/></button>
                                    </div>
                                    <Input placeholder="Search technicians..." value={techSearchQuery} onChange={e => setTechSearchQuery(e.target.value)} className="h-10 bg-bg-primary text-xs uppercase font-bold" />
                                    
                                    <div className="space-y-4">
                                        {!recommendation && !isAiLoading && (
                                            <Button onClick={handleGetAiRecommendation} variant="secondary" className="w-full h-10 text-[9px] font-bold uppercase tracking-widest">
                                                <Sparkles className="mr-2 h-4 w-4"/> Initialize AI Dispatch Analysis
                                            </Button>
                                        )}
                                        {isAiLoading && (
                                            <div className="p-3 rounded-lg bg-bg-tertiary border border-border-sub flex items-center justify-center gap-3">
                                                 <div className="h-3 w-3 rounded-full border-2 border-accent-gold border-t-transparent animate-spin" />
                                                 <span className="text-[9px] font-bold uppercase tracking-widest text-accent-gold">Calculating optimal operative...</span>
                                            </div>
                                        )}
                                        {recommendation && (
                                            <div className="rounded-lg border border-accent-gold bg-accent-gold-dim/10 p-3 animate-in fade-in slide-in-from-top-1 duration-300">
                                                <p className="text-[9px] text-accent-gold font-black uppercase tracking-widest mb-1 text-left">AI Dispatch Intelligence</p>
                                                <p className="text-[10px] text-text-primary leading-relaxed uppercase font-bold text-left">{recommendation.reasoning}</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="divide-y divide-border-sub max-h-[250px] overflow-y-auto border rounded-md bg-bg-primary">
                                        {filteredTechs.map(t => (
                                            <div key={t.id} className="p-3 flex items-center justify-between hover:bg-bg-tertiary cursor-pointer transition-colors group" onClick={() => handleAssign(t.id)}>
                                                <div className="flex items-center gap-3 text-left">
                                                    <Avatar className="h-8 w-8"><AvatarImage src={t.avatarUrl}/></Avatar>
                                                    <div className="text-left">
                                                        <p className="text-xs font-bold uppercase group-hover:text-brand-red transition-colors text-left">{t.name}</p>
                                                        <p className="text-[9px] text-text-muted uppercase font-bold text-left">{t.role}</p>
                                                    </div>
                                                </div>
                                                <ChevronRight size={14} className="text-text-muted" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="p-4 rounded-xl bg-bg-secondary border border-border-sub flex items-center justify-between">
                                        <div className="flex items-center gap-4 text-left">
                                            <Avatar className="h-12 w-12 border-2 border-border-sub">
                                              <AvatarImage src={leadTech?.avatarUrl} />
                                              <AvatarFallback>{(leadTech?.name || 'U').charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <div className="text-left">
                                                <p className="text-sm font-bold text-text-primary uppercase text-left">{leadTech?.name || 'Unallocated'}</p>
                                                <p className="text-[10px] text-text-muted uppercase text-left">{leadTech?.role || 'Awaiting Action'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {userIsAdmin && !isCompleted && (
                                                <Button 
                                                    variant="secondary" 
                                                    size="sm" 
                                                    className="h-8 bg-accent-gold hover:bg-accent-gold/90 text-white border-none text-[9px] font-bold uppercase tracking-widest"
                                                    onClick={() => { setAssignMode('lead'); setIsAssigning(true); }}
                                                >
                                                    <RefreshCw size={14} className="mr-2"/>
                                                    Swap Tech
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {supportTechs.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-[9px] font-black text-text-muted uppercase tracking-widest ml-1 text-left">Support Registry</p>
                                            {supportTechs.map(tech => (
                                                <div key={tech.id} className="p-3 rounded-lg bg-bg-primary/50 border border-border-sub flex items-center justify-between">
                                                    <div className="flex items-center gap-3 text-left">
                                                        <Avatar className="h-8 w-8">
                                                          <AvatarImage src={tech.avatarUrl} />
                                                          <AvatarFallback>{(tech.name || 'U').charAt(0)}</AvatarFallback>
                                                        </Avatar>
                                                        <div className="text-left">
                                                            <p className="text-xs font-bold text-text-primary uppercase text-left">{tech.name}</p>
                                                            <p className="text-[9px] text-text-muted uppercase tracking-widest text-left">Support operative</p>
                                                        </div>
                                                    </div>
                                                    {userIsAdmin && !isCompleted && (
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-text-muted hover:text-text-red">
                                                            <X size={14}/>
                                                        </Button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="tactical" className="m-0 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <Card className="bg-bg-secondary border-border-main text-left">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-[8px] font-black text-text-muted uppercase tracking-widest">Confirmation Handshake</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-bg-tertiary rounded border border-border-sub text-accent-gold">
                                            <CheckCircle2 size={18} />
                                        </div>
                                        <p className="text-xl font-mono font-bold text-text-primary">{getTacticalTime('confirmed')}</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-bg-secondary border-border-main text-left">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-[8px] font-black text-text-muted uppercase tracking-widest">Trip Initiation</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-bg-tertiary rounded border border-border-sub text-brand-red">
                                            <Navigation size={18} />
                                        </div>
                                        <p className="text-xl font-mono font-bold text-text-primary">{getTacticalTime('Trip initiated')}</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-bg-secondary border-border-main text-left">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-[8px] font-black text-text-muted uppercase tracking-widest">On-Site Arrival</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-bg-tertiary rounded border border-border-sub text-text-green">
                                            <Play size={18} className="fill-current" />
                                        </div>
                                        <p className="text-xl font-mono font-bold text-text-primary">{getTacticalTime('Arrival verified')}</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-bg-secondary border-border-main text-left">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-[8px] font-black text-text-muted uppercase tracking-widest">Mission Finalization</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-bg-tertiary rounded border border-border-sub text-text-muted">
                                            <LogOut size={18} />
                                        </div>
                                        <p className="text-xl font-mono font-bold text-text-primary">{getTacticalTime('finalized')}</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="history" className="m-0 space-y-4">
                        <div className="space-y-2">
                            {(mission.history || []).map((entry, idx) => (
                                <div key={idx} className="p-3 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between group hover:border-text-muted transition-all">
                                    <div className="flex items-center gap-4 text-left">
                                        <div className={cn(
                                            "p-1.5 rounded border border-border-sub text-text-muted group-hover:text-brand-red transition-colors",
                                            entry.type === 'tech_swap' ? "bg-accent-gold-dim text-accent-gold border-accent-gold/20" : "bg-bg-tertiary"
                                        )}>
                                            {entry.type === 'tech_swap' ? <RefreshCw size={14}/> : <Activity size={14}/>}
                                        </div>
                                        <div className="text-left">
                                            <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide leading-tight">{entry.details}</p>
                                            <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest mt-0.5">
                                                {entry.date} · Authorized by {entry.user}
                                            </p>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="text-[8px] h-4 uppercase bg-bg-primary">{entry.type.replace('_', ' ')}</Badge>
                                </div>
                            ))}
                            {(mission.history || []).length === 0 && (
                                <div className="py-12 text-center border-2 border-dashed border-border-sub rounded-xl opacity-40">
                                    <p className="text-[10px] font-bold uppercase tracking-widest italic">Changelog Clear</p>
                                </div>
                            )}
                        </div>
                    </TabsContent>
                </div>
            </ScrollArea>

            <DialogFooter className="p-6 border-t border-border-default bg-bg-tertiary/30">
                <Button variant="outline" onClick={() => setIsOpen(false)} className="h-11 uppercase font-bold text-[10px] tracking-widest">Close Terminal</Button>
            </DialogFooter>
        </Tabs>
      </DialogContent>
      <style jsx global>{`
        .tab-trigger-job {
            @apply px-0 pb-2 pt-0 h-auto bg-transparent rounded-none border-b-2 border-transparent text-[10px] font-black uppercase tracking-[0.15em] text-text-muted data-[state=active]:bg-transparent data-[state=active]:text-text-primary data-[state=active]:border-brand-red data-[state=active]:shadow-none transition-all;
        }
      `}</style>
    </Dialog>
  );
}
