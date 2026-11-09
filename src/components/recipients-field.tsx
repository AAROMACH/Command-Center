'use client';

import { Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MAX_RECIPIENTS, isEmailAddress } from '@/lib/recipients';

/**
 * "Send to" plus any extra people: the first address is the customer's;
 * "Add recipient" adds more. Everyone gets the same email.
 */
export function RecipientsField({ value, onChange, disabled, placeholder = 'client@example.com' }: {
  value: string[]; onChange: (v: string[]) => void; disabled?: boolean; placeholder?: string;
}) {
  const list = value.length ? value : [''];
  const set = (i: number, v: string) => onChange(list.map((x, n) => (n === i ? v : x)));
  return (
    <div className="space-y-1.5">
      <span className="block text-[12px] font-medium text-text-primary">Send to</span>
      {list.map((v, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input type="email" value={v} onChange={e => set(i, e.target.value)} placeholder={i === 0 ? placeholder : 'another@example.com'}
            disabled={disabled} aria-invalid={!!v.trim() && !isEmailAddress(v)} aria-label={i === 0 ? 'Recipient' : `Recipient ${i + 1}`} />
          {i > 0 && (
            <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" disabled={disabled}
              onClick={() => onChange(list.filter((_, n) => n !== i))} aria-label="Remove recipient">
              <X size={14} />
            </Button>
          )}
        </div>
      ))}
      {list.some(v => v.trim() && !isEmailAddress(v)) && <p className="text-[11px] text-brand-red">Check the email addresses.</p>}
      {list.length < MAX_RECIPIENTS && (
        <button type="button" disabled={disabled} onClick={() => onChange([...list, ''])}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-red hover:underline disabled:opacity-50">
          <Plus size={12} /> Add recipient
        </button>
      )}
    </div>
  );
}

/** Ready to send: at least one address and no half-typed ones. */
export const recipientsValid = (v: string[]) => v.some(x => isEmailAddress(x)) && v.every(x => !x.trim() || isEmailAddress(x));
