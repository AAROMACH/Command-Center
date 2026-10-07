import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';
import type { WorkOrder } from './types';
import { isArchivedJob, isAssignedTo } from './jobs';
import { isHelperOn, viewForTech } from './helper-progress';

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
  const u2 = onSnapshot(query(collection(db, 'assignments'), where('additionalTechnicianIds', 'array-contains', techId)), snap => {
    helped = snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder));
    publish();
  }, () => { helped = []; publish(); });
  return () => { u1(); u2(); };
}
