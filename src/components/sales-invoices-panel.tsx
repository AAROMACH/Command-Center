'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { FileText, Pencil, Plus, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { BillJobsDialog } from '@/components/job-invoice';
import { PriceDocEditor, type PriceDocResult } from '@/components/price-doc-editor';
import { invoiceToEditor, saveInvoiceFromEditor } from '@/lib/invoice-actions';
import { newInvoiceNumber } from '@/lib/doc-number';
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
export function SalesInvoicesPanel({ search = '', canCreate = false, canSend = false }: {
  search?: string;
  /** "Create invoices" (admin.crm.create_invoice): new invoice, bill completed jobs, edit/submit own drafts. */
  canCreate?: boolean;
  /** "Send invoices" (admin.crm.send_invoice): send approved invoices. */
  canSend?: boolean;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Invoice | 'new' | null>(null);
  const [billOpen, setBillOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const mine = (i: Invoice) => !!user?.id && i.createdBy === user.id;
  const save = async (r: PriceDocResult) => {
    setSaving(true);
    try {
      const existing = editing && editing !== 'new' ? editing : null;
      const id = await saveInvoiceFromEditor(r, existing, existing ? {} : { createdBy: user?.id || '' }, { editorCanApprove: false });
      toast({ title: existing ? 'Invoice updated' : 'Invoice drafted', description: existing ? undefined : `${newInvoiceNumber(r.invoiceNumber, id, r.issueDate)} — submit it for approval when it's ready.` });
      setEditing(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not save invoice', description: e?.code === 'permission-denied' ? 'You can only change your own draft invoices.' : e.message });
    } finally { setSaving(false); }
  };
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

  const toolbar = canCreate && (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" className="h-9" onClick={() => setEditing('new')}><Plus size={14} className="mr-1.5" /> New invoice</Button>
      <Button size="sm" variant="outline" className="h-9" onClick={() => setBillOpen(true)}><Receipt size={14} className="mr-1.5" /> Bill completed jobs</Button>
    </div>
  );
  const dialogs = canCreate && (
    <>
      <PriceDocEditor open={!!editing} onClose={() => setEditing(null)} kind="invoice" draftOnly
        initial={editing && editing !== 'new' ? invoiceToEditor(editing) : undefined}
        initialDiscount={editing && editing !== 'new' ? editing.planDiscount ?? null : undefined}
        title={editing && editing !== 'new' ? `Edit invoice ${editing.invoiceNumber}` : 'New invoice'}
        saveLabel="Save draft" saving={saving} onSave={save} />
      <BillJobsDialog open={billOpen} onClose={() => setBillOpen(false)} salesMode />
    </>
  );

  if (error) return <p className="rounded-lg border border-brand-red/30 bg-brand-red/5 px-3 py-2 text-[13px] text-brand-red">{error}</p>;
  if (loading) return <p className="text-[13px] text-text-muted">Loading…</p>;
  if (!rows.length) return (
    <div className="space-y-3">
      {toolbar}
      <EmptyState icon={FileText} title="No open invoices" description={canCreate ? 'Create one, or bill completed jobs.' : 'Invoices the office approves show up here to send.'} />
      {dialogs}
    </div>
  );
  return (
    <div className="space-y-2">
      {toolbar}
      <p className="text-[12px] text-text-muted">Open invoices.{canSend ? ' Send the approved ones to the client;' : ''} drafts go to a Super or Payroll Admin for approval{canCreate ? ' — submit yours when it’s ready' : ''}.</p>
      {rows.map(i => (
        <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border-sub border-l-4 border-l-text-green bg-bg-secondary px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-text-primary truncate">{i.clientName || 'Client'}</p>
            <p className="text-[12px] text-text-muted"><span className="font-mono">{i.invoiceNumber}</span>{i.dueDate ? ` · due ${i.dueDate}` : ''}</p>
          </div>
          <span className="font-mono text-[13px] font-bold">{money(i.total)}</span>
          <StatusBadge kind="invoice" value={i.status} />
          {canCreate && mine(i) && i.status === 'draft' && i.approval?.status !== 'approved' && (
            <Button size="sm" variant="outline" className="h-8 px-2.5 text-[12px]" onClick={() => setEditing(i)}><Pencil size={13} className="mr-1" /> Edit</Button>
          )}
          {(canSend || (canCreate && mine(i) && i.status === 'draft' && i.approval?.status !== 'approved')) && (
            <SendInvoiceButton invoice={i} salesMode salesCanSubmit={canCreate && mine(i)} className="h-8 px-2.5 text-[12px]" />
          )}
          <InvoicePdfButton invoice={i} className="h-8 px-2.5 text-[12px]" />
        </div>
      ))}
      {dialogs}
    </div>
  );
}
