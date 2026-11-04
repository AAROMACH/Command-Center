'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, FileSearch, Plus, Receipt, Search, type LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/billing';
import type { PriceBookItem, PriceSection } from '@/lib/price-lines';

/**
 * Quote vs invoice look, used by the editor and the quote view so the two
 * documents are told apart at a glance: quotes are blue, invoices green.
 */
export const DOC_BRAND: Record<'quote' | 'invoice', { label: string; icon: LucideIcon; chip: string; bar: string; text: string; frame: string }> = {
  quote: {
    label: 'Quote', icon: FileSearch,
    chip: 'border-brand-blue/30 bg-brand-blue/10 text-brand-blue',
    bar: 'bg-brand-blue', text: 'text-brand-blue', frame: 'border-brand-blue/40',
  },
  invoice: {
    label: 'Invoice', icon: Receipt,
    chip: 'border-green-border/40 bg-green-dim text-text-green',
    bar: 'bg-text-green', text: 'text-text-green', frame: 'border-green-border/50',
  },
};

/** Coloured stripe + "QUOTE"/"INVOICE" chip for the top of a dialog. */
export function DocKindHeader({ kind, children }: { kind: 'quote' | 'invoice'; children?: ReactNode }) {
  const b = DOC_BRAND[kind];
  const Icon = b.icon;
  return (
    <>
      <div aria-hidden className={cn('absolute inset-x-0 top-0 h-1.5 sm:rounded-t-lg', b.bar)} />
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider', b.chip)}>
          <Icon size={12} /> {b.label}
        </span>
        {children}
      </div>
    </>
  );
}

/**
 * "Add from price book" as a pop-up: search across every item, filter by
 * category, tap to add (stays open so several can be added in a row).
 */
export function PriceBookPicker({ items, section, onPick, disabled }: {
  items: PriceBookItem[];
  section: PriceSection;
  onPick: (item: PriceBookItem) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<string>('all');
  const [added, setAdded] = useState<Record<string, number>>({});
  useEffect(() => { if (open) { setSearch(''); setGroup('all'); setAdded({}); } }, [open]);

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach(i => counts.set(i.group, (counts.get(i.group) || 0) + 1));
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return items
      .filter(i => group === 'all' || i.group === group)
      .filter(i => !words.length || words.every(w => `${i.name} ${i.group}`.toLowerCase().includes(w)))
      .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  }, [items, search, group]);

  const pick = (i: PriceBookItem) => {
    onPick(i);
    setAdded(p => ({ ...p, [i.id]: (p[i.id] || 0) + 1 }));
  };
  const addedCount = Object.values(added).reduce((s, n) => s + n, 0);
  const noun = section === 'labor' ? 'labor rate' : 'material';

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="h-8 text-[11px]" disabled={disabled || !items.length} onClick={() => setOpen(true)}>
        <Search size={12} className="mr-1" /> {items.length ? 'Add from price book' : 'Price book is empty'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-bg-elevated border-border-main sm:max-w-xl max-h-[88svh] flex flex-col gap-3">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base">{section === 'labor' ? 'Add labor' : 'Add materials'}</DialogTitle>
            <DialogDescription className="text-[12px]">Search or pick a category. Tap an item to add it — add as many as you need.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <Input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${noun}s…`}
              className="h-10 pl-8 text-[13px] bg-bg-secondary border-border-main" />
          </div>
          {groups.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {[['all', items.length] as const, ...groups].map(([g, n]) => (
                <button key={g} type="button" onClick={() => setGroup(g)}
                  className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors',
                    group === g ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-muted hover:border-border-main hover:text-text-primary')}>
                  {g === 'all' ? 'All' : g} <span className="opacity-70">{n}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 min-h-[160px] overflow-y-auto space-y-1 -mx-1 px-1">
            {shown.map((i, idx) => (
              <div key={i.id}>
                {group === 'all' && (idx === 0 || shown[idx - 1].group !== i.group) && (
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted px-1 pt-2 pb-1">{i.group}</p>
                )}
                <button type="button" onClick={() => pick(i)}
                  className={cn('w-full flex items-center justify-between gap-3 rounded-md border px-2.5 py-2 text-left text-[12px] transition-colors',
                    added[i.id] ? 'border-text-green/40 bg-green-dim/40' : 'border-border-sub hover:bg-bg-tertiary')}>
                  <span className="min-w-0 break-words font-medium text-text-primary">{i.name}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-text-secondary">{formatMoney(i.unitPrice)}</span>
                    {added[i.id]
                      ? <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-text-green"><Check size={12} />{added[i.id] > 1 ? `×${added[i.id]}` : ''}</span>
                      : <Plus size={13} className="text-text-muted" />}
                  </span>
                </button>
              </div>
            ))}
            {!shown.length && <p className="text-[12px] text-text-muted py-8 text-center">No {noun}s match.</p>}
          </div>
          <DialogFooter className="flex-row items-center justify-between sm:justify-between gap-2">
            <span className="text-[12px] text-text-muted">{addedCount ? `${addedCount} added` : `${shown.length} shown`}</span>
            <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
