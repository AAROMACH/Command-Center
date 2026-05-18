
'use client';

import { useState, useEffect, useMemo } from 'react';
import { technicians, workOrders, assignmentTimeLogs, siteRequests as initialSiteRequests } from '@/lib/data';
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
    History,
    AlertCircle,
    Eye
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function ClientSitesPage() {
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isAddSiteOpen, setIsAddSiteOpen] = useState(false);
    const [isPendingRequestsOpen, setIsPendingRequestsOpen] = useState(false);
    const [localRequests, setLocalSiteRequests] = useState<SiteRequest[]>([]);
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        setMounted(true);
        const userId = localStorage.getItem('currentUserId');
        setCurrentUserId(userId);
        setLocalSiteRequests(initialSiteRequests);
    }, []);

    const currentUser = useMemo(() => 
        currentUserId ? technicians.find(t => t.id === currentUserId) : null
    , [currentUserId]);

    const formatDateStr = (dateStr: string) => {
        if (!dateStr) return 'TBD';
        try {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                const [year, month, day] = parts;
                return `${month}-${day}-${year}`;
            }
            return dateStr;
        } catch (e) {
            return dateStr;
        }
    };

    const sitesData = useMemo(() => {
        if (!currentUser?.clientCompany) return [];
        
        const clientSites = currentUser.managedSites || [];
        const clientWorkOrders = workOrders.filter(wo => wo.clientName === currentUser.clientCompany);
        
        const authorizedLocations = Array.from(new Set([
            ...clientSites.map(s => s.location),
            ...clientWorkOrders.map(wo => wo.location)
        ]));

        const authorizedSites = authorizedLocations.map(location => {
            const siteInfo = clientSites.find(s => s.location === location);
            const activeAssignments = clientWorkOrders.filter(wo => wo.location === location && wo.status !== 'completed');
            const liveCheckIns = assignmentTimeLogs.filter(log => 
                activeAssignments.some(wo => wo.id === log.workOrderId) && !log.checkOutTime
            );

            return {
                id: siteInfo?.id || `site-${location.replace(/\s+/g, '-').toLowerCase()}`,
                name: siteInfo?.name || location.split(',')[0],
                location,
                activeAssignments,
                liveCheckIns,
                contact: 'Site Manager - 555-0199',
                status: 'authorized' as const
            };
        });

        const pendingSites = localRequests
            .filter(req => req.clientName === currentUser.clientCompany && req.status === 'pending')
            .map(req => ({
                id: req.id,
                name: req.siteName,
                location: req.location,
                activeAssignments: [],
                liveCheckIns: [],
                contact: `${req.managerName || 'TBD'}`,
                status: 'pending' as const,
                submittedDate: req.submittedDate
            }));

        return [...authorizedSites, ...pendingSites].filter(s => 
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            s.location.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [currentUser, searchQuery, localRequests]);

    const myPendingSitesList = useMemo(() => {
        if (!currentUser?.clientCompany) return [];
        return localRequests.filter(sr => sr.clientName === currentUser.clientCompany && sr.status === 'pending');
    }, [currentUser, localRequests]);

    const handleAddSite = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        
        const newRequest: SiteRequest = {
            id: `sr-new-${Date.now()}`,
            clientId: currentUserId || 'unknown',
            clientName: currentUser?.clientCompany || 'Unknown Client',
            siteName: formData.get('siteName') as string,
            location: formData.get('location') as string,
            managerName: formData.get('managerName') as string,
            status: 'pending',
            submittedDate: new Date().toISOString().split('T')[0]
        };

        setLocalSiteRequests(prev => [newRequest, ...prev]);

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
                <div className="page-header-right items-center">
                    <Button variant="outline" onClick={() => setIsPendingRequestsOpen(true)} className="relative h-10 border-border-main bg-bg-secondary">
                        <History size={14} className="mr-2"/>
                        Pending Requests
                        {myPendingSitesList.length > 0 && (
                            <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 min-w-[20px] flex items-center justify-center p-1 rounded-full border-2 border-bg-primary text-[9px]">
                                {myPendingSitesList.length}
                            </Badge>
                        )}
                    </Button>
                    <Button variant="default" onClick={() => setIsAddSiteOpen(true)} className="h-10">
                        <Plus size={14} className="mr-2"/>
                        Register new site
                    </Button>
                </div>
            </header>

            <div className="space-y-6">
                <div className="flex items-center justify-between">
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {sitesData.map(site => (
                        <Card key={site.id} 
                            onClick={() => site.status === 'authorized' && router.push(`/client/sites/${site.id}`)}
                            className={cn(
                            "bg-bg-secondary border-border-main transition-all flex flex-col group relative",
                            site.status === 'pending' ? "opacity-90 border-dashed border-accent-gold/40 cursor-default" : "hover:border-text-muted cursor-pointer"
                        )}>
                            {/* FLOATING LIVE INDICATOR */}
                            {site.liveCheckIns.length > 0 && (
                                <div className="absolute -top-2 -right-2 z-10 animate-in fade-in zoom-in duration-500">
                                    <Badge variant="active" className="h-6 px-2 text-[8px] font-black uppercase tracking-widest shadow-lg border-2 border-bg-primary flex items-center gap-1.5">
                                        <div className="h-1.5 w-1.5 rounded-full bg-text-green animate-pulse" />
                                        LIVE ONSITE
                                    </Badge>
                                </div>
                            )}

                            <CardHeader className="bg-bg-tertiary/30 border-b border-border-sub pb-4">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-base font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors">{site.name}</h3>
                                            {site.status === 'pending' && (
                                                <Badge variant="onhold" className="h-4 px-1.5 text-[8px] uppercase tracking-widest">Pending Audit</Badge>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest flex items-center gap-1.5">
                                            <MapPin size={12}/> {site.location}
                                        </p>
                                    </div>
                                    {site.status === 'authorized' && (
                                        <Button variant="ghost" size="icon" className="text-text-muted group-hover:text-text-primary transition-colors">
                                            <Eye size={18} />
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="p-5 flex-1 space-y-6">
                                {site.status === 'pending' ? (
                                    <div className="p-4 rounded-lg bg-accent-gold-dim/10 border border-accent-gold/20 flex flex-col items-center text-center space-y-2">
                                        <AlertCircle size={24} className="text-accent-gold opacity-50" />
                                        <p className="text-[10px] font-bold text-accent-gold uppercase tracking-widest">Coordinates Under Verification</p>
                                        <p className="text-[9px] text-text-muted leading-relaxed">This site coordinate has been submitted to the Command Center and is currently undergoing verification.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">Active Registry</p>
                                                <span className="text-[9px] font-bold text-text-muted uppercase">{site.activeAssignments.length} Assignments</span>
                                            </div>
                                            <div className="space-y-2">
                                                {site.activeAssignments.slice(0, 3).map(wo => (
                                                    <div key={wo.id} className="p-2.5 rounded border border-border-sub bg-bg-primary flex items-center justify-between group cursor-default">
                                                        <div className="space-y-0.5">
                                                            <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide line-clamp-1">{wo.description}</p>
                                                            <p className="text-[9px] text-text-muted uppercase tracking-widest">{wo.scheduleTime} • {wo.id.toUpperCase()}</p>
                                                        </div>
                                                        <Badge variant={wo.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="text-[8px] h-4 uppercase">
                                                            {wo.status}
                                                        </Badge>
                                                    </div>
                                                ))}
                                                {site.activeAssignments.length > 3 && (
                                                    <p className="text-[9px] text-brand-red font-bold uppercase tracking-widest text-center pt-1">
                                                        +{site.activeAssignments.length - 3} Additional Assignments
                                                    </p>
                                                )}
                                                {site.activeAssignments.length === 0 && (
                                                    <p className="text-[10px] text-text-muted uppercase font-bold italic py-4 text-center border border-dashed border-border-sub rounded-lg bg-bg-primary/30">Awaiting dispatch</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="pt-4 border-t border-border-sub grid grid-cols-2 gap-4 mt-auto">
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5"><Phone size={10}/> Site Contact</p>
                                        <p className="text-[10px] font-bold text-text-primary uppercase">{site.contact}</p>
                                    </div>
                                    <div className="space-y-1 text-right">
                                        <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5 justify-end"><ShieldCheck size={10}/> Access Tier</p>
                                        <p className="text-[10px] font-bold text-text-primary uppercase">
                                            {site.status === 'pending' ? 'Pending Audit' : 'Tier 1 Internal'}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                    {sitesData.length === 0 && (
                         <div className="col-span-full py-24 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30">
                            <Building2 size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted italic">No managed sites found in the registry.</p>
                            <Button variant="outline" className="mt-6 uppercase font-bold text-[10px] tracking-widest" onClick={() => setIsAddSiteOpen(true)}>
                                Register new site
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* PENDING REQUESTS DIALOG */}
            <Dialog open={isPendingRequestsOpen} onOpenChange={setIsPendingRequestsOpen}>
                <DialogContent className="sm:max-w-[800px] bg-bg-elevated border-border-default max-h-[80vh] flex flex-col p-0 shadow-2xl">
                    <DialogHeader className="p-6 pb-2">
                        <div className="flex items-center gap-2 mb-1">
                            <History className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest">Pending Site Requests</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs">Registry submissions currently undergoing verification by Command Center staff.</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto px-6 py-4">
                        {myPendingSitesList.length > 0 ? (
                            <div className="space-y-4">
                                {myPendingSitesList.map(req => (
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
                                                        <span className="flex items-center gap-1.5"><History size={12}/> Submitted {formatDateStr(req.submittedDate)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-8 border-l border-border-sub md:pl-8">
                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">On-Site Manager</p>
                                                    <p className="text-[10px] font-bold text-text-primary uppercase">{req.managerName || 'Awaiting Entry'}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Verification Status</p>
                                                    <p className="text-[10px] font-bold text-accent-gold uppercase animate-pulse">Processing...</p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <div className="p-24 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30">
                                <History size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                                <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted italic">No pending site registrations found in your account history.</p>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="p-6 bg-bg-secondary/30 border-t border-border-default">
                        <Button variant="outline" onClick={() => setIsPendingRequestsOpen(false)} className="w-full uppercase font-bold text-[10px] tracking-widest h-10">Close Terminal</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
                            <Input name="siteName" placeholder="e.g., Gotham Data Center, HQ North" className="bg-bg-primary" required />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Address / Coordinates</Label>
                            <div className="relative">
                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                                <Input name="location" placeholder="Full address..." className="bg-bg-primary pl-10" required />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">On-Site Manager</Label>
                                <div className="relative">
                                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
                                    <Input name="managerName" placeholder="Name" className="bg-bg-primary pl-10" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Direct Line</Label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
                                    <Input name="managerPhone" placeholder="555-000-0000" className="bg-bg-primary pl-10" />
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="bg-bg-tertiary/30 -mx-6 -mb-6 p-6 border-t border-border-default">
                            <Button variant="outline" type="button" onClick={() => setIsAddSiteOpen(false)}>Cancel</Button>
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
