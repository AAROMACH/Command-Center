'use client';

import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc, query, where } from 'firebase/firestore';
import type { Technician, Project } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Send, User, Briefcase } from 'lucide-react';
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

export default function TechMessagingPage() {
  const [currentUser, setCurrentUser] = useState<Technician | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>('admin');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const users = snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician));
      setTechnicians(users);
      const userId = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('currentUserId') : null;
      if (userId) {
        const me = users.find(t => t.id === userId);
        if (me) setCurrentUser(me);
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
  }, [messages, selectedContactId]);

  const myId = currentUser?.id || '';

  const activeProjects = allProjects.filter(p =>
    p.status !== 'completed' && myId && p.assignedTechnicianIds?.includes(myId)
  );

  const conversationPartners = (() => {
    const partnerIds = new Set<string>();
    partnerIds.add('admin');
    messages.forEach(m => {
      if (m.senderId === myId) partnerIds.add(m.receiverId);
      if (m.receiverId === myId) partnerIds.add(m.senderId);
    });
    return Array.from(partnerIds).filter(id => id !== myId);
  })();

  const thread = messages
    .filter(m =>
      (m.senderId === myId && m.receiverId === selectedContactId) ||
      (m.receiverId === myId && m.senderId === selectedContactId)
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const getContactLabel = (id: string) => {
    if (id === 'admin') return 'Admin';
    const u = technicians.find(t => t.id === id);
    return u?.name || id;
  };

  const handleSend = async () => {
    if (!body.trim() || !myId || !selectedContactId) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'messages'), {
        senderId: myId,
        receiverId: selectedContactId,
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
            Field Terminal
          </p>
          <h1 className="page-title">Messages</h1>
          <p className="page-subtitle">Direct messages with admin and team members.</p>
        </div>
      </header>

      {/* Active Projects */}
      {activeProjects.length > 0 && (
        <div className="space-y-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
            <Briefcase size={10} className="text-brand-red" />
            My Active Projects ({activeProjects.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {activeProjects.map(p => (
              <div key={p.id} className="px-3 py-2.5 rounded-lg border border-border-sub bg-bg-secondary hover:border-border-main transition-colors">
                <p className="text-[8px] font-black uppercase tracking-widest text-text-muted mb-0.5">{p.status}</p>
                <p className="text-[11px] font-bold text-text-primary leading-tight">{p.name}</p>
                <p className="text-[9px] text-text-muted mt-0.5 truncate">{p.client}{p.location ? ` · ${p.location}` : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* Contacts sidebar */}
        <div className="w-[200px] shrink-0 flex flex-col gap-1 border border-border-sub rounded-xl p-2 bg-bg-secondary overflow-y-auto">
          <p className="text-[8px] font-black uppercase tracking-widest text-text-muted px-2 py-1">Conversations</p>
          {conversationPartners.map(id => (
            <button
              key={id}
              onClick={() => setSelectedContactId(id)}
              className={cn(
                'flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors w-full',
                selectedContactId === id
                  ? 'bg-brand-red/10 text-brand-red'
                  : 'text-text-muted hover:bg-bg-tertiary hover:text-text-primary'
              )}
            >
              <User size={12} className="shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-wider truncate">{getContactLabel(id)}</span>
            </button>
          ))}
        </div>

        {/* Thread panel */}
        <div className="flex-1 flex flex-col border border-border-sub rounded-xl overflow-hidden bg-bg-secondary">
          <div className="border-b border-border-sub px-4 py-2.5 flex items-center gap-2 bg-bg-tertiary/40 shrink-0">
            <MessageSquare size={12} className="text-brand-red" />
            <span className="text-[11px] font-black uppercase tracking-widest text-text-primary">{getContactLabel(selectedContactId)}</span>
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3">
              {thread.length === 0 ? (
                <div className="py-16 text-center">
                  <MessageSquare size={24} className="text-text-muted mx-auto mb-2" />
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">No messages yet</p>
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

          <div className="border-t border-border-sub p-3 flex items-center gap-2 bg-bg-primary shrink-0">
            <Input
              className="flex-1 h-9 text-[11px] bg-bg-secondary border-border-main"
              placeholder="Type a message..."
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
    </div>
  );
}
