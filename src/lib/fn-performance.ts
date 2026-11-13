import { startOfWeek, format } from 'date-fns';
import type { Technician, WorkOrder } from './types';
import { externalWorkOrderId, normalizeExternalId } from './work-order-identity';
import { assignedTechOf } from './weekly-log-core';
import { techShareOfFieldNationLabor } from './payroll';
import type { FnRow } from './fn-reconcile';

// Pay and hours from saved Field Nation reports (Insights → Performance).
//
// Pay = the tech's take-home share of each job: FN labor minus the platform
// fee, then the 50% split — the same rule payroll uses (lib/payroll). Extra
// charges (materials, mileage) are reimbursements, not wage, so left out.
// Date = the job's scheduled date in the app when it's matched, otherwise the
// date Field Nation approved it (the report has no work date).
// Tech = the tech assigned in the app when matched, otherwise the FN provider.
// "Per day / week / month / year" average over the periods actually worked.

export type PerfLine = { woId: string; tech: string; date: string; hours: number; pay: number; matched: boolean };

const toIso = (us: string) => {
  const m = us.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
};

export function perfLines(rows: FnRow[], jobs: WorkOrder[], people: Technician[]): PerfLine[] {
  const nameOf = new Map(people.map(p => [p.id, p.name]));
  const byFn = new Map<string, WorkOrder>();
  for (const j of jobs) {
    const fn = normalizeExternalId(externalWorkOrderId(j));
    if (fn && (!byFn.has(fn) || assignedTechOf(j))) byFn.set(fn, j);
  }
  return rows.map(r => {
    const job = byFn.get(normalizeExternalId(r.woId));
    const techId = job ? assignedTechOf(job) : undefined;
    return {
      woId: r.woId,
      tech: (techId && nameOf.get(techId)) || r.provider || 'Unknown',
      date: job?.scheduleDate || toIso(r.approved || r.paid),
      hours: r.hours || 0,
      pay: techShareOfFieldNationLabor(r.labor || 0).techPay,
      matched: !!job,
    };
  }).filter(l => l.date);
}

export type PerfStats = {
  tech: string;
  jobs: number;
  hours: number;
  pay: number;
  days: number; weeks: number; months: number; years: number;
  payPerHour: number;
  payPerDay: number; payPerWeek: number; payPerMonth: number; payPerYear: number;
  hoursPerDay: number; hoursPerWeek: number; hoursPerMonth: number; hoursPerYear: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const div = (a: number, b: number) => (b ? a / b : 0);

export function perfStats(tech: string, lines: PerfLine[]): PerfStats {
  const hours = lines.reduce((s, l) => s + l.hours, 0);
  const pay = lines.reduce((s, l) => s + l.pay, 0);
  const days = new Set(lines.map(l => l.date)).size;
  const weeks = new Set(lines.map(l => format(startOfWeek(new Date(l.date + 'T12:00:00')), 'yyyy-MM-dd'))).size;
  const months = new Set(lines.map(l => l.date.slice(0, 7))).size;
  const years = new Set(lines.map(l => l.date.slice(0, 4))).size;
  return {
    tech, jobs: lines.length, hours: r2(hours), pay: r2(pay), days, weeks, months, years,
    payPerHour: r2(div(pay, hours)),
    payPerDay: r2(div(pay, days)), payPerWeek: r2(div(pay, weeks)), payPerMonth: r2(div(pay, months)), payPerYear: r2(div(pay, years)),
    hoursPerDay: r2(div(hours, days)), hoursPerWeek: r2(div(hours, weeks)), hoursPerMonth: r2(div(hours, months)), hoursPerYear: r2(div(hours, years)),
  };
}

/** Company row + one row per tech, for lines already filtered to a period. */
export function perfSummary(lines: PerfLine[]): { company: PerfStats; techs: PerfStats[] } {
  const byTech = new Map<string, PerfLine[]>();
  for (const l of lines) byTech.set(l.tech, [...(byTech.get(l.tech) || []), l]);
  return {
    company: perfStats('All techs', lines),
    techs: [...byTech].map(([t, ls]) => perfStats(t, ls)).sort((a, b) => b.pay - a.pay),
  };
}
