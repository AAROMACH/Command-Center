'use client';
import { logDisplayStatus } from '@/lib/weekly-log-core';
import { useSessionState } from '@/hooks/use-session-state';
import { JobNumbers } from '@/components/work-order-id';
import { onSharedSnapshot } from '@/lib/shared-snapshot';

import { useState, useMemo, useEffect } from 'react';
import { usePaged, ListPager, PAGE_SIZES_LARGE, PAGE_SIZES_SMALL } from '@/components/list-pager';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { isTech } from '@/lib/permissions';
import { BarChart2, ShieldAlert, Users, AlertTriangle, Clock, ChevronRight, Mail, Phone, ArrowLeft, RefreshCw, Filter, X, Activity as ActivityIcon } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PerformanceStats } from './components/performance-stats';
import { FieldNationCheck } from './components/field-nation-check';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { cn, isInactiveTechnician } from '@/lib/utils';
import type { WorkOrder, Technician, WeeklyLog, Invoice } from '@/lib/types';
import { CustomerDashboard } from './components/customer-dashboard';
import { effectiveJobPay, netOfFieldNationFee } from '@/lib/payroll';
import { Tabs as InnerTabs, TabsList as InnerTabsList, TabsTrigger as InnerTabsTrigger, TabsContent as InnerTabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { DateRangeButton } from '@/components/list-toolbar';
import { mergeJobs, jobTechId, jobDateTimeValue, JOB_STATUS_OPTIONS, isArchivedJob } from '@/lib/jobs';
import { isSuperAdmin, isPayAdmin } from '@/lib/permissions';
import { computeWeeklyLogSettlement } from '@/lib/payroll';
import { JobDetailDialog } from '@/components/job-detail-dialog';

import { findUnloggedCompletions, findMismatchedLogEntries, findDesyncedAssignments } from '@/lib/weekly-log-audit';
import { UnloggedCompletions } from './components/unlogged-completions';
import { WrongTechEntries } from './components/wrong-tech-entries';
import { usePenaltyEvents, penaltyPoints } from '@/hooks/use-penalty-events';

export default function FieldIntelligencePage() {
    // Real penalty events (was the empty demo list → always 0 points).
    const allPenalties = usePenaltyEvents();
    // App activity moved to History; a remembered 'app_activity' falls back.
    const [activeTab, setActiveTabRaw] = useState(() => { try { const t = localStorage.getItem('cc:intel:tab'); return t && t !== 'app_activity' ? t : 'intelligence'; } catch { return 'intelligence'; } });
    const setActiveTab = (v: string) => { setActiveTabRaw(v); try { localStorage.setItem('cc:intel:tab', v); } catch {} };
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [assignments, setAssignments] = useState<WorkOrder[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    // Dispatch job imports (one record per import — see dispatch-page-client).
    type ImportBatch = { id: string; importedAt?: string; importedByName?: string; importedBy?: string | null; count?: number; clients?: string[]; jobIds?: string[] };
    const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
    const [archivedJobs, setArchivedJobs] = useState<WorkOrder[]>([]);
    const [selectedTechId, setSelectedTechId] = useSessionState<string | null>('admin/analytics:selectedTechId', null);


    useEffect(() => {
        const unsubWO = onSharedSnapshot('workOrders', (snap) => {
            setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });
        const unsubAsmt = onSharedSnapshot('assignments', (snap) => {
            setAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });
        const unsubTech = onSharedSnapshot('users', (snap) => {
            setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
        });
        const unsubLogs = onSharedSnapshot('weeklyLogs', (snap) => {
            setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)));
        });
        const unsubInv = onSharedSnapshot('invoices', (snap) => {
            setInvoices(snap.docs.map(d => ({ ...d.data(), id: d.id } as Invoice)));
        });
        const unsubArchive = onSharedSnapshot('activityArchive', (snap) => {
            const jobs = snap.docs.flatMap(d => {
                const data = d.data() as any;
                if (!data.archivedFrom) return [];
                try {
                    const record = data.archivedRecordJson ? JSON.parse(data.archivedRecordJson) : data.archivedRecord;
                    return record ? [{ ...record, id: record.id || d.id } as WorkOrder] : [];
                } catch { return []; }
            });
            setArchivedJobs(jobs);
        });
        const unsubImports = onSharedSnapshot('importBatches', (snap) => {
            setImportBatches(snap.docs.map(d => ({ ...d.data(), id: d.id } as ImportBatch)));
        });
        return () => { unsubWO(); unsubAsmt(); unsubTech(); unsubLogs(); unsubInv(); unsubArchive(); unsubImports(); };
    }, []);

    const staffTechs = useMemo(
        () => technicians.filter(t => isTech(t) && !isInactiveTechnician(t)),
        [technicians]
    );

    const activeTechIds = useMemo(() => new Set(staffTechs.map(t => t.id)), [staffTechs]);
    const activeWeeklyLogs = useMemo(
        () => weeklyLogs.filter(log => activeTechIds.has(log.techId)),
        [weeklyLogs, activeTechIds]
    );

    // The client filter must match what work orders actually store
    // (clientName, a free-text field) — not a client account's Firestore
    // user id, which never appears anywhere on a WorkOrder.
    const clientNames = useMemo(
        () => Array.from(new Set(workOrders.map(wo => wo.clientName).filter(Boolean))).sort(),
        [workOrders]
    );

    const anomalyCounts = useMemo(() =>
        workOrders.filter(wo => wo.status === 'unassigned').length +
        activeWeeklyLogs.filter(wl => wl.status === 'Draft').length,
        [workOrders, activeWeeklyLogs]
    );

    // Payroll integrity flags (moved here from Payroll Audit): completed jobs
    // that never reached a weekly log, and log entries sitting on a tech other
    // than the job's assignee. See lib/weekly-log-audit.ts.
    const missions = useMemo(() => mergeJobs(workOrders, assignments), [workOrders, assignments]);
    const unloggedAudit = useMemo(() => findUnloggedCompletions(missions, weeklyLogs), [missions, weeklyLogs]);
    const wrongTechEntries = useMemo(() => findMismatchedLogEntries(missions, weeklyLogs), [missions, weeklyLogs]);
    const desyncedAssignments = useMemo(() => findDesyncedAssignments(missions), [missions]);
    const wrongTechCount = wrongTechEntries.length + desyncedAssignments.length;

    const flagsTotal = anomalyCounts + unloggedAudit.rows.length + wrongTechCount;
    const [flagsView, setFlagsView] = useState<'anomalies' | 'unlogged' | 'wrong-tech'>('anomalies');
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    // Techs tab: pay figures only for super admins and payroll/financial admins.
    const [managedJob, setManagedJob] = useState<WorkOrder | null>(null);
    // Import batch opened from App Activity — shows every job it brought in.
    const jobsById = useMemo(() => new Map(missions.map(m => [m.id, m as WorkOrder])), [missions]);
    useEffect(() => { try { setCurrentUserId(sessionStorage.getItem('currentUserId')); } catch { /* private mode */ } }, []);
    const currentUser = technicians.find(t => t.id === currentUserId) || null;
    const canSeePay = isSuperAdmin(currentUser) || isPayAdmin(currentUser);

    const activeTech = useMemo(
        () => staffTechs.find(t => t.id === selectedTechId),
        [staffTechs, selectedTechId]
    );

    const techStats = useMemo(() => {
        if (!selectedTechId) return null;
        const myJobs = assignments.filter(wo => jobTechId(wo) === selectedTechId);
        const completed = myJobs.filter(wo => wo.status === 'completed').length;
        const penalties = allPenalties.filter(pe => pe.techId === selectedTechId);
        const points = penaltyPoints(allPenalties, selectedTechId);
        const myLogs = weeklyLogs.filter(log => log.techId === selectedTechId)
            .sort((a, b) => {
                const [am, ad, ay] = a.weekOf.split('-');
                const [bm, bd, by] = b.weekOf.split('-');
                return new Date(parseInt(by), parseInt(bm)-1, parseInt(bd)).getTime() -
                       new Date(parseInt(ay), parseInt(am)-1, parseInt(ad)).getTime();
            });
        const totalEarnings = myLogs.filter(l => l.status === 'Approved').reduce((acc, log) => acc + computeWeeklyLogSettlement(log, jobsById), 0);
        return { total: myJobs.length, completed, points, penalties, totalEarnings, myJobs, myLogs };
    }, [selectedTechId, assignments, weeklyLogs, allPenalties, jobsById]);

    // Insights tab computed values
    // Completion counts only jobs that were due (scheduled today or earlier)
    // and not cancelled — upcoming work used to count as "not completed".
    const techReliability = useMemo(() => {
        const today = new Date(); today.setHours(23, 59, 59, 999);
        const due = (wo: WorkOrder) => { const t = jobDateTimeValue(wo.scheduleDate); return !t || t <= today.getTime(); };
        return staffTechs.map(tech => {
            const techJobs = assignments.filter(wo => jobTechId(wo) === tech.id && !isArchivedJob(wo) && wo.status !== 'cancelled' && due(wo));
            const completed = techJobs.filter(wo => wo.status === 'completed').length;
            const total = techJobs.length;
            const revisits = techJobs.filter(wo =>
                (wo.revisitCount && wo.revisitCount > 0) ||
                wo.jobType?.toLowerCase().includes('revisit') ||
                wo.jobType?.toLowerCase().includes('follow-up')
            ).length;
            const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
            const revisitRate = total > 0 ? Math.round((revisits / total) * 100) : 0;
            return { ...tech, completionRate, revisitRate, total, completed, revisits };
        // Revisit problems first (over 20%), then by completion.
        }).filter(t => t.total > 0).sort((a, b) => Number(b.revisitRate > 20) - Number(a.revisitRate > 20) || b.completionRate - a.completionRate);
    }, [staffTechs, assignments]);
    const revisitFlagCount = techReliability.filter(t => t.revisitRate > 20).length;

    // Insights: top clients (with gross profit) and top cities — lib/intel-insights.ts.
    // Quality tab: the last 6 months of completed work and how much of it
    // needed a revisit or was cancelled — the trend the Customers tab doesn't show.
    const monthlyQuality = useMemo(() => {
        const jobs = mergeJobs(workOrders, assignments).filter(j => !isArchivedJob(j));
        const now = new Date();
        return Array.from({ length: 6 }, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
            const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const inMonth = jobs.filter(j => (j.scheduleDate || '').slice(0, 7) === ym);
            const completed = inMonth.filter(j => j.status === 'completed').length;
            const cancelled = inMonth.filter(j => j.status === 'cancelled').length;
            const revisits = inMonth.filter(j => (j.revisitCount && j.revisitCount > 0)
                || j.jobType?.toLowerCase().includes('revisit') || j.jobType?.toLowerCase().includes('follow-up')).length;
            return {
                label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), total: inMonth.length, completed, cancelled, revisits,
                revisitRate: inMonth.length ? Math.round((revisits / inMonth.length) * 100) : 0,
            };
        });
    }, [workOrders, assignments]);
    // Revisits by job type across all jobs (it only looked at the unassigned pool).
    const failurePatterns = useMemo(() => {
        const revisitWOs = missions.filter(wo => !isArchivedJob(wo)).filter(wo =>
            (wo.revisitCount && wo.revisitCount > 0) ||
            wo.jobType?.toLowerCase().includes('revisit') ||
            wo.title?.toLowerCase().includes('revisit') ||
            wo.title?.toLowerCase().includes('follow-up')
        );
        const byType = new Map<string, number>();
        revisitWOs.forEach(wo => {
            const key = wo.jobType || 'General';
            byType.set(key, (byType.get(key) || 0) + 1);
        });
        return Array.from(byType.entries())
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count);
    }, [missions]);

    // Paged lists (components/list-pager.tsx).
    const techJobsPager = usePaged(techStats?.myJobs || [], PAGE_SIZES_LARGE, 'intel-tech-jobs', [selectedTechId]);
    const techLogsPager = usePaged(techStats?.myLogs || [], PAGE_SIZES_LARGE, 'intel-tech-logs', [selectedTechId]);
    const anomalyRows = useMemo(() => [
        ...workOrders.filter(wo => wo.status === 'unassigned').map(wo => ({ kind: 'job' as const, id: wo.id, wo })),
        ...activeWeeklyLogs.filter(wl => wl.status === 'Draft').map(wl => ({ kind: 'log' as const, id: wl.id, wl })),
    ], [workOrders, activeWeeklyLogs]);
    const anomalyPager = usePaged(anomalyRows, PAGE_SIZES_SMALL, 'intel-anomalies');

    const formatDateDisplay = (dateStr: string) => {
        if (!dateStr) return 'TBD';
        try {
            const parts = dateStr.split(/[-/]/);
            if (parts[0].length === 4) return format(parseISO(dateStr), 'MM-dd-yyyy');
            const [m, day, y] = parts;
            return y && m && day ? format(new Date(`${y}-${m}-${day}T12:00:00`), 'MM-dd-yyyy') : dateStr;
        } catch { return dateStr; }
    };

    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow="Reports"
                icon={BarChart2}
                title="Insights"
                subtitle="Work and revenue (with the job map), technicians, performance and flags."
            />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="overflow-x-auto">
                    <TabsList className="tabs mb-6 w-max">
                        <TabsTrigger value="intelligence" className="tab">Work &amp; revenue</TabsTrigger>
                        <TabsTrigger value="techs" className="tab" onClick={() => setSelectedTechId(null)}>
                            Techs
                        </TabsTrigger>
                        <TabsTrigger value="insights" className="tab">Performance</TabsTrigger>
                        <TabsTrigger value="flags" className="tab flex items-center gap-2">
                            Flags
                            {flagsTotal > 0 && (
                                <Badge variant="destructive" className="h-5 px-1.5 text-[11px] min-w-[20px] flex items-center justify-center font-bold">{flagsTotal}</Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="intelligence" className="m-0">
                    {/* Completed work and money by customer, type and month; the
                        Job map button in its filter bar shows where it happened. */}
                    <CustomerDashboard
                        jobs={missions}
                        weeklyLogs={weeklyLogs}
                        invoices={invoices}
                        technicians={technicians}
                    />
                </TabsContent>

                <TabsContent value="flags" className="m-0">
                    <InnerTabs value={flagsView} onValueChange={(v: any) => setFlagsView(v)} className="w-full">
                        <InnerTabsList className="tabs mb-4">
                            {([
                                { value: 'anomalies', label: 'Anomalies', count: anomalyCounts },
                                { value: 'unlogged', label: 'Unlogged jobs', count: unloggedAudit.rows.length },
                                { value: 'wrong-tech', label: 'Wrong tech', count: wrongTechCount },
                            ] as const).map(t => (
                                <InnerTabsTrigger key={t.value} value={t.value} className="tab">
                                    {t.label}{t.count > 0 && <span className="tab-count">({t.count})</span>}
                                </InnerTabsTrigger>
                            ))}
                        </InnerTabsList>
                        <InnerTabsContent value="anomalies" className="m-0">
                        <div className="space-y-4 text-left">
                            <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-wider border-b border-border-sub pb-2 px-1">Anomalies</h3>
                            {anomalyCounts === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                                    <ShieldAlert size={28} className="text-text-green" />
                                    <p className="text-[11px] font-bold text-text-green tracking-wide">All clear — no anomalies</p>
                                    <p className="text-[10px] text-text-muted uppercase tracking-wider">Every job is assigned and every weekly log is submitted.</p>
                                </div>
                            ) : (
                                <div className="space-y-2 text-left">
                                    {anomalyPager.items.map(row => row.kind === 'job' ? (
                                        <div key={row.id} className="p-2.5 rounded-lg border border-border-alert bg-brand-red-dim/5 flex gap-3 text-left items-start">
                                            <AlertTriangle size={14} className="text-text-red mt-0.5 shrink-0" />
                                            <div className="space-y-0.5 text-left min-w-0">
                                                <p className="text-[11px] font-bold text-text-red tracking-wide truncate">{row.wo.title || row.wo.id}</p>
                                                <p className="text-[10px] text-text-muted uppercase tracking-wider">Unassigned — no technician yet</p>
                                            </div>
                                        </div>
                                    ) : (() => {
                                        const tech = technicians.find(t => t.id === row.wl.techId);
                                        return (
                                            <div key={row.id} className="p-2.5 rounded-lg border border-border-warn bg-brand-amber-dim/5 flex gap-3 text-left items-start">
                                                <Clock size={14} className="text-text-amber mt-0.5 shrink-0" />
                                                <div className="space-y-0.5 text-left min-w-0">
                                                    <p className="text-[11px] font-bold text-text-amber tracking-wide">Week of {row.wl.weekOf}{tech ? ` — ${tech.name}` : ''}</p>
                                                    <p className="text-[10px] text-text-muted uppercase tracking-wider">Draft log not submitted</p>
                                                </div>
                                            </div>
                                        );
                                    })())}
                                    <ListPager pager={anomalyPager} noun="flags" />
                                </div>
                            )}
                        </div>
                        </InnerTabsContent>
                        <InnerTabsContent value="unlogged" className="m-0">
                            <UnloggedCompletions rows={unloggedAudit.rows} excluded={unloggedAudit.excluded} technicians={technicians} currentUser={currentUser} />
                        </InnerTabsContent>
                        <InnerTabsContent value="wrong-tech" className="m-0">
                            <WrongTechEntries entries={wrongTechEntries} desynced={desyncedAssignments} technicians={technicians} currentUser={currentUser} />
                        </InnerTabsContent>
                    </InnerTabs>
                </TabsContent>

                <TabsContent value="techs" className="m-0">
                    {selectedTechId && activeTech && techStats ? (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedTechId(null)} className="h-8 text-[10px] font-bold text-text-muted">
                                <ArrowLeft size={14} className="mr-2"/> Back to technicians
                            </Button>

                            <div className="flex flex-col lg:flex-row gap-6">
                                <div className="lg:w-1/3 space-y-4">
                                    <Card className="bg-bg-secondary border-border-main">
                                        <CardContent className="p-5 space-y-4 text-center">
                                            <Avatar className="h-14 w-14 border-2 border-brand-red mx-auto">
                                                <AvatarImage src={activeTech.avatarUrl} />
                                                <AvatarFallback className="text-[10px]">{(activeTech.name || 'U').charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <h2 className="text-lg font-bold text-text-primary tracking-wide">{activeTech.name}</h2>
                                                <p className="text-[10px] text-text-muted font-mono uppercase tracking-wider">{activeTech.email}</p>
                                            </div>
                                            <div className="pt-3 border-t border-border-sub/30 space-y-1">
                                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Penalty points</p>
                                                <p className={cn("text-4xl font-mono font-bold", techStats.points === 0 ? 'text-text-green' : 'text-accent-gold')}>{techStats.points}</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button variant="outline" size="sm" className="flex-1 h-8 !text-[10px] font-bold" asChild>
                                                    <a href={`mailto:${activeTech.email}`}><Mail size={12} className="mr-1.5"/> Email</a>
                                                </Button>
                                                <Button variant="outline" size="sm" className="flex-1 h-8 !text-[10px] font-bold" asChild>
                                                    <a href={`tel:${activeTech.phone}`}><Phone size={12} className="mr-1.5"/> Call</a>
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>

                                <div className="flex-1 overflow-hidden">
                                    <InnerTabs defaultValue="assignments" className="w-full">
                                        <InnerTabsList className="tabs mb-4">
                                            <InnerTabsTrigger value="assignments" className="tab">Assignments ({techStats.myJobs.length})</InnerTabsTrigger>
                                            <InnerTabsTrigger value="weeklogs" className="tab">Weekly logs ({techStats.myLogs.length})</InnerTabsTrigger>
                                        </InnerTabsList>
                                        <InnerTabsContent value="assignments" className="m-0">
                                            <div className="table-wrap p-0">
                                                <Table>
                                                    <TableHeader className="bg-bg-tertiary">
                                                        <TableRow className="hover:bg-transparent border-border-sub">
                                                            <TableHead className="text-[10px] uppercase font-bold tracking-wider pl-4">Job</TableHead>
                                                            <TableHead className="text-[10px] uppercase font-bold tracking-wider">Date</TableHead>
                                                            <TableHead className="text-[10px] uppercase font-bold tracking-wider text-center">Status</TableHead>
                                                            <TableHead className="text-[10px] uppercase font-bold tracking-wider text-right pr-4">Admin</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {techJobsPager.items.map(wo => (
                                                            <TableRow key={wo.id} className="border-border-sub hover:bg-bg-tertiary cursor-pointer" onClick={() => setManagedJob(wo)}>
                                                                <TableCell className="pl-4 py-3">
                                                                    <p className="text-xs font-bold text-text-primary">{wo.title || wo.description}</p>
                                                                    <JobNumbers wo={wo} className="mt-0.5" />
                                                                </TableCell>
                                                                <TableCell className="text-[10px] font-mono text-text-secondary">{formatDateDisplay(wo.scheduleDate)}</TableCell>
                                                                <TableCell className="text-center">
                                                                    <StatusBadge kind="job" value={wo.status} label={JOB_STATUS_OPTIONS.find(o => o.value === wo.status)?.label} />
                                                                </TableCell>
                                                                <TableCell className="text-right pr-4">
                                                                    <Button variant="outline" size="sm" className="h-7 text-[11px] font-bold" onClick={e => { e.stopPropagation(); setManagedJob(wo); }}>
                                                                        Manage
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                        {techStats.myJobs.length === 0 && (
                                                            <TableRow><TableCell colSpan={4} className="text-center text-text-muted text-[10px] py-8">No jobs yet</TableCell></TableRow>
                                                        )}
                                                    </TableBody>
                                                </Table>
                                                <div className="px-3"><ListPager pager={techJobsPager} noun="jobs" /></div>
                                            </div>
                                        </InnerTabsContent>
                                        <InnerTabsContent value="weeklogs" className="m-0">
                                            <div className="space-y-2">
                                                {techLogsPager.items.map(log => (
                                                    <div key={log.id} className="p-3 rounded-lg border border-border-sub bg-bg-secondary flex items-center justify-between">
                                                        <div>
                                                            <p className="text-[10px] font-bold text-text-primary">Week of {log.weekOf}</p>
                                                            {canSeePay ? (
                                                                <p className="text-[11px] text-text-muted">Payout: ${computeWeeklyLogSettlement(log, jobsById).toFixed(2)}</p>
                                                            ) : (
                                                                <p className="text-[11px] text-text-muted">{log.items?.length || 0} job{(log.items?.length || 0) !== 1 ? 's' : ''}</p>
                                                            )}
                                                        </div>
                                                        <StatusBadge kind="log" value={logDisplayStatus(log)} />
                                                    </div>
                                                ))}
                                                {techStats.myLogs.length === 0 && (
                                                    <p className="text-center text-text-muted text-[10px] py-8">No weekly logs yet</p>
                                                )}
                                                <ListPager pager={techLogsPager} noun="logs" />
                                            </div>
                                        </InnerTabsContent>
                                    </InnerTabs>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex justify-between items-center px-1 mb-4">
                                <p className="text-[11px] font-bold text-text-muted">{staffTechs.length} Technicians</p>
                                <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold text-text-muted" onClick={() => setSelectedTechId(null)}>
                                    <RefreshCw size={12} className="mr-1.5"/> Refresh
                                </Button>
                            </div>
                            {staffTechs.map(t => {
                                const pts = penaltyPoints(allPenalties, t.id);
                                const isReliable = pts <= 2;
                                return (
                                    <div key={t.id} onClick={() => setSelectedTechId(t.id)}
                                        className="flex items-center justify-between p-2.5 rounded-lg bg-bg-secondary border border-border-main hover:border-brand-red transition-all cursor-pointer group">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-10 w-10 border border-border-sub">
                                                <AvatarImage src={t.avatarUrl} />
                                                <AvatarFallback className="text-[10px]">{(t.name || 'U').charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="text-sm font-bold text-text-primary tracking-wide group-hover:text-brand-red transition-colors">{t.name || 'Unnamed technician'}</p>
                                                <p className="text-[10px] text-text-muted uppercase tracking-wider mt-0.5">{t.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <div className="text-right">
                                                <p className={cn("text-xs font-bold", isReliable ? 'text-text-green' : 'text-accent-gold')}>
                                                    {pts} PTS · {isReliable ? 'Reliable' : 'At Risk'}
                                                </p>
                                            </div>
                                            <Badge variant={isReliable ? 'active' : 'onhold'} className="h-5 text-[10px] uppercase tracking-wider">
                                                {isReliable ? 'Clean' : 'Audit Required'}
                                            </Badge>
                                            <ChevronRight size={16} className="text-text-muted group-hover:text-text-primary transition-all" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="insights" className="m-0 space-y-8">
                    <PerformanceStats />
                    <FieldNationCheck />
                    <div>
                    <h3 className="text-sm font-semibold text-text-primary">Work quality</h3>
                    <p className="text-[12px] text-text-muted mb-4">Completions, cancellations and revisits. Money and locations are on Work &amp; revenue.</p>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                        {/* Last 6 months */}
                        <div className="lg:col-span-2 space-y-2">
                            <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-wider border-b border-border-sub pb-2">Last 6 months</h3>
                            <div className="rounded-lg border border-border-sub overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-[11px]">Month</TableHead>
                                            <TableHead className="text-[11px] text-right">Jobs</TableHead>
                                            <TableHead className="text-[11px] text-right">Completed</TableHead>
                                            <TableHead className="text-[11px] text-right">Cancelled</TableHead>
                                            <TableHead className="text-[11px] text-right">Revisits</TableHead>
                                            <TableHead className="text-[11px] text-right">Revisit rate</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {monthlyQuality.map(m => (
                                            <TableRow key={m.label}>
                                                <TableCell className="text-[11px] font-bold">{m.label}</TableCell>
                                                <TableCell className="text-[11px] font-mono text-right">{m.total}</TableCell>
                                                <TableCell className="text-[11px] font-mono text-right">{m.completed}</TableCell>
                                                <TableCell className="text-[11px] font-mono text-right">{m.cancelled}</TableCell>
                                                <TableCell className="text-[11px] font-mono text-right">{m.revisits}</TableCell>
                                                <TableCell className={cn('text-[11px] font-mono text-right', m.revisitRate > 20 ? 'text-text-red font-bold' : 'text-text-muted')}>{m.total ? `${m.revisitRate}%` : '—'}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        {/* Tech Reliability Trends */}
                        <div className="lg:col-span-2 space-y-2">
                            <div className="border-b border-border-sub pb-2">
                                <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                                    Technician reliability
                                    {revisitFlagCount > 0 && <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">{revisitFlagCount} over 20% revisits</Badge>}
                                </h3>
                                <p className="text-[11px] text-text-muted mt-1">Completion = completed ÷ jobs that were due (scheduled today or earlier, not cancelled). Techs with revisits over 20% are listed first, in red.</p>
                            </div>
                            {techReliability.length === 0 ? (
                                <p className="text-[10px] text-text-muted py-4 text-center">No assignment data</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {techReliability.map(t => (
                                        <div key={t.id} className={cn("flex items-center gap-3 p-2.5 rounded-lg border", t.revisitRate > 20 ? "border-border-alert bg-brand-red-dim/10" : "bg-bg-secondary border-border-main")}>
                                            <Avatar className="h-8 w-8 border border-border-sub shrink-0">
                                                <AvatarImage src={t.avatarUrl} />
                                                <AvatarFallback className="text-[11px]">{(t.name || 'U')[0]}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[11px] font-bold text-text-primary truncate">{t.name}</p>
                                                <div className="flex gap-3 mt-1">
                                                    <div className="flex-1">
                                                        <div className="flex justify-between mb-0.5">
                                                            <span className="text-[10px] text-text-muted">Completion</span>
                                                            <span className="text-[10px] font-bold text-text-green">{t.completionRate}%</span>
                                                        </div>
                                                        <div className="h-1 bg-bg-tertiary rounded-full">
                                                            <div className="h-1 bg-text-green rounded-full" style={{ width: `${t.completionRate}%` }} />
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-[10px] text-text-muted">Revisit</p>
                                                        <p className={cn("text-[10px] font-bold", t.revisitRate > 20 ? 'text-text-red' : 'text-text-muted')}>{t.revisitRate}%</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-[11px] font-bold text-text-primary">{t.completed}/{t.total}</p>
                                                <p className="text-[10px] text-text-muted">Done / due</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Common Failure Patterns */}
                        <div className="lg:col-span-2 space-y-2">
                            <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-wider border-b border-border-sub pb-2">Common failures (revisits by job type)</h3>
                            {failurePatterns.length === 0 ? (
                                <div className="flex items-center gap-2 py-3 text-text-green">
                                    <ShieldAlert size={14} />
                                    <p className="text-[10px] font-bold">No revisit patterns detected</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {failurePatterns.map(({ type, count }) => (
                                        <div key={type} className="p-3 rounded-lg border border-border-warn bg-brand-amber-dim/5 text-center">
                                            <p className="text-2xl font-bold font-mono text-text-amber">{count}</p>
                                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mt-1">{type}</p>
                                            <p className="text-[10px] text-text-muted">revisit{count !== 1 ? 's' : ''}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>
                    </div>
                </TabsContent>

                {/* App Activity Tab */}

            </Tabs>

            {/* Admin job controls from the Techs tab (force complete, swap tech, helpers, …). */}
            <JobDetailDialog isOpen={!!managedJob} setIsOpen={open => { if (!open) setManagedJob(null); }} mission={managedJob ? (missions.find(m => m.id === managedJob.id) as WorkOrder) || managedJob : null} hidePay={!canSeePay} />

        </div>
    );
}

