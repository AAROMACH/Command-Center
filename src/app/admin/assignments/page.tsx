
'use client';
import { onSharedSnapshot } from '@/lib/shared-snapshot';

import { useState, useMemo, useEffect, useDeferredValue } from 'react';
import { usePaged, ListPager, PAGE_SIZES_LARGE, PAGE_SIZES_SMALL } from '@/components/list-pager';
import { SearchField } from '@/components/search-field';
import { SortControl, FiltersPopover, FilterSection, CheckboxFilter, DateRangeButton, type SortOptionDef } from '@/components/list-toolbar';
import { useRouter } from 'next/navigation';
import { db } from "@/lib/firebase";
import { collection, doc, updateDoc, onSnapshot, query, where, setDoc, deleteDoc } from 'firebase/firestore';
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Calendar as CalendarIcon,
  MapPin,

  Clock,
  CheckCircle2,
  Search,
  User,
  Briefcase,
  Activity,
  ArrowUpDown,
  Building2,
  ChevronRight,
  DollarSign,
  Pencil,
  Eye,
  ExternalLink,
  UserPlus,
  ShieldCheck,
  StickyNote,
  Type,
  FileText,
  Trash2,
  MoreHorizontal,
  Check,
  Download,
  Archive,
  X,
} from "lucide-react";
import { Checkbox } from '@/components/ui/checkbox';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import type { WorkOrder, Technician, WeeklyLog } from "@/lib/types";
import { externalWorkOrderId, isImported } from "@/lib/work-order-identity";
import { format, startOfDay } from 'date-fns';
import { JobDetailDialog } from '@/components/job-detail-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { cn, formatCityState, isAssignableTechnician, isInactiveTechnician, sortTechniciansForDeployment } from '@/lib/utils';
import { DateRange } from "react-day-picker";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { exportAssignmentsCsv } from '@/app/admin/reports/components/history-tabs';
import { isAdmin, isPayAdmin } from "@/lib/permissions";
import { PAY_TYPE_LABELS } from '@/lib/constants';
import { JobNumbers } from '@/components/work-order-id';
import { jobTechId, isArchivedJob, isCompletedJob, jobDateTimeValue, archiveJobRecord, toUnassignedWorkOrder, JOB_STATUS_OPTIONS, compareJobStatus, jobMatchesSearch } from '@/lib/jobs';
import { syncWeeklyLogForAdminStatusEdit, moveJobLogOnSwap, describeSwapLogMove } from '@/lib/weekly-log';

const ADMIN_SORT_OPTIONS: SortOptionDef[] = [
  { value: 'date', label: 'Date' },
  { value: 'tech', label: 'Technician' },
  { value: 'client', label: 'Client' },
  { value: 'status', label: 'Job Status' },
  { value: 'audit', label: 'Audit Status' },
  { value: 'pay', label: 'Labor Rate' },
];

/** Audit status in payroll-pipeline order, for the Audit Status sort. */
const AUDIT_RANK: Record<string, number> = {
  'Not Logged': 0, 'In Draft Log': 1, 'Submitted': 2, 'Rejected': 3, 'Approved': 4, 'Verified': 5, 'Paid Out': 6,
};

type SortOption = 'date' | 'client' | 'status' | 'audit' | 'pay' | 'tech';

