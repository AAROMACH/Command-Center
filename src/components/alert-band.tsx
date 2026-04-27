'use client';

import { AlertTriangle, Info, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

const alerts = [
  {
    type: 'critical',
    text: '3 Technicians Offline',
    icon: AlertTriangle,
  },
  {
    type: 'warning',
    text: '5 Parts Pending Order',
    icon: Info,
  },
  {
    type: 'info',
    text: 'System Update Scheduled: 0400 UTC',
    icon: Bell,
  },
];

export function AlertBand() {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-default bg-[#0f0f0f] px-10 py-2">
      {alerts.map((alert, index) => (
        <div
          key={index}
          className={cn(
            'flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-opacity hover:opacity-80',
            {
              'border border-border-red bg-brand-red-dim text-text-red': alert.type === 'critical',
              'border border-[#4a3500] bg-accent-gold-dim text-accent-gold': alert.type === 'warning',
              'border border-[#0f2540] bg-[#0a1220] text-[#4499DD]': alert.type === 'info',
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
