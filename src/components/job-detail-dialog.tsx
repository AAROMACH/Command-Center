'use client';

import { useState, useEffect, useMemo } from 'react';
import type { WorkOrder, Technician, Recommendation } from '@/lib/types';
import { technicians } from '@/lib/data';
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
  UserPlus
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { isAdmin, isPayAdmin } from '@/lib/permissions';
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

/**
 * @fileOverview Master terminal for viewing Tactical Assignment (Mission) intelligence.
 * Consolidates technical job data with Command Center operational context.
 * Features lead operative swapping and support technician allocation for administrators.
 */
export function JobDetailDialog({ isOpen, setIsOpen, mission, onEdit, onUpdate }: JobDetailDialogProps) {
  const [currentUser, setCurrentUser] = useState<Technician | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignMode, setAssignMode] = useState<'lead' | 'support'>('lead');
  const [techSearchQuery, setTechSearchQuery] = useState("");
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    const userId = localStorage.getItem('currentUserId');
    if (userId) {
      setCurrentUser(technicians.find(t => t.id === userId) || null);
    }
  }, []);

  // Reset local state when dialog closes/opens
  useEffect(() => {
    if (!isOpen) {
        setIsAssigning(false);
        setTechSearchQuery("");
        setRecommendation(null);
    }
  }, [isOpen]);

  if (!mission) return null;

  const userIsAdmin = isAdmin(currentUser);
  const leadTech = technicians.find(t => t.id === mission.assignedTechnicianId);
  const supportTechs = (mission.additionalTechnicianIds || []).map(id => technicians.find(t => t.id === id)).filter(Boolean) as Technician[];
  const isCompleted = mission.status === 'completed';

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const handleModifyClick = () => {
    if (onEdit && mission) {
      onEdit(mission);
    }
  };

  const handleGetAiRecommendation = async () => {
    if (!mission) return;
    setIsAiLoading(true);
    try {
      const result = await getRecommendation({
        workOrder: {
          id: mission.id,
          description: mission.description,
          location: mission.location,
          requiredSkills: mission.requiredSkills,
          priority: mission.priority,
        },
        availableTechnicians: technicians.map((t) => ({
          id: t.id,
          name: t.name,
          currentLocation: t.currentLocation,
          reliabilityScore: t.reliabilityScore,
          currentWorkload: t.currentWorkload,
          skills: t.skills,
        })),
      });
      setRecommendation(result);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Recommendation Failed",
        description: "Could not get an AI recommendation.",
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAssign = (technicianId: string) => {
    if (!mission || !onUpdate) return;
    
    const targetTech = technicians.find(t => t.id === technicianId);
    const today = format(new Date(), 'MM-dd-yyyy');
    const now = format(new Date(), 'HH:mm');

    let updates: Partial<WorkOrder> = {};

    if (assignMode === 'lead') {
        const oldTechName = leadTech?.name || 'Unassigned';
        updates = {
            assignedTechnicianId: technicianId,
            status: 'assigned',
            history: [
                ...(mission.history || []),
                { 
                    type: 'tech_swap', 
                    date: today, 
                    details: `Lead swap executed: ${oldTechName} -> ${targetTech?.name}. Action taken at ${now}.`, 
                    user: currentUser?.name || 'Command Admin' 
                }
            ]
        };
    } else {
        const currentSupport = mission.additionalTechnicianIds || [];
        if (currentSupport.includes(technicianId)) {
            toast({ title: "Registry Duplicate", description: `${targetTech?.name} is already allocated to this mission.` });
            return;
        }
        updates = {
            additionalTechnicianIds: [...currentSupport, technicianId],
            history: [
                ...(mission.history || []),
                { 
                    type: 'tech_add', 
                    date: today, 
                    details: `Added support operative: ${targetTech?.name}.`, 
                    user: currentUser?.name || 'Command Admin' 
                }
            ]
        };
    }

    onUpdate(mission.id, updates);
    setIsAssigning(false);
    toast({ title: "Registry Updated", description: "Allocation committed to mission manifest." });
  };

  const handleRemoveSupport = (techId: string) => {
    if (!mission || !onUpdate) return;
    const targetTech = technicians.find(t => t.id === techId);
    const currentSupport = mission.additionalTechnicianIds || [];
    const updates: Partial<WorkOrder> = {
        additionalTechnicianIds: currentSupport.filter(id => id !== techId),
        history: [
            ...(mission.history || []),
            { 
                type: 'tech_remove', 
                date: format(new Date(), 'MM-dd-yyyy'), 
                details: `Removed support operative: ${targetTech?.name}.`, 
                user: currentUser?.name || 'Command Admin' 
            }
        ]
    };
    onUpdate(mission.id, updates);
    toast({ variant: "destructive", title: "Allocation Rescinded", description: `${targetTech?.name} removed from mission support.` });
  };

  const filteredTechs = useMemo(() => {
    return technicians
      .filter(t => !t.roles?.includes('client') && !t.role.toLowerCase().includes('client'))
      .filter(t => t.name.toLowerCase().includes(techSearchQuery.toLowerCase()))
      .sort((a, b) => b.reliabilityScore - a.reliabilityScore);
  }, [techSearchQuery]);

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return 'TBD';
    try {
      const parts = dateStr.split(/[-/]/);
      let d;
      if (parts[0].length === 4) { d = new Date(dateStr); } 
      else { d = parseISO(dateStr); }
      return format(d, 'MM-dd-yyyy');
    } catch (e) {
      return dateStr;
    }
  };

  const getFieldNationLink = (id: string) => {
    const cleanId = id.replace(/^wo-/, '');
    return `https://app.fieldnation.com/workorders/${cleanId}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[700px] bg-bg-elevated border-border-default flex flex-col p-0 max-h-[90vh] shadow-2xl">
        <DialogHeader className="p-6 pb-2 text-left">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-brand-red uppercase tracking-widest font-mono">ID: {mission.id.toUpperCase()}</span>
                {mission.source === 'Imported' && (
                  <a 
                    href={getFieldNationLink(mission.id)} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-text-muted hover:text-brand-red transition-colors"
                    title="View Source Registry"
                  >
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>
              <Badge variant={mission.status === 'completed' ? 'active' : mission.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="h-5 uppercase text-[9px] tracking-widest">
                {mission.status}
              </Badge>
            </div>
            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">{mission.projectType}</p>
          </div>
          <DialogTitle className="text-xl font-bold uppercase tracking-wide text-text-primary leading-tight">
            {mission.description}
          </DialogTitle>
          <div className="flex items-center gap-4 text-xs font-bold text-text-muted uppercase tracking-widest mt-1">
             <span className="flex items-center gap-1.5">
               <MapPin size={12} className="text-brand-red shrink-0" />
               <span>{mission.location}</span>
             </span>
             <span className="flex items-center gap-1.5">
               <Calendar size={12} className="text-text-muted shrink-0" />
               <span>{formatDateDisplay(mission.scheduleDate)}</span>
             </span>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-8 mt-2">
          {/* SECTION: SCOPE OF WORK */}
          <div className="space-y-4 text-left">
             <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                <StickyNote size={14} className="text-accent-gold shrink-0"/> 
                <span>Scope of Work</span>
             </h3>
             <div className="space-y-2">
                {mission.notes && mission.notes.length > 0 ? mission.notes.map((note, i) => (
                    <div key={i} className="p-4 rounded-lg bg-accent-gold-dim/5 border border-accent-gold/20 italic text-xs text-text-secondary leading-relaxed uppercase">
                        &quot;{note}&quot;
                    </div>
                )) : (
                    <div className="p-4 rounded-lg bg-bg-primary border border-border-sub">
                        <p className="text-xs text-text-muted italic uppercase font-bold tracking-widest text-center">No intelligence notes recorded.</p>
                    </div>
                )}
             </div>
          </div>

          {/* SECTION: OPERATIVE ALLOCATION */}
          <div className="space-y-4">
             <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                    <User size={14} className="text-brand-red shrink-0"/> 
                    <span>Allocation Registry</span>
                </h3>
                {userIsAdmin && !isCompleted && !isAssigning && (
                    <div className="flex gap-2">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-[9px] uppercase font-bold text-brand-red hover:bg-brand-red-dim border border-brand-red/20 px-3"
                            onClick={() => { setAssignMode('lead'); setIsAssigning(true); }}
                        >
                            <RefreshCw size={12} className="mr-1.5"/> Swap Lead
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-[9px] uppercase font-bold text-accent-gold hover:bg-accent-gold-dim border border-accent-gold/20 px-3"
                            onClick={() => { setAssignMode('support'); setIsAssigning(true); }}
                        >
                            <Plus size={12} className="mr-1.5"/> Add Support
                        </Button>
                    </div>
                )}
             </div>
             
             {isAssigning ? (
                 <div className="p-4 rounded-xl bg-bg-secondary border border-brand-red/30 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <header className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                            <Badge variant={assignMode === 'lead' ? 'destructive' : 'onhold'} className="text-[8px] uppercase tracking-widest px-2 h-4">
                                {assignMode === 'lead' ? 'Selecting Lead' : 'Adding Support'}
                            </Badge>
                            <span className="text-[10px] font-bold text-text-primary uppercase">Operative Registry Search</span>
                        </div>
                        <button onClick={() => setIsAssigning(false)} className="text-text-muted hover:text-text-primary"><X size={16}/></button>
                    </header>

                    <div className="space-y-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                            <Input 
                                placeholder="Search technicians..." 
                                value={techSearchQuery}
                                onChange={e => setTechSearchQuery(e.target.value)}
                                className="h-10 bg-bg-primary pl-9 text-xs uppercase font-bold"
                            />
                        </div>

                        {!recommendation && !isAiLoading && (
                            <Button onClick={handleGetAiRecommendation} variant="secondary" className="w-full h-10 text-[9px] uppercase font-bold">
                                <Sparkles size={14} className="mr-2"/> Initialize AI Dispatch Analysis
                            </Button>
                        )}

                        {isAiLoading && (
                            <div className="p-3 rounded-lg bg-bg-primary border border-border-sub flex items-center justify-center gap-2 text-accent-gold animate-pulse">
                                <RefreshCw size={14} className="animate-spin" />
                                <span className="text-[9px] font-bold uppercase">Analyzing operative performance...</span>
                            </div>
                        )}

                        {recommendation && (
                            <div className="p-3 rounded-lg border border-accent-gold bg-accent-gold-dim/10 text-left">
                                <p className="text-[9px] font-black text-accent-gold uppercase tracking-widest mb-1">AI Recommendation Intelligence</p>
                                <p className="text-[10px] text-text-primary leading-relaxed font-bold uppercase">{recommendation.reasoning}</p>
                            </div>
                        )}

                        <ScrollArea className="h-[200px] border border-border-sub rounded-lg bg-bg-primary">
                            <div className="divide-y divide-border-sub">
                                {filteredTechs.map(t => (
                                    <div key={t.id} className="p-3 flex items-center justify-between group hover:bg-bg-tertiary transition-colors">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8 border border-border-sub"><AvatarImage src={t.avatarUrl}/></Avatar>
                                            <div className="text-left">
                                                <p className="text-xs font-bold text-text-primary uppercase">{t.name}</p>
                                                <p className="text-[9px] text-text-muted font-bold uppercase tracking-widest">{t.reliabilityScore}% RELIABILITY</p>
                                            </div>
                                        </div>
                                        <Button size="sm" className="h-7 text-[9px] px-4 font-bold" onClick={() => handleAssign(t.id)}>Select</Button>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                 </div>
             ) : (
                 <div className="space-y-3">
                    {/* LEAD OPERATIVE CARD */}
                    <div className="p-4 rounded-xl bg-bg-secondary border border-border-sub flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <Avatar className="h-12 w-12 border-2 border-border-sub">
                                    <AvatarImage src={leadTech?.avatarUrl} />
                                    <AvatarFallback>{leadTech?.name.charAt(0) || 'U'}</AvatarFallback>
                                </Avatar>
                                <div className="absolute -top-1 -right-1 p-1 bg-brand-red rounded-full text-white border-2 border-bg-secondary" title="Mission Lead">
                                    <ShieldCheck size={10} />
                                </div>
                            </div>
                            <div className="text-left">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-bold text-text-primary uppercase tracking-wide">{leadTech?.name || 'Unallocated'}</p>
                                    <Badge variant="outline" className="text-[7px] h-3.5 px-1 bg-bg-tertiary uppercase font-black tracking-tighter">LEAD</Badge>
                                </div>
                                <p className="text-[10px] text-text-muted uppercase tracking-widest">{leadTech?.role || 'Awaiting assignment'}</p>
                            </div>
                        </div>
                        {leadTech && mission.isAcknowledged && (
                            <Badge variant="outline" className="bg-green-dim border-green-border text-text-green text-[8px] uppercase tracking-widest gap-1.5 px-3">
                                <UserCheck size={10}/> Confirmed
                            </Badge>
                        )}
                    </div>

                    {/* SUPPORT OPERATIVES LIST */}
                    {supportTechs.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-[9px] font-black text-text-muted uppercase tracking-widest ml-1">Mission Support Team</p>
                            {supportTechs.map(st => (
                                <div key={st.id} className="p-3 rounded-lg bg-bg-primary border border-border-sub flex items-center justify-between group">
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-8 w-8 border border-border-sub">
                                            <AvatarImage src={st.avatarUrl} />
                                            <AvatarFallback>{st.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div className="text-left">
                                            <p className="text-xs font-bold text-text-primary uppercase">{st.name}</p>
                                            <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest">{st.role}</p>
                                        </div>
                                    </div>
                                    {userIsAdmin && !isCompleted && (
                                        <button 
                                            onClick={() => handleRemoveSupport(st.id)}
                                            className="text-text-muted hover:text-text-red opacity-0 group-hover:opacity-100 transition-opacity p-2"
                                            title="Remove from support"
                                        >
                                            <Trash2 size={14}/>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                 </div>
             )}
          </div>

          {/* SECTION: FINANCIAL AUDIT */}
          <div className="space-y-4 text-left">
             <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                <Coins size={14} className="text-text-green shrink-0"/> 
                <span>{TERMINOLOGY.ACTIONS.SETTLE} Audit</span>
             </h3>
             <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-bg-secondary border border-border-sub space-y-1">
                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Base Assignment Pay</p>
                    <p className="text-xl font-mono font-bold text-text-primary">{formatCurrency(mission.pay)}</p>
                    <p className="text-[9px] text-text-muted uppercase tracking-tighter">{mission.payType} Logic</p>
                </div>
                <div className="p-4 rounded-lg bg-bg-secondary border border-border-sub space-y-1">
                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Final Audit Settlement</p>
                    <p className={cn("text-xl font-mono font-bold", isCompleted ? "text-text-green" : "text-text-muted")}>
                        {mission.finalPay ? formatCurrency(mission.finalPay) : 'Pending Finalization'}
                    </p>
                    <p className="text-[9px] text-text-muted uppercase tracking-tighter">Verified Payout</p>
                </div>
             </div>

             {mission.reimbursements && mission.reimbursements.length > 0 && (
                <div className="space-y-2">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest ml-1">Incidentals & Reimbursements</p>
                    <div className="space-y-1.5">
                        {mission.reimbursements.map(re => (
                            <div key={re.id} className="flex items-center justify-between p-3 rounded bg-bg-primary border border-border-sub">
                                <div className="space-y-0.5">
                                    <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide">{re.description}</p>
                                    <p className="text-[9px] text-text-muted font-mono">{formatDateDisplay(re.date)}</p>
                                </div>
                                <p className="text-xs font-mono font-bold text-text-green">+{formatCurrency(re.amount)}</p>
                            </div>
                        ))}
                    </div>
                </div>
             )}
          </div>

          {/* SECTION: HISTORICAL LEDGER */}
          <div className="space-y-4 text-left">
             <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                <History size={14} className="text-accent-gold shrink-0"/> 
                <span>{TERMINOLOGY.ENTITIES.LEDGER}</span>
             </h3>
             <div className="space-y-3">
                {mission.history && mission.history.length > 0 ? mission.history.map((evt, idx) => (
                  <div key={idx} className="flex gap-4 group">
                    <div className="flex flex-col items-center">
                      <div className="h-2 w-2 rounded-full bg-border-main border border-text-muted mt-1.5" />
                      <div className="w-px flex-1 bg-border-sub group-last:bg-transparent mt-1" />
                    </div>
                    <div className="pb-4 space-y-1">
                      <p className="text-[9px] font-mono font-bold text-text-muted uppercase">{formatDateDisplay(evt.date)} • {evt.user}</p>
                      <div className="flex items-center gap-2">
                         <Badge variant="outline" className="text-[8px] h-4 uppercase tracking-tighter bg-bg-tertiary px-1.5">
                            {evt.type.replace('_', ' ')}
                         </Badge>
                         <p className="text-xs text-text-secondary leading-relaxed">{evt.details}</p>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="p-8 text-center border border-dashed border-border-sub rounded-lg opacity-60">
                    <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">No historical records logged</p>
                  </div>
                )}
             </div>
          </div>
        </div>

        <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => setIsOpen(false)} className="h-11 text-[10px] uppercase font-bold tracking-widest">Close Intelligence Feed</Button>
            {isCompleted ? (
              <Button variant="outline" className="h-11 bg-green-dim border-green-border text-text-green hover:bg-green-dim/80 text-[10px] uppercase font-bold tracking-widest pointer-events-none">
                <FileCheck size={16} className="mr-2"/> assignment Archived
              </Button>
            ) : (
              <Button 
                onClick={handleModifyClick}
                className="h-11 bg-brand-red hover:bg-brand-red-hover text-[10px] uppercase font-bold tracking-widest"
                disabled={!onEdit}
              >
                 Modify Assignment <ChevronRight size={14} className="ml-2"/>
              </Button>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
