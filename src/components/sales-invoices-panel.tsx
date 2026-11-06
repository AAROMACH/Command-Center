'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { FileText } from 'lucide-react';
import { db } from '@/lib/firebase';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { InvoicePdfButton } from '@/components/invoice-pdf-button';
import { SendInvoiceButton } from '@/components/send-invoice-button';
import { numberSortKey } from '@/lib/doc-number';
import type { Invoice } from '@/lib/types';

const money = (n: number) => `$${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/**
 * Sales portal → Invoices, for Sales people with the "Send invoices"
 * permission (admin.crm.send_invoice): send or resend invoices the office has
 * approved, and download the PDF. No editing, approving or payments.
 */
export function SalesInvoicesPanel({ search = '' }: { search?: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => onSnapshot(collection(db, 'invoices'),
    s => { setInvoices(s.docs.map(d => ({ ...d.data(), id: d.id } as Invoice))); setLoading(false); setError(''); },
    e => { setLoading(false); setError(e.code === 'permission-denied' ? 'Your account can’t read invoices yet — the office needs to publish the updated database rules.' : e.message); }), []);

  const rows = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return invoices
      .filter(i => i.status !== 'void' && i.status !== 'paid')
      .filter(i => words.every(w => `${i.invoiceNumber} ${i.clientName}`.toLowerCase().includes(w)))
      .sort((a, b) => numberSortKey(b.invoiceNumber, b.id) - numberSortKey(a.invoiceNumber, a.id));
  }, [invoices, search]);

  if (error) return <p className="rounded-lg border border-brand-red/30 bg-brand-red/5 px-3 py-2 text-[13px] text-brand-red">{error}</p>;
  if (loading) return <p className="text-[13px] text-text-muted">Loading…</p>;
  if (!rows.length) return <EmptyState icon={FileText} title="No open invoices" description="Invoices the office approves show up here to send." />;
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-text-muted">Open invoices. Send the approved ones to the client; drafts wait for the office to approve them.</p>
      {rows.map(i => (
        <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border-sub border-l-4 border-l-text-green bg-bg-secondary px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-text-primary truncate">{i.clientName || 'Client'}</p>
            <p className="text-[12px] text-text-muted"><span className="font-mono">{i.invoiceNumber}</span>{i.dueDate ? ` · due ${i.dueDate}` : ''}</p>
          </div>
          <span className="font-mono text-[13px] font-bold">{money(i.total)}</span>
          <StatusBadge kind="invoice" value={i.status} />
          <SendInvoiceButton invoice={i} salesMode className="h-8 px-2.5 text-[12px]" />
          <InvoicePdfButton invoice={i} className="h-8 px-2.5 text-[12px]" />
        </div>
      ))}
    </div>
  );
}
