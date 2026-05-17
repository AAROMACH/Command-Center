'use client';

import { useState, useMemo, useEffect } from 'react';
import type { ServiceRequest } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  MapPin, 
  Check, 
  X, 
  Eye, 
  Briefcase, 
  ClipboardList, 
  AlertTriangle,
  ArrowRight,
  Wrench,
  Camera,
  FileText,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  Building2,
  LayoutDashboard
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type RequestsClientProps = {
    requests: ServiceRequest[];
};

export function RequestsClient({ requests }: RequestsClientProps) {
    const router = useRouter();
    const { toast } = useToast();
    const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
    const [isReviewOpen, setIsReviewOpen] = useState(false);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    useEffect(() => {
        setCurrentPage(1);
    }, [requests.length, itemsPerPage]);

    const totalPages = Math.ceil(requests.length / itemsPerPage);
    const paginatedRequests = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return requests.slice(start, start + itemsPerPage);
    }, [requests, currentPage, itemsPerPage]);

    const handleOpenReview = (req: ServiceRequest) => {
        setSelectedRequest(req);
        setIsReviewOpen(true);
    };

    const handleAction = (status: ServiceRequest['status'], destination?: string) => {
        if (!selectedRequest) return;
        
        const isProject = destination === '/admin/projects';
        const isDispatch = destination === '/admin/dispatch';
        
        const generatedId = isProject 
            ? `PROJ-${Math.floor(1000 + Math.random() * 9000)}` 
            : isDispatch 
                ? `WO-${Math.floor(100000 + Math.random() * 900000)}`
                : null;

        if (status === 'rejected') {
            toast({
                variant: "destructive",
                title: "Intake Terminated",
                description: `Request ${selectedRequest.id.toUpperCase()} has been rejected and archived.`,
            });
        } else {
            toast({
                title: isProject ? "Project Registry Initialized" : "Job Pool Dispatched",
                description: isProject 
                    ? `Registry entry created with Project ID: ${generatedId}`
                    : `Dispatched to unassigned pool with ID: ${generatedId}`,
            });
        }

        setIsReviewOpen(false);
        if (destination) {
            router.push(destination);
        }
    };

    if (requests.length === 0) {
        return (
            <div className="table-wrap">
                <div className="empty-state !py-24 text-center border-none">
                    <ClipboardList size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted italic">No missions match current intake filters.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="table-wrap">
                <table className="tbl">
                    <thead>
                        <tr className="bg-bg-tertiary">
                            <th style={{ width: "160px" }} className="text-center pl-0">Intake ID</th>
                            <th className="text-left pl-0">Tactical Briefing & Scope</th>
                            <th style={{ width: "220px" }} className="text-left pl-0">Site Coordinates</th>
                            <th style={{ width: "160px" }} className="text-center">Category</th>
                            <th style={{ width: "100px" }} className="text-center">Priority</th>
                            <th style={{ width: "100px" }} className="text-center"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedRequests.map((req) => (
                            <tr key={req.id} className="group hover:bg-bg-tertiary transition-colors cursor-pointer" onClick={() => handleOpenReview(req)}>
                                <td className="!py-4">
                                    <div className="flex flex-col items-center justify-center gap-1">
                                        <div className="font-mono text-[10px] font-bold text-brand-red uppercase">{req.id.toUpperCase()}</div>
                                        <p className="text-[8px] text-text-muted font-bold uppercase tracking-widest">{req.submittedDate}</p>
                                    </div>
                                </td>
                                <td className="!py-4 text-left pl-0">
                                    <div className="flex flex-col max-w-[450px]">
                                        <p className="text-xs font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors line-clamp-1">{req.description}</p>
                                        <div className="flex items-center gap-2 mt-1 text-[10px] text-text-muted font-bold uppercase tracking-widest">
                                            <Building2 size={10} />
                                            <span>{req.clientName}</span>
                                        </div>
                                    </div>
                                </td>
                                <td className="!py-4 text-left pl-0">
                                    <div className="flex items-center gap-2 text-[10px] text-text-secondary font-bold uppercase">
                                        <MapPin size={10} className="text-brand-red shrink-0" />
                                        <span className="truncate max-w-[180px]">{req.location}</span>
                                    </div>
                                </td>
                                <td className="!py-4">
                                    <div className="flex items-center justify-center">
                                        <Badge variant="outline" className="text-[8px] h-4 bg-bg-primary border-border-sub text-text-muted uppercase">
                                            {req.requestType}
                                        </Badge>
                                    </div>
                                </td>
                                <td className="!py-4">
                                    <div className="flex items-center justify-center">
                                        <Badge variant={req.priority === 'critical' || req.priority === 'high' ? 'high' : 'medium'} className="h-4 px-1.5 text-[8px] uppercase tracking-tighter">
                                            {req.priority}
                                        </Badge>
                                    </div>
                                </td>
                                <td className="!py-4">
                                    <div className="flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <ChevronRight size={16} className="text-text-muted" />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* PAGINATION FOOTER */}
                <div className="bg-bg-tertiary/50 px-4 py-3 flex items-center justify-between border-t border-border-sub">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Show</p>
                            <Select value={itemsPerPage.toString()} onValueChange={(v) => setItemsPerPage(parseInt(v))}>
                                <SelectTrigger className="h-7 w-[70px] bg-bg-primary text-[10px] font-bold border-border-sub">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="25">25</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                            Showing <span className="text-text-primary">{(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, requests.length)}</span> of {requests.length}
                        </p>
                    </div>
                    
                    <div className="flex items-center gap-1">
                        <Button 
                            variant="outline" 
                            size="icon-sm" 
                            disabled={currentPage === 1}
                            onClick={(e) => { e.stopPropagation(); setCurrentPage(prev => Math.max(1, prev - 1)); }}
                            className="h-7 w-7 border-border-sub bg-bg-primary"
                        >
                            <ChevronLeft size={14} />
                        </Button>
                        <div className="px-2 text-[10px] font-bold text-text-primary">Page {currentPage} of {totalPages}</div>
                        <Button 
                            variant="outline" 
                            size="icon-sm" 
                            disabled={currentPage === totalPages}
                            onClick={(e) => { e.stopPropagation(); setCurrentPage(prev => Math.min(totalPages, prev + 1)); }}
                            className="h-7 w-7 border-border-sub bg-bg-primary"
                        >
                            <ChevronRight size={14} />
                        </Button>
                    </div>
                </div>
            </div>

            {/* INTAKE AUDIT TERMINAL */}
            <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
                <DialogContent className="sm:max-w-[750px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[90vh] shadow-2xl">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30">
                        <div className="flex justify-between items-start">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <ClipboardList className="text-brand-red h-5 w-5" />
                                    <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Mission Intake Audit</DialogTitle>
                                </div>
                                <DialogDescription className="text-xs uppercase font-bold text-text-muted">Verification required for deployment path authorization.</DialogDescription>
                            </div>
                            <div className="text-right space-y-1">
                                <p className="text-[10px] font-black text-brand-red uppercase tracking-widest font-mono">{selectedRequest?.id.toUpperCase()}</p>
                                <p className="text-[8px] font-bold text-text-muted uppercase tracking-widest">Submitted: {selectedRequest?.submittedDate}</p>
                            </div>
                        </div>
                    </DialogHeader>

                    {selectedRequest && (
                        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
                            {/* SECTION 1: ENTITY & COORDINATES */}
                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                            <Building2 size={12}/> Client Entity
                                        </p>
                                        <div className="p-3 rounded-lg bg-bg-primary border border-border-sub">
                                            <p className="text-sm font-bold text-text-primary uppercase tracking-wide">{selectedRequest.clientName}</p>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                            <MapPin size={12}/> Site Coordinates
                                        </p>
                                        <div className="p-3 rounded-lg bg-bg-primary border border-border-sub flex items-center gap-2">
                                            <span className="text-xs font-bold text-text-primary uppercase">{selectedRequest.location}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                            <LayoutDashboard size={12}/> Technical Category
                                        </p>
                                        <div className="p-3 rounded-lg bg-bg-primary border border-border-sub">
                                            <Badge variant="outline" className="text-[10px] uppercase bg-bg-secondary">{selectedRequest.requestType}</Badge>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                            <AlertTriangle size={12}/> Deployment Priority
                                        </p>
                                        <div className="p-3 rounded-lg bg-bg-primary border border-border-sub">
                                            <Badge variant={selectedRequest.priority === 'critical' || selectedRequest.priority === 'high' ? 'high' : 'medium'} className="h-5 px-3 uppercase text-[10px]">
                                                {selectedRequest.priority}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* SECTION 2: SCOPE BRIEFING */}
                            <div className="space-y-3">
                                <p className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] border-b border-border-sub pb-2 px-1">Scope Briefing</p>
                                <div className="p-4 rounded-xl bg-bg-primary border border-border-sub italic text-sm text-text-secondary leading-relaxed uppercase font-medium">
                                    &quot;{selectedRequest.description}&quot;
                                </div>
                            </div>

                            {/* SECTION 3: VISUALS & ASSETS */}
                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <p className="text-[9px] font-black text-brand-red uppercase tracking-[0.2em] flex items-center justify-center gap-2">
                                        <Camera size={12}/> Visual Evidence
                                    </p>
                                    <div className="grid grid-cols-2 gap-3">
                                        {selectedRequest.imageUrls && selectedRequest.imageUrls.length > 0 ? selectedRequest.imageUrls.map((img, i) => (
                                            <div key={i} className="aspect-video rounded-lg border border-border-sub overflow-hidden relative bg-bg-primary">
                                                <img src={img} alt={`Evidence ${i}`} className="w-full h-full object-cover" />
                                            </div>
                                        )) : (
                                            <div className="col-span-2 py-8 rounded-lg border-2 border-dashed border-border-sub flex items-center justify-center text-[9px] text-text-muted uppercase font-bold tracking-widest italic opacity-40">No visuals attached</div>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <p className="text-[9px] font-black text-accent-gold uppercase tracking-[0.2em] flex items-center justify-center gap-2">
                                        <FileText size={12}/> Technical Assets
                                    </p>
                                    <div className="space-y-2">
                                        {selectedRequest.documentUrls && selectedRequest.documentUrls.length > 0 ? selectedRequest.documentUrls.map((doc, i) => (
                                            <div key={i} className="p-3 rounded-lg bg-bg-primary border border-border-sub flex items-center justify-between group hover:border-accent-gold transition-colors cursor-pointer">
                                                <span className="text-[10px] font-bold text-text-primary uppercase truncate">{doc}</span>
                                                <ExternalLink size={12} className="text-text-muted group-hover:text-accent-gold shrink-0" />
                                            </div>
                                        )) : (
                                            <div className="py-8 rounded-lg border-2 border-dashed border-border-sub flex items-center justify-center text-[9px] text-text-muted uppercase font-bold tracking-widest italic opacity-40">No assets attached</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="bg-bg-tertiary/50 p-6 border-t border-border-default flex flex-col md:flex-row items-end gap-6">
                        <Button variant="destructive-outline" onClick={() => handleAction('rejected')} className="h-11 px-8 uppercase font-bold text-[10px] tracking-[0.2em] shrink-0">
                            Reject Intake
                        </Button>
                        <div className="flex-1 w-full">
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted mb-3 text-center md:text-left">Authorize Deployment Path:</p>
                            <div className="grid grid-cols-2 gap-3">
                                <Button onClick={() => handleAction('approved', '/admin/dispatch')} className="h-11 text-[10px] uppercase font-bold tracking-[0.15em] bg-brand-red hover:bg-brand-red-hover shadow-lg">
                                    <Wrench size={16} className="mr-2" /> Dispatch as assignment
                                </Button>
                                <Button onClick={() => handleAction('approved', '/admin/projects')} variant="outline" className="h-11 text-[10px] uppercase font-bold tracking-[0.15em] border-accent-gold text-accent-gold hover:bg-accent-gold/10">
                                    <Briefcase size={16} className="mr-2" /> Convert to project
                                </Button>
                            </div>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
