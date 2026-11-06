'use client';

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { downloadInvoicePdf, invoicePdfData, type InvoicePdfData } from '@/lib/invoice-pdf';
import type { Invoice } from '@/lib/types';

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
    try { await downloadInvoicePdf(d); }
    catch (err: any) { toast({ variant: 'destructive', title: 'Could not make the PDF', description: err?.message }); }
    finally { setBusy(false); }
  };
  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={go} disabled={busy} title="Download the invoice as a PDF to email">
      {busy ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <FileDown size={13} className="mr-1.5" />}{label}
    </Button>
  );
}
