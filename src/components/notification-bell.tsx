'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, Info, AlertTriangle, Clock, CheckCircle2, Eye, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePathname } from 'next/navigation';
import { adminMessages as initialMessages } from '@/lib/data';
import { cn } from '@/lib/utils';
import { format, parseISO, isAfter } from 'date-fns';
import type { AdminMessage } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

export function NotificationBell() {
  const pathname = usePathname();
  const { toast } = useToast();
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [firestoreBroadcasts, setFirestoreBroadcasts] = useState<AdminMessage[]>([]);
  const [open, setOpen] = useState(false);

  // Listen to Firestore broadcasts in real-time
  useEffect(() => {
    const currentPortal = pathname.includes('/tech') ? 'tech' : pathname.includes('/client') ? 'client' : 'admin';
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
  }, [pathname]);

  const fetchMessages = useCallback(() => {
    const currentPortal = pathname.includes('/tech') ? 'tech' : pathname.includes('/client') ? 'client' : 'admin';
    const now = new Date();

    // 1. Load Broadcast Ledger (Custom messages from same device/session)
    let storedMessages: AdminMessage[] = [];
    try {
        const json = localStorage.getItem('aaromach_broadcast_ledger');
        if (json) storedMessages = JSON.parse(json);
    } catch (e) {}

    // 2. Load Cleared Registry (Seen by this user)
    let clearedIds: string[] = [];
    try {
        const clearedJson = localStorage.getItem('aaromach_cleared_messages');
        if (clearedJson) clearedIds = JSON.parse(clearedJson);
    } catch (e) {}

    // 3. Load Revoked Registry (Pulled by Admin for all)
    let revokedIds: string[] = [];
    try {
        const revokedJson = localStorage.getItem('aaromach_revoked_messages');
        if (revokedJson) revokedIds = JSON.parse(revokedJson);
    } catch (e) {}

    // Merge localStorage broadcasts with Firestore broadcasts (deduplicate by id)
    const allMessages = [...firestoreBroadcasts, ...storedMessages, ...initialMessages];

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
  }, [pathname, firestoreBroadcasts]);

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
    let clearedIds: string[] = [];
    try {
        const clearedJson = localStorage.getItem('aaromach_cleared_messages');
        if (clearedJson) clearedIds = JSON.parse(clearedJson);
    } catch (e) {}

    if (!clearedIds.includes(id)) {
        clearedIds.push(id);
        localStorage.setItem('aaromach_cleared_messages', JSON.stringify(clearedIds));
        fetchMessages();
        toast({
            title: "Directive Acknowledged",
            description: `Message "${subject}" cleared from active terminal.`,
        });
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'critical': return AlertTriangle;
      case 'warning': return Clock;
      case 'success': return CheckCircle2;
      default: return Info;
    }
  };

  const latest = messages[0];
  const LatestIcon = latest ? getIcon(latest.type) : Info;

  return (
    <div className="flex items-center gap-2">
      {/* Always-visible preview of the most recent broadcast, so users see it on
          open without having to notice the blinking alert dot. Opens the full
          list on click. */}
      {latest && (
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
            <span className="text-[9px] font-black uppercase tracking-wide text-text-primary truncate">{latest.subject}</span>
            <span className="text-[8px] text-text-muted uppercase tracking-widest truncate">{latest.body}</span>
          </span>
          {messages.length > 1 && (
            <span className="shrink-0 ml-0.5 h-4 min-w-4 px-1 rounded-full bg-bg-primary border border-border-sub text-[8px] font-mono font-bold text-text-muted flex items-center justify-center">
              +{messages.length - 1}
            </span>
          )}
        </button>
      )}

    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label={`Notifications${messages.length > 0 ? ` — ${messages.length} unread` : ''}`}
          className="relative h-10 gap-2 border-border-main bg-bg-secondary px-3 group"
        >
          <Bell size={18} className="text-text-muted group-hover:text-brand-red transition-colors" aria-hidden="true" />
          <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest text-text-muted group-hover:text-text-primary">
            Alerts
          </span>
          {messages.length > 0 && (
            <div
              className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand-red border border-bg-primary shadow-[0_0_8px_rgba(204,34,0,0.6)]"
              aria-hidden="true"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 bg-bg-elevated border-border-main shadow-2xl" align="end">
        <div className="p-4 border-b border-border-sub bg-bg-tertiary flex items-center justify-between">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-primary">Operational Message Center</h3>
            <Badge variant="outline" className="text-[8px] bg-bg-primary border-border-sub font-mono">{messages.length} Active</Badge>
        </div>
        <ScrollArea className="max-h-[350px]">
            {messages.length > 0 ? (
                <div className="divide-y divide-border-sub">
                    {messages.slice(0, 3).map((msg) => {
                        const Icon = getIcon(msg.type);
                        return (
                            <div key={msg.id} className="p-4 hover:bg-bg-tertiary/50 cursor-default transition-all group relative pr-12">
                                <div className="flex gap-4">
                                    <div className={cn(
                                        "p-2 rounded-lg shrink-0 h-fit transition-colors",
                                        msg.type === 'critical' ? "bg-brand-red-dim text-text-red border border-brand-red/30" :
                                        msg.type === 'warning' ? "bg-accent-gold-dim text-accent-gold border border-accent-gold/30" :
                                        msg.type === 'success' ? "bg-green-dim text-text-green border border-green-border/30" :
                                        "bg-bg-secondary text-text-secondary border border-border-sub"
                                    )}>
                                        <Icon size={14} />
                                    </div>
                                    <div className="space-y-1 min-w-0">
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="flex items-center gap-1.5">
                                                <p className="text-[10px] font-bold text-text-primary uppercase tracking-wide leading-tight line-clamp-1">{msg.subject}</p>
                                                {msg.isLocked && <Lock size={10} className="text-brand-red" />}
                                            </div>
                                            <span className="text-[8px] text-text-muted font-mono whitespace-nowrap">{format(parseISO(msg.timestamp), 'h:mm a')}</span>
                                        </div>
                                        <p className="text-[9px] text-text-secondary leading-relaxed uppercase font-medium line-clamp-2 text-left">{msg.body}</p>
                                        <div className="flex items-center gap-1.5 pt-1.5 opacity-60">
                                            <div className="h-4 w-4 rounded-full bg-bg-tertiary border border-border-sub flex items-center justify-center text-[7px] font-bold">
                                                {(msg.senderName || 'A').charAt(0)}
                                            </div>
                                            <span className="text-[8px] text-text-muted font-bold uppercase tracking-widest">Admin: {msg.senderName}</span>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Acknowledge / Seen Button - Only show if not locked */}
                                {!msg.isLocked && (
                                    <button
                                        onClick={() => handleClearMessage(msg.id, msg.subject)}
                                        aria-label={`Acknowledge: ${msg.subject}`}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-brand-red"
                                    >
                                        <Eye size={16} aria-hidden="true" />
                                    </button>
                                )}

                                {msg.isLocked && (
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-brand-red opacity-30" title="Locked Directive">
                                        <Lock size={16} />
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="p-12 text-center space-y-2">
                    <CheckCircle2 size={24} className="mx-auto text-text-green opacity-20" />
                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-[0.2em]">All directives acknowledged</p>
                </div>
            )}
        </ScrollArea>
        {messages.length > 3 && (
            <div className="p-2.5 border-t border-border-sub bg-bg-tertiary/50 text-center">
                <p className="text-[8px] font-bold text-text-muted uppercase tracking-[0.2em]">
                    Showing 3 most recent · {messages.length - 3} more active
                </p>
            </div>
        )}
      </PopoverContent>
    </Popover>
    </div>
  );
}
