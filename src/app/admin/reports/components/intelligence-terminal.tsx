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
    ResponsiveContainer,
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
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
import { format, isWithinInterval, startOfDay, parseISO } from 'date-fns';
import {
    Filter,
    RefreshCw,
    Zap,
    ShieldCheck,
    Coins,
    Clock,
    Calendar as CalendarIcon,
    BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { Technician, WorkOrder, WeeklyLog, ProjectDailyLog } from '@/lib/types';
import { isClient } from '@/lib/permissions';

type MetricType = 'reliability' | 'payouts' | 'assignments' | 'hours';
type GroupBy = 'tech' | 'client' | 'date';
type TimeWindow = '7d' | '30d' | '90d' | '1y' | 'all';

export function IntelligenceTerminal({
    timeWindow = '30d',
    eventType = 'all',
    personnel = 'all',
    client = 'all',
}: {
    timeWindow?: TimeWindow;
    eventType?: string;
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

    const chartData = useMemo(() => {
        if (loading || !dateRange) return [];

        const filteredWO = workOrders.filter(wo => {
            if (personnel !== 'all' && wo.assignedTechnicianId !== personnel) return false;
            if (client !== 'all' && (wo as any).clientId !== client && wo.clientName !== client) return false;
            if (!dateRange?.from || !wo.scheduleDate) return true;
            try {
                const parts = wo.scheduleDate.split(/[-/]/);
                const d = parts[0].length === 4 ? new Date(wo.scheduleDate + 'T12:00:00') : new Date(`${parts[2]}-${parts[0]}-${parts[1]}T12:00:00`);
                const start = startOfDay(dateRange.from);
                const end = dateRange.to ? startOfDay(dateRange.to) : start;
                return isWithinInterval(startOfDay(d), { start, end });
            } catch (e) { return true; }
        });

        const filteredWeekly = weeklyLogs.filter(log => {
            if (personnel !== 'all' && log.techId !== personnel) return false;
            if (!dateRange?.from || !log.weekOf) return true;
            try {
                const parts = log.weekOf.split('-');
                let logDate;
                if (parts[2]?.length === 4) { 
                    logDate = startOfDay(new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1])));
                } else { 
                    logDate = startOfDay(parseISO(log.weekOf));
                }
                const start = startOfDay(dateRange.from);
                const end = dateRange.to ? startOfDay(dateRange.to) : start;
                return isWithinInterval(logDate, { start, end });
            } catch(e) { return true; }
        });

        const filteredDaily = dailyLogs.filter(log => {
            if (!dateRange?.from || !log.date) return true;
            try {
                const d = new Date(log.date);
                const start = startOfDay(dateRange.from);
                const end = dateRange.to ? startOfDay(dateRange.to) : start;
                return isWithinInterval(startOfDay(d), { start, end });
            } catch(e) { return true; }
        });

        if (groupBy === 'tech') {
            return technicians
                .filter(t => !isClient(t))
                .map(tech => {
                    let value = 0;
                    if (metric === 'reliability') value = tech.reliabilityScore || 0;
                    else if (metric === 'assignments') value = filteredWO.filter(wo => wo.assignedTechnicianId === tech.id).length;
                    else if (metric === 'payouts') value = filteredWeekly.filter(l => l.techId === tech.id).reduce((acc, curr) => acc + (curr.totalPayout || 0), 0);
                    else if (metric === 'hours') value = filteredDaily.filter(l => l.techId === tech.id).reduce((acc, curr) => acc + (curr.hoursWorked || 0), 0);

                    return { name: tech.name, value: parseFloat((value || 0).toFixed(2)) };
                })
                .sort((a, b) => b.value - a.value);
        }

        if (groupBy === 'client') {
            const clientNames = Array.from(new Set(workOrders.map(wo => wo.clientName)));
            return clientNames.map(name => {
                let value = 0;
                const clientJobs = filteredWO.filter(wo => wo.clientName === name);
                
                if (metric === 'assignments') value = clientJobs.length;
                else if (metric === 'payouts') value = clientJobs.reduce((acc, curr) => acc + (curr.pay || 0), 0);
                else if (metric === 'hours') value = 0; 

                return { name, value: parseFloat((value || 0).toFixed(2)) };
            }).sort((a, b) => b.value - a.value);
        }

        if (groupBy === 'date') {
            const dateMap: Record<string, number> = {};
            filteredWO.forEach(wo => {
                const d = wo.scheduleDate;
                if (metric === 'assignments') dateMap[d] = (dateMap[d] || 0) + 1;
                else if (metric === 'payouts') dateMap[d] = (dateMap[d] || 0) + (wo.pay || 0);
            });
            return Object.entries(dateMap)
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => a.name.localeCompare(b.name));
        }

        return [];
    }, [loading, metric, groupBy, dateRange, workOrders, technicians, weeklyLogs, dailyLogs]);

    const chartConfig = {
        value: {
            label: metric.charAt(0).toUpperCase() + metric.slice(1),
            color: metric === 'reliability' ? 'var(--brand-red)' : metric === 'payouts' ? 'var(--text-green)' : 'var(--accent-gold)',
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
                            {metric === 'reliability' && <ShieldCheck size={11} className="text-brand-red"/>}
                            {metric === 'payouts' && <Coins size={11} className="text-text-green"/>}
                            {metric === 'assignments' && <Zap size={11} className="text-accent-gold"/>}
                            {metric === 'hours' && <Clock size={11} className="text-text-muted"/>}
                            <SelectValue />
                        </div>
                    </SelectTrigger>
                    <SelectContent className="bg-bg-elevated border-border-main">
                        <SelectItem value="assignments" className="text-[10px] uppercase font-bold">Assignment Volume</SelectItem>
                        <SelectItem value="reliability" className="text-[10px] uppercase font-bold">Reliability Index</SelectItem>
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
                        <SelectItem value="client" className="text-[10px] uppercase font-bold">By Client</SelectItem>
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

            {/* Chart card — full width */}
            <Card className="bg-bg-secondary border-border-main shadow-2xl overflow-hidden flex flex-col">
                <CardHeader className="pb-2 border-b border-border-sub bg-bg-tertiary/20 text-left">
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="text-base font-bold uppercase tracking-wide">
                                {metric.replace('_', ' ')} — {groupBy === 'tech' ? 'By Technician' : groupBy === 'client' ? 'By Client' : 'By Date'}
                            </CardTitle>
                            <CardDescription className="text-[10px] uppercase font-bold text-text-muted mt-0.5">
                                Live field data aggregation
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-6 flex-1 flex items-center justify-center">
                    {loading || !dateRange ? (
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
                                        tickFormatter={(v) => metric === 'payouts' ? `$${v}` : v}
                                    />
                                    <Tooltip content={<ChartTooltipContent indicator="line" />} />
                                    <Legend verticalAlign="top" height={36}/>
                                    <Line
                                        type="monotone"
                                        dataKey="value"
                                        stroke="var(--color-value)"
                                        strokeWidth={3}
                                        dot={{ r: 4, fill: "var(--color-value)", strokeWidth: 2, stroke: "#fff" }}
                                        activeDot={{ r: 6, strokeWidth: 0 }}
                                    />
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
                                        tickFormatter={(v) => metric === 'payouts' ? `$${v}` : v}
                                    />
                                    <Tooltip content={<ChartTooltipContent />} />
                                    <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]}>
                                        {chartData.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fillOpacity={0.8 + (index / chartData.length) * 0.2}
                                                className="hover:fill-brand-red transition-all cursor-pointer"
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            )}
                        </ChartContainer>
                    ) : (
                        <div className="text-center space-y-4 opacity-40 py-16">
                            <BarChart3 size={64} className="mx-auto text-text-muted" />
                            <p className="text-sm font-bold uppercase tracking-widest text-text-muted">No data matches these filters</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
