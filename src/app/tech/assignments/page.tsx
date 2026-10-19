'use client';

import { externalWorkOrderId } from '@/lib/work-order-identity';
import { subscribeTechAssignments } from '@/lib/tech-assignments';
import { usePaged, ListPager, PAGE_SIZES_LARGE, PAGE_SIZES_SMALL } from '@/components/list-pager';
import { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import { SearchField } from '@/components/search-field';
import { SortControl, FiltersPopover, FilterSection, CheckboxFilter, DateRangeButton, type SortOptionDef } from '@/components/list-toolbar';

import type { WorkOrder, Technician } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Calendar as CalendarIcon,
  MapPin,
  Clock,
  CheckCircle2,
  Wrench,
  ArrowUpDown,
  ExternalLink,
  Navigation,
  Play,
  Check,
  LogOut,
  FileCheck,
  RotateCcw,
  History,
  AlertCircle,
  Lock,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { useSearchParams, useRouter } from 'next/navigation';
import { format, isSameDay, parseISO, startOfDay, startOfWeek } from 'date-fns';
import { cn, formatCityState, getTacticalLocation } from '@/lib/utils';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, doc, updateDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { fieldNationUrl, displayWorkOrderNumber } from '@/lib/work-order-identity';
import { removeJobFromDraftLogs } from '@/lib/weekly-log';
import { useTechJobActions } from '@/hooks/use-tech-job-actions';
import type { TechJobAction } from '@/lib/tech-job-actions';
import { canConfirm, canStartTrip, canCheckIn, canCheckOut, canComplete, reopenStatusFor } from '@/lib/trip-flow';
import { jobDateTimeValue, isArchivedJob, isAssignedTo } from '@/lib/jobs';
import { Car, MoreVertical, Ban, XCircle } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { LogTripDialog } from './components/log-trip-dialog';
import { PageHeader } from '@/components/page-header';
import { EmptyState, PageLoading } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { techDisplayName } from '@/lib/utils';

const formatDateStr = (dateStr: string) => {
    if (!dateStr) return 'TBD';
    try {
        const parts = dateStr.split(/[-/]/);
        if (parts[0].length === 4) {
            return format(parseISO(dateStr), "MM-dd-yyyy");
        } else {
            const [m, d, y] = parts;
            if (y && m && d) {
                return `${m.padStart(2, '0')}-${d.padStart(2, '0')}-${y}`;
            }
        }
        return dateStr;
    } catch (e) {
        return dateStr;
    }
};

const TECH_SORT_OPTIONS: SortOptionDef[] = [
    { value: 'date', label: 'Date' },
    { value: 'priority', label: 'Priority' },
    { value: 'pay', label: 'Pay' },
];

export default function TechAssignmentsPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>([]);
    const [mounted, setMounted] = useState(false);
    const [sortBy, setSortBy] = useState<string>('date');
    const [dateAsc, setDateAsc] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    // Filtering (and re-rendering every card) lags a keystroke behind so the
    // search box itself never waits on it — see components/search-field.tsx.
    const deferredSearch = useDeferredValue(searchQuery);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [activePriorities, setActivePriorities] = useState<string[]>([]);
    const activeFilterCount = activePriorities.length; // date has its own button
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'active');

    const [isTripDialogOpen, setIsTripDialogOpen] = useState(false);
    const [newSinceLastVisit, setNewSinceLastVisit] = useState(0);

    const { toast } = useToast();



    useEffect(() => {
        setMounted(true);
        const userId = sessionStorage.getItem('currentUserId');
        setCurrentTechId(userId);

        if (userId) {
            const key = `lastAssignmentSeen_${userId}`;
            const lastSeen = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;

            // Jobs they lead + jobs they help on (archived never resurface).
            const unsubAsmt = subscribeTechAssignments(userId, (orders) => {
                setAllWorkOrders(orders);
                if (lastSeen) {
                    const count = orders.filter(o => {
                        const ts = (o as any).updatedAt || (o as any).createdAt || '';
                        return ts > lastSeen;
                    }).length;
                    setNewSinceLastVisit(count);
                }
            });

            // Record visit timestamp after first load
            const timer = setTimeout(() => {
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(key, new Date().toISOString());
                }
                setNewSinceLastVisit(0);
            }, 4000);

            return () => { unsubAsmt(); clearTimeout(timer); };
        }
    }, []);

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab) setActiveTab(tab);
    }, [searchParams]);

    // The signed-in tech's real user record — this used to look the tech up in
    // the built-in demo list (lib/data), which never contains real techs, so
    // every action from this page was credited to "Field Operative".
    const [currentTech, setCurrentTech] = useState<Technician | null>(null);
    const { run: runAction, weekDialog } = useTechJobActions(currentTechId, techDisplayName(currentTech));
    useEffect(() => {
        if (!currentTechId) return;
        return onSnapshot(doc(db, 'users', currentTechId), snap => {
            setCurrentTech(snap.exists() ? ({ ...snap.data(), id: snap.id } as Technician) : null);
        });
    }, [currentTechId]);

    const techWorkOrders = useMemo(() => {
        if (!currentTechId) return [];
        return allWorkOrders
            .filter(wo => {
                const q = deferredSearch.toLowerCase();
                const matchesSearch = (
                    wo.id.toLowerCase().includes(q) ||
                    // Field Nation / client WO number — what techs actually search by.
                    String(externalWorkOrderId(wo) || '').toLowerCase().includes(q) ||
                    String((wo as any).workOrderId || '').toLowerCase().includes(q) ||
                    (wo.title || '').toLowerCase().includes(q) ||
                    (wo.description || '').toLowerCase().includes(q) ||
                    (wo.clientName || '').toLowerCase().includes(q) ||
                    (wo.location || '').toLowerCase().includes(q)
                );

                const matchesDate = !dateRange?.from || (wo.scheduleDate && (() => {
                    try {
                        const parts = (wo.scheduleDate || '').split(/[-/]/);
                        let woDate;
                        if (parts[0] && parts[0].length === 4) {
                            woDate = startOfDay(new Date(wo.scheduleDate + 'T12:00:00'));
                        } else {
                            const [m, d, y] = parts;
                            if (y && m && d) {
                                woDate = startOfDay(new Date(parseInt(y), parseInt(m) - 1, parseInt(d)));
                            } else {
                                return true;
                            }
                        }
                        
                        if (dateRange.from && dateRange.to) {
                            return woDate >= startOfDay(dateRange.from) && woDate <= startOfDay(dateRange.to);
                        }
                        if (dateRange.from) {
                            return isSameDay(woDate, dateRange.from);
                        }
                        return true;
                    } catch (e) { return false; }
                })());

                // Soft-archived jobs never appear in a tech's active board.
                if (wo.archived || wo.status === 'archived') return false;

                const matchesPriority = activePriorities.length === 0 || activePriorities.includes(wo.priority);

                return matchesSearch && matchesDate && matchesPriority;
            });
    }, [allWorkOrders, currentTechId, deferredSearch, dateRange, activePriorities]);

    const activeAssignments = useMemo(() => 
        techWorkOrders.filter(wo => wo.status !== 'unassigned' && wo.status !== 'completed' && wo.status !== 'cancelled'),
    [techWorkOrders]);

    // One comparator for Active and History. Missing/unknown priorities
    // rank last; priority and pay ties fall back to newest date.
    const compareJobs = useCallback((a: WorkOrder, b: WorkOrder) => {
        const da = jobDateTimeValue(a.scheduleDate, a.scheduleTime);
        const db = jobDateTimeValue(b.scheduleDate, b.scheduleTime);
        if (sortBy === 'priority') {
            const prio: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
            return ((prio[a.priority as string] ?? 4) - (prio[b.priority as string] ?? 4)) || (db - da);
        }
        if (sortBy === 'pay') return ((b.pay || 0) - (a.pay || 0)) || (db - da);
        return dateAsc ? da - db : db - da;
    }, [sortBy, dateAsc]);

    const sortedActive = useMemo(() => [...activeAssignments].sort(compareJobs), [activeAssignments, compareJobs]);
    const pagerResetKeys = [deferredSearch, dateRange, activePriorities, sortBy, dateAsc];
    const activePager = usePaged(sortedActive, PAGE_SIZES_SMALL, 'tech-assignments-active', pagerResetKeys);

    const completedAssignments = useMemo(() =>
        techWorkOrders.filter(wo => wo.status === 'completed').sort(compareJobs),
    [techWorkOrders, compareJobs]);
    const historyPager = usePaged(completedAssignments, PAGE_SIZES_LARGE, 'tech-assignments-history', pagerResetKeys);

    // Clicking a date column header sorts by date and toggles soonest/latest.
    const toggleDateSort = () => {
        if (sortBy !== 'date') {
            setSortBy('date');
            setDateAsc(false);
        } else {
            setDateAsc(prev => !prev);
        }
    };

    const hasActiveSession = useMemo(() => {
        return allWorkOrders.some(wo => wo.status === 'in-progress');
    }, [allWorkOrders]);




    const removeFromWeeklyLogs = async (woId: string) => {
        if (!currentTechId) return;
        await removeJobFromDraftLogs(currentTechId, woId);
    };

    // Same shared workflow as the dashboard, calendar and detail page
    // (lib/tech-job-actions.ts): trip records, history, weekly-log filing.
    const act = (action: TechJobAction) => async (woId: string) => {
        const wo = allWorkOrders.find(w => w.id === woId);
        if (!wo) return;
        const ok = await runAction(wo, action);
        if (ok && action === 'reopen') setActiveTab('active');
    };
    const handleConfirm = act('confirm');
    const handleStartTrip = act('startTrip');
    const handleCheckIn = act('checkIn');
    const handleCheckOut = act('checkOut');
    const handleMarkComplete = act('complete');
    const handleReopen = act('reopen');

    // Tech reports a terminal non-completion outcome (job cancelled, or the tech
    // did not perform it). Moves the job off the active board and flags it for
    // admin review — no payroll is generated.
    const handleMarkOutcome = async (woId: string, outcome: 'cancelled' | 'did_not_do') => {
        const label = outcome === 'cancelled' ? 'Cancelled' : 'Did not do';
        const now = format(new Date(), 'h:mm a');
        try {
            await updateDoc(doc(db, 'assignments', woId), {
                status: 'cancelled',
                techOutcome: outcome,
                // Who sent it to the review queue — the queue shows this name.
                techOutcomeBy: currentTechId,
                techOutcomeByName: techDisplayName(currentTech),
                techOutcomeAt: new Date().toISOString(),
                history: [
                    ...(allWorkOrders.find(wo => wo.id === woId)?.history || []),
                    { type: 'status_change', date: format(new Date(), 'MM-dd-yyyy'), details: `${techDisplayName(currentTech) || 'Tech'} marked job as ${label} at ${now}.`, user: techDisplayName(currentTech) }
                ]
            });
            toast({ title: `Marked as ${label}`, description: "Removed from your active jobs and sent to an admin to review." });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Save failed", description: e.message });
        }
    };

    const filtersActive = !!deferredSearch.trim() || !!dateRange?.from || activePriorities.length > 0;
    const resetFilters = () => { setSearchQuery(''); setDateRange(undefined); setActivePriorities([]); };
    const noMatches = (what: string) => filtersActive
        ? <EmptyState compact icon={Wrench} title={`No ${what} match these filters`} description="Try a different search, date or priority." action={<Button variant="outline" onClick={resetFilters}>Reset filters</Button>} />
        : <EmptyState compact icon={Wrench} title={what === 'jobs' ? 'No active jobs' : 'No completed jobs yet'} description={what === 'jobs' ? 'New jobs show up here when dispatch assigns them to you.' : 'Jobs you complete show up here.'} />;

    const handleOpenDetail = (wo: WorkOrder) => {
        router.push('/tech/assignments/' + wo.id);
    };

    if (!mounted || !currentTechId) {
        return <PageLoading label="Loading your jobs…" />;
    }

    return (
        <div className="space-y-6">
            {newSinceLastVisit > 0 && (
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-brand-red/5 border border-brand-red/20">
                    <AlertCircle size={14} className="text-brand-red shrink-0" />
                    <p className="text-[12px] font-medium text-brand-red">
                        {newSinceLastVisit} job{newSinceLastVisit > 1 ? 's' : ''} updated since your last visit
                    </p>
                </div>
            )}
            <PageHeader
                eyebrow="Jobs"
                icon={Wrench}
                title="My jobs"
                subtitle="Your scheduled jobs and the ones you've finished."
                actions={<>
                    <Button
                        variant="outline"
                        className="h-10 sm:h-9 border-border-main text-text-secondary hover:text-text-primary shrink-0"
                        onClick={() => setIsTripDialogOpen(true)}
                    >
                        <Car size={14} className="mr-1.5" />
                        Log trip
                    </Button>
                </>}
            />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <SearchField
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search job, WO #, client or city"
                        className="sm:flex-1 md:max-w-[360px]"
                    />
                    <div className="flex w-full gap-2 sm:w-auto">
                        <SortControl
                            value={sortBy}
                            onChange={setSortBy}
                            options={TECH_SORT_OPTIONS}
                            dateAsc={dateAsc}
                            onToggleDirection={() => setDateAsc(prev => !prev)}
                            className="flex-1 sm:flex-none"
                        />
                        <FiltersPopover
                            activeCount={activeFilterCount}
                            onReset={() => setActivePriorities([])}
                            className="shrink-0"
                        >
                            <FilterSection title="Priority">
                                <CheckboxFilter idPrefix="prio" options={['critical', 'high', 'medium', 'low']} selected={activePriorities} onChange={setActivePriorities} />
                            </FilterSection>
                        </FiltersPopover>
                        <DateRangeButton value={dateRange} onChange={setDateRange} />
                    </div>
            </div>

            <LogTripDialog
                open={isTripDialogOpen}
                onClose={() => setIsTripDialogOpen(false)}
                technicianId={currentTechId || ''}
            />

            {hasActiveSession && (
                <div className="p-4 rounded-xl border border-border-alert bg-brand-red/5 flex items-start gap-3 shadow-sm text-left">
                    <AlertCircle size={20} className="text-text-red shrink-0 mt-0.5" />
                    <div className="space-y-1 text-left">
                        <p className="text-[13px] font-semibold text-text-red text-left">You&apos;re checked in to a job</p>
                        <p className="text-[12px] text-text-secondary leading-relaxed text-left">
                            You can only be checked in to one job at a time. Check out of it before checking in to another.
                        </p>
                    </div>
                </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="tabs mb-4 h-auto flex-nowrap justify-start bg-transparent p-0">
                    <TabsTrigger value="active" className="tab data-[state=active]:bg-brand-red data-[state=active]:text-white">
                        Active <span className="tab-count">({activeAssignments.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="history" className="tab data-[state=active]:bg-brand-red data-[state=active]:text-white">
                        History <span className="tab-count">({completedAssignments.length})</span>
                    </TabsTrigger>
                </TabsList>
                
                <TabsContent value="active" className="mt-0">
                    {/* Mobile: card view */}
                    <div className="md:hidden space-y-3">
                        {activePager.items.map((wo) => (
                            <div
                                key={wo.id}
                                className="rounded-xl border border-border-main bg-bg-secondary p-4 shadow-sm cursor-pointer active:bg-bg-tertiary transition-colors"
                                onClick={() => handleOpenDetail(wo)}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="cell-id">{displayWorkOrderNumber(wo)}</span>
                                            {wo.source === 'Imported' && (
                                                <a href={fieldNationUrl(wo)} target="_blank" rel="noopener noreferrer" aria-label="Open in Field Nation" className="-m-2 p-2 text-text-muted hover:text-brand-red transition-colors" onClick={(e) => e.stopPropagation()}>
                                                    <ExternalLink size={12} />
                                                </a>
                                            )}
                                        </div>
                                        <div className="mt-1 break-words text-[14px] font-semibold leading-snug text-text-primary">{wo.title || wo.description}</div>
                                        {wo.clientName && <div className="mt-0.5 text-[12px] text-text-muted">{wo.clientName}</div>}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <StatusBadge kind="job" value={wo.status} />
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                {/* A visible, thumb-sized button — the bare grey
                                                    icon was easy to miss on a phone. */}
                                                <button
                                                    onClick={(e) => e.stopPropagation()}
                                                    aria-label="More actions"
                                                    className="h-10 w-10 shrink-0 flex items-center justify-center rounded-md border border-border-main bg-bg-tertiary text-text-primary shadow-sm active:bg-bg-secondary hover:border-text-muted transition-colors"
                                                >
                                                    <MoreVertical size={18} strokeWidth={2.5} />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                                <DropdownMenuItem
                                                    className="text-[13px]"
                                                    onClick={() => handleMarkOutcome(wo.id, 'cancelled')}
                                                >
                                                    <Ban size={13} className="mr-2 text-text-muted" /> Mark as cancelled
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className="text-[13px] text-text-red focus:text-text-red"
                                                    onClick={() => handleMarkOutcome(wo.id, 'did_not_do')}
                                                >
                                                    <XCircle size={13} className="mr-2" /> Did not do
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] text-text-secondary">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <MapPin className="h-3.5 w-3.5 text-text-muted shrink-0" />
                                        <span className="truncate">{formatCityState(wo.location)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 justify-end">
                                        <CalendarIcon size={13} className="text-text-muted shrink-0" />
                                        <span>{formatDateStr(wo.scheduleDate)}{wo.scheduleTime ? ` · ${wo.scheduleTime}` : ''}</span>
                                    </div>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2 empty:hidden" onClick={(e) => e.stopPropagation()}>
                                    {canConfirm(wo) && (
                                        <Button variant="outline" size="sm" className="h-10 flex-1 border-accent-gold text-accent-gold hover:bg-accent-gold-dim" onClick={() => handleConfirm(wo.id)}>
                                            <Check size={14} className="mr-2"/> Confirm
                                        </Button>
                                    )}
                                    {canStartTrip(wo) && (
                                        <Button variant="outline" size="sm" className="h-10 flex-1 border-brand-red text-brand-red hover:bg-brand-red-dim" onClick={() => handleStartTrip(wo.id)}>
                                            <Navigation size={14} className="mr-2"/> Start trip
                                        </Button>
                                    )}
                                    {canCheckIn(wo) && (
                                        <Button disabled={hasActiveSession} variant="outline" size="sm" className="h-10 flex-1 border-text-green text-text-green hover:bg-green-dim disabled:opacity-50" onClick={() => handleCheckIn(wo.id)}>
                                            <Play size={14} className="mr-2 fill-current"/> Check in
                                        </Button>
                                    )}
                                    {canCheckOut(wo) && (
                                        <Button variant="outline" size="sm" className="h-10 flex-1 border-text-red text-text-red hover:bg-brand-red-dim" onClick={() => handleCheckOut(wo.id)}>
                                            <LogOut size={14} className="mr-2"/> Check out
                                        </Button>
                                    )}
                                    {canComplete(wo) && wo.status === 'in-progress' && (
                                        <Button variant="default" size="sm" className="h-10 flex-1 bg-text-green hover:bg-text-green/90" onClick={() => handleMarkComplete(wo.id)}>
                                            <CheckCircle2 size={14} className="mr-2"/> Complete
                                        </Button>
                                    )}
                                    {wo.status === 'checked-out' && (
                                        <>
                                            <Button disabled={hasActiveSession} variant="outline" size="sm" className="h-10 flex-1 border-accent-gold text-accent-gold hover:bg-accent-gold-dim disabled:opacity-50" onClick={() => handleCheckIn(wo.id)}>
                                                <RotateCcw size={14} className="mr-2"/> Check back in
                                            </Button>
                                            <Button variant="default" size="sm" className="h-10 flex-1 bg-text-green hover:bg-text-green/90" onClick={() => handleMarkComplete(wo.id)}>
                                                <CheckCircle2 size={14} className="mr-2"/> Complete
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                        {activeAssignments.length === 0 && noMatches('jobs')}
                    </div>
                    {/* Desktop: table view */}
                    <div className="table-wrap hidden md:block">
                        <table className="tbl">
                            <thead>
                                <tr>
                                    <th className="text-center">Work order</th>
                                    <th className="text-center">Job</th>
                                    <th className="text-center">Location</th>
                                    <th className="text-center">
                                        <button
                                            onClick={toggleDateSort}
                                            className="inline-flex items-center gap-1.5 hover:text-brand-red transition-colors"
                                            title="Sort by date"
                                        >
                                            Scheduled
                                            <ArrowUpDown size={11} className={cn("shrink-0", sortBy === 'date' ? "text-brand-red" : "text-text-muted opacity-50")} />
                                            {sortBy === 'date' && (
                                                <span className="text-[10px] font-semibold text-brand-red">{dateAsc ? 'Earliest' : 'Latest'}</span>
                                            )}
                                        </button>
                                    </th>
                                    <th className="text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activePager.items.map((wo) => (
                                    <tr key={wo.id} className="cursor-pointer group hover:bg-bg-tertiary transition-colors" onClick={() => handleOpenDetail(wo)}>
                                        <td>
                                            <div className="flex flex-col items-center justify-center">
                                              <div className="flex items-center gap-1.5">
                                                <div className="cell-id">{displayWorkOrderNumber(wo)}</div>
                                                {wo.source === 'Imported' && (
                                                  <a href={fieldNationUrl(wo)} target="_blank" rel="noopener noreferrer" aria-label="Open in Field Nation" className="text-text-muted hover:text-brand-red transition-colors" onClick={(e) => e.stopPropagation()}>
                                                    <ExternalLink size={12} />
                                                  </a>
                                                )}
                                              </div>
                                              <StatusBadge kind="job" value={wo.status} className="mt-1" />
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex flex-col items-center justify-center text-center">
                                              <div className="cell-desc-title normal-case tracking-normal text-[13px]">{wo.title || wo.description}</div>
                                              <div className="text-[12px] text-text-muted">{wo.clientName}</div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex items-center justify-center gap-1.5 text-xs text-text-secondary text-center">
                                                <MapPin className="h-3.5 w-3.5 text-text-muted shrink-0" />
                                                <span className="max-w-[150px]">{formatCityState(wo.location)}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="cell-sched">
                                                <div className="cell-sched-date text-[12px]">
                                                    <CalendarIcon size={13}/>
                                                    <span>{formatDateStr(wo.scheduleDate)}</span>
                                                </div>
                                                <div className="cell-sched-time text-[12px]">
                                                    <Clock size={13}/>
                                                    <span>{wo.scheduleTime}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                                              {canConfirm(wo) && (
                                                  <Button variant="outline" size="sm" className="h-9 border-accent-gold text-accent-gold hover:bg-accent-gold-dim" onClick={() => handleConfirm(wo.id)}>
                                                      <Check size={14} className="mr-2"/>
                                                      Confirm
                                                  </Button>
                                              )}
                                              {canStartTrip(wo) && (
                                                  <Button variant="outline" size="sm" className="h-9 border-brand-red text-brand-red hover:bg-brand-red-dim" onClick={() => handleStartTrip(wo.id)}>
                                                      <Navigation size={14} className="mr-2"/>
                                                      Start trip
                                                  </Button>
                                              )}
                                              {canCheckIn(wo) && (
                                                  <Button
                                                    disabled={hasActiveSession}
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-9 border-text-green text-text-green hover:bg-green-dim disabled:opacity-50"
                                                    onClick={() => handleCheckIn(wo.id)}
                                                  >
                                                      <Play size={14} className="mr-2 fill-current"/>
                                                      Check in
                                                  </Button>
                                              )}
                                              {canCheckOut(wo) && (
                                                  <Button variant="outline" size="sm" className="h-9 border-text-red text-text-red hover:bg-brand-red-dim" onClick={() => handleCheckOut(wo.id)}>
                                                      <LogOut size={14} className="mr-2"/>
                                                      Check out
                                                  </Button>
                                              )}
                                              {canComplete(wo) && wo.status === 'in-progress' && (
                                                  <Button variant="default" size="sm" className="h-9 bg-text-green hover:bg-text-green/90" onClick={() => handleMarkComplete(wo.id)}>
                                                      <CheckCircle2 size={14} className="mr-2"/>
                                                      Mark complete
                                                  </Button>
                                              )}
                                              {wo.status === 'checked-out' && (
                                                  <>
                                                      <Button 
                                                        disabled={hasActiveSession}
                                                        variant="outline" 
                                                        size="sm" 
                                                        className="h-9 border-accent-gold text-accent-gold hover:bg-accent-gold-dim disabled:opacity-50" 
                                                        onClick={() => handleCheckIn(wo.id)}
                                                      >
                                                          <RotateCcw size={14} className="mr-2"/>
                                                          Check back in
                                                      </Button>
                                                      <Button 
                                                        variant="default" 
                                                        size="sm" 
                                                        className="h-9 bg-text-green hover:bg-text-green/90"
                                                        onClick={() => handleMarkComplete(wo.id)}
                                                      >
                                                          <CheckCircle2 size={14} className="mr-2"/>
                                                          Mark complete
                                                      </Button>
                                                  </>
                                              )}
                                              <DropdownMenu>
                                                  <DropdownMenuTrigger asChild>
                                                      <button
                                                          onClick={(e) => e.stopPropagation()}
                                                          aria-label="More actions"
                                                          title="More actions"
                                                          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-md border border-border-main bg-bg-tertiary text-text-primary shadow-sm hover:border-text-muted hover:bg-bg-secondary transition-colors"
                                                      >
                                                          <MoreVertical size={16} strokeWidth={2.5} />
                                                      </button>
                                                  </DropdownMenuTrigger>
                                                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                                      <DropdownMenuItem className="text-[13px]" onClick={() => handleMarkOutcome(wo.id, 'cancelled')}>
                                                          <Ban size={13} className="mr-2 text-text-muted" /> Mark as cancelled
                                                      </DropdownMenuItem>
                                                      <DropdownMenuItem className="text-[13px] text-text-red focus:text-text-red" onClick={() => handleMarkOutcome(wo.id, 'did_not_do')}>
                                                          <XCircle size={13} className="mr-2" /> Did not do
                                                      </DropdownMenuItem>
                                                  </DropdownMenuContent>
                                              </DropdownMenu>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {activeAssignments.length === 0 && (
                                    <tr className="hover:bg-transparent">
                                        <td colSpan={5} className="p-4">{noMatches('jobs')}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <ListPager pager={activePager} noun="jobs" />
                </TabsContent>

                <TabsContent value="history" className="mt-0">
                    {/* Mobile: card view */}
                    <div className="md:hidden space-y-3">
                        {historyPager.items.map((wo) => (
                            <div
                                key={wo.id}
                                className="rounded-xl border border-border-main bg-bg-secondary p-4 shadow-sm cursor-pointer active:bg-bg-tertiary transition-colors"
                                onClick={() => handleOpenDetail(wo)}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="cell-id">{displayWorkOrderNumber(wo)}</span>
                                            {wo.source === 'Imported' && (
                                                <a href={fieldNationUrl(wo)} target="_blank" rel="noopener noreferrer" aria-label="Open in Field Nation" className="-m-2 p-2 text-text-muted hover:text-brand-red transition-colors" onClick={(e) => e.stopPropagation()}>
                                                    <ExternalLink size={12} />
                                                </a>
                                            )}
                                        </div>
                                        <div className="mt-1 break-words text-[14px] font-semibold leading-snug text-text-primary">{wo.title || wo.description}</div>
                                        {wo.clientName && <div className="mt-0.5 text-[12px] text-text-muted">{wo.clientName}</div>}
                                    </div>
                                    <StatusBadge kind="job" value="completed" label="Done" className="shrink-0" />
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] text-text-secondary">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <MapPin className="h-3.5 w-3.5 text-text-muted shrink-0" />
                                        <span className="truncate">{formatCityState(wo.location)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 justify-end">
                                        <CalendarIcon size={13} className="text-text-muted shrink-0" />
                                        <span>{wo.scheduleDate}{wo.scheduleTime ? ` · ${wo.scheduleTime}` : ''}</span>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center justify-between gap-2">
                                    <Badge variant="active" className="text-[10px] uppercase tracking-wide">
                                        <FileCheck size={12} className="mr-1"/> Logged
                                    </Badge>
                                    <div onClick={(e) => e.stopPropagation()}>
                                        <Button variant="outline" size="sm" className="h-9 border-accent-gold text-accent-gold hover:bg-accent-gold-dim" onClick={() => handleReopen(wo.id)}>
                                            <RotateCcw size={14} className="mr-2"/> Reopen
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {completedAssignments.length === 0 && noMatches('completed jobs')}
                    </div>
                    {/* Desktop: table view */}
                    <div className="table-wrap hidden md:block">
                        <table className="tbl">
                            <thead>
                                <tr>
                                    <th className="text-center">Work order</th>
                                    <th className="text-center">Job</th>
                                    <th className="text-center">Location</th>
                                    <th className="text-center">
                                        <button
                                            onClick={toggleDateSort}
                                            className="inline-flex items-center gap-1.5 hover:text-brand-red transition-colors"
                                            title="Sort by date"
                                        >
                                            Date
                                            <ArrowUpDown size={11} className={cn("shrink-0", sortBy === 'date' ? "text-brand-red" : "text-text-muted opacity-50")} />
                                            {sortBy === 'date' && <span className="text-[10px] font-semibold text-brand-red">{dateAsc ? 'Earliest' : 'Latest'}</span>}
                                        </button>
                                    </th>
                                    <th className="text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {historyPager.items.map((wo) => {
                                    return (
                                        <tr key={wo.id} className="cursor-pointer group hover:bg-bg-tertiary transition-colors" onClick={() => handleOpenDetail(wo)}>
                                            <td>
                                                <div className="flex flex-col items-center justify-center">
                                                  <div className="flex items-center gap-1.5">
                                                    <div className="cell-id">{displayWorkOrderNumber(wo)}</div>
                                                    {wo.source === 'Imported' && (
                                                      <a href={fieldNationUrl(wo)} target="_blank" rel="noopener noreferrer" aria-label="Open in Field Nation" className="text-text-muted hover:text-brand-red transition-colors" onClick={(e) => e.stopPropagation()}>
                                                        <ExternalLink size={12} />
                                                      </a>
                                                    )}
                                                  </div>
                                                  <div className="text-[12px] text-text-muted">{wo.clientName}</div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex flex-col items-center justify-center text-center">
                                                  <div className="cell-desc-title normal-case tracking-normal text-[13px]">{wo.title || wo.description}</div>
                                                  <StatusBadge kind="job" value="completed" className="mt-1" />
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center justify-center gap-1.5 text-[12px] text-text-secondary text-center">
                                                    <MapPin className="h-3.5 w-3.5 text-text-muted shrink-0" />
                                                    <span className="max-w-[150px] truncate">{formatCityState(wo.location)}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="text-center">
                                                  <div className="text-xs text-text-secondary">{wo.scheduleDate}{wo.scheduleTime ? ` · ${wo.scheduleTime}` : ''}</div>
                                                  <div className="mt-1">
                                                    <Badge variant="active" className="text-[10px] uppercase tracking-wide">
                                                        <FileCheck size={12} className="mr-1"/>
                                                        Logged
                                                    </Badge>
                                                  </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                                                    <Button variant="outline" size="sm" className="h-9 border-accent-gold text-accent-gold hover:bg-accent-gold-dim" onClick={() => handleReopen(wo.id)}>
                                                        <RotateCcw size={14} className="mr-2"/>
                                                        Reopen
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {completedAssignments.length === 0 && (
                                    <tr className="hover:bg-transparent">
                                        <td colSpan={5} className="p-4">{noMatches('completed jobs')}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <ListPager pager={historyPager} noun="jobs" />
                </TabsContent>
            </Tabs>

            {weekDialog}
        </div>
    );
}
