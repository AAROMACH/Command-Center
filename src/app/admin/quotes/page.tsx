'use client';
import { useSessionState } from '@/hooks/use-session-state';
import { onSharedSnapshot } from '@/lib/shared-snapshot';

import { useState, useEffect, useMemo } from 'react';
import { usePaged, ListPager, PAGE_SIZES_LARGE } from '@/components/list-pager';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc, setDoc, addDoc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { surveySummary } from '@/lib/crm-survey';
import { useCrmPaths } from '@/lib/crm-paths';
import { createDocId } from '@/lib/generateId';
import { ID_PREFIXES } from '@/lib/constants';
import { syncLeadOnQuoteCreated } from '@/lib/crm-actions';
import type { Lead, SiteSurvey, Quote, QuoteStatus } from '@/lib/types';
import { PriceDocEditor, type PriceDocResult, type PriceDocValues } from '@/components/price-doc-editor';
import { fromQuoteLines, toQuoteLines, type PlanDiscount } from '@/lib/price-lines';
import { saveInvoiceFromEditor } from '@/lib/invoice-actions';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { isClient } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ViewToggle, useViewMode } from '@/components/view-toggle';
import { PageHeader } from '@/components/page-header';
import { InvoicesPanel } from '@/app/admin/financials/components/invoices-panel';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { SearchField } from '@/components/search-field';
import { SortControl } from '@/components/list-toolbar';
import { downloadCsv } from '@/app/admin/reports/components/history-tabs';
import { TONE_BADGE, statusLabel, type Tone } from '@/lib/status-styles';
import { parseLocalDate } from '@/lib/jobs';
import { format, parseISO } from 'date-fns';
import {
  FileSearch, Plus, Send, Copy, Clock, CheckCircle2, XCircle,
  Archive, RotateCcw, Trash2, ExternalLink, ChevronRight,
  Building2, User, Mail, Phone, DollarSign, FileText, Loader2,
  Edit3, ArrowRight, Settings, Download,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function genToken() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return 'qtk_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Quote status → shared status tone (lib/status-styles.ts).
const QUOTE_TONE: Record<string, Tone> = {
  draft: 'scheduled', sent: 'progress', viewed: 'info', changes_requested: 'progress', approved: 'done',
  converted_to_work_order: 'done', converted_to_project: 'done', converted_to_invoice: 'done',
  rejected: 'problem', expired: 'problem', archived: 'neutral', superseded: 'neutral',
};
const QUOTE_LABEL: Record<string, string> = {
  converted_to_work_order: 'Converted to job', converted_to_project: 'Converted to project', converted_to_invoice: 'Invoiced',
};

function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return (
    <Badge variant={TONE_BADGE[QUOTE_TONE[status] || 'neutral']} className="shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide">
      {QUOTE_LABEL[status] || statusLabel(status)}
    </Badge>
  );
}

const QUOTE_SORTS = [
  { value: 'date', label: 'Created' },
  { value: 'total', label: 'Total' },
  { value: 'customer', label: 'Customer' },
  { value: 'expires', label: 'Expiring' },
];

