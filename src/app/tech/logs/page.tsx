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
    Lock,
    Settings,
    Building2,
    ExternalLink,
    Circle,
    Info,
    SearchCheck,
    RotateCcw,
    Undo2,
    MessageSquare,
    AlertCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatCityState } from '@/lib/utils';
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
import { collection, onSnapshot, query, where, doc, updateDoc, addDoc, getDocs } from 'firebase/firestore';
import { generateId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';

const DISPUTE_REASONS = [
    "Another tech did this job",
    "Revisit needed, not complete",
    "I don't recognize this job",
    "Wrong date on my log",
    "This appears to be a duplicate"
];

const getFieldNationLink = (id: string) => {
  const cleanId = id.replace(/^wo-/, '');
  return `https://app.fieldnation.com/workorders/${cleanId}`;
};

export default function TechWeeklyLogPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
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

    // Unsubmit Request State
    const [isUnsubmitDialogOpen, setIsUnsubmitDialogOpen] = useState(false);
    const [unsubmitReason, setUnsubmitReason] = useState("");

    const { toast } = useToast();

    /**
     * Submission Window Validator.
     * Restricts weekly log finalization to Saturday (6) and Sunday (0).
     */
    const isWeekend = useMemo(() => {
        const day = new Date().getDay();
        return day === 0 || day === 6;
    }, []);

    // 1. Terminal Initialization
    useEffect(() => {
        setMounted(true);
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);

        if (userId) {
            const unsubLogs = onSnapshot(query(collection(db, 'weeklyLogs'), where('techId', '==', userId)), (snap) => {
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

    // 2. Active Log Resolution (Reactive)
    const activeLog = useMemo(() => {
        if (!selectedLogId) return null;
        return weeklyLogs.find(l => l.id === selectedLogId) || null;
    }, [weeklyLogs, selectedLogId]);

    // 3. Registry Filtering & Sorting
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
            techId: currentTechId,
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
                ? { 
                    ...item, 
                    confirmationStatus: 'confirmed' as const, 
                    outcomeCode: 'worked_completed' as const, 
                    disputeReason: null, 
                    disputeNotes: null 
                  } 
                : item
        );

        try {
            await updateDoc(doc(db, 'weeklyLogs', activeLog.id), { items: updatedItems });
            toast({ title: "Assignment Verified", description: "Confirmation committed to cloud manifest." });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Handshake Failed", description: e.message });
        }
    };

    const handleDispute = async (itemId: string, reason: string, notes?: string) => {
        if (!activeLog || isLocked) return;
        
        const updatedItems = (activeLog.items || []).map(item => 
            item.id === itemId 
                ? { 
                    ...item, 
                    confirmationStatus: 'disputed' as const, 
                    outcomeCode: 'worked_revisit' as const, 
                    disputeReason: reason, 
                    disputeNotes: notes || null 
                  } 
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

        if (!isWeekend) {
            toast({
                variant: "destructive",
                title: "Submission Restricted",
                description: "Weekly log finalization is restricted to the weekend cycle (Saturday/Sunday) to ensure all mid-week activity is captured.",
            });
            return;
        }
        
        const total = (activeLog.items || []).reduce((acc, i) => acc + (i.jobPay || 0), 0) + 
                      (activeLog.reimbursements || []).reduce((acc, r) => acc + r.amount, 0);

        try {
            await updateDoc(doc(db, 'weeklyLogs', activeLog.id), { 
                status: 'Submitted', 
                submittedAt: new Date().toISOString(),
                totalPayout: total
            });
            toast({
                title: "Log Submitted",
                description: "Weekly assignments manifest has been transmitted for audit.",
            });
            setSelectedLogId(null);
        } catch (e: any) {
            toast({ variant: "destructive", title: "Submission Failed", description: e.message });
        }
    };

    const handleRequestUnsubmit = async () => {
        if (!activeLog || !unsubmitReason.trim()) return;
        try {
            await updateDoc(doc(db, 'weeklyLogs', activeLog.id), {
                unsubmitRequested: true,
                unsubmitReason: unsubmitReason.trim(),
                unsubmitRequestedAt: new Date().toISOString()
            });
            toast({
                title: "Unsubmit Requested",
                description: "Amendment request transmitted for administrative authorization.",
            });
            setIsUnsubmitDialogOpen(false);
            setUnsubmitReason("");
        } catch (e: any) {
            toast({ variant: "destructive", title: "Request Failed", description: e.message });
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
            <div className="space-y-6 text-left">
                <header className="page-header text-left">
                    <div className="text-left">
                        <p className="page-eyebrow flex items-center gap-2"><LayoutList size={12}/> Billing Audit</p>
                        <h1 className="page-title text-left">Weekly Log Registry</h1>
                        <p className="page-subtitle text-[11px] uppercase font-bold text-text-muted tracking-widest mt-1 text-left">Audit terminal for assignment verification and billing.</p>
                    </div>
                    <Button onClick={() => setIsCreateLogOpen(true)} className="bg-brand-red hover:bg-brand-red-hover h-10 px-6 font-bold uppercase tracking-widest text-[10px]">
                        <Plus size={16} className="mr-2" /> Initialize New Log
                    </Button>
                </header>

                <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-bg-secondary border border-border-sub shadow-sm max-w-4xl mx-auto mb-6 text-left">
                    <div className="search-wrap flex-1 !mb-0 w-full md:w-auto text-left">
                        <Search className="h-4 w-4" />
                        <input 
                            placeholder="Filter by week period (MM-DD)..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="search-input !w-full !bg-bg-primary h-10 text-xs font-bold uppercase text-left"
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
                            key={log.id || `log-list-${logIdx}`} 
                            className="bg-bg-secondary border-border-sub hover:border-brand-red transition-all cursor-pointer group"
                            onClick={() => setSelectedLogId(log.id)}
                        >
                            <CardContent className="p-5 flex items-center justify-between">
                                <div className="flex items-center gap-6 text-left">
                                    <div className={cn(
                                        "p-3 rounded-xl border",
                                        log.status === 'Draft' ? "bg-accent-gold-dim border-accent-gold/30 text-accent-gold" : 
                                        log.status === 'Approved' ? "bg-green-dim border-green-border/30 text-text-green" : 
                                        "bg-bg-tertiary border-border-sub text-text-muted"
                                    )}>
                                        <CalendarIcon size={20} />
                                    </div>
                                    <div className="text-left">
                                        <div className="flex items-center gap-3">
                                            <p className="text-sm font-bold uppercase tracking-wide text-text-primary group-hover:text-brand-red transition-colors text-left">Week of {log.weekOf}</p>
                                            {log.unsubmitRequested && (
                                                <Badge variant="destructive" className="h-4 px-1.5 text-[7px] uppercase animate-pulse">Unsubmit Pending</Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 mt-1 text-[10px] text-text-muted font-bold uppercase tracking-widest text-left">
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
                        <div className="py-24 text-center border-2 border-dashed border-border-sub rounded-2xl opacity-40 bg-bg-secondary/30 text-left">
                            <LayoutList size={48} className="mx-auto text-text-muted mb-2" />
                            <p className="text-[10px] font-bold uppercase tracking-widest italic">Registry clear for these filters</p>
                        </div>
                    )}
                </div>

                <Dialog open={isCreateLogOpen} onOpenChange={setIsCreateLogOpen}>
                    <DialogContent className="sm:max-w-[400px] bg-bg-elevated border-border-default shadow-2xl">
                        <DialogHeader className="text-left">
                            <DialogTitle className="uppercase tracking-widest font-bold">Initialize Weekly Log</DialogTitle>
                            <DialogDescription className="text-xs text-left">Pick a date within the target week. Registry will anchor to that Monday.</DialogDescription>
                        </DialogHeader>
                        <div className="py-6 flex justify-center border-y border-border-sub my-4 text-left">
                            <Calendar 
                                mode="single" 
                                selected={newLogDate} 
                                onSelect={setNewLogDate} 
                                initialFocus
                                className="bg-bg-primary rounded-md border border-border-sub"
                            />
                        </div>
                        <DialogFooter className="gap-3 flex-row">
                            <Button variant="outline" onClick={() => setIsCreateLogOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest h-11">Cancel</Button>
                            <Button onClick={handleCreateLog} className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest h-11 text-white">Initialize Manifest</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500 text-left">
            <header className="flex items-center gap-4 mb-4 text-left">
                <Button variant="ghost" size="sm" onClick={() => setSelectedLogId(null)} className="h-8 text-[10px] uppercase font-bold text-text-muted hover:text-text-primary text-left">
                    <ArrowLeft size={14} className="mr-2"/> Back to Registry
                </Button>
                <div className="h-4 w-px bg-border-sub" />
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest text-left">Auditing week of {activeLog.weekOf}</p>
            </header>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-bg-secondary p-6 rounded-2xl border border-border-sub shadow-2xl text-left">
                <div className="flex items-center gap-6 text-left">
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
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-green uppercase tracking-widest text-left">
                                <Check className="text-text-green h-3 w-3"/> {counts.confirmed} Confirmed
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-red uppercase tracking-widest text-left">
                                <X className="text-text-red h-3 w-3"/> {counts.disputed} Disputed
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-accent-gold uppercase tracking-widest text-left">
                                <Clock size={12} className="h-3 w-3"/> {counts.pending} Awaiting Action
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-3 text-right">
                    {activeLog.status === 'Submitted' ? (
                        <div className="flex flex-col items-end gap-3 text-right">
                            {activeLog.unsubmitRequested ? (
                                <div className="flex items-center gap-2 p-2 rounded-lg bg-bg-tertiary border border-border-sub text-accent-gold">
                                    <AlertCircle size={14} className="animate-pulse" />
                                    <p className="text-[9px] font-black uppercase tracking-widest">Unsubmit Pending Approval</p>
                                </div>
                            ) : (
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-9 px-6 text-[10px] font-bold uppercase tracking-widest border-brand-red text-text-red hover:bg-brand-red-dim"
                                    onClick={() => setIsUnsubmitDialogOpen(true)}
                                >
                                    <Undo2 size={14} className="mr-2" /> Request Unsubmit
                                </Button>
                            )}
                            <div className="text-right">
                                <p className="text-[10px] font-black text-text-green uppercase tracking-widest text-right">Registry Transmitted</p>
                                <p className="text-[9px] text-text-muted uppercase font-bold text-right">Logged: {activeLog.submittedAt ? format(parseISO(activeLog.submittedAt), 'MMM d, h:mm a') : 'N/A'}</p>
                            </div>
                        </div>
                    ) : isLocked ? (
                        <div className="flex flex-col items-end text-right">
                            <p className="text-[10px] font-black text-text-green uppercase tracking-widest text-right">Terminal Locked</p>
                            <p className="text-[9px] text-text-muted uppercase font-bold text-right">Finalized: {activeLog.submittedAt ? format(parseISO(activeLog.submittedAt), 'MMM d, h:mm a') : 'N/A'}</p>
                        </div>
                    ) : (
                        <Button 
                            disabled={!canSubmit || !isWeekend} 
                            onClick={handleSubmit}
                            className={cn(
                                "h-12 px-10 font-bold uppercase text-[10px] tracking-[0.2em]",
                                canSubmit && isWeekend ? "bg-brand-red hover:bg-brand-red-hover" : "bg-bg-tertiary text-text-muted border border-border-sub"
                            )}
                        >
                            <Send size={16} className="mr-2"/> 
                            {isWeekend ? "Finalize & Submit Manifest" : "Weekend Submission Only"}
                        </Button>
                    )}
                </div>
            </div>

            {/* UNSET REASONS WARNING */}
            {!isLocked && counts.pending > 0 && (
                <div className="max-w-4xl mx-auto p-4 rounded-xl border border-border-alert bg-brand-red-dim/5 flex items-start gap-4 shadow-sm animate-pulse text-left">
                    <ShieldAlert size={20} className="text-text-red shrink-0 mt-0.5" />
                    <div className="space-y-1 text-left">
                        <p className="text-[11px] font-bold text-text-red uppercase tracking-wide text-left">Registry Verification Required</p>
                        <p className="text-[10px] text-text-muted leading-relaxed uppercase text-left">
                            You must confirm or dispute the remaining <span className="text-text-red font-black">{counts.pending} assignments</span> before the manifest can be transmitted for billing.
                        </p>
                    </div>
                </div>
            )}

            {!isLocked && isWeekend === false && (
                <div className="max-w-4xl mx-auto p-4 rounded-xl border border-border-sub bg-bg-secondary flex items-start gap-4 shadow-sm text-left">
                    <Info size={20} className="text-accent-gold shrink-0 mt-0.5" />
                    <div className="space-y-1 text-left">
                        <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide text-left">Audit manifest Preparation</p>
                        <p className="text-[10px] text-text-muted leading-relaxed uppercase font-medium text-left">
                            You can continue verifying missions and logging expenses throughout the week. Final submission is authorized on <span className="text-brand-red font-bold">Saturday and Sunday</span>.
                        </p>
                    </div>
                </div>
            )}

            <div className="space-y-4 max-w-4xl mx-auto text-left">
                <div className="flex items-center justify-between border-b border-border-sub pb-2 px-1 text-left">
                    <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] text-left">Tactical Assignment Registry</h3>
                    {!isLocked && (
                        <Button variant="ghost" size="sm" className="h-6 text-[9px] uppercase font-bold text-brand-red hover:bg-brand-red/10" onClick={() => setIsReportMissingOpen(true)}>
                            <Search size={12} className="mr-1.5"/> Report Missing Assignment
                        </Button>
                    )}
                </div>
                <div className="space-y-3 text-left">
                    {(activeLog.items || []).map((item, itemIdx) => (
                        <JobAuditCard 
                            key={item.id || item.workOrderId || `item-${itemIdx}`} 
                            item={item} 
                            isLocked={isLocked}
                            workOrders={workOrders}
                            onConfirm={handleConfirm}
                            onDispute={handleDispute}
                        />
                    ))}
                    {(activeLog.items || []).length === 0 && (
                        <div className="py-24 text-center border-2 border-dashed border-border-sub rounded-2xl bg-bg-secondary/30 text-left">
                            <ActivityIcon size={48} className="mx-auto text-text-muted mb-2 opacity-20" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">No assignments synced to this weeklog</p>
                        </div>
                    )}
                </div>
            </div>

            {/* UN-SUBMIT REQUEST DIALOG */}
            <Dialog open={isUnsubmitDialogOpen} onOpenChange={setIsUnsubmitDialogOpen}>
                <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30 text-left">
                        <div className="flex items-center gap-2 mb-1 text-left">
                            <Undo2 className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest">Unsubmit Request Terminal</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs uppercase font-bold text-text-muted text-left">Request authorization to amend a previously submitted weekly manifest.</DialogDescription>
                    </DialogHeader>
                    <div className="p-6 space-y-4 text-left">
                        <div className="p-4 rounded-lg bg-bg-secondary border border-border-sub space-y-2 text-left">
                            <p className="text-[9px] font-black text-brand-red uppercase tracking-widest flex items-center gap-2 text-left">
                                <Info size={12}/> Amendment Policy
                            </p>
                            <p className="text-[10px] text-text-secondary leading-relaxed uppercase font-medium text-left">
                                Unsubmitting a log will pause any active billing audits for this week. You must provide a specific tactical reason for this amendment request.
                            </p>
                        </div>
                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] uppercase font-bold text-text-muted ml-1 flex items-center gap-1.5">
                                <MessageSquare size={12} /> Amendment Justification
                            </Label>
                            <Textarea 
                                placeholder="e.g., Added missing materials reimbursement, need to dispute WO-18927..." 
                                value={unsubmitReason}
                                onChange={e => setUnsubmitReason(e.target.value)}
                                className="bg-bg-primary border-border-sub min-h-[120px] text-xs leading-relaxed uppercase font-medium"
                            />
                        </div>
                    </div>
                    <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default flex gap-3">
                        <Button variant="outline" onClick={() => setIsUnsubmitDialogOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest h-11">Abort</Button>
                        <Button 
                            disabled={!unsubmitReason.trim()}
                            onClick={handleRequestUnsubmit} 
                            className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest h-11 text-white shadow-lg"
                        >
                            <Send size={16} className="mr-2" /> Transmit Request
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
    const [isDisputing, setIsDisputing] = useState(item.confirmationStatus === 'disputed');
    const [reason, setReason] = useState(item.disputeReason || "");
    const [notes, setNotes] = useState(item.disputeNotes || "");

    const isConfirmed = item.confirmationStatus === 'confirmed';
    const isDisputed = item.confirmationStatus === 'disputed';
    const isPending = !item.confirmationStatus;

    if (!job) return null;

    return (
        <Card className={cn(
            "bg-bg-secondary border-border-main overflow-hidden transition-all text-left",
            isDisputed ? "border-brand-red shadow-[0_0_15px_rgba(204,34,0,0.05)]" : 
            isConfirmed ? "border-green-border bg-green-dim/5" : "hover:border-text-muted"
        )}>
            <CardContent className="p-0 text-left">
                <div className="p-4 flex items-center justify-between gap-6 text-left">
                    <div className="flex items-center gap-6 flex-1 min-w-0 text-left">
                        <div className={cn(
                            "h-10 w-10 rounded-xl border flex items-center justify-center shrink-0 shadow-inner",
                            isDisputed ? "bg-brand-red-dim text-text-red border-brand-red/30" : 
                            isConfirmed ? "bg-green-dim text-text-green border-green-border/30" : "bg-bg-tertiary border-border-sub text-text-muted"
                        )}>
                            {isDisputed ? <AlertTriangle size={20}/> : isConfirmed ? <CheckCircle2 size={20}/> : <Clock size={20}/>}
                        </div>
                        <div className="min-w-0 text-left flex-1">
                            <div className="flex items-center gap-3 text-left">
                                <h4 className="text-sm font-bold text-text-primary uppercase tracking-wide truncate max-w-[350px] text-left">{job.title || job.description}</h4>
                                {isConfirmed && <Badge variant="active" className="text-[7px] h-3.5 uppercase tracking-tighter">VERIFIED</Badge>}
                                {isDisputed && <Badge variant="missed" className="text-[7px] h-3.5 uppercase tracking-tighter">DISPUTED</Badge>}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-0.5 text-[10px] text-text-muted font-bold uppercase tracking-widest text-left">
                                <span className="flex items-center gap-1.5 text-left"><MapPin size={10} className="text-brand-red shrink-0"/> {formatCityState(job.location)}</span>
                                <span className="flex items-center gap-1.5 text-left"><CalendarIcon size={10} className="shrink-0"/> {job.scheduleDate}</span>
                                <span className="font-mono text-brand-red font-bold text-left">ID: {job.id.toUpperCase()}</span>
                            </div>
                        </div>

                        <div className="text-right px-4 border-l border-border-sub/30 min-w-[100px]">
                            <p className="text-[8px] font-black text-text-muted uppercase tracking-widest text-right">Settlement</p>
                            <p className="text-sm font-mono font-bold text-text-green text-right">${(item.jobPay || 0).toFixed(2)}</p>
                        </div>
                    </div>

                    {!isLocked && (
                        <div className="flex items-center gap-2">
                            {isPending ? (
                                <>
                                    <Button 
                                        size="sm"
                                        className="h-8 px-4 bg-text-green hover:bg-text-green/90 uppercase text-[9px] font-bold tracking-widest text-white"
                                        onClick={() => onConfirm(item.id)}
                                    >
                                        <Check size={14} className="mr-1.5"/> Confirm
                                    </Button>
                                    <Button 
                                        variant="outline"
                                        size="sm"
                                        className="h-8 px-4 uppercase text-[9px] font-bold tracking-widest border-brand-red text-text-red hover:bg-brand-red-dim"
                                        onClick={() => setIsDisputing(true)}
                                    >
                                        <X size={14} className="mr-1.5"/> Dispute
                                    </Button>
                                </>
                            ) : (
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-8 px-3 text-[9px] font-bold uppercase text-text-muted hover:text-text-primary"
                                    onClick={() => setIsDisputing(!isDisputing)}
                                >
                                    <RotateCcw size={12} className="mr-1.5"/> Adjust Decision
                                </Button>
                            )}
                        </div>
                    )}
                </div>

                {isDisputing && !isLocked && (
                    <div className="px-5 pb-5 pt-1 animate-in slide-in-from-top-2 duration-300 text-left">
                        <div className="p-4 rounded-xl bg-bg-primary/50 border border-border-sub space-y-5 text-left">
                            <div className="flex items-center justify-between">
                                <p className="text-[9px] font-black text-brand-red uppercase tracking-[0.2em] text-left">Dispute Parameters</p>
                                <button onClick={() => setIsDisputing(false)} className="text-text-muted hover:text-text-primary"><X size={14}/></button>
                            </div>
                            
                            <div className="space-y-4 text-left">
                                <RadioGroup 
                                    value={reason} 
                                    onValueChange={setReason}
                                    className="grid grid-cols-1 md:grid-cols-2 gap-2 text-left"
                                >
                                    {DISPUTE_REASONS.map((r, idx) => (
                                        <div key={idx} className="flex items-center space-x-2 p-2 rounded hover:bg-bg-tertiary transition-colors cursor-pointer text-left">
                                            <RadioGroupItem value={r} id={`r-${item.id}-${idx}`} />
                                            <Label htmlFor={`r-${item.id}-${idx}`} className="text-[10px] uppercase font-bold text-text-primary cursor-pointer flex-1 text-left">{r}</Label>
                                        </div>
                                    ))}
                                </RadioGroup>

                                <div className="space-y-2 text-left">
                                    <Label className="text-[9px] uppercase font-black text-text-muted ml-1 text-left">Additional Context (Optional)</Label>
                                    <Textarea 
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        placeholder="Provide specific details for administrative audit..."
                                        className="bg-bg-secondary h-20 text-xs font-medium uppercase leading-relaxed text-left"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="outline" size="sm" className="h-8 text-[9px] uppercase font-bold" onClick={() => setIsDisputing(false)}>Discard</Button>
                                <Button 
                                    size="sm" 
                                    className="h-8 bg-brand-red hover:bg-brand-red-hover text-white uppercase text-[9px] font-bold tracking-widest"
                                    disabled={!reason}
                                    onClick={() => { onDispute(item.id, reason, notes); setIsDisputing(false); }}
                                >
                                    Commit Dispute
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {isDisputed && (isLocked || !isDisputing) && (
                    <div className="px-4 pb-4 animate-in fade-in duration-300 text-left">
                         <div className="p-3 rounded-lg bg-brand-red-dim/10 border border-brand-red/10 text-left">
                            <p className="text-[9px] font-black text-brand-red uppercase mb-1 flex items-center gap-1.5 text-left">
                                <ShieldAlert size={10}/> Reported Discrepancy: {item.disputeReason}
                            </p>
                            {item.disputeNotes && (
                                <p className="text-[10px] text-text-secondary leading-relaxed italic uppercase font-medium text-left">
                                    &quot;{item.disputeNotes}&quot;
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function ReportMissingJobDialog({ isOpen, setIsOpen, onSave }: { isOpen: boolean, setIsOpen: (val: boolean) => void, onSave: (report: MissingAssignmentReport) => void }) {
    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        onSave({
            id: await generateId(ID_PREFIXES.MISSING_REPORT),
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
            <DialogContent className="sm:max-w-[600px] bg-bg-elevated border-border-default shadow-2xl">
                <DialogHeader className="text-left">
                    <div className="flex items-center gap-2 mb-1 text-left">
                        <Search className="text-brand-red h-5 w-5" />
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary text-left">Report Missing Assignment</DialogTitle>
                    </div>
                    <DialogDescription className="text-xs uppercase font-bold text-text-muted text-left">Submit details for a mission that is absent from the weekly registry.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSave} className="space-y-4 py-4 text-left">
                    <div className="grid grid-cols-2 gap-4 text-left">
                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] uppercase font-bold text-text-muted">Assignment ID</Label>
                            <Input name="assignmentId" className="bg-bg-primary h-10 text-xs uppercase font-bold" />
                        </div>
                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] uppercase font-bold text-text-muted">Client Entity</Label>
                            <Input name="clientName" className="bg-bg-primary h-10 text-xs uppercase font-bold" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-left">
                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] uppercase font-bold text-text-muted">Work Date</Label>
                            <Input name="date" type="date" required className="bg-bg-primary h-10 text-xs" />
                        </div>
                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] uppercase font-bold text-text-muted">Location</Label>
                            <Input name="location" required className="bg-bg-primary h-10 text-xs" />
                        </div>
                    </div>
                    <div className="space-y-2 text-left">
                        <Label className="text-[10px] uppercase font-bold text-text-muted">Summary</Label>
                        <Textarea name="summary" required className="bg-bg-primary min-h-[120px] text-xs leading-relaxed uppercase font-medium text-left" placeholder="Document site activity and terminal outcomes..." />
                    </div>
                    <DialogFooter className="pt-4 border-t border-border-sub flex-row gap-3">
                        <Button variant="outline" type="button" onClick={() => setIsOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest">Cancel</Button>
                        <Button type="submit" className="flex-1 bg-brand-red hover:bg-brand-red-hover h-11 uppercase font-bold text-[10px] tracking-widest text-white shadow-lg">
                            <Send size={14} className="mr-2" /> Submit Inquiry
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
