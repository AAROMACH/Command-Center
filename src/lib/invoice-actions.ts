import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { createDocId } from './generateId';
import { ID_PREFIXES } from './constants';
import type { Invoice } from './types';
import { toInvoiceLines, type PriceLine } from './price-lines';
import type { PriceDocResult, PriceDocValues } from '@/components/price-doc-editor';
import { fromInvoiceLines } from './price-lines';

/** Editor values for an existing invoice. */
export function invoiceToEditor(inv: Invoice): Partial<PriceDocValues> {
  return {
    customerType: inv.clientId ? 'in_app_client' : 'external_customer',
    clientId: inv.clientId || '',
    customerName: inv.clientId ? '' : inv.clientName,
    customerEmail: inv.customerEmail || '',
    invoiceNumber: inv.invoiceNumber,
    issueDate: (inv.issueDate || '').slice(0, 10),
    dueDate: (inv.dueDate || '').slice(0, 10),
    relatedId: inv.projectId || inv.workOrderId || '',
    status: inv.status,
    terms: inv.notes || '',
    lines: fromInvoiceLines(inv.lineItems),
  };
}

/** Builds the invoice doc from the editor and saves it; returns its id. */
export async function saveInvoiceFromEditor(r: PriceDocResult, existing: Invoice | null, extra: Partial<Invoice> = {}): Promise<string> {
  const id = existing?.id || await createDocId(ID_PREFIXES.INVOICE);
  // Project ids are 'prj-…' (older ones 'proj…'); anything else is a job.
  const isProject = /^pro?j/.test(r.relatedId);
  const clientName = r.customerType === 'in_app_client'
    ? (r.client?.clientCompany || r.client?.name || existing?.clientName || '')
    : (r.customerCompany || r.customerName);
  const invoice: Invoice = {
    ...(existing || {}),
    id,
    invoiceNumber: r.invoiceNumber,
    clientId: r.customerType === 'in_app_client' ? r.clientId : '',
    clientName,
    customerEmail: r.customerType === 'external_customer' ? (r.customerEmail || null) : null,
    projectId: r.relatedId && isProject ? r.relatedId : undefined,
    workOrderId: r.relatedId && !isProject ? r.relatedId : undefined,
    issueDate: r.issueDate,
    dueDate: r.dueDate,
    status: r.status,
    lineItems: toInvoiceLines(r.lines as PriceLine[]),
    notes: r.terms,
    subtotal: r.totals.subtotal,
    discountAmount: r.totals.discountAmount,
    planDiscount: r.discount,
    tax: r.totals.taxAmount,
    total: r.totals.total,
    // When it was marked paid (the request tracker's last step).
    ...(r.status === 'paid' && existing?.status !== 'paid' ? { paidAt: new Date().toISOString() } : {}),
    ...extra,
  };
  // Firestore rejects undefined fields.
  await setDoc(doc(db, 'invoices', id), JSON.parse(JSON.stringify(invoice)));
  return id;
}

/**
 * Delete an invoice and undo what pointed at it: the project goes back to
 * "no invoice yet" and the quote it came from goes back to Approved, so
 * either can be invoiced again.
 */
export async function deleteInvoice(inv: Invoice): Promise<void> {
  const now = new Date().toISOString();
  await deleteDoc(doc(db, 'invoices', inv.id));
  if (inv.projectId) {
    const p = await getDoc(doc(db, 'projects', inv.projectId)).catch(() => null);
    if (p?.exists() && p.data().invoiceId === inv.id) await updateDoc(p.ref, { invoiceId: null, updatedAt: now });
  }
  if (inv.quoteId) {
    const q = await getDoc(doc(db, 'quotes', inv.quoteId)).catch(() => null);
    if (q?.exists() && q.data().convertedToInvoiceId === inv.id) {
      await updateDoc(q.ref, {
        convertedToInvoiceId: null,
        ...(q.data().status === 'converted_to_invoice' ? { status: 'approved' } : {}),
        updatedAt: now,
      });
    }
  }
}
