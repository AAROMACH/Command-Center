'use client';

import { pdfAttachmentFor } from '@/components/invoice-pdf-button';
import { useState } from 'react';
import { Copy, Loader2, Pencil, Send } from 'lucide-react';
import { auth } from '@/lib/firebase';
import type { Invoice } from '@/lib/types';
import { PriceDocEditor, type PriceDocResult } from '@/components/price-doc-editor';
import { invoiceToEditor, saveInvoiceFromEditor } from '@/lib/invoice-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RecipientsField, recipientsValid } from '@/components/recipients-field';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { ApprovalPanel } from '@/components/approval-panel';
import { approveInvoice, canApproveInvoices, isApproved, requestInvoiceApproval, returnInvoice } from '@/lib/approvals';

/**
 * "Send invoice": confirm who it goes to, then the server emails the client a
 * link to the invoice and marks it Sent (/api/invoices/send). Used on the
 * project page, Quotes & Invoices and Financials.
 */
const money = (n: number) => `$${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/** Preview and send: shows exactly what the client gets, with Edit for any
 *  last-minute change (remove items, add a discount / adjustment). */
export function SendInvoiceButton({ invoice, size = 'sm', className, salesMode = false, salesCanSubmit = false }: {
  invoice: Invoice; size?: 'sm' | 'default'; className?: string;
  /** Sales with Create invoices: may submit their own drafts for approval. */
  salesCanSubmit?: boolean;
  /** Sales portal: send / resend approved invoices only — no editing, no approval steps. */
  salesMode?: boolean;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const me = { id: user?.id || auth.currentUser?.uid || '', name: user?.name || auth.currentUser?.displayName || 'Office' };
  const approver = canApproveInvoices(user);
  // A draft goes out once a Super / Payroll Admin approves it (lib/approvals).
  const needsApproval = invoice.status === 'draft' && !isApproved(invoice.approval);
  const [reviewOpen, setReviewOpen] = useState(false);
  const approvalAct = (fn: () => Promise<void>, done: string) => async () => {
    try { await fn(); toast({ title: done }); setReviewOpen(false); }
    catch (e: any) { toast({ variant: 'destructive', title: 'Could not update approval', description: e?.code === 'permission-denied' ? 'You don’t have permission for that.' : e.message }); throw e; }
  };
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<string[]>(['']);
  const [replyToMe, setReplyToMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState('');
  const token = () => auth.currentUser?.getIdToken();
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const saveEdit = async (r: PriceDocResult) => {
    setSavingEdit(true);
    try {
      await saveInvoiceFromEditor(r, invoice, {}, { editorCanApprove: approver });
      toast({ title: 'Invoice updated', description: 'Check the preview, then send.' });
      setEditing(false);
      setOpen(true);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e.message });
    } finally { setSavingEdit(false); }
  };
  const lineAmt = (l: Invoice['lineItems'][number]) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * (l.category === 'labor' && (l as any).multiplier ? (l as any).multiplier : 1);

  // Every send of this invoice with Resend's delivery status — proof it went out.
  const [sendLog, setSendLog] = useState<{ at: string; to: string; by: string; emailId: string | null; status: string; logId?: string | null }[]>([]);
  const sentRecently = !!invoice.sentAt && Date.now() - Date.parse(invoice.sentAt) < 10 * 60000;
  const start = async () => {
    setOpen(true); setLink(''); setLoading(true);
    try {
      const r = await fetch(`/api/invoices/send?invoiceId=${encodeURIComponent(invoice.id)}`, { headers: { Authorization: `Bearer ${await token()}` } });
      const d = await r.json();
      setTo([d.to || '']);
      setSendLog(Array.isArray(d.sendLog) ? d.sendLog : []);
    } catch { /* leave blank to type */ }
    setLoading(false);
  };
  const send = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/invoices/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ invoiceId: invoice.id, to: to.filter(x => x.trim()), replyToMe, pdf: await pdfAttachmentFor({ invoice }) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Send failed');
      // Materials on it are pulled from stock by hand in A&M → Materials.
      const stockNote = !invoice.stockPull && (invoice.lineItems || []).some(l => l.category !== 'labor') ? ' Then pull its materials from stock in Assets & Materials → Materials.' : '';
      if (d.emailed) { toast({ title: 'Invoice sent', description: `Emailed to ${d.to}. Reopen Send to check it was delivered.${stockNote}` }); setOpen(false); }
      else { setLink(d.link); toast({ variant: 'destructive', title: 'Not emailed', description: `${d.reason} Copy the link below to send it yourself.` }); }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not send', description: e.message });
    } finally { setLoading(false); }
  };

  if (invoice.status === 'void') return null;
  const panel = (
    <ApprovalPanel kind="invoice" approval={invoice.approval} canApprove={approver}
      approverLabel="a Super Admin or Payroll Admin"
      onRequest={approvalAct(() => requestInvoiceApproval(invoice, me), 'Sent for approval')}
      onApprove={approvalAct(() => approveInvoice(invoice, me), 'Invoice approved')}
      onReturn={note => approvalAct(() => returnInvoice(invoice, me, note), 'Invoice sent back')()} />
  );
  // Sales: nothing to do until the office has approved it.
  if (needsApproval && salesMode && !salesCanSubmit) {
    return <span className="text-[11px] text-text-muted whitespace-nowrap">{invoice.approval?.status === 'pending' ? 'Awaiting approval' : 'Not approved yet'}</span>;
  }
  // Not an approver and not approved yet: submit / waiting / resubmit instead of Send.
  if (needsApproval && !approver) {
    const st = invoice.approval?.status;
    return (
      <span onClick={e => e.stopPropagation()} className="inline-flex">
        <Button size={size} variant={st === 'pending' ? 'outline' : 'default'} className={className} onClick={e => { e.stopPropagation(); setReviewOpen(true); }}>
          <Send size={13} className="mr-1.5" /> {st === 'pending' ? 'Awaiting approval' : st === 'returned' ? 'Sent back — review' : 'Submit for approval'}
        </Button>
        <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
          <DialogContent className="sm:max-w-md" onClick={e => e.stopPropagation()}>
            <DialogHeader className="text-left">
              <DialogTitle>Invoice {invoice.invoiceNumber}</DialogTitle>
              <DialogDescription>{money(invoice.total)}{invoice.clientName ? ` · ${invoice.clientName}` : ''}</DialogDescription>
            </DialogHeader>
            {panel}
          </DialogContent>
        </Dialog>
      </span>
    );
  }
  // The span keeps clicks in the button / dialog (a portal, but React events
  // still bubble) from also opening the invoice row they sit in.
  return (
    <span onClick={e => e.stopPropagation()} className="inline-flex">
      <Button size={size} variant={invoice.status === 'draft' ? 'default' : 'outline'} className={className} onClick={e => { e.stopPropagation(); start(); }}>
        <Send size={13} className="mr-1.5" /> {invoice.status === 'draft' ? 'Send invoice' : 'Resend'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" onClick={e => e.stopPropagation()}>
          <DialogHeader className="text-left">
            <DialogTitle>Send invoice {invoice.invoiceNumber}</DialogTitle>
            <DialogDescription>Check it over — this is what the client sees. Edit to remove items or add a discount, then send.</DialogDescription>
          </DialogHeader>
          {needsApproval && invoice.approval?.status === 'pending' && panel}
          <div className="rounded-lg border border-border-sub bg-bg-primary p-3 space-y-1.5 max-h-[40svh] overflow-y-auto text-[12px]">
            {(invoice.lineItems || []).map(l => (
              <div key={l.id} className="flex justify-between gap-3">
                <span className="min-w-0 break-words">{l.quantity} × {l.description}</span>
                <span className={`font-mono shrink-0 ${lineAmt(l) < 0 ? 'text-text-green' : ''}`}>{money(lineAmt(l))}</span>
              </div>
            ))}
            {!(invoice.lineItems || []).length && <p className="text-text-muted">No items on this invoice.</p>}
            <div className="border-t border-border-sub pt-1.5 space-y-0.5 font-mono">
              <div className="flex justify-between"><span className="font-sans text-text-muted">Subtotal</span><span>{money(invoice.subtotal)}</span></div>
              {(invoice.discountAmount || 0) > 0 && <div className="flex justify-between"><span className="font-sans text-text-muted">Plan discount</span><span>−{money(invoice.discountAmount || 0)}</span></div>}
              {invoice.tax > 0 && <div className="flex justify-between"><span className="font-sans text-text-muted">Tax</span><span>{money(invoice.tax)}</span></div>}
              <div className="flex justify-between text-[13px] font-bold"><span className="font-sans">Total</span><span>{money(invoice.total)}</span></div>
            </div>
          </div>
          {!salesMode && <Button variant="outline" size="sm" className="self-start" onClick={() => { setOpen(false); setEditing(true); }}><Pencil size={13} className="mr-1.5" /> Edit invoice</Button>}
          <RecipientsField value={to} onChange={setTo} disabled={loading} />
          <label className="flex items-start gap-2 text-[12px] text-text-secondary cursor-pointer">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--brand-red)]" checked={replyToMe} onChange={e => setReplyToMe(e.target.checked)} disabled={loading} />
            <span>Use my email{auth.currentUser?.email ? ` (${auth.currentUser.email})` : ''} as the reply-to, so the customer’s replies come to me</span>
          </label>
          {link && (
            <div className="flex items-center gap-2">
              <Input readOnly value={link} className="font-mono text-[11px]" />
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(link); toast({ title: 'Link copied' }); }}><Copy size={13} /></Button>
            </div>
          )}
          {sendLog.length > 0 && (
            <div className="rounded-lg border border-border-sub p-2.5 space-y-1 text-[12px]">
              <p className="font-semibold text-text-primary">Sent before</p>
              {sendLog.slice(-5).reverse().map((e, i) => (
                <div key={`${e.at}-${i}`} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-text-secondary">{new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {e.to} · {e.by}
                    {e.logId && <> · <a href={`/admin/email-log?id=${e.logId}`} target="_blank" rel="noreferrer" className="text-brand-red hover:underline">View email</a></>}
                  </span>
                  <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    e.status === 'delivered' || e.status === 'opened' || e.status === 'clicked' ? 'border-text-green/40 text-text-green'
                      : e.status === 'bounced' || e.status === 'complained' ? 'border-brand-red/40 text-brand-red'
                      : 'border-border-sub text-text-muted')}>
                    {e.status === 'sent' ? 'Sent — not confirmed yet' : e.status}
                  </span>
                </div>
              ))}
              {sendLog.some(e => e.status === 'bounced') && <p className="text-brand-red">A bounce means the address didn’t accept it — check the email, then send again.</p>}
            </div>
          )}
          {sentRecently && <p className="text-[12px] text-accent-gold">Sent less than 10 minutes ago — wait before sending again so the client doesn’t get duplicates.</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={send} disabled={loading || !recipientsValid(to) || sentRecently}>{loading && <Loader2 size={13} className="mr-1.5 animate-spin" />} Send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PriceDocEditor
        open={editing}
        // One dialog at a time (stacked Radix dialogs can freeze the page):
        // the send preview comes back when the editor closes.
        onClose={() => { setEditing(false); setOpen(true); }}
        kind="invoice"
        initial={invoiceToEditor(invoice)}
        initialDiscount={invoice.planDiscount ?? null}
        title={`Edit invoice ${invoice.invoiceNumber}`}
        saveLabel="Save changes"
        saving={savingEdit}
        onSave={saveEdit}
      />
    </span>
  );
}
