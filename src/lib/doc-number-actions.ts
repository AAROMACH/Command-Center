import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { docNumber, docSeq, isAutoNumber } from './doc-number';
import type { Invoice, Quote } from './types';

/**
 * One-time renumber to the date + running number format (admin, best
 * effort). Quotes: every app-made number. Invoices: drafts only — a sent or
 * paid invoice keeps the number the client (and the books) already have.
 * Numbers typed by hand are never touched.
 */
export function renumberQuotes(quotes: Quote[]): void {
  quotes.filter(q => docSeq(q.id) && isAutoNumber(q.quoteNumber, q.id)).forEach(q => {
    updateDoc(doc(db, 'quotes', q.id), { quoteNumber: docNumber(q.id, q.createdAt || new Date()) }).catch(() => {});
  });
}

export function renumberDraftInvoices(invoices: Invoice[]): void {
  invoices.filter(i => i.status === 'draft' && docSeq(i.id) && isAutoNumber(i.invoiceNumber, i.id)).forEach(i => {
    updateDoc(doc(db, 'invoices', i.id), { invoiceNumber: docNumber(i.id, i.issueDate || new Date()) }).catch(() => {});
  });
}
