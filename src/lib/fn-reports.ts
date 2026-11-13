'use client';

import { doc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { normalizeExternalId } from './work-order-identity';
import type { FnRow } from './fn-reconcile';

/** Saved Field Nation report rows (Insights → Performance). One doc per FN
 *  work order, so re-uploading overlapping weeks updates instead of doubling. */
export const FN_ROWS = 'fnReportRows';
export type SavedFnRow = FnRow & { id: string; uploadedAt: string; uploadedBy: string; fileName: string };

export async function saveFnRows(rows: FnRow[], by: string, fileName: string): Promise<number> {
  const now = new Date().toISOString();
  const valid = rows.filter(r => normalizeExternalId(r.woId));
  for (let i = 0; i < valid.length; i += 450) {
    const batch = writeBatch(db);
    for (const r of valid.slice(i, i + 450)) {
      batch.set(doc(db, FN_ROWS, normalizeExternalId(r.woId)), { ...r, uploadedAt: now, uploadedBy: by, fileName });
    }
    await batch.commit();
  }
  return valid.length;
}
