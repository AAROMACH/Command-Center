"use client";

// Client dashboard charts, split out so recharts (~100 KB) loads after the
// page instead of with it (dashboard/page.tsx imports these with next/dynamic).
import { BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';

const tooltipStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border-main)', borderRadius: 8, fontSize: 12 };

export function RequestsChart({ requestsByMonth }: { requestsByMonth: { month: string; count: number }[] }) {
  return (
    <ChartContainer config={{ count: { label: 'Requests', color: 'var(--brand-red)' } } satisfies ChartConfig} className="aspect-auto h-[160px] w-full">
                            <BarChart data={requestsByMonth} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <Tooltip contentStyle={tooltipStyle} cursor={{ opacity: 0.1 }} />
                                <Bar dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} maxBarSize={40} name="Requests" />
                            </BarChart>
                        </ChartContainer>
  );
}

export function InvoiceChart({ invoicePie }: { invoicePie: { name: string; value: number; color: string }[] }) {
  return (
    <ChartContainer config={{ Paid: { label: 'Paid', color: 'var(--text-green)' }, Pending: { label: 'Pending', color: 'var(--accent-gold)' }, Overdue: { label: 'Overdue', color: 'var(--brand-red)' } } satisfies ChartConfig} className="aspect-auto h-[160px] w-full">
                            <PieChart>
                                <Pie data={invoicePie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} strokeWidth={0}>
                                    {invoicePie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                </Pie>
                                <Tooltip contentStyle={tooltipStyle} />
                            </PieChart>
                        </ChartContainer>
  );
}

export function ProgressChart({ projectProgress }: { projectProgress: { name: string; pct: number }[] }) {
  return (
    <ChartContainer config={{ pct: { label: 'Complete', color: 'var(--text-green)' } } satisfies ChartConfig} className="aspect-auto h-[160px] w-full">
                            <BarChart data={projectProgress} layout="vertical" margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
                                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                                <Tooltip contentStyle={tooltipStyle} cursor={{ opacity: 0.1 }} formatter={(v: number) => [`${v}%`, 'Complete']} />
                                <Bar dataKey="pct" fill="var(--color-pct)" radius={[0, 3, 3, 0]} maxBarSize={24} name="Complete" />
                            </BarChart>
                        </ChartContainer>
  );
}
