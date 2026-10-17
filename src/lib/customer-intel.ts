import { jobEconomics, techPayByJob } from './financial-summary';
import { isArchivedJob, jobTechId } from './jobs';
import { onSiteSessions } from './time-on-site';
import type { Invoice, TripLog, WeeklyLog, WorkOrder } from './types';

/**
 * Intel → customer dashboard. One row per completed job, shaped like the
 * Field Nation work order report (buyer / provider / gross / fees / net /
 * hours), so the same questions work on live app data: which customers
 * bring in the most, and which pay best per hour on site.
 *
 *   gross = what the job pays in (paid invoice pre-tax, else job pay)
 *   fees  = Field Nation's 15.85% on imported jobs, 0 otherwise
 *   net   = gross − fees (before tech pay)
 *   hours = on-site time from check-in → check-out trips; null when none
 *   date  = the job's work date (YYYY-MM-DD)
 *   approved = the job sits on an Approved weekly log
 */
export type IntelRow = {
    id: string;
    type: string;
    buyer: string;
    provider: string;
    date: string | null;
    approved: boolean;
    total: number;
    fees: number;
    net: number;
    hours: number | null;
};

/** MM-DD-YYYY or YYYY-MM-DD → YYYY-MM-DD; null when it isn't a date. */
export function isoDay(raw?: string | null): string | null {
    if (!raw) return null;
    const p = raw.trim().slice(0, 10).split(/[-/]/);
    if (p.length !== 3) return null;
    const [y, m, d] = p[0].length === 4 ? p : [p[2], p[0], p[1]];
    if (!/^\d{4}$/.test(y) || !+m || !+d) return null;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function buildIntelRows(
    jobs: WorkOrder[],
    logs: WeeklyLog[],
    invoices: Invoice[],
    trips: TripLog[],
    techName: (id: string) => string | undefined,
): IntelRow[] {
    const jobsById = new Map<string, WorkOrder>();
    for (const j of jobs) if (!jobsById.has(j.id)) jobsById.set(j.id, j);
    const logged = techPayByJob(logs, jobsById);
    const paidByJob = new Map<string, Invoice>();
    for (const inv of invoices) if (inv.status === 'paid' && inv.workOrderId) paidByJob.set(inv.workOrderId, inv);
    const approvedIds = new Set<string>();
    for (const log of logs) {
        if (log.status !== 'Approved') continue;
        for (const item of log.items || []) if (item.workOrderId) approvedIds.add(item.workOrderId);
    }
    const minutes = new Map<string, number>();
    for (const s of onSiteSessions(trips)) {
        if (!s.workOrderId || s.minutesWorked == null) continue;
        minutes.set(s.workOrderId, (minutes.get(s.workOrderId) || 0) + s.minutesWorked);
    }

    const rows: IntelRow[] = [];
    for (const j of jobsById.values()) {
        if (isArchivedJob(j) || j.status !== 'completed') continue;
        const e = jobEconomics(j, logged, paidByJob.get(j.id) || (j.workOrderId ? paidByJob.get(j.workOrderId) : undefined));
        const techId = jobTechId(j);
        const mins = minutes.get(j.id) ?? (j.workOrderId ? minutes.get(j.workOrderId) : undefined);
        rows.push({
            id: j.id,
            type: (j.jobType || j.projectType || '').trim() || '(none)',
            buyer: (j.clientName || '').trim() || '(none)',
            provider: (techId && techName(techId)) || (techId ? techId : '(unassigned)'),
            date: isoDay(j.scheduleDate),
            approved: approvedIds.has(j.id),
            total: e.revenue,
            fees: e.fnFee,
            net: Math.round((e.revenue - e.fnFee) * 100) / 100,
            hours: mins != null && mins > 0 ? mins / 60 : null,
        });
    }
    return rows;
}

export type IntelFilter = {
    start: string | null;
    end: string | null;
    type: string | null;
    provider: string | null;
    buyer: string | null;
};

export function inIntelFilter(r: IntelRow, f: IntelFilter, ignoreBuyer = false): boolean {
    if (f.start && (!r.date || r.date < f.start)) return false;
    if (f.end && (!r.date || r.date > f.end)) return false;
    if (f.type && r.type !== f.type) return false;
    if (f.provider && r.provider !== f.provider) return false;
    if (!ignoreBuyer && f.buyer && r.buyer !== f.buyer) return false;
    return true;
}

/** Net per on-site hour over rows that logged hours (optionally skipping > 24 h). */
export function rateParts(rows: IntelRow[], cap: boolean) {
    let n = 0, h = 0;
    for (const r of rows) {
        if (r.hours != null && r.hours > 0 && (!cap || r.hours <= 24)) { n += r.net; h += r.hours; }
    }
    return { net: n, hours: h, rate: h > 0 ? n / h : null };
}

export type CustomerRow = {
    buyer: string;
    jobs: number;
    net: number;
    total: number;
    fees: number;
    share: number;
    avg: number;
    hours: number;
    rate: number | null;
    feePct: number;
    last: string;
    mainType: string;
};

export function byCustomer(rows: IntelRow[], cap: boolean): CustomerRow[] {
    const totalNet = rows.reduce((s, r) => s + r.net, 0);
    const groups = new Map<string, IntelRow[]>();
    for (const r of rows) {
        const g = groups.get(r.buyer);
        if (g) g.push(r); else groups.set(r.buyer, [r]);
    }
    return [...groups.entries()].map(([buyer, rs]) => {
        const net = rs.reduce((s, r) => s + r.net, 0);
        const total = rs.reduce((s, r) => s + r.total, 0);
        const fees = rs.reduce((s, r) => s + r.fees, 0);
        const types = new Map<string, number>();
        for (const r of rs) types.set(r.type, (types.get(r.type) || 0) + 1);
        const mainType = [...types.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
        return {
            buyer, jobs: rs.length, net, total, fees,
            share: totalNet ? net / totalNet : 0,
            avg: net / rs.length,
            hours: rs.reduce((s, r) => s + (r.hours != null && (!cap || r.hours <= 24) ? r.hours : 0), 0),
            rate: rateParts(rs, cap).rate,
            feePct: total ? fees / total : 0,
            last: rs.reduce((m, r) => (r.date && r.date > m ? r.date : m), ''),
            mainType,
        };
    });
}

export function median(values: number[]): number | null {
    if (!values.length) return null;
    const s = [...values].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
