'use client';

import { useState, useEffect, useMemo } from 'react';
import type { WeeklyLog, WeeklyLogItem, WorkOrder } from '@/lib/types';
import { weeklyLogs, workOrders, technicians } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
    Check, 
    X, 
    AlertTriangle, 
    Clock, 
    MapPin, 
    Calendar,
    Send,
    CircleCheck,
    History,
    ChevronDown,
    ShieldAlert,
    Info,
    LayoutList,
    ChevronRight,
    ArrowLeft,
    Search,
    ArrowUpDown,
    SlidersHorizontal,
    Hash,
    Building2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { format, parseISO } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const DISPUTE_REASONS = [
    "Another tech did this job",
    "Revisit needed, not complete",
    "I don't recognize this job",
    "Wrong date on my log",
    "This appears to be a duplicate"
];

type SortOption = 'newest' | 'oldest' | 'status';

export default function TechWeeklyLogPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [activeLog, setActiveLog] = useState<WeeklyLog | null>(null);
    const [mounted, setMounted] = useState(false);
    
    // Filter State
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<SortOption>('newest');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [isReportMissingOpen, setIsReportMissingOpen] = useState(false);

    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);
    }, []);

    const filteredAndSortedLogs = useMemo(() => {
        if (!currentTechId) return [];
        let filtered = weeklyLogs.filter(wl => wl.technicianId === currentTechId);
        
        // Status Filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter(l => l.status === statusFilter);
        }

        // Search Filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(l => l.weekOf.includes(q));
        }

        // Sorting
        return filtered.sort((a, b) => {
            if (sortBy === 'newest') return b.weekOf.localeCompare(a.weekOf);
            if (sortBy === 'oldest') return a.weekOf.localeCompare(b.weekOf);
            if (sortBy === 'status') return a.status.localeCompare(b.status);
            return 0;
        });
    }, [currentTechId, searchQuery, sortBy, statusFilter]);

    const handleLogSelection = (log: WeeklyLog) => {
        setActiveLog(JSON.parse(JSON.stringify(log))); // Clone for local state
    };

    const isLocked = useMemo(() => activeLog?.status !== 'Draft', [activeLog?.status]);

    const handleConfirm = (itemId: string) => {
        if (isLocked) return;
        setActiveLog(prev => {
            if (!prev) return null;
            return {
                ...prev,
                items: prev.items.map(item => 
                    item.id === itemId 
                        ? { ...item, confirmationStatus: 'confirmed', disputeReason: undefined, disputeNotes: undefined } 
                        : item
                )
            };
        });
    };

    const handleDispute = (itemId: string, reason: string, notes?: string) => {
        if (isLocked) return;
        setActiveLog(prev => {
            if (!prev) return null;
            return {
                ...prev,
                items: prev.items.map(item => 
                    item.id === itemId 
                        ? { ...item, confirmationStatus: 'disputed', disputeReason: reason, disputeNotes: notes } 
                        : item
                )
            };
        });
    };

    const handleSubmit = () => {
        if (!activeLog) return;
        setActiveLog(prev => prev ? ({ ...prev, status: 'Submitted', submittedAt: new Date().toISOString() }) : null);
        toast({
            title: "Log Submitted",
            description: "Weekly assignments manifest has been transmitted for audit.",
        });
    };

    const counts = useMemo(() => {
        if (!activeLog) return { total: 0, confirmed: 0, disputed: 0, pending: 0 };
        return {
            total: activeLog.items.length,
            confirmed: activeLog.items.filter(i => i.confirmationStatus === 'confirmed').length,
            disputed: activeLog.items.filter(i => i.confirmationStatus === 'disputed').length,
            pending: activeLog.items.filter(i => !i.confirmationStatus).length
        };
    }, [activeLog]);

    const canSubmit = counts.total > 0 && counts.pending === 0;

    if (!mounted || !currentTechId) {
        return <div className="p-8 text-center text-xs uppercase tracking-widest text-text-muted">Initializing Terminal...</div>;
    }

    // --- INDEX VIEW: LIST OF AVAILABLE LOGS ---
    if (!activeLog) {
        return (
            <div className="space-y-6">
                <header className="page-header">
                    <div>
                        <p className="page-eyebrow flex items-center gap-2"><LayoutList size={12}/> Payroll Audit</p>
                        <h1 className="page-title">Weekly Log Registry</h1>
                        <p className="page-subtitle text-[11px] uppercase font-bold tracking-widest mt-1">Audit terminal for assignment verification and payouts.</p>
                    </div>
                </header>

                {/* SEARCH & FILTER BAR */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-bg-secondary border border-border-sub shadow-sm max-w-4xl mx-auto mb-6">
                    <div className="search-wrap flex-1 !mb-0 w-full md:w-auto">
                        <Search className="h-4 w-4" />
                        <input 
                            placeholder="Filter by week period (MM-DD)..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="search-input !w-full !bg-bg-primary h-10 text-xs font-bold uppercase"
                        />
                    </div>
                    
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[140px] h-10 bg-bg-primary text-[10px] uppercase font-bold tracking-widest">
                                <div className="flex items-center gap-2">
                                    <SlidersHorizontal size={14} className="text-text-muted" />
                                    <SelectValue placeholder="Status" />
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="text-[10px] uppercase font-bold">All Statuses</SelectItem>
                                <SelectItem value="Draft" className="text-[10px] uppercase font-bold">Drafts</SelectItem>
                                <SelectItem value="Submitted" className="text-[10px] uppercase font-bold">Submitted</SelectItem>
                                <SelectItem value="Approved" className="text-[10px] uppercase font-bold">Approved</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                            <SelectTrigger className="w-[140px] h-10 bg-bg-primary text-[10px] uppercase font-bold tracking-widest">
                                <div className="flex items-center gap-2">
                                    <ArrowUpDown size={14} className="text-text-muted" />
                                    <SelectValue placeholder="Sort" />
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="newest" className="text-[10px] uppercase font-bold">Newest First</SelectItem>
                                <SelectItem value="oldest" className="text-[10px] uppercase font-bold">Oldest First</SelectItem>
                                <SelectItem value="status" className="text-[10px] uppercase font-bold">By Status</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 max-w-4xl mx-auto">
                    {filteredAndSortedLogs.length > 0 ? (
                        filteredAndSortedLogs.map(log => (
                            <Card 
                                key={log.id} 
                                className="bg-bg-secondary border-border-sub hover:border-brand-red transition-all cursor-pointer group"
                                onClick={() => handleLogSelection(log)}
                            >
                                <CardContent className="p-5 flex items-center justify-between">
                                    <div className="flex items-center gap-6">
                                        <div className={cn(
                                            "p-3 rounded-xl border",
                                            log.status === 'Draft' ? "bg-accent-gold-dim border-accent-gold/30 text-accent-gold" : 
                                            log.status === 'Approved' ? "bg-green-dim border-green-border/30 text-text-green" : 
                                            "bg-bg-tertiary border-border-sub text-text-muted"
                                        )}>
                                            <Calendar size={20} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold uppercase tracking-wide text-text-primary group-hover:text-brand-red transition-colors">Week of {log.weekOf}</p>
                                            <div className="flex items-center gap-3 mt-1 text-[10px] text-text-muted font-bold uppercase tracking-widest">
                                                <span>{log.items.length} Assignments</span>
                                                <div className="h-1 w-1 rounded-full bg-text-muted opacity-30" />
                                                <span className="text-text-green font-mono">${(log.totalPayout || 0).toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <Badge variant={log.status === 'Draft' ? 'onhold' : log.status === 'Approved' ? 'active' : 'pending'}>
                                            {log.status.toUpperCase()}
                                        </Badge>
                                        <ChevronRight size={18} className="text-text-muted group-hover:text-text-primary transition-all" />
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    ) : (
                        <div className="py-24 text-center border-2 border-dashed border-border-main rounded-2xl bg-bg-secondary/30">
                            {searchQuery || statusFilter !== 'all' ? (
                                <>
                                    <Search size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                                    <p className="text-sm font-bold text-text-muted uppercase tracking-[0.2em] italic">No logs match your registry constraints.</p>
                                    <Button variant="link" onClick={() => { setSearchQuery(""); setStatusFilter("all"); }} className="text-brand-red text-xs mt-2 uppercase font-bold tracking-widest">Clear All Filters</Button>
                                </>
                            ) : (
                                <>
                                    <History size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                                    <p className="text-sm font-bold text-text-muted uppercase tracking-[0.2em] italic">Log terminal clear: No assignments registered for audit.</p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // --- AUDIT VIEW: SPECIFIC LOG VERIFICATION ---
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <header className="flex items-center gap-4 mb-4">
                <Button variant="ghost" size="sm" onClick={() => setActiveLog(null)} className="h-8 text-[10px] uppercase font-bold text-text-muted hover:text-text-primary">
                    <ArrowLeft size={14} className="mr-2"/> Back to Registry
                </Button>
                <div className="h-4 w-px bg-border-sub" />
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Auditing week of {activeLog.weekOf}</p>
            </header>

            {/* SUMMARY COMMAND BAR */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-bg-secondary p-6 rounded-2xl border border-border-sub shadow-2xl">
                <div className="flex items-center gap-6">
                    <div className={cn(
                        "p-3 rounded-xl border",
                        activeLog.status === 'Draft' ? "bg-accent-gold-dim border-accent-gold/30 text-accent-gold" : "bg-green-dim border-green-border/30 text-text-green"
                    )}>
                        <ShieldAlert size={24} />
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-bold uppercase tracking-wider text-text-primary">Operational Audit</h2>
                            <Badge variant={activeLog.status === 'Draft' ? 'onhold' : 'active'} className="h-5 uppercase text-[9px] tracking-widest">
                                {activeLog.status}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-muted uppercase tracking-widest">
                                <Check className="text-text-green h-3 w-3"/> {counts.confirmed} Confirmed
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-muted uppercase tracking-widest">
                                <X className="text-text-red h-3 w-3"/> {counts.disputed} Disputed
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-accent-gold uppercase tracking-widest">
                                <Clock size={12}/> {counts.pending} Awaiting Action
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    {isLocked ? (
                        <div className="flex flex-col items-end">
                            <p className="text-[10px] font-black text-text-green uppercase tracking-widest">Terminal Locked</p>
                            <p className="text-[9px] text-text-muted uppercase font-bold">Transmitted: {activeLog.submittedAt ? format(parseISO(activeLog.submittedAt), 'MMM d, HH:mm') : 'N/A'}</p>
                        </div>
                    ) : (
                        <Button 
                            disabled={!canSubmit} 
                            onClick={handleSubmit}
                            className="h-12 px-10 bg-brand-red hover:bg-brand-red-hover font-bold uppercase text-[10px] tracking-[0.2em]"
                        >
                            <Send size={16} className="mr-2"/> Finalize & Submit Manifest
                        </Button>
                    )}
                </div>
            </div>

            {/* ASSIGNMENT FEED */}
            <div className="space-y-4 max-w-4xl mx-auto">
                <div className="flex items-center justify-between border-b border-border-sub pb-2 px-1">
                    <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Tactical Assignment Registry</h3>
                    {!isLocked && (
                        <Button variant="ghost" size="sm" className="h-6 text-[9px] uppercase font-bold text-brand-red hover:bg-brand-red/10" onClick={() => setIsReportMissingOpen(true)}>
                            <Search size={12} className="mr-1.5"/> Report Missing Assignment
                        </Button>
                    )}
                </div>
                <div className="space-y-3">
                    {activeLog.items.map(item => (
                        <JobAuditCard 
                            key={item.id} 
                            item={item} 
                            isLocked={isLocked}
                            onConfirm={handleConfirm}
                            onDispute={handleDispute}
                        />
                    ))}
                    {activeLog.items.length === 0 && (
                        <div className="p-12 text-center text-[10px] font-bold text-text-muted uppercase tracking-widest italic border border-dashed border-border-sub rounded-xl">
                            No assignments registered for this period.
                        </div>
                    )}
                </div>
            </div>

            {!isLocked && (
                <div className="p-4 rounded-xl bg-bg-tertiary/30 border border-border-sub flex items-start gap-3 max-w-4xl mx-auto">
                    <Info size={18} className="text-accent-gold shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide">Audit Directive</p>
                        <p className="text-[10px] text-text-secondary leading-relaxed uppercase font-medium">
                            Every assignment listed in this manifest must be verified for operational accuracy. 
                            Disputed jobs will trigger a manual audit by the Command Center to ensure financial integrity.
                        </p>
                    </div>
                </div>
            )}

            <ReportMissingJobDialog isOpen={isReportMissingOpen} setIsOpen={setIsReportMissingOpen} />
        </div>
    );
}

function ReportMissingJobDialog({ isOpen, setIsOpen }: { isOpen: boolean, setIsOpen: (val: boolean) => void }) {
    const { toast } = useToast();
    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        toast({
            title: "Discrepancy Transmitted",
            description: "Missing assignment details have been sent to the Command Center for manual audit.",
        });
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[600px] bg-bg-elevated border-border-default flex flex-col p-0">
                <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30">
                    <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="text-brand-red h-5 w-5" />
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest">Report Missing Assignment</DialogTitle>
                    </div>
                    <DialogDescription className="text-xs">Provide intelligence for the assignment missing from your registry.</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-text-muted flex items-center gap-1.5"><Hash size={12}/> ID Number</Label>
                            <Input placeholder="e.g. WO-18937" className="bg-bg-primary h-10 text-xs font-mono uppercase" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-text-muted flex items-center gap-1.5"><Building2 size={12}/> Client Entity</Label>
                            <Input placeholder="Client name..." className="bg-bg-primary h-10 text-xs" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-text-muted flex items-center gap-1.5"><Calendar size={12}/> Work Date</Label>
                            <Input type="date" required className="bg-bg-primary h-10 text-xs" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-text-muted flex items-center gap-1.5"><Clock size={12}/> Start Time</Label>
                            <Input placeholder="e.g. 09:00 AM" className="bg-bg-primary h-10 text-xs" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-text-muted flex items-center gap-1.5"><MapPin size={12}/> Site Coordinates / Location</Label>
                        <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                            <Input placeholder="Full address or site identifier..." required className="bg-bg-primary pl-10 h-10 text-xs" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-text-muted">Mission Summary</Label>
                        <Textarea 
                            placeholder="Briefly describe the work performed and why it's missing from your log..." 
                            required
                            className="bg-bg-primary min-h-[100px] text-xs leading-relaxed uppercase font-medium"
                        />
                    </div>
                </form>

                <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default">
                    <Button variant="outline" type="button" onClick={() => setIsOpen(false)} className="px-8 font-bold uppercase text-[10px] tracking-widest">Cancel</Button>
                    <Button type="submit" className="bg-brand-red hover:bg-brand-red-hover px-12 font-bold uppercase text-[10px] tracking-widest">
                        <Send size={16} className="mr-2"/> Submit Inquiry
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function JobAuditCard({ item, isLocked, onConfirm, onDispute }: { item: WeeklyLogItem, isLocked: boolean, onConfirm: (id: string) => void, onDispute: (id: string, reason: string, notes?: string) => void }) {
    const job = workOrders.find(wo => wo.id === item.workOrderId);
    const [isDisputing, setIsDisputing] = useState(false);
    const [reason, setReason] = useState(item.disputeReason || "");
    const [notes, setNotes] = useState(item.disputeNotes || "");

    if (!job) return null;

    const isDisputed = item.confirmationStatus === 'disputed';

    return (
        <Card className={cn(
            "bg-bg-secondary border-border-main overflow-hidden transition-all",
            isDisputed ? "border-brand-red ring-1 ring-brand-red/20" : 
            item.confirmationStatus === 'confirmed' ? "border-green-border" : "hover:border-text-muted"
        )}>
            <CardContent className="p-0">
                <div className="p-5 flex items-center justify-between gap-6">
                    <div className="flex items-center gap-6 flex-1 min-w-0">
                        <div className={cn(
                            "h-12 w-12 rounded-xl border flex items-center justify-center shrink-0",
                            isDisputed ? "bg-brand-red-dim text-text-red border-brand-red/30" : 
                            item.confirmationStatus === 'confirmed' ? "bg-green-dim text-text-green border-green-border/30" : "bg-bg-primary border-border-sub text-text-muted"
                        )}>
                            {isDisputed ? <X size={24}/> : item.confirmationStatus === 'confirmed' ? <Check size={24}/> : <Calendar size={24}/>}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-3">
                                <h4 className="text-sm font-bold text-text-primary uppercase tracking-wide truncate">{job.description}</h4>
                                <Badge variant={job.status} className="h-4 uppercase text-[7px] tracking-widest">{job.status}</Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[10px] text-text-muted font-bold uppercase tracking-widest">
                                <span className="flex items-center gap-1.5"><MapPin size={10} className="text-brand-red"/> {job.location}</span>
                                <span className="flex items-center gap-1.5"><Calendar size={10}/> {job.scheduleDate}</span>
                                <span className="font-mono text-brand-red">ID: {job.id.toUpperCase()}</span>
                            </div>
                        </div>
                    </div>

                    {!isLocked && (
                        <div className="flex items-center gap-2">
                            <Button 
                                variant={item.confirmationStatus === 'confirmed' ? 'default' : 'outline'}
                                size="sm"
                                className={cn(
                                    "h-9 px-4 uppercase text-[10px] tracking-widest",
                                    item.confirmationStatus === 'confirmed' ? "bg-text-green hover:bg-text-green/90" : "border-green-border/40 text-text-green hover:bg-green-dim"
                                )}
                                onClick={() => { onConfirm(item.id); setIsDisputing(false); }}
                            >
                                <Check size={16} className="mr-1.5"/> Confirm
                            </Button>
                            <Button 
                                variant={isDisputed ? 'default' : 'outline'}
                                size="sm"
                                className={cn(
                                    "h-9 px-4 uppercase text-[10px] tracking-widest",
                                    isDisputed ? "bg-brand-red hover:bg-brand-red-hover" : "border-border-alert/40 text-text-red hover:bg-brand-red-dim"
                                )}
                                onClick={() => setIsDisputing(!isDisputing)}
                            >
                                <X size={16} className="mr-1.5"/> Dispute
                            </Button>
                        </div>
                    )}

                    {isLocked && item.confirmationStatus && (
                        <Badge variant={isDisputed ? 'missed' : 'active'} className="h-6 px-4 uppercase tracking-[0.2em] font-black">
                            {item.confirmationStatus}
                        </Badge>
                    )}
                </div>

                {/* DISPUTE TERMINAL (INLINE) */}
                {(isDisputing || (isLocked && isDisputed)) && (
                    <div className="px-5 pb-5 pt-1 animate-in slide-in-from-top-2 duration-300">
                        <div className="p-4 rounded-xl bg-bg-primary/50 border border-border-sub space-y-4">
                            <div className="space-y-3">
                                <p className="text-[9px] font-black text-brand-red uppercase tracking-[0.2em]">Dispute Audit Parameters</p>
                                <RadioGroup 
                                    value={reason} 
                                    onValueChange={(val) => { setReason(val); onDispute(item.id, val, notes); }}
                                    className="grid grid-cols-1 md:grid-cols-2 gap-2"
                                    disabled={isLocked}
                                >
                                    {DISPUTE_REASONS.map((r, idx) => (
                                        <div key={idx} className="flex items-center space-x-2 p-2 rounded hover:bg-bg-tertiary transition-colors cursor-pointer">
                                            <RadioGroupItem value={r} id={`r-${item.id}-${idx}`} className="border-border-sub" />
                                            <Label htmlFor={`r-${item.id}-${idx}`} className="text-[10px] uppercase font-bold text-text-primary cursor-pointer flex-1">{r}</Label>
                                        </div>
                                    ))}
                                </RadioGroup>
                            </div>

                            {!isLocked && (
                                <div className="pt-2 flex justify-end">
                                    <p className={cn(
                                        "text-[9px] font-bold uppercase tracking-widest",
                                        reason ? "text-text-green" : "text-accent-gold"
                                    )}>
                                        {reason ? "Dispute Logic Validated" : "Reason Selection Required"}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
