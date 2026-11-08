'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Mail } from 'lucide-react';
import { db } from '@/lib/firebase';
import { PageHeader } from '@/components/page-header';
import { SearchField } from '@/components/search-field';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { usePaged, ListPager, PAGE_SIZES_LARGE } from '@/components/list-pager';
import { cn } from '@/lib/utils';

type Entry = {
  id: string; to: string; from: string; replyTo: string | null; subject: string; text: string;
  kind: 'billing' | 'support' | 'notifications'; status: 'sent' | 'failed'; error: string | null;
  emailId: string | null; related: { type: string; id: string; label?: string | null } | null;
  sentBy: string | null; at: string;
};

const KIND_LABEL: Record<Entry['kind'], string> = { billing: 'Billing', support: 'Support', notifications: 'Notification' };
const when = (s: string) => { try { return new Date(s).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return s; } };

/**
 * Settings → Email log: a copy of every email the app sent (or tried to) —
 * invoices, alerts, tests — with the full message exactly as sent.
 * ?id=<entry> opens one (from an invoice's "View email").
 */
export default function EmailLogPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | Entry['kind'] | 'failed'>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    try { setOpenId(new URLSearchParams(window.location.search).get('id')); } catch { /* none */ }
    return onSnapshot(query(collection(db, 'emailLog'), orderBy('at', 'desc'), limit(1000)),
      s => setEntries(s.docs.map(d => ({ ...d.data(), id: d.id } as Entry))), () => setEntries([]));
  }, []);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (entries || []).filter(e =>
      (kind === 'all' || (kind === 'failed' ? e.status === 'failed' : e.kind === kind))
      && words.every(w => [e.to, e.subject, e.text, e.related?.label, e.related?.id, e.sentBy].some(v => (v || '').toLowerCase().includes(w))));
  }, [entries, q, kind]);
  const pager = usePaged(shown, PAGE_SIZES_LARGE, 'email-log', [q, kind]);

  // Opened from a link: jump to that page of the list.
  useEffect(() => {
    if (!openId || !entries) return;
    window.setTimeout(() => document.getElementById(`email-${openId}`)?.scrollIntoView({ block: 'center' }), 100);
  }, [openId, entries]);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Settings" icon={Mail} title="Email log"
        subtitle="Every email the app sent — invoices, alerts and tests — with the full message exactly as it went out." />

      <div className="flex flex-wrap items-center gap-2">
        <SearchField value={q} onChange={setQ} placeholder="Search recipient, subject, invoice # or text" className="flex-1 min-w-[220px]" />
        <div className="tabs flex-wrap" role="tablist">
          {([['all', 'All'], ['billing', 'Billing'], ['notifications', 'Notifications'], ['support', 'Support'], ['failed', 'Failed']] as const).map(([v, label]) => (
            <button key={v} type="button" role="tab" aria-selected={kind === v} onClick={() => setKind(v)} className={cn('tab', kind === v && 'active')}>{label}</button>
          ))}
        </div>
      </div>

      {entries === null ? <LoadingState label="Loading emails…" rows={4} />
        : shown.length === 0 ? <EmptyState icon={Mail} title={entries.length ? 'No emails match' : 'No emails yet'} description="Emails the app sends from now on are saved here." />
        : (
          <div className="space-y-2">
            {(openId && !pager.items.some(e => e.id === openId) ? [...shown.filter(e => e.id === openId), ...pager.items] : pager.items).map(e => {
              const isOpen = openId === e.id;
              return (
                <div key={e.id} id={`email-${e.id}`} className={cn('rounded-xl border bg-bg-secondary', isOpen ? 'border-brand-red/50' : 'border-border-sub')}>
                  <button type="button" onClick={() => setOpenId(isOpen ? null : e.id)} className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left">
                    <span className="min-w-0 flex-1 basis-full sm:basis-0">
                      <span className="block text-[13px] font-semibold text-text-primary break-words">{e.subject}</span>
                      <span className="block text-[12px] text-text-muted break-words">To {e.to} · {when(e.at)}{e.sentBy ? ` · by ${e.sentBy}` : ''}{e.related?.label ? ` · ${e.related.label}` : ''}</span>
                    </span>
                    <span className="rounded-full border border-border-sub px-2 py-0.5 text-[11px] text-text-muted">{KIND_LABEL[e.kind] || e.kind}</span>
                    <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                      e.status === 'sent' ? 'border-text-green/40 text-text-green' : 'border-brand-red/40 text-brand-red')}>
                      {e.status === 'sent' ? 'Sent' : 'Failed'}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-border-sub px-4 py-3 space-y-2 text-[12px]">
                      <div className="grid gap-1 text-text-muted">
                        <p><span className="text-text-secondary">From:</span> {e.from}</p>
                        {e.replyTo && <p><span className="text-text-secondary">Reply-to:</span> {e.replyTo}</p>}
                        <p><span className="text-text-secondary">To:</span> {e.to}</p>
                        <p><span className="text-text-secondary">Subject:</span> {e.subject}</p>
                        {e.error && <p className="text-brand-red break-words">Error: {e.error}</p>}
                      </div>
                      <pre className="whitespace-pre-wrap break-words rounded-lg border border-border-sub bg-bg-primary p-3 font-sans text-[13px] text-text-primary">{e.text}</pre>
                    </div>
                  )}
                </div>
              );
            })}
            <ListPager pager={pager} noun="emails" />
          </div>
        )}
    </div>
  );
}
