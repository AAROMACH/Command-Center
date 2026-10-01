'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
};

/**
 * Search box that stays stable on phone keyboards.
 *
 * Typing backwards on mobile comes from the caret being reset mid-word: phone
 * keyboards (Gboard, iOS predictive text) type into a "composition", and a
 * controlled input that re-renders the whole page on every keystroke can
 * overwrite that composition and drop the caret back to the start. So:
 *  - the input owns its text locally and only reports upward once a
 *    composition ends (or on plain key input), never mid-composition;
 *  - autocorrect / autocapitalize / spellcheck are off — they're what open
 *    compositions on every word;
 *  - 16px text on mobile so iOS doesn't zoom-and-relayout on focus;
 *  - explicit LTR, full width, 44px tall, with a clear button.
 */
export function SearchField({ value, onChange, placeholder = 'Search...', className, inputClassName }: Props) {
  const [text, setText] = useState(value);
  const composing = useRef(false);

  // Follow outside resets (e.g. a "clear filters" button) without fighting typing.
  useEffect(() => {
    if (!composing.current && value !== text) setText(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = (next: string) => {
    setText(next);
    onChange(next);
  };

  return (
    <div className={cn('relative flex w-full items-center', className)} dir="ltr">
      <Search className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted" aria-hidden />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        dir="ltr"
        aria-label={placeholder}
        placeholder={placeholder}
        value={text}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={e => { composing.current = false; commit(e.currentTarget.value); }}
        onChange={e => {
          if (composing.current) setText(e.target.value);
          else commit(e.target.value);
        }}
        className={cn(
          'h-11 w-full rounded-lg border border-border-main bg-bg-secondary pl-10 pr-11 text-base text-text-primary',
          'placeholder:text-text-muted focus:border-brand-red focus:outline-none focus:ring-0',
          'sm:h-9 sm:text-xs',
          // hide the browser's own clear "x" — we render a bigger one
          '[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none',
          inputClassName,
        )}
      />
      {text && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => commit('')}
          className="absolute right-0 flex h-11 w-11 items-center justify-center text-text-muted hover:text-text-primary sm:h-9 sm:w-9"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
