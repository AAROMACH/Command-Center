'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ChartContainer, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

/**
 * @fileOverview Strategic cash-flow visualization for financial oversight.
 * Compares Monthly Revenue (Invoices) vs operational costs (Payroll + Expenses).
 */

type RevenueChartProps = {
    data: {
        month: string;
        revenue: number;
        expenses: number;
    }[];
};

const chartConfig = {
    revenue: {
        label: "Revenue",
        color: "var(--text-green)",
    },
    expenses: {
        label: "Expenses",
        color: "var(--brand-red)",
    },
} satisfies ChartConfig;

export function RevenueChart({ data }: RevenueChartProps) {
    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-[300px] w-full text-xs text-text-muted uppercase font-bold tracking-widest italic opacity-40">
                Awaiting Sufficient Registry Data for Analysis
            </div>
        );
    }

    return (
        <ChartContainer config={chartConfig} className="h-[350px] w-full">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.1} />
                <XAxis 
                    dataKey="month" 
                    tickLine={false} 
                    axisLine={false} 
                    className="text-[10px] font-bold uppercase"
                />
                <YAxis 
                    tickLine={false} 
                    axisLine={false} 
                    className="text-[9px] font-mono"
                    tickFormatter={(v) => `$${v}`}
                />
                <Tooltip content={<ChartTooltipContent />} />
                <Legend 
                    verticalAlign="top" 
                    align="right" 
                    iconType="circle" 
                    wrapperStyle={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.1em', paddingBottom: '20px' }} 
                />
                <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[4, 4, 0, 0]} />
            </BarChart>
        </ChartContainer>
    );
}
