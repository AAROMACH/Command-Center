'use client';

import { useState, useEffect } from 'react';
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
  ExternalLink,
  Mail,
  MessageSquare,
  Users,
  MapPin
} from "lucide-react";
import { cn } from "@/lib/utils";
import { workOrders, penaltyEvents, weeklyLogs, technicians, projects, serviceRequests, timeOffRequests, siteRequests } from '@/lib/data';
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
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    const userId = localStorage.getItem('currentUserId');
    if (!userId) return;

    const user = technicians.find(t => t.id === userId);
    if (!user) return;

    const currentAlerts: Alert[] = [];

    if (pathname.startsWith('/tech')) {
      const activeJob = workOrders.find(wo => wo.assignedTechnicianId === userId && wo.status === 'in-progress');
      if (activeJob) {
        currentAlerts.push({
          id: 'tech-active',
          type: 'success',
          text: `LIVE SESSION`,
          description: `You are currently checked into mission ${activeJob.id.toUpperCase()}. Ensure you finalize the session and upload any site photos before checking out.`,
          icon: Play,
          actionPath: '/tech/dashboard',
          actionLabel: 'Open Session Terminal'
        });
      }

      const tomorrow = addDays(new Date(), 1);
      const now = new Date();
      const upcomingJobsCount = workOrders.filter(wo =>
        wo.assignedTechnicianId === userId &&
        new Date(wo.scheduleDate) >= now && new Date(wo.scheduleDate) < tomorrow &&
        wo.status === 'assigned'
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

      const pendingLogsCount = weeklyLogs.filter(log =>
        log.technicianId === userId && log.status === 'Draft'
      ).length;

      if (pendingLogsCount > 0) {
        currentAlerts.push({
          id: 'tech-logs',
          type: 'warning',
          text: `${pendingLogsCount} log${pendingLogsCount > 1 ? 's' : ''} pending`,
          description: `Your weekly work log is currently in draft status. Submit for administrative audit to avoid payout delays.`,
          icon: FileWarning,
          actionPath: '/tech/logs',
          actionLabel: 'Finalize Logs'
        });
      }

      const recentPenalties = penaltyEvents.filter(p => p.technicianId === userId).length;
       if (recentPenalties > 0) {
        currentAlerts.push({
          id: 'tech-penalties',
          type: 'critical',
          text: `${recentPenalties} penalty events`,
          description: `Discrepancies have been identified in your recent field activity. Review the penalty ledger to see specific points of failure.`,
          icon: AlertTriangle,
          actionPath: '/tech/profile?tab=reliability',
          actionLabel: 'Audit Penalty Ledger'
        });
      }
    } else if (pathname.startsWith('/client')) {
      const company = user.clientCompany;
      if (company) {
        const activeProjectsCount = projects.filter(p => p.client === company && p.status === 'active').length;
        const pendingRequestsCount = serviceRequests.filter(r => r.clientName === company && r.status === 'new').length;

        if (activeProjectsCount > 0) {
          currentAlerts.push({
            id: 'client-projects',
            type: 'info',
            text: `${activeProjectsCount} projects`,
            description: `Aaromach technicians are currently executing phase-based infrastructure deployment across ${activeProjectsCount} of your sites.`,
            icon: Briefcase,
            actionPath: '/client/projects?tab=active',
            actionLabel: 'Track Progress'
          });
        }

        if (pendingRequestsCount > 0) {
          currentAlerts.push({
            id: 'client-tickets',
            type: 'warning',
            text: `${pendingRequestsCount} pending tickets`,
            description: `Your recently submitted service tickets are currently undergoing administrative audit at the Command Center.`,
            icon: ClipboardList,
            actionPath: '/client/tickets?tab=requested',
            actionLabel: 'View Tickets'
          });
        }
      }
    } else { 
      const unassignedJobsCount = workOrders.filter(wo => wo.status === 'unassigned').length;
      const logsToAuditCount = weeklyLogs.filter(log => log.status === 'Submitted').length;
      const pendingPersonnelCount = timeOffRequests.filter(r => r.status === 'pending').length;
      const pendingSiteCount = siteRequests.filter(r => r.status === 'pending').length;

      if (unassignedJobsCount > 0) {
        currentAlerts.push({
          id: 'admin-unassigned',
          type: 'critical',
          text: `${unassignedJobsCount} unassigned jobs`,
          description: `There are ${unassignedJobsCount} missions in the active window requiring operative allocation. Immediate dispatch required.`,
          icon: AlertTriangle,
          actionPath: '/admin/dispatch?tab=unassigned',
          actionLabel: 'Dispatch Hub'
        });
      }
      
      currentAlerts.push({
        id: 'admin-missed',
        type: 'warning',
        text: `1 missed check-in`,
        description: `An operative has failed to verify site presence within the scheduled window. Follow up or force session termination.`,
        icon: Clock,
        actionPath: '/admin/reports?tab=flags',
        actionLabel: 'Activity Audit'
      });

      if (logsToAuditCount > 0) {
        currentAlerts.push({
          id: 'admin-audit',
          type: 'info',
          text: `${logsToAuditCount} logs pending`,
          description: `Field operatives have submitted weekly logs that require financial and operational authorization.`,
          icon: FileCheck,
          actionPath: '/admin/financials?tab=payroll',
          actionLabel: 'Payroll Terminal'
        });
      }

      if (pendingPersonnelCount > 0) {
        currentAlerts.push({
          id: 'admin-personnel-requests',
          type: 'info',
          text: `${pendingPersonnelCount} personnel requests`,
          description: `Field staff have submitted absence logs or time-off requests that require administrative review.`,
          icon: Users,
          actionPath: '/admin/directory?tab=requests&subtab=personnel',
          actionLabel: 'Review Requests'
        });
      }

      if (pendingSiteCount > 0) {
        currentAlerts.push({
          id: 'admin-site-requests',
          type: 'warning',
          text: `${pendingSiteCount} site requests`,
          description: `Clients have submitted new site coordinates that require verification and authorization before they can be used for assignments.`,
          icon: MapPin,
          actionPath: '/admin/directory?tab=requests&subtab=client',
          actionLabel: 'Verify Coordinates'
        });
      }
    }

    setAlerts(currentAlerts);
  }, [pathname]);

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

  const isClientPortal = pathname.startsWith('/client');

  return (
    <>
      <div className="flex items-center justify-between border-b border-border-main bg-[#0f0f0f] px-4 md:px-8 py-2 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              onClick={() => handleAlertClick(alert)}
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
                <Activity size={12}/>
                Registry Nominal
            </div>
          )}
        </div>

        {isClientPortal && (
          <div className="flex items-center gap-4 border-l border-border-sub/30 pl-4 shrink-0">
            <div className="flex items-center gap-2">
               <div className="h-5 w-5 rounded-full bg-brand-red text-[8px] font-black text-white flex items-center justify-center">SC</div>
               <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted hidden md:block">Lead: <span className="text-text-primary">Sarah Connor</span></p>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-brand-red hover:text-brand-red-hover transition-colors">
                <Mail size={12} /> Email
              </button>
              <button className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-brand-red hover:text-brand-red-hover transition-colors">
                <MessageSquare size={12} /> SMS
              </button>
            </div>
          </div>
        )}
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
              <div>
                <DialogTitle className="uppercase tracking-widest text-text-primary text-base">Operational Alert Briefing</DialogTitle>
                <p className={cn(
                  "text-[10px] font-bold uppercase tracking-widest",
                  selectedAlert?.type === 'critical' ? 'text-text-red' : 'text-text-muted'
                )}>
                  {selectedAlert?.type} priority
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="py-6">
            {selectedAlert && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-bg-secondary border border-border-sub">
                  <p className="text-xs text-text-primary font-bold uppercase mb-2 flex items-center gap-2">
                    <Info size={14} className="text-brand-red" />
                    Strategic Context
                  </p>
                  <p className="text-xs text-text-secondary leading-relaxed uppercase font-medium">
                    {selectedAlert.description}
                  </p>
                </div>
                
                <div className="p-3 rounded-lg bg-bg-primary/50 border border-dashed border-border-sub text-center">
                  <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest">
                    Registry Event: {selectedAlert.id.toUpperCase()}
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border-default pt-4 gap-3">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="h-10 flex-1 uppercase font-bold text-[10px] tracking-widest">
              Dismiss
            </Button>
            <Button onClick={handleAction} className="h-10 flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest">
              {selectedAlert?.actionLabel || 'Take Action'}
              <ChevronRight size={14} className="ml-1.5" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
