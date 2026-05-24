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
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { format, isWithinInterval, startOfDay } from 'date-fns';
import { 
    Filter, 
    RefreshCw, 
    Zap, 
    TrendingUp, 
    ShieldCheck, 
    Coins, 
    Clock,
    X,
    Calendar as CalendarIcon,
    Download,
    BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { Technician, WorkOrder, WeeklyLog, ProjectDailyLog } from '@/lib/types';

type MetricType = 'reliability' | 'payouts' | 'assignments' | 'hours';
type GroupBy = 'tech' | 'client' | 'date';

export function IntelligenceTerminal() {
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [dailyLogs, setDailyLogs] = useState<ProjectDailyLog[]>([]);
    const [loading, setLoading] = useState(true);

    const [metric, setMetric] = useState<MetricType>('assignments');
    const [groupBy, setGroupBy] = useState<GroupBy>('tech');
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        to: new Date()
    });

    useEffect(() => {
        const unsubWO = onSnapshot(collection(db, 'workOrders'), (snap) => {
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
        if (loading) return [];

        const filteredWO = workOrders.filter(wo => {
            if (!dateRange?.from || !wo.scheduleDate) return true;
            try {
                const parts = wo.scheduleDate.split(/[-/]/);
                const d = parts[0].length === 4 ? new Date(wo.scheduleDate) : new Date(`${parts[2]}-${parts[0]}-${parts[1]}`);
                const start = startOfDay(dateRange.from);
                const end = dateRange.to ? startOfDay(dateRange.to) : start;
                return isWithinInterval(startOfDay(d), { start, end });
            } catch (e) { return true; }
        });

        const filteredWeekly = weeklyLogs.filter(log => {
            if (!dateRange?.from || !log.weekOf) return true;
            try {
                const [m, d, y] = log.weekOf.split('-');
                const logDate = startOfDay(new Date(parseInt(y), parseInt(m) - 1, parseInt(d)));
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
                .filter(t => !t.roles?.includes('client'))
                .map(tech => {
                    let value = 0;
                    if (metric === 'reliability') value = tech.reliabilityScore;
                    else if (metric === 'assignments') value = filteredWO.filter(wo => wo.assignedTechnicianId === tech.id).length;
                    else if (metric === 'payouts') value = filteredWeekly.filter(l => l.technicianId === tech.id).reduce((acc, curr) => acc + (curr.totalPayout || 0), 0);
                    else if (metric === 'hours') value = filteredDaily.filter(l => l.technicianId === tech.id).reduce((acc, curr) => acc + (curr.hoursWorked || 0), 0);

                    return { name: tech.name, value: parseFloat(value.toFixed(2)) };
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

                return { name, value: parseFloat(value.toFixed(2)) };
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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="space-y-4">
                <Card className="bg-bg-secondary border-border-main shadow-lg">
                    <CardHeader className="pb-3 border-b border-border-sub bg-bg-tertiary/30">
                        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                            <Filter size={14} className="text-brand-red" />
                            Analysis Constraints
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 space-y-6">
                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] font-bold uppercase text-text-muted ml-1">Visual Metric</Label>
                            <Select value={metric} onValueChange={(v: any) => setMetric(v)}>
                                <SelectTrigger className="bg-bg-primary h-11 text-xs uppercase font-bold tracking-wider">
                                    <div className="flex items-center gap-2">
                                        {metric === 'reliability' && <ShieldCheck size={14} className="text-brand-red"/>}
                                        {metric === 'payouts' && <Coins size={14} className="text-text-green"/>}
                                        {metric === 'assignments' && <Zap size={14} className="text-accent-gold"/>}
                                        {metric === 'hours' && <Clock size={14} className="text-text-muted"/>}
                                        <SelectValue />
                                    </div>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="assignments" className="text-xs uppercase font-bold">Assignment Volume</SelectItem>
                                    <SelectItem value="reliability" className="text-xs uppercase font-bold">Reliability Index (%)</SelectItem>
                                    <SelectItem value="payouts" className="text-xs uppercase font-bold">1099 Settlement ($)</SelectItem>
                                    <SelectItem value="hours" className="text-xs uppercase font-bold">Logged Field Hours</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] font-bold uppercase text-text-muted ml-1">Data Grouping</Label>
                            <Select value={groupBy} onValueChange={(v: any) => setGroupBy(v)}>
                                <SelectTrigger className="bg-bg-primary h-11 text-xs uppercase font-bold tracking-wider">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="tech" className="text-xs uppercase font-bold">By Field Operative</SelectItem>
                                    <SelectItem value="client" className="text-xs uppercase font-bold">By Client Entity</SelectItem>
                                    <SelectItem value="date" className="text-xs uppercase font-bold">By Calendar Date</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] font-bold uppercase text-text-muted ml-1">Temporal Window</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-bold text-xs bg-bg-primary h-11 border-border-sub relative pr-10",
                                            !dateRange && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {dateRange?.from ? (
                                            dateRange.to ? (
                                                <>{format(dateRange.from, "LLL dd")} - {format(dateRange.to, "LLL dd")}</>
                                            ) : (
                                                format(dateRange.from, "LLL dd, y")
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
                        </div>

                        <Separator className="bg-border-sub" />

                        <div className="p-4 rounded-lg bg-bg-tertiary/50 border border-border-sub space-y-3">
                            <div className="flex items-center gap-2">
                                <TrendingUp size={16} className="text-brand-red" />
                                <p className="text-[9px] font-black uppercase text-text-primary tracking-widest">Analysis Mode</p>
                            </div>
                            <p className="text-[9px] text-text-muted leading-relaxed uppercase font-medium">
                                Currently aggregating data for <span className="text-brand-red">{metric}</span> grouped by <span className="text-brand-red">{groupBy}</span>.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="lg:col-span-3">
                <Card className="bg-bg-secondary border-border-main h-full shadow-2xl overflow-hidden flex flex-col">
                    <CardHeader className="pb-2 border-b border-border-sub bg-bg-tertiary/20 text-left">
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle className="text-base font-bold uppercase tracking-wide">
                                    {metric.replace('_', ' ')} Logic Grid
                                </CardTitle>
                                <CardDescription className="text-[10px] uppercase font-bold text-text-muted mt-0.5">
                                    Visualization across the {groupBy} registry.
                                </CardDescription>
                            </div>
                            <Badge variant="outline" className="bg-bg-primary text-[8px] h-4 uppercase tracking-tighter">Live Handshake Active</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-8 flex-1 flex items-center justify-center">
                        {loading ? (
                            <div className="flex flex-col items-center gap-4 text-accent-gold">
                                <RefreshCw className="h-10 w-10 animate-spin" />
                                <p className="text-[10px] font-bold uppercase tracking-widest">Aggregating Registry Data...</p>
                            </div>
                        ) : chartData.length > 0 ? (
                            <ChartContainer config={chartConfig} className="w-full h-[500px]">
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
                            <div className="text-center space-y-4 opacity-40">
                                <BarChart3 size={64} className="mx-auto text-text-muted" />
                                <div className="space-y-1">
                                    <p className="text-sm font-bold uppercase tracking-widest text-text-muted">No tactical data matches these filters</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
