'use client';

import { useState } from 'react';
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
  ExternalLink
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
        
        toast({
            title: `Request ${status === 'rejected' ? 'Rejected' : 'Processed'}`,
            description: `Request ${selectedRequest.id.toUpperCase()} has been moved to ${status}.`,
        });

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
                    {requests.map((req) => (
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
                                        <Button size="sm" variant="secondary" onClick={() => router.push('/admin/assignments')}>
                                            <ArrowRight size={14}/>
                                        </Button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

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
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Stakeholder / Client</p>
                                    <p className="text-sm font-bold text-text-primary uppercase tracking-wide">{selectedRequest.clientName}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Submission Date</p>
                                    <p className="text-sm font-mono text-text-primary">{selectedRequest.submittedDate}</p>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Site Location</p>
                                <div className="flex items-center gap-2 text-sm text-text-primary">
                                    <MapPin size={14} className="text-brand-red" />
                                    <span>{selectedRequest.location}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Service Category</p>
                                    <Badge variant="secondary" className="mt-1">{selectedRequest.requestType}</Badge>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Priority Level</p>
                                    <Badge variant={selectedRequest.priority === 'critical' || selectedRequest.priority === 'high' ? 'high' : 'medium'} className="mt-1 uppercase">
                                        {selectedRequest.priority}
                                    </Badge>
                                </div>
                            </div>

                            <Separator className="bg-border-sub" />

                            <div className="space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Job Scope & Description</p>
                                <div className="p-4 rounded bg-bg-primary border border-border-sub">
                                    <p className="text-sm text-text-secondary leading-relaxed">
                                        {selectedRequest.description}
                                    </p>
                                </div>
                            </div>

                            {/* ATTACHMENTS DISPLAY */}
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
                                    Audit required: Verify technician availability in {selectedRequest.location.split(',')[0]} before approving conversion to live job.
                                </p>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="bg-bg-tertiary/50 p-6 border-t border-border-default grid grid-cols-3 gap-2 mt-auto">
                        <Button variant="destructive-outline" onClick={() => handleAction('rejected')} className="h-11 text-[10px] uppercase font-bold tracking-widest">
                            <X size={14} className="mr-2" /> Reject
                        </Button>
                        <Button variant="outline" onClick={() => handleAction('approved', '/admin/assignments')} className="h-11 text-[10px] uppercase font-bold tracking-widest border-accent-gold text-accent-gold hover:bg-accent-gold/10">
                            <Wrench size={14} className="mr-2" /> Assign
                        </Button>
                        <Button onClick={() => handleAction('approved', '/admin/projects')} className="h-11 text-[10px] uppercase font-bold tracking-widest bg-brand-red hover:bg-brand-red-hover">
                            <Briefcase size={14} className="mr-2" /> Create Project
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}