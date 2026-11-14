// Type only: the library (~350 KB) loads when a PDF is made, not with the page.
import type jsPDF from 'jspdf';
import { depositAmountFor, paymentTermsText } from './quote-deposit';
import { DEFAULT_ASSUMPTIONS } from './estimating';
import { discountLineLabel, formatQty, lineUnit } from './price-lines';
import type { Invoice, Quote } from './types';

/**
 * Invoice as a branded PDF (Aaromach logo, bill-to, line items, subtotal,
 * plan discount as its own line, tax, total, notes and how to pay) — to
 * download and email until invoices are sent from an accounting system.
 * Built in the browser with jsPDF, like the paystub.
 */

/** Company block on every invoice. Fill in address / phone / email to show them. */
export const COMPANY = {
  name: 'AAROMACH LLC',
  website: 'www.aaromach.com',
  address: '',
  phone: '',
  email: '',
};

export type InvoicePdfData = {
  /** 'quote' = titled QUOTE, "Valid until" instead of "Due", signature lines. */
  kind?: 'invoice' | 'quote';
  /** Quotes: the quote's title. */
  title?: string;
  /** Quotes: scope summary shown above the lines. */
  scope?: string;
  invoiceNumber: string;
  clientName: string;
  customerEmail?: string | null;
  issueDate?: string;
  dueDate?: string;
  status?: string;
  /** e.g. "Project PRJ-0012" or "Job ASMT-0041". */
  reference?: string | null;
  lineItems: { description: string; quantity: number; unitPrice: number; category?: string; multiplier?: number; isEmergencyProtocol?: boolean; unit?: string; itemRef?: string; optional?: boolean }[];
  /** Quotes: add-on choices the customer can pick on approval — not in the total. */
  addOns?: { group: string; description?: string; options: { label: string; price: number; selected: boolean }[] }[];
  subtotal: number;
  discountAmount?: number;
  discountLabel?: string | null;
  tax: number;
  total: number;
  notes?: string;
  /** Quotes: payment terms in plain words (net terms + deposit). */
  paymentTerms?: string;
};

export function invoicePdfData(inv: Invoice): InvoicePdfData {
  return {
    invoiceNumber: inv.invoiceNumber,
    clientName: inv.clientName,
    customerEmail: inv.customerEmail,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    status: inv.status,
    reference: inv.projectId ? `Project ${inv.projectId.toUpperCase()}`
      : (inv.workOrderIds?.length || 0) > 1 ? `${inv.workOrderIds!.length} jobs: ${inv.workOrderIds!.map(i => i.toUpperCase()).join(', ')}`
      : inv.workOrderId ? `Job ${inv.workOrderId.toUpperCase()}` : null,
    lineItems: inv.lineItems || [],
    subtotal: Number(inv.subtotal ?? inv.total) || 0,
    discountAmount: Number(inv.discountAmount) || 0,
    discountLabel: inv.planDiscount ? discountLineLabel(inv.planDiscount) : null,
    tax: Number(inv.tax) || 0,
    total: Number(inv.total) || 0,
    notes: inv.notes,
  };
}

