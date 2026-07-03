'use client';

import { useState, useEffect, useRef } from 'react';
import { db, auth, storage } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import type { Technician, Project } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import {
  MessageSquare, Send, Briefcase, Users, ShieldCheck,
  Paperclip, X, Image as ImageIcon,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type DmMessage = {
  id: string;
  senderId: string;
  receiverId?: string;
  projectId?: string;
  projectName?: string;
  senderName?: string;
  body: string;
  imageUrls?: string[];
  timestamp: string;
  createdAt?: string;
  readBy?: string[];
};

type ThreadKey =
  | { type: 'dm'; contactId: string; contactName: string; contactAvatar?: string }
  | { type: 'project'; projectId: string; projectName: string };

const ADMIN_ROLES = ['super_admin', 'dispatch_admin', 'project_manager', 'payroll_admin'];

export default function ClientMessagingPage() {
  const { toast } = useToast();
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<Technician | null>(null);
  const [allUsers, setAllUsers] = useState<Technician[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadKey | null>(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setFirebaseUid(u?.uid ?? null));
    return unsub;
  }, []);

  useEffect(() => {
    if (!firebaseUid) return;
    return onSnapshot(doc(db, 'users', firebaseUid), (snap) => {
      if (snap.exists()) setCurrentUser({ ...snap.data(), id: snap.id } as Technician);
    });
  }, [firebaseUid]);

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setAllUsers(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, 'projects'), (snap) => {
      setAllProjects(snap.docs.map(d => ({ ...d.data(), id: d.id } as Project)));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, 'messages'), (snap) => {
      setMessages(snap.docs.map(d => ({ ...d.data(), id: d.id } as DmMessage)));
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedThread]);

  // Mark thread read
  useEffect(() => {
    if (!selectedThread || !firebaseUid) return;
    const unread = messages.filter(m => {
      if ((m.readBy || []).includes(firebaseUid)) return false;
      if (selectedThread.type === 'dm')
        return (m.senderId === selectedThread.contactId && m.receiverId === firebaseUid);
      return m.projectId === selectedThread.projectId && m.senderId !== firebaseUid;
    });
    unread.forEach(m =>
      updateDoc(doc(db, 'messages', m.id), { readBy: arrayUnion(firebaseUid) }).catch(() => {})
    );
  }, [selectedThread, messages, firebaseUid]);

  const myId = firebaseUid || currentUser?.id || '';

  const contacts = allUsers.filter(u => {
    if (!currentUser || u.id === myId) return false;
    const roles = (u.roles || []) as string[];
    const isAdmin = roles.some(r => ADMIN_ROLES.includes(r));
    const isSameCompany = u.clientCompany && u.clientCompany === currentUser.clientCompany;
    return isAdmin || isSameCompany;
  });

  const companyProjects = allProjects.filter(p =>
    p.status !== 'completed' &&
    currentUser?.clientCompany && p.client === currentUser.clientCompany
  );

  const threadMessages = messages.filter(m => {
    if (!selectedThread) return false;
    if (selectedThread.type === 'dm') {
      const cId = selectedThread.contactId;
      return (m.senderId === myId && m.receiverId === cId) ||
             (m.senderId === cId && m.receiverId === myId);
    }
    return m.projectId === selectedThread.projectId;
  }).sort((a, b) =>
    (a.timestamp || a.createdAt || '').localeCompare(b.timestamp || b.createdAt || '')
  );

  const unreadFor = (thread: ThreadKey) =>
    messages.filter(m => {
      if ((m.readBy || []).includes(myId)) return false;
      if (thread.type === 'dm')
        return m.senderId === thread.contactId && m.receiverId === myId;
      return m.projectId === thread.projectId && m.senderId !== myId;
    }).length;

  const handleImageUpload = async (file: File) => {
    if (!firebaseUid) {
      toast({ variant: 'destructive', title: 'Upload failed', description: 'You must be signed in to upload images.' });
      return;
    }
    setImageUploading(true);
    try {
      const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `messageImages/${firebaseUid}/${Date.now()}-${sanitized}`;
      const sRef = storageRef(storage, path);
      await uploadBytes(sRef, file, { contentType: file.type || 'image/jpeg' });
      const url = await getDownloadURL(sRef);
      setPendingImageUrl(url);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Upload failed', description: err.message });
    } finally {
      setImageUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = async () => {
    if ((!body.trim() && !pendingImageUrl) || !myId || !selectedThread) return;
    setSending(true);
    try {
      const payload: Record<string, unknown> = {
        senderId: myId,
        senderName: currentUser?.name || 'Client',
        body: body.trim(),
        timestamp: new Date().toISOString(),
        readBy: [myId],
      };
      if (pendingImageUrl) payload.imageUrls = [pendingImageUrl];
      if (selectedThread.type === 'dm') {
        payload.receiverId = selectedThread.contactId;
      } else {
        payload.projectId = selectedThread.projectId;
        payload.projectName = selectedThread.projectName;
      }
      await addDoc(collection(db, 'messages'), payload);
      setBody('');
      setPendingImageUrl(null);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col space-y-5" style={{ height: 'calc(100vh - 5rem)' }}>
      <header className="page-header shrink-0">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2">
            <MessageSquare size={12} />
            Client Portal
          </p>
          <h1 className="page-title">Messages</h1>
          <p className="page-subtitle">Contact your account managers, company members, and project teams.</p>
        </div>
      </header>

      <div className="flex flex-1 gap-4 min-h-0">
        {/* Contact & project list */}
        <div className="w-60 shrink-0 flex flex-col gap-4 overflow-y-auto pr-1">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-muted mb-2 flex items-center gap-1.5">
              <Users size={9} className="text-brand-red" /> Contacts
            </p>
            <div className="space-y-0.5">
              {contacts.length === 0 && (
                <p className="text-[9px] text-text-muted italic px-1 py-2">No contacts yet</p>
              )}
              {contacts.map(contact => {
                const thread: ThreadKey = {
                  type: 'dm',
                  contactId: contact.id,
                  contactName: contact.name,
                  contactAvatar: contact.avatarUrl,
                };
                const unread = unreadFor(thread);
                const active = selectedThread?.type === 'dm' && selectedThread.contactId === contact.id;
                const isAdmin = (contact.roles || []).some((r: string) => ADMIN_ROLES.includes(r));
                return (
                  <button
                    key={contact.id}
                    onClick={() => setSelectedThread(thread)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors',
                      active
                        ? 'bg-brand-red/10 border border-brand-red/20'
                        : 'hover:bg-bg-tertiary border border-transparent'
                    )}
                  >
                    <div className="relative shrink-0">
                      <Avatar className="h-7 w-7 border border-border-sub">
                        <AvatarImage src={contact.avatarUrl} />
                        <AvatarFallback className="text-[9px]">{(contact.name || '?').charAt(0)}</AvatarFallback>
                      </Avatar>
                      {isAdmin && (
                        <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 bg-brand-red rounded-full flex items-center justify-center">
                          <ShieldCheck size={7} className="text-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-[10px] font-bold uppercase tracking-tight truncate leading-tight', active ? 'text-brand-red' : 'text-text-primary')}>{contact.name}</p>
                      <p className="text-[8px] text-text-muted uppercase tracking-widest">{isAdmin ? 'Admin' : 'Team Member'}</p>
                    </div>
                    {unread > 0 && (
                      <span className="text-[8px] font-black bg-brand-red text-white rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 shrink-0">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {companyProjects.length > 0 && (
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-muted mb-2 flex items-center gap-1.5">
                <Briefcase size={9} className="text-brand-red" /> Active Projects
              </p>
              <div className="space-y-0.5">
                {companyProjects.map(project => {
                  const thread: ThreadKey = {
                    type: 'project',
                    projectId: project.id,
                    projectName: project.name,
                  };
                  const unread = unreadFor(thread);
                  const active = selectedThread?.type === 'project' && selectedThread.projectId === project.id;
                  return (
                    <button
                      key={project.id}
                      onClick={() => setSelectedThread(thread)}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors',
                        active
                          ? 'bg-brand-red/10 border border-brand-red/20'
                          : 'hover:bg-bg-tertiary border border-transparent'
                      )}
                    >
                      <div className="h-7 w-7 rounded-md bg-bg-tertiary border border-border-sub flex items-center justify-center shrink-0">
                        <Briefcase size={12} className={active ? 'text-brand-red' : 'text-text-muted'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-[10px] font-bold uppercase tracking-tight truncate leading-tight', active ? 'text-brand-red' : 'text-text-primary')}>{project.name}</p>
                        <p className="text-[8px] text-text-muted uppercase tracking-widest">{project.status}</p>
                      </div>
                      {unread > 0 && (
                        <span className="text-[8px] font-black bg-brand-red text-white rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 shrink-0">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Chat panel */}
        <div className="flex-1 flex flex-col min-h-0 border border-border-sub rounded-xl overflow-hidden bg-bg-secondary">
          {!selectedThread ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
              <MessageSquare size={32} className="text-text-muted" />
              <p className="text-[10px] font-black uppercase tracking-widest text-text-muted text-center">
                Select a contact or project to start messaging
              </p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="border-b border-border-sub px-4 py-2.5 flex items-center gap-3 bg-bg-tertiary/40 shrink-0">
                {selectedThread.type === 'dm' ? (
                  <>
                    <Avatar className="h-7 w-7 border border-border-sub">
                      <AvatarImage src={selectedThread.contactAvatar} />
                      <AvatarFallback className="text-[9px]">{(selectedThread.contactName || '?').charAt(0)}</AvatarFallback>
                    </Avatar>
                    <p className="text-[11px] font-black uppercase tracking-widest text-text-primary">{selectedThread.contactName}</p>
                  </>
                ) : (
                  <>
                    <div className="h-7 w-7 rounded-md bg-bg-tertiary border border-border-sub flex items-center justify-center">
                      <Briefcase size={12} className="text-brand-red" />
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest text-text-primary">{selectedThread.projectName}</p>
                      <p className="text-[8px] text-text-muted uppercase tracking-widest">Project Thread</p>
                    </div>
                  </>
                )}
                <span className="ml-auto text-[8px] font-bold uppercase tracking-widest" style={{ color: '#00d36f' }}>Active</span>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3">
                  {threadMessages.length === 0 ? (
                    <div className="py-16 text-center">
                      <MessageSquare size={24} className="text-text-muted mx-auto mb-2" />
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">No messages yet — start the conversation</p>
                    </div>
                  ) : (
                    threadMessages.map(msg => {
                      const isMe = msg.senderId === myId;
                      const sender = allUsers.find(u => u.id === msg.senderId);
                      const senderName = isMe ? 'You' : (sender?.name || msg.senderName || 'Unknown');
                      return (
                        <div key={msg.id} className={cn('flex flex-col gap-1', isMe ? 'items-end' : 'items-start')}>
                          {!isMe && (
                            <div className="flex items-center gap-1.5 px-1">
                              <Avatar className="h-5 w-5">
                                <AvatarImage src={sender?.avatarUrl} />
                                <AvatarFallback className="text-[7px]">{senderName.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <p className="text-[8px] font-black uppercase tracking-widest text-brand-red">{senderName}</p>
                            </div>
                          )}
                          <div className={cn(
                            'max-w-[70%] px-3 py-2 rounded-xl',
                            isMe
                              ? 'bg-brand-red text-white rounded-tr-sm'
                              : 'bg-bg-tertiary border border-border-sub text-text-primary rounded-tl-sm'
                          )}>
                            {(msg.imageUrls || []).map((u, i) => (
                              <img key={i} src={u} alt="attachment" className="max-w-full rounded-lg mb-2 max-h-48 object-contain" />
                            ))}
                            {msg.body && <p className="text-[11px] leading-relaxed">{msg.body}</p>}
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
              <div className="border-t border-border-sub p-3 bg-bg-primary shrink-0">
                {pendingImageUrl && (
                  <div className="mb-2 flex items-center gap-2 px-2 py-1.5 bg-bg-secondary rounded-lg border border-border-sub">
                    <ImageIcon size={12} className="text-brand-red shrink-0" />
                    <img src={pendingImageUrl} alt="pending attachment" className="h-10 rounded object-contain" />
                    <button onClick={() => setPendingImageUrl(null)} className="ml-auto text-text-muted hover:text-text-primary">
                      <X size={12} />
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file);
                    }}
                  />
                  <button
                    className="h-9 w-9 flex items-center justify-center rounded-md border border-border-sub text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors shrink-0 disabled:opacity-40"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={imageUploading}
                    title="Attach image"
                  >
                    <Paperclip size={14} />
                  </button>
                  <Input
                    className="flex-1 h-9 text-[11px] bg-bg-secondary border-border-main"
                    placeholder={
                      selectedThread.type === 'dm'
                        ? `Message ${selectedThread.contactName}…`
                        : 'Message project team…'
                    }
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-9 bg-brand-red hover:bg-brand-red/90 text-white shrink-0"
                    onClick={handleSend}
                    disabled={sending || (!body.trim() && !pendingImageUrl)}
                  >
                    <Send size={13} />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
