'use client';
import { useSessionState } from '@/hooks/use-session-state';

import { useState, useEffect, useMemo } from 'react';
import { db, auth } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import type { Quote, QuoteOptionalGroup } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { isPast, parseISO, format } from 'date-fns';
import { PageHeader } from '@/components/page-header';
import { SearchField } from '@/components/search-field';
import { SortControl } from '@/components/list-toolbar';
import { EmptyState } from '@/components/empty-state';
import { usePaged, ListPager, PAGE_SIZES_SMALL } from '@/components/list-pager';
import { dateMillis } from '@/lib/request-intake';

type QuoteSort = 'date' | 'total' | 'expires' | 'title';
const quoteDate = (q: Quote) => dateMillis(q.sentAt ?? (q as Quote & { createdAt?: unknown }).createdAt);

const STATUS_CONFIG: Record<string, { label: string; variant: any }> = {
    sent:                      { label: 'Awaiting review',  variant: 'onhold' },
    viewed:                    { label: 'Under review',     variant: 'onhold' },
    changes_requested:         { label: 'Changes requested', variant: 'high' },
    approved:                  { label: 'Approved',         variant: 'active' },
    rejected:                  { label: 'Declined',         variant: 'missed' },
    expired:                   { label: 'Expired',          variant: 'outline' },
    archived:                  { label: 'Archived',         variant: 'outline' },
    converted_to_work_order:   { label: 'Converted',        variant: 'active' },
    converted_to_project:      { label: 'Converted',        variant: 'active' },
    converted_to_invoice:      { label: 'Invoiced',         variant: 'active' },
};

function fmtDate(iso: string | null | undefined) {
    if (!iso) return '—';
    try { return format(parseISO(iso), 'MMM d, yyyy'); } catch { return iso; }
}

