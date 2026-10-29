'use client';

import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Wraps a text box that should be read-only until someone means to edit it:
 * gray and locked by default; double-click the box or tap the pencil to unlock.
 * Pass the same `locked` to the input as `readOnly` (not disabled — disabled
 * boxes swallow the double-click).
 */
export function UnlockableField({ locked, onUnlock, canEdit = true, className, children }: {
  locked: boolean; onUnlock: () => void; canEdit?: boolean; className?: string; children: React.ReactNode;
}) {
  const lockedNow = locked && canEdit;
  return (
    <div
      className={cn('relative', lockedNow && '[&_input]:bg-bg-tertiary/60 [&_textarea]:bg-bg-tertiary/60 [&_input]:text-text-secondary [&_textarea]:text-text-secondary [&_input]:cursor-default [&_textarea]:cursor-default', className)}
      onDoubleClick={lockedNow ? onUnlock : undefined}
      title={lockedNow ? 'Double-click or tap the pencil to edit' : undefined}
    >
      {children}
      {lockedNow && (
        <button type="button" onClick={onUnlock} aria-label="Edit"
          className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-md border border-border-sub bg-bg-secondary text-text-muted hover:text-text-primary">
          <Pencil size={12} />
        </button>
      )}
    </div>
  );
}
