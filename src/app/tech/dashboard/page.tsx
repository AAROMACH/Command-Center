'use client';

import { subscribeTechAssignments } from '@/lib/tech-assignments';
import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo } from 'react';
import { db } from "@/lib/firebase";
import { collection, doc, updateDoc, onSnapshot, query, where, setDoc, arrayUnion } from 'firebase/firestore';
import { isArchivedJob, isAssignedTo, parseLocalDate } from '@/lib/jobs';
import { canAccessPath } from '@/lib/route-permissions';
import type { WorkOrder, Technician, WeeklyLog } from '@/lib/types';
import { computeWeeklyLogSettlement } from '@/lib/payroll';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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

import { ScheduleBox } from './components/schedule-box';
import { PageHeader } from '@/components/page-header';
import { PageLoading, EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { StatCard } from '@/components/stat-card';
import { MyTasksCard } from './components/my-tasks-card';
import { useToast } from '@/hooks/use-toast';
import { WeeklyLogDialog } from './components/weekly-log-dialog';
import { ReceiptUploadDialog } from './components/receipt-upload-dialog';
import { CheckInDialog } from './components/check-in-dialog';
import { LogSelectionDialog } from './components/log-selection-dialog';
import { JobDetailDialog } from '@/components/job-detail-dialog';
import { NotificationBell } from '@/components/notification-bell';
import { PortalSwitchButton } from '@/components/portal-switch-button';
import { TERMINOLOGY } from '@/lib/constants';
import { useRouter } from 'next/navigation';
import { format, startOfWeek, parseISO } from 'date-fns';
import { removeJobFromDraftLogs } from '@/lib/weekly-log';
import { useTechJobActions } from '@/hooks/use-tech-job-actions';
import { ACTION_FOR_STATUS } from '@/lib/tech-job-actions';
import { cn, getTacticalLocation, compareScheduleTime } from '@/lib/utils';
import { canConfirm, canStartTrip, canCheckIn, canCheckOut, canComplete } from '@/lib/trip-flow';
import { NotificationService } from '@/lib/notification-service';
import { useHelperLogSync } from '@/hooks/use-helper-log-sync';
import { techDisplayName } from '@/lib/utils';

export default function TechDashboardPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [tech, setTech] = useState<Technician | null>(null);
    // Files a completed job this tech helped on into their own weekly log —
    // mounted here too (not just tech/logs) so it fires as soon as a helper
    // lands on their dashboard, not only when they specifically open Logs.
    useHelperLogSync(currentTechId);
    const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>([]);
    const [unsubmittedLogs, setUnsubmittedLogs] = useState<WeeklyLog[]>([]);
    // Logs payroll sent back: the tech has to fix and resubmit these.
    const [returnedLogs, setReturnedLogs] = useState<WeeklyLog[]>([]);
    
    const [isLogSelectionOpen, setIsLogSelectionOpen] = useState(false);
    const [selectedLog, setSelectedLog] = useState<WeeklyLog | null>(null);
    const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false);
    const [isCheckInDialogOpen, setIsCheckInDialogOpen] = useState(false);
    const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    
    const { toast } = useToast();
    const { run: runAction, weekDialog } = useTechJobActions(currentTechId, techDisplayName(tech));
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

        // Jobs they lead + jobs they help on (archived never resurface).
        const unsubAsmt = subscribeTechAssignments(userId, setAllWorkOrders);

        const logQ = query(collection(db, 'weeklyLogs'), where('techId', '==', userId), where('status', '==', 'Draft'));
        const unsubReturned = onSnapshot(
            query(collection(db, 'weeklyLogs'), where('techId', '==', userId), where('status', '==', 'Rejected')),
            snap => setReturnedLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog))),
            () => setReturnedLogs([]));
        const unsubLogs = onSnapshot(logQ, (snap) => {
            setUnsubmittedLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)));
        });

        return () => {
            unsubTech();
            unsubAsmt();
            unsubLogs(); unsubReturned();
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
                return compareScheduleTime(a.scheduleTime, b.scheduleTime);
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


    const jobsById = useMemo(() => new Map(allWorkOrders.map(j => [j.id, j])), [allWorkOrders]);
    // Project managers have no pay pages, so no pay tile either.
    const seesPay = !tech || canAccessPath(tech, '/tech/earnings');

    // Live settlement: raw item.jobPay ignores the Field Nation fee/split and
    // overstated FN jobs.
    const expectedEarnings = useMemo(() =>
        unsubmittedLogs.reduce((sum, log) => sum + computeWeeklyLogSettlement(log, jobsById), 0),
    [unsubmittedLogs, jobsById]);

    const weeklyJobCount = useMemo(() => {
        const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
        const weekEnd = weekStart.getTime() + 7 * 86_400_000;
        // parseLocalDate reads both 'yyyy-MM-dd' and 'MM-dd-yyyy' (imported jobs).
        return allWorkOrders.filter(wo => {
            const d = parseLocalDate(wo.scheduleDate);
            return !!d && d.getTime() >= weekStart.getTime() && d.getTime() < weekEnd;
        }).length;
    }, [allWorkOrders]);


    // Same shared workflow as the calendar, assignments list and detail page
    // (lib/tech-job-actions.ts): trip records, history, weekly-log filing,
    // admin alerts. The schedule box routes through here too.
    const handleStatusTransition = async (woId: string, newStatus: WorkOrder['status']) => {
        const targetWO = allWorkOrders.find(wo => wo.id === woId);
        const action = ACTION_FOR_STATUS[newStatus];
        if (!targetWO || !action) return;
        await runAction(targetWO, action);
    };

    if (!currentTechId || !tech) {
        return (
            <PageLoading label="Loading your day…" />
        );
    }

    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow="Tech portal"
                icon={Activity}
                title={`Hi, ${tech.name?.split(' ')[0] || 'there'}`}
                subtitle="Your jobs, schedule and logs for today."
                actions={<div className="flex items-center gap-2"><NotificationBell /><PortalSwitchButton /></div>}
            />

            {/* Stat cards */}
            <div className={cn("grid grid-cols-2 gap-3", seesPay && "md:grid-cols-3")}>
                <StatCard label="Jobs this week" icon={Briefcase} value={weeklyJobCount} sub={`${allWorkOrders.length} assigned in total`} onClick={() => router.push('/tech/assignments')} />
                {seesPay && <StatCard label="Expected pay" icon={DollarSign} tone="done" value={`$${expectedEarnings.toFixed(0)}`} sub="From open logs" onClick={() => router.push('/tech/earnings')} />}
                <StatCard label="Logs to submit" icon={TrendingUp} value={unsubmittedLogs.length} sub="Draft weekly logs" onClick={() => router.push('/tech/logs')} className={seesPay ? 'col-span-2 md:col-span-1' : undefined} />
            </div>

            <MyTasksCard techId={currentTechId} />

            {/* Two-column layout */}
            <div className="flex flex-col lg:flex-row gap-5 items-start">

                {/* Left column — active job + schedule */}
                <div className="w-full flex-1 min-w-0 space-y-4">
                    {activeJob ? (
                        <Card className={cn(
                            "rounded-xl border-2 bg-bg-secondary shadow-sm cursor-pointer transition-all overflow-hidden",
                            activeJob.status === 'in-progress' ? "border-text-green shadow-[0_0_15px_color-mix(in_srgb,var(--text-green)_10%,transparent)]" : "border-brand-red bg-brand-red-dim/5"
                        )} onClick={() => { setSelectedJob(activeJob); setIsDetailOpen(true); }}>
                            <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="text-left space-y-2 flex-1 min-w-0">
                                    <div className="flex items-center gap-3">
                                        <span className="id-text">{(activeJob.id || '').toUpperCase()}</span>
                                        <StatusBadge kind="job" value={activeJob.status} />
                                    </div>
                                    <h2 className="text-[16px] font-semibold text-text-primary leading-snug">
                                        {activeJob.title || activeJob.description}
                                    </h2>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                        <p className="text-[12px] text-text-muted flex items-center gap-1.5 text-left">
                                            <Building2 size={12}/> {activeJob.clientName}
                                        </p>
                                        <p className="text-[12px] text-text-muted flex items-center gap-1.5 truncate max-w-[200px] text-left">
                                            <MapPin size={12} className="text-brand-red"/> {activeJob.location}
                                        </p>
                                        <p className="text-[12px] text-text-muted flex items-center gap-1.5 text-left">
                                            <CalendarIcon size={12} className="text-accent-gold"/> {activeJob.scheduleDate}
                                        </p>
                                        <p className="text-[12px] text-text-muted flex items-center gap-1.5 text-left">
                                            <Clock size={12} className="text-accent-gold"/> {activeJob.scheduleTime}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2 shrink-0 self-stretch md:self-center">
                                    {canConfirm(activeJob) && (
                                        <Button onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'confirmed'); }} className="h-10 px-5 bg-accent-gold text-white flex-1 md:flex-none">
                                            <Check size={14} className="mr-2"/> Confirm
                                        </Button>
                                    )}
                                    {canStartTrip(activeJob) && (
                                        <Button onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'on-my-way'); }} className="h-10 px-5 bg-brand-red text-white flex-1 md:flex-none">
                                            <Navigation size={14} className="mr-2"/> Start trip
                                        </Button>
                                    )}
                                    {canCheckIn(activeJob) && (
                                        <Button disabled={hasActiveSession} className="h-10 px-5 bg-text-green hover:bg-text-green/90 text-white flex-1 md:flex-none" onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'in-progress'); }}>
                                            <Play size={14} className="mr-2 fill-current"/> Check in
                                        </Button>
                                    )}
                                    {canCheckOut(activeJob) && (
                                        <Button variant="outline" className="h-10 px-5 border-text-red text-text-red hover:bg-brand-red-dim flex-1 md:flex-none" onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'checked-out'); }}>
                                            <LogOut size={14} className="mr-2"/> Check out
                                        </Button>
                                    )}
                                    {canComplete(activeJob) && activeJob.status === 'in-progress' && (
                                        <Button className="h-10 px-5 bg-text-green hover:bg-text-green/90 text-white flex-1 md:flex-none" onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'completed'); }}>
                                            <CheckCircle2 size={14} className="mr-2"/> Complete
                                        </Button>
                                    )}
                                    {activeJob.status === 'checked-out' && (
                                        <div className="flex gap-2">
                                            <Button disabled={hasActiveSession} variant="outline" className="h-10 px-4 border-accent-gold text-accent-gold hover:bg-accent-gold-dim flex-1 md:flex-none" onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'in-progress'); }}>
                                                <RotateCcw size={14} className="mr-2"/> Resume
                                            </Button>
                                            <Button className="h-10 px-4 bg-text-green hover:bg-text-green/90 text-white flex-1 md:flex-none" onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'completed'); }}>
                                                <CheckCircle2 size={14} className="mr-2"/> Complete
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Card>
                    ) : (
                        <EmptyState compact icon={CheckCircle2} title="No job in progress" description="Your next job shows up here when it's assigned to you." />
                    )}

                    <ScheduleBox workOrders={allWorkOrders} onStatusTransition={handleStatusTransition} />
                </div>

                {/* Right column — quick actions, reliability, earnings, pending logs */}
                <div className="w-full lg:w-[300px] shrink-0 space-y-4">

                    {/* Quick actions */}
                    <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                            <Button variant="outline" className="h-14 flex-col gap-1.5 relative bg-bg-secondary border-border-main hover:border-text-green hover:bg-green-dim/10 transition-all" onClick={() => setIsLogSelectionOpen(true)}>
                                <ClipboardList size={18} className="text-text-green" />
                                <span className="text-[13px] font-medium">Submit log</span>
                                {unsubmittedLogs.length > 0 && (
                                    <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-brand-red">{unsubmittedLogs.length}</Badge>
                                )}
                            </Button>
                            <Button variant="outline" className="h-14 flex-col gap-1.5 bg-bg-secondary border-border-main hover:border-accent-gold hover:bg-accent-gold-dim/10 transition-all" onClick={() => setIsReceiptDialogOpen(true)}>
                                <Receipt size={18} className="text-accent-gold" />
                                <span className="text-[13px] font-medium">Add receipt</span>
                            </Button>
                        </div>
                        <Button variant="outline" className="w-full h-14 flex-col gap-1.5 bg-bg-secondary border-border-main hover:border-brand-red hover:bg-brand-red-dim/10 transition-all" onClick={() => setIsCheckInDialogOpen(true)}>
                            <Play size={18} className="text-brand-red" />
                            <span className="text-[13px] font-medium">Check in</span>
                        </Button>
                    </div>

                    {/* Returned logs — fix and resubmit */}
                    {returnedLogs.length > 0 && (
                        <div className="space-y-2">
                            <p className="section-label px-1">Sent back by payroll</p>
                            {returnedLogs.map(log => (
                                <Card key={log.id} className="rounded-xl shadow-sm bg-bg-secondary border-brand-red/40 cursor-pointer hover:border-brand-red transition-all" onClick={() => router.push('/tech/logs')}>
                                    <CardContent className="p-3 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-[13px] font-semibold text-text-primary">Week of {log.weekOf}</p>
                                            <p className="text-[12px] text-text-muted">Fix what payroll flagged, then resubmit.</p>
                                        </div>
                                        <span className="shrink-0 text-[12px] font-semibold text-brand-red">Fix →</span>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}

                    {/* Pending logs */}
                    {unsubmittedLogs.length > 0 && (
                        <div className="space-y-2">
                            <p className="section-label px-1">Logs to submit</p>
                            {unsubmittedLogs.map(log => (
                                <Card key={log.id} className="rounded-xl shadow-sm bg-bg-secondary border-accent-gold/30 cursor-pointer hover:border-accent-gold transition-all" onClick={() => { setSelectedLog(log); }}>
                                    <CardContent className="p-3 flex items-center justify-between">
                                        <div>
                                            <p className="text-[13px] font-semibold text-text-primary">Week of {log.weekOf}</p>
                                            <p className="text-[12px] text-text-muted">{(log.items || []).length} {(log.items || []).length === 1 ? 'job' : 'jobs'}</p>
                                        </div>
                                        <span className="text-[12px] font-semibold text-accent-gold">Submit →</span>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <LogSelectionDialog isOpen={isLogSelectionOpen} setIsOpen={setIsLogSelectionOpen} logs={unsubmittedLogs} jobsById={jobsById} onSelect={setSelectedLog} />
            <ReceiptUploadDialog isOpen={isReceiptDialogOpen} setIsOpen={setIsReceiptDialogOpen} workOrders={allWorkOrders} projects={[]} techId={currentTechId || ''} techName={tech?.name || ''} />
            <CheckInDialog isOpen={isCheckInDialogOpen} setIsOpen={setIsCheckInDialogOpen} workOrders={allWorkOrders.filter(w => w.status === 'assigned')} projects={[]} />
            <JobDetailDialog isOpen={isDetailOpen} setIsOpen={setIsDetailOpen} mission={selectedJob} />
            {selectedLog && <WeeklyLogDialog isOpen={!!selectedLog} setIsOpen={() => setSelectedLog(null)} log={selectedLog} onSubmitted={() => setSelectedLog(null)} jobs={allWorkOrders} />}

            {weekDialog}
        </div>
    );
}
