import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getSubroles } from './permissions';
import { NotificationService } from './notification-service';
import type { DocApproval, Invoice, Quote, Technician } from './types';

/**
 * Internal sign-off before anything goes to a client.
 *
 *  - Quotes: Super Admin, Payroll (finance) Admin or a Project Manager
 *    approves. Anyone else (sales, techs, dispatch) submits for approval;
 *    once approved, the person who made it sends it.
 *  - Invoices: only Super Admin or Payroll Admin approves.
 *  - An approver's own quote or invoice counts as approved when they send it.
 *  - Site walks: approving a walk (which writes its quote) is for quote
 *    approvers; that quote starts out approved.
 *
 * firestore.rules enforces the same (who may set `approved`, and that a
 * quote/invoice can't leave draft without it); /api/invoices/send checks too.
 */

type RoleUser = Pick<Technician, 'roles' | 'role'> | null | undefined;
type Who = { id: string; name: string };

export const canApproveQuotes = (u: RoleUser) =>
  getSubroles(u as any).some(r => r === 'super_admin' || r === 'dispatch_admin' || r === 'payroll_admin');
export const canApproveInvoices = (u: RoleUser) =>
  getSubroles(u as any).some(r => r === 'super_admin' || r === 'payroll_admin');

export const isApproved = (a: DocApproval | null | undefined) => a?.status === 'approved';
export const quoteApproval = (q: Pick<Quote, 'internalApproval'>) => q.internalApproval ?? null;
export const invoiceApproval = (i: Pick<Invoice, 'approval'>) => i.approval ?? null;

/** Approved by `by` right now — for an approver's own quote/invoice. */
export const approvedNow = (by: Who, prev?: DocApproval | null): DocApproval => ({
  status: 'approved',
  requestedBy: prev?.requestedBy ?? by.id, requestedByName: prev?.requestedByName ?? by.name, requestedAt: prev?.requestedAt ?? new Date().toISOString(),
  decidedBy: by.id, decidedByName: by.name, decidedAt: new Date().toISOString(), note: null,
});

const now = () => new Date().toISOString();
const quoteLabel = (q: Quote) => `${q.quoteNumber || q.id}${q.title ? ` (${q.title})` : ''}`;
const money = (n: number) => `$${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

// ── Quotes ──────────────────────────────────────────────────────────────────

export async function requestQuoteApproval(q: Quote, by: Who): Promise<void> {
  const internalApproval: DocApproval = { status: 'pending', requestedBy: by.id, requestedByName: by.name, requestedAt: now(), decidedBy: null, decidedByName: null, decidedAt: null, note: null };
  await updateDoc(doc(db, 'quotes', q.id), { internalApproval, updatedAt: now() });
  NotificationService.notifyQuoteApprovers(q.id, 'Quote needs approval',
    `${by.name} sent quote ${quoteLabel(q)} for ${q.customerCompany || q.customerName || 'a customer'} (${money(q.total)}) for approval.`).catch(() => {});
}

export async function approveQuote(q: Quote, by: Who): Promise<void> {
  await updateDoc(doc(db, 'quotes', q.id), { internalApproval: approvedNow(by, q.internalApproval), updatedAt: now() });
  const to = q.internalApproval?.requestedBy || q.createdBy;
  if (to && to !== by.id) NotificationService.notify(to, 'Quote approved', `${by.name} approved quote ${quoteLabel(q)}. You can send it to the client.`, { id: q.id, type: 'quote' }).catch(() => {});
}

export async function returnQuote(q: Quote, by: Who, note: string): Promise<void> {
  const prev = q.internalApproval;
  await updateDoc(doc(db, 'quotes', q.id), {
    internalApproval: { ...(prev || {}), status: 'returned', decidedBy: by.id, decidedByName: by.name, decidedAt: now(), note: note.trim() || null },
    updatedAt: now(),
  });
  const to = prev?.requestedBy || q.createdBy;
  if (to && to !== by.id) NotificationService.notify(to, 'Quote sent back', `${by.name} sent back quote ${quoteLabel(q)}${note.trim() ? `: ${note.trim()}` : '.'}`, { id: q.id, type: 'quote' }).catch(() => {});
}

// ── Invoices ────────────────────────────────────────────────────────────────

const invoiceLabel = (i: Invoice) => `${i.invoiceNumber || i.id}${i.clientName ? ` for ${i.clientName}` : ''}`;

export async function requestInvoiceApproval(i: Invoice, by: Who): Promise<void> {
  const approval: DocApproval = { status: 'pending', requestedBy: by.id, requestedByName: by.name, requestedAt: now(), decidedBy: null, decidedByName: null, decidedAt: null, note: null };
  await updateDoc(doc(db, 'invoices', i.id), { approval });
  NotificationService.notifyInvoiceApprovers(i.id, 'Invoice needs approval', `${by.name} sent invoice ${invoiceLabel(i)} (${money(i.total)}) for approval.`).catch(() => {});
}

export async function approveInvoice(i: Invoice, by: Who): Promise<void> {
  await updateDoc(doc(db, 'invoices', i.id), { approval: approvedNow(by, i.approval) });
  const to = i.approval?.requestedBy;
  if (to && to !== by.id) NotificationService.notify(to, 'Invoice approved', `${by.name} approved invoice ${invoiceLabel(i)}. You can send it to the client.`, { id: i.id, type: 'invoice' }, { portal: 'admin' }).catch(() => {});
}

export async function returnInvoice(i: Invoice, by: Who, note: string): Promise<void> {
  await updateDoc(doc(db, 'invoices', i.id), {
    approval: { ...(i.approval || {}), status: 'returned', decidedBy: by.id, decidedByName: by.name, decidedAt: now(), note: note.trim() || null },
  });
  const to = i.approval?.requestedBy;
  if (to && to !== by.id) NotificationService.notify(to, 'Invoice sent back', `${by.name} sent back invoice ${invoiceLabel(i)}${note.trim() ? `: ${note.trim()}` : '.'}`, { id: i.id, type: 'invoice' }, { portal: 'admin' }).catch(() => {});
}

/** Short status for badges. */
export function approvalLabel(a: DocApproval | null | undefined): string | null {
  if (!a) return null;
  return a.status === 'pending' ? 'Awaiting approval' : a.status === 'returned' ? 'Sent back' : 'Approved';
}
