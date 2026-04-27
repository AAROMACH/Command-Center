'use client';

import type { ServiceRequest } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Hammer, MapPin } from 'lucide-react';
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

    return (
        <div className="table-wrap">
            <table className="tbl">
                <thead>
                    <tr>
                        <th style={{ width: "140px" }}>Request ID</th>
                        <th>Client & Location</th>
                        <th style={{ width: "40%" }}>Description</th>
                        <th style={{ width: "160px" }}>Request Type</th>
                        <th style={{ width: "140px" }}>Actions</th>
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
                                <div className="cell-actions">
                                    {req.status === 'new' && (
                                        <>
                                        <Button variant="outline" size="sm">
                                            <FileText size={14} className="mr-2"/> Quote
                                        </Button>
                                        <Button variant="default" size="sm">
                                            <Hammer size={14} className="mr-2"/> Create Job
                                        </Button>
                                        </>
                                    )}
                                     {req.status === 'quoted' && (
                                        <Button variant="default" size="sm">
                                            <Hammer size={14} className="mr-2"/> Create Job
                                        </Button>
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
