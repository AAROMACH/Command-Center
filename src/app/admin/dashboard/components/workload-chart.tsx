'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { ChartContainer, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

type WorkloadChartProps = {
    data: {
        name: string;
        assigned: number;
    }[];
};

const chartConfig = {
    assigned: {
        label: "Assignments",
        color: "hsl(var(--primary))",
    },
} satisfies ChartConfig;

export function WorkloadChart({ data }: WorkloadChartProps) {
    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-[250px] w-full text-sm text-text-muted">
                No data available for chart
            </div>
        )
    }
    return (
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <BarChart accessibilityLayer data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                    dataKey="name"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    tickFormatter={(value) => value.split(' ')[0]} // Show first name only
                    className="text-xs"
                />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip
                    cursor={false}
                    content={<ChartTooltipContent indicator="dot" />}
                />
                <Bar dataKey="assigned" fill="var(--color-assigned)" radius={4} />
            </BarChart>
        </ChartContainer>
    );
}
