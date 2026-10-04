'use client';

import { useMemo } from 'react';
import { format } from 'date-fns';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Invoice, Technician } from '@/lib/types';
import { AGING_ORDER, money, type FinancialSummary } from '@/lib/financial-summary';
import { parseLocalDate } from '@/lib/jobs';

export type MetricKey = 'revenue' | 'pending' | 'ar' | 'margin';

const usd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usdShort = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtDate = (s?: string) => { try { return s ? format(new Date(s), 'MM/dd/yyyy') : '—'; } catch { return s || '—'; } };

const chartConfig = { value: { label: 'Amount', color: 'var(--brand-blue)' } } satisfies ChartConfig;

/** Biggest groups first; anything past the top 7 folds into "Other". */
function topGroups(entries: [string, number][], limit = 7) {
    const sorted = [...entries].sort((a, b) => b[1] - a[1]);
    const head = sorted.slice(0, limit).map(([name, value]) => ({ name, value }));
    const rest = sorted.slice(limit).reduce((s, [, v]) => s + v, 0);
    return rest > 0 ? [...head, { name: 'Other', value: rest }] : head;
}

function sumBy<T>(rows: T[], key: (r: T) => string, val: (r: T) => number): [string, number][] {
    const m = new Map<string, number>();
    rows.forEach(r => m.set(key(r), (m.get(key(r)) || 0) + val(r)));
    return [...m.entries()];
}

/** Single-series horizontal bar chart — one hue, values labeled at the bar end. */
function BreakdownBars({ data, emptyText }: { data: { name: string; value: number }[]; emptyText: string }) {
    if (data.length === 0 || data.every(d => d.value === 0)) {
        return <p className="py-8 text-center text-[10px] font-bold uppercase tracking-widest text-text-muted">{emptyText}</p>;
    }
    return (
        <ChartContainer config={chartConfig} className="w-full" style={{ height: Math.max(120, data.length * 34 + 24) }}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 72, left: 0, bottom: 4 }} barCategoryGap={8}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.15} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={130} tickLine={false} axisLine={false} className="text-[10px] font-bold" />
                <ChartTooltip cursor={{ opacity: 0.08 }} content={<ChartTooltipContent formatter={(v) => usd(Number(v))} hideIndicator />} />
                <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} barSize={16}>
                    <LabelList dataKey="value" position="right" formatter={(v: number) => usdShort(v)} className="fill-[var(--text-secondary)] text-[10px] font-mono" />
                </Bar>
            </BarChart>
        </ChartContainer>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">{title}</p>
            {children}
        </div>
    );
}

