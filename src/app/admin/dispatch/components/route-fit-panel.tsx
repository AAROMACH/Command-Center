'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Lightbulb } from 'lucide-react';
import { geocodeAddress } from '@/lib/utils';
import { routeHealth, suggestTechs, type TechSuggestion } from '@/lib/dispatch-suggest';
import type { Technician, WorkOrder } from '@/lib/types';

// Home coordinates for the session, shared across routes (geocoding is slow
// and rate-limited, so only the leading candidates are looked up).
const homeCache = new Map<string, { lat: number; lng: number } | null>();
const HOME_LOOKUPS = 6;

/** Route checks (one day, tight area, time between stops) + best-fit tech picks. */
export function RouteFitPanel({ jobs, techs, assignments, currentTechId, onPick }: {
  jobs: WorkOrder[];
  techs: Technician[];
  assignments: WorkOrder[];
  currentTechId?: string;
  onPick: (techId: string) => void;
}) {
  const health = useMemo(() => routeHealth(jobs), [jobs]);
  const [picks, setPicks] = useState<TechSuggestion[] | null>(null);
  const [busy, setBusy] = useState(false);

  if (!jobs.length) return null;

  const suggest = async () => {
    setBusy(true);
    // First pass without home distance, to know who's worth geocoding.
    const firstPass = suggestTechs(jobs, techs, assignments, homeCache, HOME_LOOKUPS);
    setPicks(firstPass.slice(0, 3));
    for (const { tech } of firstPass) {
      if (homeCache.has(tech.id)) continue;
      homeCache.set(tech.id, tech.address ? await geocodeAddress(tech.address) : null);
    }
    setPicks(suggestTechs(jobs, techs, assignments, homeCache, 3));
    setBusy(false);
  };

  return (
    <div className="space-y-1.5">
      {health.warnings.length > 0 && (
        <ul className="space-y-0.5">
          {health.warnings.map(w => (
            <li key={w} className="flex items-center gap-1.5 text-[11px] text-accent-gold">
              <AlertTriangle size={11} className="shrink-0" />{w}
            </li>
          ))}
        </ul>
      )}
      {!picks ? (
        <button type="button" onClick={suggest} className="flex items-center gap-1 text-[11px] font-semibold text-text-muted hover:text-text-primary">
          <Lightbulb size={12} /> Suggest a tech
        </button>
      ) : (
        <div className="rounded-md border border-border-sub divide-y divide-border-sub">
          {picks.map(p => (
            <button key={p.tech.id} type="button" onClick={() => onPick(p.tech.id)}
              className="w-full text-left px-2 py-1.5 hover:bg-bg-tertiary disabled:opacity-60"
              disabled={p.tech.id === currentTechId}>
              <p className="text-[11px] font-bold">{p.tech.name}{p.tech.id === currentTechId ? ' · assigned' : ''}</p>
              <p className="text-[10px] text-text-muted">{p.reasons.join(' · ')}</p>
            </button>
          ))}
          {busy && <p className="flex items-center gap-1 px-2 py-1 text-[10px] text-text-muted"><Loader2 size={10} className="animate-spin" /> Checking home distances…</p>}
        </div>
      )}
    </div>
  );
}
