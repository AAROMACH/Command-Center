import type { Invoice, WeeklyLog, WorkOrder } from './types';
import { effectiveJobPay, netOfFieldNationFee, FIELD_NATION_FEE_RATE } from './payroll';
import { formatCityState } from './utils';
import { isArchivedJob } from './jobs';

/**
 * Intel → Insights / map numbers. Pure over the data handed in.
 */

/** "City, ST" for a job, normalized for grouping; null when the address has no city. */
export function jobCity(job: Pick<WorkOrder, 'location'> & { locationText?: string }): string | null {
    const raw = (job.location || job.locationText || '').trim();
    if (!raw) return null;
    const cs = formatCityState(raw);
    if (!cs || cs === 'N/A' || !cs.includes(',')) return null;
    const [city, state] = cs.split(',').map(p => p.trim());
    if (!city || !state || /\d/.test(city)) return null;
    const titled = city.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    return `${titled}, ${state.toUpperCase().slice(0, 2)}`;
}

/** Live (non-archived, not cancelled) jobs worth counting for geography. */
const countsForGeo = (j: WorkOrder) => !isArchivedJob(j) && j.status !== 'cancelled';

export type CityRow = { city: string; jobs: number; completed: number };

export function topCities(jobs: WorkOrder[], limit = 10): CityRow[] {
    const m = new Map<string, CityRow>();
    for (const j of jobs) {
        if (!countsForGeo(j)) continue;
        const city = jobCity(j as WorkOrder & { locationText?: string });
        if (!city) continue;
        const row = m.get(city) || { city, jobs: 0, completed: 0 };
        row.jobs += 1;
        if (j.status === 'completed') row.completed += 1;
        m.set(city, row);
    }
    return [...m.values()].sort((a, b) => b.jobs - a.jobs || a.city.localeCompare(b.city)).slice(0, limit);
}

export type ClientRow = {
    client: string;
    jobs: number;
    completed: number;
    /** Field Nation net + paid direct invoices (pre-tax). */
    revenue: number;
    /** Tech settlement for this client's completed jobs. */
    labor: number;
    grossProfit: number;
    margin: number | null;
};

/**
 * Top clients by job volume, with gross profit:
 *  - Revenue: completed Field Nation (Imported) jobs bring in their pay net of
 *    the 15.85% FN fee; direct/manual work brings in paid invoices (subtotal,
 *    pre-tax) for that client. (Revenue used to come from invoices only, so
 *    clients paid through Field Nation always showed $0.)
 *  - Labor: what the techs are paid for that client's completed jobs — the
 *    weekly-log settlement (FN split / logged pay, approved reimbursements)
 *    when the job is on a log, otherwise the same formula on the job's pay.
 *    Disputed and rejected entries don't count.
 */
export function topClients(
    jobs: WorkOrder[],
    logs: WeeklyLog[],
    invoices: Invoice[],
    limit = 10,
): ClientRow[] {
    // Tech pay + approved reimbursements per job id, from every weekly log
    // except rejected ones (all techs — helpers included).
    const itemsByJob = new Map<string, { pay: number; reimb: number }>();
    const jobById = new Map<string, WorkOrder>();
    for (const j of jobs) { jobById.set(j.id, j); if (j.workOrderId && !jobById.has(j.workOrderId)) jobById.set(j.workOrderId, j); }

    for (const log of logs) {
        if ((log.status as string) === 'Rejected') continue;
        for (const item of log.items || []) {
            if (item.confirmationStatus === 'disputed') continue;
            const job = jobById.get(item.workOrderId);
            if (!job) continue;
            const e = itemsByJob.get(job.id) || { pay: 0, reimb: 0 };
            e.pay += item.payoutAmount !== undefined ? Number(item.payoutAmount) || 0 : effectiveJobPay(item, job);
            itemsByJob.set(job.id, e);
        }
        for (const r of log.reimbursements || []) {
            if (r.status === 'pending' || r.status === 'rejected') continue;
            const job = jobById.get(r.workOrderId || (r as { assignmentId?: string }).assignmentId || '');
            if (!job) continue;
            const e = itemsByJob.get(job.id) || { pay: 0, reimb: 0 };
            e.reimb += netOfFieldNationFee(r.amount || 0);
            itemsByJob.set(job.id, e);
        }
    }

    const rows = new Map<string, ClientRow>();
    const rowFor = (name?: string) => {
        const client = (name || '').trim() || 'Unknown client';
        const r = rows.get(client) || { client, jobs: 0, completed: 0, revenue: 0, labor: 0, grossProfit: 0, margin: null };
        rows.set(client, r);
        return r;
    };

    const seen = new Set<string>();
    for (const j of jobs) {
        if (seen.has(j.id) || isArchivedJob(j) || j.status === 'cancelled') continue;
        seen.add(j.id);
        const r = rowFor(j.clientName);
        r.jobs += 1;
        if (j.status !== 'completed') continue;
        r.completed += 1;
        if (j.source === 'Imported') r.revenue += (Number(j.pay) || 0) * (1 - FIELD_NATION_FEE_RATE);
        const logged = itemsByJob.get(j.id);
        r.labor += logged
            ? logged.pay + logged.reimb
            : effectiveJobPay({ id: '', workOrderId: j.id, jobPay: Number(j.pay) || 0, isComplete: true, isAdminReviewed: false, outcomeCode: null }, j);
    }
    for (const inv of invoices) {
        if (inv.status !== 'paid') continue;
        rowFor(inv.clientName).revenue += Number(inv.subtotal ?? inv.total) || 0;
    }

    return [...rows.values()]
        .map(r => {
            const grossProfit = r.revenue - r.labor;
            return { ...r, grossProfit, margin: r.revenue > 0 ? (grossProfit / r.revenue) * 100 : null };
        })
        .filter(r => r.jobs > 0 || r.revenue > 0)
        .sort((a, b) => b.jobs - a.jobs || b.grossProfit - a.grossProfit)
        .slice(0, limit);
}

