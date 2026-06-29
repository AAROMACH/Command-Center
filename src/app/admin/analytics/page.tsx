'use client';

import { useState, useMemo, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { BarChart2, ShieldAlert, Users, AlertTriangle, Clock, ChevronRight, Mail, Phone, ArrowLeft, RefreshCw, Filter } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { WorkOrder, Technician, WeeklyLog } from '@/lib/types';
import { IntelligenceTerminal } from '../reports/components/intelligence-terminal';
import { penaltyEvents } from '@/lib/data';
import { getReliabilityTier } from '@/lib/reliability';
import { Tabs as InnerTabs, TabsList as InnerTabsList, TabsTrigger as InnerTabsTrigger, TabsContent as InnerTabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO } from 'date-fns';

export default function FieldIntelligencePage() {
    const [activeTab, setActiveTab] = useState('intelligence');
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [assignments, setAssignments] = useState<WorkOrder[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [selectedTechId, setSelectedTechId] = useState<string | null>(null);

    // Intelligence filter state
    const [intelEventType, setIntelEventType] = useState('all');
    const [intelPersonnel, setIntelPersonnel] = useState('all');
    const [intelClient, setIntelClient] = useState('all');

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
        return () => { unsubWO(); unsubAsmt(); unsubTech(); unsubLogs(); };
    }, []);

    const staffTechs = useMemo(
        () => technicians.filter(t => !t.roles?.includes('client')),
        [technicians]
    );

    const clientList = useMemo(
        () => technicians.filter(t => t.roles?.includes('client') || t.role?.toLowerCase().includes('client')),
        [technicians]
    );

    const anomalyCounts = useMemo(() =>
        workOrders.filter(wo => wo.status === 'unassigned').length +
        weeklyLogs.filter(wl => wl.status === 'Draft').length,
        [workOrders, weeklyLogs]
    );

    const activeTech = useMemo(
        () => staffTechs.find(t => t.id === selectedTechId),
        [staffTechs, selectedTechId]
    );

    const techStats = useMemo(() => {
        if (!selectedTechId) return null;
        const myJobs = assignments.filter(wo => wo.assignedTechnicianId === selectedTechId || wo.techId === selectedTechId);
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

    const missingDocAlerts = useMemo(() => {
        return assignments
            .filter(wo => wo.status === 'completed')
            .filter(wo => !weeklyLogs.some(log =>
                log.techId === (wo.assignedTechnicianId || wo.techId) &&
                log.items?.some(item => item.workOrderId === wo.id)
            ))
            .slice(0, 20);
    }, [assignments, weeklyLogs]);

    const profitabilityByClient = useMemo(() => {
        const map = new Map<string, { revenue: number; pending: number; jobCount: number }>();
        workOrders.forEach(wo => {
            const client = wo.clientName || 'Unknown';
            const prev = map.get(client) || { revenue: 0, pending: 0, jobCount: 0 };
            if (wo.status === 'completed') {
                prev.revenue += wo.pay || 0;
                prev.jobCount += 1;
            } else {
                prev.pending += wo.pay || 0;
            }
            map.set(client, prev);
        });
        return Array.from(map.entries())
            .map(([client, data]) => ({ client, ...data }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);
    }, [workOrders]);

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
                    <h1 className="page-title">Field Intelligence</h1>
                    <p className="page-subtitle">Live field awareness, technician status, and operational analytics.</p>
                </div>
            </header>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex justify-center">
                    <TabsList className="tabs border-b-2 border-border-sub bg-transparent rounded-none h-auto p-0 gap-8 justify-center mb-8">
                        <TabsTrigger value="intelligence" className="tab-trigger-activity">Field Intelligence</TabsTrigger>
                        <TabsTrigger value="techs" className="tab-trigger-activity" onClick={() => setSelectedTechId(null)}>
                            Techs
                        </TabsTrigger>
                        <TabsTrigger value="flags" className="tab-trigger-activity flex items-center gap-3">
                            Flags
                            {anomalyCounts > 0 && (
                                <Badge variant="destructive" className="h-5 px-1.5 text-[9px] min-w-[20px] flex items-center justify-center font-black">{anomalyCounts}</Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="insights" className="tab-trigger-activity">Insights</TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="intelligence" className="m-0">
                    {/* Filter bar */}
                    <div className="flex flex-wrap items-center gap-3 mb-5 p-3 bg-bg-secondary/60 border border-border-sub rounded-xl">
                        <div className="flex items-center gap-2 shrink-0">
                            <Filter size={12} className="text-text-muted" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">Filters</span>
                        </div>
                        <Select value={intelEventType} onValueChange={setIntelEventType}>
                            <SelectTrigger className="h-8 w-[160px] bg-bg-primary border-border-main text-[10px] font-bold uppercase">
                                <SelectValue placeholder="Event Type" />
                            </SelectTrigger>
                            <SelectContent className="bg-bg-elevated border-border-main">
                                <SelectItem value="all" className="text-[10px] font-bold uppercase">All Events</SelectItem>
                                <SelectItem value="assignments" className="text-[10px] font-bold uppercase">Assignments</SelectItem>
                                <SelectItem value="projects" className="text-[10px] font-bold uppercase">Projects</SelectItem>
                                <SelectItem value="logs" className="text-[10px] font-bold uppercase">Weekly Logs</SelectItem>
                                <SelectItem value="requests" className="text-[10px] font-bold uppercase">Site Requests</SelectItem>
                            </SelectContent>
                        </Select>
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
                                {clientList.map(c => (
                                    <SelectItem key={c.id} value={c.id} className="text-[10px] font-bold uppercase">{c.clientCompany || c.name || c.id}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {(intelEventType !== 'all' || intelPersonnel !== 'all' || intelClient !== 'all') && (
                            <button
                                onClick={() => { setIntelEventType('all'); setIntelPersonnel('all'); setIntelClient('all'); }}
                                className="h-8 px-3 text-[9px] font-black uppercase tracking-widest text-brand-red hover:underline"
                            >
                                Clear
                            </button>
                        )}
                        <div className="ml-auto flex gap-2 flex-wrap">
                            {intelEventType !== 'all' && <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded border border-brand-red/30 bg-brand-red/10 text-brand-red">{intelEventType}</span>}
                            {intelPersonnel !== 'all' && <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded border border-blue-400/30 bg-blue-400/10 text-blue-400">{staffTechs.find(t => t.id === intelPersonnel)?.name || intelPersonnel}</span>}
                            {intelClient !== 'all' && <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded border border-amber-400/30 bg-amber-400/10 text-amber-400">{clientList.find(c => c.id === intelClient)?.clientCompany || intelClient}</span>}
                        </div>
                    </div>
                    <IntelligenceTerminal />
                </TabsContent>

                <TabsContent value="flags" className="m-0">
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
                                {weeklyLogs.filter(wl => wl.status === 'Draft').map(wl => {
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
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {techStats.myJobs.map(wo => (
                                                            <TableRow key={wo.id} className="border-border-sub hover:bg-bg-tertiary">
                                                                <TableCell className="pl-4 py-3">
                                                                    <p className="text-xs font-bold text-text-primary uppercase">{wo.title || wo.description}</p>
                                                                    <p className="text-[9px] text-text-muted font-mono">{wo.id.toUpperCase()}</p>
                                                                </TableCell>
                                                                <TableCell className="text-[10px] font-mono text-text-secondary uppercase">{formatDateDisplay(wo.scheduleDate)}</TableCell>
                                                                <TableCell className="text-center">
                                                                    <Badge variant={wo.status === 'completed' ? 'active' : 'onhold'} className="h-4 text-[7px] uppercase tracking-widest">{wo.status}</Badge>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                        {techStats.myJobs.length === 0 && (
                                                            <TableRow><TableCell colSpan={3} className="text-center text-text-muted text-[10px] uppercase py-8">No assignments found</TableCell></TableRow>
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
                                                            <p className="text-[9px] text-text-muted uppercase">Payout: ${(log.totalPayout || 0).toFixed(2)}</p>
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

                        {/* Missing Documentation Alerts */}
                        <div className="space-y-2">
                            <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 flex items-center gap-2">
                                Missing Docs (48h+)
                                {missingDocAlerts.length > 0 && <Badge variant="destructive" className="h-4 px-1.5 text-[7px]">{missingDocAlerts.length}</Badge>}
                            </h3>
                            {missingDocAlerts.length === 0 ? (
                                <div className="flex items-center gap-2 py-3 text-text-green">
                                    <ShieldAlert size={14} />
                                    <p className="text-[10px] font-bold uppercase">All completed jobs have logs</p>
                                </div>
                            ) : missingDocAlerts.map(wo => {
                                const tech = staffTechs.find(t => t.id === (wo.assignedTechnicianId || wo.techId));
                                return (
                                    <div key={wo.id} className="flex items-center justify-between p-2 rounded-lg border border-border-alert bg-brand-red-dim/5">
                                        <div>
                                            <p className="text-[11px] font-bold text-text-red uppercase">{wo.title || wo.id}</p>
                                            <p className="text-[9px] text-text-muted uppercase">{tech?.name || 'Unknown tech'} — completed, no log</p>
                                        </div>
                                        <Badge variant="destructive" className="h-4 text-[7px] uppercase shrink-0">No Log</Badge>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Profitability by Client */}
                        <div className="space-y-2">
                            <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2">Profitability by Client</h3>
                            {profitabilityByClient.length === 0 ? (
                                <p className="text-[10px] text-text-muted uppercase py-3">No revenue data</p>
                            ) : profitabilityByClient.map(({ client, revenue, pending, jobCount }) => (
                                <div key={client} className="flex items-center justify-between p-2.5 rounded-lg border border-border-sub bg-bg-secondary">
                                    <div>
                                        <p className="text-[11px] font-bold text-text-primary uppercase">{client}</p>
                                        <p className="text-[9px] text-text-muted uppercase">{jobCount} completed job{jobCount !== 1 ? 's' : ''}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-[11px] font-bold text-text-green">${revenue.toFixed(0)} earned</p>
                                        {pending > 0 && <p className="text-[9px] text-text-amber">${pending.toFixed(0)} pending</p>}
                                    </div>
                                </div>
                            ))}
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

            </Tabs>

            <style jsx global>{`
                .tab-trigger-activity {
                    @apply px-0 pb-4 pt-0 h-auto bg-transparent rounded-none border-b-2 border-transparent text-[11px] font-black uppercase tracking-[0.2em] text-text-muted data-[state=active]:bg-transparent data-[state=active]:text-text-primary data-[state=active]:border-brand-red data-[state=active]:shadow-none transition-all;
                }
            `}</style>
        </div>
    );
}

