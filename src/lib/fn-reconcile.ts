import type { Technician, WeeklyLog, WorkOrder } from './types';
import { externalWorkOrderId, normalizeExternalId } from './work-order-identity';
import { assignedTechOf } from './weekly-log-core';

// Field Nation "Work Order Report" CSV vs the app (Payroll → Field Nation check).
// Read-only: it reports differences, it never changes jobs or logs.
//
// Matching is by Field Nation work order number. Compared:
//  - Labor: FN "Labor" vs the job's pay (the app stores FN jobs at full labor).
//  - Hours: FN "Hours Logged" vs the hours the tech entered on their weekly log.
//  - Filing: is the job on a weekly log, and is that log approved / paid.

export type FnRow = {
  woId: string;
  typeOfWork: string;
  paid: string;
  approved: string;
  totalPay: number;
  netPay: number;
  labor: number;
  hours: number;
  additionalCharges: number;
  fnFees: number;
  buyer: string;
  provider: string;
};

/** Minimal RFC 4180 CSV parser (quoted fields, "" escapes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(f => f.trim())) rows.push(row);
  return rows;
}

const num = (v: string | undefined) => { const n = parseFloat((v || '').replace(/[$,]/g, '')); return Number.isFinite(n) ? n : 0; };
const cents = (n: number) => Math.round(n * 100) / 100;

const REQUIRED = ['Work Order Id', 'Labor', 'Hours Logged'];

/** Parse the Field Nation Work Order Report. Throws if it isn't one. */
export function parseFnReport(text: string): FnRow[] {
  const [header, ...body] = parseCsv(text);
  if (!header) throw new Error('The file is empty.');
  const col = (name: string) => header.findIndex(h => h.trim().toLowerCase() === name.toLowerCase());
  const missing = REQUIRED.filter(n => col(n) < 0);
  if (missing.length) throw new Error(`This doesn't look like a Field Nation Work Order Report (missing ${missing.join(', ')}).`);
  const get = (r: string[], name: string) => { const i = col(name); return i < 0 ? '' : (r[i] ?? '').trim(); };
  return body.map(r => ({
    woId: get(r, 'Work Order Id'),
    typeOfWork: get(r, 'Type of Work'),
    paid: get(r, 'Paid'),
    approved: get(r, 'Approved'),
    totalPay: cents(num(get(r, 'Total Pay'))),
    netPay: cents(num(get(r, 'Net Pay'))),
    labor: cents(num(get(r, 'Labor'))),
    hours: Math.round(num(get(r, 'Hours Logged')) * 100) / 100,
    additionalCharges: cents(num(get(r, 'Additional Charges'))),
    fnFees: cents(num(get(r, 'FN Charge')) + num(get(r, 'GL Charge')) + num(get(r, 'OAI Charge'))),
    buyer: get(r, 'Buyer'),
    provider: get(r, 'Provider'),
  })).filter(r => r.woId);
}

export type FnIssue = 'not_in_app' | 'labor' | 'hours' | 'not_filed' | 'log_not_approved';
export const ISSUE_LABEL: Record<FnIssue, string> = {
  not_in_app: 'Not in the app',
  labor: 'Pay differs',
  hours: 'Hours differ',
  not_filed: 'Not on a weekly log',
  log_not_approved: 'Log not approved yet',
};

export type FnMatch = {
  row: FnRow;
  job: WorkOrder | null;
  techName: string;
  appLabor: number | null;
  laborDiff: number;
  logHours: number | null;
  hoursDiff: number;
  logStatus: string | null;
  issues: FnIssue[];
};

export type AppOnly = { job: WorkOrder; techName: string; logStatus: string | null };

export type FnReconcile = {
  matches: FnMatch[];
  /** Completed Field Nation jobs in the app, in the report's period, that the report doesn't have. */
  appOnly: AppOnly[];
  period: { from: string; to: string } | null;
  totals: { rows: number; fnLabor: number; appLabor: number; fnHours: number; logHours: number; issues: number };
};

const HOURS_TOLERANCE = 0.25;
const toIso = (us: string) => { // M/D/YYYY → YYYY-MM-DD
  const m = us.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
};
const PERIOD_LEAD_DAYS = 21; // work is usually done a while before FN approves it
const DONE = new Set(['checked-out', 'completed']);

