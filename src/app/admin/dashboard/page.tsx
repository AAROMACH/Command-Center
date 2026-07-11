'use client';

import Link from 'next/link';
import {
  LayoutDashboard,
  MonitorUp,
  Wrench,
  FolderKanban,
  Clock,
  ClipboardList,
  Users,
  MapPin,
  Calendar,
  ChevronRight,
  Undo2,
  AlertCircle,
  Plus,
  MessageSquare,
  Banknote,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { getAvailablePortals } from '@/lib/permissions';
import { useRouter } from 'next/navigation';
import { NotificationBell } from '@/components/notification-bell';
import { TERMINOLOGY } from '@/lib/constants';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, doc } from 'firebase/firestore';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, compareScheduleTime } from '@/lib/utils';
import type { WorkOrder, Technician, Project, WeeklyLog, SiteRequest, ServiceRequest, TimeOffRequest, Invoice } from '@/lib/types';
import { computeSla, slaStatusColor, SLA_DEFAULTS } from '@/lib/sla';
import { isServiceTicketDoc } from '@/lib/request-intake';
import { Timer, AlertTriangle as SlaAlertIcon } from 'lucide-react';
import { format, parseISO, isSameDay, startOfMonth } from 'date-fns';

export default function DashboardPage() {
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [assignments, setAssignments] = useState<WorkOrder[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [siteRequests, setSiteRequests] = useState<SiteRequest[]>([]);
    const [clientRequests, setClientRequests] = useState<ServiceRequest[]>([]);
    const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [isPendingDialogOpen, setIsPendingDialogOpen] = useState(false);
    const slaRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    useEffect(() => {
        const userId = sessionStorage.getItem('currentUserId');

        const unsubUser = userId
            ? onSnapshot(doc(db, 'users', userId), (d) => {
                if (d.exists()) setCurrentUser({ ...d.data(), id: d.id } as Technician);
              })
            : () => {};

        const unsubWO = onSnapshot(
            query(collection(db, 'workOrders'), where('status', 'in', ['unassigned', 'assigned', 'confirmed', 'on-my-way', 'in-progress', 'checked-out'])),
            (snap) => setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)))
        );

        const unsubAsmt = onSnapshot(
            query(collection(db, 'assignments'), where('status', 'in', ['assigned', 'confirmed', 'on-my-way', 'in-progress', 'checked-out'])),
            (snap) => setAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)))
        );

        const unsubTech = onSnapshot(
            query(collection(db, 'users'), where('roles', 'array-contains-any', ['super_admin', 'dispatch_admin', 'payroll_admin', 'project_manager', 'project_lead', 'field_technician'])),
            (snap) => setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician))
            )
        );

        const unsubProj = onSnapshot(
            query(collection(db, 'projects'), where('status', 'in', ['active', 'on-hold'])),
            (snap) => setProjects(snap.docs.map(d => ({ ...d.data(), id: d.id } as Project)))
        );

        const unsubLogs = onSnapshot(
            query(collection(db, 'weeklyLogs'), where('status', 'in', ['Submitted', 'Approved'])),
            (snap) => setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)))
        );

        const unsubSite = onSnapshot(
            query(collection(db, 'siteRequests'), where('status', '==', 'pending')),
            (snap) => setSiteRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as SiteRequest)))
        );

        const unsubClientReq = onSnapshot(
            // Open service tickets: app-created tickets use 'new', public-form
            // tickets 'pending_review'. Intake/partnership docs (also
            // pending_review) are excluded — they are reviewed on /admin/requests.
            query(collection(db, 'clientRequests'), where('status', 'in', ['new', 'pending_review'])),
            (snap) => setClientRequests(
                snap.docs
                    .filter(d => isServiceTicketDoc(d.data()))
                    .map(d => ({ ...d.data(), id: d.id } as ServiceRequest))
            )
        );

        const unsubTOR = onSnapshot(
            query(collection(db, 'timeOffRequests'), where('status', '==', 'pending')),
            (snap) => setTimeOffRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as TimeOffRequest)))
        );

        const unsubInv = onSnapshot(collection(db, 'invoices'), (snap) => {
            setInvoices(snap.docs.map(d => ({ ...d.data(), id: d.id } as Invoice)));
        });

        return () => {
            unsubUser(); unsubWO(); unsubAsmt(); unsubTech(); unsubProj();
            unsubLogs(); unsubSite(); unsubClientReq(); unsubTOR(); unsubInv();
        };
    }, []);

    const unassignedJobs = useMemo(() =>
        workOrders.filter(wo => wo.status === 'unassigned'),
    [workOrders]);

    const pendingLogs = useMemo(() =>
        weeklyLogs.filter(l => l.status === 'Submitted'),
    [weeklyLogs]);

    const pendingPay = useMemo(() =>
        pendingLogs.reduce((acc, l) =>
            acc + (l.totalPayout || l.items?.reduce((s, i) => s + (i.jobPay || 0), 0) || 0), 0),
    [pendingLogs]);

    const workloadData = useMemo(() =>
        technicians
            .map(tech => ({
                id: tech.id,
                name: tech.name,
                avatarUrl: tech.avatarUrl,
                assigned: assignments.filter(wo => (wo.assignedTechnicianId === tech.id || wo.techId === tech.id) && wo.status !== 'completed').length
            }))
            .filter(t => t.assigned > 0)
            .sort((a, b) => b.assigned - a.assigned)
            .slice(0, 5),
    [technicians, assignments]);

    const maxLoad = useMemo(() => Math.max(...workloadData.map(d => d.assigned), 1), [workloadData]);

    const reliabilityData = useMemo(() =>
        technicians
            .filter(t => t.reliabilityScore !== undefined && t.reliabilityScore !== null)
            .sort((a, b) => (b.reliabilityScore || 0) - (a.reliabilityScore || 0))
            .slice(0, 5),
    [technicians]);

    const pendingRequests = useMemo(() => {
        const unsubmits = weeklyLogs.filter(l => l.unsubmitRequested);
        return {
            tickets: clientRequests,
            sites: siteRequests,
            timeOff: timeOffRequests,
            unsubmits,
            total: clientRequests.length + siteRequests.length + timeOffRequests.length + unsubmits.length
        };
    }, [clientRequests, siteRequests, timeOffRequests, weeklyLogs]);

    const slaAlerts = useMemo(() => {
        const active = [...workOrders, ...assignments].filter(wo =>
            wo.status !== 'completed' && (wo.priority === 'critical' || wo.priority === 'high' || wo.priority === 'medium')
        );
        return active
            .map(wo => ({ wo, sla: computeSla(wo) }))
            .filter(({ sla }) => sla.status === 'breached' || sla.status === 'at-risk')
            .sort((a, b) => {
                if (a.sla.status === 'breached' && b.sla.status !== 'breached') return -1;
                if (b.sla.status === 'breached' && a.sla.status !== 'breached') return 1;
                return 0;
            })
            .slice(0, 5);
    }, [workOrders, assignments]);

    const todayJobs = useMemo(() => {
        const today = new Date();
        return [...workOrders, ...assignments].filter(wo => {
            if (!wo.scheduleDate) return false;
            try { return isSameDay(parseISO(wo.scheduleDate), today); } catch { return false; }
        }).sort((a, b) => compareScheduleTime(a.scheduleTime, b.scheduleTime));
    }, [workOrders, assignments]);

    const financialKpis = useMemo(() => {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const mtdRevenue = invoices
            .filter(inv => {
                try { return new Date(inv.issueDate) >= monthStart && inv.status === 'paid'; } catch { return false; }
            })
            .reduce((s, inv) => s + inv.total, 0);
        const outstanding = invoices
            .filter(inv => inv.status !== 'paid' && inv.status !== 'void')
            .reduce((s, inv) => s + inv.total, 0);
        const upcomingPayroll = weeklyLogs
            .filter(l => l.status === 'Submitted')
            .reduce((s, l) => s + (l.totalPayout || 0), 0);
        return { mtdRevenue, outstanding, upcomingPayroll };
    }, [invoices, weeklyLogs]);

    const availablePortals = useMemo(() => getAvailablePortals(currentUser), [currentUser]);
    const techPortal = useMemo(() => availablePortals.find(p => p.id === 'tech'), [availablePortals]);

    const handleSwapPortal = useCallback(() => {
        if (techPortal) router.push(techPortal.path);
    }, [router, techPortal]);

    const getTierStyle = (tier?: string) => {
        switch (tier) {
            case 'Elite': return 'text-text-green bg-text-green/10 border-text-green/20';
            case 'Reliable': return 'text-text-muted bg-bg-tertiary border-border-sub';
            case 'Monitored': return 'text-accent-gold bg-accent-gold/10 border-accent-gold/20';
            default: return 'text-brand-red bg-brand-red/10 border-brand-red/20';
        }
    };

    return (
        <div className="animate-in fade-in duration-500 text-left">
            <header className="page-header">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <LayoutDashboard size={12} />
                        {TERMINOLOGY.PORTAL.ADMIN}
                    </p>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">A real-time overview of global field service operations.</p>
                </div>
                <div className="flex items-center gap-3">
                    <NotificationBell />
                    {availablePortals.length > 1 && techPortal && (
                        <Button variant="outline" size="sm" className="h-8 text-[10px] uppercase font-bold tracking-widest border-border-main" onClick={handleSwapPortal}>
                            <MonitorUp size={12} className="mr-1.5 text-text-muted" />
                            Swap View
                        </Button>
                    )}
                </div>
            </header>

            {/* Financial KPIs — compact top strip */}
            <div className="flex flex-wrap items-center gap-2 mb-4 px-1">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-sub bg-bg-secondary">
                    <Banknote size={11} className="text-text-green shrink-0" />
                    <div>
                        <p className="text-[7px] font-black uppercase tracking-widest text-text-muted">MTD Revenue</p>
                        <p className="text-[12px] font-bold font-mono text-text-green">${financialKpis.mtdRevenue.toLocaleString()}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-sub bg-bg-secondary">
                    <TrendingUp size={11} className="text-accent-gold shrink-0" />
                    <div>
                        <p className="text-[7px] font-black uppercase tracking-widest text-text-muted">Outstanding</p>
                        <p className="text-[12px] font-bold font-mono text-accent-gold">${financialKpis.outstanding.toLocaleString()}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-sub bg-bg-secondary">
                    <Zap size={11} className="text-brand-red shrink-0" />
                    <div>
                        <p className="text-[7px] font-black uppercase tracking-widest text-text-muted">Upcoming Payroll</p>
                        <p className="text-[12px] font-bold font-mono text-text-primary">${financialKpis.upcomingPayroll.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
                <Link href="/admin/dispatch">
                    <Button size="sm" className="h-8 text-[10px] font-black uppercase tracking-widest bg-brand-red hover:bg-brand-red/90 text-white gap-1.5">
                        <Plus size={11} /> New Work Order
                    </Button>
                </Link>
                <Link href="/admin/directory?tab=add">
                    <Button size="sm" variant="outline" className="h-8 text-[10px] font-black uppercase tracking-widest gap-1.5">
                        <Users size={11} /> Add Technician
                    </Button>
                </Link>
                <Link href="/admin/projects?action=new">
                    <Button size="sm" variant="outline" className="h-8 text-[10px] font-black uppercase tracking-widest gap-1.5">
                        <FolderKanban size={11} /> New Project
                    </Button>
                </Link>
                <Link href="/admin/messaging">
                    <Button size="sm" variant="outline" className="h-8 text-[10px] font-black uppercase tracking-widest gap-1.5">
                        <MessageSquare size={11} /> Send Broadcast
                    </Button>
                </Link>
            </div>

            {/* Quick status chips */}
            <div className="flex flex-wrap items-center gap-2 mb-6">
                {slaAlerts.length > 0 && (
                    <button
                        onClick={() => slaRef.current?.scrollIntoView({ behavior: 'smooth' })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-tertiary border border-border-main text-text-muted text-[10px] font-black uppercase tracking-widest hover:text-text-primary transition-colors"
                    >
                        <Timer size={10} />
                        {slaAlerts.length} alert{slaAlerts.length !== 1 ? 's' : ''}
                    </button>
                )}
            </div>

            {/* 5 Stat Boxes */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
                <Link href="/admin/dispatch?subtab=assignments">
                    <div className="bg-bg-secondary p-4 rounded-xl border border-border-default hover:border-border-main transition-colors h-full">
                        <Wrench size={13} className="text-text-muted mb-3" />
                        <p className="text-3xl font-bold text-text-primary tracking-tighter">{assignments.length}</p>
                        <p className="text-[9px] font-black text-text-muted uppercase tracking-widest mt-0.5 mb-2">Active Jobs</p>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest bg-text-green/10 text-text-green border border-text-green/20">ACTIVE</span>
                    </div>
                </Link>
                <Link href="/admin/dispatch">
                    <div className="bg-bg-secondary p-4 rounded-xl border border-border-default hover:border-border-main transition-colors h-full">
                        <AlertCircle size={13} className="text-text-muted mb-3" />
                        <p className="text-3xl font-bold text-text-primary tracking-tighter">{unassignedJobs.length}</p>
                        <p className="text-[9px] font-black text-text-muted uppercase tracking-widest mt-0.5 mb-2">Unassigned</p>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest bg-brand-red/10 text-brand-red border border-brand-red/20">UNASSIGNED</span>
                    </div>
                </Link>
                <Link href="/admin/projects">
                    <div className="bg-bg-secondary p-4 rounded-xl border border-border-default hover:border-border-main transition-colors h-full">
                        <FolderKanban size={13} className="text-text-muted mb-3" />
                        <p className="text-3xl font-bold text-text-primary tracking-tighter">{projects.filter(p => p.status === 'on-hold').length}</p>
                        <p className="text-[9px] font-black text-text-muted uppercase tracking-widest mt-0.5 mb-2">On Hold</p>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest bg-accent-gold/10 text-accent-gold border border-accent-gold/20">ON HOLD</span>
                    </div>
                </Link>
                <Link href="/admin/financials?tab=payroll">
                    <div className="bg-bg-secondary p-4 rounded-xl border border-border-default hover:border-border-main transition-colors h-full">
                        <ClipboardList size={13} className="text-text-muted mb-3" />
                        <p className="text-3xl font-bold text-text-primary tracking-tighter">{pendingLogs.length}</p>
                        <p className="text-[9px] font-black text-text-muted uppercase tracking-widest mt-0.5 mb-2">Pending Logs</p>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest bg-accent-gold/10 text-accent-gold border border-accent-gold/20">AWAITING REVIEW</span>
                    </div>
                </Link>
                <div className="cursor-pointer" onClick={() => setIsPendingDialogOpen(true)}>
                    <div className="bg-bg-secondary p-4 rounded-xl border border-border-default hover:border-border-main transition-colors h-full">
                        <Clock size={13} className="text-text-muted mb-3" />
                        <p className="text-3xl font-bold text-text-primary tracking-tighter">{pendingRequests.total}</p>
                        <p className="text-[9px] font-black text-text-muted uppercase tracking-widest mt-0.5 mb-2">Global Requests</p>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest bg-brand-red/10 text-brand-red border border-brand-red/20">AWAITING ACTION</span>
                    </div>
                </div>
            </div>

            {/* Today's Schedule Strip */}
            {todayJobs.length > 0 && (
                <div className="mb-6">
                    <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-2 flex items-center gap-1.5">
                        <Calendar size={10} className="text-brand-red" />
                        Today's Schedule — {todayJobs.length} job{todayJobs.length !== 1 ? 's' : ''}
                    </p>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                        {todayJobs.map(wo => {
                            const techId = wo.assignedTechnicianId || (wo as any).techId;
                            const tech = technicians.find(t => t.id === techId);
                            const statusDot = wo.status === 'in-progress' ? 'bg-text-green' : wo.status === 'on-my-way' ? 'bg-blue-400' : wo.status === 'completed' ? 'bg-border-main' : 'bg-accent-gold';
                            return (
                                <Link key={wo.id} href={`/admin/assignments/${wo.id}`} className="shrink-0">
                                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border-sub bg-bg-secondary hover:border-border-main transition-colors min-w-[200px] max-w-[220px]">
                                        {tech && (
                                            <Avatar className="h-7 w-7 border border-border-sub shrink-0">
                                                <AvatarImage src={tech.avatarUrl} />
                                                <AvatarFallback className="text-[9px] font-black">{tech.name?.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            {wo.scheduleTime && <p className="text-[8px] font-mono text-text-muted">{wo.scheduleTime}</p>}
                                            <p className="text-[9px] font-black uppercase text-text-primary leading-tight truncate">{wo.title || wo.description || wo.id.slice(0, 8)}</p>
                                            <p className="text-[8px] text-text-muted truncate">{wo.clientName}</p>
                                        </div>
                                        <div className={`h-2 w-2 rounded-full shrink-0 ${statusDot}`} />
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left column — 2/3 */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Unassigned Jobs Table */}
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>Unassigned Jobs — Needs Dispatch</CardTitle>
                            <CardDescription>Work orders awaiting operative allocation.</CardDescription>
                        </CardHeader>
                        <CardContent className="table-wrap !border-none !rounded-none p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-bg-tertiary">
                                        <TableHead className="pl-6">WO#</TableHead>
                                        <TableHead>Client</TableHead>
                                        <TableHead>Location</TableHead>
                                        <TableHead>Job Type</TableHead>
                                        <TableHead>Priority</TableHead>
                                        <TableHead className="text-right pr-6">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {unassignedJobs.slice(0, 8).map(job => (
                                        <TableRow key={job.id} className="hover:bg-bg-tertiary transition-colors">
                                            <TableCell className="text-left pl-6">
                                                <div className="cell-id !mb-0">{(job.shortId || job.id.slice(0, 8)).toUpperCase()}</div>
                                            </TableCell>
                                            <TableCell className="text-left text-xs font-bold uppercase text-text-muted">{job.clientName}</TableCell>
                                            <TableCell className="text-left text-[10px] font-bold uppercase text-text-secondary">{job.location.split(',')[0]}</TableCell>
                                            <TableCell className="text-left text-[10px] font-bold uppercase text-text-muted">{job.jobType || job.projectType}</TableCell>
                                            <TableCell>
                                                <Badge variant={job.priority === 'critical' || job.priority === 'high' ? 'high' : 'medium'}>{job.priority}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <Button
                                                    size="sm"
                                                    className="h-7 text-[9px] bg-brand-red hover:bg-brand-red/90 text-white uppercase font-black tracking-widest px-3"
                                                    onClick={() => router.push('/admin/dispatch?tab=dispatch')}
                                                >
                                                    ASSIGN TECH
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {unassignedJobs.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center h-32 text-xs font-bold uppercase text-text-muted italic opacity-40">
                                                All jobs dispatched — queue clear.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                        {unassignedJobs.length > 8 && (
                            <CardFooter className="pt-0 border-t border-border-sub bg-bg-tertiary/20 p-4">
                                <Button variant="ghost" className="w-full text-[10px] uppercase font-bold tracking-widest h-8" onClick={() => router.push('/admin/dispatch')}>
                                    View All {unassignedJobs.length} Unassigned Jobs <ChevronRight size={12} className="ml-2" />
                                </Button>
                            </CardFooter>
                        )}
                    </Card>

                    {/* Service Requests — SLA Clock */}
                    <div ref={slaRef}>
                        <Card>
                            <CardHeader className="text-left">
                                <CardTitle>Service Requests — SLA Clock Running</CardTitle>
                                <CardDescription>Active intake tickets with elapsed response time.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {clientRequests.slice(0, 6).map(req => {
                                    const submitted = req.submittedDate ? new Date(req.submittedDate) : null;
                                    const elapsedHours = submitted ? (Date.now() - submitted.getTime()) / 3600000 : 0;
                                    const target = SLA_DEFAULTS[req.priority]?.resolutionHours ?? 24;
                                    const remaining = target - elapsedHours;
                                    const isBreached = remaining < 0;
                                    const isAtRisk = !isBreached && remaining < target * 0.2;
                                    return (
                                        <div
                                            key={req.id}
                                            className="flex items-center gap-4 p-3 rounded-lg border border-border-sub bg-bg-secondary hover:border-border-main transition-colors cursor-pointer"
                                            onClick={() => router.push('/admin/dispatch?tab=requests')}
                                        >
                                            <Timer size={12} className={isBreached ? 'text-brand-red shrink-0' : isAtRisk ? 'text-accent-gold shrink-0' : 'text-text-muted shrink-0'} />
                                            <div className="flex-1 min-w-0 text-left">
                                                <p className="text-[10px] font-black uppercase text-text-primary leading-tight">{req.clientName}</p>
                                                <p className="text-[9px] text-text-muted uppercase tracking-wide truncate">{req.requestType}</p>
                                            </div>
                                            <Badge variant={req.priority === 'critical' || req.priority === 'high' ? 'high' : 'medium'} className="shrink-0">{req.priority}</Badge>
                                            <div className={cn('text-[10px] font-black font-mono shrink-0 min-w-[48px] text-right', isBreached ? 'text-brand-red' : isAtRisk ? 'text-accent-gold' : 'text-text-muted')}>
                                                {isBreached
                                                    ? `${Math.round(Math.abs(remaining))}h over`
                                                    : remaining < 1
                                                        ? `${Math.round(remaining * 60)}m`
                                                        : `${remaining.toFixed(1)}h`}
                                            </div>
                                        </div>
                                    );
                                })}
                                {clientRequests.length === 0 && (
                                    <div className="py-10 text-center border border-dashed border-border-sub rounded-lg opacity-40">
                                        <Timer size={20} className="mx-auto mb-2 text-text-muted" />
                                        <p className="text-[10px] font-bold uppercase text-text-muted">No active service requests</p>
                                    </div>
                                )}

                                {slaAlerts.length > 0 && (
                                    <div className="pt-3 mt-1 border-t border-border-sub space-y-1.5">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-brand-red flex items-center gap-1 mb-2">
                                            <SlaAlertIcon size={9} /> SLA Breaches / At Risk — {slaAlerts.length}
                                        </p>
                                        {slaAlerts.map(({ wo, sla }) => (
                                            <Link key={wo.id} href="/admin/dispatch" className="flex items-center gap-3 p-2 rounded bg-brand-red/5 border border-brand-red/20 hover:border-brand-red/40 transition-colors">
                                                <Timer size={10} className={slaStatusColor(sla.status)} />
                                                <span className="text-[9px] font-bold uppercase text-text-primary font-mono">{wo.shortId || wo.id.slice(0, 8).toUpperCase()}</span>
                                                <span className="text-[9px] text-text-muted uppercase flex-1 truncate">{wo.clientName}</span>
                                                <span className={cn('text-[9px] font-black uppercase', slaStatusColor(sla.status))}>
                                                    {sla.status === 'breached' ? 'BREACHED' : 'AT RISK'}
                                                </span>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Right column — 1/3 */}
                <div className="space-y-5">
                    {/* Tech Workload */}
                    <Card>
                        <CardHeader className="pb-3 text-left">
                            <CardTitle>Tech Workload</CardTitle>
                            <CardDescription>Active assignment density per operative.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {workloadData.length > 0 ? workloadData.map(item => (
                                <div key={item.id}>
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <Avatar className="h-5 w-5 shrink-0">
                                            <AvatarImage src={item.avatarUrl} />
                                            <AvatarFallback className="text-[7px]">{(item.name || 'U').charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <span className="text-[10px] font-black uppercase text-text-primary flex-1 truncate">{item.name}</span>
                                        <span className="text-[10px] font-mono font-bold text-text-muted shrink-0">{item.assigned}</span>
                                    </div>
                                    <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden ml-7">
                                        <div
                                            className="h-full bg-brand-red rounded-full transition-all duration-500"
                                            style={{ width: `${Math.round((item.assigned / maxLoad) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            )) : (
                                <div className="py-6 text-center opacity-40">
                                    <p className="text-[10px] font-bold uppercase text-text-muted">No active assignments</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Reliability Scores */}
                    <Card>
                        <CardHeader className="pb-3 text-left">
                            <CardTitle>Reliability Scores</CardTitle>
                            <CardDescription>Field operative performance index.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-1">
                            {reliabilityData.length > 0 ? reliabilityData.map(tech => (
                                <div key={tech.id} className="flex items-center gap-2 py-2 border-b border-border-sub last:border-0">
                                    <Avatar className="h-6 w-6 shrink-0">
                                        <AvatarImage src={tech.avatarUrl} />
                                        <AvatarFallback className="text-[8px]">{(tech.name || 'U').charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <span className="text-[10px] font-bold uppercase text-text-primary flex-1 truncate">{tech.name}</span>
                                    <span className="text-[10px] font-mono font-bold text-text-primary shrink-0">{tech.reliabilityScore ?? '--'}</span>
                                    <span className={cn('text-[7px] font-black uppercase px-1.5 py-0.5 rounded border shrink-0', getTierStyle(tech.reliabilityTier))}>
                                        {(tech.reliabilityTier || 'Reliable').toUpperCase()}
                                    </span>
                                </div>
                            )) : (
                                <div className="py-6 text-center opacity-40">
                                    <p className="text-[10px] font-bold uppercase text-text-muted">No operative data</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* This Week */}
                    <Card>
                        <CardHeader className="pb-3 text-left">
                            <CardTitle>Operations Snapshot</CardTitle>
                            <CardDescription>Current financial & project status.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-0">
                            {[
                                { label: 'Pending Pay', value: `$${pendingPay.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
                                { label: 'Active Jobs', value: assignments.length },
                                { label: 'Pending Invoices', value: invoices.filter(inv => inv.status === 'sent' || inv.status === 'overdue').length },
                                { label: 'Open Projects', value: projects.filter(p => p.status === 'active').length },
                            ].map(({ label, value }) => (
                                <div key={label} className="flex items-center justify-between py-2.5 border-b border-border-sub last:border-0">
                                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-wide">{label}</span>
                                    <span className="text-[10px] font-mono font-black text-text-primary">{value}</span>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* GLOBAL REQUESTS AUDIT TERMINAL */}
            <Dialog open={isPendingDialogOpen} onOpenChange={setIsPendingDialogOpen}>
                <DialogContent className="sm:max-w-[800px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[90vh] shadow-2xl">
                    <DialogHeader className="p-6 border-b border-border-sub bg-bg-tertiary/30 text-left">
                        <div className="flex items-center gap-3">
                            <Clock className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Global Requests</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs uppercase font-bold text-text-muted">Consolidated audit terminal for unverified field signals and intake data.</DialogDescription>
                    </DialogHeader>

                    <Tabs defaultValue="tickets" className="flex-1 overflow-hidden flex flex-col">
                        <div className="px-6 border-b border-border-sub bg-bg-secondary/30">
                            <TabsList className="h-12 bg-transparent p-0 gap-8 justify-start">
                                <TabsTrigger value="tickets" className="tab-trigger-dashboard flex items-center gap-2">
                                    <ClipboardList size={14} /> Service Tickets <Badge variant="outline" className="h-4 px-1.5 text-[8px]">{pendingRequests.tickets.length}</Badge>
                                </TabsTrigger>
                                <TabsTrigger value="timeoff" className="tab-trigger-dashboard flex items-center gap-2">
                                    <Users size={14} /> Personnel Logs <Badge variant="outline" className="h-4 px-1.5 text-[8px]">{pendingRequests.timeOff.length}</Badge>
                                </TabsTrigger>
                                <TabsTrigger value="unsubmits" className="tab-trigger-dashboard flex items-center gap-2">
                                    <Undo2 size={14} /> Amendments <Badge variant="outline" className="h-4 px-1.5 text-[8px]">{pendingRequests.unsubmits.length}</Badge>
                                </TabsTrigger>
                                <TabsTrigger value="sites" className="tab-trigger-dashboard flex items-center gap-2">
                                    <MapPin size={14} /> Site Registry <Badge variant="outline" className="h-4 px-1.5 text-[8px]">{pendingRequests.sites.length}</Badge>
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <ScrollArea className="flex-1">
                            <div className="p-6">
                                <TabsContent value="tickets" className="m-0 space-y-3">
                                    {pendingRequests.tickets.map(req => (
                                        <div key={req.id} className="p-4 rounded-xl border border-border-sub bg-bg-secondary flex items-center justify-between group hover:border-text-muted transition-all">
                                            <div className="text-left space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-mono font-bold text-brand-red uppercase">{req.id}</span>
                                                    <Badge variant={req.priority === 'critical' || req.priority === 'high' ? 'high' : 'medium'} className="text-[7px] h-3.5 px-1 uppercase">{req.priority}</Badge>
                                                </div>
                                                <p className="text-xs font-bold text-text-primary uppercase truncate max-w-[400px]">{req.clientName} — {req.requestType}</p>
                                                <p className="text-[10px] text-text-muted font-medium uppercase tracking-widest">{req.location.split(',')[0]}</p>
                                            </div>
                                            <Button size="sm" variant="ghost" className="h-8 text-[9px] font-bold uppercase tracking-widest" onClick={() => { setIsPendingDialogOpen(false); router.push('/admin/dispatch?tab=requests'); }}>Audit detail</Button>
                                        </div>
                                    ))}
                                    {pendingRequests.tickets.length === 0 && <EmptyState icon={ClipboardList} label="Service funnel clear" />}
                                </TabsContent>

                                <TabsContent value="timeoff" className="m-0 space-y-3">
                                    {pendingRequests.timeOff.map(req => {
                                        const tech = technicians.find(t => t.id === req.techId);
                                        return (
                                            <div key={req.id} className="p-4 rounded-xl border border-border-sub bg-bg-secondary flex items-center justify-between">
                                                <div className="flex items-center gap-4 text-left">
                                                    <Avatar className="h-10 w-10 border border-border-sub">
                                                        <AvatarImage src={tech?.avatarUrl} />
                                                        <AvatarFallback>{(tech?.name || 'U').charAt(0)}</AvatarFallback>
                                                    </Avatar>
                                                    <div className="text-left">
                                                        <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{tech?.name}</p>
                                                        <p className="text-[9px] text-text-muted font-bold uppercase tracking-widest">{req.type} Request</p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <Calendar className="h-3 w-3 text-brand-red" />
                                                            <span className="text-[10px] font-mono font-bold">{req.startDate} — {req.endDate}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <Button size="sm" variant="ghost" className="h-8 text-[9px] font-bold uppercase tracking-widest" onClick={() => { setIsPendingDialogOpen(false); router.push('/admin/directory?tab=requests&subtab=personnel'); }}>Review Log</Button>
                                            </div>
                                        );
                                    })}
                                    {pendingRequests.timeOff.length === 0 && <EmptyState icon={Users} label="Personnel registry nominal" />}
                                </TabsContent>

                                <TabsContent value="unsubmits" className="m-0 space-y-3">
                                    {pendingRequests.unsubmits.map(log => {
                                        const tech = technicians.find(t => t.id === log.techId);
                                        return (
                                            <div key={log.id} className="p-4 rounded-xl border border-border-sub bg-bg-secondary flex items-center justify-between">
                                                <div className="flex items-center gap-4 text-left">
                                                    <Avatar className="h-10 w-10 border border-border-sub">
                                                        <AvatarImage src={tech?.avatarUrl} />
                                                        <AvatarFallback>{(tech?.name || 'U').charAt(0)}</AvatarFallback>
                                                    </Avatar>
                                                    <div className="text-left">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{tech?.name}</p>
                                                            <Badge variant="destructive" className="h-3.5 px-1 text-[7px] uppercase">Unsubmit Req.</Badge>
                                                        </div>
                                                        <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Week of {log.weekOf}</p>
                                                        <p className="text-[10px] text-text-secondary leading-tight mt-1 line-clamp-1 italic">&quot;{log.unsubmitReason}&quot;</p>
                                                    </div>
                                                </div>
                                                <Button size="sm" variant="ghost" className="h-8 text-[9px] font-bold uppercase tracking-widest" onClick={() => { setIsPendingDialogOpen(false); router.push('/admin/financials?tab=payroll'); }}>Audit Manifest</Button>
                                            </div>
                                        );
                                    })}
                                    {pendingRequests.unsubmits.length === 0 && <EmptyState icon={Undo2} label="No amendment requests" />}
                                </TabsContent>

                                <TabsContent value="sites" className="m-0 space-y-3">
                                    {pendingRequests.sites.map(req => (
                                        <div key={req.id} className="p-4 rounded-xl border border-border-sub bg-bg-secondary flex items-center justify-between">
                                            <div className="text-left space-y-1">
                                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{req.siteName}</p>
                                                <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">{req.clientName}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <MapPin className="h-3 w-3 text-brand-red" />
                                                    <span className="text-[10px] text-text-secondary truncate max-w-[300px] uppercase font-medium">{req.location}</span>
                                                </div>
                                            </div>
                                            <Button size="sm" variant="ghost" className="h-8 text-[9px] font-bold uppercase tracking-widest" onClick={() => { setIsPendingDialogOpen(false); router.push('/admin/directory?tab=requests&subtab=client'); }}>Verify Site</Button>
                                        </div>
                                    ))}
                                    {pendingRequests.sites.length === 0 && <EmptyState icon={MapPin} label="Site verifications complete" />}
                                </TabsContent>
                            </div>
                        </ScrollArea>
                    </Tabs>

                    <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default">
                        <Button variant="outline" className="w-full h-11 uppercase font-bold text-[10px] tracking-widest" onClick={() => setIsPendingDialogOpen(false)}>Close Buffer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <style jsx global>{`
                .tab-trigger-dashboard {
                    @apply px-0 h-12 bg-transparent text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted rounded-none border-b-2 border-transparent transition-all;
                }
                .tab-trigger-dashboard[data-state="active"] {
                    @apply text-text-primary border-brand-red bg-transparent shadow-none;
                }
            `}</style>
        </div>
    );
}

function EmptyState({ icon: Icon, label }: { icon: any, label: string }) {
    return (
        <div className="py-24 text-center border-2 border-dashed border-border-sub rounded-xl opacity-40 bg-bg-secondary/30">
            <Icon size={48} className="mx-auto text-text-muted mb-2" />
            <p className="text-[10px] font-bold uppercase tracking-widest">{label}</p>
        </div>
    );
}
