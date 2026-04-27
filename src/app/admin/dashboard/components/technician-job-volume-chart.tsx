
"use client";

import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig
  } from "@/components/ui/chart"
import { Bar, BarChart, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const chartData = [
  { month: "Jan", jobs: 186 },
  { month: "Feb", jobs: 305 },
  { month: "Mar", jobs: 237 },
  { month: "Apr", jobs: 273 },
  { month: "May", jobs: 209 },
  { month: "Jun", jobs: 214 },
]

const chartConfig = {
  jobs: {
    label: "Jobs",
    color: "hsl(var(--accent))",
  },
} satisfies ChartConfig;


export function TechnicianJobVolumeChart() {
    return (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Technician Job Volume</CardTitle>
            <Button variant="secondary" size="sm" className="h-auto px-3 py-1 text-accent-gold border-accent-gold">Monthly</Button>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
              <ChartContainer config={chartConfig} className="w-full h-full">
                <BarChart accessibilityLayer data={chartData} margin={{ top: 20, right: 20, bottom: 5, left: 0 }}>
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} stroke="var(--text-muted)" fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} stroke="var(--text-muted)" fontSize={12} />
                    <ChartTooltip 
                        cursor={{fill: 'var(--bg-tertiary)'}}
                        content={<ChartTooltipContent 
                            className="bg-elevated border-border-default"
                            labelClassName="font-bold text-text-primary"
                        />} 
                    />
                    <Bar dataKey="jobs" radius={4} fill="var(--color-jobs)" />
                </BarChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
    )
}
