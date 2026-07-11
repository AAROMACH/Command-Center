'use client';

import { useState, useEffect, useRef } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, doc, updateDoc, arrayUnion, query } from 'firebase/firestore';
import { uploadFile } from '@/lib/upload';
import type { Technician, Project, AdminMessage } from '@/lib/types';
import { isAdmin as isAdminRole, isTech as isTechRole, isClient as isClientRole } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, Send, User, Briefcase, Paperclip, X, Radio } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const TABS = ['Messages', 'Project Comms', 'Broadcasts'] as const;
type Tab = typeof TABS[number];

type DirectMessage = {
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
  read: boolean;
  readBy?: string[];
};

export default function TechMessagingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Messages');
  const [currentUser, setCurrentUser] = useState<Technician | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>('admin');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectBody, setProjectBody] = useState('');

  const [contactFilter, setContactFilter] = useState<'all' | 'admins' | 'techs' | 'clients'>('all');
  const [broadcasts, setBroadcasts] = useState<AdminMessage[]>([]);
  const [dmImageUrl, setDmImageUrl] = useState<string | null>(null);
  const [projectImageUrl, setProjectImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const dmFileRef = useRef<HTMLInputElement>(null);
  const projFileRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const projBottomRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

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

    const unsubBroadcasts = onSnapshot(collection(db, 'broadcasts'), (snap) => {
      const all = snap.docs.map(d => ({ ...d.data(), id: d.id } as AdminMessage));
      setBroadcasts(all.filter(b => b.targetPortal === 'all' || b.targetPortal === 'tech'));
    });

    return () => { unsubUsers(); unsubMsgs(); unsubProjects(); unsubBroadcasts(); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedContactId]);

  useEffect(() => {
    projBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedProjectId]);

  const myId = currentUser?.id || '';

  const markDMsRead = async (contactId: string) => {
    if (!myId) return;
    const unread = messages.filter(m =>
      !m.projectId &&
      m.senderId === contactId &&
      m.receiverId === myId &&
      !(m.readBy || []).includes(myId)
    );
    await Promise.all(unread.map(m => updateDoc(doc(db, 'messages', m.id), { readBy: arrayUnion(myId), read: true })));
  };

  const markProjectRead = async (projectId: string) => {
    if (!myId) return;
    const unread = messages.filter(m =>
      m.projectId === projectId &&
      m.senderId !== myId &&
      !(m.readBy || []).includes(myId)
    );
    await Promise.all(unread.map(m => updateDoc(doc(db, 'messages', m.id), { readBy: arrayUnion(myId), read: true })));
  };

  // Projects this tech is assigned to, grouped by status
  const myActiveProjects = allProjects.filter(p => p.status === 'active' && myId && p.assignedTechnicianIds?.includes(myId));
  const myOnHoldProjects = allProjects.filter(p => p.status === 'on-hold' && myId && p.assignedTechnicianIds?.includes(myId));
  const myCompletedProjects = allProjects.filter(p => p.status === 'completed' && myId && p.assignedTechnicianIds?.includes(myId));

  const selectedProject = allProjects.find(p => p.id === selectedProjectId);

  const blockedIds = new Set(currentUser?.messagingBlockedClientIds || []);
  const allowedRoles = currentUser?.messagingAllowedRoles || 'all';

  const isActiveUser = (u: Technician) => (u as any).status !== 'inactive' && (u as any).approvalStatus !== 'pending' && (u as any).approvalStatus !== 'denied';

  // Whether the tech's messaging permission allows contacting this user/role.
  const permissionAllows = (u?: Technician, isAdminChannel = false): boolean => {
    if (allowedRoles === 'none') return false;
    if (allowedRoles === 'all') return true;
    if (allowedRoles === 'admins') return isAdminChannel || isAdminRole(u);
    if (allowedRoles === 'techs') return !isAdminChannel && isTechRole(u);
    if (allowedRoles === 'clients') return !isAdminChannel && isClientRole(u);
    return false;
  };

  // Recipient list is derived from ALL users the tech is permitted to message —
  // not only past conversation partners — so a tech with 'message all' sees
  // everyone allowed. Blocklist hides only the specific blocked users.
  const recipientIds = (() => {
    const ids = new Set<string>();
    if (allowedRoles === 'none') return [] as string[];
    // Special admin channel entry
    if (permissionAllows(undefined, true)) ids.add('admin');
    technicians.forEach(u => {
      if (!u.id || u.id === myId) return;
      if (blockedIds.has(u.id)) return;
      if (!isActiveUser(u)) return;
      if (!permissionAllows(u)) return;
      ids.add(u.id);
    });
    // Keep any existing conversation partners visible (e.g. legacy threads),
    // still subject to blocklist.
    messages.forEach(m => {
      if (m.projectId) return;
      const partner = m.senderId === myId ? m.receiverId : m.receiverId === myId ? m.senderId : '';
      if (partner && partner !== myId && !blockedIds.has(partner)) {
        const u = technicians.find(t => t.id === partner);
        if (partner === 'admin' ? permissionAllows(undefined, true) : (u && permissionAllows(u))) ids.add(partner);
      }
    });
    return Array.from(ids);
  })();

  // Apply the active tab (all/admins/techs/clients) on top of the allowed set.
  const visiblePartners = recipientIds.filter(id => {
    if (id === 'admin') return contactFilter === 'all' || contactFilter === 'admins';
    const user = technicians.find(t => t.id === id);
    if (!user) return contactFilter === 'all';
    if (contactFilter === 'admins') return isAdminRole(user);
    if (contactFilter === 'techs') return isTechRole(user);
    if (contactFilter === 'clients') return isClientRole(user);
    return true;
  });

  const thread = messages
    .filter(m => !m.projectId &&
      ((m.senderId === myId && m.receiverId === selectedContactId) ||
       (m.receiverId === myId && m.senderId === selectedContactId)))
    .sort((a, b) => (a.timestamp || a.createdAt || '').localeCompare(b.timestamp || b.createdAt || ''));

  const projectThread = messages
    .filter(m => m.projectId === selectedProjectId)
    .sort((a, b) => (a.timestamp || a.createdAt || '').localeCompare(b.timestamp || b.createdAt || ''));

  const getContactLabel = (id: string) => {
    if (id === 'admin') return 'Admin';
    return technicians.find(t => t.id === id)?.name || id;
  };

  const getLastProjectMessage = (projectId: string) =>
    messages
      .filter(m => m.projectId === projectId)
      .sort((a, b) => (b.timestamp || b.createdAt || '').localeCompare(a.timestamp || a.createdAt || ''))[0];

  const getProjectUnread = (projectId: string) =>
    messages.filter(m => m.projectId === projectId && !m.read && m.senderId !== myId).length;

  const handleImageUpload = async (
    file: File,
    setUrl: (u: string | null) => void,
    inputRef: React.RefObject<HTMLInputElement | null>
  ) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toast({ variant: 'destructive', title: 'Upload failed', description: 'You must be signed in to upload images.' });
      return;
    }
    setImageUploading(true);
    try {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `messageImages/${uid}/${Date.now()}-${sanitizedName}`;
      console.debug('[MessageUpload] uid:', uid);
      console.debug('[MessageUpload] path:', path);
      console.debug('[MessageUpload] file:', file.name, file.type, `${(file.size / 1024).toFixed(1)}KB`);
      const { url } = await uploadFile(path, file, { contentType: file.type || 'image/jpeg' });
      setUrl(url);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Upload failed', description: err.message });
    } finally {
      setImageUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleSend = async () => {
    if ((!body.trim() && !dmImageUrl) || !myId || !selectedContactId) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'messages'), {
        senderId: myId,
        receiverId: selectedContactId,
        body: body.trim(),
        timestamp: new Date().toISOString(),
        read: false,
        ...(dmImageUrl && { imageUrls: [dmImageUrl] }),
      });
      setBody('');
      setDmImageUrl(null);
    } finally {
      setSending(false);
    }
  };

  const handleSendProject = async () => {
    if ((!projectBody.trim() && !projectImageUrl) || !selectedProjectId || !myId) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'messages'), {
        senderId: myId,
        senderName: currentUser?.name || '',
        senderRole: 'tech',
        projectId: selectedProjectId,
        projectName: selectedProject?.name || '',
        body: projectBody.trim(),
        timestamp: new Date().toISOString(),
        read: false,
        readBy: [myId],
        ...(projectImageUrl && { imageUrls: [projectImageUrl] }),
      });
      setProjectBody('');
      setProjectImageUrl(null);
    } finally {
      setSending(false);
    }
  };

  const ProjectListSection = ({ label, projects, labelColor }: { label: string; projects: Project[]; labelColor: string }) => (
    <>
      <p className={cn('text-[8px] font-black uppercase tracking-widest px-2 pt-3 pb-0.5', labelColor)}>{label}</p>
      {projects.map(p => {
        const lastMsg = getLastProjectMessage(p.id);
        const unread = getProjectUnread(p.id);
        return (
          <button
            key={p.id}
            onClick={() => { setSelectedProjectId(p.id); markProjectRead(p.id); }}
            className={cn(
              'w-full text-left px-3 py-2.5 rounded-lg transition-colors',
              selectedProjectId === p.id ? 'bg-brand-red/10 text-brand-red' : 'text-text-muted hover:bg-bg-tertiary hover:text-text-primary'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9px] font-black uppercase tracking-wide truncate flex-1">{p.name}</p>
              {unread > 0 && <span className="h-4 w-4 rounded-full bg-brand-red text-white text-[8px] font-black flex items-center justify-center shrink-0">{unread}</span>}
            </div>
            <p className="text-[8px] text-text-muted truncate mt-0.5">{p.client}{p.location ? ` · ${p.location}` : ''}</p>
            {lastMsg && <p className="text-[8px] text-text-muted/70 truncate mt-0.5 italic">{lastMsg.body?.slice(0, 40) || (lastMsg.imageUrls?.length ? '📷 Image' : '')}</p>}
          </button>
        );
      })}
    </>
  );

  return (
    <div className="space-y-5">
      <header className="page-header">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2">
            <MessageSquare size={12} />
            Field Terminal
          </p>
          <h1 className="page-title">Messages</h1>
          <p className="page-subtitle">Direct messages and project communications.</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border-sub">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'text-[10px] font-black uppercase tracking-widest px-5 py-3 border-b-2 transition-colors whitespace-nowrap',
              activeTab === tab ? 'border-brand-red text-brand-red' : 'border-transparent text-text-muted hover:text-text-secondary'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Messages Tab ── */}
      {activeTab === 'Messages' && (
        <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[500px]">
          {/* Contacts sidebar */}
          <div className="w-[200px] shrink-0 flex flex-col border border-border-sub rounded-xl bg-bg-secondary overflow-hidden">
            <div className="p-2 border-b border-border-sub shrink-0 space-y-1.5">
              <p className="text-[8px] font-black uppercase tracking-widest text-text-muted px-1">Conversations</p>
              <Select value={contactFilter} onValueChange={(v) => setContactFilter(v as typeof contactFilter)}>
                <SelectTrigger className="h-7 text-[9px] font-bold uppercase tracking-widest bg-bg-tertiary border-border-sub">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="admins">Admins</SelectItem>
                  <SelectItem value="techs">Techs</SelectItem>
                  <SelectItem value="clients">Clients</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
            {visiblePartners.map(id => (
              <button
                key={id}
                onClick={() => { setSelectedContactId(id); markDMsRead(id); }}
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
                          isMe ? 'bg-brand-red text-white rounded-tr-sm' : 'bg-bg-tertiary border border-border-sub text-text-primary rounded-tl-sm'
                        )}>
                          {msg.body && <p className="text-[11px] leading-relaxed">{msg.body}</p>}
                          {msg.imageUrls?.map((url, i) => (
                            <img key={i} src={url} alt="Attachment" className="mt-2 max-w-[200px] rounded-lg cursor-pointer" onClick={() => window.open(url, '_blank')} />
                          ))}
                          <p className={cn('text-[8px] mt-1 font-mono', isMe ? 'text-white/60' : 'text-text-muted')}>
                            {msg.timestamp || msg.createdAt ? format(parseISO(msg.timestamp || msg.createdAt!), 'MMM d, h:mm a') : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>

            <div className="border-t border-border-sub p-3 space-y-2 bg-bg-primary shrink-0">
              {dmImageUrl && (
                <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-border-sub">
                  <img src={dmImageUrl} alt="Preview" className="w-full h-full object-cover" />
                  <button onClick={() => setDmImageUrl(null)} className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/60 flex items-center justify-center">
                    <X size={8} className="text-white" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input type="file" ref={dmFileRef} accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f, setDmImageUrl, dmFileRef); }} />
                <button onClick={() => dmFileRef.current?.click()} disabled={imageUploading} className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg border border-border-main bg-bg-secondary hover:border-brand-red/60 transition-colors">
                  <Paperclip size={14} className="text-text-muted" />
                </button>
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
                  disabled={sending || imageUploading || (!body.trim() && !dmImageUrl)}
                >
                  <Send size={13} />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Project Comms Tab ── */}
      {activeTab === 'Project Comms' && (
        <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[500px]">
          {/* Project list */}
          <div className="w-[220px] shrink-0 border border-border-sub rounded-xl overflow-hidden bg-bg-secondary flex flex-col">
            <div className="px-3 py-2.5 border-b border-border-sub">
              <p className="text-[9px] font-black text-text-muted uppercase tracking-widest flex items-center gap-2">
                <Briefcase size={10} /> My Projects
              </p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-1.5">
                {myActiveProjects.length === 0 && myOnHoldProjects.length === 0 && myCompletedProjects.length === 0 ? (
                  <p className="text-[9px] text-text-muted text-center py-6 uppercase tracking-widest">No projects assigned</p>
                ) : (
                  <>
                    {myActiveProjects.length > 0 && (
                      <ProjectListSection label="Active" projects={myActiveProjects} labelColor="text-brand-red" />
                    )}
                    {myOnHoldProjects.length > 0 && (
                      <ProjectListSection label="On Hold" projects={myOnHoldProjects} labelColor="text-text-amber" />
                    )}
                    {myCompletedProjects.length > 0 && (
                      <ProjectListSection label="Completed" projects={myCompletedProjects} labelColor="text-text-muted" />
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Project thread */}
          <div className="flex-1 flex flex-col border border-border-sub rounded-xl overflow-hidden bg-bg-secondary">
            {!selectedProjectId ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Briefcase size={28} className="text-text-muted mx-auto mb-3" />
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Select a project to view its thread</p>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b border-border-sub px-4 py-2.5 bg-bg-tertiary/40 shrink-0">
                  <p className="text-[11px] font-black uppercase tracking-widest text-text-primary">{selectedProject?.name}</p>
                  <p className="text-[9px] text-text-muted mt-0.5">{selectedProject?.client}{selectedProject?.location ? ` · ${selectedProject.location}` : ''}</p>
                </div>

                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-3">
                    {projectThread.length === 0 ? (
                      <div className="py-16 text-center">
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">No messages yet — start the conversation!</p>
                      </div>
                    ) : (
                      projectThread.map(msg => {
                        const isMe = msg.senderId === myId;
                        const senderName = msg.senderName || technicians.find(t => t.id === msg.senderId)?.name || 'Admin';
                        return (
                          <div key={msg.id} className={cn('flex flex-col', isMe ? 'items-end' : 'items-start')}>
                            {!isMe && <p className="text-[8px] font-bold text-text-muted uppercase mb-0.5 ml-1">{senderName}</p>}
                            <div className={cn(
                              'max-w-[70%] px-3 py-2 rounded-xl',
                              isMe ? 'bg-brand-red text-white rounded-tr-sm' : 'bg-bg-tertiary border border-border-sub text-text-primary rounded-tl-sm'
                            )}>
                              {msg.body && <p className="text-[11px] leading-relaxed">{msg.body}</p>}
                              {msg.imageUrls?.map((url, i) => (
                                <img key={i} src={url} alt="Attachment" className="mt-2 max-w-[200px] rounded-lg cursor-pointer" onClick={() => window.open(url, '_blank')} />
                              ))}
                              <p className={cn('text-[8px] mt-1 font-mono', isMe ? 'text-white/60' : 'text-text-muted')}>
                                {msg.timestamp || msg.createdAt ? format(parseISO(msg.timestamp || msg.createdAt!), 'MMM d, h:mm a') : ''}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={projBottomRef} />
                  </div>
                </ScrollArea>

                <div className="border-t border-border-sub p-3 space-y-2 bg-bg-primary shrink-0">
                  {projectImageUrl && (
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-border-sub">
                      <img src={projectImageUrl} alt="Preview" className="w-full h-full object-cover" />
                      <button onClick={() => setProjectImageUrl(null)} className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/60 flex items-center justify-center">
                        <X size={8} className="text-white" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input type="file" ref={projFileRef} accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f, setProjectImageUrl, projFileRef); }} />
                    <button onClick={() => projFileRef.current?.click()} disabled={imageUploading} className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg border border-border-main bg-bg-secondary hover:border-brand-red/60 transition-colors">
                      <Paperclip size={14} className="text-text-muted" />
                    </button>
                    <Input
                      className="flex-1 h-9 text-[11px] bg-bg-secondary border-border-main"
                      placeholder="Type a project message..."
                      value={projectBody}
                      onChange={e => setProjectBody(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendProject(); } }}
                    />
                    <Button
                      size="sm"
                      className="h-9 bg-brand-red hover:bg-brand-red/90 text-white shrink-0"
                      onClick={handleSendProject}
                      disabled={sending || imageUploading || (!projectBody.trim() && !projectImageUrl)}
                    >
                      <Send size={13} />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Broadcasts Tab ── */}
      {activeTab === 'Broadcasts' && (
        <div className="space-y-3">
          {broadcasts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-sub p-16 text-center">
              <Radio size={32} className="text-text-muted mx-auto mb-3" />
              <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest">No broadcasts</p>
              <p className="text-[10px] text-text-muted mt-1">Admin messages targeted to you will appear here.</p>
            </div>
          ) : (
            broadcasts
              .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
              .map(b => {
                const isAcknowledged = (b as any).acknowledgedBy?.includes(myId);
                return (
                  <div
                    key={b.id}
                    className={cn(
                      'p-4 rounded-xl border transition-all',
                      isAcknowledged
                        ? 'border-border-sub bg-bg-secondary opacity-70'
                        : 'border-brand-red/20 bg-brand-red-dim/5'
                    )}
                    onClick={async () => {
                      if (!isAcknowledged && myId) {
                        await updateDoc(doc(db, 'broadcasts', b.id), { acknowledgedBy: arrayUnion(myId) });
                      }
                    }}
                  >
                    <div className="flex items-start gap-3 mb-2">
                      <div className={cn(
                        'p-1.5 rounded-lg border shrink-0',
                        b.type === 'critical' ? 'bg-brand-red-dim border-brand-red/30 text-brand-red' :
                        b.type === 'warning' ? 'bg-accent-gold-dim border-accent-gold/30 text-accent-gold' :
                        'bg-bg-tertiary border-border-sub text-text-muted'
                      )}>
                        <Radio size={12} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[12px] font-bold text-text-primary uppercase tracking-wide truncate">{b.subject}</p>
                          {!isAcknowledged && (
                            <span className="h-2 w-2 rounded-full bg-brand-red shrink-0" />
                          )}
                        </div>
                        <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest mt-0.5">
                          {b.timestamp ? format(parseISO(b.timestamp), 'MMM d, yyyy h:mm a') : ''} · {b.senderName || 'Admin'}
                        </p>
                      </div>
                    </div>
                    <p className="text-[11px] text-text-secondary leading-relaxed ml-9">{b.body}</p>
                    {!isAcknowledged && (
                      <p className="text-[8px] text-text-muted mt-2 ml-9 uppercase font-bold tracking-widest">Click to mark as read</p>
                    )}
                  </div>
                );
              })
          )}
        </div>
      )}
    </div>
  );
}
