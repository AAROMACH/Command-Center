'use client';

import { useState } from 'react';
import { LayoutGrid, LayoutList } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewMode = 'grid' | 'list';

/**
 * Per-page grid/list view preference, persisted to localStorage under
 * `cc:<key>:view`. Mirrors the inline pattern already used by the
 * assignments/projects/requests pages so every page behaves the same.
 */
export function useViewMode(key: string, fallback: ViewMode = 'grid'): [ViewMode, (v: ViewMode) => void] {
  const storageKey = `cc:${key}:view`;
  const [viewMode, setRaw] = useState<ViewMode>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored === 'grid' || stored === 'list' ? stored : fallback;
    } catch { return fallback; }
  });
  const setViewMode = (v: ViewMode) => {
    setRaw(v);
    try { localStorage.setItem(storageKey, v); } catch { /* ignore */ }
  };
  return [viewMode, setViewMode];
}

/** Grid / list segmented control shared across list pages. */
export function ViewToggle({ value, onChange, className }: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-0.5 shrink-0', className)}>
      <button type="button" onClick={() => onChange('grid')} aria-label="Card view" aria-pressed={value === 'grid'}
        className={cn('p-1.5 rounded transition-colors', value === 'grid' ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-primary')}>
        <LayoutGrid size={14} />
      </button>
      <button type="button" onClick={() => onChange('list')} aria-label="List view" aria-pressed={value === 'list'}
        className={cn('p-1.5 rounded transition-colors', value === 'list' ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-primary')}>
        <LayoutList size={14} />
      </button>
    </div>
  );
}
