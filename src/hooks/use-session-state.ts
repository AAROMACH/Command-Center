'use client';

import { useEffect, useState } from 'react';

/**
 * useState that survives leaving the page and coming back (same tab): a list's
 * search, tab and filters are still set after opening a job and hitting Back.
 * Kept in sessionStorage, so a new tab or a fresh sign-in starts clean.
 * `revive` rebuilds values JSON can't hold (e.g. Dates).
 */
export function useSessionState<T>(key: string, initial: T, revive?: (raw: any) => T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = sessionStorage.getItem(`ss:${key}`);
      if (raw == null) return initial;
      const parsed = JSON.parse(raw);
      return revive ? revive(parsed) : parsed;
    } catch { return initial; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(`ss:${key}`, JSON.stringify(value)); } catch { /* storage blocked */ }
  }, [key, value]);
  return [value, setValue] as const;
}