function fmtMoney(n: number) {
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

// ── New Quote (shared quote/invoice editor) ───────────────────────────────────

function NewQuoteDialog({
  open,
  onClose,
  onSaved,
  prefillLead,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Start the quote from a CRM lead — customer details and scope carry over. */
  prefillLead?: Lead | null;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  useEffect(() => onAuthStateChanged(auth, u => setFirebaseUser(u)), []);
  // The Sales Portal can't read client accounts, so it quotes external customers.
  const inSalesPortal = useCrmPaths().inSalesPortal;
  const [initial, setInitial] = useState<Partial<PriceDocValues> | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    if (!prefillLead) { setInitial(undefined); return; }
    const base: Partial<PriceDocValues> = {
      customerType: 'external_customer',
      customerName: prefillLead.contactName || prefillLead.companyName,
      customerCompany: prefillLead.companyName,
      customerEmail: prefillLead.contactEmail || '',
      customerPhone: prefillLead.contactPhone || '',
      title: [prefillLead.companyName, (prefillLead.serviceLines || []).join(' / ')].filter(Boolean).join(' — '),
      scopeSummary: [prefillLead.address, prefillLead.nextStep].filter(Boolean).join('\n'),
    };
    setInitial(base);
    // Pull the site survey takeoff into the scope so pricing starts from real counts.
    getDocs(query(collection(db, 'siteSurveys'), where('leadId', '==', prefillLead.id)))
      .then(snap => {
        const text = snap.docs.map(d => surveySummary({ ...d.data(), id: d.id } as SiteSurvey)).join('\n\n');
        if (text) setInitial({ ...base, scopeSummary: [base.scopeSummary, text].filter(Boolean).join('\n\n') });
      })
      .catch(() => {});
  }, [open, prefillLead?.id]);

  const handleSave = async (r: PriceDocResult) => {
    if (!firebaseUser) { toast({ variant: 'destructive', title: 'Authentication required', description: 'Please refresh and try again.' }); return; }
    if (!r.title) { toast({ variant: 'destructive', title: 'Title required' }); return; }
    if (r.customerType === 'external_customer' && !r.customerEmail) { toast({ variant: 'destructive', title: 'Customer email required' }); return; }

    setSaving(true);
    try {
      const quoteId = await createDocId(ID_PREFIXES.QUOTE);
      const c = r.client;
      const inApp = r.customerType === 'in_app_client';
      const now = new Date().toISOString();
      const quote: Omit<Quote, 'id'> & { planDiscount: PlanDiscount | null } = {
        quoteNumber: quoteId,
        customerType: r.customerType,
        clientId: inApp ? r.clientId : null,
        customerName: inApp ? (c?.clientCompany || c?.name || '') : r.customerName,
        customerCompany: inApp ? (c?.clientCompany || null) : (r.customerCompany || null),
        customerEmail: inApp ? (c?.email || '') : r.customerEmail,
        customerPhone: inApp ? (c?.phone || null) : (r.customerPhone || null),
        title: r.title,
        description: r.description,
        scopeSummary: r.scopeSummary,
        lineItems: toQuoteLines(r.lines),
        optionalChoices: r.optionalGroups,
        subtotal: r.totals.subtotal,
        taxAmount: r.totals.taxAmount,
        discountAmount: r.totals.discountAmount,
        planDiscount: r.discount,
        total: r.totals.total,
        terms: r.terms,
        expirationDate: r.expirationDate || null,
        publicToken: null,
        status: 'draft',
        sentAt: null,
        viewedAt: null,
        approvedAt: null,
        rejectedAt: null,
        approvedByName: null,
        approvedByEmail: null,
        approvalNote: null,
        rejectionReason: null,
        createdBy: firebaseUser.uid,
        createdAt: now,
        updatedAt: now,
        originalQuoteId: null,
        revisionNumber: 1,
        supersededByQuoteId: null,
        convertedToWorkOrderId: null,
        convertedToProjectId: null,
        convertedToInvoiceId: null,
        leadId: prefillLead?.id ?? null,
      };
      await setDoc(doc(db, 'quotes', quoteId), { id: quoteId, ...quote });
      if (prefillLead) {
        try {
          await syncLeadOnQuoteCreated(prefillLead, quoteId, r.totals.total, firebaseUser.uid);
        } catch {
          toast({ variant: 'destructive', title: 'Quote saved, but the CRM lead was not updated' });
        }
      }
      toast({ title: 'Quote created', description: `${quoteId} saved as draft.` });
      onSaved();
      onClose();
    } catch (e: any) {
      const desc = e?.code === 'permission-denied'
        ? 'Your account does not have permission to create quotes. Contact a super admin.'
        : e.message;
      toast({ variant: 'destructive', title: 'Failed', description: desc });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PriceDocEditor open={open} onClose={onClose} kind="quote" initial={initial} externalOnly={inSalesPortal}
      title="New quote" saveLabel="Save as draft" saving={saving} onSave={handleSave} />
  );
}

// ── Quote Card ────────────────────────────────────────────────────────────────

function QuoteCard({ quote, onClick }: { quote: Quote; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full rounded-xl border border-border-sub bg-bg-secondary p-4 space-y-3 text-left hover:border-border-main transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-text-primary truncate">{quote.title}</p>
          <p className="text-[12px] text-text-muted">{quote.customerName || quote.customerCompany}</p>
        </div>
        <QuoteStatusBadge status={quote.status} />
      </div>
      <div className="flex items-center gap-3 text-[12px] text-text-muted">
        <span className="font-mono">{quote.quoteNumber}</span>
        <span className="font-bold text-text-primary">{fmtMoney(quote.total)}</span>
        {quote.expirationDate && (
          <span className="flex items-center gap-1"><Clock size={12} />Expires {quote.expirationDate}</span>
        )}
      </div>
      {quote.lineItems.length > 0 && (
        <p className="text-[11px] text-text-muted">{quote.lineItems.length} line item{quote.lineItems.length !== 1 ? 's' : ''}</p>
      )}
    </button>
  );
}

function QuoteRow({ quote, onClick }: { quote: Quote; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border-sub bg-bg-secondary hover:border-border-main transition-colors text-left">
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-bold text-text-primary truncate">{quote.title}</p>
        <p className="text-[12px] text-text-muted truncate">
          <span className="font-mono">{quote.quoteNumber}</span> · {quote.customerName || quote.customerCompany}
        </p>
      </div>
      {quote.expirationDate && (
        <span className="hidden md:flex items-center gap-1 text-[12px] text-text-muted shrink-0"><Clock size={12} />Expires {quote.expirationDate}</span>
      )}
      <span className="text-[12px] font-bold text-text-primary shrink-0">{fmtMoney(quote.total)}</span>
      <QuoteStatusBadge status={quote.status} />
    </button>
  );
}

// ── Quote Detail Sheet ────────────────────────────────────────────────────────

function QuoteDetailSheet({
  quote,
  onClose,
  onUpdated,
  onCreateInvoice,
}: {
  quote: Quote | null;
  onClose: () => void;
  onUpdated: () => void;
  /** Admin only — opens the invoice editor filled in from this quote. */
  onCreateInvoice?: (q: Quote) => void;
}) {
  const { toast } = useToast();
  const paths = useCrmPaths();
  const [acting, setActing] = useState(false);

  if (!quote) return null;

  const publicUrl = quote.publicToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/public/quote/${quote.publicToken}`
    : null;

  const act = async (updates: Partial<Quote> & Record<string, any>) => {
    setActing(true);
    try {
      await updateDoc(doc(db, 'quotes', quote.id), { ...updates, updatedAt: new Date().toISOString() });
      toast({ title: 'Quote updated' });
      onUpdated();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setActing(false);
    }
  };

  const handleSend = async () => {
    const token = quote.customerType === 'external_customer' && !quote.publicToken ? genToken() : quote.publicToken;
    await act({ status: 'sent', sentAt: new Date().toISOString(), publicToken: token });
    toast({ title: 'Quote sent', description: 'Status updated to Sent.' });
  };

  const handleCopyLink = () => {
    if (publicUrl) {
      navigator.clipboard.writeText(publicUrl);
      toast({ title: 'Link copied', description: publicUrl });
    }
  };

  const handleConvert = async (target: 'work_order' | 'project') => {
    const field = target === 'work_order' ? 'convertedToWorkOrderId' : 'convertedToProjectId';
    const status: QuoteStatus = target === 'work_order' ? 'converted_to_work_order' : 'converted_to_project';
    const refId = `${target.replace('_', '-')}-${Date.now()}`;
    await act({ status, [field]: refId });
    toast({ title: `Quote converted to ${target.replace('_', ' ')}`, description: `Ref: ${refId}` });
  };

  return (
    <Sheet open={!!quote} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg bg-bg-secondary border-border-main overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border-sub">
          <SheetTitle className="text-base font-semibold">{quote.title}</SheetTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono text-text-muted">{quote.quoteNumber}</span>
            <QuoteStatusBadge status={quote.status} />
            <span className="text-[12px] font-bold text-text-primary">{fmtMoney(quote.total)}</span>
          </div>
        </SheetHeader>

        <div className="py-4 space-y-5">
          {/* Customer */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Customer</p>
            <p className="text-[13px] font-bold text-text-primary">{quote.customerName}</p>
            {quote.leadId && (
              <a href={paths.pipeline + `?lead=${quote.leadId}`} className="text-[12px] font-medium text-brand-red hover:underline">Open CRM lead →</a>
            )}
            {quote.customerCompany && <p className="text-[12px] text-text-secondary">{quote.customerCompany}</p>}
            {quote.customerEmail && (
              <p className="text-[11px] text-text-muted flex items-center gap-1"><Mail size={10} />{quote.customerEmail}</p>
            )}
            {quote.customerPhone && (
              <p className="text-[11px] text-text-muted flex items-center gap-1"><Phone size={10} />{quote.customerPhone}</p>
            )}
          </div>

          {/* Scope */}
          {quote.scopeSummary && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Scope</p>
              <p className="text-[12px] text-text-secondary leading-relaxed">{quote.scopeSummary}</p>
            </div>
          )}

          {/* Line items */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Line Items</p>
            <div className="rounded-lg border border-border-sub overflow-hidden">
              {quote.lineItems.map(item => (
                <div key={item.id} className="flex items-center justify-between px-3 py-2 border-b border-border-sub last:border-0">
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-text-primary truncate">{item.name}</p>
                    <p className="text-[11px] text-text-muted">{item.quantity} × {fmtMoney(item.unitPrice)} · {item.category}</p>
                  </div>
                  <span className="text-[12px] font-bold text-text-primary shrink-0 ml-3">{fmtMoney(item.total)}</span>
                </div>
              ))}
              <div className="px-3 py-2 bg-bg-tertiary space-y-0.5">
                <div className="flex justify-between text-[11px] text-text-muted">
                  <span>Subtotal</span><span>{fmtMoney(quote.subtotal)}</span>
                </div>
                {(quote.discountAmount ?? 0) > 0 && (
                  <div className="flex justify-between text-[11px] text-text-green">
                    <span>{(quote as Quote & { planDiscount?: PlanDiscount | null }).planDiscount?.planName ? `${(quote as Quote & { planDiscount?: PlanDiscount | null }).planDiscount!.planName} plan discount` : 'Discount'}</span>
                    <span>−{fmtMoney(quote.discountAmount ?? 0)}</span>
                  </div>
                )}
                {quote.taxAmount > 0 && (
                  <div className="flex justify-between text-[11px] text-text-muted">
                    <span>Tax</span><span>{fmtMoney(quote.taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[12px] font-bold text-text-primary border-t border-border-sub pt-1 mt-1">
                  <span>Total</span><span>{fmtMoney(quote.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Optional choices */}
          {quote.optionalChoices.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Optional Add-Ons</p>
              {quote.optionalChoices.map(g => (
                <div key={g.id} className="rounded-lg border border-border-sub p-3 space-y-1.5">
                  <p className="text-[12px] font-bold text-text-primary">{g.title}</p>
                  {g.options.map(o => (
                    <div key={o.id} className="flex items-center justify-between text-[10px]">
                      <span className={cn(o.selected ? 'text-text-green font-bold' : 'text-text-muted')}>{o.label}</span>
                      <span className="text-text-primary">+{fmtMoney(o.priceAdjustment)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Approval info */}
          {quote.approvedAt && (
            <div className="rounded-lg bg-text-green/5 border border-text-green/20 p-3 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-green">Approved</p>
              <p className="text-[12px] text-text-primary">{quote.approvedByName} — {quote.approvedByEmail}</p>
              <p className="text-[10px] text-text-muted">{format(parseISO(quote.approvedAt), 'MMM d, yyyy h:mm a')}</p>
              {quote.approvalNote && <p className="text-[12px] text-text-secondary">"{quote.approvalNote}"</p>}
            </div>
          )}
          {quote.rejectionReason && (
            <div className="rounded-lg bg-brand-red/5 border border-brand-red/20 p-3 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-brand-red">Rejected</p>
              <p className="text-[12px] text-text-secondary">"{quote.rejectionReason}"</p>
            </div>
          )}

          {/* Public link */}
          {publicUrl && (
            <div className="rounded-lg border border-border-sub p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Approval Link</p>
              <p className="text-[11px] text-text-muted font-mono break-all">{publicUrl}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-[11px] font-bold flex-1" onClick={handleCopyLink}>
                  <Copy size={10} className="mr-1" /> Copy Link
                </Button>
                <a href={publicUrl} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline" className="h-7 text-[11px] font-bold">
                    <ExternalLink size={10} />
                  </Button>
                </a>
              </div>
            </div>
          )}

          {/* In-app client delivery note */}
          {quote.customerType === 'in_app_client' && quote.status !== 'draft' && (
            <div className="rounded-lg border border-border-sub p-3 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Client Delivery</p>
              <p className="text-[11px] text-text-muted leading-relaxed">
                This quote is visible to the client in their portal. No external link is required.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="border-t border-border-sub pt-4 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Actions</p>
            <div className="grid grid-cols-2 gap-2">
              {quote.status === 'draft' && (
                <>
                  <Button size="sm" className="h-8 bg-brand-red hover:bg-brand-red/90 text-white col-span-2"
                    onClick={handleSend} disabled={acting}>
                    <Send size={14} className="mr-1.5" />Send quote
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 border-brand-red/30 text-brand-red hover:bg-brand-red/5"
                    onClick={() => act({ status: 'archived' })} disabled={acting}>
                    <Archive size={14} className="mr-1.5" />Archive
                  </Button>
                </>
              )}
              {(quote.status === 'sent' || quote.status === 'viewed') && (
                <>
                  <Button size="sm" variant="outline" className="h-8 col-span-2"
                    onClick={handleSend} disabled={acting}>
                    <RotateCcw size={14} className="mr-1.5" />Resend
                  </Button>
                  {publicUrl && (
                    <Button size="sm" variant="outline" className="h-8"
                      onClick={handleCopyLink} disabled={acting}>
                      <Copy size={14} className="mr-1.5" />Copy link
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-8 border-brand-red/30 text-brand-red hover:bg-brand-red/5"
                    onClick={() => act({ status: 'expired' })} disabled={acting}>
                    <Clock size={14} className="mr-1.5" />Mark expired
                  </Button>
                </>
              )}
              {quote.status === 'approved' && (
                <>
                  <Button size="sm" variant="outline" className="h-8"
                    onClick={() => handleConvert('work_order')} disabled={acting || !!quote.convertedToWorkOrderId}>
                    <ArrowRight size={14} className="mr-1.5" />Convert to job
                  </Button>
                  <Button size="sm" variant="outline" className="h-8"
                    onClick={() => handleConvert('project')} disabled={acting || !!quote.convertedToProjectId}>
                    <ArrowRight size={14} className="mr-1.5" />Convert to project
                  </Button>
                  {onCreateInvoice && <Button size="sm" className="h-8 bg-brand-red hover:bg-brand-red/90 text-white col-span-2"
                    onClick={() => onCreateInvoice(quote)} disabled={acting || !!quote.convertedToInvoiceId}>
                    <ArrowRight size={14} className="mr-1.5" />Create invoice
                  </Button>}
                  <Button size="sm" variant="outline" className="h-8 col-span-2"
                    onClick={() => act({ status: 'archived' })} disabled={acting}>
                    <Archive size={14} className="mr-1.5" />Archive
                  </Button>
                </>
              )}
              {(quote.status === 'rejected' || quote.status === 'expired') && (
                <Button size="sm" variant="outline" className="h-8 col-span-2"
                  onClick={() => act({ status: 'archived' })} disabled={acting}>
                  <Archive size={14} className="mr-1.5" />Archive
                </Button>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main Quotes Page ──────────────────────────────────────────────────────────

export default function AdminQuotesPage() {
  const { toast } = useToast();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const inSalesPortal = useCrmPaths().inSalesPortal;
  // New → Invoice, or an approved quote being invoiced.
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceFromQuote, setInvoiceFromQuote] = useState<Quote | null>(null);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const openInvoiceFromQuote = (q: Quote) => { setSelectedQuote(null); setInvoiceFromQuote(q); setInvoiceOpen(true); };
  const saveInvoice = async (r: PriceDocResult) => {
    setSavingInvoice(true);
    try {
      const q = invoiceFromQuote;
      const id = await saveInvoiceFromEditor(r, null, q ? { quoteId: q.id } : {});
      if (q) await updateDoc(doc(db, 'quotes', q.id), { status: 'converted_to_invoice', convertedToInvoiceId: id, updatedAt: new Date().toISOString() });
      toast({ title: 'Invoice created', description: `Invoice ${r.invoiceNumber} saved${q ? ` from ${q.quoteNumber}` : ''}.` });
      setInvoiceOpen(false);
      setInvoiceFromQuote(null);
      setTab('invoices');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not save invoice', description: e.message });
    } finally {
      setSavingInvoice(false);
    }
  };
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useViewMode('quotes');
  const [prefillLead, setPrefillLead] = useState<Lead | null>(null);
  const [tab, setTab] = useSessionState('admin/quotes:tab', 'draft');
  const [search, setSearch] = useSessionState('admin/quotes:search', '');
  const [sortBy, setSortBy] = useSessionState('admin/quotes:sortBy', 'date');
  const [sortAsc, setSortAsc] = useSessionState('admin/quotes:sortAsc', false);

  // /admin/quotes?leadId=… (from the CRM drawer) opens New Quote prefilled.
  useEffect(() => {
    const leadId = new URLSearchParams(window.location.search).get('leadId');
    if (!leadId) return;
    getDoc(doc(db, 'leads', leadId)).then(snap => {
      if (!snap.exists()) return;
      setPrefillLead({ ...snap.data(), id: snap.id } as Lead);
      setIsNewOpen(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const u1 = onSharedSnapshot('quotes', snap => {
      setQuotes(snap.docs.map(d => ({ ...d.data(), id: d.id } as Quote)));
      setLoading(false);
    }, () => setLoading(false));

    return () => { u1(); };
  }, []);

  // Search + sort apply to every tab; tab counts follow the search.
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q ? quotes.filter(x => [x.title, x.quoteNumber, x.customerName, x.customerCompany, x.customerEmail]
      .some(v => (v || '').toLowerCase().includes(q))) : quotes;
    const when = (x: Quote) => new Date(x.createdAt || 0).getTime() || 0;
    const exp = (x: Quote) => (x.expirationDate ? parseLocalDate(x.expirationDate)?.getTime() : undefined) ?? Number.MAX_SAFE_INTEGER;
    const who = (x: Quote) => (x.customerCompany || x.customerName || '').toLowerCase();
    return [...rows].sort((a, b) => {
      switch (sortBy) {
        case 'total': return (b.total || 0) - (a.total || 0);
        case 'customer': return who(a).localeCompare(who(b)) || when(b) - when(a);
        case 'expires': return exp(a) - exp(b);
        default: return sortAsc ? when(a) - when(b) : when(b) - when(a);
      }
    });
  }, [quotes, search, sortBy, sortAsc]);

  const draft     = shown.filter(q => q.status === 'draft');
  const sent      = shown.filter(q => q.status === 'sent' || q.status === 'viewed' || q.status === 'changes_requested');
  const approved  = shown.filter(q => q.status === 'approved' || q.status === 'converted_to_work_order' || q.status === 'converted_to_project' || q.status === 'converted_to_invoice');
  const rejected  = shown.filter(q => q.status === 'rejected' || q.status === 'expired' || q.status === 'archived' || q.status === 'superseded');

  function TabCount({ n }: { n: number }) {
    if (!n) return null;
    return (
      <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-brand-red text-white text-[10px] font-bold min-w-[16px] h-4 px-1">
        {n}
      </span>
    );
  }

  const grid = (items: Quote[], key: string) => (
    loading ? <LoadingState label="Loading quotes…" /> :
    <QuoteList items={items} viewMode={viewMode} onSelect={setSelectedQuote} storageKey={`quotes-${key}`}
      resetKeys={[search, sortBy, sortAsc]} searching={!!search.trim()} onClearSearch={() => setSearch('')} />
  );

  const tabRows: Record<string, Quote[]> = { draft, sent, approved, rejected };
  const exportCsv = () => {
    const rows = tabRows[tab] || [];
    downloadCsv(`quotes_${tab}`, ['Quote #', 'Title', 'Customer', 'Company', 'Email', 'Status', 'Subtotal', 'Tax', 'Total', 'Created', 'Sent', 'Expires', 'Quote ID'],
      rows.map(q => [q.quoteNumber, q.title, q.customerName, q.customerCompany, q.customerEmail, QUOTE_LABEL[q.status] || statusLabel(q.status),
        q.subtotal?.toFixed(2), q.taxAmount?.toFixed(2), q.total?.toFixed(2),
        q.createdAt ? format(new Date(q.createdAt), 'MM/dd/yyyy') : '', q.sentAt ? format(new Date(q.sentAt), 'MM/dd/yyyy') : '', q.expirationDate || '', q.id]));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        icon={FileSearch}
        title={inSalesPortal ? 'Quotes' : 'Quotes & Invoices'}
        subtitle={inSalesPortal ? 'Create, send and track quotes until the client approves them.' : 'Create, send and track quotes, then bill clients with invoices.'}
        actions={<>
          <ViewToggle value={viewMode} onChange={setViewMode} />
          {inSalesPortal ? (
            <Button onClick={() => setIsNewOpen(true)} className="bg-brand-red hover:bg-brand-red/90 text-white h-9">
              <Plus size={14} className="mr-1.5" />New quote
            </Button>
          ) : (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button className="bg-brand-red hover:bg-brand-red/90 text-white h-9"><Plus size={14} className="mr-1.5" />New</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setTimeout(() => setIsNewOpen(true), 0)}><FileSearch size={13} className="mr-2" />Quote</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTimeout(() => { setInvoiceFromQuote(null); setInvoiceOpen(true); }, 0)}><FileText size={13} className="mr-2" />Invoice</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchField className="flex-1 min-w-[220px]" value={search} onChange={setSearch} placeholder="Search title, quote #, customer, email…" />
        <SortControl value={sortBy} onChange={setSortBy} options={QUOTE_SORTS} dateAsc={sortAsc} onToggleDirection={() => setSortAsc(v => !v)} />
        <Button variant="outline" className="h-11 sm:h-9" onClick={exportCsv} disabled={!(tabRows[tab] || []).length}>
          <Download size={14} className="mr-1.5" /> Export CSV
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="tabs flex-wrap h-auto gap-1 p-1 mb-4">
          <TabsTrigger value="draft" className="tab">Draft<TabCount n={draft.length} /></TabsTrigger>
          <TabsTrigger value="sent" className="tab">Sent<TabCount n={sent.length} /></TabsTrigger>
          <TabsTrigger value="approved" className="tab">Approved<TabCount n={approved.length} /></TabsTrigger>
          <TabsTrigger value="rejected" className="tab">Rejected / expired<TabCount n={rejected.length} /></TabsTrigger>
          {!inSalesPortal && <TabsTrigger value="invoices" className="tab">Invoices</TabsTrigger>}
        </TabsList>

        <TabsContent value="draft" className="mt-0">{grid(draft, '0')}</TabsContent>
        <TabsContent value="sent" className="mt-0">{grid(sent, '1')}</TabsContent>
        <TabsContent value="approved" className="mt-0">{grid(approved, '2')}</TabsContent>
        <TabsContent value="rejected" className="mt-0">{grid(rejected, '3')}</TabsContent>
        <TabsContent value="invoices" className="mt-0"><InvoicesPanel search={search} onResetSearch={() => setSearch('')} hideNewButton /></TabsContent>
      </Tabs>

      <NewQuoteDialog
        open={isNewOpen}
        onClose={() => {
          setIsNewOpen(false);
          if (prefillLead) { setPrefillLead(null); window.history.replaceState(null, '', window.location.pathname); }
        }}
        onSaved={() => {}}
        prefillLead={prefillLead}
      />

      <QuoteDetailSheet
        quote={selectedQuote}
        onClose={() => setSelectedQuote(null)}
        onUpdated={() => setSelectedQuote(null)}
        onCreateInvoice={inSalesPortal ? undefined : openInvoiceFromQuote}
      />

      <PriceDocEditor
        open={invoiceOpen}
        onClose={() => { setInvoiceOpen(false); setInvoiceFromQuote(null); }}
        kind="invoice"
        initial={invoiceFromQuote ? {
          customerType: invoiceFromQuote.customerType,
          clientId: invoiceFromQuote.clientId || '',
          customerName: invoiceFromQuote.customerName,
          customerCompany: invoiceFromQuote.customerCompany || '',
          customerEmail: invoiceFromQuote.customerEmail,
          customerPhone: invoiceFromQuote.customerPhone || '',
          terms: invoiceFromQuote.terms,
          lines: fromQuoteLines(invoiceFromQuote.lineItems),
        } : undefined}
        initialDiscount={invoiceFromQuote ? ((invoiceFromQuote as Quote & { planDiscount?: PlanDiscount | null }).planDiscount ?? null) : undefined}
        title={invoiceFromQuote ? `Invoice from ${invoiceFromQuote.quoteNumber}` : 'New invoice'}
        saveLabel="Save invoice"
        saving={savingInvoice}
        onSave={saveInvoice}
      />
    </div>
  );
}

/** One section of quotes, paged (25/50/100) so a busy pipeline doesn't render every quote. */
function QuoteList({ items, viewMode, onSelect, storageKey, resetKeys, searching, onClearSearch }: {
  items: Quote[];
  viewMode: string;
  onSelect: (q: Quote) => void;
  storageKey: string;
  resetKeys: unknown[];
  searching: boolean;
  onClearSearch: () => void;
}) {
  const pager = usePaged(items, PAGE_SIZES_LARGE, storageKey, resetKeys);
  if (items.length === 0) {
    return searching ? (
      <EmptyState icon={FileSearch} title="No quotes match this search"
        action={<Button size="sm" variant="outline" onClick={onClearSearch}>Clear search</Button>} />
    ) : (
      <EmptyState icon={FileSearch} title="No quotes here yet" description="Quotes move between these tabs as you send them and clients respond." />
    );
  }
  return (
    <>
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {pager.items.map(q => <QuoteCard key={q.id} quote={q} onClick={() => onSelect(q)} />)}
        </div>
      ) : (
        <div className="space-y-1">
          {pager.items.map(q => <QuoteRow key={q.id} quote={q} onClick={() => onSelect(q)} />)}
        </div>
      )}
      <ListPager pager={pager} noun="quotes" />
    </>
  );
}
