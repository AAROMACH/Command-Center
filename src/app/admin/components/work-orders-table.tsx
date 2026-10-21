"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import type { WorkOrder, Technician } from "@/lib/types";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import {
  Calendar,
  Clock,
  MapPin,
  Pencil,
  UserPlus,
  DollarSign,
  User,
  Users,
  Search,
  Building2,
  Check,
  Navigation,
  Eye,
  ShieldCheck,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Activity,
  Type,
  FileText,
  RefreshCw,
  Trash2,
  Archive as ArchiveIcon,
  Lock,
  CheckCircle2,
  Wrench,
  Target,
  Loader2,
  Timer,
  ArrowUpDown
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCityState, isAssignableTechnician, isInactiveTechnician, sortTechniciansForDeployment, sanitize } from "@/lib/utils";
import { JobDetailDialog } from "@/components/job-detail-dialog";
import { StatusBadge } from '@/components/status-badge';
import { WorkOrderId } from "@/components/work-order-id";
import { isPayAdmin } from "@/lib/permissions";
import { archiveJobRecord, toUnassignedWorkOrder } from "@/lib/jobs";
import { db } from "@/lib/firebase";
import { NotificationService } from '@/lib/notification-service';
import { collection, onSnapshot, query, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { PAY_TYPE_LABELS, ID_PREFIXES } from '@/lib/constants';
import { createDocId } from '@/lib/generateId';
import { computeSla, slaStatusColor, formatSlaCountdown } from '@/lib/sla';
import { auditFieldChange } from '@/lib/audit';
import { moveJobLogOnSwap, describeSwapLogMove } from '@/lib/weekly-log';

const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return 'TBD';
    try {
        const parts = dateStr.split(/[-/]/);
        let d: Date;
        if (parts[0].length === 4) {
            d = new Date(dateStr + 'T12:00:00');
        } else {
            const [m, day, y] = parts;
            if (y && m && day) {
                d = new Date(`${y}-${m}-${day}T12:00:00`);
            } else {
                return dateStr;
            }
        }
        return format(d, 'MM-dd-yyyy');
    } catch (e) {
        return dateStr;
    }
};

type WorkOrdersTableProps = {
  workOrders: WorkOrder[];
  allWorkOrders: WorkOrder[];
  technicians: Technician[];
  onWorkOrdersChange: (orders: WorkOrder[]) => void;
  mode: 'unassigned' | 'scheduled' | 'assigned';
  dateAsc?: boolean;
  isDateSortActive?: boolean;
  onToggleDateSort?: () => void;
  mobileAssignOrder?: WorkOrder | null;
  onMobileAssignOrderHandled?: () => void;
  /** Phone card list asks the (CSS-hidden) table to open its edit form. */
  mobileEditOrder?: WorkOrder | null;
  onMobileEditOrderHandled?: () => void;
};

