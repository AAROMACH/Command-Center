
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { WorkOrder, Technician } from '@/lib/types';
import { technicians } from '@/lib/data';
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
  ExternalLink
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isPayAdmin } from '@/lib/permissions';

type JobDetailDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  mission: WorkOrder | null;
  onEdit?: (mission: WorkOrder) => void;
};

export function JobDetailDialog({ isOpen, setIsOpen, mission, onEdit }: JobDetailDialogProps) {
  const [currentUser, setCurrentUser] = useState<Technician | null>(null);

  useEffect(() => {
    const userId = localStorage.getItem('currentUserId');
    if (userId) {
      setCurrentUser(technicians.find(t => t.id === userId) || null);
    }
  }, []);

  if (!mission) return null;

  const tech = technicians.find(t => t.id === mission.assignedTechnicianId);
  const isCompleted = mission.status === 'completed';

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const handleModifyClick = () => {
    if (onEdit && mission) {
      onEdit(mission);
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return 'TBD';
    try {
      const parts = dateStr.split(/[-/]/);
      if (parts.length === 3) {
          if (parts[0].length === 4) {
              const [y, m, d] = parts;
              return `${m}-${d}-${y}`;
          }
          const [a, b, c] = parts;
          return `${a}-${b}-${c}`;
      }
      return dateStr;
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[700px] bg-bg-elevated border-border-default flex flex-col p-0 max-h-[90vh] shadow-2xl">
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-brand-red uppercase tracking-widest font-mono">ID: {mission.id.toUpperCase()}</span>
                {mission.source === 'Imported' && (
                  <a 
                    href={`https://app.fieldnation.com/workorders/${mission.id.replace('wo-', '')}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-text-muted hover:text-brand-red transition-colors"
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
          <DialogDescription className="flex items-center gap-4 text-xs font-bold text-text-muted uppercase tracking-widest mt-1">
             <span className="flex items-center gap-1.5">
               <MapPin size={12}/>
               {mission.location}
             </span>
             <span className="flex items-center gap-1.5"><Calendar size={12}/> {formatDateDisplay(mission.scheduleDate)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-8 mt-2">
          {/* Pay Change Request Alert */}
          {mission.payChangeRequest && (
              <div className="p-4 rounded-lg bg-brand-red-dim/10 border border-brand-red/30 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                      <AlertTriangle className="text-brand-red h-5 w-5 shrink-0" />
                      <div className="flex-1">
                          <p className="text-xs font-bold text-text-primary uppercase tracking-wide">Pay Change Pending Approval</p>
                          <p className="text-[10px] text-text-muted uppercase tracking-widest mt-0.5">
                              A financial modification has been requested and is currently under audit.
                          </p>
                      </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 bg-bg-primary/50 p-3 rounded border border-border-sub">
                      <div>
                          <p className="text-[8px] font-black uppercase text-text-muted">Proposed Rate</p>
                          <p className="text-sm font-mono font-bold text-text-primary">{formatCurrency(mission.payChangeRequest.pay)}</p>
                      </div>
                      <div>
                          <p className="text-[8px] font-black uppercase text-text-muted">Proposed Model</p>
                          <p className="text-sm font-bold text-text-primary uppercase">{mission.payChangeRequest.payType}</p>
                      </div>
                  </div>
                  {isPayAdmin(currentUser) && (
                      <Button className="w-full bg-brand-red h-9 text-[10px] uppercase font-bold" onClick={handleModifyClick}>
                          <ShieldCheck size={14} className="mr-2"/> Authorize Pay Change
                      </Button>
                  )}
              </div>
          )}

          {/* Section 1: Personnel Intelligence */}
          <div className="space-y-4">
             <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                <User size={14} className="text-brand-red"/> Primary Operative
             </h3>
             <div className="p-4 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between">
                {tech ? (
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12 border border-border-sub">
                        <AvatarImage src={tech.avatarUrl} />
                        <AvatarFallback>{tech.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                        <p className="text-sm font-bold text-text-primary uppercase tracking-wide">{tech.name}</p>
                        <p className="text-[10px] text-text-muted uppercase tracking-widest">{tech.role}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-text-muted italic">
                    <User size={16} />
                    <span className="text-xs uppercase font-bold tracking-widest">Unallocated Operative</span>
                  </div>
                )}
                {mission.isAcknowledged && (
                  <Badge variant="outline" className="bg-green-dim border-green-border text-text-green text-[8px] uppercase tracking-widest gap-1.5 px-3">
                    <UserCheck size={10}/> Acknowledged
                  </Badge>
                )}
             </div>
          </div>

          {/* Section 2: History Ledger */}
          <div className="space-y-4">
             <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                <History size={14} className="text-accent-gold"/> History Ledger
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

          {/* Section 3: Financial Settlement Audit */}
          <div className="space-y-4">
             <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                <Coins size={14} className="text-text-green"/> Financial Audit
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

             {/* Reimbursements */}
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

          {/* Section 4: Intelligence Notes */}
          <div className="space-y-4">
             <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                <StickyNote size={14} className="text-accent-gold"/> Internal Briefing Notes
             </h3>
             <div className="space-y-2">
                {mission.notes && mission.notes.length > 0 ? mission.notes.map((note, i) => (
                    <div key={i} className="p-4 rounded-lg bg-accent-gold-dim/5 border border-accent-gold/20 italic text-xs text-text-secondary leading-relaxed">
                        &quot;{note}&quot;
                    </div>
                )) : (
                    <div className="p-4 rounded-lg bg-bg-primary border border-border-sub">
                        <p className="text-xs text-text-muted italic">No internal intelligence notes appended to this registry.</p>
                    </div>
                )}
             </div>
          </div>
        </div>

        <DialogFooter className="bg-bg-tertiary/50 p-6 border-t border-border-default grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => setIsOpen(false)} className="h-11 text-[10px] uppercase font-bold tracking-widest">Close Registry Feed</Button>
            {isCompleted ? (
              <Button variant="outline" className="h-11 bg-green-dim border-green-border text-text-green hover:bg-green-dim/80 text-[10px] uppercase font-bold tracking-widest pointer-events-none">
                <FileCheck size={16} className="mr-2"/> Job Archived
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