/** A quote as PDF data (line prices only — never cost or margin). */
export function quotePdfData(q: Quote): InvoicePdfData {
  const lines = (q.lineItems || []).map(l => ({
    description: l.name, quantity: l.quantity, unitPrice: l.unitPrice,
    category: ['labor', 'service', 'travel'].includes(l.category) ? 'labor' : 'material',
    unit: (l as { unit?: string }).unit, itemRef: (l as { itemRef?: string }).itemRef,
    multiplier: (l as { multiplier?: number }).multiplier,
    optional: l.required === false,
  }));
  const pd = (q as Quote & { planDiscount?: Parameters<typeof discountLineLabel>[0] }).planDiscount;
  return {
    kind: 'quote', title: q.title, scope: q.scopeSummary || q.description,
    invoiceNumber: q.quoteNumber, clientName: q.customerCompany || q.customerName, customerEmail: q.customerEmail,
    issueDate: (q.sentAt || q.createdAt || '').slice(0, 10), dueDate: q.expirationDate || undefined, status: q.status,
    lineItems: lines, subtotal: Number(q.subtotal) || 0, discountAmount: Number(q.discountAmount) || 0,
    discountLabel: pd ? discountLineLabel(pd) : null, tax: Number(q.taxAmount) || 0, total: Number(q.total) || 0, notes: q.terms,
    paymentTerms: paymentTermsText(q.paymentTerms, q.deposit?.kind === 'percent' ? Number(q.deposit.value) : 0, Number(q.depositAmount) || depositAmountFor(Number(q.total) || 0, q.deposit), money),
    addOns: (q.optionalChoices || []).filter(g => (g.options || []).length).map(g => ({
      group: g.title || 'Options', description: g.description || undefined,
      options: g.options.map(o => ({ label: o.label, price: Number(o.priceAdjustment) || 0, selected: !!o.selected })),
    })),
  };
}

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const fmtDate = (s?: string) => {
  if (!s) return '—';
  const d = new Date(s.length === 10 ? `${s}T12:00:00` : s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};
const lineFactor = (l: InvoicePdfData['lineItems'][number]) =>
  l.category === 'labor' ? (typeof l.multiplier === 'number' ? l.multiplier : l.isEmergencyProtocol ? 1.5 : 1) : 1;

// The 1024 px logo, shrunk before embedding (jsPDF stores PNGs uncompressed).
const LOGO_PX = 320;
let logoPromise: Promise<string | null> | null = null;
function loadLogo(): Promise<string | null> {
  if (!logoPromise) {
    logoPromise = fetch(encodeURI('/aaromach no bg.png'))
      .then(res => (res.ok ? res.blob() : Promise.reject(new Error('logo'))))
      .then(blob => createImageBitmap(blob))
      .then(bitmap => {
        const canvas = document.createElement('canvas');
        canvas.width = LOGO_PX; canvas.height = LOGO_PX;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(bitmap, 0, 0, LOGO_PX, LOGO_PX);
        return canvas.toDataURL('image/png');
      })
      .catch(() => null);
  }
  return logoPromise;
}

export async function buildInvoicePdf(data: InvoicePdfData, opts: { paymentTerms?: string } = {}): Promise<jsPDF> {
  const { default: JsPDF } = await import('jspdf');
  const doc = new JsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const logo = await loadLogo();
  const RED: [number, number, number] = [204, 34, 0];
  let y = M;

  // ── Header: logo + company (left), INVOICE + number and dates (right) ──
  if (logo) doc.addImage(logo, 'PNG', M, y - 6, 64, 64);
  const cx = logo ? M + 76 : M;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(20);
  doc.text(COMPANY.name, cx, y + 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(100);
  [COMPANY.address, [COMPANY.phone, COMPANY.email].filter(Boolean).join('  ·  '), COMPANY.website].filter(Boolean)
    .forEach((t, i) => doc.text(t, cx, y + 30 + i * 12));

  doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.setTextColor(...RED);
  const isQuote = data.kind === 'quote';
  doc.text(isQuote ? 'QUOTE' : 'INVOICE', W - M, y + 18, { align: 'right' });
  doc.setFontSize(10); doc.setTextColor(20);
  const meta: [string, string][] = isQuote
    ? [['Quote #', data.invoiceNumber], ['Date', fmtDate(data.issueDate)], ['Valid until', fmtDate(data.dueDate)]]
    : [['Invoice #', data.invoiceNumber], ['Issued', fmtDate(data.issueDate)], ['Due', fmtDate(data.dueDate)]];
  meta.forEach(([k, v], i) => {
    doc.setFont('helvetica', 'normal'); doc.setTextColor(110); doc.text(k, W - M - 150, y + 38 + i * 14);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(20); doc.text(v, W - M, y + 38 + i * 14, { align: 'right' });
  });
  y += 96;

  // ── Bill to ──
  doc.setDrawColor(225); doc.setLineWidth(0.75); doc.line(M, y, W - M, y);
  y += 20;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(120);
  doc.text(isQuote ? 'PREPARED FOR' : 'BILL TO', M, y);
  if (data.reference) doc.text('FOR', W / 2, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20);
  doc.text(data.clientName || '—', M, y + 15);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(90);
  if (data.customerEmail) doc.text(data.customerEmail, M, y + 28);
  if (data.reference) doc.text(doc.splitTextToSize(data.reference, W / 2 - M) as string[], W / 2, y + 15);
  y += 52;
  if (isQuote && (data.title || data.scope)) {
    if (data.title) { doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(20); doc.text(doc.splitTextToSize(data.title, W - 2 * M) as string[], M, y); y += 18; }
    if (data.scope) {
      const sc = doc.splitTextToSize(data.scope, W - 2 * M) as string[];
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(70);
      doc.text(sc.slice(0, 14), M, y); y += Math.min(sc.length, 14) * 12 + 14;
    }
  }

  // ── Line items ──
  const col = { desc: M + 8, qty: W - M - 236, unit: W - M - 228, rate: W - M - 100, amt: W - M - 8 };
  const header = () => {
    doc.setFillColor(245, 245, 245); doc.rect(M, y - 13, W - 2 * M, 22, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(90);
    doc.text('DESCRIPTION', col.desc, y + 1);
    doc.text('QTY', col.qty, y + 1, { align: 'right' });
    doc.text('UNIT', col.unit, y + 1);
    doc.text('RATE', col.rate, y + 1, { align: 'right' });
    doc.text('AMOUNT', col.amt, y + 1, { align: 'right' });
    y += 22;
  };
  const newPageIfNeeded = (need: number) => {
    if (y + need <= H - 90) return false;
    doc.addPage(); y = M; return true;
  };
  header();
  doc.setFontSize(9.5);
  for (const l of data.lineItems) {
    const f = lineFactor(l);
    const desc = `${l.description || 'Item'}${f !== 1 ? `  (×${f})` : ''}${l.optional ? '  (optional)' : ''}`;
    const wrapped = doc.splitTextToSize(desc, col.qty - col.desc - 30) as string[];
    const rowH = Math.max(18, wrapped.length * 12 + 6);
    if (newPageIfNeeded(rowH)) header();
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30);
    doc.text(wrapped, col.desc, y);
    const unit = lineUnit({ ...l, section: l.category === 'labor' ? 'labor' : 'material' });
    doc.text(formatQty(l.quantity), col.qty, y, { align: 'right' });
    if (unit) { doc.setTextColor(100); doc.text(unit.slice(0, 12), col.unit, y); doc.setTextColor(30); }
    doc.text(money(Number(l.unitPrice) || 0), col.rate, y, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(money((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * f), col.amt, y, { align: 'right' });
    y += rowH;
    doc.setDrawColor(238); doc.line(M, y - 10, W - M, y - 10);
  }
  if (!data.lineItems.length) { doc.setTextColor(140); doc.text('No line items.', col.desc, y); y += 18; }

  // ── Totals ──
  newPageIfNeeded(110);
  y += 6;
  const tx = W - M - 280;
  const row = (label: string, value: string, opts2: { bold?: boolean; color?: [number, number, number]; size?: number } = {}) => {
    doc.setFont('helvetica', opts2.bold ? 'bold' : 'normal'); doc.setFontSize(opts2.size || 10);
    doc.setTextColor(...(opts2.color || [60, 60, 60]));
    // Long labels (a plan discount) wrap instead of running into the amount.
    const lines = doc.splitTextToSize(label, 190) as string[];
    doc.text(lines, tx, y);
    doc.text(value, W - M - 8, y, { align: 'right' });
    y += (opts2.size || 10) + 7 + (lines.length - 1) * 12;
  };
  row('Subtotal', money(data.subtotal));
  if ((data.discountAmount || 0) > 0) row(data.discountLabel || 'Discount', `-${money(data.discountAmount!)}`, { color: [31, 138, 85] });
  if (data.tax > 0) row('Tax', money(data.tax));
  doc.setDrawColor(20); doc.setLineWidth(1); doc.line(tx, y - 4, W - M, y - 4); y += 10;
  const paid = data.status === 'paid';
  row(isQuote ? 'Quote total' : paid ? 'Total (paid)' : 'Total due', money(data.total), { bold: true, size: 13, color: paid && !isQuote ? [31, 138, 85] : [20, 20, 20] });

  // ── Optional add-ons (quotes): picked on approval, not in the total ──
  if (isQuote && data.addOns?.length) {
    y += 12;
    newPageIfNeeded(40);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(120);
    doc.text('OPTIONAL ADD-ONS', M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.text('Not included in the quote total above — choose any when you approve.', M + 110, y);
    y += 16;
    for (const g of data.addOns) {
      newPageIfNeeded(30);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(30);
      doc.text(g.group, M + 8, y); y += 13;
      if (g.description) {
        const dl = doc.splitTextToSize(g.description, W - 2 * M - 16) as string[];
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(100);
        doc.text(dl, M + 8, y); y += dl.length * 11 + 2;
      }
      for (const o of g.options) {
        const ol = doc.splitTextToSize(o.label, W - 2 * M - 160) as string[];
        newPageIfNeeded(ol.length * 12 + 6);
        // Checkbox (filled when the customer already picked it).
        doc.setDrawColor(120); doc.setLineWidth(0.75); doc.rect(M + 16, y - 8, 9, 9);
        if (o.selected) { doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(31, 138, 85); doc.text('X', M + 18.2, y - 0.3); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(40);
        doc.text(ol, M + 32, y);
        doc.text(`${o.price >= 0 ? '+' : '-'}${money(Math.abs(o.price))}`, W - M - 8, y, { align: 'right' });
        y += ol.length * 12 + 4;
      }
      y += 6;
    }
  }

  // ── Notes + how to pay ──
  const blocks: [string, string][] = [];
  if (isQuote && data.paymentTerms) blocks.push(['PAYMENT TERMS', data.paymentTerms]);
  if (data.notes?.trim()) blocks.push([isQuote ? 'TERMS' : 'NOTES', data.notes.trim()]);
  if (!isQuote) blocks.push(['PAYMENT', opts.paymentTerms || DEFAULT_ASSUMPTIONS.paymentTerms]);
  y += 14;
  for (const [title, text] of blocks) {
    const lines = doc.splitTextToSize(text, W - 2 * M) as string[];
    newPageIfNeeded(24 + lines.length * 12);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(120); doc.text(title, M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(50); doc.text(lines, M, y + 14);
    y += 24 + lines.length * 12;
  }

  if (isQuote) {
    // Acceptance: sign and return to approve.
    newPageIfNeeded(90);
    y += 10;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(120); doc.text('ACCEPTANCE', M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(50);
    doc.text('To approve this quote, sign below and return it to us.', M, y + 14);
    y += 52;
    doc.setDrawColor(150); doc.setLineWidth(0.75);
    doc.line(M, y, M + 220, y); doc.line(M + 250, y, M + 380, y); doc.line(M + 410, y, W - M, y);
    doc.setFontSize(8.5); doc.setTextColor(120);
    doc.text('Signature', M, y + 12); doc.text('Printed name', M + 250, y + 12); doc.text('Date', M + 410, y + 12);
  }

  if (paid && !isQuote) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(54); doc.setTextColor(31, 138, 85);
    doc.text('PAID', W - M - 10, 210, { align: 'right', angle: 18 });
  }

  // ── Footer on every page ──
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(230); doc.setLineWidth(0.5); doc.line(M, H - 48, W - M, H - 48);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(130);
    doc.text(`Thank you for your business — ${COMPANY.name} · ${COMPANY.website}`, M, H - 32);
    doc.text(`${isQuote ? 'Quote' : 'Invoice'} ${data.invoiceNumber} · page ${p} of ${pages}`, W - M, H - 32, { align: 'right' });
  }
  return doc;
}

/** Build and download "Aaromach-Invoice-<number>.pdf". */
export async function downloadInvoicePdf(data: InvoicePdfData, opts: { paymentTerms?: string } = {}): Promise<void> {
  const doc = await buildInvoicePdf(data, opts);
  doc.save(`Aaromach-${data.kind === 'quote' ? 'Quote' : 'Invoice'}-${(data.invoiceNumber || 'draft').replace(/[^\w-]+/g, '_')}.pdf`);
}
