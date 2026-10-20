'use client';

import { useEffect, useRef, useState } from 'react';

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

/**
 * Remembers how far down the app's scroll area (<main>) a page was and puts it
 * back on return, once `ready` (the list has loaded — before then there's
 * nothing to scroll to).
 */
export function useScrollRestore(key: string, ready: boolean) {
  const restored = useRef(false);
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;
    const save = () => { try { sessionStorage.setItem(`scroll:${key}`, String(main.scrollTop)); } catch { /* ignore */ } };
    main.addEventListener('scroll', save, { passive: true });
    return () => main.removeEventListener('scroll', save);
  }, [key]);
  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const main = document.querySelector('main');
    const y = Number((() => { try { return sessionStorage.getItem(`scroll:${key}`); } catch { return 0; } })() || 0);
    if (main && y > 0) requestAnimationFrame(() => { main.scrollTop = y; });
  }, [key, ready]);
}
