
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
  ChevronRight
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

    // Reset pagination when data changes
    useEffect(() => {
        setCurrentPage(1);
    }, [requests.length, itemsPerPage]);

    const totalPages = Math.ceil(requests.length / itemsPerPage);
    const paginatedRequests = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return requests.slice(start, start + itemsPerPage);
    }, [requests, currentPage, itemsPerPage]);

    if (requests.length === 0) {
        return (
            <div className="table-wrap">
                <div className="empty-state !py-8 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted italic opacity-40">No requests found in this category.</p>
                </div>
            </div>
        )
    }
    
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

    return (
        <div className="table-wrap">
            <table className="tbl">
                <thead>
                    <tr className="bg-bg-tertiary/50">
                        <th style={{ width: "110px" }} className="!py-1.5 text-center">ID</th>
                        <th className="!py-1.5 text-center">Client & Site</th>
                        <th style={{ width: "40%" }} className="!py-1.5 text-center">Description</th>
                        <th style={{ width: "100px" }} className="!py-1.5 text-center">Category</th>
                        <th style={{ width: "80px" }} className="!py-1.5 text-center">Priority</th>
                        <th style={{ width: "100px" }} className="!py-1.5 text-center">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {paginatedRequests.map((req) => (
                        <tr key={req.id} className="group hover:bg-bg-tertiary/80 transition-colors">
                            <td className="!py-1">
                                <div className="flex flex-col items-center justify-center">
                                  <div className="cell-id !text-[10px]">{req.id.toUpperCase()}</div>
                                  <span className="text-[8px] font-bold text-text-muted uppercase tracking-tighter">{req.submittedDate}</span>
                                </div>
                            </td>
                            <td className="!py-1">
                                <div className="flex flex-col items-center justify-center text-center">
                                  <div className="font-bold text-text-primary text-[10px] uppercase tracking-tight truncate max-w-[150px]">{req.clientName}</div>
                                  <div className="flex items-center justify-center gap-1 text-[8px] text-text-muted font-bold truncate max-w-[150px]">
                                      <MapPin size={9} className="shrink-0" />
                                      <span className="truncate">{req.location}</span>
                                  </div>
                                </div>
                            </td>
                            <td className="!py-1">
                                <div className="flex items-center justify-center text-center px-4">
                                  <p className="text-[10px] text-text-secondary line-clamp-1 italic group-hover:text-text-primary transition-colors">{req.description}</p>
                                </div>
                            </td>
                            <td className="!py-1">
                                <div className="flex items-center justify-center">
                                  <Badge variant="outline" className="text-[7px] h-3.5 uppercase tracking-tighter bg-bg-tertiary border-border-sub text-text-muted">
                                      {req.requestType}
                                  </Badge>
                                </div>
                            </td>
                            <td className="!py-1 text-center">
                                <div className="flex items-center justify-center">
                                  <Badge variant={req.priority === 'critical' || req.priority === 'high' ? 'high' : req.priority === 'medium' ? 'medium' : 'low'} className="h-3.5 px-1.5 text-[7px] uppercase tracking-tighter">
                                      {req.priority}
                                  </Badge>
                                </div>
                            </td>
                            <td className="!py-1 text-center">
                                <div className="flex justify-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="icon-sm" className="h-6 w-6 text-text-muted hover:text-brand-red" onClick={() => handleOpenReview(req)}>
                                        <Eye size={12}/>
                                    </Button>
                                    {req.status === 'approved' && (
                                        <Button size="icon-sm" variant="secondary" className="h-6 w-6" onClick={() => router.push('/admin/dispatch')}>
                                            <ArrowRight size={12}/>
                                        </Button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* COMPACT PAGINATION FOOTER */}
            {requests.length > 0 && (
              <div className="bg-bg-tertiary/30 px-3 py-1.5 flex items-center justify-between border-t border-border-sub">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Show</p>
                    <Select value={itemsPerPage.toString()} onValueChange={(v) => setItemsPerPage(parseInt(v))}>
                      <SelectTrigger className="h-5 w-[55px] bg-bg-primary text-[8px] font-bold border-border-sub p-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10" className="text-[10px]">10</SelectItem>
                        <SelectItem value="25" className="text-[10px]">25</SelectItem>
                        <SelectItem value="50" className="text-[10px]">50</SelectItem>
                        <SelectItem value="100" className="text-[10px]">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">
                    <span className="text-text-primary">{(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, requests.length)}</span> / {requests.length}
                  </p>
                </div>
                
                <div className="flex items-center gap-1">
                  <Button 
                    variant="outline" 
                    size="icon-sm" 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="h-5 w-5 border-border-sub bg-bg-primary"
                  >
                    <ChevronLeft size={10} />
                  </Button>
                  <span className="text-[8px] font-bold text-text-muted px-1 uppercase tracking-tighter">P{currentPage} / {totalPages}</span>
                  <Button 
                    variant="outline" 
                    size="icon-sm" 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="h-5 w-5 border-border-sub bg-bg-primary"
                  >
                    <ChevronRight size={10} />
                  </Button>
                </div>
              </div>
            )}

            {/* COMPACT REVIEW DIALOG */}
            <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
                <DialogContent className="sm:max-w-[600px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[85vh]">
                    <DialogHeader className="p-4 pb-2 border-b border-border-sub bg-bg-tertiary/30">
                        <div className="flex items-center gap-2 mb-0.5">
                            <ClipboardList className="text-brand-red h-4 w-4" />
                            <DialogTitle className="text-sm font-bold uppercase tracking-widest text-text-primary">Intake Audit</DialogTitle>
                        </div>
                        <DialogDescription className="text-[10px] uppercase font-bold text-text-muted tracking-tight">Audit requirements for deployment path authorization.</DialogDescription>
                    </DialogHeader>

                    {selectedRequest && (
                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-0.5">
                                    <p className="text-[8px] font-black uppercase tracking-widest text-text-muted">CLIENT</p>
                                    <p className="text-xs font-bold text-text-primary uppercase">{selectedRequest.clientName}</p>
                                </div>
                                <div className="space-y-0.5 text-right">
                                    <p className="text-[8px] font-black uppercase tracking-widest text-text-muted">SUBMITTED</p>
                                    <p className="text-xs font-mono font-bold text-text-primary">{selectedRequest.submittedDate}</p>
                                </div>
                            </div>

                            <div className="space-y-0.5">
                                <p className="text-[8px] font-black uppercase tracking-widest text-text-muted">SITE COORDINATES</p>
                                <div className="flex items-center gap-1.5 text-xs text-text-primary">
                                    <MapPin size={12} className="text-brand-red" />
                                    <span className="font-bold">{selectedRequest.location}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 bg-bg-primary/40 p-2.5 rounded border border-border-sub">
                                <div>
                                    <p className="text-[8px] font-black uppercase tracking-widest text-text-muted mb-1">SERVICE TYPE</p>
                                    <Badge variant="outline" className="text-[9px] uppercase tracking-tighter bg-bg-tertiary">{selectedRequest.requestType}</Badge>
                                </div>
                                <div className="text-right">
                                    <p className="text-[8px] font-black uppercase tracking-widest text-text-muted mb-1">PRIORITY</p>
                                    <Badge variant={selectedRequest.priority === 'critical' || selectedRequest.priority === 'high' ? 'high' : 'medium'} className="text-[9px] uppercase tracking-tighter">
                                        {selectedRequest.priority}
                                    </Badge>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <p className="text-[8px] font-black uppercase tracking-widest text-text-muted">SCOPE BRIEFING</p>
                                <div className="p-3 rounded bg-bg-primary border border-border-sub">
                                    <p className="text-[11px] text-text-secondary leading-relaxed italic">
                                        &quot;{selectedRequest.description}&quot;
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2 text-center">
                                    <p className="text-[8px] font-black uppercase tracking-widest text-text-muted flex items-center justify-center gap-1.5">
                                        <Camera size={10} className="text-brand-red" /> VISUALS
                                    </p>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {selectedRequest.imageUrls && selectedRequest.imageUrls.length > 0 ? selectedRequest.imageUrls.map((img, i) => (
                                            <div key={i} className="aspect-square rounded border border-border-sub overflow-hidden relative group">
                                                <img src={img} alt={`Evidence ${i}`} className="w-full h-full object-cover" />
                                            </div>
                                        )) : (
                                            <div className="col-span-2 py-4 rounded border border-dashed border-border-sub flex items-center justify-center text-[8px] text-text-muted uppercase font-bold">N/A</div>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-2 text-center">
                                    <p className="text-[8px] font-black uppercase tracking-widest text-text-muted flex items-center justify-center gap-1.5">
                                        <FileText size={10} className="text-accent-gold" /> ASSETS
                                    </p>
                                    <div className="space-y-1.5">
                                        {selectedRequest.documentUrls && selectedRequest.documentUrls.length > 0 ? selectedRequest.documentUrls.map((doc, i) => (
                                            <div key={i} className="p-1.5 rounded bg-bg-primary border border-border-sub flex items-center justify-between group hover:border-accent-gold transition-colors">
                                                <span className="text-[9px] font-bold text-text-primary uppercase truncate">{doc}</span>
                                                <ExternalLink size={10} className="text-text-muted shrink-0" />
                                            </div>
                                        )) : (
                                            <div className="py-4 rounded border border-dashed border-border-sub flex items-center justify-center text-[8px] text-text-muted uppercase font-bold">N/A</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="bg-bg-tertiary/50 p-4 border-t border-border-default grid grid-cols-3 gap-2">
                        <Button variant="destructive-outline" onClick={() => handleAction('rejected')} className="h-9 text-[9px] uppercase font-bold tracking-widest">
                            Reject
                        </Button>
                        <Button onClick={handleAction('approved', '/admin/dispatch')} className="h-9 text-[9px] uppercase font-bold tracking-widest bg-brand-red hover:bg-brand-red-hover">
                            Assign
                        </Button>
                        <Button variant="outline" onClick={() => handleAction('approved', '/admin/projects')} className="h-9 text-[9px] uppercase font-bold tracking-widest border-accent-gold text-accent-gold hover:bg-accent-gold/10">
                            Project
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
