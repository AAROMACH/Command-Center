'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PayAdjustment, WeeklyLogItem, WorkOrder } from '@/lib/types';
import { FIELD_NATION_FEE_RATE, effectiveJobPay, techShareOfFieldNationLabor } from '@/lib/payroll';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type PayCorrection = {
  isFieldNation: boolean;
  /** Field Nation: the full labor pay. Manual jobs: the pay itself. */
  laborBefore: number;
  laborAfter: number;
  /** What the tech gets out of it. */
  techBefore: number;
  techAfter: number;
  /** techAfter − techBefore: the adjustment amount. */
  diff: number;
};

const usd = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * "Pay is wrong" calculator for one job. Shows the pay on file — for Field
 * Nation jobs the full labor pay payroll entered and the tech's share of it
 * (15.85% fee, then half) — takes the correct total, and reports the
 * difference for the tech, which is what the adjustment pays. Starts from the
 * latest earlier correction for the job, if any, so corrections never stack.
 */
export function PayCorrectionCalculator({ job, item, onChange, autoFocus, baseline, initial, fieldNation }: {
  job?: WorkOrder;
  /** The job's line on the log, when known (falls back to its stored pay). */
  item?: WeeklyLogItem;
  onChange: (c: PayCorrection | null) => void;
  autoFocus?: boolean;
  /** Editing an existing correction: its own "before" (skips the lookup). */
  baseline?: { labor: number; tech: number } | null;
  /** Prefill for the correct total (an existing correction's "after"). */
  initial?: number | null;
  /** Force Field Nation math on/off (when the job record isn't loaded). */
  fieldNation?: boolean;
}) {
  const jobId = job?.id || item?.workOrderId;
  const isFieldNation = fieldNation ?? (!item?.isHelper && (job ? job.source === 'Imported' : item?.jobSource === 'Imported'));
  const [prior, setPrior] = useState<PayAdjustment | null | undefined>(undefined);
  const [entered, setEntered] = useState(initial != null ? String(initial) : '');

  // Latest earlier correction for this job (its "after" is today's baseline).
  useEffect(() => {
    if (baseline) { setPrior(null); return; }
    if (!jobId) { setPrior(null); return; }
    let live = true;
    getDocs(query(collection(db, 'payrollAdjustments'), where('workOrderId', '==', jobId)))
      .then(snap => {
        const latest = snap.docs.map(d => d.data() as PayAdjustment)
          .filter(a => a.laborAmount != null || a.correctAmount != null)
          .sort((a, b) => (b.at || '').localeCompare(a.at || ''))[0];
        if (live) setPrior(latest || null);
      })
      .catch(() => live && setPrior(null));
    return () => { live = false; };
  }, [jobId, baseline]);

  const before = useMemo(() => {
    if (baseline) return baseline;
    if (isFieldNation) {
      // Older corrections stored only the tech's pay: work the labor back out.
      const labor = prior?.laborAmount
        ?? (prior?.correctAmount != null ? Math.round((prior.correctAmount * 2 / (1 - FIELD_NATION_FEE_RATE)) * 100) / 100 : null)
        ?? Number(job?.pay ?? item?.jobPay ?? 0);
      const tech = prior?.correctAmount ?? (prior?.laborAmount != null || !item ? techShareOfFieldNationLabor(labor).techPay : effectiveJobPay(item, job));
      return { labor, tech };
    }
    const pay = prior?.correctAmount ?? Number(item?.jobPay ?? job?.pay ?? 0);
    return { labor: pay, tech: pay };
  }, [isFieldNation, prior, job, item, baseline]);

  const after = useMemo(() => {
    const n = parseFloat(entered);
    if (!Number.isFinite(n)) return null;
    return isFieldNation ? { labor: n, ...techShareOfFieldNationLabor(n) } : { labor: n, fee: 0, net: n, techPay: n };
  }, [entered, isFieldNation]);

  const result: PayCorrection | null = after && prior !== undefined ? {
    isFieldNation, laborBefore: round(before.labor), laborAfter: round(after.labor),
    techBefore: round(before.tech), techAfter: round(after.techPay), diff: round(after.techPay - before.tech),
  } : null;

  useEffect(() => { onChange(result); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result?.diff, result?.laborAfter, result?.techBefore]);

  const beforeCalc = isFieldNation ? techShareOfFieldNationLabor(before.labor) : null;

  return (
    <div className="space-y-2 rounded-lg border border-border-sub bg-bg-primary p-3 text-left">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{baseline ? 'Original pay on file' : `Now on file${prior ? ' (after an earlier correction)' : ''}`}</p>
        {prior === undefined ? (
          <p className="text-[12px] text-text-muted">Loading…</p>
        ) : isFieldNation && beforeCalc ? (
          <p className="text-[12px] font-mono text-text-secondary">
            Labor {usd(before.labor)} − fee {usd(beforeCalc.fee)} = {usd(beforeCalc.net)} ÷ 2 → <span className="font-semibold text-text-primary">tech {usd(before.tech)}</span>
          </p>
        ) : (
          <p className="text-[12px] font-mono text-text-secondary">Pay <span className="font-semibold text-text-primary">{usd(before.tech)}</span></p>
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-[12px] font-medium text-text-muted">{isFieldNation ? 'Correct labor total (full pay, before the FN fee)' : 'Correct pay'}</Label>
        <Input type="number" inputMode="decimal" step="0.01" value={entered} onChange={e => setEntered(e.target.value)}
          placeholder={before.labor ? before.labor.toFixed(2) : '0.00'} className="h-10 font-mono bg-bg-secondary sm:max-w-[220px]" autoFocus={autoFocus} />
      </div>

      {after && isFieldNation && (
        <p className="text-[12px] font-mono text-text-secondary">
          Labor {usd(after.labor)} − fee {usd(after.fee)} = {usd(after.net)} ÷ 2 → <span className="font-semibold text-text-primary">tech {usd(after.techPay)}</span>
        </p>
      )}
      {result && (
        <p className={cn('text-[13px] font-semibold', result.diff > 0 ? 'text-text-green' : result.diff < 0 ? 'text-text-red' : 'text-text-muted')}>
          {result.diff === 0 ? 'No difference for the tech — nothing to pay or deduct.'
            : `Difference to the tech: ${result.diff > 0 ? '+' : '−'}$${Math.abs(result.diff).toFixed(2)} (${usd(result.techBefore)} → ${usd(result.techAfter)})`}
        </p>
      )}
    </div>
  );
}
