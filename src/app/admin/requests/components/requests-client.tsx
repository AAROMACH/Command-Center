'use client';

import type { ServiceRequest } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Hammer, MapPin, Check, X, Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';

type RequestsClientProps = {
    requests: ServiceRequest[];
};

export function RequestsClient({ requests }: RequestsClientProps) {
    const router = useRouter();

    if (requests.length === 0) {
        return (
            <div className="table-wrap">
                <div className="empty-state !py-12">
                    No requests found in this category.
                </div>
            </div>
        )
    }
    
    // A real app would use state management to update this
    const handleStatusChange = (id: string, status: ServiceRequest['status']) => {
        console.log(`Request ${id} status changed to ${status}`);
        // In a real app, you'd update the state and make an API call.
        alert(`Request ${id} has been ${status}.`);
    }

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
                                <p className="text-sm text-text-secondary">{req.description}</p>
                            </td>
                            <td>
                                <Badge variant="secondary" className="normal-case bg-bg-tertiary text-text-secondary">{req.requestType}</Badge>
                            </td>
                            <td>
                                <Badge variant={req.priority === 'critical' || req.priority === 'high' ? 'high' : req.priority === 'medium' ? 'medium' : 'low'} className="normal-case">{req.priority}</Badge>
                            </td>
                            <td>
                                <div className="cell-actions">
                                    {req.status === 'new' && (
                                        <Button variant="outline" size="sm" onClick={() => handleStatusChange(req.id, 'reviewed')}>
                                            <Eye size={14} className="mr-2"/> Review
                                        </Button>
                                    )}
                                     {req.status === 'reviewed' && (
                                        <>
                                        <Button variant="outline" size="sm" onClick={() => handleStatusChange(req.id, 'rejected')}>
                                            <X size={14} className="mr-2"/> Reject
                                        </Button>
                                        <Button size="sm" onClick={() => handleStatusChange(req.id, 'approved')}>
                                            <Check size={14} className="mr-2"/> Approve
                                        </Button>
                                        </>
                                    )}
                                     {req.status === 'approved' && (
                                        <Button size="sm" onClick={() => router.push('/admin/assignments')}>
                                            <Hammer size={14} className="mr-2"/> Convert to Job
                                        </Button>
                                    )}
                                    {(req.status === 'closed' || req.status === 'rejected') && (
                                        <span className="text-xs italic text-text-muted">No actions</span>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
