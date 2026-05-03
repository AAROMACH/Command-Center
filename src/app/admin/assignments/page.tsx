'use client';

import { useState, useMemo } from 'react';
import { workOrders as initialWorkOrders, technicians } from "@/lib/data";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Calendar as CalendarIcon, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  Search,
  User,
  Briefcase,
  Activity,
  Maximize2
} from "lucide-react";
import type { WorkOrder } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GlobalScheduleCalendar } from "./components/global-schedule-calendar";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";

export default function AssignmentsHubPage() {
  const [workOrders] = useState<WorkOrder[]>(initialWorkOrders);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredWorkOrders = useMemo(() => {
    return workOrders.filter(wo => {
      const tech = technicians.find(t => t.id === wo.assignedTechnicianId);
      const query = searchQuery.toLowerCase();
      return (
        wo.id.toLowerCase().includes(query) ||
        wo.description.toLowerCase().includes(query) ||
        wo.clientName.toLowerCase().includes(query) ||
        (tech && tech.name.toLowerCase().includes(query))
      );
    });
  }, [workOrders, searchQuery]);

  const activeWorkOrders = useMemo(() => 
    filteredWorkOrders.filter(wo => wo.status !== 'completed' && wo.assignedTechnicianId),
  [filteredWorkOrders]);

  const archivedWorkOrders = useMemo(() => 
    filteredWorkOrders.filter(wo => wo.status === 'completed'),
  [filteredWorkOrders]);

  return (
    <div className="space-y-6">
      <header className="page-header flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="page-eyebrow flex items-center gap-2">
            <CalendarIcon size={12} />
            Mission Schedule Terminal
          </p>
          <h1 className="page-title">Assignments</h1>
          <p className="page-subtitle">Operational schedule oversight and historical mission audit.</p>
        </div>
        <div className="search-wrap">
          <Search className="h-4 w-4" />
          <Input 
            placeholder="Search Tech, ID, or Description..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full md:w-[350px] bg-bg-secondary border-border-main h-10"
          />
        </div>
      </header>

      <Tabs defaultValue="schedule" className="w-full">
        <TabsList className="tabs">
          <TabsTrigger value="schedule" className="tab">
            Active Assignments <span className="tab-count">({activeWorkOrders.length})</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="tab">
            Assignment Calendar
          </TabsTrigger>
          <TabsTrigger value="archive" className="tab">
            Job Archive <span className="tab-count">({archivedWorkOrders.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="mt-6">
            <div className="space-y-6">
                <div className="flex justify-between items-center bg-bg-secondary/50 p-4 rounded-lg border border-border-sub">
                    <div className="flex items-center gap-3">
                        <Activity size={16} className="text-brand-red" />
                        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">Operative Deployments</h2>
                    </div>
                    
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="secondary" size="sm" className="h-9 px-4 gap-2 border-accent-gold/40 text-accent-gold hover:bg-accent-gold/10">
                                <CalendarIcon size={14} />
                                <span className="text-[10px] uppercase font-bold tracking-widest">Operational Calendar</span>
                                <Maximize2 size={12} className="opacity-50" />
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[1200px] bg-bg-elevated border-border-default max-h-[95vh] overflow-y-auto p-8">
                            <DialogHeader className="mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-brand-red-dim rounded border border-brand-red/20">
                                        <CalendarIcon size={20} className="text-brand-red" />
                                    </div>
                                    <div>
                                        <DialogTitle className="text-xl font-bold uppercase tracking-widest text-text-primary">Global Mission Schedule</DialogTitle>
                                        <p className="text-xs text-text-muted">Real-time situational awareness across all field coordinates.</p>
                                    </div>
                                </div>
                            </DialogHeader>
                            <GlobalScheduleCalendar 
                                workOrders={workOrders.filter(wo => wo.status !== 'completed')} 
                                technicians={technicians} 
                            />
                        </DialogContent>
                    </Dialog>
                </div>

                <div className="grid grid-cols-1 gap-8">
                    {technicians.filter(t => !t.roles?.includes('client') && !t.role.toLowerCase().includes('client')).map(tech => {
                        const techJobs = activeWorkOrders.filter(wo => wo.assignedTechnicianId === tech.id);
                        if (techJobs.length === 0) return null;

                        return (
                            <div key={tech.id} className="space-y-4">
                                <div className="flex items-center gap-3 border-b border-border-sub pb-2">
                                    <Avatar className="h-10 w-10 border border-border-sub">
                                        <AvatarImage src={tech.avatarUrl} />
                                        <AvatarFallback>{tech.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide">{tech.name}</h3>
                                        <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest">{tech.role} • {techJobs.length} Assigned</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {techJobs.map(job => (
                                        <Card key={job.id} className="bg-bg-secondary border-border-main hover:border-text-muted transition-all">
                                            <CardContent className="p-4 space-y-3">
                                                <div className="flex justify-between items-start">
                                                    <Badge variant={job.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="h-5 uppercase text-[9px] tracking-widest">
                                                        {job.status === 'in-progress' && <div className="h-1.5 w-1.5 rounded-full bg-text-green mr-1.5 animate-pulse" />}
                                                        {job.status}
                                                    </Badge>
                                                    <span className="font-mono text-[10px] text-text-muted">ID: {job.id.toUpperCase()}</span>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-text-primary uppercase leading-tight line-clamp-1">{job.description}</p>
                                                    <p className="text-[10px] text-text-muted uppercase font-bold tracking-tight mt-1">{job.clientName}</p>
                                                </div>
                                                <div className="pt-2 border-t border-border-sub space-y-1.5">
                                                    <div className="flex items-center gap-2 text-[10px] text-text-secondary uppercase font-bold tracking-tight">
                                                        <Clock size={12} className="text-text-muted" />
                                                        {job.scheduleTime} • {job.scheduleDate}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] text-text-secondary uppercase font-bold tracking-tight">
                                                        <MapPin size={12} className="text-text-muted" />
                                                        <span className="truncate">{job.location}</span>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    {activeWorkOrders.length === 0 && (
                    <div className="p-12 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30">
                            <p className="text-[10px] text-text-muted uppercase font-bold tracking-[0.2em] italic">No active missions matching search criteria</p>
                        </div>
                    )}
                </div>
            </div>
        </TabsContent>

        <TabsContent value="calendar" className="mt-6">
            <GlobalScheduleCalendar 
                workOrders={workOrders.filter(wo => wo.status !== 'completed')} 
                technicians={technicians} 
            />
        </TabsContent>

        <TabsContent value="archive" className="mt-6">
            <div className="table-wrap">
                <table className="tbl">
                    <thead>
                        <tr>
                            <th>Work Order</th>
                            <th>Client & Service Result</th>
                            <th>Deployment Coordinates</th>
                            <th>Finalized Date</th>
                            <th className="text-right">Audit Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {archivedWorkOrders.map(wo => {
                            const tech = technicians.find(t => t.id === wo.assignedTechnicianId);
                            return (
                                <tr key={wo.id}>
                                    <td>
                                        <div className="cell-id">{wo.id.toUpperCase()}</div>
                                        <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{wo.description}</p>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1">
                                            <Briefcase size={12}/> {wo.clientName}
                                        </div>
                                        <div className="flex items-center gap-1.5 text-xs text-text-green font-bold uppercase">
                                            <CheckCircle2 size={14}/> Successfully Finalized
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex items-start gap-2 text-[10px] text-text-secondary uppercase font-bold tracking-tight">
                                            <MapPin size={12} className="mt-0.5 text-text-muted" />
                                            <span>{wo.location}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-text-primary uppercase">{wo.scheduleDate}</span>
                                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-text-muted font-bold uppercase">
                                                <User size={10}/> {tech?.name || 'Field Ops'}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="text-right">
                                        <Badge variant="active" className="uppercase text-[9px] tracking-widest px-3 h-6">Audit Passed</Badge>
                                    </td>
                                </tr>
                            )
                        })}
                        {archivedWorkOrders.length === 0 && (
                            <tr>
                                <td colSpan={5} className="h-32 text-center text-text-muted uppercase text-[10px] tracking-[0.2em] italic">No historical records found matching criteria.</td>
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
