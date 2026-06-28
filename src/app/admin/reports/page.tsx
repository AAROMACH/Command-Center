'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { makeMessageId } from '@/lib/doc-ids';
import { useRouter, useSearchParams } from 'next/navigation';
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
    ArrowUpDown,
    Wrench,
    DollarSign,
    ShieldCheck,
    ClipboardList,
    Gauge,
    Filter,
    FileCheck,
    Trash2,
    Download
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
    DialogFooter 
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { penaltyEvents } from '@/lib/data';
import { cn, formatCityState } from '@/lib/utils';
import { JobDetailDialog } from '@/components/job-detail-dialog';
import { IntelligenceTerminal } from './components/intelligence-terminal';
import type { Technician, WorkOrder, WeeklyLog, TimeOffRequest, SiteRequest, AdminMessage, Invoice, Project } from '@/lib/types';
import { format, parseISO, subDays, isAfter, addHours, isSameDay, startOfDay, isWithinInterval } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getReliabilityTier, getTierBadgeVariant, getTierColor } from '@/lib/reliability';
import { isAdmin, isSuperAdmin } from '@/lib/permissions';

const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return 'TBD';
    try {
        const parts = dateStr.split(/[-/]/);
        if (parts[0].length === 4) {
            return format(parseISO(dateStr), "MM-dd-yyyy");
        } else {
            const [m, day, y] = parts;
            if (y && m && day) {
                return format(new Date(`${y}-${m}-${day}T12:00:00`), 'MM-dd-yyyy');
            } else {
                return dateStr;
            }
        }
    } catch (e) {
        return dateStr;
    }
};

type AuditRange = 'all' | '7d' | '30d' | 'custom';

