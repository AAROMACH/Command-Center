'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/auth-context';
import type { Technician } from '@/lib/types';

/**
 * People the signed-in user may see by name: messaging contacts, message
 * senders, project crews. Admins get the live `users` collection (full
 * records, which the rules allow them). Everyone else gets the public
 * directory from /api/directory — techs and clients can't read `users`, so
 * those screens used to show no contacts and raw ids instead of names.
 *
 * Directory entries carry only id, name, preferredName, avatarUrl, roles,
 * role and clientCompany, typed as Technician for drop-in use.
 */
export function useDirectory(): Technician[] {
    const { user, isAdmin, loading } = useAuth();
    const [people, setPeople] = useState<Technician[]>([]);

    useEffect(() => {
        if (loading || !user?.id) return;
        if (isAdmin) {
            return onSnapshot(collection(db, 'users'),
                snap => setPeople(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician))),
                () => setPeople([]));
        }
        let cancelled = false;
        const load = async () => {
            try {
                const idToken = await auth.currentUser?.getIdToken();
                if (!idToken) return;
                const res = await fetch('/api/directory', { headers: { Authorization: `Bearer ${idToken}` } });
                if (!res.ok) return;
                const { entries } = await res.json();
                if (!cancelled && Array.isArray(entries)) setPeople(entries as Technician[]);
            } catch { /* keep the last list */ }
        };
        load();
        // New contacts (a tech added to the project, a new admin) show up when
        // the user comes back to the tab.
        const onFocus = () => { if (document.visibilityState === 'visible') load(); };
        document.addEventListener('visibilitychange', onFocus);
        return () => { cancelled = true; document.removeEventListener('visibilitychange', onFocus); };
    }, [loading, user?.id, isAdmin]);

    return people;
}
