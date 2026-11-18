'use client';

// Pay-by-month chart for tech Activity, in its own file so recharts loads
// after the page (activity/page.tsx imports it with next/dynamic).
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { Tip } from '@/components/chart-bits';

const money = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 });
const monthLabel = (ym: string) => new Date(`${ym}-01T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

export default function PayChart({ monthly }: { monthly: { month: string; approved: number; pending: number }[] }) {
  return (
    <ChartContainer config={{ approved: { label: 'Approved', color: 'var(--text-green)' }, pending: { label: 'Pending', color: 'var(--accent-gold)' } } satisfies ChartConfig} className="w-full h-[260px]">
                  <BarChart data={monthly} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} className="text-[11px]" tickFormatter={monthLabel} minTickGap={8} />
                    <YAxis tickLine={false} axisLine={false} className="text-[11px]" tickFormatter={v => `$${v}`} width={48} />
                    <Tooltip cursor={{ opacity: 0.1 }} content={({ payload }) => {
                      const d = payload?.[0]?.payload as { month: string; approved: number; pending: number } | undefined;
                      return d ? <Tip title={monthLabel(d.month)} lines={[`${money(d.approved)} approved`, `${money(d.pending)} pending`]} /> : null;
                    }} />
                    <Bar dataKey="approved" stackId="p" fill="var(--color-approved)" />
                    <Bar dataKey="pending" stackId="p" fill="var(--color-pending)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ChartContainer>
  );
}
