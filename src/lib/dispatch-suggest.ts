import type { Technician, WorkOrder } from './types';
import { calculateDistance, scheduleTimeToMinutes } from './utils';
import { assignedTechOf } from './weekly-log-core';

// Dispatch "best fit" suggestions for a route — a plain scoring formula, no AI.
// Every tech can do every job today, so skills aren't scored. What matters, in
// order: the route itself is sane (one day, jobs close together, times that
// leave room to drive), the tech is free and their day fits around it, then
// home distance (light weight), then reliability.

type Point = { lat: number; lng: number };
const hasPoint = (j: Partial<WorkOrder>): j is WorkOrder & Point => typeof j.lat === 'number' && typeof j.lng === 'number';
const UNKNOWN_TIME = Number.MAX_SAFE_INTEGER;
const SPREAD_WARN_MI = 25;
const AVG_MPH = 30;
const MIN_ON_SITE_MIN = 60;
const CONFLICT_WINDOW_MIN = 90;

export function routeCentroid(jobs: WorkOrder[]): Point | null {
  const pts = jobs.filter(hasPoint);
  if (!pts.length) return null;
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
}

export type RouteHealth = { spreadMi: number | null; dates: string[]; warnings: string[] };

/** Is the route itself workable: one day, tight area, enough time between stops. */
export function routeHealth(jobs: WorkOrder[]): RouteHealth {
  const warnings: string[] = [];
  const dates = [...new Set(jobs.map(j => j.scheduleDate).filter(Boolean))].sort();
  if (dates.length > 1) warnings.push(`Jobs are on ${dates.length} different days`);
  const pts = jobs.filter(hasPoint);
  let spreadMi: number | null = null;
  if (pts.length > 1) {
    spreadMi = 0;
    for (let i = 0; i < pts.length; i++) for (let k = i + 1; k < pts.length; k++) {
      spreadMi = Math.max(spreadMi, calculateDistance(pts[i].lat, pts[i].lng, pts[k].lat, pts[k].lng));
    }
    if (spreadMi > SPREAD_WARN_MI) warnings.push(`Jobs are up to ${Math.round(spreadMi)} mi apart`);
  }
  const missing = jobs.length - pts.length;
  if (missing > 0) warnings.push(`${missing} job${missing > 1 ? 's have' : ' has'} no map location`);
  for (const date of dates) {
    const day = jobs.filter(j => j.scheduleDate === date)
      .map(j => ({ j, t: scheduleTimeToMinutes(j.scheduleTime) }))
      .filter(x => x.t !== UNKNOWN_TIME)
      .sort((a, b) => a.t - b.t);
    for (let i = 1; i < day.length; i++) {
      const a = day[i - 1].j, b = day[i].j;
      const gap = day[i].t - day[i - 1].t;
      const drive = hasPoint(a) && hasPoint(b) ? (calculateDistance(a.lat, a.lng, b.lat, b.lng) / AVG_MPH) * 60 : 0;
      if (gap < MIN_ON_SITE_MIN + drive) {
        warnings.push(`Tight: ${a.scheduleTime} → ${b.scheduleTime}${drive ? ` with ~${Math.round(drive)} min drive` : ''}`);
      }
    }
  }
  return { spreadMi, dates, warnings };
}

export type TechSuggestion = { tech: Technician; score: number; reasons: string[] };

const isActiveJob = (j: WorkOrder) => !['cancelled', 'archived'].includes(j.status);
const isOnJob = (j: WorkOrder, techId: string) => assignedTechOf(j) === techId || (j.additionalTechnicianIds ?? []).includes(techId);

/**
 * Rank techs for a route. `homes` holds geocoded home addresses when known
 * (missing = not scored on home distance, not penalised).
 */
export function suggestTechs(
  routeJobs: WorkOrder[],
  techs: Technician[],
  assignments: WorkOrder[],
  homes: Map<string, Point | null>,
  limit = 3,
): TechSuggestion[] {
  if (!routeJobs.length) return [];
  const dates = new Set(routeJobs.map(j => j.scheduleDate).filter(Boolean));
  const routeTimes = routeJobs.map(j => scheduleTimeToMinutes(j.scheduleTime)).filter(t => t !== UNKNOWN_TIME);
  const center = routeCentroid(routeJobs);
  const routeIds = new Set(routeJobs.map(j => j.id));

  return techs.map(tech => {
    const reasons: string[] = [];
    let score = 0;
    const dayJobs = assignments.filter(j => isActiveJob(j) && !routeIds.has(j.id) && dates.has(j.scheduleDate) && isOnJob(j, tech.id));

    // 1. Free, or how their day fits.
    if (!dayJobs.length) { score += 40; reasons.push('Free that day'); }
    else {
      score -= 10 * dayJobs.length;
      const conflicts = dayJobs.filter(j => {
        const t = scheduleTimeToMinutes(j.scheduleTime);
        return t !== UNKNOWN_TIME && routeTimes.some(rt => Math.abs(rt - t) < CONFLICT_WINDOW_MIN);
      });
      if (conflicts.length) { score -= 60 * conflicts.length; reasons.push(`Time conflict (${conflicts.length})`); }
      else reasons.push(`${dayJobs.length} other job${dayJobs.length > 1 ? 's' : ''} that day`);
      // Already working nearby that day is a plus: the route fits their day.
      const near = center ? dayJobs.filter(hasPoint).map(j => calculateDistance(j.lat, j.lng, center.lat, center.lng)) : [];
      if (near.length) {
        const d = Math.min(...near);
        score += d <= 10 ? 25 : Math.max(0, 25 * (1 - (d - 10) / 30));
        reasons.push(`Working ${Math.round(d)} mi away that day`);
      }
    }

    // 2. Home distance — counts, but less.
    const home = homes.get(tech.id);
    if (home && center) {
      const d = calculateDistance(home.lat, home.lng, center.lat, center.lng);
      score += 15 * Math.max(0, 1 - d / 40);
      reasons.push(`${Math.round(d)} mi from home`);
    }

    // 3. Reliability.
    if (typeof tech.reliabilityScore === 'number') {
      score += (tech.reliabilityScore / 100) * 15;
      reasons.push(`Reliability ${Math.round(tech.reliabilityScore)}`);
    }

    return { tech, score, reasons };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
