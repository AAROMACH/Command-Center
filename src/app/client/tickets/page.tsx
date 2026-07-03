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
import { technicians } from '@/lib/data';

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
    
    // Site Registry State
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

      // Defensive Protocol: Handle referer or activation failures from Google Maps
      window.gm_authFailure = () => {
        console.warn("Google Maps API Handshake Restricted.");
        toast({
          variant: "destructive",
          title: "Registry Security Error",
          description: "Google Maps API referer or activation restriction active.",
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
          console.warn("Places Autocomplete Terminal Restricted.");
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
                (r.location || '').toLowerCase().includes(q)
            );
        }

        return results.sort((a, b) => {
            if (sortBy === 'priority') {
                const prio = { critical: 0, high: 1, medium: 2, low: 3 };
                return prio[a.priority as keyof typeof prio] - prio[b.priority as keyof typeof prio];
            }
            if (sortBy === 'oldest') return (a.submittedDate || '').localeCompare(b.submittedDate || '');
            if (sortBy === 'type') return (a.requestType || '').localeCompare(b.requestType || '');
            return (b.submittedDate || '').localeCompare(a.submittedDate || '');
        });
    }, [allRequests, searchQuery, sortBy]);

    const handleCreateTicket = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        
        const newTicket = {
            clientId: currentUserId,
            clientName: currentUser?.clientCompany || 'Independent Client',
            description: formData.get('description'),
            requestType: formData.get('type'),
            priority: formData.get('priority'),
            location: formData.get('location'),
            status: 'new',
            submittedDate: new Date().toISOString().split('T')[0],
            imageUrls: attachments.filter(a => a.type === 'image').map(a => a.url || ''),
            documentUrls: attachments.filter(a => a.type === 'doc').map(a => a.url || '')
        };

        try {
            const ticketId = await createDocId(ID_PREFIXES.CLIENT_REQUEST);
            await setDoc(doc(db, 'clientRequests', ticketId), { ...newTicket, id: ticketId });
            toast({
                title: "Request Transmitted",
                description: "Service ticket has been added to the command intake queue.",
            });
            setIsNewTicketOpen(false);
            handleReset();
        } catch (e: any) {
            toast({ variant: "destructive", title: "Submission Failed", description: e.message });
        }
    };

    const handleReset = () => {
        setAttachments([]);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (attachments.length >= 5) {
          toast({ variant: 'destructive', title: 'Registry Full', description: 'Maximum 5 evidence assets authorized per request.' });
          return;
      }

      try {
          const isImage = file.type.startsWith('image/');
          const storagePath = `ticketAttachments/pending/${Date.now()}-${file.name}`;
          const { url } = await uploadFile(storagePath, file);
          setAttachments(prev => [...prev, { name: file.name, type: isImage ? 'image' : 'doc', url }]);
          toast({ title: "Asset Buffered", description: `${file.name} ready for intake.` });
      } catch (err: any) {
          toast({ variant: 'destructive', title: 'Upload Failed', description: err.message });
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
              title: "Site Linked",
              description: `Request anchored to verified coordinate: ${site.name}`,
          });
      }
      setIsSiteRegistryOpen(false);
    };

    if (!mounted || !currentUserId) return null;

    return (
        <div className="space-y-8 text-left">
            <header className="page-header text-left">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2"><ClipboardList size={12} />Low Voltage Service Funnel</p>
                    <h1 className="page-title text-left">Support Tickets</h1>
                    <p className="page-subtitle text-left">Submit service requests and track administrative review status.</p>
                </div>
                <div className="page-header-right items-center gap-3">
                    <a href="/public/service-request" target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" className="h-10 px-4 font-bold uppercase tracking-widest text-[10px]">
                            <ExternalLink size={13} className="mr-2" />
                            Go to Form
                        </Button>
                    </a>
                    <Button variant="default" onClick={() => setIsNewTicketOpen(true)} className="h-10 px-6 font-bold uppercase tracking-widest">
                        <Plus size={16} className="mr-2"/>
                        Create Ticket
                    </Button>
                </div>
            </header>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-bg-secondary rounded-xl border border-border-sub shadow-sm text-left">
                <div className="search-wrap flex-1 !mb-0 w-full md:w-auto text-left">
                    <Search className="h-4 w-4 text-text-muted" />
                    <input 
                        className="search-input !h-10 !text-xs font-bold uppercase !w-full bg-bg-primary text-left" 
                        placeholder="Search tickets by ID, site, or description..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                        <SelectTrigger className="w-[160px] h-10 bg-bg-primary text-[10px] uppercase font-bold tracking-widest border-border-main">
                            <SelectValue placeholder="Sort Registry" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="newest" className="text-[10px] uppercase font-bold">Newest First</SelectItem>
                            <SelectItem value="oldest" className="text-[10px] uppercase font-bold">Oldest First</SelectItem>
                            <SelectItem value="priority" className="text-[10px] uppercase font-bold">Priority Level</SelectItem>
                            <SelectItem value="type" className="text-[10px] uppercase font-bold">Job Category</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Tabs defaultValue="requested" className="w-full text-left">
                <TabsList className="tabs !bg-bg-tertiary p-0 h-10 mb-8 text-left">
                    <TabsTrigger value="requested" className="tab !px-8 h-full data-[state=active]:bg-brand-red data-[state=active]:text-white">Requested</TabsTrigger>
                    <TabsTrigger value="approved" className="tab !px-8 h-full data-[state=active]:bg-brand-red data-[state=active]:text-white">Approved</TabsTrigger>
                    <TabsTrigger value="closed" className="tab !px-8 h-full data-[state=active]:bg-brand-red data-[state=active]:text-white">resolved/closed</TabsTrigger>
                </TabsList>

                <TabsContent value="requested" className="space-y-4 mt-0">
                    <TicketList requests={myRequests.filter(r => r.status === 'new' || r.status === 'reviewed')} />
                </TabsContent>
                
                <TabsContent value="approved" className="space-y-4 mt-0">
                    <TicketList requests={myRequests.filter(r => r.status === 'approved')} />
                </TabsContent>

                <TabsContent value="closed" className="space-y-4 mt-0">
                    <TicketList requests={myRequests.filter(r => r.status === 'closed' || r.status === 'rejected')} />
                </TabsContent>
            </Tabs>

            <Dialog open={isNewTicketOpen} onOpenChange={(open) => { if(!open) handleReset(); setIsNewTicketOpen(open); }}>
                <DialogContent className="sm:max-w-[650px] bg-bg-elevated border-border-default max-h-[90vh] overflow-y-auto p-0 shadow-2xl">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30 text-left">
                        <div className="flex items-center gap-2 mb-1 text-left">
                            <Plus className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">New Service Intake</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs uppercase font-bold text-text-muted text-left">Submit detailed job requirements for administrative audit and dispatch.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateTicket}>
                        <div className="px-6 py-4 space-y-6 text-left">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Issue Summary / Subject</Label>
                                <Input name="description" placeholder="e.g., Network Closet Cabling Failure" className="bg-bg-primary h-11 text-xs" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted">Request Type</Label>
                                    <Select name="type" defaultValue="Repair">
                                        <SelectTrigger className="bg-bg-primary h-11 text-xs uppercase font-bold tracking-wider"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Repair">Infrastructure Repair</SelectItem>
                                            <SelectItem value="Installation">Low Voltage Install</SelectItem>
                                            <SelectItem value="Maintenance">Preventive Maintenance</SelectItem>
                                            <SelectItem value="Survey">Site Survey</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted">Priority Level</Label>
                                    <Select name="priority" defaultValue="medium">
                                        <SelectTrigger className="bg-bg-primary h-11 text-xs uppercase font-bold tracking-wider"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="low">Low (Standard)</SelectItem>
                                            <SelectItem value="medium">Medium</SelectItem>
                                            <SelectItem value="high">High (4h Target)</SelectItem>
                                            <SelectItem value="critical">Critical (Emergency)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Site Location / Coordinates</Label>
                                <div className="space-y-1.5">
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                                        <Input 
                                            id="location-input"
                                            ref={addressInputRef}
                                            name="location" 
                                            placeholder="Full address or site identifier..." 
                                            className="bg-bg-primary h-11 text-xs pl-10" 
                                            required 
                                        />
                                    </div>
                                    <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-6 text-[9px] uppercase font-bold tracking-widest text-accent-gold hover:bg-accent-gold/10 p-0 flex items-center gap-1.5"
                                        onClick={() => setIsSiteRegistryOpen(true)}
                                    >
                                        <MapPin size={12}/> Search Managed Sites
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-3 pt-4 border-t border-border-sub">
                                <div className="flex items-center justify-between">
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                                        <FileText size={14} className="text-brand-red" /> Site Evidence & Assets
                                    </Label>
                                    <span className="text-[9px] font-mono text-text-muted">{attachments.length}/5 Assets</span>
                                </div>
                                
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {attachments.map((asset, i) => (
                                        <div key={i} className="relative aspect-video rounded-lg border border-border-sub overflow-hidden group bg-bg-primary flex flex-col items-center justify-center p-2">
                                            {asset.type === 'image' ? (
                                                <img src={asset.url} alt={`Evidence ${i}`} className="w-full h-full object-cover rounded" />
                                            ) : (
                                                <div className="flex flex-col items-center gap-1">
                                                    <FileText size={20} className="text-text-muted" />
                                                    <span className="text-[8px] font-bold uppercase truncate max-w-full">{asset.name}</span>
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
                                            <span className="text-[8px] font-bold uppercase">Attach Evidence</span>
                                            <input type="file" className="hidden" onChange={handleFileUpload} />
                                        </label>
                                    )}
                                </div>
                                <p className="text-[9px] text-text-muted uppercase font-bold italic tracking-tighter">Authorized formats: PDF, JPG, PNG, DOC (Max 10MB)</p>
                            </div>
                        </div>
                        <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default mt-2">
                            <Button variant="outline" type="button" onClick={() => setIsNewTicketOpen(false)}>Cancel Submission</Button>
                            <Button type="submit" className="bg-brand-red hover:bg-brand-red-hover px-10">Transmit Request</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* SITE REGISTRY POPUP */}
            <Dialog open={isSiteRegistryOpen} onOpenChange={setIsSiteRegistryOpen}>
                <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[80vh] shadow-2xl">
                    <DialogHeader className="p-6 pb-2 text-left">
                        <div className="flex items-center gap-2 mb-1">
                            <Navigation className="text-accent-gold h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary text-left">Site Registry</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs text-left">Select verified coordinates for your organization.</DialogDescription>
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
                                            <p className="text-xs font-bold text-text-primary uppercase tracking-tight group-hover:text-accent-gold transition-colors">{site.name}</p>
                                            <p className="text-[10px] text-text-muted flex items-center gap-1.5 text-left">
                                                <MapPin size={10} className="text-brand-red shrink-0" />
                                                <span className="truncate">{site.location}</span>
                                            </p>
                                        </div>
                                        <Check size={14} className="text-text-green opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                                     </div>
                                </button>
                            ))}
                            {(!currentUser?.managedSites || currentUser.managedSites.length === 0) && (
                                <div className="text-center py-12 border border-dashed border-border-sub rounded-lg bg-bg-primary/50">
                                    <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest italic text-center">No verified sites on record for your organization</p>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                    <DialogFooter className="p-4 bg-bg-secondary/30 border-t border-border-default">
                        <Button variant="outline" className="w-full text-[10px] uppercase font-bold tracking-widest h-10" onClick={() => setIsSiteRegistryOpen(false)}>Close Registry</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function TicketList({ requests }: { requests: ServiceRequest[] }) {
    if (requests.length === 0) {
        return (
            <div className="p-24 text-center border-2 border-dashed border-border-sub rounded-2xl bg-bg-secondary/30 text-left">
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-center">No tickets found in this registry</p>
            </div>
        );
    }
    return (
        <div className="grid grid-cols-1 gap-4 text-left">
            {requests.map(ticket => (
                <Card key={ticket.id} className="bg-bg-secondary border-border-main hover:border-text-muted transition-all group">
                    <CardContent className="min-h-24 p-5 flex items-center justify-between text-left">
                        <div className="text-left space-y-1 flex-1">
                            <div className="flex items-center gap-2 text-left">
                                <span className="text-[9px] font-mono font-bold text-brand-red uppercase">{(ticket.id || '').toUpperCase()}</span>
                                <Badge variant={ticket.priority === 'critical' ? 'high' : 'medium'} className="text-[7px] h-3.5 px-1 uppercase">{ticket.priority}</Badge>
                            </div>
                            <h3 className="text-sm font-bold text-text-primary uppercase truncate max-w-[400px] text-left">{ticket.description}</h3>
                            <div className="flex items-center gap-4 text-[10px] text-text-muted font-bold uppercase tracking-widest text-left">
                                <span className="flex items-center gap-1.5"><MapPin size={10} className="text-brand-red"/> {ticket.location}</span>
                            </div>
                        </div>
                        <Badge variant={ticket.status === 'new' ? 'pending' : 'active'} className="uppercase h-6 px-4">{ticket.status}</Badge>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
