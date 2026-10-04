import { startOfMonth, endOfMonth, isWithinInterval, differenceInCalendarDays, startOfDay } from 'date-fns';
import type { Expense, Invoice, WeeklyLog, WorkOrder } from './types';
import { computeWeeklyLogSettlement, effectiveJobPay, FIELD_NATION_FEE_RATE } from './payroll';
import { parseLocalDate, isArchivedJob } from './jobs';

/**
 * The Financials summary cards, computed in one place so the card values,
 * their drill-downs and the 6-month cash-flow chart can never disagree.
 * Every total comes with the exact records behind it.
 *
 * Money model (per job):
 *  - Revenue  = what the job pays into the app: its pay. When a PAID client
 *    invoice is linked to the job, that invoice (pre-tax subtotal) is the
 *    money that came in, so it's the revenue instead. Paid invoices not tied
 *    to a job (project / direct billing) are revenue too.
 *  - Tech portion (expense) = what the techs are paid for the job — the
 *    weekly-log settlement (FN 50% of net, logged pay for manual jobs), or the
 *    same formula on the job's pay when it isn't on a log yet.
 *  - Field Nation fee = 15.85% of an Imported job's pay (FN keeps it).
 *  - Aaromach portion (profit) = revenue − tech portion − FN fee.
 *  Approved company expenses are shown separately ("net after expenses").
 *
 * Month = the job's scheduled date (completed jobs only; archived and
 * cancelled jobs don't count). Invoices count in the month they were issued
 * (no payment date is recorded).
 *
 * Other cards:
 *  - Pending payouts: weekly logs in 'Submitted', at live settlement — the
 *    same number Payroll Audit shows.
 *  - Outstanding A/R: invoices 'sent' or 'overdue' (drafts listed, not counted).
 */

export const money = (n: unknown) => Number(n) || 0;

// Local-date parse: 'yyyy-MM-dd' via new Date() is UTC midnight, which put
// invoices issued on the 1st into the previous month in US time zones.
const parseDate = (s: string | undefined): Date | null => parseLocalDate(s);

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

