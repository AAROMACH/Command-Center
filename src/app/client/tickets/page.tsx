'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, addDoc, doc } from 'firebase/firestore';
import type { ServiceRequest, Technician } from '@/lib/types';
import { technicians } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
    ChevronRight
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type SortOption = 'newest' | 'oldest' | 'priority' | 'type';

export default function ClientTicketsPage() {
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [allRequests, setAllRequests] = useState<ServiceRequest[]>([]);
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<SortOption>('newest');
    const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
    
    // Intake state
    const [images, setImages] = useState<string[]>([]);
    const [docs, setDocs] = useState<string[]>([]);

    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
        const userId = localStorage.getItem('currentUserId');
        setCurrentUserId(userId);

        if (userId) {
            const unsubUser = onSnapshot(doc(db, 'users', userId), (d) => {
                if (d.exists()) {
                    const techData = { ...d.data(), id: d.id } as Technician;
                    setCurrentUser(techData);
                    
                    if (techData.clientCompany) {
                        const unsubReq = onSnapshot(query(collection(db, 'clientRequests'), where('clientName', '==', techData.clientCompany)), (snap) => {
                            setAllRequests(snap.docs.map(rd => ({ ...rd.data(), id: rd.id } as ServiceRequest)));
                        });
                        return () => unsubReq();
                    }
                }
            });
            return () => unsubUser();
        }
    }, []);

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
                return prio[a.priority] - prio[b.priority];
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
            imageUrls: images,
            documentUrls: docs
        };

        try {
            await addDoc(collection(db, 'clientRequests'), newTicket);
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
        setImages([]);
        setDocs([]);
    };

    const simulateUpload = (type: 'image' | 'doc') => {
        if (type === 'image') {
          if (images.length >= 3) return;
          setImages([...images, `https://picsum.photos/seed/${Date.now()}/400/300`]);
        } else {
          if (docs.length >= 2) return;
          setDocs([...docs, `Blueprint_Revision_${docs.length + 1}.pdf`]);
        }
    };

    const removeAttachment = (type: 'image' | 'doc', index: number) => {
        if (type === 'image') {
            setImages(images.filter((_, i) => i !== index));
        } else {
            setDocs(docs.filter((_, i) => i !== index));
        }
    };

    if (!mounted || !currentUserId) return null;

    return (
        <div className="space-y-8">
            <header className="page-header">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <ClipboardList size={12} />
                        Low Voltage Service Funnel
                    </p>
                    <h1 className="page-title">Support Tickets</h1>
                    <p className="page-subtitle">Submit service requests and track administrative review status.</p>
                </div>
                <div className="page-header-right">
                    <Button variant="default" onClick={() => setIsNewTicketOpen(true)} className="h-10 px-6 font-bold uppercase tracking-widest">
                        <Plus size={16} className="mr-2"/>
                        Create Ticket
                    </Button>
                </div>
            </header>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-bg-secondary rounded-xl border border-border-sub shadow-sm">
                <div className="search-wrap flex-1 !mb-0 w-full md:w-auto">
                    <Search className="h-4 w-4 text-text-muted" />
                    <input 
                        className="search-input !h-10 !text-xs font-bold uppercase !w-full bg-bg-primary" 
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

            <Tabs defaultValue="requested" className="w-full">
                <TabsList className="tabs !bg-bg-tertiary p-0 h-10 mb-8">
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
                        <div className="flex items-center gap-2 mb-1">
                            <Plus className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">New Service Intake</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs uppercase font-bold text-text-muted">Submit detailed job requirements for administrative audit and dispatch.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateTicket}>
                        <div className="px-6 py-4 space-y-6 text-left">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Issue Summary / Subject</Label>
                                <Input name="description" placeholder="e.g., Network Closet Cabling Failure" className="bg-bg-primary h-11 text-xs" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Request Type</Label>
                                    <Select name="type" defaultValue="Repair">
                                        <SelectTrigger className="bg-bg-primary h-11 text-xs uppercase font-bold tracking-wider"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Repair">Infrastructure Repair</SelectItem>
                                            <SelectItem value="Installation">Low Voltage Install</SelectItem>
                                            <SelectItem value="Maintenance">Preventative Maintenance</SelectItem>
                                            <SelectItem value="Survey">Site Survey</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Priority Level</Label>
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
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Site Location / Coordinates</Label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                                    <Input name="location" placeholder="Full address or site identifier..." className="bg-bg-primary h-11 text-xs pl-10" required />
                                </div>
                            </div>

                            <div className="space-y-3 pt-4 border-t border-border-sub">
                                <div className="flex items-center justify-between">
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                                        <Camera size={14} className="text-brand-red" /> Site Evidence (Max 3)
                                    </Label>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    {images.map((img, i) => (
                                        <div key={i} className="relative aspect-video rounded-lg border border-border-sub overflow-hidden group bg-bg-primary">
                                            <img src={img} alt={`Evidence ${i}`} className="w-full h-full object-cover" />
                                            <button type="button" onClick={() => removeAttachment('image', i)} className="absolute top-1 right-1 p-1 bg-black/60 rounded-full text-white"><X size={10} /></button>
                                        </div>
                                    ))}
                                    {images.length < 3 && (
                                        <button type="button" onClick={() => simulateUpload('image')} className="aspect-video rounded-lg border-2 border-dashed border-border-sub flex items-center justify-center text-text-muted hover:border-brand-red">
                                            <Plus size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default mt-2">
                            <Button variant="outline" type="button" onClick={() => setIsNewTicketOpen(false)}>Cancel Submission</Button>
                            <Button type="submit" className="bg-brand-red hover:bg-brand-red-hover px-10">Transmit Request</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function TicketList({ requests }: { requests: ServiceRequest[] }) {
    if (requests.length === 0) {
        return (
            <div className="p-24 text-center border-2 border-dashed border-border-sub rounded-2xl bg-bg-secondary/30">
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">No tickets found in this registry</p>
            </div>
        );
    }
    return (
        <div className="grid grid-cols-1 gap-4">
            {requests.map(ticket => (
                <Card key={ticket.id} className="bg-bg-secondary border-border-main hover:border-text-muted transition-all group">
                    <CardContent className="p-5 flex items-center justify-between">
                        <div className="text-left space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] font-mono font-bold text-brand-red uppercase">{ticket.id.toUpperCase()}</span>
                                <Badge variant={ticket.priority === 'critical' ? 'high' : 'medium'} className="text-[7px] h-3.5 px-1 uppercase">{ticket.priority}</Badge>
                            </div>
                            <h3 className="text-sm font-bold text-text-primary uppercase truncate max-w-[400px]">{ticket.description}</h3>
                            <div className="flex items-center gap-4 text-[10px] text-text-muted font-bold uppercase tracking-widest">
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
