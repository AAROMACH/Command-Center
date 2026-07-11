'use client';

import { useMemo } from 'react';
import { 
    Bar, 
    BarChart, 
    CartesianGrid, 
    XAxis, 
    YAxis, 
    Tooltip, 
    Legend
} from 'recharts';
import { 
    ChartContainer, 
    ChartTooltipContent, 
    ChartLegend,
    ChartLegendContent,
    type ChartConfig 
} from '@/components/ui/chart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { Technician, WorkOrder, WeeklyLog } from '@/lib/types';
import { isClient } from '@/lib/permissions';
import { ShieldCheck, BarChart3, Coins, TrendingUp } from 'lucide-react';

type TechAnalyticsProps = {
    technicians: Technician[];
    workOrders: WorkOrder[];
    weeklyLogs: WeeklyLog[];
};

/**
 * @fileOverview High-fidelity tactical analytics terminal for operative comparison.
 */
export function TechAnalytics({ technicians, workOrders, weeklyLogs }: TechAnalyticsProps) {
    const activeTechs = useMemo(() => 
        technicians.filter(t => !isClient(t))
    , [technicians]);

    const chartData = useMemo(() => {
        return activeTechs.map(tech => {
            const myJobs = workOrders.filter(wo => wo.assignedTechnicianId === tech.id);
            const completed = myJobs.filter(wo => wo.status === 'completed').length;
            const myLogs = weeklyLogs.filter(log => log.techId === tech.id);
            const totalEarnings = myLogs.reduce((acc, log) => acc + (log.totalPayout || 0), 0);

            return {
                name: tech.name.split(' ')[0], // First name for label brevity
                fullName: tech.name,
                reliability: tech.reliabilityScore,
                assigned: myJobs.length,
                completed: completed,
                earnings: totalEarnings,
            };
        }).sort((a, b) => b.reliability - a.reliability);
    }, [activeTechs, workOrders, weeklyLogs]);

    const reliabilityConfig = {
        reliability: {
            label: "Reliability Index",
            color: "var(--brand-red)",
        },
    } satisfies ChartConfig;

    const volumeConfig = {
        assigned: {
            label: "Total Assigned",
            color: "var(--text-muted)",
        },
        completed: {
            label: "Verified Finalized",
            color: "var(--text-green)",
        },
    } satisfies ChartConfig;

    const earningsConfig = {
        earnings: {
            label: "Settled Payouts",
            color: "var(--accent-gold)",
        },
    } satisfies ChartConfig;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-bg-secondary border-border-main shadow-sm">
                    <CardHeader className="text-left pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <ShieldCheck size={16} className="text-brand-red" />
                            Operative Trust Comparison
                        </CardTitle>
                        <CardDescription className="text-[10px] uppercase font-bold text-text-muted">Reliability Index (%) per active field operative.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={reliabilityConfig} className="h-[280px] w-full">
                            <BarChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.1} />
                                <XAxis 
                                    dataKey="name" 
                                    tickLine={false} 
                                    axisLine={false} 
                                    className="text-[10px] font-bold uppercase"
                                />
                                <YAxis 
                                    domain={[0, 100]} 
                                    tickLine={false} 
                                    axisLine={false} 
                                    className="text-[9px] font-mono"
                                />
                                <Tooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="reliability" fill="var(--color-reliability)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card className="bg-bg-secondary border-border-main shadow-sm">
                    <CardHeader className="text-left pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <BarChart3 size={16} className="text-text-green" />
                            Assignment Throughput
                        </CardTitle>
                        <CardDescription className="text-[10px] uppercase font-bold text-text-muted">Total missions vs finalized results per operative.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={volumeConfig} className="h-[280px] w-full">
                            <BarChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.1} />
                                <XAxis 
                                    dataKey="name" 
                                    tickLine={false} 
                                    axisLine={false} 
                                    className="text-[10px] font-bold uppercase"
                                />
                                <YAxis 
                                    tickLine={false} 
                                    axisLine={false} 
                                    className="text-[9px] font-mono"
                                />
                                <Tooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar dataKey="assigned" fill="var(--color-assigned)" radius={[2, 2, 0, 0]} />
                                <Bar dataKey="completed" fill="var(--color-completed)" radius={[2, 2, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card className="bg-bg-secondary border-border-main md:col-span-2 shadow-sm">
                    <CardHeader className="text-left pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <Coins size={16} className="text-accent-gold" />
                            Financial Settlement Distribution
                        </CardTitle>
                        <CardDescription className="text-[10px] uppercase font-bold text-text-muted">Cumulative 1099 disbursements processed via weekly log registry.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={earningsConfig} className="h-[350px] w-full">
                            <BarChart data={chartData} layout="vertical" margin={{ top: 20, right: 30, left: 40, bottom: 0 }}>
                                <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.1} />
                                <XAxis 
                                    type="number" 
                                    tickLine={false} 
                                    axisLine={false} 
                                    tickFormatter={(v) => `$${v}`}
                                    className="text-[9px] font-mono"
                                />
                                <YAxis 
                                    dataKey="fullName" 
                                    type="category" 
                                    tickLine={false} 
                                    axisLine={false} 
                                    width={120} 
                                    className="text-[10px] uppercase font-black tracking-tight" 
                                />
                                <Tooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="earnings" fill="var(--color-earnings)" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>
            
            <div className="p-4 rounded-xl bg-bg-tertiary/50 border border-border-sub flex items-center gap-4">
                <div className="p-2 bg-bg-secondary rounded border border-border-sub text-accent-gold">
                    <TrendingUp size={18} />
                </div>
                <div className="text-left">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-primary">Strategic Insight</p>
                    <p className="text-[10px] text-text-muted leading-relaxed uppercase font-medium">
                        Analytics are aggregated from live registry data across the assignment, user, and payroll hubs.
                    </p>
                </div>
            </div>
        </div>
    );
}
