
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
  FileCheck,
  ArrowUpDown,
  Search
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SortOption = 'date' | 'priority' | 'pay';

export default function TechAssignmentsPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>(workOrders);
    const [mounted, setMounted] = useState(false);
    const [sortBy, setSortBy] = useState<SortOption>('date');
    const [searchQuery, setSearchQuery] = useState("");
    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);
    }, []);

    const techWorkOrders = useMemo(() => {
        if (!currentTechId) return [];
        return allWorkOrders
            .filter(wo => wo.assignedTechnicianId === currentTechId)
            .filter(wo => 
                wo.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                wo.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                wo.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                wo.location.toLowerCase().includes(searchQuery.toLowerCase())
            );
    }, [allWorkOrders, currentTechId, searchQuery]);

    const activeAssignments = useMemo(() => 
        techWorkOrders.filter(wo => wo.status === 'assigned' || wo.status === 'in-progress'),
    [techWorkOrders]);

    const sortedActive = useMemo(() => {
        return [...activeAssignments].sort((a, b) => {
            if (sortBy === 'priority') {
                const prio = { critical: 0, high: 1, medium: 2, low: 3 };
                return prio[a.priority] - prio[b.priority];
            }
            if (sortBy === 'pay') return b.pay - a.pay;
            return a.scheduleDate.localeCompare(b.scheduleDate);
        });
    }, [activeAssignments, sortBy]);

    const completedAssignments = useMemo(() => 
        techWorkOrders.filter(wo => wo.status === 'completed')
            .sort((a, b) => b.scheduleDate.localeCompare(a.scheduleDate)),
    [techWorkOrders]);

    const handleConfirmSchedule = (woId: string) => {
        toast({
            title: "Schedule Confirmed",
            description: "Confirmation sent to operations. Reporting window locked.",
        });
    };

    const formatDateStr = (dateStr: string) => {
        if (!dateStr) return 'TBD';
        try {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                const [year, month, day] = parts;
                return `${month}-${day}-${year}`;
            }
            return dateStr;
        } catch (e) {
            return dateStr;
        }
    };

    if (!mounted || !currentTechId) {
        return <div className="p-8 text-center text-xs uppercase tracking-widest text-text-muted">Loading assignments...</div>;
    }

    return (
        <div className="space-y-6">
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <Wrench size={12} />
                        Service Assignment Console
                    </p>
                    <h1 className="page-title">Assignments</h1>
                    <p className="page-subtitle">Manage tactical assignments and historical performance audit.</p>
                </div>
                <div className="page-header-right items-center">
                    <div className="search-wrap">
                        <Search />
                        <input 
                            className="search-input !w-full md:!w-[250px]" 
                            placeholder="Search assignments..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </header>

            <Tabs defaultValue="active" className="w-full">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 bg-bg-secondary/50 p-4 rounded-xl border border-border-sub">
                    <TabsList className="tabs !mb-0">
                        <TabsTrigger value="active" className="tab">
                            Active Assignments <span className="tab-count">({activeAssignments.length})</span>
                        </TabsTrigger>
                        <TabsTrigger value="history" className="tab">
                            Assignment History <span className="tab-count">({completedAssignments.length})</span>
                        </TabsTrigger>
                    </TabsList>

                    <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                        <SelectTrigger className="w-[160px] h-9 bg-bg-primary text-[10px] uppercase font-bold tracking-widest">
                            <div className="flex items-center gap-2">
                                <ArrowUpDown size={14} className="text-text-muted" />
                                <SelectValue placeholder="Sort Registry" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="date" className="text-[10px] uppercase font-bold">By Window</SelectItem>
                            <SelectItem value="priority" className="text-[10px] uppercase font-bold">By Priority</SelectItem>
                            <SelectItem value="pay" className="text-[10px] uppercase font-bold">By Pay</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                
                <TabsContent value="active" className="mt-0">
                    <div className="table-wrap">
                        <table className="tbl">
                            <thead>
                                <tr>
                                    <th className="text-center">Work Order / Status</th>
                                    <th className="text-center">Assignment Description</th>
                                    <th className="text-center">Site Location</th>
                                    <th className="text-center">Schedule Window</th>
                                    <th className="text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedActive.map((wo) => (
                                    <tr key={wo.id}>
                                        <td>
                                            <div className="flex flex-col items-center justify-center">
                                              <div className="cell-id">{wo.id.toUpperCase()}</div>
                                              <Badge variant={wo.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="capitalize text-[8px] h-4 px-1.5">{wo.status}</Badge>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex flex-col items-center justify-center text-center">
                                              <div className="cell-desc-title">{wo.description}</div>
                                              <div className="text-[10px] text-text-muted uppercase tracking-widest">{wo.clientName}</div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex items-center justify-center gap-1.5 text-xs text-text-secondary text-center">
                                                <MapPin className="h-3.5 w-3.5 text-brand-red shrink-0" />
                                                <span className="max-w-[150px]">{wo.location}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="cell-sched">
                                                <div className="cell-sched-date">
                                                    <Calendar size={13}/>
                                                    <span>{formatDateStr(wo.scheduleDate)}</span>
                                                </div>
                                                <div className="cell-sched-time">
                                                    <Clock size={13}/>
                                                    <span>{wo.scheduleTime}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex items-center justify-center">
                                              {wo.status === 'assigned' && (
                                                  <Button variant="outline" size="sm" className="h-8 !text-[10px] border-accent-gold text-accent-gold hover:bg-accent-gold/10" onClick={() => handleConfirmSchedule(wo.id)}>
                                                      <ClipboardCheck size={14} className="mr-2"/>
                                                      Confirm Schedule
                                                  </Button>
                                              )}
                                              {wo.status === 'in-progress' && (
                                                  <div className="text-[10px] font-bold text-text-green uppercase tracking-widest flex items-center justify-center gap-2">
                                                      <div className="w-2 h-2 rounded-full bg-text-green animate-pulse"/>
                                                      Assignment Active
                                                  </div>
                                              )}
                                            </div>
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
                                    <th className="text-center">Work Order</th>
                                    <th className="text-center">Service Result</th>
                                    <th className="text-center">Date Completed</th>
                                    <th className="text-center">Payroll Status</th>
                                    <th className="text-center">Approved Payout</th>
                                </tr>
                            </thead>
                            <tbody>
                                {completedAssignments.map((wo) => (
                                    <tr key={wo.id}>
                                        <td>
                                            <div className="flex flex-col items-center justify-center">
                                              <div className="cell-id">{wo.id.toUpperCase()}</div>
                                              <div className="text-[10px] text-text-muted uppercase tracking-widest">{wo.clientName}</div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex flex-col items-center justify-center text-center">
                                              <div className="cell-desc-title">{wo.description}</div>
                                              <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-text-green mt-1">
                                                  <CircleCheck size={12}/> COMPLETED
                                              </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="text-center">
                                              <div className="text-xs text-text-secondary">{formatDateStr(wo.scheduleDate)}</div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex items-center justify-center">
                                              <Badge variant="completed" className="uppercase text-[8px] h-4 px-1.5">
                                                  <FileCheck size={11} className="mr-1"/>
                                                  Audit Passed
                                              </Badge>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="text-center">
                                              <div className="text-sm font-bold text-text-green font-mono">
                                                  ${wo.pay.toFixed(2)}
                                              </div>
                                              <div className="text-[9px] text-text-muted uppercase tracking-widest">Final Approved</div>
                                            </div>
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
