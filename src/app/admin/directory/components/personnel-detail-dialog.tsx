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
import { Mail, Phone, Wrench, BarChart, Shield, Building, Calendar, Briefcase, DollarSign, Folder, StickyNote, User, Home, HeartPulse, MapPin, Pencil } from 'lucide-react';
import Image from 'next/image';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type PersonnelDetailDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  person: Technician | null;
  workOrders: WorkOrder[];
  timeOffRequests: TimeOffRequest[];
  onEdit?: () => void;
};

export function PersonnelDetailDialog({ isOpen, setIsOpen, person, workOrders, timeOffRequests, onEdit }: PersonnelDetailDialogProps) {
  if (!person) return null;

  const isTechnician = person.roles?.some(r => r.includes('tech') || r.includes('lead')) || person.role.toLowerCase().includes('tech');
  const isStaff = person.roles?.some(r => r.includes('admin') || r.includes('manager')) || person.role.toLowerCase() === 'dispatcher' || person.role.toLowerCase() === 'admin';
  const isClient = person.roles?.includes('client') || person.role.toLowerCase().includes('client');
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
                             {person.roles?.map(r => (
                                 <Badge key={r} variant="outline" className="text-[8px] uppercase">{r.replace('_', ' ')}</Badge>
                             ))}
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
                {isTechnician && <TabsTrigger value="assignments"><Briefcase size={14} className="mr-2"/>Assignments</TabsTrigger>}
                <TabsTrigger value="financial"><DollarSign size={14} className="mr-2"/>Financial</TabsTrigger>
                <TabsTrigger value="documents"><Folder size={14} className="mr-2"/>Documents</TabsTrigger>
                <TabsTrigger value="notes"><StickyNote size={14} className="mr-2"/>Notes</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-1">
                    <div className="space-y-6">
                        <div className="field-group !p-0 !bg-transparent !border-none">
                            <h3 className="field-group-title">Core Identity</h3>
                            <div className="space-y-1 text-sm">
                                <p><strong className="text-text-muted w-24 inline-block">User ID:</strong> <span className="font-mono text-text-primary">{person.id}</span></p>
                                <p><strong className="text-text-muted w-24 inline-block">Role:</strong> <span className="text-text-primary">{person.role}</span></p>
                                <p><strong className="text-text-muted w-24 inline-block">Email:</strong> <span className="text-text-primary">{person.email}</span></p>
                                <p><strong className="text-text-muted w-24 inline-block">Phone:</strong> <span className="text-text-primary">{person.phone}</span></p>
                                {person.address && <p><strong className="text-text-muted w-24 inline-block">Address:</strong> <span className="text-text-primary">{person.address}</span></p>}
                                {isClient && person.clientCompany && (
                                    <p><strong className="text-text-muted w-24 inline-block">Company:</strong> <span className="text-text-primary">{person.clientCompany}</span></p>
                                )}
                            </div>
                        </div>
                         {(isTechnician || isStaff) && person.emergencyContact && (
                             <div className="field-group !p-0 !bg-transparent !border-none">
                                <h3 className="field-group-title flex items-center gap-2"><HeartPulse size={14}/>Emergency Protocol</h3>
                                <div className="space-y-1 text-sm p-3 rounded-md bg-bg-secondary border border-border-subtle">
                                    <p><strong className="text-text-muted w-24 inline-block">Name:</strong> <span className="text-text-primary">{person.emergencyContact.name}</span></p>
                                    <p><strong className="text-text-muted w-24 inline-block">Relation:</strong> <span className="text-text-primary">{person.emergencyContact.relation}</span></p>
                                    <p><strong className="text-text-muted w-24 inline-block">Phone:</strong> <span className="text-text-primary">{person.emergencyContact.phone}</span></p>
                                </div>
                            </div>
                        )}
                        {isClient && person.managedSites && (
                             <div className="field-group !p-0 !bg-transparent !border-none">
                                <h3 className="field-group-title flex items-center gap-2"><Building size={14}/>Managed Sites</h3>
                                <div className="space-y-2">
                                    {person.managedSites.map(site => (
                                        <div key={site.id} className="p-3 rounded-md bg-bg-secondary border border-border-subtle">
                                            <p className="font-semibold text-text-primary">{site.name}</p>
                                            <p className="text-sm text-text-muted flex items-center gap-2"><MapPin size={12}/>{site.location}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                     {isTechnician && (
                        <div className="field-group !p-0 !bg-transparent !border-none">
                           <h3 className="field-group-title">Operational Summary</h3>
                           <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-md bg-bg-secondary border border-border-subtle">
                                    <h4 className="field-label flex items-center gap-1.5"><Shield size={14}/> Reliability</h4>
                                    <p className="text-3xl font-bold text-text-primary">{person.reliabilityScore}%</p>
                                    <p className="text-xs text-text-muted">Job Integrity Score</p>
                                </div>
                                <div className="p-4 rounded-md bg-bg-secondary border border-border-subtle">
                                    <h4 className="field-label flex items-center gap-1.5"><BarChart size={14}/> Workload</h4>
                                    <p className="text-3xl font-bold text-text-primary">{person.currentWorkload}</p>
                                    <p className="text-xs text-text-muted">Active Assignments</p>
                                </div>
                            </div>
                             <div className="mt-4">
                                <h4 className="field-label">Specializations</h4>
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
                    {(isTechnician || isStaff) && person.availability && (
                        <>
                        <div className="field-group !p-0 !bg-transparent !border-none">
                            <h3 className="field-group-title">Job Availability</h3>
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
                            <h3 className="field-group-title">Absence Logs</h3>
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
                                            <TableRow><TableCell colSpan={3} className="text-center h-24 text-text-muted">No records found.</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                        </>
                    )}
                    {isClient && <div className="empty-state col-span-2">Client scheduling records coming soon.</div>}
                 </div>
            </TabsContent>

            {isTechnician && (
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
            )}
            
            <TabsContent value="financial"><div className="empty-state">Financial Records Hub coming soon.</div></TabsContent>
            <TabsContent value="documents"><div className="empty-state">Document Hub coming soon.</div></TabsContent>
            <TabsContent value="notes"><div className="empty-state">Internal Field Notes coming soon.</div></TabsContent>
        </Tabs>
        
        <DialogFooter className="border-t border-border-default pt-4">
          <Button variant="outline" onClick={() => setIsOpen(false)}>Close</Button>
          <Button onClick={onEdit}><Pencil size={14} className="mr-2"/> Edit Profile</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
