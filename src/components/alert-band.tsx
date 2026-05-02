'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AlertTriangle, Clock, CopyX, FileCheck2, CalendarCheck, FileWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import { workOrders, penaltyEvents, weeklyLogs } from '@/lib/data';
import { addDays, isWithinInterval } from 'date-fns';

type Alert = {
  type: 'critical' | 'warning' | 'info';
  text: string;
  icon: React.ElementType;
}

export function AlertBand() {
  const pathname = usePathname();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const isTechPortal = pathname.startsWith('/tech');

  useEffect(() => {
    if (isTechPortal) {
      const techAlerts: Alert[] = [];
      const userId = localStorage.getItem('currentUserId');
      if (!userId) return;

      // Alert 1: Upcoming assignment in 24 hours
      const tomorrow = addDays(new Date(), 1);
      const now = new Date();
      const upcomingJobs = workOrders.filter(wo =>
        wo.assignedTechnicianId === userId &&
        new Date(wo.scheduleDate) >= now && new Date(wo.scheduleDate) < tomorrow &&
        wo.status !== 'completed'
      ).length;

      if (upcomingJobs > 0) {
        techAlerts.push({
          type: 'info',
          text: `${upcomingJobs} Assignment${upcomingJobs > 1 ? 's' : ''} in next 24h`,
          icon: CalendarCheck,
        });
      }

      // Alert 2: Pending weekly log
      const pendingLogs = weeklyLogs.filter(log =>
        log.technicianId === userId && log.status === 'Draft'
      ).length;

      if (pendingLogs > 0) {
        techAlerts.push({
          type: 'warning',
          text: `${pendingLogs} Weekly Log Pending Submission`,
          icon: FileWarning,
        });
      }

      // Alert 3: Recent penalty events
      const recentPenalties = penaltyEvents.filter(p => p.technicianId === userId).length;
       if (recentPenalties > 0) {
        techAlerts.push({
          type: 'critical',
          text: `${recentPenalties} Recent Penalty Event${recentPenalties > 1 ? 's' : ''}`,
          icon: AlertTriangle,
        });
      }

      setAlerts(techAlerts);

    } else { // Admin portal
      const unassignedJobs = workOrders.filter(wo => wo.status === 'unassigned').length;
      const lateCheckIns = 1; // Mock
      const revisitsRequired = 3; // Mock
      const logsToAudit = weeklyLogs.filter(log => log.status === 'Submitted').length;

      const adminDynamicAlerts: Alert[] = [];
      if (unassignedJobs > 0) {
        adminDynamicAlerts.push({
          type: 'critical',
          text: `${unassignedJobs} Unassigned Assignment${unassignedJobs > 1 ? 's' : ''}`,
          icon: AlertTriangle
        });
      }
       if (lateCheckIns > 0) {
        adminDynamicAlerts.push({
          type: 'warning',
          text: `${lateCheckIns} Late / Missed Check-In`,
          icon: Clock
        });
      }
       if (revisitsRequired > 0) {
        adminDynamicAlerts.push({
          type: 'info',
          text: `${revisitsRequired} Revisit${revisitsRequired > 1 ? 's' : ''} Required`,
          icon: CopyX
        });
      }
       if (logsToAudit > 0) {
        adminDynamicAlerts.push({
          type: 'info',
          text: `${logsToAudit} Log${logsToAudit > 1 ? 's' : ''} Pending Audit`,
          icon: FileCheck2
        });
      }

      setAlerts(adminDynamicAlerts);
    }
  }, [pathname, isTechPortal]);

  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-default bg-[#0f0f0f] px-10 py-2">
      {alerts.map((alert, index) => (
        <div
          key={index}
          className={cn(
            'flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-opacity hover:opacity-80',
            {
              'border border-border-red bg-brand-red-dim text-text-red': alert.type === 'critical',
              'border border-gold-border bg-accent-gold-dim text-accent-gold': alert.type === 'warning',
              'border border-border-default bg-bg-tertiary text-text-secondary': alert.type === 'info',
            }
          )}
        >
          <alert.icon className="h-3.5 w-3.5" />
          <span>{alert.text}</span>
        </div>
      ))}
    </div>
  );
}
