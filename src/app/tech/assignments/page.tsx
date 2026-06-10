'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { WorkOrder, Technician, WeeklyLog, WeeklyLogItem } from '@/lib/types';
import { technicians } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Calendar as CalendarIcon, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  Wrench, 
  ArrowUpDown,
  Search,
  ExternalLink,
  Navigation,
  Play,
  Check,
  LogOut,
  FileCheck,
  RotateCcw,
  X,
  History,
  AlertCircle,
  Lock
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { useSearchParams } from 'next/navigation';
import { format, isSameDay, parseISO, startOfDay, startOfWeek } from 'date-fns';
import { JobDetailDialog } from '@/components/job-detail-dialog';
import { cn, formatCityState, getTacticalLocation } from '@/lib/utils';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, doc, updateDoc, getDocs, setDoc, arrayUnion } from 'firebase/firestore';
import { generateId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';

const formatDateStr = (dateStr: string) => {
    if (!dateStr) return 'TBD';
    try {
        const parts = dateStr.split(/[-/]/);
        if (parts[0].length === 4) {
            return format(parseISO(dateStr), "MM-dd-yyyy");
        } else {
            const [m, d, y] = parts;
            if (y && m && d) {
                return `${m.padStart(2, '0')}-${d.padStart(2, '0')}-${y}`;
            }
        }
        return dateStr;
    } catch (e) {
        return dateStr;
    }
};

export default function TechAssignmentsPage() {
    const searchParams = useSearchParams();
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>([]);
    const [mounted, setMounted] = useState(false);
    const [sortBy, setSortBy] = useState<string>('date');
    const [searchQuery, setSearchQuery] = useState("");
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'active');
    
    const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);

        if (userId) {
            const unsubAsmt = onSnapshot(query(collection(db, 'assignments'), where('techId', '==', userId)), (snap) => {
                setAllWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
            });
            return () => unsubAsmt();
        }
    }, []);

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab) setActiveTab(tab);
    }, [searchParams]);

    const currentTech = useMemo(() => 
        currentTechId ? technicians.find(t => t.id === currentTechId) : null
    , [currentTechId]);

    const techWorkOrders = useMemo(() => {
        if (!currentTechId) return [];
        return allWorkOrders
            .filter(wo => {
                const q = searchQuery.toLowerCase();
                const matchesSearch = (
                    wo.id.toLowerCase().includes(q) ||
                    (wo.title || '').toLowerCase().includes(q) ||
                    (wo.description || '').toLowerCase().includes(q) ||
                    (wo.clientName || '').toLowerCase().includes(q) ||
                    (wo.location || '').toLowerCase().includes(q)
                );

                const matchesDate = !dateRange?.from || (wo.scheduleDate && (() => {
                    try {
                        const parts = (wo.scheduleDate || '').split(/[-/]/);
                        let woDate;
                        if (parts[0] && parts[0].length === 4) {
                            woDate = startOfDay(new Date(wo.scheduleDate + 'T12:00:00'));
                        } else {
                            const [m, d, y] = parts;
                            if (y && m && d) {
                                woDate = startOfDay(new Date(parseInt(y), parseInt(m) - 1, parseInt(d)));
                            } else {
                                return true;
                            }
                        }
                        
                        if (dateRange.from && dateRange.to) {
                            return woDate >= startOfDay(dateRange.from) && woDate <= startOfDay(dateRange.to);
                        }
                        if (dateRange.from) {
                            return isSameDay(woDate, dateRange.from);
                        }
                        return true;
                    } catch (e) { return false; }
                })());

                return matchesSearch && matchesDate;
            });
    }, [allWorkOrders, currentTechId, searchQuery, dateRange]);

    const activeAssignments = useMemo(() => 
        techWorkOrders.filter(wo => wo.status !== 'unassigned' && wo.status !== 'completed'),
    [techWorkOrders]);

    const sortedActive = useMemo(() => {
        return [...activeAssignments].sort((a, b) => {
            if (sortBy === 'priority') {
                const prio = { critical: 0, high: 1, medium: 2, low: 3 };
                return prio[a.priority as keyof typeof prio] - prio[b.priority as keyof typeof prio];
            }
            if (sortBy === 'pay') return b.pay - a.pay;
            return (a.scheduleDate || '').localeCompare(b.scheduleDate || '');
        });
    }, [activeAssignments, sortBy]);

    const completedAssignments = useMemo(() => 
        techWorkOrders.filter(wo => wo.status === 'completed')
            .sort((a, b) => (b.scheduleDate || '').localeCompare(a.scheduleDate || '')),
    [techWorkOrders]);

    const hasActiveSession = useMemo(() => {
        return allWorkOrders.some(wo => wo.status === 'in-progress');
    }, [allWorkOrders]);

    const getFieldNationLink = (id: string) => {
      const cleanId = id.replace(/^wo-/, '');
      return `https://app.fieldnation.com/workorders/${cleanId}`;
    };

    const removeFromWeeklyLogs = async (woId: string) => {
        if (!currentTechId) return;
        const logQuery = query(
            collection(db, 'weeklyLogs'),
            where('techId', '==', currentTechId),
            where('status', '==', 'Draft')
        );
        const snap = await getDocs(logQuery);
        for (const logDoc of snap.docs) {
            const data = logDoc.data() as WeeklyLog;
            const updatedItems = (data.items || []).filter(item => item.workOrderId !== woId);
            if (updatedItems.length !== (data.items || []).length) {
                await updateDoc(doc(db, 'weeklyLogs', logDoc.id), { items: updatedItems });
            }
        }
    };

    const syncToWeeklyLog = async (woId: string) => {
        if (!currentTechId) return;

        const wo = allWorkOrders.find(w => w.id === woId);
        if (!wo) return;

        const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
        const weekOf = format(monday, 'MM-dd-yyyy');
        
        const logQuery = query(
            collection(db, 'weeklyLogs'),
            where('techId', '==', currentTechId),
            where('weekOf', '==', weekOf),
            where('status', '==', 'Draft')
        );

        const snap = await getDocs(logQuery);
        const itemId = await generateId(ID_PREFIXES.WEEKLY_LOG_ITEM);
        const newItem: WeeklyLogItem = {
            id: itemId,
            workOrderId: woId,
            jobPay: wo.pay,
            outcomeCode: null,
            isComplete: true,
            isAdminReviewed: false
        };

        if (!snap.empty) {
            const logDoc = snap.docs[0];
            await updateDoc(doc(db, 'weeklyLogs', logDoc.id), {
                items: arrayUnion(newItem)
            });
        } else {
            const logId = await generateId(ID_PREFIXES.WEEKLY_LOG);
            await setDoc(doc(db, 'weeklyLogs', logId), {
                id: logId,
                techId: currentTechId,
                weekOf,
                status: 'Draft',
                items: [newItem],
                reimbursements: [],
                totalPayout: 0
            });
        }
    };

    const handleConfirm = async (woId: string) => {
        const now = format(new Date(), 'h:mm a');
        const location = await getTacticalLocation();
        const docRef = doc(db, 'assignments', woId);
        updateDoc(docRef, {
            status: 'confirmed',
            isAcknowledged: true,
            history: [
                ...(allWorkOrders.find(wo => wo.id === woId)?.history || []),
                { type: 'status_change', date: format(new Date(), 'MM-dd-yyyy'), details: `Assignment confirmed at ${now}. Location: [${location}].`, user: currentTech?.name || 'Field Operative' }
            ]
        }).catch(e => toast({ variant: "destructive", title: "Update Failed", description: e.message }));
    };

    const handleStartTrip = async (woId: string) => {
        const now = format(new Date(), 'h:mm a');
        const location = await getTacticalLocation();
        const docRef = doc(db, 'assignments', woId);
        updateDoc(docRef, {
            status: 'on-my-way',
            history: [
                ...(allWorkOrders.find(wo => wo.id === woId)?.history || []),
                { type: 'status_change', date: format(new Date(), 'MM-dd-yyyy'), details: `Trip initiated at ${now}. Status: EN ROUTE. Location: [${location}].`, user: currentTech?.name || 'Field Operative' }
            ]
        }).catch(e => toast({ variant: "destructive", title: "Update Failed", description: e.message }));
    };

    const handleCheckIn = async (woId: string) => {
        if (hasActiveSession) return;
        const now = format(new Date(), 'h:mm a');
        const location = await getTacticalLocation();
        const docRef = doc(db, 'assignments', woId);
        updateDoc(docRef, {
            status: 'in-progress',
            history: [
                ...(allWorkOrders.find(wo => wo.id === woId)?.history || []),
                { type: 'note', date: format(new Date(), 'MM-dd-yyyy'), details: `Arrival verified at ${now}. Status: ON SITE. Location: [${location}].`, user: currentTech?.name || 'Field Operative' }
            ]
        }).catch(e => toast({ variant: "destructive", title: "Update Failed", description: e.message }));
    };

    const handleCheckOut = async (woId: string) => {
        const now = format(new Date(), 'h:mm a');
        const location = await getTacticalLocation();
        const docRef = doc(db, 'assignments', woId);
        updateDoc(docRef, {
            status: 'checked-out',
            history: [
                ...(allWorkOrders.find(wo => wo.id === woId)?.history || []),
                { type: 'note', date: format(new Date(), 'MM-dd-yyyy'), details: `Session paused at ${now}. Status: CHECKED OUT. Location: [${location}].`, user: currentTech?.name || 'Field Operative' }
            ]
        }).catch(e => toast({ variant: "destructive", title: "Update Failed", description: e.message }));
    };

    const handleMarkComplete = async (woId: string) => {
        const now = format(new Date(), 'h:mm a');
        const location = await getTacticalLocation();
        const docRef = doc(db, 'assignments', woId);
        
        try {
            await removeFromWeeklyLogs(woId);
            await updateDoc(docRef, {
                status: 'completed',
                history: [
                    ...(allWorkOrders.find(wo => wo.id === woId)?.history || []),
                    { type: 'note', date: format(new Date(), 'MM-dd-yyyy'), details: `Mission finalized at ${now}. Status: CLOSED. Location: [${location}].`, user: currentTech?.name || 'Field Operative' }
                ]
            });
            await syncToWeeklyLog(woId);
            toast({ title: "Mission Finalized", description: "Mission moved to historical registry and current weekly log." });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Update Failed", description: e.message });
        }
    };

    const handleReopen = async (woId: string) => {
        const now = format(new Date(), 'h:mm a');
        const location = await getTacticalLocation();
        const docRef = doc(db, 'assignments', woId);
        
        try {
            await removeFromWeeklyLogs(woId);
            await updateDoc(docRef, {
                status: 'checked-out',
                history: [
                    ...(allWorkOrders.find(wo => wo.id === woId)?.history || []),
                    { type: 'note', date: format(new Date(), 'MM-dd-yyyy'), details: `Mission re-opened at ${now} for correction. Location: [${location}].`, user: currentTech?.name || 'Field Operative' }
                ]
            });
            setActiveTab('active');
            toast({ title: "Mission Re-opened", description: "Assignment moved back to active terminal and removed from weekly log." });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Update Failed", description: e.message });
        }
    };

    const handleOpenDetail = (wo: WorkOrder) => {
        setSelectedJob(wo);
        setIsDetailOpen(true);
    };

    if (!mounted || !currentTechId) {
        return <div className="p-8 text-center text-xs uppercase tracking-widest text-text-muted">Initializing Terminal...</div>;
    }

    return (
        <div className="space-y-6">
            <header className="page-header text-left">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <Wrench size={12} />
                        Service Assignment Console
                    </p>
                    <h1 className="page-title">Assignments</h1>
                    <p className="page-subtitle text-left">Manage tactical assignments and historical performance audit.</p>
                </div>
                <div className="page-header-right items-center">
                    <div className="search-wrap">
                        <Search />
                        <input 
                            className="search-input !w-full md:!w-[250px]" 
                            placeholder="Search assignments..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </header>

            {hasActiveSession && (
                <div className="p-4 rounded-xl border border-border-alert bg-brand-red-dim/5 flex items-start gap-4 shadow-sm animate-pulse text-left mb-6">
                    <AlertCircle size={20} className="text-text-red shrink-0 mt-0.5" />
                    <div className="space-y-1 text-left">
                        <p className="text-[11px] font-bold text-text-red uppercase tracking-wide text-left">Active Session lock</p>
                        <p className="text-[10px] text-text-muted leading-relaxed uppercase font-medium text-left">
                            You are currently checked into a mission. Only one active check-in session is permitted per operative. Check out of your active session to initiate another.
                        </p>
                    </div>
                </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 bg-bg-secondary/50 p-4 rounded-xl border border-border-sub shadow-sm">
                    <TabsList className="tabs !mb-0">
                        <TabsTrigger value="active" className="tab">
                            Active Assignments <span className="tab-count">({activeAssignments.length})</span>
                        </TabsTrigger>
                        <TabsTrigger value="history" className="tab">
                            Assignment History <span className="tab-count">({completedAssignments.length})</span>
                        </TabsTrigger>
                    </TabsList>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <Popover>
                            <PopoverTrigger asChild>
                                <div className={cn(
                                    "flex items-center h-9 rounded-md border border-border-main bg-bg-primary px-3 cursor-pointer hover:bg-bg-tertiary transition-all group relative pr-8",
                                    dateRange?.from && "border-brand-red ring-1 ring-brand-red"
                                )}>
                                    <CalendarIcon size={12} className={cn("mr-2", dateRange?.from ? "text-brand-red" : "text-text-muted")} />
                                    <span className={cn(
                                        "text-[10px] font-bold uppercase tracking-widest whitespace-nowrap",
                                        dateRange?.from ? "text-text-primary" : "text-text-muted"
                                    )}>
                                        {dateRange?.from ? (
                                            dateRange.to ? <>{format(dateRange.from, "MM-dd-yyyy")} – {format(dateRange.to, "MM-dd-yyyy")}</> : format(dateRange.from, "MM-dd-yyyy")
                                        ) : "Filter Window"}
                                    </span>
                                    {dateRange?.from && (
                                        <button 
                                            className="absolute right-2 p-0.5 rounded-full hover:bg-brand-red/20 text-text-muted hover:text-brand-red transition-colors"
                                            onClick={(e) => { e.stopPropagation(); setDateRange(undefined); }}
                                        >
                                            <X size={10} />
                                        </button>
                                    )}
                                </div>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-bg-elevated border-border-main shadow-2xl" align="end">
                                <Calendar initialFocus mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={1} />
                            </PopoverContent>
                        </Popover>

                        <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                            <SelectTrigger className="w-[160px] h-9 bg-bg-primary text-[10px] uppercase font-bold tracking-widest border-border-main">
                                <div className="flex items-center gap-2">
                                    <ArrowUpDown size={14} className="text-text-muted" />
                                    <SelectValue placeholder="Sort Registry" />
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="date" className="text-[10px] uppercase font-bold">By Window</SelectItem>
                                <SelectItem value="priority" className="text-[10px] uppercase font-bold">By Priority</SelectItem>
                                <SelectItem value="pay" className="text-[10px] uppercase font-bold">By Pay</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                
                <TabsContent value="active" className="mt-0">
                    <div className="table-wrap">
                        <table className="tbl">
                            <thead>
                                <tr>
                                    <th className="text-center">Work Order / Status</th>
                                    <th className="text-center">Assignment Identifier</th>
                                    <th className="text-center">Site Location</th>
                                    <th className="text-center">Schedule Window</th>
                                    <th className="text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedActive.map((wo) => (
                                    <tr key={wo.id} className="cursor-pointer group hover:bg-bg-tertiary transition-colors" onClick={() => handleOpenDetail(wo)}>
                                        <td>
                                            <div className="flex flex-col items-center justify-center">
                                              <div className="flex items-center gap-1.5">
                                                <div className="cell-id">{wo.id.toUpperCase()}</div>
                                                {wo.source === 'Imported' && (
                                                  <a href={getFieldNationLink(wo.id)} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-brand-red transition-colors" onClick={(e) => e.stopPropagation()}>
                                                    <ExternalLink size={10} />
                                                  </a>
                                                )}
                                              </div>
                                              <Badge 
                                                variant={
                                                    wo.status === 'in-progress' ? 'inprogress' : 
                                                    wo.status === 'on-my-way' ? 'pending' : 
                                                    wo.status === 'confirmed' ? 'active' :
                                                    wo.status === 'checked-out' ? 'checked-out' :
                                                    'scheduled'
                                                } 
                                                className="capitalize text-[8px] h-4 px-1.5"
                                              >
                                                {wo.status.replace(/-/g, ' ')}
                                              </Badge>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex flex-col items-center justify-center text-center">
                                              <div className="cell-desc-title">{wo.title || wo.description}</div>
                                              <div className="text-[10px] text-text-muted uppercase tracking-widest">{wo.clientName}</div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex items-center justify-center gap-1.5 text-xs text-text-secondary text-center">
                                                <MapPin className="h-3.5 w-3.5 text-text-muted shrink-0" />
                                                <span className="max-w-[150px]">{formatCityState(wo.location)}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="cell-sched">
                                                <div className="cell-sched-date">
                                                    <CalendarIcon size={13}/>
                                                    <span>{formatDateStr(wo.scheduleDate)}</span>
                                                </div>
                                                <div className="cell-sched-time">
                                                    <Clock size={13}/>
                                                    <span>{wo.scheduleTime}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                                              {wo.status === 'assigned' && (
                                                  <Button variant="outline" size="sm" className="h-8 !text-[10px] border-accent-gold text-accent-gold hover:bg-accent-gold-dim" onClick={() => handleConfirm(wo.id)}>
                                                      <Check size={14} className="mr-2"/>
                                                      Confirm
                                                  </Button>
                                              )}
                                              {wo.status === 'confirmed' && (
                                                  <Button variant="outline" size="sm" className="h-8 !text-[10px] border-brand-red text-brand-red hover:bg-brand-red-dim" onClick={() => handleStartTrip(wo.id)}>
                                                      <Navigation size={14} className="mr-2"/>
                                                      Start Trip
                                                  </Button>
                                              )}
                                              {wo.status === 'on-my-way' && (
                                                  <Button 
                                                    disabled={hasActiveSession}
                                                    variant="outline" 
                                                    size="sm" 
                                                    className="h-8 !text-[10px] border-text-green text-text-green hover:bg-green-dim disabled:opacity-50" 
                                                    onClick={() => handleCheckIn(wo.id)}
                                                  >
                                                      <Play size={14} className="mr-2 fill-current"/>
                                                      Check In
                                                  </Button>
                                              )}
                                              {wo.status === 'in-progress' && (
                                                  <Button variant="outline" size="sm" className="h-8 !text-[10px] border-text-red text-text-red hover:bg-brand-red-dim" onClick={() => handleCheckOut(wo.id)}>
                                                      <LogOut size={14} className="mr-2"/>
                                                      Check Out
                                                  </Button>
                                              )}
                                              {wo.status === 'checked-out' && (
                                                  <>
                                                      <Button 
                                                        disabled={hasActiveSession}
                                                        variant="outline" 
                                                        size="sm" 
                                                        className="h-8 !text-[10px] border-accent-gold text-accent-gold hover:bg-accent-gold-dim disabled:opacity-50" 
                                                        onClick={() => handleCheckIn(wo.id)}
                                                      >
                                                          <RotateCcw size={14} className="mr-2"/>
                                                          Check back in
                                                      </Button>
                                                      <Button 
                                                        variant="default" 
                                                        size="sm" 
                                                        className="h-8 !text-[10px] bg-text-green hover:bg-text-green/90"
                                                        onClick={() => handleMarkComplete(wo.id)}
                                                      >
                                                          <CheckCircle2 size={14} className="mr-2"/>
                                                          Mark Complete
                                                      </Button>
                                                  </>
                                              )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {activeAssignments.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="text-center h-24 text-text-muted uppercase text-[10px] tracking-widest italic">No active assignments match your registry filters.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>

                <TabsContent value="history" className="mt-0">
                    <div className="table-wrap">
                        <table className="tbl">
                            <thead>
                                <tr>
                                    <th className="text-center">Work Order</th>
                                    <th className="text-center">Service Result</th>
                                    <th className="text-center">Site Location</th>
                                    <th className="text-center">Date Completed</th>
                                    <th className="text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {completedAssignments.map((wo) => {
                                    return (
                                        <tr key={wo.id} className="cursor-pointer group hover:bg-bg-tertiary transition-colors" onClick={() => handleOpenDetail(wo)}>
                                            <td>
                                                <div className="flex flex-col items-center justify-center">
                                                  <div className="flex items-center gap-1.5">
                                                    <div className="cell-id">{wo.id.toUpperCase()}</div>
                                                    {wo.source === 'Imported' && (
                                                      <a href={getFieldNationLink(wo.id)} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-brand-red transition-colors" onClick={(e) => e.stopPropagation()}>
                                                        <ExternalLink size={10} />
                                                      </a>
                                                    )}
                                                  </div>
                                                  <div className="text-[10px] text-text-muted uppercase tracking-widest">{wo.clientName}</div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex flex-col items-center justify-center text-center">
                                                  <div className="cell-desc-title">{wo.title || wo.description}</div>
                                                  <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-text-green mt-1">
                                                      <CheckCircle2 size={12}/> COMPLETED
                                                  </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center justify-center gap-1.5 text-[10px] text-text-secondary text-center">
                                                    <MapPin className="h-3.5 w-3.5 text-text-muted shrink-0" />
                                                    <span className="max-w-[150px] truncate">{formatCityState(wo.location)}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="text-center">
                                                  <div className="text-xs text-text-secondary">{wo.scheduleDate}</div>
                                                  <div className="mt-1">
                                                    <Badge variant="active" className="uppercase text-[7px] h-3.5 px-1.5">
                                                        <FileCheck size={10} className="mr-1"/>
                                                        Logged
                                                    </Badge>
                                                  </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                                                    <Button variant="outline" size="sm" className="h-8 !text-[10px] border-accent-gold text-accent-gold hover:bg-accent-gold-dim" onClick={() => handleReopen(wo.id)}>
                                                        <RotateCcw size={14} className="mr-2"/>
                                                        Reopen
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {completedAssignments.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="text-center h-24 text-text-muted uppercase text-[10px] tracking-widest italic">History terminal clear. No assignments match your filters.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>
            </Tabs>

            <JobDetailDialog 
                isOpen={isDetailOpen} 
                setIsOpen={setIsDetailOpen} 
                mission={selectedJob} 
            />
        </div>
    );
}
