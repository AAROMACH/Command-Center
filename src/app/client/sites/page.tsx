'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from "@/lib/firebase";
import { NotificationService } from '@/lib/notification-service';
import { collection, onSnapshot, query, where, doc, setDoc } from 'firebase/firestore';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import { useClientJobs } from '@/hooks/use-client-data';
import type { Technician, WorkOrder, SiteRequest, Site } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
    MapPin, 
    Search,
    Plus,
    Building2,
    Check,
    Navigation,
    Phone,
    ShieldCheck,
    Eye,
    Clock,
    Wrench,
    Activity,
    X,
    AlertCircle
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AddressAutocompleteInput } from '@/components/ui/address-autocomplete-input';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ViewToggle, useViewMode } from '@/components/view-toggle';
import { PageHeader } from '@/components/page-header';
import { SearchField } from '@/components/search-field';
import { EmptyState } from '@/components/empty-state';

export default function ClientSitesPage() {
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    // Pool + dispatched jobs (was the pool only, via a leaking nested listener).
    const workOrders = useClientJobs(currentUser);
    const [siteRequests, setSiteRequests] = useState<SiteRequest[]>([]);
    const [firestoreSites, setFirestoreSites] = useState<Site[]>([]);
    const [mounted, setMounted] = useState(false);
    const [viewMode, setViewMode] = useViewMode('client-sites');
    const [searchQuery, setSearchQuery] = useState("");
    const [isAddSiteOpen, setIsAddSiteOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [duplicateError, setDuplicateError] = useState<string | null>(null);
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        setMounted(true);
        const userId = sessionStorage.getItem('currentUserId');
        setCurrentUserId(userId);

        if (userId) {
            // Listen to approved sites by clientId
            const unsubSites = onSnapshot(query(collection(db, 'sites'), where('clientId', '==', userId)), (snap) => {
                setFirestoreSites(snap.docs.map(rd => ({ ...rd.data(), id: rd.id } as Site)));
            });

            const unsubUser = onSnapshot(doc(db, 'users', userId), (d) => {
                if (d.exists()) {
                    const techData = { ...d.data(), id: d.id } as Technician;
                    setCurrentUser(techData);

                }
            });
            const unsubReq = onSnapshot(query(collection(db, 'siteRequests'), where('clientId', '==', userId)), (snap) => {
                setSiteRequests(snap.docs.map(rd => ({ ...rd.data(), id: rd.id } as SiteRequest)));
            }, () => {});
            return () => { unsubUser(); unsubSites(); unsubReq(); };
        }
    }, []);

    const sitesData = useMemo(() => {
        if (!currentUser?.clientCompany) return [];

        // Merge Firestore sites with managedSites, dedup by id
        const managedSites = currentUser.managedSites || [];
        const fsIds = new Set(firestoreSites.map(s => s.id));
        const managedNotInFS = managedSites
            .filter(s => !fsIds.has(s.id))
            .map(s => ({ id: s.id, name: s.name, location: s.location }));
        const allSiteSources = [...firestoreSites, ...managedNotInFS];

        // Also infer sites from work order locations
        const knownLocations = new Set(allSiteSources.map(s => s.location));
        const woSources = workOrders
            .filter(wo => !knownLocations.has(wo.location))
            .map(wo => ({ id: `wo-${wo.id}`, name: wo.location.split(',')[0], location: wo.location }));

        const authorized = [...allSiteSources, ...woSources].map(site => {
            const activeAssignments = workOrders.filter(wo => wo.location === site.location && wo.status !== 'completed');
            return {
                id: site.id,
                name: site.name,
                location: site.location,
                activeAssignments,
                contact: 'Site Manager',
                status: 'authorized' as const
            };
        });

        const pending = siteRequests
            .filter(req => req.status === 'pending')
            .map(req => ({
                id: req.id,
                name: req.siteName,
                location: req.location,
                activeAssignments: [] as WorkOrder[],
                contact: req.managerName || 'TBD',
                status: 'pending' as const,
                submittedDate: req.submittedDate
            }));

        const q = searchQuery.trim().toLowerCase();
        return [...authorized, ...pending].filter(s =>
            (s.name || '').toLowerCase().includes(q) ||
            (s.location || '').toLowerCase().includes(q)
        );
    }, [currentUser, searchQuery, workOrders, siteRequests, firestoreSites]);

    const handleAddSite = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const newLocation = ((formData.get('location') as string) || '').trim().toLowerCase();

        // Duplicate guard
        const isDuplicate =
            sitesData.some(s => s.location.toLowerCase() === newLocation) ||
            siteRequests.some(r => r.location.toLowerCase() === newLocation);

        if (isDuplicate) {
            setDuplicateError('A site at this address is already on file or waiting for approval.');
            return;
        }

        setDuplicateError(null);
        setSubmitting(true);

        const newRequest = {
            clientId: currentUserId,
            clientName: currentUser?.clientCompany || 'Unknown Client',
            siteName: formData.get('siteName'),
            location: formData.get('location'),
            managerName: formData.get('managerName'),
            status: 'pending',
            submittedDate: new Date().toISOString().split('T')[0]
        };

        try {
            const siteReqId = await createDocId(ID_PREFIXES.SITE_REQUEST);
            await setDoc(doc(db, 'siteRequests', siteReqId), { ...newRequest, id: siteReqId });
            NotificationService.notifyAdmins('New site request',
                `${newRequest.clientName} asked to add ${newRequest.siteName || 'a site'}${newRequest.location ? ` at ${newRequest.location}` : ''}.`,
                undefined, { inAppOnly: true }).catch(() => {});
            toast({
                title: "Site submitted",
                description: "We'll review the new site and add it to your account.",
            });
            setIsAddSiteOpen(false);
        } catch (err: any) {
            toast({ variant: "destructive", title: "Could not submit site", description: err.message });
        } finally {
            setSubmitting(false);
        }
    };

    if (!mounted || !currentUserId) return null;

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Client portal"
                icon={MapPin}
                title="Sites"
                subtitle="Your service locations and the work happening at each."
                actions={<Button onClick={() => setIsAddSiteOpen(true)}><Plus size={14} className="mr-2"/> Add site</Button>}
            />

            <div className="flex items-center justify-between gap-3">
                <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search by site name or address" className="sm:max-w-md" />
                <ViewToggle value={viewMode} onChange={setViewMode} />
            </div>

            {sitesData.length === 0 ? (
                searchQuery
                    ? <EmptyState icon={MapPin} title="No sites match your search" action={<Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>Clear search</Button>} />
                    : <EmptyState icon={MapPin} title="No sites yet" description="Add a site so we know where to send technicians." />
            ) : viewMode === 'list' ? (
            <div className="space-y-1">
                {sitesData.map(site => (
                    <div key={site.id}
                        onClick={() => site.status === 'authorized' && router.push(`/client/sites/${site.id}`)}
                        className={cn("flex items-center gap-3 px-4 py-2.5 rounded-lg border bg-bg-secondary transition-all group",
                            site.status === 'authorized' ? "border-border-sub hover:border-text-muted cursor-pointer" : "border-dashed border-border-sub opacity-80 cursor-default")}>
                        <MapPin size={14} className="text-text-muted shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-text-primary truncate">{site.name}</p>
                            <p className="text-[11px] text-text-muted truncate">{site.location}</p>
                        </div>
                        <span className="hidden md:block text-[12px] text-text-muted shrink-0">
                            {site.activeAssignments.length > 0 ? `${site.activeAssignments.length} open job${site.activeAssignments.length === 1 ? '' : 's'}` : 'No open jobs'}
                        </span>
                        {site.status === 'authorized'
                            ? <Eye size={16} className="text-text-muted shrink-0" />
                            : <Badge variant="onhold" className="shrink-0 text-[10px] uppercase tracking-wide">Pending approval</Badge>}
                    </div>
                ))}
            </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {sitesData.map(site => (
                    <Card key={site.id} 
                        onClick={() => site.status === 'authorized' && router.push(`/client/sites/${site.id}`)}
                        className={cn("rounded-xl bg-bg-secondary border-border-main shadow-sm hover:border-text-muted transition-all cursor-pointer group", site.status === 'pending' && "opacity-80 border-dashed cursor-default")}>
                        <CardHeader className="border-b border-border-sub pb-4 text-left">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <h3 className="text-base font-semibold text-text-primary">{site.name}</h3>
                                    <p className="text-[12px] text-text-muted flex items-center gap-1.5">
                                        <MapPin size={12}/> {site.location}
                                    </p>
                                </div>
                                {site.status === 'authorized' ? <Eye size={18} className="text-text-muted"/> : <Badge variant="onhold" className="text-[10px] uppercase tracking-wide">Pending approval</Badge>}
                            </div>
                        </CardHeader>
                        <CardContent className="p-5 flex-1 space-y-4 text-left">
                            <div className="space-y-2">
                                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Open jobs</p>
                                {site.activeAssignments.length > 0 ? (
                                    <div className="space-y-1">
                                        {site.activeAssignments.slice(0, 2).map(wo => (
                                            <div key={wo.id} className="text-[13px] text-text-primary flex items-center gap-2">
                                                <div className="h-1.5 w-1.5 rounded-full bg-accent-gold" /> {wo.description}
                                            </div>
                                        ))}
                                        {site.activeAssignments.length > 2 && <p className="text-[12px] text-text-muted">+{site.activeAssignments.length - 2} more</p>}
                                    </div>
                                ) : <p className="text-[12px] text-text-muted">No open jobs</p>}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
            )}

            <Dialog open={isAddSiteOpen} onOpenChange={setIsAddSiteOpen}>
                <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default">
                    <DialogHeader className="text-left">
                        <DialogTitle className="text-lg font-semibold">Add a site</DialogTitle>
                        <DialogDescription>Tell us about the new location. We&apos;ll confirm it and add it to your account.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddSite} className="space-y-6 py-4 text-left" onChange={() => setDuplicateError(null)}>
                        <div className="space-y-2">
                            <Label className="text-[12px] font-medium text-text-secondary">Site name</Label>
                            <Input name="siteName" placeholder="e.g., Downtown data center" className="bg-bg-primary" required />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[12px] font-medium text-text-secondary">Address</Label>
                            <AddressAutocompleteInput name="location" placeholder="Full street address" className="bg-bg-primary" required />
                            {duplicateError && (
                                <p className="text-[12px] text-text-red flex items-center gap-1.5">
                                    <AlertCircle size={12} /> {duplicateError}
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[12px] font-medium text-text-secondary">On-site manager</Label>
                            <Input name="managerName" placeholder="Name" className="bg-bg-primary" />
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={submitting} className="w-full">
                                {submitting ? 'Submitting…' : 'Submit site'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
