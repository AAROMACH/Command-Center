'use client';

import { useState, useEffect } from 'react';
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

export function NotificationBell() {
  const pathname = usePathname();
  const { toast } = useToast();
  const [messages, setMessages] = useState<AdminMessage[]>([]);

  const fetchMessages = () => {
    const currentPortal = pathname.includes('/tech') ? 'tech' : pathname.includes('/client') ? 'client' : 'admin';
    const now = new Date();
    
    // 1. Load Broadcast Ledger (Custom messages)
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

    const allMessages = [...storedMessages, ...initialMessages];
    
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
  };

  useEffect(() => {
    fetchMessages();
    // Poll for expiry every minute
    const interval = setInterval(fetchMessages, 60000);
    window.addEventListener('storage', fetchMessages);
    return () => {
        window.removeEventListener('storage', fetchMessages);
        clearInterval(interval);
    };
  }, [pathname]);

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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="relative h-10 gap-2 border-border-main bg-bg-secondary px-3 group">
          <Bell size={18} className="text-text-muted group-hover:text-brand-red transition-colors" />
          <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest text-text-muted group-hover:text-text-primary">
            Global Alert
          </span>
          {messages.length > 0 && (
            <div className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand-red border border-bg-primary shadow-[0_0_8px_rgba(204,34,0,0.6)]" />
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
                    {messages.map((msg) => {
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
                                        title="Acknowledge Directive"
                                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        <Eye size={16} />
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
      </PopoverContent>
    </Popover>
  );
}
