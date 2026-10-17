import { effectiveJobPay } from './payroll';
import { isArchivedJob, jobTechId } from './jobs';
import { isoDay } from './customer-intel';
import type { WeeklyLog, WorkOrder } from './types';

/**
 * Tech Portal → Activity. One row per job the tech led or helped on, with
 * THEIR pay: the weekly-log settlement when the job is on a log (payout
 * override, else the payroll formula — Field Nation jobs pay 50% of net),
 * otherwise an estimate from the job's pay. No time-on-site: Field Nation
 * hours aren't available to the app.
 */
export type PayStatus = 'approved' | 'submitted' | 'draft' | 'returned' | 'not-filed' | 'upcoming';

export const PAY_STATUS_LABELS: Record<PayStatus, string> = {
    approved: 'Approved',
    submitted: 'Submitted',
    draft: 'Draft',
    returned: 'Returned',
    'not-filed': 'Not filed',
    upcoming: 'Upcoming',
};

export type TechJobRow = {
    id: string;
    title: string;
    customer: string;
    type: string;
    date: string | null;
    status: WorkOrder['status'];
    role: 'lead' | 'helper';
    pay: number;
    /** Pay comes from the job, not a log yet (or a helper entry not priced). */
    estimated: boolean;
    payStatus: PayStatus;
    disputed: boolean;
};

const STATUS_RANK: Record<string, number> = { Approved: 4, Submitted: 3, Draft: 2, Rejected: 1 };
const LOG_TO_PAY: Record<string, PayStatus> = { Approved: 'approved', Submitted: 'submitted', Draft: 'draft', Rejected: 'returned' };
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function buildTechJobRows(jobs: WorkOrder[], logs: WeeklyLog[], techId: string): TechJobRow[] {
    // This tech's log entries per job (a job can sit on more than one log
    // after a move; take the furthest-along status and add the amounts).
    const onLogs = new Map<string, { pay: number; rank: number; status: string; disputed: boolean; unpriced: boolean }>();
    const byId = new Map(jobs.map(j => [j.id, j]));
    for (const log of logs) {
        if (log.techId !== techId) continue;
        for (const item of log.items || []) {
            if (!item.workOrderId) continue;
            const job = byId.get(item.workOrderId);
            const disputed = item.confirmationStatus === 'disputed';
            const amount = disputed ? 0 : (item.payoutAmount !== undefined ? Number(item.payoutAmount) || 0 : effectiveJobPay(item, job));
            const prev = onLogs.get(item.workOrderId);
            const rank = STATUS_RANK[log.status] || 0;
            onLogs.set(item.workOrderId, {
                pay: (prev?.pay || 0) + amount,
                rank: Math.max(prev?.rank || 0, rank),
                status: !prev || rank > prev.rank ? log.status : prev.status,
                disputed: (prev?.disputed || false) || disputed,
                unpriced: (prev?.unpriced || false) || (!!item.isHelper && !amount && item.payoutAmount === undefined),
            });
        }
    }

    const rows: TechJobRow[] = [];
    for (const job of jobs) {
        if (isArchivedJob(job) || job.status === 'cancelled') continue;
        const role: TechJobRow['role'] = jobTechId(job) === techId ? 'lead' : 'helper';
        const logged = onLogs.get(job.id);
        let pay = 0, estimated = false, payStatus: PayStatus;
        if (logged) {
            pay = logged.pay;
            payStatus = LOG_TO_PAY[logged.status] || 'draft';
            estimated = logged.unpriced;
        } else {
            payStatus = job.status === 'completed' ? 'not-filed' : 'upcoming';
            // Helpers are priced separately by payroll — no estimate for them.
            if (role === 'lead') {
                pay = effectiveJobPay({ id: '', workOrderId: job.id, jobPay: Number(job.pay) || 0, isComplete: false, isAdminReviewed: false }, job);
                estimated = true;
            }
        }
        rows.push({
            id: job.id,
            title: (job.title || job.description || job.externalWorkOrderId || job.id).trim(),
            customer: (job.clientName || '').trim() || '(none)',
            type: (job.jobType || job.projectType || '').trim() || '(none)',
            date: isoDay(job.scheduleDate),
            status: job.status,
            role,
            pay: cents(pay),
            estimated,
            payStatus,
            disputed: logged?.disputed || false,
        });
    }
    return rows;
}
