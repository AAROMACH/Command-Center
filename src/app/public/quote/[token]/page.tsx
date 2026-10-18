'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import type { Quote, QuoteOptionalGroup } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Loader2, AlertTriangle, Shield } from 'lucide-react';
import { format, parseISO } from 'date-fns';

function fmtMoney(n: number) {
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

type PageState = 'loading' | 'error' | 'not_found' | 'already_done' | 'active' | 'confirming_approve' | 'confirming_reject' | 'success_approve' | 'success_reject';

// Next 15 passes page `params` as a Promise; a client page reads them with
// useParams() instead (typing them as a plain object fails the build check).
export default function PublicQuotePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>('loading');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [choices, setChoices] = useState<QuoteOptionalGroup[]>([]);

  const [approverName, setApproverName] = useState('');
  const [approverEmail, setApproverEmail] = useState('');
  const [approvalNote, setApprovalNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/public-quote?token=${encodeURIComponent(token)}`);
        if (res.status === 404) { setState('not_found'); return; }
        if (!res.ok) { setState('error'); return; }
        const { quote: data } = await res.json() as { quote: Quote };
        setQuote(data);
        setChoices(data.optionalChoices || []);
        if (data.status === 'approved' || data.status === 'rejected') {
          setState('already_done');
          return;
        }
        setState('active');
      } catch {
        setState('error');
      }
    })();
  }, [token]);

  const toggleOption = (gIdx: number, oIdx: number) => {
    setChoices(prev => prev.map((g, gi) =>
      gi === gIdx
        ? { ...g, options: g.options.map((o, oi) => oi === oIdx ? { ...o, selected: !o.selected } : o) }
        : g
    ));
  };

  const selectedAddon = choices.reduce((s, g) => s + g.options.filter(o => o.selected).reduce((ss, o) => ss + o.priceAdjustment, 0), 0);
  const grandTotal = (quote?.total || 0) + selectedAddon;

  const handleApprove = async () => {
    if (!approverName || !approverEmail) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/public-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token,
          action: 'approve',
          approverName,
          approverEmail,
          approvalNote: approvalNote || null,
          optionalChoices: choices,
        }),
      });
      if (!res.ok) { setState('error'); return; }
      setState('success_approve');
    } catch {
      setState('error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/public-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, action: 'reject', rejectReason }),
      });
      if (!res.ok) { setState('error'); return; }
      setState('success_reject');
    } catch {
      setState('error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Layout wrapper ──────────────────────────────────────────────────────────
  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col">
      <header className="border-b border-border-main bg-bg-secondary px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-brand-red flex items-center justify-center shrink-0">
            <span className="text-white font-semibold text-[12px]">A</span>
          </div>
          <div>
            <p className="text-[14px] font-semibold text-text-primary">Aaromach</p>
            <p className="text-[12px] text-text-muted">Quote review</p>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 sm:px-6">
        {children}
      </main>
      <footer className="border-t border-border-main px-6 py-4 text-center">
        <p className="text-[12px] text-text-muted">
          Aaromach · This link is private. Please don&apos;t share it.
        </p>
      </footer>
    </div>
  );

  const card = 'rounded-xl border border-border-main bg-bg-secondary shadow-sm';
  const sectionLabel = 'text-[10px] font-semibold uppercase tracking-wider text-text-muted';
  const fieldLabel = 'text-[12px] font-medium text-text-secondary';
  const field = 'w-full px-3 rounded-md bg-bg-primary border border-border-main text-text-primary text-[13px] placeholder:text-text-muted focus:outline-none focus:border-brand-red/60';

  if (state === 'loading') return (
    <Wrap>
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <Loader2 size={24} className="animate-spin text-text-muted" />
        <p className="text-[12px] text-text-muted">Loading quote…</p>
      </div>
    </Wrap>
  );

  if (state === 'not_found' || state === 'error') return (
    <Wrap>
      <div className="text-center py-24">
        <AlertTriangle size={32} className="mx-auto mb-4 text-accent-gold" />
        <p className="text-[16px] font-semibold text-text-primary">
          {state === 'not_found' ? 'Quote not found' : 'Something went wrong'}
        </p>
        <p className="text-[13px] text-text-muted mt-2">
          {state === 'not_found' ? 'This quote link is invalid or has expired.' : 'Please try again or contact us.'}
        </p>
      </div>
    </Wrap>
  );

  if (state === 'already_done' && quote) return (
    <Wrap>
      <div className="text-center py-20">
        {quote.status === 'approved'
          ? <CheckCircle2 size={40} className="mx-auto mb-4 text-text-green" />
          : <XCircle size={40} className="mx-auto mb-4 text-text-red" />
        }
        <p className="text-[18px] font-semibold text-text-primary">
          {quote.status === 'approved' ? 'This quote is already approved' : 'This quote was declined'}
        </p>
        <p className="text-[13px] text-text-muted mt-2">
          {quote.status === 'approved'
            ? `Approved by ${quote.approvedByName} on ${quote.approvedAt ? format(parseISO(quote.approvedAt), 'MMM d, yyyy') : ''}`
            : 'Contact Aaromach if you have questions.'}
        </p>
      </div>
    </Wrap>
  );

  if (state === 'success_approve') return (
    <Wrap>
      <div className="text-center py-16 space-y-4">
        <div className="h-16 w-16 mx-auto rounded-full bg-text-green/10 border border-text-green/30 flex items-center justify-center">
          <CheckCircle2 size={32} className="text-text-green" />
        </div>
        <p className="text-[20px] font-semibold text-text-primary">Quote approved</p>
        <p className="text-[13px] text-text-secondary">Thank you, {approverName}. We&apos;ll be in touch shortly.</p>
        <div className={cn(card, 'p-4 text-left space-y-2 mt-6')}>
          <p className={sectionLabel}>Summary</p>
          <p className="text-[14px] font-semibold text-text-primary">{quote?.title}</p>
          <p className="text-[13px] text-text-secondary">Approved total: <span className="text-text-primary font-semibold">{fmtMoney(grandTotal)}</span></p>
          <p className="text-[12px] text-text-muted">Quote #{quote?.quoteNumber}</p>
        </div>
      </div>
    </Wrap>
  );

  if (state === 'success_reject') return (
    <Wrap>
      <div className="text-center py-16 space-y-3">
        <XCircle size={40} className="mx-auto text-text-red" />
        <p className="text-[18px] font-semibold text-text-primary">Quote declined</p>
        <p className="text-[13px] text-text-muted">We&apos;ve recorded your response. Contact us if you&apos;d like to talk it over.</p>
      </div>
    </Wrap>
  );

  // ── Active quote view ───────────────────────────────────────────────────────
  return (
    <Wrap>
      {quote && (
        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-mono text-text-muted">{quote.quoteNumber}</span>
              {quote.expirationDate && (
                <span className="text-[11px] px-2 py-0.5 rounded-full border border-accent-gold/40 bg-accent-gold/10 text-accent-gold font-medium">
                  Expires {quote.expirationDate}
                </span>
              )}
            </div>
            <h1 className="text-[24px] font-semibold text-text-primary leading-tight">
              {quote.title}
            </h1>
            <p className="text-[13px] text-text-muted">Prepared for {quote.customerName || quote.customerCompany}</p>
          </div>

          {/* Scope */}
          {quote.scopeSummary && (
            <div className={cn(card, 'p-4 space-y-2')}>
              <p className={sectionLabel}>Scope of work</p>
              <p className="text-[13px] text-text-secondary leading-relaxed">{quote.scopeSummary}</p>
            </div>
          )}

          {/* Line items */}
          <div className="space-y-2">
            <p className={sectionLabel}>Line items</p>
            <div className={cn(card, 'overflow-hidden')}>
              {quote.lineItems.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border-sub last:border-0">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-text-primary">{item.name}</p>
                    <p className="text-[12px] text-text-muted">{item.quantity} × {fmtMoney(item.unitPrice)}{item.category ? ` · ${item.category}` : ''}</p>
                  </div>
                  <span className="text-[13px] font-semibold text-text-primary tabular-nums">{fmtMoney(item.total)}</span>
                </div>
              ))}
              <div className="px-4 py-3 bg-bg-tertiary/50 border-t border-border-sub space-y-1">
                <div className="flex justify-between text-[12px] text-text-muted">
                  <span>Subtotal</span><span className="tabular-nums">{fmtMoney(quote.subtotal)}</span>
                </div>
                {quote.taxAmount > 0 && (
                  <div className="flex justify-between text-[12px] text-text-muted">
                    <span>Tax</span><span className="tabular-nums">{fmtMoney(quote.taxAmount)}</span>
                  </div>
                )}
                {selectedAddon > 0 && (
                  <div className="flex justify-between text-[12px] text-accent-gold">
                    <span>Selected add-ons</span><span className="tabular-nums">+{fmtMoney(selectedAddon)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[15px] font-semibold text-text-primary border-t border-border-sub pt-2 mt-1">
                  <span>Total</span><span className="tabular-nums">{fmtMoney(grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Optional choices */}
          {choices.length > 0 && (
            <div className="space-y-3">
              <p className={sectionLabel}>Optional add-ons</p>
              <p className="text-[13px] text-text-muted">Select any options you&apos;d like to include.</p>
              {choices.map((group, gIdx) => (
                <div key={group.id} className={cn(card, 'p-4 space-y-3')}>
                  <p className="text-[13px] font-semibold text-text-primary">{group.title}</p>
                  {group.description && <p className="text-[12px] text-text-muted">{group.description}</p>}
                  <div className="space-y-2">
                    {group.options.map((opt, oIdx) => (
                      <label key={opt.id} className="flex items-center gap-3 cursor-pointer group">
                        <div className={cn(
                          'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors shrink-0',
                          opt.selected ? 'border-brand-red bg-brand-red' : 'border-border-main group-hover:border-text-muted'
                        )}>
                          {opt.selected && <CheckCircle2 size={10} className="text-white" />}
                        </div>
                        <input type="checkbox" className="sr-only" checked={opt.selected}
                          onChange={() => toggleOption(gIdx, oIdx)} />
                        <span className="flex-1 text-[13px] text-text-secondary">{opt.label}</span>
                        <span className="text-[13px] font-semibold text-text-primary tabular-nums">+{fmtMoney(opt.priceAdjustment)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Terms */}
          {quote.terms && (
            <div className={cn(card, 'p-4 space-y-1')}>
              <p className={sectionLabel}>Terms</p>
              <p className="text-[12px] text-text-secondary leading-relaxed">{quote.terms}</p>
            </div>
          )}

          {/* Approve / Reject */}
          {state === 'active' && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button type="button"
                onClick={() => setState('confirming_approve')}
                className="h-10 rounded-md bg-text-green text-white text-[13px] font-semibold hover:bg-text-green/90 transition-colors">
                Approve quote
              </button>
              <button type="button"
                onClick={() => setState('confirming_reject')}
                className="h-10 rounded-md border border-brand-red/40 text-text-red text-[13px] font-semibold hover:bg-brand-red/10 transition-colors">
                Decline
              </button>
            </div>
          )}

          {/* Approve confirmation */}
          {state === 'confirming_approve' && (
            <div className="rounded-xl border border-text-green/30 bg-text-green/5 p-5 space-y-4 shadow-sm">
              <p className="text-[15px] font-semibold text-text-primary">Confirm approval</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className={fieldLabel}>Your name *</label>
                  <input
                    className={cn(field, 'h-10')}
                    value={approverName} onChange={e => setApproverName(e.target.value)}
                    placeholder="Full name" />
                </div>
                <div className="space-y-1.5">
                  <label className={fieldLabel}>Your email *</label>
                  <input type="email"
                    className={cn(field, 'h-10')}
                    value={approverEmail} onChange={e => setApproverEmail(e.target.value)}
                    placeholder="you@company.com" />
                </div>
                <div className="space-y-1.5">
                  <label className={fieldLabel}>Note (optional)</label>
                  <textarea rows={2}
                    className={cn(field, 'py-2 resize-none')}
                    value={approvalNote} onChange={e => setApprovalNote(e.target.value)}
                    placeholder="Any notes for the team…" />
                </div>
              </div>
              <p className="text-[12px] text-text-muted">
                You are approving this quote for <strong className="text-text-primary">{fmtMoney(grandTotal)}</strong>, including selected add-ons.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setState('active')}
                  className="flex-1 h-10 rounded-md border border-border-main text-text-secondary text-[13px] font-medium hover:bg-bg-tertiary transition-colors">
                  Back
                </button>
                <button type="button" onClick={handleApprove} disabled={!approverName || !approverEmail || submitting}
                  className="flex-1 h-10 rounded-md bg-text-green text-white text-[13px] font-semibold disabled:opacity-40 hover:bg-text-green/90 transition-colors flex items-center justify-center gap-2">
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  Approve quote
                </button>
              </div>
            </div>
          )}

          {/* Reject confirmation */}
          {state === 'confirming_reject' && (
            <div className="rounded-xl border border-brand-red/30 bg-brand-red/5 p-5 space-y-4 shadow-sm">
              <p className="text-[15px] font-semibold text-text-primary">Decline quote</p>
              <div className="space-y-1.5">
                <label className={fieldLabel}>Reason *</label>
                <textarea rows={3}
                  className={cn(field, 'py-2 resize-none')}
                  value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                  placeholder="Let us know why you're declining…" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setState('active')}
                  className="flex-1 h-10 rounded-md border border-border-main text-text-secondary text-[13px] font-medium hover:bg-bg-tertiary transition-colors">
                  Back
                </button>
                <button type="button" onClick={handleReject} disabled={!rejectReason || submitting}
                  className="flex-1 h-10 rounded-md bg-brand-red text-white text-[13px] font-semibold disabled:opacity-40 hover:bg-brand-red/90 transition-colors flex items-center justify-center gap-2">
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  Decline quote
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-[12px] text-text-muted justify-center pt-2">
            <Shield size={12} />
            <span>This is a private link. Please don&apos;t share it.</span>
          </div>
        </div>
      )}
    </Wrap>
  );
}
