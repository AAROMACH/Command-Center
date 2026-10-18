import type { ServiceRequest } from '@/lib/types';
import { parseLocalDate } from '@/lib/jobs';
import { toDateSafe } from '@/lib/request-intake';

/**
 * When a client request came in. New requests store `createdAt` (ISO string or
 * Firestore Timestamp); older ones only have `submittedDate` (YYYY-MM-DD or
 * MM-DD-YYYY). Null when neither parses.
 */
export function requestDate(r: ServiceRequest): Date | null {
    const raw = r as ServiceRequest & { createdAt?: unknown };
    return toDateSafe(raw.createdAt) ?? parseLocalDate(r.submittedDate);
}

export function requestMillis(r: ServiceRequest): number {
    return requestDate(r)?.getTime() ?? 0;
}

export function formatRequestDate(r: ServiceRequest): string {
    const d = requestDate(r);
    return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date';
}

/** Request type for display (older docs use `category`). */
export function requestKind(r: ServiceRequest): string {
    return r.requestType || (r as ServiceRequest & { category?: string }).category || 'Request';
}
