import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { WorkOrder } from './types';
import { isArchivedJob, isAssignedTo } from './jobs';
import { isHelperOn, viewForTech } from './helper-progress';

/** Jobs the signed-in tech helps on, read server-side (see /api/tech/helper-jobs). */
export async function fetchHelperJobs(): Promise<WorkOrder[]> {
  // On a page load Firebase restores the signed-in user asynchronously; asking
  // before that finished returned [] (no token) and the helper's jobs stayed
  // missing until the next retry a minute later.
  await auth.authStateReady();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('helper-jobs: not signed in yet');
  const res = await fetch('/api/tech/helper-jobs', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`helper-jobs ${res.status}`);
  return ((await res.json()).jobs || []) as WorkOrder[];
}

/** fetchHelperJobs with a few quick retries (2s, 4s, 8s, 16s) for one-off callers. */
export async function fetchHelperJobsRetrying(isStopped: () => boolean = () => false): Promise<WorkOrder[]> {
  let delay = 2_000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchHelperJobs();
    } catch (e) {
      if (attempt >= 4 || isStopped()) throw e;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
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
    refetch(); // the server copy is now the only source — get it right away
  });
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = 2_000;
  async function refetch() {
    if (stopped) return;
    try {
      const jobs = await fetchHelperJobs();
      if (stopped) return;
      fetched = jobs;
      retryDelay = 2_000;
      mergeHelped();
    } catch (e) {
      console.warn('[tech-assignments] helper-job fetch failed; retrying', e);
      // Retry soon (2s, 4s, 8s … up to 30s) instead of waiting for the minute tick.
      if (!stopped && !retryTimer) {
        retryTimer = setTimeout(() => { retryTimer = null; refetch(); }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
      }
    }
  }
  refetch();
  const timer = setInterval(refetch, 60_000);
  const onFocus = () => { refetch(); };
  if (typeof window !== 'undefined') window.addEventListener('focus', onFocus);
  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    u1(); u2();
    clearInterval(timer);
    if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
  };
}
