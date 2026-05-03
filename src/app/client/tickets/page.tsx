'use client';

import { useState, useEffect, useMemo } from 'react';
import { serviceRequests, technicians } from '@/lib/data';
import type { ServiceRequest, Technician } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
    ClipboardList, 
    Plus, 
    Search,
    MapPin,
    Calendar,
    ChevronRight,
    AlertTriangle,
    Camera,
    FileText,
    X,
    Trash2,
    Check
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function ClientTicketsPage() {
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
    const { toast } = useToast();

    // Intake state
    const [images, setImages] = useState<string[]>([]);
    const [docs, setDocs] = useState<string[]>([]);

    useEffect(() => {
        setMounted(true);
        setCurrentUserId(localStorage.getItem('currentUserId'));
    }, []);

    const currentUser = useMemo(() => 
        currentUserId ? technicians.find(t => t.id === currentUserId) : null
    , [currentUserId]);

    const myRequests = useMemo(() => {
        if (!currentUser?.clientCompany) return [];
        return serviceRequests
            .filter(r => r.clientName === currentUser.clientCompany)
            .filter(r => 
                r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                r.location.toLowerCase().includes(searchQuery.toLowerCase())
            );
    }, [currentUser, searchQuery]);

    const handleCreateTicket = (e: React.FormEvent) => {
        e.preventDefault();
        toast({
            title: "Request Transmitted",
            description: "Service ticket has been added to the command intake queue.",
        });
        setIsNewTicketOpen(false);
        handleReset();
    };

    const handleReset = () => {
        setImages([]);
        setDocs([]);
    };

    const simulateUpload = (type: 'image' | 'doc') => {
        if (type === 'image') {
          if (images.length >= 3) {
            toast({ variant: "destructive", title: "Limit Reached", description: "Maximum 3 images allowed." });
            return;
          }
          setImages([...images, `https://picsum.photos/seed/${Date.now()}/400/300`]);
        } else {
          if (docs.length >= 2) {
            toast({ variant: "destructive", title: "Limit Reached", description: "Maximum 2 documents allowed." });
            return;
          }
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
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <ClipboardList size={12} />
                        Low Voltage Service Funnel
                    </p>
                    <h1 className="page-title">Support Tickets</h1>
                    <p className="page-subtitle">Submit service requests and track administrative review status.</p>
                </div>
                <div className="page-header-right">
                    <Button variant="default" onClick={() => setIsNewTicketOpen(true)}>
                        <Plus size={14} className="mr-2"/>
                        Create Ticket
                    </Button>
                </div>
            </header>

            <div className="mb-6 flex items-center justify-between">
                <div className="search-wrap">
                    <Search />
                    <input 
                        className="search-input" 
                        placeholder="Filter by ID, description, or location..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {myRequests.map(ticket => (
                    <Card key={ticket.id} className="bg-bg-secondary border-border-main hover:border-text-muted transition-all">
                        <CardContent className="p-5">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div className="space-y-2 flex-1">
                                    <div className="flex items-center gap-3">
                                        <span className="font-mono text-xs font-bold text-brand-red uppercase">ID: {ticket.id}</span>
                                        <Badge variant={ticket.priority === 'critical' || ticket.priority === 'high' ? 'high' : 'medium'}>
                                            {ticket.priority.toUpperCase()}
                                        </Badge>
                                        <Badge variant="outline" className="bg-bg-tertiary border-border-sub text-[9px] uppercase tracking-widest">
                                            {ticket.requestType}
                                        </Badge>
                                    </div>
                                    <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide">{ticket.description}</h3>
                                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                                        <div className="flex items-center gap-2 text-[10px] text-text-muted font-bold uppercase tracking-widest">
                                            <MapPin size={12} className="text-text-muted"/> {ticket.location}
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-text-muted font-bold uppercase tracking-widest">
                                            <Calendar size={12} className="text-text-muted"/> Submitted: {ticket.submittedDate}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-8 md:border-l md:border-border-sub md:pl-8">
                                    <div className="text-left md:text-right min-w-[120px]">
                                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] mb-1">Status</p>
                                        <Badge variant={ticket.status === 'new' ? 'pending' : ticket.status === 'approved' ? 'active' : 'onhold'} className="uppercase">
                                            {ticket.status}
                                        </Badge>
                                    </div>
                                    <Button variant="ghost" size="icon" className="text-text-muted hover:text-text-primary">
                                        <ChevronRight size={20} />
                                    </Button>
                                </div>
                            </div>

                            {ticket.status === 'reviewed' && (
                                <div className="mt-4 p-3 rounded bg-bg-tertiary border border-border-sub flex items-start gap-3">
                                    <AlertTriangle size={14} className="text-accent-gold shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold text-accent-gold uppercase tracking-widest">Admin Review Note</p>
                                        <p className="text-xs text-text-secondary leading-relaxed">
                                            Job pending technician availability check in {ticket.location}. Expected approval within 4 hours.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
                {myRequests.length === 0 && (
                    <div className="p-24 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30">
                        <ClipboardList size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted italic">Registry clear. No service tickets found.</p>
                    </div>
                )}
            </div>

            <Dialog open={isNewTicketOpen} onOpenChange={(open) => { if(!open) handleReset(); setIsNewTicketOpen(open); }}>
                <DialogContent className="sm:max-w-[650px] bg-bg-elevated border-border-default max-h-[90vh] overflow-y-auto p-0">
                    <DialogHeader className="p-6 pb-2">
                        <div className="flex items-center gap-2 mb-1">
                            <Plus className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">New Service Intake</DialogTitle>
                        </div>
                        <DialogDescription>Submit detailed job requirements for administrative audit and dispatch.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateTicket}>
                        <div className="px-6 py-4 space-y-6">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Issue Summary / Subject</Label>
                                <Input placeholder="e.g., Network Closet Cabling Failure" className="bg-bg-primary h-10 text-xs" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Request Type</Label>
                                    <Select defaultValue="Repair">
                                        <SelectTrigger className="bg-bg-primary h-10 text-xs uppercase font-bold tracking-wider"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Repair">Infrastructure Repair</SelectItem>
                                            <SelectItem value="Install">Low Voltage Install</SelectItem>
                                            <SelectItem value="Maintenance">Preventative Maintenance</SelectItem>
                                            <SelectItem value="Audit">Compliance Audit</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Priority Level</Label>
                                    <Select defaultValue="medium">
                                        <SelectTrigger className="bg-bg-primary h-10 text-xs uppercase font-bold tracking-wider"><SelectValue /></SelectTrigger>
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
                                    <Input placeholder="Select site or enter address..." className="bg-bg-primary h-10 text-xs pl-10" required />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Problem Description & Scope</Label>
                                <Textarea placeholder="Provide high-fidelity job details..." className="bg-bg-primary h-24 text-xs" required />
                            </div>

                            {/* ATTACHMENTS */}
                            <div className="space-y-4 border-t border-border-sub pt-4">
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                                            <Camera size={14} className="text-brand-red" />
                                            Visual Evidence (Max 3)
                                        </Label>
                                        <span className="text-[9px] font-mono text-text-muted">{images.length}/3</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        {images.map((img, i) => (
                                            <div key={i} className="relative aspect-video rounded border border-border-sub overflow-hidden group bg-bg-primary">
                                                <img src={img} alt={`Evidence ${i}`} className="w-full h-full object-cover" />
                                                <button 
                                                    type="button"
                                                    onClick={() => removeAttachment('image', i)}
                                                    className="absolute top-1 right-1 p-1 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <X size={10} />
                                                </button>
                                            </div>
                                        ))}
                                        {images.length < 3 && (
                                            <button 
                                                type="button"
                                                onClick={() => simulateUpload('image')}
                                                className="aspect-video rounded border-2 border-dashed border-border-sub hover:border-brand-red hover:bg-brand-red-dim/5 transition-all flex flex-col items-center justify-center gap-1 text-text-muted hover:text-brand-red"
                                            >
                                                <Plus size={16} />
                                                <span className="text-[8px] font-bold uppercase">Add Photo</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                                            <FileText size={14} className="text-accent-gold" />
                                            Technical Documentation (Max 2)
                                        </Label>
                                        <span className="text-[9px] font-mono text-text-muted">{docs.length}/2</span>
                                    </div>
                                    <div className="space-y-2">
                                        {docs.map((doc, i) => (
                                            <div key={i} className="flex items-center justify-between p-2.5 rounded bg-bg-primary border border-border-sub">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <FileText size={12} className="text-text-muted shrink-0" />
                                                    <span className="text-[10px] font-bold text-text-primary uppercase tracking-tight truncate">{doc}</span>
                                                </div>
                                                <button type="button" onClick={() => removeAttachment('doc', i)} className="text-text-muted hover:text-text-red ml-2">
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))}
                                        {docs.length < 2 && (
                                            <button 
                                                type="button"
                                                onClick={() => simulateUpload('doc')}
                                                className="w-full py-3 rounded border-2 border-dashed border-border-sub hover:border-accent-gold hover:bg-accent-gold-dim/5 transition-all flex items-center justify-center gap-2 text-text-muted hover:text-accent-gold"
                                            >
                                                <Plus size={14} />
                                                <span className="text-[9px] font-bold uppercase">Attach PDF / DOC</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="bg-bg-tertiary/50 p-6 border-t border-border-default mt-2">
                            <Button variant="outline" type="button" onClick={() => setIsNewTicketOpen(false)} className="h-10 px-8 uppercase font-bold text-[10px] tracking-widest">Abort Submission</Button>
                            <Button type="submit" className="bg-brand-red hover:bg-brand-red-hover px-10 uppercase font-bold text-[10px] tracking-widest h-10">
                                <Check size={16} className="mr-2" />
                                Transmit Request
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
