'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, doc, setDoc } from 'firebase/firestore';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
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

export default function ClientSitesPage() {
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
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

                    if (techData.clientCompany) {
                        const unsubWO = onSnapshot(query(collection(db, 'workOrders'), where('clientName', '==', techData.clientCompany)), (snap) => {
                            setWorkOrders(snap.docs.map(rd => ({ ...rd.data(), id: rd.id } as WorkOrder)));
                        });
                        const unsubReq = onSnapshot(query(collection(db, 'siteRequests'), where('clientId', '==', userId)), (snap) => {
                            setSiteRequests(snap.docs.map(rd => ({ ...rd.data(), id: rd.id } as SiteRequest)));
                        });
                        return () => { unsubWO(); unsubReq(); };
                    }
                }
            });
            return () => { unsubUser(); unsubSites(); };
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

        return [...authorized, ...pending].filter(s =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.location.toLowerCase().includes(searchQuery.toLowerCase())
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
            setDuplicateError('A site at this address is already registered or pending.');
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
            toast({
                title: "Registration Transmitted",
                description: "New site coordinate has been submitted for administrative audit.",
            });
            setIsAddSiteOpen(false);
        } catch (err: any) {
            toast({ variant: "destructive", title: "Submission Failed", description: err.message });
        } finally {
            setSubmitting(false);
        }
    };

    if (!mounted || !currentUserId) return null;

    return (
        <div className="space-y-8">
            <header className="page-header">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2"><MapPin size={12} />Enterprise Registry</p>
                    <h1 className="page-title">Service Sites</h1>
                    <p className="page-subtitle">Real-time status tracking and operational intelligence for all managed properties.</p>
                </div>
                <div className="page-header-right gap-2 items-center">
                    <ViewToggle value={viewMode} onChange={setViewMode} />
                    <Button onClick={() => setIsAddSiteOpen(true)}><Plus size={14} className="mr-2"/> Register new site</Button>
                </div>
            </header>

            {viewMode === 'list' ? (
            <div className="space-y-1">
                {sitesData.map(site => (
                    <div key={site.id}
                        onClick={() => site.status === 'authorized' && router.push(`/client/sites/${site.id}`)}
                        className={cn("flex items-center gap-3 px-4 py-2.5 rounded-lg border bg-bg-secondary transition-all group",
                            site.status === 'authorized' ? "border-border-sub hover:border-text-muted cursor-pointer" : "border-dashed border-border-sub opacity-80 cursor-default")}>
                        <MapPin size={13} className="text-brand-red shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold text-text-primary uppercase tracking-wide truncate group-hover:text-brand-red transition-colors">{site.name}</p>
                            <p className="text-[9px] text-text-muted uppercase truncate">{site.location}</p>
                        </div>
                        <span className="hidden md:block text-[10px] text-text-muted shrink-0">
                            {site.activeAssignments.length > 0 ? `${site.activeAssignments.length} active` : 'No active missions'}
                        </span>
                        {site.status === 'authorized'
                            ? <Eye size={16} className="text-text-muted shrink-0" />
                            : <Badge variant="onhold" className="shrink-0">PENDING</Badge>}
                    </div>
                ))}
            </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {sitesData.map(site => (
                    <Card key={site.id} 
                        onClick={() => site.status === 'authorized' && router.push(`/client/sites/${site.id}`)}
                        className={cn("bg-bg-secondary border-border-main hover:border-text-muted transition-all cursor-pointer group", site.status === 'pending' && "opacity-80 border-dashed cursor-default")}>
                        <CardHeader className="bg-bg-tertiary/30 border-b border-border-sub pb-4 text-left">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <h3 className="text-base font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors">{site.name}</h3>
                                    <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest flex items-center gap-1.5">
                                        <MapPin size={12} className="text-brand-red"/> {site.location}
                                    </p>
                                </div>
                                {site.status === 'authorized' ? <Eye size={18} className="text-text-muted"/> : <Badge variant="onhold">PENDING</Badge>}
                            </div>
                        </CardHeader>
                        <CardContent className="p-5 flex-1 space-y-4 text-left">
                            <div className="space-y-2">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Active Activity</p>
                                {site.activeAssignments.length > 0 ? (
                                    <div className="space-y-1">
                                        {site.activeAssignments.slice(0, 2).map(wo => (
                                            <div key={wo.id} className="text-[11px] font-bold text-text-primary uppercase flex items-center gap-2">
                                                <div className="h-1 w-1 rounded-full bg-brand-red" /> {wo.description}
                                            </div>
                                        ))}
                                        {site.activeAssignments.length > 2 && <p className="text-[9px] text-text-muted font-bold">+{site.activeAssignments.length - 2} More Assignments</p>}
                                    </div>
                                ) : <p className="text-[10px] text-text-muted italic">No active missions</p>}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
            )}

            <Dialog open={isAddSiteOpen} onOpenChange={setIsAddSiteOpen}>
                <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default">
                    <DialogHeader className="text-left">
                        <DialogTitle className="uppercase tracking-widest font-bold">Site Registration</DialogTitle>
                        <DialogDescription>Submit coordinates for a new operational facility to the command registry.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddSite} className="space-y-6 py-4 text-left" onChange={() => setDuplicateError(null)}>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase text-text-muted">Site Identifier / Name</Label>
                            <Input name="siteName" placeholder="e.g., Gotham Data Center" className="bg-bg-primary" required />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase text-text-muted">Address / Coordinates</Label>
                            <AddressAutocompleteInput name="location" placeholder="Full address..." className="bg-bg-primary" required />
                            {duplicateError && (
                                <p className="text-[10px] text-brand-red font-bold flex items-center gap-1.5">
                                    <AlertCircle size={12} /> {duplicateError}
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase text-text-muted">On-Site Manager</Label>
                            <Input name="managerName" placeholder="Name" className="bg-bg-primary" />
                        </div>
                        <DialogFooter>
                            <Button type="submit" disabled={submitting} className="bg-brand-red hover:bg-brand-red-hover w-full">
                                {submitting ? 'Submitting...' : 'Request Registry'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
