'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Invoice } from '@/lib/types';

/**
 * A client's invoices, live. Matched by clientId or by company name — the
 * two ways the invoice rules let a client read them — and drafts are hidden
 * because they were never sent.
 */
export function useClientInvoices(user: { id?: string; clientCompany?: string } | null | undefined): Invoice[] {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const userId = user?.id;
    const company = user?.clientCompany;
    useEffect(() => {
        if (!userId) { setInvoices([]); return; }
        let byId: Invoice[] = [];
        let byCompany: Invoice[] = [];
        const publish = () => {
            const m = new Map<string, Invoice>();
            [...byId, ...byCompany].forEach(i => m.set(i.id, i));
            setInvoices([...m.values()].filter(i => i.status !== 'draft'));
        };
        const unsubs = [
            onSnapshot(query(collection(db, 'invoices'), where('clientId', '==', userId)),
                snap => { byId = snap.docs.map(d => ({ ...d.data(), id: d.id } as Invoice)); publish(); }, () => {}),
        ];
        if (company) {
            unsubs.push(onSnapshot(query(collection(db, 'invoices'), where('clientName', '==', company)),
                snap => { byCompany = snap.docs.map(d => ({ ...d.data(), id: d.id } as Invoice)); publish(); }, () => {}));
        }
        return () => unsubs.forEach(u => u());
    }, [userId, company]);
    return invoices;
}
