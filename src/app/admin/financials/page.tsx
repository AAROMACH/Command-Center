'use client';
import { Banknote, FileText, TrendingUp, TrendingDown, DollarSign, Calendar as CalendarIcon, SlidersHorizontal, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatCard } from '@/app/admin/dashboard/components/stat-card';
import { Bar, BarChart, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useState } from 'react';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';


const financialStats = [
    { label: "Total Revenue (Q2)", value: "$1.2M", delta: "+12.5% vs Q1", deltaType: "positive" as const, icon: TrendingUp },
    { label: "Net Profit (Q2)", value: "$450K", delta: "+8.2% vs Q1", deltaType: "positive" as const, icon: DollarSign },
    { label: "Total Costs (Q2)", value: "$750K", delta: "+15.1% vs Q1", deltaType: "warning" as const, icon: TrendingDown },
    { label: "Open Invoices", value: "32", delta: "$85,230 overdue", deltaType: "negative" as const, icon: FileText },
];

const revenueData = [
  { month: "Jan", revenue: 45000, costs: 28000 },
  { month: "Feb", revenue: 52000, costs: 31000 },
  { month: "Mar", revenue: 68000, costs: 40000 },
  { month: "Apr", revenue: 61000, costs: 38000 },
  { month: "May", revenue: 75000, costs: 45000 },
  { month: "Jun", revenue: 82000, costs: 48000 },
];

const revenueChartConfig = {
  revenue: { label: "Revenue", color: "var(--text-green)" },
  costs: { label: "Costs", color: "var(--text-red)" },
} satisfies ChartConfig;

const expenseData = [
  { name: 'Labor', value: 450000, color: '#CC2200' },
  { name: 'Materials', value: 180000, color: '#C89B3C' },
  { name: 'Overhead', value: 90000, color: '#444444' },
  { name: 'Subcontractors', value: 30000, color: '#666666' },
];

const profitabilityData = [
    { id: 'proj-001', name: 'Ki9 Refresh', client: 'Ki9', budget: 15000, actual: 7500, profit: 7500, margin: 50.0 },
    { id: 'wo-106', name: 'Water heater replacement', client: 'Apartment Complex', budget: 750, actual: 850, profit: -100, margin: -13.3 },
    { id: 'wo-102', name: 'Repair central AC unit', client: 'Commercial Property', budget: 350, actual: 300, profit: 50, margin: 14.3 },
    { id: 'wo-104', name: 'Broken refrigerator', client: 'Restaurant Supply Co.', budget: 475, actual: 400, profit: 75, margin: 15.8 },
];

export default function FinancialsPage() {
    const [date, setDate] = useState<DateRange | undefined>(undefined);

    const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

    return (
        <div>
            <header className="page-header">
                <div>
                  <p className="page-eyebrow flex items-center gap-2">
                    <Banknote size={12} />
                    Finance & Accounting
                  </p>
                  <h1 className="page-title">Financial Hub</h1>
                  <p className="page-subtitle">Analysis of revenue, costs, and profitability across all operations.</p>
                </div>
                <div className="page-header-right items-center">
                    <Popover>
                        <PopoverTrigger asChild>
                          <Button id="date" variant={"outline"} size="default" className={cn("w-[240px] justify-start text-left font-normal normal-case", !date && "text-text-muted")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date?.from ? ( date.to ? (<>{format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}</>) : (format(date.from, "LLL dd, y")) ) : ( <span>Pick a date range</span> )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-bg-elevated" align="end">
                          <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={setDate} numberOfMonths={2} />
                        </PopoverContent>
                      </Popover>
                    <Button variant="outline" size="default">
                        <Upload size={14} className="mr-2"/>
                        Import
                    </Button>
                </div>
            </header>

            <div className="mb-6 grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-border-default bg-border-default">
                {financialStats.map(stat => (
                    <StatCard key={stat.label} label={stat.label} value={stat.value} delta={stat.delta} deltaType={stat.deltaType} icon={stat.icon} />
                ))}
            </div>

            <div className="grid grid-cols-5 gap-4 mb-6">
                <Card className="col-span-3">
                  <CardHeader>
                    <CardTitle>Revenue vs. Costs</CardTitle>
                    <CardDescription>Last 6 months</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[250px] w-full">
                       <ChartContainer config={revenueChartConfig} className="w-full h-full">
                        <BarChart accessibilityLayer data={revenueData} margin={{ top: 20, right: 20, bottom: 5, left: 0 }}>
                            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} stroke="var(--text-muted)" fontSize={12} />
                            <ChartTooltip cursor={{fill: 'var(--bg-tertiary)'}} content={<ChartTooltipContent className="bg-elevated border-border-default" labelClassName="font-bold text-text-primary" />} />
                            <Bar dataKey="revenue" radius={4} fill="var(--color-revenue)" />
                             <Bar dataKey="costs" radius={4} fill="var(--color-costs)" />
                        </BarChart>
                      </ChartContainer>
                    </div>
                  </CardContent>
                </Card>
                <Card className="col-span-2">
                    <CardHeader>
                        <CardTitle>Expense Breakdown (Q2)</CardTitle>
                        <CardDescription>Total costs: {formatCurrency(750000)}</CardDescription>
                    </CardHeader>
                     <CardContent>
                        <div className="h-[250px] w-full">
                             <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={expenseData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} labelLine={false} label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
                                        const RADIAN = Math.PI / 180;
                                        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                                        return (
                                          <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" className="text-xs font-bold">{`(${(percent * 100).toFixed(0)}%)`}</text>
                                        );
                                      }}>
                                        {expenseData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} stroke={entry.color} />
                                        ))}
                                    </Pie>
                                    <ChartTooltip cursor={{fill: 'var(--bg-tertiary)'}} content={<ChartTooltipContent className="bg-elevated border-border-default" />} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Project & Job Profitability</CardTitle>
                    <CardDescription>Financial performance of recent engagements.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="table-wrap !rounded-none !border-x-0 !border-b-0">
                        <table className="tbl">
                            <thead>
                                <tr>
                                    <th>ID / Name</th>
                                    <th>Client</th>
                                    <th className="text-right">Budget</th>
                                    <th className="text-right">Actual Cost</th>
                                    <th className="text-right">Net Profit</th>
                                    <th className="text-right">Profit Margin</th>
                                </tr>
                            </thead>
                            <tbody>
                                {profitabilityData.map(item => (
                                    <tr key={item.id}>
                                        <td>
                                            <div className="cell-id">{item.id.toUpperCase()}</div>
                                            <div className="font-semibold text-text-primary text-sm">{item.name}</div>
                                        </td>
                                        <td>
                                            <div className="text-sm text-text-secondary">{item.client}</div>
                                        </td>
                                        <td className="text-right font-mono text-text-secondary">{formatCurrency(item.budget)}</td>
                                        <td className="text-right font-mono text-text-secondary">{formatCurrency(item.actual)}</td>
                                        <td className={`text-right font-mono font-bold ${item.profit >= 0 ? 'text-text-green' : 'text-text-red'}`}>{formatCurrency(item.profit)}</td>
                                        <td className={`text-right font-mono font-bold ${item.margin >= 0 ? 'text-text-green' : 'text-text-red'}`}>{item.margin.toFixed(1)}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

        </div>
    )
}
