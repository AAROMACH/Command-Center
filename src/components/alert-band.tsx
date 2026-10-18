'use client';
import { onSharedSnapshot } from '@/lib/shared-snapshot';

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
import { cn, isInactiveTechnician } from "@/lib/utils";
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
import type { WorkOrder, Project, ServiceRequest, WeeklyLog, TimeOffRequest, SiteRequest, Invoice, PayrollDispute, Technician } from '@/lib/types';
import { isAssignedTo } from '@/lib/jobs';

type AlertType = 'critical' | 'warning' | 'info' | 'success';
const PRIORITY_LABEL: Record<AlertType, string> = { critical: 'Needs attention now', warning: 'Needs attention soon', info: 'For your information', success: 'In progress' };

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
  const [payrollDisputes, setPayrollDisputes] = useState<PayrollDispute[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);

  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Effect 1: Get current user document
  useEffect(() => {
    const storedId = sessionStorage.getItem('currentUserId');
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
        (snap) => setAssignments(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)).filter(wo => isAssignedTo(wo, currentUser.id)))
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
      unsubs.push(onSharedSnapshot('users',
        (snap) => setTechnicians(snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician)))
      ));
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
      unsubs.push(onSnapshot(
        query(collection(db, 'payrollDisputes'), where('status', '==', 'open')),
        (snap) => setPayrollDisputes(snap.docs.map(d => ({ ...d.data(), id: d.id } as PayrollDispute)))
      ));
    }

    return () => unsubs.forEach(u => u());
  }, [currentUser?.id, pathname]);

  const alerts = useMemo(() => {
    if (!currentUser) return [];

    const currentAlerts: Alert[] = [];
    const inactiveTechIds = new Set(technicians.filter(isInactiveTechnician).map(t => t.id));
    const activeWeeklyLogs = weeklyLogs.filter(log => !inactiveTechIds.has(log.techId));
    const activeTimeOffRequests = timeOffRequests.filter(request => !inactiveTechIds.has(request.techId));
    const activePayrollDisputes = payrollDisputes.filter(dispute => !inactiveTechIds.has(dispute.techId));

    if (pathname.startsWith('/tech')) {
      if (isInactiveTechnician(currentUser)) return [];
      const activeJob = assignments.find(wo =>
        (wo.assignedTechnicianId === currentUser.id || wo.techId === currentUser.id) &&
        wo.status === 'in-progress'
      );
      if (activeJob) {
        currentAlerts.push({
          id: 'tech-active',
          type: 'success',
          text: 'On site now',
          description: `You're checked in on job ${activeJob.id.toUpperCase()}. Upload any site photos before you check out.`,
          icon: Play,
          actionPath: '/tech/dashboard',
          actionLabel: 'Open job'
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
          description: `You have ${upcomingJobsCount} job${upcomingJobsCount > 1 ? 's' : ''} in the next 24 hours. Check the site access notes and instructions before you go.`,
          icon: CalendarCheck,
          actionPath: '/tech/assignments?tab=active',
          actionLabel: 'View schedule'
        });
      }

      // weeklyLogs is already filtered to Draft status for this tech
      if (activeWeeklyLogs.length > 0) {
        currentAlerts.push({
          id: 'tech-logs',
          type: 'warning',
          text: `${activeWeeklyLogs.length} log${activeWeeklyLogs.length > 1 ? 's' : ''} pending`,
          description: `Your weekly log is still a draft. Submit it for review so your pay isn't delayed.`,
          icon: FileWarning,
          actionPath: '/tech/logs',
          actionLabel: 'Open logs'
        });
      }
    } else if (pathname.startsWith('/client')) {
      // projects filtered to active already
      if (projects.length > 0) {
        currentAlerts.push({
          id: 'client-projects',
          type: 'info',
          text: `${projects.length} active project${projects.length > 1 ? 's' : ''}`,
          description: `Aaromach technicians are working on ${projects.length} active project${projects.length > 1 ? 's' : ''} at your sites.`,
          icon: Briefcase,
          actionPath: '/client/projects?tab=active',
          actionLabel: 'View projects'
        });
      }

      // serviceRequests filtered to new status already
      if (serviceRequests.length > 0) {
        currentAlerts.push({
          id: 'client-tickets',
          type: 'warning',
          text: `${serviceRequests.length} pending ticket${serviceRequests.length > 1 ? 's' : ''}`,
          description: `Your recently submitted tickets are waiting for our team to review them.`,
          icon: ClipboardList,
          actionPath: '/client/tickets?tab=requested',
          actionLabel: 'View tickets'
        });
      }

      const pendingInvoicesCount = invoices.filter(inv => inv.status === 'sent' || inv.status === 'overdue').length;
      if (pendingInvoicesCount > 0) {
        currentAlerts.push({
          id: 'client-invoices',
          type: 'critical',
          text: `${pendingInvoicesCount} pending invoice${pendingInvoicesCount > 1 ? 's' : ''}`,
          description: `You have ${pendingInvoicesCount} unpaid invoice${pendingInvoicesCount > 1 ? 's' : ''}. See the details in Billing.`,
          icon: Banknote,
          actionPath: '/client/financials',
          actionLabel: 'View billing'
        });
      }
    } else {
      // Admin: all collections are pre-filtered to alert-relevant statuses
      if (workOrders.length > 0) {
        currentAlerts.push({
          id: 'admin-unassigned',
          type: 'critical',
          text: `${workOrders.length} unassigned job${workOrders.length > 1 ? 's' : ''}`,
          description: `${workOrders.length} job${workOrders.length > 1 ? 's need' : ' needs'} a technician assigned.`,
          icon: AlertTriangle,
          actionPath: '/admin/dispatch?tab=dispatch',
          actionLabel: 'Dispatch'
        });
      }

      if (activeWeeklyLogs.length > 0) {
        currentAlerts.push({
          id: 'admin-audit',
          type: 'info',
          text: `${activeWeeklyLogs.length} log${activeWeeklyLogs.length > 1 ? 's' : ''} pending`,
          description: `Technicians have submitted weekly logs that need review and approval.`,
          icon: FileCheck,
          actionPath: '/admin/financials?tab=payroll',
          actionLabel: 'Payroll'
        });
      }

      if (activeTimeOffRequests.length > 0) {
        currentAlerts.push({
          id: 'admin-personnel-requests',
          type: 'info',
          text: `${activeTimeOffRequests.length} time-off request${activeTimeOffRequests.length > 1 ? 's' : ''}`,
          description: `Technicians have asked for time off and need a decision.`,
          icon: Users,
          actionPath: '/admin/directory?tab=requests&subtab=personnel',
          actionLabel: 'Review requests'
        });
      }

      if (siteRequests.length > 0) {
        currentAlerts.push({
          id: 'admin-site-requests',
          type: 'warning',
          text: `${siteRequests.length} site request${siteRequests.length > 1 ? 's' : ''}`,
          description: `Clients have submitted new site locations. Check and approve them before they can be used for jobs.`,
          icon: MapPin,
          actionPath: '/admin/directory?tab=requests&subtab=client',
          actionLabel: 'Review sites'
        });
      }

      if (activePayrollDisputes.length > 0) {
        currentAlerts.push({
          id: 'admin-payroll-disputes',
          type: 'critical',
          text: `${activePayrollDisputes.length} payroll dispute${activePayrollDisputes.length > 1 ? 's' : ''}`,
          description: `Technicians have disputed a job or log after payout. Review them to resolve the difference.`,
          icon: AlertTriangle,
          actionPath: '/admin/payroll/audit?tab=adjustments',
          actionLabel: 'Review disputes'
        });
      }
    }

    return currentAlerts;
  }, [pathname, currentUser, workOrders, assignments, weeklyLogs, projects, serviceRequests, timeOffRequests, siteRequests, invoices, payrollDisputes, technicians]);

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
      <div className="flex items-center justify-between border-b border-border-main bg-sidebar px-4 md:px-8 py-2 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              onClick={() => handleAlertClick(alert)}
              role="button"
              tabIndex={0}
              aria-label={`Alert: ${alert.text}`}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), handleAlertClick(alert))}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md px-3 py-1 text-[12px] font-medium transition-all hover:opacity-80 active:scale-[0.98] whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red',
                {
                  'border border-border-alert bg-brand-red-dim text-text-red': alert.type === 'critical',
                  'border border-border-gold bg-accent-gold-dim text-accent-gold': alert.type === 'warning',
                  'border border-border-main bg-bg-tertiary text-text-secondary': alert.type === 'info',
                  'border border-green-border bg-green-dim text-text-green': alert.type === 'success',
                }
              )}
            >
              <alert.icon className={cn("h-3.5 w-3.5", alert.type === 'success' && 'fill-current')} />
              <span>{alert.text}</span>
            </div>
          ))}
          {alerts.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-1 text-[12px] text-text-muted">
              <Activity size={13} />
              Nothing needs attention
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
                <DialogTitle className="text-text-primary text-base font-semibold">{selectedAlert?.text ? selectedAlert.text.charAt(0).toUpperCase() + selectedAlert.text.slice(1) : 'Alert'}</DialogTitle>
                <DialogDescription className={cn(
                  "text-[12px]",
                  selectedAlert?.type === 'critical' ? 'text-text-red' : 'text-text-muted'
                )}>
                  {selectedAlert ? PRIORITY_LABEL[selectedAlert.type] : ''}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-4">
            {selectedAlert && (
              <div className="p-4 rounded-lg bg-bg-secondary border border-border-sub">
                <p className="text-[13px] text-text-primary font-semibold mb-1.5 flex items-center gap-2">
                  <Info size={14} className="text-text-muted" />
                  Details
                </p>
                <p className="text-[13px] text-text-secondary leading-relaxed text-left">
                  {selectedAlert.description}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border-default pt-4 gap-3">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="flex-1">
              Dismiss
            </Button>
            <Button onClick={handleAction} className="flex-1">
              {selectedAlert?.actionLabel || 'Open'}
              <ChevronRight size={14} className="ml-1.5" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
