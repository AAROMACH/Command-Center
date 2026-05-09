
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
                <div className="empty-state !py-12">
                    No requests found in this category.
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
        
        // Simulate ID generation as per tactical requirements
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
                    <tr>
                        <th style={{ width: "140px" }}>Request ID</th>
                        <th>Client & Location</th>
                        <th style={{ width: "35%" }}>Description</th>
                        <th style={{ width: "130px" }}>Request Type</th>
                        <th style={{ width: "110px" }}>Priority</th>
                        <th style={{ width: "200px" }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {paginatedRequests.map((req) => (
                        <tr key={req.id}>
                            <td>
                                <div className="cell-id">{req.id.toUpperCase()}</div>
                                <span className="text-xs text-text-muted">{req.submittedDate}</span>
                            </td>
                            <td>
                                <div className="font-semibold text-text-primary text-sm mb-1">{req.clientName}</div>
                                <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                                    <MapPin className="h-3.5 w-3.5 text-text-muted" />
                                    <span>{req.location}</span>
                                </div>
                            </td>
                            <td>
                                <p className="text-sm text-text-secondary line-clamp-1">{req.description}</p>
                            </td>
                            <td>
                                <Badge variant="secondary" className="normal-case bg-bg-tertiary text-text-secondary">{req.requestType}</Badge>
                            </td>
                            <td>
                                <Badge variant={req.priority === 'critical' || req.priority === 'high' ? 'high' : req.priority === 'medium' ? 'medium' : 'low'} className="normal-case">{req.priority}</Badge>
                            </td>
                            <td>
                                <div className="cell-actions">
                                    <Button variant="outline" size="sm" onClick={() => handleOpenReview(req)}>
                                        <Eye size={14} className="mr-2"/> Review
                                    </Button>
                                    {req.status === 'approved' && (
                                        <Button size="sm" variant="secondary" onClick={() => router.push('/admin/dispatch')}>
                                            <ArrowRight size={14}/>
                                        </Button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* REGISTRY PAGINATION CONTROLS */}
            {requests.length > 0 && (
              <div className="bg-bg-tertiary/50 px-4 py-3 flex items-center justify-between border-t border-border-sub">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Show</p>
                    <Select value={itemsPerPage.toString()} onValueChange={(v) => setItemsPerPage(parseInt(v))}>
                      <SelectTrigger className="h-7 w-[70px] bg-bg-primary text-[10px] font-bold border-border-sub">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                    Showing <span className="text-text-primary">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-text-primary">{Math.min(currentPage * itemsPerPage, requests.length)}</span> of <span className="text-text-primary">{requests.length}</span> entries
                  </p>
                </div>
                
                <div className="flex items-center gap-1">
                  <Button 
                    variant="outline" 
                    size="icon-sm" 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="h-7 w-7 border-border-sub bg-bg-primary"
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  <div className="flex items-center gap-1 px-2">
                    <span className="text-[10px] font-bold text-text-primary">Page {currentPage}</span>
                    <span className="text-[10px] font-bold text-text-muted">of {totalPages}</span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="icon-sm" 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="h-7 w-7 border-border-sub bg-bg-primary"
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}

            <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
                <DialogContent className="sm:max-w-[700px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[90vh]">
                    <DialogHeader className="p-6 pb-2">
                        <div className="flex items-center gap-2 mb-1">
                            <ClipboardList className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Job Intake Audit</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs">Review stakeholder requirements and authorize deployment path.</DialogDescription>
                    </DialogHeader>

                    {selectedRequest && (
                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">STAKEHOLDER / CLIENT</p>
                                    <p className="text-sm font-bold text-text-primary uppercase tracking-wide">{selectedRequest.clientName}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">SUBMISSION DATE</p>
                                    <p className="text-sm font-mono text-text-primary">{selectedRequest.submittedDate}</p>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">SITE LOCATION</p>
                                <div className="flex items-center gap-2 text-sm text-text-primary">
                                    <MapPin size={14} className="text-brand-red" />
                                    <span>{selectedRequest.location}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">SERVICE CATEGORY</p>
                                    <Badge variant="secondary" className="mt-1">{selectedRequest.requestType}</Badge>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">PRIORITY LEVEL</p>
                                    <Badge variant={selectedRequest.priority === 'critical' || selectedRequest.priority === 'high' ? 'high' : 'medium'} className="mt-1 uppercase">
                                        {selectedRequest.priority}
                                    </Badge>
                                </div>
                            </div>

                            <Separator className="bg-border-sub" />

                            <div className="space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">JOB SCOPE & DESCRIPTION</p>
                                <div className="p-4 rounded bg-bg-primary border border-border-sub">
                                    <p className="text-sm text-text-secondary leading-relaxed">
                                        {selectedRequest.description}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                                <div className="space-y-3">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                                        <Camera size={14} className="text-brand-red" />
                                        Evidence Imagery
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {selectedRequest.imageUrls && selectedRequest.imageUrls.length > 0 ? selectedRequest.imageUrls.map((img, i) => (
                                            <div key={i} className="aspect-video rounded border border-border-sub overflow-hidden relative group">
                                                <img src={img} alt={`Evidence ${i}`} className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer">
                                                    <ExternalLink size={14} className="text-white" />
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="col-span-2 py-8 rounded border border-dashed border-border-sub flex items-center justify-center text-[10px] text-text-muted uppercase font-bold">
                                                No visual evidence provided
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                                        <FileText size={14} className="text-accent-gold" />
                                        Project Documentation
                                    </p>
                                    <div className="space-y-2">
                                        {selectedRequest.documentUrls && selectedRequest.documentUrls.length > 0 ? selectedRequest.documentUrls.map((doc, i) => (
                                            <div key={i} className="p-2 rounded bg-bg-primary border border-border-sub flex items-center justify-between group hover:border-accent-gold transition-colors">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <FileText size={12} className="text-text-muted shrink-0" />
                                                    <span className="text-[10px] font-bold text-text-primary uppercase truncate">{doc}</span>
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-text-muted group-hover:text-accent-gold">
                                                    <ExternalLink size={12} />
                                                </Button>
                                            </div>
                                        )) : (
                                            <div className="py-8 rounded border border-dashed border-border-sub flex items-center justify-center text-[10px] text-text-muted uppercase font-bold">
                                                No documentation attached
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="p-3 rounded bg-brand-red-dim/10 border border-brand-red/20 flex items-start gap-3">
                                <AlertTriangle size={14} className="text-brand-red shrink-0 mt-0.5" />
                                <p className="text-[10px] text-text-secondary leading-normal font-bold uppercase tracking-tight">
                                    Audit required: Verify technician availability before approving conversion to live job.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="px-6 py-2 bg-bg-tertiary/20">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Convert to a(n):</p>
                    </div>

                    <DialogFooter className="bg-bg-tertiary/50 p-6 border-t border-border-default grid grid-cols-3 gap-2 mt-auto">
                        <Button variant="destructive-outline" onClick={() => handleAction('rejected')} className="h-11 text-[10px] uppercase font-bold tracking-widest">
                            <X size={14} className="mr-2" /> Reject
                        </Button>
                        <Button onClick={handleAction('approved', '/admin/dispatch')} className="h-11 text-[10px] uppercase font-bold tracking-widest bg-brand-red hover:bg-brand-red-hover">
                            <Wrench size={14} className="mr-2" /> Assignment
                        </Button>
                        <Button variant="outline" onClick={() => handleAction('approved', '/admin/projects')} className="h-11 text-[10px] uppercase font-bold tracking-widest border-accent-gold text-accent-gold hover:bg-accent-gold/10">
                            <Briefcase size={14} className="mr-2" /> Project
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
