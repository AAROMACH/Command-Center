'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

type PublicInvoice = {
  invoiceNumber: string; clientName: string; issueDate: string; dueDate: string; status: string;
  lineItems: { description: string; quantity: number; unitPrice: number; category: string; multiplier?: number }[];
  subtotal: number; discountAmount: number; planName: string | null; tax: number; total: number; notes: string;
};

const money = (n: number) => `$${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/** The client's view of an invoice, from the link in the invoice email. */
export default function PublicInvoicePage() {
  const { token } = useParams<{ token: string }>();
  const [inv, setInv] = useState<PublicInvoice | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');
  useEffect(() => {
    fetch(`/api/public-invoice?token=${encodeURIComponent(token)}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setInv(d.invoice); setState('ok'); })
      .catch(() => setState('missing'));
  }, [token]);

  if (state === 'loading') return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin text-text-muted" /></div>;
  if (!inv) return <div className="flex min-h-screen items-center justify-center p-6 text-center text-text-muted">This invoice link isn&apos;t valid. Contact Aaromach for a new one.</div>;

  const line = (l: PublicInvoice['lineItems'][number]) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * (l.category === 'labor' && l.multiplier ? l.multiplier : 1);
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <div className="rounded-2xl border border-border-main bg-bg-secondary p-5 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-wider text-brand-red">Aaromach</p>
            <h1 className="text-2xl font-bold text-text-primary">Invoice {inv.invoiceNumber}</h1>
            <p className="text-[13px] text-text-muted">{inv.clientName}</p>
          </div>
          <div className="text-right text-[13px]">
            <p><span className="text-text-muted">Issued</span> {inv.issueDate}</p>
            <p><span className="text-text-muted">Due</span> {inv.dueDate}</p>
            <p className="mt-1 inline-block rounded-full border border-border-sub px-2 py-0.5 text-[11px] font-semibold uppercase">{inv.status === 'paid' ? 'Paid' : 'Due'}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-border-sub text-left text-text-muted">
              <th className="py-2 font-medium">Item</th><th className="py-2 font-medium text-right">Qty</th><th className="py-2 font-medium text-right">Price</th><th className="py-2 font-medium text-right">Amount</th>
            </tr></thead>
            <tbody>
              {inv.lineItems.map((l, i) => (
                <tr key={i} className="border-b border-border-sub/60">
                  <td className="py-2 pr-3">{l.description}</td>
                  <td className="py-2 text-right tabular-nums">{l.quantity}</td>
                  <td className="py-2 text-right tabular-nums">{money(l.unitPrice)}</td>
                  <td className="py-2 text-right tabular-nums">{money(line(l))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ml-auto w-full max-w-xs space-y-1 text-[13px] tabular-nums">
          <div className="flex justify-between"><span className="text-text-muted">Subtotal</span><span>{money(inv.subtotal)}</span></div>
          {inv.discountAmount > 0 && <div className="flex justify-between"><span className="text-text-muted">{inv.planName ? `${inv.planName} plan discount` : 'Discount'}</span><span>−{money(inv.discountAmount)}</span></div>}
          {inv.tax > 0 && <div className="flex justify-between"><span className="text-text-muted">Tax</span><span>{money(inv.tax)}</span></div>}
          <div className="flex justify-between border-t border-border-sub pt-1 text-[15px] font-bold"><span>Total</span><span>{money(inv.total)}</span></div>
        </div>
        {inv.notes && <p className="whitespace-pre-wrap text-[12px] text-text-muted">{inv.notes}</p>}
      </div>
    </div>
  );
}