function InvoiceTable({ rows, extra }: { rows: Invoice[]; extra?: (inv: Invoice) => string }) {
    if (rows.length === 0) return <p className="text-[10px] text-text-muted">None.</p>;
    return (
        <div className="rounded-lg border border-border-sub overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="text-[9px] uppercase">Invoice</TableHead>
                        <TableHead className="text-[9px] uppercase">Client</TableHead>
                        <TableHead className="text-[9px] uppercase">{extra ? 'Due' : 'Issued'}</TableHead>
                        {extra && <TableHead className="text-[9px] uppercase">Aging</TableHead>}
                        <TableHead className="text-[9px] uppercase text-right">Total</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map(inv => (
                        <TableRow key={inv.id}>
                            <TableCell className="text-[10px] font-mono">{inv.invoiceNumber || inv.id}</TableCell>
                            <TableCell className="text-[10px]">{inv.clientName || '—'}</TableCell>
                            <TableCell className="text-[10px]">{fmtDate(extra ? inv.dueDate : inv.issueDate)}</TableCell>
                            {extra && <TableCell className="text-[10px]">{extra(inv)}</TableCell>}
                            <TableCell className="text-[10px] font-mono text-right">{usd(money(inv.total))}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

export function MetricBreakdownSheet({
    metric, onClose, summary, technicians, allInvoices,
}: {
    metric: MetricKey | null;
    onClose: () => void;
    summary: FinancialSummary;
    technicians: Technician[];
    allInvoices: Invoice[];
}) {
    const techName = (id: string) => technicians.find(t => t.id === id)?.name || id;
    const monthLabel = format(new Date(), 'MMMM yyyy');
    const { month } = summary;

    const content = useMemo(() => {
        if (!metric) return null;
        if (metric === 'revenue') {
            const unpaidThisMonth = allInvoices.filter(i => i.status !== 'paid' && i.status !== 'void' && month.revenueInvoices.every(r => r.id !== i.id)
                && (() => { const d = parseLocalDate(i.issueDate); return !!d && format(d, 'yyyy-MM') === format(new Date(), 'yyyy-MM'); })());
            return {
                title: 'Total Revenue (MTD)',
                value: usd(month.revenue),
                how: `Sum of invoices marked PAID that were issued in ${monthLabel}. Invoices don't record a payment date, so a paid invoice counts in the month it was issued.`,
                body: (
                    <>
                        <Section title="Revenue by client">
                            <BreakdownBars data={topGroups(sumBy(month.revenueInvoices, i => i.clientName || 'Unknown client', i => money(i.total)))} emptyText="No paid invoices issued this month" />
                        </Section>
                        <Section title={`Paid invoices counted (${month.revenueInvoices.length})`}>
                            <InvoiceTable rows={month.revenueInvoices} />
                        </Section>
                        {unpaidThisMonth.length > 0 && (
                            <Section title={`Not counted — issued this month but not paid yet (${unpaidThisMonth.length}, ${usd(unpaidThisMonth.reduce((s, i) => s + money(i.total), 0))})`}>
                                <InvoiceTable rows={unpaidThisMonth} />
                            </Section>
                        )}
                    </>
                ),
            };
        }
        if (metric === 'pending') {
            return {
                title: 'Pending Payouts',
                value: usd(summary.pendingTotal),
                how: 'Weekly logs techs have SUBMITTED that payroll hasn’t approved yet, valued at their current settlement (job pay net of Field Nation fees, plus approved reimbursements, minus disputed items) — the same figure Payroll Audit shows.',
                body: (
                    <>
                        <Section title="Pending by technician">
                            <BreakdownBars data={topGroups(sumBy(summary.pending, p => techName(p.log.techId), p => p.amount))} emptyText="No submitted logs awaiting approval" />
                        </Section>
                        <Section title={`Submitted logs counted (${summary.pending.length})`}>
                            {summary.pending.length === 0 ? <p className="text-[10px] text-text-muted">None.</p> : (
                                <div className="rounded-lg border border-border-sub overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="text-[9px] uppercase">Technician</TableHead>
                                                <TableHead className="text-[9px] uppercase">Week of</TableHead>
                                                <TableHead className="text-[9px] uppercase">Jobs</TableHead>
                                                <TableHead className="text-[9px] uppercase">Submitted</TableHead>
                                                <TableHead className="text-[9px] uppercase text-right">Settlement</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {[...summary.pending].sort((a, b) => b.amount - a.amount).map(p => (
                                                <TableRow key={p.log.id}>
                                                    <TableCell className="text-[10px]">{techName(p.log.techId)}</TableCell>
                                                    <TableCell className="text-[10px] font-mono">{p.log.weekOf}</TableCell>
                                                    <TableCell className="text-[10px]">{p.log.items?.length || 0}</TableCell>
                                                    <TableCell className="text-[10px]">{fmtDate(p.log.submittedAt)}</TableCell>
                                                    <TableCell className="text-[10px] font-mono text-right">{usd(p.amount)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </Section>
                    </>
                ),
            };
        }
        if (metric === 'ar') {
            const byBucket = new Map(summary.receivables.map(r => [r.invoice.id, r.bucket]));
            const bucketData = AGING_ORDER
                .map(b => ({ name: b, value: summary.receivables.filter(r => r.bucket === b).reduce((s, r) => s + money(r.invoice.total), 0) }))
                .filter(d => d.value > 0);
            return {
                title: 'Outstanding A/R',
                value: usd(summary.receivableTotal),
                how: 'Invoices that have been SENT to the client (or are OVERDUE) and aren’t paid or void yet. Drafts were never sent, so they aren’t money owed and aren’t counted.',
                body: (
                    <>
                        <Section title="Aging (by due date)">
                            <BreakdownBars data={bucketData} emptyText="Nothing outstanding" />
                        </Section>
                        <Section title={`Invoices counted (${summary.receivables.length})`}>
                            <InvoiceTable rows={summary.receivables.map(r => r.invoice)} extra={inv => byBucket.get(inv.id) || ''} />
                        </Section>
                        {summary.drafts.length > 0 && (
                            <Section title={`Not counted — drafts (${summary.drafts.length}, ${usd(summary.draftTotal)})`}>
                                <InvoiceTable rows={summary.drafts} />
                            </Section>
                        )}
                    </>
                ),
            };
        }
        // margin
        const bars = [
            { name: 'Revenue (paid)', value: month.revenue },
            { name: 'Approved expenses', value: month.expenseTotal },
            { name: 'Approved payroll', value: month.payrollTotal },
        ];
        return {
            title: 'Service Margin',
            value: `${summary.margin.toFixed(1)}%`,
            how: `(Revenue − Costs) ÷ Revenue for ${monthLabel}. Revenue = ${usd(month.revenue)}. Costs = approved expenses dated this month (${usd(month.expenseTotal)}) + approved weekly logs for weeks starting this month (${usd(month.payrollTotal)}) = ${usd(month.costs)}.${month.revenue === 0 ? ' With no paid revenue this month the margin shows 0%.' : ''}`,
            body: (
                <>
                    <Section title="Revenue vs costs this month">
                        <BreakdownBars data={bars} emptyText="No revenue or costs recorded this month" />
                    </Section>
                    <Section title={`Approved payroll counted (${month.payroll.length})`}>
                        {month.payroll.length === 0 ? <p className="text-[10px] text-text-muted">None.</p> : (
                            <div className="rounded-lg border border-border-sub overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-[9px] uppercase">Technician</TableHead>
                                            <TableHead className="text-[9px] uppercase">Week of</TableHead>
                                            <TableHead className="text-[9px] uppercase text-right">Settlement</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {month.payroll.map(p => (
                                            <TableRow key={p.log.id}>
                                                <TableCell className="text-[10px]">{techName(p.log.techId)}</TableCell>
                                                <TableCell className="text-[10px] font-mono">{p.log.weekOf}</TableCell>
                                                <TableCell className="text-[10px] font-mono text-right">{usd(p.amount)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </Section>
                    <Section title={`Approved expenses counted (${month.expenses.length})`}>
                        {month.expenses.length === 0 ? <p className="text-[10px] text-text-muted">None.</p> : (
                            <div className="rounded-lg border border-border-sub overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-[9px] uppercase">Date</TableHead>
                                            <TableHead className="text-[9px] uppercase">Category</TableHead>
                                            <TableHead className="text-[9px] uppercase">Description</TableHead>
                                            <TableHead className="text-[9px] uppercase text-right">Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {month.expenses.map(e => (
                                            <TableRow key={e.id}>
                                                <TableCell className="text-[10px]">{fmtDate(e.date)}</TableCell>
                                                <TableCell className="text-[10px]">{e.category}</TableCell>
                                                <TableCell className="text-[10px]">{e.description}</TableCell>
                                                <TableCell className="text-[10px] font-mono text-right">{usd(money(e.amount))}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </Section>
                    <Section title={`Paid invoices counted (${month.revenueInvoices.length})`}>
                        <InvoiceTable rows={month.revenueInvoices} />
                    </Section>
                </>
            ),
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [metric, summary, allInvoices, technicians]);

    return (
        <Sheet open={!!metric} onOpenChange={open => { if (!open) onClose(); }}>
            <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto bg-bg-elevated border-border-main text-left">
                {content && (
                    <div className="space-y-6">
                        <SheetHeader className="text-left space-y-2">
                            <SheetTitle className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">{content.title}</SheetTitle>
                            <p className="text-3xl font-mono font-bold tabular-nums text-text-primary">{content.value}</p>
                            <SheetDescription className="text-[11px] leading-relaxed text-text-secondary">
                                <span className="font-bold text-text-primary">How it’s calculated: </span>{content.how}
                            </SheetDescription>
                        </SheetHeader>
                        {content.body}
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
