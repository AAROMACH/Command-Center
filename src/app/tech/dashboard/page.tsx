'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo } from 'react';
import { db } from "@/lib/firebase";
import { collection, doc, updateDoc, onSnapshot, query, where, getDocs, setDoc, arrayUnion } from 'firebase/firestore';
import { makeWeeklyLogItemId, makeWeeklyLogId } from '@/lib/doc-ids';
import type { WorkOrder, Technician, WeeklyLog, WeeklyLogItem } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Clock,
  Play,
  ClipboardList,
  Receipt,
  LogOut,
  Navigation,
  Check,
  RotateCcw,
  CheckCircle2,
  Building2,
  MapPin,
  Activity,
  Calendar as CalendarIcon,
  Map as MapIcon,
  AlertCircle,
  TrendingUp,
  DollarSign,
  ShieldCheck,
  Briefcase,
} from 'lucide-react';

const MapView = dynamic(() => import('../map/components/map-view'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-bg-secondary">
      <MapIcon size={28} className="text-text-muted animate-pulse" />
    </div>
  ),
});
import { ScheduleBox } from './components/schedule-box';
import { useToast } from '@/hooks/use-toast';
import { WeeklyLogDialog } from './components/weekly-log-dialog';
import { ReceiptUploadDialog } from './components/receipt-upload-dialog';
import { CheckInDialog } from './components/check-in-dialog';
import { LogSelectionDialog } from './components/log-selection-dialog';
import { JobDetailDialog } from '@/components/job-detail-dialog';
import { NotificationBell } from '@/components/notification-bell';
import { TERMINOLOGY } from '@/lib/constants';
import { useRouter } from 'next/navigation';
import { format, startOfWeek, isToday, isTomorrow, parseISO } from 'date-fns';
import { cn, getTacticalLocation } from '@/lib/utils';
import { NotificationService } from '@/lib/notification-service';

