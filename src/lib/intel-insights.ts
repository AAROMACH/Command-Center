import { jobEconomics, techPayByJob } from './financial-summary';
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
    /** Job pay (or the job's paid invoice) + paid invoices not tied to a job. */
    revenue: number;
    /** Tech portion for this client's completed jobs. */
    labor: number;
    /** Field Nation's 15.85% on this client's FN jobs. */
    fnFees: number;
    /** Aaromach portion = revenue − labor − FN fees. */
    grossProfit: number;
    margin: number | null;
};

/**
 * Top clients by job volume, on the same money model as the Financials cards
 * (lib/financial-summary.ts jobEconomics): revenue is what each completed job
 * pays into the app (its pay, or its paid invoice pre-tax), plus paid
 * invoices not tied to a job; labor is the tech portion (weekly-log
 * settlement, or the same formula on the job's pay); Field Nation keeps
 * 15.85% of FN jobs; gross profit is the Aaromach portion.
 */
export function topClients(
    jobs: WorkOrder[],
    logs: WeeklyLog[],
    invoices: Invoice[],
    limit = 10,
): ClientRow[] {
    const jobsById = new Map<string, WorkOrder>();
    for (const j of jobs) if (!jobsById.has(j.id)) jobsById.set(j.id, j);
    const logged = techPayByJob(logs, jobsById);
    const paidByJob = new Map<string, Invoice>();
    for (const inv of invoices) if (inv.status === 'paid' && inv.workOrderId) paidByJob.set(inv.workOrderId, inv);

    const rows = new Map<string, ClientRow>();
    const rowFor = (name?: string) => {
        const client = (name || '').trim() || 'Unknown client';
        const r = rows.get(client) || { client, jobs: 0, completed: 0, revenue: 0, labor: 0, fnFees: 0, grossProfit: 0, margin: null };
        rows.set(client, r);
        return r;
    };

    for (const j of jobsById.values()) {
        if (isArchivedJob(j) || j.status === 'cancelled') continue;
        const r = rowFor(j.clientName);
        r.jobs += 1;
        if (j.status !== 'completed') continue;
        r.completed += 1;
        const e = jobEconomics(j, logged, paidByJob.get(j.id) || (j.workOrderId ? paidByJob.get(j.workOrderId) : undefined));
        r.revenue += e.revenue;
        r.labor += e.techPortion;
        r.fnFees += e.fnFee;
    }
    for (const inv of invoices) {
        if (inv.status !== 'paid' || inv.workOrderId) continue; // job-linked invoices counted with their job
        rowFor(inv.clientName).revenue += Number(inv.subtotal ?? inv.total) || 0;
    }

    return [...rows.values()]
        .map(r => {
            const grossProfit = r.revenue - r.labor - r.fnFees;
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
