'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * "Something new just landed here" tracking for admin lists (unassigned jobs,
 * review queue, service requests, assignments).
 *
 * Each list has a key. Per admin, per browser, we remember the ids they've
 * already been shown (localStorage `cc:seen:<uid>:<key>`). Ids not in that set
 * are "new" → the UI shows a bouncing "!" until the admin opens that list.
 *
 *  - First time a list is ever loaded, everything currently in it becomes the
 *    baseline — no indicator for the backlog, only for later arrivals.
 *  - `viewing` = the admin is looking at that list right now; new ids are
 *    marked seen after a short moment so the indicator clears.
 *  - The seen set only grows (capped), so the sidebar and the page can track
 *    the same key from slightly different id lists without fighting.
 *  - Instances of the same key stay in sync through a window event + the
 *    storage event (other tabs).
 */

const MAX_SEEN = 3000;
const SEEN_EVENT = 'cc-seen-updated';

function storageKey(key: string): string | null {
    try {
        const uid = sessionStorage.getItem('currentUserId');
        return uid ? `cc:seen:${uid}:${key}` : null;
    } catch {
        return null;
    }
}

function readSeen(sk: string): string[] | null {
    try {
        const raw = localStorage.getItem(sk);
        return raw ? (JSON.parse(raw) as string[]) : null;
    } catch {
        return null;
    }
}

function writeSeen(sk: string, ids: string[]) {
    try {
        localStorage.setItem(sk, JSON.stringify(ids.slice(-MAX_SEEN)));
        window.dispatchEvent(new CustomEvent(SEEN_EVENT, { detail: sk }));
    } catch { /* storage blocked — indicator just won't persist */ }
}

export function useNewArrivals(
    key: string,
    ids: string[],
    opts: { ready: boolean; viewing: boolean },
): { newCount: number; newIds: Set<string> } {
    const [seen, setSeen] = useState<string[] | null>(null);
    const [sk, setSk] = useState<string | null>(null);

    useEffect(() => {
        const k = storageKey(key);
        setSk(k);
        if (!k) return;
        setSeen(readSeen(k));
        const reload = (e: Event) => {
            const changed = (e as CustomEvent).detail ?? (e as StorageEvent).key;
            if (changed === k) setSeen(readSeen(k));
        };
        window.addEventListener(SEEN_EVENT, reload);
        window.addEventListener('storage', reload);
        return () => {
            window.removeEventListener(SEEN_EVENT, reload);
            window.removeEventListener('storage', reload);
        };
    }, [key]);

    // Baseline on first ever load.
    useEffect(() => {
        if (!sk || !opts.ready || seen !== null) return;
        writeSeen(sk, ids);
        setSeen(ids);
    }, [sk, opts.ready, seen, ids]);

    const newIds = useMemo(() => {
        if (!opts.ready || seen === null) return new Set<string>();
        const s = new Set(seen);
        return new Set(ids.filter(id => !s.has(id)));
    }, [ids, seen, opts.ready]);

    // Looking at the list → mark what's there as seen (after a beat, so the
    // admin catches the indicator on arrival).
    useEffect(() => {
        if (!sk || !opts.viewing || newIds.size === 0) return;
        const t = setTimeout(() => {
            const current = readSeen(sk) || [];
            const merged = [...current.filter(id => !newIds.has(id)), ...newIds];
            writeSeen(sk, merged);
            setSeen(merged);
        }, 2500);
        return () => clearTimeout(t);
    }, [sk, opts.viewing, newIds]);

    return { newCount: newIds.size, newIds };
}

// ── Shared list definitions ─────────────────────────────────────────────────
// The sidebar and the Dispatch page track the same keys, so they must build
// the id lists the same way (the sidebar queries just these docs).

type Doc = { id: string; status?: string; archived?: boolean; assignedAt?: string };

export const ARRIVAL_KEYS = {
    unassigned: 'dispatch:unassigned',
    review: 'dispatch:review',
    requests: 'dispatch:requests',
    assignments: 'assignments:recent',
} as const;

/** How far back "new assignment" tracking looks (by assignedAt). */
export const RECENT_ASSIGNMENT_DAYS = 14;
export const recentAssignmentCutoff = () => new Date(Date.now() - RECENT_ASSIGNMENT_DAYS * 864e5).toISOString();

export const unassignedArrivalIds = (workOrders: Doc[]) =>
    workOrders.filter(w => w.status === 'unassigned' && !w.archived).map(w => w.id);
export const reviewArrivalIds = (assignments: Doc[]) =>
    assignments.filter(a => a.status === 'cancelled' && !a.archived).map(a => a.id);
export const recentAssignmentArrivalIds = (assignments: Doc[]) => {
    const cutoff = recentAssignmentCutoff();
    return assignments.filter(a => !!a.assignedAt && a.assignedAt >= cutoff && !a.archived && a.status !== 'archived').map(a => a.id);
};
