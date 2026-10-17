"use client";

import { EmptyState } from '@/components/empty-state';
import React, { useCallback, useState } from 'react';
import { usePaged, ListPager, PAGE_SIZES_LARGE } from '@/components/list-pager';
import type { WorkOrder, Technician } from "@/lib/types";
import { MapPin, Building2, Calendar, ExternalLink } from "lucide-react";
import { PAY_TYPE_LABELS } from "@/lib/constants";
import { cn, formatCityState } from "@/lib/utils";
import { externalWorkOrderId, fieldNationUrl } from "@/lib/work-order-identity";
import { JobDetailDialog } from '@/components/job-detail-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WorkOrdersTable } from "../../components/work-orders-table";

type WorkOrdersClientProps = {
  workOrders: WorkOrder[];
  allWorkOrders: WorkOrder[];
  technicians: Technician[];
  onWorkOrdersChange: (orders: WorkOrder[]) => void;
  mode: 'unassigned' | 'assigned';
  dateAsc?: boolean;
  isDateSortActive?: boolean;
  onToggleDateSort?: () => void;
  /** Changes whenever the parent's search/filters change — sends the mobile pager back to page 1. */
  filterKey?: string;
};

const PAY_PILL: Record<string, string> = {
  fixed:   "bg-brand-blue/10 text-brand-blue",
  hourly:  "bg-brand-emerald/10 text-brand-emerald",
  blended: "bg-brand-purple/10 text-brand-purple",
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
      <span className="text-xs text-text-muted text-left">
        · {wo.blendedIncludedHours} hrs fixed
        {wo.blendedHourlyRate ? `, then $${wo.blendedHourlyRate}/hr` : ""}
      </span>
    </div>
  );
}

export function WorkOrdersClient(props: WorkOrdersClientProps) {
  const { workOrders, technicians } = props;
  const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [mobileAssignOrder, setMobileAssignOrder] = useState<WorkOrder | null>(null);
  const clearMobileAssignOrder = useCallback(() => setMobileAssignOrder(null), []);
  const [mobileEditOrder, setMobileEditOrder] = useState<WorkOrder | null>(null);
  const clearMobileEditOrder = useCallback(() => setMobileEditOrder(null), []);
  // The desktop table pages itself; the phone card list pages here.
  const mobilePager = usePaged(workOrders, PAGE_SIZES_LARGE, 'dispatch-mobile-cards', [props.filterKey, props.dateAsc, props.isDateSortActive]);

  const handleCardClick = (wo: WorkOrder) => {
    setSelectedJob(wo);
    setIsDetailOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Desktop view: table */}
      <div className="hidden md:block">
        <WorkOrdersTable {...props}
          mobileAssignOrder={mobileAssignOrder} onMobileAssignOrderHandled={clearMobileAssignOrder}
          mobileEditOrder={mobileEditOrder} onMobileEditOrderHandled={clearMobileEditOrder} />
      </div>

      {/* Mobile view: cards */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {mobilePager.items.map((wo) => {
          const tech = technicians.find(t => t.id === wo.assignedTechnicianId);
          
          return (
            <div 
              key={wo.id} 
              className="bg-bg-elevated border border-border-sub rounded-lg p-4 hover:border-border-main transition-colors cursor-pointer group relative text-left"
              onClick={() => handleCardClick(wo)}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-0.5">
                    <span className="text-[11px] text-text-muted tracking-wide font-mono">
                      ASMT #{wo.id.toUpperCase()}
                    </span>
                    {externalWorkOrderId(wo) && (
                      <span className="flex items-center gap-1 text-[11px] text-brand-red tracking-wide font-mono">
                        WO #{externalWorkOrderId(wo).toUpperCase()}
                        <a
                          href={fieldNationUrl(wo)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-text-muted hover:text-brand-red transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={10} />
                        </a>
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] font-bold text-text-primary tracking-wide truncate">
                    {wo.title || wo.description}
                  </p>
                </div>
                <Badge variant={wo.priority === 'critical' ? 'high' : wo.priority === 'high' ? 'high' : 'outline'} className="text-[10px] h-3 px-1 uppercase shrink-0">
                    {wo.priority}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <Calendar className="w-3.5 h-3.5" />
                  {wo.scheduleDate} · {wo.scheduleTime}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="truncate">{formatCityState(wo.location)}</span>
                </span>
                <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <Building2 className="w-3.5 h-3.5" />
                  <span className="truncate">{wo.clientName}</span>
                </span>
              </div>

              <div className="pt-3 border-t border-border-sub flex items-center justify-between">
                <PayDisplay wo={wo} />
                
                {tech ? (
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6 border border-border-sub">
                      <AvatarImage src={tech.avatarUrl} />
                      <AvatarFallback className="text-[10px]">{(tech.name || 'U').charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="text-[10px] font-bold text-text-primary truncate max-w-[80px]">
                      {tech.name}
                    </span>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={(event) => { event.stopPropagation(); setMobileAssignOrder(wo); }}
                    className="h-8 px-3 text-[10px] font-bold uppercase tracking-wider bg-brand-red text-white hover:bg-brand-red/90"
                  >
                    Assign
                  </Button>
                )}
              </div>
            </div>
          )
        })}
        {workOrders.length === 0 && (
          <EmptyState title="No jobs here" description="Jobs that match this tab and your filters show up here." />
        )}
      </div>
      <div className="md:hidden"><ListPager pager={mobilePager} noun="jobs" /></div>

      <JobDetailDialog
        isOpen={isDetailOpen}
        setIsOpen={setIsDetailOpen}
        mission={selectedJob}
        // On a phone this is the way into the edit form: close the panel and
        // let the (CSS-hidden) table open its edit dialog for this job.
        // Edit the live record: the panel's copy is from when it was opened, and
        // a swap/helper/verify made in the panel would be saved back over.
        onEdit={(job) => { setIsDetailOpen(false); setMobileEditOrder(workOrders.find(w => w.id === job.id) ?? job); }}
      />
    </div>
  );
}
