'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Technician } from '@/lib/types';

/**
 * Every user record (techs, staff, clients), live from Firestore — for admin
 * pickers and lookups. Replaces the demo list in lib/data.ts, which several
 * admin forms were reading, so they offered fake clients/techs instead of
 * real ones. Admin-only: Firestore rules let non-admins read only their own
 * user doc, so for them this stays empty.
 */
export function useLiveUsers(enabled = true): Technician[] {
    const [users, setUsers] = useState<Technician[]>([]);
    useEffect(() => {
        if (!enabled) return;
        return onSnapshot(
            collection(db, 'users'),
            snap => setUsers(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician))),
            () => setUsers([]),
        );
    }, [enabled]);
    return users;
}
