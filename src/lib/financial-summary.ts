import { startOfMonth, endOfMonth, isWithinInterval, differenceInCalendarDays, startOfDay } from 'date-fns';
import type { Expense, Invoice, WeeklyLog, WorkOrder } from './types';
import { computeWeeklyLogSettlement } from './payroll';

/**
 * The Financials summary cards, computed in one place so the card values,
 * their drill-down breakdowns and the 6-month cash-flow chart can never
 * disagree. Every total comes with the exact records behind it.
 *
 * Definitions:
 *  - Revenue (MTD): invoices with status 'paid' whose ISSUE date is in the
 *    current month (invoices don't record a paid date).
 *  - Pending payouts: weekly logs in 'Submitted' (awaiting payroll approval),
 *    valued at their live settlement — the same number Payroll Audit shows.
 *  - Outstanding A/R: invoices 'sent' or 'overdue'. Drafts were never sent and
 *    aren't receivable; they're listed separately, not counted.
 *  - Costs (MTD): approved expenses dated this month + approved weekly logs
 *    whose week starts this month (live settlement).
 *  - Service margin: (revenue − costs) ÷ revenue.
 */

export const money = (n: unknown) => Number(n) || 0;

const parseDate = (s: string | undefined): Date | null => {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
};

/** weekOf 'MM-dd-yyyy' (or 'yyyy-MM-dd') → Date of that Monday. */
export const weekOfDate = (weekOf: string | undefined): Date | null => {
    const p = (weekOf || '').split(/[-/]/).map(Number);
    if (p.length !== 3 || p.some(n => !n)) return null;
    const d = String(p[0]).length === 4 ? new Date(p[0], p[1] - 1, p[2]) : new Date(p[2], p[0] - 1, p[1]);
    return isNaN(d.getTime()) ? null : d;
};

export type LogAmount = { log: WeeklyLog; amount: number };
export type AgingBucket = 'Not yet due' | '1–30 days late' | '31–60 days late' | '61–90 days late' | '90+ days late' | 'No due date';
export const AGING_ORDER: AgingBucket[] = ['Not yet due', '1–30 days late', '31–60 days late', '61–90 days late', '90+ days late', 'No due date'];

export type MonthBreakdown = {
    revenue: number;
    revenueInvoices: Invoice[];
    expenses: Expense[];
    expenseTotal: number;
    payroll: LogAmount[];
    payrollTotal: number;
    costs: number;
};

export function monthBreakdown(
    month: Date,
    data: { invoices: Invoice[]; expenses: Expense[]; weeklyLogs: WeeklyLog[]; jobsById: Map<string, WorkOrder> },
): MonthBreakdown {
    const interval = { start: startOfMonth(month), end: endOfMonth(month) };
    const inMonth = (d: Date | null) => !!d && isWithinInterval(d, interval);

    const revenueInvoices = data.invoices.filter(inv => inv.status === 'paid' && inMonth(parseDate(inv.issueDate)));
    const expenses = data.expenses.filter(e => e.status === 'Approved' && inMonth(parseDate(e.date)));
    const payroll = data.weeklyLogs
        .filter(l => l.status === 'Approved' && inMonth(weekOfDate(l.weekOf)))
        .map(log => ({ log, amount: computeWeeklyLogSettlement(log, data.jobsById) }));

    const revenue = revenueInvoices.reduce((s, i) => s + money(i.total), 0);
    const expenseTotal = expenses.reduce((s, e) => s + money(e.amount), 0);
    const payrollTotal = payroll.reduce((s, p) => s + p.amount, 0);
    return { revenue, revenueInvoices, expenses, expenseTotal, payroll, payrollTotal, costs: expenseTotal + payrollTotal };
}

export type FinancialSummary = {
    month: MonthBreakdown;
    margin: number;
    pending: LogAmount[];
    pendingTotal: number;
    receivables: { invoice: Invoice; bucket: AgingBucket }[];
    receivableTotal: number;
    drafts: Invoice[];
    draftTotal: number;
};

export function computeFinancialSummary(
    data: { invoices: Invoice[]; expenses: Expense[]; weeklyLogs: WeeklyLog[]; jobsById: Map<string, WorkOrder> },
    now: Date = new Date(),
): FinancialSummary {
    const month = monthBreakdown(now, data);
    const margin = month.revenue > 0 ? ((month.revenue - month.costs) / month.revenue) * 100 : 0;

    const pending = data.weeklyLogs
        .filter(l => l.status === 'Submitted')
        .map(log => ({ log, amount: computeWeeklyLogSettlement(log, data.jobsById) }));

    const today = startOfDay(now);
    const bucketFor = (inv: Invoice): AgingBucket => {
        const due = parseDate(inv.dueDate);
        if (!due) return 'No due date';
        const late = differenceInCalendarDays(today, startOfDay(due));
        if (late <= 0) return 'Not yet due';
        if (late <= 30) return '1–30 days late';
        if (late <= 60) return '31–60 days late';
        if (late <= 90) return '61–90 days late';
        return '90+ days late';
    };
    const receivables = data.invoices
        .filter(inv => inv.status === 'sent' || inv.status === 'overdue')
        .map(invoice => ({ invoice, bucket: bucketFor(invoice) }));
    const drafts = data.invoices.filter(inv => inv.status === 'draft');

    return {
        month,
        margin,
        pending,
        pendingTotal: pending.reduce((s, p) => s + p.amount, 0),
        receivables,
        receivableTotal: receivables.reduce((s, r) => s + money(r.invoice.total), 0),
        drafts,
        draftTotal: drafts.reduce((s, d) => s + money(d.total), 0),
    };
}
