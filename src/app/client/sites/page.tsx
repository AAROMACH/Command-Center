'use client';

import { useState, useEffect, useMemo } from 'react';
import { technicians, workOrders, assignmentTimeLogs } from '@/lib/data';
import type { Technician, WorkOrder, AssignmentTimeLog } from '@/lib/types';
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
    ShieldCheck
} from 'lucide-react';

export default function ClientSitesPage() {
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

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
            </header>

            <div className="mb-6 flex items-center justify-between">
                <div className="search-wrap">
                    <Search />
                    <input 
                        className="search-input" 
                        placeholder="Search by site name or coordinates..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

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
                {sitesData.length === 0 && (
                    <div className="col-span-full p-24 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30">
                        <MapPin size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted italic">No managed sites found in directory.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
