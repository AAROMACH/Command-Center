"use client";

import React, { useState } from 'react';
import type { WorkOrder, Technician, Route } from "@/lib/types";
import { MapPin, Building2, Calendar, Clock, UserPlus, ChevronRight } from "lucide-react";
import { PAY_TYPE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { JobDetailDialog } from '@/components/job-detail-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type WorkOrdersClientProps = {
  workOrders: WorkOrder[];
  allWorkOrders: WorkOrder[];
  technicians: Technician[];
  onWorkOrdersChange: (orders: WorkOrder[]) => void;
  routes: Route[];
  mode: 'unassigned' | 'assigned';
};

const PAY_PILL: Record<string, string> = {
  fixed:   "bg-[#E6F1FB] text-[#0C447C]",
  hourly:  "bg-[#EAF3DE] text-[#27500A]",
  blended: "bg-[#EEEDFE] text-[#3C3489]",
};

function PayDisplay({ wo }: { wo: WorkOrder }) {
  const pill = (
    <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", PAY_PILL[wo.payType])}>
      {PAY_TYPE_LABELS[wo.payType as keyof typeof PAY_TYPE_LABELS] || wo.payType}
    </span>
  );

  if (wo.payType === "fixed") {
    return (
      <div className="flex items-center gap-2">
        {pill}
        <span className="text-[13px] font-medium text-text-primary">
          ${wo.pay?.toLocaleString()}
        </span>
      </div>
    );
  }

  if (wo.payType === "hourly") {
    return (
      <div className="flex items-center gap-2">
        {pill}
        <span className="text-[13px] font-medium text-text-primary">
          ${wo.pay}/hr
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {pill}
      <span className="text-[13px] font-medium text-text-primary">
        ${wo.blendedFixedPay}
      </span>
      <span className="text-xs text-text-muted">
        · {wo.blendedIncludedHours} hrs fixed
        {wo.blendedHourlyRate ? `, then $${wo.blendedHourlyRate}/hr` : ""}
      </span>
    </div>
  );
}

export function WorkOrdersClient({ 
  workOrders, 
  technicians, 
  mode 
}: WorkOrdersClientProps) {
  const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const handleCardClick = (wo: WorkOrder) => {
    setSelectedJob(wo);
    setIsDetailOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workOrders.map((wo) => {
          const tech = technicians.find(t => t.id === wo.assignedTechnicianId);
          
          return (
            <div 
              key={wo.id} 
              className="bg-bg-elevated border border-border-sub rounded-lg p-4 hover:border-border-main transition-colors cursor-pointer group relative text-left"
              onClick={() => handleCardClick(wo)}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className="text-[11px] text-text-muted tracking-wide mb-0.5">
                    #{wo.id.toUpperCase()}
                  </p>
                  <p className="text-[13px] font-medium text-text-primary leading-snug truncate">
                    {wo.title || wo.description}
                  </p>
                </div>
                <span className="shrink-0 flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-bg-secondary text-text-muted border border-border-sub h-fit">
                  <Clock className="w-3 h-3" />
                  Start time set
                </span>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <Calendar className="w-3.5 h-3.5 text-text-muted" />
                  {wo.scheduleDate} · {wo.scheduleTime}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <MapPin className="w-3.5 h-3.5 text-brand-red shrink-0" />
                  <span className="truncate">{wo.location}</span>
                </span>
                <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <Building2 className="w-3.5 h-3.5 text-text-muted shrink-0" />
                  <span className="truncate">{wo.clientName}</span>
                </span>
              </div>

              <div className="pt-3 border-t border-border-sub flex items-center justify-between">
                <PayDisplay wo={wo} />
                
                {tech ? (
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6 border border-border-sub">
                      <AvatarImage src={tech.avatarUrl} />
                      <AvatarFallback className="text-[8px]">{tech.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="text-[10px] font-bold text-text-primary uppercase truncate max-w-[80px]">
                      {tech.name}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-muted uppercase tracking-widest group-hover:text-brand-red transition-colors">
                     Awaiting Operative <ChevronRight size={10} />
                  </div>
                )}
              </div>
              
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Badge variant={wo.priority === 'critical' ? 'high' : wo.priority === 'high' ? 'high' : 'outline'} className="text-[7px] h-3 px-1 uppercase tracking-tighter">
                    {wo.priority}
                </Badge>
              </div>
            </div>
          )
        })}
      </div>

      {workOrders.length === 0 && (
        <div className="p-24 text-center border-2 border-dashed border-border-main rounded-xl bg-bg-secondary/30">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted italic">No missions found in this terminal category.</p>
        </div>
      )}

      <JobDetailDialog 
        isOpen={isDetailOpen} 
        setIsOpen={setIsDetailOpen} 
        mission={selectedJob} 
      />
    </div>
  );
}