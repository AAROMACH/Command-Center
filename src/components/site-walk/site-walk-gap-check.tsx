'use client';

import { useState } from 'react';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/firebase';
import type { WalkLine } from '@/lib/estimating';

type Suggestion = { code: string; name: string; unit: string; qty: number; reason: string; alreadyOnQuote: boolean };

/**
 * "Check for missed items" on site walk review: AI reads the walk's notes and
 * suggests catalog lines; the admin adds the ones that are right. Prices come
 * from the catalog like any other line.
 */
export function SiteWalkGapCheck({ walkId, lines, onAdd }: {
  walkId: string;
  lines: WalkLine[];
  onAdd: (code: string, qty: number, reason: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ suggestions: Suggestion[]; questions: string[] } | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());

  const run = async () => {
    setBusy(true); setError(''); setAdded(new Set());
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/site-walk/gap-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ walkId, lines: lines.map(l => ({ code: l.code, qty: l.qty })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Check failed');
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 max-w-2xl">
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={busy} className="h-8 text-[12px]">
        {busy ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Sparkles size={13} className="mr-1.5" />}
        {result ? 'Check again' : 'Check for missed items'}
      </Button>
      {error && <p className="text-[12px] text-text-red">{error}</p>}
      {result && (
        <div className="rounded-lg border border-border-sub p-3 space-y-2 text-[12px]">
          {result.suggestions.length === 0 && <p className="text-text-muted">Nothing obviously missing from the notes.</p>}
          {result.suggestions.map((s, i) => (
            <div key={i} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p><span className="font-semibold">{s.qty} × {s.name}</span> <span className="text-text-muted">· {s.code} · per {s.unit}</span>
                  {s.alreadyOnQuote && <span className="text-accent-gold"> · already a line — check the qty</span>}</p>
                <p className="text-text-muted">{s.reason}</p>
              </div>
              <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0" disabled={added.has(i)}
                onClick={() => { onAdd(s.code, s.qty, s.reason); setAdded(a => new Set(a).add(i)); }}>
                {added.has(i) ? 'Added' : <><Plus size={12} className="mr-1" />Add</>}
              </Button>
            </div>
          ))}
          {result.questions.length > 0 && (
            <div className="pt-2 border-t border-border-sub">
              <p className="font-semibold text-text-secondary mb-1">Confirm before quoting</p>
              <ul className="list-disc pl-4 text-text-muted space-y-0.5">{result.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
            </div>
          )}
          <p className="text-[11px] text-text-muted">AI suggestions from the walk notes — check them. Prices come from the catalog.</p>
        </div>
      )}
    </div>
  );
}
