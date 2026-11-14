'use client';

import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import type { Project, WorkOrder } from '@/lib/types';

type ClientUser = { id?: string; clientCompany?: string } | null | undefined;
type ClientData = { jobs: WorkOrder[]; projects: Project[] };

/**
 * A client's jobs and projects, from /api/client/data — the server removes
 * pay, cost and payroll fields, which the database can't hide per field, so
 * clients no longer read job / project documents directly.
 *
 * One shared copy for every client screen: fetched on first use, then every
 * minute and whenever the tab comes back into view.
 */
let data: ClientData = { jobs: [], projects: [] };
let forUid: string | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

async function refresh() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/client/data', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const body = await res.json();
      data = { jobs: body.jobs || [], projects: body.projects || [] };
      listeners.forEach(l => l());
    } catch { /* offline: keep what we have */ } finally { inflight = null; }
  })();
  return inflight;
}

const onFocus = () => { if (document.visibilityState === 'visible') refresh(); };

function subscribe(uid: string, fn: () => void): () => void {
  if (forUid !== uid) { forUid = uid; data = { jobs: [], projects: [] }; }
  listeners.add(fn);
  if (listeners.size === 1) {
    refresh();
    timer = setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', onFocus);
  } else fn();
  return () => {
    listeners.delete(fn);
    if (!listeners.size) {
      if (timer) clearInterval(timer);
      timer = null;
      document.removeEventListener('visibilitychange', onFocus);
    }
  };
}

/** Refetch now (e.g. right after the client creates something). */
export const refreshClientData = () => refresh();

export function useClientData(user: ClientUser): ClientData {
  const uid = user?.id;
  const [snap, setSnap] = useState<ClientData>(() => (uid && forUid === uid ? data : { jobs: [], projects: [] }));
  useEffect(() => {
    if (!uid) { setSnap({ jobs: [], projects: [] }); return; }
    return subscribe(uid, () => setSnap(data));
  }, [uid]);
  return snap;
}

/** A client's projects: linked by clientId, or by company name. */
export function useClientProjects(user: ClientUser): Project[] {
  return useClientData(user).projects;
}

/**
 * A client's jobs across BOTH collections — the open pool (workOrders) and
 * dispatched work (assignments).
 */
export function useClientJobs(user: ClientUser): WorkOrder[] {
  return useClientData(user).jobs;
}
