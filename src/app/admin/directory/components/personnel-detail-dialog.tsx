'use client';

import { useState, useMemo } from 'react';
import type { Technician, WorkOrder, TimeOffRequest, ReliabilityEvent } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
    Mail, 
    Phone, 
    Wrench, 
    Shield, 
    Building, 
    Calendar, 
    Briefcase, 
    DollarSign, 
    Folder, 
    StickyNote, 
    User, 
    HeartPulse, 
    MapPin, 
    Pencil, 
    Activity, 
    ShieldAlert, 
    History,
    AlertTriangle,
    CheckCircle2,
    Plus,
    X,
    Send,
    Lock
} from 'lucide-react';
import Image from 'next/image';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { penaltyEvents } from '@/lib/data';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { getReliabilityTier, getTierBadgeVariant, getTierColor, getAllEventOptions } from '@/lib/reliability';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

type PersonnelDetailDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  person: Technician | null;
  workOrders: WorkOrder[];
  timeOffRequests: TimeOffRequest[];
  onEdit?: () => void;
};

export function PersonnelDetailDialog({ isOpen, setIsOpen, person, workOrders, timeOffRequests, onEdit }: PersonnelDetailDialogProps) {
  const [isLogEventOpen, setIsLogEventOpen] = useState(false);
  const { toast } = useToast();

  if (!person) return null;

  const isTechnician = person.roles?.some(r => r.includes('tech') || r.includes('lead')) || person.role.toLowerCase().includes('tech');
  const isStaff = person.roles?.some(r => r.includes('admin') || r.includes('manager')) || person.role.toLowerCase() === 'dispatcher' || person.role.toLowerCase() === 'admin';
  const isClient = person.roles?.includes('client') || person.role.toLowerCase().includes('client');
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const reliabilityEvents = penaltyEvents.filter(e => e.technicianId === person.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const tier = person.reliabilityTier || getReliabilityTier(person.reliabilityScore);
  const tierColor = getTierColor(tier);
  const badgeVariant = getTierBadgeVariant(tier);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="lg:max-w-4xl bg-bg-elevated border-border-default p-0 flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 border-b border-border-sub bg-bg-tertiary/30 text-left">
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-6">
                    <Avatar className="h-16 w-16 border-2 border-border-sub">
                        <AvatarImage src={person.avatarUrl} />
                        <AvatarFallback>{person.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <DialogTitle className="text-2xl font-bold uppercase tracking-wide">{person.name}</DialogTitle>
                            <Badge variant="active" className="text-[10px] h-5 px-3 uppercase tracking-widest">Active Profile</Badge>
                        </div>
                        <p className="text-sm text-text-muted font-bold uppercase tracking-[0.2em]">{person.role}</p>
                         <div className="flex items-center gap-3 mt-2">
                             <span className="text-[10px] text-text-muted font-mono uppercase tracking-widest">{person.id}</span>
                             <div className="h-1 w-1 rounded-full bg-text-muted opacity-30" />
                             <div className="flex gap-1">
                                {person.roles?.map(r => (
                                    <Badge key={r} variant="outline" className="text-[8px] uppercase h-4 bg-bg-primary">{r.replace(/_/g, ' ')}</Badge>
                                ))}
                             </div>
                         </div>
                    </div>
                </div>
                 <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8 !text-[10px] uppercase font-bold tracking-widest"><Mail size={14} className="mr-2"/> Email</Button>
                    <Button variant="outline" size="sm" className="h-8 !text-[10px] uppercase font-bold tracking-widest"><Phone size={14} className="mr-2"/> Call</Button>
                </div>
            </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="flex-1 overflow-hidden flex flex-col">
            <div className="px-6 border-b border-border-sub bg-bg-secondary/30">
                <TabsList className="h-12 bg-transparent p-0 gap-8 justify-start">
                    <TabsTrigger value="overview" className="tab-trigger-personnel">Overview</TabsTrigger>
                    <TabsTrigger value="reliability" className="tab-trigger-personnel">Operational Reliability</TabsTrigger>
                    <TabsTrigger value="schedule" className="tab-trigger-personnel">Schedule</TabsTrigger>
                    {isTechnician && <TabsTrigger value="assignments" className="tab-trigger-personnel">Assignments</TabsTrigger>}
                    <TabsTrigger value="financial" className="tab-trigger-personnel">Financial</TabsTrigger>
                </TabsList>
            </div>
            
            <ScrollArea className="flex-1">
                <div className="p-6">
                    <TabsContent value="overview" className="m-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <section className="space-y-6">
                                <div className="space-y-3">
                                    <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1">Core Identity</h3>
                                    <div className="grid grid-cols-[100px,1fr] gap-y-3 text-xs">
                                        <span className="text-text-muted font-bold uppercase">Official Email</span>
                                        <span className="text-text-primary">{person.email}</span>
                                        <span className="text-text-muted font-bold uppercase">Direct Line</span>
                                        <span className="text-text-primary">{person.phone}</span>
                                        <span className="text-text-muted font-bold uppercase">Base Address</span>
                                        <span className="text-text-primary">{person.address || 'N/A'}</span>
                                        {isClient && person.clientCompany && (
                                            <>
                                                <span className="text-text-muted font-bold uppercase">Organization</span>
                                                <span className="text-text-primary uppercase font-bold">{person.clientCompany}</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {(isTechnician || isStaff) && person.emergencyContact && (
                                    <div className="space-y-3">
                                        <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1 flex items-center gap-2">
                                            <HeartPulse size={14}/> Emergency Protocol
                                        </h3>
                                        <div className="p-4 rounded-lg bg-bg-secondary border border-border-sub space-y-2">
                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{person.emergencyContact.name}</p>
                                            <div className="flex items-center gap-4 text-[10px] text-text-muted font-bold uppercase tracking-widest">
                                                <span>{person.emergencyContact.relation}</span>
                                                <span>•</span>
                                                <span>{person.emergencyContact.phone}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </section>

                            {isTechnician && (
                                <section className="space-y-6">
                                    <div className="space-y-3">
                                        <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1">Trust Index</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 rounded-xl bg-bg-secondary border border-border-sub text-center space-y-1">
                                                <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Reliability Score</p>
                                                <p className={cn("text-3xl font-mono font-bold", tierColor)}>{person.reliabilityScore}%</p>
                                                <Badge variant={badgeVariant} className="text-[8px] h-4 uppercase">{tier}</Badge>
                                            </div>
                                            <div className="p-4 rounded-xl bg-bg-secondary border border-border-sub text-center space-y-1">
                                                <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Active Workload</p>
                                                <p className="text-3xl font-bold text-text-primary">{person.currentWorkload}</p>
                                                <p className="text-[9px] text-text-muted uppercase">Assignments</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1">Specializations</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {person.skills.map(skill => (
                                                <Badge key={skill} variant="outline" className="text-[9px] bg-bg-secondary border-border-sub text-text-primary h-6 px-3">{skill}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                </section>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="reliability" className="m-0 space-y-6 animate-in fade-in duration-300">
                        <div className="flex justify-between items-center mb-4 px-1">
                            <div className="space-y-1">
                                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Operational Trust Manifest</h3>
                                <p className="text-[9px] text-text-muted uppercase font-bold italic tracking-tighter">Rolling 30-day window active for operational friction events.</p>
                            </div>
                            <Button className="h-8 !text-[10px] uppercase font-bold tracking-widest bg-brand-red" onClick={() => setIsLogEventOpen(true)}>
                                <Plus size={14} className="mr-1.5"/> Log Reliability Event
                            </Button>
                        </div>

                        <div className="space-y-3">
                            {reliabilityEvents.map(event => {
                                const isCritical = event.category === 'critical_failure';
                                const isRecovery = event.category === 'positive_recovery';
                                return (
                                    <div key={event.id} className="p-4 rounded-xl border border-border-sub bg-bg-secondary flex items-center justify-between group hover:border-text-muted transition-all">
                                        <div className="flex items-center gap-6">
                                            <div className={cn(
                                                "p-2.5 rounded-lg border",
                                                isCritical ? "bg-brand-red-dim text-text-red border-brand-red/30" : 
                                                isRecovery ? "bg-green-dim text-text-green border-green-border/30" : 
                                                "bg-bg-primary text-text-muted border-border-sub"
                                            )}>
                                                {isCritical ? <ShieldAlert size={20}/> : isRecovery ? <CheckCircle2 size={20}/> : <History size={20}/>}
                                            </div>
                                            <div className="text-left space-y-0.5">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-bold text-text-primary uppercase tracking-wide">{event.eventType.replace(/_/g, ' ')}</p>
                                                    <Badge variant="outline" className="text-[8px] h-3.5 uppercase bg-bg-tertiary px-1">{event.category.replace(/_/g, ' ')}</Badge>
                                                </div>
                                                <p className="text-xs text-text-secondary leading-relaxed uppercase font-medium italic">&quot;{event.reason}&quot;</p>
                                                <p className="text-[9px] text-text-muted font-bold uppercase tracking-widest">
                                                    {format(parseISO(event.createdAt), 'MMM d, yyyy')} · Logged by {event.createdBy}
                                                    {event.relatedAssignmentId && ` · WO: ${event.relatedAssignmentId.toUpperCase()}`}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0 min-w-[80px]">
                                            <p className={cn(
                                                "text-lg font-mono font-bold leading-none",
                                                event.scoreChange > 0 ? "text-text-green" : "text-text-red"
                                            )}>
                                                {event.scoreChange > 0 ? `+${event.scoreChange}` : event.scoreChange}
                                            </p>
                                            <p className="text-[8px] font-black text-text-muted uppercase mt-1">INDEX PTS</p>
                                        </div>
                                    </div>
                                )
                            })}
                            {reliabilityEvents.length === 0 && (
                                <div className="py-24 text-center border-2 border-dashed border-border-sub rounded-2xl bg-bg-secondary/30">
                                    <Shield size={48} className="mx-auto text-text-muted mb-2 opacity-20" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">No operational reliability events logged</p>
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="schedule" className="m-0">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1">Weekly Availability</h3>
                                <div className="space-y-2">
                                    {daysOfWeek.map(day => {
                                        const availability = person.availability?.[day.toLowerCase()];
                                        return (
                                            <div key={day} className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary border border-border-sub">
                                                <span className="text-[11px] font-bold text-text-primary uppercase tracking-widest">{day}</span>
                                                {availability ? (
                                                    <span className="font-mono text-[11px] font-bold text-text-green">{availability.start} - {availability.end}</span>
                                                ) : (
                                                    <Badge variant="outline" className="text-[8px] uppercase bg-bg-tertiary">Unavailable</Badge>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                            <div className="space-y-4">
                                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1 flex items-center gap-2">
                                    <Calendar size={14}/> Temporal Exceptions
                                </h3>
                                <div className="space-y-2">
                                    {timeOffRequests.map((req) => (
                                        <div key={req.id} className="p-4 rounded-xl bg-bg-secondary border border-border-sub flex items-center justify-between">
                                            <div className="space-y-1">
                                                <p className="text-xs font-bold text-text-primary uppercase">{req.type}</p>
                                                <p className="text-[10px] text-text-muted font-mono">{req.startDate} to {req.endDate}</p>
                                            </div>
                                            <Badge variant={req.status === 'approved' ? 'active' : 'onhold'}>{req.status.toUpperCase()}</Badge>
                                        </div>
                                    ))}
                                    {timeOffRequests.length === 0 && (
                                        <div className="p-12 text-center border border-dashed border-border-sub rounded-xl bg-bg-secondary/30 opacity-60">
                                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest italic">No exceptions logged</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                         </div>
                    </TabsContent>

                    <TabsContent value="assignments" className="m-0 space-y-6">
                        <div className="flex justify-between items-center px-1">
                            <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Assignment Ledger</h3>
                        </div>
                        <div className="table-wrap p-0">
                            <Table>
                                <TableHeader className="bg-bg-tertiary">
                                    <TableRow className="hover:bg-transparent border-border-sub">
                                        <TableHead className="text-[10px] tracking-widest pl-6">Mission ID</TableHead>
                                        <TableHead className="text-[10px] tracking-widest">Scope & Client</TableHead>
                                        <TableHead className="text-[10px] tracking-widest">Status</TableHead>
                                        <TableHead className="text-right pr-6 text-[10px] tracking-widest">Settlement</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {workOrders.map((wo) => (
                                        <TableRow key={wo.id} className="border-border-sub hover:bg-bg-tertiary transition-colors cursor-pointer">
                                            <TableCell className="font-mono text-brand-red font-bold text-xs pl-6">{wo.id.toUpperCase()}</TableCell>
                                            <TableCell>
                                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{wo.description}</p>
                                                <p className="text-[9px] text-text-muted uppercase tracking-widest">{wo.clientName}</p>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={wo.status === 'completed' ? 'active' : 'onhold'} className="text-[8px] uppercase">
                                                    {wo.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right pr-6 font-mono font-bold text-text-primary">${wo.pay.toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {workOrders.length === 0 && (
                                        <TableRow><TableCell colSpan={4} className="h-32 text-center text-text-muted italic text-[10px] uppercase tracking-widest">Assignment registry clear</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>
                    
                    <TabsContent value="financial" className="m-0 p-12 text-center border-2 border-dashed border-border-sub rounded-2xl bg-bg-secondary/30 opacity-40">
                        <DollarSign size={48} className="mx-auto mb-2 text-text-muted" />
                        <p className="text-[10px] font-bold uppercase tracking-widest">Financial settlement hub pending configuration</p>
                    </TabsContent>
                </div>
            </ScrollArea>
            
            <DialogFooter className="p-6 border-t border-border-sub bg-bg-tertiary/30">
                <Button variant="outline" onClick={() => setIsOpen(false)} className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest">Exit Terminal</Button>
                <Button onClick={onEdit} className="h-10 px-10 uppercase font-bold text-[10px] tracking-widest bg-brand-red">
                    <Pencil size={14} className="mr-2"/> Modify Identity Registry
                </Button>
            </DialogFooter>
        </Tabs>

        {/* LOG RELIABILITY EVENT DIALOG */}
        <LogReliabilityEventDialog 
            isOpen={isLogEventOpen}
            setIsOpen={setIsLogEventOpen}
            person={person}
            onSave={(evt) => {
                setIsLogEventOpen(false);
                toast({ title: "Registry Event Logged", description: "Operational reliability index has been updated." });
            }}
        />
      </DialogContent>
      <style jsx global>{`
        .tab-trigger-personnel {
            @apply px-0 h-12 bg-transparent text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted rounded-none border-b-2 border-transparent transition-all;
        }
        .tab-trigger-personnel[data-state="active"] {
            @apply text-text-primary border-brand-red bg-transparent shadow-none;
        }
      `}</style>
    </Dialog>
  );
}

function LogReliabilityEventDialog({ isOpen, setIsOpen, person, onSave }: { isOpen: boolean, setIsOpen: (val: boolean) => void, person: Technician, onSave: (evt: ReliabilityEvent) => void }) {
    const allOptions = getAllEventOptions();
    const [selectedType, setSelectedType] = useState<string>("");
    const [reason, setReason] = useState("");
    const [assignmentId, setAssignmentId] = useState("");

    const handleSave = () => {
        const option = allOptions.find(o => o.type === selectedType);
        if (!option || !reason) return;

        const newEvent: ReliabilityEvent = {
            id: `re-${Date.now()}`,
            technicianId: person.id,
            eventType: option.type,
            scoreChange: option.scoreChange,
            reason,
            relatedAssignmentId: assignmentId || undefined,
            createdAt: new Date().toISOString(),
            createdBy: 'Sarah Connor', // Mock current admin
            category: option.category
        };

        onSave(newEvent);
        // Reset local state
        setSelectedType("");
        setReason("");
        setAssignmentId("");
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default shadow-2xl">
                <DialogHeader className="text-left">
                    <div className="flex items-center gap-2 mb-1">
                        <Activity className="text-brand-red h-5 w-5" />
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest">Audit Event Protocol</DialogTitle>
                    </div>
                    <DialogDescription className="text-xs">Append an operational reliability event to technician <span className="text-text-primary font-bold">{person.name}</span>.</DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-6 text-left">
                    <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Event Identification</Label>
                        <Select value={selectedType} onValueChange={setSelectedType}>
                            <SelectTrigger className="h-11 bg-bg-primary text-xs uppercase font-bold">
                                <SelectValue placeholder="Select tactical event type..." />
                            </SelectTrigger>
                            <SelectContent className="bg-bg-elevated max-h-[300px]">
                                {allOptions.map(opt => (
                                    <SelectItem key={opt.type} value={opt.type} className="text-xs uppercase font-bold">
                                        <div className="flex justify-between items-center w-full gap-8">
                                            <span>{opt.label}</span>
                                            <span className={cn("font-mono", opt.scoreChange > 0 ? "text-text-green" : "text-text-red")}>
                                                ({opt.scoreChange > 0 ? `+${opt.scoreChange}` : opt.scoreChange})
                                            </span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Mission Context (Optional)</Label>
                        <Input 
                            placeholder="e.g. WO-18937" 
                            value={assignmentId}
                            onChange={e => setAssignmentId(e.target.value)}
                            className="h-11 bg-bg-primary text-xs font-mono uppercase"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Operational Intelligence / Reason</Label>
                        <Textarea 
                            placeholder="Provide full context for this audit entry..." 
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            className="bg-bg-primary min-h-[120px] text-xs leading-relaxed uppercase font-medium"
                        />
                    </div>
                </div>

                <DialogFooter className="bg-bg-tertiary/30 -mx-6 -mb-6 p-6 border-t border-border-default flex gap-3">
                    <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest">Discard</Button>
                    <Button 
                        disabled={!selectedType || !reason}
                        onClick={handleSave} 
                        className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest"
                    >
                        Commit to Ledger
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
