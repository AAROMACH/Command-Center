'use client';

import { useState, useMemo, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { isTech } from '@/lib/permissions';
import { BarChart2, ShieldAlert, Users, AlertTriangle, Clock, ChevronRight, Mail, Phone, ArrowLeft, RefreshCw, Filter, X, Activity as ActivityIcon } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { cn, isInactiveTechnician } from '@/lib/utils';
import type { WorkOrder, Technician, WeeklyLog, Invoice } from '@/lib/types';
import { IntelligenceTerminal } from '../reports/components/intelligence-terminal';
import { penaltyEvents } from '@/lib/data';
import { getReliabilityTier } from '@/lib/reliability';
import { effectiveJobPay, netOfFieldNationFee } from '@/lib/payroll';
import { Tabs as InnerTabs, TabsList as InnerTabsList, TabsTrigger as InnerTabsTrigger, TabsContent as InnerTabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { DateRangeButton } from '@/components/list-toolbar';
import { mergeJobs, jobTechId, jobDateTimeValue, JOB_STATUS_OPTIONS } from '@/lib/jobs';
import { isSuperAdmin, isPayAdmin } from '@/lib/permissions';
import { computeWeeklyLogSettlement } from '@/lib/payroll';
import { JobDetailDialog } from '@/components/job-detail-dialog';
import { topClients, topCities } from '@/lib/intel-insights';
import dynamic from 'next/dynamic';

// Leaflet touches window — load the density map in the browser only.
const JobDensityMap = dynamic(() => import('./components/job-density-map').then(m => m.JobDensityMap), {
    ssr: false,
    loading: () => <div className="h-[520px] rounded-lg border border-border-main bg-bg-tertiary/30 flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-text-muted">Loading map…</div>,
});
import { findUnloggedCompletions, findMismatchedLogEntries, findDesyncedAssignments } from '@/lib/weekly-log-audit';
import { UnloggedCompletions } from './components/unlogged-completions';
import { WrongTechEntries } from './components/wrong-tech-entries';

export default function FieldIntelligencePage() {
    const [activeTab, setActiveTabRaw] = useState(() => { try { return localStorage.getItem('cc:intel:tab') || 'intelligence'; } catch { return 'intelligence'; } });
    const setActiveTab = (v: string) => { setActiveTabRaw(v); try { localStorage.setItem('cc:intel:tab', v); } catch {} };
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [assignments, setAssignments] = useState<WorkOrder[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [archivedJobs, setArchivedJobs] = useState<WorkOrder[]>([]);
    const [selectedTechId, setSelectedTechId] = useState<string | null>(null);

    // Intelligence filter state
    const [intelPersonnel, setIntelPersonnel] = useState('all');
    const [intelClient, setIntelClient] = useState('all');
    const [timeWindow, setTimeWindow] = useState<'7d' | '30d' | '90d' | '1y' | 'all'>('30d');

    // App Activity tab state
    const [timelineTechFilter, setTimelineTechFilter] = useState('all');
    const [timelineTypeFilter, setTimelineTypeFilter] = useState('all');
    const [timelineDateRange, setTimelineDateRange] = useState<DateRange | undefined>(undefined);
    const [timelinePageSize, setTimelinePageSize] = useState<10 | 25 | 50>(25);
    const [timelinePage, setTimelinePage] = useState(0);

    useEffect(() => {
        const unsubWO = onSnapshot(collection(db, 'workOrders'), (snap) => {
            setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });
        const unsubAsmt = onSnapshot(collection(db, 'assignments'), (snap) => {
            setAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });
        const unsubTech = onSnapshot(collection(db, 'users'), (snap) => {
            setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
        });
        const unsubLogs = onSnapshot(collection(db, 'weeklyLogs'), (snap) => {
            setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)));
        });
        const unsubInv = onSnapshot(collection(db, 'invoices'), (snap) => {
            setInvoices(snap.docs.map(d => ({ ...d.data(), id: d.id } as Invoice)));
        });
        const unsubArchive = onSnapshot(collection(db, 'activityArchive'), (snap) => {
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
        return () => { unsubWO(); unsubAsmt(); unsubTech(); unsubLogs(); unsubInv(); unsubArchive(); };
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

    // Density map follows the Intel filters (time window, personnel, client).
    const densityJobs = useMemo(() => {
        const days = timeWindow === '7d' ? 7 : timeWindow === '30d' ? 30 : timeWindow === '90d' ? 90 : timeWindow === '1y' ? 365 : null;
        const cutoff = days ? Date.now() - days * 864e5 : null;
        return missions.filter(j => {
            if (intelClient !== 'all' && j.clientName !== intelClient) return false;
            if (intelPersonnel !== 'all' && jobTechId(j) !== intelPersonnel) return false;
            if (cutoff !== null) {
                const t = jobDateTimeValue(j.scheduleDate, null);
                if (!t || t < cutoff) return false;
            }
            return true;
        });
    }, [missions, timeWindow, intelClient, intelPersonnel]);
    const flagsTotal = anomalyCounts + unloggedAudit.rows.length + wrongTechCount;
    const [flagsView, setFlagsView] = useState<'anomalies' | 'unlogged' | 'wrong-tech'>('anomalies');
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    // Techs tab: pay figures only for super admins and payroll/financial admins.
    const [managedJob, setManagedJob] = useState<WorkOrder | null>(null);
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
        const penalties = penaltyEvents.filter(pe => pe.techId === selectedTechId);
        const points = penalties.reduce((acc, curr) => acc + Math.abs(curr.scoreChange), 0);
        const myLogs = weeklyLogs.filter(log => log.techId === selectedTechId)
            .sort((a, b) => {
                const [am, ad, ay] = a.weekOf.split('-');
                const [bm, bd, by] = b.weekOf.split('-');
                return new Date(parseInt(by), parseInt(bm)-1, parseInt(bd)).getTime() -
                       new Date(parseInt(ay), parseInt(am)-1, parseInt(ad)).getTime();
            });
        const totalEarnings = myLogs.filter(l => l.status === 'Approved').reduce((acc, log) => acc + (log.totalPayout || 0), 0);
        return { total: myJobs.length, completed, points, penalties, totalEarnings, myJobs, myLogs };
    }, [selectedTechId, assignments, weeklyLogs]);

    // Insights tab computed values
    const techReliability = useMemo(() => {
        return staffTechs.map(tech => {
            const techJobs = assignments.filter(wo =>
                wo.assignedTechnicianId === tech.id || wo.techId === tech.id
            );
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
        }).filter(t => t.total > 0).sort((a, b) => b.completionRate - a.completionRate);
    }, [staffTechs, assignments]);

    const revisitFlags = useMemo(
        () => techReliability.filter(t => t.revisitRate > 20),
        [techReliability]
    );

    const underpaidWarnings = useMemo(
        () => workOrders.filter(wo => wo.status !== 'completed' && (!wo.pay || wo.pay < 30)).slice(0, 20),
        [workOrders]
    );

    // Insights: top clients (with gross profit) and top cities — lib/intel-insights.ts.
    const topClientRows = useMemo(
        () => topClients(mergeJobs(workOrders, assignments), weeklyLogs, invoices, 10),
        [workOrders, assignments, weeklyLogs, invoices],
    );
    const topCityRows = useMemo(() => topCities(mergeJobs(workOrders, assignments), 10), [workOrders, assignments]);

    const failurePatterns = useMemo(() => {
        const revisitWOs = workOrders.filter(wo =>
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
    }, [workOrders]);

    type TimelineEvent = { id: string; timestamp: string; type: string; eventLabel: string; entity: string; techName?: string; techId?: string; clientName?: string; color: string; };

    const timelineEvents = useMemo((): TimelineEvent[] => {
        const events: TimelineEvent[] = [];
        assignments.forEach(wo => {
            const techId = wo.assignedTechnicianId || wo.techId;
            const tech = technicians.find(t => t.id === techId);
            if ((wo as any).assignedAt) events.push({ id: `asmt-${wo.id}`, timestamp: (wo as any).assignedAt, type: 'assignment', eventLabel: 'Assignment Created', entity: wo.title || wo.description || wo.id.toUpperCase(), techName: tech?.name, techId, clientName: wo.clientName, color: 'text-accent-gold' });
            if (['completed','checked-out'].includes(wo.status) && (wo as any).updatedAt) events.push({ id: `asmt-done-${wo.id}`, timestamp: (wo as any).updatedAt, type: 'assignment', eventLabel: wo.status === 'completed' ? 'Job Completed' : 'Checked Out', entity: wo.title || wo.description || wo.id.toUpperCase(), techName: tech?.name, techId, clientName: wo.clientName, color: 'text-text-green' });
        });
        workOrders.forEach(wo => { if ((wo as any).createdAt) events.push({ id: `wo-${wo.id}`, timestamp: (wo as any).createdAt, type: 'work_order', eventLabel: 'Work Order Created', entity: wo.title || wo.description || wo.id.toUpperCase(), clientName: wo.clientName, color: 'text-text-muted' }); });
        weeklyLogs.forEach(log => {
            const tech = technicians.find(t => t.id === log.techId);
            if (log.submittedAt) events.push({ id: `log-sub-${log.id}`, timestamp: log.submittedAt, type: 'log', eventLabel: 'Weekly Log Submitted', entity: `Week of ${log.weekOf}`, techName: tech?.name, techId: log.techId, color: 'text-accent-gold' });
            if (log.status === 'Approved') events.push({ id: `log-appr-${log.id}`, timestamp: log.submittedAt || log.weekOf, type: 'log', eventLabel: 'Weekly Log Approved', entity: `Week of ${log.weekOf}`, techName: tech?.name, techId: log.techId, color: 'text-text-green' });
        });
        invoices.forEach(inv => {
            if (inv.issueDate) events.push({ id: `inv-${inv.id}`, timestamp: inv.issueDate, type: 'invoice', eventLabel: 'Invoice Issued', entity: `#${(inv as any).invoiceNumber || inv.id} — $${(inv.total || 0).toFixed(2)}`, clientName: inv.clientName, color: 'text-text-muted' });
        });
        return events.filter(e => !!e.timestamp).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }, [assignments, workOrders, weeklyLogs, invoices, technicians]);

    const filteredTimelineEvents = useMemo(() => {
        const from = timelineDateRange?.from ? startOfDay(timelineDateRange.from).getTime() : null;
        const to = timelineDateRange?.from ? endOfDay(timelineDateRange.to || timelineDateRange.from).getTime() : null;
        return timelineEvents.filter(e => {
            if (timelineTechFilter !== 'all' && e.techId !== timelineTechFilter) return false;
            if (timelineTypeFilter !== 'all' && e.type !== timelineTypeFilter) return false;
            if (from !== null && to !== null) {
                const t = new Date(e.timestamp).getTime();
                if (isNaN(t) || t < from || t > to) return false;
            }
            return true;
        });
    }, [timelineEvents, timelineTechFilter, timelineTypeFilter, timelineDateRange]);
    // Back to page 1 whenever the filters or page size change.
    useEffect(() => { setTimelinePage(0); }, [timelineTechFilter, timelineTypeFilter, timelineDateRange, timelinePageSize]);
    const timelinePageCount = Math.max(1, Math.ceil(filteredTimelineEvents.length / timelinePageSize));
    const timelinePageEvents = filteredTimelineEvents.slice(timelinePage * timelinePageSize, (timelinePage + 1) * timelinePageSize);

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
            <header className="page-header">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <BarChart2 size={12} />
                        Real-time Field Operations
                    </p>
                    <h1 className="page-title">Intel</h1>
                    <p className="page-subtitle">Live field awareness, technician status, and operational analytics.</p>
                </div>
            </header>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex justify-center">
                    <TabsList className="tabs border-b-2 border-border-sub bg-transparent rounded-none h-auto p-0 gap-8 justify-center mb-8">
                        <TabsTrigger value="intelligence" className="tab-trigger-activity">Intel</TabsTrigger>
                        <TabsTrigger value="techs" className="tab-trigger-activity" onClick={() => setSelectedTechId(null)}>
                            Techs
                        </TabsTrigger>
                        <TabsTrigger value="app_activity" className="tab-trigger-activity">App Activity</TabsTrigger>
                        <TabsTrigger value="insights" className="tab-trigger-activity">Insights</TabsTrigger>
                        <TabsTrigger value="flags" className="tab-trigger-activity flex items-center gap-3">
                            Flags
                            {flagsTotal > 0 && (
                                <Badge variant="destructive" className="h-5 px-1.5 text-[9px] min-w-[20px] flex items-center justify-center font-black">{flagsTotal}</Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="intelligence" className="m-0">
                    {/* Filter bar */}
                    <div className="flex flex-wrap items-center gap-3 mb-5 p-3 bg-bg-secondary/60 border border-border-sub rounded-xl">
                        <div className="flex items-center gap-2 shrink-0">
                            <Filter size={12} className="text-text-muted" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">Filters</span>
                        </div>
                        <Select value={intelPersonnel} onValueChange={setIntelPersonnel}>
                            <SelectTrigger className="h-8 w-[160px] bg-bg-primary border-border-main text-[10px] font-bold uppercase">
                                <SelectValue placeholder="Personnel" />
                            </SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main">
                                <SelectItem value="all" className="text-[10px] font-bold uppercase">All Personnel</SelectItem>
                                {staffTechs.map(t => (
                                    <SelectItem key={t.id} value={t.id} className="text-[10px] font-bold uppercase">{t.name || t.id}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={intelClient} onValueChange={setIntelClient}>
                            <SelectTrigger className="h-8 w-[160px] bg-bg-primary border-border-main text-[10px] font-bold uppercase">
                                <SelectValue placeholder="Client" />
                            </SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main">
                                <SelectItem value="all" className="text-[10px] font-bold uppercase">All Clients</SelectItem>
                                {clientNames.map(name => (
                                    <SelectItem key={name} value={name} className="text-[10px] font-bold uppercase">{name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={timeWindow} onValueChange={(v: any) => setTimeWindow(v)}>
                            <SelectTrigger className="h-8 w-[160px] bg-bg-primary border-border-main text-[10px] font-bold uppercase">
                                <SelectValue placeholder="Time Window" />
                            </SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main">
                                <SelectItem value="7d" className="text-[10px] font-bold uppercase">Past Week</SelectItem>
                                <SelectItem value="30d" className="text-[10px] font-bold uppercase">Past Month</SelectItem>
                                <SelectItem value="90d" className="text-[10px] font-bold uppercase">Past 3 Months</SelectItem>
                                <SelectItem value="1y" className="text-[10px] font-bold uppercase">Past Year</SelectItem>
                                <SelectItem value="all" className="text-[10px] font-bold uppercase">All Time</SelectItem>
                            </SelectContent>
                        </Select>
                        {(intelPersonnel !== 'all' || intelClient !== 'all' || timeWindow !== '30d') && (
                            <button
                                onClick={() => { setIntelPersonnel('all'); setIntelClient('all'); setTimeWindow('30d'); }}
                                className="h-8 px-3 text-[9px] font-black uppercase tracking-widest text-brand-red hover:underline"
                            >
                                Clear
                            </button>
                        )}
                        <div className="ml-auto flex gap-2 flex-wrap">
                            {intelPersonnel !== 'all' && <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded border border-blue-400/30 bg-blue-400/10 text-blue-400">{staffTechs.find(t => t.id === intelPersonnel)?.name || intelPersonnel}</span>}
                            {intelClient !== 'all' && <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded border border-amber-400/30 bg-amber-400/10 text-amber-400">{intelClient}</span>}
                        </div>
                    </div>
                    <Card className="bg-bg-secondary border-border-main mb-5">
                        <CardContent className="p-4 space-y-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-text-primary">Job Density — Michigan &amp; Ohio</p>
                                    <p className="text-[10px] text-text-muted">Darker squares = more jobs in that area for the selected filters. Hover a square for the count and top cities.</p>
                                </div>
                            </div>
                            <JobDensityMap jobs={densityJobs} />
                        </CardContent>
                    </Card>
                    <IntelligenceTerminal
                        timeWindow={timeWindow}
                        personnel={intelPersonnel}
                        client={intelClient}
                    />
                </TabsContent>

                <TabsContent value="flags" className="m-0">
                    <InnerTabs value={flagsView} onValueChange={(v: any) => setFlagsView(v)} className="w-full">
                        <InnerTabsList className="tabs mb-4">
                            {([
                                { value: 'anomalies', label: 'Anomalies', count: anomalyCounts },
                                { value: 'unlogged', label: 'Unlogged Jobs', count: unloggedAudit.rows.length },
                                { value: 'wrong-tech', label: 'Wrong Tech', count: wrongTechCount },
                            ] as const).map(t => (
                                <InnerTabsTrigger key={t.value} value={t.value} className="tab">
                                    {t.label}{t.count > 0 && <span className="tab-count">({t.count})</span>}
                                </InnerTabsTrigger>
                            ))}
                        </InnerTabsList>
                        <InnerTabsContent value="anomalies" className="m-0">
                        <div className="space-y-4 text-left">
                            <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1">Anomaly Registry</h3>
                            {anomalyCounts === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                                    <ShieldAlert size={28} className="text-text-green" />
                                    <p className="text-[11px] font-bold text-text-green uppercase tracking-wide">All Clear — No Anomalies Detected</p>
                                    <p className="text-[10px] text-text-muted uppercase tracking-widest">All work orders assigned. All weekly logs submitted.</p>
                                </div>
                            ) : (
                                <div className="space-y-2 text-left">
                                    {workOrders.filter(wo => wo.status === 'unassigned').map(wo => (
                                        <div key={wo.id} className="p-2.5 rounded-lg border border-border-alert bg-brand-red-dim/5 flex gap-3 text-left items-start">
                                            <AlertTriangle size={14} className="text-text-red mt-0.5 shrink-0" />
                                            <div className="space-y-0.5 text-left min-w-0">
                                                <p className="text-[11px] font-bold text-text-red uppercase tracking-wide truncate">{wo.title || wo.id}</p>
                                                <p className="text-[10px] text-text-muted uppercase tracking-widest">Unassigned — no technician allocated</p>
                                            </div>
                                        </div>
                                    ))}
                                    {activeWeeklyLogs.filter(wl => wl.status === 'Draft').map(wl => {
                                        const tech = technicians.find(t => t.id === wl.techId);
                                        return (
                                            <div key={wl.id} className="p-2.5 rounded-lg border border-border-warn bg-brand-amber-dim/5 flex gap-3 text-left items-start">
                                                <Clock size={14} className="text-text-amber mt-0.5 shrink-0" />
                                                <div className="space-y-0.5 text-left min-w-0">
                                                    <p className="text-[11px] font-bold text-text-amber uppercase tracking-wide">Week of {wl.weekOf}{tech ? ` — ${tech.name}` : ''}</p>
                                                    <p className="text-[10px] text-text-muted uppercase tracking-widest">Draft log not submitted</p>
                                                </div>
                                            </div>
                                        );
                                    })}
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
                            <Button variant="ghost" size="sm" onClick={() => setSelectedTechId(null)} className="h-8 text-[10px] uppercase font-bold text-text-muted">
                                <ArrowLeft size={14} className="mr-2"/> Back to Roster
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
                                                <h2 className="text-lg font-bold text-text-primary uppercase tracking-wide">{activeTech.name}</h2>
                                                <p className="text-[10px] text-text-muted font-mono uppercase tracking-widest">{activeTech.email}</p>
                                            </div>
                                            <div className="pt-3 border-t border-border-sub/30 space-y-1">
                                                <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em]">Penalty Points</p>
                                                <p className={cn("text-4xl font-mono font-bold", techStats.points === 0 ? 'text-text-green' : 'text-accent-gold')}>{techStats.points}</p>
                                                <Badge variant={techStats.points <= 2 ? 'active' : 'onhold'} className="h-5 px-3 uppercase text-[8px] tracking-widest">
                                                    {getReliabilityTier(Math.max(0, 100 - techStats.points * 5))}
                                                </Badge>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button variant="outline" size="sm" className="flex-1 h-8 !text-[10px] font-bold uppercase" asChild>
                                                    <a href={`mailto:${activeTech.email}`}><Mail size={12} className="mr-1.5"/> Email</a>
                                                </Button>
                                                <Button variant="outline" size="sm" className="flex-1 h-8 !text-[10px] font-bold uppercase" asChild>
                                                    <a href={`tel:${activeTech.phone}`}><Phone size={12} className="mr-1.5"/> Call</a>
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>

                                <div className="flex-1 overflow-hidden">
                                    <InnerTabs defaultValue="assignments" className="w-full">
                                        <InnerTabsList className="tabs bg-bg-secondary/50 border border-border-sub mb-4 h-10 w-full justify-start gap-8 px-4">
                                            <InnerTabsTrigger value="assignments" className="tab h-full data-[state=active]:bg-brand-red">Assignments ({techStats.myJobs.length})</InnerTabsTrigger>
                                            <InnerTabsTrigger value="weeklogs" className="tab h-full data-[state=active]:bg-brand-red">Weekly Logs ({techStats.myLogs.length})</InnerTabsTrigger>
                                        </InnerTabsList>
                                        <InnerTabsContent value="assignments" className="m-0">
                                            <div className="table-wrap p-0">
                                                <Table>
                                                    <TableHeader className="bg-bg-tertiary">
                                                        <TableRow className="hover:bg-transparent border-border-sub">
                                                            <TableHead className="text-[9px] uppercase font-black tracking-widest pl-4">Mission</TableHead>
                                                            <TableHead className="text-[9px] uppercase font-black tracking-widest">Date</TableHead>
                                                            <TableHead className="text-[9px] uppercase font-black tracking-widest text-center">Status</TableHead>
                                                            <TableHead className="text-[9px] uppercase font-black tracking-widest text-right pr-4">Admin</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {techStats.myJobs.map(wo => (
                                                            <TableRow key={wo.id} className="border-border-sub hover:bg-bg-tertiary cursor-pointer" onClick={() => setManagedJob(wo)}>
                                                                <TableCell className="pl-4 py-3">
                                                                    <p className="text-xs font-bold text-text-primary uppercase">{wo.title || wo.description}</p>
                                                                    <p className="text-[9px] text-text-muted font-mono">{wo.id.toUpperCase()}</p>
                                                                </TableCell>
                                                                <TableCell className="text-[10px] font-mono text-text-secondary uppercase">{formatDateDisplay(wo.scheduleDate)}</TableCell>
                                                                <TableCell className="text-center">
                                                                    <Badge variant={wo.status === 'completed' ? 'active' : 'onhold'} className="h-4 text-[7px] uppercase tracking-widest">{JOB_STATUS_OPTIONS.find(o => o.value === wo.status)?.label || wo.status}</Badge>
                                                                </TableCell>
                                                                <TableCell className="text-right pr-4">
                                                                    <Button variant="outline" size="sm" className="h-7 text-[9px] uppercase font-bold" onClick={e => { e.stopPropagation(); setManagedJob(wo); }}>
                                                                        Manage
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                        {techStats.myJobs.length === 0 && (
                                                            <TableRow><TableCell colSpan={4} className="text-center text-text-muted text-[10px] uppercase py-8">No assignments found</TableCell></TableRow>
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </InnerTabsContent>
                                        <InnerTabsContent value="weeklogs" className="m-0">
                                            <div className="space-y-2">
                                                {techStats.myLogs.map(log => (
                                                    <div key={log.id} className="p-3 rounded-lg border border-border-sub bg-bg-secondary flex items-center justify-between">
                                                        <div>
                                                            <p className="text-[10px] font-bold text-text-primary uppercase">Week of {log.weekOf}</p>
                                                            {canSeePay ? (
                                                                <p className="text-[9px] text-text-muted uppercase">Payout: ${computeWeeklyLogSettlement(log, jobsById).toFixed(2)}</p>
                                                            ) : (
                                                                <p className="text-[9px] text-text-muted uppercase">{log.items?.length || 0} job{(log.items?.length || 0) !== 1 ? 's' : ''}</p>
                                                            )}
                                                        </div>
                                                        <Badge variant={log.status === 'Approved' ? 'active' : log.status === 'Submitted' ? 'scheduled' : 'onhold'} className="h-4 text-[7px] uppercase">{log.status}</Badge>
                                                    </div>
                                                ))}
                                                {techStats.myLogs.length === 0 && (
                                                    <p className="text-center text-text-muted text-[10px] uppercase py-8">No weekly logs found</p>
                                                )}
                                            </div>
                                        </InnerTabsContent>
                                    </InnerTabs>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex justify-between items-center px-1 mb-4">
                                <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest">{staffTechs.length} Technicians</p>
                                <Button variant="ghost" size="sm" className="h-7 text-[10px] uppercase font-bold text-text-muted" onClick={() => setSelectedTechId(null)}>
                                    <RefreshCw size={12} className="mr-1.5"/> Refresh
                                </Button>
                            </div>
                            {staffTechs.map(t => {
                                const pts = penaltyEvents.filter(p => p.techId === t.id).reduce((s, p) => s + Math.abs(p.scoreChange), 0);
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
                                                <p className="text-sm font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors">{t.name || 'Unnamed Operative'}</p>
                                                <p className="text-[10px] text-text-muted uppercase tracking-widest mt-0.5">{t.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <div className="text-right">
                                                <p className={cn("text-xs font-bold uppercase", isReliable ? 'text-text-green' : 'text-accent-gold')}>
                                                    {pts} PTS · {isReliable ? 'Reliable' : 'At Risk'}
                                                </p>
                                            </div>
                                            <Badge variant={isReliable ? 'active' : 'onhold'} className="h-5 text-[8px] uppercase tracking-widest">
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

                <TabsContent value="insights" className="m-0">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                        {/* Tech Reliability Trends */}
                        <div className="lg:col-span-2 space-y-2">
                            <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2">Tech Reliability Trends</h3>
                            {techReliability.length === 0 ? (
                                <p className="text-[10px] text-text-muted uppercase py-4 text-center">No assignment data</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {techReliability.map(t => (
                                        <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-bg-secondary border border-border-main">
                                            <Avatar className="h-8 w-8 border border-border-sub shrink-0">
                                                <AvatarImage src={t.avatarUrl} />
                                                <AvatarFallback className="text-[9px]">{(t.name || 'U')[0]}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[11px] font-bold text-text-primary uppercase truncate">{t.name}</p>
                                                <div className="flex gap-3 mt-1">
                                                    <div className="flex-1">
                                                        <div className="flex justify-between mb-0.5">
                                                            <span className="text-[8px] text-text-muted uppercase">Completion</span>
                                                            <span className="text-[8px] font-bold text-text-green">{t.completionRate}%</span>
                                                        </div>
                                                        <div className="h-1 bg-bg-tertiary rounded-full">
                                                            <div className="h-1 bg-text-green rounded-full" style={{ width: `${t.completionRate}%` }} />
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-[8px] text-text-muted uppercase">Revisit</p>
                                                        <p className={cn("text-[8px] font-bold", t.revisitRate > 20 ? 'text-text-red' : 'text-text-muted')}>{t.revisitRate}%</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-[11px] font-bold text-text-primary">{t.completed}/{t.total}</p>
                                                <p className="text-[8px] text-text-muted uppercase">Jobs</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Revisit Rate Flags */}
                        <div className="space-y-2">
                            <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 flex items-center gap-2">
                                Revisit Rate Flags
                                {revisitFlags.length > 0 && <Badge variant="destructive" className="h-4 px-1.5 text-[7px]">{revisitFlags.length}</Badge>}
                            </h3>
                            {revisitFlags.length === 0 ? (
                                <div className="flex items-center gap-2 py-3 text-text-green">
                                    <ShieldAlert size={14} />
                                    <p className="text-[10px] font-bold uppercase">No techs above 20% revisit threshold</p>
                                </div>
                            ) : revisitFlags.map(t => (
                                <div key={t.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border-alert bg-brand-red-dim/5">
                                    <div className="flex items-center gap-2">
                                        <Avatar className="h-7 w-7 border border-brand-red/30">
                                            <AvatarImage src={t.avatarUrl} />
                                            <AvatarFallback className="text-[9px]">{(t.name || 'U')[0]}</AvatarFallback>
                                        </Avatar>
                                        <p className="text-[11px] font-bold text-text-primary uppercase">{t.name}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[11px] font-bold text-text-red">{t.revisitRate}% revisit</p>
                                        <p className="text-[8px] text-text-muted uppercase">{t.revisits} of {t.total} jobs</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Underpaid Work Warnings */}
                        <div className="space-y-2">
                            <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 flex items-center gap-2">
                                Underpaid Work
                                {underpaidWarnings.length > 0 && <Badge variant="onhold" className="h-4 px-1.5 text-[7px]">{underpaidWarnings.length}</Badge>}
                            </h3>
                            {underpaidWarnings.length === 0 ? (
                                <p className="text-[10px] text-text-muted uppercase py-3">No underpaid jobs detected</p>
                            ) : underpaidWarnings.map(wo => (
                                <div key={wo.id} className="flex items-center justify-between p-2 rounded-lg border border-border-warn bg-brand-amber-dim/5">
                                    <div>
                                        <p className="text-[11px] font-bold text-text-amber uppercase">{wo.title || wo.id}</p>
                                        <p className="text-[9px] text-text-muted uppercase">{wo.clientName || 'No client'} — {wo.jobType || 'Unknown type'}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-[11px] font-bold text-text-amber">${wo.pay || 0}</p>
                                        <p className="text-[8px] text-text-muted uppercase">Pay</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Top 10 Clients */}
                        <div className="lg:col-span-2 space-y-2">
                            <div className="border-b border-border-sub pb-2">
                                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Top 10 Clients</h3>
                                <p className="text-[9px] text-text-muted mt-1 leading-relaxed">
                                    Ranked by job volume. Revenue = Field Nation jobs at pay net of the 15.85% FN fee, plus paid invoices (pre-tax) for direct work.
                                    Labor = what techs are paid for the completed jobs (weekly-log settlement, or the same formula on job pay when not logged yet).
                                </p>
                            </div>
                            {topClientRows.length === 0 ? (
                                <p className="text-[10px] text-text-muted uppercase py-3">No client jobs yet</p>
                            ) : (
                                <div className="rounded-lg border border-border-sub overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="text-[9px] uppercase">#</TableHead>
                                                <TableHead className="text-[9px] uppercase">Client</TableHead>
                                                <TableHead className="text-[9px] uppercase text-right">Jobs</TableHead>
                                                <TableHead className="text-[9px] uppercase text-right">Completed</TableHead>
                                                <TableHead className="text-[9px] uppercase text-right">Revenue</TableHead>
                                                <TableHead className="text-[9px] uppercase text-right">Labor</TableHead>
                                                <TableHead className="text-[9px] uppercase text-right">Gross Profit</TableHead>
                                                <TableHead className="text-[9px] uppercase text-right">Margin</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {topClientRows.map((r, i) => (
                                                <TableRow key={r.client}>
                                                    <TableCell className="text-[10px] text-text-muted">{i + 1}</TableCell>
                                                    <TableCell className="text-[10px] font-bold uppercase">{r.client}</TableCell>
                                                    <TableCell className="text-[10px] font-mono text-right">{r.jobs}</TableCell>
                                                    <TableCell className="text-[10px] font-mono text-right">{r.completed}</TableCell>
                                                    <TableCell className="text-[10px] font-mono text-right">${r.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                                    <TableCell className="text-[10px] font-mono text-right">${r.labor.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                                    <TableCell className={cn('text-[10px] font-mono font-bold text-right', r.grossProfit >= 0 ? 'text-text-green' : 'text-text-red')}>
                                                        ${r.grossProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </TableCell>
                                                    <TableCell className="text-[10px] font-mono text-right">{r.margin == null ? '—' : `${r.margin.toFixed(1)}%`}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </div>

                        {/* Top 10 Cities */}
                        <div className="lg:col-span-2 space-y-2">
                            <div className="border-b border-border-sub pb-2">
                                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Top 10 Cities</h3>
                                <p className="text-[9px] text-text-muted mt-1">Where we work most, by job count (cancelled and archived jobs excluded).</p>
                            </div>
                            {topCityRows.length === 0 ? (
                                <p className="text-[10px] text-text-muted uppercase py-3">No job addresses with a city yet</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                                    {topCityRows.map((c, i) => (
                                        <div key={c.city} className="flex items-center gap-3">
                                            <span className="w-5 text-right text-[10px] font-mono text-text-muted">{i + 1}</span>
                                            <span className="w-40 shrink-0 truncate text-[11px] font-bold text-text-primary">{c.city}</span>
                                            <div className="relative h-4 flex-1 rounded-sm bg-bg-tertiary/40">
                                                <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${(c.jobs / topCityRows[0].jobs) * 100}%`, background: 'var(--brand-blue)' }} />
                                            </div>
                                            <span className="w-24 shrink-0 text-right text-[10px] font-mono text-text-secondary">{c.jobs} job{c.jobs !== 1 ? 's' : ''} · {c.completed} done</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Common Failure Patterns */}
                        <div className="lg:col-span-2 space-y-2">
                            <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2">Common Failure Patterns (Revisits by Job Type)</h3>
                            {failurePatterns.length === 0 ? (
                                <div className="flex items-center gap-2 py-3 text-text-green">
                                    <ShieldAlert size={14} />
                                    <p className="text-[10px] font-bold uppercase">No revisit patterns detected</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {failurePatterns.map(({ type, count }) => (
                                        <div key={type} className="p-3 rounded-lg border border-border-warn bg-brand-amber-dim/5 text-center">
                                            <p className="text-2xl font-bold font-mono text-text-amber">{count}</p>
                                            <p className="text-[9px] font-black text-text-muted uppercase tracking-widest mt-1">{type}</p>
                                            <p className="text-[8px] text-text-muted uppercase">revisit{count !== 1 ? 's' : ''}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>
                </TabsContent>

                {/* App Activity Tab */}
                <TabsContent value="app_activity" className="m-0">
                    <div className="space-y-5">
                        <div className="flex flex-wrap items-center gap-3 p-4 bg-bg-secondary rounded-xl border border-border-sub">
                            <Select value={timelineTechFilter} onValueChange={setTimelineTechFilter}>
                                <SelectTrigger className="h-8 w-[160px] text-[10px] font-bold uppercase bg-bg-primary border-border-main">
                                    <SelectValue placeholder="All Techs" />
                                </SelectTrigger>
                                <SelectContent className="bg-bg-elevated border-border-main">
                                    <SelectItem value="all" className="text-[10px] uppercase font-bold">All Techs</SelectItem>
                                    {staffTechs.map(t => (
                                        <SelectItem key={t.id} value={t.id} className="text-[10px] uppercase font-bold">{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={timelineTypeFilter} onValueChange={setTimelineTypeFilter}>
                                <SelectTrigger className="h-8 w-[160px] text-[10px] font-bold uppercase bg-bg-primary border-border-main">
                                    <SelectValue placeholder="All Events" />
                                </SelectTrigger>
                                <SelectContent className="bg-bg-elevated border-border-main">
                                    <SelectItem value="all" className="text-[10px] uppercase font-bold">All Events</SelectItem>
                                    <SelectItem value="assignment" className="text-[10px] uppercase font-bold">Assignments</SelectItem>
                                    <SelectItem value="work_order" className="text-[10px] uppercase font-bold">Work Orders</SelectItem>
                                    <SelectItem value="log" className="text-[10px] uppercase font-bold">Weekly Logs</SelectItem>
                                    <SelectItem value="invoice" className="text-[10px] uppercase font-bold">Invoices</SelectItem>
                                </SelectContent>
                            </Select>
                            <DateRangeButton value={timelineDateRange} onChange={setTimelineDateRange} />
                            {(timelineTechFilter !== 'all' || timelineTypeFilter !== 'all' || timelineDateRange?.from) && (
                                <Button variant="ghost" size="sm" className="h-8 text-[9px] uppercase font-bold text-text-muted"
                                    onClick={() => { setTimelineTechFilter('all'); setTimelineTypeFilter('all'); setTimelineDateRange(undefined); }}>
                                    <X size={11} className="mr-1" /> Clear
                                </Button>
                            )}
                            <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-text-muted">
                                {filteredTimelineEvents.length} events
                            </span>
                        </div>

                        {filteredTimelineEvents.length === 0 ? (
                            <div className="py-24 text-center border border-dashed border-border-sub rounded-xl opacity-40">
                                <ActivityIcon size={32} className="mx-auto text-text-muted mb-2" />
                                <p className="text-[10px] font-bold uppercase text-text-muted">No events match the current filter</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {timelinePageEvents.map(event => {
                                    let tsDisplay = '';
                                    try { const d = new Date(event.timestamp); tsDisplay = isNaN(d.getTime()) ? event.timestamp : format(d, 'MMM d, h:mm a'); } catch { tsDisplay = event.timestamp; }
                                    const typeColors: Record<string, string> = { assignment: 'border-l-accent-gold', work_order: 'border-l-border-main', log: 'border-l-brand-red', invoice: 'border-l-text-green' };
                                    return (
                                        <div key={event.id} className={cn('flex items-start gap-4 p-3 rounded-lg border border-border-sub border-l-4 bg-bg-secondary hover:bg-bg-tertiary transition-colors', typeColors[event.type] || 'border-l-border-sub')}>
                                            <div className="w-[120px] shrink-0 text-right">
                                                <p className="text-[9px] font-mono text-text-muted leading-tight">{tsDisplay}</p>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={cn('text-[10px] font-black uppercase tracking-wide', event.color)}>{event.eventLabel}</p>
                                                <p className="text-[11px] font-bold text-text-primary leading-tight mt-0.5 truncate">{event.entity}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    {event.techName && <span className="text-[9px] text-text-muted uppercase font-bold">{event.techName}</span>}
                                                    {event.techName && event.clientName && <span className="text-text-muted text-[9px]">·</span>}
                                                    {event.clientName && <span className="text-[9px] text-text-muted uppercase">{event.clientName}</span>}
                                                </div>
                                            </div>
                                            <Badge variant="outline" className="text-[7px] uppercase shrink-0 h-4">{event.type.replace('_', ' ')}</Badge>
                                        </div>
                                    );
                                })}
                                <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">Show</span>
                                        {([10, 25, 50] as const).map(n => (
                                            <button
                                                key={n}
                                                type="button"
                                                onClick={() => setTimelinePageSize(n)}
                                                className={cn('h-8 w-10 rounded-md border text-[10px] font-bold', timelinePageSize === n ? 'border-brand-red bg-brand-red text-white' : 'border-border-main text-text-muted hover:text-text-primary')}
                                            >
                                                {n}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">
                                            {timelinePage * timelinePageSize + 1}–{Math.min((timelinePage + 1) * timelinePageSize, filteredTimelineEvents.length)} of {filteredTimelineEvents.length}
                                        </span>
                                        <Button variant="outline" size="sm" className="h-8 text-[9px] uppercase font-bold" disabled={timelinePage === 0} onClick={() => setTimelinePage(p => Math.max(0, p - 1))}>
                                            Previous
                                        </Button>
                                        <Button variant="outline" size="sm" className="h-8 text-[9px] uppercase font-bold" disabled={timelinePage >= timelinePageCount - 1} onClick={() => setTimelinePage(p => Math.min(timelinePageCount - 1, p + 1))}>
                                            Next
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </TabsContent>

            </Tabs>

            {/* Admin job controls from the Techs tab (force complete, swap tech, helpers, …). */}
            <JobDetailDialog isOpen={!!managedJob} setIsOpen={open => { if (!open) setManagedJob(null); }} mission={managedJob ? (missions.find(m => m.id === managedJob.id) as WorkOrder) || managedJob : null} hidePay={!canSeePay} />

            <style jsx global>{`
                .tab-trigger-activity {
                    @apply px-0 pb-4 pt-0 h-auto bg-transparent rounded-none border-b-2 border-transparent text-[11px] font-black uppercase tracking-[0.2em] text-text-muted data-[state=active]:bg-transparent data-[state=active]:text-text-primary data-[state=active]:border-brand-red data-[state=active]:shadow-none transition-all;
                }
            `}</style>
        </div>
    );
}

