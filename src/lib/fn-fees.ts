'use client';

import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { FIELD_NATION_FEE_RATE } from './payroll';
import type { FnRow } from './fn-reconcile';
import type { WorkOrder } from './types';

// Field Nation's fee isn't one flat rate: every job pays 13.9% FN + 1.95% GL
// (15.85%), and some buyers also carry a 0.5% "OAI" charge (16.35%). Which
// buyers do is learned from uploaded Work Order Reports and kept in
// adminConfig/fieldNation, so new imports get the right rate per job.

export const OAI_RATE = 0.005;
const CONFIG = () => doc(db, 'adminConfig', 'fieldNation');
const norm = (buyer: string) => buyer.trim().toLowerCase();

export type FnFeeConfig = { oaiBuyers: string[]; updatedAt?: string };

export async function loadFnFeeConfig(): Promise<FnFeeConfig> {
  try {
    const d = (await getDoc(CONFIG())).data() as Partial<FnFeeConfig> | undefined;
    return { oaiBuyers: Array.isArray(d?.oaiBuyers) ? d!.oaiBuyers : [] };
  } catch { return { oaiBuyers: [] }; }
}

/** The fee rate a new job from this buyer should carry. */
export function feeRateForBuyer(buyer: string | undefined, cfg: FnFeeConfig): number {
  return buyer && cfg.oaiBuyers.includes(norm(buyer)) ? FIELD_NATION_FEE_RATE + OAI_RATE : FIELD_NATION_FEE_RATE;
}

/** The fee Field Nation actually charged on one report row, e.g. 0.1635. */
export function rowFeeRate(r: FnRow): number | null {
  if (!(r.totalPay > 0) || !(r.fnFees > 0)) return null;
  return Math.round((r.fnFees / r.totalPay) * 10000) / 10000;
}

const toIso = (us: string) => {
  const m = us.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
};

/**
 * Learn from a report: each buyer's MOST RECENT job decides whether they carry
 * the OAI charge now (buyers can start or stop). Buyers not in the report keep
 * what we knew.
 */
export async function learnFromReport(rows: FnRow[]): Promise<FnFeeConfig> {
  const latest = new Map<string, { date: string; oai: boolean }>();
  for (const r of rows) {
    if (!r.buyer) continue;
    const date = toIso(r.approved || r.paid);
    const rate = rowFeeRate(r);
    if (rate == null) continue;
    const prev = latest.get(norm(r.buyer));
    if (!prev || date > prev.date) latest.set(norm(r.buyer), { date, oai: rate > FIELD_NATION_FEE_RATE + OAI_RATE / 2 });
  }
  const cfg = await loadFnFeeConfig();
  const set = new Set(cfg.oaiBuyers);
  for (const [b, v] of latest) (v.oai ? set.add(b) : set.delete(b));
  const next = { oaiBuyers: [...set].sort(), updatedAt: new Date().toISOString() };
  await setDoc(CONFIG(), next);
  return next;
}

/**
 * Put Field Nation's actual fee on matched jobs that aren't on an approved or
 * paid weekly log yet. Approved / paid weeks are never changed.
 */
export async function stampActualFees(
  matches: { row: FnRow; job: WorkOrder | null; logStatus: string | null }[],
  collectionOf: (jobId: string) => 'assignments' | 'workOrders',
): Promise<number> {
  const writes = matches.flatMap(m => {
    const rate = rowFeeRate(m.row);
    if (!m.job || rate == null || m.logStatus === 'Approved' || m.logStatus === 'Paid') return [];
    if (Math.abs((m.job.fieldNationFeeRate ?? FIELD_NATION_FEE_RATE) - rate) < 0.00005) return [];
    return [{ id: m.job.id, rate }];
  });
  for (let i = 0; i < writes.length; i += 450) {
    const batch = writeBatch(db);
    for (const w of writes.slice(i, i + 450)) batch.update(doc(db, collectionOf(w.id), w.id), { fieldNationFeeRate: w.rate });
    await batch.commit();
  }
  return writes.length;
}
