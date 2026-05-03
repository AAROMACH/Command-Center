'use client';

import { useState, useEffect, useMemo } from 'react';
import type { WorkOrder } from '@/lib/types';
import { workOrders } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Calendar, 
  MapPin, 
  Clock, 
  CircleCheck, 
  Wrench, 
  ClipboardCheck,
  FileCheck
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function TechAssignmentsPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>(workOrders);
    const [mounted, setMounted] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);
    }, []);

    const techWorkOrders = useMemo(() => {
        if (!currentTechId) return [];
        return allWorkOrders.filter(wo => wo.assignedTechnicianId === currentTechId);
    }, [allWorkOrders, currentTechId]);

    const activeAssignments = useMemo(() => 
        techWorkOrders.filter(wo => wo.status === 'assigned' || wo.status === 'in-progress'),
    [techWorkOrders]);

    const completedAssignments = useMemo(() => 
        techWorkOrders.filter(wo => wo.status === 'completed'),
    [techWorkOrders]);

    const handleConfirmSchedule = (woId: string) => {
        toast({
            title: "Schedule Confirmed",
            description: "Confirmation sent to operations. Reporting window locked.",
        });
    };

    if (!mounted || !currentTechId) {
        return <div className="p-8 text-center text-xs uppercase tracking-widest text-text-muted">Loading assignments...</div>;
    }

    return (
        <div>
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <Wrench size={12} />
                        Service Assignment Console
                    </p>
                    <h1 className="page-title">Assignments</h1>
                    <p className="page-subtitle">Manage tactical assignments and historical performance audit.</p>
                </div>
            </header>

            <Tabs defaultValue="active" className="w-full">
                <TabsList className="tabs !mb-6">
                    <TabsTrigger value="active" className="tab">
                        Active Assignments <span className="tab-count">({activeAssignments.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="history" className="tab">
                        Assignment History <span className="tab-count">({completedAssignments.length})</span>
                    </TabsTrigger>
                </TabsList>
                
                <TabsContent value="active" className="mt-0">
                    <div className="table-wrap">
                        <table className="tbl">
                            <thead>
                                <tr>
                                    <th>Work Order / Status</th>
                                    <th>Assignment Description</th>
                                    <th>Site Location</th>
                                    <th>Schedule Window</th>
                                    <th className="text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeAssignments.map((wo) => (
                                    <tr key={wo.id}>
                                        <td>
                                            <div className="cell-id">{wo.id.toUpperCase()}</div>
                                            <Badge variant={wo.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="capitalize">{wo.status}</Badge>
                                        </td>
                                        <td>
                                            <div className="cell-desc-title">{wo.description}</div>
                                            <div className="text-[10px] text-text-muted uppercase tracking-widest">{wo.clientName}</div>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                                                <MapPin className="h-3.5 w-3.5 text-brand-red" />
                                                <span>{wo.location}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="cell-sched">
                                                <div className="cell-sched-date">
                                                    <Calendar size={13}/>
                                                    <span>{wo.scheduleDate}</span>
                                                </div>
                                                <div className="cell-sched-time">
                                                    <Clock size={13}/>
                                                    <span>{wo.scheduleTime}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-right">
                                            {wo.status === 'assigned' && (
                                                <Button variant="outline" size="sm" className="h-8 !text-[10px] border-accent-gold text-accent-gold hover:bg-accent-gold/10" onClick={() => handleConfirmSchedule(wo.id)}>
                                                    <ClipboardCheck size={14} className="mr-2"/>
                                                    Confirm Schedule
                                                </Button>
                                            )}
                                            {wo.status === 'in-progress' && (
                                                <div className="text-[10px] font-bold text-text-green uppercase tracking-widest flex items-center justify-end gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-text-green animate-pulse"/>
                                                    Assignment Active
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {activeAssignments.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="text-center h-24 text-text-muted uppercase text-[10px] tracking-widest italic">No active assignments on record.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>

                <TabsContent value="history" className="mt-0">
                    <div className="table-wrap">
                        <table className="tbl">
                            <thead>
                                <tr>
                                    <th>Work Order</th>
                                    <th>Service Result</th>
                                    <th>Date Completed</th>
                                    <th>Payroll Status</th>
                                    <th className="text-right">Approved Payout</th>
                                </tr>
                            </thead>
                            <tbody>
                                {completedAssignments.map((wo) => (
                                    <tr key={wo.id}>
                                        <td>
                                            <div className="cell-id">{wo.id.toUpperCase()}</div>
                                            <div className="text-[10px] text-text-muted uppercase tracking-widest">{wo.clientName}</div>
                                        </td>
                                        <td>
                                            <div className="cell-desc-title">{wo.description}</div>
                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-green mt-1">
                                                <CircleCheck size={12}/> COMPLETED
                                            </div>
                                        </td>
                                        <td>
                                            <div className="text-xs text-text-secondary">{wo.scheduleDate}</div>
                                        </td>
                                        <td>
                                            <Badge variant="completed" className="uppercase text-[9px]">
                                                <FileCheck size={11} className="mr-1"/>
                                                Audit Passed
                                            </Badge>
                                        </td>
                                        <td className="text-right">
                                            <div className="text-sm font-bold text-text-green font-mono">
                                                ${wo.pay.toFixed(2)}
                                            </div>
                                            <div className="text-[9px] text-text-muted uppercase tracking-widest">Final Approved</div>
                                        </td>
                                    </tr>
                                ))}
                                {completedAssignments.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="text-center h-24 text-text-muted uppercase text-[10px] tracking-widest italic">History terminal clear. No completed assignments found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
