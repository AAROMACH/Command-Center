'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import type { Quote, QuoteOptionalGroup } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Loader2, AlertTriangle, Shield } from 'lucide-react';
import { format, parseISO } from 'date-fns';

function fmtMoney(n: number) {
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

type PageState = 'loading' | 'error' | 'not_found' | 'already_done' | 'active' | 'confirming_approve' | 'confirming_reject' | 'success_approve' | 'success_reject';

export default function PublicQuotePage({ params }: { params: { token: string } }) {
  const [state, setState] = useState<PageState>('loading');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteDocId, setQuoteDocId] = useState<string | null>(null);
  const [choices, setChoices] = useState<QuoteOptionalGroup[]>([]);

  const [approverName, setApproverName] = useState('');
  const [approverEmail, setApproverEmail] = useState('');
  const [approvalNote, setApprovalNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const q = query(collection(db, 'quotes'), where('publicToken', '==', params.token));
        const snap = await getDocs(q);
        if (snap.empty) { setState('not_found'); return; }
        const d = snap.docs[0];
        const data = { ...d.data(), id: d.id } as Quote;
        setQuote(data);
        setQuoteDocId(d.id);
        setChoices(data.optionalChoices || []);
        if (data.status === 'approved' || data.status === 'rejected') {
          setState('already_done');
          return;
        }
        setState('active');
        // Mark as viewed
        if (data.status === 'sent') {
          await updateDoc(doc(db, 'quotes', d.id), { status: 'viewed', viewedAt: new Date().toISOString() });
        }
      } catch {
        setState('error');
      }
    })();
  }, [params.token]);

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
    if (!approverName || !approverEmail || !quoteDocId) return;
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'quotes', quoteDocId), {
        status: 'approved',
        approvedAt: new Date().toISOString(),
        approvedByName: approverName,
        approvedByEmail: approverEmail,
        approvalNote: approvalNote || null,
        optionalChoices: choices,
        updatedAt: new Date().toISOString(),
      });
      setState('success_approve');
    } catch {
      setState('error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason || !quoteDocId) return;
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'quotes', quoteDocId), {
        status: 'rejected',
        rejectedAt: new Date().toISOString(),
        rejectionReason: rejectReason,
        updatedAt: new Date().toISOString(),
      });
      setState('success_reject');
    } catch {
      setState('error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Layout wrapper ──────────────────────────────────────────────────────────
  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-[#e00] flex items-center justify-center shrink-0">
            <span className="text-white font-black text-[10px]">A</span>
          </div>
          <div>
            <p className="text-[13px] font-black uppercase tracking-wider text-white">Aaromach</p>
            <p className="text-[9px] text-white/40 uppercase tracking-widest">Quote Approval Portal</p>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-8">
        {children}
      </main>
      <footer className="border-t border-white/10 px-6 py-4 text-center">
        <p className="text-[9px] text-white/30 uppercase tracking-widest">
          Aaromach · Secure Quote Portal · This link is private — do not share
        </p>
      </footer>
    </div>
  );

  if (state === 'loading') return (
    <Wrap>
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-white/30" />
      </div>
    </Wrap>
  );

  if (state === 'not_found' || state === 'error') return (
    <Wrap>
      <div className="text-center py-24">
        <AlertTriangle size={32} className="mx-auto mb-4 text-amber-400" />
        <p className="text-[14px] font-black uppercase tracking-wide text-white">
          {state === 'not_found' ? 'Quote not found' : 'Something went wrong'}
        </p>
        <p className="text-[11px] text-white/40 mt-2">
          {state === 'not_found' ? 'This quote link is invalid or has expired.' : 'Please try again or contact us.'}
        </p>
      </div>
    </Wrap>
  );

  if (state === 'already_done' && quote) return (
    <Wrap>
      <div className="text-center py-20">
        {quote.status === 'approved'
          ? <CheckCircle2 size={40} className="mx-auto mb-4 text-[#2fc880]" />
          : <XCircle size={40} className="mx-auto mb-4 text-[#e00]" />
        }
        <p className="text-[16px] font-black uppercase tracking-wide text-white">
          {quote.status === 'approved' ? 'Quote Already Approved' : 'Quote Already Declined'}
        </p>
        <p className="text-[11px] text-white/40 mt-2">
          {quote.status === 'approved'
            ? `Approved by ${quote.approvedByName} on ${quote.approvedAt ? format(parseISO(quote.approvedAt), 'MMM d, yyyy') : ''}`
            : 'This quote has been declined. Contact Aaromach if you have questions.'}
        </p>
      </div>
    </Wrap>
  );

  if (state === 'success_approve') return (
    <Wrap>
      <div className="text-center py-16 space-y-4">
        <div className="h-16 w-16 mx-auto rounded-full bg-[#2fc880]/10 border border-[#2fc880]/30 flex items-center justify-center">
          <CheckCircle2 size={32} className="text-[#2fc880]" />
        </div>
        <p className="text-[18px] font-black uppercase tracking-wide text-white">Quote Approved</p>
        <p className="text-[12px] text-white/60">Thank you, {approverName}. We'll be in touch shortly.</p>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-left space-y-2 mt-6">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Approval Summary</p>
          <p className="text-[12px] font-bold text-white">{quote?.title}</p>
          <p className="text-[11px] text-white/60">Approved total: <span className="text-white font-black">{fmtMoney(grandTotal)}</span></p>
          <p className="text-[10px] text-white/40">Ref: {quote?.quoteNumber}</p>
        </div>
      </div>
    </Wrap>
  );

  if (state === 'success_reject') return (
    <Wrap>
      <div className="text-center py-16 space-y-3">
        <XCircle size={40} className="mx-auto text-[#e00]" />
        <p className="text-[16px] font-black uppercase tracking-wide text-white">Quote Declined</p>
        <p className="text-[11px] text-white/40">We've recorded your response. Contact us if you'd like to discuss further.</p>
      </div>
    </Wrap>
  );

  // ── Active quote view ───────────────────────────────────────────────────────
  return (
    <Wrap>
      {quote && (
        <div className="space-y-8">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-white/30">{quote.quoteNumber}</span>
              {quote.expirationDate && (
                <span className="text-[8px] px-2 py-0.5 rounded border border-amber-400/30 text-amber-400 font-bold uppercase">
                  Expires {quote.expirationDate}
                </span>
              )}
            </div>
            <h1 className="text-[22px] font-black uppercase tracking-tight text-white leading-tight">
              {quote.title}
            </h1>
            <p className="text-[12px] text-white/50">Prepared for {quote.customerName || quote.customerCompany}</p>
          </div>

          {/* Scope */}
          {quote.scopeSummary && (
            <div className="rounded-xl border border-white/10 bg-white/3 p-4 space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Scope of Work</p>
              <p className="text-[12px] text-white/80 leading-relaxed">{quote.scopeSummary}</p>
            </div>
          )}

          {/* Line items */}
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Line Items</p>
            <div className="rounded-xl border border-white/10 overflow-hidden">
              {quote.lineItems.map(item => (
                <div key={item.id} className="flex items-center justify-between px-4 py-3 border-b border-white/10 last:border-0">
                  <div>
                    <p className="text-[11px] font-bold text-white">{item.name}</p>
                    <p className="text-[9px] text-white/40">{item.quantity} × {fmtMoney(item.unitPrice)} · {item.category}</p>
                  </div>
                  <span className="text-[12px] font-black text-white">{fmtMoney(item.total)}</span>
                </div>
              ))}
              <div className="px-4 py-3 bg-white/5 space-y-1">
                <div className="flex justify-between text-[10px] text-white/40">
                  <span>Subtotal</span><span>{fmtMoney(quote.subtotal)}</span>
                </div>
                {quote.taxAmount > 0 && (
                  <div className="flex justify-between text-[10px] text-white/40">
                    <span>Tax</span><span>{fmtMoney(quote.taxAmount)}</span>
                  </div>
                )}
                {selectedAddon > 0 && (
                  <div className="flex justify-between text-[10px] text-amber-400">
                    <span>Selected Add-Ons</span><span>+{fmtMoney(selectedAddon)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[14px] font-black text-white border-t border-white/10 pt-2 mt-1">
                  <span>Total</span><span>{fmtMoney(grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Optional choices */}
          {choices.length > 0 && (
            <div className="space-y-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Optional Add-Ons</p>
              <p className="text-[11px] text-white/50">Select any options you'd like to include.</p>
              {choices.map((group, gIdx) => (
                <div key={group.id} className="rounded-xl border border-white/10 p-4 space-y-3">
                  <p className="text-[11px] font-black text-white uppercase tracking-wide">{group.title}</p>
                  {group.description && <p className="text-[10px] text-white/50">{group.description}</p>}
                  <div className="space-y-2">
                    {group.options.map((opt, oIdx) => (
                      <label key={opt.id} className="flex items-center gap-3 cursor-pointer group">
                        <div className={cn(
                          'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors shrink-0',
                          opt.selected ? 'border-[#e00] bg-[#e00]' : 'border-white/30 group-hover:border-white/60'
                        )}>
                          {opt.selected && <CheckCircle2 size={10} className="text-white" />}
                        </div>
                        <input type="checkbox" className="sr-only" checked={opt.selected}
                          onChange={() => toggleOption(gIdx, oIdx)} />
                        <span className="flex-1 text-[11px] text-white/80">{opt.label}</span>
                        <span className="text-[11px] font-bold text-amber-400">+{fmtMoney(opt.priceAdjustment)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Terms */}
          {quote.terms && (
            <div className="rounded-xl border border-white/10 p-4 space-y-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Terms</p>
              <p className="text-[11px] text-white/60 leading-relaxed">{quote.terms}</p>
            </div>
          )}

          {/* Approve / Reject */}
          {state === 'active' && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button type="button"
                onClick={() => setState('confirming_approve')}
                className="py-3 rounded-xl bg-[#2fc880]/10 border border-[#2fc880]/30 text-[#2fc880] text-[10px] font-black uppercase tracking-widest hover:bg-[#2fc880]/20 transition-colors">
                Approve Quote
              </button>
              <button type="button"
                onClick={() => setState('confirming_reject')}
                className="py-3 rounded-xl bg-[#e00]/10 border border-[#e00]/30 text-[#e00] text-[10px] font-black uppercase tracking-widest hover:bg-[#e00]/20 transition-colors">
                Decline
              </button>
            </div>
          )}

          {/* Approve confirmation */}
          {state === 'confirming_approve' && (
            <div className="rounded-xl border border-[#2fc880]/30 bg-[#2fc880]/5 p-5 space-y-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-[#2fc880]">Confirm Approval</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-white/50 uppercase tracking-widest">Your Name *</label>
                  <input
                    className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/20 text-white text-[12px] placeholder:text-white/30 focus:outline-none focus:border-[#2fc880]/50"
                    value={approverName} onChange={e => setApproverName(e.target.value)}
                    placeholder="Full name" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-white/50 uppercase tracking-widest">Your Email *</label>
                  <input type="email"
                    className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/20 text-white text-[12px] placeholder:text-white/30 focus:outline-none focus:border-[#2fc880]/50"
                    value={approverEmail} onChange={e => setApproverEmail(e.target.value)}
                    placeholder="your@email.com" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-white/50 uppercase tracking-widest">Note (optional)</label>
                  <textarea rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 text-white text-[12px] placeholder:text-white/30 focus:outline-none focus:border-[#2fc880]/50 resize-none"
                    value={approvalNote} onChange={e => setApprovalNote(e.target.value)}
                    placeholder="Any notes for the team..." />
                </div>
              </div>
              <p className="text-[10px] text-white/40">
                Approving this quote for <strong className="text-white">{fmtMoney(grandTotal)}</strong> including selected add-ons.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setState('active')}
                  className="flex-1 py-2.5 rounded-lg border border-white/20 text-white/60 text-[10px] font-bold uppercase hover:border-white/40 transition-colors">
                  Back
                </button>
                <button type="button" onClick={handleApprove} disabled={!approverName || !approverEmail || submitting}
                  className="flex-1 py-2.5 rounded-lg bg-[#2fc880] text-[#0a0a0a] text-[10px] font-black uppercase disabled:opacity-40 hover:bg-[#2fc880]/90 transition-colors flex items-center justify-center gap-2">
                  {submitting && <Loader2 size={12} className="animate-spin" />}
                  Confirm Approval
                </button>
              </div>
            </div>
          )}

          {/* Reject confirmation */}
          {state === 'confirming_reject' && (
            <div className="rounded-xl border border-[#e00]/30 bg-[#e00]/5 p-5 space-y-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-[#e00]">Decline Quote</p>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-white/50 uppercase tracking-widest">Reason *</label>
                <textarea rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 text-white text-[12px] placeholder:text-white/30 focus:outline-none focus:border-[#e00]/50 resize-none"
                  value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                  placeholder="Please let us know why you're declining..." />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setState('active')}
                  className="flex-1 py-2.5 rounded-lg border border-white/20 text-white/60 text-[10px] font-bold uppercase hover:border-white/40 transition-colors">
                  Back
                </button>
                <button type="button" onClick={handleReject} disabled={!rejectReason || submitting}
                  className="flex-1 py-2.5 rounded-lg bg-[#e00] text-white text-[10px] font-black uppercase disabled:opacity-40 hover:bg-[#e00]/90 transition-colors flex items-center justify-center gap-2">
                  {submitting && <Loader2 size={12} className="animate-spin" />}
                  Decline Quote
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-[9px] text-white/20 justify-center pt-2">
            <Shield size={10} />
            <span>This is a secure, private link. Do not share it with others.</span>
          </div>
        </div>
      )}
    </Wrap>
  );
}
