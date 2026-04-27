
'use client';

import type { Technician, WorkOrder, TimeOffRequest } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Mail, Phone, Wrench, BarChart, Shield, Building, Calendar, Briefcase, DollarSign, Folder, StickyNote, User } from 'lucide-react';
import Image from 'next/image';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type PersonnelDetailDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  person: Technician | null;
  workOrders: WorkOrder[];
  timeOffRequests: TimeOffRequest[];
};

export function PersonnelDetailDialog({ isOpen, setIsOpen, person, workOrders, timeOffRequests }: PersonnelDetailDialogProps) {
  if (!person) return null;

  const isTechnician = person.role.toLowerCase().includes('tech');
  const isStaff = person.role.toLowerCase() === 'dispatcher' || person.role.toLowerCase() === 'admin';
  const isClient = person.role.toLowerCase().includes('client');
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];


  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="lg:max-w-4xl bg-bg-elevated border-border-default">
        <DialogHeader className="text-left border-b border-border-default pb-4">
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                        <AvatarImage src={person.avatarUrl} asChild>
                            <Image src={person.avatarUrl} alt={person.name} width={64} height={64} />
                        </AvatarImage>
                        <AvatarFallback>{person.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                    </Avatar>
                    <div>
                        <DialogTitle className="page-title text-2xl">{person.name}</DialogTitle>
                        <DialogDescription className="text-base text-text-muted">{person.role}</DialogDescription>
                         <div className="flex items-center gap-2 mt-2">
                             <Badge variant="active">Active</Badge>
                             <span className="text-xs text-text-muted font-mono">{person.id}</span>
                         </div>
                    </div>
                </div>
                 <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8"><Mail size={14} className="mr-2"/> Email</Button>
                    <Button variant="outline" size="sm" className="h-8"><Phone size={14} className="mr-2"/> Call</Button>
                </div>
            </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full pt-2">
            <TabsList className="grid w-full grid-cols-6 mb-4">
                <TabsTrigger value="overview"><User size={14} className="mr-2"/>Overview</TabsTrigger>
                <TabsTrigger value="schedule"><Calendar size={14} className="mr-2"/>Schedule</TabsTrigger>
                <TabsTrigger value="assignments"><Briefcase size={14} className="mr-2"/>Assignments</TabsTrigger>
                <TabsTrigger value="financial"><DollarSign size={14} className="mr-2"/>Financial</TabsTrigger>
                <TabsTrigger value="documents"><Folder size={14} className="mr-2"/>Documents</TabsTrigger>
                <TabsTrigger value="notes"><StickyNote size={14} className="mr-2"/>Notes</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-1">
                    <div className="field-group !p-0 !bg-transparent !border-none">
                        <h3 className="field-group-title">Core Identity</h3>
                        <div className="space-y-1 text-sm">
                            <p><strong className="text-text-muted w-24 inline-block">User ID:</strong> <span className="font-mono text-text-primary">{person.id}</span></p>
                            <p><strong className="text-text-muted w-24 inline-block">Role:</strong> <span className="text-text-primary">{person.role}</span></p>
                            <p><strong className="text-text-muted w-24 inline-block">Email:</strong> <span className="text-text-primary">{person.email}</span></p>
                            <p><strong className="text-text-muted w-24 inline-block">Phone:</strong> <span className="text-text-primary">{person.phone}</span></p>
                            {isClient && person.clientCompany && (
                                <p><strong className="text-text-muted w-24 inline-block">Company:</strong> <span className="text-text-primary">{person.clientCompany}</span></p>
                            )}
                        </div>
                    </div>
                     {isTechnician && (
                        <div className="field-group !p-0 !bg-transparent !border-none">
                           <h3 className="field-group-title">Operational Summary</h3>
                           <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-md bg-bg-secondary border border-border-subtle">
                                    <h4 className="field-label flex items-center gap-1.5"><Shield size={14}/> Reliability</h4>
                                    <p className="text-3xl font-bold text-text-primary">{person.reliabilityScore}%</p>
                                    <p className="text-xs text-text-muted">On-Time Score</p>
                                </div>
                                <div className="p-4 rounded-md bg-bg-secondary border border-border-subtle">
                                    <h4 className="field-label flex items-center gap-1.5"><BarChart size={14}/> Workload</h3>
                                    <p className="text-3xl font-bold text-text-primary">{person.currentWorkload}</p>
                                    <p className="text-xs text-text-muted">Active Assignments</p>
                                </div>
                            </div>
                             <div className="mt-4">
                                <h4 className="field-label">Skills</h4>
                                <div className="flex flex-wrap gap-2">
                                    {person.skills.map(skill => (
                                        <Badge key={skill} variant="secondary">{skill}</Badge>
                                    ))}
                                </div>
                            </div>
                        </div>
                     )}
                 </div>
            </TabsContent>

            <TabsContent value="schedule">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-1">
                    <div className="field-group !p-0 !bg-transparent !border-none">
                         <h3 className="field-group-title">Weekly Availability</h3>
                         <div className="space-y-2">
                             {daysOfWeek.map(day => {
                                const availability = person.availability[day.toLowerCase() as keyof typeof person.availability];
                                return (
                                    <div key={day} className="grid grid-cols-[100px,1fr] items-center text-sm p-2 rounded bg-bg-primary border border-border-subtle">
                                        <strong className="text-text-primary">{day}</strong>
                                        {availability ? (
                                            <span className="font-mono text-text-secondary">{availability.start} - {availability.end}</span>
                                        ) : (
                                            <span className="text-text-muted italic">Unavailable</span>
                                        )}
                                    </div>
                                )
                             })}
                         </div>
                    </div>
                     <div className="field-group !p-0 !bg-transparent !border-none">
                         <h3 className="field-group-title">Time Off Requests</h3>
                        <div className="table-wrap">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Dates</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {timeOffRequests.map((req) => (
                                        <TableRow key={req.id}>
                                            <TableCell className="text-xs">{req.startDate} to {req.endDate}</TableCell>
                                            <TableCell><Badge variant="secondary" className="capitalize">{req.type}</Badge></TableCell>
                                            <TableCell><Badge variant={req.status === 'approved' ? 'completed' : req.status === 'pending' ? 'onhold' : 'destructive'} className="capitalize">{req.status}</Badge></TableCell>
                                        </TableRow>
                                    ))}
                                     {timeOffRequests.length === 0 && (
                                        <TableRow><TableCell colSpan={3} className="text-center h-24 text-text-muted">No requests found.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                 </div>
            </TabsContent>

            <TabsContent value="assignments">
                 <h3 className="field-group-title">Assignment History</h3>
                 <div className="table-wrap">
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Pay</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                             {workOrders.map((wo) => (
                                <TableRow key={wo.id}>
                                    <TableCell className="font-mono text-brand-red text-xs">{wo.id.toUpperCase()}</TableCell>
                                    <TableCell>
                                        <div className="font-semibold text-text-primary">{wo.description}</div>
                                        <div className="text-xs text-text-muted">{wo.clientName}</div>
                                    </TableCell>
                                    <TableCell className="text-xs">{wo.scheduleDate}</TableCell>
                                    <TableCell><Badge variant={wo.status === 'unassigned' ? 'pending' : wo.status === 'in-progress' ? 'inprogress' : wo.status} className="capitalize">{wo.status}</Badge></TableCell>
                                    <TableCell className="text-right font-mono text-text-green">${wo.pay.toFixed(2)}</TableCell>
                                </TableRow>
                            ))}
                            {workOrders.length === 0 && (
                                <TableRow><TableCell colSpan={5} className="text-center h-24 text-text-muted">No assignments found.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                 </div>
            </TabsContent>
            
            <TabsContent value="financial"><div className="empty-state">Financial Dossier Coming Soon.</div></TabsContent>
            <TabsContent value="documents"><div className="empty-state">Document Hub Coming Soon.</div></TabsContent>
            <TabsContent value="notes"><div className="empty-state">Internal Notes Coming Soon.</div></TabsContent>
        </Tabs>
        
        <DialogFooter className="border-t border-border-default pt-4">
          <Button variant="outline" onClick={() => setIsOpen(false)}>Close</Button>
          <Button>Edit Personnel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
