'use client';

import {
  collection, onSnapshot,
  type DocumentData, type FirestoreError, type QuerySnapshot,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';

/**
 * One live listener per whole collection, shared by every screen that needs
 * it — a drop-in for `onSnapshot(collection(db, name), next, error)`.
 *
 * Before this, every page (and the sidebar, alert band and dialogs on it)
 * opened its own listener on the same big collections — `users` alone on 18
 * screens — and moving between pages tore them down and downloaded the
 * collection again. Now:
 *  - all subscribers to a collection share one Firestore listener;
 *  - a new subscriber gets the latest snapshot immediately;
 *  - the listener stays open for LINGER_MS after the last subscriber leaves,
 *    so page-to-page navigation doesn't re-download anything.
 *
 * Everything is torn down when the signed-in user changes, so one account's
 * data is never handed to the next account on a shared device.
 */

type Next = (snap: QuerySnapshot<DocumentData>) => void;
type ErrorFn = (err: FirestoreError) => void;
type Subscriber = { next: Next; error?: ErrorFn };
type Entry = {
  subs: Set<Subscriber>;
  last?: QuerySnapshot<DocumentData>;
  stop: () => void;
  lingerTimer?: ReturnType<typeof setTimeout>;
};

const LINGER_MS = 60_000;
const entries = new Map<string, Entry>();

function closeAll() {
  for (const e of entries.values()) {
    clearTimeout(e.lingerTimer);
    e.stop();
  }
  entries.clear();
}

if (typeof window !== 'undefined') {
  let currentUid: string | null | undefined;
  onAuthStateChanged(auth, user => {
    const uid = user?.uid ?? null;
    if (currentUid !== undefined && uid !== currentUid) closeAll();
    currentUid = uid;
  });
}

export function onSharedSnapshot(name: string, next: Next, error?: ErrorFn): () => void {
  let entry = entries.get(name);
  if (!entry) {
    const created: Entry = { subs: new Set(), stop: () => {} };
    created.stop = onSnapshot(
      collection(db, name),
      snap => {
        created.last = snap;
        created.subs.forEach(s => s.next(snap));
      },
      err => {
        // Firestore has closed this listener; the next subscriber starts fresh.
        if (entries.get(name) === created) entries.delete(name);
        created.subs.forEach(s => s.error?.(err));
      },
    );
    entries.set(name, created);
    entry = created;
  }

  const e = entry;
  clearTimeout(e.lingerTimer);
  e.lingerTimer = undefined;
  const sub: Subscriber = { next, error };
  e.subs.add(sub);
  if (e.last) {
    const snap = e.last;
    // Async, like a real first snapshot — callers set state in `next`.
    queueMicrotask(() => { if (e.subs.has(sub)) next(snap); });
  }

  return () => {
    e.subs.delete(sub);
    if (e.subs.size === 0 && entries.get(name) === e) {
      e.lingerTimer = setTimeout(() => {
        if (e.subs.size === 0 && entries.get(name) === e) {
          e.stop();
          entries.delete(name);
        }
      }, LINGER_MS);
    }
  };
}