export const WorkOrdersTable = React.memo(({
  workOrders,
  technicians,
  mode,
  dateAsc,
  isDateSortActive,
  onToggleDateSort,
  mobileAssignOrder,
  onMobileAssignOrderHandled,
  mobileEditOrder,
  onMobileEditOrderHandled,
}: WorkOrdersTableProps) => {
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [techSearchQuery, setTechSearchQuery] = useState("");

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editedOrder, setEditedOrder] = useState<WorkOrder | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailJob, setDetailJob] = useState<WorkOrder | null>(null);

  const [currentUser, setCurrentUser] = useState<Technician | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  // Captured separately from selectedOrder: opening the confirm closes the
  // edit dialog (which nulls selectedOrder), so the confirm keeps its own ref.
  const [orderToDelete, setOrderToDelete] = useState<WorkOrder | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    const userId = sessionStorage.getItem('currentUserId');
    if (userId) {
      setCurrentUser(technicians.find(t => t.id === userId) || null);
    }
  }, [technicians]);

  useEffect(() => {
    setCurrentPage(1);
  }, [workOrders.length, itemsPerPage]);

  // workOrders arrives pre-sorted from the parent (respects the Latest/Soonest
  // toggle) — re-sorting here by scheduleDate string would both discard that
  // order and mis-sort non-ISO date strings alphabetically.
  const totalPages = Math.ceil(workOrders.length / (itemsPerPage || 1));
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return workOrders.slice(start, start + itemsPerPage);
  }, [workOrders, currentPage, itemsPerPage]);

  const handleOpenAssignDialog = useCallback((order: WorkOrder) => {
    setSelectedOrder(order);
    setTechSearchQuery("");
    setIsDialogOpen(true);
  }, []);

  useEffect(() => {
    if (!mobileAssignOrder) return;
    handleOpenAssignDialog(mobileAssignOrder);
    onMobileAssignOrderHandled?.();
  }, [mobileAssignOrder, handleOpenAssignDialog, onMobileAssignOrderHandled]);

  const handleOpenEditDialog = useCallback((order: WorkOrder) => {
    if (order.status === 'completed') return;
    setSelectedOrder(order);
    setEditedOrder({ ...order });
    setIsEditDialogOpen(true);
  }, []);

  useEffect(() => {
    if (!mobileEditOrder) return;
    handleOpenEditDialog(mobileEditOrder);
    onMobileEditOrderHandled?.();
  }, [mobileEditOrder, handleOpenEditDialog, onMobileEditOrderHandled]);

  const handleOpenDetail = useCallback((order: WorkOrder) => {
    setDetailJob(order);
    setIsDetailOpen(true);
  }, []);

  const filteredTechniciansRegistry = useMemo(() => {
    const matched = technicians
      .filter(isAssignableTechnician)
      .filter(t => (t.name || '').toLowerCase().includes(techSearchQuery.toLowerCase()))
      // Alphabetical — the reliability score was never recalculated, so it
      // was ranking techs on stale numbers. Removed until it's real.
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    // Deactivated accounts stay visible but drop to the bottom and render
    // disabled/greyed (see isInactiveTechnician usage below).
    return sortTechniciansForDeployment(matched);
  }, [technicians, techSearchQuery]);

  const handleAssign = useCallback(async (techId: string) => {
    if (!selectedOrder) return;
    const targetTech = technicians.find(t => t.id === techId);
    if (!targetTech || !isAssignableTechnician(targetTech) || isInactiveTechnician(targetTech)) return;

    try {
      const assignmentId = await createDocId(ID_PREFIXES.ASSIGNMENT);
      const assignmentRef = doc(db, 'assignments', assignmentId);
      const woRef = doc(db, 'workOrders', selectedOrder.id);
      const today = format(new Date(), 'MM-dd-yyyy');

      const assignmentData = {
          ...selectedOrder,
          id: assignmentId,
          workOrderId: selectedOrder.id,
          techId: techId,
          assignedTechnicianId: techId,
          status: 'assigned',
          assignedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          history: [
            ...(selectedOrder.history || []),
            { type: 'status_change', date: today, details: `Job assigned to ${technicians.find(t => t.id === techId)?.name}.`, user: currentUser?.name || 'Admin' }
          ]
      };

      await setDoc(assignmentRef, assignmentData);
      await deleteDoc(woRef);
      NotificationService.notifyJobChange(selectedOrder, assignmentData, assignmentId).catch(() => {});

      setIsDialogOpen(false);
      setSelectedOrder(null);
      toast({ title: "Job assigned", description: `Job ${assignmentId.toUpperCase()} was assigned.` });
    } catch (e: any) {
      console.error("Assign Update Error:", e);
      toast({ variant: "destructive", title: "Assignment failed", description: e.message });
    }
  }, [selectedOrder, technicians, currentUser, toast]);

  const handleSaveChanges = () => {
    if (!editedOrder || !selectedOrder) return;
    
    let finalUpdate = { ...editedOrder };
    
    const payAdmin = isPayAdmin(currentUser);
    const payChanged = (editedOrder.pay || 0) !== (selectedOrder.pay || 0) || editedOrder.payType !== selectedOrder.payType;

    if (payChanged && !payAdmin) {
      finalUpdate.pay = selectedOrder.pay;
      finalUpdate.payType = selectedOrder.payType;
      finalUpdate.payChangeRequest = {
        pay: editedOrder.pay || 0,
        payType: editedOrder.payType || 'fixed',
        requestedBy: currentUser?.id || 'unknown',
        requestedAt: new Date().toISOString()
      };
      toast({ title: "Pay change requested", description: "Pay changes need approval from a pay admin." });
    }

    const today = format(new Date(), 'MM-dd-yyyy');
    const history = [...(editedOrder.history || [])];

    // Read the RAW legacy field, not the assignedTechnicianId-preferring
    // helper — a doc left desynced by a pre-fix swap has techId still
    // pointing at the old tech even though assignedTechnicianId is already
    // correct, and we need that mismatch to register as a change below.
    const prevTechId = (selectedOrder as any).techId || selectedOrder.assignedTechnicianId || '';
    const newTechId = finalUpdate.assignedTechnicianId || '';
    // Always keep techId in sync with the selected tech, even if the
    // dropdown wasn't touched this save — self-heals any doc left stale by
    // a swap that happened before techId syncing existed.
    (finalUpdate as any).techId = newTechId || null;
    if (newTechId !== prevTechId) {
      const prevTechName = technicians.find(t => t.id === prevTechId)?.name || (prevTechId ? prevTechId : 'Unassigned');
      const newTechName = technicians.find(t => t.id === newTechId)?.name || (newTechId ? newTechId : 'Unassigned');
      history.push({
        type: 'tech_swap',
        date: today,
        previousTechnicianId: prevTechId || null,
        previousTechnicianName: prevTechName,
        newTechnicianId: newTechId || null,
        newTechnicianName: newTechName,
        details: `Reassigned from ${prevTechName} to ${newTechName}`,
        user: currentUser?.name || 'Admin'
      } as any);
    }

    history.push({ type: 'note', date: today, details: `Job details edited.`, user: currentUser?.name || 'Admin' });
    finalUpdate.history = history;

    const runAudit = (collectionName: string) => {
      const auditableFields = ['status', 'priority', 'pay', 'payType', 'scheduleDate', 'scheduleTime', 'assignedTechnicianId', 'location', 'slaResponseTarget', 'slaResolutionTarget'];
      const oldVals: Record<string, unknown> = {};
      const newVals: Record<string, unknown> = {};
      for (const f of auditableFields) {
        oldVals[f] = (selectedOrder as any)[f];
        newVals[f] = (finalUpdate as any)[f];
      }
      auditFieldChange(collectionName, editedOrder!.id, currentUser?.id || 'unknown', currentUser?.name || 'Admin', oldVals, newVals).catch(console.warn);
    };

    // A doc's collection follows its assignment state: unassigned jobs live in
    // `workOrders`, assigned ones in `assignments`. A plain updateDoc() only
    // ever touches the doc's CURRENT collection, so clearing/setting the tech
    // here must also migrate the doc across collections — otherwise an
    // "unassigned" job stays stuck in `assignments` (invisible to the
    // Unassigned tab, which only reads workOrders) and a newly-assigned job
    // stays stuck in `workOrders` (invisible to Assignments).
    const wasInAssignments = mode !== 'unassigned';
    const nowUnassigned = !finalUpdate.assignedTechnicianId;

    if (wasInAssignments && nowUnassigned) {
      const targetWo = toUnassignedWorkOrder(finalUpdate as WorkOrder, [{
        type: 'status_change', date: today,
        details: `Unassigned by ${currentUser?.name || 'Admin'} and returned to the Unassigned pool.`,
        user: currentUser?.name || 'Admin',
      }]);
      setDoc(doc(db, 'workOrders', targetWo.id), sanitize(targetWo))
        .then(() => deleteDoc(doc(db, 'assignments', editedOrder.id)))
        .then(() => runAudit('assignments'))
        .then(() => NotificationService.notifyJobChange(selectedOrder, finalUpdate))
        .catch((e: any) => {
          console.error("Unassign Error:", e);
          toast({ variant: "destructive", title: "Save failed", description: e.message });
        });
    } else if (!wasInAssignments && !nowUnassigned) {
      (async () => {
        try {
          const assignmentId = await createDocId(ID_PREFIXES.ASSIGNMENT);
          const assignmentData = sanitize({
            ...finalUpdate,
            id: assignmentId,
            workOrderId: editedOrder.id,
            updatedAt: new Date().toISOString(),
          });
          await setDoc(doc(db, 'assignments', assignmentId), assignmentData);
          await deleteDoc(doc(db, 'workOrders', editedOrder.id));
          runAudit('workOrders');
          NotificationService.notifyJobChange(selectedOrder, finalUpdate, assignmentId).catch(() => {});
        } catch (e: any) {
          console.error("Assign Error:", e);
          toast({ variant: "destructive", title: "Save failed", description: e.message });
        }
      })();
    } else {
      const collectionName = mode === 'unassigned' ? 'workOrders' : 'assignments';
      const docRef = doc(db, collectionName, editedOrder.id);
      updateDoc(docRef, sanitize({ ...finalUpdate })).then(async () => {
        runAudit(collectionName);
        if (collectionName === 'assignments') NotificationService.notifyJobChange(selectedOrder, finalUpdate).catch(() => {});
        if (collectionName === 'assignments' && newTechId !== prevTechId) {
          const moved = await moveJobLogOnSwap({ job: finalUpdate as WorkOrder, fromTechIds: [prevTechId, selectedOrder.assignedTechnicianId], toTechId: newTechId });
          const note = describeSwapLogMove(moved, technicians.find(t => t.id === prevTechId)?.name || 'the previous tech', technicians.find(t => t.id === newTechId)?.name || 'the new tech');
          if (note) toast({ variant: note.warn ? 'destructive' : undefined, title: 'Weekly log', description: note.text });
        }
      }).catch((e: any) => {
          console.error("Save Changes Error:", e);
          toast({ variant: "destructive", title: "Save failed", description: e.message });
      });
    }

    setIsEditDialogOpen(false);
    setSelectedOrder(null);
    setEditedOrder(null);
    toast({ title: "Saved", description: "Job updated." });
  };

  const handleDeleteOrder = () => {
    if (!selectedOrder) return;
    // Capture the order, then CLOSE the edit dialog before opening the confirm.
    // Two Radix modal overlays open at once leaves pointer-events:none stuck on
    // the body — that was the "freeze" the moment Delete was pressed.
    setOrderToDelete(selectedOrder);
    setIsEditDialogOpen(false);
    setIsDeleteConfirmOpen(true);
  };

  const executeDeleteOrder = () => {
    const order = orderToDelete;
    if (!order) return;
    const collectionName = mode === 'unassigned' ? 'workOrders' : 'assignments';
    const label = collectionName === 'assignments' ? 'Assignment' : 'Work order';

    // Close the confirm and clear refs FIRST — the UI must never block on a
    // Firestore round-trip (a slow/denied write previously kept the dialog
    // open and froze the app).
    setIsDeleteConfirmOpen(false);
    setOrderToDelete(null);

    // Moves the doc into activityArchive (see lib/jobs.ts#archiveJobRecord) —
    // every field is preserved in the archived copy and the record can be
    // restored from the Archives page.
    (async () => {
      try {
        await archiveJobRecord({
          job: order,
          collectionName: collectionName as 'workOrders' | 'assignments',
          archivedBy: 'Admin',
          archiveReason: `Archived from Dispatch Hub`,
          techName: technicians.find(t => t.id === (order.assignedTechnicianId || order.techId))?.name,
        });
        toast({ title: `${label} archived`, description: "Moved to History — you can restore it from there." });
      } catch (e: any) {
        console.error("Archive Error:", e);
        toast({ variant: "destructive", title: "Archive failed", description: e?.message || "Could not archive. Please try again." });
      }
    })();
  };

  const handleJobUpdate = useCallback((woId: string, updates: Partial<WorkOrder>) => {
    const collectionName = mode === 'unassigned' ? 'workOrders' : 'assignments';
    const docRef = doc(db, collectionName, woId);
    updateDoc(docRef, updates).catch((e: any) => {
        console.error("Job Update Error:", e);
        toast({ variant: "destructive", title: "Save failed", description: e.message });
    });
  }, [mode, toast]);

  return (
    <div className="w-full space-y-4">
      <div className="table-wrap border-none rounded-none overflow-x-auto">
        <table className="tbl min-w-[700px]">
          <thead>
            <tr className="bg-bg-tertiary">
              <th className="text-center w-[160px] pl-0">Status &amp; ID</th>
              <th className="text-left pl-0 min-w-[260px]">Job</th>
              <th className="text-center w-[160px]">
                {onToggleDateSort ? (
                  <button
                    onClick={onToggleDateSort}
                    className="inline-flex items-center justify-center gap-1.5 hover:text-brand-red transition-colors"
                    title="Sort by date"
                  >
                    Schedule
                    <ArrowUpDown size={11} className={cn("shrink-0", isDateSortActive ? "text-brand-red" : "text-text-muted opacity-50")} />
                    {isDateSortActive && (
                      <span className="text-[10px] font-bold text-brand-red normal-case tracking-tight">{dateAsc ? 'Earliest' : 'Latest'}</span>
                    )}
                  </button>
                ) : 'Schedule'}
              </th>
              <th className="text-left pl-0 w-[250px]">Location</th>
              <th className="text-center w-[180px]">{mode === 'scheduled' || mode === 'assigned' ? 'Technician' : 'Labor rate'}</th>
              <th className="text-center w-[120px]"></th>
            </tr>
          </thead>
          <tbody>
            {paginatedOrders.map((order) => {
              const techId = order.assignedTechnicianId || order.assignedTechIds?.[0] || order.techId;
              const technician = technicians.find(t => t.id === techId);
              const isLocked = order.status === 'completed';
              
              return (
                <tr key={order.id} className="group hover:bg-bg-tertiary transition-colors cursor-pointer" onClick={() => handleOpenDetail(order)}>
                  <td className="pl-0 py-4">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <StatusBadge kind="job" value={order.status} />
                      <WorkOrderId wo={order} className="!text-[10px]" />
                      {order.status !== 'completed' && (() => {
                        const sla = computeSla(order);
                        if (sla.status === 'on-track') return null;
                        return (
                          <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${slaStatusColor(sla.status)}`}>
                            <Timer size={8} />
                            {sla.status === 'breached' ? 'SLA Breached' : sla.status === 'at-risk' ? `SLA ${formatSlaCountdown(sla.hoursUntilResolutionBreach)}` : ''}
                          </div>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="!py-4 text-left pl-0">
                    <div className="flex flex-col text-left">
                      <div className="text-xs font-bold text-text-primary tracking-wide leading-tight group-hover:text-brand-red transition-colors text-left">{order.title || order.description}</div>
                      <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mt-1 text-left">{order.clientName}</div>
                    </div>
                  </td>
                  <td className="py-4">
                    <div className="flex flex-col items-start justify-center gap-1.5 pl-0">
                      <div className="flex items-center gap-2 text-[10px] text-text-secondary font-mono font-bold">
                        <Calendar size={13} className="text-text-muted shrink-0" />
                        <span>{formatDateDisplay(order.scheduleDate)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-text-secondary font-mono font-bold">
                        <Clock size={13} className="text-text-muted shrink-0" />
                        <span>{order.scheduleTime}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-4">
                    <div className="flex items-center justify-start gap-2 text-[10px] text-text-secondary font-bold pl-0 text-left">
                      <MapPin size={11} className="text-brand-red shrink-0" />
                      <span className="truncate max-w-[200px] text-left">{formatCityState(order.location)}</span>
                    </div>
                  </td>
                  <td className="py-4">
                    <div className="flex flex-col items-center justify-center">
                        {mode === 'scheduled' || mode === 'assigned' || order.status === 'assigned' || order.status === 'completed' || order.status === 'in-progress' ? (
                        technician ? (
                            <div className="flex flex-col items-center gap-1.5">
                              <div className="flex items-center gap-2.5 text-left">
                                <Avatar className="h-8 w-8 border border-border-sub shadow-sm">
                                    <AvatarImage src={technician.avatarUrl} />
                                    <AvatarFallback className="text-[10px]">{(technician.name || 'U').charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="text-left">
                                    <span className="text-[10px] font-bold text-text-primary uppercase tracking-tight leading-tight">{technician.name}</span>
                                </div>
                              </div>
                              {(order.additionalTechnicianIds || []).length > 0 && (
                                <div className="flex items-center gap-1">
                                  {(order.additionalTechnicianIds || []).slice(0, 3).map((hId: string) => {
                                    const ht = technicians.find(t => t.id === hId);
                                    return (
                                      <Avatar key={hId} className="h-5 w-5 border border-border-sub shadow-sm -ml-1 first:ml-0">
                                        <AvatarImage src={ht?.avatarUrl} />
                                        <AvatarFallback className="text-[10px]">{(ht?.name || '?').charAt(0)}</AvatarFallback>
                                      </Avatar>
                                    );
                                  })}
                                  {(order.additionalTechnicianIds || []).length > 3 && (
                                    <div className="h-5 w-5 rounded-full bg-bg-tertiary border border-border-sub -ml-1 flex items-center justify-center">
                                      <span className="text-[10px] font-bold text-text-muted">+{(order.additionalTechnicianIds || []).length - 3}</span>
                                    </div>
                                  )}
                                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider ml-1">
                                    +{(order.additionalTechnicianIds || []).length} helper{(order.additionalTechnicianIds || []).length > 1 ? 's' : ''}
                                  </span>
                                </div>
                              )}
                            </div>
                        ) : order.status === 'unassigned' ? (
                          // The Actions column already carries the Assign button for
                          // unassigned rows — a second one here would just duplicate it.
                          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Unassigned</span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 !text-[10px] border-brand-red text-brand-red hover:bg-brand-red-dim uppercase font-bold tracking-wider"
                            onClick={(e) => { e.stopPropagation(); handleOpenAssignDialog(order); }}
                          >
                            <UserPlus size={14} className="mr-1.5"/> Assign
                          </Button>
                        )
                        ) : (
                            <div className="flex flex-col items-start leading-none text-left">
                                {order.payType === 'blended' ? (
                                    <>
                                        <span className="font-mono text-xs font-bold text-text-green text-left">
                                            ${(order.blendedFixedPay || 0).toFixed(2)} + ${(order.blendedHourlyRate || 0).toFixed(2)}/hr
                                        </span>
                                        <span className="text-[10px] uppercase font-bold tracking-wider text-text-muted mt-0.5 text-left">
                                            after {order.blendedIncludedHours} hrs
                                        </span>
                                    </>
                                ) : order.payType === 'hourly' ? (
                                    <>
                                        <span className="font-mono text-xs font-bold text-text-green text-left">${order.pay.toFixed(2)}/hr</span>
                                        <span className="text-[10px] uppercase font-bold tracking-wider text-text-muted mt-0.5 text-left">hourly rate</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="font-mono text-xs font-bold text-text-green text-left">${order.pay.toFixed(2)}</span>
                                        <span className="text-[10px] uppercase font-bold tracking-wider text-text-muted mt-0.5 text-left">fixed rate</span>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                  </td>
                  <td className="py-4">
                     <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                       {order.status === 'unassigned' && (
                         <button 
                            className="h-6 rounded bg-brand-red hover:bg-brand-red-hover px-2 text-[11px] font-bold text-white flex items-center gap-1 transition-colors"
                            onClick={() => handleOpenAssignDialog(order)}
                         >
                            <UserPlus size={10}/> Assign
                         </button>
                       )}
                       {!isLocked ? (
                          <button className="h-6 w-6 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors" onClick={() => handleOpenEditDialog(order)}>
                            <Pencil size={14} />
                          </button>
                       ) : (
                          <div className="h-6 w-6 flex items-center justify-center text-text-muted opacity-30" title="Historical Record Locked">
                            <Lock size={12} />
                          </div>
                       )}
                       <button className="h-6 w-6 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors" onClick={() => handleOpenDetail(order)}>
                         <Eye size={14} />
                       </button>
                     </div>
                  </td>
                </tr>
              );
            })}
             {workOrders.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-text-muted font-bold text-xs opacity-40">No jobs here.</td></tr>
            )}
          </tbody>
        </table>

        {workOrders.length > 0 && (
          <div className="bg-bg-tertiary/50 px-4 py-3 flex items-center justify-between border-t border-border-sub">
            <div className="flex items-center gap-4 text-left">
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Show</p>
                <Select value={itemsPerPage.toString()} onValueChange={(v) => setItemsPerPage(parseInt(v))}>
                  <SelectTrigger className="h-7 w-[70px] bg-bg-primary text-[10px] font-bold border-border-sub">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <Button 
                variant="outline" 
                size="icon-sm" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="h-7 w-7 border-border-sub bg-bg-primary"
              >
                <ChevronLeft size={14} />
              </Button>
              <div className="flex items-center gap-1 px-2 text-left">
                <span className="text-[10px] font-bold text-text-primary uppercase tracking-wider">Page {currentPage} of {totalPages}</span>
              </div>
              <Button 
                variant="outline" 
                size="icon-sm" 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="h-7 w-7 border-border-sub bg-bg-primary"
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>

      <JobDetailDialog 
        isOpen={isDetailOpen} 
        setIsOpen={setIsDetailOpen} 
        mission={detailJob} 
        onEdit={(m) => {
          setIsDetailOpen(false);
          // Live record, not the panel's snapshot (see work-orders-client).
          handleOpenEditDialog(workOrders.find(w => w.id === m.id) ?? m);
        }}
        onUpdate={handleJobUpdate}
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[85vh]">
          <DialogHeader className="p-6 pb-2 text-left border-b border-border-sub bg-bg-tertiary/30 text-left">
            <div className="flex items-center justify-between">
                <div className="text-left">
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <UserPlus className="text-brand-red" size={20} />
                        Assign technician
                    </DialogTitle>
                    <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider mt-1">Pick a technician for job <span className="text-text-primary font-bold">{(selectedOrder?.id || '').toUpperCase()}</span></p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] bg-bg-primary border-border-sub px-2 h-4">{selectedOrder?.projectType}</Badge>
                    <Badge variant={selectedOrder?.priority === 'critical' ? 'high' : 'outline'} className="text-[10px] h-4">{selectedOrder?.priority}</Badge>
                </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-hidden px-6 pb-6 space-y-6 mt-4">
             <div className="space-y-4 text-left">
                <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-wider border-b border-border-sub pb-1.5 flex items-center gap-2">
                    <Target size={14} className="text-brand-red"/> Job details
                </h3>
                <div className="p-4 rounded-xl bg-bg-secondary border border-border-sub shadow-inner">
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold text-text-muted">Required skills</p>
                        <div className="flex flex-wrap gap-1.5">
                            {selectedOrder?.requiredSkills?.map(skill => (
                                <Badge key={skill} variant="outline" className="text-[10px] font-bold bg-bg-primary">{skill}</Badge>
                            )) || <span className="text-[11px] text-text-muted ">No required skills</span>}
                        </div>
                    </div>
                    <div className="space-y-1 pt-2">
                        <p className="text-[10px] font-bold text-text-muted">Scope</p>
                        <p className="text-[11px] font-bold text-text-primary leading-tight line-clamp-2">
                            {selectedOrder?.title || selectedOrder?.description}
                        </p>
                    </div>
                </div>
             </div>

             <Separator className="bg-border-sub" />

             <div className="space-y-3 text-left">
                <div className="flex items-center justify-between px-1">
                    <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                        <Users size={14} className="text-brand-red"/> Technicians
                    </h3>
                    <div className="relative w-[240px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
                        <Input 
                            placeholder="Search technicians…" 
                            value={techSearchQuery}
                            onChange={(e) => setTechSearchQuery(e.target.value)}
                            className="bg-bg-primary h-8 pl-8 text-[10px] uppercase font-bold tracking-wide"
                        />
                    </div>
                </div>
                <ScrollArea className="h-[250px] rounded-xl border border-border-sub bg-bg-primary shadow-inner">
                    <div className="divide-y divide-border-sub">
                        {filteredTechniciansRegistry.map(tech => {
                            const inactive = isInactiveTechnician(tech);

                            return (
                                <div key={tech.id} className={cn(
                                    "p-4 flex items-center justify-between group transition-all",
                                    inactive ? "opacity-40" : "hover:bg-bg-tertiary"
                                )}>
                                    <div className="flex items-center gap-4 text-left">
                                        <Avatar className="h-10 w-10 border border-border-sub transition-all group-hover:scale-105">
                                          <AvatarImage src={tech.avatarUrl} />
                                          <AvatarFallback>{(tech.name || 'U').charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div className="text-left">
                                            <div className="flex items-center gap-2">
                                                <p className="text-xs font-bold tracking-tight text-left">{tech.name}</p>
                                                {inactive && (
                                                    <Badge variant="outline" className="text-[10px] h-3.5 px-1.5 border-text-muted/40 text-text-muted">Inactive</Badge>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    <Navigation size={10} className="text-text-muted" />
                                                    <p className="text-[11px] text-text-muted font-bold truncate max-w-[120px]">{tech.address || tech.currentLocation}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        disabled={inactive}
                                        title={inactive ? 'Inactive technicians cannot be assigned' : undefined}
                                        onClick={() => handleAssign(tech.id)}
                                        className="h-9 text-[10px] px-8 uppercase font-bold tracking-wider bg-bg-tertiary text-text-muted hover:bg-brand-red hover:text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-bg-tertiary disabled:hover:text-text-muted"
                                    >
                                        Assign
                                    </Button>
                                </div>
                            )
                        })}
                    </div>
                </ScrollArea>
             </div>
          </div>

          <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default shrink-0">
             <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full h-11 uppercase font-bold text-[10px] tracking-wider">Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={(open) => { if(!open) { setSelectedOrder(null); setEditedOrder(null); } setIsEditDialogOpen(open); }}>
        <DialogContent className="sm:max-w-[750px] bg-bg-elevated border-border-default max-h-[90vh] overflow-hidden flex flex-col p-0 shadow-2xl">
            <DialogHeader className="p-4 sm:p-6 pb-2 text-left border-b border-border-sub bg-bg-tertiary/30 text-left">
                <div className="flex items-center justify-between">
                    <div className="space-y-1 text-left">
                        <DialogTitle className="text-lg font-bold text-text-primary">Edit Job</DialogTitle>
                        <p className="text-xs text-text-muted text-left">Update the details for job <span className="font-bold text-text-primary">{selectedOrder?.id.toUpperCase()}</span></p>
                    </div>
                </div>
            </DialogHeader>
            {editedOrder && (
                // Plain native scroll, not Radix's ScrollArea — its internal
                // Viewport hardcodes an inline position:relative that blocks
                // percentage/flex height from reliably reaching it inside a
                // flex-col dialog, so tall content silently got clipped
                // instead of scrolling. Confirmed with a live browser test.
                <div className="flex-1 min-h-0 overflow-y-auto">
                    <div className="px-4 sm:px-6 py-4 space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-2">
                                  <Type size={12} className="text-brand-red"/> Job Title
                                </Label>
                                <Input placeholder="e.g. Network audit" value={editedOrder.title || ''} onChange={(e) => setEditedOrder({...editedOrder, title: e.target.value})} className="bg-bg-primary border-border-sub h-10 text-xs font-bold" />
                            </div>
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-2">
                                  <FileText size={12} className="text-accent-gold"/> Scope of Work
                                </Label>
                                <Textarea placeholder="What needs to be done…" value={editedOrder.description || ''} onChange={(e) => setEditedOrder({...editedOrder, description: e.target.value})} className="bg-bg-primary border-border-sub h-24 text-xs" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Client</Label>
                                <Input value={editedOrder.clientName || ''} onChange={(e) => setEditedOrder({...editedOrder, clientName: e.target.value})} className="bg-bg-primary h-10 text-xs font-bold" />
                            </div>
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Location</Label>
                                <Input value={editedOrder.location || ''} onChange={(e) => setEditedOrder({...editedOrder, location: e.target.value})} className="bg-bg-primary h-10 text-xs" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Service category</Label>
                                <Select value={editedOrder.projectType} onValueChange={(val) => setEditedOrder({...editedOrder, projectType: val})}>
                                    <SelectTrigger className="h-10 bg-bg-primary text-xs font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Installation">Installation</SelectItem>
                                        <SelectItem value="Troubleshooting">Troubleshooting</SelectItem>
                                        <SelectItem value="Maintenance">Maintenance</SelectItem>
                                        <SelectItem value="Survey">Survey</SelectItem>
                                        <SelectItem value="Repair">Repair</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Priority</Label>
                                <Select value={editedOrder.priority} onValueChange={(val: any) => setEditedOrder({...editedOrder, priority: val})}>
                                    <SelectTrigger className="h-10 bg-bg-primary text-xs font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                        <SelectItem value="critical">Critical</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Date</Label>
                                <Input type="date" value={editedOrder.scheduleDate || ''} onChange={(e) => setEditedOrder({...editedOrder, scheduleDate: e.target.value})} className="h-10 bg-bg-primary text-xs" />
                            </div>
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Start time</Label>
                                <Input placeholder="e.g. 10:00 AM EST" value={editedOrder.scheduleTime || ''} onChange={(e) => setEditedOrder({...editedOrder, scheduleTime: e.target.value})} className="h-10 bg-bg-primary h-10 text-xs" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Pay type</Label>
                                <Select value={editedOrder.payType} onValueChange={(val: any) => setEditedOrder({...editedOrder, payType: val})}>
                                    <SelectTrigger className="h-10 bg-bg-primary text-xs font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="fixed" className="text-xs font-bold">{PAY_TYPE_LABELS.fixed}</SelectItem>
                                        <SelectItem value="hourly" className="text-xs font-bold">{PAY_TYPE_LABELS.hourly}</SelectItem>
                                        <SelectItem value="blended" className="text-xs font-bold">{PAY_TYPE_LABELS.blended}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {editedOrder.payType !== 'blended' && (
                                <div className="space-y-2 text-left">
                                  <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Labor rate ($)</Label>
                                  <Input type="number" value={editedOrder.pay || 0} onChange={(e) => setEditedOrder({...editedOrder, pay: parseFloat(e.target.value) || 0})} className="bg-bg-primary h-10 text-xs font-mono text-text-green" />
                                </div>
                            )}
                        </div>

                        {editedOrder.payType === 'blended' && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2 duration-300 p-3 rounded-lg border border-border-sub bg-bg-secondary/50 text-left">
                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Fixed base ($)</Label>
                                    <div className="relative">
                                        <DollarSign size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                                        <Input 
                                            type="number"
                                            value={editedOrder.blendedFixedPay || ''}
                                            onChange={(e) => {
                                              const val = parseFloat(e.target.value) || 0;
                                              setEditedOrder({...editedOrder, blendedFixedPay: val, pay: val});
                                            }}
                                            className="bg-bg-primary h-9 pl-6 font-mono text-text-green text-[11px]"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Incl. hours</Label>
                                    <Input 
                                        type="number"
                                        value={editedOrder.blendedIncludedHours || ''}
                                        onChange={(e) => setEditedOrder({...editedOrder, blendedIncludedHours: parseFloat(e.target.value) || 0})}
                                        className="bg-bg-primary h-9 font-mono text-text-primary text-[11px]"
                                    />
                                </div>
                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Then ($/hr)</Label>
                                    <div className="relative">
                                        <DollarSign size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                                        <Input 
                                            type="number"
                                            value={editedOrder.blendedHourlyRate || ''}
                                            onChange={(e) => setEditedOrder({...editedOrder, blendedHourlyRate: parseFloat(e.target.value) || 0})}
                                            className="bg-bg-primary h-9 font-mono text-text-green text-[11px]"
                                        />
                                    </div>
                                </div>
                                <p className="sm:col-span-3 text-[10px] text-text-muted uppercase font-bold text-left">Fixed amount for the included hours, then the hourly rate applies.</p>
                            </div>
                        )}

                        <Separator className="bg-border-sub" />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold text-text-muted ml-1 text-center block">Technician</Label>
                                <Select value={editedOrder.assignedTechnicianId || 'unassigned'} onValueChange={(val) => setEditedOrder({ ...editedOrder, assignedTechnicianId: val === 'unassigned' ? null : val, status: val === 'unassigned' ? 'unassigned' : 'assigned' })}>
                                    <SelectTrigger className="bg-bg-primary h-11 focus:ring-brand-red text-xs">
                                        <SelectValue placeholder="Select technician" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unassigned" className="text-brand-red font-bold">Unassigned</SelectItem>
                                        {sortTechniciansForDeployment(technicians.filter(isAssignableTechnician)).map(tech => <SelectItem key={tech.id} value={tech.id} disabled={isInactiveTechnician(tech)} className="text-xs font-bold">{tech.name}{isInactiveTechnician(tech) ? ' · Inactive' : ''}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] font-bold text-text-muted ml-1 text-center block">Status</Label>
                                <Select value={editedOrder.status} onValueChange={(val: any) => setEditedOrder({ ...editedOrder, status: val })}>
                                    <SelectTrigger className="bg-bg-primary h-11 font-bold tracking-wider focus:ring-brand-red text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unassigned" className="text-xs font-bold">Unassigned</SelectItem>
                                        <SelectItem value="assigned" className="text-xs font-bold">Assigned</SelectItem>
                                        <SelectItem value="confirmed" className="text-xs font-bold">Confirmed</SelectItem>
                                        <SelectItem value="on-my-way" className="text-xs font-bold">On my way</SelectItem>
                                        <SelectItem value="in-progress" className="text-xs font-bold">In progress</SelectItem>
                                        <SelectItem value="completed" className="text-xs font-bold">Completed</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Stacks on phones (Save on top, within thumb reach); one row on
                wider screens. The old single row overflowed a phone. */}
            <DialogFooter className="bg-bg-tertiary/30 p-4 sm:p-6 border-t border-border-default mt-4 shrink-0 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                <Button variant="destructive-outline" onClick={handleDeleteOrder} className="h-11 w-full sm:w-auto px-8 uppercase font-bold text-[10px] tracking-wider border-brand-red text-text-red hover:bg-brand-red-dim">
                    <Trash2 size={16} className="mr-2" />
                    Archive
                </Button>
                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
                    <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="h-11 w-full sm:w-auto px-8 uppercase font-bold text-[10px] tracking-wider">Cancel</Button>
                    <Button onClick={handleSaveChanges} className="h-11 w-full sm:w-auto px-10 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-wider text-white shadow-lg">
                        Save Changes
                    </Button>
                </div>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={open => { if (!open) { setIsDeleteConfirmOpen(false); setOrderToDelete(null); } }}>
        <AlertDialogContent className="bg-bg-elevated border-border-main">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary font-bold tracking-wide text-sm">Archive this job?</AlertDialogTitle>
            <AlertDialogDescription className="text-text-muted text-[11px]">
              <span className="font-bold text-text-primary">{((orderToDelete as any)?.externalWorkOrderId || orderToDelete?.id || '').toString().toUpperCase()}</span> will be removed from Dispatch and moved to History. You can restore it from there later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[10px] font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-bold"
              onClick={executeDeleteOrder}
            >
              <ArchiveIcon size={12} className="mr-1.5" />Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});

WorkOrdersTable.displayName = "WorkOrdersTable";
