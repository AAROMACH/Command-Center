'use client';

import { useState } from 'react';
import type { ServiceRequest } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  FileText, 
  Hammer, 
  MapPin, 
  Check, 
  X, 
  Eye, 
  Briefcase, 
  Calendar, 
  ClipboardList, 
  AlertTriangle,
  ArrowRight
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
                <DialogContent className="sm:max-w-[600px] bg-bg-elevated border-border-default">
                    <DialogHeader>
                        <div className="flex items-center gap-2 mb-1">
                            <ClipboardList className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest">Job Intake Audit</DialogTitle>
                        </div>
                        <DialogDescription>Review stakeholder requirements and authorize deployment path.</DialogDescription>
                    </DialogHeader>

                    {selectedRequest && (
                        <div className="py-4 space-y-6">
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

                            <div className="p-3 rounded bg-brand-red-dim/10 border border-brand-red/20 flex items-start gap-3">
                                <AlertTriangle size={14} className="text-brand-red shrink-0 mt-0.5" />
                                <p className="text-[10px] text-text-secondary leading-normal font-bold uppercase tracking-tight">
                                    Audit required: Verify technician availability in {selectedRequest.location.split(',')[0]} before approving conversion to live job.
                                </p>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="bg-bg-tertiary/50 -mx-6 -mb-6 p-6 border-t border-border-default grid grid-cols-3 gap-2">
                        <Button variant="destructive-outline" onClick={() => handleAction('rejected')} className="h-10 text-[10px]">
                            <X size={14} className="mr-2" /> Reject
                        </Button>
                        <Button variant="outline" onClick={() => handleAction('approved', '/admin/assignments')} className="h-10 text-[10px] border-accent-gold text-accent-gold hover:bg-accent-gold/10">
                            <Hammer size={14} className="mr-2" /> Service Job
                        </Button>
                        <Button onClick={() => handleAction('approved', '/admin/projects')} className="h-10 text-[10px] bg-brand-red hover:bg-brand-red-hover">
                            <Briefcase size={14} className="mr-2" /> Project Path
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
