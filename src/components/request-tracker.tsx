'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, doc, onSnapshot, query, where, type QueryConstraint } from 'firebase/firestore';
import { Check, ChevronDown, ChevronUp, Circle, XCircle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { buildRequestTrack, type RequestTrack, type TrackerLinks } from '@/lib/request-tracker';
import type { Invoice, Project, Quote, ServiceRequest, WorkOrder } from '@/lib/types';

/**
 * Live links for a request's tracker: its quote, project or job, and invoice.
 * Clients pass their company so every query carries the filter the security
 * rules check (a client may only read their own company's records).
 */
export function useRequestLinks(req: ServiceRequest | null, company?: string | null): TrackerLinks {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [asmt, setAsmt] = useState<WorkOrder | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const scoped = (...c: QueryConstraint[]) => (company ? [...c, where('clientName', '==', company)] : c);

  const quoteId = req?.quoteId || null;
  useEffect(() => {
    if (!quoteId) { setQuote(null); return; }
    return onSnapshot(doc(db, 'quotes', quoteId), s => setQuote(s.exists() ? ({ ...s.data(), id: s.id } as Quote) : null), () => setQuote(null));
  }, [quoteId]);

  const projectId = (req?.conversionType === 'project' && req.convertedId) || quote?.convertedToProjectId || null;
  useEffect(() => {
    if (!projectId || projectId.startsWith('project-')) { setProject(null); return; } // 'project-<time>' = old placeholder ref
    return onSnapshot(doc(db, 'projects', projectId), s => setProject(s.exists() ? ({ ...s.data(), id: s.id } as Project) : null), () => setProject(null));
  }, [projectId]);

  // A job starts in the pool (workOrders) and moves to assignments when a
  // tech is assigned, under a new id that remembers the pool id.
  const woId = req?.conversionType === 'assignment' ? req.convertedId || null : null;
  useEffect(() => {
    if (!woId) { setWo(null); setAsmt(null); return; }
    const u1 = onSnapshot(doc(db, 'workOrders', woId), s => setWo(s.exists() ? ({ ...s.data(), id: s.id } as WorkOrder) : null), () => setWo(null));
    const u2 = onSnapshot(query(collection(db, 'assignments'), ...scoped(where('workOrderId', '==', woId))),
      s => setAsmt(s.docs[0] ? ({ ...s.docs[0].data(), id: s.docs[0].id } as WorkOrder) : null), () => setAsmt(null));
    return () => { u1(); u2(); };
  }, [woId, company]); // eslint-disable-line react-hooks/exhaustive-deps
  const job = asmt || wo;

  const invField = project ? 'projectId' : job ? 'workOrderId' : null;
  const invValue = project?.id || job?.id || null;
  useEffect(() => {
    if (!invField || !invValue) { setInvoice(null); return; }
    return onSnapshot(query(collection(db, 'invoices'), ...scoped(where(invField, '==', invValue))), s => {
      const live = s.docs.map(d => ({ ...d.data(), id: d.id } as Invoice)).filter(i => i.status !== 'void')
        .sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
      setInvoice(live[0] || null);
    }, () => setInvoice(null));
  }, [invField, invValue, company]); // eslint-disable-line react-hooks/exhaustive-deps

  return { quote, project, job, invoice };
}

export function useRequestTrack(req: ServiceRequest | null, company?: string | null): RequestTrack | null {
  const links = useRequestLinks(req, company);
  return useMemo(() => (req ? buildRequestTrack(req, links) : null), [req, links.quote, links.project, links.job, links.invoice]); // eslint-disable-line react-hooks/exhaustive-deps
}

const when = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (isNaN(d.getTime())) return null;
  return iso.length === 10
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/** Wording for who's looking: the client sees "you", staff see "client". */
const CLIENT_LABEL: Record<string, string> = {};
const STAFF_LABEL: Record<string, string> = { client_ok: 'Client approved the quote' };
const waiting = (w: 'you' | 'us' | undefined, audience: 'client' | 'staff') =>
  !w ? null : w === 'you' ? (audience === 'client' ? 'Waiting on you' : 'Waiting on client') : (audience === 'client' ? 'With our team' : 'With us');

/** One-line bar for lists: progress, the current stage and who it's waiting on. */
export function RequestTrackerBar({ track, audience }: { track: RequestTrack; audience: 'client' | 'staff' }) {
  const labels = audience === 'client' ? CLIENT_LABEL : STAFF_LABEL;
  const cur = track.current;
  return (
    <div className="space-y-1">
      <div className="h-2 rounded-full bg-bg-tertiary overflow-hidden" role="progressbar" aria-valuenow={track.pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn('h-full rounded-full transition-all duration-700', track.declined ? 'bg-text-red' : track.pct >= 100 ? 'bg-text-green' : 'bg-brand-red')}
          style={{ width: `${Math.max(4, track.pct)}%` }} />
      </div>
      <p className="text-[12px] text-text-muted flex flex-wrap items-center gap-x-2">
        {track.declined ? <span className="font-semibold text-text-red">Declined</span>
          : track.pct >= 100 ? <span className="font-semibold text-text-green">Complete — paid</span>
          : cur ? <>
            <span className="font-semibold text-text-primary">Next: {labels[cur.key] || cur.label}</span>
            {waiting(cur.waitingOn, audience) && <span className={cn(cur.waitingOn === 'you' && 'text-accent-gold font-semibold')}>· {waiting(cur.waitingOn, audience)}</span>}
          </> : null}
        <span className="ml-auto font-mono">{track.pct}%</span>
      </p>
    </div>
  );
}

/** Full tracker: the bar plus every stage with its time, detail and next step. */
export function RequestTracker({ track, audience, collapsible = false }: { track: RequestTrack; audience: 'client' | 'staff'; collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible);
  const labels = audience === 'client' ? CLIENT_LABEL : STAFF_LABEL;
  return (
    <div className="space-y-3">
      <RequestTrackerBar track={track} audience={audience} />
      {track.declined && (
        <p className="text-[12px] text-text-red flex items-start gap-1.5"><XCircle size={14} className="shrink-0 mt-0.5" /> {track.declined.reason}</p>
      )}
      {collapsible && (
        <button type="button" onClick={() => setOpen(o => !o)} className="text-[12px] font-medium text-text-secondary hover:text-text-primary flex items-center gap-1">
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {open ? 'Hide' : 'Show'} every step
        </button>
      )}
      {open && (
        <ol className="relative space-y-0">
          {track.stages.map((s, i) => {
            const last = i === track.stages.length - 1;
            const action = audience === 'client' && s.state === 'current'
              ? s.key === 'client_ok' ? { href: '/client/quotes', text: 'Review the quote' }
              : s.key === 'paid' ? { href: '/client/financials', text: 'View the invoice' } : null
              : null;
            return (
              <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
                {!last && <span aria-hidden className={cn('absolute left-[11px] top-6 bottom-0 w-0.5', s.state === 'done' ? 'bg-text-green/60' : 'bg-border-sub')} />}
                <span className={cn('relative z-10 mt-0.5 h-6 w-6 shrink-0 rounded-full flex items-center justify-center border-2',
                  s.state === 'done' ? 'border-text-green bg-text-green text-white'
                    : s.state === 'current' ? 'border-brand-red bg-bg-elevated text-brand-red'
                    : s.state === 'stopped' ? 'border-text-red bg-bg-elevated text-text-red'
                    : 'border-border-main bg-bg-elevated text-text-muted')}>
                  {s.state === 'done' ? <Check size={13} strokeWidth={3} /> : s.state === 'stopped' ? <XCircle size={13} />
                    : <Circle size={7} className={cn(s.state === 'current' && 'fill-current animate-pulse')} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className={cn('text-[13px] font-semibold', s.state === 'upcoming' ? 'text-text-muted' : 'text-text-primary')}>{labels[s.key] || s.label}</p>
                    {s.state === 'done' && when(s.at) && <span className="text-[11px] font-mono text-text-muted">{when(s.at)}</span>}
                  </div>
                  {s.detail && s.state !== 'upcoming' && <p className="text-[12px] text-text-muted">{s.detail}</p>}
                  {s.state === 'current' && waiting(s.waitingOn, audience) && (
                    <p className={cn('text-[12px]', s.waitingOn === 'you' ? 'text-accent-gold font-semibold' : 'text-text-muted')}>{waiting(s.waitingOn, audience)}</p>
                  )}
                  {action && <Link href={action.href} className="text-[12px] font-semibold text-brand-red hover:underline">{action.text} →</Link>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** Loads the links and renders — for places that hold just the request. */
export function LiveRequestTracker({ request, audience, company, compact = false, collapsible = false }: {
  request: ServiceRequest; audience: 'client' | 'staff'; company?: string | null; compact?: boolean; collapsible?: boolean;
}) {
  const track = useRequestTrack(request, company);
  if (!track) return null;
  return compact ? <RequestTrackerBar track={track} audience={audience} /> : <RequestTracker track={track} audience={audience} collapsible={collapsible} />;
}

/** Same, loading the request itself (for lists that hold a simplified copy). */
export function RequestTrackerById({ requestId, audience, collapsible = true }: { requestId: string; audience: 'client' | 'staff'; collapsible?: boolean }) {
  const [req, setReq] = useState<ServiceRequest | null>(null);
  useEffect(() => onSnapshot(doc(db, 'clientRequests', requestId),
    s => setReq(s.exists() ? ({ ...s.data(), id: s.id } as ServiceRequest) : null), () => setReq(null)), [requestId]);
  return req ? <LiveRequestTracker request={req} audience={audience} collapsible={collapsible} /> : null;
}
