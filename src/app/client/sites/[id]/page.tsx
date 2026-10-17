
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { useClientProjects, useClientJobs } from '@/hooks/use-client-data';
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
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
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
        return onSnapshot(doc(db, 'users', userId), (d) => {
            if (d.exists()) setCurrentUser({ ...d.data(), id: d.id } as Technician);
        });
    }, []);

    // Pool + dispatched jobs and projects for this client (the old listeners
    // only read the pool, leaked per profile update, and an unfiltered
    // assignments listener was rejected by the rules).
    const allWorkOrders = useClientJobs(currentUser);
    const allProjects = useClientProjects(currentUser);

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
                { id: 'sd-1', name: 'Site_Safety_Plan_v2.pdf', size: '1.2MB', date: '01/15/2024' },
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
        <EmptyState icon={MapPin} title="Site not found" description="This site may have been removed or isn't on your account."
            action={<Button variant="outline" size="sm" onClick={() => router.push('/client/sites')}>Back to sites</Button>} />
    );

    const openCount = siteData.activeAssignments.length;
    return (
        <div className="space-y-6 relative">
            <PageHeader
                back={{ href: '/client/sites', label: 'Sites' }}
                eyebrow="Site"
                icon={MapPin}
                title={siteData.name}
                subtitle={siteData.location}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-6">
                    <Card className="rounded-xl bg-bg-secondary border-border-main overflow-hidden shadow-sm">
                        <div className="relative aspect-video w-full bg-bg-primary border-b border-border-sub">
                             {MAPS_API_KEY ? (
                                <iframe 
                                    src={`https://www.google.com/maps/embed/v1/place?key=${MAPS_API_KEY}&q=${encodeURIComponent(siteData.location)}`} 
                                    width="100%" 
                                    height="100%" 
                                    style={{ border: 0 }} 
                                    allowFullScreen={true} 
                                    loading="lazy"
                                    className="absolute top-0 left-0"
                                ></iframe>
                             ) : (
                                <div className="absolute inset-0 flex items-center justify-center bg-bg-tertiary">
                                    <p className="text-[12px] text-text-muted">Map unavailable</p>
                                </div>
                             )}
                        </div>
                        <CardContent className="p-5 space-y-4">
                            <div className="space-y-1 text-left">
                                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Address</p>
                                <p className="text-[13px] font-medium text-text-primary">{siteData.location}</p>
                            </div>
                            <div className="space-y-1 pt-3 border-t border-border-sub text-left">
                                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5"><Phone size={12}/> Site contact</p>
                                <p className="text-[13px] text-text-primary">{siteData.contact}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-3 gap-3">
                        <StatCard label="Visits" value={siteData.historicalAssignments.length + openCount} sub="All time" />
                        <StatCard label="Open jobs" value={openCount} tone={openCount > 0 ? 'progress' : 'done'} sub={openCount > 0 ? 'In progress' : 'All clear'} />
                        <StatCard label="Projects" value={siteData.siteProjects.length} sub="At this site" />
                    </div>
                </div>

                <div className="lg:col-span-2">
                    <Tabs defaultValue="activity" className="w-full">
                        <TabsList className="tabs mb-4">
                            <TabsTrigger value="activity" className="tab">Open jobs</TabsTrigger>
                            <TabsTrigger value="history" className="tab">Job history</TabsTrigger>
                            <TabsTrigger value="documents" className="tab">Documents</TabsTrigger>
                        </TabsList>

                        <TabsContent value="activity" className="space-y-6 mt-0">
                            <div className="space-y-3">
                                                                <div className="space-y-2">
                                    {siteData.activeAssignments.length > 0 ? siteData.activeAssignments.map(wo => (
                                        <Card 
                                            key={wo.id} 
                                            className="rounded-xl bg-bg-secondary border-border-main shadow-sm hover:border-text-muted transition-all cursor-pointer"
                                            onClick={() => { setSelectedJob(wo); setIsJobOpen(true); }}
                                        >
                                            <CardContent className="p-4 flex items-center justify-between">
                                                <div className="flex items-center gap-4 text-left">
                                                    <div className="p-2 bg-bg-tertiary rounded border border-border-sub text-text-muted">
                                                        <Wrench size={16} />
                                                    </div>
                                                    <div>
                                                        <p className="text-[13px] font-semibold text-text-primary">{wo.description}</p>
                                                        <div className="flex items-center gap-3 mt-1">
                                                            <span className="text-[11px] text-text-muted font-mono">{wo.id.toUpperCase()}</span>
                                                            <div className="h-1 w-1 rounded-full bg-text-muted opacity-30" />
                                                            <span className="text-[12px] text-text-muted flex items-center gap-1">
                                                                <Clock size={12}/> {formatDateDisplay(wo.scheduleDate)}{wo.scheduleTime ? ` · ${wo.scheduleTime}` : ''}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <StatusBadge kind="job" value={wo.status} className="shrink-0" />
                                            </CardContent>
                                        </Card>
                                    )) : (
                                        <EmptyState compact icon={Wrench} title="No open jobs at this site" />
                                    )}
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="history" className="space-y-4 mt-0">
                            <div className="space-y-2">
                                {siteData.historicalAssignments.length > 0 ? siteData.historicalAssignments.map(wo => (
                                    <div 
                                        key={wo.id} 
                                        className="p-4 rounded-xl bg-bg-secondary border border-border-main shadow-sm flex items-center justify-between group hover:border-text-muted transition-colors cursor-pointer"
                                        onClick={() => { setSelectedJob(wo); setIsJobOpen(true); }}
                                    >
                                        <div className="flex items-center gap-4 text-left">
                                            <div className="p-2 bg-bg-tertiary rounded border border-border-sub text-text-green">
                                                <CheckCircle2 size={16} />
                                            </div>
                                            <div>
                                                <p className="text-[13px] font-semibold text-text-primary">{wo.description}</p>
                                                <p className="text-[12px] text-text-muted mt-0.5">Completed {formatDateDisplay(wo.scheduleDate)} · {wo.id.toUpperCase()}</p>
                                            </div>
                                        </div>
                                        <StatusBadge kind="job" value="completed" />
                                    </div>
                                )) : (
                                    <EmptyState icon={History} title="No completed jobs at this site yet" />
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="documents" className="space-y-4 mt-0">
                            <div className="space-y-2">
                                {siteData.documents.map(doc => (
                                    <div key={doc.id} className="p-4 rounded-xl bg-bg-secondary border border-border-main shadow-sm flex items-center justify-between group hover:border-text-muted transition-colors">
                                        <div className="flex items-center gap-4 text-left">
                                            <div className="p-2 bg-bg-tertiary rounded-md border border-border-sub text-text-muted">
                                                <FileText size={18} />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-[13px] font-semibold text-text-primary">{doc.name}</p>
                                                <p className="text-[12px] text-text-muted mt-0.5">{doc.size} · Uploaded {doc.date}</p>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon" aria-label="Download" className="text-text-muted hover:text-text-primary">
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
