'use client';

import { useState, useEffect, useMemo } from 'react';
import { technicians, workOrders, assignmentTimeLogs, siteRequests } from '@/lib/data';
import type { Technician, WorkOrder, AssignmentTimeLog, SiteRequest } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
    MapPin, 
    Search,
    ChevronRight,
    Users,
    Activity,
    Clock,
    Phone,
    UserCheck,
    Navigation,
    ShieldCheck,
    Plus,
    Building2,
    X,
    Check,
    History
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ClientSitesPage() {
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isAddSiteOpen, setIsAddSiteOpen] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
        setCurrentUserId(localStorage.getItem('currentUserId'));
    }, []);

    const currentUser = useMemo(() => 
        currentUserId ? technicians.find(t => t.id === currentUserId) : null
    , [currentUserId]);

    // Grouping logic: sites derived from client's managedSites OR inferred from workOrders
    const sitesData = useMemo(() => {
        if (!currentUser?.clientCompany) return [];
        
        const clientSites = currentUser.managedSites || [];
        const clientWorkOrders = workOrders.filter(wo => wo.clientName === currentUser.clientCompany);
        
        // Ensure all sites mentioned in work orders are included if they aren't in managedSites
        const inferredSites = Array.from(new Set(clientWorkOrders.map(wo => wo.location)));
        
        const allSiteNames = Array.from(new Set([
            ...clientSites.map(s => s.location),
            ...inferredSites
        ]));

        return allSiteNames.map(location => {
            const siteInfo = clientSites.find(s => s.location === location);
            const activeAssignments = clientWorkOrders.filter(wo => wo.location === location && wo.status !== 'completed');
            const recentActivity = clientWorkOrders.filter(wo => wo.location === location).sort((a, b) => b.scheduleDate.localeCompare(a.scheduleDate)).slice(0, 3);
            
            // Check for live check-ins
            const liveCheckIns = assignmentTimeLogs.filter(log => 
                activeAssignments.some(wo => wo.id === log.workOrderId) && !log.checkOutTime
            );

            return {
                id: siteInfo?.id || `site-${location.replace(/\s+/g, '-').toLowerCase()}`,
                name: siteInfo?.name || location.split(',')[0],
                location,
                activeAssignments,
                recentActivity,
                liveCheckIns,
                contact: 'Site Manager - 555-0199' // Mock contact
            };
        }).filter(s => 
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            s.location.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [currentUser, searchQuery]);

    const myPendingSites = useMemo(() => {
        if (!currentUser?.clientCompany) return [];
        return siteRequests.filter(sr => sr.clientName === currentUser.clientCompany && sr.status === 'pending');
    }, [currentUser]);

    const handleAddSite = (e: React.FormEvent) => {
        e.preventDefault();
        toast({
            title: "Registration Transmitted",
            description: "New site coordinate has been submitted for administrative audit.",
        });
        setIsAddSiteOpen(false);
    };

    if (!mounted || !currentUserId) return null;

    return (
        <div className="space-y-8">
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <MapPin size={12} />
                        Enterprise Registry
                    </p>
                    <h1 className="page-title">Service Sites</h1>
                    <p className="page-subtitle">Real-time status tracking and operational intelligence for all managed properties.</p>
                </div>
                <div className="page-header-right">
                    <Button variant="default" onClick={() => setIsAddSiteOpen(true)}>
                        <Plus size={14} className="mr-2"/>
                        Add New Site
                    </Button>
                </div>
            </header>

            <Tabs defaultValue="registry" className="w-full">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                    <TabsList className="tabs !p-0 !bg-bg-tertiary">
                        <TabsTrigger value="registry" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">Active Registry</TabsTrigger>
                        <TabsTrigger value="pending" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white flex items-center gap-2">
                            Pending Requests
                            {myPendingSites.length > 0 && (
                                <Badge variant="destructive" className="h-4 px-1.5 text-[8px] animate-pulse">
                                    {myPendingSites.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>
                    <div className="search-wrap !mb-0">
                        <Search />
                        <input 
                            className="search-input" 
                            placeholder="Search by site name or coordinates..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <TabsContent value="registry" className="mt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {sitesData.map(site => (
                            <Card key={site.id} className="bg-bg-secondary border-border-main hover:border-text-muted transition-all flex flex-col">
                                <CardHeader className="bg-bg-tertiary/30 border-b border-border-sub pb-4">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <h3 className="text-base font-bold text-text-primary uppercase tracking-wide">{site.name}</h3>
                                            <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest flex items-center gap-1.5">
                                                <MapPin size={12}/> {site.location}
                                            </p>
                                        </div>
                                        <Button variant="ghost" size="icon" className="text-text-muted">
                                            <Navigation size={18} />
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-5 flex-1 space-y-6">
                                    {/* Live Status Section */}
                                    <div className="space-y-3">
                                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">Operational Pulse</p>
                                        {site.liveCheckIns.length > 0 ? (
                                            <div className="p-3 rounded-lg bg-green-dim/10 border border-green-border flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="relative">
                                                        <div className="h-2 w-2 rounded-full bg-text-green absolute -top-1 -right-1 animate-ping" />
                                                        <div className="h-2 w-2 rounded-full bg-text-green absolute -top-1 -right-1" />
                                                        <UserCheck size={18} className="text-text-green" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-text-green uppercase tracking-wide">Technician On-Site</p>
                                                        <p className="text-[10px] text-text-muted font-mono">{site.liveCheckIns.length} Verified Session(s)</p>
                                                    </div>
                                                </div>
                                                <Badge variant="active" className="h-5 uppercase text-[8px] tracking-widest">LIVE</Badge>
                                            </div>
                                        ) : (
                                            <div className="p-3 rounded-lg bg-bg-primary border border-border-sub flex items-center gap-3 grayscale opacity-60">
                                                <Activity size={18} className="text-text-muted" />
                                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">No active sessions reported</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Active Assignments */}
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">Active Registry</p>
                                            <span className="text-[9px] font-bold text-text-muted uppercase">{site.activeAssignments.length} Assignments</span>
                                        </div>
                                        <div className="space-y-2">
                                            {site.activeAssignments.map(wo => (
                                                <div key={wo.id} className="p-2.5 rounded border border-border-sub bg-bg-primary flex items-center justify-between group cursor-default">
                                                    <div className="space-y-0.5">
                                                        <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide line-clamp-1">{wo.description}</p>
                                                        <p className="text-[9px] text-text-muted uppercase tracking-widest">{wo.scheduleTime} • {wo.id.toUpperCase()}</p>
                                                    </div>
                                                    <Badge variant={wo.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="text-[8px] h-4">
                                                        {wo.status.toUpperCase()}
                                                    </Badge>
                                                </div>
                                            ))}
                                            {site.activeAssignments.length === 0 && (
                                                <p className="text-[10px] text-text-muted uppercase font-bold italic py-2 text-center">Awaiting dispatch</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Site Info */}
                                    <div className="pt-4 border-t border-border-sub grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5"><Phone size={10}/> Site Contact</p>
                                            <p className="text-[10px] font-bold text-text-primary uppercase">{site.contact}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5"><ShieldCheck size={10}/> Access Tier</p>
                                            <p className="text-[10px] font-bold text-text-primary uppercase">Tier 1 Internal</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="pending" className="mt-0">
                    <div className="space-y-4">
                        {myPendingSites.map(req => (
                            <Card key={req.id} className="bg-bg-secondary border-border-main">
                                <CardContent className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                                    <div className="flex items-center gap-5">
                                        <div className="p-3 bg-bg-tertiary rounded border border-border-sub">
                                            <Building2 size={24} className="text-accent-gold" />
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-base font-bold text-text-primary uppercase tracking-wide">{req.siteName}</h3>
                                                <Badge variant="onhold" className="h-4 px-1.5 text-[8px] uppercase tracking-widest">PENDING AUDIT</Badge>
                                            </div>
                                            <div className="flex items-center gap-3 text-[10px] text-text-muted font-bold uppercase tracking-widest">
                                                <span className="flex items-center gap-1.5"><MapPin size={12}/> {req.location}</span>
                                                <span className="flex items-center gap-1.5"><History size={12}/> Submitted {req.submittedDate}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-8 border-l border-border-sub pl-8">
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">On-Site Manager</p>
                                            <p className="text-[10px] font-bold text-text-primary uppercase">{req.managerName || 'Awaiting Entry'}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Verification Status</p>
                                            <p className="text-[10px] font-bold text-accent-gold uppercase animate-pulse">Processing Coordinates...</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                        {myPendingSites.length === 0 && (
                            <div className="p-24 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30">
                                <History size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                                <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted italic">No pending site registrations found.</p>
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            <Dialog open={isAddSiteOpen} onOpenChange={setIsAddSiteOpen}>
                <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default">
                    <DialogHeader>
                        <div className="flex items-center gap-2 mb-1">
                            <Building2 className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest">Site Registration</DialogTitle>
                        </div>
                        <DialogDescription>Submit coordinates for a new operational facility to the command registry.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddSite} className="space-y-6 py-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Site Identifier / Name</Label>
                            <Input placeholder="e.g., Gotham Data Center, HQ North" className="bg-bg-primary" required />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Operational Address / Coordinates</Label>
                            <div className="relative">
                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                                <Input placeholder="Full tactical address..." className="bg-bg-primary pl-10" required />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">On-Site Manager</Label>
                                <div className="relative">
                                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
                                    <Input placeholder="Name" className="bg-bg-primary pl-10" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Direct Line</Label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
                                    <Input placeholder="555-000-0000" className="bg-bg-primary pl-10" />
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="bg-bg-tertiary/50 -mx-6 -mb-6 p-6 border-t border-border-default">
                            <Button variant="outline" type="button" onClick={() => setIsAddSiteOpen(false)}>Abort</Button>
                            <Button type="submit" className="bg-brand-red hover:bg-brand-red-hover px-10">
                                <Check size={16} className="mr-2" />
                                Request Registry
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
