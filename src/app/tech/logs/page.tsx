'use client';

import { useState, useEffect, useMemo } from 'react';
import type { WeeklyLog, WeeklyLogItem, WorkOrder, MissingAssignmentReport, Technician } from '@/lib/types';
import { technicians } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
    Check, 
    X, 
    Calendar as CalendarIcon,
    Send,
    History,
    ChevronDown,
    ShieldAlert,
    LayoutList,
    ChevronRight,
    ArrowLeft,
    Search,
    ArrowUpDown,
    Clock,
    CheckCircle2,
    Plus,
    AlertTriangle,
    MapPin,
    Lock
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { format, parseISO, isSameDay, startOfDay, startOfWeek, isWithinInterval } from 'date-fns';
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, doc, updateDoc, addDoc } from 'firebase/firestore';

const DISPUTE_REASONS = [
    "Another tech did this job",
    "Revisit needed, not complete",
    "I don't recognize this job",
    "Wrong date on my log",
    "This appears to be a duplicate"
];

export default function TechWeeklyLogPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [activeLog, setActiveLog] = useState<WeeklyLog | null>(null);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [mounted, setMounted] = useState(false);
    
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<string>('newest');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [isReportMissingOpen, setIsReportMissingOpen] = useState(false);
    const [isCreateLogOpen, setIsCreateLogOpen] = useState(false);
    const [newLogDate, setNewLogDate] = useState<Date | undefined>(new Date());

    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);

        if (userId) {
            const unsubLogs = onSnapshot(query(collection(db, 'weeklyLogs'), where('technicianId', '==', userId)), (snap) => {
                setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)));
            });
            const unsubWO = onSnapshot(query(collection(db, 'assignments'), where('techId', '==', userId)), (snap) => {
                setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
            });
            return () => {
                unsubLogs(); unsubWO();
            };
        }
    }, []);

    const filteredAndSortedLogs = useMemo(() => {
        let filtered = weeklyLogs;
        
        if (statusFilter !== 'all') {
            filtered = filtered.filter(l => l.status === statusFilter);
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(l => (l.weekOf || '').includes(q));
        }

        if (dateRange?.from) {
            filtered = filtered.filter(log => {
                try {
                    const parts = log.weekOf.split('-');
                    let logDate;
                    if (parts[2]?.length === 4) { 
                        logDate = startOfDay(new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1])));
                    } else { 
                        logDate = startOfDay(parseISO(log.weekOf));
                    }
                    const start = startOfDay(dateRange.from!);
                    const end = dateRange.to ? startOfDay(dateRange.to) : start;
                    return isWithinInterval(logDate, { start, end });
                } catch(e) { return true; }
            });
        }

        return filtered.sort((a, b) => {
            if (sortBy === 'newest') return (b.weekOf || '').localeCompare(a.weekOf || '');
            if (sortBy === 'oldest') return (a.weekOf || '').localeCompare(b.weekOf || '');
            if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '');
            if (sortBy === 'billing') return (b.totalPayout || 0) - (a.totalPayout || 0);
            return 0;
        });
    }, [weeklyLogs, searchQuery, sortBy, statusFilter, dateRange]);

    const handleLogSelection = (log: WeeklyLog) => {
        setActiveLog(log);
    };

    const isLocked = useMemo(() => activeLog?.status !== 'Draft', [activeLog?.status]);

    const handleCreateLog = async () => {
        if (!newLogDate || !currentTechId) return;
        
        const monday = startOfWeek(newLogDate, { weekStartsOn: 1 });
        const weekOf = format(monday, 'MM-dd-yyyy');
        
        if (weeklyLogs.some(l => l.weekOf === weekOf)) {
            toast({ variant: 'destructive', title: 'Registry Error', description: `A log for the week of ${weekOf} already exists.` });
            return;
        }

        const newLog: Omit<WeeklyLog, 'id'> = {
            technicianId: currentTechId,
            weekOf,
            status: 'Draft',
            items: [],
            reimbursements: [],
            totalPayout: 0
        };

        try {
            await addDoc(collection(db, 'weeklyLogs'), newLog);
            toast({ title: "Log Initialized", description: `Weekly manifest for ${weekOf} has been created.` });
            setIsCreateLogOpen(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Write Failed', description: e.message });
        }
    };

    const handleConfirm = async (itemId: string) => {
        if (!activeLog || isLocked) return;
        const updatedItems = (activeLog.items || []).map(item => 
            item.id === itemId 
                ? { ...item, confirmationStatus: 'confirmed' as const, disputeReason: undefined, disputeNotes: undefined } 
                : item
        );
        try {
            await updateDoc(doc(db, 'weeklyLogs', activeLog.id), { items: updatedItems });
            toast({ title: "Assignment Verified", description: "Verification saved to cloud manifest." });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Verification Failed", description: e.message });
        }
    };

    const handleDispute = async (itemId: string, reason: string, notes?: string) => {
        if (!activeLog || isLocked) return;
        const updatedItems = (activeLog.items || []).map(item => 
            item.id === itemId 
                ? { ...item, confirmationStatus: 'disputed' as const, disputeReason: reason, disputeNotes: notes } 
                : item
        );
        try {
            await updateDoc(doc(db, 'weeklyLogs', activeLog.id), { items: updatedItems });
            toast({ title: "Discrepancy Logged", description: "Dispute parameters committed to audit folder." });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Logging Failed", description: e.message });
        }
    };

    const handleReportMissing = async (report: MissingAssignmentReport) => {
        if (!activeLog) return;
        try {
            const updatedReports = [...(activeLog.missingAssignmentReports || []), report];
            await updateDoc(doc(db, 'weeklyLogs', activeLog.id), { missingAssignmentReports: updatedReports });
            toast({ title: "Discrepancy Transmitted", description: "Inquiry folder initialized for audit." });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Report Failed", description: e.message });
        }
    };

    const handleSubmit = async () => {
        if (!activeLog) return;
        try {
            await updateDoc(doc(db, 'weeklyLogs', activeLog.id), { 
                status: 'Submitted', 
                submittedAt: new Date().toISOString() 
            });
            toast({
                title: "Log Submitted",
                description: "Weekly assignments manifest has been transmitted for audit.",
            });
            setActiveLog(null);
        } catch (e: any) {
            toast({ variant: "destructive", title: "Submission Failed", description: e.message });
        }
    };

    const counts = useMemo(() => {
        if (!activeLog) return { total: 0, confirmed: 0, disputed: 0, pending: 0 };
        const items = activeLog.items || [];
        return {
            total: items.length,
            confirmed: items.filter(i => i.confirmationStatus === 'confirmed').length,
            disputed: items.filter(i => i.confirmationStatus === 'disputed').length,
            pending: items.filter(i => !i.confirmationStatus).length
        };
    }, [activeLog]);

    const canSubmit = counts.total > 0 && counts.pending === 0;

    if (!activeLog) {
        return (
            <div className="space-y-6">
                <header className="page-header">
                    <div className="text-left">
                        <p className="page-eyebrow flex items-center gap-2"><LayoutList size={12}/> Billing Audit</p>
                        <h1 className="page-title">Weekly Log Registry</h1>
                        <p className="page-subtitle text-[11px] uppercase font-bold text-text-muted tracking-widest mt-1">Audit terminal for assignment verification and billing.</p>
                    </div>
                    <Button onClick={() => setIsCreateLogOpen(true)} className="bg-brand-red hover:bg-brand-red-hover h-10 px-6 font-bold uppercase tracking-widest text-[10px]">
                        <Plus size={16} className="mr-2" /> Initialize New Log
                    </Button>
                </header>

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
                            <SelectTrigger className="w-[120px] h-10 bg-bg-primary text-[10px] uppercase font-bold tracking-widest border-border-main">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="text-[10px] uppercase font-bold">All Statuses</SelectItem>
                                <SelectItem value="Draft" className="text-[10px] uppercase font-bold">Drafts</SelectItem>
                                <SelectItem value="Submitted" className="text-[10px] uppercase font-bold">Submitted</SelectItem>
                                <SelectItem value="Approved" className="text-[10px] uppercase font-bold">Approved</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                            <SelectTrigger className="w-[140px] h-10 bg-bg-primary text-[10px] uppercase font-bold tracking-widest border-border-main">
                                <SelectValue placeholder="Sort" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="newest" className="text-[10px] uppercase font-bold">Newest First</SelectItem>
                                <SelectItem value="oldest" className="text-[10px] uppercase font-bold">Oldest First</SelectItem>
                                <SelectItem value="status" className="text-[10px] uppercase font-bold">By Status</SelectItem>
                                <SelectItem value="billing" className="text-[10px] uppercase font-bold">By Settlement</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 max-w-4xl mx-auto">
                    {filteredAndSortedLogs.map((log, logIdx) => (
                        <Card 
                            key={`log-${log.id || logIdx}`} 
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
                                        <CalendarIcon size={20} />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm font-bold uppercase tracking-wide text-text-primary group-hover:text-brand-red transition-colors">Week of {log.weekOf}</p>
                                        <div className="flex items-center gap-3 mt-1 text-[10px] text-text-muted font-bold uppercase tracking-widest">
                                            <span>{(log.items || []).length} Assignments</span>
                                            <div className="h-1 w-1 rounded-full bg-text-muted opacity-30" />
                                            <span className="text-text-green font-mono">${(log.totalPayout || 0).toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <Badge variant={log.status === 'Draft' ? 'onhold' : log.status === 'Approved' ? 'active' : 'pending'}>
                                        {(log.status || '').toUpperCase()}
                                    </Badge>
                                    <ChevronRight size={18} className="text-text-muted group-hover:text-text-primary transition-all" />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                    {filteredAndSortedLogs.length === 0 && (
                        <div className="py-24 text-center border-2 border-dashed border-border-main rounded-2xl bg-bg-secondary/30">
                            <History size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                            <p className="text-sm font-bold text-text-muted uppercase tracking-[0.2em] italic text-center">Log terminal clear.</p>
                        </div>
                    )}
                </div>

                <Dialog open={isCreateLogOpen} onOpenChange={setIsCreateLogOpen}>
                    <DialogContent className="sm:max-w-[400px] bg-bg-elevated border-border-default shadow-2xl">
                        <DialogHeader className="text-left">
                            <DialogTitle className="uppercase tracking-widest font-bold">Initialize Weekly Log</DialogTitle>
                            <DialogDescription className="text-xs">Pick a date within the target week. Registry will anchor to that Monday.</DialogDescription>
                        </DialogHeader>
                        <div className="py-6 flex justify-center border-y border-border-sub my-4">
                            <Calendar 
                                mode="single" 
                                selected={newLogDate} 
                                onSelect={setNewLogDate} 
                                initialFocus
                                className="bg-bg-primary rounded-md border border-border-sub"
                            />
                        </div>
                        <DialogFooter className="gap-3">
                            <Button variant="outline" onClick={() => setIsCreateLogOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest h-11">Cancel</Button>
                            <Button onClick={handleCreateLog} className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest h-11 text-white">Initialize Manifest</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <header className="flex items-center gap-4 mb-4">
                <Button variant="ghost" size="sm" onClick={() => setActiveLog(null)} className="h-8 text-[10px] uppercase font-bold text-text-muted hover:text-text-primary">
                    <ArrowLeft size={14} className="mr-2"/> Back to Registry
                </Button>
                <div className="h-4 w-px bg-border-sub" />
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest text-left">Auditing week of {activeLog.weekOf}</p>
            </header>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-bg-secondary p-6 rounded-2xl border border-border-sub shadow-2xl">
                <div className="flex items-center gap-6">
                    <div className={cn(
                        "p-3 rounded-xl border",
                        activeLog.status === 'Draft' ? "bg-accent-gold-dim border-accent-gold/30 text-accent-gold" : "bg-green-dim border-green-border/30 text-text-green"
                    )}>
                        <ShieldAlert size={24} />
                    </div>
                    <div className="text-left">
                        <div className="flex items-center gap-3 text-left">
                            <h2 className="text-xl font-bold uppercase tracking-wider text-text-primary text-left">Operational Audit</h2>
                            <Badge variant={activeLog.status === 'Draft' ? 'onhold' : 'active'} className="h-5 uppercase text-[9px] tracking-widest">
                                {activeLog.status}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-left">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-muted uppercase tracking-widest text-left">
                                <Check className="text-text-green h-3 w-3"/> {counts.confirmed} Confirmed
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-muted uppercase tracking-widest text-left">
                                <X className="text-text-red h-3 w-3"/> {counts.disputed} Disputed
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-accent-gold uppercase tracking-widest text-left">
                                <Clock size={12} className="h-3 w-3"/> {(activeLog.items || []).filter(i => !i.confirmationStatus).length} Awaiting Action
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

            <div className="space-y-4 max-w-4xl mx-auto">
                <div className="flex items-center justify-between border-b border-border-sub pb-2 px-1">
                    <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] text-left">Tactical Assignment Registry</h3>
                    {!isLocked && (
                        <Button variant="ghost" size="sm" className="h-6 text-[9px] uppercase font-bold text-brand-red hover:bg-brand-red/10" onClick={() => setIsReportMissingOpen(true)}>
                            <Search size={12} className="mr-1.5"/> Report Missing Assignment
                        </Button>
                    )}
                </div>
                <div className="space-y-3">
                    {(activeLog.items || []).map((item, itemIdx) => (
                        <JobAuditCard 
                            key={`${item.id}-${item.workOrderId}-${itemIdx}`} 
                            item={item} 
                            isLocked={isLocked}
                            workOrders={workOrders}
                            onConfirm={handleConfirm}
                            onDispute={handleDispute}
                        />
                    ))}
                    {(activeLog.items || []).length === 0 && (
                        <div className="py-24 text-center border-2 border-dashed border-border-sub rounded-2xl bg-bg-secondary/30">
                            <LayoutList size={48} className="mx-auto text-text-muted mb-2 opacity-20" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">No assignments in this week's manifest</p>
                            {!isLocked && <p className="text-[9px] text-text-muted uppercase mt-1">Use the "Report Missing" tool to manually add job references.</p>}
                        </div>
                    )}
                </div>
            </div>

            <ReportMissingJobDialog 
                isOpen={isReportMissingOpen} 
                setIsOpen={setIsReportMissingOpen} 
                onSave={handleReportMissing}
            />
        </div>
    );
}

function JobAuditCard({ item, isLocked, workOrders, onConfirm, onDispute }: { item: WeeklyLogItem, isLocked: boolean, workOrders: WorkOrder[], onConfirm: (id: string) => void, onDispute: (id: string, reason: string, notes?: string) => void }) {
    const job = workOrders.find(wo => wo.id === item.workOrderId);
    const [isDisputing, setIsDisputing] = useState(false);
    const [reason, setReason] = useState(item.disputeReason || "");

    if (!job) {
        return (
            <Card className="bg-bg-secondary border-border-main border-dashed opacity-50 p-4">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 text-left">
                        <AlertTriangle className="text-accent-gold" />
                        <div className="text-left">
                            <p className="text-xs font-bold uppercase text-text-primary">Linked mission data unavailable</p>
                            <p className="text-[10px] text-text-muted uppercase font-mono text-left">Registry ID: {(item.workOrderId || 'N/A').toUpperCase()}</p>
                        </div>
                    </div>
                    {!isLocked && (
                         <Button 
                            variant="outline"
                            size="sm"
                            className="h-9 px-4 uppercase text-[10px] tracking-widest border-brand-red text-text-red hover:bg-brand-red-dim"
                            onClick={() => setIsDisputing(!isDisputing)}
                        >
                            <X size={16} className="mr-1.5"/> Dispute Missing Record
                        </Button>
                    )}
                </div>
                {isDisputing && (
                    <div className="mt-4 pt-4 border-t border-border-sub animate-in slide-in-from-top-2 duration-300">
                        <div className="p-4 rounded-xl bg-bg-primary/50 border border-border-sub space-y-4 text-left">
                            <p className="text-[9px] font-black text-brand-red uppercase tracking-[0.2em]">Dispute Missing Record</p>
                            <RadioGroup 
                                value={reason} 
                                onValueChange={(val) => { setReason(val); onDispute(item.id, val); }}
                                className="grid grid-cols-1 md:grid-cols-2 gap-2"
                                disabled={isLocked}
                            >
                                {DISPUTE_REASONS.map((r, idx) => (
                                    <div key={idx} className="flex items-center space-x-2 p-2 rounded hover:bg-bg-tertiary transition-colors cursor-pointer">
                                        <RadioGroupItem value={r} id={`r-${item.id}-${idx}`} />
                                        <Label htmlFor={`r-${item.id}-${idx}`} className="text-[10px] uppercase font-bold text-text-primary cursor-pointer flex-1 text-left">{r}</Label>
                                    </div>
                                ))}
                            </RadioGroup>
                        </div>
                    </div>
                )}
            </Card>
        );
    }

    const isDisputed = item.confirmationStatus === 'disputed';

    return (
        <Card className={cn(
            "bg-bg-secondary border-border-main overflow-hidden transition-all",
            isDisputed ? "border-brand-red ring-1 ring-brand-red/20" : 
            item.confirmationStatus === 'confirmed' ? "border-green-border" : "hover:border-text-muted"
        )}>
            <CardContent className="p-0">
                <div className="p-5 flex items-center justify-between gap-6">
                    <div className="flex items-center gap-6 flex-1 min-w-0 text-left">
                        <div className={cn(
                            "h-12 w-12 rounded-xl border flex items-center justify-center shrink-0",
                            isDisputed ? "bg-brand-red-dim text-text-red border-brand-red/30" : 
                            item.confirmationStatus === 'confirmed' ? "bg-green-dim text-text-green border-green-border/30" : "bg-bg-primary border-border-sub text-text-muted"
                        )}>
                            {isDisputed ? <X size={24}/> : item.confirmationStatus === 'confirmed' ? <Check size={24}/> : <CalendarIcon size={24}/>}
                        </div>
                        <div className="min-w-0 text-left">
                            <div className="flex items-center gap-3 text-left">
                                <h4 className="text-sm font-bold text-text-primary uppercase tracking-wide truncate">{job.description}</h4>
                                <Badge variant={job.status} className="h-4 uppercase text-[7px] tracking-widest">{job.status}</Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[10px] text-text-muted font-bold uppercase tracking-widest text-left">
                                <span className="flex items-center gap-1.5"><MapPin size={10} className="text-brand-red"/> {job.location}</span>
                                <span className="flex items-center gap-1.5"><CalendarIcon size={10}/> {job.scheduleDate}</span>
                                <span className="font-mono text-brand-red">ID: {job.id.toUpperCase()}</span>
                            </div>
                        </div>
                    </div>

                    {!isLocked && (
                        <div className="flex items-center gap-2">
                            <Button 
                                variant={item.confirmationStatus === 'confirmed' ? 'default' : 'outline'}
                                size="sm"
                                className={cn("h-9 px-4 uppercase text-[10px] tracking-widest", item.confirmationStatus === 'confirmed' ? "bg-text-green hover:bg-text-green/90" : "border-green-border/40 text-text-green hover:bg-green-dim")}
                                onClick={() => { onConfirm(item.id); setIsDisputing(false); }}
                            >
                                <Check size={16} className="mr-1.5"/> Confirm
                            </Button>
                            <Button 
                                variant={isDisputed ? 'default' : 'outline'}
                                size="sm"
                                className={cn("h-9 px-4 uppercase text-[10px] tracking-widest", isDisputed ? "bg-brand-red hover:bg-brand-red-hover" : "border-border-alert/40 text-text-red hover:bg-brand-red-dim")}
                                onClick={() => setIsDisputing(!isDisputing)}
                            >
                                <X size={16} className="mr-1.5"/> Dispute
                            </Button>
                        </div>
                    )}
                </div>

                {(isDisputing || (isLocked && isDisputed)) && (
                    <div className="px-5 pb-5 pt-1 animate-in slide-in-from-top-2 duration-300">
                        <div className="p-4 rounded-xl bg-bg-primary/50 border border-border-sub space-y-4 text-left">
                            <p className="text-[9px] font-black text-brand-red uppercase tracking-[0.2em]">Dispute Reason</p>
                            <RadioGroup 
                                value={reason} 
                                onValueChange={(val) => { setReason(val); onDispute(item.id, val); }}
                                className="grid grid-cols-1 md:grid-cols-2 gap-2"
                                disabled={isLocked}
                            >
                                {DISPUTE_REASONS.map((r, idx) => (
                                    <div key={idx} className="flex items-center space-x-2 p-2 rounded hover:bg-bg-tertiary transition-colors cursor-pointer">
                                        <RadioGroupItem value={r} id={`r-${item.id}-${idx}`} />
                                        <Label htmlFor={`r-${item.id}-${idx}`} className="text-[10px] uppercase font-bold text-text-primary cursor-pointer flex-1 text-left">{r}</Label>
                                    </div>
                                ))}
                            </RadioGroup>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function ReportMissingJobDialog({ isOpen, setIsOpen, onSave }: { isOpen: boolean, setIsOpen: (val: boolean) => void, onSave: (report: MissingAssignmentReport) => void }) {
    const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        onSave({
            id: `mar-${Date.now()}`,
            assignmentId: formData.get('assignmentId') as string,
            clientName: formData.get('clientName') as string,
            date: formData.get('date') as string,
            time: formData.get('time') as string,
            location: formData.get('location') as string,
            summary: formData.get('summary') as string,
        });
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[600px] bg-bg-elevated border-border-default">
                <DialogHeader className="text-left">
                    <DialogTitle className="uppercase tracking-widest font-bold">Report Missing Assignment</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSave} className="space-y-4 py-4 text-left">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 text-left"><Label className="text-[10px] uppercase font-bold text-text-muted">Assignment ID</Label><Input name="assignmentId" className="bg-bg-primary h-10 text-xs" /></div>
                        <div className="space-y-2 text-left"><Label className="text-[10px] uppercase font-bold text-text-muted">Client Entity</Label><Input name="clientName" className="bg-bg-primary h-10 text-xs" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 text-left"><Label className="text-[10px] uppercase font-bold text-text-muted">Work Date</Label><Input name="date" type="date" required className="bg-bg-primary h-10 text-xs" /></div>
                        <div className="space-y-2 text-left"><Label className="text-[10px] uppercase font-bold text-text-muted">Location</Label><Input name="location" required className="bg-bg-primary h-10 text-xs" /></div>
                    </div>
                    <div className="space-y-2 text-left"><Label className="text-[10px] uppercase font-bold text-text-muted">Summary</Label><Textarea name="summary" required className="bg-bg-primary min-h-[100px] text-xs" /></div>
                    <DialogFooter><Button type="submit" className="bg-brand-red hover:bg-brand-red-hover">Submit Inquiry</Button></DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
