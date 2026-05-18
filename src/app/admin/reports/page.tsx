'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
    Search, 
    MapPin, 
    X, 
    Clock, 
    Building2,
    ChevronRight,
    History,
    AlertTriangle,
    Calendar as CalendarIcon,
    RefreshCw,
    User,
    Mail,
    Phone,
    Briefcase,
    ShieldAlert,
    Check,
    Coins,
    LogOut,
    Eye,
    Activity as ActivityIcon,
    SearchX,
    FileText,
    ArrowLeft,
    Send,
    MessageSquare,
    Lock,
    TrendingUp,
    CheckCircle2,
    ArrowUpDown
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription, 
    DialogFooter,
    DialogTrigger,
    DialogClose
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { 
    technicians, 
    workOrders as initialWorkOrders, 
    projects, 
    penaltyEvents,
    weeklyLogs,
    expenses,
    timeOffRequests,
    assignmentTimeLogs,
    adminMessages as initialMessages,
} from '@/lib/data';
import { cn } from '@/lib/utils';
import { JobDetailDialog } from '@/components/job-detail-dialog';
import type { Technician, WorkOrder, WeeklyLog, Expense, TimeOffRequest, AssignmentTimeLog, Project, AdminMessage } from '@/lib/types';
import { format, parseISO, subDays, isAfter, isBefore, addHours, addDays, addWeeks, isSameDay, startOfDay } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams } from 'next/navigation';

