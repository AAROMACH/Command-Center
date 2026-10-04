'use client';

import type { ReactNode } from 'react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, CalendarDays, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

// Shared sort + filter controls for list pages (tech and admin Assignments),
// so both pages look and behave the same on phone and desktop. Sized to sit
// beside SearchField: 44px tall on phones, 36px from `sm` up.

const controlBase =
  'h-11 sm:h-9 rounded-lg border border-border-main bg-bg-secondary text-[10px] font-bold uppercase tracking-widest text-text-primary';

export type SortOptionDef = { value: string; label: string };

/**
 * Sort field picker plus an up/down direction button. The direction button
 * only shows for the date sort, which is the only one with two meaningful
 * orders (the others are fixed: highest pay first, A→Z, …).
 */
export function SortControl({
  value, onChange, options, dateAsc, onToggleDirection, className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SortOptionDef[];
  dateAsc: boolean;
  onToggleDirection: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 items-stretch gap-1.5', className)}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={cn(controlBase, 'min-w-0 flex-1 px-3 sm:w-[150px] sm:flex-none')} aria-label="Sort by">
          {/* div, not span: SelectTrigger line-clamps direct <span> children,
              which collapses the flex gap. */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            <span className="shrink-0 text-text-muted">Sort:</span>
            {/* Label rendered directly so it shows before the menu has ever opened. */}
            <div className="min-w-0 truncate"><SelectValue>{options.find(o => o.value === value)?.label}</SelectValue></div>
          </div>
        </SelectTrigger>
        <SelectContent>
          {options.map(o => (
            <SelectItem key={o.value} value={o.value} className="text-[10px] font-bold uppercase">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value === 'date' && (
        <button
          type="button"
          onClick={onToggleDirection}
          aria-label={dateAsc ? 'Earliest first — tap for latest first' : 'Latest first — tap for earliest first'}
          title={dateAsc ? 'Earliest first' : 'Latest first'}
          className={cn(controlBase, 'flex w-11 shrink-0 items-center justify-center text-brand-red hover:bg-bg-tertiary sm:w-auto sm:gap-1.5 sm:px-3')}
        >
          {dateAsc ? <ArrowUpNarrowWide size={14} /> : <ArrowDownWideNarrow size={14} />}
          <span className="hidden sm:inline">{dateAsc ? 'Earliest' : 'Latest'}</span>
        </button>
      )}
    </div>
  );
}

/** "Filters" button with an active-count badge; sections go in as children. */
export function FiltersPopover({
  activeCount, onReset, children, className,
}: {
  activeCount: number;
  onReset: () => void;
  children: ReactNode;
  className?: string;
}) {
  const active = activeCount > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            controlBase,
            'flex items-center justify-center gap-2 px-3 hover:bg-bg-tertiary',
            active && 'border-brand-red text-brand-red',
            className,
          )}
        >
          <SlidersHorizontal size={14} />
          Filters
          {active && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-red px-1 text-[9px] text-white">{activeCount}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(320px,calc(100vw-2rem))] max-h-[75svh] overflow-y-auto p-0 bg-bg-elevated border-border-main shadow-2xl" align="end">
        <div className="flex items-center justify-between border-b border-border-sub bg-bg-tertiary p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-text-primary">Filters</p>
          {active && (
            <button type="button" onClick={onReset} className="flex items-center gap-1 text-[9px] font-bold uppercase text-brand-red hover:underline">
              <X size={10} /> Reset
            </button>
          )}
        </div>
        <div className="space-y-6 p-4 text-left">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

export function FilterSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

export type FilterOption = string | { value: string; label: string };

/** Checkbox grid for a multi-select filter (priority, source, job status, …). */
export function CheckboxFilter({
  idPrefix, options, selected, onChange, columns = 2, maxHeight,
}: {
  idPrefix: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  columns?: 1 | 2;
  /** Scroll long lists (e.g. service categories) inside this height, in px. */
  maxHeight?: number;
}) {
  return (
    <div
      className={cn('grid gap-2', columns === 2 ? 'grid-cols-2' : 'grid-cols-1', maxHeight && 'overflow-y-auto pr-2')}
      style={maxHeight ? { maxHeight } : undefined}
    >
      {options.map(o => {
        const value = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        return (
          <div key={value} className="flex items-center space-x-2">
            <Checkbox
              id={`${idPrefix}-${value}`}
              checked={selected.includes(value)}
              onCheckedChange={checked => onChange(checked ? [...selected, value] : selected.filter(s => s !== value))}
            />
            <Label htmlFor={`${idPrefix}-${value}`} className="cursor-pointer text-[10px] font-semibold uppercase">{label}</Label>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Schedule-date range as its own toolbar button (outside Filters), showing the
 * chosen range with a one-tap clear.
 */
export function DateRangeButton({
  value, onChange, className,
}: {
  value: DateRange | undefined;
  onChange: (r: DateRange | undefined) => void;
  className?: string;
}) {
  const label = value?.from
    ? (value.to ? `${format(value.from, 'MM/dd/yy')} – ${format(value.to, 'MM/dd/yy')}` : format(value.from, 'MM/dd/yy'))
    : 'Date';
  return (
    <Popover>
      <div className={cn('relative flex shrink-0', className)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={value?.from ? `Date range ${label}` : 'Filter by date'}
            className={cn(controlBase, 'flex w-full items-center justify-center gap-2 px-3 hover:bg-bg-tertiary', value?.from && 'border-brand-red text-brand-red pr-8')}
          >
            <CalendarDays size={14} />
            <span className="whitespace-nowrap">{label}</span>
          </button>
        </PopoverTrigger>
        {value?.from && (
          <button
            type="button"
            aria-label="Clear date range"
            onClick={() => onChange(undefined)}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-1 text-brand-red hover:bg-brand-red/15"
          >
            <X size={12} />
          </button>
        )}
      </div>
      <PopoverContent className="w-auto p-0 bg-bg-elevated border-border-main shadow-2xl" align="end">
        <Calendar initialFocus mode="range" selected={value} onSelect={onChange} numberOfMonths={1} />
      </PopoverContent>
    </Popover>
  );
}

export function DateRangeFilter({ value, onChange }: { value: DateRange | undefined; onChange: (r: DateRange | undefined) => void }) {
  return (
    <FilterSection
      title="Schedule Date"
      action={value?.from ? (
        <button type="button" onClick={() => onChange(undefined)} className="text-[9px] font-bold uppercase text-brand-red hover:underline">Clear</button>
      ) : undefined}
    >
      <p className="text-[10px] font-semibold text-text-primary">
        {value?.from
          ? (value.to ? <>{format(value.from, 'MM-dd-yyyy')} – {format(value.to, 'MM-dd-yyyy')}</> : format(value.from, 'MM-dd-yyyy'))
          : <span className="text-text-muted">All dates</span>}
      </p>
      <div className="overflow-hidden rounded-md border border-border-sub">
        <Calendar mode="range" selected={value} onSelect={onChange} numberOfMonths={1} />
      </div>
    </FilterSection>
  );
}
