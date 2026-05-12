'use client';

import { useState, useEffect } from 'react';
import { Bell, AlertTriangle, Clock, FileCheck, CalendarCheck, FileWarning, Briefcase, ClipboardList, Play, ChevronRight, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRouter, usePathname } from 'next/navigation';
import { technicians, workOrders, weeklyLogs, projects, serviceRequests } from '@/lib/data';
import { addDays } from 'date-fns';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const pathname = usePathname();
  const router = useRouter();
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    const userId = localStorage.getItem('currentUserId');
    if (!userId) return;

    const user = technicians.find(t => t.id === userId);
    if (!user) return;

    const currentAlerts: any[] = [];

    if (pathname.startsWith('/tech')) {
      const activeJob = workOrders.find(wo => wo.assignedTechnicianId === userId && wo.status === 'in-progress');
      if (activeJob) {
        currentAlerts.push({
          id: 'tech-active',
          type: 'success',
          text: `LIVE SESSION`,
          description: `On-site at ${activeJob.location.split(',')[0]}`,
          icon: Play,
          actionPath: '/tech/dashboard',
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
          text: `Upcoming Jobs`,
          description: `${upcomingJobsCount} missions in 24h`,
          icon: CalendarCheck,
          actionPath: '/tech/assignments',
        });
      }

      const pendingLogsCount = weeklyLogs.filter(log =>
        log.technicianId === userId && log.status === 'Draft'
      ).length;

      if (pendingLogsCount > 0) {
        currentAlerts.push({
          id: 'tech-logs',
          type: 'warning',
          text: `Draft Logs`,
          description: `${pendingLogsCount} weekly work logs pending`,
          icon: FileWarning,
          actionPath: '/tech/logs',
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
            text: `Active Projects`,
            description: `${activeProjectsCount} deployment sites in progress`,
            icon: Briefcase,
            actionPath: '/client/projects',
          });
        }

        if (pendingRequestsCount > 0) {
          currentAlerts.push({
            id: 'client-tickets',
            type: 'warning',
            text: `New Requests`,
            description: `${pendingRequestsCount} tickets under audit`,
            icon: ClipboardList,
            actionPath: '/client/tickets',
          });
        }
      }
    } else { 
      const unassignedJobsCount = workOrders.filter(wo => wo.status === 'unassigned').length;
      const logsToAuditCount = weeklyLogs.filter(log => log.status === 'Submitted').length;

      if (unassignedJobsCount > 0) {
        currentAlerts.push({
          id: 'admin-unassigned',
          type: 'critical',
          text: `Unassigned Work`,
          description: `${unassignedJobsCount} missions require dispatch`,
          icon: AlertTriangle,
          actionPath: '/admin/dispatch',
        });
      }

      if (logsToAuditCount > 0) {
        currentAlerts.push({
          id: 'admin-audit',
          type: 'info',
          text: `Pending Audits`,
          description: `${logsToAuditCount} logs awaiting authorization`,
          icon: FileCheck,
          actionPath: '/admin/financials',
        });
      }
    }

    setAlerts(currentAlerts);
  }, [pathname]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 text-text-muted hover:text-text-primary hover:bg-bg-tertiary">
          <Bell size={18} />
          {alerts.length > 0 && (
            <div className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand-red border border-bg-primary shadow-[0_0_8px_rgba(204,34,0,0.6)]" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 bg-bg-elevated border-border-main shadow-2xl" align="end">
        <div className="p-4 border-b border-border-sub bg-bg-tertiary flex items-center justify-between">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-primary">Registry Alerts</h3>
            <Badge variant="outline" className="text-[8px] bg-bg-primary border-border-sub font-mono">{alerts.length} Active</Badge>
        </div>
        <ScrollArea className="max-h-[350px]">
            {alerts.length > 0 ? (
                <div className="divide-y divide-border-sub">
                    {alerts.map((alert) => (
                        <div 
                            key={alert.id} 
                            className="p-4 hover:bg-bg-tertiary cursor-pointer transition-all group"
                            onClick={() => {
                                router.push(alert.actionPath);
                            }}
                        >
                            <div className="flex gap-4">
                                <div className={cn(
                                    "p-2 rounded-lg shrink-0 h-fit transition-colors",
                                    alert.type === 'critical' ? "bg-brand-red-dim text-text-red border border-brand-red/30" :
                                    alert.type === 'warning' ? "bg-accent-gold-dim text-accent-gold border border-accent-gold/30" :
                                    alert.type === 'success' ? "bg-green-dim text-text-green border border-green-border/30" :
                                    "bg-bg-secondary text-text-secondary border border-border-sub"
                                )}>
                                    <alert.icon size={14} className={alert.type === 'success' ? 'animate-pulse' : ''} />
                                </div>
                                <div className="space-y-0.5 min-w-0">
                                    <p className="text-[10px] font-bold text-text-primary uppercase tracking-wide leading-tight group-hover:text-brand-red transition-colors truncate">{alert.text}</p>
                                    <p className="text-[9px] text-text-muted uppercase font-bold tracking-tighter leading-relaxed">{alert.description}</p>
                                </div>
                                <ChevronRight size={12} className="text-text-muted mt-1 ml-auto opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="p-12 text-center space-y-2">
                    <Info size={24} className="mx-auto text-text-muted opacity-20" />
                    <p className="text-[9px] font-bold text-text-muted uppercase tracking-[0.2em]">Registry clear</p>
                </div>
            )}
        </ScrollArea>
        <div className="p-3 border-t border-border-sub bg-bg-tertiary/30">
            <Button 
                variant="ghost" 
                className="w-full h-8 text-[9px] uppercase font-bold tracking-widest text-text-muted hover:text-text-primary"
                onClick={() => router.push(pathname.startsWith('/admin') ? '/admin/reports' : '/')}
            >
                Access Comprehensive Audit
            </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