export default function ActivityAuditPage() {
    const searchParams = useSearchParams();
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || "tech");
    const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
    const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
    
    // Mission Registry state for local updates
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>(initialWorkOrders);

    // Audit Detail States
    const [visitSortDir, setVisitSortDir] = useState<'desc' | 'asc'>('desc');
    const [visitDateRange, setVisitDateRange] = useState<DateRange | undefined>(undefined);

    // Messaging State
    const [messages, setMessages] = useState<AdminMessage[]>([]);
    const [isBroadcasting, setIsBroadcasting] = useState(false);
    const [newMessage, setNewMessage] = useState<Partial<AdminMessage>>({
        type: 'info',
        targetPortal: 'all',
        subject: '',
        body: '',
        isLocked: false
    });
    const [durationHours, setDurationHours] = useState("24");

    // Change Log States
    const [isClLoaded, setIsClLoaded] = useState(false);
    const [clSearch, setClSearch] = useState("");
    const [clType, setClType] = useState("all");
    const [expandedClIds, setExpandedClIds] = useState<Set<string>>(new Set());

    // Job Detail state
    const [isJobOpen, setIsJobOpen] = useState(false);
    const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);

    const { toast } = useToast();

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab) setActiveTab(tab);
    }, [searchParams]);

    // Load messages from registry
    useEffect(() => {
        const stored = localStorage.getItem('aaromach_broadcast_ledger');
        const localMsgs = stored ? JSON.parse(stored) : [];
        
        const revokedJson = localStorage.getItem('aaromach_revoked_messages');
        const revokedIds = revokedJson ? JSON.parse(revokedJson) : [];
        
        const filteredInitial = initialMessages.filter(m => !revokedIds.includes(m.id));
        setMessages([...localMsgs, ...filteredInitial]);
    }, []);

    // ── DATA RESOLUTION ──────────────────────────────────────────────────

    const activeTech = useMemo(() => technicians.find(t => t.id === selectedTechId), [selectedTechId]);

    const techStats = useMemo(() => {
        if (!selectedTechId) return null;
        const myJobs = workOrders.filter(wo => wo.assignedTechnicianId === selectedTechId);
        const completed = myJobs.filter(wo => wo.status === 'completed').length;
        const penalties = penaltyEvents.filter(pe => pe.technicianId === selectedTechId);
        const points = penalties.reduce((acc, curr) => acc + Math.abs(curr.points), 0);
        const reliability = Math.max(0, 100 - (points * 5));
        
        return { total: myJobs.length, completed, reliability, penaltyPoints: points, penalties };
    }, [selectedTechId, workOrders]);

    const siteList = useMemo(() => {
        const uniqueSites = new Map();
        technicians.forEach(t => {
            t.managedSites?.forEach(s => uniqueSites.set(s.location, { ...s, client: t.clientCompany || 'Strategic Partner' }));
        });
        workOrders.forEach(wo => {
            if (!uniqueSites.has(wo.location)) {
                uniqueSites.set(wo.location, { id: `site-${wo.location.replace(/\s+/g, '-').toLowerCase()}`, name: wo.location.split(',')[0], location: wo.location, client: wo.clientName });
            }
        });
        return Array.from(uniqueSites.values());
    }, [workOrders]);

    const activeSite = useMemo(() => siteList.find(s => s.id === selectedSiteId), [selectedSiteId, siteList]);

    const siteHistorical = useMemo(() => {
        if (!activeSite) return [];
        return workOrders.filter(wo => wo.location === activeSite.location && wo.status === 'completed');
    }, [activeSite, workOrders]);

    const siteActive = useMemo(() => {
        if (!activeSite) return [];
        return workOrders.filter(wo => wo.location === activeSite.location && wo.status !== 'completed');
    }, [activeSite, workOrders]);

    const sortedAllSiteVisits = useMemo(() => {
        if (!activeSite) return [];
        let all = workOrders.filter(wo => wo.location === activeSite.location);

        if (visitDateRange?.from) {
            all = all.filter(wo => {
                try {
                    const parts = wo.scheduleDate.split(/[-/]/);
                    let woDate;
                    if (parts[0].length === 4) {
                        woDate = startOfDay(new Date(wo.scheduleDate));
                    } else {
                        const [m, d, y] = parts;
                        woDate = startOfDay(new Date(parseInt(y), parseInt(m) - 1, parseInt(d)));
                    }
                    
                    if (visitDateRange.from && visitDateRange.to) {
                        return woDate >= startOfDay(visitDateRange.from) && woDate <= startOfDay(visitDateRange.to);
                    }
                    if (visitDateRange.from) {
                        return isSameDay(woDate, visitDateRange.from);
                    }
                    return true;
                } catch (e) { 
                    console.error("Error parsing mission date:", wo.scheduleDate);
                    return false; 
                }
            });
        }

        return all.sort((a, b) => {
            const parseDate = (str: string) => {
                const parts = str.split(/[-/]/);
                if (parts[0].length === 4) return new Date(str).getTime();
                const [m, d, y] = parts;
                return new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).getTime();
            };
            const dateA = parseDate(a.scheduleDate);
            const dateB = parseDate(b.scheduleDate);
            return visitSortDir === 'desc' ? dateB - dateA : dateA - dateB;
        });
    }, [activeSite, visitSortDir, visitDateRange, workOrders]);

    const anomalyCounts = useMemo(() => {
        const unassigned = workOrders.filter(wo => wo.status === 'unassigned').length;
        const overdueLogs = weeklyLogs.filter(wl => wl.status === 'Draft' && isBefore(parseISO('2024-07-28'), new Date())).length;
        const openCheckins = assignmentTimeLogs.filter(atl => !atl.checkOutTime).length;
        return unassigned + overdueLogs + openCheckins + 2;
    }, [workOrders]);

    const handleTabChange = (val: string) => {
        setActiveTab(val);
        setSelectedTechId(null);
        setSelectedSiteId(null);
    };

    const handleJobUpdate = (woId: string, updates: Partial<WorkOrder>) => {
        setWorkOrders(prev => prev.map(order => 
            order.id === woId ? { ...order, ...updates } : order
        ));
        if (selectedJob?.id === woId) {
            setSelectedJob(prev => prev ? { ...prev, ...updates } : null);
        }
    };

    // ── BROADCAST LOGIC ──────────────────────────────────────────────────

    const handleBroadcast = () => {
        if (!newMessage.subject || !newMessage.body) {
            toast({ variant: 'destructive', title: 'Broadcast Error', description: 'Please provide both a subject and a message body.' });
            return;
        }

        let expiresAt: string | undefined = undefined;
        const now = new Date();
        if (durationHours === "1") expiresAt = addHours(now, 1).toISOString();
        else if (durationHours === "4") expiresAt = addHours(now, 4).toISOString();
        else if (durationHours === "24") expiresAt = addDays(now, 1).toISOString();
        else if (durationHours === "168") expiresAt = addWeeks(now, 1).toISOString();

        const msg: AdminMessage = {
            id: `msg-${Date.now()}`,
            senderId: 'admin-001',
            senderName: 'Sarah Connor',
            subject: newMessage.subject!,
            body: newMessage.body!,
            timestamp: now.toISOString(),
            expiresAt,
            isLocked: newMessage.isLocked,
            type: newMessage.type as any,
            targetPortal: newMessage.targetPortal as any
        };

        const updatedMessages = [msg, ...messages];
        setMessages(updatedMessages);
        
        const storedOnly = updatedMessages.filter(m => !initialMessages.some(im => im.id === m.id));
        localStorage.setItem('aaromach_broadcast_ledger', JSON.stringify(storedOnly));
        
        window.dispatchEvent(new Event('storage'));

        setIsBroadcasting(false);
        setNewMessage({ type: 'info', targetPortal: 'all', subject: '', body: '', isLocked: false });
        setDurationHours("24");
        toast({ title: 'Message Broadcasted', description: `Message transmitted to ${newMessage.targetPortal} portal(s).` });
    };

    const handleRevokeBroadcast = (id: string) => {
        const updatedMessages = messages.filter(m => m.id !== id);
        setMessages(updatedMessages);
        
        const storedOnly = updatedMessages.filter(m => !initialMessages.some(im => im.id === m.id));
        localStorage.setItem('aaromach_broadcast_ledger', JSON.stringify(storedOnly));
        
        const revokedJson = localStorage.getItem('aaromach_revoked_messages');
        let revokedIds = revokedJson ? JSON.parse(revokedJson) : [];
        if (initialMessages.some(im => im.id === id) && !revokedIds.includes(id)) {
            revokedIds.push(id);
            localStorage.setItem('aaromach_revoked_messages', JSON.stringify(revokedIds));
        }

        window.dispatchEvent(new Event('storage'));
        toast({ title: 'Broadcast Revoked', description: 'Directive removed from all terminals.' });
    };

    // ── SEARCH LOGIC ─────────────────────────────────────────────────────

    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase();
        const results: any[] = [];
        
        technicians.forEach(t => {
            if (t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q)) {
                results.push({ type: 'Technician', id: t.id, label: t.name, meta: `${t.email} · ${t.role} · active`, cls: 'bg-green-dim text-text-green' });
            }
        });

        workOrders.forEach(wo => {
            if (wo.id.toLowerCase().includes(q) || wo.description.toLowerCase().includes(q)) {
                results.push({ type: 'Assignment', id: wo.id, label: `WO ${wo.id.toUpperCase()} — ${wo.description}`, meta: `${wo.clientName} · ${wo.location} · $${wo.pay} · ${wo.status}`, cls: 'bg-bg-tertiary text-text-primary' });
            }
        });

        projects.forEach(p => {
            if (p.name.toLowerCase().includes(q) || p.client.toLowerCase().includes(q)) {
                results.push({ type: 'Project', id: p.id, label: `${p.name} — ${p.client}`, meta: `${p.location} · ${p.status}`, cls: 'bg-accent-gold-dim text-accent-gold' });
            }
        });

        return results;
    }, [searchQuery, workOrders]);

    const handleResultClick = (result: any) => {
        if (result.type === 'Technician') {
            setSelectedTechId(result.id);
            setSearchQuery("");
            setActiveTab("tech");
        } else if (result.type === 'Assignment') {
            const wo = workOrders.find(w => w.id === result.id);
            if (wo) {
                setSelectedJob(wo);
                setIsJobOpen(true);
            }
        }
    };

    // ── RENDER HELPERS ───────────────────────────────────────────────────

    const renderTechnicianRoster = () => (
        <div className="space-y-2">
            <div className="flex justify-between items-center px-1 mb-4">
                <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest">{technicians.filter(t => !t.roles?.includes('client')).length} Field Operatives</p>
                <Button variant="ghost" size="sm" className="h-7 text-[10px] uppercase font-bold text-text-muted" onClick={() => { setSelectedTechId(null); setSelectedSiteId(null); }}>
                    <RefreshCw size={12} className="mr-1.5"/> Refresh
                </Button>
            </div>
            {technicians.filter(t => !t.roles?.includes('client')).map(t => {
                const pts = penaltyEvents.filter(p => p.technicianId === t.id).reduce((s, p) => s + Math.abs(p.points), 0);
                const isReliable = pts <= 2;
                return (
                    <div key={t.id} onClick={() => setSelectedTechId(t.id)} className="flex items-center justify-between p-4 rounded-xl bg-bg-secondary border border-border-main hover:border-brand-red transition-all cursor-pointer group">
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <Avatar className="h-10 w-10 border border-border-sub">
                                    <AvatarImage src={t.avatarUrl} />
                                    <AvatarFallback>{t.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                {assignmentTimeLogs.some(log => log.technicianId === t.id && !log.checkOutTime) && (
                                    <div className="absolute -top-1 -right-1 h-3 w-3 bg-text-green rounded-full border-2 border-bg-secondary animate-pulse" />
                                )}
                            </div>
                            <div className="text-left">
                                <p className="text-sm font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors">{t.name}</p>
                                <p className="text-[10px] text-text-muted uppercase tracking-widest mt-0.5">{t.email}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="text-right">
                                <p className={cn("text-xs font-bold uppercase", isReliable ? 'text-text-green' : 'text-accent-gold')}>
                                    {pts} PTS · {isReliable ? 'Reliable' : 'At Risk'}
                                </p>
                            </div>
                            <Badge variant={isReliable ? 'active' : 'onhold'} className="h-5 text-[8px] uppercase tracking-widest">
                                {isReliable ? 'Clean' : 'Audit Required'}
                            </Badge>
                            <ChevronRight size={16} className="text-text-muted group-hover:text-text-primary transition-all" />
                        </div>
                    </div>
                );
            })}
        </div>
    );

    const renderMessaging = () => (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center bg-bg-secondary p-4 rounded-xl border border-border-sub">
                <div className="flex items-center gap-3">
                    <MessageSquare className="text-brand-red h-5 w-5" />
                    <div className="text-left">
                        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide">Operational Communications</h3>
                        <p className="text-[10px] text-text-muted uppercase tracking-widest">System-wide broadcast terminal</p>
                    </div>
                </div>
                <Button onClick={() => setIsBroadcasting(true)} className="bg-brand-red hover:bg-brand-red-hover h-9 px-6 text-[10px] font-bold uppercase tracking-widest">
                    <Send size={14} className="mr-2" />
                    Broadcast Message
                </Button>
            </div>

            <div className="space-y-3">
                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1 text-left">Message Ledger</h3>
                <div className="space-y-2">
                    {messages.map(msg => (
                        <div key={msg.id} className="p-4 rounded-xl border border-border-sub bg-bg-secondary space-y-3">
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "p-2 rounded-lg border",
                                        msg.type === 'critical' ? "bg-brand-red-dim text-text-red border-brand-red/30" :
                                        msg.type === 'warning' ? "bg-accent-gold-dim text-accent-gold border-accent-gold/30" :
                                        msg.type === 'success' ? "bg-green-dim text-text-green border-green-border/30" :
                                        "bg-bg-primary text-text-secondary border-border-sub"
                                    )}>
                                        <ActivityIcon size={14} />
                                    </div>
                                    <div className="text-left">
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{msg.subject}</p>
                                            {msg.isLocked && <Lock size={12} className="text-brand-red" />}
                                        </div>
                                        <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest">
                                            {format(parseISO(msg.timestamp), 'MMM d, yyyy HH:mm')} · Target: {msg.targetPortal}
                                            {msg.expiresAt && ` · Expires: ${format(parseISO(msg.expiresAt), 'MMM d, HH:mm')}`}
                                        </p>
                                    </div>
                                </div>
                                <Badge variant="outline" className="text-[8px] uppercase">{msg.type}</Badge>
                            </div>
                            <p className="text-xs text-text-secondary leading-relaxed uppercase font-medium text-left">{msg.body}</p>
                            <div className="pt-3 border-t border-border-sub/30 flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <div className="h-5 w-5 rounded-full bg-bg-tertiary border border-border-sub flex items-center justify-center text-[7px] font-bold">
                                        {msg.senderName.charAt(0)}
                                    </div>
                                    <span className="text-[9px] text-text-muted uppercase font-bold tracking-widest">Sent by {msg.senderName}</span>
                                </div>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 text-[8px] uppercase font-bold text-text-muted hover:text-text-red"
                                    onClick={() => handleRevokeBroadcast(msg.id)}
                                >
                                    Revoke Broadcast
                                </Button>
                            </div>
                        </div>
                    ))}
                    {messages.length === 0 && (
                        <div className="p-12 text-center border-2 border-dashed border-border-sub rounded-xl opacity-40 bg-bg-secondary/30">
                            <MessageSquare size={32} className="mx-auto mb-2 text-text-muted" />
                            <p className="text-[10px] font-bold uppercase tracking-widest">Broadcast registry is empty</p>
                        </div>
                    )}
                </div>
            </div>

            {/* BROADCAST DIALOG */}
            <Dialog open={isBroadcasting} onOpenChange={setIsBroadcasting}>
                <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default">
                    <DialogHeader className="text-left">
                        <DialogTitle className="uppercase tracking-widest font-bold">Compose Broadcast</DialogTitle>
                        <DialogDescription className="text-xs">Transmit a tactical message to the selected portal registry.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Target Portal</Label>
                                <Select value={newMessage.targetPortal} onValueChange={(val: any) => setNewMessage({...newMessage, targetPortal: val})}>
                                    <SelectTrigger className="h-10 bg-bg-primary text-xs uppercase font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Channels</SelectItem>
                                        <SelectItem value="tech">Technicians Only</SelectItem>
                                        <SelectItem value="client">Clients Only</SelectItem>
                                        <SelectItem value="admin">Admin Staff</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Priority Level</Label>
                                <Select value={newMessage.type} onValueChange={(val: any) => setNewMessage({...newMessage, type: val})}>
                                    <SelectTrigger className="h-10 bg-bg-primary text-xs uppercase font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="info">Informational</SelectItem>
                                        <SelectItem value="warning">System Alert</SelectItem>
                                        <SelectItem value="critical">Critical/Emergency</SelectItem>
                                        <SelectItem value="success">Operational Success</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Broadcast Duration</Label>
                                <Select value={durationHours} onValueChange={setDurationHours}>
                                    <SelectTrigger className="h-10 bg-bg-primary text-xs uppercase font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">1 Hour</SelectItem>
                                        <SelectItem value="4">4 Hours</SelectItem>
                                        <SelectItem value="24">24 Hours</SelectItem>
                                        <SelectItem value="168">7 Days</SelectItem>
                                        <SelectItem value="permanent">Permanent</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] uppercase font-bold text-text-muted block mb-2">Registry Lock</Label>
                                <div className="flex items-center justify-between p-2 rounded bg-bg-primary border border-border-sub h-10">
                                    <span className="text-[9px] font-bold uppercase text-text-muted">Lock Directive</span>
                                    <Switch 
                                        checked={newMessage.isLocked} 
                                        onCheckedChange={(val) => setNewMessage({...newMessage, isLocked: val})}
                                        className="scale-75"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] uppercase font-bold text-text-muted">Subject / Headline</Label>
                            <Input 
                                placeholder="Clear, concise directive..." 
                                value={newMessage.subject}
                                onChange={e => setNewMessage({...newMessage, subject: e.target.value})}
                                className="h-10 bg-bg-primary text-xs uppercase font-bold"
                            />
                        </div>
                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] uppercase font-bold text-text-muted">Message Body</Label>
                            <Textarea 
                                placeholder="Provide full context and required actions..." 
                                value={newMessage.body}
                                onChange={e => setNewMessage({...newMessage, body: e.target.value})}
                                className="bg-bg-primary text-xs h-32 leading-relaxed uppercase font-medium"
                            />
                        </div>
                    </div>
                    <DialogFooter className="bg-bg-tertiary/30 -mx-6 -mb-6 p-6 border-t border-border-default">
                        <Button variant="outline" onClick={() => setIsBroadcasting(false)}>Cancel</Button>
                        <Button onClick={handleBroadcast} className="bg-brand-red hover:bg-brand-red-hover px-10">
                            <Send size={16} className="mr-2" /> Execute Broadcast
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );

    const renderSiteActivity = () => {
        if (selectedSiteId && activeSite) {
            return (
                <div className="space-y-8 animate-in fade-in duration-300">
                    <div className="flex items-center justify-between">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedSiteId(null)} className="h-8 text-[10px] uppercase font-bold text-text-muted">
                            <ArrowLeft size={14} className="mr-1.5"/> Back to Site Index
                        </Button>
                    </div>

                    <Card className="bg-bg-secondary border-border-main shadow-2xl">
                        <CardHeader className="pb-4 text-left">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <CardTitle className="text-lg uppercase tracking-wider">{activeSite.name}</CardTitle>
                                    <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest flex items-center gap-1.5">
                                        <MapPin size={10} className="text-brand-red"/> {activeSite.location}
                                    </p>
                                </div>
                                <Badge variant="active" className="text-[8px] uppercase tracking-widest">Managed Asset</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-3 gap-4">
                                {/* TOTAL VISITS DIALOG */}
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <div className="p-4 rounded-xl bg-bg-primary border border-border-sub text-center space-y-1 cursor-pointer hover:border-text-muted transition-all group">
                                            <p className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] group-hover:text-brand-red">Total Visits</p>
                                            <p className="text-2xl font-bold text-text-primary">{sortedAllSiteVisits.length}</p>
                                            <p className="text-[8px] text-text-muted uppercase font-bold tracking-widest">all time</p>
                                        </div>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[800px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[90vh] shadow-2xl">
                                        <DialogHeader className="p-6 border-b border-border-sub bg-bg-tertiary/30 text-left">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <History size={20} className="text-brand-red" />
                                                    <DialogTitle className="text-lg font-bold uppercase tracking-widest">Visit Registry Audit</DialogTitle>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex items-center gap-1 bg-bg-primary border border-border-sub rounded-md p-0.5 h-7">
                                                        <div className="flex items-center gap-1 px-1.5 border-r border-border-sub">
                                                            <CalendarIcon size={10} className="text-text-muted" />
                                                            <input 
                                                                type="date" 
                                                                className="bg-transparent border-none focus:ring-0 text-[9px] font-mono p-0 h-auto w-[90px] uppercase"
                                                                value={visitDateRange?.from ? format(visitDateRange.from, 'yyyy-MM-dd') : ''}
                                                                onChange={(e) => {
                                                                    const d = e.target.value ? new Date(e.target.value + 'T12:00:00') : undefined;
                                                                    setVisitDateRange(prev => ({ from: d, to: prev?.to }));
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="flex items-center gap-1 px-1.5">
                                                            <input 
                                                                type="date" 
                                                                className="bg-transparent border-none focus:ring-0 text-[9px] font-mono p-0 h-auto w-[90px] uppercase"
                                                                value={visitDateRange?.to ? format(visitDateRange.to, 'yyyy-MM-dd') : ''}
                                                                onChange={(e) => {
                                                                    const d = e.target.value ? new Date(e.target.value + 'T12:00:00') : undefined;
                                                                    setVisitDateRange(prev => ({ from: prev?.from, to: d }));
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                    {visitDateRange?.from && (
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-text-muted hover:text-text-red" onClick={() => setVisitDateRange(undefined)}>
                                                            <X size={12} />
                                                        </Button>
                                                    )}
                                                    <Separator orientation="vertical" className="h-4 mx-1 bg-border-sub" />
                                                    <Select value={visitSortDir} onValueChange={(val: any) => setVisitSortDir(val)}>
                                                        <SelectTrigger className="h-7 w-[100px] text-[8px] font-bold uppercase tracking-widest bg-bg-primary">
                                                            <div className="flex items-center gap-1.5">
                                                                <ArrowUpDown size={10} />
                                                                <SelectValue />
                                                            </div>
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="desc" className="text-[8px] font-bold uppercase">Newest</SelectItem>
                                                            <SelectItem value="asc" className="text-[8px] font-bold uppercase">Oldest</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                            <DialogDescription className="text-xs uppercase font-bold text-text-muted mt-1">Comprehensive historical manifest for site coordinate: {activeSite.name}</DialogDescription>
                                        </DialogHeader>
                                        <ScrollArea className="flex-1">
                                            <div className="p-6 space-y-3">
                                                {sortedAllSiteVisits.length > 0 ? sortedAllSiteVisits.map(wo => (
                                                    <div 
                                                        key={wo.id} 
                                                        onClick={() => { setSelectedJob(wo); setIsJobOpen(true); }}
                                                        className="p-4 rounded-xl bg-bg-secondary border border-border-sub hover:border-text-muted transition-all group flex items-center justify-between cursor-pointer"
                                                    >
                                                        <div className="flex items-center gap-4 text-left">
                                                            <div className={cn(
                                                                "p-2 rounded border border-border-sub",
                                                                wo.status === 'completed' ? "bg-green-dim text-text-green border-green-border/30" : "bg-bg-primary text-accent-gold border-border-sub"
                                                            )}>
                                                                {wo.status === 'completed' ? <CheckCircle2 size={18}/> : <ActivityIcon size={18}/>}
                                                            </div>
                                                            <div className="text-left">
                                                                <div className="flex items-center gap-2">
                                                                    <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{wo.description}</p>
                                                                    <Badge variant={wo.status === 'completed' ? 'active' : 'onhold'} className="h-3.5 text-[7px] uppercase px-1">{wo.status}</Badge>
                                                                </div>
                                                                <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest mt-0.5">
                                                                    ID: {wo.id.toUpperCase()} · Scheduled: {wo.scheduleDate}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <Button variant="ghost" size="sm" className="h-8 text-[10px] uppercase font-bold">View Detail</Button>
                                                    </div>
                                                )) : (
                                                    <div className="py-24 text-center border-2 border-dashed border-border-sub rounded-xl opacity-40 bg-bg-secondary/30">
                                                        <History size={48} className="mx-auto mb-2 text-text-muted" />
                                                        <p className="text-[10px] font-bold uppercase tracking-widest">No visit records in registry</p>
                                                    </div>
                                                )}
                                            </div>
                                        </ScrollArea>
                                        <DialogFooter className="p-4 bg-bg-secondary/30 border-t border-border-default">
                                            <DialogClose asChild>
                                                <Button variant="outline" className="w-full uppercase font-bold text-[10px] tracking-widest h-10">Close Terminal</Button>
                                            </DialogClose>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>

                                {/* OPEN TICKETS DIALOG */}
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <div className="p-4 rounded-xl bg-bg-primary border border-border-sub text-center space-y-1 cursor-pointer hover:border-text-muted transition-all group">
                                            <p className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] group-hover:text-brand-red">Open Tickets</p>
                                            <p className="text-2xl font-bold text-text-primary">{siteActive.length}</p>
                                            <p className={cn("text-[8px] uppercase font-bold tracking-widest", siteActive.length > 0 ? "text-accent-gold" : "text-text-green")}>
                                                {siteActive.length > 0 ? 'Active Queue' : 'Service Clean'}
                                            </p>
                                        </div>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[800px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[90vh] shadow-2xl">
                                        <DialogHeader className="p-6 border-b border-border-sub bg-bg-tertiary/30 text-left">
                                            <div className="flex items-center gap-3">
                                                <AlertTriangle size={20} className="text-accent-gold" />
                                                <DialogTitle className="text-lg font-bold uppercase tracking-widest">Active Mission Audit</DialogTitle>
                                            </div>
                                            <DialogDescription className="text-xs uppercase font-bold text-text-muted">Live dispatch buffer and intake funnel for site coordinate: {activeSite.name}</DialogDescription>
                                        </DialogHeader>
                                        <ScrollArea className="flex-1">
                                            <div className="p-6 space-y-3">
                                                {siteActive.length > 0 ? siteActive.map(wo => (
                                                    <div 
                                                        key={wo.id} 
                                                        onClick={() => { setSelectedJob(wo); setIsJobOpen(true); }}
                                                        className="p-4 rounded-xl bg-bg-secondary border border-border-sub hover:border-text-muted transition-all group flex items-center justify-between cursor-pointer"
                                                    >
                                                        <div className="flex items-center gap-4 text-left">
                                                            <div className="p-2 bg-bg-primary rounded border border-border-sub text-accent-gold">
                                                                <Clock size={18} />
                                                            </div>
                                                            <div className="text-left">
                                                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{wo.description}</p>
                                                                <div className="flex items-center gap-3 mt-0.5">
                                                                    <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest">
                                                                        ID: {wo.id.toUpperCase()} · {wo.scheduleTime} · {wo.scheduleDate}
                                                                    </p>
                                                                    <Badge variant={wo.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="h-3.5 px-1 text-[7px] uppercase tracking-tighter">
                                                                        {wo.status}
                                                                    </Badge>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <Button variant="ghost" size="sm" className="h-8 text-[10px] uppercase font-bold">Audit Detail</Button>
                                                    </div>
                                                )) : (
                                                    <div className="py-24 text-center border-2 border-dashed border-border-sub rounded-xl opacity-40 bg-bg-secondary/30">
                                                        <CheckCircle2 size={48} className="mx-auto mb-2 text-text-green" />
                                                        <p className="text-[10px] font-bold uppercase tracking-widest">Mission funnel clear: No active tickets</p>
                                                    </div>
                                                )}
                                            </div>
                                        </ScrollArea>
                                        <DialogFooter className="p-4 bg-bg-secondary/30 border-t border-border-default">
                                            <DialogClose asChild>
                                                <Button variant="outline" className="w-full uppercase font-bold text-[10px] tracking-widest h-10">Close Audit Terminal</Button>
                                            </DialogClose>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>

                                <div className="p-4 rounded-xl bg-bg-primary border border-border-sub text-center space-y-1">
                                    <p className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em]">Uptime Tier</p>
                                    <p className="text-2xl font-bold text-text-primary">99.9%</p>
                                    <p className="text-[8px] text-text-muted uppercase font-bold tracking-widest">Contract SLA</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            );
        }

        return (
            <div className="space-y-2">
                <div className="flex justify-between items-center px-1 mb-4">
                    <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest">{siteList.length} Site Coordinates</p>
                </div>
                {siteList.map(site => (
                    <div key={site.id} onClick={() => setSelectedSiteId(site.id)} className="flex items-center justify-between p-4 rounded-xl bg-bg-secondary border border-border-main hover:border-brand-red transition-all cursor-pointer group">
                        <div className="flex items-center gap-4">
                            <div className="p-2.5 bg-bg-primary rounded border border-border-sub text-text-muted group-hover:text-brand-red transition-colors">
                                <Building2 size={18} />
                            </div>
                            <div className="text-left">
                                <p className="text-sm font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors">{site.name}</p>
                                <p className="text-[10px] text-text-muted uppercase tracking-widest mt-0.5">{site.client} · {site.location}</p>
                            </div>
                        </div>
                        <ChevronRight size={16} className="text-text-muted group-hover:text-text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="max-w-[1000px] mx-auto space-y-8">
            <header className="space-y-1 text-center">
                <p className="text-[10px] font-black text-brand-red uppercase tracking-[0.3em]">Operational Intelligence Terminal</p>
                <h1 className="text-3xl font-bold uppercase tracking-widest text-text-primary">Activity Audit</h1>
                <p className="text-xs text-text-muted uppercase font-bold tracking-widest mt-2">Live monitor for technicians, sites, anomalies, and system changes</p>
            </header>

            <div className="space-y-6">
                {/* GLOBAL SEARCH TERMINAL */}
                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-text-muted group-focus-within:text-brand-red transition-colors" />
                    <Input 
                        placeholder="Search technicians, work orders, site coordinates, projects…" 
                        className="h-14 pl-12 bg-bg-secondary border-border-main text-sm uppercase font-bold tracking-wide focus:border-brand-red rounded-2xl shadow-xl"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {!searchQuery ? (
                    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                        <div className="flex justify-center">
                            <TabsList className="tabs border-b-2 border-border-sub bg-transparent rounded-none h-auto p-0 gap-12 justify-center mb-8">
                                <TabsTrigger 
                                    value="tech" 
                                    className="tab-trigger-activity"
                                    onClick={() => setSelectedTechId(null)}
                                >
                                    Technician activity
                                </TabsTrigger>
                                <TabsTrigger 
                                    value="sites" 
                                    className="tab-trigger-activity"
                                    onClick={() => setSelectedSiteId(null)}
                                >
                                    Site activity
                                </TabsTrigger>
                                <TabsTrigger value="messaging" className="tab-trigger-activity">Broadcast Comms</TabsTrigger>
                                <TabsTrigger value="flags" className="tab-trigger-activity flex items-center gap-3">
                                    Anomaly flags <Badge variant="destructive" className="h-5 px-1.5 text-[9px] min-w-[20px] flex items-center justify-center font-black">{anomalyCounts}</Badge>
                                </TabsTrigger>
                                <TabsTrigger value="changelog" className="tab-trigger-activity">Change log</TabsTrigger>
                            </TabsList>
                        </div>

                        <div className="min-h-[400px]">
                            <TabsContent value="tech" className="m-0">
                                {selectedTechId ? (
                                    <div className="space-y-8 animate-in fade-in duration-300">
                                        <div className="flex items-center justify-between">
                                            <Button variant="ghost" size="sm" onClick={() => setSelectedTechId(null)} className="h-8 text-[10px] uppercase font-bold text-text-muted">
                                                <ArrowLeft size={14} className="mr-1.5"/> Back to Roster
                                            </Button>
                                        </div>
                                        <Card className="bg-bg-secondary border-border-main shadow-2xl">
                                            <CardContent className="p-6 space-y-8">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-6">
                                                        <Avatar className="h-16 w-16 border-2 border-border-sub">
                                                            <AvatarImage src={activeTech?.avatarUrl} />
                                                            <AvatarFallback>{activeTech?.name.charAt(0)}</AvatarFallback>
                                                        </Avatar>
                                                        <div className="space-y-1 text-left">
                                                            <h2 className="text-xl font-bold text-text-primary uppercase tracking-wide">{activeTech?.name}</h2>
                                                            <p className="text-[10px] text-text-muted font-mono uppercase tracking-widest">{activeTech?.email} · {activeTech?.id.toUpperCase()}</p>
                                                        </div>
                                                    </div>
                                                    <Badge variant="active" className="h-6 px-4 uppercase text-[10px] tracking-widest">Active Profile</Badge>
                                                </div>
                                                <div className="grid grid-cols-3 gap-4">
                                                    <div className="p-4 rounded-xl bg-bg-primary border border-border-sub text-center space-y-1">
                                                        <p className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em]">Assignments</p>
                                                        <p className="text-2xl font-bold text-text-primary">{techStats?.total}</p>
                                                    </div>
                                                    <div className="p-4 rounded-xl bg-bg-primary border border-border-sub text-center space-y-1">
                                                        <p className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em]">Completed</p>
                                                        <p className="text-2xl font-bold text-text-primary">{techStats?.completed}</p>
                                                    </div>
                                                    <div className="p-4 rounded-xl bg-bg-primary border border-border-sub text-center space-y-1">
                                                        <p className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em]">Reliability</p>
                                                        <p className={cn("text-2xl font-bold", techStats && techStats.reliability > 90 ? 'text-text-green' : 'text-accent-gold')}>{techStats?.reliability}%</p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                ) : renderTechnicianRoster()}
                            </TabsContent>

                            <TabsContent value="sites" className="m-0">
                                {renderSiteActivity()}
                            </TabsContent>

                            <TabsContent value="messaging" className="m-0">
                                {renderMessaging()}
                            </TabsContent>

                            <TabsContent value="flags" className="m-0">
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1 text-left">Anomaly Registry</h3>
                                    <div className="space-y-2">
                                        <div className="p-4 rounded-xl border border-border-alert bg-brand-red-dim/5 flex gap-4 text-left">
                                            <div className="h-1.5 w-1.5 rounded-full bg-text-red mt-1 shrink-0" />
                                            <div className="space-y-1">
                                                <p className="text-[11px] font-bold text-text-red uppercase tracking-wide">Schema Drift — <code>project_daily_logs</code></p>
                                                <p className="text-[10px] text-text-muted leading-relaxed uppercase">
                                                    Document <code>atl-GD7bfWeRk</code> uses <code>technicianId</code> instead of the system-standard <code>techId</code>. 
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="changelog" className="m-0">
                                {!isClLoaded ? (
                                    <div className="py-24 text-center border border-border-sub bg-bg-secondary/50 rounded-2xl space-y-6">
                                        <History size={48} className="mx-auto text-text-muted opacity-20" />
                                        <p className="text-sm font-bold uppercase text-text-primary tracking-wide">Load Operational Change Log</p>
                                        <Button onClick={() => setIsClLoaded(true)} className="h-11 px-12 bg-brand-red hover:bg-brand-red-hover font-bold uppercase text-[10px] tracking-widest">
                                            Load From Archive
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-6 text-center">
                                        <p className="text-xs text-text-muted uppercase font-bold italic">Change log streaming active...</p>
                                        <div className="text-text-muted text-[10px] uppercase font-bold tracking-widest p-12 border border-dashed border-border-sub rounded-xl">
                                            Historical timeline data will be populated here as events are recorded.
                                        </div>
                                    </div>
                                )}
                            </TabsContent>
                        </div>
                    </Tabs>
                ) : (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        {searchResults.length > 0 ? searchResults.map((r, i) => (
                            <div key={i} onClick={() => handleResultClick(r)} className="p-5 rounded-2xl border border-border-main bg-bg-secondary hover:border-brand-red transition-all flex gap-5 group cursor-pointer text-left shadow-sm">
                                <Badge variant="outline" className={cn("h-6 text-[9px] uppercase tracking-widest shrink-0 mt-0.5 px-3 font-black", r.cls)}>
                                    {r.type}
                                </Badge>
                                <div className="space-y-1.5 flex-1 min-w-0">
                                    <p className="text-base font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors truncate">{r.label}</p>
                                    <p className="text-[11px] text-text-muted uppercase tracking-widest font-bold leading-relaxed">{r.meta}</p>
                                </div>
                                <ChevronRight size={20} className="text-text-muted group-hover:text-text-primary group-hover:translate-x-1 transition-all self-center" />
                            </div>
                        )) : (
                            <div className="py-24 text-center border-2 border-dashed border-border-main rounded-2xl opacity-60 bg-bg-secondary/30">
                                <SearchX size={48} className="mx-auto text-text-muted mb-4" />
                                <p className="text-sm font-bold uppercase tracking-widest text-text-muted">No operational matches found</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <JobDetailDialog 
                isOpen={isJobOpen} 
                setIsOpen={setIsJobOpen} 
                mission={selectedJob} 
                onUpdate={handleJobUpdate}
            />
            
            <style jsx global>{`
                .tab-trigger-activity {
                    @apply px-0 pb-4 pt-0 h-auto bg-transparent rounded-none border-b-2 border-transparent text-[11px] font-black uppercase tracking-[0.2em] text-text-muted data-[state=active]:bg-transparent data-[state=active]:text-text-primary data-[state=active]:border-brand-red data-[state=active]:shadow-none transition-all;
                }
            `}</style>
        </div>
    );
}
