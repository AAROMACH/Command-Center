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
    FolderOpen
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function SiteDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

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

    if (!mounted || !currentUserId) return null;
    if (!siteData) return (
        <div className="p-24 text-center">
            <p className="text-text-muted uppercase font-bold tracking-widest">Site Coordinate Not Found</p>
            <Button variant="link" onClick={() => router.push('/client/sites')} className="mt-4">Return to Registry</Button>
        </div>
    );

    return (
        <div className="space-y-8">
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
                    <Card className="bg-bg-secondary border-border-main overflow-hidden">
                        <div className="relative aspect-video w-full bg-bg-primary border-b border-border-sub">
                             <iframe 
                                src={`https://www.google.com/maps/embed/v1/place?key=AIzaSy...FAKEKEY&q=${encodeURIComponent(siteData.location)}`} 
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
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Address</p>
                                <p className="text-sm font-bold text-text-primary">{siteData.location}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border-sub">
                                <div className="space-y-1">
                                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5"><Phone size={10}/> Site Contact</p>
                                    <p className="text-[10px] font-bold text-text-primary uppercase">{siteData.contact}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5"><ShieldCheck size={10}/> Access Tier</p>
                                    <p className="text-[10px] font-bold text-text-primary uppercase">Tier 1 Internal</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-bg-tertiary/30 border-border-sub">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-[10px] uppercase tracking-widest flex items-center gap-2">
                                <Activity size={14} className="text-brand-red"/> Site Metrics
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between p-3 rounded bg-bg-primary border border-border-sub">
                                <span className="text-[10px] font-bold uppercase text-text-muted">Total Jobs</span>
                                <span className="font-mono text-text-primary font-bold">{siteData.activeAssignments.length + siteData.historicalAssignments.length}</span>
                            </div>
                            <div className="flex items-center justify-between p-3 rounded bg-bg-primary border border-border-sub">
                                <span className="text-[10px] font-bold uppercase text-text-muted">Avg. Response</span>
                                <span className="font-mono text-text-primary font-bold">3.2 Hours</span>
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
                            {/* Live Pulse Section */}
                            <div className="space-y-3">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">Operational Pulse</p>
                                {siteData.liveCheckIns.length > 0 ? (
                                    <div className="p-4 rounded-lg bg-green-dim/10 border border-green-border flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="relative">
                                                <div className="h-3 w-3 rounded-full bg-text-green absolute -top-1 -right-1 animate-ping" />
                                                <div className="h-3 w-3 rounded-full bg-text-green absolute -top-1 -right-1" />
                                                <div className="p-3 bg-bg-secondary rounded border border-green-border text-text-green">
                                                    <UserCheck size={24} />
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-text-green uppercase tracking-wide">Technician On-Site</p>
                                                <p className="text-[11px] text-text-muted font-mono">{siteData.liveCheckIns.length} Verified Session(s) Active</p>
                                            </div>
                                        </div>
                                        <Badge variant="active" className="h-6 uppercase text-[10px] tracking-widest px-4">LIVE SESSION</Badge>
                                    </div>
                                ) : (
                                    <div className="p-8 text-center border border-dashed border-border-sub rounded-lg opacity-60">
                                        <Activity size={24} className="mx-auto text-text-muted mb-2" />
                                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">No active sessions reported at this time</p>
                                    </div>
                                )}
                            </div>

                            {/* Active Assignments */}
                            <div className="space-y-3">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">Active Assignment Registry</p>
                                <div className="space-y-2">
                                    {siteData.activeAssignments.length > 0 ? siteData.activeAssignments.map(wo => (
                                        <Card key={wo.id} className="bg-bg-secondary border-border-main hover:border-text-muted transition-all">
                                            <CardContent className="p-4 flex items-center justify-between">
                                                <div className="flex items-center gap-4">
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
                                    <div key={wo.id} className="p-4 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between group hover:bg-bg-tertiary transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="p-2 bg-bg-tertiary rounded border border-border-sub text-text-green">
                                                <CheckCircle2 size={16} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{wo.description}</p>
                                                <p className="text-[9px] text-text-muted uppercase tracking-widest mt-0.5">Completed: {wo.scheduleDate} • {wo.id.toUpperCase()}</p>
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
        </div>
    );
}
