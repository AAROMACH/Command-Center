'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { CheckCircle2, Clock } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ApprovalPanel } from '@/components/approval-panel';
import { QuotePdfButton } from '@/components/invoice-pdf-button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { approveQuote, canApproveQuotes, requestQuoteApproval, returnQuote } from '@/lib/approvals';
import { discountLineLabel } from '@/lib/price-lines';
import type { Quote } from '@/lib/types';

const money = (n: number) => `$${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/**
 * Tech Portal → Approvals (Project Managers): quotes that sales, techs or
 * dispatch sent for approval. Approve, or send back with a note; whoever made
 * it is told and sends it to the client (lib/approvals).
 */
export default function TechApprovalsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => onSnapshot(
    query(collection(db, 'quotes'), where('internalApproval.status', '==', 'pending')),
    snap => { setQuotes(snap.docs.map(d => ({ ...d.data(), id: d.id } as Quote)).filter(q => q.status === 'draft')); setLoading(false); setError(''); },
    e => { setLoading(false); setError(e.code === 'permission-denied' ? 'Your account can’t read quotes yet — the office needs to publish the updated database rules.' : e.message); },
  ), []);

  const sorted = useMemo(() => [...quotes].sort((a, b) => (a.internalApproval?.requestedAt || '').localeCompare(b.internalApproval?.requestedAt || '')), [quotes]);
  const open = quotes.find(q => q.id === openId) || null;
  const me = { id: user?.id || '', name: user?.name || 'Project Manager' };
  const act = (fn: () => Promise<void>, done: string) => async () => {
    try { await fn(); toast({ title: done }); setOpenId(null); }
    catch (e: any) { toast({ variant: 'destructive', title: 'Could not update', description: e?.code === 'permission-denied' ? 'You don’t have permission for that.' : e.message }); throw e; }
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Projects" icon={CheckCircle2} title="Approvals"
        subtitle="Quotes waiting for sign-off before they go to the client. Approve, or send back with what needs to change." />

      {error && <p className="rounded-lg border border-brand-red/30 bg-brand-red/5 px-3 py-2 text-[13px] text-brand-red">{error}</p>}

      {loading ? <p className="text-[13px] text-text-muted">Loading…</p> : !sorted.length ? (
        <EmptyState icon={CheckCircle2} title="Nothing waiting" description="Quotes sent for approval show up here." />
      ) : (
        <div className="space-y-2">
          {sorted.map(q => (
            <button key={q.id} type="button" onClick={() => setOpenId(q.id)}
              className="w-full rounded-xl border border-border-sub border-l-4 border-l-accent-gold bg-bg-secondary p-4 text-left hover:border-border-main">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-text-primary truncate">{q.title || 'Quote'}</p>
                  <p className="text-[12px] text-text-muted truncate">{q.customerCompany || q.customerName} · <span className="font-mono">{q.quoteNumber}</span></p>
                </div>
                <span className="font-mono text-[14px] font-bold text-text-primary shrink-0">{money(q.total)}</span>
              </div>
              <p className="mt-1.5 flex items-center gap-1 text-[12px] text-text-muted">
                <Clock size={12} /> From {q.internalApproval?.requestedByName || 'someone'}
              </p>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!open} onOpenChange={v => !v && setOpenId(null)}>
        <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto">
          {open && (
            <>
              <DialogHeader className="text-left">
                <DialogTitle>{open.title || 'Quote'}</DialogTitle>
                <DialogDescription>{open.customerCompany || open.customerName} · <span className="font-mono">{open.quoteNumber}</span></DialogDescription>
              </DialogHeader>
              {open.scopeSummary && <p className="text-[12px] text-text-secondary whitespace-pre-wrap">{open.scopeSummary}</p>}
              <div className="rounded-lg border border-border-sub text-[12px]">
                {open.lineItems.map(l => (
                  <div key={l.id} className="flex justify-between gap-3 border-b border-border-sub px-3 py-2 last:border-0">
                    <span className="min-w-0">{l.name}<span className="block text-[11px] text-text-muted">{l.quantity}{(l as { unit?: string }).unit ? ` ${(l as { unit?: string }).unit}` : ''} × {money(l.unitPrice)}{l.required === false ? ' · optional' : ''}</span></span>
                    <span className="font-mono shrink-0">{money(l.total)}</span>
                  </div>
                ))}
                <div className="space-y-0.5 bg-bg-tertiary px-3 py-2 font-mono">
                  <div className="flex justify-between"><span className="font-sans text-text-muted">Subtotal</span><span>{money(open.subtotal)}</span></div>
                  {(open.discountAmount ?? 0) > 0 && <div className="flex justify-between text-text-green"><span className="font-sans">{discountLineLabel((open as Quote & { planDiscount?: any }).planDiscount)}</span><span>−{money(open.discountAmount ?? 0)}</span></div>}
                  <div className="flex justify-between font-bold"><span className="font-sans">Total</span><span>{money(open.total)}</span></div>
                </div>
              </div>
              <QuotePdfButton quote={open} />
              <ApprovalPanel kind="quote" approval={open.internalApproval} canApprove={canApproveQuotes(user)}
                approverLabel="a Super Admin, Payroll Admin or Project Manager"
                onRequest={act(() => requestQuoteApproval(open, me), 'Sent for approval')}
                onApprove={act(() => approveQuote(open, me), 'Quote approved')}
                onReturn={note => act(() => returnQuote(open, me, note), 'Quote sent back')()} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
