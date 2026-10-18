'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/auth-context';
import { useDirectory } from '@/hooks/use-directory';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type DM = { id: string; senderId: string; body?: string; imageUrls?: string[]; timestamp: string; read?: boolean; readBy?: string[] };

const MESSAGING_PATH: Record<string, string> = {
  admin: '/admin/messaging',
  tech: '/tech/messaging',
  client: '/client/messaging',
};
const RECENT = 5;

/**
 * Top-bar messages icon: unread count, and a small list of the most recent
 * messages sent to you with a link to the full Messages page. Hidden in
 * portals without a Messages page (sales).
 */
export function MessagesMenu() {
  const pathname = usePathname();
  const { user } = useAuth();
  const portal = pathname.startsWith('/admin') ? 'admin' : pathname.startsWith('/tech') ? 'tech' : pathname.startsWith('/client') ? 'client' : '';
  const href = MESSAGING_PATH[portal];
  const [received, setReceived] = useState<DM[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user?.id || !href) return;
    return onSnapshot(query(collection(db, 'messages'), where('receiverId', '==', user.id)),
      snap => setReceived(snap.docs.map(d => ({ ...d.data(), id: d.id } as DM))),
      () => setReceived([]));
  }, [user?.id, href]);

  const isUnread = (m: DM) => !m.read && !(m.readBy || []).includes(user?.id || '');
  const unread = received.filter(isUnread).length;
  const recent = useMemo(() => [...received]
    .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
    .slice(0, RECENT), [received]);

  if (!href) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 text-text-muted hover:text-text-primary"
          aria-label={`Messages${unread ? ` — ${unread} unread` : ''}`}>
          <MessageSquare size={18} aria-hidden="true" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1 rounded-full bg-brand-red text-[10px] font-semibold leading-4 text-white text-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[20rem] max-w-[calc(100vw-2rem)] p-0 bg-bg-elevated border-border-main overflow-hidden">
        <div className="px-4 py-3 border-b border-border-sub flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-text-primary">Messages</h3>
          {unread > 0 && <span className="text-[12px] text-text-muted">{unread} unread</span>}
        </div>
        {open && <RecentList recent={recent} isUnread={isUnread} href={href} onPick={() => setOpen(false)} />}
        <Link href={href} onClick={() => setOpen(false)}
          className="block px-4 py-2.5 border-t border-border-sub text-center text-[13px] font-medium text-brand-red hover:bg-bg-tertiary">
          View all messages
        </Link>
      </PopoverContent>
    </Popover>
  );
}

// Mounted only while the menu is open, so the name lookup isn't loaded on every page.
function RecentList({ recent, isUnread, href, onPick }: { recent: DM[]; isUnread: (m: DM) => boolean; href: string; onPick: () => void }) {
  const people = useDirectory();
  const nameOf = (id: string) => people.find(p => p.id === id)?.name || 'Someone';
  if (recent.length === 0) {
    return <p className="px-4 py-8 text-center text-[13px] text-text-muted">No messages yet.</p>;
  }
  return (
    <div className="divide-y divide-border-sub">
      {recent.map(m => (
        <Link key={m.id} href={href} onClick={onPick} className="flex gap-3 px-4 py-2.5 hover:bg-bg-tertiary">
          <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', isUnread(m) ? 'bg-brand-red' : 'bg-transparent')} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className={cn('truncate text-[13px]', isUnread(m) ? 'font-semibold text-text-primary' : 'text-text-secondary')}>{nameOf(m.senderId)}</span>
              <span className="shrink-0 text-[11px] text-text-muted">{ago(m.timestamp)}</span>
            </span>
            <span className="block truncate text-[12px] text-text-muted">{m.body || (m.imageUrls?.length ? 'Photo' : '')}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function ago(ts: string): string {
  try { return formatDistanceToNowStrict(parseISO(ts), { addSuffix: true }); } catch { return ''; }
}
