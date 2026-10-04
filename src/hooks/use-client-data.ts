'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, type Query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Project, WorkOrder } from '@/lib/types';

type ClientUser = { id?: string; clientCompany?: string } | null | undefined;

/**
 * Subscribe to several queries and publish the de-duplicated union. Each
 * query must be one the rules can prove safe for a client (filtered on their
 * own clientId or company name) — an unprovable query is rejected whole.
 */
function useUnion<T extends { id: string }>(queries: Query[] | null, deps: unknown[]): T[] {
    const [rows, setRows] = useState<T[]>([]);
    useEffect(() => {
        if (!queries || queries.length === 0) { setRows([]); return; }
        const parts: T[][] = queries.map(() => []);
        const publish = () => {
            const m = new Map<string, T>();
            parts.flat().forEach(r => m.set(r.id, r));
            setRows([...m.values()]);
        };
        const unsubs = queries.map((q, i) => onSnapshot(
            q,
            snap => { parts[i] = snap.docs.map(d => ({ ...d.data(), id: d.id } as T)); publish(); },
            () => { parts[i] = []; publish(); },
        ));
        return () => unsubs.forEach(u => u());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
    return rows;
}

/** A client's projects: linked by clientId, or by company name in `client`. */
export function useClientProjects(user: ClientUser): Project[] {
    const uid = user?.id;
    const company = user?.clientCompany;
    const queries = uid ? [
        query(collection(db, 'projects'), where('clientId', '==', uid)),
        ...(company ? [query(collection(db, 'projects'), where('client', '==', company))] : []),
    ] : null;
    return useUnion<Project>(queries, [uid, company]);
}

/**
 * A client's jobs across BOTH collections — the open pool (workOrders) and
 * dispatched work (assignments). Client pages used to read only workOrders,
 * so a job vanished from the client's view the moment it was dispatched.
 */
export function useClientJobs(user: ClientUser): WorkOrder[] {
    const uid = user?.id;
    const company = user?.clientCompany;
    const queries = uid ? (['assignments', 'workOrders'] as const).flatMap(c => [
        query(collection(db, c), where('clientId', '==', uid)),
        ...(company ? [query(collection(db, c), where('clientName', '==', company))] : []),
    ]) : null;
    return useUnion<WorkOrder>(queries, [uid, company]);
}