export default function AssignmentsHubPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  // Filtering lags a keystroke behind so the search box never waits on it.
  const deferredSearch = useDeferredValue(searchQuery);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  const [sortBy, setSortBy] = useState<SortOption>('date');
  // Date sort direction: false = latest first (default), true = earliest first.
  const [dateAsc, setDateAsc] = useState(false);
  const [activePriorities, setActivePriorities] = useState<string[]>([]);
  const [activeSources, setActiveSources] = useState<string[]>([]);
  const [activeStatuses, setActiveStatuses] = useState<string[]>([]);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editedOrder, setEditedOrder] = useState<WorkOrder | null>(null);

  const [currentUser, setCurrentUser] = useState<Technician | null>(null);
  const [orderToArchive, setOrderToArchive] = useState<WorkOrder | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  // Tab + bulk selection. Selection is cleared whenever the visible set can
  // change (search, filters, dates, tab) so hidden rows are never acted on.
  const [tab, setTab] = useState<'schedule' | 'archive'>('schedule');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);
  const [bulkArchiving, setBulkArchiving] = useState(false);

  const { toast } = useToast();
  const router = useRouter();

  /**
   * Recursive Sanitize Protocol.
   * Purges undefined properties to ensure document update integrity.
   */
  const sanitize = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sanitize);
    
    const result: any = {};
    Object.keys(obj).forEach(key => {
        const val = obj[key];
        if (val !== undefined) {
            result[key] = sanitize(val);
        }
    });
    return result;
  };

  /**
   * Unified Tactical Date Parser.
   * Consistently handles mixed MM-DD-YYYY and YYYY-MM-DD formats in local time.
   */
  const parseTacticalDate = (dateStr: string) => {
    if (!dateStr) return null;
    try {
        const parts = dateStr.split(/[-/]/);
        if (parts.length !== 3) return null;
        let year, month, day;
        if (parts[0].length === 4) {
            year = parseInt(parts[0]);
            month = parseInt(parts[1]) - 1;
            day = parseInt(parts[2]);
        } else {
            month = parseInt(parts[0]) - 1;
            day = parseInt(parts[1]);
            year = parseInt(parts[2]);
        }
        return startOfDay(new Date(year, month, day));
    } catch (e) {
        return null;
    }
  };

  // 1. Initialize Data Listeners
  useEffect(() => {
    const q = query(collection(db, 'assignments'));
    const unsub = onSnapshot(q, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as WorkOrder));
      setWorkOrders(orders);
    });

    const techQ = query(collection(db, 'users'));
    const techUnsub = onSnapshot(techQ, (snapshot) => {
      const techs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Technician));
      setTechnicians(techs);
      
      const userId = sessionStorage.getItem('currentUserId');
      if (userId) {
        setCurrentUser(techs.find(t => t.id === userId) || null);
      }
    });

    // Weekly logs let Job History show each closed job's payroll stage
    // (logged → submitted → paid) without a per-row lookup.
    const logUnsub = onSharedSnapshot('weeklyLogs', (snapshot) => {
      setWeeklyLogs(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)));
    });

    return () => {
      unsub();
      techUnsub();
      logUnsub();
    };
  }, []);

  // Map every work-order id to the payroll stage of the weekly log that carries
  // it, so Job History's Audit Status column reflects submitted / paid at a
  // glance. Verification itself happens during pay review, not here.
  const auditStatusByWo = useMemo(() => {
    const byWo: Record<string, { label: string; cls: string }> = {};
    for (const log of weeklyLogs) {
      const s = log.status as string;
      const stage =
        s === 'Paid' ? { label: 'Paid Out', cls: 'bg-text-green/10 text-text-green border-text-green/30' }
        : s === 'Approved' ? { label: 'Approved', cls: 'bg-text-green/10 text-text-green border-text-green/30' }
        : s === 'Submitted' ? { label: 'Submitted', cls: 'bg-brand-blue/10 text-brand-blue border-brand-blue/30' }
        : s === 'Rejected' ? { label: 'Rejected', cls: 'bg-brand-red/10 text-brand-red border-brand-red/30' }
        : { label: 'In Draft Log', cls: 'bg-bg-tertiary text-text-muted border-border-sub' };
      for (const item of log.items || []) {
        if (item?.workOrderId) byWo[item.workOrderId] = stage;
      }
    }
    return byWo;
  }, [weeklyLogs]);

  const getAuditStatus = (wo: WorkOrder) =>
    auditStatusByWo[wo.id]
    ?? (wo.isAudited
      ? { label: 'Verified', cls: 'bg-text-green/10 text-text-green border-text-green/30' }
      : { label: 'Not Logged', cls: 'bg-bg-tertiary text-text-muted border-border-sub' });

  const techById = useMemo(() => new Map(technicians.map(t => [t.id, t])), [technicians]);

  const filteredWorkOrders = useMemo(() => {
    return workOrders
      .filter(wo => {
        // Job fields plus lead/helper tech names (incl. preferred names).
        const matchesSearch = jobMatchesSearch(wo, deferredSearch, techById);

        const matchesDate = !dateRange?.from || (() => {
            const woDate = parseTacticalDate(wo.scheduleDate);
            if (!woDate) return true;
            const start = startOfDay(dateRange.from!);
            const end = dateRange.to ? startOfDay(dateRange.to) : start;
            return woDate >= start && woDate <= end;
        })();

        const matchesPriority = activePriorities.length === 0 || activePriorities.includes(wo.priority);
        const matchesSource = activeSources.length === 0 || (wo.source && activeSources.includes(wo.source));
        const matchesStatus = activeStatuses.length === 0 || activeStatuses.includes(wo.status);

        return matchesSearch && matchesDate && matchesPriority && matchesSource && matchesStatus;
      })
      .sort((a, b) => {
        const safeA = { 
            date: a.scheduleDate || '', 
            client: a.clientName || '', 
            status: a.status || '', 
            title: a.title || a.description || '',
            id: a.id || ''
        };
        const safeB = { 
            date: b.scheduleDate || '', 
            client: b.clientName || '', 
            status: b.status || '', 
            title: b.title || b.description || '',
            id: b.id || ''
        };

        switch (sortBy) {
          case 'client': return safeA.client.localeCompare(safeB.client);
          case 'status': return compareJobStatus(a, b) || jobDateTimeValue(b.scheduleDate, b.scheduleTime) - jobDateTimeValue(a.scheduleDate, a.scheduleTime);
          case 'audit': return ((AUDIT_RANK[getAuditStatus(a).label] ?? 99) - (AUDIT_RANK[getAuditStatus(b).label] ?? 99))
            || jobDateTimeValue(b.scheduleDate, b.scheduleTime) - jobDateTimeValue(a.scheduleDate, a.scheduleTime);
          case 'pay': return (b.pay || 0) - (a.pay || 0);
          case 'tech': 
            const idA = jobTechId(a);
            const idB = jobTechId(b);
            const techA = technicians.find(t => t.id === idA)?.name || 'Unassigned';
            const techB = technicians.find(t => t.id === idB)?.name || 'Unassigned';
            return techA.localeCompare(techB);
          case 'date':
          default: {
            // Sort by actual parsed date AND time so mixed MM-DD-YYYY /
            // YYYY-MM-DD formats order correctly and same-day jobs order by
            // start time. Default is latest first (descending).
            const da = jobDateTimeValue(a.scheduleDate, a.scheduleTime);
            const dbb = jobDateTimeValue(b.scheduleDate, b.scheduleTime);
            return dateAsc ? da - dbb : dbb - da;
          }
        }
      });
  }, [workOrders, technicians, deferredSearch, dateRange, sortBy, activePriorities, activeSources, activeStatuses, dateAsc, auditStatusByWo]);

  const activeWorkOrders = useMemo(() =>
    filteredWorkOrders.filter(wo => !isArchivedJob(wo) && !isCompletedJob(wo) && wo.status !== 'cancelled'),
  [filteredWorkOrders]);
  const activePager = usePaged(activeWorkOrders, PAGE_SIZES_LARGE, 'admin-assignments-active', [deferredSearch, dateRange, sortBy, activePriorities, activeSources, activeStatuses, dateAsc]);

  // History = archived, completed or cancelled — so every job lands in
  // exactly one tab (the Cancelled filter works, CSV count matches).
  const archivedWorkOrders = useMemo(() =>
    filteredWorkOrders.filter(wo => isArchivedJob(wo) || isCompletedJob(wo) || wo.status === 'cancelled'),
  [filteredWorkOrders]);
  const historyPager = usePaged(archivedWorkOrders, PAGE_SIZES_LARGE, 'admin-assignments-history', [deferredSearch, dateRange, sortBy, activePriorities, activeSources, activeStatuses, dateAsc]);

  useEffect(() => { setSelectedIds(new Set()); }, [deferredSearch, dateRange, activePriorities, activeSources, activeStatuses, tab]);

  const tabRows = tab === 'schedule' ? activeWorkOrders : archivedWorkOrders;
  const tabPager = tab === 'schedule' ? activePager : historyPager;
  // Drop ids that left the list (e.g. archived by someone else meanwhile).
  const selectedRows = useMemo(() => tabRows.filter(wo => selectedIds.has(wo.id)), [tabRows, selectedIds]);
  const pageIds = tabPager.items.map(wo => wo.id);
  const pageAllSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
  const pageSomeSelected = pageIds.some(id => selectedIds.has(id));
  const allMatchingSelected = tabRows.length > 0 && selectedRows.length === tabRows.length;
  const toggleRow = (id: string, on: boolean) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });
  // Header checkbox: the filtered rows on screen; when paged, the bulk bar
  // then offers "Select all N matching".
  const togglePage = (on: boolean) => setSelectedIds(prev => {
    const next = new Set(prev);
    pageIds.forEach(id => (on ? next.add(id) : next.delete(id)));
    return next;
  });
  const selectAllMatching = () => setSelectedIds(new Set(tabRows.map(wo => wo.id)));
  const clearSelection = () => setSelectedIds(new Set());
  const archivableSelected = selectedRows.filter(wo => !wo.archived);

  const formatDateDisplay = (dateStr: string) => {
    const woDate = parseTacticalDate(dateStr);
    return woDate ? format(woDate, 'MM-dd-yyyy') : dateStr;
  };

  // Clicking a date column header sorts by date and toggles latest/earliest.
  const toggleDateSort = () => {
    if (sortBy !== 'date') {
      setSortBy('date');
      setDateAsc(false);
    } else {
      setDateAsc(prev => !prev);
    }
  };

  const handleCardClick = (wo: WorkOrder) => {
    router.push('/admin/assignments/' + wo.id);
  };

  const handleOpenEditDialog = (order: WorkOrder) => {
    setSelectedJob(order);
    setEditedOrder({ ...order });
    setIsEditDialogOpen(true);
  };

  const handleSaveChanges = () => {
    if (!editedOrder || !selectedJob) return;
    
    let finalUpdate = { ...editedOrder };
    const payChanged = (editedOrder.pay || 0) !== (selectedJob.pay || 0) || editedOrder.payType !== selectedJob.payType;
    const payAdmin = isPayAdmin(currentUser);

    if (payChanged && !payAdmin) {
      finalUpdate.pay = selectedJob.pay;
      finalUpdate.payType = selectedJob.payType;
      finalUpdate.payChangeRequest = {
        pay: editedOrder.pay || 0,
        payType: editedOrder.payType || 'fixed',
        requestedBy: currentUser?.id || 'unknown',
        requestedAt: new Date().toISOString()
      };
      toast({ title: "Pay change requested", description: "Pay changes need approval from a pay admin." });
    }

    const today = format(new Date(), 'MM-dd-yyyy');
    // Read the RAW legacy field, not the assignedTechnicianId-preferring
    // helper — a doc left desynced by a pre-fix swap has techId still
    // pointing at the old tech even though assignedTechnicianId is already
    // correct, and we need that mismatch to register as a change below.
    const prevTechId = (selectedJob as any).techId || selectedJob.assignedTechnicianId || '';
    const newTechId = finalUpdate.assignedTechnicianId || '';
    // Always keep techId in sync with the selected tech, even if the
    // dropdown wasn't touched this save — self-heals any doc left stale by
    // a swap that happened before techId syncing existed.
    (finalUpdate as any).techId = newTechId || null;
    if (newTechId !== prevTechId) {
      const prevTechName = technicians.find(t => t.id === prevTechId)?.name || (prevTechId ? prevTechId : 'Unassigned');
      const newTechName = technicians.find(t => t.id === newTechId)?.name || (newTechId ? newTechId : 'Unassigned');
      finalUpdate.history = [
        ...(finalUpdate.history || []),
        {
          type: 'tech_swap',
          date: today,
          previousTechnicianId: prevTechId || null,
          previousTechnicianName: prevTechName,
          newTechnicianId: newTechId || null,
          newTechnicianName: newTechName,
          details: `Reassigned from ${prevTechName} to ${newTechName}`,
          user: currentUser?.name || 'Admin'
        } as any
      ];
    }

    // A plain updateDoc() only ever touches the assignments doc — clearing
    // the tech here must also migrate it back to `workOrders`, otherwise it
    // stays stuck in `assignments` with no tech (invisible to the
    // Unassigned tab, which only ever reads workOrders).
    if (!finalUpdate.assignedTechnicianId) {
      const targetWo = toUnassignedWorkOrder(finalUpdate as WorkOrder, [{
        type: 'status_change', date: today,
        details: `Unassigned by ${currentUser?.name || 'Admin'} and returned to the Unassigned pool.`,
        user: currentUser?.name || 'Admin',
      }]);
      setDoc(doc(db, 'workOrders', targetWo.id), sanitize(targetWo))
        .then(() => deleteDoc(doc(db, 'assignments', editedOrder.id)))
        .catch((error: any) => {
          console.error("Unassign Error:", error);
          toast({ variant: "destructive", title: "Save failed", description: error.message });
        });
    } else {
      const docRef = doc(db, 'assignments', editedOrder.id);
      updateDoc(docRef, sanitize(finalUpdate))
        .then(async () => {
          if (newTechId !== prevTechId) {
            const moved = await moveJobLogOnSwap({ job: finalUpdate as WorkOrder, fromTechIds: [prevTechId, selectedJob.assignedTechnicianId], toTechId: newTechId });
            const note = describeSwapLogMove(moved, technicians.find(t => t.id === prevTechId)?.name || 'the previous tech', technicians.find(t => t.id === newTechId)?.name || 'the new tech');
            if (note) toast({ variant: note.warn ? 'destructive' : undefined, title: 'Weekly Log', description: note.text });
          } else {
            await syncWeeklyLogForAdminStatusEdit({ prevStatus: selectedJob.status, job: finalUpdate as WorkOrder, techId: newTechId });
          }
        })
        .catch((error: any) => {
          console.error("Assignment update error:", error);
          toast({ variant: "destructive", title: "Save failed", description: error.message });
        });
    }

    setIsEditDialogOpen(false);
    setSelectedJob(null);
    setEditedOrder(null);
    toast({ title: "Saved", description: "Job updated." });
  };

  // Step 1: user clicks Delete. Close the edit dialog FIRST (Radix modals cannot
  // stack — opening a confirm on top of an open Dialog freezes the page by
  // leaving pointer-events:none stuck on <body>), then open the confirm.
  const requestArchive = (order: WorkOrder | null) => {
    if (!order) return;
    setIsEditDialogOpen(false);
    setSelectedJob(null);
    setEditedOrder(null);
    setOrderToArchive(order);
  };

  // Step 2: user confirms. Soft-archive instead of destroying: flip status to
  // 'archived', stamp metadata, preserve every existing field (WO numbers,
  // external WO id, tech, logs, notes, history). Never deleteDoc.
  const archiveAssignment = (order: WorkOrder) => archiveJobRecord({
    job: order,
    collectionName: 'assignments',
    archivedBy: currentUser?.name || currentUser?.id || 'Admin',
    archiveReason: 'Manually archived from assignments page',
    techName: technicians.find(t => t.id === jobTechId(order))?.name,
  });

  // Bulk archive: the same single-job archive, one selected job at a time.
  // Already-archived jobs are skipped, exactly as the single confirm does.
  const confirmBulkArchive = async () => {
    const targets = archivableSelected;
    if (targets.length === 0) { setBulkArchiveOpen(false); return; }
    setBulkArchiving(true);
    let done = 0;
    const failed: string[] = [];
    for (const order of targets) {
      try {
        await archiveAssignment(order);
        done++;
      } catch (e) {
        console.error("Archive Error:", e);
        failed.push((order.id || '').toUpperCase());
      }
    }
    setBulkArchiving(false);
    setBulkArchiveOpen(false);
    clearSelection();
    if (failed.length) {
      toast({ variant: "destructive", title: `Archived ${done} of ${targets.length}`, description: `Could not archive: ${failed.join(', ')}` });
    } else {
      toast({ title: "Archived", description: `${done} job${done === 1 ? '' : 's'} moved to History.` });
    }
  };

  const confirmArchive = async () => {
    const order = orderToArchive;
    if (!order) return;
    if (order.archived) {
      setOrderToArchive(null);
      return;
    }
    setIsArchiving(true);
    try {
      await archiveAssignment(order);
      toast({ title: "Archived", description: "Job moved to History." });
      setOrderToArchive(null);
    } catch (e: any) {
      console.error("Archive Error:", e);
      toast({ variant: "destructive", title: "Archive failed", description: e?.message || "Could not archive assignment. Please try again." });
    } finally {
      setIsArchiving(false);
    }
  };

  const handleVerifyAssignment = async (woId: string) => {
    const docRef = doc(db, 'assignments', woId);
    try {
        await updateDoc(docRef, { 
            isAudited: true, 
            auditedAt: new Date().toISOString(), 
            auditedBy: currentUser?.name || 'Admin' 
        });
        toast({ title: "Verified", description: `Job ${woId.toUpperCase()} has been confirmed.` });
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Could not verify', description: e.message });
    }
  };

  const handleJobUpdate = (woId: string, updates: Partial<WorkOrder>) => {
    const docRef = doc(db, 'assignments', woId);
    updateDoc(docRef, sanitize(updates)).catch((error: any) => {
        const woRef = doc(db, 'workOrders', woId);
        updateDoc(woRef, sanitize(updates)).catch(err => {
            console.error("Field Update Error:", err);
            toast({ variant: "destructive", title: "Save failed", description: err.message });
        });
    });
    
    if (selectedJob?.id === woId) {
        setSelectedJob(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  // Date lives in its own button now, so it isn't counted on Filters.
  const activeFilterCount = activePriorities.length + activeSources.length + activeStatuses.length;
  const anyFilterOn = activeFilterCount > 0 || !!dateRange?.from || !!deferredSearch.trim();
  const resetAll = () => { setActivePriorities([]); setActiveSources([]); setActiveStatuses([]); setDateRange(undefined); setSearchQuery(''); };
  const emptyState = (which: 'active' | 'history', compact?: boolean) => anyFilterOn ? (
    <EmptyState compact={compact} icon={Search} title="No jobs match these filters"
      action={<Button variant="outline" size="sm" onClick={resetAll}>Reset filters</Button>} />
  ) : (
    <EmptyState compact={compact} icon={which === 'active' ? Activity : CheckCircle2}
      title={which === 'active' ? 'No active jobs yet' : 'No job history yet'}
      description={which === 'active' ? 'Assigned jobs show up here.' : 'Completed, cancelled and archived jobs show up here.'} />
  );

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        eyebrow="Jobs"
        icon={CalendarIcon}
        title="Assignments"
        subtitle="Scheduled jobs and job history."
        actions={
        <div className="flex w-full flex-wrap items-center gap-3 text-left sm:w-auto">
            <SearchField
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search tech, ID or title…"
              className="min-w-0 flex-1 md:flex-none md:w-[300px]"
              inputClassName="sm:h-10"
            />
            {/* Every job matching the search / filters / dates — both tabs,
                any status — not just the page on screen. Sits beside the
                search on phones, after the filters from sm up. */}
            <Button variant="outline" className="h-11 shrink-0 sm:order-last sm:h-10" disabled={filteredWorkOrders.length === 0}
              onClick={() => exportAssignmentsCsv(filteredWorkOrders, id => techById.get(id)?.name, isPayAdmin(currentUser))}
              title={`Export ${filteredWorkOrders.length} job${filteredWorkOrders.length === 1 ? '' : 's'} with locations`}>
              <Download size={14} className="mr-1.5" /> CSV ({filteredWorkOrders.length})
            </Button>

            <div className="flex w-full gap-2 sm:w-auto">
              <SortControl
                value={sortBy}
                onChange={v => setSortBy(v as SortOption)}
                options={ADMIN_SORT_OPTIONS}
                dateAsc={dateAsc}
                onToggleDirection={() => setDateAsc(prev => !prev)}
                className="flex-1 sm:flex-none"
              />
              <FiltersPopover
                activeCount={activeFilterCount}
                onReset={() => { setActivePriorities([]); setActiveSources([]); setActiveStatuses([]); }}
                className="shrink-0"
              >
                <FilterSection title="Job status">
                  <CheckboxFilter idPrefix="status" options={JOB_STATUS_OPTIONS} selected={activeStatuses} onChange={setActiveStatuses} />
                </FilterSection>
                <FilterSection title="Priority">
                  <CheckboxFilter idPrefix="prio" options={['critical', 'high', 'medium', 'low']} selected={activePriorities} onChange={setActivePriorities} />
                </FilterSection>
                <FilterSection title="Job source">
                  <CheckboxFilter idPrefix="source" options={['Imported', 'Manual', 'Client']} selected={activeSources} onChange={setActiveSources} columns={1} />
                </FilterSection>
              </FiltersPopover>
              <DateRangeButton value={dateRange} onChange={setDateRange} />
            </div>
        </div>
        }
      />

      <Tabs value={tab} onValueChange={v => setTab(v as 'schedule' | 'archive')} className="w-full text-left">
        <div className="flex items-center justify-between gap-4 mb-4 text-left">
          <TabsList className="tabs !mb-0 text-left">
            <TabsTrigger value="schedule" className="tab">
              Active <span className="tab-count">({activeWorkOrders.length})</span>
            </TabsTrigger>
            <TabsTrigger value="archive" className="tab">
              History <span className="tab-count">({archivedWorkOrders.length})</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Select-all (phones have no table header) + bulk actions */}
        {tabRows.length > 0 && (
          <div className={cn("mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-2.5 text-[13px]",
            selectedRows.length > 0 ? "border-brand-red/40 bg-brand-red/5" : "border-border-main bg-bg-secondary md:hidden")}>
            <label className="flex items-center gap-2 font-medium text-text-primary md:hidden">
              <Checkbox
                checked={pageAllSelected ? true : pageSomeSelected ? 'indeterminate' : false}
                onCheckedChange={c => togglePage(c === true)}
                aria-label="Select all jobs on this page"
              />
              Select all
            </label>
            {selectedRows.length > 0 && (
              <>
                <span className="font-semibold text-text-primary">{selectedRows.length} selected</span>
                {!allMatchingSelected && tabRows.length > tabPager.items.length && pageAllSelected && (
                  <button type="button" onClick={selectAllMatching} className="font-medium text-brand-red hover:underline">
                    Select all {tabRows.length} matching
                  </button>
                )}
                {allMatchingSelected && tabRows.length > tabPager.items.length && (
                  <span className="text-text-muted">All {tabRows.length} matching jobs selected</span>
                )}
                <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
                  <Button variant="outline" size="sm" className="flex-1 sm:flex-none"
                    onClick={() => exportAssignmentsCsv(selectedRows, id => techById.get(id)?.name, isPayAdmin(currentUser))}>
                    <Download size={14} className="mr-1.5" /> Export selected (CSV)
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 border-brand-red/40 text-text-red hover:bg-brand-red/10 sm:flex-none"
                    disabled={archivableSelected.length === 0}
                    title={archivableSelected.length === 0 ? 'The selected jobs are already archived' : undefined}
                    onClick={() => setBulkArchiveOpen(true)}>
                    <Archive size={14} className="mr-1.5" /> Archive selected
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearSelection} aria-label="Clear selection">
                    <X size={14} className="mr-1" /> Clear
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="space-y-6 text-left">
            <TabsContent value="schedule" className="mt-0 space-y-6 text-left">
                {/* Mobile: card list (sort lives in the header toolbar) */}
                <div className="md:hidden space-y-3">
                    {activePager.items.map(wo => {
                        const techId = jobTechId(wo);
                        const tech = technicians.find(t => t.id === techId);
                        return (
                            <div
                                key={wo.id}
                                className="rounded-xl border border-border-sub bg-bg-secondary p-4 shadow-sm cursor-pointer active:bg-bg-tertiary transition-colors"
                                onClick={() => handleCardClick(wo)}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div onClick={e => e.stopPropagation()} className="flex shrink-0 items-center pt-0.5">
                                        <Checkbox checked={selectedIds.has(wo.id)} onCheckedChange={c => toggleRow(wo.id, c === true)} aria-label={`Select job ${(wo.id || '').toUpperCase()}`} className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <JobNumbers wo={wo} />
                                        </div>
                                        <p className="text-[13px] font-semibold text-text-primary mt-1 break-words">{wo.title || wo.description}</p>
                                        <p className="text-[12px] text-text-muted">{wo.clientName}</p>
                                    </div>
                                    <StatusBadge kind="job" value={wo.status} className="shrink-0" />
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-text-secondary font-bold">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <MapPin size={11} className="text-brand-red shrink-0" />
                                        <span className="truncate">{formatCityState(wo.location)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 justify-end font-mono">
                                        <CalendarIcon size={12} className="text-text-muted shrink-0" />
                                        <span>{formatDateDisplay(wo.scheduleDate)}{wo.scheduleTime ? ` · ${wo.scheduleTime}` : ''}</span>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center justify-between gap-2 pt-3 border-t border-border-sub">
                                    {tech ? (
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Avatar className="h-6 w-6 border border-border-sub">
                                                <AvatarImage src={tech.avatarUrl} />
                                                <AvatarFallback className="text-[11px]">{tech.name?.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <span className="text-[10px] font-bold text-text-primary truncate">{tech.name}</span>
                                        </div>
                                    ) : (
                                        <Button variant="outline" size="sm" className="h-7 !text-[10px] border-brand-red text-brand-red hover:bg-brand-red-dim uppercase font-bold tracking-wider" onClick={(e) => { e.stopPropagation(); handleOpenEditDialog(wo); }}>
                                            <UserPlus size={13} className="mr-1.5"/> Assign
                                        </Button>
                                    )}
                                    <span className="text-xs font-mono font-bold text-text-green shrink-0">
                                        {wo.payType === 'blended'
                                            ? `$${(wo.blendedFixedPay || 0).toFixed(0)}+$${(wo.blendedHourlyRate || 0).toFixed(0)}/hr`
                                            : wo.payType === 'hourly'
                                                ? `$${(wo.pay || 0).toFixed(2)}/hr`
                                                : `$${(wo.pay || 0).toFixed(2)}`}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                    {activeWorkOrders.length === 0 && emptyState('active', true)}
                </div>
                {/* Desktop: table */}
                <div className="table-wrap text-left hidden md:block">
                    <table className="tbl">
                        <thead>
                            <tr className="bg-bg-tertiary">
                                <th className="w-10 pl-4">
                                    <Checkbox
                                        checked={pageAllSelected ? true : pageSomeSelected ? 'indeterminate' : false}
                                        onCheckedChange={c => togglePage(c === true)}
                                        aria-label="Select all jobs on this page"
                                    />
                                </th>
                                <th className="text-left pl-2 w-[180px]">Status &amp; ID</th>
                                <th className="text-left pl-0">Job</th>
                                <th className="text-center">Technician</th>
                                <th className="text-left pl-0">Location</th>
                                <th className="text-left pl-0">
                                    <button
                                        onClick={toggleDateSort}
                                        className="inline-flex items-center gap-1.5 hover:text-brand-red transition-colors"
                                        title="Sort by date"
                                    >
                                        Scheduled
                                        <ArrowUpDown size={11} className={cn("shrink-0", sortBy === 'date' ? "text-brand-red" : "text-text-muted opacity-50")} />
                                        {sortBy === 'date' && (
                                            <span className="text-[10px] font-bold text-brand-red normal-case tracking-tight">{dateAsc ? 'Earliest' : 'Latest'}</span>
                                        )}
                                    </button>
                                </th>
                                <th className="text-right pr-6">Labor Rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activePager.items.map(wo => {
                                const techId = jobTechId(wo);
                                const tech = technicians.find(t => t.id === techId);
                                return (
                                    <tr key={wo.id} className={cn("cursor-pointer group hover:bg-bg-tertiary transition-colors text-left", selectedIds.has(wo.id) && "bg-brand-red/5")} onClick={() => handleCardClick(wo)}>
                                        <td className="w-10 pl-4 py-4" onClick={e => e.stopPropagation()}>
                                            <Checkbox checked={selectedIds.has(wo.id)} onCheckedChange={c => toggleRow(wo.id, c === true)} aria-label={`Select job ${(wo.id || '').toUpperCase()}`} />
                                        </td>
                                        <td className="text-left pl-2 py-4">
                                            <div className="flex flex-col items-start gap-1.5 text-left">
                                                <div className="flex items-center gap-1.5 text-left">
                                                    <JobNumbers wo={wo} />
                                                </div>
                                                <StatusBadge kind="job" value={wo.status} />
                                            </div>
                                        </td>
                                        <td className="text-left pl-0 py-4 text-left">
                                            <div className="flex flex-col min-w-0 text-left">
                                                <p className="text-[13px] font-semibold text-text-primary group-hover:text-brand-red transition-colors whitespace-normal text-left">{wo.title || wo.description}</p>
                                                <p className="text-[12px] text-text-muted mt-0.5 text-left">{wo.clientName}</p>
                                            </div>
                                        </td>
                                        <td className="py-4 text-center">
                                            <div className="flex flex-col items-center justify-center text-center">
                                                {tech ? (
                                                    <div className="flex items-center gap-3 text-left">
                                                        <Avatar className="h-8 w-8 border border-border-sub shadow-sm">
                                                            <AvatarImage src={tech.avatarUrl} />
                                                            <AvatarFallback>{tech.name?.charAt(0)}</AvatarFallback>
                                                        </Avatar>
                                                        <span className="text-[10px] font-bold text-text-primary text-left">{tech.name}</span>
                                                    </div>
                                                ) : (
                                                    <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    className="h-8 !text-[10px] border-brand-red text-brand-red hover:bg-brand-red-dim uppercase font-bold tracking-wider"
                                                    onClick={(e) => { e.stopPropagation(); handleOpenEditDialog(wo); }}
                                                    >
                                                    <UserPlus size={14} className="mr-1.5"/> Assign
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-4 pl-0 text-left">
                                            <div className="flex items-center justify-start gap-2 text-[10px] text-text-secondary font-bold text-left">
                                                <MapPin size={11} className="text-brand-red shrink-0" /><span className="whitespace-normal text-left">{formatCityState(wo.location)}</span>
                                            </div>
                                        </td>
                                        <td className="py-4 pl-0 text-left">
                                            <div className="flex flex-col items-start justify-center gap-1.5 text-left">
                                                <div className="flex items-center gap-2 text-[10px] text-text-secondary font-mono font-bold text-left"><CalendarIcon size={13} className="text-text-muted shrink-0" /><span>{formatDateDisplay(wo.scheduleDate)}</span></div>
                                                <div className="flex items-center gap-2 text-[10px] text-text-secondary font-mono text-left"><Clock size={13} className="text-text-muted shrink-0" /><span>{wo.scheduleTime}</span></div>
                                            </div>
                                        </td>
                                        <td className="text-right pr-6 py-4 text-right">
                                            <div className="flex flex-col items-end text-right">
                                                {wo.payType === 'blended' ? (
                                                    <>
                                                        <span className="text-sm font-mono font-bold text-text-green text-right">
                                                            ${(wo.blendedFixedPay || 0).toFixed(2)} + ${(wo.blendedHourlyRate || 0).toFixed(2)}/hr
                                                        </span>
                                                        <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider mt-0.5 text-right">
                                                            after {wo.blendedIncludedHours || 0} hrs
                                                        </span>
                                                    </>
                                                ) : wo.payType === 'hourly' ? (
                                                    <>
                                                        <span className="text-sm font-mono font-bold text-text-green text-right">${(wo.pay || 0).toFixed(2)}/hr</span>
                                                        <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider mt-0.5 text-right">hourly labor rate</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="text-sm font-mono font-bold text-text-green text-right">${(wo.pay || 0).toFixed(2)}</span>
                                                        <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider mt-0.5 text-right">fixed labor rate</span>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <ListPager pager={activePager} noun="jobs" />
                {activeWorkOrders.length === 0 && <div className="hidden md:block">{emptyState('active')}</div>}
            </TabsContent>

            <TabsContent value="archive" className="mt-0 text-left">
                {/* Mobile: card list (sort lives in the header toolbar) */}
                <div className="md:hidden space-y-3">
                    {historyPager.items.map(wo => {
                        const techId = jobTechId(wo);
                        const tech = technicians.find(t => t.id === techId);
                        const audit = getAuditStatus(wo);
                        const ext = externalWorkOrderId(wo);
                        return (
                            <div
                                key={wo.id}
                                className="rounded-xl border border-border-sub bg-bg-secondary p-4 shadow-sm cursor-pointer active:bg-bg-tertiary transition-colors"
                                onClick={() => handleCardClick(wo)}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div onClick={e => e.stopPropagation()} className="flex shrink-0 items-center pt-0.5">
                                        <Checkbox checked={selectedIds.has(wo.id)} onCheckedChange={c => toggleRow(wo.id, c === true)} aria-label={`Select job ${(wo.id || '').toUpperCase()}`} className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-col leading-tight">
                                            <span className="cell-id font-mono font-bold text-brand-red !text-[10px]">{(wo.id || '').toUpperCase()}</span>
                                            {isImported(wo) && ext && (
                                                <span className="font-mono font-bold text-brand-cyan text-[11px]">FN #{ext}</span>
                                            )}
                                        </div>
                                        <p className="text-[13px] font-semibold text-text-primary mt-1 break-words">{wo.title || wo.description}</p>
                                        <p className="text-[12px] text-text-muted">{wo.clientName}</p>
                                    </div>
                                    <StatusBadge kind="job" value={isArchivedJob(wo) ? 'archived' : wo.status} className="shrink-0" />
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-text-secondary font-bold">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <MapPin size={11} className="text-brand-red shrink-0" />
                                        <span className="truncate">{formatCityState(wo.location)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 justify-end font-mono">
                                        <CalendarIcon size={12} className="text-text-muted shrink-0" />
                                        <span>{formatDateDisplay(wo.scheduleDate)}</span>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center justify-between gap-2 pt-3 border-t border-border-sub" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-1.5 text-[10px] text-text-muted font-bold min-w-0">
                                        <User size={11} className="shrink-0" /><span className="truncate">{tech?.name || 'No tech'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Badge variant="outline" className={cn("h-6 px-3 uppercase text-[10px] tracking-wider font-bold", audit.cls)}>{audit.label}</Badge>
                                        <HistoryRowMenu onDelete={() => requestArchive(wo)} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {archivedWorkOrders.length === 0 && emptyState('history', true)}
                </div>
                {/* Desktop: table */}
                <div className="table-wrap text-left hidden md:block">
                    <table className="tbl">
                        <thead>
                            <tr className="bg-bg-tertiary">
                                <th className="w-10 pl-4">
                                    <Checkbox
                                        checked={pageAllSelected ? true : pageSomeSelected ? 'indeterminate' : false}
                                        onCheckedChange={c => togglePage(c === true)}
                                        aria-label="Select all jobs on this page"
                                    />
                                </th>
                                <th className="text-left pl-2 w-[180px]">Status &amp; ID</th>
                                <th className="text-left pl-0">Job</th>
                                <th className="text-center">Location</th>
                                <th className="text-center">
                                    <button
                                        onClick={toggleDateSort}
                                        className="inline-flex items-center gap-1.5 hover:text-brand-red transition-colors"
                                        title="Sort by date"
                                    >
                                        Date &amp; tech
                                        <ArrowUpDown size={11} className={cn("shrink-0", sortBy === 'date' ? "text-brand-red" : "text-text-muted opacity-50")} />
                                        {sortBy === 'date' && (
                                            <span className="text-[10px] font-bold text-brand-red normal-case tracking-tight">{dateAsc ? 'Earliest' : 'Latest'}</span>
                                        )}
                                    </button>
                                </th>
                                <th className="text-right pr-6">Audit Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historyPager.items.map(wo => {
                                const techId = jobTechId(wo);
                                const tech = technicians.find(t => t.id === techId);
                                const audit = getAuditStatus(wo);
                                const ext = externalWorkOrderId(wo);
                                return (
                                    <tr key={wo.id} className={cn("cursor-pointer group hover:bg-bg-tertiary transition-colors text-left", selectedIds.has(wo.id) && "bg-brand-red/5")} onClick={() => handleCardClick(wo)}>
                                        <td className="w-10 pl-4 py-4" onClick={e => e.stopPropagation()}>
                                            <Checkbox checked={selectedIds.has(wo.id)} onCheckedChange={c => toggleRow(wo.id, c === true)} aria-label={`Select job ${(wo.id || '').toUpperCase()}`} />
                                        </td>
                                        {/* Status & ID — internal id + imported (Field Nation) id */}
                                        <td className="text-left pl-2 py-4">
                                            <div className="flex flex-col items-start gap-1.5">
                                                <StatusBadge kind="job" value={isArchivedJob(wo) ? 'archived' : wo.status} />
                                                <div className="flex flex-col items-start leading-tight">
                                                    <span className="cell-id font-mono font-bold text-brand-red !text-[10px]">{(wo.id || '').toUpperCase()}</span>
                                                    {isImported(wo) && ext && (
                                                        <span className="font-mono font-bold text-brand-cyan text-[11px]">FN #{ext}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        {/* Job + client */}
                                        <td className="py-4 text-left">
                                            <p className="text-[13px] font-semibold text-text-primary group-hover:text-brand-red transition-colors whitespace-normal text-left">{wo.title || wo.description}</p>
                                            <div className="flex items-center gap-1.5 text-[12px] text-text-muted mt-0.5"><Briefcase size={11}/> {wo.clientName || 'No client'}</div>
                                        </td>
                                        {/* Location */}
                                        <td className="py-4 text-center">
                                            <div className="flex items-center justify-center gap-2 text-[10px] text-text-secondary font-bold"><MapPin size={12} className="text-brand-red shrink-0" /><span className="whitespace-normal text-center">{formatCityState(wo.location)}</span></div>
                                        </td>
                                        {/* Original Date & Time */}
                                        <td className="py-4 text-center">
                                            <div className="flex flex-col items-center justify-center">
                                                <div className="flex items-center gap-2 text-[10px] text-text-primary font-bold uppercase tracking-tight"><CalendarIcon size={12} className="text-text-muted" />{formatDateDisplay(wo.scheduleDate)}{wo.scheduleTime ? ` · ${wo.scheduleTime}` : ''}</div>
                                                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-text-muted font-bold"><User size={10}/> {tech?.name || 'No tech'}</div>
                                            </div>
                                        </td>
                                        {/* Audit Status — payroll stage; verification happens during pay review */}
                                        <td className="py-4 text-right pr-6">
                                            <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                                                <Badge variant="outline" className={cn("h-7 px-3 uppercase text-[10px] tracking-wider font-bold", audit.cls)}>{audit.label}</Badge>
                                                <HistoryRowMenu onDelete={() => requestArchive(wo)} />
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}

                        </tbody>
                    </table>
                </div>
                {archivedWorkOrders.length === 0 && <div className="hidden md:block">{emptyState('history')}</div>}
                <ListPager pager={historyPager} noun="jobs" />
            </TabsContent>
        </div>

        <JobDetailDialog 
            isOpen={isDetailOpen} 
            setIsOpen={setIsDetailOpen} 
            mission={selectedJob} 
            onEdit={(m) => { setIsDetailOpen(false); handleOpenEditDialog(workOrders.find(w => w.id === m.id) ?? m); }} 
            onUpdate={handleJobUpdate}
        />
        
        <Dialog open={isEditDialogOpen} onOpenChange={(open) => { if(!open) { setSelectedJob(null); setEditedOrder(null); } setIsEditDialogOpen(open); }}>
          <DialogContent className="sm:max-w-[700px] bg-bg-elevated border-border-default max-h-[90vh] overflow-hidden flex flex-col p-0 shadow-2xl text-left">
              <DialogHeader className="p-6 pb-2 text-left border-b border-border-sub bg-bg-tertiary/30">
                <div className="flex items-center justify-between text-left">
                    <div className="space-y-1 text-left">
                        <DialogTitle className="text-lg font-bold text-text-primary text-left">Edit job</DialogTitle>
                        <p className="text-xs text-text-muted text-left">Update the details for job <span className="font-bold text-text-primary">{(selectedJob?.id || '').toUpperCase()}</span></p>
                    </div>
                </div>
              </DialogHeader>
              {editedOrder && (
                  // Plain native scroll, not Radix's ScrollArea — its
                  // internal Viewport hardcodes an inline position:relative
                  // that blocks percentage/flex height from reliably
                  // reaching it inside a flex-col dialog, so tall content
                  // silently got clipped instead of scrolling. Confirmed
                  // with a live browser test.
                  <div className="flex-1 min-h-0 overflow-y-auto text-left">
                    <div className="px-6 py-4 space-y-6 text-left">
                        <div className="space-y-4 text-left">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-2 text-left">
                                  <Type size={12} className="text-brand-red"/> Job Title
                                </Label>
                                <Input placeholder="e.g. Fiber Audit" value={editedOrder.title || ''} onChange={(e) => setEditedOrder({...editedOrder, title: e.target.value})} className="bg-bg-primary border-border-sub h-10 text-xs font-bold" />
                            </div>
                            <div className="space-y-2 text-left text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-2 text-left">
                                  <FileText size={12} className="text-accent-gold"/> Scope of Work
                                </Label>
                                <Textarea placeholder="Detailed requirements..." value={editedOrder.description || ''} onChange={(e) => setEditedOrder({...editedOrder, description: e.target.value})} className="bg-bg-primary border-border-sub h-24 text-xs text-left" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                            <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted text-left">Client</Label>
                              <Input value={editedOrder.clientName || ''} onChange={(e) => setEditedOrder({...editedOrder, clientName: e.target.value})} className="bg-bg-primary h-10 text-xs font-bold text-left" />
                            </div>
                            <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted text-left">Location</Label>
                              <Input value={editedOrder.location || ''} onChange={(e) => setEditedOrder({...editedOrder, location: e.target.value})} className="bg-bg-primary h-10 text-xs text-left" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                          <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted text-left">Service category</Label>
                              <Select value={editedOrder.projectType} onValueChange={(val) => setEditedOrder({...editedOrder, projectType: val})}>
                                  <SelectTrigger className="h-10 bg-bg-primary text-xs font-bold text-left"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                      <SelectItem value="Installation">Installation</SelectItem>
                                      <SelectItem value="Troubleshooting">Troubleshooting</SelectItem>
                                      <SelectItem value="Maintenance">Maintenance</SelectItem>
                                      <SelectItem value="Survey">Survey</SelectItem>
                                      <SelectItem value="Repair">Repair</SelectItem>
                                  </SelectContent>
                              </Select>
                          </div>
                          <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted text-left">Priority</Label>
                              <Select value={editedOrder.priority} onValueChange={(val: any) => setEditedOrder({...editedOrder, priority: val})}>
                                  <SelectTrigger className="h-10 bg-bg-primary text-xs font-bold text-left"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                      <SelectItem value="low">Low</SelectItem>
                                      <SelectItem value="medium">Medium</SelectItem>
                                      <SelectItem value="high">High</SelectItem>
                                      <SelectItem value="critical">Critical</SelectItem>
                                  </SelectContent>
                              </Select>
                          </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                          <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted text-left">Date</Label>
                              <Input type="date" value={editedOrder.scheduleDate || ''} onChange={(e) => setEditedOrder({...editedOrder, scheduleDate: e.target.value})} className="bg-bg-primary h-10 text-xs text-left" />
                          </div>
                          <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted text-left">Start time</Label>
                              <Input placeholder="e.g. 10:00 AM EST" value={editedOrder.scheduleTime || ''} onChange={(e) => setEditedOrder({...editedOrder, scheduleTime: e.target.value})} className="bg-bg-primary h-10 text-xs text-left" />
                          </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                          <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted text-left">Pay type</Label>
                              <Select value={editedOrder.payType} onValueChange={(val: any) => setEditedOrder({ ...editedOrder, payType: val })}>
                                  <SelectTrigger className="h-10 bg-bg-primary text-xs font-bold text-left"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                      <SelectItem value="fixed" className="text-xs font-bold">{PAY_TYPE_LABELS.fixed}</SelectItem>
                                      <SelectItem value="hourly" className="text-xs font-bold">{PAY_TYPE_LABELS.hourly}</SelectItem>
                                      <SelectItem value="blended" className="text-xs font-bold">{PAY_TYPE_LABELS.blended}</SelectItem>
                                  </SelectContent>
                              </Select>
                          </div>
                          {editedOrder.payType !== 'blended' && (
                              <div className="space-y-2 text-left text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted text-left">Labor rate ($)</Label>
                                <Input type="number" value={editedOrder.pay || 0} onChange={(e) => setEditedOrder({...editedOrder, pay: parseFloat(e.target.value) || 0})} className="bg-bg-primary h-10 text-xs font-mono text-text-green text-left" />
                              </div>
                          )}
                      </div>

                      {editedOrder.payType === 'blended' && (
                          <div className="grid grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2 duration-300 p-3 rounded-lg border border-border-sub bg-bg-secondary/50 text-left">
                              <div className="space-y-2 text-left text-left">
                                  <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted text-left">Fixed base ($)</Label>
                                  <div className="relative text-left">
                                      <DollarSign size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                                      <Input 
                                          type="number"
                                          value={editedOrder.blendedFixedPay || ''}
                                          onChange={(e) => {
                                            const val = parseFloat(e.target.value) || 0;
                                            setEditedOrder({...editedOrder, blendedFixedPay: val, pay: val});
                                          }}
                                          className="bg-bg-primary h-9 pl-6 font-mono text-text-green text-[11px] text-left"
                                      />
                                  </div>
                              </div>
                              <div className="space-y-2 text-left text-left">
                                  <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted text-left">Incl. hours</Label>
                                  <Input 
                                      type="number"
                                      value={editedOrder.blendedIncludedHours || ''}
                                      onChange={(e) => setEditedOrder({...editedOrder, blendedIncludedHours: parseFloat(e.target.value) || 0})}
                                      className="bg-bg-primary h-9 font-mono text-text-primary text-[11px] text-left"
                                  />
                              </div>
                              <div className="space-y-2 text-left text-left">
                                  <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted text-left">Then ($/hr)</Label>
                                  <div className="relative text-left">
                                      <DollarSign size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                                      <Input 
                                          type="number"
                                          value={editedOrder.blendedHourlyRate || ''}
                                          onChange={(e) => setEditedOrder({...editedOrder, blendedHourlyRate: parseFloat(e.target.value) || 0})}
                                          className="bg-bg-primary h-9 font-mono text-text-green text-[11px] text-left"
                                      />
                                  </div>
                              </div>
                              <p className="col-span-3 text-[10px] text-text-muted uppercase font-bold text-left">Fixed amount for the included hours, then the hourly rate applies.</p>
                          </div>
                      )}

                        <Separator className="bg-border-sub text-left" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                            <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold text-text-muted ml-1 text-center block text-left">Technician</Label>
                              <Select value={editedOrder.assignedTechnicianId || editedOrder.techId || 'unassigned'} onValueChange={(val) => setEditedOrder({ ...editedOrder, assignedTechnicianId: val === 'unassigned' ? null : val, status: val === 'unassigned' ? 'unassigned' : 'assigned' })}>
                                <SelectTrigger className="bg-bg-primary h-11 focus:ring-brand-red text-xs text-left">
                                  <SelectValue placeholder="Select technician" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned" className="text-brand-red font-bold">Unassigned</SelectItem>
                                  {sortTechniciansForDeployment(technicians.filter(isAssignableTechnician)).map(tech => <SelectItem key={tech.id} value={tech.id} disabled={isInactiveTechnician(tech)} className="text-xs font-bold">{tech.name}{isInactiveTechnician(tech) ? ' · Inactive' : ''}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold text-text-muted ml-1 text-center block text-left">Status</Label>
                              <Select value={editedOrder.status} onValueChange={(val: any) => setEditedOrder({ ...editedOrder, status: val })}>
                                <SelectTrigger className="bg-bg-primary h-11 font-bold tracking-wider focus:ring-brand-red text-xs text-left">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned" className="text-xs font-bold">Unassigned</SelectItem>
                                  <SelectItem value="assigned" className="text-xs font-bold">Assigned</SelectItem>
                                  <SelectItem value="confirmed" className="text-xs font-bold">Confirmed</SelectItem>
                                  <SelectItem value="on-my-way" className="text-xs font-bold">On my way</SelectItem>
                                  <SelectItem value="in-progress" className="text-xs font-bold">In progress</SelectItem>
                                  <SelectItem value="checked-out" className="text-xs font-bold">Checked out</SelectItem>
                                  <SelectItem value="completed" className="text-xs font-bold">Completed</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                        </div>
                    </div>
                  </div>
              )}
              <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default mt-4 shrink-0 flex flex-row items-center justify-between text-left">
                <Button variant="destructive-outline" onClick={() => requestArchive(selectedJob)} className="h-11 px-8 uppercase font-bold text-[10px] tracking-wider border-brand-red text-text-red hover:bg-brand-red-dim">
                    <Trash2 size={16} className="mr-2" />
                    Archive
                </Button>
                <div className="flex gap-3 text-left">
                    <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="h-11 px-8 uppercase font-bold text-[10px] tracking-wider">Cancel</Button>
                    <Button onClick={handleSaveChanges} className="h-11 px-12 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-wider text-white">Save Changes</Button>
                </div>
              </DialogFooter>
          </DialogContent>
        </Dialog>
      </Tabs>

      <AlertDialog open={!!orderToArchive} onOpenChange={(open) => { if (!open && !isArchiving) setOrderToArchive(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this job?</AlertDialogTitle>
            <AlertDialogDescription>
              This job{orderToArchive?.title ? ` (${orderToArchive.title})` : ''} will be moved to History.
              Its work order number, tech assignment, logs, notes, and history are preserved and can be restored later.
              It will no longer appear in active assignments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isArchiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmArchive(); }}
              disabled={isArchiving}
              className="bg-brand-red hover:bg-brand-red-hover text-white"
            >
              {isArchiving ? 'Archiving…' : 'Archive job'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkArchiveOpen} onOpenChange={(open) => { if (!open && !bulkArchiving) setBulkArchiveOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archivableSelected.length} job{archivableSelected.length === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>
              The selected jobs will be moved to History. Work order numbers, tech assignments, logs, notes and history are kept and can be restored later.
              {selectedRows.length > archivableSelected.length && ` ${selectedRows.length - archivableSelected.length} selected job${selectedRows.length - archivableSelected.length === 1 ? ' is' : 's are'} already archived and will be skipped.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkArchiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmBulkArchive(); }}
              disabled={bulkArchiving}
              className="bg-brand-red hover:bg-brand-red-hover text-white"
            >
              {bulkArchiving ? 'Archiving…' : `Archive ${archivableSelected.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Delete sits behind a "⋯" menu on history rows so it can't be hit by accident. */
function HistoryRowMenu({ onDelete }: { onDelete: () => void }) {
    return (
        // Non-modal, and the confirm opens after the menu closes, so the two
        // Radix layers never stack (that leaves pointer-events stuck on <body>).
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-text-muted" aria-label="More actions">
                    <MoreHorizontal size={14} />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-text-red focus:text-text-red" onSelect={() => setTimeout(onDelete, 0)}>
                    <Trash2 size={13} className="mr-2" /> Delete job
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