/** One completed job's economics. */
export type JobLine = {
    job: WorkOrder;
    imported: boolean;
    /** Paid invoice used as the revenue, when one is linked to the job. */
    invoice?: Invoice;
    revenue: number;
    techPortion: number;
    fnFee: number;
    /** Aaromach portion. */
    profit: number;
};

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Tech pay per job id from weekly logs (every tech on the job, helpers
 * included; disputed items and Rejected logs don't count).
 */
export function techPayByJob(weeklyLogs: WeeklyLog[], jobsById: Map<string, WorkOrder>): Map<string, number> {
    const out = new Map<string, number>();
    for (const log of weeklyLogs) {
        if ((log.status as string) === 'Rejected') continue;
        for (const item of log.items || []) {
            if (item.confirmationStatus === 'disputed') continue;
            const job = jobsById.get(item.workOrderId);
            if (!job) continue;
            const pay = item.payoutAmount !== undefined ? money(item.payoutAmount) : effectiveJobPay(item, job);
            out.set(job.id, (out.get(job.id) || 0) + pay);
        }
    }
    return out;
}

/** Revenue / tech portion / FN fee / Aaromach portion for one job. */
export function jobEconomics(job: WorkOrder, loggedTechPay: Map<string, number>, paidInvoice?: Invoice): JobLine {
    const imported = job.source === 'Imported';
    const pay = money(job.pay);
    const revenue = paidInvoice ? money(paidInvoice.subtotal ?? paidInvoice.total) : pay;
    const techPortion = job.payrollExcluded ? 0
        : loggedTechPay.has(job.id) ? loggedTechPay.get(job.id)!
        : effectiveJobPay({ id: '', workOrderId: job.id, jobPay: pay, isComplete: true, isAdminReviewed: false, outcomeCode: null }, job);
    const fnFee = imported ? pay * FIELD_NATION_FEE_RATE : 0;
    return {
        job, imported, invoice: paidInvoice,
        revenue: cents(revenue), techPortion: cents(techPortion), fnFee: cents(fnFee),
        profit: cents(revenue - techPortion - fnFee),
    };
}

export type MonthBreakdown = {
    jobs: JobLine[];
    jobRevenue: number;
    /** Paid invoices issued this month that aren't linked to a counted job. */
    revenueInvoices: Invoice[];
    invoiceRevenue: number;
    revenue: number;
    techPortion: number;
    fnFees: number;
    /** Aaromach portion = revenue − tech portion − FN fees. */
    profit: number;
    expenses: Expense[];
    expenseTotal: number;
    /** Aaromach portion − approved company expenses. */
    netProfit: number;
    /** Everything that went out: tech portion + FN fees + expenses (chart). */
    costs: number;
};

type SummaryInput = { invoices: Invoice[]; expenses: Expense[]; weeklyLogs: WeeklyLog[]; jobsById: Map<string, WorkOrder> };

export function monthBreakdown(month: Date, data: SummaryInput): MonthBreakdown {
    const interval = { start: startOfMonth(month), end: endOfMonth(month) };
    const inMonth = (d: Date | null) => !!d && isWithinInterval(d, interval);

    const logged = techPayByJob(data.weeklyLogs, data.jobsById);
    const paidByJob = new Map<string, Invoice>();
    for (const inv of data.invoices) {
        if (inv.status === 'paid' && inv.workOrderId) paidByJob.set(inv.workOrderId, inv);
    }

    const seen = new Set<string>();
    const jobs: JobLine[] = [];
    for (const job of data.jobsById.values()) {
        if (seen.has(job.id)) continue;
        seen.add(job.id);
        if (job.status !== 'completed' || isArchivedJob(job)) continue;
        if (!inMonth(parseDate(job.scheduleDate))) continue;
        const inv = paidByJob.get(job.id) || (job.workOrderId ? paidByJob.get(job.workOrderId) : undefined);
        jobs.push(jobEconomics(job, logged, inv));
    }
    const usedInvoices = new Set(jobs.map(j => j.invoice?.id).filter(Boolean) as string[]);
    // A paid invoice linked to a job is that job's revenue (counted in the
    // job's month) — never a second time as a standalone invoice.
    const linkedIds = new Set(data.invoices.filter(i => i.workOrderId).map(i => i.id));
    const revenueInvoices = data.invoices.filter(inv =>
        inv.status === 'paid' && inMonth(parseDate(inv.issueDate)) && !usedInvoices.has(inv.id) && !linkedIds.has(inv.id));
    const expenses = data.expenses.filter(e => e.status === 'Approved' && inMonth(parseDate(e.date)));

    const sum = <T,>(rows: T[], f: (r: T) => number) => cents(rows.reduce((s, r) => s + f(r), 0));
    const jobRevenue = sum(jobs, j => j.revenue);
    const invoiceRevenue = sum(revenueInvoices, i => money(i.subtotal ?? i.total));
    const techPortion = sum(jobs, j => j.techPortion);
    const fnFees = sum(jobs, j => j.fnFee);
    const revenue = cents(jobRevenue + invoiceRevenue);
    const profit = cents(revenue - techPortion - fnFees);
    const expenseTotal = sum(expenses, e => money(e.amount));
    return {
        jobs, jobRevenue, revenueInvoices, invoiceRevenue, revenue, techPortion, fnFees, profit,
        expenses, expenseTotal, netProfit: cents(profit - expenseTotal), costs: cents(techPortion + fnFees + expenseTotal),
    };
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
    data: SummaryInput,
    now: Date = new Date(),
): FinancialSummary {
    const month = monthBreakdown(now, data);
    // Aaromach portion as a share of revenue.
    const margin = month.revenue > 0 ? (month.profit / month.revenue) * 100 : 0;

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
