'use client';

import { useState } from 'react';
import { Copy, Loader2, Pencil, Send } from 'lucide-react';
import { auth } from '@/lib/firebase';
import type { Invoice } from '@/lib/types';
import { PriceDocEditor, type PriceDocResult } from '@/components/price-doc-editor';
import { invoiceToEditor, saveInvoiceFromEditor } from '@/lib/invoice-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

/**
 * "Send invoice": confirm who it goes to, then the server emails the client a
 * link to the invoice and marks it Sent (/api/invoices/send). Used on the
 * project page, Quotes & Invoices and Financials.
 */
const money = (n: number) => `$${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/** Preview and send: shows exactly what the client gets, with Edit for any
 *  last-minute change (remove items, add a discount / adjustment). */
export function SendInvoiceButton({ invoice, size = 'sm', className }: { invoice: Invoice; size?: 'sm' | 'default'; className?: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState('');
  const token = () => auth.currentUser?.getIdToken();
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const saveEdit = async (r: PriceDocResult) => {
    setSavingEdit(true);
    try {
      await saveInvoiceFromEditor(r, invoice);
      toast({ title: 'Invoice updated', description: 'Check the preview, then send.' });
      setEditing(false);
      setOpen(true);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e.message });
    } finally { setSavingEdit(false); }
  };
  const lineAmt = (l: Invoice['lineItems'][number]) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * (l.category === 'labor' && (l as any).multiplier ? (l as any).multiplier : 1);

  const start = async () => {
    setOpen(true); setLink(''); setLoading(true);
    try {
      const r = await fetch(`/api/invoices/send?invoiceId=${encodeURIComponent(invoice.id)}`, { headers: { Authorization: `Bearer ${await token()}` } });
      const d = await r.json();
      setTo(d.to || '');
    } catch { /* leave blank to type */ }
    setLoading(false);
  };
  const send = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/invoices/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ invoiceId: invoice.id, to }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Send failed');
      if (d.emailed) { toast({ title: 'Invoice sent', description: `Emailed to ${d.to}.` }); setOpen(false); }
      else { setLink(d.link); toast({ variant: 'destructive', title: 'Not emailed', description: `${d.reason} Copy the link below to send it yourself.` }); }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not send', description: e.message });
    } finally { setLoading(false); }
  };

  if (invoice.status === 'void') return null;
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
          <Button variant="outline" size="sm" className="self-start" onClick={() => { setOpen(false); setEditing(true); }}><Pencil size={13} className="mr-1.5" /> Edit invoice</Button>
          <label className="space-y-1.5 text-[12px] text-text-muted">
            Send to
            <Input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="client@example.com" disabled={loading} />
          </label>
          {link && (
            <div className="flex items-center gap-2">
              <Input readOnly value={link} className="font-mono text-[11px]" />
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(link); toast({ title: 'Link copied' }); }}><Copy size={13} /></Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={send} disabled={loading || !to.trim()}>{loading && <Loader2 size={13} className="mr-1.5 animate-spin" />} Send</Button>
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
