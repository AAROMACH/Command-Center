'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

/**
 * A list of options entered one at a time: type an option and press Enter (or
 * tap +). Each becomes a removable chip, so options can contain commas and
 * there's no separator to get wrong. Pasting a comma- or line-separated list
 * still adds each item.
 */
export function OptionListInput({ value, onChange, placeholder = 'Type an option, press Enter' }: {
  value: string[]; onChange: (next: string[]) => void; placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const options = value.filter(Boolean);
  const add = (raw: string) => {
    const items = raw.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    const next = [...options];
    for (const it of items) if (!next.some(o => o.toLowerCase() === it.toLowerCase())) next.push(it);
    onChange(next);
    setDraft('');
  };
  return (
    <div className="space-y-1.5">
      {options.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {options.map(o => (
            <span key={o} className="inline-flex items-center gap-1 rounded-full border border-border-sub bg-bg-tertiary py-0.5 pl-2 pr-1 text-[11px] text-text-primary">
              {o}
              <button type="button" aria-label={`Remove ${o}`} onClick={() => onChange(options.filter(x => x !== o))}
                className="flex h-4 w-4 items-center justify-center rounded-full text-text-muted hover:bg-bg-primary hover:text-text-red">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); if (draft.trim()) add(draft); }
            else if (e.key === 'Backspace' && !draft && options.length) onChange(options.slice(0, -1));
          }}
          onPaste={e => { const t = e.clipboardData.getData('text'); if (/[\n,]/.test(t)) { e.preventDefault(); add(t); } }}
          placeholder={placeholder}
          className="h-8 flex-1 rounded-md border border-border-sub bg-bg-primary px-2 text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-red"
        />
        <button type="button" aria-label="Add option" disabled={!draft.trim()} onClick={() => add(draft)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border-sub text-text-muted hover:text-text-primary disabled:opacity-40">
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
