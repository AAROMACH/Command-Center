'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { technicians, workOrders, assignmentTimeLogs } from '@/lib/data';
import type { Technician, WorkOrder, AssignmentTimeLog } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
    MapPin, 
    ChevronLeft,
    Users,
    Activity,
    Clock,
    Phone,
    UserCheck,
    Navigation,
    ShieldCheck,
    Calendar,
    Wrench,
    CheckCircle2,
    History,
    FileText,
    Download,
    FolderOpen,
    ChevronRight,
    TrendingUp,
    AlertCircle,
    Info,
    ArrowUpRight,
    ExternalLink,
    Check
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, parseISO } from 'date-fns';
import { JobDetailDialog } from '@/components/job-detail-dialog';

const MAPS_API_KEY = "AIzaSyCZ3jd1i_QKskjeq2kJSjGV0n7Z4uQYzH0";

export default function SiteDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    
    // Job Detail state
    const [isJobOpen, setIsJobOpen] = useState(false);
    const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);

    useEffect(() => {
        setMounted(true);
        setCurrentUserId(localStorage.getItem('currentUserId'));
    }, []);

    const id = params.id as string;

    const currentUser = useMemo(() => 
        currentUserId ? technicians.find(t => t.id === currentUserId) : null
    , [currentUserId]);

    // Reconstruct the specific site data from the ID
    const siteData = useMemo(() => {
        if (!currentUser?.clientCompany) return null;
        
        const clientSites = currentUser.managedSites || [];
        const clientWorkOrders = workOrders.filter(wo => wo.clientName === currentUser.clientCompany);
        
        // Find by ID in managed sites or by derived ID from work orders
        let targetSite = clientSites.find(s => s.id === id);
        let location = targetSite?.location;

        if (!targetSite) {
            // If not in managed sites, it might be a derived ID
            const woWithSite = clientWorkOrders.find(wo => `site-${wo.location.replace(/\s+/g, '-').toLowerCase()}` === id);
            if (woWithSite) {
                location = woWithSite.location;
                targetSite = { id, name: location.split(',')[0], location };
            }
        }

        if (!targetSite || !location) return null;

        const activeAssignments = clientWorkOrders.filter(wo => wo.location === location && wo.status !== 'completed');
        const historicalAssignments = clientWorkOrders.filter(wo => wo.location === location && wo.status === 'completed');
        const liveCheckIns = assignmentTimeLogs.filter(log => 
            activeAssignments.some(wo => wo.id === log.workOrderId) && !log.checkOutTime
        );

        return {
            ...targetSite,
            activeAssignments,
            historicalAssignments,
            liveCheckIns,
            contact: 'Site Manager - 555-0199',
            documents: [
                { id: 'sd-1', name: 'Site_Safety_Protocol_v2.pdf', size: '1.2MB', date: '01/15/2024' },
                { id: 'sd-2', name: 'MDF_Rack_Layout_Final.pdf', size: '3.4MB', date: '03/22/2024' },
                { id: 'sd-3', name: 'Emergency_Contact_Sheet.pdf', size: '450KB', date: '05/10/2024' }
            ]
        };
    }, [currentUser, id]);

    const formatDateDisplay = (dateStr: string) => {
        if (!dateStr) return 'TBD';
        try {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                const [month, day, year] = parts;
                return `${month}/${day}/${year}`;
            }
            return dateStr.replace(/-/g, '/');
        } catch (e) {
            return dateStr;
        }
    };

    if (!mounted || !currentUserId) return null;
    if (!siteData) return (
        <div className="p-24 text-center">
            <p className="text-text-muted uppercase font-bold tracking-widest">Site Coordinate Not Found</p>
            <Button variant="link" onClick={() => router.push('/client/sites')} className="mt-4">Return to Registry</Button>
        </div>
    );

    return (
        <div className="space-y-8 relative">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.push('/client/sites')} className="h-10 w-10">
                    <ChevronLeft size={24} />
                </Button>
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <MapPin size={12} />
                        Managed Coordinate
                    </p>
                    <h1 className="page-title">{siteData.name}</h1>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* LEFT: Site Stats & Map */}
                <div className="space-y-6">
                    <Card className="bg-bg-secondary border-border-main overflow-hidden shadow-sm">
                        <div className="relative aspect-video w-full bg-bg-primary border-b border-border-sub">
                             <iframe 
                                src={`https://www.google.com/maps/embed/v1/place?key=${MAPS_API_KEY}&q=${encodeURIComponent(siteData.location)}`} 
                                width="100%" 
                                height="100%" 
                                style={{ border: 0, filter: 'grayscale(0.8) invert(1)' }} 
                                allowFullScreen={true} 
                                loading="lazy"
                                className="absolute top-0 left-0"
                            ></iframe>
                            <div className="absolute top-2 left-2 z-10">
                                <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2 py-1 rounded border border-white/10 text-[9px] font-bold uppercase text-white tracking-widest">
                                    <Navigation size={10} className="text-brand-red" /> Live Site Feed
                                </div>
                            </div>
                        </div>
                        <CardContent className="p-5 space-y-4">
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest text-left">Address</p>
                                <p className="text-sm font-bold text-text-primary text-left">{siteData.location}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border-sub">
                                <div className="space-y-1 text-left">
                                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5"><Phone size={10}/> Site Contact</p>
                                    <p className="text-[10px] font-bold text-text-primary uppercase">{siteData.contact}</p>
                                </div>
                                <div className="space-y-1 text-right">
                                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5 justify-end"><ShieldCheck size={10}/> Access Tier</p>
                                    <p className="text-[10px] font-bold text-text-primary uppercase">Tier 1 Internal</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-bg-tertiary/30 border-border-sub">
                        <CardHeader className="pb-3 text-left">
                            <CardTitle className="text-[10px] uppercase tracking-widest flex items-center gap-2">
                                <Activity size={14} className="text-brand-red"/> Operational Pulse
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-3 gap-4">
                                {/* TOTAL VISITS DIALOG */}
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <div className="p-4 rounded-xl bg-bg-primary border border-border-sub text-center space-y-1 cursor-pointer hover:border-text-muted transition-all group">
                                            <p className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] group-hover:text-brand-red">Total Visits</p>
                                            <p className="text-2xl font-bold text-text-primary">{siteData.historicalAssignments.length + siteData.activeAssignments.length}</p>
                                            <p className="text-[8px] text-text-muted uppercase font-bold tracking-widest">all time</p>
                                        </div>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[800px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[90vh] shadow-2xl">
                                        <DialogHeader className="p-6 border-b border-border-sub bg-bg-tertiary/30 text-left">
                                            <div className="flex items-center gap-3">
                                                <History size={20} className="text-brand-red" />
                                                <DialogTitle className="text-lg font-bold uppercase tracking-widest">Visit Registry Audit</DialogTitle>
                                            </div>
                                            <DialogDescription className="text-xs uppercase font-bold text-text-muted">Full historical manifest for site coordinate: {siteData.name}</DialogDescription>
                                        </DialogHeader>
                                        <ScrollArea className="flex-1">
                                            <div className="p-6 space-y-3">
                                                {[...siteData.historicalAssignments, ...siteData.activeAssignments].length > 0 ? [...siteData.historicalAssignments, ...siteData.activeAssignments].map(wo => (
                                                    <div 
                                                        key={wo.id} 
                                                        onClick={() => { setSelectedJob(wo); setIsJobOpen(true); }}
                                                        className="p-4 rounded-xl bg-bg-secondary border border-border-sub space-y-1 text-left group hover:border-text-muted transition-all cursor-pointer"
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[9px] font-mono font-bold text-brand-red uppercase">{wo.id.toUpperCase()}</span>
                                                                <Badge variant={wo.status === 'completed' ? 'active' : 'onhold'} className="text-[7px] h-3.5 px-1 uppercase">{wo.status}</Badge>
                                                            </div>
                                                            <span className="text-[8px] text-text-muted font-bold">{formatDateDisplay(wo.scheduleDate)}</span>
                                                        </div>
                                                        <p className="text-xs font-bold text-text-primary uppercase truncate">{wo.description}</p>
                                                    </div>
                                                )) : (
                                                    <div className="py-24 text-center border-2 border-dashed border-border-sub rounded-xl opacity-40 bg-bg-secondary/30">
                                                        <History size={48} className="mx-auto mb-2 text-text-muted" />
                                                        <p className="text-[10px] font-bold uppercase tracking-widest">No historical records found</p>
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
                                            <p className="text-2xl font-bold text-text-primary">{siteData.activeAssignments.length}</p>
                                            <p className={cn("text-[8px] uppercase font-bold tracking-widest", siteData.activeAssignments.length > 0 ? "text-accent-gold" : "text-text-green")}>
                                                {siteData.activeAssignments.length > 0 ? 'Active Queue' : 'Service Clean'}
                                            </p>
                                        </div>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[800px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[90vh] shadow-2xl">
                                        <DialogHeader className="p-6 border-b border-border-sub bg-bg-tertiary/30 text-left">
                                            <div className="flex items-center gap-3">
                                                <AlertCircle size={20} className="text-accent-gold" />
                                                <DialogTitle className="text-lg font-bold uppercase tracking-widest">Active Mission Funnel</DialogTitle>
                                            </div>
                                            <DialogDescription className="text-xs uppercase font-bold text-text-muted">Live dispatch buffer and intake funnel for site coordinate: {siteData.name}</DialogDescription>
                                        </DialogHeader>
                                        <ScrollArea className="flex-1">
                                            <div className="p-6 space-y-3">
                                                {siteData.activeAssignments.length > 0 ? siteData.activeAssignments.map(wo => (
                                                    <div 
                                                        key={wo.id} 
                                                        onClick={() => { setSelectedJob(wo); setIsJobOpen(true); }}
                                                        className="p-4 rounded-xl bg-bg-secondary border border-border-sub group hover:border-text-muted transition-all flex items-center justify-between cursor-pointer"
                                                    >
                                                        <div className="text-left space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[9px] font-mono font-bold text-brand-red uppercase">{wo.id.toUpperCase()}</span>
                                                                <Badge variant={wo.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="text-[7px] h-3.5 px-1 uppercase tracking-tighter">
                                                                    {wo.status}
                                                                </Badge>
                                                            </div>
                                                            <p className="text-xs font-bold text-text-primary uppercase truncate">{wo.description}</p>
                                                            <p className="text-[9px] text-text-muted uppercase font-bold">{wo.scheduleTime} • {formatDateDisplay(wo.scheduleDate)}</p>
                                                        </div>
                                                        <ChevronRight size={18} className="text-text-muted group-hover:text-text-primary transition-all" />
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
                                                <Button variant="outline" className="w-full uppercase font-bold text-[10px] tracking-widest h-10">Close Terminal</Button>
                                            </DialogClose>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>

                                {/* UPTIME TIER DIALOG */}
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <div className="p-4 rounded-xl bg-bg-primary border border-border-sub text-center space-y-1 cursor-pointer hover:border-text-muted transition-all group">
                                            <p className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em] group-hover:text-brand-red">Uptime Tier</p>
                                            <p className="text-2xl font-bold text-text-primary">99.9%</p>
                                            <p className="text-[8px] text-text-muted uppercase font-bold tracking-widest">Contract SLA</p>
                                        </div>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[600px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[70vh] shadow-2xl">
                                        <DialogHeader className="p-6 border-b border-border-sub bg-bg-tertiary/30 text-left">
                                            <div className="flex items-center gap-3">
                                                <TrendingUp size={20} className="text-brand-red" />
                                                <DialogTitle className="text-lg font-bold uppercase tracking-widest">SLA Performance Audit</DialogTitle>
                                            </div>
                                            <DialogDescription className="text-xs uppercase font-bold text-text-muted">Real-time uptime verification and performance tracking.</DialogDescription>
                                        </DialogHeader>
                                        <div className="p-8 space-y-8">
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-end">
                                                    <div className="space-y-1">
                                                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Active Response Tier</p>
                                                        <p className="text-sm font-bold text-text-primary uppercase tracking-wide">Enterprise Standard (4-Hour)</p>
                                                    </div>
                                                    <Badge variant="active" className="h-5 px-2 text-[8px] uppercase tracking-widest">Compliant</Badge>
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-text-muted">
                                                        <span>Target Uptime</span>
                                                        <span className="text-text-primary">99.9%</span>
                                                    </div>
                                                    <div className="h-2 w-full rounded-full bg-bg-tertiary overflow-hidden border border-border-sub">
                                                        <div className="h-full bg-text-green" style={{ width: '99.9%' }} />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="p-4 rounded-xl bg-bg-secondary border border-border-sub flex items-start gap-4">
                                                <Info size={18} className="text-brand-red shrink-0 mt-0.5" />
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-primary">Audit Parameter</p>
                                                    <p className="text-[10px] text-text-secondary leading-relaxed uppercase font-medium">
                                                        Uptime calculations are derived from historical ticket completion timelines and verified field check-ins.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <DialogFooter className="p-4 bg-bg-secondary/30 border-t border-border-default">
                                            <DialogClose asChild>
                                                <Button variant="outline" className="w-full uppercase font-bold text-[10px] tracking-widest h-10">Close Audit</Button>
                                            </DialogClose>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* RIGHT: Operational Activity */}
                <div className="lg:col-span-2">
                    <Tabs defaultValue="activity" className="w-full">
                        <TabsList className="tabs !p-0 !bg-bg-tertiary mb-6">
                            <TabsTrigger value="activity" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">Active Activity</TabsTrigger>
                            <TabsTrigger value="history" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">Job History</TabsTrigger>
                            <TabsTrigger value="documents" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">Documents</TabsTrigger>
                        </TabsList>

                        <TabsContent value="activity" className="space-y-6 mt-0">
                            {/* Active Assignments */}
                            <div className="space-y-3">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] text-left">Active Assignment Registry</p>
                                <div className="space-y-2">
                                    {siteData.activeAssignments.length > 0 ? siteData.activeAssignments.map(wo => (
                                        <Card 
                                            key={wo.id} 
                                            className="bg-bg-secondary border-border-main hover:border-text-muted transition-all cursor-pointer"
                                            onClick={() => { setSelectedJob(wo); setIsJobOpen(true); }}
                                        >
                                            <CardContent className="p-4 flex items-center justify-between">
                                                <div className="flex items-center gap-4 text-left">
                                                    <div className="p-2 bg-bg-tertiary rounded border border-border-sub text-text-muted">
                                                        <Wrench size={16} />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{wo.description}</p>
                                                        <div className="flex items-center gap-3 mt-1">
                                                            <span className="text-[9px] text-brand-red font-mono font-bold">ID: {wo.id.toUpperCase()}</span>
                                                            <div className="h-1 w-1 rounded-full bg-text-muted opacity-30" />
                                                            <span className="text-[9px] text-text-muted font-bold uppercase tracking-widest flex items-center gap-1">
                                                                <Clock size={10}/> Scheduled: {wo.scheduleTime}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <Badge variant={wo.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="uppercase">
                                                    {wo.status}
                                                </Badge>
                                            </CardContent>
                                        </Card>
                                    )) : (
                                        <div className="p-12 text-center bg-bg-secondary/30 rounded-lg border-2 border-dashed border-border-main">
                                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest italic">Awaiting further dispatch</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="history" className="space-y-4 mt-0">
                            <div className="space-y-2">
                                {siteData.historicalAssignments.length > 0 ? siteData.historicalAssignments.map(wo => (
                                    <div 
                                        key={wo.id} 
                                        className="p-4 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between group hover:bg-bg-tertiary transition-colors cursor-pointer"
                                        onClick={() => { setSelectedJob(wo); setIsJobOpen(true); }}
                                    >
                                        <div className="flex items-center gap-4 text-left">
                                            <div className="p-2 bg-bg-tertiary rounded border border-border-sub text-text-green">
                                                <CheckCircle2 size={16} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{wo.description}</p>
                                                <p className="text-[9px] text-text-muted uppercase tracking-widest mt-0.5">Completed: {formatDateDisplay(wo.scheduleDate)} • {wo.id.toUpperCase()}</p>
                                            </div>
                                        </div>
                                        <Badge variant="active" className="text-[9px]">FINALIZED</Badge>
                                    </div>
                                )) : (
                                    <div className="p-24 text-center bg-bg-secondary/30 rounded-lg border-2 border-dashed border-border-main">
                                        <History size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted italic">No historical records found for this coordinate.</p>
                                    </div>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="documents" className="space-y-4 mt-0">
                            <div className="space-y-2">
                                {siteData.documents.map(doc => (
                                    <div key={doc.id} className="p-4 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between group hover:bg-bg-tertiary transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="p-2 bg-bg-tertiary rounded border border-border-sub text-brand-red">
                                                <FileText size={18} />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-sm font-bold text-text-primary uppercase tracking-wide">{doc.name}</p>
                                                <p className="text-[10px] text-text-muted uppercase tracking-widest mt-0.5">{doc.size} • Uploaded {doc.date}</p>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon" className="text-text-muted hover:text-text-primary">
                                            <Download size={18} />
                                        </Button>
                                    </div>
                                ))}
                                {siteData.documents.length === 0 && (
                                    <div className="p-24 text-center bg-bg-secondary/30 rounded-lg border-2 border-dashed border-border-main">
                                        <FolderOpen size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted italic">No site assets registered.</p>
                                    </div>
                                )}
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            {/* LIVE ONSITE POPUP INDICATOR */}
            {siteData.liveCheckIns.length > 0 && (
                <div className="fixed bottom-8 right-8 z-50 animate-in slide-in-from-bottom-6 duration-500">
                    <div className="bg-[#0c0c0c]/90 backdrop-blur-xl border border-green-border/50 rounded-2xl p-4 shadow-[0_0_40px_rgba(31,138,85,0.25)] flex items-center gap-5 ring-1 ring-white/10">
                        <div className="relative">
                            <div className="h-3 w-3 rounded-full bg-text-green absolute -top-1 -right-1 animate-ping" />
                            <div className="h-3 w-3 rounded-full bg-text-green absolute -top-1 -right-1" />
                            <div className="p-2.5 bg-green-dim/20 rounded-xl border border-green-border text-text-green">
                                <UserCheck size={22} />
                            </div>
                        </div>
                        <div className="text-left space-y-0.5">
                            <div className="flex items-center gap-2.5">
                                <p className="text-xs font-black text-white uppercase tracking-widest">Technician On-Site</p>
                                <Badge variant="active" className="h-4 px-1.5 text-[7px] animate-pulse uppercase tracking-tighter">LIVE PULSE</Badge>
                            </div>
                            <p className="text-[9px] text-text-muted font-bold uppercase tracking-tight">Verified presence at {siteData.name}</p>
                        </div>
                        <div className="h-8 w-px bg-white/10 mx-1" />
                        <button 
                            className="p-2 hover:bg-white/10 rounded-full transition-colors text-text-muted hover:text-white"
                            title="Audit Session Details"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
            )}

            <JobDetailDialog isOpen={isJobOpen} setIsOpen={setIsJobOpen} mission={selectedJob} />
        </div>
    );
}
