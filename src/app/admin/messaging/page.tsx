'use client';

import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, query, where, orderBy, addDoc } from 'firebase/firestore';
import { makeMessageId } from '@/lib/doc-ids';
import type { Technician, AdminMessage, Project } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Send, Lock, Activity, Radio, Users, Plus, Briefcase } from 'lucide-react';
import { format, parseISO, addHours } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const TABS = ['Broadcast', 'Direct Messages', 'Project Comms'] as const;
type Tab = typeof TABS[number];

type DirectMessage = {
  id: string;
  senderId: string;
  receiverId: string;
  body: string;
  timestamp: string;
  read: boolean;
};

export default function AdminMessagingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Broadcast');
  const [currentUser, setCurrentUser] = useState<Technician | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [activeProjects, setActiveProjects] = useState<Project[]>([]);
  const [dmBody, setDmBody] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectMessageBody, setProjectMessageBody] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [sending, setSending] = useState(false);
  const [durationHours, setDurationHours] = useState('24');
  const [newMessage, setNewMessage] = useState<Partial<AdminMessage>>({
    type: 'info',
    targetPortal: 'all',
    subject: '',
    body: '',
    isLocked: false,
  });
  const { toast } = useToast();

  useEffect(() => {
    const unsubTechs = onSnapshot(collection(db, 'users'), (snap) => {
      const techs = snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician));
      setTechnicians(techs);
      const userId = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('currentUserId') : null;
      if (userId) {
        const user = techs.find(t => t.id === userId);
        if (user) setCurrentUser(user);
      }
    });

    // Load broadcast messages from localStorage + Firestore
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('aaromach_broadcast_ledger') : null;
    setMessages(stored ? JSON.parse(stored) : []);

    const unsubDMs = onSnapshot(collection(db, 'messages'), (snap) => {
      setDirectMessages(snap.docs.map(d => ({ ...d.data(), id: d.id } as DirectMessage)));
    });

    const unsubProjects = onSnapshot(collection(db, 'projects'), (snap) => {
      setActiveProjects(
        snap.docs
          .map(d => ({ ...d.data(), id: d.id } as Project))
          .filter(p => p.status !== 'completed')
      );
    });

    return () => { unsubTechs(); unsubDMs(); unsubProjects(); };
  }, []);

  const handleBroadcast = useCallback(async () => {
    if (!newMessage.subject || !newMessage.body) {
      toast({ variant: 'destructive', title: 'Missing fields', description: 'Subject and body are required.' });
      return;
    }
    setSending(true);
    try {
      const msgId = await makeMessageId();
      const msg: AdminMessage = {
        id: msgId,
        senderId: currentUser?.id || 'admin',
        senderName: currentUser?.name || 'System Admin',
        subject: newMessage.subject!,
        body: newMessage.body!,
        timestamp: new Date().toISOString(),
        type: newMessage.type as any,
        targetPortal: newMessage.targetPortal as any,
        isLocked: !!newMessage.isLocked,
        expiresAt: addHours(new Date(), parseInt(durationHours)).toISOString(),
      };

      const updated = [msg, ...messages];
      setMessages(updated);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('aaromach_broadcast_ledger', JSON.stringify(updated));
      }
      await setDoc(doc(db, 'broadcasts', msg.id), { ...msg, revokedBy: [] });
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('storage'));

      toast({ title: 'Broadcast sent', description: 'Message transmitted to all target users.' });
      setIsBroadcasting(false);
      setNewMessage({ type: 'info', targetPortal: 'all', subject: '', body: '', isLocked: false });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed to broadcast', description: e.message });
    } finally {
      setSending(false);
    }
  }, [newMessage, currentUser, messages, durationHours, toast]);

  const handleRevokeMessage = useCallback((id: string) => {
    let revokedIds: string[] = [];
    try {
      const json = typeof localStorage !== 'undefined' ? localStorage.getItem('aaromach_revoked_messages') : null;
      if (json) revokedIds = JSON.parse(json);
    } catch {}
    if (!revokedIds.includes(id)) {
      revokedIds.push(id);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('aaromach_revoked_messages', JSON.stringify(revokedIds));
      }
    }
    const updated = messages.filter(m => m.id !== id);
    setMessages(updated);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('aaromach_broadcast_ledger', JSON.stringify(updated));
    }
    updateDoc(doc(db, 'broadcasts', id), { revoked: true }).catch(() => {});
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('storage'));
    toast({ title: 'Broadcast revoked' });
  }, [messages, toast]);

  const handleSendDM = async () => {
    if (!dmBody.trim() || !selectedUserId || !currentUser) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'messages'), {
        senderId: currentUser.id,
        receiverId: selectedUserId,
        body: dmBody.trim(),
        timestamp: new Date().toISOString(),
        read: false,
      });
      setDmBody('');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed to send', description: e.message });
    } finally {
      setSending(false);
    }
  };

  const threadMessages = directMessages.filter(m =>
    (m.senderId === currentUser?.id && m.receiverId === selectedUserId) ||
    (m.senderId === selectedUserId && m.receiverId === currentUser?.id)
  ).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const projectMessages = directMessages
    .filter(m => (m as any).projectId === selectedProjectId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const handleSendProjectMessage = async () => {
    if (!projectMessageBody.trim() || !selectedProjectId || !currentUser) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'messages'), {
        senderId: currentUser.id,
        senderName: currentUser.name,
        projectId: selectedProjectId,
        body: projectMessageBody.trim(),
        timestamp: new Date().toISOString(),
        read: false,
      });
      setProjectMessageBody('');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed to send', description: e.message });
    } finally {
      setSending(false);
    }
  };

  const adminTechs = technicians.filter(t => !t.roles?.includes('client') && t.id !== currentUser?.id);

  return (
    <div className="space-y-5">
      <header className="page-header">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2">
            <MessageSquare size={12} />
            Communications
          </p>
          <h1 className="page-title">Messaging</h1>
          <p className="page-subtitle">Broadcast to all users or send direct messages.</p>
        </div>
        {activeTab === 'Broadcast' && (
          <div className="page-header-right">
            <Button size="sm" className="h-8 bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase tracking-widest" onClick={() => setIsBroadcasting(true)}>
              <Radio size={12} className="mr-1.5" />
              New Broadcast
            </Button>
          </div>
        )}
      </header>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border-sub">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'text-[10px] font-black uppercase tracking-widest px-5 py-3 border-b-2 transition-colors whitespace-nowrap',
              activeTab === tab
                ? 'border-brand-red text-brand-red'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Broadcast Tab */}
      {activeTab === 'Broadcast' && (
        <div className="space-y-3">
          {messages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-sub p-16 text-center">
              <Radio size={32} className="text-text-muted mx-auto mb-3" />
              <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest">No broadcasts sent</p>
              <p className="text-[9px] text-text-muted mt-1">Broadcasts appear across all target user portals.</p>
            </div>
          ) : (
            messages.map(msg => (
              <div key={msg.id} className="bg-bg-secondary border border-border-sub rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'p-2 rounded-lg border',
                      msg.type === 'critical' ? 'bg-brand-red-dim text-text-red border-brand-red/30' :
                      msg.type === 'warning' ? 'bg-accent-gold-dim text-accent-gold border-accent-gold/30' :
                      msg.type === 'success' ? 'bg-green-dim text-text-green border-green-border/30' :
                      'bg-bg-primary text-text-secondary border border-border-sub'
                    )}>
                      <Activity size={14} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-[12px] font-bold text-text-primary uppercase tracking-wide">{msg.subject}</p>
                        {msg.isLocked && <Lock size={11} className="text-brand-red" />}
                      </div>
                      <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest">
                        {format(parseISO(msg.timestamp), 'MMM d, yyyy h:mm a')} · Target: {msg.targetPortal}
                        {msg.expiresAt && ` · Expires: ${format(parseISO(msg.expiresAt), 'MMM d, h:mm a')}`}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[8px] uppercase shrink-0">{msg.type}</Badge>
                </div>
                <p className="text-[11px] text-text-secondary leading-relaxed">{msg.body}</p>
                <div className="pt-3 border-t border-border-sub/30 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full bg-bg-tertiary border border-border-sub flex items-center justify-center text-[7px] font-bold">
                      {(msg.senderName || 'A').charAt(0)}
                    </div>
                    <span className="text-[8px] text-text-muted font-bold uppercase tracking-widest">Sent by {msg.senderName}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 text-[9px] uppercase font-bold text-text-muted hover:text-text-red" onClick={() => handleRevokeMessage(msg.id)}>
                    Revoke
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Direct Messages Tab */}
      {activeTab === 'Direct Messages' && (
        <div className="flex gap-4 h-[calc(100vh-280px)] min-h-[400px]">
          {/* User list */}
          <div className="w-56 shrink-0 border border-border-sub rounded-xl overflow-hidden bg-bg-secondary flex flex-col">
            <div className="px-3 py-2.5 border-b border-border-sub">
              <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Team</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-1.5 space-y-0.5">
                {adminTechs.map(t => {
                  const hasUnread = directMessages.some(m => m.senderId === t.id && m.receiverId === currentUser?.id && !m.read);
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedUserId(t.id)}
                      className={cn(
                        'w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center gap-2.5',
                        selectedUserId === t.id
                          ? 'bg-brand-red/10 text-brand-red'
                          : 'hover:bg-bg-tertiary text-text-muted hover:text-text-primary'
                      )}
                    >
                      <div className="w-6 h-6 rounded-full bg-bg-tertiary border border-border-sub flex items-center justify-center shrink-0">
                        <span className="text-[8px] font-black">{(t.name || 'T').charAt(0)}</span>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wide truncate flex-1">{t.name}</span>
                      {hasUnread && <div className="w-2 h-2 rounded-full bg-brand-red shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Thread */}
          <div className="flex-1 border border-border-sub rounded-xl overflow-hidden bg-bg-secondary flex flex-col">
            {!selectedUserId ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Users size={32} className="text-text-muted mx-auto mb-3" />
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Select a team member to message</p>
                </div>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-border-sub shrink-0">
                  <p className="text-[11px] font-black uppercase tracking-widest text-text-primary">
                    {adminTechs.find(t => t.id === selectedUserId)?.name || 'Unknown'}
                  </p>
                </div>
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-3">
                    {threadMessages.length === 0 ? (
                      <p className="text-[10px] text-text-muted text-center py-8 uppercase tracking-widest">No messages yet — say something!</p>
                    ) : (
                      threadMessages.map(m => {
                        const isMine = m.senderId === currentUser?.id;
                        return (
                          <div key={m.id} className={cn('flex', isMine ? 'justify-end' : 'justify-start')}>
                            <div className={cn(
                              'max-w-[70%] rounded-xl px-3 py-2.5 text-[11px] leading-relaxed',
                              isMine
                                ? 'bg-brand-red/10 border border-brand-red/20 text-text-primary'
                                : 'bg-bg-tertiary border border-border-sub text-text-secondary'
                            )}>
                              <p>{m.body}</p>
                              <p className="text-[8px] text-text-muted mt-1 font-bold uppercase tracking-wider">
                                {format(parseISO(m.timestamp), 'h:mm a')}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
                <div className="px-4 py-3 border-t border-border-sub shrink-0 flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={dmBody}
                    onChange={e => setDmBody(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendDM()}
                    className="h-9 text-[11px] bg-bg-secondary border-border-main flex-1"
                  />
                  <Button size="sm" onClick={handleSendDM} disabled={!dmBody.trim() || sending} className="h-9 bg-brand-red hover:bg-brand-red/90 text-white">
                    <Send size={13} />
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Project Comms Tab */}
      {activeTab === 'Project Comms' && (
        <div className="flex gap-4 h-[calc(100vh-280px)] min-h-[400px]">
          {/* Project List */}
          <div className="w-64 shrink-0 border border-border-sub rounded-xl overflow-hidden bg-bg-secondary flex flex-col">
            <div className="px-3 py-2.5 border-b border-border-sub">
              <p className="text-[9px] font-black text-text-muted uppercase tracking-widest">Active Projects</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-1.5 space-y-0.5">
                {activeProjects.length === 0 ? (
                  <p className="text-[9px] text-text-muted text-center py-6 uppercase tracking-widest">No active projects</p>
                ) : (
                  activeProjects.map(p => {
                    const unreadCount = directMessages.filter(m => (m as any).projectId === p.id && !(m as any).read && m.senderId !== currentUser?.id).length;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProjectId(p.id)}
                        className={cn(
                          'w-full text-left px-3 py-2.5 rounded-lg transition-colors',
                          selectedProjectId === p.id
                            ? 'bg-brand-red/10 text-brand-red'
                            : 'hover:bg-bg-tertiary text-text-muted hover:text-text-primary'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[9px] font-black uppercase tracking-wide truncate flex-1">{p.name}</p>
                          {unreadCount > 0 && (
                            <span className="h-4 w-4 rounded-full bg-brand-red text-white text-[8px] font-black flex items-center justify-center shrink-0">{unreadCount}</span>
                          )}
                        </div>
                        <p className="text-[8px] text-text-muted mt-0.5 uppercase">{p.status}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Message Thread */}
          <div className="flex-1 border border-border-sub rounded-xl overflow-hidden bg-bg-secondary flex flex-col">
            {!selectedProjectId ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Briefcase size={32} className="text-text-muted mx-auto mb-3" />
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Select a project to view its thread</p>
                </div>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-border-sub shrink-0">
                  <p className="text-[11px] font-black uppercase tracking-widest text-text-primary">
                    {activeProjects.find(p => p.id === selectedProjectId)?.name || 'Unknown Project'}
                  </p>
                  <p className="text-[9px] text-text-muted uppercase mt-0.5">
                    {activeProjects.find(p => p.id === selectedProjectId)?.client}
                  </p>
                </div>
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-3">
                    {projectMessages.length === 0 ? (
                      <p className="text-[10px] text-text-muted text-center py-8 uppercase tracking-widest">No messages yet — start the conversation!</p>
                    ) : (
                      projectMessages.map(m => {
                        const isMine = m.senderId === currentUser?.id;
                        const senderName = (m as any).senderName || technicians.find(t => t.id === m.senderId)?.name || 'Unknown';
                        return (
                          <div key={m.id} className={cn('flex flex-col', isMine ? 'items-end' : 'items-start')}>
                            {!isMine && <p className="text-[8px] font-bold text-text-muted uppercase mb-0.5 ml-1">{senderName}</p>}
                            <div className={cn(
                              'max-w-[70%] rounded-xl px-3 py-2.5 text-[11px] leading-relaxed',
                              isMine
                                ? 'bg-brand-red/10 border border-brand-red/20 text-text-primary'
                                : 'bg-bg-tertiary border border-border-sub text-text-secondary'
                            )}>
                              <p>{m.body}</p>
                              <p className="text-[8px] text-text-muted mt-1 font-bold uppercase tracking-wider">
                                {format(parseISO(m.timestamp), 'h:mm a')}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
                <div className="px-4 py-3 border-t border-border-sub shrink-0 flex gap-2">
                  <input
                    className="h-9 flex-1 rounded-md border border-border-main bg-bg-secondary px-3 text-[11px] outline-none focus:border-brand-red placeholder:text-text-muted"
                    placeholder="Type a project message..."
                    value={projectMessageBody}
                    onChange={e => setProjectMessageBody(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendProjectMessage()}
                  />
                  <Button size="sm" onClick={handleSendProjectMessage} disabled={!projectMessageBody.trim() || sending} className="h-9 bg-brand-red hover:bg-brand-red/90 text-white">
                    <Send size={13} />
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Active Projects */}
      {activeTab !== 'Project Comms' && activeProjects.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-border-sub">
          <p className="text-[9px] font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
            <Briefcase size={10} className="text-brand-red" />
            Active Projects ({activeProjects.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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

      {/* Broadcast Dialog */}
      <Dialog open={isBroadcasting} onOpenChange={setIsBroadcasting}>
        <DialogContent className="bg-bg-elevated border-border-main max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Radio className="text-brand-red h-5 w-5" />
              <DialogTitle className="text-[13px] font-black uppercase tracking-widest">Compose Broadcast</DialogTitle>
            </div>
            <DialogDescription className="text-[10px]">Send a message to all users in the selected portal.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Target</Label>
                <Select value={newMessage.targetPortal} onValueChange={(v: any) => setNewMessage(m => ({ ...m, targetPortal: v }))}>
                  <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-bg-elevated border-border-main">
                    <SelectItem value="all">All Users</SelectItem>
                    <SelectItem value="tech">Technicians Only</SelectItem>
                    <SelectItem value="client">Clients Only</SelectItem>
                    <SelectItem value="admin">Admin Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Priority</Label>
                <Select value={newMessage.type} onValueChange={(v: any) => setNewMessage(m => ({ ...m, type: v }))}>
                  <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-bg-elevated border-border-main">
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Expires After</Label>
              <Select value={durationHours} onValueChange={setDurationHours}>
                <SelectTrigger className="h-9 text-[11px] bg-bg-secondary border-border-main"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-bg-elevated border-border-main">
                  <SelectItem value="4">4 hours</SelectItem>
                  <SelectItem value="24">24 hours</SelectItem>
                  <SelectItem value="48">48 hours</SelectItem>
                  <SelectItem value="72">72 hours</SelectItem>
                  <SelectItem value="168">1 week</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Subject *</Label>
              <Input className="h-9 text-[11px] bg-bg-secondary border-border-main" placeholder="Broadcast subject..." value={newMessage.subject} onChange={e => setNewMessage(m => ({ ...m, subject: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase tracking-widest text-text-muted">Message *</Label>
              <Textarea className="min-h-[100px] text-[11px] bg-bg-secondary border-border-main resize-none" placeholder="Message body..." value={newMessage.body} onChange={e => setNewMessage(m => ({ ...m, body: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsBroadcasting(false)} className="text-[10px] font-black uppercase">Cancel</Button>
            <Button size="sm" onClick={handleBroadcast} disabled={sending} className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase">
              <Send size={12} className="mr-1.5" />
              {sending ? 'Sending...' : 'Send Broadcast'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
