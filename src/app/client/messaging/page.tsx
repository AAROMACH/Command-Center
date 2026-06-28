'use client';

import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import type { Technician, Project } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Send, ShieldCheck, Briefcase } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

type DirectMessage = {
  id: string;
  senderId: string;
  receiverId: string;
  body: string;
  timestamp: string;
  read: boolean;
};

const ADMIN_ID = 'admin';

export default function ClientMessagingPage() {
  const [currentUser, setCurrentUser] = useState<Technician | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const userId = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('currentUserId') : null;
      if (userId) {
        const me = snap.docs.find(d => d.id === userId);
        if (me) setCurrentUser({ ...me.data(), id: me.id } as Technician);
      }
    });

    const unsubMsgs = onSnapshot(collection(db, 'messages'), (snap) => {
      setMessages(snap.docs.map(d => ({ ...d.data(), id: d.id } as DirectMessage)));
    });

    const unsubProjects = onSnapshot(collection(db, 'projects'), (snap) => {
      setAllProjects(snap.docs.map(d => ({ ...d.data(), id: d.id } as Project)));
    });

    return () => { unsubUsers(); unsubMsgs(); unsubProjects(); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const myId = currentUser?.id || '';

  const activeProjects = allProjects.filter(p =>
    p.status !== 'completed' &&
    currentUser?.clientCompany &&
    p.client === currentUser.clientCompany
  );

  const thread = messages
    .filter(m =>
      (m.senderId === myId && m.receiverId === ADMIN_ID) ||
      (m.receiverId === myId && m.senderId === ADMIN_ID)
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const handleSend = async () => {
    if (!body.trim() || !myId) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'messages'), {
        senderId: myId,
        receiverId: ADMIN_ID,
        body: body.trim(),
        timestamp: new Date().toISOString(),
        read: false,
      });
      setBody('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="page-header">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2">
            <MessageSquare size={12} />
            Client Portal
          </p>
          <h1 className="page-title">Messages</h1>
          <p className="page-subtitle">Direct messages with your account manager.</p>
        </div>
      </header>

      {/* Active Projects */}
      {activeProjects.length > 0 && (
        <div className="space-y-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
            <Briefcase size={10} className="text-brand-red" />
            Your Active Projects ({activeProjects.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {activeProjects.map(p => (
              <div key={p.id} className="px-3 py-2.5 rounded-lg border border-border-sub bg-bg-secondary hover:border-border-main transition-colors">
                <p className="text-[8px] font-black uppercase tracking-widest text-text-muted mb-0.5">{p.status}</p>
                <p className="text-[11px] font-bold text-text-primary leading-tight">{p.name}</p>
                <p className="text-[9px] text-text-muted mt-0.5 truncate">{p.location}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col h-[calc(100vh-220px)] min-h-[500px] border border-border-sub rounded-xl overflow-hidden bg-bg-secondary">
        {/* Header */}
        <div className="border-b border-border-sub px-4 py-2.5 flex items-center gap-2 bg-bg-tertiary/40 shrink-0">
          <ShieldCheck size={12} className="text-brand-red" />
          <span className="text-[11px] font-black uppercase tracking-widest text-text-primary">Aaromach Admin</span>
          <span className="ml-auto text-[8px] font-bold text-text-green uppercase tracking-widest">Active</span>
        </div>

        {/* Thread */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-3">
            {thread.length === 0 ? (
              <div className="py-16 text-center">
                <MessageSquare size={24} className="text-text-muted mx-auto mb-2" />
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                  No messages yet — say hello!
                </p>
              </div>
            ) : (
              thread.map(msg => {
                const isMe = msg.senderId === myId;
                return (
                  <div key={msg.id} className={cn('flex', isMe ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      'max-w-[70%] px-3 py-2 rounded-xl',
                      isMe
                        ? 'bg-brand-red text-white rounded-tr-sm'
                        : 'bg-bg-tertiary border border-border-sub text-text-primary rounded-tl-sm'
                    )}>
                      {!isMe && (
                        <p className="text-[8px] font-black uppercase tracking-widest text-brand-red mb-1">Admin</p>
                      )}
                      <p className="text-[11px] leading-relaxed">{msg.body}</p>
                      <p className={cn('text-[8px] mt-1 font-mono', isMe ? 'text-white/60' : 'text-text-muted')}>
                        {msg.timestamp ? format(parseISO(msg.timestamp), 'MMM d, h:mm a') : ''}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Compose */}
        <div className="border-t border-border-sub p-3 flex items-center gap-2 bg-bg-primary shrink-0">
          <Input
            className="flex-1 h-9 text-[11px] bg-bg-secondary border-border-main"
            placeholder="Message your account manager..."
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
          <Button
            size="sm"
            className="h-9 bg-brand-red hover:bg-brand-red/90 text-white shrink-0"
            onClick={handleSend}
            disabled={sending || !body.trim()}
          >
            <Send size={13} />
          </Button>
        </div>
      </div>
    </div>
  );
}
