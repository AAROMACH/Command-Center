'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Page a list instead of rendering all of it. Page sizes are per list:
 *   - fast-growing lists (jobs, logs, activity, invoices, trips): PAGE_SIZES_LARGE
 *   - slower lists (people, clients, sites, flags, requests):     PAGE_SIZES_SMALL
 *
 *   const pager = usePaged(rows, PAGE_SIZES_LARGE, 'admin-job-history');
 *   pager.items.map(...)
 *   <ListPager pager={pager} />
 *
 * The chosen page size is remembered per list (storageKey) in this browser.
 * Goes back to page 1 when the list's filters change (pass them as resetKeys)
 * and never sits past the last page when rows disappear.
 */

export const PAGE_SIZES_LARGE = [25, 50, 100] as const;
export const PAGE_SIZES_SMALL = [10, 25, 50] as const;

export type Pager<T> = {
  items: T[];
  page: number;
  pageCount: number;
  size: number;
  sizes: readonly number[];
  total: number;
  setPage: (p: number) => void;
  setSize: (s: number) => void;
};

export function usePaged<T>(
  rows: T[],
  sizes: readonly number[] = PAGE_SIZES_LARGE,
  storageKey?: string,
  resetKeys: unknown[] = [],
): Pager<T> {
  const [size, setSizeState] = useState<number>(sizes[0]);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = Number(localStorage.getItem(`pageSize:${storageKey}`));
      if (sizes.includes(saved)) setSizeState(saved);
    } catch { /* storage unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const setSize = (s: number) => {
    setSizeState(s);
    setPage(0);
    if (storageKey) { try { localStorage.setItem(`pageSize:${storageKey}`, String(s)); } catch { /* ignore */ } }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(0); }, resetKeys);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(page, pageCount - 1);
  const items = useMemo(() => rows.slice(safePage * size, (safePage + 1) * size), [rows, safePage, size]);

  return { items, page: safePage, pageCount, size, sizes, total, setPage, setSize };
}

export function ListPager<T>({ pager, className, noun = 'rows' }: { pager: Pager<T>; className?: string; noun?: string }) {
  const { page, pageCount, size, sizes, total, setPage, setSize } = pager;
  // Nothing to page through.
  if (total <= sizes[0]) return null;
  const from = page * size + 1;
  const to = Math.min((page + 1) * size, total);
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 py-3', className)}>
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">Show</span>
        {sizes.map(n => (
          <button
            key={n}
            type="button"
            onClick={() => setSize(n)}
            aria-pressed={size === n}
            className={cn(
              'h-8 min-w-10 px-2 rounded-md border text-[10px] font-bold',
              size === n ? 'border-brand-red bg-brand-red text-white' : 'border-border-main text-text-muted hover:text-text-primary',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-text-muted">{from}–{to} of {total.toLocaleString()} {noun}</span>
        <button
          type="button"
          aria-label="Previous page"
          disabled={page === 0}
          onClick={() => setPage(Math.max(0, page - 1))}
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border-main text-text-muted hover:text-text-primary disabled:opacity-40"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pageCount - 1}
          onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border-main text-text-muted hover:text-text-primary disabled:opacity-40"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
