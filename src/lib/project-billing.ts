import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { createDocId } from './generateId';
import { ID_PREFIXES } from './constants';
import { fromQuoteLines, materialPrice, priceTotals, toInvoiceLines, toQuoteLines, type PlanDiscount, type PriceLine } from './price-lines';
import { quoteEstimate } from './project-economics';
import type { PricingSettings } from './billing';
import type { Invoice, Material, Project, ProjectPart, Quote } from './types';

/**
 * Billing for a project, tied to its quote (Project.sourceQuoteId):
 *  - linking a quote makes its labor hours / total the project's estimate;
 *  - parts added on the project become billed lines on that quote;
 *  - completing the project turns the quote (with those parts) into a draft
 *    invoice, ready to send.
 */

type QuoteWithDiscount = Quote & { planDiscount?: PlanDiscount | null };
const genLineId = () => Math.random().toString(36).slice(2, 10);

/** Link a quote: budget and estimated hours come from it (when asked). */
export async function linkQuoteToProject(project: Project, quote: Quote, applyEstimates: boolean): Promise<void> {
  const est = quoteEstimate(quote)!;
  await updateDoc(doc(db, 'projects', project.id), {
    sourceQuoteId: quote.id,
    ...(applyEstimates ? { projectBudget: est.total, estimatedHours: est.laborHours } : {}),
    updatedAt: new Date().toISOString(),
  });
  if (!quote.convertedToProjectId) {
    await updateDoc(doc(db, 'quotes', quote.id), { convertedToProjectId: project.id, updatedAt: new Date().toISOString() });
  }
}

export async function unlinkQuote(project: Project): Promise<void> {
  await updateDoc(doc(db, 'projects', project.id), { sourceQuoteId: null, updatedAt: new Date().toISOString() });
}

/** New quote lines → recomputed totals, the same way the quote editor does. */
function quoteTotalsPatch(quote: QuoteWithDiscount, lines: PriceLine[], pricing: PricingSettings) {
  const t = priceTotals(lines, quote.planDiscount || null, pricing.salesTaxPct);
  return {
    lineItems: toQuoteLines(lines), subtotal: t.subtotal, taxAmount: t.taxAmount,
    discountAmount: t.discountAmount, total: t.total, updatedAt: new Date().toISOString(),
  };
}

/**
 * Add a material / part from the price book. It's recorded on the project
 * (its cost counts in project costs) and, when a quote is linked, added to the
 * quote as a billed line — the budget follows the new quote total.
 */
export async function addProjectPart(project: Project, material: Material, quantity: number, by: string, pricing: PricingSettings): Promise<void> {
  const qty = Math.max(0, Number(quantity) || 0);
  if (!qty) throw new Error('Enter a quantity.');
  const unitPrice = materialPrice(material, pricing);
  const part: ProjectPart = {
    id: genLineId(), materialId: material.id, name: material.name, quantity: qty,
    unitCost: Number(material.standardCost) || 0, unitPrice, taxable: material.taxable !== false,
    quoteLineId: null, addedBy: by, addedAt: new Date().toISOString(),
  };
  const patch: Record<string, unknown> = {};
  if (project.sourceQuoteId) {
    const snap = await getDoc(doc(db, 'quotes', project.sourceQuoteId));
    if (snap.exists()) {
      const quote = { ...snap.data(), id: snap.id } as QuoteWithDiscount;
      const lineId = genLineId();
      const lines: PriceLine[] = [...fromQuoteLines(quote.lineItems), {
        id: lineId, name: material.name, quantity: qty, unitPrice, section: 'material',
        taxable: part.taxable, itemRef: `mat:${material.id}`, required: true, sourceCategory: 'materials',
      }];
      const totals = quoteTotalsPatch(quote, lines, pricing);
      await updateDoc(doc(db, 'quotes', quote.id), totals);
      part.quoteLineId = lineId;
      patch.projectBudget = totals.total;
    }
  }
  await updateDoc(doc(db, 'projects', project.id), {
    ...patch, addedParts: [...(project.addedParts || []), part], updatedAt: new Date().toISOString(),
  });
}

/** Remove an added part — and its line from the linked quote. */
export async function removeProjectPart(project: Project, partId: string, pricing: PricingSettings): Promise<void> {
  const part = (project.addedParts || []).find(p => p.id === partId);
  if (!part) return;
  const patch: Record<string, unknown> = {};
  if (project.sourceQuoteId && part.quoteLineId) {
    const snap = await getDoc(doc(db, 'quotes', project.sourceQuoteId));
    if (snap.exists()) {
      const quote = { ...snap.data(), id: snap.id } as QuoteWithDiscount;
      const lines = fromQuoteLines(quote.lineItems).filter(l => l.id !== part.quoteLineId);
      const totals = quoteTotalsPatch(quote, lines, pricing);
      await updateDoc(doc(db, 'quotes', quote.id), totals);
      patch.projectBudget = totals.total;
    }
  }
  await updateDoc(doc(db, 'projects', project.id), {
    ...patch, addedParts: (project.addedParts || []).filter(p => p.id !== partId), updatedAt: new Date().toISOString(),
  });
}

/**
 * When a project is completed: a draft invoice from the linked quote (which
 * already holds any parts added on the project), or from the added parts
 * alone when there's no quote. Returns the existing one if already created.
 */
export async function createProjectInvoice(project: Project, pricing: PricingSettings): Promise<string | null> {
  if (project.invoiceId) return project.invoiceId;
  let quote: QuoteWithDiscount | null = null;
  if (project.sourceQuoteId) {
    const snap = await getDoc(doc(db, 'quotes', project.sourceQuoteId));
    if (snap.exists()) quote = { ...snap.data(), id: snap.id } as QuoteWithDiscount;
  }
  const lines: PriceLine[] = quote
    // Every quote line, as the quote's total counts them (parts added on the project included).
    ? fromQuoteLines(quote.lineItems)
    : (project.addedParts || []).map(p => ({ id: p.id, name: p.name, quantity: p.quantity, unitPrice: p.unitPrice, section: 'material' as const, taxable: p.taxable }));
  if (!lines.length) return null;
  const discount = quote?.planDiscount || null;
  const t = priceTotals(lines, discount, pricing.salesTaxPct);
  const id = await createDocId(ID_PREFIXES.INVOICE);
  const today = new Date();
  const invoice: Invoice = {
    id,
    invoiceNumber: `INV-${today.getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
    clientId: quote?.clientId || (project as any).clientId || '',
    clientName: quote?.customerCompany || quote?.customerName || project.client || '',
    customerEmail: quote?.customerType === 'external_customer' ? (quote.customerEmail || null) : null,
    projectId: project.id,
    issueDate: today.toISOString().slice(0, 10),
    dueDate: new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10),
    status: 'draft',
    lineItems: toInvoiceLines(lines),
    notes: quote?.terms || `Project: ${project.name}`,
    subtotal: t.subtotal, discountAmount: t.discountAmount, planDiscount: discount, tax: t.taxAmount, total: t.total,
    quoteId: quote?.id || null,
  };
  await setDoc(doc(db, 'invoices', id), JSON.parse(JSON.stringify(invoice)));
  await updateDoc(doc(db, 'projects', project.id), { invoiceId: id, updatedAt: new Date().toISOString() });
  if (quote) await updateDoc(doc(db, 'quotes', quote.id), { status: 'converted_to_invoice', convertedToInvoiceId: id, updatedAt: new Date().toISOString() });
  return id;
}
