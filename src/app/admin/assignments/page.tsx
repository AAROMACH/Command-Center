
'use client';

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
  Check,
} from "lucide-react";
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
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { cn, formatCityState, isAssignableTechnician, isInactiveTechnician, sortTechniciansForDeployment } from '@/lib/utils';
import { DateRange } from "react-day-picker";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { isAdmin, isPayAdmin } from "@/lib/permissions";
import { PAY_TYPE_LABELS } from '@/lib/constants';
import { WorkOrderId } from '@/components/work-order-id';
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
    const logUnsub = onSnapshot(collection(db, 'weeklyLogs'), (snapshot) => {
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

  const archivedWorkOrders = useMemo(() =>
    filteredWorkOrders.filter(wo => isArchivedJob(wo) || isCompletedJob(wo)),
  [filteredWorkOrders]);
  const historyPager = usePaged(archivedWorkOrders, PAGE_SIZES_LARGE, 'admin-assignments-history', [deferredSearch, dateRange, sortBy, activePriorities, activeSources, activeStatuses, dateAsc]);

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
      toast({ title: "Pay Change Requested", description: "Financial modifications require authorization." });
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
          toast({ variant: "destructive", title: "Update Failed", description: error.message });
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
          console.error("Registry Update Error:", error);
          toast({ variant: "destructive", title: "Update Failed", description: error.message });
        });
    }

    setIsEditDialogOpen(false);
    setSelectedJob(null);
    setEditedOrder(null);
    toast({ title: "Updated", description: "Assignment parameters committed to Firestore." });
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
  const confirmArchive = async () => {
    const order = orderToArchive;
    if (!order) return;
    if (order.archived) {
      setOrderToArchive(null);
      return;
    }
    setIsArchiving(true);
    try {
      await archiveJobRecord({
        job: order,
        collectionName: 'assignments',
        archivedBy: currentUser?.name || currentUser?.id || 'Admin',
        archiveReason: 'Manually archived from assignments page',
        techName: technicians.find(t => t.id === jobTechId(order))?.name,
      });
      toast({ title: "Archived", description: "Assignment moved to Archives." });
      setOrderToArchive(null);
    } catch (e: any) {
      console.error("Archive Error:", e);
      toast({ variant: "destructive", title: "Archive Failed", description: e?.message || "Could not archive assignment. Please try again." });
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
        toast({ variant: 'destructive', title: 'Audit Failure', description: e.message });
    }
  };

  const handleJobUpdate = (woId: string, updates: Partial<WorkOrder>) => {
    const docRef = doc(db, 'assignments', woId);
    updateDoc(docRef, sanitize(updates)).catch((error: any) => {
        const woRef = doc(db, 'workOrders', woId);
        updateDoc(woRef, sanitize(updates)).catch(err => {
            console.error("Field Update Error:", err);
            toast({ variant: "destructive", title: "Update Failed", description: err.message });
        });
    });
    
    if (selectedJob?.id === woId) {
        setSelectedJob(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  // Date lives in its own button now, so it isn't counted on Filters.
  const activeFilterCount = activePriorities.length + activeSources.length + activeStatuses.length;

  return (
    <div className="space-y-6 text-left">
      <header className="page-header flex flex-col md:flex-row md:items-end justify-between gap-4 text-left">
        <div className="text-left">
          <p className="page-eyebrow flex items-center gap-2 text-left">
            <CalendarIcon size={12} />
            Assignment Tracker
          </p>
          <h1 className="page-title text-left">Assignments</h1>
          <p className="page-subtitle text-left">Schedule and history and historical job audit.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-left">
            <SearchField
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search Tech, ID, or Title..."
              className="basis-full md:basis-auto md:w-[300px]"
              inputClassName="sm:h-10"
            />
            
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
                <FilterSection title="Job Status">
                  <CheckboxFilter idPrefix="status" options={JOB_STATUS_OPTIONS} selected={activeStatuses} onChange={setActiveStatuses} />
                </FilterSection>
                <FilterSection title="Priority">
                  <CheckboxFilter idPrefix="prio" options={['critical', 'high', 'medium', 'low']} selected={activePriorities} onChange={setActivePriorities} />
                </FilterSection>
                <FilterSection title="Job Source">
                  <CheckboxFilter idPrefix="source" options={['Imported', 'Manual', 'Client']} selected={activeSources} onChange={setActiveSources} columns={1} />
                </FilterSection>
              </FiltersPopover>
              <DateRangeButton value={dateRange} onChange={setDateRange} />
            </div>
        </div>
      </header>

      <Tabs defaultValue="schedule" className="w-full text-left">
        <div className="flex items-center justify-between gap-4 mb-6 bg-bg-secondary/50 p-4 rounded-lg border border-border-sub text-left shadow-sm">
          <TabsList className="tabs !mb-0 text-left">
            <TabsTrigger value="schedule" className="tab">
              Active Assignments <span className="tab-count">({activeWorkOrders.length})</span>
            </TabsTrigger>
            <TabsTrigger value="archive" className="tab">
              Job History <span className="tab-count">({archivedWorkOrders.length})</span>
            </TabsTrigger>
          </TabsList>
          {/* Date filtering now lives in the always-visible header "Filters"
              popover (works in both list and map views, and on mobile). */}
        </div>

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
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <WorkOrderId wo={wo} />
                                        </div>
                                        <p className="text-xs font-bold text-text-primary uppercase tracking-wide mt-1 break-words">{wo.title || wo.description}</p>
                                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">{wo.clientName}</p>
                                    </div>
                                    <Badge variant={wo.status === 'in-progress' ? 'inprogress' : wo.status === 'checked-out' ? 'checked-out' : 'scheduled'} className="text-[8px] h-4 px-1.5 uppercase tracking-widest shrink-0">{wo.status}</Badge>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-text-secondary font-bold uppercase">
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
                                                <AvatarFallback className="text-[9px]">{tech.name?.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <span className="text-[10px] font-bold text-text-primary uppercase truncate">{tech.name}</span>
                                        </div>
                                    ) : (
                                        <Button variant="outline" size="sm" className="h-7 !text-[10px] border-brand-red text-brand-red hover:bg-brand-red-dim uppercase font-bold tracking-widest" onClick={(e) => { e.stopPropagation(); handleOpenEditDialog(wo); }}>
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
                    {activeWorkOrders.length === 0 && (
                        <div className="p-8 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30">
                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] italic">No active jobs found matching search criteria</p>
                        </div>
                    )}
                </div>
                {/* Desktop: table */}
                <div className="table-wrap text-left hidden md:block">
                    <table className="tbl">
                        <thead>
                            <tr className="bg-bg-tertiary">
                                <th className="text-left pl-6 w-[180px]">Status & ID</th>
                                <th className="text-left pl-0">Assignment Identification</th>
                                <th className="text-center">Operative</th>
                                <th className="text-left pl-0">Site Coordinates</th>
                                <th className="text-left pl-0">
                                    <button
                                        onClick={toggleDateSort}
                                        className="inline-flex items-center gap-1.5 uppercase tracking-widest hover:text-brand-red transition-colors"
                                        title="Sort by date"
                                    >
                                        Schedule Date
                                        <ArrowUpDown size={11} className={cn("shrink-0", sortBy === 'date' ? "text-brand-red" : "text-text-muted opacity-50")} />
                                        {sortBy === 'date' && (
                                            <span className="text-[8px] font-bold text-brand-red normal-case tracking-tight">{dateAsc ? 'Earliest' : 'Latest'}</span>
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
                                    <tr key={wo.id} className="cursor-pointer group hover:bg-bg-tertiary transition-colors text-left" onClick={() => handleCardClick(wo)}>
                                        <td className="text-left pl-6 py-4">
                                            <div className="flex flex-col items-start gap-1.5 text-left">
                                                <div className="flex items-center gap-1.5 text-left">
                                                    <WorkOrderId wo={wo} />
                                                </div>
                                                <Badge variant={wo.status === 'in-progress' ? 'inprogress' : wo.status === 'checked-out' ? 'checked-out' : 'scheduled'} className="text-[8px] h-4 px-1.5 uppercase tracking-widest">{wo.status}</Badge>
                                            </div>
                                        </td>
                                        <td className="text-left pl-0 py-4 text-left">
                                            <div className="flex flex-col min-w-0 text-left">
                                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors whitespace-normal text-left">{wo.title || wo.description}</p>
                                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest mt-1 text-left">{wo.clientName}</p>
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
                                                        <span className="text-[10px] font-bold text-text-primary uppercase text-left">{tech.name}</span>
                                                    </div>
                                                ) : (
                                                    <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    className="h-8 !text-[10px] border-brand-red text-brand-red hover:bg-brand-red-dim uppercase font-bold tracking-widest"
                                                    onClick={(e) => { e.stopPropagation(); handleOpenEditDialog(wo); }}
                                                    >
                                                    <UserPlus size={14} className="mr-1.5"/> Assign
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-4 pl-0 text-left">
                                            <div className="flex items-center justify-start gap-2 text-[10px] text-text-secondary font-bold uppercase text-left">
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
                                                        <span className="text-[8px] text-text-muted uppercase font-bold tracking-widest mt-0.5 text-right">
                                                            after {wo.blendedIncludedHours || 0} hrs
                                                        </span>
                                                    </>
                                                ) : wo.payType === 'hourly' ? (
                                                    <>
                                                        <span className="text-sm font-mono font-bold text-text-green text-right">${(wo.pay || 0).toFixed(2)}/hr</span>
                                                        <span className="text-[8px] text-text-muted uppercase font-bold tracking-widest mt-0.5 text-right">hourly labor rate</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="text-sm font-mono font-bold text-text-green text-right">${(wo.pay || 0).toFixed(2)}</span>
                                                        <span className="text-[8px] text-text-muted uppercase font-bold tracking-widest mt-0.5 text-right">fixed labor rate</span>
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
                {activeWorkOrders.length === 0 && (
                    <div className="p-12 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30 text-left hidden md:block">
                        <Activity size={32} className="mx-auto text-text-muted mb-4 opacity-20" />
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] italic text-center">No active jobs found matching search criteria</p>
                    </div>
                )}
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
                                    <div className="min-w-0">
                                        <div className="flex flex-col leading-tight">
                                            <span className="cell-id font-mono font-bold text-brand-red !text-[10px]">{(wo.id || '').toUpperCase()}</span>
                                            {isImported(wo) && ext && (
                                                <span className="font-mono font-bold text-brand-cyan text-[9px]">FN #{ext}</span>
                                            )}
                                        </div>
                                        <p className="text-xs font-bold text-text-primary uppercase tracking-wide mt-1 break-words">{wo.title || wo.description}</p>
                                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">{wo.clientName}</p>
                                    </div>
                                    <Badge variant="completed" className="text-[8px] h-4 px-1.5 shrink-0">CLOSED</Badge>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-text-secondary font-bold uppercase">
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
                                    <div className="flex items-center gap-1.5 text-[10px] text-text-muted font-bold uppercase min-w-0">
                                        <User size={11} className="shrink-0" /><span className="truncate">{tech?.name || 'Field Ops'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Badge variant="outline" className={cn("h-6 px-3 uppercase text-[9px] tracking-widest font-black", audit.cls)}>{audit.label}</Badge>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-text-muted hover:text-text-red" onClick={() => requestArchive(wo)}>
                                            <Trash2 size={13}/>
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {archivedWorkOrders.length === 0 && (
                        <div className="p-8 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30">
                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] italic">No historical records found matching current filters.</p>
                        </div>
                    )}
                </div>
                {/* Desktop: table */}
                <div className="table-wrap text-left hidden md:block">
                    <table className="tbl">
                        <thead>
                            <tr className="bg-bg-tertiary">
                                <th className="text-left pl-6 w-[180px]">Status &amp; ID</th>
                                <th className="text-left pl-0">Assignment Identification</th>
                                <th className="text-center">Deployment Coordinates</th>
                                <th className="text-center">
                                    <button
                                        onClick={toggleDateSort}
                                        className="inline-flex items-center gap-1.5 uppercase tracking-widest hover:text-brand-red transition-colors"
                                        title="Sort by date"
                                    >
                                        Original Date &amp; Time
                                        <ArrowUpDown size={11} className={cn("shrink-0", sortBy === 'date' ? "text-brand-red" : "text-text-muted opacity-50")} />
                                        {sortBy === 'date' && (
                                            <span className="text-[8px] font-bold text-brand-red normal-case tracking-tight">{dateAsc ? 'Earliest' : 'Latest'}</span>
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
                                    <tr key={wo.id} className="cursor-pointer group hover:bg-bg-tertiary transition-colors text-left" onClick={() => handleCardClick(wo)}>
                                        {/* Status & ID — internal id + imported (Field Nation) id */}
                                        <td className="text-left pl-6 py-4">
                                            <div className="flex flex-col items-start gap-1.5">
                                                <Badge variant="completed" className="text-[8px] h-4 px-1.5 tracking-widest capitalize">{wo.status === 'archived' ? 'Archived' : 'Completed'}</Badge>
                                                <div className="flex flex-col items-start leading-tight">
                                                    <span className="cell-id font-mono font-bold text-brand-red !text-[10px]">{(wo.id || '').toUpperCase()}</span>
                                                    {isImported(wo) && ext && (
                                                        <span className="font-mono font-bold text-brand-cyan text-[9px]">FN #{ext}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        {/* Assignment Identification + client */}
                                        <td className="py-4 text-left">
                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red transition-colors whitespace-normal text-left">{wo.title || wo.description}</p>
                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-muted uppercase tracking-widest mt-1"><Briefcase size={11}/> {wo.clientName || 'Unassigned Client'}</div>
                                        </td>
                                        {/* Deployment Coordinates */}
                                        <td className="py-4 text-center">
                                            <div className="flex items-center justify-center gap-2 text-[10px] text-text-secondary font-bold uppercase"><MapPin size={12} className="text-brand-red shrink-0" /><span className="whitespace-normal text-center">{formatCityState(wo.location)}</span></div>
                                        </td>
                                        {/* Original Date & Time */}
                                        <td className="py-4 text-center">
                                            <div className="flex flex-col items-center justify-center">
                                                <div className="flex items-center gap-2 text-[10px] text-text-primary font-bold uppercase tracking-tight"><CalendarIcon size={12} className="text-text-muted" />{formatDateDisplay(wo.scheduleDate)}{wo.scheduleTime ? ` · ${wo.scheduleTime}` : ''}</div>
                                                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-text-muted font-bold uppercase"><User size={10}/> {tech?.name || 'Field Ops'}</div>
                                            </div>
                                        </td>
                                        {/* Audit Status — payroll stage; verification happens during pay review */}
                                        <td className="py-4 text-right pr-6">
                                            <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                                                <Badge variant="outline" className={cn("h-7 px-3 uppercase text-[9px] tracking-widest font-black", audit.cls)}>{audit.label}</Badge>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-text-muted hover:text-text-red"
                                                    onClick={() => requestArchive(wo)}
                                                >
                                                    <Trash2 size={14}/>
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                            {archivedWorkOrders.length === 0 && (
                                <tr><td colSpan={5} className="h-32 text-center text-text-muted uppercase text-[10px] tracking-[0.2em] italic">No historical records found matching current filters.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <ListPager pager={historyPager} noun="jobs" />
            </TabsContent>
        </div>

        <JobDetailDialog 
            isOpen={isDetailOpen} 
            setIsOpen={setIsDetailOpen} 
            mission={selectedJob} 
            onEdit={(m) => { setIsDetailOpen(false); handleOpenEditDialog(m); }} 
            onUpdate={handleJobUpdate}
        />
        
        <Dialog open={isEditDialogOpen} onOpenChange={(open) => { if(!open) { setSelectedJob(null); setEditedOrder(null); } setIsEditDialogOpen(open); }}>
          <DialogContent className="sm:max-w-[700px] bg-bg-elevated border-border-default max-h-[90vh] overflow-hidden flex flex-col p-0 shadow-2xl text-left">
              <DialogHeader className="p-6 pb-2 text-left border-b border-border-sub bg-bg-tertiary/30">
                <div className="flex items-center justify-between text-left">
                    <div className="space-y-1 text-left">
                        <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary text-left">Update Assignment Parameters</DialogTitle>
                        <p className="text-xs text-text-muted text-left">Adjust manual parameters for assignment <span className="font-bold text-text-primary">{(selectedJob?.id || '').toUpperCase()}</span></p>
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
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2 text-left">
                                  <Type size={12} className="text-brand-red"/> Job Title
                                </Label>
                                <Input placeholder="e.g. Fiber Audit" value={editedOrder.title || ''} onChange={(e) => setEditedOrder({...editedOrder, title: e.target.value})} className="bg-bg-primary border-border-sub h-10 text-xs font-bold uppercase" />
                            </div>
                            <div className="space-y-2 text-left text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2 text-left">
                                  <FileText size={12} className="text-accent-gold"/> Scope of Work
                                </Label>
                                <Textarea placeholder="Detailed requirements..." value={editedOrder.description || ''} onChange={(e) => setEditedOrder({...editedOrder, description: e.target.value})} className="bg-bg-primary border-border-sub h-24 text-xs text-left" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                            <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Client / Entity</Label>
                              <Input value={editedOrder.clientName || ''} onChange={(e) => setEditedOrder({...editedOrder, clientName: e.target.value})} className="bg-bg-primary h-10 text-xs font-bold uppercase text-left" />
                            </div>
                            <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Site Location</Label>
                              <Input value={editedOrder.location || ''} onChange={(e) => setEditedOrder({...editedOrder, location: e.target.value})} className="bg-bg-primary h-10 text-xs text-left" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                          <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Service Category</Label>
                              <Select value={editedOrder.projectType} onValueChange={(val) => setEditedOrder({...editedOrder, projectType: val})}>
                                  <SelectTrigger className="h-10 bg-bg-primary text-xs uppercase font-bold text-left"><SelectValue /></SelectTrigger>
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
                              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Priority Level</Label>
                              <Select value={editedOrder.priority} onValueChange={(val: any) => setEditedOrder({...editedOrder, priority: val})}>
                                  <SelectTrigger className="h-10 bg-bg-primary text-xs uppercase font-bold text-left"><SelectValue /></SelectTrigger>
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
                              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Schedule Date</Label>
                              <Input type="date" value={editedOrder.scheduleDate || ''} onChange={(e) => setEditedOrder({...editedOrder, scheduleDate: e.target.value})} className="bg-bg-primary h-10 text-xs text-left" />
                          </div>
                          <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Start Window</Label>
                              <Input placeholder="e.g. 10:00 AM EST" value={editedOrder.scheduleTime || ''} onChange={(e) => setEditedOrder({...editedOrder, scheduleTime: e.target.value})} className="bg-bg-primary h-10 text-xs text-left" />
                          </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                          <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Pay Model</Label>
                              <Select value={editedOrder.payType} onValueChange={(val: any) => setEditedOrder({ ...editedOrder, payType: val })}>
                                  <SelectTrigger className="h-10 bg-bg-primary text-xs uppercase font-bold text-left"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                      <SelectItem value="fixed" className="text-xs uppercase font-bold">{PAY_TYPE_LABELS.fixed}</SelectItem>
                                      <SelectItem value="hourly" className="text-xs font-bold">{PAY_TYPE_LABELS.hourly}</SelectItem>
                                      <SelectItem value="blended" className="text-xs font-bold">{PAY_TYPE_LABELS.blended}</SelectItem>
                                  </SelectContent>
                              </Select>
                          </div>
                          {editedOrder.payType !== 'blended' && (
                              <div className="space-y-2 text-left text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Labor Rate ($)</Label>
                                <Input type="number" value={editedOrder.pay || 0} onChange={(e) => setEditedOrder({...editedOrder, pay: parseFloat(e.target.value) || 0})} className="bg-bg-primary h-10 text-xs font-mono text-text-green text-left" />
                              </div>
                          )}
                      </div>

                      {editedOrder.payType === 'blended' && (
                          <div className="grid grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2 duration-300 p-3 rounded-lg border border-border-sub bg-bg-secondary/50 text-left">
                              <div className="space-y-2 text-left text-left">
                                  <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Fixed Base ($)</Label>
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
                                  <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Incl. Hours</Label>
                                  <Input 
                                      type="number"
                                      value={editedOrder.blendedIncludedHours || ''}
                                      onChange={(e) => setEditedOrder({...editedOrder, blendedIncludedHours: parseFloat(e.target.value) || 0})}
                                      className="bg-bg-primary h-9 font-mono text-text-primary text-[11px] text-left"
                                  />
                              </div>
                              <div className="space-y-2 text-left text-left">
                                  <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted text-left">Post Rate ($/hr)</Label>
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
                              <p className="col-span-3 text-[9px] text-text-muted uppercase font-bold italic tracking-tighter text-left">Fixed amount for specified hours, then hourly rate applies.</p>
                          </div>
                      )}

                        <Separator className="bg-border-sub text-left" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                            <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] uppercase font-bold text-text-muted ml-1 text-center block text-left">Technician Allocation</Label>
                              <Select value={editedOrder.assignedTechnicianId || editedOrder.techId || 'unassigned'} onValueChange={(val) => setEditedOrder({ ...editedOrder, assignedTechnicianId: val === 'unassigned' ? null : val, status: val === 'unassigned' ? 'unassigned' : 'assigned' })}>
                                <SelectTrigger className="bg-bg-primary h-11 focus:ring-brand-red text-xs text-left">
                                  <SelectValue placeholder="Select Technician" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned" className="text-brand-red font-bold uppercase tracking-widest">UNASSIGNED</SelectItem>
                                  {sortTechniciansForDeployment(technicians.filter(isAssignableTechnician)).map(tech => <SelectItem key={tech.id} value={tech.id} disabled={isInactiveTechnician(tech)} className="text-xs uppercase font-bold">{tech.name}{isInactiveTechnician(tech) ? ' · Inactive' : ''}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2 text-left text-left">
                              <Label className="text-[10px] uppercase font-bold text-text-muted ml-1 text-center block text-left">Operational Status</Label>
                              <Select value={editedOrder.status} onValueChange={(val: any) => setEditedOrder({ ...editedOrder, status: val })}>
                                <SelectTrigger className="bg-bg-primary h-11 uppercase font-bold tracking-wider focus:ring-brand-red text-xs text-left">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned" className="text-xs uppercase font-bold">UNASSIGNED</SelectItem>
                                  <SelectItem value="assigned" className="text-xs uppercase font-bold">ASSIGNED</SelectItem>
                                  <SelectItem value="confirmed" className="text-xs uppercase font-bold">CONFIRMED</SelectItem>
                                  <SelectItem value="on-my-way" className="text-xs uppercase font-bold">ON MY WAY</SelectItem>
                                  <SelectItem value="in-progress" className="text-xs uppercase font-bold">IN PROGRESS</SelectItem>
                                  <SelectItem value="checked-out" className="text-xs uppercase font-bold">CHECKED OUT</SelectItem>
                                  <SelectItem value="completed" className="text-xs uppercase font-bold">COMPLETED</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                        </div>
                    </div>
                  </div>
              )}
              <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default mt-4 shrink-0 flex flex-row items-center justify-between text-left">
                <Button variant="destructive-outline" onClick={() => requestArchive(selectedJob)} className="h-11 px-8 uppercase font-bold text-[10px] tracking-widest border-brand-red text-text-red hover:bg-brand-red-dim">
                    <Trash2 size={16} className="mr-2" />
                    Archive
                </Button>
                <div className="flex gap-3 text-left">
                    <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="h-11 px-8 uppercase font-bold text-[10px] tracking-widest">Cancel</Button>
                    <Button onClick={handleSaveChanges} className="h-11 px-12 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest text-white">Save Changes</Button>
                </div>
              </DialogFooter>
          </DialogContent>
        </Dialog>
      </Tabs>

      <AlertDialog open={!!orderToArchive} onOpenChange={(open) => { if (!open && !isArchiving) setOrderToArchive(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to Archives?</AlertDialogTitle>
            <AlertDialogDescription>
              This assignment{orderToArchive?.title ? ` (${orderToArchive.title})` : ''} will be moved to the Archives page.
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
              {isArchiving ? 'Archiving…' : 'Move to Archives'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
