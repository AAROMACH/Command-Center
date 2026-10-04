'use client';

import { useMemo } from 'react';
import { format } from 'date-fns';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Invoice, Technician } from '@/lib/types';
import { jobTechId } from '@/lib/jobs';
import { usePaged, ListPager, PAGE_SIZES_LARGE } from '@/components/list-pager';
import { AGING_ORDER, money, type FinancialSummary, type JobLine } from '@/lib/financial-summary';
import { parseLocalDate } from '@/lib/jobs';

export type MetricKey = 'revenue' | 'tech' | 'profit' | 'pending' | 'ar';

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

/** Per-job revenue / tech portion / FN fee / Aaromach portion, paged. */
function JobLinesTable({ rows, techName }: { rows: JobLine[]; techName: (id: string) => string }) {
    const sorted = useMemo(() => [...rows].sort((a, b) => b.revenue - a.revenue), [rows]);
    const pager = usePaged(sorted, PAGE_SIZES_LARGE, 'financials-job-lines');
    if (rows.length === 0) return <p className="text-[10px] text-text-muted">None.</p>;
    return (
        <div className="rounded-lg border border-border-sub overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="text-[9px] uppercase">Job</TableHead>
                        <TableHead className="text-[9px] uppercase">Tech</TableHead>
                        <TableHead className="text-[9px] uppercase text-right">Revenue</TableHead>
                        <TableHead className="text-[9px] uppercase text-right">Tech</TableHead>
                        <TableHead className="text-[9px] uppercase text-right">FN fee</TableHead>
                        <TableHead className="text-[9px] uppercase text-right">Aaromach</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {pager.items.map(l => (
                        <TableRow key={l.job.id}>
                            <TableCell className="text-[10px]">
                                <a href={`/admin/assignments/${l.job.id}`} className="font-mono text-blue-400 hover:underline">{l.job.id.toUpperCase()}</a>
                                <span className="block text-text-muted truncate max-w-[160px]">{l.job.clientName || '—'}{l.invoice ? ` · inv ${l.invoice.invoiceNumber || l.invoice.id}` : l.imported ? ' · FN' : ''}</span>
                            </TableCell>
                            <TableCell className="text-[10px]">{techName(jobTechId(l.job) || '') || '—'}</TableCell>
                            <TableCell className="text-[10px] font-mono text-right">{usd(l.revenue)}</TableCell>
                            <TableCell className="text-[10px] font-mono text-right">{usd(l.techPortion)}</TableCell>
                            <TableCell className="text-[10px] font-mono text-right">{l.fnFee ? usd(l.fnFee) : '—'}</TableCell>
                            <TableCell className={`text-[10px] font-mono text-right font-bold ${l.profit < 0 ? 'text-text-red' : 'text-text-green'}`}>{usd(l.profit)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <div className="px-3"><ListPager pager={pager} noun="jobs" /></div>
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
            const byClient = sumBy<{ c: string; v: number }>([
                ...month.jobs.map(j => ({ c: j.job.clientName || 'Unknown client', v: j.revenue })),
                ...month.revenueInvoices.map(i => ({ c: i.clientName || 'Unknown client', v: money(i.subtotal ?? i.total) })),
            ], r => r.c, r => r.v);
            return {
                title: 'Revenue (MTD)',
                value: usd(month.revenue),
                how: `Everything paid into the app in ${monthLabel}: the pay on each job completed this month (by scheduled date) — or, when a paid client invoice is linked to the job, that invoice before tax — ${usd(month.jobRevenue)}; plus paid invoices issued this month that aren't tied to a job (projects / direct billing), ${usd(month.invoiceRevenue)}.`,
                body: (
                    <>
                        <Section title="Revenue by client">
                            <BreakdownBars data={topGroups(byClient)} emptyText="No revenue recorded this month" />
                        </Section>
                        <Section title={`Completed jobs counted (${month.jobs.length})`}>
                            <JobLinesTable rows={month.jobs} techName={techName} />
                        </Section>
                        <Section title={`Paid invoices not tied to a job (${month.revenueInvoices.length})`}>
                            <InvoiceTable rows={month.revenueInvoices} />
                        </Section>
                    </>
                ),
            };
        }
        if (metric === 'tech') {
            const byTech = sumBy(month.jobs, j => techName(jobTechId(j.job) || '') || 'Unassigned', j => j.techPortion);
            return {
                title: 'Tech Pay (MTD)',
                value: usd(month.techPortion),
                how: `What the techs are paid for the jobs completed in ${monthLabel} — their weekly-log settlement (Field Nation jobs: half of the pay after the 15.85% FN fee; manual jobs: the logged pay), or the same formula on the job's pay if it isn't on a log yet. Helpers' entries count too. This is the expense side.`,
                body: (
                    <>
                        <Section title="Tech pay by technician (lead tech on the job)">
                            <BreakdownBars data={topGroups(byTech)} emptyText="No completed jobs this month" />
                        </Section>
                        <Section title={`Jobs counted (${month.jobs.length})`}>
                            <JobLinesTable rows={month.jobs} techName={techName} />
                        </Section>
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
        // profit
        const bars = [
            { name: 'Revenue', value: month.revenue },
            { name: 'Tech pay', value: month.techPortion },
            { name: 'Field Nation fees', value: month.fnFees },
            { name: 'Aaromach portion', value: Math.max(0, month.profit) },
            { name: 'Approved expenses', value: month.expenseTotal },
        ];
        const byClient = sumBy(month.jobs, j => j.job.clientName || 'Unknown client', j => j.profit);
        return {
            title: 'Aaromach Profit (MTD)',
            value: usd(month.profit),
            how: `Revenue − tech pay − Field Nation fees for ${monthLabel}: ${usd(month.revenue)} − ${usd(month.techPortion)} − ${usd(month.fnFees)} = ${usd(month.profit)} (${summary.margin.toFixed(1)}% of revenue). After approved company expenses dated this month (${usd(month.expenseTotal)}), net is ${usd(month.netProfit)}.`,
            body: (
                <>
                    <Section title="Where the money went">
                        <BreakdownBars data={bars} emptyText="No revenue or costs recorded this month" />
                    </Section>
                    <Section title="Aaromach portion by client">
                        <BreakdownBars data={topGroups(byClient)} emptyText="No completed jobs this month" />
                    </Section>
                    <Section title={`Jobs counted (${month.jobs.length})`}>
                        <JobLinesTable rows={month.jobs} techName={techName} />
                    </Section>
                    <Section title={`Approved expenses (${month.expenses.length})`}>
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
