'use client';
import { onSharedSnapshot } from '@/lib/shared-snapshot';

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
import { getAvailablePortals, isTech } from '@/lib/permissions';
import { useRouter } from 'next/navigation';
import { NotificationBell } from '@/components/notification-bell';
import { PortalSwitchButton } from '@/components/portal-switch-button';
import { PageHeader } from '@/components/page-header';
import { TONE_DOT, statusTone } from '@/lib/status-styles';
import { EmptyState } from '@/components/empty-state';
import { StatCard, StatGrid } from '@/components/stat-card';
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
import { cn, compareScheduleTime, isInactiveTechnician } from '@/lib/utils';
import type { WorkOrder, Technician, Project, WeeklyLog, SiteRequest, ServiceRequest, TimeOffRequest, Invoice, PayrollDispute } from '@/lib/types';
import { isArchivedJob, jobTechId, parseLocalDate, mergeJobs } from '@/lib/jobs';
import { computeWeeklyLogSettlement } from '@/lib/payroll';
import { money, computeFinancialSummary } from '@/lib/financial-summary';
import { computeSla, slaStatusColor, SLA_DEFAULTS } from '@/lib/sla';
import { Timer, AlertTriangle as SlaAlertIcon } from 'lucide-react';
import { format, parseISO, isSameDay, startOfMonth } from 'date-fns';

