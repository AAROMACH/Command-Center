'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ReliabilityEvent } from '@/lib/types';

/**
 * Reliability / penalty events, live from Firestore (`penaltyEvents`).
 * Several screens read the demo list in lib/data instead — which is empty —
 * so every tech always showed 0 penalty points.
 *
 * Pass a techId for one tech's events (what techs may read about
 * themselves), or null/undefined for all (admins). Newest first.
 */
export function usePenaltyEvents(techId?: string | null, enabled = true): ReliabilityEvent[] {
    const [events, setEvents] = useState<ReliabilityEvent[]>([]);
    useEffect(() => {
        if (!enabled) return;
        const ref = techId
            ? query(collection(db, 'penaltyEvents'), where('techId', '==', techId))
            : collection(db, 'penaltyEvents');
        return onSnapshot(
            ref,
            snap => setEvents(
                snap.docs
                    .map(d => ({ ...d.data(), id: d.id } as ReliabilityEvent))
                    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
            ),
            () => setEvents([]),
        );
    }, [techId, enabled]);
    return events;
}

/** Total penalty points (absolute score deductions) for one tech. */
export function penaltyPoints(events: ReliabilityEvent[], techId: string): number {
    return events.filter(e => e.techId === techId && (Number(e.scoreChange) || 0) < 0)
        .reduce((s, e) => s + Math.abs(Number(e.scoreChange) || 0), 0);
}
