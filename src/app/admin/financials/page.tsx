'use client';
import { Banknote, Calendar as CalendarIcon, SlidersHorizontal, Upload, Briefcase, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatCard } from '@/app/admin/dashboard/components/stat-card';
import { profitabilityData } from '@/lib/data';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useState } from 'react';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';


const financialStats = [
    { label: "Total Revenue (Q2)", value: "$1.2M", delta: "+12.5% vs Q1", deltaType: "positive" as const, icon: "TrendingUp" as const },
    { label: "Net Profit (Q2)", value: "$450K", delta: "+8.2% vs Q1", deltaType: "positive" as const, icon: "DollarSign" as const },
    { label: "Total Costs (Q2)", value: "$750K", delta: "+15.1% vs Q1", deltaType: "warning" as const, icon: "TrendingDown" as const },
    { label: "Open Invoices", value: "32", delta: "$85,230 overdue", deltaType: "negative" as const, icon: "FileText" as const },
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
                  <h1 className="page-title">Operational Finance</h1>
                  <p className="page-subtitle">Real-time profitability analysis of all billable work.</p>
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
                        Export
                    </Button>
                </div>
            </header>

            <div className="mb-6 grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-border-default bg-border-default">
                {financialStats.map(stat => (
                    <StatCard key={stat.label} label={stat.label} value={stat.value} delta={stat.delta} deltaType={stat.deltaType} icon={stat.icon} />
                ))}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Operational Profitability</CardTitle>
                    <CardDescription>Financial performance of all jobs and projects.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="table-wrap !rounded-none !border-x-0 !border-b-0">
                        <table className="tbl">
                            <thead>
                                <tr>
                                    <th>ID / Name</th>
                                    <th>Client</th>
                                    <th className="text-right">Revenue</th>
                                    <th className="text-right">Labor Cost</th>
                                    <th className="text-right">Material Cost</th>
                                    <th className="text-right">Total Cost</th>
                                    <th className="text-right">Net Profit</th>
                                    <th className="text-right">Margin</th>
                                </tr>
                            </thead>
                            <tbody>
                                {profitabilityData.map(item => (
                                    <tr key={item.id}>
                                        <td>
                                            <div className="cell-id">{item.id.toUpperCase()}</div>
                                            <div className="flex items-center gap-2">
                                                {item.type === 'Project' ? <Briefcase size={14} className="text-text-muted"/> : <Wrench size={14} className="text-text-muted"/>}
                                                <div className="font-semibold text-text-primary text-sm">{item.name}</div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="text-sm text-text-secondary">{item.client}</div>
                                        </td>
                                        <td className="text-right font-mono text-text-secondary">{formatCurrency(item.revenue)}</td>
                                        <td className="text-right font-mono text-text-secondary">{formatCurrency(item.laborCost)}</td>
                                        <td className="text-right font-mono text-text-secondary">{formatCurrency(item.materialCost)}</td>
                                        <td className="text-right font-mono text-text-secondary font-bold">{formatCurrency(item.totalCost)}</td>
                                        <td className={`text-right font-mono font-bold ${item.net >= 0 ? 'text-text-green' : 'text-text-red'}`}>{formatCurrency(item.net)}</td>
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