function fmtCurrency(n: number) {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ClientQuotesPage() {
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [mounted, setMounted] = useState(false);
    const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
    const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
    const [isDeclineDialogOpen, setIsDeclineDialogOpen] = useState(false);
    const [approverName, setApproverName] = useState('');
    const [approverEmail, setApproverEmail] = useState('');
    const [approvalNote, setApprovalNote] = useState('');
    const [declineReason, setDeclineReason] = useState('');
    const [optionalChoices, setOptionalChoices] = useState<QuoteOptionalGroup[]>([]);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useSessionState('client/quotes:search', '');
    const [sortBy, setSortBy] = useSessionState<QuoteSort>('client/quotes:sortBy', 'date');
    const [dateAsc, setDateAsc] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
        const userId = sessionStorage.getItem('currentUserId');
        if (!userId) return;

        const unsubQuotes = onSnapshot(
            query(collection(db, 'quotes'), where('clientId', '==', userId)),
            (snap) => setQuotes(snap.docs.map(d => ({ ...d.data(), id: d.id } as Quote)))
        );

        return () => unsubQuotes();
    }, []);

    const openApprove = (quote: Quote) => {
        setSelectedQuote(quote);
        setOptionalChoices(quote.optionalChoices ?? []);
        const user = auth.currentUser;
        setApproverName(user?.displayName ?? '');
        setApproverEmail(user?.email ?? '');
        setApprovalNote('');
        setIsApproveDialogOpen(true);
    };

    const openDecline = (quote: Quote) => {
        setSelectedQuote(quote);
        setDeclineReason('');
        setIsDeclineDialogOpen(true);
    };

    // Answers go through /api/public-quote: client accounts can't write quotes
    // directly (rules), and the server keeps option prices from being edited.
    const respond = async (body: Record<string, unknown>) => {
        const idToken = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/public-quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
    };

    const handleApprove = async () => {
        if (!selectedQuote || !approverName.trim() || !approverEmail.trim()) return;
        setSaving(true);
        try {
            await respond({
                quoteId: selectedQuote.id,
                action: 'approve',
                approverName: approverName.trim(),
                approverEmail: approverEmail.trim(),
                approvalNote: approvalNote.trim() || null,
                optionalChoices,
            });
            toast({ title: 'Quote accepted', description: 'Your approval has been recorded. We will be in touch shortly.' });
            setIsApproveDialogOpen(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not accept quote', description: e.message });
        } finally {
            setSaving(false);
        }
    };

    const handleDecline = async () => {
        if (!selectedQuote || !declineReason.trim()) return;
        setSaving(true);
        try {
            await respond({ quoteId: selectedQuote.id, action: 'reject', rejectReason: declineReason.trim() });
            toast({ title: 'Quote declined', description: 'Your response has been recorded.' });
            setIsDeclineDialogOpen(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not decline quote', description: e.message });
        } finally {
            setSaving(false);
        }
    };

    const toggleOption = (groupId: string, optionId: string) => {
        setOptionalChoices(prev => prev.map(g => {
            if (g.id !== groupId) return g;
            return {
                ...g,
                options: g.options.map(o =>
                    o.id === optionId ? { ...o, selected: !o.selected } : o
                ),
            };
        }));
    };

    const optionsTotal = (choices: QuoteOptionalGroup[]) =>
        choices.flatMap(g => g.options).filter(o => o.selected).reduce((s, o) => s + o.priceAdjustment, 0);

    const isActionable = (quote: Quote) => {
        if (quote.status !== 'sent' && quote.status !== 'viewed') return false;
        if (quote.expirationDate) {
            try { if (isPast(parseISO(quote.expirationDate))) return false; } catch {}
        }
        return true;
    };

    const isExpired = (quote: Quote) => {
        if (quote.status === 'expired') return true;
        if (quote.expirationDate && (quote.status === 'sent' || quote.status === 'viewed')) {
            try { return isPast(parseISO(quote.expirationDate)); } catch {}
        }
        return false;
    };

    const visibleQuotes = useMemo(() => {
        const q = search.trim().toLowerCase();
        const rows = q
            ? quotes.filter(x => [x.quoteNumber, x.title, x.scopeSummary, STATUS_CONFIG[x.status]?.label]
                .some(v => (v || '').toLowerCase().includes(q)))
            : quotes;
        return [...rows].sort((a, b) => {
            if (sortBy === 'total') return (b.total ?? 0) - (a.total ?? 0);
            if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
            if (sortBy === 'expires') return (dateMillis(a.expirationDate) || Infinity) - (dateMillis(b.expirationDate) || Infinity);
            const d = quoteDate(a) - quoteDate(b);
            return dateAsc ? d : -d;
        });
    }, [quotes, search, sortBy, dateAsc]);

    const activeQuotes = visibleQuotes.filter(q => q.status === 'sent' || q.status === 'viewed' || q.status === 'changes_requested');
    const pastQuotes = visibleQuotes.filter(q => !['sent', 'viewed', 'changes_requested'].includes(q.status));
    const pastPager = usePaged(pastQuotes, PAGE_SIZES_SMALL, 'client-quotes-past', [search, sortBy, dateAsc]);

    if (!mounted) return null;

    const QuoteCard = ({ quote }: { quote: Quote }) => {
        const expired = isExpired(quote);
        const effective = expired ? 'expired' : quote.status;
        const cfg = STATUS_CONFIG[effective] ?? { label: quote.status, variant: 'outline' };
        const actionable = isActionable(quote);

        return (
            <Card className="rounded-xl bg-bg-secondary border-border-main shadow-sm">
                <CardHeader className="border-b border-border-sub text-left">
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                            <p className="font-mono text-[11px] font-semibold text-text-muted">{quote.quoteNumber}</p>
                            <CardTitle className="text-base font-semibold truncate">{quote.title}</CardTitle>
                            <CardDescription className="text-[12px]">
                                {quote.expirationDate
                                    ? (expired ? `Expired ${fmtDate(quote.expirationDate)}` : `Valid until ${fmtDate(quote.expirationDate)}`)
                                    : null}
                                {quote.sentAt ? ` · Sent ${fmtDate(quote.sentAt)}` : null}
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                            <Badge variant={cfg.variant}>{cfg.label}</Badge>
                            <p className="text-lg font-mono font-bold text-text-primary">{fmtCurrency(quote.total ?? 0)}</p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-5 space-y-4 text-left">
                    {quote.scopeSummary && (
                        <p className="text-[13px] text-text-secondary leading-relaxed">{quote.scopeSummary}</p>
                    )}

                    {quote.lineItems && quote.lineItems.length > 0 && (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-border-sub">
                                        <TableHead>Item</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="text-center">Qty</TableHead>
                                        <TableHead className="text-right">Unit price</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {quote.lineItems.map((item) => (
                                        <TableRow key={item.id} className="border-border-sub">
                                            <TableCell className="text-xs font-medium">{item.name}</TableCell>
                                            <TableCell className="text-xs text-text-muted">{item.description}</TableCell>
                                            <TableCell className="text-center text-xs">{item.quantity}</TableCell>
                                            <TableCell className="text-right font-mono text-xs">{fmtCurrency(item.unitPrice)}</TableCell>
                                            <TableCell className="text-right font-mono text-xs font-bold">{fmtCurrency(item.total)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {(quote.discountAmount ?? 0) > 0 && (
                                        <TableRow className="border-border-sub hover:bg-transparent">
                                            <TableCell colSpan={4} className="text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">Discount</TableCell>
                                            <TableCell className="text-right font-mono text-xs text-text-muted">-{fmtCurrency(quote.discountAmount ?? 0)}</TableCell>
                                        </TableRow>
                                    )}
                                    {(quote.taxAmount ?? 0) > 0 && (
                                        <TableRow className="border-border-sub hover:bg-transparent">
                                            <TableCell colSpan={4} className="text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">Tax</TableCell>
                                            <TableCell className="text-right font-mono text-xs text-text-muted">{fmtCurrency(quote.taxAmount ?? 0)}</TableCell>
                                        </TableRow>
                                    )}
                                    <TableRow className="border-t-2 border-border-main hover:bg-transparent">
                                        <TableCell colSpan={4} className="text-right text-[10px] font-semibold uppercase tracking-wider">Total</TableCell>
                                        <TableCell className="text-right font-mono font-bold text-text-primary">{fmtCurrency(quote.total ?? 0)}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    )}

                    {quote.optionalChoices && quote.optionalChoices.length > 0 && (
                        <div className="space-y-3 pt-2 border-t border-border-sub">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Optional add-ons</p>
                            {quote.optionalChoices.map(group => (
                                <div key={group.id} className="space-y-1.5">
                                    <p className="text-xs font-semibold text-text-primary">{group.title}</p>
                                    {group.description && <p className="text-[12px] text-text-muted">{group.description}</p>}
                                    <div className="space-y-1">
                                        {group.options.map(opt => (
                                            <div key={opt.id} className="flex items-center gap-2 text-[12px] text-text-secondary">
                                                <span className={opt.selected ? 'text-text-green font-semibold' : ''}>{opt.label}</span>
                                                {opt.priceAdjustment !== 0 && (
                                                    <span className="text-text-muted">(+{fmtCurrency(opt.priceAdjustment)})</span>
                                                )}
                                                {opt.selected && <CheckCircle2 size={12} className="text-text-green" />}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {quote.terms && (
                        <div className="pt-2 border-t border-border-sub">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Terms and conditions</p>
                            <p className="text-[12px] text-text-muted leading-relaxed">{quote.terms}</p>
                        </div>
                    )}

                    {quote.status === 'approved' && (
                        <div className="flex items-center gap-2 pt-2 border-t border-border-sub">
                            <CheckCircle2 size={13} className="text-text-green shrink-0" />
                            <p className="text-[12px] text-text-green font-semibold">
                                Approved by {quote.approvedByName} on {fmtDate(quote.approvedAt)}
                            </p>
                        </div>
                    )}

                    {quote.status === 'rejected' && (
                        <div className="space-y-1 pt-2 border-t border-border-sub">
                            <p className="text-[10px] font-semibold text-text-red uppercase tracking-wider">Declined</p>
                            {quote.rejectionReason && (
                                <p className="text-[12px] text-text-muted">{quote.rejectionReason}</p>
                            )}
                        </div>
                    )}

                    {actionable && (
                        <div className="flex items-center gap-3 pt-2 border-t border-border-sub">
                            <Button
                                className="bg-text-green hover:bg-text-green/90 text-white"
                                onClick={() => openApprove(quote)}
                            >
                                <CheckCircle2 size={14} className="mr-2" /> Accept quote
                            </Button>
                            <Button
                                variant="outline"
                                className="border-brand-red text-text-red hover:bg-brand-red-dim"
                                onClick={() => openDecline(quote)}
                            >
                                <XCircle size={14} className="mr-2" /> Decline
                            </Button>
                        </div>
                    )}

                    {expired && (quote.status === 'sent' || quote.status === 'viewed') && (
                        <div className="flex items-center gap-2 pt-2 border-t border-border-sub">
                            <AlertCircle size={13} className="text-text-muted shrink-0" />
                            <p className="text-[12px] text-text-muted">This quote has expired. Contact Aaromach for an updated quote.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="space-y-8">
            <PageHeader
                eyebrow="Client portal"
                icon={FileText}
                title="Quotes"
                subtitle="Review and respond to quotes from Aaromach."
            />

            {quotes.length === 0 ? (
                <EmptyState icon={FileText} title="No quotes yet" description="Contact Aaromach to request a quote." />
            ) : (
                <div className="space-y-6">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <SearchField value={search} onChange={setSearch} placeholder="Search by quote #, title or scope" className="sm:max-w-md" />
                        <SortControl
                            value={sortBy}
                            onChange={v => setSortBy(v as QuoteSort)}
                            options={[
                                { value: 'date', label: 'Date sent' },
                                { value: 'total', label: 'Total' },
                                { value: 'expires', label: 'Expires soonest' },
                                { value: 'title', label: 'Title' },
                            ]}
                            dateAsc={dateAsc}
                            onToggleDirection={() => setDateAsc(v => !v)}
                        />
                    </div>
                    {visibleQuotes.length === 0 && (
                        <EmptyState icon={FileText} title="No quotes match your search"
                            action={<Button variant="outline" size="sm" onClick={() => setSearch('')}>Clear search</Button>} />
                    )}
                    {activeQuotes.length > 0 && (
                        <section className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Clock size={12} className="text-text-muted" />
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Waiting for your response</p>
                            </div>
                            {activeQuotes.map(q => <QuoteCard key={q.id} quote={q} />)}
                        </section>
                    )}
                    {pastQuotes.length > 0 && (
                        <section className="space-y-4">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Past quotes</p>
                            {pastPager.items.map(q => <QuoteCard key={q.id} quote={q} />)}
                            <ListPager pager={pastPager} noun="quotes" />
                        </section>
                    )}
                </div>
            )}

            {/* Approve Dialog */}
            <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
                <DialogContent className="sm:max-w-[520px] bg-bg-elevated border-border-default">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold">Accept quote</DialogTitle>
                        <DialogDescription>
                            Confirm your name and email to approve this quote.
                            {selectedQuote && ` Quote total: ${fmtCurrency(selectedQuote.total + optionsTotal(optionalChoices))}`}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        {selectedQuote?.optionalChoices && selectedQuote.optionalChoices.length > 0 && (
                            <div className="space-y-3 pb-4 border-b border-border-sub">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Choose optional add-ons</p>
                                {optionalChoices.map(group => (
                                    <div key={group.id} className="space-y-2">
                                        <p className="text-[13px] font-semibold text-text-primary">{group.title}</p>
                                        {group.options.map(opt => (
                                            <div key={opt.id} className="flex items-center gap-2">
                                                <Checkbox
                                                    id={`opt-${opt.id}`}
                                                    checked={opt.selected}
                                                    onCheckedChange={() => toggleOption(group.id, opt.id)}
                                                />
                                                <Label htmlFor={`opt-${opt.id}`} className="text-[13px] cursor-pointer">
                                                    {opt.label}
                                                    {opt.priceAdjustment !== 0 && (
                                                        <span className="ml-1 text-text-muted">(+{fmtCurrency(opt.priceAdjustment)})</span>
                                                    )}
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[12px] font-medium text-text-secondary">Your name *</Label>
                                <Input
                                    value={approverName}
                                    onChange={e => setApproverName(e.target.value)}
                                    placeholder="Full name"
                                    className="bg-bg-primary"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[12px] font-medium text-text-secondary">Your email *</Label>
                                <Input
                                    type="email"
                                    value={approverEmail}
                                    onChange={e => setApproverEmail(e.target.value)}
                                    placeholder="you@company.com"
                                    className="bg-bg-primary"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[12px] font-medium text-text-secondary">Note (optional)</Label>
                            <Textarea
                                value={approvalNote}
                                onChange={e => setApprovalNote(e.target.value)}
                                placeholder="Any notes or special instructions..."
                                className="h-20 text-xs resize-none bg-bg-primary"
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-3 flex-row">
                        <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)} className="flex-1">
                            Cancel
                        </Button>
                        <Button
                            disabled={!approverName.trim() || !approverEmail.trim() || saving}
                            className="flex-1 bg-text-green hover:bg-text-green/90 text-white"
                            onClick={handleApprove}
                        >
                            <CheckCircle2 size={13} className="mr-1.5" />
                            {saving ? 'Saving…' : 'Accept quote'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Decline Dialog */}
            <Dialog open={isDeclineDialogOpen} onOpenChange={setIsDeclineDialogOpen}>
                <DialogContent className="sm:max-w-[440px] bg-bg-elevated border-border-default">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold">Decline quote</DialogTitle>
                        <DialogDescription>Let us know why you are declining this quote.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-2">
                        <Label className="text-[12px] font-medium text-text-secondary">Reason *</Label>
                        <Textarea
                            value={declineReason}
                            onChange={e => setDeclineReason(e.target.value)}
                            placeholder="e.g., Budget constraints, timing not right, going with another vendor..."
                            className="h-24 text-xs resize-none bg-bg-primary"
                        />
                    </div>
                    <DialogFooter className="gap-3 flex-row">
                        <Button variant="outline" onClick={() => setIsDeclineDialogOpen(false)} className="flex-1">
                            Cancel
                        </Button>
                        <Button
                            disabled={!declineReason.trim() || saving}
                            className="flex-1"
                            onClick={handleDecline}
                        >
                            {saving ? 'Saving…' : 'Decline quote'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