export default function ActivityAuditPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || "timeline");
    const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
    const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    
    // Registry states
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [assignments, setAssignments] = useState<WorkOrder[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
    const [siteRequests, setSiteRequests] = useState<SiteRequest[]>([]);

    // Timeline filter state
    const [timelineTechFilter, setTimelineTechFilter] = useState<string>('all');
    const [timelineTypeFilter, setTimelineTypeFilter] = useState<string>('all');
    const [timelineClientFilter, setTimelineClientFilter] = useState('');

    // App Activity filter
    const [activityFilter, setActivityFilter] = useState<'all' | 'admin' | 'tech' | 'client'>('all');

    // Audit Detail States
    const [visitSortDir, setVisitSortDir] = useState<'desc' | 'asc'>('desc');
    const [auditRange, setAuditRange] = useState<AuditRange>('all');
    const [customVisitRange, setCustomVisitRange] = useState<DateRange | undefined>(undefined);

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

    // Job Detail state
    const [isJobOpen, setIsJobOpen] = useState(false);
    const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);

    const { toast } = useToast();

    // 1. Initialize Data Listeners
    useEffect(() => {
        const unsubWO = onSnapshot(collection(db, 'workOrders'), (snap) => {
            setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });
        const unsubAsmt = onSnapshot(collection(db, 'assignments'), (snap) => {
            setAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });
        const unsubTech = onSnapshot(collection(db, 'users'), (snap) => {
            const techs = snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician));
            setTechnicians(techs);
            const userId = sessionStorage.getItem('currentUserId');
            if (userId) {
                const user = techs.find(t => t.id === userId);
                if (user) setCurrentUser(user);
            }
        });
        const unsubLogs = onSnapshot(collection(db, 'weeklyLogs'), (snap) => {
            setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)));
        });
        const unsubProj = onSnapshot(collection(db, 'projects'), (snap) => {
            setProjects(snap.docs.map(d => ({ ...d.data(), id: d.id } as Project)));
        });
        const unsubInv = onSnapshot(collection(db, 'invoices'), (snap) => {
            setInvoices(snap.docs.map(d => ({ ...d.data(), id: d.id } as Invoice)));
        });
        const unsubTOR = onSnapshot(collection(db, 'timeOffRequests'), (snap) => {
            setTimeOffRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as TimeOffRequest)));
        });
        const unsubSiteReqs = onSnapshot(collection(db, 'siteRequests'), (snap) => {
            setSiteRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as SiteRequest)));
        });

        return () => {
            unsubWO(); unsubAsmt(); unsubTech(); unsubLogs(); unsubProj(); unsubInv(); unsubTOR(); unsubSiteReqs();
        };
    }, []);

    // Load broadcast messages from local storage
    useEffect(() => {
        const stored = localStorage.getItem('aaromach_broadcast_ledger');
        const localMsgs = stored ? JSON.parse(stored) : [];
        setMessages(localMsgs);
    }, []);

    const handleBroadcast = useCallback(async () => {
        if (!newMessage.subject || !newMessage.body) {
            toast({ variant: 'destructive', title: 'Transmission Error', description: 'Subject and body are required for broadcast.' });
            return;
        }

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
            expiresAt: addHours(new Date(), parseInt(durationHours)).toISOString()
        };

        const updatedMessages = [msg, ...messages];
        setMessages(updatedMessages);
        localStorage.setItem('aaromach_broadcast_ledger', JSON.stringify(updatedMessages));

        // Persist to Firestore so other users' browsers receive the broadcast
        setDoc(doc(db, 'broadcasts', msg.id), { ...msg, revokedBy: [] }).catch(() => {});

        window.dispatchEvent(new Event('storage'));

        toast({ title: 'Broadcast Executed', description: 'Tactical directive has been transmitted to all target terminals.' });
        setIsBroadcasting(false);
        setNewMessage({ type: 'info', targetPortal: 'all', subject: '', body: '', isLocked: false });
    }, [newMessage, currentUser, messages, durationHours, toast]);

    const handleRevokeBroadcast = useCallback((id: string) => {
        let revokedIds: string[] = [];
        try {
            const revokedJson = localStorage.getItem('aaromach_revoked_messages');
            if (revokedJson) revokedIds = JSON.parse(revokedJson);
        } catch (e) {}

        if (!revokedIds.includes(id)) {
            revokedIds.push(id);
            localStorage.setItem('aaromach_revoked_messages', JSON.stringify(revokedIds));
        }

        const updated = messages.filter(m => m.id !== id);
        setMessages(updated);
        localStorage.setItem('aaromach_broadcast_ledger', JSON.stringify(updated));

        // Mark revoked in Firestore so all clients stop showing it
        updateDoc(doc(db, 'broadcasts', id), { revoked: true }).catch(() => {});

        window.dispatchEvent(new Event('storage'));
        toast({ variant: "destructive", title: "Broadcast Revoked", description: "Message removed from all portals." });
    }, [messages, toast]);

    const handleVerifyAssignment = async (woId: string) => {
        if (!isAdmin(currentUser)) {
            toast({ variant: 'destructive', title: 'Unauthorized', description: 'Administrative privileges required for registry verification.' });
            return;
        }
        const docRef = doc(db, 'assignments', woId);
        try {
            await updateDoc(docRef, { 
                isAudited: true, 
                auditedAt: new Date().toISOString(), 
                auditedBy: currentUser?.name || 'Admin' 
            });
            toast({ title: "Verified", description: `Job ${woId.toUpperCase()} has been confirmed.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Audit Failure', description: e.message });
        }
    };

    const handleDeleteAssignment = async (woId: string) => {
        if (!isSuperAdmin(currentUser)) {
            toast({ variant: 'destructive', title: 'Unauthorized', description: 'Super Admin credentials required for record purging.' });
            return;
        }
        const docRef = doc(db, 'assignments', woId);
        try {
            await deleteDoc(docRef);
            toast({ variant: 'destructive', title: 'Record Deleted', description: `Assignment ${woId.toUpperCase()} removed from system.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Delete Failed', description: e.message });
        }
    };

    const activeTech = useMemo(() => technicians.find(t => t.id === selectedTechId), [selectedTechId, technicians]);

    const techStats = useMemo(() => {
        if (!selectedTechId) return null;
        const myJobs = assignments.filter(wo => wo.assignedTechnicianId === selectedTechId || wo.techId === selectedTechId);
        const completed = myJobs.filter(wo => wo.status === 'completed').length;
        const penalties = penaltyEvents.filter(pe => pe.techId === selectedTechId);
        const points = penalties.reduce((acc, curr) => acc + Math.abs(curr.scoreChange), 0);
        const reliability = Math.max(0, 100 - (points * 5));
        
        const myLogs = weeklyLogs.filter(log => log.techId === selectedTechId)
            .sort((a, b) => {
                const [am, ad, ay] = a.weekOf.split('-');
                const [bm, bd, by] = b.weekOf.split('-');
                return new Date(parseInt(by), parseInt(bm)-1, parseInt(bd)).getTime() - 
                       new Date(parseInt(ay), parseInt(am)-1, parseInt(ad)).getTime();
            });

        const totalEarnings = myLogs.filter(l => l.status === 'Approved').reduce((acc, log) => acc + (log.totalPayout || 0), 0);

        return { 
            total: myJobs.length, 
            completed, 
            reliability, 
            penaltyPoints: points, 
            penalties,
            totalEarnings,
            myJobs,
            myLogs
        };
    }, [selectedTechId, assignments, weeklyLogs]);

    const siteList = useMemo(() => {
        const uniqueSites = new Map();
        technicians.forEach(t => {
            t.managedSites?.forEach(s => uniqueSites.set(s.id, {
                ...s,
                client: t.clientCompany || 'Strategic Partner',
                clientId: t.id
            }));
        });
        return Array.from(uniqueSites.values());
    }, [technicians]);

    const activeSite = useMemo(() => siteList.find(s => s.id === selectedSiteId), [selectedSiteId, siteList]);

    const siteAuditData = useMemo(() => {
        if (!activeSite) return null;
        
        const siteVisits = assignments.filter(wo => wo.location === activeSite.location);
        const clientProjects = projects.filter(p => p.client === activeSite.client || p.location === activeSite.location);
        const clientInvoices = invoices.filter(inv => inv.clientName === activeSite.client);
        
        return {
            visits: siteVisits,
            projects: clientProjects,
            invoices: clientInvoices
        };
    }, [activeSite, assignments, projects, invoices]);

    const getFilteredVisits = useCallback((visits: WorkOrder[]) => {
        let results = [...visits];
        const now = startOfDay(new Date());

        if (auditRange === '7d') {
            const cutoff = subDays(now, 7);
            results = results.filter(wo => {
                const parts = (wo.scheduleDate || '').split(/[-/]/);
                let woDate;
                if (parts[0] && parts[0].length === 4) { woDate = startOfDay(new Date(wo.scheduleDate)); }
                else { woDate = startOfDay(new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]))); }
                return isAfter(woDate, cutoff) || isSameDay(woDate, cutoff);
            });
        } else if (auditRange === '30d') {
            const cutoff = subDays(now, 30);
            results = results.filter(wo => {
                const parts = (wo.scheduleDate || '').split(/[-/]/);
                let woDate;
                if (parts[0] && parts[0].length === 4) { woDate = startOfDay(new Date(wo.scheduleDate)); }
                else { woDate = startOfDay(new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]))); }
                return isAfter(woDate, cutoff) || isSameDay(woDate, cutoff);
            });
        } else if (auditRange === 'custom' && customVisitRange?.from) {
            results = results.filter(wo => {
                const parts = (wo.scheduleDate || '').split(/[-/]/);
                let woDate;
                if (parts[0] && parts[0].length === 4) { woDate = startOfDay(new Date(wo.scheduleDate)); }
                else { woDate = startOfDay(new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]))); }
                const start = startOfDay(customVisitRange.from!);
                const end = customVisitRange.to ? startOfDay(customVisitRange.to) : start;
                return isWithinInterval(woDate, { start, end });
            });
        }

        return results.sort((a, b) => {
            const parseDate = (str: string) => {
                const parts = str.split(/[-/]/);
                if (parts[0] && parts[0].length === 4) return new Date(str).getTime();
                const [m, d, y] = parts;
                return new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).getTime();
            };
            const dateA = parseDate(a.scheduleDate);
            const dateB = parseDate(b.scheduleDate);
            return visitSortDir === 'desc' ? dateB - dateA : dateA - dateB;
        });
    }, [auditRange, customVisitRange, visitSortDir]);

    const sortedAllSiteVisits = useMemo(() => {
        if (!siteAuditData) return [];
        return getFilteredVisits(siteAuditData.visits);
    }, [siteAuditData, getFilteredVisits]);

    const sortedTechVisits = useMemo(() => {
        if (!techStats) return [];
        return getFilteredVisits(techStats.myJobs);
    }, [techStats, getFilteredVisits]);

    const handleExportCurrentAudit = () => {
        const rows: string[][] = [];
        let filename = "Audit_Export";

        if (activeTab === 'tech' && selectedTechId && techStats) {
            rows.push(['DATE', 'MISSION ID', 'TITLE', 'CLIENT', 'STATUS', 'PAYOUT']);
            sortedTechVisits.forEach(wo => {
                rows.push([
                    wo.scheduleDate,
                    wo.id.toUpperCase(),
                    wo.title || wo.description,
                    wo.clientName,
                    wo.status,
                    wo.pay.toString()
                ]);
            });
            filename = `Tech_Audit_${activeTech?.name.replace(/\s+/g, '_')}`;
        } else if (activeTab === 'sites' && selectedSiteId && activeSite && siteAuditData) {
            rows.push(['DATE', 'MISSION ID', 'TITLE', 'STATUS', 'AUDIT REGISTRY']);
            sortedAllSiteVisits.forEach(wo => {
                const linkedLog = weeklyLogs.find(log => (log.items || []).some(item => item.workOrderId === wo.id));
                rows.push([
                    wo.scheduleDate,
                    wo.id.toUpperCase(),
                    wo.title || wo.description,
                    wo.status,
                    linkedLog ? `WK: ${linkedLog.weekOf}` : 'Pending'
                ]);
            });
            filename = `Site_Audit_${activeSite.name.replace(/\s+/g, '_')}`;
        }

        if (rows.length === 0) return;

        const csvContent = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast({ title: "Audit Dispatched", description: "Manifest exported successfully." });
    };

    const anomalyCounts = useMemo(() => {
        return workOrders.filter(wo => wo.status === 'unassigned').length
             + weeklyLogs.filter(wl => wl.status === 'Draft').length;
    }, [workOrders, weeklyLogs]);

    const handleTabChange = (val: string) => {
        setActiveTab(val);
        setSelectedTechId(null);
        setSelectedSiteId(null);
    };

    const handleJobUpdate = (woId: string, updates: Partial<WorkOrder>) => {
        const docRef = doc(db, 'assignments', woId);
        updateDoc(docRef, updates).catch((e: any) => {
            const woRef = doc(db, 'workOrders', woId);
            updateDoc(woRef, updates).catch(err => {
                toast({ variant: 'destructive', title: 'Update Failed', description: err.message });
            });
        });
    };

    type TimelineEvent = {
        id: string;
        timestamp: string;
        type: 'assignment' | 'log' | 'invoice' | 'site_request' | 'work_order';
        eventLabel: string;
        entity: string;
        techName?: string;
        techId?: string;
        clientName?: string;
        color: string;
        icon: string;
    };

    const timelineEvents = useMemo((): TimelineEvent[] => {
        const events: TimelineEvent[] = [];

        assignments.forEach(wo => {
            const techId = wo.assignedTechnicianId || wo.techId;
            const tech = technicians.find(t => t.id === techId);
            const techName = tech?.name;

            if ((wo as any).assignedAt) {
                events.push({
                    id: `asmt-created-${wo.id}`,
                    timestamp: (wo as any).assignedAt,
                    type: 'assignment',
                    eventLabel: 'Assignment Created',
                    entity: wo.title || wo.description || wo.id.toUpperCase(),
                    techName,
                    techId,
                    clientName: wo.clientName,
                    color: 'text-accent-gold',
                    icon: 'Wrench',
                });
            }

            const completedStatus = ['completed', 'checked-out'];
            if (completedStatus.includes(wo.status) && (wo as any).updatedAt) {
                events.push({
                    id: `asmt-completed-${wo.id}`,
                    timestamp: (wo as any).updatedAt,
                    type: 'assignment',
                    eventLabel: wo.status === 'completed' ? 'Job Completed' : 'Checked Out',
                    entity: wo.title || wo.description || wo.id.toUpperCase(),
                    techName,
                    techId,
                    clientName: wo.clientName,
                    color: 'text-text-green',
                    icon: 'CheckCircle2',
                });
            }
        });

        workOrders.forEach(wo => {
            const ts = (wo as any).createdAt;
            if (ts) {
                events.push({
                    id: `wo-created-${wo.id}`,
                    timestamp: ts,
                    type: 'work_order',
                    eventLabel: 'Work Order Created',
                    entity: wo.title || wo.description || wo.id.toUpperCase(),
                    clientName: wo.clientName,
                    color: 'text-text-muted',
                    icon: 'FileText',
                });
            }
        });

        weeklyLogs.forEach(log => {
            const tech = technicians.find(t => t.id === log.techId);
            if (log.submittedAt) {
                events.push({
                    id: `log-submitted-${log.id}`,
                    timestamp: log.submittedAt,
                    type: 'log',
                    eventLabel: 'Weekly Log Submitted',
                    entity: `Week of ${log.weekOf}`,
                    techName: tech?.name,
                    techId: log.techId,
                    color: 'text-accent-gold',
                    icon: 'ClipboardList',
                });
            }
            if (log.status === 'Approved') {
                events.push({
                    id: `log-approved-${log.id}`,
                    timestamp: log.submittedAt || log.weekOf,
                    type: 'log',
                    eventLabel: 'Weekly Log Approved',
                    entity: `Week of ${log.weekOf}`,
                    techName: tech?.name,
                    techId: log.techId,
                    color: 'text-text-green',
                    icon: 'CheckCircle2',
                });
            }
        });

        invoices.forEach(inv => {
            if (inv.issueDate) {
                events.push({
                    id: `inv-issued-${inv.id}`,
                    timestamp: inv.issueDate,
                    type: 'invoice',
                    eventLabel: 'Invoice Issued',
                    entity: `#${inv.invoiceNumber} — $${inv.total?.toFixed(2)}`,
                    clientName: inv.clientName,
                    color: 'text-text-muted',
                    icon: 'DollarSign',
                });
            }
            if (inv.status === 'paid') {
                events.push({
                    id: `inv-paid-${inv.id}`,
                    timestamp: inv.dueDate || inv.issueDate,
                    type: 'invoice',
                    eventLabel: 'Invoice Paid',
                    entity: `#${inv.invoiceNumber} — $${inv.total?.toFixed(2)}`,
                    clientName: inv.clientName,
                    color: 'text-text-green',
                    icon: 'Coins',
                });
            }
        });

        siteRequests.forEach(req => {
            const ts = req.submittedDate || (req as any).createdAt;
            if (ts) {
                events.push({
                    id: `site-req-${req.id}`,
                    timestamp: ts,
                    type: 'site_request',
                    eventLabel: 'Site Request Submitted',
                    entity: `${req.siteName} — ${req.clientName}`,
                    clientName: req.clientName,
                    color: 'text-text-muted',
                    icon: 'MapPin',
                });
            }
        });

        return events
            .filter(e => !!e.timestamp)
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }, [assignments, workOrders, weeklyLogs, invoices, siteRequests, technicians]);

    const filteredTimelineEvents = useMemo(() => {
        return timelineEvents.filter(e => {
            if (timelineTechFilter !== 'all' && e.techId !== timelineTechFilter) return false;
            if (timelineTypeFilter !== 'all' && e.type !== timelineTypeFilter) return false;
            if (timelineClientFilter && !(e.clientName || '').toLowerCase().includes(timelineClientFilter.toLowerCase())) return false;
            return true;
        });
    }, [timelineEvents, timelineTechFilter, timelineTypeFilter, timelineClientFilter]);

    const searchResults = useMemo(() => {
        if (!searchQuery) return [];
        const q = searchQuery.toLowerCase();
        const results: any[] = [];

        // Search Techs
        technicians.filter(t => !t.roles?.includes('client')).forEach(t => {
            if ((t.name || '').toLowerCase().includes(q) || (t.id || '').toLowerCase().includes(q)) {
                results.push({
                    type: 'OPERATIVE',
                    label: t.name,
                    meta: `${t.role} · Reliability: ${t.reliabilityScore}%`,
                    id: t.id,
                    cat: 'tech',
                    cls: 'border-brand-red text-brand-red'
                });
            }
        });

        // Search Sites
        siteList.forEach(s => {
            if (s.name.toLowerCase().includes(q) || s.location.toLowerCase().includes(q)) {
                results.push({
                    type: 'SITE',
                    label: s.name,
                    meta: `${s.client} · ${s.location}`,
                    id: s.id,
                    cat: 'site',
                    cls: 'border-accent-gold text-accent-gold'
                });
            }
        });

        // Search Assignments
        [...workOrders, ...assignments].forEach(wo => {
            if (wo.id.toLowerCase().includes(q) || (wo.title || wo.description).toLowerCase().includes(q)) {
                results.push({
                    type: 'ASSIGNMENT',
                    label: wo.title || wo.description,
                    meta: `ID: ${wo.id.toUpperCase()} · Status: ${wo.status} · Client: ${wo.clientName}`,
                    id: wo.id,
                    data: wo,
                    cat: 'job',
                    cls: 'border-text-green text-text-green'
                });
            }
        });

        return results;
    }, [searchQuery, technicians, siteList, workOrders, assignments]);

    const handleResultClick = (result: any) => {
        if (result.cat === 'tech') {
            setSelectedTechId(result.id);
            setActiveTab('tech');
            setSearchQuery("");
        } else if (result.cat === 'site') {
            setSelectedSiteId(result.id);
            setActiveTab('sites');
            setSearchQuery("");
        } else if (result.cat === 'job') {
            setSelectedJob(result.data);
            setIsJobOpen(true);
        }
    };

    const renderTechnicianRoster = () => (
        <div className="space-y-2">
            <div className="flex justify-between items-center px-1 mb-4 text-left">
                <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest text-left">{technicians.filter(t => !t.roles?.includes('client')).length} Technicians</p>
                <Button variant="ghost" size="sm" className="h-7 text-[10px] uppercase font-bold text-text-muted" onClick={() => { setSelectedTechId(null); setSelectedSiteId(null); }}>
                    <RefreshCw size={12} className="mr-1.5"/> Refresh
                </Button>
            </div>
            {technicians.filter(t => !t.roles?.includes('client')).map(t => {
                const pts = penaltyEvents.filter(p => p.techId === t.id).reduce((s, p) => s + Math.abs(p.scoreChange), 0);
                const isReliable = pts <= 2;
                return (
                    <div key={t.id} onClick={() => setSelectedTechId(t.id)} className="flex items-center justify-between p-2.5 rounded-lg bg-bg-secondary border border-border-main hover:border-brand-red transition-all cursor-pointer group text-left">
                        <div className="flex items-center gap-3 text-left">
                            <div className="relative text-left">
                                <Avatar className="h-10 w-10 border border-border-sub">
                                    <AvatarImage src={t.avatarUrl} />
                                    <AvatarFallback className="text-[10px]">{(t.name || 'U').charAt(0)}</AvatarFallback>
                                </Avatar>
                            </div>
                            <div className="text-left">
                                <p className="text-sm font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors text-left">{t.name || 'Unnamed Operative'}</p>
                                <p className="text-[10px] text-text-muted uppercase tracking-widest mt-0.5 text-left">{t.email}</p>
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
            <div className="flex justify-between items-center bg-bg-secondary p-4 rounded-xl border border-border-sub text-left">
                <div className="flex items-center gap-3 text-left">
                    <MessageSquare className="text-brand-red h-5 w-5" />
                    <div className="text-left">
                        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide text-left">Operational Communications</h3>
                        <p className="text-[10px] text-text-muted uppercase tracking-widest text-left">System-wide broadcast terminal</p>
                    </div>
                </div>
                <Button onClick={() => setIsBroadcasting(true)} className="bg-brand-red hover:bg-brand-red-hover h-9 px-6 text-[10px] font-bold uppercase tracking-widest text-white">
                    <Send size={14} className="mr-2" />
                    Broadcast Message
                </Button>
            </div>

            <div className="space-y-3 text-left">
                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1 text-left">Message Ledger</h3>
                <div className="space-y-2">
                    {messages.map(msg => (
                        <div key={msg.id} className="p-4 rounded-xl border border-border-sub bg-bg-secondary space-y-3 text-left">
                            <div className="flex justify-between items-start text-left">
                                <div className="flex items-center gap-3 text-left">
                                    <div className={cn(
                                        "p-2 rounded-lg border",
                                        msg.type === 'critical' ? "bg-brand-red-dim text-text-red border-brand-red/30" :
                                        msg.type === 'warning' ? "bg-accent-gold-dim text-accent-gold border-accent-gold/30" :
                                        msg.type === 'success' ? "bg-green-dim text-text-green border-green-border/30" :
                                        "bg-bg-primary text-text-secondary border border-border-sub"
                                    )}>
                                        <ActivityIcon size={14} />
                                    </div>
                                    <div className="text-left">
                                        <div className="flex items-center gap-2 text-left">
                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide text-left">{msg.subject}</p>
                                            {msg.isLocked && <Lock size={12} className="text-brand-red" />}
                                        </div>
                                        <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest text-left">
                                            {format(parseISO(msg.timestamp), 'MMM d, yyyy h:mm a')} · Target: {msg.targetPortal}
                                            {msg.expiresAt && ` · Expires: ${format(parseISO(msg.expiresAt), 'MMM d, h:mm a')}`}
                                        </p>
                                    </div>
                                </div>
                                <Badge variant="outline" className="text-[8px] uppercase">{msg.type}</Badge>
                            </div>
                            <p className="text-xs text-text-secondary leading-relaxed uppercase font-medium text-left">{msg.body}</p>
                            <div className="pt-3 border-t border-border-sub/30 flex justify-between items-center text-left">
                                <div className="flex items-center gap-2 text-left">
                                    <div className="h-4 w-4 rounded-full bg-bg-tertiary border border-border-sub flex items-center justify-center text-[7px] font-bold">
                                        {(msg.senderName || 'A').charAt(0)}
                                    </div>
                                    <span className="text-[8px] text-text-muted font-bold uppercase tracking-widest text-left">Sent by {msg.senderName}</span>
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
                </div>
            </div>

            <Dialog open={isBroadcasting} onOpenChange={setIsBroadcasting}>
                <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30 text-left">
                        <div className="flex items-center gap-2 mb-1 text-left">
                            <MessageSquare className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest">Compose Broadcast</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs text-left">Transmit a tactical message to the selected portal registry.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4 px-6 text-left">
                        <div className="grid grid-cols-2 gap-4 text-left">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] uppercase font-bold text-text-muted text-left">Target Portal</Label>
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
                                <Label className="text-[10px] uppercase font-bold text-text-muted text-left">Priority Level</Label>
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

                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] uppercase font-bold text-text-muted text-left">Subject / Headline</Label>
                            <Input 
                                placeholder="Clear, concise directive..." 
                                value={newMessage.subject}
                                onChange={e => setNewMessage({...newMessage, subject: e.target.value})}
                                className="h-10 bg-bg-primary border-border-sub text-xs font-bold uppercase tracking-wide"
                            />
                        </div>
                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] uppercase font-bold text-text-muted text-left">Message Body</Label>
                            <Textarea 
                                placeholder="Provide full context and required actions..." 
                                value={newMessage.body}
                                onChange={e => setNewMessage({...newMessage, body: e.target.value})}
                                className="bg-bg-primary text-xs h-32 leading-relaxed uppercase font-medium"
                            />
                        </div>
                    </div>
                    <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default">
                        <Button variant="outline" onClick={() => setIsBroadcasting(false)}>Cancel</Button>
                        <Button onClick={handleBroadcast} className="bg-brand-red hover:bg-brand-red-hover px-10">
                            <Send size={16} className="mr-2" /> Execute Broadcast
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );

    const renderAuditHeader = (title: string, count: number) => (
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-bg-secondary/50 p-4 rounded-xl border border-border-sub mb-6 shadow-sm text-left">
            <div className="flex items-center gap-3 text-left">
                <div className="p-2 bg-bg-tertiary rounded border border-border-sub text-brand-red">
                    <Filter size={16} />
                </div>
                <div className="text-left">
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-text-primary text-left">{title}</h3>
                    <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest text-left">{count} records match registry constraints</p>
                </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
                <Button variant="outline" size="sm" className="h-9 px-4 uppercase text-[9px] font-bold tracking-widest" onClick={handleExportCurrentAudit}>
                    <Download size={12} className="mr-2" /> Export CSV
                </Button>
                
                <Popover>
                    <PopoverTrigger asChild>
                        <div className={cn(
                            "flex items-center h-9 rounded-md border border-border-main bg-bg-primary px-3 cursor-pointer hover:bg-bg-tertiary transition-all group relative pr-8",
                            (auditRange === 'custom' || auditRange !== 'all') && "border-brand-red ring-1 ring-brand-red"
                        )}>
                            <CalendarIcon size={12} className={cn("mr-2", auditRange !== 'all' ? "text-brand-red" : "text-text-muted")} />
                            <span className={cn(
                                "text-[10px] font-bold uppercase tracking-widest whitespace-nowrap",
                                auditRange !== 'all' ? "text-text-primary" : "text-text-muted"
                            )}>
                                {auditRange === 'all' ? 'Full Temporal Registry' : 
                                 auditRange === '7d' ? 'Last 7 Days' : 
                                 auditRange === '30d' ? 'Last 30 Days' :
                                 customVisitRange?.from ? (
                                    customVisitRange.to ? `${format(customVisitRange.from, "MM-dd")} – ${format(customVisitRange.to, "MM-dd")}` : format(customVisitRange.from, "MM-dd")
                                 ) : "Custom Range"}
                            </span>
                        </div>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0 bg-bg-elevated border-border-main shadow-2xl" align="end">
                        <div className="p-3 border-b border-border-sub bg-bg-tertiary flex justify-between items-center text-left">
                            <p className="text-[10px] font-black uppercase tracking-widest text-text-primary">Temporal constraints</p>
                            <button onClick={() => { setAuditRange('all'); setCustomVisitRange(undefined); }} className="text-[9px] font-bold text-brand-red hover:underline">Reset</button>
                        </div>
                        <div className="p-3 space-y-4 text-left">
                            <div className="grid grid-cols-1 gap-2 text-left">
                                <Button variant="ghost" size="sm" className={cn("justify-start h-8 text-[10px] uppercase font-bold", auditRange === 'all' && "bg-bg-secondary text-brand-red")} onClick={() => setAuditRange('all')}>Full Registry</Button>
                                <Button variant="ghost" size="sm" className={cn("justify-start h-8 text-[10px] uppercase font-bold", auditRange === '7d' && "bg-bg-secondary text-brand-red")} onClick={() => setAuditRange('7d')}>Last 7 Days</Button>
                                <Button variant="ghost" size="sm" className={cn("justify-start h-8 text-[10px] uppercase font-bold", auditRange === '30d' && "bg-bg-secondary text-brand-red")} onClick={() => setAuditRange('30d')}>Last 30 Days</Button>
                                <Button variant="ghost" size="sm" className={cn("justify-start h-8 text-[10px] uppercase font-bold", auditRange === 'custom' && "bg-bg-secondary text-brand-red")} onClick={() => setAuditRange('custom')}>Custom Range</Button>
                            </div>
                            {auditRange === 'custom' && (
                                <div className="pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <Calendar initialFocus mode="range" selected={customVisitRange} onSelect={setCustomVisitRange} numberOfMonths={1} />
                                </div>
                            )}
                        </div>
                    </PopoverContent>
                </Popover>

                <Select value={visitSortDir} onValueChange={(v: any) => setVisitSortDir(v)}>
                    <SelectTrigger className="w-[120px] h-9 bg-bg-primary text-[10px] uppercase font-bold border-border-main">
                        <div className="flex items-center gap-2">
                            <ArrowUpDown size={14} className="text-text-muted" />
                            <SelectValue />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="desc" className="text-[10px] uppercase font-bold">Newest First</SelectItem>
                        <SelectItem value="asc" className="text-[10px] uppercase font-bold">Oldest First</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );

    const renderSiteActivity = () => {
        if (selectedSiteId && activeSite && siteAuditData) {
            return (
                <div className="space-y-8 animate-in fade-in duration-300 text-left">
                    <div className="flex items-center justify-between text-left">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedSiteId(null)} className="h-8 text-[10px] uppercase font-bold text-text-muted text-left">
                            <ArrowLeft size={14} className="mr-1.5"/> Back to Site Index
                        </Button>
                    </div>

                    <div className="flex items-center gap-4 text-left mb-4">
                        <div className="p-3 bg-bg-secondary rounded-lg border border-border-sub shadow-sm text-left">
                            <Building2 size={28} className="text-brand-red" />
                        </div>
                        <div className="space-y-1 text-left">
                            <h2 className="text-2xl font-bold uppercase tracking-wide text-text-primary text-left">{activeSite.name}</h2>
                            <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest flex items-center gap-1.5 text-left">
                                <MapPin size={12} className="text-brand-red"/> {activeSite.location}
                            </p>
                        </div>
                    </div>

                    <Tabs defaultValue="overview" className="w-full text-left">
                        <TabsList className="tabs bg-bg-secondary/50 border border-border-sub mb-6 h-10 text-left">
                            <TabsTrigger value="overview" className="tab !px-8 h-full data-[state=active]:bg-brand-red">TACTICAL OVERVIEW</TabsTrigger>
                            <TabsTrigger value="visits" className="tab !px-8 h-full data-[state=active]:bg-brand-red">ASSIGNMENT HISTORY ({siteAuditData.visits.length})</TabsTrigger>
                            <TabsTrigger value="projects" className="tab !px-8 h-full data-[state=active]:bg-brand-red">PROJECT FOLDERS ({siteAuditData.projects.length})</TabsTrigger>
                            <TabsTrigger value="billing" className="tab !px-8 h-full data-[state=active]:bg-brand-red">FINANCIAL AUDIT</TabsTrigger>
                        </TabsList>

                        <TabsContent value="overview" className="m-0 space-y-6 text-left">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                                <Card className="bg-bg-secondary border-border-main text-center p-3 space-y-1">
                                    <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Uptime Integrity</p>
                                    <p className="text-2xl font-bold text-text-primary">99.9%</p>
                                    <Badge variant="active" className="h-4 text-[7px] uppercase">Compliant</Badge>
                                </Card>
                                <Card className="bg-bg-secondary border-border-main text-center p-3 space-y-1">
                                    <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Open Tickets</p>
                                    <p className="text-2xl font-bold text-text-primary">{siteAuditData.visits.filter(wo => wo.status !== 'completed').length}</p>
                                    <p className={cn("text-[8px] uppercase font-bold tracking-widest", siteAuditData.visits.filter(wo => wo.status !== 'completed').length > 0 ? "text-accent-gold" : "text-text-green")}>
                                        {siteAuditData.visits.filter(wo => wo.status !== 'completed').length > 0 ? 'Active Queue' : 'Clean'}
                                    </p>
                                </Card>
                                <Card className="bg-bg-secondary border-border-main text-center p-3 space-y-1">
                                    <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Strategic Value</p>
                                    <p className="text-2xl font-mono font-bold text-text-green">${siteAuditData.invoices.reduce((a, b) => a + b.total, 0).toLocaleString()}</p>
                                    <p className="text-[8px] text-text-muted uppercase font-bold">settled invoices</p>
                                </Card>
                            </div>
                            
                            <div className="p-4 rounded-lg border border-border-sub bg-bg-secondary/50 text-left space-y-3">
                                <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 text-left">Client Briefing</h3>
                                <div className="grid grid-cols-2 gap-8 text-left">
                                    <div className="space-y-3 text-left">
                                        <div className="space-y-0.5 text-left">
                                            <p className="text-[8px] font-bold text-text-muted uppercase text-left">Affiliated Entity</p>
                                            <p className="text-xs font-bold text-text-primary uppercase text-left">{activeSite.client}</p>
                                        </div>
                                        <div className="space-y-0.5 text-left">
                                            <p className="text-[8px] font-bold text-text-muted uppercase text-left">Site Access Instructions</p>
                                            <p className="text-xs text-text-secondary leading-relaxed text-left">Check in at security desk. Badge verification required. Loading dock access via rear gate code 5592.</p>
                                        </div>
                                    </div>
                                    <div className="space-y-3 text-left">
                                        <div className="space-y-0.5 text-left">
                                            <p className="text-[8px] font-bold text-text-muted uppercase text-left">Primary On-Site Point</p>
                                            <p className="text-xs font-bold text-text-primary uppercase text-left">MGR. Robert House</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="visits" className="m-0 space-y-4 text-left">
                             {renderAuditHeader("Site Deployment Manifest", sortedAllSiteVisits.length)}
                             <div className="table-wrap p-0 text-left">
                                <Table>
                                    <TableHeader className="bg-bg-tertiary">
                                        <TableRow className="hover:bg-transparent border-border-sub">
                                            <TableHead className="text-[7px] uppercase font-black tracking-widest pl-6">Mission Identification</TableHead>
                                            <TableHead className="text-[9px] uppercase font-black tracking-widest text-left">Date</TableHead>
                                            <TableHead className="text-[9px] uppercase font-black tracking-widest text-center">Status</TableHead>
                                            <TableHead className="text-[9px] uppercase font-black tracking-widest text-center">Audit Registry</TableHead>
                                            <TableHead className="text-right pr-6 text-[9px] uppercase font-black tracking-widest">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sortedAllSiteVisits.map(wo => {
                                            const linkedLog = weeklyLogs.find(log => (log.items || []).some(item => item.workOrderId === wo.id));
                                            return (
                                                <TableRow key={wo.id} className="border-border-sub hover:bg-bg-tertiary transition-colors cursor-pointer group text-left" onClick={() => { setSelectedJob(wo); setIsJobOpen(true); }}>
                                                    <TableCell className="text-left py-4 pl-6 text-left">
                                                        <div className="flex flex-col gap-0.5 text-left">
                                                            <span className="font-mono text-brand-red font-bold text-[9px] uppercase tracking-widest leading-none text-left">{(wo.id || '').toUpperCase()}</span>
                                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors text-left">{wo.title || wo.description}</p>
                                                            <p className="text-[10px] text-text-muted font-bold uppercase mt-0.5 text-left">{wo.clientName}</p>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-left text-xs font-mono font-bold text-text-secondary uppercase text-left">
                                                        {formatDateDisplay(wo.scheduleDate)}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge variant={wo.status === 'completed' ? 'active' : wo.status === 'in-progress' ? 'inprogress' : 'onhold'} className="uppercase h-4 text-[7px] tracking-widest">
                                                            {wo.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {linkedLog ? (
                                                            <Badge variant="outline" className="text-[8px] bg-bg-primary border-border-sub uppercase tracking-tighter">
                                                                <FileCheck size={10} className="mr-1 text-text-green"/> WK: {linkedLog.weekOf}
                                                            </Badge>
                                                        ) : (
                                                            <span className="text-[9px] text-text-muted font-bold uppercase italic opacity-40">Pending audit</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6">
                                                        <div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                                                            {wo.isAudited ? (
                                                                <Badge variant="active" className="h-7 text-[8px] uppercase tracking-widest px-2 bg-green-dim border-green-border text-text-green">
                                                                    <ShieldCheck size={10} className="mr-1"/> Verified
                                                                </Badge>
                                                            ) : (
                                                                <Button 
                                                                    variant="outline" 
                                                                    size="sm" 
                                                                    className="h-7 text-[8px] uppercase font-bold border-text-green text-text-green hover:bg-green-dim"
                                                                    onClick={() => handleVerifyAssignment(wo.id)}
                                                                >
                                                                    <Check size={12} className="mr-1"/> Verify
                                                                </Button>
                                                            )}
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon" 
                                                                className="h-7 w-7 text-text-muted hover:text-text-red"
                                                                onClick={() => handleDeleteAssignment(wo.id)}
                                                            >
                                                                <Trash2 size={14}/>
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                             </div>
                        </TabsContent>

                        <TabsContent value="projects" className="m-0 space-y-4 text-left">
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                                {siteAuditData.projects.map(p => (
                                    <Card key={p.id} className="bg-bg-secondary border-border-main hover:border-text-muted transition-all cursor-pointer group text-left" onClick={() => router.push(`/admin/projects/${p.id}`)}>
                                        <CardContent className="p-4 flex items-center justify-between text-left">
                                            <div className="flex items-center gap-4 text-left">
                                                <div className="p-2 bg-bg-tertiary rounded border border-border-sub text-text-muted group-hover:bg-brand-red-dim group-hover:text-brand-red transition-all">
                                                    <Briefcase size={20} />
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-xs font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors text-left">{p.name}</p>
                                                    <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest mt-0.5 text-left">Started: {p.startDate} · {p.status}</p>
                                                </div>
                                            </div>
                                            <ChevronRight size={18} className="text-text-muted group-hover:text-text-primary group-hover:translate-x-1 transition-all" />
                                        </CardContent>
                                    </Card>
                                ))}
                                {siteAuditData.projects.length === 0 && (
                                    <div className="col-span-full py-12 text-center border-2 border-dashed border-border-sub rounded-xl opacity-40 text-left">
                                        <Briefcase size={32} className="mx-auto text-text-muted mb-2" />
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-center">No site-linked project folders found</p>
                                    </div>
                                )}
                             </div>
                        </TabsContent>

                        <TabsContent value="billing" className="m-0 space-y-4 text-left">
                            <div className="table-wrap p-0 text-left">
                                <Table>
                                    <TableHeader className="bg-bg-tertiary">
                                        <TableRow className="hover:bg-transparent border-border-sub">
                                            <TableHead className="text-[9px] uppercase font-black tracking-widest pl-6">Invoice #</TableHead>
                                            <TableHead className="text-[9px] uppercase font-black tracking-widest text-left">Target Project/WO</TableHead>
                                            <TableHead className="text-[9px] uppercase font-black tracking-widest text-left">Due Date</TableHead>
                                            <TableHead className="text-[9px] uppercase font-black tracking-widest text-center">Status</TableHead>
                                            <TableHead className="text-right pr-6 text-[9px] uppercase font-black tracking-widest">Settlement</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {siteAuditData.invoices.map(inv => (
                                            <TableRow key={inv.id} className="border-border-sub hover:bg-bg-tertiary transition-colors text-left">
                                                <TableCell className="font-mono text-brand-red font-bold text-xs pl-6 text-left">INV-{inv.invoiceNumber}</TableCell>
                                                <TableCell className="text-xs uppercase font-bold text-text-primary text-left">
                                                    {inv.projectId ? `Project: ${inv.projectId.toUpperCase()}` : inv.workOrderId ? `Job: ${inv.workOrderId.toUpperCase()}` : 'General Settlement'}
                                                </TableCell>
                                                <TableCell className="text-xs text-text-muted text-left">{inv.dueDate}</TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant={inv.status === 'paid' ? 'active' : inv.status === 'sent' ? 'onhold' : 'pending'} className="uppercase h-4 text-[7px] tracking-widest">
                                                        {inv.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right pr-6 font-mono font-bold text-text-primary">${inv.total.toLocaleString()}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            );
        }

        return (
            <div className="space-y-2 text-left">
                <div className="flex justify-between items-center px-1 mb-4 text-left">
                    <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest text-left">{siteList.length} Managed Site Coordinates</p>
                </div>
                {siteList.map(site => (
                    <div key={site.id} onClick={() => setSelectedSiteId(site.id)} className="flex items-center justify-between p-2.5 rounded-lg bg-bg-secondary border border-border-main hover:border-brand-red transition-all cursor-pointer group text-left">
                        <div className="flex items-center gap-3 text-left">
                            <div className="p-2 bg-bg-primary rounded border border-border-sub text-text-muted group-hover:text-brand-red transition-colors text-left">
                                <Building2 size={16} />
                            </div>
                            <div className="text-left">
                                <p className="text-sm font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors text-left">{site.name}</p>
                                <p className="text-[10px] text-text-muted uppercase tracking-widest mt-0.5 text-left">{site.client} · {site.location}</p>
                            </div>
                        </div>
                        <ChevronRight size={16} className="text-text-muted group-hover:text-text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="max-w-[1200px] mx-auto space-y-8 text-left">
            <header className="space-y-1 text-center text-left">
                <p className="text-[10px] font-black text-brand-red uppercase tracking-[0.3em] text-center">Business Timeline</p>
                <h1 className="text-3xl font-bold uppercase tracking-widest text-text-primary text-center">Activity</h1>
                <p className="text-xs text-text-muted uppercase font-bold tracking-widest mt-2 text-center">History, logs, and search across all field service records</p>
            </header>

            <div className="space-y-6 text-left">
                <div className="relative group text-left">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted group-focus-within:text-brand-red transition-colors" />
                    <Input
                        placeholder="Search technicians, assignments, projects…"
                        className="h-9 pl-9 bg-bg-secondary border-border-main text-[10px] uppercase font-bold tracking-wide focus:border-brand-red rounded-lg"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {!searchQuery ? (
                    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full text-left">
                        <div className="flex justify-center text-left">
                            <TabsList className="tabs border-b-2 border-border-sub bg-transparent rounded-none h-auto p-0 gap-8 justify-center mb-8 flex-wrap">
                                <TabsTrigger value="timeline" className="tab-trigger-activity">Timeline</TabsTrigger>
                                <TabsTrigger value="assignments_history" className="tab-trigger-activity">Assignment History</TabsTrigger>
                                <TabsTrigger value="project_history" className="tab-trigger-activity">Project History</TabsTrigger>
                                <TabsTrigger value="weekly_logs" className="tab-trigger-activity">Weekly Log History</TabsTrigger>
                                <TabsTrigger
                                    value="sites"
                                    className="tab-trigger-activity"
                                    onClick={() => setSelectedSiteId(null)}
                                >
                                    Site Activity
                                </TabsTrigger>
                                <TabsTrigger value="app_activity" className="tab-trigger-activity">
                                    App Activity
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <div className="min-h-[500px] text-left">
                            {/* TIMELINE TAB */}
                            <TabsContent value="timeline" className="m-0 text-left">
                                <div className="space-y-5">
                                    {/* Filter bar */}
                                    <div className="flex flex-wrap items-center gap-3 p-4 bg-bg-secondary rounded-xl border border-border-sub">
                                        <Select value={timelineTechFilter} onValueChange={setTimelineTechFilter}>
                                            <SelectTrigger className="h-8 w-[160px] text-[10px] font-bold uppercase bg-bg-primary border-border-main">
                                                <SelectValue placeholder="All Techs" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-bg-elevated border-border-main">
                                                <SelectItem value="all" className="text-[10px] uppercase font-bold">All Techs</SelectItem>
                                                {technicians.filter(t => !t.roles?.includes('client')).map(t => (
                                                    <SelectItem key={t.id} value={t.id} className="text-[10px] uppercase font-bold">{t.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Select value={timelineTypeFilter} onValueChange={setTimelineTypeFilter}>
                                            <SelectTrigger className="h-8 w-[160px] text-[10px] font-bold uppercase bg-bg-primary border-border-main">
                                                <SelectValue placeholder="All Events" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-bg-elevated border-border-main">
                                                <SelectItem value="all" className="text-[10px] uppercase font-bold">All Events</SelectItem>
                                                <SelectItem value="assignment" className="text-[10px] uppercase font-bold">Assignments</SelectItem>
                                                <SelectItem value="work_order" className="text-[10px] uppercase font-bold">Work Orders</SelectItem>
                                                <SelectItem value="log" className="text-[10px] uppercase font-bold">Weekly Logs</SelectItem>
                                                <SelectItem value="invoice" className="text-[10px] uppercase font-bold">Invoices</SelectItem>
                                                <SelectItem value="site_request" className="text-[10px] uppercase font-bold">Site Requests</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Input
                                            placeholder="Filter by client..."
                                            value={timelineClientFilter}
                                            onChange={e => setTimelineClientFilter(e.target.value)}
                                            className="h-8 w-[180px] text-[10px] bg-bg-primary border-border-main"
                                        />
                                        {(timelineTechFilter !== 'all' || timelineTypeFilter !== 'all' || timelineClientFilter) && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 text-[9px] uppercase font-bold text-text-muted"
                                                onClick={() => { setTimelineTechFilter('all'); setTimelineTypeFilter('all'); setTimelineClientFilter(''); }}
                                            >
                                                <X size={11} className="mr-1" /> Clear
                                            </Button>
                                        )}
                                        <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-text-muted">
                                            {filteredTimelineEvents.length} events
                                        </span>
                                    </div>

                                    {/* Timeline feed */}
                                    {filteredTimelineEvents.length === 0 ? (
                                        <div className="py-24 text-center border border-dashed border-border-sub rounded-xl opacity-40">
                                            <ActivityIcon size={32} className="mx-auto text-text-muted mb-2" />
                                            <p className="text-[10px] font-bold uppercase text-text-muted">No events match the current filter</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            {filteredTimelineEvents.slice(0, 100).map(event => {
                                                let tsDisplay = '';
                                                try {
                                                    const d = new Date(event.timestamp);
                                                    tsDisplay = isNaN(d.getTime()) ? event.timestamp : format(d, 'MMM d, h:mm a');
                                                } catch { tsDisplay = event.timestamp; }

                                                const typeColors: Record<string, string> = {
                                                    assignment: 'border-l-accent-gold',
                                                    work_order: 'border-l-border-main',
                                                    log: 'border-l-brand-red',
                                                    invoice: 'border-l-text-green',
                                                    site_request: 'border-l-text-muted',
                                                };

                                                return (
                                                    <div key={event.id} className={cn(
                                                        'flex items-start gap-4 p-3 rounded-lg border border-border-sub border-l-4 bg-bg-secondary hover:bg-bg-tertiary transition-colors',
                                                        typeColors[event.type] || 'border-l-border-sub'
                                                    )}>
                                                        <div className="w-[120px] shrink-0 text-right">
                                                            <p className="text-[9px] font-mono text-text-muted leading-tight">{tsDisplay}</p>
                                                        </div>
                                                        <div className="flex-1 min-w-0 text-left">
                                                            <p className={cn('text-[10px] font-black uppercase tracking-wide', event.color)}>{event.eventLabel}</p>
                                                            <p className="text-[11px] font-bold text-text-primary leading-tight mt-0.5 truncate">{event.entity}</p>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                {event.techName && <span className="text-[9px] text-text-muted uppercase font-bold">{event.techName}</span>}
                                                                {event.techName && event.clientName && <span className="text-text-muted text-[9px]">·</span>}
                                                                {event.clientName && <span className="text-[9px] text-text-muted uppercase">{event.clientName}</span>}
                                                            </div>
                                                        </div>
                                                        <Badge variant="outline" className="text-[7px] uppercase shrink-0 h-4">{event.type.replace('_', ' ')}</Badge>
                                                    </div>
                                                );
                                            })}
                                            {filteredTimelineEvents.length > 100 && (
                                                <p className="text-center text-[9px] text-text-muted font-bold uppercase py-4">
                                                    Showing 100 of {filteredTimelineEvents.length} events. Use filters to narrow results.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="__tech_removed__" className="m-0 text-left">
                                {selectedTechId && activeTech && techStats ? (
                                    <div className="space-y-8 animate-in fade-in duration-300 text-left">
                                        <div className="flex items-center justify-between text-left">
                                            <Button variant="ghost" size="sm" onClick={() => setSelectedTechId(null)} className="h-8 text-[10px] uppercase font-bold text-text-muted text-left">
                                                <ArrowLeft size={14} className="mr-2"/> Back to List
                                            </Button>
                                        </div>
                                        
                                        <div className="flex flex-col lg:flex-row gap-6 text-left">
                                            <div className="lg:w-1/3 space-y-6 text-left">
                                                <Card className="bg-bg-secondary border-border-main shadow-2xl text-left">
                                                    <CardContent className="p-5 space-y-4 text-center text-left">
                                                        <div className="flex flex-col items-center gap-2 text-left">
                                                            <Avatar className="h-14 w-14 border-2 border-brand-red">
                                                                <AvatarImage src={activeTech.avatarUrl} />
                                                                <AvatarFallback className="text-[10px]">{(activeTech.name || 'U').charAt(0)}</AvatarFallback>
                                                            </Avatar>
                                                            <div className="space-y-0.5 text-center">
                                                                <h2 className="text-lg font-bold text-text-primary uppercase tracking-wide text-center">{activeTech.name || 'Unnamed Operative'}</h2>
                                                                <p className="text-[10px] text-text-muted font-mono uppercase tracking-widest text-center">{activeTech.email}</p>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-4 pt-3 border-t border-border-sub/30 text-left">
                                                            <div className="space-y-1 text-center">
                                                                <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] text-center">Reliability</p>
                                                                <p className={cn("text-4xl font-mono font-bold tracking-tighter text-center", techStats.reliability > 90 ? 'text-text-green' : 'text-accent-gold')}>{techStats.reliability}%</p>
                                                                <Badge variant={getReliabilityTier(techStats.reliability) === 'Elite' ? 'active' : 'onhold'} className="h-5 px-3 uppercase text-[8px] tracking-widest">
                                                                    {getReliabilityTier(techStats.reliability)}
                                                                </Badge>
                                                            </div>
                                                            <div className="flex items-center justify-center gap-1.5 opacity-60 text-center">
                                                                <span className="text-[8px] text-text-muted font-mono uppercase tracking-widest text-center">REG ID: {activeTech.userId || activeTech.id}</span>
                                                            </div>

                                                            <div className="flex justify-center gap-3 text-left">
                                                                <Button variant="outline" size="sm" className="flex-1 h-8 !text-[10px] font-bold uppercase tracking-widest" asChild>
                                                                    <a href={`mailto:${activeTech.email}`}><Mail size={14} className="mr-2"/> Email</a>
                                                                </Button>
                                                                <Button variant="outline" size="sm" className="flex-1 h-8 !text-[10px] font-bold uppercase tracking-widest" asChild>
                                                                    <a href={`tel:${activeTech.phone}`}><Phone size={14} className="mr-2"/> Call</a>
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </CardContent>
                                                </Card>

                                                <Card className="bg-bg-tertiary/30 border-border-sub text-left">
                                                    <CardHeader className="p-4 pb-2 text-left">
                                                        <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-left">
                                                            <Gauge size={14} className="text-brand-red"/> Performance Index
                                                        </CardTitle>
                                                    </CardHeader>
                                                    <CardContent className="p-4 pt-0 space-y-3 text-left">
                                                        <div className="flex justify-between items-center px-1 text-left">
                                                            <span className="text-[10px] font-bold text-text-muted uppercase text-left">Mission Success</span>
                                                            <span className="text-xs font-bold text-text-primary uppercase text-right">{techStats.completed} / {techStats.total}</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-bg-primary rounded-full overflow-hidden border border-border-sub text-left">
                                                            <div className="h-full bg-brand-red" style={{ width: `${(techStats.completed / (techStats.total || 1)) * 100}%` }} />
                                                        </div>
                                                        <p className="text-[8px] text-text-muted uppercase italic text-left">Finalized deployments within rolling registry.</p>
                                                    </CardContent>
                                                </Card>
                                            </div>

                                            <div className="flex-1 overflow-hidden text-left">
                                                <Tabs defaultValue="assignments" className="w-full text-left">
                                                    <TabsList className="tabs bg-bg-secondary/50 border border-border-sub mb-6 h-10 w-full justify-start gap-8 px-6 text-left">
                                                        <TabsTrigger value="assignments" className="tab h-full data-[state=active]:bg-brand-red">ASSIGNMENT HISTORY ({techStats.myJobs.length})</TabsTrigger>
                                                        <TabsTrigger value="weeklogs" className="tab h-full data-[state=active]:bg-brand-red">WEEKLOG HISTORY ({techStats.myLogs.length})</TabsTrigger>
                                                        <TabsTrigger value="penalties" className="tab h-full data-[state=active]:bg-brand-red">PENALTY AUDIT</TabsTrigger>
                                                    </TabsList>

                                                    <TabsContent value="assignments" className="m-0 space-y-3 text-left">
                                                        {renderAuditHeader("Assignment Audit Manifest", sortedTechVisits.length)}
                                                        <div className="table-wrap p-0 text-left">
                                                            <Table>
                                                                <TableHeader className="bg-bg-tertiary">
                                                                    <TableRow className="hover:bg-transparent border-border-sub">
                                                                        <TableHead className="text-[7px] uppercase font-black tracking-widest pl-6">Mission ID</TableHead>
                                                                        <TableHead className="text-[9px] uppercase font-black tracking-widest text-left">Date</TableHead>
                                                                        <TableHead className="text-[9px] uppercase font-black tracking-widest text-center">Status</TableHead>
                                                                        <TableHead className="text-[9px] uppercase font-black tracking-widest text-center">Audit Registry</TableHead>
                                                                        <TableHead className="text-right pr-6 text-[9px] uppercase font-black tracking-widest">Actions</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {sortedTechVisits.map(wo => {
                                                                        const linkedLog = weeklyLogs.find(log => (log.items || []).some(item => item.workOrderId === wo.id));
                                                                        return (
                                                                            <TableRow key={wo.id} className="border-border-sub hover:bg-bg-tertiary transition-colors cursor-pointer group text-left" onClick={() => { setSelectedJob(wo); setIsJobOpen(true); }}>
                                                                                <TableCell className="text-left py-4 pl-6 text-left">
                                                                                    <div className="flex flex-col gap-0.5 text-left">
                                                                                        <span className="font-mono text-brand-red font-bold text-[9px] uppercase tracking-widest leading-none text-left">{(wo.id || '').toUpperCase()}</span>
                                                                                        <p className="text-xs font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors text-left">{wo.title || wo.description}</p>
                                                                                        <p className="text-[10px] text-text-muted font-bold uppercase mt-0.5 text-left">{wo.clientName}</p>
                                                                                    </div>
                                                                                </TableCell>
                                                                                <TableCell className="text-left text-xs font-mono font-bold text-text-secondary uppercase text-left">
                                                                                    {formatDateDisplay(wo.scheduleDate)}
                                                                                </TableCell>
                                                                                <TableCell className="text-center">
                                                                                    <Badge variant={wo.status === 'completed' ? 'active' : wo.status === 'in-progress' ? 'inprogress' : 'onhold'} className="uppercase h-4 text-[7px] tracking-widest">
                                                                                        {wo.status}
                                                                                    </Badge>
                                                                                </TableCell>
                                                                                <TableCell className="text-center">
                                                                                    {linkedLog ? (
                                                                                        <Badge variant="outline" className="text-[8px] bg-bg-primary border-border-sub uppercase tracking-tighter">
                                                                                            <FileCheck size={10} className="mr-1 text-text-green"/> WK: {linkedLog.weekOf}
                                                                                        </Badge>
                                                                                    ) : (
                                                                                        <span className="text-[9px] text-text-muted font-bold uppercase italic opacity-40">Pending audit</span>
                                                                                    )}
                                                                                </TableCell>
                                                                                <TableCell className="text-right pr-6">
                                                                                    <div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                                                                                        {wo.isAudited ? (
                                                                                            <Badge variant="active" className="h-7 text-[8px] uppercase tracking-widest px-2 bg-green-dim border-green-border text-text-green">
                                                                                                <ShieldCheck size={10} className="mr-1"/> Verified
                                                                                            </Badge>
                                                                                        ) : (
                                                                                            <Button 
                                                                                                variant="outline" 
                                                                                                size="sm" 
                                                                                                className="h-7 text-[8px] uppercase font-bold border-text-green text-text-green hover:bg-green-dim"
                                                                                                onClick={() => handleVerifyAssignment(wo.id)}
                                                                                            >
                                                                                                <Check size={12} className="mr-1"/> Verify
                                                                                            </Button>
                                                                                        )}
                                                                                        <Button 
                                                                                            variant="ghost" 
                                                                                            size="icon" 
                                                                                            className="h-7 w-7 text-text-muted hover:text-text-red"
                                                                                            onClick={() => handleDeleteAssignment(wo.id)}
                                                                                        >
                                                                                            <Trash2 size={14}/>
                                                                                        </Button>
                                                                                    </div>
                                                                                </TableCell>
                                                                            </TableRow>
                                                                        )
                                                                    })}
                                                                </TableBody>
                                                            </Table>
                                                        </div>
                                                    </TabsContent>

                                                    <TabsContent value="weeklogs" className="m-0 space-y-3 text-left">
                                                        {renderAuditHeader("Weekly Log Archive", techStats.myLogs.length)}
                                                        <div className="table-wrap p-0 text-left">
                                                            <Table>
                                                                <TableHeader className="bg-bg-tertiary">
                                                                    <TableRow className="hover:bg-transparent border-border-sub">
                                                                        <TableHead className="text-[9px] uppercase font-black tracking-widest pl-6">Week Period</TableHead>
                                                                        <TableHead className="text-[9px] uppercase font-black tracking-widest text-left">Audit Status</TableHead>
                                                                        <TableHead className="text-right pr-6 text-[9px] uppercase font-black tracking-widest">Payout</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {techStats.myLogs.map(log => (
                                                                        <TableRow key={log.id} className="border-border-sub hover:bg-bg-tertiary transition-colors text-left">
                                                                            <TableCell className="font-bold uppercase text-xs text-left pl-6 text-left">Week of {log.weekOf}</TableCell>
                                                                            <TableCell className="text-left text-left">
                                                                                <Badge variant={log.status === 'Approved' ? 'active' : log.status === 'Submitted' ? 'onhold' : 'pending'} className="uppercase h-4 text-[7px] tracking-widest">
                                                                                    {log.status}
                                                                                </Badge>
                                                                            </TableCell>
                                                                            <TableCell className="text-right pr-6 font-mono font-bold text-text-primary">${(log.totalPayout || 0).toFixed(2)}</TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </div>
                                                    </TabsContent>

                                                    <TabsContent value="penalties" className="m-0 space-y-3 text-left">
                                                        {techStats.penalties.map(p => (
                                                            <div key={p.id} className="p-2.5 rounded-lg border border-border-sub bg-bg-secondary flex items-center justify-between group hover:border-brand-red transition-all text-left">
                                                                <div className="flex items-center gap-4 text-left">
                                                                    <div className={cn(
                                                                        "p-2 rounded-lg border text-left",
                                                                        p.category === 'critical_failure' ? "bg-brand-red-dim text-text-red border-brand-red/30" : "bg-accent-gold-dim text-accent-gold border-accent-gold/30"
                                                                    )}>
                                                                        <ShieldAlert size={16}/>
                                                                    </div>
                                                                    <div className="text-left">
                                                                        <p className="text-xs font-bold text-text-primary uppercase tracking-wide text-left">{p.eventType.replace(/_/g, ' ')}</p>
                                                                        <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest mt-0.5 text-left">{format(parseISO(p.createdAt), 'MMM d, yyyy')} · {p.reason}</p>
                                                                    </div>
                                                                </div>
                                                                <span className="text-sm font-mono font-bold text-text-red">{p.scoreChange}</span>
                                                            </div>
                                                        ))}
                                                        {techStats.penalties.length === 0 && (
                                                            <div className="py-24 text-center border-2 border-dashed border-border-sub rounded-2xl bg-bg-secondary/30 text-left">
                                                                <CheckCircle2 size={48} className="mx-auto text-text-green mb-2" />
                                                                <p className="text-[10px] font-bold uppercase tracking-widest text-center">Clean penalty registry</p>
                                                            </div>
                                                        )}
                                                    </TabsContent>
                                                </Tabs>
                                            </div>
                                        </div>
                                    </div>
                                ) : renderTechnicianRoster()}
                            </TabsContent>

                            <TabsContent value="sites" className="m-0 text-left">
                                {renderSiteActivity()}
                            </TabsContent>

                            <TabsContent value="assignments_history" className="m-0 text-left">
                                <div className="space-y-4">
                                    {(() => {
                                        const completedJobs = [...workOrders, ...assignments].filter(wo => wo.status === 'completed').sort((a, b) => (b.scheduleDate || '').localeCompare(a.scheduleDate || ''));
                                        return (
                                            <>
                                                <div className="flex items-center justify-between">
                                                    <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">{completedJobs.length} Completed Records</p>
                                                    <Button variant="outline" size="sm" className="h-8 text-[10px] uppercase font-bold tracking-widest" onClick={() => {
                                                        const rows = [['DATE','ID','TITLE','CLIENT','TECH','STATUS']];
                                                        completedJobs.forEach(wo => {
                                                            const tech = technicians.find(t => t.id === (wo.assignedTechnicianId || wo.techId));
                                                            rows.push([wo.scheduleDate, wo.id.toUpperCase(), wo.title || wo.description || '', wo.clientName || '', tech?.name || 'Unassigned', wo.status]);
                                                        });
                                                        const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
                                                        const blob = new Blob([csv], { type: 'text/csv' });
                                                        const url = URL.createObjectURL(blob);
                                                        const a = document.createElement('a'); a.href = url; a.download = 'assignment_history.csv'; a.click();
                                                    }}>
                                                        <Download size={13} className="mr-1.5" /> Export CSV
                                                    </Button>
                                                </div>
                                                <div className="table-wrap text-left">
                                                    <Table>
                                                        <TableHeader className="bg-bg-tertiary">
                                                            <TableRow className="hover:bg-transparent border-border-sub">
                                                                <TableHead className="text-[9px] uppercase font-black tracking-widest pl-6">Date</TableHead>
                                                                <TableHead className="text-[9px] uppercase font-black tracking-widest">Job ID / Title</TableHead>
                                                                <TableHead className="text-[9px] uppercase font-black tracking-widest">Client</TableHead>
                                                                <TableHead className="text-[9px] uppercase font-black tracking-widest">Technician</TableHead>
                                                                <TableHead className="text-[9px] uppercase font-black tracking-widest">Status</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {completedJobs.map(wo => {
                                                                const tech = technicians.find(t => t.id === (wo.assignedTechnicianId || wo.techId));
                                                                return (
                                                                    <TableRow key={wo.id} className="border-border-sub hover:bg-bg-tertiary cursor-pointer" onClick={() => { setSelectedJob(wo); setIsJobOpen(true); }}>
                                                                        <TableCell className="py-3 pl-6 text-[10px] font-mono text-text-secondary uppercase">{formatDateDisplay(wo.scheduleDate)}</TableCell>
                                                                        <TableCell className="py-3">
                                                                            <p className="text-[9px] font-bold text-brand-red font-mono uppercase">{wo.id.toUpperCase()}</p>
                                                                            <p className="text-xs font-bold text-text-primary uppercase mt-0.5">{wo.title || wo.description}</p>
                                                                        </TableCell>
                                                                        <TableCell className="py-3 text-[10px] font-bold text-text-secondary uppercase">{wo.clientName}</TableCell>
                                                                        <TableCell className="py-3 text-[10px] font-bold text-text-secondary uppercase">{tech?.name || '—'}</TableCell>
                                                                        <TableCell className="py-3"><Badge variant="active" className="text-[8px] uppercase">completed</Badge></TableCell>
                                                                    </TableRow>
                                                                );
                                                            })}
                                                            {completedJobs.length === 0 && (
                                                                <TableRow><TableCell colSpan={5} className="py-16 text-center text-[10px] font-bold text-text-muted uppercase">No completed assignments</TableCell></TableRow>
                                                            )}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            </TabsContent>

                            <TabsContent value="project_history" className="m-0 text-left">
                                <div className="space-y-4">
                                    {(() => {
                                        const completedProjects = projects.filter(p => p.status === 'completed');
                                        return (
                                            <>
                                                <div className="flex items-center justify-between">
                                                    <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">{completedProjects.length} Completed Projects</p>
                                                    <Button variant="outline" size="sm" className="h-8 text-[10px] uppercase font-bold tracking-widest" onClick={() => {
                                                        const rows = [['NAME','CLIENT','STATUS','START DATE','END DATE']];
                                                        completedProjects.forEach(p => rows.push([p.name, (p as any).client || (p as any).clientName || '', p.status || '', p.startDate || '', (p as any).endDate || '']));
                                                        const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
                                                        const blob = new Blob([csv], { type: 'text/csv' });
                                                        const url = URL.createObjectURL(blob);
                                                        const a = document.createElement('a'); a.href = url; a.download = 'project_history.csv'; a.click();
                                                    }}>
                                                        <Download size={13} className="mr-1.5" /> Export CSV
                                                    </Button>
                                                </div>
                                                <div className="table-wrap text-left">
                                                    <Table>
                                                        <TableHeader className="bg-bg-tertiary">
                                                            <TableRow className="hover:bg-transparent border-border-sub">
                                                                <TableHead className="text-[9px] uppercase font-black tracking-widest pl-6">Project</TableHead>
                                                                <TableHead className="text-[9px] uppercase font-black tracking-widest">Client</TableHead>
                                                                <TableHead className="text-[9px] uppercase font-black tracking-widest">Status</TableHead>
                                                                <TableHead className="text-[9px] uppercase font-black tracking-widest">Completed</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {completedProjects.map(p => (
                                                                <TableRow key={p.id} className="border-border-sub hover:bg-bg-tertiary">
                                                                    <TableCell className="py-3 pl-6">
                                                                        <p className="text-xs font-bold text-text-primary uppercase">{p.name}</p>
                                                                        <p className="text-[9px] font-mono text-brand-red uppercase mt-0.5">{p.id?.toUpperCase()}</p>
                                                                    </TableCell>
                                                                    <TableCell className="py-3 text-[10px] font-bold text-text-secondary uppercase">{(p as any).client || (p as any).clientName || '—'}</TableCell>
                                                                    <TableCell className="py-3"><Badge variant="active" className="text-[8px] uppercase">completed</Badge></TableCell>
                                                                    <TableCell className="py-3 text-[10px] font-mono text-text-muted">{(p as any).endDate || '—'}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                            {completedProjects.length === 0 && (
                                                                <TableRow><TableCell colSpan={4} className="py-16 text-center text-[10px] font-bold text-text-muted uppercase">No completed projects</TableCell></TableRow>
                                                            )}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            </TabsContent>

                            <TabsContent value="weekly_logs" className="m-0 text-left">
                                <div className="space-y-4">
                                    {(() => {
                                        const submittedLogs = weeklyLogs.filter(l => l.status === 'Submitted' || l.status === 'Approved').sort((a, b) => b.weekOf.localeCompare(a.weekOf));
                                        return (
                                            <>
                                                <div className="flex items-center justify-between">
                                                    <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">{submittedLogs.length} Submitted / Approved Logs</p>
                                                    <Button variant="outline" size="sm" className="h-8 text-[10px] uppercase font-bold tracking-widest" onClick={() => {
                                                        const rows = [['WEEK OF','TECHNICIAN','ITEMS','STATUS']];
                                                        submittedLogs.forEach(l => {
                                                            const tech = technicians.find(t => t.id === l.techId);
                                                            rows.push([l.weekOf, tech?.name || l.techId, String((l.items || []).length), l.status]);
                                                        });
                                                        const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
                                                        const blob = new Blob([csv], { type: 'text/csv' });
                                                        const url = URL.createObjectURL(blob);
                                                        const a = document.createElement('a'); a.href = url; a.download = 'weekly_log_history.csv'; a.click();
                                                    }}>
                                                        <Download size={13} className="mr-1.5" /> Export CSV
                                                    </Button>
                                                </div>
                                                <div className="table-wrap text-left">
                                                    <Table>
                                                        <TableHeader className="bg-bg-tertiary">
                                                            <TableRow className="hover:bg-transparent border-border-sub">
                                                                <TableHead className="text-[9px] uppercase font-black tracking-widest pl-6">Week Of</TableHead>
                                                                <TableHead className="text-[9px] uppercase font-black tracking-widest">Technician</TableHead>
                                                                <TableHead className="text-[9px] uppercase font-black tracking-widest text-center">Items</TableHead>
                                                                <TableHead className="text-[9px] uppercase font-black tracking-widest">Status</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {submittedLogs.map(l => {
                                                                const tech = technicians.find(t => t.id === l.techId);
                                                                return (
                                                                    <TableRow key={l.id} className="border-border-sub hover:bg-bg-tertiary">
                                                                        <TableCell className="py-3 pl-6 text-[10px] font-mono font-bold text-text-secondary uppercase">{l.weekOf}</TableCell>
                                                                        <TableCell className="py-3 text-[10px] font-bold text-text-primary uppercase">{tech?.name || l.techId}</TableCell>
                                                                        <TableCell className="py-3 text-center text-[10px] font-bold text-text-secondary">{(l.items || []).length}</TableCell>
                                                                        <TableCell className="py-3"><Badge variant={l.status === 'Approved' ? 'active' : 'scheduled'} className="text-[8px] uppercase">{l.status}</Badge></TableCell>
                                                                    </TableRow>
                                                                );
                                                            })}
                                                            {submittedLogs.length === 0 && (
                                                                <TableRow><TableCell colSpan={4} className="py-16 text-center text-[10px] font-bold text-text-muted uppercase">No submitted or approved logs</TableCell></TableRow>
                                                            )}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            </TabsContent>

                            <TabsContent value="app_activity" className="m-0 text-left">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        {(['all', 'admin', 'tech', 'client'] as const).map(f => (
                                            <button
                                                key={f}
                                                onClick={() => setActivityFilter(f)}
                                                className={cn(
                                                    'h-7 px-3 rounded-md text-[9px] font-black uppercase tracking-widest border transition-colors',
                                                    activityFilter === f
                                                        ? 'bg-brand-red text-white border-brand-red'
                                                        : 'border-border-sub text-text-muted hover:text-text-primary bg-bg-secondary'
                                                )}
                                            >{f}</button>
                                        ))}
                                    </div>
                                    {(() => {
                                        const events: { id: string; time: string; actor: string; role: 'admin' | 'tech' | 'client'; action: string; detail: string }[] = [];
                                        // Completed assignments
                                        [...workOrders, ...assignments].filter(wo => wo.status === 'completed' && wo.scheduleDate).slice(0, 30).forEach(wo => {
                                            const tech = technicians.find(t => t.id === (wo.assignedTechnicianId || wo.techId));
                                            if (tech && !tech.roles?.includes('client')) {
                                                events.push({ id: `wo-${wo.id}`, time: wo.scheduleDate || '', actor: tech.name || 'Field Tech', role: 'tech', action: 'Completed assignment', detail: wo.title || wo.description || wo.id });
                                            }
                                        });
                                        // Submitted/Approved weekly logs
                                        weeklyLogs.filter(wl => wl.status === 'Submitted' || wl.status === 'Approved').slice(0, 20).forEach(wl => {
                                            const tech = technicians.find(t => t.id === wl.techId);
                                            events.push({ id: `wl-${wl.id}`, time: wl.submittedAt || wl.weekOf || '', actor: tech?.name || 'Field Tech', role: 'tech', action: wl.status === 'Approved' ? 'Log approved' : 'Submitted weekly log', detail: `Week of ${wl.weekOf}` });
                                        });
                                        // Site requests
                                        siteRequests.filter(r => r.status === 'pending' || r.status === 'approved').slice(0, 15).forEach(r => {
                                            events.push({ id: `sr-${r.id}`, time: r.submittedDate || '', actor: (r as any).requestorName || 'Client', role: 'client', action: `Site request — ${r.status}`, detail: r.siteName || '' });
                                        });
                                        // Completed projects
                                        projects.filter(p => p.status === 'completed').slice(0, 10).forEach(p => {
                                            events.push({ id: `pr-${p.id}`, time: (p as any).endDate || (p as any).updatedAt || '', actor: 'Admin', role: 'admin', action: 'Project completed', detail: p.name });
                                        });

                                        const allEvents = events.filter(e => e.time).sort((a, b) => b.time.localeCompare(a.time)).slice(0, 60);
                                        const filtered = activityFilter === 'all' ? allEvents : allEvents.filter(e => e.role === activityFilter);
                                        const roleColors: Record<string, string> = {
                                            admin: 'text-brand-red bg-brand-red/10 border-brand-red/20',
                                            tech: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
                                            client: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
                                        };
                                        return filtered.length === 0 ? (
                                            <div className="py-16 text-center">
                                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">No activity recorded yet</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-1.5">
                                                {filtered.map(item => (
                                                    <div key={item.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-bg-secondary border border-border-sub hover:bg-bg-tertiary transition-colors">
                                                        <span className={cn('shrink-0 text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border mt-0.5', roleColors[item.role])}>{item.role}</span>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-baseline gap-2 flex-wrap">
                                                                <span className="text-[11px] font-bold text-text-primary uppercase tracking-wide">{item.actor}</span>
                                                                <span className="text-[10px] text-text-muted">{item.action}</span>
                                                            </div>
                                                            {item.detail && <p className="text-[9px] text-text-muted uppercase tracking-widest mt-0.5 truncate">{item.detail}</p>}
                                                        </div>
                                                        <span className="text-[8px] text-text-muted font-mono shrink-0 mt-0.5">{item.time.slice(0, 10)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </TabsContent>

                        </div>
                    </Tabs>
                ) : (
                    <div className="space-y-6 animate-in fade-in duration-300 text-left">
                        {searchResults.length > 0 ? searchResults.map((r, i) => (
                            <div key={i} onClick={() => handleResultClick(r)} className="p-5 rounded-2xl border border-border-main bg-bg-secondary hover:border-brand-red transition-all flex gap-5 group cursor-pointer text-left shadow-sm">
                                <Badge variant="outline" className={cn("h-6 text-[9px] uppercase tracking-widest shrink-0 mt-0.5 px-3 font-black text-left", r.cls)}>
                                    {r.type}
                                </Badge>
                                <div className="space-y-1.5 flex-1 min-w-0 text-left">
                                    <p className="text-base font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors truncate text-left">{r.label}</p>
                                    <p className="text-[11px] text-text-muted uppercase tracking-widest font-bold leading-relaxed text-left">{r.meta}</p>
                                </div>
                                <ChevronRight size={20} className="text-text-muted group-hover:text-text-primary group-hover:translate-x-1 transition-all self-center" />
                            </div>
                        )) : (
                            <div className="py-24 text-center border-2 border-dashed border-border-main rounded-2xl opacity-60 bg-bg-secondary/30 text-left">
                                <SearchX size={48} className="mx-auto text-text-muted mb-4" />
                                <p className="text-sm font-bold uppercase tracking-widest text-center text-text-muted">No operational matches found</p>
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
