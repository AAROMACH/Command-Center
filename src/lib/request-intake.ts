// Request intake normalization layer.
//
// Actionable intake records live in `clientRequests`. Historically that
// collection accumulated two shapes (service tickets and client-intake /
// partnership applications) while the public service form wrote to a separate
// `serviceRequests` collection nobody read. Writers now stamp
// `requestCategory`, but old documents carry none of the new fields, use
// mixed status vocabularies ('new' vs 'pending_review', 'rejected' vs
// 'denied') and mixed date encodings (Firestore Timestamp vs ISO string).
// Everything that reads intake records should go through these helpers.

import { format } from 'date-fns';

export type RequestSource = 'app' | 'manual' | 'form';
export type RequestCategory =
  | 'service_ticket'
  | 'client_intake'
  | 'project_request'
  | 'quote_request'
  | 'general';
export type RequestStatus =
  | 'new'
  | 'pending_review'
  | 'approved'
  | 'denied'
  | 'converted'
  | 'archived'
  | 'closed';
export type RequestPriority = 'low' | 'medium' | 'high' | 'urgent';

export type GlobalRequest = {
  id: string;
  source: RequestSource;
  category: RequestCategory;
  status: RequestStatus;
  /** The unmapped status string stored on the document. */
  rawStatus: string;
  priority?: RequestPriority;
  displayName: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  title?: string;
  description?: string;
  locationText?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  // Linked records, when the originating workflow recorded them
  convertedId?: string;
  conversionType?: string;
  convertedClientId?: string;
  rawCollection: string;
  rawId: string;
  /** Full source document for detail rendering. */
  raw: Record<string, any>;
};

export const CATEGORY_LABELS: Record<RequestCategory, string> = {
  service_ticket: 'Service Ticket',
  client_intake: 'Client Intake',
  project_request: 'Project Request',
  quote_request: 'Quote Request',
  general: 'General',
};

export const STATUS_LABELS: Record<RequestStatus, string> = {
  new: 'New',
  pending_review: 'Pending Review',
  approved: 'Approved',
  denied: 'Denied',
  converted: 'Converted',
  archived: 'Archived',
  closed: 'Closed',
};

export const SOURCE_LABELS: Record<RequestSource, string> = {
  app: 'App',
  manual: 'Manual',
  form: 'Form',
};

// ── Dates ─────────────────────────────────────────────────────────────────

/** Accepts Firestore Timestamp, ISO string, epoch millis, or Date. */
export function toDateSafe(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && typeof (value as any).toDate === 'function') {
    try {
      const d = (value as any).toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    } catch { return null; }
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Render any stored date value; never throws, never renders "[object Object]". */
export function formatRequestDate(value: unknown, withTime = false): string {
  const d = toDateSafe(value);
  if (!d) return '—';
  try {
    return format(d, withTime ? 'MMM d, yyyy · h:mm a' : 'MMM d, yyyy');
  } catch { return '—'; }
}

/** Sortable millis for any stored date value (0 when missing/unparseable). */
export function dateMillis(value: unknown): number {
  return toDateSafe(value)?.getTime() ?? 0;
}

// ── Status / source / priority / category ─────────────────────────────────

export function normalizeRequestStatus(raw: unknown, doc?: Record<string, any>): RequestStatus {
  const s = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (s === 'new') return 'new';
  if (s === 'pending' || s === 'pending_review' || s === 'reviewed' || s === 'contacted' || s === 'needs_more_info') return 'pending_review';
  if (s === 'approved') return 'approved';
  if (s === 'denied' || s === 'rejected') return 'denied';
  if (s.startsWith('converted')) return 'converted';
  if (s === 'archived') return 'archived';
  if (s === 'closed') {
    // Dispatch conversion marks the ticket closed and stamps convertedId
    return doc && (doc.convertedId || doc.conversionType) ? 'converted' : 'closed';
  }
  return 'new';
}

export function normalizeRequestSource(raw: unknown): RequestSource {
  const s = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (s === 'app' || s === 'manual' || s === 'form') return s;
  if (s.includes('public') || s.includes('form')) return 'form';
  if (s.includes('manual') || s.includes('admin')) return 'manual';
  return 'app';
}

export function normalizeRequestPriority(raw: unknown): RequestPriority | undefined {
  const s = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (s === 'critical' || s === 'urgent') return 'urgent';
  if (s === 'high') return 'high';
  if (s === 'medium' || s === 'normal') return 'medium';
  if (s === 'low') return 'low';
  return undefined;
}

const CATEGORIES: RequestCategory[] = ['service_ticket', 'client_intake', 'project_request', 'quote_request', 'general'];

/** Category of a `clientRequests` document (new field first, then legacy shape). */
export function categorizeIntakeDoc(doc: Record<string, any>): RequestCategory {
  if (CATEGORIES.includes(doc.requestCategory)) return doc.requestCategory;
  const source = typeof doc.source === 'string' ? doc.source.toLowerCase() : '';
  if (
    doc.requestType === 'client_partnership_request'
    || source.includes('client_intake')
    || (!!doc.companyName && !!doc.primaryContactName && !doc.clientName)
  ) {
    return 'client_intake';
  }
  return 'service_ticket';
}

/** True when a `clientRequests` doc is a dispatchable service ticket (not intake etc.). */
export function isServiceTicketDoc(doc: Record<string, any>): boolean {
  return categorizeIntakeDoc(doc) === 'service_ticket';
}

// ── Document → GlobalRequest ──────────────────────────────────────────────

export function normalizeRequest(docData: Record<string, any>, id: string, collection: string): GlobalRequest {
  const doc = docData || {};
  const category = collection === 'serviceRequests' ? 'service_ticket' : categorizeIntakeDoc(doc);

  const contactName = doc.contactName || doc.primaryContactName || doc.fullName || undefined;
  const companyName = doc.companyName || undefined;
  const clientName = doc.clientName || undefined;
  const title = doc.title
    || (Array.isArray(doc.serviceTypes) && doc.serviceTypes[0])
    || (doc.requestType && doc.requestType !== 'client_partnership_request' ? doc.requestType : undefined)
    || undefined;

  return {
    id: `${collection}:${id}`,
    source: normalizeRequestSource(doc.source),
    category,
    status: normalizeRequestStatus(doc.status, doc),
    rawStatus: typeof doc.status === 'string' ? doc.status : '',
    priority: normalizeRequestPriority(doc.priority ?? doc.priorityLevel),
    displayName: title || companyName || clientName || contactName || 'Request',
    companyName,
    contactName: contactName || clientName,
    email: doc.email || undefined,
    phone: doc.phone || doc.phoneNumber || undefined,
    title,
    description: doc.description || doc.detailedDescription || doc.currentPainPoints || undefined,
    locationText: doc.location || doc.serviceLocation || undefined,
    createdAt: toDateSafe(doc.createdAt ?? doc.submittedDate) ?? undefined,
    updatedAt: toDateSafe(doc.updatedAt ?? doc.reviewedAt ?? doc.closedAt) ?? undefined,
    convertedId: doc.convertedId || undefined,
    conversionType: doc.conversionType || undefined,
    convertedClientId: doc.convertedClientId || undefined,
    rawCollection: collection,
    rawId: id,
    raw: doc,
  };
}
