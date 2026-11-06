import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { readProjectParts, writeProjectParts } from './project-parts';
import { createDocId } from './generateId';
import { docNumber } from './doc-number';
import { ID_PREFIXES } from './constants';
import { db } from './firebase';
import { fromQuoteLines, toQuoteLines, type PlanDiscount } from './price-lines';
import type { Project, Quote } from './types';
import type { PriceDocResult, PriceDocValues } from '@/components/price-doc-editor';

type QuoteWithDiscount = Quote & { planDiscount?: PlanDiscount | null };

/** Editor values for an existing quote. Line ids are kept, so parts added on a
 *  project stay tied to their quote lines after an edit. */
export function quoteToEditor(q: Quote): Partial<PriceDocValues> {
  const inApp = q.customerType === 'in_app_client';
  return {
    customerType: q.customerType,
    clientId: q.clientId || '',
    customerName: inApp ? '' : (q.customerName || ''),
    customerCompany: inApp ? '' : (q.customerCompany || ''),
    customerEmail: inApp ? '' : (q.customerEmail || ''),
    customerPhone: inApp ? '' : (q.customerPhone || ''),
    title: q.title || '',
    description: q.description || '',
    scopeSummary: q.scopeSummary || '',
    terms: q.terms || '',
    expirationDate: q.expirationDate || '',
    optionalGroups: q.optionalChoices || [],
    lines: fromQuoteLines(q.lineItems),
  };
}

/** A quote can be edited until it's invoiced or retired. */
export const canEditQuote = (q: Quote) => !['converted_to_invoice', 'archived', 'superseded'].includes(q.status);

/** The discount saved on a quote, for the editor (null = saved without one). */
export const quoteDiscount = (q: Quote) => (q as QuoteWithDiscount).planDiscount ?? null;

/**
 * Save edits to a quote. Status, links and approval history are kept. When
 * the quote is a project's quote, the project budget follows the new total,
 * and parts whose quote line was deleted stay as project costs only.
 */
export async function saveQuoteEdits(quote: Quote, r: PriceDocResult, linkedProject?: Project): Promise<void> {
  const inApp = r.customerType === 'in_app_client';
  const c = r.client;
  const now = new Date().toISOString();
  const lineItems = toQuoteLines(r.lines);
  await updateDoc(doc(db, 'quotes', quote.id), {
    customerType: r.customerType,
    clientId: inApp ? r.clientId : null,
    customerName: inApp ? (c?.clientCompany || c?.name || quote.customerName || '') : r.customerName,
    customerCompany: inApp ? (c?.clientCompany || quote.customerCompany || null) : (r.customerCompany || null),
    customerEmail: inApp ? (c?.email || quote.customerEmail || '') : r.customerEmail,
    customerPhone: inApp ? (c?.phone || quote.customerPhone || null) : (r.customerPhone || null),
    title: r.title,
    description: r.description,
    scopeSummary: r.scopeSummary,
    lineItems: JSON.parse(JSON.stringify(lineItems)),
    optionalChoices: r.optionalGroups,
    subtotal: r.totals.subtotal,
    taxAmount: r.totals.taxAmount,
    discountAmount: r.totals.discountAmount,
    planDiscount: r.discount,
    total: r.totals.total,
    terms: r.terms,
    expirationDate: r.expirationDate || null,
    updatedAt: now,
  });

  // Keep the project on this quote in step with it.
  let project = linkedProject || null;
  const projectId = quote.convertedToProjectId;
  if (!project && projectId && !projectId.startsWith('project-')) { // 'project-<time>' is an old placeholder ref
    const snap = await getDoc(doc(db, 'projects', projectId)).catch(() => null);
    if (snap?.exists()) project = { ...snap.data(), id: snap.id } as Project;
  }
  if (!project) return;
  if (project.sourceQuoteId !== quote.id) return;
  const lineIds = new Set(lineItems.map(l => l.id));
  // Best effort: the quote is saved either way (Sales can't edit projects or
  // read project billing).
  await updateDoc(doc(db, 'projects', project.id), { projectBudget: r.totals.total, updatedAt: now }).catch(() => {});
  const parts = await readProjectParts(project).catch(() => []);
  if (parts.some(p => p.quoteLineId && !lineIds.has(p.quoteLineId))) {
    await writeProjectParts(project.id, parts.map(p => (p.quoteLineId && !lineIds.has(p.quoteLineId) ? { ...p, quoteLineId: null } : p))).catch(() => {});
  }
}

/**
 * Create a draft quote from the editor (same shape as Quotes → New quote).
 * `extra` carries links such as the client request it was made from.
 */
export async function createQuoteFromEditor(r: PriceDocResult, by: string, extra: Record<string, unknown> = {}): Promise<string> {
  const quoteId = await createDocId(ID_PREFIXES.QUOTE);
  const inApp = r.customerType === 'in_app_client';
  const c = r.client;
  const now = new Date().toISOString();
  const quote = {
    id: quoteId, quoteNumber: docNumber(quoteId),
    customerType: r.customerType,
    clientId: inApp ? r.clientId : null,
    customerName: inApp ? (c?.clientCompany || c?.name || '') : r.customerName,
    customerCompany: inApp ? (c?.clientCompany || null) : (r.customerCompany || null),
    customerEmail: inApp ? (c?.email || '') : r.customerEmail,
    customerPhone: inApp ? (c?.phone || null) : (r.customerPhone || null),
    title: r.title, description: r.description, scopeSummary: r.scopeSummary,
    lineItems: toQuoteLines(r.lines), optionalChoices: r.optionalGroups,
    subtotal: r.totals.subtotal, taxAmount: r.totals.taxAmount, discountAmount: r.totals.discountAmount,
    planDiscount: r.discount, total: r.totals.total,
    terms: r.terms, expirationDate: r.expirationDate || null,
    publicToken: null, status: 'draft', sentAt: null, viewedAt: null, approvedAt: null, rejectedAt: null,
    approvedByName: null, approvedByEmail: null, approvalNote: null, rejectionReason: null,
    createdBy: by, createdAt: now, updatedAt: now,
    originalQuoteId: null, revisionNumber: 1, supersededByQuoteId: null,
    convertedToWorkOrderId: null, convertedToProjectId: null, convertedToInvoiceId: null,
    leadId: null,
    ...extra,
  };
  await setDoc(doc(db, 'quotes', quoteId), JSON.parse(JSON.stringify(quote)));
  return quoteId;
}
