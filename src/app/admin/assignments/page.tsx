
'use client';

import { useState, useMemo } from 'react';
import { workOrders as initialWorkOrders, technicians } from "@/lib/data";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Calendar as CalendarIcon, 
  History, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  ChevronRight, 
  Search,
  User,
  Briefcase,
  LayoutGrid
} from "lucide-react";
import type { WorkOrder, Technician } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { GlobalScheduleCalendar } from "./components/global-schedule-calendar";

export default function AssignmentsHubPage() {
  const [workOrders] = useState<WorkOrder[]>(initialWorkOrders);
  const [searchQuery, setSearchQuery] = useState("");

  const activeWorkOrders = useMemo(() => 
    workOrders.filter(wo => wo.status !== 'completed' && wo.assignedTechnicianId),
  [workOrders]);

  const archivedWorkOrders = useMemo(() => 
    workOrders.filter(wo => wo.status === 'completed'),
  [workOrders]);

  const filteredArchive = archivedWorkOrders.filter(wo => 
    wo.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    wo.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    wo.clientName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <p className="page-eyebrow flex items-center gap-2">
            <CalendarIcon size={12} />
            Mission Schedule Terminal
          </p>
          <h1 className="page-title">Assignments</h1>
          <p className="page-subtitle">Operational schedule oversight and historical mission audit.</p>
        </div>
      </header>

      <Tabs defaultValue="schedule" className="w-full">
        <TabsList className="tabs">
          <TabsTrigger value="schedule" className="tab">
            Live Schedule <span className="tab-count">({activeWorkOrders.length})</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="tab">
            Global Calendar
          </TabsTrigger>
          <TabsTrigger value="archive" className="tab">
            Job Archive <span className="tab-count">({archivedWorkOrders.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="mt-6">
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
            </div>
        </TabsContent>

        <TabsContent value="calendar" className="mt-6">
            <GlobalScheduleCalendar 
                workOrders={workOrders.filter(wo => wo.status !== 'completed')} 
                technicians={technicians} 
            />
        </TabsContent>

        <TabsContent value="archive" className="mt-6">
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="search-wrap">
                        <Search />
                        <Input 
                            placeholder="Filter archive..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-[350px] bg-bg-secondary border-border-main"
                        />
                    </div>
                </div>

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
                            {filteredArchive.map(wo => {
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
                            {filteredArchive.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="h-32 text-center text-text-muted uppercase text-[10px] tracking-[0.2em] italic">No historical records found matching criteria.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
