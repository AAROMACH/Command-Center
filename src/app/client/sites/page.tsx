'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, doc, setDoc } from 'firebase/firestore';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import type { Technician, WorkOrder, SiteRequest } from '@/lib/types';
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
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function ClientSitesPage() {
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [siteRequests, setSiteRequests] = useState<SiteRequest[]>([]);
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isAddSiteOpen, setIsAddSiteOpen] = useState(false);
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        setMounted(true);
        const userId = sessionStorage.getItem('currentUserId');
        setCurrentUserId(userId);

        if (userId) {
            const unsubUser = onSnapshot(doc(db, 'users', userId), (d) => {
                if (d.exists()) {
                    const techData = { ...d.data(), id: d.id } as Technician;
                    setCurrentUser(techData);
                    
                    if (techData.clientCompany) {
                        const unsubWO = onSnapshot(query(collection(db, 'workOrders'), where('clientName', '==', techData.clientCompany)), (snap) => {
                            setWorkOrders(snap.docs.map(rd => ({ ...rd.data(), id: rd.id } as WorkOrder)));
                        });
                        const unsubReq = onSnapshot(query(collection(db, 'siteRequests'), where('clientName', '==', techData.clientCompany)), (snap) => {
                            setSiteRequests(snap.docs.map(rd => ({ ...rd.data(), id: rd.id } as SiteRequest)));
                        });
                        return () => { unsubWO(); unsubReq(); };
                    }
                }
            });
            return () => unsubUser();
        }
    }, []);

    const sitesData = useMemo(() => {
        if (!currentUser?.clientCompany) return [];
        
        const clientSites = currentUser.managedSites || [];
        const authorizedLocations = Array.from(new Set([
            ...clientSites.map(s => s.location),
            ...workOrders.map(wo => wo.location)
        ]));

        const authorized = authorizedLocations.map(location => {
            const siteInfo = clientSites.find(s => s.location === location);
            const activeAssignments = workOrders.filter(wo => wo.location === location && wo.status !== 'completed');
            return {
                id: siteInfo?.id || `site-${location.replace(/\s+/g, '-').toLowerCase()}`,
                name: siteInfo?.name || location.split(',')[0],
                location,
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
                activeAssignments: [],
                contact: req.managerName || 'TBD',
                status: 'pending' as const,
                submittedDate: req.submittedDate
            }));

        return [...authorized, ...pending].filter(s => 
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            s.location.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [currentUser, searchQuery, workOrders, siteRequests]);

    const handleAddSite = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        
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
        } catch (e: any) {
            toast({ variant: "destructive", title: "Submission Failed", description: e.message });
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
                <div className="page-header-right">
                    <Button onClick={() => setIsAddSiteOpen(true)}><Plus size={14} className="mr-2"/> Register new site</Button>
                </div>
            </header>

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

            <Dialog open={isAddSiteOpen} onOpenChange={setIsAddSiteOpen}>
                <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default">
                    <DialogHeader className="text-left">
                        <DialogTitle className="uppercase tracking-widest font-bold">Site Registration</DialogTitle>
                        <DialogDescription>Submit coordinates for a new operational facility to the command registry.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddSite} className="space-y-6 py-4 text-left">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase text-text-muted">Site Identifier / Name</Label>
                            <Input name="siteName" placeholder="e.g., Gotham Data Center" className="bg-bg-primary" required />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase text-text-muted">Address / Coordinates</Label>
                            <Input name="location" placeholder="Full address..." className="bg-bg-primary" required />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase text-text-muted">On-Site Manager</Label>
                            <Input name="managerName" placeholder="Name" className="bg-bg-primary" />
                        </div>
                        <DialogFooter><Button type="submit" className="bg-brand-red hover:bg-brand-red-hover w-full">Request Registry</Button></DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
