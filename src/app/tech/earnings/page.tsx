
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { WeeklyLog, Expense, Technician, ProjectPayout, MileageEntry } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    Coins,
    Receipt,
    Calendar as CalendarIcon,
    Search,
    ArrowUpDown,
    ChevronRight,
    ArrowUpRight,
    CheckCircle2,
    Car,
    Plus,
    Clock,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ReceiptUploadDialog } from '../dashboard/components/receipt-upload-dialog';
import { useToast } from '@/hooks/use-toast';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { format, isSameDay, startOfDay } from 'date-fns';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, doc, addDoc } from 'firebase/firestore';

type LogSortOption = 'date-desc' | 'date-asc' | 'payout-desc' | 'status';

export default function TechEarningsPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [tech, setTech] = useState<Technician | null>(null);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [workOrders, setWorkOrders] = useState<any[]>([]);
    const [projectPayouts, setProjectPayouts] = useState<ProjectPayout[]>([]);
    const [mileageEntries, setMileageEntries] = useState<MileageEntry[]>([]);

    const [mounted, setMounted] = useState(false);
    const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false);
    const [isMileageDialogOpen, setIsMileageDialogOpen] = useState(false);
    const [mileageForm, setMileageForm] = useState({ date: '', startLocation: '', endLocation: '', miles: '', note: '', assignmentId: '' });
    const [logSearchQuery, setLogSearchQuery] = useState("");
    const [logSortBy, setLogSortBy] = useState<LogSortOption>('date-desc');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

    useEffect(() => {
        setMounted(true);
        const userId = sessionStorage.getItem('currentUserId');
        setCurrentTechId(userId);

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
                setProjectPayouts(snap.docs.map(d => ({ ...d.data(), id: d.id } as ProjectPayout)));
            });
            const unsubMileage = onSnapshot(query(collection(db, 'mileage'), where('techId', '==', userId)), (snap) => {
                setMileageEntries(snap.docs.map(d => ({ ...d.data(), id: d.id } as MileageEntry)));
            });

            return () => {
                unsubTech(); unsubLogs(); unsubExp(); unsubWO(); unsubPayouts(); unsubMileage();
            };
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
                    if (dateRange.from && dateRange.to) {
                        return logDate >= startOfDay(dateRange.from) && logDate <= startOfDay(dateRange.to);
                    }
                    return isSameDay(logDate, dateRange.from!);
                } catch(e) { return true; }
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
        const reimb = expenses.filter(e => e.status === 'Pending').reduce((acc, exp) => acc + exp.amount, 0);
        return { settled, pending, reimb };
    }, [filteredLogs, expenses]);

    const handleLogMileage = async () => {
        if (!currentTechId || !mileageForm.date || !mileageForm.startLocation || !mileageForm.endLocation || !mileageForm.miles) {
            return;
        }
        try {
            await addDoc(collection(db, 'mileage'), {
                techId: currentTechId,
                date: mileageForm.date,
                startLocation: mileageForm.startLocation,
                endLocation: mileageForm.endLocation,
                miles: parseFloat(mileageForm.miles),
                note: mileageForm.note || '',
                assignmentId: mileageForm.assignmentId || '',
                status: 'pending',
                createdAt: new Date().toISOString(),
            });
            setIsMileageDialogOpen(false);
            setMileageForm({ date: '', startLocation: '', endLocation: '', miles: '', note: '', assignmentId: '' });
        } catch (e: any) {
            console.error('Mileage log error:', e);
        }
    };

    const getStatusVariant = (status: string) => {
        const s = (status || '').toLowerCase();
        if (s === 'approved' || s === 'paid') return 'active';
        if (s === 'pending' || s === 'submitted') return 'onhold';
        return 'outline';
    };

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
                <div className="page-header-right">
                    <Button onClick={() => setIsReceiptDialogOpen(true)}>
                        <Receipt size={14} className="mr-2"/> Submit Receipt
                    </Button>
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
                        <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Reimbursements</p>
                        <Receipt className="h-4 w-4 text-text-primary" />
                    </div>
                    <p className="text-3xl font-mono font-bold text-text-primary">${metrics.reimb.toFixed(2)}</p>
                </div>
            </div>

            {/* Project Payouts Section */}
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
                                {projectPayouts.map(pp => (
                                    <TableRow key={pp.id} className="hover:bg-bg-tertiary transition-colors border-border-sub">
                                        <TableCell className="text-xs font-bold uppercase pl-4">{pp.projectId.slice(0, 8)}</TableCell>
                                        <TableCell className="text-xs text-text-muted capitalize">{pp.role}</TableCell>
                                        <TableCell className="text-xs text-text-muted capitalize">{pp.payType.replace('_', ' ')}</TableCell>
                                        <TableCell className="font-mono text-sm font-bold tabular-nums">${pp.amount.toFixed(2)}</TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={pp.status === 'paid' ? 'completed' : pp.status === 'approved' ? 'active' : 'scheduled'}
                                                className="text-[8px] h-4 uppercase"
                                            >
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
                    <TabsTrigger value="mileage" className="tab flex items-center gap-1.5"><Car size={12}/> Mileage</TabsTrigger>
                </TabsList>

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
                                    "flex items-center h-9 rounded-md border border-border-main bg-bg-primary px-3 cursor-pointer hover:bg-bg-tertiary transition-all group relative pr-8",
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
                            <input 
                                className="search-input !w-full !h-9 !text-[10px] font-bold uppercase" 
                                placeholder="Filter records..." 
                                value={logSearchQuery}
                                onChange={(e) => setLogSearchQuery(e.target.value)}
                            />
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

                <TabsContent value="mileage" className="mt-0">
                    <Card>
                        <CardHeader className="pb-4 border-b border-border-sub bg-bg-tertiary/30">
                            <div className="flex items-center justify-between">
                                <div className="text-left">
                                    <CardTitle>Mileage Log</CardTitle>
                                    <CardDescription>Trip records for reimbursement and tax tracking.</CardDescription>
                                </div>
                                <Button size="sm" onClick={() => setIsMileageDialogOpen(true)} className="h-8 px-4 text-[10px] font-bold uppercase tracking-widest">
                                    <Plus size={12} className="mr-1.5" /> Log Trip
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-border-sub bg-bg-tertiary/30">
                                        <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-text-muted">Date</th>
                                        <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-text-muted">Route</th>
                                        <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-text-muted text-right">Miles</th>
                                        <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-text-muted text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {mileageEntries.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="py-12 text-center text-[10px] font-bold text-text-muted uppercase tracking-widest italic">
                                                No mileage entries logged.
                                            </td>
                                        </tr>
                                    ) : mileageEntries.sort((a, b) => b.date.localeCompare(a.date)).map(entry => (
                                        <tr key={entry.id} className="border-b border-border-sub hover:bg-bg-tertiary transition-colors">
                                            <td className="px-4 py-3 text-xs font-bold uppercase">{entry.date}</td>
                                            <td className="px-4 py-3">
                                                <p className="text-xs text-text-primary">{entry.startLocation} → {entry.endLocation}</p>
                                                {entry.note && <p className="text-[10px] text-text-muted">{entry.note}</p>}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-sm font-bold">{entry.miles}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${entry.status === 'approved' ? 'bg-green-dim text-text-green' : entry.status === 'auto' ? 'bg-bg-tertiary text-text-muted' : 'bg-accent-gold-dim text-accent-gold'}`}>
                                                    {entry.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <ReceiptUploadDialog
                isOpen={isReceiptDialogOpen}
                setIsOpen={setIsReceiptDialogOpen}
                workOrders={workOrders}
                projects={[]}
            />

            <Dialog open={isMileageDialogOpen} onOpenChange={setIsMileageDialogOpen}>
                <DialogContent className="sm:max-w-[480px] bg-bg-elevated border-border-default">
                    <DialogHeader>
                        <DialogTitle className="uppercase tracking-widest font-bold text-sm flex items-center gap-2">
                            <Car size={16} className="text-brand-red" /> Log Mileage
                        </DialogTitle>
                        <DialogDescription>Record a trip for reimbursement or tax purposes.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Date *</Label>
                                <Input type="date" value={mileageForm.date} onChange={e => setMileageForm(p => ({ ...p, date: e.target.value }))} className="h-10 text-xs" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">Miles *</Label>
                                <Input type="number" step="0.1" value={mileageForm.miles} onChange={e => setMileageForm(p => ({ ...p, miles: e.target.value }))} className="h-10 text-xs" placeholder="0.0" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-text-muted">Start Location *</Label>
                            <Input value={mileageForm.startLocation} onChange={e => setMileageForm(p => ({ ...p, startLocation: e.target.value }))} className="h-10 text-xs" placeholder="Departure address" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-text-muted">End Location *</Label>
                            <Input value={mileageForm.endLocation} onChange={e => setMileageForm(p => ({ ...p, endLocation: e.target.value }))} className="h-10 text-xs" placeholder="Destination address" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-text-muted">Note</Label>
                            <Input value={mileageForm.note} onChange={e => setMileageForm(p => ({ ...p, note: e.target.value }))} className="h-10 text-xs" placeholder="Purpose of trip" />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-text-muted">Assignment ID (optional)</Label>
                            <Input value={mileageForm.assignmentId} onChange={e => setMileageForm(p => ({ ...p, assignmentId: e.target.value }))} className="h-10 text-xs" placeholder="Link to assignment" />
                        </div>
                    </div>
                    <DialogFooter className="gap-3 flex-row">
                        <Button variant="outline" onClick={() => setIsMileageDialogOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest">Cancel</Button>
                        <Button
                            onClick={handleLogMileage}
                            disabled={!mileageForm.date || !mileageForm.startLocation || !mileageForm.endLocation || !mileageForm.miles}
                            className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest text-white"
                        >
                            Submit Trip
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
