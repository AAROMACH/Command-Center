'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Bell, AlertTriangle, CheckCircle2, Eye, Lock, ArrowUpDown, SlidersHorizontal, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { format, parseISO, isAfter, isToday } from 'date-fns';
import type { AdminMessage } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useAuth } from '@/contexts/auth-context';
import { entityHref } from '@/lib/notification-links';
import {
  CATEGORIES, SORT_OPTIONS, categoryForTitle, categoryStyle, countByCategory, sortNotifications,
  type NotificationCategory, type NotificationSort,
} from '@/lib/notification-categories';

/**
 * `compact`: the small icon used in the top bar on every page (no latest-alert
 * preview next to it).
 */
export function NotificationBell({ compact = false }: { compact?: boolean } = {}) {
  const pathname = usePathname();
  const { toast } = useToast();
  const { user } = useAuth();
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [firestoreBroadcasts, setFirestoreBroadcasts] = useState<AdminMessage[]>([]);
  // Personal alerts (CRM digest, quote answers, hand-offs…) — the in-app
  // 'push' record /api/notify writes for every recipient.
  const [personal, setPersonal] = useState<AdminMessage[]>([]);
  // Where each personal alert opens (its job / project / request / lead).
  const [links, setLinks] = useState<Record<string, string>>({});
  // Recent tab: this portal's alerts from the last 30 days, read ones included.
  const [recent, setRecent] = useState<{ id: string; title: string; body: string; timestamp: string; read: boolean; href: string | null; category: NotificationCategory }[]>([]);
  const [view, setView] = useState<'unread' | 'recent'>('unread');
  const router = useRouter();

  // The portal being viewed. Someone with several portals (a super admin who
  // also works jobs) sees only that portal's alerts here.
  const portal = portalOf(pathname);

  useEffect(() => {
    if (!user?.id) return;
    const q = query(collection(db, 'notifications'), where('userId', '==', user.id));
    return onSnapshot(q, (snap) => {
      const mine = snap.docs.map(d => d.data())
        .filter(n => n.type === 'push' && notificationPortals(n).includes(portal));
      const cutoff = Date.now() - 30 * 86_400_000;
      setRecent(mine
        .filter(n => new Date(n.timestamp).getTime() >= cutoff)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 30)
        .map(n => ({
          id: String(n.id), title: String(n.title || '').replace(/^\[AAROMACH\]\s*/, ''), body: String(n.body || ''),
          timestamp: n.timestamp, read: !!n.read, href: entityHref(portal, n.relatedEntityType, n.relatedEntityId),
          category: categoryForTitle(String(n.title || '')),
        })));
      const unread = mine.filter(n => !n.read);
      setLinks(Object.fromEntries(unread
        .map(n => [`notif:${n.id}`, entityHref(portal, n.relatedEntityType, n.relatedEntityId)])
        .filter(([, href]) => !!href)));
      setPersonal(unread
        .map(n => ({
          id: `notif:${n.id}`,
          subject: String(n.title || '').replace(/^\[AAROMACH\]\s*/, ''),
          body: n.body,
          type: /approved|won|new project/i.test(n.title) ? 'success' : /rejected|stale|overdue|dispute/i.test(`${n.title} ${n.body}`) ? 'warning' : 'info',
          timestamp: n.timestamp,
          targetPortal: 'all',
          senderName: 'Command Center',
        } as AdminMessage)));
    }, () => setPersonal([]));
  }, [user?.id, portal]);
  const [open, setOpen] = useState(false);
  // "View all" expands the popover list past the 3 most recent.
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<NotificationSort>('newest');
  // Empty = every kind. Filtering by kind is how you read one thread of
  // alerts ("just the pay ones") without wading through the rest.
  const [cats, setCats] = useState<Set<NotificationCategory>>(new Set());
  const [panel, setPanel] = useState<'sort' | 'filter' | null>(null);
  useEffect(() => {
    if (!open) { setShowAll(false); setView('unread'); setPanel(null); setCats(new Set()); setSort('newest'); }
  }, [open]);
  // "Unread first" means nothing on a list that is only unread.
  useEffect(() => { if (view === 'unread' && sort === 'unread') setSort('newest'); }, [view, sort]);

  const toggleCat = (id: NotificationCategory) => setCats(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const keep = <T extends { category: NotificationCategory }>(list: T[]) =>
    cats.size ? list.filter(n => cats.has(n.category)) : list;

  // Listen to Firestore broadcasts in real-time
  useEffect(() => {
    const currentPortal = portal;
    const q = query(collection(db, 'broadcasts'));
    const unsub = onSnapshot(q, (snap) => {
        const now = new Date();
        const docs = snap.docs
            .map(d => ({ ...d.data(), id: d.id } as AdminMessage & { revoked?: boolean }))
            .filter(m => {
                const matchesPortal = m.targetPortal === 'all' || m.targetPortal === currentPortal;
                const isNotRevoked = !m.revoked;
                const isNotExpired = !m.expiresAt || isAfter(parseISO(m.expiresAt), now);
                return matchesPortal && isNotRevoked && isNotExpired;
            });
        setFirestoreBroadcasts(docs);
    });
    return () => unsub();
  }, [portal]);

  const fetchMessages = useCallback(() => {
    const currentPortal = portal;
    const now = new Date();

    // 1. Load Broadcast Ledger (Custom messages from same device/session)
    let storedMessages: AdminMessage[] = [];
    try {
        const json = localStorage.getItem('aaromach_broadcast_ledger');
        if (json) storedMessages = JSON.parse(json);
    } catch (e) {}

    // 2. Cleared Registry — the user's synced acknowledgments (Firestore) merged
    //    with any legacy local-only ones, so a dismissal on one device applies
    //    on all of them.
    let clearedIds: string[] = [...(user?.acknowledgedBroadcastIds || [])];
    try {
        const clearedJson = localStorage.getItem('aaromach_cleared_messages');
        if (clearedJson) clearedIds = Array.from(new Set([...clearedIds, ...JSON.parse(clearedJson)]));
    } catch (e) {}

    // 3. Load Revoked Registry (Pulled by Admin for all)
    let revokedIds: string[] = [];
    try {
        const revokedJson = localStorage.getItem('aaromach_revoked_messages');
        if (revokedJson) revokedIds = JSON.parse(revokedJson);
    } catch (e) {}

    // Merge localStorage broadcasts with Firestore broadcasts (deduplicate by id)
    // (Demo messages from lib/data used to be mixed in here — real ones only now.)
    const allMessages = [...personal, ...firestoreBroadcasts, ...storedMessages];

    // Filter by Portal AND verify not cleared AND not revoked AND not expired
    const filtered = allMessages.filter(m => {
        const matchesPortal = (m.targetPortal === 'all' || m.targetPortal === currentPortal);
        const isNotCleared = !clearedIds.includes(m.id);
        const isNotRevoked = !revokedIds.includes(m.id);
        const isNotExpired = !m.expiresAt || isAfter(parseISO(m.expiresAt), now);

        return matchesPortal && isNotCleared && isNotRevoked && isNotExpired;
    });

    // Deduplicate and Sort
    const unique = Array.from(new Map(filtered.map(m => [m.id, m])).values());
    const sorted = unique.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    setMessages(sorted);
  }, [portal, firestoreBroadcasts, personal, user?.acknowledgedBroadcastIds]);

  useEffect(() => {
    fetchMessages();
    // Poll for expiry every minute
    const interval = setInterval(fetchMessages, 60000);
    window.addEventListener('storage', fetchMessages);
    return () => {
        window.removeEventListener('storage', fetchMessages);
        clearInterval(interval);
    };
  }, [fetchMessages]);

  const handleClearMessage = (id: string, subject: string) => {
    if (id.startsWith('notif:')) {
      updateDoc(doc(db, 'notifications', id.slice(6)), { read: true }).catch(() => {});
      setPersonal(prev => prev.filter(m => m.id !== id));
      return;
    }
    // Persist per-user in Firestore so the acknowledgment syncs across devices.
    if (user?.id) {
        updateDoc(doc(db, 'users', user.id), { acknowledgedBroadcastIds: arrayUnion(id) })
            .catch(() => { /* fall back to local-only below */ });
    }
    // Also keep a local copy so it clears instantly and still works if the write
    // is offline or the user record is unavailable.
    let clearedIds: string[] = [];
    try {
        const clearedJson = localStorage.getItem('aaromach_cleared_messages');
        if (clearedJson) clearedIds = JSON.parse(clearedJson);
    } catch (e) {}
    if (!clearedIds.includes(id)) {
        clearedIds.push(id);
        localStorage.setItem('aaromach_cleared_messages', JSON.stringify(clearedIds));
    }
    fetchMessages();
    toast({
        title: "Dismissed",
        description: `"${subject}" cleared.`,
    });
  };

  // A 'critical' broadcast is an admin shouting on purpose — it keeps the red
  // warning treatment. Everything else is coloured and iconed by its kind, so
  // pay, jobs and messages are telling apart at a glance.
  const getIcon = (type: string) => (type === 'critical' ? AlertTriangle : Bell);
  const tileFor = (type: string, category: NotificationCategory) =>
    type === 'critical'
      ? 'bg-brand-red-dim text-text-red border-brand-red/30'
      : categoryStyle(category).tile;
  const iconFor = (type: string, category: NotificationCategory) =>
    type === 'critical' ? AlertTriangle : categoryStyle(category).Icon;

  // Every alert's kind comes from its title (lib/notification-categories), so
  // this works on records written before categories existed.
  const tagged = useMemo(
    () => messages.map(m => ({ ...m, category: categoryForTitle(m.subject || '') })),
    [messages],
  );
  const shownUnread = useMemo(() => sortNotifications(keep(tagged), sort), [tagged, sort, cats]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownRecent = useMemo(() => sortNotifications(keep(recent), sort), [recent, sort, cats]); // eslint-disable-line react-hooks/exhaustive-deps
  // Counts come from the whole list, not the filtered one, so the filter
  // panel always says how many of each kind there are to switch to.
  const counts = useMemo(() => countByCategory(view === 'recent' ? recent : tagged), [recent, tagged, view]);
  const sortLabel = SORT_OPTIONS.find(o => o.id === sort)?.label || 'Newest first';
  // Narrowing to a kind is itself a request to see them all.
  const expanded = showAll || cats.size > 0;

  const latest = messages[0];
  const LatestIcon = latest ? getIcon(latest.type) : Bell;

  return (
    <div className="flex items-center gap-2">
      {/* Always-visible preview of the most recent broadcast, so users see it on
          open without having to notice the blinking alert dot. Opens the full
          list on click. */}
      {latest && !compact && (
        <button
          onClick={() => setOpen(true)}
          aria-label={`Latest alert: ${latest.subject}. Open all alerts.`}
          className={cn(
            'hidden md:flex items-center gap-2 h-10 max-w-[280px] rounded-lg border pl-2.5 pr-3 transition-colors text-left',
            latest.type === 'critical' ? 'border-brand-red/40 bg-brand-red-dim/40 hover:bg-brand-red-dim/60 animate-pulse'
              : latest.type === 'warning' ? 'border-accent-gold/40 bg-accent-gold-dim/40 hover:bg-accent-gold-dim/60'
              : latest.type === 'success' ? 'border-green-border/40 bg-green-dim/40 hover:bg-green-dim/60'
              : 'border-border-main bg-bg-secondary hover:bg-bg-tertiary',
          )}
        >
          <LatestIcon size={14} className={cn('shrink-0',
            latest.type === 'critical' ? 'text-text-red'
              : latest.type === 'warning' ? 'text-accent-gold'
              : latest.type === 'success' ? 'text-text-green'
              : 'text-text-muted',
          )} />
          <span className="min-w-0 flex flex-col leading-tight">
            <span className="text-[12px] font-semibold text-text-primary truncate">{latest.subject}</span>
            <span className="text-[11px] text-text-muted truncate">{latest.body}</span>
          </span>
          {messages.length > 1 && (
            <span className="shrink-0 ml-0.5 h-5 min-w-5 px-1.5 rounded-full bg-bg-primary border border-border-sub text-[11px] font-semibold text-text-muted flex items-center justify-center">
              +{messages.length - 1}
            </span>
          )}
        </button>
      )}

    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {compact ? (
        <Button variant="ghost" size="icon" className="relative h-9 w-9 text-text-muted hover:text-text-primary"
          aria-label={`Notifications${messages.length > 0 ? ` — ${messages.length} unread` : ''}`}>
          <Bell size={18} aria-hidden="true" />
          {messages.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1 rounded-full bg-brand-red text-[10px] font-semibold leading-4 text-white text-center">
              {messages.length > 9 ? '9+' : messages.length}
            </span>
          )}
        </Button>
        ) : (
        <Button
          variant="outline"
          aria-label={`Notifications${messages.length > 0 ? ` — ${messages.length} unread` : ''}`}
          className="relative h-10 gap-2 border-border-main bg-bg-secondary px-3 group"
        >
          <Bell size={18} className="text-text-muted group-hover:text-brand-red transition-colors" aria-hidden="true" />
          <span className="hidden sm:inline text-[13px] font-medium text-text-muted group-hover:text-text-primary">
            Alerts
          </span>
          {messages.length > 0 && (
            <div
              className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand-red ring-2 ring-bg-secondary"
              aria-hidden="true"
            />
          )}
        </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] max-w-[calc(100vw-2rem)] p-0 bg-bg-elevated border-border-main shadow-md overflow-hidden" align="end">
        <div className="relative border-b border-border-sub">
          <div className="px-4 pt-3 pb-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[14px] font-semibold text-text-primary">Notifications</h3>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPanel(p => (p === 'sort' ? null : 'sort'))}
                    aria-expanded={panel === 'sort'} aria-label={`Sort: ${sortLabel}`} title={`Sort: ${sortLabel}`}
                    className={cn('inline-flex h-8 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors',
                      panel === 'sort' ? 'border-brand-red/40 bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-muted hover:text-text-primary')}>
                  <ArrowUpDown size={13} /> Sort
                </button>
                <button type="button" onClick={() => setPanel(p => (p === 'filter' ? null : 'filter'))}
                    aria-expanded={panel === 'filter'} aria-label="Filter by kind"
                    className={cn('inline-flex h-8 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors',
                      panel === 'filter' || cats.size ? 'border-brand-red/40 bg-brand-red/10 text-brand-red' : 'border-border-sub text-text-muted hover:text-text-primary')}>
                  <SlidersHorizontal size={13} /> {cats.size ? `${cats.size} kind${cats.size > 1 ? 's' : ''}` : 'Filter'}
                </button>
              </div>
            </div>
            <div className="tabs flex-nowrap" role="tablist">
                {([['unread', `Unread${messages.length ? ` (${messages.length})` : ''}`], ['recent', 'Recent']] as const).map(([v, label]) => (
                    <button key={v} type="button" role="tab" aria-selected={view === v}
                        className={cn('tab flex-1 text-center', view === v && 'active')} onClick={() => setView(v)}>{label}</button>
                ))}
            </div>
            {/* What's filtered, with one tap to drop each kind. */}
            {cats.size > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {CATEGORIES.filter(c => cats.has(c.id)).map(c => (
                  <button key={c.id} type="button" onClick={() => toggleCat(c.id)}
                      aria-label={`Stop filtering by ${c.label}`}
                      className={cn('inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[11px] font-medium', c.chip)}>
                    <c.Icon size={11} /> {c.label} <X size={11} />
                  </button>
                ))}
                <button type="button" onClick={() => setCats(new Set())}
                    className="text-[11px] font-medium text-text-muted hover:text-text-primary underline">Clear</button>
              </div>
            )}
          </div>

          {/* Mini pop-ups over the list: how it's sorted, and which kinds to show. */}
          {panel === 'sort' && (
            <div className="absolute left-0 right-0 top-full z-20 border-b border-border-main bg-bg-elevated p-1.5 shadow-md" role="menu">
              {SORT_OPTIONS.filter(o => !('recentOnly' in o && o.recentOnly) || view === 'recent').map(o => (
                <button key={o.id} type="button" role="menuitemradio" aria-checked={sort === o.id}
                    onClick={() => { setSort(o.id); setPanel(null); }}
                    className={cn('flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-[12px] transition-colors',
                      sort === o.id ? 'bg-brand-red/10 font-semibold text-brand-red' : 'text-text-secondary hover:bg-bg-tertiary/60 hover:text-text-primary')}>
                  {o.label}
                  {sort === o.id && <Check size={13} />}
                </button>
              ))}
            </div>
          )}
          {panel === 'filter' && (
            <div className="absolute left-0 right-0 top-full z-20 border-b border-border-main bg-bg-elevated p-1.5 shadow-md">
              <div className="flex items-center justify-between px-2 pb-1 pt-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Show these kinds</span>
                {cats.size > 0 && (
                  <button type="button" onClick={() => setCats(new Set())}
                      className="text-[11px] font-medium text-brand-red hover:underline">All</button>
                )}
              </div>
              {CATEGORIES.map(c => {
                const on = cats.has(c.id);
                return (
                  <button key={c.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggleCat(c.id)}
                      className={cn('flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] transition-colors',
                        on ? 'bg-brand-red/10 font-semibold text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary/60')}>
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', c.dot)} />
                    <c.Icon size={13} className="shrink-0 text-text-muted" />
                    <span className="flex-1">{c.label}</span>
                    <span className="text-[11px] text-text-muted">{counts[c.id] || 0}</span>
                    {on && <Check size={13} className="text-brand-red" />}
                  </button>
                );
              })}
              <p className="px-2.5 pb-1 pt-1.5 text-[11px] text-text-muted">
                Pick nothing to see every kind. Change which of these reach your phone in Settings → Notifications.
              </p>
            </div>
          )}
        </div>
        {view === 'recent' ? (
            <div className="max-h-[min(480px,65vh)] overflow-y-auto overscroll-contain divide-y divide-border-sub">
                {shownRecent.length === 0 ? (
                    <p className="px-4 py-8 text-center text-[13px] text-text-muted">
                        {recent.length ? 'Nothing of these kinds in the last 30 days.' : 'Nothing in the last 30 days.'}
                    </p>
                ) : shownRecent.map(n => (
                    <button key={n.id} type="button"
                        onClick={() => {
                            if (!n.read) updateDoc(doc(db, 'notifications', n.id), { read: true }).catch(() => {});
                            if (n.href) { setOpen(false); router.push(n.href); }
                        }}
                        className={cn('w-full flex gap-3 px-4 py-2.5 text-left hover:bg-bg-tertiary/50', n.href ? 'cursor-pointer' : 'cursor-default')}>
                        {(() => {
                            const c = categoryStyle(n.category);
                            return (
                                <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border', c.tile, n.read && 'opacity-60')}
                                    title={c.label} aria-label={c.label}>
                                    <c.Icon size={13} />
                                </span>
                            );
                        })()}
                        <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                                <span className="flex min-w-0 items-center gap-1.5">
                                    {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-red" aria-label="Unread" />}
                                    <span className={cn('text-[13px] leading-tight line-clamp-1', n.read ? 'text-text-secondary' : 'font-semibold text-text-primary')}>{n.title}</span>
                                </span>
                                <span className="shrink-0 text-[11px] text-text-muted">{stampLabel(n.timestamp)}</span>
                            </span>
                            <span className="block text-[12px] text-text-muted line-clamp-2">{n.body}</span>
                        </span>
                    </button>
                ))}
            </div>
        ) : (<>
        <div className={cn('overflow-y-auto overscroll-contain', expanded ? 'max-h-[min(480px,65vh)]' : 'max-h-[360px]')}>
            {shownUnread.length > 0 ? (
                <div className="divide-y divide-border-sub">
                    {(expanded ? shownUnread : shownUnread.slice(0, 3)).map((msg) => {
                        const Icon = iconFor(msg.type, msg.category);
                        return (
                            <div key={msg.id}
                                onClick={links[msg.id] ? () => { setOpen(false); handleClearMessage(msg.id, msg.subject); router.push(links[msg.id]); } : undefined}
                                className={cn("px-4 py-3 hover:bg-bg-tertiary/50 transition-colors group relative pr-12", links[msg.id] ? 'cursor-pointer' : 'cursor-default')}>
                                <div className="flex gap-3">
                                    <div className={cn('p-2 rounded-lg shrink-0 h-fit border transition-colors', tileFor(msg.type, msg.category))}
                                        title={categoryStyle(msg.category).label}>
                                        <Icon size={14} />
                                    </div>
                                    <div className="space-y-0.5 min-w-0 flex-1">
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <p className="text-[13px] font-semibold text-text-primary leading-tight line-clamp-1">{msg.subject}</p>
                                                {msg.isLocked && <Lock size={11} className="text-brand-red shrink-0" />}
                                            </div>
                                            <span className="text-[11px] text-text-muted whitespace-nowrap">{stampLabel(msg.timestamp)}</span>
                                        </div>
                                        <p className="text-[12px] text-text-secondary leading-relaxed line-clamp-2 text-left">{msg.body}</p>
                                        {msg.senderName && (
                                            <p className="text-[11px] text-text-muted pt-0.5">From {msg.senderName}</p>
                                        )}
                                    </div>
                                </div>
                                
                                {/* Acknowledge / Seen Button - Only show if not locked */}
                                {!msg.isLocked && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleClearMessage(msg.id, msg.subject); }}
                                        aria-label={`Mark as read: ${msg.subject}`}
                                        title="Mark as read"
                                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-all md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-brand-red"
                                    >
                                        <Eye size={16} aria-hidden="true" />
                                    </button>
                                )}

                                {msg.isLocked && (
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-text-muted/60" title="Pinned by an admin — can't be dismissed">
                                        <Lock size={16} />
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="px-6 py-10 text-center space-y-2">
                    <CheckCircle2 size={24} className="mx-auto text-text-green/60" />
                    {messages.length ? (<>
                        <p className="text-[13px] font-medium text-text-primary">Nothing unread of these kinds</p>
                        <button type="button" onClick={() => setCats(new Set())} className="text-[12px] font-medium text-brand-red hover:underline">
                            Show all {messages.length} unread
                        </button>
                    </>) : (<>
                        <p className="text-[13px] font-medium text-text-primary">You&apos;re all caught up</p>
                        <p className="text-[12px] text-text-muted">New alerts and messages will show up here.</p>
                    </>)}
                </div>
            )}
        </div>
        {shownUnread.length > 3 && (
            <div className="px-4 py-2 border-t border-border-sub flex items-center justify-between gap-2">
                <p className="text-[12px] text-text-muted">
                    {expanded ? `Showing all ${shownUnread.length}` : `Showing 3 of ${shownUnread.length}`}
                </p>
                <button
                    type="button"
                    onClick={() => (expanded ? (setShowAll(false), setCats(new Set())) : setShowAll(true))}
                    className="text-[12px] font-medium text-brand-red hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red rounded-sm"
                >
                    {expanded ? 'Show less' : 'View all'}
                </button>
            </div>
        )}
        </>)}
      </PopoverContent>
    </Popover>
    </div>
  );
}

/** "3:15 PM" for today, "Oct 14" for anything older. */
function stampLabel(ts: string): string {
  try {
    const d = parseISO(ts);
    if (isNaN(d.getTime())) return '';
    return isToday(d) ? format(d, 'h:mm a') : format(d, 'MMM d');
  } catch { return ''; }
}

type Portal = 'admin' | 'tech' | 'client' | 'sales';
const PORTALS: Portal[] = ['admin', 'tech', 'client', 'sales'];

/** /admin → admin, /tech → tech, /client → client, /sales → sales. */
function portalOf(pathname: string): Portal {
  if (pathname.startsWith('/tech')) return 'tech';
  if (pathname.startsWith('/client')) return 'client';
  if (pathname.startsWith('/sales')) return 'sales';
  return 'admin';
}

// Titles of alerts written before records carried a portal, by where they
// belong. Anything not listed shows in every portal so no old alert is lost.
const LEGACY_ADMIN = /status alert|job completed|payroll dispute|deal won|urgent intake|sold project|waiting on kickoff/i;
const LEGACY_TECH = /new job assigned|added to a project|tasks? assigned to you|crew (checked|updated)|task completed|project tasks complete|document added|project (status changed|closed)/i;

/** Which portals' bells show this notification record. */
function notificationPortals(n: Record<string, any>): Portal[] {
  if (PORTALS.includes(n.portal)) return [n.portal];
  const title = String(n.title || '');
  if (LEGACY_ADMIN.test(title)) return ['admin'];
  if (LEGACY_TECH.test(title)) return ['tech'];
  if (/new assignment staged/i.test(title)) return ['client'];
  if (n.relatedEntityType === 'lead') return ['sales', 'admin'];
  return PORTALS;
}

/** The page a notification's linked record opens in the viewer's portal. */
