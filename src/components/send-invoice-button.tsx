'use client';

import { useState } from 'react';
import { Copy, Loader2, Send } from 'lucide-react';
import { auth } from '@/lib/firebase';
import type { Invoice } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

/**
 * "Send invoice": confirm who it goes to, then the server emails the client a
 * link to the invoice and marks it Sent (/api/invoices/send). Used on the
 * project page, Quotes & Invoices and Financials.
 */
export function SendInvoiceButton({ invoice, size = 'sm', className }: { invoice: Pick<Invoice, 'id' | 'invoiceNumber' | 'status' | 'total'>; size?: 'sm' | 'default'; className?: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState('');
  const token = () => auth.currentUser?.getIdToken();

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
            <DialogDescription>The client gets an email with a link to view the full invoice. It's marked Sent.</DialogDescription>
          </DialogHeader>
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
    </span>
  );
}
