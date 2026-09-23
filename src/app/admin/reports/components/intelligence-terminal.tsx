'use client';

import { useState, useMemo, useEffect } from 'react';
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from 'firebase/firestore';
import { 
    Bar, 
    BarChart, 
    CartesianGrid, 
    XAxis, 
    YAxis, 
    Tooltip, 
    Cell,
    Line,
    LineChart,
    Legend
} from 'recharts';
import { 
    ChartContainer, 
    ChartTooltipContent, 
    type ChartConfig 
} from '@/components/ui/chart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { format, isWithinInterval, startOfDay } from 'date-fns';
import {
    Filter,
    RefreshCw,
    Zap,
    ShieldCheck,
    Coins,
    Clock,
    Calendar as CalendarIcon,
    BarChart3,
    CheckCircle2,
    Briefcase
} from 'lucide-react';
import { cn, isInactiveTechnician } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { Technician, WorkOrder, WeeklyLog, ProjectDailyLog } from '@/lib/types';
import { isTech } from '@/lib/permissions';

type MetricType = 'completion' | 'payouts' | 'assignments' | 'hours';
type GroupBy = 'tech' | 'client' | 'date';
type TimeWindow = '7d' | '30d' | '90d' | '1y' | 'all';

export function IntelligenceTerminal({
    timeWindow = '30d',
    personnel = 'all',
    client = 'all',
}: {
    timeWindow?: TimeWindow;
    personnel?: string;
    client?: string;
}) {
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [dailyLogs, setDailyLogs] = useState<ProjectDailyLog[]>([]);
    const [loading, setLoading] = useState(true);

    const [metric, setMetric] = useState<MetricType>('assignments');
    const [groupBy, setGroupBy] = useState<GroupBy>('tech');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

    useEffect(() => {
        if (timeWindow === 'all') {
            setDateRange(undefined);
            return;
        }
        const now = new Date();
        const days: Record<TimeWindow, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365, 'all': 0 };
        const from = new Date(now.getTime() - (days[timeWindow] || 30) * 24 * 60 * 60 * 1000);
        setDateRange({ from, to: now });
    }, [timeWindow]);

    useEffect(() => {
        const unsubWO = onSnapshot(collection(db, 'assignments'), (snap) => {
            setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });
        const unsubTech = onSnapshot(collection(db, 'users'), (snap) => {
            setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
        });
        const unsubLogs = onSnapshot(collection(db, 'weeklyLogs'), (snap) => {
            setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)));
        });
        const unsubDaily = onSnapshot(collection(db, 'projectDailyLogs'), (snap) => {
            setDailyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as ProjectDailyLog)));
            setLoading(false);
        });

        return () => {
            unsubWO(); unsubTech(); unsubLogs(); unsubDaily();
        };
    }, []);

    const activeTechnicians = useMemo(
        () => technicians.filter(t => isTech(t) && !isInactiveTechnician(t)),
        [technicians]
    );

    useEffect(() => {
        if (metric === 'hours' && groupBy === 'client') setGroupBy('tech');
    }, [metric, groupBy]);

    const analytics = useMemo(() => {
        const parseRecordDate = (raw?: string) => {
            if (!raw) return null;
            const parts = raw.split(/[-/]/);
            const parsed = parts[0]?.length === 4
                ? new Date(`${parts[0]}-${parts[1]}-${parts[2]}T12:00:00`)
                : new Date(`${parts[2]}-${parts[0]}-${parts[1]}T12:00:00`);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        };
        const inRange = (raw?: string) => {
            if (!dateRange?.from) return true;
            const parsed = parseRecordDate(raw);
            if (!parsed) return false;
            return isWithinInterval(startOfDay(parsed), {
                start: startOfDay(dateRange.from),
                end: startOfDay(dateRange.to || dateRange.from),
            });
        };
        const techIdFor = (wo: WorkOrder) => wo.assignedTechnicianId || wo.techId || '';
        const activeTechIds = new Set(activeTechnicians.map(t => t.id));
        const filteredWO = workOrders.filter(wo =>
            activeTechIds.has(techIdFor(wo)) &&
            (personnel === 'all' || techIdFor(wo) === personnel) &&
            (client === 'all' || wo.clientName === client) &&
            inRange(wo.scheduleDate)
        );
        const filteredWeekly = weeklyLogs.filter(log =>
            activeTechIds.has(log.techId) &&
            (personnel === 'all' || log.techId === personnel) &&
            inRange(log.weekOf)
        );
        const filteredDaily = client === 'all' ? dailyLogs.filter(log =>
            activeTechIds.has(log.techId) &&
            (personnel === 'all' || log.techId === personnel) &&
            inRange(log.date)
        ) : [];
        const clientJobIds = new Set(filteredWO.map(wo => wo.id));
        const logAmount = (log: WeeklyLog, status: WeeklyLog['status']) => {
            if (log.status !== status) return 0;
            if (client === 'all') return log.totalPayout ?? (log.items || []).reduce((sum, item) => sum + (item.payoutAmount ?? item.jobPay ?? 0), 0);
            return (log.items || [])
                .filter(item => clientJobIds.has(item.workOrderId))
                .reduce((sum, item) => sum + (item.payoutAmount ?? item.jobPay ?? 0), 0);
        };
        const makeAssignmentDatum = (name: string, jobs: WorkOrder[]) => {
            const completed = jobs.filter(wo => wo.status === 'completed').length;
            const open = jobs.length - completed;
            if (metric === 'completion') {
                return { name, value: jobs.length ? Math.round((completed / jobs.length) * 100) : 0, total: jobs.length };
            }
            return { name, value: completed, secondary: open, total: jobs.length };
        };

        let data: Array<{ name: string; value: number; secondary?: number; total?: number }> = [];
        if (groupBy === 'tech') {
            data = activeTechnicians
                .filter(t => personnel === 'all' || t.id === personnel)
                .map(tech => {
                    const jobs = filteredWO.filter(wo => techIdFor(wo) === tech.id);
                    if (metric === 'assignments' || metric === 'completion') return makeAssignmentDatum(tech.name || tech.id, jobs);
                    if (metric === 'payouts') {
                        const logs = filteredWeekly.filter(log => log.techId === tech.id);
                        const approved = logs.reduce((sum, log) => sum + logAmount(log, 'Approved'), 0);
                        const pending = logs.reduce((sum, log) => sum + logAmount(log, 'Submitted'), 0);
                        return { name: tech.name || tech.id, value: approved, secondary: pending, total: approved + pending };
                    }
                    const hours = filteredDaily.filter(log => log.techId === tech.id).reduce((sum, log) => sum + (log.hoursWorked || 0), 0);
                    return { name: tech.name || tech.id, value: hours, total: hours };
                });
        } else if (groupBy === 'client') {
            const names = Array.from(new Set(filteredWO.map(wo => wo.clientName || 'Unknown')));
            data = names.map(name => {
                const jobs = filteredWO.filter(wo => (wo.clientName || 'Unknown') === name);
                if (metric === 'assignments' || metric === 'completion') return makeAssignmentDatum(name, jobs);
                const ids = new Set(jobs.map(wo => wo.id));
                const amount = (status: WeeklyLog['status']) => filteredWeekly.reduce((sum, log) => {
                    if (log.status !== status) return sum;
                    return sum + (log.items || []).filter(item => ids.has(item.workOrderId)).reduce((itemSum, item) => itemSum + (item.payoutAmount ?? item.jobPay ?? 0), 0);
                }, 0);
                const approved = amount('Approved');
                const pending = amount('Submitted');
                return { name, value: approved, secondary: pending, total: approved + pending };
            });
        } else {
            const buckets = new Map<string, { value: number; secondary: number; total: number }>();
            const getBucket = (name: string) => buckets.get(name) || { value: 0, secondary: 0, total: 0 };
            if (metric === 'assignments' || metric === 'completion') {
                filteredWO.forEach(wo => {
                    const d = parseRecordDate(wo.scheduleDate);
                    if (!d) return;
                    const key = format(d, 'yyyy-MM-dd');
                    const bucket = getBucket(key);
                    bucket.total += 1;
                    if (wo.status === 'completed') bucket.value += 1;
                    else bucket.secondary += 1;
                    buckets.set(key, bucket);
                });
                if (metric === 'completion') buckets.forEach(bucket => { bucket.value = bucket.total ? Math.round((bucket.value / bucket.total) * 100) : 0; bucket.secondary = 0; });
            } else if (metric === 'payouts') {
                filteredWeekly.forEach(log => {
                    const d = parseRecordDate(log.weekOf);
                    if (!d) return;
                    const key = format(d, 'yyyy-MM-dd');
                    const bucket = getBucket(key);
                    bucket.value += logAmount(log, 'Approved');
                    bucket.secondary += logAmount(log, 'Submitted');
                    bucket.total = bucket.value + bucket.secondary;
                    buckets.set(key, bucket);
                });
            } else {
                filteredDaily.forEach(log => {
                    const d = parseRecordDate(log.date);
                    if (!d) return;
                    const key = format(d, 'yyyy-MM-dd');
                    const bucket = getBucket(key);
                    bucket.value += log.hoursWorked || 0;
                    bucket.total = bucket.value;
                    buckets.set(key, bucket);
                });
            }
            data = Array.from(buckets.entries()).map(([name, values]) => ({ name, ...values })).sort((a, b) => a.name.localeCompare(b.name));
        }

        if (groupBy !== 'date') {
            data = data.filter(item => (item.total || item.value || item.secondary || 0) > 0)
                .sort((a, b) => (b.total || b.value + (b.secondary || 0)) - (a.total || a.value + (a.secondary || 0)))
                .slice(0, 12);
        }

        const completed = filteredWO.filter(wo => wo.status === 'completed').length;
        const approvedPayroll = filteredWeekly.reduce((sum, log) => sum + logAmount(log, 'Approved'), 0);
        const fieldHours = client === 'all' ? filteredDaily.reduce((sum, log) => sum + (log.hoursWorked || 0), 0) : null;
        return {
            chartData: data.map(item => ({ ...item, value: Number(item.value.toFixed(2)), secondary: item.secondary == null ? undefined : Number(item.secondary.toFixed(2)) })),
            summary: {
                assignments: filteredWO.length,
                completionRate: filteredWO.length ? Math.round((completed / filteredWO.length) * 100) : 0,
                approvedPayroll,
                fieldHours,
            },
        };
    }, [metric, groupBy, dateRange, workOrders, activeTechnicians, weeklyLogs, dailyLogs, personnel, client]);

    const chartData = analytics.chartData;
    const hasSecondarySeries = metric === 'assignments' || metric === 'payouts';
    const chartConfig = {
        value: {
            label: metric === 'assignments' ? 'Completed' : metric === 'completion' ? 'Completion Rate' : metric === 'payouts' ? 'Approved' : 'Field Hours',
            color: metric === 'completion' ? 'var(--brand-red)' : metric === 'payouts' ? 'var(--text-green)' : 'var(--accent-gold)',
        },
        secondary: {
            label: metric === 'payouts' ? 'Awaiting Approval' : 'Open',
            color: metric === 'payouts' ? 'var(--accent-gold)' : 'var(--brand-red)',
        },
    } satisfies ChartConfig;

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Inline controls toolbar */}
            <div className="flex flex-wrap items-center gap-3 p-3 bg-bg-secondary/60 border border-border-sub rounded-xl">
                <div className="flex items-center gap-2 shrink-0">
                    <Filter size={12} className="text-text-muted" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">Display</span>
                </div>

                <Select value={metric} onValueChange={(v: any) => setMetric(v)}>
                    <SelectTrigger className="h-8 w-[180px] bg-bg-primary border-border-main text-[10px] font-bold uppercase">
                        <div className="flex items-center gap-1.5">
                            {metric === 'completion' && <ShieldCheck size={11} className="text-brand-red"/>}
                            {metric === 'payouts' && <Coins size={11} className="text-text-green"/>}
                            {metric === 'assignments' && <Zap size={11} className="text-accent-gold"/>}
                            {metric === 'hours' && <Clock size={11} className="text-text-muted"/>}
                            <SelectValue />
                        </div>
                    </SelectTrigger>
                    <SelectContent className="bg-bg-elevated border-border-main">
                        <SelectItem value="assignments" className="text-[10px] uppercase font-bold">Assignment Volume</SelectItem>
                        <SelectItem value="completion" className="text-[10px] uppercase font-bold">Completion Rate</SelectItem>
                        <SelectItem value="payouts" className="text-[10px] uppercase font-bold">1099 Settlements</SelectItem>
                        <SelectItem value="hours" className="text-[10px] uppercase font-bold">Field Hours</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={groupBy} onValueChange={(v: any) => setGroupBy(v)}>
                    <SelectTrigger className="h-8 w-[160px] bg-bg-primary border-border-main text-[10px] font-bold uppercase">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-bg-elevated border-border-main">
                        <SelectItem value="tech" className="text-[10px] uppercase font-bold">By Technician</SelectItem>
                        <SelectItem value="client" disabled={metric === 'hours'} className="text-[10px] uppercase font-bold">By Client{metric === 'hours' ? ' · Unavailable' : ''}</SelectItem>
                        <SelectItem value="date" className="text-[10px] uppercase font-bold">By Date</SelectItem>
                    </SelectContent>
                </Select>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            className={cn(
                                "h-8 justify-start text-left font-bold text-[10px] bg-bg-primary border-border-main uppercase min-w-[160px]",
                                !dateRange && "text-muted-foreground"
                            )}
                        >
                            <CalendarIcon className="mr-1.5 h-3 w-3" />
                            {dateRange?.from ? (
                                dateRange.to ? (
                                    <>{format(dateRange.from, "MM/dd")} – {format(dateRange.to, "MM/dd")}</>
                                ) : (
                                    format(dateRange.from, "MMM dd, y")
                                )
                            ) : (
                                <span>Pick a range</span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-bg-elevated border-border-main shadow-2xl" align="start">
                        <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={dateRange?.from}
                            selected={dateRange}
                            onSelect={setDateRange}
                            numberOfMonths={1}
                        />
                    </PopoverContent>
                </Popover>

                <Badge variant="outline" className="ml-auto bg-bg-primary text-[8px] h-6 uppercase tracking-tighter">Live</Badge>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: 'Assignments', value: analytics.summary.assignments.toLocaleString(), icon: Briefcase, tone: 'text-accent-gold' },
                    { label: 'Completion Rate', value: `${analytics.summary.completionRate}%`, icon: CheckCircle2, tone: 'text-text-green' },
                    { label: 'Approved Payroll', value: `$${analytics.summary.approvedPayroll.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: Coins, tone: 'text-text-green' },
                    { label: 'Field Hours', value: analytics.summary.fieldHours == null ? 'N/A by client' : analytics.summary.fieldHours.toLocaleString(undefined, { maximumFractionDigits: 1 }), icon: Clock, tone: 'text-brand-red' },
                ].map(({ label, value, icon: Icon, tone }) => (
                    <Card key={label} className="bg-bg-secondary border-border-main">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg bg-bg-primary border border-border-sub flex items-center justify-center shrink-0">
                                <Icon size={15} className={tone} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[8px] font-black text-text-muted uppercase tracking-widest truncate">{label}</p>
                                <p className="text-lg font-black text-text-primary tabular-nums truncate">{value}</p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Chart card — full width */}
            <Card className="bg-bg-secondary border-border-main shadow-2xl overflow-hidden flex flex-col">
                <CardHeader className="pb-2 border-b border-border-sub bg-bg-tertiary/20 text-left">
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="text-base font-bold uppercase tracking-wide">
                                {metric === 'assignments' ? 'Assignment Status' : metric === 'completion' ? 'Completion Rate' : metric === 'payouts' ? 'Payroll Status' : 'Field Hours'} — {groupBy === 'tech' ? 'By Technician' : groupBy === 'client' ? 'By Client' : 'By Date'}
                            </CardTitle>
                            <CardDescription className="text-[10px] uppercase font-bold text-text-muted mt-0.5">
                                {groupBy === 'date' ? 'Trend across the selected period' : 'Top 12 results for the selected filters'}
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-6 flex-1 flex items-center justify-center">
                    {loading ? (
                        <div className="flex flex-col items-center gap-4 text-accent-gold py-16">
                            <RefreshCw className="h-10 w-10 animate-spin" />
                            <p className="text-[10px] font-bold uppercase tracking-widest">Aggregating Registry Data...</p>
                        </div>
                    ) : chartData.length > 0 ? (
                        <ChartContainer config={chartConfig} className="w-full h-[480px]">
                            {groupBy === 'date' ? (
                                <LineChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
                                    <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.1} />
                                    <XAxis
                                        dataKey="name"
                                        tickLine={false}
                                        axisLine={false}
                                        className="text-[10px] font-bold uppercase"
                                        tickFormatter={(v) => v.split('-').slice(1).join('/')}
                                    />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        className="text-[9px] font-mono"
                                        tickFormatter={(v) => metric === 'payouts' ? `$${v}` : metric === 'completion' ? `${v}%` : v}
                                    />
                                    <Tooltip content={<ChartTooltipContent indicator="line" />} />
                                    {hasSecondarySeries && <Legend verticalAlign="top" height={36}/>}
                                    <Line
                                        type="monotone"
                                        dataKey="value"
                                        stroke="var(--color-value)"
                                        strokeWidth={3}
                                        dot={{ r: 4, fill: "var(--color-value)", strokeWidth: 2, stroke: "#fff" }}
                                        activeDot={{ r: 6, strokeWidth: 0 }}
                                    />
                                    {hasSecondarySeries && (
                                        <Line
                                            type="monotone"
                                            dataKey="secondary"
                                            stroke="var(--color-secondary)"
                                            strokeWidth={2}
                                            dot={{ r: 3, fill: "var(--color-secondary)", strokeWidth: 0 }}
                                            activeDot={{ r: 5, strokeWidth: 0 }}
                                        />
                                    )}
                                </LineChart>
                            ) : (
                                <BarChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
                                    <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.1} />
                                    <XAxis
                                        dataKey="name"
                                        tickLine={false}
                                        axisLine={false}
                                        className="text-[10px] font-bold uppercase"
                                        tickFormatter={(v) => v.length > 12 ? `${v.substring(0, 10)}...` : v}
                                    />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        className="text-[9px] font-mono"
                                        tickFormatter={(v) => metric === 'payouts' ? `$${v}` : metric === 'completion' ? `${v}%` : v}
                                    />
                                    <Tooltip content={<ChartTooltipContent />} />
                                    {hasSecondarySeries && <Legend verticalAlign="top" height={36}/>}
                                    <Bar dataKey="value" stackId={hasSecondarySeries ? 'status' : undefined} fill="var(--color-value)" radius={[4, 4, 0, 0]}>
                                        {chartData.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fillOpacity={0.8 + (index / chartData.length) * 0.2}
                                                className="hover:fill-brand-red transition-all cursor-pointer"
                                            />
                                        ))}
                                    </Bar>
                                    {hasSecondarySeries && <Bar dataKey="secondary" stackId="status" fill="var(--color-secondary)" radius={[4, 4, 0, 0]} />}
                                </BarChart>
                            )}
                        </ChartContainer>
                    ) : (
                        <div className="text-center space-y-4 opacity-40 py-16">
                            <BarChart3 size={64} className="mx-auto text-text-muted" />
                            <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
                                {metric === 'hours' && client !== 'all' ? 'Field hours are not linked to client records' : 'No data matches these filters'}
                            </p>
                            {metric === 'hours' && client !== 'all' && <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Clear the client filter to view technician hours</p>}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
