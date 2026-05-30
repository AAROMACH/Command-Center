import { db } from './firebase';
import { doc, runTransaction } from 'firebase/firestore';
import { ID_PREFIXES } from './constants';

type Prefix = typeof ID_PREFIXES[keyof typeof ID_PREFIXES];

/**
 * Generates a human-readable Firestore document ID with a zero-padded counter.
 * Counter is stored in systemConfig/idCounters, one field per prefix.
 * 
 * Examples:
 *   wlog-001, wlog-002 ... wlog-999, wlog-1000
 *   asmt-001, wli-001, inv-001
 */
export async function generateId(prefix: Prefix): Promise<string> {
  const counterRef = doc(db, 'systemConfig', 'idCounters');

  const newCount = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? (snap.data()[prefix] ?? 0) : 0;
    const next = current + 1;
    tx.set(counterRef, { [prefix]: next }, { merge: true });
    return next;
  });

  // Zero-pad to 3 digits, grows naturally past 999 → 1000, 1001, etc.
  const padded = String(newCount).padStart(3, '0');
  return `${prefix}-${padded}`;
}