export function reconcile(rows: FnRow[], jobs: WorkOrder[], logs: WeeklyLog[], people: Technician[]): FnReconcile {
  const nameOf = new Map(people.map(p => [p.id, p.name]));
  // Jobs by FN number. A job can exist as both a pool work order and an
  // assignment; prefer the assignment (it's the one logs point at).
  const byFn = new Map<string, WorkOrder>();
  for (const j of jobs) {
    const fn = normalizeExternalId(externalWorkOrderId(j));
    if (!fn) continue;
    const prev = byFn.get(fn);
    if (!prev || (!assignedTechOf(prev) && assignedTechOf(j))) byFn.set(fn, j);
  }
  // Lead (non-helper) log lines by job id: hours entered and the log's status.
  const filed = new Map<string, { hours: number | null; status: string }>();
  for (const log of logs) {
    for (const item of log.items || []) {
      if (item.isHelper || !item.workOrderId) continue;
      const status = log.paid ? 'Paid' : log.status;
      const prev = filed.get(item.workOrderId);
      const hours = typeof item.hoursWorked === 'number' ? item.hoursWorked : null;
      if (!prev || status === 'Paid' || status === 'Approved') filed.set(item.workOrderId, { hours: hours ?? prev?.hours ?? null, status });
    }
  }

  const seen = new Set<string>();
  const matches: FnMatch[] = rows.map(row => {
    const key = normalizeExternalId(row.woId);
    seen.add(key);
    const job = byFn.get(key) || null;
    if (!job) {
      return { row, job: null, techName: '', appLabor: null, laborDiff: 0, logHours: null, hoursDiff: 0, logStatus: null, issues: ['not_in_app'] };
    }
    const issues: FnIssue[] = [];
    const appLabor = cents(job.pay || 0);
    const laborDiff = cents(row.labor - appLabor);
    if (Math.abs(laborDiff) >= 0.01) issues.push('labor');
    const f = filed.get(job.id);
    const logHours = f?.hours ?? null;
    const hoursDiff = logHours == null ? 0 : Math.round((row.hours - logHours) * 100) / 100;
    if (logHours != null && Math.abs(hoursDiff) > HOURS_TOLERANCE) issues.push('hours');
    if (!f) issues.push('not_filed');
    else if (f.status !== 'Approved' && f.status !== 'Paid') issues.push('log_not_approved');
    const techId = assignedTechOf(job);
    return { row, job, techName: (techId && nameOf.get(techId)) || '', appLabor, laborDiff, logHours, hoursDiff, logStatus: f?.status ?? null, issues };
  });

  const dates = rows.map(r => toIso(r.approved || r.paid)).filter(Boolean).sort();
  const period = dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
  let appOnly: AppOnly[] = [];
  if (period) {
    const from = new Date(new Date(period.from).getTime() - PERIOD_LEAD_DAYS * 864e5).toISOString().slice(0, 10);
    appOnly = [...byFn.entries()]
      .filter(([fn, j]) => !seen.has(fn) && DONE.has(j.status) && j.scheduleDate >= from && j.scheduleDate <= period.to)
      .map(([, job]) => {
        const techId = assignedTechOf(job);
        return { job, techName: (techId && nameOf.get(techId)) || '', logStatus: filed.get(job.id)?.status ?? null };
      })
      .sort((a, b) => a.job.scheduleDate.localeCompare(b.job.scheduleDate));
  }

  const matched = matches.filter(m => m.job);
  return {
    matches,
    appOnly,
    period,
    totals: {
      rows: rows.length,
      fnLabor: cents(rows.reduce((s, r) => s + r.labor, 0)),
      appLabor: cents(matched.reduce((s, m) => s + (m.appLabor || 0), 0)),
      fnHours: Math.round(rows.reduce((s, r) => s + r.hours, 0) * 10) / 10,
      logHours: Math.round(matched.reduce((s, m) => s + (m.logHours || 0), 0) * 10) / 10,
      issues: matches.filter(m => m.issues.length).length + appOnly.length,
    },
  };
}