export default function TechDashboardPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [tech, setTech] = useState<Technician | null>(null);
    const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>([]);
    const [unsubmittedLogs, setUnsubmittedLogs] = useState<WeeklyLog[]>([]);
    
    const [isLogSelectionOpen, setIsLogSelectionOpen] = useState(false);
    const [selectedLog, setSelectedLog] = useState<WeeklyLog | null>(null);
    const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false);
    const [isCheckInDialogOpen, setIsCheckInDialogOpen] = useState(false);
    const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isMapOpen, setIsMapOpen] = useState(false);
    const [mapSelectedJob, setMapSelectedJob] = useState<WorkOrder | null>(null);
    
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        const userId = sessionStorage.getItem('currentUserId');
        if (!userId) {
            router.push('/login');
            return;
        }
        
        setCurrentTechId(userId);

        const unsubTech = onSnapshot(doc(db, 'users', userId), (d) => {
            if (d.exists()) {
                setTech({ ...d.data(), id: d.id } as Technician);
            }
        }, (err) => {
            console.warn("Personnel registry handshake restricted:", err);
        });

        const unsubAsmt = onSnapshot(query(collection(db, 'assignments'), where('techId', '==', userId)), (snap) => {
            setAllWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });

        const logQ = query(collection(db, 'weeklyLogs'), where('techId', '==', userId), where('status', '==', 'Draft'));
        const unsubLogs = onSnapshot(logQ, (snap) => {
            setUnsubmittedLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)));
        });

        return () => {
            unsubTech();
            unsubAsmt();
            unsubLogs();
        };
    }, [router]);

    /**
     * Intelligent Mission Selector.
     * Prioritizes current sessions (En Route/On Site).
     */
    const activeJob = useMemo(() => {
        const onSite = allWorkOrders.find(wo => wo.status === 'in-progress');
        if (onSite) return onSite;

        const inFlight = allWorkOrders.find(wo => wo.status === 'on-my-way' || wo.status === 'confirmed');
        if (inFlight) return inFlight;

        const upcoming = allWorkOrders
            .filter(wo => wo.status === 'assigned')
            .sort((a, b) => {
                const dateA = a.scheduleDate || '9999-12-31';
                const dateB = b.scheduleDate || '9999-12-31';
                if (dateA !== dateB) return dateA.localeCompare(dateB);
                return (a.scheduleTime || '').localeCompare(b.scheduleTime || '');
            });
            
        return upcoming[0] || null;
    }, [allWorkOrders]);

    /**
     * System-wide Session Monitor.
     * Ensures only one assignment can be "In Progress" at any time.
     */
    const hasActiveSession = useMemo(() => {
        return allWorkOrders.some(wo => wo.status === 'in-progress');
    }, [allWorkOrders]);

    // Jobs for the map popup — today or future, not completed
    const mapJobs = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return allWorkOrders
            .filter(wo => {
                if (wo.status === 'completed') return false;
                if (!wo.scheduleDate) return true;
                const d = new Date(wo.scheduleDate + 'T12:00:00');
                d.setHours(0, 0, 0, 0);
                return d >= today;
            })
            .sort((a, b) => {
                const da = a.scheduleDate ? new Date(a.scheduleDate).getTime() : Infinity;
                const db_ = b.scheduleDate ? new Date(b.scheduleDate).getTime() : Infinity;
                return da - db_;
            });
    }, [allWorkOrders]);

    const mappableJobs = useMemo(() => mapJobs.filter(j => j.lat && j.lng), [mapJobs]);

    const expectedEarnings = useMemo(() => {
        return unsubmittedLogs.reduce((sum, log) => {
            return sum + (log.items || []).reduce((s, item) => s + (item.jobPay || 0), 0);
        }, 0);
    }, [unsubmittedLogs]);

    const weeklyJobCount = useMemo(() => {
        const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
        return allWorkOrders.filter(wo => {
            if (!wo.scheduleDate) return false;
            try {
                const d = new Date(wo.scheduleDate + 'T12:00:00');
                return d >= weekStart;
            } catch { return false; }
        }).length;
    }, [allWorkOrders]);

    function formatMapDate(dateStr: string) {
        if (!dateStr) return 'TBD';
        try {
            const d = new Date(dateStr + 'T12:00:00');
            if (isToday(d)) return 'Today';
            if (isTomorrow(d)) return 'Tomorrow';
            return format(d, 'MMM d');
        } catch { return dateStr; }
    }

    function openDirections(job: WorkOrder) {
        const q = encodeURIComponent(job.location || '');
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${q}`, '_blank', 'noopener');
    }

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
        const itemId = await makeWeeklyLogItemId();
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
            const logId = await makeWeeklyLogId();
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

    const handleStatusTransition = async (woId: string, newStatus: WorkOrder['status']) => {
        const today = format(new Date(), 'MM-dd-yyyy');
        const nowTime = format(new Date(), 'h:mm a');
        const location = await getTacticalLocation();
        
        try {
            const docRef = doc(db, 'assignments', woId);
            const targetWO = allWorkOrders.find(wo => wo.id === woId);
            const historyEntry = { 
                type: 'status_change' as const, 
                date: today, 
                details: `Status update to ${newStatus.toUpperCase()} at ${nowTime}. Location: [${location}].`, 
                user: tech?.name || 'Field Operative' 
            };
            
            if (newStatus === 'in-progress' || newStatus === 'checked-out') {
                await removeFromWeeklyLogs(woId);
            }

            await updateDoc(docRef, { 
                status: newStatus,
                history: [...(targetWO?.history || []), historyEntry]
            });
            
            if (newStatus === 'in-progress' || newStatus === 'completed') {
                // Notify via server-side notification service (admin IDs resolved server-side)
                await NotificationService.notifyAdmins(
                    `Status Alert: ${newStatus.toUpperCase()}`,
                    `Technician ${tech?.name} has transitioned to ${newStatus} for mission ${woId.toUpperCase()} at ${location}.`,
                    { id: woId, type: 'assignment' }
                );
            }

            if (newStatus === 'completed') {
                await removeFromWeeklyLogs(woId);
                await syncToWeeklyLog(woId);
                toast({ title: "Mission Finalized", description: "Mission moved to historical registry and current weekly log." });
            } else {
                toast({ title: "Status Updated", description: `Mission transitioned to ${newStatus.replace(/-/g, ' ')}.` });
            }
        } catch (e: any) {
            toast({ variant: "destructive", title: "Update Failed", description: e.message });
        }
    };

    if (!currentTechId || !tech) {
        return (
            <div className="flex h-screen items-center justify-center bg-bg-primary">
                <div className="text-center space-y-4">
                    <div className="h-8 w-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">Synchronizing Field terminal...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <header className="page-header">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <Activity size={12} />
                        {TERMINOLOGY.PORTAL.TECH}
                    </p>
                    <h1 className="page-title">Field Terminal</h1>
                    <p className="page-subtitle">Welcome back, {tech.name?.split(' ')[0] || 'Operative'}.</p>
                </div>
                <NotificationBell />
            </header>

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="bg-bg-secondary border-border-sub">
                    <CardContent className="p-3 space-y-1">
                        <div className="flex items-center justify-between">
                            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-muted">Jobs This Week</p>
                            <Briefcase size={12} className="text-text-muted" />
                        </div>
                        <p className="text-2xl font-mono font-bold text-text-primary">{weeklyJobCount}</p>
                        <p className="text-[8px] text-text-muted uppercase tracking-widest">{allWorkOrders.length} total assigned</p>
                    </CardContent>
                </Card>
                <Card className="bg-bg-secondary border-border-sub">
                    <CardContent className="p-3 space-y-1">
                        <div className="flex items-center justify-between">
                            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-muted">Expected Pay</p>
                            <DollarSign size={12} className="text-text-green" />
                        </div>
                        <p className="text-2xl font-mono font-bold text-text-green">${expectedEarnings.toFixed(0)}</p>
                        <p className="text-[8px] text-text-muted uppercase tracking-widest">Pending logs</p>
                    </CardContent>
                </Card>
                <Card className="bg-bg-secondary border-border-sub">
                    <CardContent className="p-3 space-y-1">
                        <div className="flex items-center justify-between">
                            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-muted">Reliability</p>
                            <ShieldCheck size={12} className="text-brand-red" />
                        </div>
                        <p className="text-2xl font-mono font-bold text-text-primary">{tech.reliabilityScore ?? 100}</p>
                        <p className="text-[8px] text-text-muted uppercase tracking-widest">/ 100 score</p>
                    </CardContent>
                </Card>
                <Card className="bg-bg-secondary border-border-sub">
                    <CardContent className="p-3 space-y-1">
                        <div className="flex items-center justify-between">
                            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-muted">Logs Pending</p>
                            <TrendingUp size={12} className="text-accent-gold" />
                        </div>
                        <p className="text-2xl font-mono font-bold text-text-primary">{unsubmittedLogs.length}</p>
                        <p className="text-[8px] text-text-muted uppercase tracking-widest">Draft weekly logs</p>
                    </CardContent>
                </Card>
            </div>

            {/* Primary Action Buttons — 2×2 grid, large tap targets for field use */}
            <div className="grid grid-cols-2 gap-3">
                <Button
                    variant="outline"
                    className="h-14 flex-col gap-1.5 bg-bg-secondary border-border-main hover:border-brand-red hover:bg-brand-red-dim/10 transition-all"
                    onClick={() => setIsCheckInDialogOpen(true)}
                    aria-label="Check in to a job"
                >
                    <Play size={18} className="text-brand-red" aria-hidden="true" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">Check In</span>
                </Button>
                <Button
                    variant="outline"
                    className="h-14 flex-col gap-1.5 bg-bg-secondary border-border-main hover:border-blue-500 hover:bg-blue-500/5 transition-all"
                    onClick={() => setIsMapOpen(true)}
                    aria-label="View job map"
                >
                    <MapIcon size={18} className="text-blue-400" aria-hidden="true" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">Job Map</span>
                </Button>
                <Button
                    variant="outline"
                    className="h-14 flex-col gap-1.5 bg-bg-secondary border-border-main hover:border-accent-gold hover:bg-accent-gold-dim/10 transition-all"
                    onClick={() => setIsReceiptDialogOpen(true)}
                    aria-label="Upload a receipt"
                >
                    <Receipt size={18} className="text-accent-gold" aria-hidden="true" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">Receipt</span>
                </Button>
                <Button
                    variant="outline"
                    className="h-14 flex-col gap-1.5 relative bg-bg-secondary border-border-main hover:border-text-green hover:bg-green-dim/10 transition-all"
                    onClick={() => setIsLogSelectionOpen(true)}
                    aria-label={`Submit weekly log${unsubmittedLogs.length > 0 ? ` — ${unsubmittedLogs.length} pending` : ''}`}
                >
                    <ClipboardList size={18} className="text-text-green" aria-hidden="true" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">Submit Log</span>
                    {unsubmittedLogs.length > 0 && (
                        <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[8px] bg-brand-red">
                            {unsubmittedLogs.length}
                        </Badge>
                    )}
                </Button>
            </div>

            {activeJob && (
                <Card className={cn(
                    "border-2 bg-bg-secondary cursor-pointer transition-all overflow-hidden",
                    activeJob.status === 'in-progress' ? "border-text-green shadow-[0_0_15px_rgba(31,138,85,0.1)]" : "border-brand-red bg-brand-red-dim/5"
                )} onClick={() => { setSelectedJob(activeJob); setIsDetailOpen(true); }}>
                    <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="text-left space-y-2 flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-bold text-brand-red uppercase tracking-widest font-mono">{(activeJob.id || '').toUpperCase()}</span>
                                <Badge variant={activeJob.status === 'checked-out' ? 'checked-out' : activeJob.status === 'in-progress' ? 'inprogress' : 'onhold'}>
                                    {activeJob.status.replace(/-/g, ' ').toUpperCase()}
                                </Badge>
                            </div>
                            <h3 className="text-lg font-black uppercase tracking-tight text-text-primary leading-tight truncate">
                                {activeJob.title || activeJob.description}
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest flex items-center gap-1.5 text-left">
                                    <Building2 size={12}/> {activeJob.clientName}
                                </p>
                                <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest flex items-center gap-1.5 truncate max-w-[200px] text-left">
                                    <MapPin size={12} className="text-brand-red"/> {activeJob.location}
                                </p>
                                <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest flex items-center gap-1.5 text-left">
                                    <CalendarIcon size={12} className="text-accent-gold"/> {activeJob.scheduleDate}
                                </p>
                                <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest flex items-center gap-1.5 text-left">
                                    <Clock size={12} className="text-accent-gold"/> {activeJob.scheduleTime}
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex gap-2 shrink-0 self-start md:self-center">
                            {activeJob.status === 'assigned' && (
                                <Button onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'confirmed'); }} className="h-9 px-6 bg-accent-gold text-white text-[10px] font-bold uppercase tracking-widest">
                                    <Check size={14} className="mr-2"/> Confirm
                                </Button>
                            )}
                            {activeJob.status === 'confirmed' && (
                                <Button onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'on-my-way'); }} className="h-9 px-6 bg-brand-red text-white text-[10px] uppercase font-bold tracking-widest">
                                    <Navigation size={14} className="mr-2"/> Start Trip
                                </Button>
                            )}
                            {activeJob.status === 'on-my-way' && (
                                <Button 
                                    disabled={hasActiveSession}
                                    className="h-9 px-6 bg-text-green hover:bg-text-green/90 text-white text-[10px] uppercase font-bold tracking-widest" 
                                    onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'in-progress'); }}
                                >
                                    <Play size={14} className="mr-2 fill-current"/> Check In
                                </Button>
                            )}
                            {activeJob.status === 'in-progress' && (
                                <Button variant="outline" className="h-9 px-6 border-text-red text-text-red hover:bg-brand-red-dim text-[10px] uppercase font-bold tracking-widest" onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'checked-out'); }}>
                                    <LogOut size={14} className="mr-2"/> Check Out
                                </Button>
                            )}
                            {activeJob.status === 'checked-out' && (
                                <div className="flex gap-2">
                                    <Button 
                                        disabled={hasActiveSession}
                                        variant="outline" 
                                        className="h-9 px-4 border-accent-gold text-accent-gold hover:bg-accent-gold-dim text-[10px] uppercase font-bold tracking-widest" 
                                        onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'in-progress'); }}
                                    >
                                        <RotateCcw size={14} className="mr-2"/> Resume
                                    </Button>
                                    <Button 
                                        className="h-9 px-4 bg-text-green hover:bg-text-green/90 text-white text-[10px] uppercase font-bold tracking-widest"
                                        onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'completed'); }}
                                    >
                                        <CheckCircle2 size={14} className="mr-2"/> Finalize
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </Card>
            )}

            {!activeJob && (
                <Card className="border border-border-sub bg-bg-secondary">
                    <CardContent className="py-8 text-center space-y-2">
                        <CheckCircle2 size={28} className="mx-auto text-text-green opacity-20" />
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">No Active Mission</p>
                        <p className="text-[9px] text-text-muted">Stand by — your next assignment will appear here when dispatched.</p>
                    </CardContent>
                </Card>
            )}

            <ScheduleBox workOrders={allWorkOrders} onStatusTransition={handleStatusTransition} />

            <LogSelectionDialog isOpen={isLogSelectionOpen} setIsOpen={setIsLogSelectionOpen} logs={unsubmittedLogs} onSelect={setSelectedLog} />
            <ReceiptUploadDialog isOpen={isReceiptDialogOpen} setIsOpen={setIsReceiptDialogOpen} workOrders={allWorkOrders} projects={[]} />
            <CheckInDialog isOpen={isCheckInDialogOpen} setIsOpen={setIsCheckInDialogOpen} workOrders={allWorkOrders.filter(w => w.status === 'assigned')} projects={[]} />
            <JobDetailDialog isOpen={isDetailOpen} setIsOpen={setIsDetailOpen} mission={selectedJob} />
            {selectedLog && <WeeklyLogDialog isOpen={!!selectedLog} setIsOpen={() => setSelectedLog(null)} log={selectedLog} onSubmitted={() => setSelectedLog(null)} />}

            {/* Map Sheet Popup */}
            <Sheet open={isMapOpen} onOpenChange={setIsMapOpen}>
                <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
                    <SheetHeader className="p-4 border-b border-border-sub shrink-0">
                        <SheetTitle className="text-[11px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                            <MapIcon size={14} className="text-blue-400" />
                            Job Map
                        </SheetTitle>
                        <p className="text-[9px] text-text-muted uppercase font-medium">{mapJobs.length} upcoming assignment{mapJobs.length !== 1 ? 's' : ''}</p>
                    </SheetHeader>

                    {/* Map */}
                    <div className="shrink-0 border-b border-border-sub" style={{ height: '45%' }}>
                        {mappableJobs.length > 0 ? (
                            <MapView jobs={mappableJobs} selectedJob={mapSelectedJob} onSelectJob={setMapSelectedJob} />
                        ) : (
                            <div className="flex items-center justify-center h-full bg-bg-secondary">
                                <div className="text-center space-y-2 px-6">
                                    <MapIcon size={28} className="mx-auto text-text-muted opacity-30" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                                        {mapJobs.length > 0 ? 'No coordinates set for upcoming jobs' : 'No upcoming assignments'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Job List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {mapJobs.length === 0 ? (
                            <div className="py-10 text-center space-y-2">
                                <CalendarIcon size={24} className="mx-auto text-text-muted opacity-20" />
                                <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">No upcoming jobs in registry</p>
                            </div>
                        ) : mapJobs.map((job, index) => {
                            const isSelected = mapSelectedJob?.id === job.id;
                            const statusColor = job.status === 'in-progress' ? 'bg-text-green' : job.status === 'on-my-way' || job.status === 'confirmed' ? 'bg-blue-400' : 'bg-border-main';
                            return (
                                <div
                                    key={job.id}
                                    className={cn(
                                        'flex gap-3 p-3 rounded-lg border cursor-pointer transition-all overflow-hidden relative',
                                        isSelected ? 'border-brand-red bg-brand-red-dim/10' : 'border-border-sub bg-bg-secondary hover:border-border-main'
                                    )}
                                    onClick={() => setMapSelectedJob(isSelected ? null : job)}
                                >
                                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusColor} rounded-l-lg`} />
                                    <span className="flex-shrink-0 h-5 w-5 rounded-full bg-bg-tertiary border border-border-sub flex items-center justify-center text-[9px] font-black text-text-muted mt-0.5 ml-1">
                                        {index + 1}
                                    </span>
                                    <div className="flex-1 min-w-0 space-y-1">
                                        <p className="text-[11px] font-bold uppercase tracking-wide text-text-primary truncate">
                                            {job.title || job.description || `Job ${job.id.slice(0, 6).toUpperCase()}`}
                                        </p>
                                        <div className="flex items-center gap-3 text-[9px] text-text-muted">
                                            <span className="flex items-center gap-1"><MapPin size={9} className="text-brand-red" />{job.location || 'TBD'}</span>
                                            <span className="flex items-center gap-1"><CalendarIcon size={9} />{formatMapDate(job.scheduleDate)}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2 shrink-0">
                                        <Badge variant={job.status === 'in-progress' ? 'inprogress' : job.status === 'completed' ? 'completed' : 'scheduled'} className="h-4 text-[7px]">
                                            {job.status}
                                        </Badge>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 px-2 text-[8px] uppercase font-bold"
                                            onClick={(e) => { e.stopPropagation(); openDirections(job); }}
                                        >
                                            <Navigation size={9} className="mr-1" />
                                            Go
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                        {mappableJobs.length < mapJobs.length && mapJobs.length > 0 && (
                            <div className="flex items-center gap-1.5 text-[9px] text-accent-gold font-bold uppercase px-1">
                                <AlertCircle size={10} />
                                {mapJobs.length - mappableJobs.length} job{mapJobs.length - mappableJobs.length > 1 ? 's' : ''} without map coordinates
                            </div>
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}
