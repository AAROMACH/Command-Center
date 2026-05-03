'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { 
  AlertTriangle, 
  Clock, 
  CopyX, 
  FileCheck, 
  CalendarCheck, 
  FileWarning,
  Briefcase,
  ClipboardList
} from "lucide-react";
import { cn } from "@/lib/utils";
import { workOrders, penaltyEvents, weeklyLogs, technicians, projects, serviceRequests } from '@/lib/data';
import { addDays } from 'date-fns';

type Alert = {
  type: 'critical' | 'warning' | 'info';
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
      // 1. Upcoming assignment in 24 hours
      const tomorrow = addDays(new Date(), 1);
      const now = new Date();
      const upcomingJobs = workOrders.filter(wo =>
        wo.assignedTechnicianId === userId &&
        new Date(wo.scheduleDate) >= now && new Date(wo.scheduleDate) < tomorrow &&
        wo.status !== 'completed'
      ).length;

      if (upcomingJobs > 0) {
        currentAlerts.push({
          type: 'info',
          text: `${upcomingJobs} Assignment${upcomingJobs > 1 ? 's' : ''} in next 24h`,
          icon: CalendarCheck,
        });
      }

      // 2. Pending weekly log
      const pendingLogs = weeklyLogs.filter(log =>
        log.technicianId === userId && log.status === 'Draft'
      ).length;

      if (pendingLogs > 0) {
        currentAlerts.push({
          type: 'warning',
          text: `${pendingLogs} Weekly Log Pending Submission`,
          icon: FileWarning,
        });
      }

      // 3. Recent penalty events
      const recentPenalties = penaltyEvents.filter(p => p.technicianId === userId).length;
       if (recentPenalties > 0) {
        currentAlerts.push({
          type: 'critical',
          text: `${recentPenalties} Recent Penalty Event${recentPenalties > 1 ? 's' : ''}`,
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
            text: `${activeProjects} Active Deployment${activeProjects > 1 ? 's' : ''} in Progress`,
            icon: Briefcase,
          });
        }

        if (pendingRequests > 0) {
          currentAlerts.push({
            type: 'warning',
            text: `${pendingRequests} New Service Request${pendingRequests > 1 ? 's' : ''} Pending Review`,
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
          text: `${unassignedJobs} Unassigned Assignment${unassignedJobs > 1 ? 's' : ''}`,
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
          text: `${logsToAudit} Log${logsToAudit > 1 ? 's' : ''} Pending Audit`,
          icon: FileCheck
        });
      }
    }

    setAlerts(currentAlerts);
  }, [pathname]);

  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-default bg-[#0f0f0f] px-10 py-2">
      {alerts.map((alert, index) => (
        <div
          key={index}
          className={cn(
            'flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition-opacity hover:opacity-80',
            {
              'border border-border-red bg-brand-red-dim text-text-red': alert.type === 'critical',
              'border border-gold-border bg-accent-gold-dim text-accent-gold': alert.type === 'warning',
              'border border-border-default bg-bg-tertiary text-text-secondary': alert.type === 'info',
            }
          )}
        >
          <alert.icon className="h-3 w-3" />
          <span>{alert.text}</span>
        </div>
      ))}
    </div>
  );
}
