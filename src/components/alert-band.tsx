'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Clock,
  FileCheck,
  CalendarCheck,
  FileWarning,
  Briefcase,
  ClipboardList,
  Play,
  Activity,
  ChevronRight,
  Info,
  Users,
  MapPin,
  Banknote
} from "lucide-react";
import { cn } from "@/lib/utils";
import { addDays } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where, doc } from 'firebase/firestore';
import type { WorkOrder, Project, ServiceRequest, WeeklyLog, TimeOffRequest, SiteRequest, Invoice } from '@/lib/types';

type AlertType = 'critical' | 'warning' | 'info' | 'success';

type Alert = {
  id: string;
  type: AlertType;
  text: string;
  description: string;
  icon: React.ElementType;
  actionPath: string;
  actionLabel: string;
}

export function AlertBand() {
  const pathname = usePathname();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<any>(null);

  // Role-specific data — only what is needed per portal
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [siteRequests, setSiteRequests] = useState<SiteRequest[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [assignments, setAssignments] = useState<WorkOrder[]>([]);

  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Effect 1: Get current user document
  useEffect(() => {
    const storedId = localStorage.getItem('currentUserId');
    if (!storedId) return;

    const unsubUser = onSnapshot(doc(db, 'users', storedId), (snap) => {
      if (snap.exists()) setCurrentUser({ ...snap.data(), id: snap.id });
    });

    return () => unsubUser();
  }, []);

  // Effect 2: Set up role-specific, filtered listeners once user is known
  useEffect(() => {
    if (!currentUser) return;

    const unsubs: (() => void)[] = [];

    if (pathname.startsWith('/tech')) {
      // Tech: only own assignments and only draft logs
      unsubs.push(onSnapshot(
        query(collection(db, 'assignments'), where('techId', '==', currentUser.id)),
        (snap) => setAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)))
      ));
      unsubs.push(onSnapshot(
        query(collection(db, 'weeklyLogs'),
          where('techId', '==', currentUser.id),
          where('status', '==', 'Draft')),
        (snap) => setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)))
      ));
    } else if (pathname.startsWith('/client')) {
      const company = currentUser.clientCompany;
      if (!company) return;
      // Client: only own active projects, new requests, and own invoices
      unsubs.push(onSnapshot(
        query(collection(db, 'projects'), where('client', '==', company), where('status', '==', 'active')),
        (snap) => setProjects(snap.docs.map(d => ({ ...d.data(), id: d.id } as Project)))
      ));
      unsubs.push(onSnapshot(
        query(collection(db, 'clientRequests'), where('clientName', '==', company), where('status', '==', 'new')),
        (snap) => setServiceRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as ServiceRequest)))
      ));
      unsubs.push(onSnapshot(
        query(collection(db, 'invoices'), where('clientName', '==', company)),
        (snap) => setInvoices(snap.docs.map(d => ({ ...d.data(), id: d.id } as Invoice)))
      ));
    } else {
      // Admin: filtered to only the status values needed for alerts
      unsubs.push(onSnapshot(
        query(collection(db, 'workOrders'), where('status', '==', 'unassigned')),
        (snap) => setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)))
      ));
      unsubs.push(onSnapshot(
        query(collection(db, 'weeklyLogs'), where('status', '==', 'Submitted')),
        (snap) => setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)))
      ));
      unsubs.push(onSnapshot(
        query(collection(db, 'timeOffRequests'), where('status', '==', 'pending')),
        (snap) => setTimeOffRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as TimeOffRequest)))
      ));
      unsubs.push(onSnapshot(
        query(collection(db, 'siteRequests'), where('status', '==', 'pending')),
        (snap) => setSiteRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as SiteRequest)))
      ));
    }

    return () => unsubs.forEach(u => u());
  }, [currentUser?.id, pathname]);

  const alerts = useMemo(() => {
    if (!currentUser) return [];

    const currentAlerts: Alert[] = [];

    if (pathname.startsWith('/tech')) {
      const activeJob = assignments.find(wo =>
        (wo.assignedTechnicianId === currentUser.id || wo.techId === currentUser.id) &&
        wo.status === 'in-progress'
      );
      if (activeJob) {
        currentAlerts.push({
          id: 'tech-active',
          type: 'success',
          text: 'LIVE SESSION',
          description: `You are currently checked into mission ${activeJob.id.toUpperCase()}. Ensure you finalize the session and upload any site photos before checking out.`,
          icon: Play,
          actionPath: '/tech/dashboard',
          actionLabel: 'Open Session Terminal'
        });
      }

      const tomorrow = addDays(new Date(), 1);
      const now = new Date();
      const upcomingJobsCount = assignments.filter(wo =>
        (wo.assignedTechnicianId === currentUser.id || wo.techId === currentUser.id) &&
        new Date(wo.scheduleDate + 'T12:00:00') >= now && new Date(wo.scheduleDate + 'T12:00:00') < tomorrow &&
        (wo.status === 'assigned' || wo.status === 'confirmed')
      ).length;

      if (upcomingJobsCount > 0) {
        currentAlerts.push({
          id: 'tech-upcoming',
          type: 'info',
          text: `${upcomingJobsCount} upcoming job${upcomingJobsCount > 1 ? 's' : ''}`,
          description: `You have ${upcomingJobsCount} upcoming assignment(s) scheduled for the next 24 hours. Review site access notes and instructions in your calendar.`,
          icon: CalendarCheck,
          actionPath: '/tech/assignments?tab=active',
          actionLabel: 'View Schedule'
        });
      }

      // weeklyLogs is already filtered to Draft status for this tech
      if (weeklyLogs.length > 0) {
        currentAlerts.push({
          id: 'tech-logs',
          type: 'warning',
          text: `${weeklyLogs.length} log${weeklyLogs.length > 1 ? 's' : ''} pending`,
          description: `Your weekly work log is currently in draft status. Submit for administrative audit to avoid payout delays.`,
          icon: FileWarning,
          actionPath: '/tech/logs',
          actionLabel: 'Finalize Logs'
        });
      }
    } else if (pathname.startsWith('/client')) {
      // projects filtered to active already
      if (projects.length > 0) {
        currentAlerts.push({
          id: 'client-projects',
          type: 'info',
          text: `${projects.length} project${projects.length > 1 ? 's' : ''}`,
          description: `Aaromach technicians are currently executing phase-based infrastructure deployment across ${projects.length} of your sites.`,
          icon: Briefcase,
          actionPath: '/client/projects?tab=active',
          actionLabel: 'Track Progress'
        });
      }

      // serviceRequests filtered to new status already
      if (serviceRequests.length > 0) {
        currentAlerts.push({
          id: 'client-tickets',
          type: 'warning',
          text: `${serviceRequests.length} pending ticket${serviceRequests.length > 1 ? 's' : ''}`,
          description: `Your recently submitted service tickets are currently undergoing administrative audit at the Command Center.`,
          icon: ClipboardList,
          actionPath: '/client/tickets?tab=requested',
          actionLabel: 'View Tickets'
        });
      }

      const pendingInvoicesCount = invoices.filter(inv => inv.status === 'sent' || inv.status === 'overdue').length;
      if (pendingInvoicesCount > 0) {
        currentAlerts.push({
          id: 'client-invoices',
          type: 'critical',
          text: `${pendingInvoicesCount} pending invoice${pendingInvoicesCount > 1 ? 's' : ''}`,
          description: `You have ${pendingInvoicesCount} outstanding invoice(s) awaiting settlement. Review details in the Billing Terminal.`,
          icon: Banknote,
          actionPath: '/client/financials',
          actionLabel: 'View Billing'
        });
      }
    } else {
      // Admin: all collections are pre-filtered to alert-relevant statuses
      if (workOrders.length > 0) {
        currentAlerts.push({
          id: 'admin-unassigned',
          type: 'critical',
          text: `${workOrders.length} unassigned job${workOrders.length > 1 ? 's' : ''}`,
          description: `There are ${workOrders.length} missions in the active window requiring operative allocation. Immediate dispatch required.`,
          icon: AlertTriangle,
          actionPath: '/admin/dispatch?tab=dispatch',
          actionLabel: 'Dispatch Hub'
        });
      }

      if (weeklyLogs.length > 0) {
        currentAlerts.push({
          id: 'admin-audit',
          type: 'info',
          text: `${weeklyLogs.length} log${weeklyLogs.length > 1 ? 's' : ''} pending`,
          description: `Field operatives have submitted weekly logs that require financial and operational authorization.`,
          icon: FileCheck,
          actionPath: '/admin/financials?tab=payroll',
          actionLabel: 'Payroll Terminal'
        });
      }

      if (timeOffRequests.length > 0) {
        currentAlerts.push({
          id: 'admin-personnel-requests',
          type: 'info',
          text: `${timeOffRequests.length} personnel request${timeOffRequests.length > 1 ? 's' : ''}`,
          description: `Field staff have submitted absence logs or time-off requests that require administrative review.`,
          icon: Users,
          actionPath: '/admin/directory?tab=requests&subtab=personnel',
          actionLabel: 'Review Requests'
        });
      }

      if (siteRequests.length > 0) {
        currentAlerts.push({
          id: 'admin-site-requests',
          type: 'warning',
          text: `${siteRequests.length} site request${siteRequests.length > 1 ? 's' : ''}`,
          description: `Clients have submitted new site coordinates that require verification and authorization before they can be used for assignments.`,
          icon: MapPin,
          actionPath: '/admin/directory?tab=requests&subtab=client',
          actionLabel: 'Verify Coordinates'
        });
      }
    }

    return currentAlerts;
  }, [pathname, currentUser, workOrders, assignments, weeklyLogs, projects, serviceRequests, timeOffRequests, siteRequests, invoices]);

  const handleAlertClick = (alert: Alert) => {
    setSelectedAlert(alert);
    setIsDialogOpen(true);
  };

  const handleAction = () => {
    if (selectedAlert) {
      router.push(selectedAlert.actionPath);
      setIsDialogOpen(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between border-b border-border-main bg-[#0f0f0f] px-4 md:px-8 py-2 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              onClick={() => handleAlertClick(alert)}
              role="button"
              tabIndex={0}
              aria-label={`Alert: ${alert.text}`}
              onKeyDown={(e) => e.key === 'Enter' && handleAlertClick(alert)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition-all hover:opacity-80 active:scale-[0.98] whitespace-nowrap',
                {
                  'border border-border-alert bg-brand-red-dim text-text-red shadow-[0_0_10px_rgba(204,34,0,0.15)]': alert.type === 'critical',
                  'border border-border-gold bg-accent-gold-dim text-accent-gold': alert.type === 'warning',
                  'border border-border-main bg-bg-tertiary text-text-secondary': alert.type === 'info',
                  'border border-green-border bg-green-dim text-text-green animate-pulse': alert.type === 'success',
                }
              )}
            >
              <alert.icon className={cn("h-3.5 w-3.5", alert.type === 'success' && 'fill-current')} />
              <span>{alert.text}</span>
            </div>
          ))}
          {alerts.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted opacity-40">
              <Activity size={12} />
              Registry Nominal
            </div>
          )}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[450px] bg-bg-elevated border-border-default">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              {selectedAlert && (
                <div className={cn(
                  "p-2 rounded-lg border",
                  selectedAlert.type === 'critical' ? "bg-brand-red-dim text-text-red border-border-alert" :
                  selectedAlert.type === 'warning' ? "bg-accent-gold-dim text-accent-gold border-border-gold" :
                  selectedAlert.type === 'success' ? "bg-green-dim text-text-green border-green-border" :
                  "bg-bg-secondary text-text-secondary border-border-sub"
                )}>
                  <selectedAlert.icon size={20} />
                </div>
              )}
              <div className="text-left">
                <DialogTitle className="uppercase tracking-widest text-text-primary text-base">Operational Alert</DialogTitle>
                <p className={cn(
                  "text-[10px] font-bold uppercase tracking-widest",
                  selectedAlert?.type === 'critical' ? 'text-text-red' : 'text-text-muted'
                )}>
                  {selectedAlert?.type} priority
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="py-4">
            {selectedAlert && (
              <div className="p-4 rounded-lg bg-bg-secondary border border-border-sub">
                <p className="text-xs text-text-primary font-bold uppercase mb-2 flex items-center gap-2">
                  <Info size={14} className="text-brand-red" />
                  Details
                </p>
                <p className="text-xs text-text-secondary leading-relaxed text-left">
                  {selectedAlert.description}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border-default pt-4 gap-3">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="h-10 flex-1 uppercase font-bold text-[10px] tracking-widest">
              Dismiss
            </Button>
            <Button onClick={handleAction} className="h-10 flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest text-white">
              {selectedAlert?.actionLabel || 'Take Action'}
              <ChevronRight size={14} className="ml-1.5" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
