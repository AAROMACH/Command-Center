'use client';

import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { OPERATIONS_MANUAL, type ManualSection } from '@/content/operations-manual';

export type HandbookSection = ManualSection & { order: number; updatedAt?: string; updatedBy?: string };
export type HandbookSync = { ok: boolean; at: string; by: string; error: string | null } | null;

const bundled = (filter?: ManualSection['audience'][]) =>
  OPERATIONS_MANUAL.map((s, i) => ({ ...s, order: i })).filter(s => !filter || filter.includes(s.audience));

/**
 * The Operations Manual, live from Firestore (handbook/*). Until the first
 * edit it's empty there, so the bundled copy is shown. `audiences` limits it
 * (techs: ['tech'] or ['tech','pm']).
 */
export function useHandbook(audiences?: ManualSection['audience'][]): HandbookSection[] {
  const key = audiences?.join(',') || 'all';
  const [list, setList] = useState<HandbookSection[]>(() => bundled(audiences));
  useEffect(() => {
    const col = collection(db, 'handbook');
    const q = audiences ? query(col, where('audience', 'in', audiences)) : col;
    return onSnapshot(q, s => {
      setList(s.empty ? bundled(audiences) : s.docs.map(d => d.data() as HandbookSection).sort((a, b) => a.order - b.order));
    }, () => setList(bundled(audiences)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return list;
}

export function useHandbookSync(enabled: boolean): HandbookSync {
  const [sync, setSync] = useState<HandbookSync>(null);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(doc(db, 'handbookMeta', 'sync'), s => setSync((s.data() as HandbookSync) || null), () => setSync(null));
  }, [enabled]);
  return sync;
}