// ── Job density grid (Michigan + Ohio) ──────────────────────────────────────

/** Map frame covering Michigan (both peninsulas) and Ohio. */
export const MI_OH_BOUNDS: [[number, number], [number, number]] = [[38.3, -90.5], [48.4, -80.4]];
/** Grid cell size in degrees (~10 miles north-south, ~10 miles east-west at this latitude). */
export const DENSITY_CELL_LAT = 0.15;
export const DENSITY_CELL_LNG = 0.2;

export type DensityCell = {
    key: string;
    south: number; west: number; north: number; east: number;
    count: number;
    cities: [string, number][];
};

export function densityGrid(jobs: WorkOrder[]): { cells: DensityCell[]; plotted: number; missingCoords: number; outside: number } {
    const [[s0, w0], [n0, e0]] = MI_OH_BOUNDS;
    const cells = new Map<string, DensityCell & { cityMap: Map<string, number> }>();
    let plotted = 0, missingCoords = 0, outside = 0;
    for (const j of jobs) {
        if (!countsForGeo(j)) continue;
        const lat = Number(j.lat), lng = Number(j.lng);
        if (!lat || !lng) { missingCoords += 1; continue; }
        if (lat < s0 || lat > n0 || lng < w0 || lng > e0) { outside += 1; continue; }
        const row = Math.floor((lat - s0) / DENSITY_CELL_LAT);
        const col = Math.floor((lng - w0) / DENSITY_CELL_LNG);
        const key = `${row}:${col}`;
        const south = s0 + row * DENSITY_CELL_LAT, west = w0 + col * DENSITY_CELL_LNG;
        const c = cells.get(key) || { key, south, west, north: south + DENSITY_CELL_LAT, east: west + DENSITY_CELL_LNG, count: 0, cities: [], cityMap: new Map() };
        c.count += 1;
        const city = jobCity(j as WorkOrder & { locationText?: string });
        if (city) c.cityMap.set(city, (c.cityMap.get(city) || 0) + 1);
        cells.set(key, c);
        plotted += 1;
    }
    return {
        cells: [...cells.values()].map(({ cityMap, ...c }) => ({ ...c, cities: [...cityMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3) })),
        plotted, missingCoords, outside,
    };
}

/**
 * Five density classes by quantile of the non-empty cells, so a few very
 * busy cells don't wash everything else out. Returns the upper bound of each
 * class (ascending) — a cell's class is the first bound ≥ its count.
 */
export function densityBreaks(counts: number[]): number[] {
    if (counts.length === 0) return [];
    const sorted = [...counts].sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
    const raw = [q(0.2), q(0.4), q(0.6), q(0.8), sorted[sorted.length - 1]];
    // Strictly increasing bounds (small datasets repeat values).
    const out: number[] = [];
    for (const v of raw) if (out.length === 0 || v > out[out.length - 1]) out.push(v);
    return out;
}
