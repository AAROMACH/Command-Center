
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { WeeklyLog, Expense, Technician, ProjectPayout, Reimbursement } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    Coins,
    Receipt,
    Calendar as CalendarIcon,
    Search,
    ArrowUpRight,
    CheckCircle2,
    Car,
    Plus,
    Navigation,
    Upload,
    X,
    Loader2,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AddressAutocompleteInput } from '@/components/ui/address-autocomplete-input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { format, isSameDay, startOfDay } from 'date-fns';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, doc, addDoc, getDoc } from 'firebase/firestore';
import { uploadFile } from '@/lib/upload';
import { useToast } from '@/hooks/use-toast';

type LogSortOption = 'date-desc' | 'date-asc' | 'payout-desc' | 'status';
type ReimType = 'receipt' | 'mileage';

const DEFAULT_MILEAGE_RATE = 0.67;

export default function TechEarningsPage() {
    const { toast } = useToast();
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [tech, setTech] = useState<Technician | null>(null);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [workOrders, setWorkOrders] = useState<any[]>([]);
    const [projectPayouts, setProjectPayouts] = useState<any[]>([]);
    const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
    const [mileageRate, setMileageRate] = useState(DEFAULT_MILEAGE_RATE);

    const [mounted, setMounted] = useState(false);
    const [isReimDialogOpen, setIsReimDialogOpen] = useState(false);
    const [reimType, setReimType] = useState<ReimType>('receipt');

    // Receipt form state
    const [receiptForm, setReceiptForm] = useState({
        vendorName: '',
        purchaseDate: '',
        amount: '',
        description: '',
        relatedJobId: '',
        notes: '',
    });
    const [receiptPhotoUrl, setReceiptPhotoUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Mileage form state
    const [mileageForm, setMileageForm] = useState({
        fromLocation: '',
        toLocation: '',
        distanceMiles: '',
        dateDriven: '',
        relatedJobId: '',
        notes: '',
    });

    const [submitting, setSubmitting] = useState(false);
    const [logSearchQuery, setLogSearchQuery] = useState("");
    const [logSortBy, setLogSortBy] = useState<LogSortOption>('date-desc');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

    useEffect(() => {
        setMounted(true);
        const userId = sessionStorage.getItem('currentUserId');
        setCurrentTechId(userId);

        getDoc(doc(db, 'adminConfig', 'finance')).then(snap => {
            if (snap.exists() && snap.data()?.mileageRate) setMileageRate(snap.data()!.mileageRate);
        }).catch(() => {});

        if (userId) {
            const unsubTech = onSnapshot(doc(db, 'users', userId), (d) => {
                if (d.exists()) setTech({ ...d.data(), id: d.id } as Technician);
            });
            const unsubLogs = onSnapshot(query(collection(db, 'weeklyLogs'), where('techId', '==', userId)), (snap) => {
                setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)));
            });
            const unsubExp = onSnapshot(query(collection(db, 'expenses'), where('techId', '==', userId)), (snap) => {
                setExpenses(snap.docs.map(d => ({ ...d.data(), id: d.id } as Expense)));
            });
            const unsubWO = onSnapshot(query(collection(db, 'workOrders'), where('assignedTechnicianId', '==', userId)), (snap) => {
                setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id })));
            });
            const unsubPayouts = onSnapshot(query(collection(db, 'projectPayouts'), where('technicianId', '==', userId)), (snap) => {
                setProjectPayouts(snap.docs.map(d => ({ ...d.data(), id: d.id })));
            });
            const unsubReim = onSnapshot(query(collection(db, 'reimbursements'), where('techId', '==', userId)), (snap) => {
                setReimbursements(snap.docs.map(d => ({ ...d.data(), id: d.id } as Reimbursement)));
            });
            return () => { unsubTech(); unsubLogs(); unsubExp(); unsubWO(); unsubPayouts(); unsubReim(); };
        }
    }, []);

    const filteredLogs = useMemo(() => {
        let results = weeklyLogs;
        if (logSearchQuery) {
            results = results.filter(l => (l.weekOf || '').toLowerCase().includes(logSearchQuery.toLowerCase()));
        }
        if (dateRange?.from) {
            results = results.filter(log => {
                try {
                    const [m, d, y] = log.weekOf.split('-');
                    const logDate = startOfDay(new Date(parseInt(y), parseInt(m) - 1, parseInt(d)));
                    if (dateRange.from && dateRange.to) return logDate >= startOfDay(dateRange.from) && logDate <= startOfDay(dateRange.to);
                    return isSameDay(logDate, dateRange.from!);
                } catch { return true; }
            });
        }
        return results.sort((a, b) => {
            if (logSortBy === 'date-desc') return (b.weekOf || '').localeCompare(a.weekOf || '');
            if (logSortBy === 'date-asc') return (a.weekOf || '').localeCompare(b.weekOf || '');
            if (logSortBy === 'payout-desc') return (b.totalPayout || 0) - (a.totalPayout || 0);
            return 0;
        });
    }, [weeklyLogs, logSearchQuery, logSortBy, dateRange]);

    const metrics = useMemo(() => {
        const settled = filteredLogs.filter(l => l.status === 'Approved').reduce((acc, log) => acc + (log.totalPayout || 0), 0);
        const pending = filteredLogs.filter(l => l.status === 'Submitted').reduce((acc, log) => acc + (log.totalPayout || 0), 0);
        const pendingReim = [
            ...expenses.filter(e => e.status === 'Pending').map(e => e.amount),
            ...reimbursements.filter(r => r.status === 'pending').map(r =>
                r.type === 'mileage' ? (r.distanceMiles || 0) * (r.mileageRate || mileageRate) : r.amount
            ),
        ].reduce((a, b) => a + b, 0);
        return { settled, pending, pendingReim };
    }, [filteredLogs, expenses, reimbursements, mileageRate]);

    const handleReceiptPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const { url } = await uploadFile(`reimbursementReceipts/${currentTechId}/${Date.now()}-${file.name}`, file);
            setReceiptPhotoUrl(url);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Upload failed', description: err.message });
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSubmitReceipt = async () => {
        if (!currentTechId || !receiptForm.purchaseDate || !receiptForm.amount || !receiptForm.description) return;
        setSubmitting(true);
        try {
            const amount = parseFloat(receiptForm.amount);
            if (isNaN(amount) || amount <= 0) throw new Error('Enter a valid amount.');
            await addDoc(collection(db, 'reimbursements'), {
                techId: currentTechId,
                techName: tech?.name || currentTechId,
                type: 'receipt',
                status: 'pending',
                amount,
                vendorName: receiptForm.vendorName.trim(),
                purchaseDate: receiptForm.purchaseDate,
                description: receiptForm.description.trim(),
                notes: receiptForm.notes.trim() || null,
                ...(receiptForm.relatedJobId && { relatedJobId: receiptForm.relatedJobId }),
                ...(receiptPhotoUrl && { receiptPhotoUrls: [receiptPhotoUrl] }),
                submittedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
            });
            toast({ title: 'Receipt submitted', description: 'Your reimbursement request is pending review.' });
            setReceiptForm({ vendorName: '', purchaseDate: '', amount: '', description: '', relatedJobId: '', notes: '' });
            setReceiptPhotoUrl(null);
            setIsReimDialogOpen(false);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Submission failed', description: err.message });
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmitMileage = async () => {
        if (!currentTechId || !mileageForm.fromLocation || !mileageForm.toLocation || !mileageForm.distanceMiles || !mileageForm.dateDriven) return;
        setSubmitting(true);
        try {
            const distanceMiles = parseFloat(mileageForm.distanceMiles);
            if (isNaN(distanceMiles) || distanceMiles <= 0) throw new Error('Enter a valid distance.');
            await addDoc(collection(db, 'reimbursements'), {
                techId: currentTechId,
                techName: tech?.name || currentTechId,
                type: 'mileage',
                status: 'pending',
                amount: distanceMiles * mileageRate,
                fromLocation: mileageForm.fromLocation.trim(),
                toLocation: mileageForm.toLocation.trim(),
                distanceMiles,
                mileageRate,
                dateDriven: mileageForm.dateDriven,
                notes: mileageForm.notes.trim() || null,
                ...(mileageForm.relatedJobId && { relatedJobId: mileageForm.relatedJobId }),
                submittedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
            });
            toast({ title: 'Mileage submitted', description: `${distanceMiles} mi × $${mileageRate.toFixed(2)} = $${(distanceMiles * mileageRate).toFixed(2)}` });
            setMileageForm({ fromLocation: '', toLocation: '', distanceMiles: '', dateDriven: '', relatedJobId: '', notes: '' });
            setIsReimDialogOpen(false);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Submission failed', description: err.message });
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusVariant = (status: string) => {
        const s = (status || '').toLowerCase();
        if (s === 'approved' || s === 'paid') return 'active';
        if (s === 'rejected') return 'missed';
        if (s === 'pending' || s === 'submitted') return 'onhold';
        return 'outline';
    };

    // All reimbursements unified: new `reimbursements` + legacy `expenses`
    const allReimbursements = useMemo(() => {
        const newItems = reimbursements.map(r => ({
            id: r.id,
            source: 'reimbursement' as const,
            date: r.type === 'mileage' ? (r.dateDriven || r.submittedAt?.slice(0, 10) || '') : (r.purchaseDate || r.submittedAt?.slice(0, 10) || ''),
            type: r.type,
            status: r.status,
            amount: r.type === 'mileage' ? (r.distanceMiles || 0) * (r.mileageRate || mileageRate) : r.amount,
            label: r.type === 'mileage'
                ? `${r.fromLocation || ''} → ${r.toLocation || ''}`
                : (r.description || r.vendorName || ''),
            sub: r.type === 'mileage'
                ? `${r.distanceMiles?.toFixed(1) || '0'} mi × $${(r.mileageRate || mileageRate).toFixed(2)}/mi`
                : (r.vendorName || ''),
            receiptPhotoUrls: r.receiptPhotoUrls,
        }));
        const legacyItems = expenses.map(e => ({
            id: e.id,
            source: 'expense' as const,
            date: e.date,
            type: 'receipt' as const,
            status: e.status.toLowerCase() as 'pending' | 'approved' | 'rejected',
            amount: e.amount,
            label: e.description,
            sub: e.category,
            receiptPhotoUrls: undefined as string[] | undefined,
        }));
        return [...newItems, ...legacyItems].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }, [reimbursements, expenses, mileageRate]);

    const distanceMilesNum = parseFloat(mileageForm.distanceMiles) || 0;
    const calculatedMileageAmount = distanceMilesNum * mileageRate;

    if (!mounted || !currentTechId) {
        return <div className="p-8 text-center uppercase tracking-widest text-text-muted text-xs">Accessing Financial Vault...</div>;
    }

    return (
        <div className="space-y-6">
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2"><Coins size={12} />Financial Intelligence</p>
                    <h1 className="page-title">Billing Terminal</h1>
                    <p className="page-subtitle">Historical billing audit and reimbursement tracking.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border-main border border-border-main rounded-lg overflow-hidden shadow-sm">
                <div className="bg-bg-secondary p-6">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Total Settled (YTD)</p>
                        <CheckCircle2 className="h-4 w-4 text-text-green" />
                    </div>
                    <p className="text-3xl font-mono font-bold text-text-green">${metrics.settled.toFixed(2)}</p>
                </div>
                <div className="bg-bg-secondary p-6">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Pending Audit</p>
                        <ArrowUpRight className="h-4 w-4 text-accent-gold" />
                    </div>
                    <p className="text-3xl font-mono font-bold text-accent-gold">${metrics.pending.toFixed(2)}</p>
                </div>
                <div className="bg-bg-secondary p-6">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Pending Reimbursements</p>
                        <Receipt className="h-4 w-4 text-text-primary" />
                    </div>
                    <p className="text-3xl font-mono font-bold text-text-primary">${metrics.pendingReim.toFixed(2)}</p>
                </div>
            </div>

            {/* Project Payouts */}
            {projectPayouts.length > 0 && (
                <Card>
                    <CardHeader className="pb-4 border-b border-border-sub bg-bg-tertiary/30 text-left">
                        <CardTitle>Project Earnings</CardTitle>
                        <CardDescription>Payouts tied to project work — separate from weekly assignment logs.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent border-border-sub">
                                    <TableHead className="text-[10px] uppercase font-bold tracking-widest pl-4">Project</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold tracking-widest">Role</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold tracking-widest">Type</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold tracking-widest">Amount</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold tracking-widest">Status</TableHead>
                                    <TableHead className="text-[10px] uppercase font-bold tracking-widest">Notes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {projectPayouts.map((pp: any) => (
                                    <TableRow key={pp.id} className="hover:bg-bg-tertiary transition-colors border-border-sub">
                                        <TableCell className="text-xs font-bold uppercase pl-4">{pp.projectId?.slice(0, 8)}</TableCell>
                                        <TableCell className="text-xs text-text-muted capitalize">{pp.role}</TableCell>
                                        <TableCell className="text-xs text-text-muted capitalize">{pp.payType?.replace('_', ' ')}</TableCell>
                                        <TableCell className="font-mono text-sm font-bold tabular-nums">${(pp.amount || 0).toFixed(2)}</TableCell>
                                        <TableCell>
                                            <Badge variant={pp.status === 'paid' ? 'completed' : pp.status === 'approved' ? 'active' : 'scheduled'} className="text-[8px] h-4 uppercase">
                                                {pp.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-xs text-text-muted max-w-[160px] truncate">{pp.notes || '—'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            <Tabs defaultValue="logs" className="w-full">
                <TabsList className="tabs mb-6">
                    <TabsTrigger value="logs" className="tab">Logs</TabsTrigger>
                    <TabsTrigger value="reimbursements" className="tab flex items-center gap-1.5"><Receipt size={12}/> Reimbursements</TabsTrigger>
                </TabsList>

                {/* LOGS TAB */}
                <TabsContent value="logs" className="mt-0">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border-sub bg-bg-tertiary/30">
                            <div className="text-left">
                                <CardTitle>Billing Registry</CardTitle>
                                <CardDescription>Historical weekly log audit and settlement tracking.</CardDescription>
                            </div>
                            <div className="flex items-center gap-3">
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <div className={cn(
                                            "flex items-center h-9 rounded-md border border-border-main bg-bg-primary px-3 cursor-pointer hover:bg-bg-tertiary transition-all",
                                            dateRange?.from && "border-brand-red ring-1 ring-brand-red"
                                        )}>
                                            <CalendarIcon size={12} className={cn("mr-2", dateRange?.from ? "text-brand-red" : "text-text-muted")} />
                                            <span className={cn("text-[10px] font-bold uppercase tracking-widest", dateRange?.from ? "text-text-primary" : "text-text-muted")}>
                                                {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, "MM-dd")} – ${format(dateRange.to, "MM-dd")}` : format(dateRange.from, "MM-dd")) : "Pick Period"}
                                            </span>
                                        </div>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 bg-bg-elevated border-border-main shadow-2xl" align="end">
                                        <Calendar initialFocus mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={1} />
                                    </PopoverContent>
                                </Popover>
                                <div className="search-wrap !mb-0 w-[180px]">
                                    <Search className="h-3.5 w-3.5" />
                                    <input className="search-input !w-full !h-9 !text-[10px] font-bold uppercase" placeholder="Filter records..." value={logSearchQuery} onChange={(e) => setLogSearchQuery(e.target.value)} />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-border-sub">
                                        <TableHead className="text-center text-[10px] uppercase font-bold tracking-widest">Week Period</TableHead>
                                        <TableHead className="text-center text-[10px] uppercase font-bold tracking-widest">Audit Status</TableHead>
                                        <TableHead className="text-right pr-12 text-[10px] uppercase font-bold tracking-widest">Settlement</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredLogs.map(log => (
                                        <TableRow key={log.id} className="hover:bg-bg-tertiary transition-colors cursor-pointer group">
                                            <TableCell className="font-bold uppercase text-xs text-center">Week of {log.weekOf}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant={getStatusVariant(log.status)}>{(log.status || '').toUpperCase()}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right pr-12 font-mono font-bold text-text-primary">${(log.totalPayout || 0).toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {filteredLogs.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center py-12 text-[10px] font-bold text-text-muted uppercase tracking-widest italic">No billing records found in current registry window.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* REIMBURSEMENTS TAB */}
                <TabsContent value="reimbursements" className="mt-0">
                    <Card>
                        <CardHeader className="pb-4 border-b border-border-sub bg-bg-tertiary/30">
                            <div className="flex items-center justify-between">
                                <div className="text-left">
                                    <CardTitle>Reimbursements</CardTitle>
                                    <CardDescription>Submit receipt or mileage reimbursements. Approved entries are processed in payroll.</CardDescription>
                                </div>
                                <Button size="sm" onClick={() => { setReimType('receipt'); setIsReimDialogOpen(true); }} className="h-8 px-4 text-[10px] font-bold uppercase tracking-widest">
                                    <Plus size={12} className="mr-1.5" /> Submit Reimbursement
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-border-sub">
                                        <TableHead className="text-[10px] uppercase font-bold tracking-widest pl-4">Date</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold tracking-widest">Type</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold tracking-widest">Details</TableHead>
                                        <TableHead className="text-right text-[10px] uppercase font-bold tracking-widest">Amount</TableHead>
                                        <TableHead className="text-center text-[10px] uppercase font-bold tracking-widest">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {allReimbursements.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-12 text-[10px] font-bold text-text-muted uppercase tracking-widest italic">No reimbursement requests on file.</TableCell>
                                        </TableRow>
                                    ) : allReimbursements.map(item => (
                                        <TableRow key={`${item.source}-${item.id}`} className="hover:bg-bg-tertiary transition-colors border-border-sub">
                                            <TableCell className="text-xs font-bold uppercase pl-4">{item.date}</TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={item.type === 'mileage' ? 'onhold' : 'default'}
                                                    className="text-[8px] h-4 uppercase flex items-center gap-1 w-fit"
                                                >
                                                    {item.type === 'mileage' ? <><Car size={8} />&nbsp;Mileage</> : 'Receipt'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-xs text-text-primary truncate max-w-[200px]">{item.label}</div>
                                                {item.sub && <div className="text-[10px] text-text-muted">{item.sub}</div>}
                                                {item.receiptPhotoUrls?.[0] && (
                                                    <button
                                                        className="text-[9px] text-brand-red hover:underline mt-0.5"
                                                        onClick={() => window.open(item.receiptPhotoUrls![0], '_blank')}
                                                    >
                                                        View receipt
                                                    </button>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm font-bold">${item.amount.toFixed(2)}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant={getStatusVariant(item.status)} className="text-[8px] h-4 uppercase">
                                                    {item.status}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* UNIFIED REIMBURSEMENT DIALOG */}
            <Dialog open={isReimDialogOpen} onOpenChange={setIsReimDialogOpen}>
                <DialogContent className="sm:max-w-[520px] bg-bg-elevated border-border-default">
                    <DialogHeader>
                        <DialogTitle className="uppercase tracking-widest font-bold text-sm flex items-center gap-2">
                            <Receipt size={16} className="text-brand-red" /> Submit Reimbursement
                        </DialogTitle>
                        <DialogDescription>Choose the type of reimbursement to submit.</DialogDescription>
                    </DialogHeader>

                    {/* Type switcher */}
                    <div className="flex rounded-lg border border-border-main overflow-hidden">
                        <button
                            onClick={() => setReimType('receipt')}
                            className={cn(
                                'flex-1 py-2.5 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors',
                                reimType === 'receipt' ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary bg-bg-secondary'
                            )}
                        >
                            <Receipt size={12} /> Receipt
                        </button>
                        <div className="w-px bg-border-main" />
                        <button
                            onClick={() => setReimType('mileage')}
                            className={cn(
                                'flex-1 py-2.5 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors',
                                reimType === 'mileage' ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary bg-bg-secondary'
                            )}
                        >
                            <Car size={12} /> Mileage
                        </button>
                    </div>

                    {/* RECEIPT FORM */}
                    {reimType === 'receipt' && (
                        <div className="space-y-4 pt-1">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted">Purchase Date *</Label>
                                    <Input type="date" value={receiptForm.purchaseDate} onChange={e => setReceiptForm(p => ({ ...p, purchaseDate: e.target.value }))} className="h-10 text-xs" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted">Amount ($) *</Label>
                                    <Input type="number" step="0.01" min="0" value={receiptForm.amount} onChange={e => setReceiptForm(p => ({ ...p, amount: e.target.value }))} className="h-10 text-xs font-mono" placeholder="0.00" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Vendor Name</Label>
                                <Input value={receiptForm.vendorName} onChange={e => setReceiptForm(p => ({ ...p, vendorName: e.target.value }))} className="h-10 text-xs" placeholder="Store or vendor" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Description *</Label>
                                <Input value={receiptForm.description} onChange={e => setReceiptForm(p => ({ ...p, description: e.target.value }))} className="h-10 text-xs" placeholder="What was purchased?" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Related Job (optional)</Label>
                                <Select value={receiptForm.relatedJobId} onValueChange={v => setReceiptForm(p => ({ ...p, relatedJobId: v === '__none__' ? '' : v }))}>
                                    <SelectTrigger className="h-10 text-xs bg-bg-primary border-border-main">
                                        <SelectValue placeholder="Select a job..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        <SelectItem value="__none__">None</SelectItem>
                                        {workOrders.map((wo: any) => (
                                            <SelectItem key={wo.id} value={wo.id} className="text-xs">
                                                {wo.title || wo.description || wo.id.slice(0, 8)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Notes</Label>
                                <Input value={receiptForm.notes} onChange={e => setReceiptForm(p => ({ ...p, notes: e.target.value }))} className="h-10 text-xs" placeholder="Optional notes" />
                            </div>
                            {/* Receipt photo upload */}
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Receipt Photo (optional)</Label>
                                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleReceiptPhotoSelect} />
                                {receiptPhotoUrl ? (
                                    <div className="flex items-center gap-3 p-2 rounded-lg border border-border-sub bg-bg-secondary">
                                        <img src={receiptPhotoUrl} alt="Receipt" className="h-12 w-12 rounded object-cover shrink-0 cursor-pointer" onClick={() => window.open(receiptPhotoUrl, '_blank')} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-bold text-text-primary">Receipt uploaded</p>
                                            <p className="text-[9px] text-text-muted">Click image to view</p>
                                        </div>
                                        <button onClick={() => setReceiptPhotoUrl(null)} className="text-text-muted hover:text-text-primary p-1">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploading}
                                        className="w-full h-16 rounded-lg border border-dashed border-border-main flex items-center justify-center gap-2 text-[10px] font-bold uppercase text-text-muted hover:text-text-primary hover:border-brand-red transition-colors"
                                    >
                                        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                        {uploading ? 'Uploading...' : 'Upload Receipt Photo'}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* MILEAGE FORM */}
                    {reimType === 'mileage' && (
                        <div className="space-y-4 pt-1">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted">Date Driven *</Label>
                                    <Input type="date" value={mileageForm.dateDriven} onChange={e => setMileageForm(p => ({ ...p, dateDriven: e.target.value }))} className="h-10 text-xs" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted">Distance (miles) *</Label>
                                    <Input type="number" step="0.1" min="0" value={mileageForm.distanceMiles} onChange={e => setMileageForm(p => ({ ...p, distanceMiles: e.target.value }))} className="h-10 text-xs font-mono" placeholder="0.0" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">From Location *</Label>
                                <AddressAutocompleteInput value={mileageForm.fromLocation} onChange={v => setMileageForm(p => ({ ...p, fromLocation: v }))} className="h-10 text-xs" placeholder="Starting address or location" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">To Location *</Label>
                                <AddressAutocompleteInput value={mileageForm.toLocation} onChange={v => setMileageForm(p => ({ ...p, toLocation: v }))} className="h-10 text-xs" placeholder="Destination address or location" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Related Job (optional)</Label>
                                <Select value={mileageForm.relatedJobId} onValueChange={v => setMileageForm(p => ({ ...p, relatedJobId: v === '__none__' ? '' : v }))}>
                                    <SelectTrigger className="h-10 text-xs bg-bg-primary border-border-main">
                                        <SelectValue placeholder="Select a job..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        <SelectItem value="__none__">None</SelectItem>
                                        {workOrders.map((wo: any) => (
                                            <SelectItem key={wo.id} value={wo.id} className="text-xs">
                                                {wo.title || wo.description || wo.id.slice(0, 8)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Notes (optional)</Label>
                                <Input value={mileageForm.notes} onChange={e => setMileageForm(p => ({ ...p, notes: e.target.value }))} className="h-10 text-xs" placeholder="Purpose of trip" />
                            </div>
                            {/* Calculated amount preview */}
                            {distanceMilesNum > 0 && (
                                <div className="p-3 rounded-lg bg-bg-secondary border border-border-sub flex items-center gap-3">
                                    <Navigation size={14} className="text-brand-red shrink-0" />
                                    <div>
                                        <p className="text-[10px] font-bold uppercase text-text-muted tracking-widest">Calculated Reimbursement</p>
                                        <p className="text-sm font-mono font-bold text-text-primary">
                                            {distanceMilesNum.toFixed(1)} mi × ${mileageRate.toFixed(2)}/mi = <span className="text-text-green">${calculatedMileageAmount.toFixed(2)}</span>
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter className="gap-3 flex-row pt-2">
                        <Button
                            variant="outline"
                            onClick={() => setIsReimDialogOpen(false)}
                            className="flex-1 uppercase font-bold text-[10px] tracking-widest"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={reimType === 'receipt' ? handleSubmitReceipt : handleSubmitMileage}
                            disabled={submitting || uploading || (reimType === 'receipt'
                                ? !receiptForm.purchaseDate || !receiptForm.amount || !receiptForm.description
                                : !mileageForm.dateDriven || !mileageForm.fromLocation || !mileageForm.toLocation || !mileageForm.distanceMiles
                            )}
                            className="flex-1 bg-brand-red hover:bg-brand-red/90 uppercase font-bold text-[10px] tracking-widest text-white"
                        >
                            {submitting ? 'Submitting...' : reimType === 'receipt' ? 'Submit Receipt' : 'Submit Mileage'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
