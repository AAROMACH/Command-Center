'use client';

import { useState, useEffect, useMemo } from 'react';
import type { WorkOrder, Technician, Recommendation } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, doc, updateDoc, onSnapshot, query } from 'firebase/firestore';
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
  Sparkles
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { isAdmin } from '@/lib/permissions';
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
      .filter(t => !t.roles?.includes('client') && !t.role.toLowerCase().includes('client'))
      .filter(t => t.name.toLowerCase().includes(techSearchQuery.toLowerCase()))
      .sort((a, b) => b.reliabilityScore - a.reliabilityScore);
  }, [technicians, techSearchQuery]);

  if (!mission) return null;

  const userIsAdmin = isAdmin(currentUser);
  const leadTech = technicians.find(t => t.id === mission.assignedTechnicianId);
  const supportTechs = (mission.additionalTechnicianIds || []).map(id => technicians.find(t => t.id === id)).filter(Boolean) as Technician[];
  const isCompleted = mission.status === 'completed';

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

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
          currentLocation: t.currentLocation || 'Detroit, MI',
          reliabilityScore: t.reliabilityScore,
          currentWorkload: t.currentWorkload,
          skills: t.skills,
        })),
      });
      setRecommendation(result);
    } catch (error) {
      toast({ variant: "destructive", title: "Recommendation Failed", description: "Could not get an AI recommendation." });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAssign = async (technicianId: string) => {
    const docRef = doc(db, 'workOrders', mission.id);
    const targetTech = technicians.find(t => t.id === technicianId);
    const today = format(new Date(), 'MM-dd-yyyy');
    const now = format(new Date(), 'HH:mm');

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

    try {
        await updateDoc(docRef, updates);
        setIsAssigning(false);
        toast({ title: "Registry Updated", description: "Allocation committed to Firestore." });
    } catch (e: any) {
        toast({ variant: "destructive", title: "Registry Error", description: e.message });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[700px] bg-bg-elevated border-border-default flex flex-col p-0 max-h-[90vh] shadow-2xl">
        <DialogHeader className="p-6 pb-2 text-left">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-brand-red uppercase tracking-widest font-mono">ID: {mission.id.toUpperCase()}</span>
                <Badge variant={mission.status === 'completed' ? 'active' : mission.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="h-5 uppercase text-[9px] tracking-widest">
                    {mission.status}
                </Badge>
            </div>
          </div>
          <DialogTitle className="text-xl font-bold uppercase tracking-wide text-text-primary leading-tight">{mission.description}</DialogTitle>
          <div className="flex items-center gap-4 text-xs font-bold text-text-muted uppercase tracking-widest mt-1">
             <span className="flex items-center gap-1.5"><MapPin size={12} className="text-brand-red shrink-0" /><span>{mission.location}</span></span>
             <span className="flex items-center gap-1.5"><Calendar size={12} className="text-text-muted shrink-0" /><span>{mission.scheduleDate}</span></span>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-8">
            <div className="space-y-4 text-left">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2"><StickyNote size={14} className="text-accent-gold shrink-0"/><span>Scope of Work</span></h3>
                <div className="p-4 rounded-lg bg-accent-gold-dim/5 border border-accent-gold/20 italic text-xs text-text-secondary leading-relaxed uppercase">
                    {mission.notes?.[0] || mission.description}
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2"><User size={14} className="text-brand-red shrink-0"/><span>Allocation Registry</span></h3>
                    {userIsAdmin && !isCompleted && !isAssigning && (
                        <div className="flex gap-2">
                            <Button variant="ghost" size="sm" className="h-7 text-[9px] uppercase font-bold" onClick={() => { setAssignMode('lead'); setIsAssigning(true); }}><RefreshCw size={12} className="mr-1.5"/> Swap Lead</Button>
                            <Button variant="ghost" size="sm" className="h-7 text-[9px] uppercase font-bold" onClick={() => { setAssignMode('support'); setIsAssigning(true); }}><Plus size={12} className="mr-1.5"/> Add Support</Button>
                        </div>
                    )}
                </div>
                
                {isAssigning ? (
                    <div className="p-4 rounded-xl bg-bg-secondary border border-brand-red/30 space-y-4">
                        <Input placeholder="Search technicians..." value={techSearchQuery} onChange={e => setTechSearchQuery(e.target.value)} className="h-10 bg-bg-primary text-xs uppercase" />
                        <div className="divide-y divide-border-sub max-h-[200px] overflow-y-auto border rounded-md">
                            {filteredTechs.map(t => (
                                <div key={t.id} className="p-3 flex items-center justify-between hover:bg-bg-tertiary cursor-pointer" onClick={() => handleAssign(t.id)}>
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-8 w-8"><AvatarImage src={t.avatarUrl}/></Avatar>
                                        <span className="text-xs font-bold uppercase">{t.name}</span>
                                    </div>
                                    <ChevronRight size={14} />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="p-4 rounded-xl bg-bg-secondary border border-border-sub flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <Avatar className="h-12 w-12 border-2 border-border-sub"><AvatarImage src={leadTech?.avatarUrl} /><AvatarFallback>U</AvatarFallback></Avatar>
                                <div className="text-left">
                                    <p className="text-sm font-bold text-text-primary uppercase">{leadTech?.name || 'Unallocated'}</p>
                                    <p className="text-[10px] text-text-muted uppercase">{leadTech?.role || 'Awaiting Action'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="p-6 border-t border-border-default bg-bg-tertiary/30">
            <Button variant="outline" onClick={() => setIsOpen(false)} className="w-full h-11 uppercase font-bold text-[10px] tracking-widest">Close Intelligence Feed</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
