'use client';
import { logDisplayStatus } from '@/lib/weekly-log-core';
import { useSessionState } from '@/hooks/use-session-state';
import { JobNumbers } from '@/components/work-order-id';
import { usePaged, ListPager, PAGE_SIZES_LARGE, PAGE_SIZES_SMALL } from '@/components/list-pager';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs as InnerTabs, TabsList as InnerTabsList, TabsTrigger as InnerTabsTrigger, TabsContent as InnerTabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DateRangeButton } from '@/components/list-toolbar';
import { JobDetailDialog } from '@/components/job-detail-dialog';
import { onSharedSnapshot } from '@/lib/shared-snapshot';
import { useState, useMemo, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { isTech } from '@/lib/permissions';
import { BarChart2, ShieldAlert, Users, AlertTriangle, Clock, ChevronRight, Mail, Phone, ArrowLeft, RefreshCw, Filter, X, Activity as ActivityIcon } from 'lucide-react';
import { cn, isInactiveTechnician } from '@/lib/utils';
import { categoryForActivity, categoryStyle } from '@/lib/notification-categories';
import type { WorkOrder, Technician, WeeklyLog, Invoice } from '@/lib/types';
import { effectiveJobPay, netOfFieldNationFee } from '@/lib/payroll';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { mergeJobs, jobTechId, jobDateTimeValue, JOB_STATUS_OPTIONS, isArchivedJob } from '@/lib/jobs';
import { isSuperAdmin, isPayAdmin } from '@/lib/permissions';
import { computeWeeklyLogSettlement } from '@/lib/payroll';
import { findUnloggedCompletions, findMismatchedLogEntries, findDesyncedAssignments } from '@/lib/weekly-log-audit';
import { usePenaltyEvents, penaltyPoints } from '@/hooks/use-penalty-events';

// History → App activity: what happened in the app, newest first — jobs
// assigned / completed, work orders created, weekly logs submitted, approved
// and paid, dispatch imports, invoices. Moved here from Insights.
type ImportBatch = { id: string; importedAt?: string; importedByName?: string; importedBy?: string | null; count?: number; clients?: string[]; jobIds?: string[] };

export function AppActivity() {
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [assignments, setAssignments] = useState<WorkOrder[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
    const [timelineTechFilter, setTimelineTechFilter] = useSessionState('admin/reports:timelineTechFilter', 'all');
    const [timelineTypeFilter, setTimelineTypeFilter] = useSessionState('admin/reports:timelineTypeFilter', 'all');
    const [timelineDateRange, setTimelineDateRange] = useSessionState<DateRange | undefined>('admin/reports:timelineDateRange', undefined,
    r => r ? { from: r.from ? new Date(r.from) : undefined, to: r.to ? new Date(r.to) : undefined } : undefined);
    const [timelinePageSize, setTimelinePageSize] = useState<25 | 50 | 100>(25);
    const [timelinePage, setTimelinePage] = useState(0);
    const [openBatch, setOpenBatch] = useState<ImportBatch | null>(null);
    const [managedJob, setManagedJob] = useState<WorkOrder | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    useEffect(() => {
        const u = [
            onSharedSnapshot('workOrders', snap => setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)))),
            onSharedSnapshot('assignments', snap => setAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)))),
            onSharedSnapshot('users', snap => setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)))),
            onSharedSnapshot('weeklyLogs', snap => setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)))),
            onSharedSnapshot('invoices', snap => setInvoices(snap.docs.map(d => ({ ...d.data(), id: d.id } as Invoice)))),
            onSharedSnapshot('importBatches', snap => setImportBatches(snap.docs.map(d => ({ ...d.data(), id: d.id } as ImportBatch)))),
        ];
        try { setCurrentUserId(sessionStorage.getItem('currentUserId')); } catch { /* private mode */ }
        return () => u.forEach(f => f());
    }, []);

    const staffTechs = useMemo(() => technicians.filter(t => isTech(t) && !isInactiveTechnician(t)), [technicians]);
    const missions = useMemo(() => mergeJobs(workOrders, assignments), [workOrders, assignments]);
    const currentUser = technicians.find(t => t.id === currentUserId) || null;
    const canSeePay = isSuperAdmin(currentUser) || isPayAdmin(currentUser);

    type TimelineEvent = { id: string; timestamp: string; type: string; eventLabel: string; entity: string; techName?: string; techId?: string; clientName?: string; batchId?: string; };

    const timelineEvents = useMemo((): TimelineEvent[] => {
        const events: TimelineEvent[] = [];
        assignments.forEach(wo => {
            const techId = wo.assignedTechnicianId || wo.techId;
            const tech = technicians.find(t => t.id === techId);
            if ((wo as any).assignedAt) events.push({ id: `asmt-${wo.id}`, timestamp: (wo as any).assignedAt, type: 'assignment', eventLabel: 'Assignment Created', entity: wo.title || wo.description || wo.id.toUpperCase(), techName: tech?.name, techId, clientName: wo.clientName });
            if (['completed','checked-out'].includes(wo.status) && (wo as any).updatedAt) events.push({ id: `asmt-done-${wo.id}`, timestamp: (wo as any).updatedAt, type: 'assignment', eventLabel: wo.status === 'completed' ? 'Job Completed' : 'Checked Out', entity: wo.title || wo.description || wo.id.toUpperCase(), techName: tech?.name, techId, clientName: wo.clientName });
        });
        workOrders.forEach(wo => { if ((wo as any).createdAt) events.push({ id: `wo-${wo.id}`, timestamp: (wo as any).createdAt, type: 'work_order', eventLabel: 'Work Order Created', entity: wo.title || wo.description || wo.id.toUpperCase(), clientName: wo.clientName }); });
        weeklyLogs.forEach(log => {
            const tech = technicians.find(t => t.id === log.techId);
            if (log.submittedAt) events.push({ id: `log-sub-${log.id}`, timestamp: log.submittedAt, type: 'log', eventLabel: 'Weekly Log Submitted', entity: `Week of ${log.weekOf}`, techName: tech?.name, techId: log.techId });
            // Approval at its real time (it used to borrow the submitted time).
            // Logs approved before approvals were timestamped have no time to show.
            const approvedAt = (log as { approvedAt?: string | null }).approvedAt;
            const approvedBy = (log as { approvedByName?: string | null }).approvedByName;
            if (log.status === 'Approved' && approvedAt) events.push({ id: `log-appr-${log.id}`, timestamp: approvedAt, type: 'payroll', eventLabel: 'Payroll Approved Log', entity: `Week of ${log.weekOf}${approvedBy ? ` — by ${approvedBy}` : ''}`, techName: tech?.name, techId: log.techId });
            // Paid out (the step after approval).
            if (log.status === 'Approved' && log.paid && log.paidAt) events.push({ id: `log-paid-${log.id}`, timestamp: log.paidAt, type: 'payroll_paid', eventLabel: 'Payroll Paid Out', entity: `Week of ${log.weekOf}${log.paidByName ? ` — by ${log.paidByName}` : ''}`, techName: tech?.name, techId: log.techId });
        });
        importBatches.forEach(b => {
            if (!b.importedAt) return;
            const n = b.count || 0;
            const clients = (b.clients || []).slice(0, 3).join(', ');
            events.push({ id: `import-${b.id}`, timestamp: b.importedAt, type: 'dispatch', eventLabel: 'Dispatch Imported Jobs', entity: `${n} job${n === 1 ? '' : 's'}${clients ? ` · ${clients}${(b.clients || []).length > 3 ? '…' : ''}` : ''}${b.importedByName ? ` — by ${b.importedByName}` : ''}`, batchId: b.id });
        });
        invoices.forEach(inv => {
            if (inv.issueDate) events.push({ id: `inv-${inv.id}`, timestamp: inv.issueDate, type: 'invoice', eventLabel: 'Invoice Issued', entity: `#${(inv as any).invoiceNumber || inv.id} — $${(inv.total || 0).toFixed(2)}`, clientName: inv.clientName });
        });
        return events.filter(e => !!e.timestamp).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }, [assignments, workOrders, weeklyLogs, invoices, technicians, importBatches]);

    const filteredTimelineEvents = useMemo(() => {
        const from = timelineDateRange?.from ? startOfDay(timelineDateRange.from).getTime() : null;
        const to = timelineDateRange?.from ? endOfDay(timelineDateRange.to || timelineDateRange.from).getTime() : null;
        return timelineEvents.filter(e => {
            if (timelineTechFilter !== 'all' && e.techId !== timelineTechFilter) return false;
            if (timelineTypeFilter !== 'all' && e.type !== timelineTypeFilter) return false;
            if (from !== null && to !== null) {
                const t = new Date(e.timestamp).getTime();
                if (isNaN(t) || t < from || t > to) return false;
            }
            return true;
        });
    }, [timelineEvents, timelineTechFilter, timelineTypeFilter, timelineDateRange]);
    // Back to page 1 whenever the filters or page size change.
    useEffect(() => { setTimelinePage(0); }, [timelineTechFilter, timelineTypeFilter, timelineDateRange, timelinePageSize]);
    const timelinePageCount = Math.max(1, Math.ceil(filteredTimelineEvents.length / timelinePageSize));
    const timelinePageEvents = filteredTimelineEvents.slice(timelinePage * timelinePageSize, (timelinePage + 1) * timelinePageSize);

    return (
        <>
                    <div className="space-y-5">
                        <div className="flex flex-wrap items-center gap-3 p-4 bg-bg-secondary rounded-xl border border-border-sub">
                            <Select value={timelineTechFilter} onValueChange={setTimelineTechFilter}>
                                <SelectTrigger className="h-8 w-[160px] text-[10px] font-bold bg-bg-primary border-border-main">
                                    <SelectValue placeholder="All Techs" />
                                </SelectTrigger>
                                <SelectContent className="bg-bg-elevated border-border-main">
                                    <SelectItem value="all" className="text-[10px] font-bold">All techs</SelectItem>
                                    {staffTechs.map(t => (
                                        <SelectItem key={t.id} value={t.id} className="text-[10px] font-bold">{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={timelineTypeFilter} onValueChange={setTimelineTypeFilter}>
                                <SelectTrigger className="h-8 w-[160px] text-[10px] font-bold bg-bg-primary border-border-main">
                                    <SelectValue placeholder="All Events" />
                                </SelectTrigger>
                                <SelectContent className="bg-bg-elevated border-border-main">
                                    <SelectItem value="all" className="text-[10px] font-bold">All events</SelectItem>
                                    {/* The dot is the kind's colour, the same one the row and the
                                        notification bell use for it. */}
                                    {([
                                        ['assignment', 'Assignments'], ['work_order', 'Work orders'],
                                        ['log', 'Weekly logs'], ['payroll', 'Payroll approvals'],
                                        ['payroll_paid', 'Payroll paid'], ['dispatch', 'Dispatch imports'],
                                        ['invoice', 'Invoices'],
                                    ] as const).map(([value, label]) => (
                                        <SelectItem key={value} value={value} className="text-[10px] font-bold">
                                            <span className="flex items-center gap-2">
                                                <span className={cn('h-2 w-2 rounded-full', categoryStyle(categoryForActivity(value)).dot)} />
                                                {label}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <DateRangeButton value={timelineDateRange} onChange={setTimelineDateRange} />
                            {(timelineTechFilter !== 'all' || timelineTypeFilter !== 'all' || timelineDateRange?.from) && (
                                <Button variant="ghost" size="sm" className="h-8 text-[11px] font-bold text-text-muted"
                                    onClick={() => { setTimelineTechFilter('all'); setTimelineTypeFilter('all'); setTimelineDateRange(undefined); }}>
                                    <X size={11} className="mr-1" /> Clear
                                </Button>
                            )}
                            <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-text-muted">
                                {filteredTimelineEvents.length} events
                            </span>
                        </div>

                        {filteredTimelineEvents.length === 0 ? (
                            <div className="py-24 text-center border border-dashed border-border-sub rounded-xl opacity-40">
                                <ActivityIcon size={32} className="mx-auto text-text-muted mb-2" />
                                <p className="text-[10px] font-bold text-text-muted">No events match the current filter</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {timelinePageEvents.map(event => {
                                    let tsDisplay = '';
                                    try { const d = new Date(event.timestamp); tsDisplay = isNaN(d.getTime()) ? event.timestamp : format(d, 'MMM d, h:mm a'); } catch { tsDisplay = event.timestamp; }
                                    // Same seven kinds, colours and icons as the notification bell
                                    // (lib/notification-categories), so blue means jobs and green
                                    // means money in both places.
                                    const kind = categoryStyle(categoryForActivity(event.type));
                                    return (
                                        <div key={event.id}
                                            onClick={event.batchId ? () => setOpenBatch(importBatches.find(b => b.id === event.batchId) || null) : undefined}
                                            className={cn('flex items-start gap-3 sm:gap-4 p-3 rounded-lg border border-border-sub border-l-4 bg-bg-secondary hover:bg-bg-tertiary transition-colors', event.batchId && 'cursor-pointer', kind.borderL)}>
                                            <span className={cn('mt-0.5 hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg border sm:flex', kind.tile)}
                                                title={kind.label} aria-label={kind.label}>
                                                <kind.Icon size={13} />
                                            </span>
                                            <div className="w-[96px] shrink-0 text-right sm:w-[120px]">
                                                <p className="text-[11px] font-mono text-text-muted leading-tight">{tsDisplay}</p>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={cn('text-[10px] font-bold uppercase tracking-wide', kind.text)}>{event.eventLabel}</p>
                                                <p className="text-[11px] font-bold text-text-primary leading-tight mt-0.5 truncate">{event.entity}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    {event.techName && <span className="text-[11px] text-text-muted font-bold">{event.techName}</span>}
                                                    {event.techName && event.clientName && <span className="text-text-muted text-[11px]">·</span>}
                                                    {event.clientName && <span className="text-[11px] text-text-muted">{event.clientName}</span>}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <Badge variant="outline" className="text-[10px] h-4">{event.type.replace('_', ' ')}</Badge>
                                                {event.batchId && <ChevronRight size={14} className="text-text-muted" />}
                                            </div>
                                        </div>
                                    );
                                })}
                                <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Show</span>
                                        {([25, 50, 100] as const).map(n => (
                                            <button
                                                key={n}
                                                type="button"
                                                onClick={() => setTimelinePageSize(n)}
                                                className={cn('h-8 w-10 rounded-md border text-[10px] font-bold', timelinePageSize === n ? 'border-brand-red bg-brand-red text-white' : 'border-border-main text-text-muted hover:text-text-primary')}
                                            >
                                                {n}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                                            {timelinePage * timelinePageSize + 1}–{Math.min((timelinePage + 1) * timelinePageSize, filteredTimelineEvents.length)} of {filteredTimelineEvents.length}
                                        </span>
                                        <Button variant="outline" size="sm" className="h-8 text-[11px] font-bold" disabled={timelinePage === 0} onClick={() => setTimelinePage(p => Math.max(0, p - 1))}>
                                            Previous
                                        </Button>
                                        <Button variant="outline" size="sm" className="h-8 text-[11px] font-bold" disabled={timelinePage >= timelinePageCount - 1} onClick={() => setTimelinePage(p => Math.min(timelinePageCount - 1, p + 1))}>
                                            Next
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
            <Dialog open={!!openBatch} onOpenChange={open => { if (!open) setOpenBatch(null); }}>
                <DialogContent className="sm:max-w-2xl bg-bg-elevated border-border-default max-h-[85vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Imported jobs</DialogTitle>
                        <DialogDescription>
                            {openBatch?.count || 0} job{openBatch?.count === 1 ? '' : 's'}
                            {openBatch?.importedAt && ` · ${format(new Date(openBatch.importedAt), 'MMM d, yyyy · h:mm a')}`}
                            {openBatch?.importedByName && ` · by ${openBatch.importedByName}`}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="overflow-y-auto -mx-1 px-1 space-y-1.5">
                        {(openBatch?.jobIds || []).length === 0 && (
                            <p className="text-[12px] text-text-muted py-6 text-center">This import was recorded before job lists were saved, so its jobs can't be listed.</p>
                        )}
                        {(openBatch?.jobIds || []).map(id => {
                            const wo = missions.find(m => m.id === id) as WorkOrder | undefined;
                            if (!wo) return (
                                <div key={id} className="p-3 rounded-lg border border-border-sub bg-bg-secondary text-[12px] text-text-muted">Job {id} — deleted</div>
                            );
                            return (
                                <button key={id} type="button" onClick={() => { setOpenBatch(null); setManagedJob(wo); }}
                                    className="w-full text-left p-3 rounded-lg border border-border-sub bg-bg-secondary hover:bg-bg-tertiary flex items-center gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[12px] font-bold text-text-primary truncate">{wo.title || wo.description || id}</p>
                                        <p className="text-[11px] text-text-muted truncate">
                                            {[wo.clientName, wo.scheduleDate, technicians.find(t => t.id === jobTechId(wo))?.name || 'Unassigned'].filter(Boolean).join(' · ')}
                                        </p>
                                    </div>
                                    <StatusBadge kind="job" value={wo.status} label={JOB_STATUS_OPTIONS.find(o => o.value === wo.status)?.label} />
                                    <ChevronRight size={14} className="text-text-muted shrink-0" />
                                </button>
                            );
                        })}
                    </div>
                </DialogContent>
            </Dialog>
            <JobDetailDialog isOpen={!!managedJob} setIsOpen={open => { if (!open) setManagedJob(null); }} mission={managedJob ? (missions.find(m => m.id === managedJob.id) as WorkOrder) || managedJob : null} hidePay={!canSeePay} />
        </>
    );
}
