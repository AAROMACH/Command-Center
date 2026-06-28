'use client';

import { useState, useEffect } from 'react';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, doc, updateDoc } from 'firebase/firestore';
import type { Quote } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { isPast, parseISO } from 'date-fns';

export default function ClientQuotesPage() {
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [mounted, setMounted] = useState(false);
    const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
    const [isDeclineDialogOpen, setIsDeclineDialogOpen] = useState(false);
    const [declineReason, setDeclineReason] = useState('');
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

    const handleAccept = async (quote: Quote) => {
        try {
            await updateDoc(doc(db, 'quotes', quote.id), { status: 'accepted' });
            toast({ title: 'Quote Accepted', description: 'Your acceptance has been recorded.' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        }
    };

    const handleDecline = async () => {
        if (!selectedQuote) return;
        try {
            await updateDoc(doc(db, 'quotes', selectedQuote.id), {
                status: 'declined',
                ...(declineReason.trim() ? { declineReason: declineReason.trim() } : {}),
            });
            toast({ title: 'Quote Declined', description: 'Your response has been recorded.' });
            setIsDeclineDialogOpen(false);
            setDeclineReason('');
            setSelectedQuote(null);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        }
    };

    const getQuoteStatus = (quote: Quote): { label: string; variant: any } => {
        if (quote.status === 'accepted') return { label: 'Accepted', variant: 'active' };
        if (quote.status === 'declined') return { label: 'Declined', variant: 'missed' };
        try {
            if (isPast(parseISO(quote.expiresAt))) return { label: 'Expired', variant: 'outline' };
        } catch {}
        return { label: 'Pending', variant: 'onhold' };
    };

    if (!mounted) return null;

    return (
        <div className="space-y-8">
            <header className="page-header">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2"><FileText size={12} />Client Portal</p>
                    <h1 className="page-title">Quotes</h1>
                    <p className="page-subtitle">Review and respond to service proposals from Aaromach.</p>
                </div>
            </header>

            {quotes.length === 0 ? (
                <Card>
                    <CardContent className="py-24 text-center space-y-3">
                        <FileText size={32} className="mx-auto text-text-muted opacity-30" />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">No quotes on file.</p>
                        <p className="text-[9px] text-text-muted">Contact Aaromach to request a service proposal.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {quotes.map(quote => {
                        const { label, variant } = getQuoteStatus(quote);
                        let isExpired = false;
                        try { isExpired = isPast(parseISO(quote.expiresAt)) && quote.status === 'pending'; } catch {}
                        const isPending = quote.status === 'pending' && !isExpired;
                        return (
                            <Card key={quote.id} className="bg-bg-secondary border-border-main">
                                <CardHeader className="border-b border-border-sub bg-bg-tertiary/30 text-left">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="space-y-1 min-w-0">
                                            <CardTitle className="text-sm uppercase tracking-wide truncate">{quote.title}</CardTitle>
                                            <CardDescription className="text-[10px]">
                                                Valid until: {quote.expiresAt} · Sent: {quote.sentAt}
                                            </CardDescription>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <Badge variant={variant}>{label}</Badge>
                                            <p className="text-lg font-mono font-bold text-text-primary">${(quote.total || 0).toLocaleString()}</p>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-5 space-y-4 text-left">
                                    {quote.scopeOfWork && (
                                        <p className="text-xs text-text-secondary leading-relaxed">{quote.scopeOfWork}</p>
                                    )}
                                    {quote.lineItems && quote.lineItems.length > 0 && (
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="hover:bg-transparent border-border-sub">
                                                    <TableHead className="text-[10px] uppercase font-bold tracking-widest">Description</TableHead>
                                                    <TableHead className="text-center text-[10px] uppercase font-bold tracking-widest">Qty</TableHead>
                                                    <TableHead className="text-right text-[10px] uppercase font-bold tracking-widest">Unit Price</TableHead>
                                                    <TableHead className="text-right text-[10px] uppercase font-bold tracking-widest">Total</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {quote.lineItems.map((item, i) => (
                                                    <TableRow key={i} className="border-border-sub">
                                                        <TableCell className="text-xs">{item.description}</TableCell>
                                                        <TableCell className="text-center text-xs">{item.qty}</TableCell>
                                                        <TableCell className="text-right font-mono text-xs">${item.unitPrice.toLocaleString()}</TableCell>
                                                        <TableCell className="text-right font-mono text-xs font-bold">${(item.qty * item.unitPrice).toLocaleString()}</TableCell>
                                                    </TableRow>
                                                ))}
                                                <TableRow className="border-t-2 border-border-main hover:bg-transparent">
                                                    <TableCell colSpan={3} className="text-right text-[10px] font-black uppercase tracking-widest">Total</TableCell>
                                                    <TableCell className="text-right font-mono font-black text-text-primary">${(quote.total || 0).toLocaleString()}</TableCell>
                                                </TableRow>
                                            </TableBody>
                                        </Table>
                                    )}
                                    {isPending && (
                                        <div className="flex items-center gap-3 pt-2 border-t border-border-sub">
                                            <Button
                                                className="h-9 px-6 bg-text-green hover:bg-text-green/90 text-white uppercase font-bold text-[10px] tracking-widest"
                                                onClick={() => handleAccept(quote)}
                                            >
                                                <CheckCircle2 size={14} className="mr-2" /> Accept
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="h-9 px-6 border-brand-red text-text-red hover:bg-brand-red-dim uppercase font-bold text-[10px] tracking-widest"
                                                onClick={() => { setSelectedQuote(quote); setIsDeclineDialogOpen(true); }}
                                            >
                                                <XCircle size={14} className="mr-2" /> Decline
                                            </Button>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            <Dialog open={isDeclineDialogOpen} onOpenChange={setIsDeclineDialogOpen}>
                <DialogContent className="sm:max-w-[440px] bg-bg-elevated border-border-default">
                    <DialogHeader>
                        <DialogTitle className="uppercase tracking-widest font-bold">Decline Quote</DialogTitle>
                        <DialogDescription>Optionally provide a reason for declining this proposal.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-text-muted">Reason (optional)</Label>
                        <Textarea
                            value={declineReason}
                            onChange={(e) => setDeclineReason(e.target.value)}
                            placeholder="e.g., Budget constraints, timing not right..."
                            className="h-24 text-xs resize-none bg-bg-primary"
                        />
                    </div>
                    <DialogFooter className="gap-3 flex-row">
                        <Button variant="outline" onClick={() => setIsDeclineDialogOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest">Cancel</Button>
                        <Button
                            className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest text-white"
                            onClick={handleDecline}
                        >
                            Confirm Decline
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
