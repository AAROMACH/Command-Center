'use client';

import { useState, useEffect } from 'react';
import { Bell, Info, AlertTriangle, Clock, Play, FileCheck, CalendarCheck, FileWarning, Briefcase, ClipboardList, CheckCircle2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePathname } from 'next/navigation';
import { adminMessages } from '@/lib/data';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

export function NotificationBell() {
  const pathname = usePathname();
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    const currentPortal = pathname.includes('/tech') ? 'tech' : pathname.includes('/client') ? 'client' : 'admin';
    const filtered = adminMessages.filter(m => m.targetPortal === 'all' || m.targetPortal === currentPortal);
    
    // Sort by timestamp descending
    const sorted = [...filtered].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setMessages(sorted);
  }, [pathname]);

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
            Command Comms
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
                            <div key={msg.id} className="p-4 hover:bg-bg-tertiary cursor-default transition-all group">
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
                                            <p className="text-[10px] font-bold text-text-primary uppercase tracking-wide leading-tight line-clamp-1">{msg.subject}</p>
                                            <span className="text-[8px] text-text-muted font-mono whitespace-nowrap">{format(parseISO(msg.timestamp), 'HH:mm')}</span>
                                        </div>
                                        <p className="text-[9px] text-text-secondary leading-relaxed uppercase font-medium line-clamp-2">{msg.body}</p>
                                        <div className="flex items-center gap-1.5 pt-1.5 opacity-60">
                                            <div className="h-4 w-4 rounded-full bg-bg-tertiary border border-border-sub flex items-center justify-center text-[7px] font-bold">
                                                {msg.senderName.charAt(0)}
                                            </div>
                                            <span className="text-[8px] text-text-muted font-bold uppercase tracking-widest">Admin: {msg.senderName}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="p-12 text-center space-y-2">
                    <Info size={24} className="mx-auto text-text-muted opacity-20" />
                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-[0.2em]">No official messages</p>
                </div>
            )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
