'use client';

import { useState, useMemo } from 'react';
import { 
    Search, 
    User, 
    MapPin, 
    Activity, 
    History, 
    AlertTriangle, 
    X, 
    FileText, 
    CheckCircle2, 
    Briefcase, 
    Clock, 
    Building2,
    DollarSign,
    ShieldAlert,
    ChevronRight,
    ArrowUpRight,
    ExternalLink
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { 
    technicians, 
    workOrders, 
    projects, 
    penaltyEvents,
    timeOffRequests
} from '@/lib/data';
import { cn } from '@/lib/utils';
import { PersonnelDetailDialog } from '../directory/components/personnel-detail-dialog';
import { JobDetailDialog } from '@/components/job-detail-dialog';
import type { Technician, WorkOrder } from '@/lib/types';
import { format, parseISO } from 'date-fns';

// ── Mock Audit Data ───────────────────────────────────────────────────────────
const AUDIT_ACTIONS = [
    { dot: "done", action: "Assignment assigned — aaro_asmt_001", sub: 'by System Administrator · 04-04-2026 · "Manual work order assigned"' },
    { dot: "done", action: "Assignment assigned — client_asmt_001", sub: 'by System Administrator · 04-04-2026 · "Client work order assigned"' },
    { dot: "done", action: "Assignment created — fn_asmt_001", sub: 'by System Administrator · 04-04-2026 · "Initial assignment created"' },
    { dot: "warn", action: "Penalty recorded — late log · 3 pts", sub: "Corey Williams · 04-04-2026 · weekly log submitted after due date" },
    { dot: "done", action: "Import batch — field_nation_csv", sub: "field_nation_jobs.csv · 1 row · 1 created · by System Administrator · 04-04-2026" },
    { dot: "flag", action: 'Client request rejected — "Computers Down!"', sub: "by System Administrator · 04-23-2026 · client fields blank at submission" },
    { dot: "warn", action: "Time-off request — Personal Time Off", sub: "Corey Williams · starts 04-23-2026 · status: pending" },
];

export default function ReportsPage() {
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState("tech");
    const [selectedTechId, setSelectedTechId] = useState("tech-001");
    const [clDays, setClDays] = useState("30");
    const [isClLoaded, setIsClLoaded] = useState(false);

    // Detail States
    const [isPersonnelOpen, setIsPersonnelOpen] = useState(false);
    const [selectedPersonnel, setSelectedPersonnel] = useState<Technician | null>(null);
    const [isJobOpen, setIsJobOpen] = useState(false);
    const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);

    const activeTech = useMemo(() => technicians.find(t => t.id === selectedTechId), [selectedTechId]);

    const techStats = useMemo(() => {
        if (!selectedTechId) return null;
        const myJobs = workOrders.filter(wo => wo.assignedTechnicianId === selectedTechId);
        const completed = myJobs.filter(wo => wo.status === 'completed').length;
        const totalPts = penaltyEvents.filter(pe => pe.technicianId === selectedTechId).reduce((acc, curr) => acc + Math.abs(curr.points), 0);
        const reliability = Math.max(0, 100 - (totalPts * 5));
        
        return { total: myJobs.length, completed, reliability, penaltyPoints: totalPts };
    }, [selectedTechId]);

    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase();
        
        const results: any[] = [];
        
        technicians.forEach(t => {
            if (t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q)) {
                results.push({ type: 'Technician', id: t.id, label: t.name, meta: `${t.email} · ${t.role} · active`, cls: 'bg-green' });
            }
        });

        workOrders.forEach(wo => {
            if (wo.id.toLowerCase().includes(q) || wo.description.toLowerCase().includes(q)) {
                results.push({ type: 'Work order', id: wo.id, label: `WO ${wo.id.toUpperCase()} — ${wo.description}`, meta: `${wo.clientName} · ${wo.location} · ${wo.scheduleDate} · $${wo.pay} · ${wo.status}`, cls: 'bg-blue' });
            }
        });

        projects.forEach(p => {
            if (p.name.toLowerCase().includes(q) || p.client.toLowerCase().includes(q)) {
                results.push({ type: 'Project', id: p.id, label: `${p.name} — ${p.client}`, meta: `${p.location} · ${p.startDate} · ${p.status}`, cls: 'bg-amber' });
            }
        });

        return results;
    }, [searchQuery]);

    const handleResultClick = (result: any) => {
        if (result.type === 'Technician') {
            const tech = technicians.find(t => t.id === result.id);
            if (tech) {
                setSelectedPersonnel(tech);
                setIsPersonnelOpen(true);
            }
        } else if (result.type === 'Work order') {
            const wo = workOrders.find(w => w.id === result.id);
            if (wo) {
                setSelectedJob(wo);
                setIsJobOpen(true);
            }
        }
    };

    const formatDateDisplay = (dateStr: string) => {
        if (!dateStr) return 'TBD';
        try {
          return format(parseISO(dateStr), "MM-dd-yyyy");
        } catch (e) {
          return dateStr;
        }
    };

    return (
        <div className="max-w-[900px] mx-auto space-y-6">
            <header className="space-y-1 text-center">
                <h1 className="text-xl font-bold uppercase tracking-widest text-text-primary">Operational Intelligence</h1>
                <p className="text-xs text-text-muted uppercase font-bold tracking-widest">Historical oversight & cross-system lookup terminal</p>
            </header>

            <div className="space-y-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                    <Input 
                        placeholder="Search technicians, work orders, sites, projects…" 
                        className="h-11 pl-10 bg-bg-secondary border-border-main text-xs uppercase font-bold tracking-wide"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button 
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                            onClick={() => setSearchQuery("")}
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>

                {!searchQuery ? (
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="tabs border-b border-border-sub bg-transparent rounded-none h-auto p-0 gap-8 justify-center">
                            <TabsTrigger value="tech" className="tab-trigger-report">Technician profile</TabsTrigger>
                            <TabsTrigger value="sites" className="tab-trigger-report">Site history</TabsTrigger>
                            <TabsTrigger value="flags" className="tab-trigger-report flex items-center gap-2">
                                Anomaly flags <Badge variant="destructive" className="h-4 px-1 text-[8px] min-w-[16px] flex items-center justify-center">5</Badge>
                            </TabsTrigger>
                            <TabsTrigger value="changelog" className="tab-trigger-report">Change log</TabsTrigger>
                        </TabsList>

                        <div className="mt-6">
                            <TabsContent value="tech" className="m-0 space-y-8">
                                {activeTech && techStats && (
                                    <>
                                        <Card className="bg-bg-secondary border-border-main shadow-none">
                                            <CardHeader className="pb-4">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex items-center gap-4">
                                                        <Avatar className="h-12 w-12 border border-border-sub">
                                                            <AvatarImage src={activeTech.avatarUrl} />
                                                            <AvatarFallback>{activeTech.name.charAt(0)}</AvatarFallback>
                                                        </Avatar>
                                                        <div className="space-y-0.5">
                                                            <CardTitle className="text-base">{activeTech.name}</CardTitle>
                                                            <p className="text-[10px] text-text-muted font-mono uppercase tracking-tighter">
                                                                {activeTech.email} · {activeTech.id.slice(0, 12)}…
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <Badge variant="active" className="text-[8px] uppercase tracking-widest">Active</Badge>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="space-y-6">
                                                <div className="grid grid-cols-3 gap-2 text-center">
                                                    <div className="p-3 rounded-lg bg-bg-primary border border-border-sub space-y-1">
                                                        <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">Assignments</p>
                                                        <p className="text-xl font-bold text-text-primary">{techStats.total}</p>
                                                        <p className="text-[8px] text-text-muted uppercase">lifetime</p>
                                                    </div>
                                                    <div className="p-3 rounded-lg bg-bg-primary border border-border-sub space-y-1">
                                                        <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">Completed</p>
                                                        <p className="text-xl font-bold text-text-primary">{techStats.completed}</p>
                                                        <p className="text-[8px] text-text-muted uppercase">confirmed</p>
                                                    </div>
                                                    <div className="p-3 rounded-lg bg-bg-primary border border-border-sub space-y-1">
                                                        <p className="text-[8px] font-black text-text-muted uppercase tracking-widest">Reliability</p>
                                                        <p className={cn("text-xl font-bold", techStats.reliability > 90 ? 'text-text-green' : 'text-accent-gold')}>{techStats.reliability}%</p>
                                                        <p className="text-[8px] text-text-muted uppercase">at risk</p>
                                                    </div>
                                                </div>
                                                
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Penalty points this period</p>
                                                        <p className="text-[10px] font-bold text-text-red uppercase">{techStats.penaltyPoints} pts</p>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-bg-primary rounded-full overflow-hidden border border-border-sub">
                                                        <div 
                                                            className={cn("h-full rounded-full transition-all duration-500", techStats.penaltyPoints > 5 ? 'bg-text-red' : 'bg-accent-gold')} 
                                                            style={{ width: `${Math.min(100, (techStats.penaltyPoints / 10) * 100)}%` }} 
                                                        />
                                                    </div>
                                                    <div className="flex justify-between items-center text-[8px] font-bold text-text-muted uppercase tracking-tighter">
                                                        <span>0 — Reliable</span>
                                                        <span>2.5</span>
                                                        <span>7.5 — At risk</span>
                                                        <span>8+ Restricted</span>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        <div className="space-y-4">
                                            <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1 text-center">Assignment history</h3>
                                            <div className="relative pl-6 space-y-6 border-l border-border-sub ml-2 text-left">
                                                <div className="space-y-1 relative">
                                                    <div className="absolute -left-[27px] top-1 h-2 w-2 rounded-full bg-text-green ring-4 ring-bg-primary" />
                                                    <p className="text-xs font-bold text-text-primary uppercase tracking-wide">
                                                        Follow-up camera adjustment <span className="text-[10px] text-text-muted normal-case font-normal ml-2">· 04-04-2026</span>
                                                    </p>
                                                    <div className="flex items-center gap-1 text-[10px] text-text-muted uppercase tracking-widest"><MapPin size={10} className="text-brand-red"/> Ann Arbor, MI · completed · aaro_wo_001</div>
                                                </div>
                                                <div className="space-y-1 relative">
                                                    <div className="absolute -left-[27px] top-1 h-2 w-2 rounded-full bg-text-green ring-4 ring-bg-primary" />
                                                    <p className="text-xs font-bold text-text-primary uppercase tracking-wide">
                                                        Front camera offline <span className="text-[10px] text-text-muted normal-case font-normal ml-2">· 04-04-2026</span>
                                                    </p>
                                                    <div className="flex items-center gap-1 text-[10px] text-text-muted uppercase tracking-widest"><MapPin size={10} className="text-brand-red"/> Detroit, MI · completed · client_wo_001</div>
                                                </div>
                                                <div className="space-y-1 relative">
                                                    <div className="absolute -left-[27px] top-1 h-2 w-2 rounded-full bg-accent-gold ring-4 ring-bg-primary" />
                                                    <p className="text-xs font-bold text-text-primary uppercase tracking-wide">
                                                        Aarons AP Refresh <span className="text-[10px] text-text-muted normal-case font-normal ml-2">· 04-17-2026</span>
                                                    </p>
                                                    <div className="flex items-center gap-1 text-[10px] text-text-muted uppercase tracking-widest"><MapPin size={10} className="text-brand-red"/> Toledo, OH · scheduled · WO 18889221 · $70</div>
                                                </div>
                                                <div className="space-y-1 relative">
                                                    <div className="absolute -left-[27px] top-1 h-2 w-2 rounded-full bg-text-red ring-4 ring-bg-primary" />
                                                    <p className="text-xs font-bold text-text-red uppercase tracking-wide">
                                                        Penalty — late log <span className="text-[10px] text-text-muted normal-case font-normal ml-2">· 04-04-2026</span>
                                                    </p>
                                                    <p className="text-[10px] text-text-muted uppercase tracking-widest">3 pts · weekly log submitted after due date</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1 text-center">Linked records</h3>
                                            <div className="space-y-1.5">
                                                <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between group hover:bg-bg-tertiary transition-colors cursor-pointer">
                                                    <span className="text-[11px] font-bold text-text-primary uppercase">Weekly log — week of Mar 30, 2026</span>
                                                    <span className="text-[9px] text-text-muted uppercase font-bold tracking-widest">draft · due 04-06</span>
                                                </div>
                                                <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between group hover:bg-bg-tertiary transition-colors cursor-pointer">
                                                    <span className="text-[11px] font-bold text-text-primary uppercase">Reimbursement — materials</span>
                                                    <span className="text-[9px] text-text-muted uppercase font-bold tracking-widest">$45 · pending</span>
                                                </div>
                                                <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between group hover:bg-bg-tertiary transition-colors cursor-pointer">
                                                    <span className="text-[11px] font-bold text-text-primary uppercase">Time-off · 04-23-2026</span>
                                                    <span className="text-[9px] text-text-muted uppercase font-bold tracking-widest">pending</span>
                                                </div>
                                                <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between group hover:bg-bg-tertiary transition-colors cursor-pointer">
                                                    <span className="text-[11px] font-bold text-text-primary uppercase">Project: Refresh</span>
                                                    <span className="text-[9px] text-text-muted uppercase font-bold tracking-widest">project lead · ACTIVE</span>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </TabsContent>

                            <TabsContent value="sites" className="m-0">
                                <div className="py-24 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30">
                                    <Building2 size={48} className="mx-auto text-text-muted mb-4 opacity-10" />
                                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted italic">No managed sites identified for this context</p>
                                    <p className="text-[10px] text-text-muted max-w-[320px] mx-auto mt-2 uppercase leading-relaxed font-medium">
                                        Once client coordinates are registered in the <code className="bg-bg-primary px-1 rounded text-brand-red">managedSites</code> collection, full visit history and site health will appear here.
                                    </p>
                                </div>
                            </TabsContent>

                            <TabsContent value="flags" className="m-0 space-y-8">
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1 flex items-center justify-between">
                                        Schema & Data Consistency — 2 require action
                                        <AlertTriangle size={14} className="text-text-red" />
                                    </h3>
                                    <div className="space-y-2">
                                        <div className="p-4 rounded-xl border border-border-alert bg-brand-red-dim/5 flex gap-4 text-left">
                                            <div className="h-1.5 w-1.5 rounded-full bg-text-red mt-1 shrink-0" />
                                            <div className="space-y-1">
                                                <p className="text-[11px] font-bold text-text-red uppercase tracking-wide">5 Malformed assignment documents — swapped fields</p>
                                                <p className="text-[10px] text-text-muted leading-relaxed uppercase">
                                                    IDs: 1dELYf5Y, BcHQYPPw, FbLchazU, SesOkMZ6… — Time and location parameters were inverted during batch ingestion. This inhibits assignment logic and GPS validation.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="p-4 rounded-xl border border-border-alert bg-brand-red-dim/5 flex gap-4 text-left">
                                            <div className="h-1.5 w-1.5 rounded-full bg-text-red mt-1 shrink-0" />
                                            <div className="space-y-1">
                                                <p className="text-[11px] font-bold text-text-red uppercase tracking-wide">Schema inconsistency — project daily logs field mismatch</p>
                                                <p className="text-[10px] text-text-muted leading-relaxed uppercase">
                                                    GD7bfWeRk uses <code className="text-text-primary">technicianId</code> instead of the collection standard <code className="text-text-primary">techId</code>. This breaks reporting queries on this project folder.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1 flex items-center justify-between">
                                        Operational warnings — 3
                                        <Clock size={14} className="text-accent-gold" />
                                    </h3>
                                    <div className="space-y-2">
                                        <div className="p-4 rounded-xl border border-border-gold bg-accent-gold-dim/5 flex gap-4 text-left">
                                            <div className="h-1.5 w-1.5 rounded-full bg-accent-gold mt-1 shrink-0" />
                                            <div className="space-y-1">
                                                <p className="text-[11px] font-bold text-accent-gold uppercase tracking-wide">4 Scheduled assignments unallocated</p>
                                                <p className="text-[10px] text-text-muted leading-relaxed uppercase">
                                                    WO 18948530, 18967014, 18924409 — <code className="text-text-primary">techId</code> is null. These assignments will not propagate to field terminals and are currently invisible to the workforce.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="p-4 rounded-xl border border-border-gold bg-accent-gold-dim/5 flex gap-4 text-left">
                                            <div className="h-1.5 w-1.5 rounded-full bg-accent-gold mt-1 shrink-0" />
                                            <div className="space-y-1">
                                                <p className="text-[11px] font-bold text-accent-gold uppercase tracking-wide">1 Weekly log overdue — not submitted</p>
                                                <p className="text-[10px] text-text-muted leading-relaxed uppercase">
                                                    Corey Williams — week of 03-30-2026. Status: Draft. Log contains 3 assignment items requiring administrative verification.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="p-4 rounded-xl border border-border-gold bg-accent-gold-dim/5 flex gap-4 text-left">
                                            <div className="h-1.5 w-1.5 rounded-full bg-accent-gold mt-1 shrink-0" />
                                            <div className="space-y-1">
                                                <p className="text-[11px] font-bold text-accent-gold uppercase tracking-wide">2 Session check-ins remain open</p>
                                                <p className="text-[10px] text-text-muted leading-relaxed uppercase">
                                                    aaro_tl_001 and client_timelog_001 have no check-out signatures. GPS verification is pending and settlement duration cannot be calculated.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="changelog" className="m-0">
                                {!isClLoaded ? (
                                    <div className="py-24 text-center border border-border-sub bg-bg-secondary/50 rounded-xl space-y-6">
                                        <History size={48} className="mx-auto text-text-muted opacity-20" />
                                        <div className="space-y-2">
                                            <p className="text-sm font-bold uppercase text-text-primary tracking-wide">Change Log On-Demand</p>
                                            <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium">Read-efficiency mode: Log data is only fetched upon manual trigger.</p>
                                        </div>
                                        <div className="flex items-center justify-center gap-3">
                                            <Select value={clDays} onValueChange={setClDays}>
                                                <SelectTrigger className="w-[180px] bg-bg-primary h-10 text-[10px] uppercase font-bold tracking-widest">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="7">Last 7 Days</SelectItem>
                                                    <SelectItem value="30">Last 30 Days</SelectItem>
                                                    <SelectItem value="90">Last Quarter</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <Button onClick={() => setIsClLoaded(true)} className="h-10 px-8">Load Registry Audit</Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-6 animate-in fade-in duration-500">
                                        <div className="flex items-center justify-between px-1">
                                            <div className="flex gap-3">
                                                <Select value={clDays} onValueChange={(val) => setClDays(val)}>
                                                    <SelectTrigger className="w-[160px] bg-bg-secondary h-9 text-[10px] uppercase font-bold tracking-widest border-border-sub">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="7">Last 7 Days</SelectItem>
                                                        <SelectItem value="30">Last 30 Days</SelectItem>
                                                        <SelectItem value="90">Last Quarter</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <Button variant="outline" size="sm" className="h-9" onClick={() => setIsClLoaded(false)}>Reset Terminal</Button>
                                            </div>
                                            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">{AUDIT_ACTIONS.length} events retrieved</span>
                                        </div>
                                        
                                        <div className="relative pl-6 space-y-8 border-l border-border-sub ml-2 text-left">
                                            {AUDIT_ACTIONS.map((evt, i) => (
                                                <div key={i} className="space-y-1 relative group">
                                                    <div className={cn(
                                                        "absolute -left-[27px] top-1.5 h-2 w-2 rounded-full ring-4 ring-bg-primary transition-all group-hover:scale-125",
                                                        evt.dot === 'done' ? 'bg-text-green' : evt.dot === 'warn' ? 'bg-accent-gold' : 'bg-text-red'
                                                    )} />
                                                    <p className="text-[13px] font-bold text-text-primary uppercase tracking-wide leading-none">{evt.action}</p>
                                                    <p className="text-[10px] text-text-muted font-medium uppercase tracking-widest leading-relaxed">{evt.sub}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </TabsContent>
                        </div>
                    </Tabs>
                ) : (
                    /* GLOBAL SEARCH RESULTS VIEW */
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="flex items-center justify-between border-b border-border-sub pb-3 px-1">
                             <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">{searchResults.length} intelligence matches for &quot;{searchQuery}&quot;</h3>
                        </div>
                        <div className="space-y-2">
                            {searchResults.length > 0 ? searchResults.map((r, i) => (
                                <div key={i} onClick={() => handleResultClick(r)} className="p-4 rounded-xl border border-border-main bg-bg-secondary hover:border-text-muted transition-all flex gap-4 group cursor-pointer text-left">
                                    <Badge variant="outline" className={cn(
                                        "h-5 text-[8px] uppercase tracking-widest shrink-0 mt-0.5",
                                        r.type === 'Technician' ? 'bg-green-dim text-text-green border-green-border' :
                                        r.type === 'Project' ? 'bg-accent-gold-dim text-accent-gold border-border-gold' :
                                        'bg-bg-tertiary text-text-primary'
                                    )}>
                                        {r.type}
                                    </Badge>
                                    <div className="space-y-1">
                                        <p className="text-sm font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors">{r.label}</p>
                                        <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium leading-relaxed">{r.meta}</p>
                                    </div>
                                    <ChevronRight size={16} className="ml-auto text-text-muted group-hover:text-text-primary group-hover:translate-x-1 transition-all" />
                                </div>
                            )) : (
                                <div className="py-24 text-center border border-dashed border-border-main rounded-xl opacity-60">
                                    <Search size={48} className="mx-auto text-text-muted mb-4" />
                                    <p className="text-sm font-bold uppercase tracking-widest text-text-muted">No tactical matches in registry</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <PersonnelDetailDialog 
                isOpen={isPersonnelOpen} 
                setIsOpen={setIsPersonnelOpen} 
                person={selectedPersonnel} 
                workOrders={workOrders.filter(wo => wo.assignedTechnicianId === selectedPersonnel?.id)} 
                timeOffRequests={timeOffRequests.filter(tor => tor.technicianId === selectedPersonnel?.id)}
            />

            <JobDetailDialog 
                isOpen={isJobOpen} 
                setIsOpen={setIsJobOpen} 
                mission={selectedJob} 
            />
            
            <style jsx global>{`
                .tab-trigger-report {
                    @apply px-0 pb-3 pt-0 h-auto bg-transparent rounded-none border-b-2 border-transparent text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted data-[state=active]:bg-transparent data-[state=active]:text-text-primary data-[state=active]:border-brand-red data-[state=active]:shadow-none transition-all;
                }
            `}</style>
        </div>
    );
}