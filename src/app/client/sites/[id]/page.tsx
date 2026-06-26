
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import type { Technician, WorkOrder, AssignmentTimeLog, Project, ProjectDocument } from '@/lib/types';
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
    Check,
    X,
    Eye
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
import { useToast } from '@/hooks/use-toast';

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

export default function SiteDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>([]);
    const [allProjects, setAllProjects] = useState<Project[]>([]);
    const [allDocuments, setAllDocuments] = useState<ProjectDocument[]>([]);
    const [liveCheckIns, setLiveCheckIns] = useState<AssignmentTimeLog[]>([]);
    const [mounted, setMounted] = useState(false);
    
    // Job Detail state
    const [isJobOpen, setIsJobOpen] = useState(false);
    const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);

    useEffect(() => {
        setMounted(true);
        const userId = sessionStorage.getItem('currentUserId');
        if (!userId) return;

        const unsubUser = onSnapshot(doc(db, 'users', userId), (d) => {
            if (d.exists()) {
                const userData = { ...d.data(), id: d.id } as Technician;
                setCurrentUser(userData);
                
                const clientName = userData.clientCompany || userData.name;

                const unsubWO = onSnapshot(query(collection(db, 'workOrders'), where('clientName', '==', clientName)), (snap) => {
                    setAllWorkOrders(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as WorkOrder)));
                });

                const unsubProj = onSnapshot(query(collection(db, 'projects'), where('client', '==', clientName)), (snap) => {
                    setAllProjects(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project)));
                });

                return () => { unsubWO(); unsubProj(); };
            }
        });

        // Live check-ins usually aren't filtered by client at the collection level easily without complex indexes,
        // but for this prototype we'll listen to all active logs.
        const unsubLogs = onSnapshot(collection(db, 'assignments'), (snap) => {
            // Placeholder logic for live checkins if using assignments subcollections
        });

        return () => unsubUser();
    }, []);

    const id = params.id as string;

    const siteData = useMemo(() => {
        if (!currentUser) return null;
        
        const clientSites = currentUser.managedSites || [];
        
        let targetSite = clientSites.find(s => s.id === id);
        let location = targetSite?.location;

        if (!targetSite) {
            const woWithSite = allWorkOrders.find(wo => `site-${wo.location.replace(/\s+/g, '-').toLowerCase()}` === id);
            if (woWithSite) {
                location = woWithSite.location;
                targetSite = { id, name: location.split(',')[0], location };
            }
        }

        if (!targetSite || !location) return null;

        const activeAssignments = allWorkOrders.filter(wo => wo.location === location && wo.status !== 'completed');
        const historicalAssignments = allWorkOrders.filter(wo => wo.location === location && wo.status === 'completed');
        const siteProjects = allProjects.filter(p => p.location.includes(location!) || location!.includes(p.location));

        return {
            ...targetSite,
            activeAssignments,
            historicalAssignments,
            siteProjects,
            contact: 'Site Manager',
            documents: [
                { id: 'sd-1', name: 'Site_Safety_Protocol_v2.pdf', size: '1.2MB', date: '01/15/2024' },
                { id: 'sd-2', name: 'MDF_Rack_Layout_Final.pdf', size: '3.4MB', date: '03/22/2024' }
            ]
        };
    }, [currentUser, id, allWorkOrders, allProjects]);

    const formatDateDisplay = (dateStr: string) => {
        if (!dateStr) return 'TBD';
        try {
            return dateStr.replace(/-/g, '/');
        } catch (e) {
            return dateStr;
        }
    };

    if (!mounted) return null;
    if (!siteData) return (
        <div className="p-24 text-center">
            <p className="text-text-muted uppercase font-bold tracking-widest">Site Coordinate Not Found</p>
            <Button variant="link" onClick={() => router.push('/client/sites')} className="mt-4">Return to Registry</Button>
        </div>
    );

    return (
        <div className="space-y-8 relative">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.push('/client/sites')} className="h-10 w-10 text-text-muted hover:text-text-primary">
                    <ChevronLeft size={24} />
                </Button>
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <MapPin size={12} />
                        Managed Coordinate
                    </p>
                    <h1 className="page-title">{siteData.name}</h1>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="space-y-6">
                    <Card className="bg-bg-secondary border-border-main overflow-hidden shadow-sm">
                        <div className="relative aspect-video w-full bg-bg-primary border-b border-border-sub">
                             {MAPS_API_KEY ? (
                                <iframe 
                                    src={`https://www.google.com/maps/embed/v1/place?key=${MAPS_API_KEY}&q=${encodeURIComponent(siteData.location)}`} 
                                    width="100%" 
                                    height="100%" 
                                    style={{ border: 0, filter: 'grayscale(0.8) invert(1)' }} 
                                    allowFullScreen={true} 
                                    loading="lazy"
                                    className="absolute top-0 left-0"
                                ></iframe>
                             ) : (
                                <div className="absolute inset-0 flex items-center justify-center bg-bg-tertiary">
                                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">MAPS_API_KEY Restricted</p>
                                </div>
                             )}
                        </div>
                        <CardContent className="p-5 space-y-4">
                            <div className="space-y-1 text-left">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Address</p>
                                <p className="text-sm font-bold text-text-primary uppercase tracking-tight">{siteData.location}</p>
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
                                <div className="p-4 rounded-xl bg-bg-primary border border-border-sub text-center space-y-1">
                                    <p className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em]">Total Visits</p>
                                    <p className="text-2xl font-bold text-text-primary">{siteData.historicalAssignments.length + siteData.activeAssignments.length}</p>
                                    <p className="text-[8px] text-text-muted uppercase font-bold tracking-widest">all time</p>
                                </div>
                                <div className="p-4 rounded-xl bg-bg-primary border border-border-sub text-center space-y-1">
                                    <p className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em]">Open Tickets</p>
                                    <p className="text-2xl font-bold text-text-primary">{siteData.activeAssignments.length}</p>
                                    <p className={cn("text-[8px] uppercase font-bold tracking-widest", siteData.activeAssignments.length > 0 ? "text-accent-gold" : "text-text-green")}>
                                        {siteData.activeAssignments.length > 0 ? 'Active Queue' : 'Clean'}
                                    </p>
                                </div>
                                <div className="p-4 rounded-xl bg-bg-primary border border-border-sub text-center space-y-1">
                                    <p className="text-[8px] font-black text-text-muted uppercase tracking-[0.2em]">Uptime Tier</p>
                                    <p className="text-2xl font-bold text-text-primary">99.9%</p>
                                    <p className="text-[8px] text-text-muted uppercase font-bold tracking-widest">Contract SLA</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="lg:col-span-2">
                    <Tabs defaultValue="activity" className="w-full">
                        <TabsList className="tabs !p-0 !bg-bg-tertiary mb-6">
                            <TabsTrigger value="activity" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white uppercase font-bold text-[11px] tracking-widest">Active Activity</TabsTrigger>
                            <TabsTrigger value="history" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white uppercase font-bold text-[11px] tracking-widest">Job History</TabsTrigger>
                            <TabsTrigger value="documents" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white uppercase font-bold text-[11px] tracking-widest">Documents</TabsTrigger>
                        </TabsList>

                        <TabsContent value="activity" className="space-y-6 mt-0">
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
                                                <Badge variant={wo.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="uppercase h-5 text-[8px] tracking-widest">
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
                                        className="p-4 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between group hover:border-text-muted transition-colors cursor-pointer"
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
                                    <div key={doc.id} className="p-4 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between group hover:border-text-muted transition-colors">
                                        <div className="flex items-center gap-4 text-left">
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
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            <JobDetailDialog isOpen={isJobOpen} setIsOpen={setIsJobOpen} mission={selectedJob} />
        </div>
    );
}