export default function DashboardPage() {
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [assignments, setAssignments] = useState<WorkOrder[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [completedJobs, setCompletedJobs] = useState<WorkOrder[]>([]);
    const [siteRequests, setSiteRequests] = useState<SiteRequest[]>([]);
    const [clientRequests, setClientRequests] = useState<ServiceRequest[]>([]);
    const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [isPendingDialogOpen, setIsPendingDialogOpen] = useState(false);
    const [isAttentionOpen, setIsAttentionOpen] = useState(false);
    const [openDisputes, setOpenDisputes] = useState<PayrollDispute[]>([]);
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
            // All open global requests — service tickets, intake, and partnership
            // docs alike (app-created use 'new', public-form use 'pending_review').
            // Mirrors the /admin/requests inbox so the dashboard tile reflects the
            // full active request volume, not just service tickets.
            query(collection(db, 'clientRequests'), where('status', 'in', ['new', 'pending_review'])),
            (snap) => setClientRequests(
                snap.docs.map(d => ({ ...d.data(), id: d.id } as ServiceRequest))
            )
        );

        const unsubDisputes = onSnapshot(
            query(collection(db, 'payrollDisputes'), where('status', '==', 'open')),
            snap => setOpenDisputes(snap.docs.map(d => ({ ...d.data(), id: d.id } as PayrollDispute))),
            () => setOpenDisputes([]));
        const unsubTOR = onSnapshot(
            query(collection(db, 'timeOffRequests'), where('status', '==', 'pending')),
            (snap) => setTimeOffRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as TimeOffRequest)))
        );

        const unsubInv = onSharedSnapshot('invoices', (snap) => {
            setInvoices(snap.docs.map(d => ({ ...d.data(), id: d.id } as Invoice)));
        });

        // Completed jobs feed MTD revenue / profit AND payroll: weekly logs are
        // for finished work, so without these the settlement can't find the
        // job and pays Field Nation jobs at full price (no FN fee / split).
        // Both collections, same as Financials.
        let doneAsmt: WorkOrder[] = [];
        let doneWO: WorkOrder[] = [];
        const pushDone = () => setCompletedJobs([...doneWO, ...doneAsmt]);
        const unsubDone = onSnapshot(
            query(collection(db, 'assignments'), where('status', '==', 'completed')),
            (snap) => { doneAsmt = snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)); pushDone(); },
            () => { doneAsmt = []; pushDone(); },
        );
        const unsubDoneWO = onSnapshot(
            query(collection(db, 'workOrders'), where('status', '==', 'completed')),
            (snap) => { doneWO = snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)); pushDone(); },
            () => { doneWO = []; pushDone(); },
        );

        return () => {
            unsubUser(); unsubWO(); unsubAsmt(); unsubTech(); unsubProj(); unsubDone(); unsubDoneWO();
            unsubLogs(); unsubSite(); unsubClientReq(); unsubTOR(); unsubDisputes(); unsubInv();
        };
    }, []);

    // status === 'unassigned' alone isn't reliable — a job can be soft-archived
    // or already have a technician attached without its status field having
    // been updated to match (same stale-data case fixed in the Routes tab's
    // job pool). Filter those out so the dashboard count and table match
    // what's actually awaiting dispatch.
    const unassignedJobs = useMemo(() =>
        workOrders.filter(wo => wo.status === 'unassigned' && !wo.assignedTechnicianId && !isArchivedJob(wo)),
    [workOrders]);

    const inactiveTechIds = useMemo(
        () => new Set(technicians.filter(isInactiveTechnician).map(t => t.id)),
        [technicians]
    );
    const belongsToInactiveTech = useCallback((wo: WorkOrder) => {
        const techId = wo.assignedTechnicianId || wo.techId;
        return Boolean(techId && inactiveTechIds.has(techId));
    }, [inactiveTechIds]);

    // Cancelled jobs sit in the Dispatch Hub review queue, not the active count.
    const activeAssignmentsCount = useMemo(() =>
        assignments.filter(wo => wo.status !== 'cancelled').length,
    [assignments]);

    const pendingLogs = useMemo(() =>
        weeklyLogs.filter(l => l.status === 'Submitted' && !inactiveTechIds.has(l.techId)),
    [weeklyLogs, inactiveTechIds]);

    // Needs attention: things that cost money or a customer if they sit —
    // each line links to where it's fixed. Routine queues (pending logs, open
    // requests) have their own tiles and aren't repeated here.
    const attention = useMemo(() => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const soon = today.getTime() + 2 * 86_400_000;
        const items: { id: string; n: number; text: string; detail: string; href: string }[] = [];
        const add = (id: string, n: number, one: string, many: string, detail: string, href: string) => {
            if (n > 0) items.push({ id, n, text: `${n} ${n === 1 ? one : many}`, detail, href });
        };
        add('disputes', openDisputes.length, 'payroll dispute', 'payroll disputes',
            'A tech disputed pay on a log that was already sent.', '/admin/payroll/audit');
        const submitted = weeklyLogs.filter(l => l.status === 'Submitted');
        add('disputed-items', submitted.reduce((n, l) => n + (l.items || []).filter(i => i.confirmationStatus === 'disputed').length, 0),
            'disputed job on a submitted log', 'disputed jobs on submitted logs', 'Decide before approving the log.', '/admin/payroll/audit');
        add('missing', submitted.reduce((n, l) => n + (l.missingAssignmentReports || []).filter(r => !r.isAudited).length, 0),
            'job reported missing from a log', 'jobs reported missing from logs', 'Check and approve the pay, or decline.', '/admin/payroll/audit');
        add('reapprove', weeklyLogs.filter(l => l.mergeReviewRequired).length,
            'approved log needs reapproval', 'approved logs need reapproval', 'A duplicate log was merged into it.', '/admin/payroll/audit');
        add('unassigned-soon', unassignedJobs.filter(wo => { const d = parseLocalDate(wo.scheduleDate); return !!d && d.getTime() < soon; }).length,
            'unassigned job due within 2 days', 'unassigned jobs due within 2 days', 'Assign a technician.', '/admin/dispatch');
        add('overdue-jobs', assignments.filter(wo => { const d = parseLocalDate(wo.scheduleDate); return wo.status !== 'cancelled' && !!d && d.getTime() < today.getTime(); }).length,
            'job past its date and not completed', 'jobs past their date and not completed', 'Follow up with the tech.', '/admin/assignments');
        add('overdue-invoices', invoices.filter(i => {
            if (['paid', 'void', 'cancelled', 'draft'].includes(i.status)) return false;
            const d = parseLocalDate(i.dueDate);
            return i.status === 'overdue' || (!!d && d.getTime() < today.getTime());
        }).length, 'overdue invoice', 'overdue invoices', 'Past the due date and unpaid.', '/admin/financials');
        add('time-off', timeOffRequests.filter(t => { const d = parseLocalDate(t.startDate); return !!d && d.getTime() < soon; }).length,
            'time-off request starting within 2 days', 'time-off requests starting within 2 days', 'Approve or deny before it starts.', '#requests');
        return items;
    }, [openDisputes, weeklyLogs, unassignedJobs, assignments, invoices, timeOffRequests]);

    const completedThisWeek = useMemo(() => {
        const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
        return completedJobs.filter(wo => {
            const d = parseLocalDate((wo as WorkOrder & { completedAt?: string }).completedAt?.slice(0, 10) || wo.scheduleDate);
            return !!d && d.getTime() >= start.getTime();
        }).length;
    }, [completedJobs]);

    // Every job the dashboard knows about, finished ones included — the
    // payroll and financial cards must see the same jobs Financials does.
    const jobsById = useMemo(
        () => new Map(mergeJobs(workOrders, [...assignments, ...completedJobs]).map(j => [j.id, j as WorkOrder])),
        [workOrders, assignments, completedJobs],
    );

    // Live settlement — same figure as Financials' Pending Payouts card and
    // Payroll Audit (stored totalPayout goes stale after pay corrections).
    const pendingPay = useMemo(() =>
        pendingLogs.reduce((acc, l) => acc + computeWeeklyLogSettlement(l, jobsById), 0),
    [pendingLogs, jobsById]);

    const workloadData = useMemo(() =>
        technicians
            .filter(t => !isInactiveTechnician(t))
            .map(tech => ({
                id: tech.id,
                name: tech.name,
                avatarUrl: tech.avatarUrl,
                assigned: assignments.filter(wo => jobTechId(wo) === tech.id && wo.status !== 'completed' && wo.status !== 'cancelled' && !isArchivedJob(wo)).length
            }))
            .filter(t => t.assigned > 0)
            .sort((a, b) => b.assigned - a.assigned)
            .slice(0, 5),
    [technicians, assignments]);

    const maxLoad = useMemo(() => Math.max(...workloadData.map(d => d.assigned), 1), [workloadData]);

    const pendingRequests = useMemo(() => {
        const unsubmits = weeklyLogs.filter(l => l.unsubmitRequested && !inactiveTechIds.has(l.techId));
        const activeTimeOff = timeOffRequests.filter(request => !inactiveTechIds.has(request.techId));
        return {
            tickets: clientRequests,
            sites: siteRequests,
            timeOff: activeTimeOff,
            unsubmits,
            total: clientRequests.length + siteRequests.length + activeTimeOff.length + unsubmits.length
        };
    }, [clientRequests, siteRequests, timeOffRequests, weeklyLogs, inactiveTechIds]);

    const slaAlerts = useMemo(() => {
        const active = [...workOrders, ...assignments].filter(wo =>
            wo.status !== 'completed' && !belongsToInactiveTech(wo) && (wo.priority === 'critical' || wo.priority === 'high' || wo.priority === 'medium')
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
    }, [workOrders, assignments, belongsToInactiveTech]);

    const todayJobs = useMemo(() => {
        const today = new Date();
        return [...workOrders, ...assignments].filter(wo => {
            if (!wo.scheduleDate) return false;
            try { return isSameDay(parseISO(wo.scheduleDate), today); } catch { return false; }
        }).sort((a, b) => compareScheduleTime(a.scheduleTime, b.scheduleTime));
    }, [workOrders, assignments]);

    // Same calculation as the Financials cards (lib/financial-summary.ts):
    // revenue = pay on jobs completed this month (or their paid invoice) +
    // paid invoices not tied to a job; profit = Aaromach portion.
    const financialKpis = useMemo(() => {
        const summary = computeFinancialSummary({ invoices, expenses: [], weeklyLogs, jobsById });
        return {
            mtdRevenue: Math.round(summary.month.revenue),
            mtdProfit: Math.round(summary.month.profit),
            outstanding: Math.round(summary.receivableTotal),
            upcomingPayroll: Math.round(pendingPay),
        };
    }, [invoices, weeklyLogs, jobsById, pendingPay]);


    return (
        <div className="animate-in fade-in duration-500 text-left">
            <PageHeader
                eyebrow={TERMINOLOGY.PORTAL.ADMIN}
                icon={LayoutDashboard}
                title="Dashboard"
                subtitle="Today's jobs, open requests and what needs attention."
                actions={
                    <div className="flex items-center gap-3">
                        <NotificationBell />
                        <PortalSwitchButton />
                    </div>
                }
            />

            {/* Financial KPIs — compact top strip */}
            <div className="flex flex-wrap items-center gap-2 mb-4 px-1">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-sub bg-bg-secondary">
                    <Banknote size={11} className="text-text-green shrink-0" />
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Revenue this month</p>
                        <p className="text-[12px] font-bold font-mono text-text-green">${financialKpis.mtdRevenue.toLocaleString()}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-sub bg-bg-secondary">
                    <TrendingUp size={11} className="text-text-green shrink-0" />
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Profit this month</p>
                        <p className={cn('text-[12px] font-bold font-mono', financialKpis.mtdProfit >= 0 ? 'text-text-green' : 'text-text-red')}>${financialKpis.mtdProfit.toLocaleString()}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-sub bg-bg-secondary">
                    <TrendingUp size={11} className="text-accent-gold shrink-0" />
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Outstanding</p>
                        <p className="text-[12px] font-bold font-mono text-accent-gold">${financialKpis.outstanding.toLocaleString()}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-sub bg-bg-secondary">
                    <Zap size={11} className="text-brand-red shrink-0" />
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Upcoming payroll</p>
                        <p className="text-[12px] font-bold font-mono text-text-primary">${financialKpis.upcomingPayroll.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
                <Link href="/admin/dispatch">
                    <Button size="sm" className="gap-1.5">
                        <Plus size={11} /> New job
                    </Button>
                </Link>
                <Link href="/admin/projects?action=new">
                    <Button size="sm" variant="outline" className="gap-1.5">
                        <FolderKanban size={11} /> New project
                    </Button>
                </Link>
                <Link href="/admin/messaging">
                    <Button size="sm" variant="outline" className="gap-1.5">
                        <MessageSquare size={11} /> Send announcement
                    </Button>
                </Link>
            </div>

            {/* Quick status chips */}
            <div className="flex flex-wrap items-center gap-2 mb-6">
                {slaAlerts.length > 0 && (
                    <button
                        onClick={() => slaRef.current?.scrollIntoView({ behavior: 'smooth' })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-tertiary border border-border-main text-text-muted text-[10px] font-bold uppercase tracking-wider hover:text-text-primary transition-colors"
                    >
                        <Timer size={10} />
                        {slaAlerts.length} alert{slaAlerts.length !== 1 ? 's' : ''}
                    </button>
                )}
            </div>

            {/* Stat tiles */}
            <StatGrid className="mb-8 grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
                <StatCard icon={Wrench} label="Active jobs" value={activeAssignmentsCount} sub="Assigned and in progress" tone="done"
                    onClick={() => router.push('/admin/dispatch?subtab=assignments')} />
                <StatCard icon={ClipboardList} label="Pending logs" value={pendingLogs.length} sub="Waiting for review" tone={pendingLogs.length ? 'progress' : undefined}
                    onClick={() => router.push('/admin/payroll/audit')} />
                <StatCard icon={Clock} label="Open requests" value={pendingRequests.total} sub="Waiting for action" tone={pendingRequests.total ? 'progress' : undefined}
                    onClick={() => setIsPendingDialogOpen(true)} />
                <StatCard icon={AlertCircle} label="Needs attention" value={attention.reduce((t, a) => t + a.n, 0)}
                    sub={attention.length === 0 ? 'Nothing urgent' : attention.length === 1 ? attention[0].text : `${attention.length} kinds of issue — tap to see`} tone={attention.length ? 'problem' : 'done'}
                    onClick={() => setIsAttentionOpen(true)} />
            </StatGrid>

            {/* NEEDS ATTENTION */}
            <Dialog open={isAttentionOpen} onOpenChange={setIsAttentionOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader className="text-left">
                        <DialogTitle className="text-base font-semibold">Needs attention</DialogTitle>
                        <DialogDescription>Items that cost money or a customer if they wait. Tap one to go fix it.</DialogDescription>
                    </DialogHeader>
                    {attention.length === 0 ? (
                        <EmptyState compact icon={AlertCircle} title="Nothing urgent" description="Disputes, overdue jobs and invoices show up here." />
                    ) : (
                        <div className="divide-y divide-border-sub rounded-lg border border-border-sub">
                            {attention.map(a => (
                                <Link key={a.id} href={a.href === '#requests' ? '#' : a.href}
                                    onClick={e => { setIsAttentionOpen(false); if (a.href === '#requests') { e.preventDefault(); setIsPendingDialogOpen(true); } }}
                                    className="flex items-center gap-3 p-3 hover:bg-bg-tertiary transition-colors">
                                    <AlertCircle size={16} className="shrink-0 text-brand-red" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[13px] font-semibold text-text-primary">{a.text}</p>
                                        <p className="text-[12px] text-text-muted">{a.detail}</p>
                                    </div>
                                    <ChevronRight size={16} className="shrink-0 text-text-muted" />
                                </Link>
                            ))}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Today's Schedule Strip */}
            {todayJobs.length > 0 && (
                <div className="mb-6">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2 flex items-center gap-1.5">
                        <Calendar size={10} className="text-brand-red" />
                        Today's schedule — {todayJobs.length} job{todayJobs.length !== 1 ? 's' : ''}
                    </p>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                        {todayJobs.map(wo => {
                            const techId = wo.assignedTechnicianId || (wo as any).techId;
                            const tech = technicians.find(t => t.id === techId);
                            const statusDot = TONE_DOT[statusTone('job', wo.status)];
                            return (
                                <Link key={wo.id} href={`/admin/assignments/${wo.id}`} className="shrink-0">
                                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border-sub bg-bg-secondary hover:border-border-main transition-colors min-w-[200px] max-w-[220px]">
                                        {tech && (
                                            <Avatar className="h-7 w-7 border border-border-sub shrink-0">
                                                <AvatarImage src={tech.avatarUrl} />
                                                <AvatarFallback className="text-[11px] font-bold">{tech.name?.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            {wo.scheduleTime && <p className="text-[10px] font-mono text-text-muted">{wo.scheduleTime}</p>}
                                            <p className="text-[11px] font-bold text-text-primary leading-tight truncate">{wo.title || wo.description || wo.id.slice(0, 8)}</p>
                                            <p className="text-[10px] text-text-muted truncate">{wo.clientName}</p>
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
                            <CardTitle>Unassigned jobs</CardTitle>
                            <CardDescription>Jobs waiting for a technician.</CardDescription>
                        </CardHeader>
                        <CardContent className="table-wrap !border-none !rounded-none p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-bg-tertiary">
                                        <TableHead className="pl-6">WO#</TableHead>
                                        <TableHead>Client</TableHead>
                                        <TableHead>Location</TableHead>
                                        <TableHead>Job type</TableHead>
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
                                            <TableCell className="text-left text-xs font-bold text-text-muted">{job.clientName}</TableCell>
                                            <TableCell className="text-left text-[10px] font-bold text-text-secondary">{job.location.split(',')[0]}</TableCell>
                                            <TableCell className="text-left text-[10px] font-bold text-text-muted">{job.jobType || job.projectType}</TableCell>
                                            <TableCell>
                                                <Badge variant={job.priority === 'critical' || job.priority === 'high' ? 'high' : 'medium'}>{job.priority}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <Button
                                                    size="sm"
                                                    className="h-7 text-[10px] bg-brand-red hover:bg-brand-red/90 text-white uppercase font-bold tracking-wider px-3"
                                                    onClick={() => router.push('/admin/dispatch?tab=dispatch')}
                                                >
                                                    Assign tech
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {unassignedJobs.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center h-32 text-xs font-bold text-text-muted opacity-40">
                                                Every job has a technician.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                        {unassignedJobs.length > 8 && (
                            <CardFooter className="pt-0 border-t border-border-sub bg-bg-tertiary/20 p-4">
                                <Button variant="ghost" className="w-full text-[10px] uppercase font-bold tracking-wider h-8" onClick={() => router.push('/admin/dispatch')}>
                                    View all {unassignedJobs.length} unassigned jobs <ChevronRight size={12} className="ml-2" />
                                </Button>
                            </CardFooter>
                        )}
                    </Card>

                    {/* Service Requests — SLA Clock */}
                    <div ref={slaRef}>
                        <Card>
                            <CardHeader className="text-left">
                                <CardTitle>Service requests — response time</CardTitle>
                                <CardDescription>Open requests and how long they have been waiting.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {clientRequests.slice(0, 6).map(req => {
                                    const submitted = parseLocalDate(req.submittedDate);
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
                                                <p className="text-[10px] font-bold text-text-primary leading-tight">{req.clientName}</p>
                                                <p className="text-[10px] text-text-muted uppercase tracking-wide truncate">{req.requestType}</p>
                                            </div>
                                            <Badge variant={req.priority === 'critical' || req.priority === 'high' ? 'high' : 'medium'} className="shrink-0">{req.priority}</Badge>
                                            <div className={cn('text-[10px] font-bold font-mono shrink-0 min-w-[48px] text-right', isBreached ? 'text-brand-red' : isAtRisk ? 'text-accent-gold' : 'text-text-muted')}>
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
                                        <p className="text-[10px] font-bold text-text-muted">No active service requests</p>
                                    </div>
                                )}

                                {slaAlerts.length > 0 && (
                                    <div className="pt-3 mt-1 border-t border-border-sub space-y-1.5">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-brand-red flex items-center gap-1 mb-2">
                                            <SlaAlertIcon size={9} /> SLA Breaches / At Risk — {slaAlerts.length}
                                        </p>
                                        {slaAlerts.map(({ wo, sla }) => (
                                            <Link key={wo.id} href="/admin/dispatch" className="flex items-center gap-3 p-2 rounded bg-brand-red/5 border border-brand-red/20 hover:border-brand-red/40 transition-colors">
                                                <Timer size={10} className={slaStatusColor(sla.status)} />
                                                <span className="text-[11px] font-bold text-text-primary font-mono">{wo.shortId || wo.id.slice(0, 8).toUpperCase()}</span>
                                                <span className="text-[11px] text-text-muted flex-1 truncate">{wo.clientName}</span>
                                                <span className={cn('text-[11px] font-bold', slaStatusColor(sla.status))}>
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
                            <CardTitle>Tech workload</CardTitle>
                            <CardDescription>Active jobs per technician.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {workloadData.length > 0 ? workloadData.map(item => (
                                <div key={item.id}>
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <Avatar className="h-5 w-5 shrink-0">
                                            <AvatarImage src={item.avatarUrl} />
                                            <AvatarFallback className="text-[10px]">{(item.name || 'U').charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <span className="text-[10px] font-bold text-text-primary flex-1 truncate">{item.name}</span>
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
                                    <p className="text-[10px] font-bold text-text-muted">No active assignments</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* This Week */}
                    <Card>
                        <CardHeader className="pb-3 text-left">
                            <CardTitle>Business snapshot</CardTitle>
                            <CardDescription>Projects, invoices and this week's finished work.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-0">
                            {[
                                // Nothing here repeats the tiles or the money strip above.
                                { label: 'Jobs completed this week', value: completedThisWeek },
                                { label: 'Active projects', value: projects.filter(p => p.status === 'active').length },
                                { label: 'Projects on hold', value: projects.filter(p => p.status === 'on-hold').length },
                                { label: 'Invoices sent, not paid', value: invoices.filter(inv => inv.status === 'sent' || inv.status === 'overdue').length },
                            ].map(({ label, value }) => (
                                <div key={label} className="flex items-center justify-between py-2.5 border-b border-border-sub last:border-0">
                                    <span className="text-[13px] text-text-secondary">{label}</span>
                                    <span className="text-[13px] font-mono font-semibold text-text-primary">{value}</span>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* OPEN REQUESTS DIALOG */}
            <Dialog open={isPendingDialogOpen} onOpenChange={setIsPendingDialogOpen}>
                <DialogContent className="sm:max-w-[800px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[90vh] shadow-2xl">
                    <DialogHeader className="p-6 border-b border-border-sub bg-bg-tertiary/30 text-left">
                        <div className="flex items-center gap-3">
                            <Clock className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold text-text-primary">Open requests</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs font-bold text-text-muted">Service requests, time off, log changes and site verifications waiting for action.</DialogDescription>
                    </DialogHeader>

                    <Tabs defaultValue="tickets" className="flex-1 overflow-hidden flex flex-col">
                        <div className="px-6 border-b border-border-sub bg-bg-secondary/30">
                            <TabsList className="h-auto min-h-12 bg-transparent p-0 gap-x-4 sm:gap-x-8 gap-y-1 flex-wrap justify-start">
                                <TabsTrigger value="tickets" className="tab-trigger-dashboard flex items-center gap-2">
                                    <ClipboardList size={14} /> Requests <Badge variant="outline" className="h-4 px-1.5 text-[10px]">{pendingRequests.tickets.length}</Badge>
                                </TabsTrigger>
                                <TabsTrigger value="timeoff" className="tab-trigger-dashboard flex items-center gap-2">
                                    <Users size={14} /> Time off <Badge variant="outline" className="h-4 px-1.5 text-[10px]">{pendingRequests.timeOff.length}</Badge>
                                </TabsTrigger>
                                <TabsTrigger value="unsubmits" className="tab-trigger-dashboard flex items-center gap-2">
                                    <Undo2 size={14} /> Log changes <Badge variant="outline" className="h-4 px-1.5 text-[10px]">{pendingRequests.unsubmits.length}</Badge>
                                </TabsTrigger>
                                <TabsTrigger value="sites" className="tab-trigger-dashboard flex items-center gap-2">
                                    <MapPin size={14} /> Sites <Badge variant="outline" className="h-4 px-1.5 text-[10px]">{pendingRequests.sites.length}</Badge>
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
                                                    <span className="text-[10px] font-mono font-bold text-brand-red">{req.id}</span>
                                                    <Badge variant={req.priority === 'critical' || req.priority === 'high' ? 'high' : 'medium'} className="text-[10px] h-3.5 px-1">{req.priority}</Badge>
                                                </div>
                                                <p className="text-xs font-bold text-text-primary truncate max-w-[400px]">{[req.clientName, req.requestType].filter(Boolean).join(' — ') || 'Request'}</p>
                                                <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider">{(req.location || '').split(',')[0] || '—'}</p>
                                            </div>
                                            <Button size="sm" variant="ghost" className="h-8 text-[10px] font-bold uppercase tracking-wider" onClick={() => { setIsPendingDialogOpen(false); router.push('/admin/requests'); }}>Audit detail</Button>
                                        </div>
                                    ))}
                                    {pendingRequests.tickets.length === 0 && <EmptyState compact icon={ClipboardList} title="No open service requests" />}
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
                                                        <p className="text-xs font-bold text-text-primary tracking-wide">{tech?.name}</p>
                                                        <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider">{req.type} Request</p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <Calendar className="h-3 w-3 text-brand-red" />
                                                            <span className="text-[10px] font-mono font-bold">{req.startDate} — {req.endDate}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <Button size="sm" variant="ghost" className="h-8 text-[10px] font-bold uppercase tracking-wider" onClick={() => { setIsPendingDialogOpen(false); router.push('/admin/directory?tab=requests&subtab=personnel'); }}>Review Log</Button>
                                            </div>
                                        );
                                    })}
                                    {pendingRequests.timeOff.length === 0 && <EmptyState compact icon={Users} title="No time-off requests" />}
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
                                                            <p className="text-xs font-bold text-text-primary tracking-wide">{tech?.name}</p>
                                                            <Badge variant="destructive" className="h-3.5 px-1 text-[10px]">Unsubmit request</Badge>
                                                        </div>
                                                        <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Week of {log.weekOf}</p>
                                                        <p className="text-[10px] text-text-secondary leading-tight mt-1 line-clamp-1 ">&quot;{log.unsubmitReason}&quot;</p>
                                                    </div>
                                                </div>
                                                <Button size="sm" variant="ghost" className="h-8" onClick={() => { setIsPendingDialogOpen(false); router.push('/admin/financials?tab=payroll'); }}>Review payroll</Button>
                                            </div>
                                        );
                                    })}
                                    {pendingRequests.unsubmits.length === 0 && <EmptyState compact icon={Undo2} title="No log change requests" />}
                                </TabsContent>

                                <TabsContent value="sites" className="m-0 space-y-3">
                                    {pendingRequests.sites.map(req => (
                                        <div key={req.id} className="p-4 rounded-xl border border-border-sub bg-bg-secondary flex items-center justify-between">
                                            <div className="text-left space-y-1">
                                                <p className="text-xs font-bold text-text-primary tracking-wide">{req.siteName}</p>
                                                <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider">{req.clientName}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <MapPin className="h-3 w-3 text-brand-red" />
                                                    <span className="text-[10px] text-text-secondary truncate max-w-[300px] font-medium">{req.location}</span>
                                                </div>
                                            </div>
                                            <Button size="sm" variant="ghost" className="h-8 text-[10px] font-bold uppercase tracking-wider" onClick={() => { setIsPendingDialogOpen(false); router.push('/admin/directory?tab=requests&subtab=client'); }}>Verify Site</Button>
                                        </div>
                                    ))}
                                    {pendingRequests.sites.length === 0 && <EmptyState compact icon={MapPin} title="No sites waiting for verification" />}
                                </TabsContent>
                            </div>
                        </ScrollArea>
                    </Tabs>

                    <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default">
                        <Button variant="outline" className="w-full h-11 uppercase font-bold text-[10px] tracking-wider" onClick={() => setIsPendingDialogOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
}

