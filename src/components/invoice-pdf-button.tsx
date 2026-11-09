'use client';

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { buildInvoicePdf, downloadInvoicePdf, invoicePdfData, quotePdfData, type InvoicePdfData } from '@/lib/invoice-pdf';
import { unitLabel } from '@/lib/price-lines';
import { DEFAULT_SERVICES } from '@/lib/estimating';
import type { Invoice, Quote } from '@/lib/types';

/**
 * Lines saved before units existed: look the unit up in the price book
 * (materials, labor rates, service catalog). Best effort — anything that
 * can't be read (e.g. a client's browser) falls back to the PDF's guess.
 */
async function withPriceBookUnits(d: InvoicePdfData): Promise<InvoicePdfData> {
  const missing = d.lineItems.filter(l => !l.unit && l.itemRef);
  if (!missing.length) return d;
  const units = new Map<string, string>();
  const read = async (path: [string, string]) => (await getDoc(doc(db, ...path)).catch(() => null))?.data();
  const mats = [...new Set(missing.map(l => l.itemRef!).filter(r => r.startsWith('mat:')))];
  await Promise.all(mats.map(async r => { const m = await read(['materials', r.slice(4)]); if (m?.unitType) units.set(r, unitLabel(m.unitType)); }));
  if (missing.some(l => l.itemRef!.startsWith('rate:'))) {
    const p = await read(['adminConfig', 'pricing']);
    for (const r of (p?.laborRates || []) as { id: string; unit: string }[]) units.set(`rate:${r.id}`, r.unit === 'hour' ? 'hr' : 'job');
  }
  if (missing.some(l => l.itemRef!.startsWith('svc:'))) {
    const e = await read(['adminConfig', 'estimating']);
    for (const s of [...DEFAULT_SERVICES, ...((e?.services || []) as { code: string; unit: string }[])]) units.set(`svc:${s.code}`, unitLabel(s.unit));
  }
  return { ...d, lineItems: d.lineItems.map(l => (!l.unit && l.itemRef && units.has(l.itemRef) ? { ...l, unit: units.get(l.itemRef) } : l)) };
}

/** "PDF" — downloads the invoice as a branded PDF to attach to an email. */
export function InvoicePdfButton({ invoice, data, label = 'PDF', className, variant = 'outline', size = 'sm' }: {
  invoice?: Invoice;
  /** Pre-shaped data (e.g. the client's invoice link page). */
  data?: InvoicePdfData;
  label?: string;
  className?: string;
  variant?: 'outline' | 'ghost' | 'default';
  size?: 'sm' | 'default';
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const go = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const d = data || (invoice ? invoicePdfData(invoice) : null);
    if (!d) return;
    setBusy(true);
    try { await downloadInvoicePdf(await withPriceBookUnits(d)); }
    catch (err: any) { toast({ variant: 'destructive', title: 'Could not make the PDF', description: err?.message }); }
    finally { setBusy(false); }
  };
  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={go} disabled={busy} title="Download the invoice as a PDF to email">
      {busy ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <FileDown size={13} className="mr-1.5" />}{label}
    </Button>
  );
}

/** "Download PDF" for a quote — prices only, never cost or margin. */
export function QuotePdfButton({ quote, className = 'h-8 w-full' }: { quote: Quote; className?: string }) {
  return <InvoicePdfButton data={quotePdfData(quote)} label="Download PDF" className={className} />;
}

/**
 * The same PDF as the download button, as base64 — attached to the quote /
 * invoice email by the send routes. Null if it can't be built (the email still goes).
 */
export async function pdfAttachmentFor(src: { invoice?: Invoice; quote?: Quote }): Promise<{ filename: string; content: string } | null> {
  try {
    const d = src.invoice ? invoicePdfData(src.invoice) : src.quote ? quotePdfData(src.quote) : null;
    if (!d) return null;
    const pdf = await buildInvoicePdf(await withPriceBookUnits(d));
    const content = String(pdf.output('datauristring')).split(',')[1] || '';
    if (!content) return null;
    const filename = `Aaromach-${d.kind === 'quote' ? 'Quote' : 'Invoice'}-${(d.invoiceNumber || 'draft').replace(/[^\w-]+/g, '_')}.pdf`;
    return { filename, content };
  } catch { return null; }
}
