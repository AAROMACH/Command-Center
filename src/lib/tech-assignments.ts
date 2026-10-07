import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { WorkOrder } from './types';
import { isArchivedJob, isAssignedTo } from './jobs';
import { isHelperOn, viewForTech } from './helper-progress';

/** Jobs the signed-in tech helps on, read server-side (see /api/tech/helper-jobs). */
export async function fetchHelperJobs(): Promise<WorkOrder[]> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return [];
  const res = await fetch('/api/tech/helper-jobs', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`helper-jobs ${res.status}`);
  return ((await res.json()).jobs || []) as WorkOrder[];
}

/**
 * A tech's live, non-archived assignments: jobs they lead plus jobs they're a
 * helper on. Helper jobs come back as that helper's view (their own status
 * and trip — see lib/helper-progress), so every list, card and action button
 * works for them unchanged. Returns the unsubscribe.
 */
export function subscribeTechAssignments(
  techId: string,
  onJobs: (jobs: WorkOrder[]) => void,
  onError?: () => void,
): () => void {
  let led: WorkOrder[] = [];
  let helped: WorkOrder[] = [];
  let ledLoaded = false;
  const publish = () => {
    if (!ledLoaded) return; // don't flash an empty list before the main query lands
    const merged = new Map<string, WorkOrder>();
    [...led, ...helped].forEach(j => merged.set(j.id, j));
    onJobs([...merged.values()]
      .filter(j => !isArchivedJob(j) && (isAssignedTo(j, techId) || isHelperOn(j, techId)))
      .map(j => viewForTech(j, techId)));
  };
  const u1 = onSnapshot(query(collection(db, 'assignments'), where('techId', '==', techId)), snap => {
    led = snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder));
    ledLoaded = true;
    publish();
  }, () => { ledLoaded = true; publish(); onError?.(); });
  // Helper jobs: a live query when Firestore allows it, plus the server
  // endpoint (always works) on load, every minute, and when the app regains
  // focus — so a helper's jobs never silently go missing.
  let live: WorkOrder[] = [];
  let fetched: WorkOrder[] = [];
  const mergeHelped = () => {
    const m = new Map<string, WorkOrder>();
    [...fetched, ...live].forEach(j => m.set(j.id, j)); // live wins (fresher)
    helped = [...m.values()];
    publish();
  };
  const u2 = onSnapshot(query(collection(db, 'assignments'), where('additionalTechnicianIds', 'array-contains', techId)), snap => {
    live = snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder));
    mergeHelped();
  }, (err) => {
    console.warn('[tech-assignments] live helper-job query refused; using server fetch', err?.code || err);
    live = [];
    mergeHelped();
  });
  let stopped = false;
  const refetch = async () => {
    try {
      const jobs = await fetchHelperJobs();
      if (!stopped) { fetched = jobs; mergeHelped(); }
    } catch (e) {
      console.warn('[tech-assignments] helper-job fetch failed', e);
    }
  };
  refetch();
  const timer = setInterval(refetch, 60_000);
  const onFocus = () => { refetch(); };
  if (typeof window !== 'undefined') window.addEventListener('focus', onFocus);
  return () => {
    stopped = true;
    u1(); u2();
    clearInterval(timer);
    if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
  };
}
