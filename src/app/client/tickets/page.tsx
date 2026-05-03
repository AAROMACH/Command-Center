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
    AlertTriangle
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

export default function ClientTicketsPage() {
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
    const { toast } = useToast();

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

            <Dialog open={isNewTicketOpen} onOpenChange={setIsNewTicketOpen}>
                <DialogContent className="sm:max-w-[600px] bg-bg-elevated border-border-default">
                    <DialogHeader>
                        <div className="flex items-center gap-2 mb-1">
                            <Plus className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest">New Service Intake</DialogTitle>
                        </div>
                        <DialogDescription>Submit detailed job requirements for administrative audit and dispatch.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateTicket} className="space-y-6 py-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Issue Summary / Subject</Label>
                            <Input placeholder="e.g., Network Closet Cabling Failure" className="bg-bg-primary" required />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Request Type</Label>
                                <Select defaultValue="Repair">
                                    <SelectTrigger className="bg-bg-primary"><SelectValue /></SelectTrigger>
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
                                    <SelectTrigger className="bg-bg-primary"><SelectValue /></SelectTrigger>
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
                            <Input placeholder="Select site or enter address..." className="bg-bg-primary" required />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Problem Description & Scope</Label>
                            <Textarea placeholder="Provide high-fidelity job details..." className="bg-bg-primary h-24" required />
                        </div>
                        <DialogFooter className="bg-bg-tertiary/50 -mx-6 -mb-6 p-6 border-t border-border-default">
                            <Button variant="outline" type="button" onClick={() => setIsNewTicketOpen(false)}>Abort Submission</Button>
                            <Button type="submit" className="bg-brand-red hover:bg-brand-red-hover px-10">Transmit Request</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
