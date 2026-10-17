'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, doc, setDoc } from 'firebase/firestore';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import { uploadFile } from '@/lib/upload';
import type { ServiceRequest, Technician } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
    ClipboardList,
    Plus,
    Search,
    MapPin,
    ArrowUpDown,
    History,
    Activity,
    CheckCircle2,
    Check,
    Camera,
    FileText,
    Trash2,
    X,
    ChevronRight,
    Navigation,
    Upload,
    SearchCode,
    ExternalLink,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PageHeader } from '@/components/page-header';
import { SearchField } from '@/components/search-field';
import { SortControl } from '@/components/list-toolbar';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { usePaged, ListPager, PAGE_SIZES_SMALL } from '@/components/list-pager';
import { requestMillis, formatRequestDate, requestKind } from '../_lib/requests';

declare global {
  interface Window {
    google: any;
    gm_authFailure?: () => void;
  }
}

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

type SortOption = 'newest' | 'oldest' | 'priority' | 'type';

export default function ClientTicketsPage() {
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [allRequests, setAllRequests] = useState<ServiceRequest[]>([]);
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<SortOption>('newest');
    const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
    
    // Saved sites picker
    const [isSiteRegistryOpen, setIsSiteRegistryOpen] = useState(false);
    const addressInputRef = useRef<HTMLInputElement>(null);

    // Intake Asset State
    const [attachments, setAttachments] = useState<{ name: string; type: string; url?: string }[]>([]);

    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
        const userId = sessionStorage.getItem('currentUserId');
        setCurrentUserId(userId);

        if (userId) {
            let unsubReq: (() => void) | undefined;
            const unsubUser = onSnapshot(doc(db, 'users', userId), (d) => {
                if (d.exists()) {
                    const techData = { ...d.data(), id: d.id } as Technician;
                    setCurrentUser(techData);

                    if (techData.clientCompany && !unsubReq) {
                        unsubReq = onSnapshot(
                            query(collection(db, 'clientRequests'), where('clientName', '==', techData.clientCompany)),
                            (snap) => {
                                setAllRequests(snap.docs.map(rd => ({ ...rd.data(), id: rd.id } as ServiceRequest)));
                            },
                            (err) => {
                                console.error('clientRequests query error:', err);
                            }
                        );
                    }
                }
            }, (err) => {
                console.error('User doc error:', err);
            });
            return () => { unsubUser(); unsubReq?.(); };
        }
    }, []);

    useEffect(() => {
      if (!isNewTicketOpen) return;

      // Handle referer or activation failures from Google Maps
      window.gm_authFailure = () => {
        console.warn("Google Maps auth failed.");
        toast({
          variant: "destructive",
          title: "Google Maps unavailable",
          description: "Address suggestions are off. Type the address instead.",
        });
      };

      const scriptId = 'google-maps-places-script';
      
      const initAutocomplete = () => {
        if (!addressInputRef.current || !window.google || !window.google.maps || !window.google.maps.places) return;
        try {
          const autocomplete = new window.google.maps.places.Autocomplete(addressInputRef.current, {
            componentRestrictions: { country: "us" },
            fields: ["formatted_address", "geometry"],
            types: ["address"],
          });
          autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            if (place.formatted_address) {
              const locationInput = document.getElementById('location-input') as HTMLInputElement;
              if (locationInput) locationInput.value = place.formatted_address;
            }
          });
        } catch (e) {
          console.warn("Places autocomplete unavailable.");
        }
      };

      if (MAPS_API_KEY && !window.google && !document.getElementById(scriptId)) {
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=places`;
        script.async = true;
        script.onload = initAutocomplete;
        document.head.appendChild(script);
      } else if (window.google) {
        initAutocomplete();
      }
    }, [isNewTicketOpen, toast]);

    const myRequests = useMemo(() => {
        let results = allRequests;

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            results = results.filter(r => 
                (r.description || '').toLowerCase().includes(q) ||
                (r.id || '').toLowerCase().includes(q) ||
                (r.location || '').toLowerCase().includes(q) ||
                requestKind(r).toLowerCase().includes(q)
            );
        }

        return [...results].sort((a, b) => {
            if (sortBy === 'priority') {
                // Missing/unknown priorities rank last; ties fall back to newest.
                const prio: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
                return ((prio[a.priority as string] ?? 4) - (prio[b.priority as string] ?? 4))
                    || requestMillis(b) - requestMillis(a);
            }
            if (sortBy === 'oldest') return requestMillis(a) - requestMillis(b);
            if (sortBy === 'type') return requestKind(a).localeCompare(requestKind(b));
            return requestMillis(b) - requestMillis(a);
        });
    }, [allRequests, searchQuery, sortBy]);

    const handleCreateTicket = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        
        const now = new Date().toISOString();
        const newTicket = {
            clientId: currentUserId,
            clientName: currentUser?.clientCompany || 'Independent Client',
            description: formData.get('description'),
            requestType: formData.get('type'),
            priority: formData.get('priority'),
            location: formData.get('location'),
            requestCategory: 'service_ticket',
            source: 'app',
            status: 'new',
            submittedDate: now.split('T')[0],
            createdAt: now,
            updatedAt: now,
            imageUrls: attachments.filter(a => a.type === 'image').map(a => a.url || ''),
            documentUrls: attachments.filter(a => a.type === 'doc').map(a => a.url || '')
        };

        try {
            const ticketId = await createDocId(ID_PREFIXES.CLIENT_REQUEST);
            await setDoc(doc(db, 'clientRequests', ticketId), { ...newTicket, id: ticketId });
            toast({
                title: "Request sent",
                description: "We'll review your request and follow up shortly.",
            });
            setIsNewTicketOpen(false);
            handleReset();
        } catch (e: any) {
            toast({ variant: "destructive", title: "Could not send request", description: e.message });
        }
    };

    const handleReset = () => {
        setAttachments([]);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (attachments.length >= 5) {
          toast({ variant: 'destructive', title: 'Limit reached', description: 'You can attach up to 5 files per request.' });
          return;
      }

      try {
          const isImage = file.type.startsWith('image/');
          const storagePath = `ticketAttachments/pending/${Date.now()}-${file.name}`;
          const { url } = await uploadFile(storagePath, file);
          setAttachments(prev => [...prev, { name: file.name, type: isImage ? 'image' : 'doc', url }]);
          toast({ title: "File ready", description: `${file.name} attached.` });
      } catch (err: any) {
          toast({ variant: 'destructive', title: 'Upload failed', description: err.message });
      } finally {
          e.target.value = '';
      }
    };

    const removeAttachment = (index: number) => {
        setAttachments(attachments.filter((_, i) => i !== index));
    };

    const selectSiteFromRegistry = (site: { name: string, location: string }) => {
      const locationInput = document.getElementById('location-input') as HTMLInputElement;
      if (locationInput) {
          locationInput.value = site.location;
          toast({
              title: "Site selected",
              description: `Location set to ${site.name}.`,
          });
      }
      setIsSiteRegistryOpen(false);
    };

    if (!mounted || !currentUserId) return null;

    return (
        <div className="space-y-8 text-left">
            <PageHeader
                eyebrow="Client portal"
                icon={ClipboardList}
                title="Service requests"
                subtitle="Send us a service request and follow its review status."
                actions={<>
                    <Button
                        variant="outline"
                        onClick={() => {
                            const params = new URLSearchParams({
                                name: currentUser?.name || '',
                                email: currentUser?.email || '',
                                phone: currentUser?.phone || '',
                                company: currentUser?.clientCompany || '',
                            });
                            window.open(`/public/service-request?${params.toString()}`, '_blank', 'noopener');
                        }}
                    >
                        <ExternalLink size={14} className="mr-2" />
                        Open full form
                    </Button>
                    <Button onClick={() => setIsNewTicketOpen(true)}>
                        <Plus size={16} className="mr-2"/>
                        New request
                    </Button>
                </>}
            />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <SearchField
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search by ID, location, type or description"
                    className="sm:max-w-md"
                />
                <SortControl
                    value={sortBy === 'newest' || sortBy === 'oldest' ? 'date' : sortBy}
                    onChange={v => setSortBy(v === 'date' ? 'newest' : v as SortOption)}
                    options={[{ value: 'date', label: 'Date' }, { value: 'priority', label: 'Priority' }, { value: 'type', label: 'Type' }]}
                    dateAsc={sortBy === 'oldest'}
                    onToggleDirection={() => setSortBy(sortBy === 'oldest' ? 'newest' : 'oldest')}
                />
            </div>

            <Tabs defaultValue="requested" className="w-full text-left">
                <TabsList className="tabs mb-4">
                    <TabsTrigger value="requested" className="tab">Open</TabsTrigger>
                    <TabsTrigger value="approved" className="tab">Approved</TabsTrigger>
                    <TabsTrigger value="closed" className="tab">Closed</TabsTrigger>
                </TabsList>

                <TabsContent value="requested" className="mt-0">
                    <TicketList pagerKey="requested" searching={!!searchQuery} onClearSearch={() => setSearchQuery('')} resetKeys={[searchQuery, sortBy]}
                        requests={myRequests.filter(r => ['new', 'reviewed', 'pending_review', 'pending'].includes(r.status as string))} />
                </TabsContent>
                
                <TabsContent value="approved" className="mt-0">
                    <TicketList pagerKey="approved" searching={!!searchQuery} onClearSearch={() => setSearchQuery('')} resetKeys={[searchQuery, sortBy]}
                        requests={myRequests.filter(r => r.status === 'approved')} />
                </TabsContent>

                <TabsContent value="closed" className="mt-0">
                    <TicketList pagerKey="closed" searching={!!searchQuery} onClearSearch={() => setSearchQuery('')} resetKeys={[searchQuery, sortBy]}
                        requests={myRequests.filter(r => ['closed', 'rejected', 'denied', 'archived'].includes(r.status as string))} />
                </TabsContent>
            </Tabs>

            <Dialog open={isNewTicketOpen} onOpenChange={(open) => { if(!open) handleReset(); setIsNewTicketOpen(open); }}>
                <DialogContent className="sm:max-w-[650px] bg-bg-elevated border-border-default max-h-[90vh] overflow-y-auto p-0 shadow-2xl">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30 text-left">
                        <div className="flex items-center gap-2 mb-1 text-left">
                            <Plus className="text-text-muted h-5 w-5" />
                            <DialogTitle className="text-lg font-semibold text-text-primary">New service request</DialogTitle>
                        </div>
                        <DialogDescription className="text-[13px] text-text-muted text-left">Tell us what you need. Our team will review it and schedule a technician.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateTicket}>
                        <div className="px-6 py-4 space-y-6 text-left">
                            <div className="space-y-2 text-left">
                                <Label className="text-[12px] font-medium text-text-secondary">What do you need?</Label>
                                <Input name="description" placeholder="e.g., Network closet cabling failure" className="bg-bg-primary" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2 text-left">
                                    <Label className="text-[12px] font-medium text-text-secondary">Request type</Label>
                                    <Select name="type" defaultValue="Repair">
                                        <SelectTrigger className="bg-bg-primary"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Repair">Repair</SelectItem>
                                            <SelectItem value="Installation">Installation</SelectItem>
                                            <SelectItem value="Maintenance">Preventive maintenance</SelectItem>
                                            <SelectItem value="Survey">Site survey</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2 text-left">
                                    <Label className="text-[12px] font-medium text-text-secondary">Priority</Label>
                                    <Select name="priority" defaultValue="medium">
                                        <SelectTrigger className="bg-bg-primary"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="low">Low (standard)</SelectItem>
                                            <SelectItem value="medium">Medium</SelectItem>
                                            <SelectItem value="high">High (4-hour target)</SelectItem>
                                            <SelectItem value="critical">Critical (emergency)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-2 text-left">
                                <Label className="text-[12px] font-medium text-text-secondary">Site address</Label>
                                <div className="space-y-1.5">
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                                        <Input 
                                            id="location-input"
                                            ref={addressInputRef}
                                            name="location" 
                                            placeholder="Full address or site name" 
                                            className="bg-bg-primary pl-10" 
                                            required 
                                        />
                                    </div>
                                    <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-7 px-2 text-[12px] font-medium text-text-secondary hover:text-text-primary flex items-center gap-1.5"
                                        onClick={() => setIsSiteRegistryOpen(true)}
                                    >
                                        <MapPin size={12}/> Choose a saved site
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-3 pt-4 border-t border-border-sub">
                                <div className="flex items-center justify-between">
                                    <Label className="text-[12px] font-medium text-text-secondary flex items-center gap-2">
                                        <FileText size={14} /> Photos and documents
                                    </Label>
                                    <span className="text-[11px] font-mono text-text-muted">{attachments.length}/5 files</span>
                                </div>
                                
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {attachments.map((asset, i) => (
                                        <div key={i} className="relative aspect-video rounded-lg border border-border-sub overflow-hidden group bg-bg-primary flex flex-col items-center justify-center p-2">
                                            {asset.type === 'image' ? (
                                                <img src={asset.url} alt={`Attachment ${i + 1}`} className="w-full h-full object-cover rounded" />
                                            ) : (
                                                <div className="flex flex-col items-center gap-1">
                                                    <FileText size={20} className="text-text-muted" />
                                                    <span className="text-[11px] truncate max-w-full">{asset.name}</span>
                                                </div>
                                            )}
                                            <button 
                                                type="button" 
                                                onClick={() => removeAttachment(i)} 
                                                className="absolute top-1 right-1 p-1 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X size={10} />
                                            </button>
                                        </div>
                                    ))}
                                    {attachments.length < 5 && (
                                        <label className="aspect-video rounded-lg border-2 border-dashed border-border-sub flex flex-col items-center justify-center gap-1 text-text-muted hover:border-brand-red transition-all cursor-pointer group">
                                            <Upload size={16} className="group-hover:text-brand-red" />
                                            <span className="text-[12px]">Attach file</span>
                                            <input type="file" className="hidden" onChange={handleFileUpload} />
                                        </label>
                                    )}
                                </div>
                                <p className="text-[12px] text-text-muted">PDF, JPG, PNG or DOC, up to 10 MB each.</p>
                            </div>
                        </div>
                        <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default mt-2">
                            <Button variant="outline" type="button" onClick={() => setIsNewTicketOpen(false)}>Cancel</Button>
                            <Button type="submit">Send request</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Saved sites picker */}
            <Dialog open={isSiteRegistryOpen} onOpenChange={setIsSiteRegistryOpen}>
                <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[80vh] shadow-2xl">
                    <DialogHeader className="p-6 pb-2 text-left">
                        <div className="flex items-center gap-2 mb-1">
                            <Navigation className="text-text-muted h-5 w-5" />
                            <DialogTitle className="text-lg font-semibold text-text-primary text-left">Saved sites</DialogTitle>
                        </div>
                        <DialogDescription className="text-[13px] text-left">Pick one of your sites to fill in the address.</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="flex-1 px-6 py-4">
                        <div className="space-y-1">
                            {currentUser?.managedSites?.map(site => (
                                <button
                                    key={site.id}
                                    type="button"
                                    onClick={() => selectSiteFromRegistry(site)}
                                    className="w-full p-4 rounded hover:bg-bg-tertiary transition-colors text-left group active:bg-brand-red-dim border border-transparent hover:border-border-sub"
                                >
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="space-y-0.5 text-left">
                                            <p className="text-[13px] font-semibold text-text-primary">{site.name}</p>
                                            <p className="text-[12px] text-text-muted flex items-center gap-1.5 text-left">
                                                <MapPin size={12} className="shrink-0" />
                                                <span className="truncate">{site.location}</span>
                                            </p>
                                        </div>
                                        <Check size={14} className="text-text-green opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                                     </div>
                                </button>
                            ))}
                            {(!currentUser?.managedSites || currentUser.managedSites.length === 0) && (
                                <EmptyState compact icon={MapPin} title="No saved sites yet" />
                            )}
                        </div>
                    </ScrollArea>
                    <DialogFooter className="p-4 bg-bg-secondary/30 border-t border-border-default">
                        <Button variant="outline" className="w-full" onClick={() => setIsSiteRegistryOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function TicketList({ requests, pagerKey, searching, onClearSearch, resetKeys }: {
    requests: ServiceRequest[];
    pagerKey: string;
    searching: boolean;
    onClearSearch: () => void;
    resetKeys: unknown[];
}) {
    const pager = usePaged(requests, PAGE_SIZES_SMALL, `client-requests-${pagerKey}`, resetKeys);
    if (requests.length === 0) {
        return searching
            ? <EmptyState icon={SearchCode} title="No requests match your search" action={<Button variant="outline" size="sm" onClick={onClearSearch}>Clear search</Button>} />
            : <EmptyState icon={ClipboardList} title="No requests here yet" />;
    }
    return (
        <div className="space-y-3 text-left">
            {pager.items.map(ticket => (
                <Card key={ticket.id} className="rounded-xl border-border-main bg-bg-secondary shadow-sm transition-colors hover:border-text-muted">
                    <CardContent className="flex items-center justify-between gap-4 p-4 text-left">
                        <div className="min-w-0 flex-1 space-y-1 text-left">
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-[11px] font-semibold text-text-muted">{(ticket.id || '').toUpperCase()}</span>
                                {ticket.priority && (
                                    <Badge variant={ticket.priority === 'critical' || ticket.priority === 'high' ? 'high' : 'medium'} className="text-[10px] uppercase tracking-wide">{ticket.priority}</Badge>
                                )}
                            </div>
                            <h3 className="truncate text-sm font-semibold text-text-primary">{ticket.description}</h3>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-text-muted">
                                <span className="flex min-w-0 items-center gap-1.5"><MapPin size={12} className="shrink-0" /><span className="truncate">{ticket.location}</span></span>
                                <span>{requestKind(ticket)} · {formatRequestDate(ticket)}</span>
                            </div>
                        </div>
                        <StatusBadge kind="request" value={ticket.status} className="shrink-0" />
                    </CardContent>
                </Card>
            ))}
            <ListPager pager={pager} noun="requests" />
        </div>
    );
}
