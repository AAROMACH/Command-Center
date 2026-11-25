'use client';

import { Mail, Phone, UserRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { Technician } from '@/lib/types';

/**
 * "Your Aaromach contact" — the person at Aaromach who looks after this
 * client, shown in their portal with a way to reach them.
 *
 * Reads the snapshot stored on the client's own user doc, because
 * firestore.rules lets a client read only their own record and never a staff
 * one. An admin sets it in Directory → Edit profile, which rewrites the
 * snapshot each save. Renders nothing when nobody is assigned, so the portal
 * never shows an empty "your contact" box.
 */
export function AccountManagerCard({ client, className }: { client: Partial<Technician> | null | undefined; className?: string }) {
  const m = client?.accountManager;
  if (!m?.name) return null;
  const tel = String(m.phone || '').replace(/[^\d+]/g, '');
  return (
    <Card className={className}>
      <CardContent className="flex flex-wrap items-start gap-4 p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-sub bg-bg-tertiary text-text-muted">
          <UserRound size={20} />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5 text-left">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Your Aaromach contact</p>
          <p className="text-[14px] font-semibold text-text-primary">{m.name}</p>
          {m.jobTitle && <p className="text-[12px] text-text-muted">{m.jobTitle}</p>}
          <p className="text-[12px] text-text-muted">Questions about a job, an invoice or this app — start here.</p>
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:items-end">
          {m.email && (
            <a href={`mailto:${m.email}`}
              className="inline-flex min-h-[40px] items-center gap-1.5 text-[12px] font-medium text-brand-red hover:underline sm:min-h-0">
              <Mail size={13} className="shrink-0" /> {m.email}
            </a>
          )}
          {m.phone && (
            <a href={`tel:${tel}`}
              className="inline-flex min-h-[40px] items-center gap-1.5 text-[12px] font-medium text-brand-red hover:underline sm:min-h-0">
              <Phone size={13} className="shrink-0" /> {m.phone}
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
