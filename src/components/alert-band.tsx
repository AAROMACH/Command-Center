'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { 
  AlertTriangle, 
  Clock, 
  FileCheck, 
  CalendarCheck, 
  FileWarning,
  Briefcase,
  ClipboardList,
  Play,
  Activity
} from "lucide-react";
import { cn } from "@/lib/utils";
import { workOrders, penaltyEvents, weeklyLogs, technicians, projects, serviceRequests } from '@/lib/data';
import { addDays } from 'date-fns';

type AlertType = 'critical' | 'warning' | 'info' | 'success';

type Alert = {
  type: AlertType;
  text: string;
  icon: React.ElementType;
}

export function AlertBand() {
  const pathname = usePathname();
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    const userId = localStorage.getItem('currentUserId');
    if (!userId) return;

    const user = technicians.find(t => t.id === userId);
    if (!user) return;

    const currentAlerts: Alert[] = [];

    if (pathname.startsWith('/tech')) {
      // 0. Active Session (Critical Live Status)
      const activeJob = workOrders.find(wo => wo.assignedTechnicianId === userId && wo.status === 'in-progress');
      if (activeJob) {
        currentAlerts.push({
          type: 'success',
          text: `LIVE SESSION: Checked in at ${activeJob.location}`,
          icon: Play,
        });
      }

      // 1. Upcoming Job in 24 hours
      const tomorrow = addDays(new Date(), 1);
      const now = new Date();
      const upcomingJobs = workOrders.filter(wo =>
        wo.assignedTechnicianId === userId &&
        new Date(wo.scheduleDate) >= now && new Date(wo.scheduleDate) < tomorrow &&
        wo.status === 'assigned'
      ).length;

      if (upcomingJobs > 0) {
        currentAlerts.push({
          type: 'info',
          text: `${upcomingJobs} field job${upcomingJobs > 1 ? 's' : ''} in next 24h`,
          icon: CalendarCheck,
        });
      }

      // 2. Pending field log
      const pendingLogs = weeklyLogs.filter(log =>
        log.technicianId === userId && log.status === 'Draft'
      ).length;

      if (pendingLogs > 0) {
        currentAlerts.push({
          type: 'warning',
          text: `${pendingLogs} field log${pendingLogs > 1 ? 's' : ''} pending submission`,
          icon: FileWarning,
        });
      }

      // 3. Recent Job discrepancies (Penalties)
      const recentPenalties = penaltyEvents.filter(p => p.technicianId === userId).length;
       if (recentPenalties > 0) {
        currentAlerts.push({
          type: 'critical',
          text: `${recentPenalties} recent job penalty event${recentPenalties > 1 ? 's' : ''}`,
          icon: AlertTriangle,
        });
      }
    } else if (pathname.startsWith('/client')) {
      // Client Portal Alerts
      const company = user.clientCompany;
      if (company) {
        const activeProjects = projects.filter(p => p.client === company && p.status === 'active').length;
        const pendingRequests = serviceRequests.filter(r => r.clientName === company && r.status === 'new').length;

        if (activeProjects > 0) {
          currentAlerts.push({
            type: 'info',
            text: `${activeProjects} active low voltage project${activeProjects > 1 ? 's' : ''} in progress`,
            icon: Briefcase,
          });
        }

        if (pendingRequests > 0) {
          currentAlerts.push({
            type: 'warning',
            text: `${pendingRequests} new service request${pendingRequests > 1 ? 's' : ''} pending review`,
            icon: ClipboardList,
          });
        }
      }
    } else { 
      // Admin Portal Alerts
      const unassignedJobs = workOrders.filter(wo => wo.status === 'unassigned').length;
      const logsToAudit = weeklyLogs.filter(log => log.status === 'Submitted').length;

      if (unassignedJobs > 0) {
        currentAlerts.push({
          type: 'critical',
          text: `${unassignedJobs} unassigned field job${unassignedJobs > 1 ? 's' : ''}`,
          icon: AlertTriangle
        });
      }
      
      currentAlerts.push({
        type: 'warning',
        text: `1 Late / Missed Check-In`,
        icon: Clock
      });

      if (logsToAudit > 0) {
        currentAlerts.push({
          type: 'info',
          text: `${logsToAudit} field log${logsToAudit > 1 ? 's' : ''} pending audit`,
          icon: FileCheck
        });
      }
    }

    setAlerts(currentAlerts);
  }, [pathname]);

  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-main bg-[#0f0f0f] px-10 py-2">
      {alerts.map((alert, index) => (
        <div
          key={index}
          className={cn(
            'flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition-all hover:opacity-80',
            {
              'border border-border-alert bg-brand-red-dim text-text-red shadow-[0_0_10px_rgba(204,34,0,0.2)]': alert.type === 'critical',
              'border border-border-gold bg-accent-gold-dim text-accent-gold': alert.type === 'warning',
              'border border-border-main bg-bg-tertiary text-text-secondary': alert.type === 'info',
              'border border-green-border bg-green-dim text-text-green animate-pulse': alert.type === 'success',
            }
          )}
        >
          <alert.icon className={cn("h-3 w-3", alert.type === 'success' && 'fill-current')} />
          <span>{alert.text}</span>
        </div>
      ))}
    </div>
  );
}
