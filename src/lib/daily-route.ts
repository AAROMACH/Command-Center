import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import { calculateDistance, geocodeAddress } from './utils';

/**
 * A tech's driving for one day, logged automatically for their year-end
 * mileage (a tax record — not reimbursement; that's paid on the work order):
 * home → each job / project stop in the order they arrived → home, with road
 * miles per leg.
 *
 * Rebuilt each time they check out, so the last check-out of the day leaves
 * the full day. Each leg has a fixed id (route_<tech>_<date>_<n>) so a rebuild
 * overwrites it; legs that no longer exist are voided (miles 0) — techs can
 * update their trip logs but not delete them.
 */

type Point = { lat: number; lng: number; label: string; assignmentId?: string; projectId?: string; time: string };

const legId = (techId: string, date: string, i: number) => `route_${techId}_${date}_${i}`;

/** Road miles for each leg via OpenStreetMap routing (OSRM); null if it's unreachable. */
async function roadMiles(points: Point[]): Promise<number[] | null> {
  try {
    const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`);
    if (!res.ok) return null;
    const data = await res.json();
    const legs = data?.routes?.[0]?.legs;
    if (!Array.isArray(legs) || legs.length !== points.length - 1) return null;
    return legs.map((l: { distance: number }) => Math.round((l.distance / 1609.344) * 10) / 10);
  } catch {
    return null;
  }
}

async function jobPoint(assignmentId: string, time: string, title: string, fallback?: { lat?: number | null; lng?: number | null }): Promise<Point | null> {
  let job: Record<string, any> | undefined;
  try { job = (await getDoc(doc(db, 'assignments', assignmentId))).data(); } catch { /* not readable */ }
  const label = title || job?.title || job?.description || assignmentId;
  if (job?.lat != null && job?.lng != null) return { lat: job.lat, lng: job.lng, label, assignmentId, time };
  if (job?.location) {
    const g = await geocodeAddress(job.location);
    if (g) return { ...g, label, assignmentId, time };
  }
  if (fallback?.lat != null && fallback?.lng != null) return { lat: fallback.lat, lng: fallback.lng, label, assignmentId, time };
  return null;
}

export type RouteResult = { legs: number; miles: number; estimated: boolean; missingHome: boolean; skipped: number };

/** Build (or rebuild) one day's route for a tech. `date` is yyyy-MM-dd. */
export async function buildDailyRoute(techId: string, techName: string, date: string): Promise<RouteResult> {
  const result: RouteResult = { legs: 0, miles: 0, estimated: false, missingHome: false, skipped: 0 };

  // Stops: jobs they arrived at (their trip / check-in records) and project sessions.
  const trips = (await getDocs(query(collection(db, 'tripLogs'), where('technicianId', '==', techId))))
    .docs.map(d => ({ ...d.data(), id: d.id }) as Record<string, any>);
  const dayTrips = trips.filter(t => t.date === date && (t.source === 'start_trip' || t.source === 'check_in') && t.assignmentId);
  const firstByJob = new Map<string, Record<string, any>>();
  dayTrips.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .forEach(t => { if (!firstByJob.has(t.assignmentId)) firstByJob.set(t.assignmentId, t); });

  const stops: Point[] = [];
  for (const t of firstByJob.values()) {
    const p = await jobPoint(t.assignmentId, String(t.createdAt), t.jobTitle, { lat: t.endLat, lng: t.endLng });
    if (p) stops.push(p); else result.skipped++;
  }

  const sessions = (await getDocs(query(collection(db, 'projectDailyLogs'), where('techId', '==', techId))))
    .docs.map(d => d.data() as Record<string, any>).filter(s => s.date === date);
  for (const s of sessions) {
    const time = `${date}T${s.checkInTime || '00:00'}`;
    let project: Record<string, any> | undefined;
    try { project = (await getDoc(doc(db, 'projects', s.projectId))).data(); } catch { /* not readable */ }
    const label = project?.name || s.projectId;
    const lat = s.checkInLat ?? project?.lat, lng = s.checkInLng ?? project?.lng;
    if (lat != null && lng != null) { stops.push({ lat, lng, label, projectId: s.projectId, time }); continue; }
    const g = project?.location ? await geocodeAddress(project.location) : null;
    if (g) stops.push({ ...g, label, projectId: s.projectId, time }); else result.skipped++;
  }
  stops.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  // Home, from their Directory profile address.
  let home: Point | null = null;
  try {
    const me = (await getDoc(doc(db, 'users', techId))).data();
    const g = me?.address ? await geocodeAddress(me.address) : null;
    if (g) home = { ...g, label: 'Home', time: '' };
  } catch { /* profile not readable */ }
  result.missingHome = !home;

  // home → stops → home, dropping back-to-back stops at the same place.
  const route: Point[] = [];
  for (const p of [...(home ? [home] : []), ...stops, ...(home && stops.length ? [home] : [])]) {
    const last = route[route.length - 1];
    if (!last || calculateDistance(last.lat, last.lng, p.lat, p.lng) > 0.1) route.push(p);
  }

  const existing = trips.filter(t => t.date === date && t.source === 'daily_route');
  let miles: number[] = [];
  if (route.length >= 2) {
    const road = await roadMiles(route);
    result.estimated = !road;
    miles = road || route.slice(1).map((p, i) => Math.round(calculateDistance(route[i].lat, route[i].lng, p.lat, p.lng) * 10) / 10);
    const now = new Date().toISOString();
    for (let i = 0; i < miles.length; i++) {
      const from = route[i], to = route[i + 1];
      const prior = existing.find(t => t.id === legId(techId, date, i));
      await setDoc(doc(db, 'tripLogs', legId(techId, date, i)), {
        id: legId(techId, date, i),
        technicianId: techId,
        technicianName: techName,
        date,
        legIndex: i,
        startLocation: from.label,
        endLocation: to.label,
        startLat: from.lat, startLng: from.lng, endLat: to.lat, endLng: to.lng,
        ...(to.assignmentId ? { assignmentId: to.assignmentId, workOrderId: to.assignmentId } : {}),
        ...(to.projectId ? { projectId: to.projectId } : {}),
        jobTitle: to.label === 'Home' ? 'Drive home' : to.label,
        miles: miles[i],
        calculatedMiles: miles[i],
        routeEstimated: result.estimated,
        purpose: 'Daily route — mileage record',
        reimbursable: false,
        status: 'approved',
        source: 'daily_route',
        voided: false,
        createdAt: prior?.createdAt || now,
        updatedAt: now,
      });
    }
  }
  // Legs from an earlier, longer build of this day.
  for (const t of existing) {
    if ((t.legIndex ?? 0) >= miles.length && !t.voided) {
      await updateDoc(doc(db, 'tripLogs', t.id), { miles: 0, calculatedMiles: 0, voided: true, updatedAt: new Date().toISOString() });
    }
  }
  result.legs = miles.length;
  result.miles = Math.round(miles.reduce((s, m) => s + m, 0) * 10) / 10;
  return result;
}
