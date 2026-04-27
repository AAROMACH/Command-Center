'use client';
import type { Technician, TimeOffRequest } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Mail, Phone, ExternalLink, Plus, Map, UserCheck, ToggleLeft, GanttChartSquare, Building } from 'lucide-react';
import { useState } from 'react';
import Image from 'next/image';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AddPersonnelDialog } from './add-personnel-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type DirectoryClientProps = {
    technicians: Technician[];
    timeOffRequests: TimeOffRequest[];
};

export function DirectoryClient({ technicians: allPersonnel, timeOffRequests }: DirectoryClientProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [isAddPersonnelOpen, setIsAddPersonnelOpen] = useState(false);

    const technicians = allPersonnel.filter(p => p.role.toLowerCase().includes('tech'));
    const staff = allPersonnel.filter(p => !p.role.toLowerCase().includes('tech') && !p.role.toLowerCase().includes('client'));
    const clients = allPersonnel.filter(p => p.role.toLowerCase().includes('client'));

    const filteredTechnicians = technicians.filter((tech) =>
        tech.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tech.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
     const filteredStaff = staff.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
     const filteredClients = clients.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()));


    return (
        <>
            <div className="flex justify-between items-center">
                <Tabs defaultValue="technicians" className="w-full">
                    <TabsList className="tabs !p-0 !bg-bg-tertiary">
                        <TabsTrigger value="technicians" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">TECHNICIANS</TabsTrigger>
                        <TabsTrigger value="staff" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">STAFF</TabsTrigger>
                        <TabsTrigger value="clients" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">CLIENTS</TabsTrigger>
                        <TabsTrigger value="timeoff" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">TIME OFF</TabsTrigger>
                        <TabsTrigger value="map" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">MAP</TabsTrigger>
                    </TabsList>
                </Tabs>
                <div className="flex items-center gap-2">
                     <div className="search-wrap">
                        <Search />
                        <input 
                            className="search-input" 
                            placeholder="Search directory..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                     <Button variant="default" size="default" onClick={() => setIsAddPersonnelOpen(true)}>
                        <Plus size={14} className="mr-2"/>
                        ADD PERSONNEL
                    </Button>
                </div>
            </div>
            
            <div className="mt-6 bg-bg-secondary border border-border-subtle rounded-lg overflow-hidden">
                <Tabs defaultValue="technicians" className="w-full">
                    <TabsContent value="technicians">
                        <div className="grid grid-cols-[2fr,2fr,1fr,1fr] items-center p-4 bg-bg-tertiary text-text-muted text-xs font-bold uppercase tracking-wider">
                            <div>TECHNICIAN</div>
                            <div>CONTACT INFORMATION</div>
                            <div>STATUS</div>
                            <div className="text-right">ACTIONS</div>
                        </div>
                        {filteredTechnicians.map(tech => (
                            <div key={tech.id} className="grid grid-cols-[2fr,2fr,1fr,1fr] items-center p-4 border-t border-border-subtle">
                                <div className="flex items-center gap-4">
                                    <Avatar className="h-10 w-10">
                                        <AvatarImage src={tech.avatarUrl} />
                                        <AvatarFallback>{tech.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                    </Avatar>
                                    <span className="font-bold text-text-primary">{tech.name}</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 text-sm text-text-primary"><Mail size={14} className="text-text-muted"/>{tech.email}</div>
                                    <div className="flex items-center gap-2 text-xs text-text-muted mt-1"><Phone size={14} className="text-text-muted"/>{tech.phone}</div>
                                </div>
                                <div>
                                    <Badge variant="active">ACTIVE</Badge>
                                </div>
                                <div className="flex justify-end gap-2">
                                    <Button variant="outline" size="sm" className="!uppercase !text-xs">COMMS</Button>
                                    <Button variant="ghost" size="icon" className="text-text-muted hover:text-text-primary">
                                        <ExternalLink size={16} />
                                    </Button>
                                </div>
                            </div>
                        ))}
                         {filteredTechnicians.length === 0 && (
                            <div className="text-center p-12 text-text-muted">No personnel found matching your search.</div>
                        )}
                    </TabsContent>
                    <TabsContent value="staff">
                         <div className="grid grid-cols-[2fr,2fr,1fr,1fr] items-center p-4 bg-bg-tertiary text-text-muted text-xs font-bold uppercase tracking-wider">
                            <div>STAFF MEMBER</div>
                            <div>CONTACT INFORMATION</div>
                            <div>ROLE</div>
                            <div className="text-right">ACTIONS</div>
                        </div>
                        {filteredStaff.map(s => (
                            <div key={s.id} className="grid grid-cols-[2fr,2fr,1fr,1fr] items-center p-4 border-t border-border-subtle">
                                <div className="flex items-center gap-4">
                                    <Avatar className="h-10 w-10">
                                        <AvatarImage src={s.avatarUrl} />
                                        <AvatarFallback>{s.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                    </Avatar>
                                    <span className="font-bold text-text-primary">{s.name}</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 text-sm text-text-primary"><Mail size={14} className="text-text-muted"/>{s.email}</div>
                                    <div className="flex items-center gap-2 text-xs text-text-muted mt-1"><Phone size={14} className="text-text-muted"/>{s.phone}</div>
                                </div>
                                <div><Badge variant="secondary">{s.role}</Badge></div>
                                 <div className="flex justify-end gap-2">
                                    <Button variant="ghost" size="icon" className="text-text-muted hover:text-text-primary">
                                        <ExternalLink size={16} />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </TabsContent>
                     <TabsContent value="clients">
                        <div className="grid grid-cols-[2fr,2fr,1fr,1fr] items-center p-4 bg-bg-tertiary text-text-muted text-xs font-bold uppercase tracking-wider">
                            <div>CLIENT CONTACT</div>
                            <div>CONTACT INFORMATION</div>
                            <div>COMPANY</div>
                            <div className="text-right">ACTIONS</div>
                        </div>
                         {filteredClients.map(c => (
                            <div key={c.id} className="grid grid-cols-[2fr,2fr,1fr,1fr] items-center p-4 border-t border-border-subtle">
                                <div className="flex items-center gap-4">
                                    <Avatar className="h-10 w-10">
                                        <AvatarImage src={c.avatarUrl} />
                                        <AvatarFallback>{c.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                    </Avatar>
                                    <span className="font-bold text-text-primary">{c.name}</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 text-sm text-text-primary"><Mail size={14} className="text-text-muted"/>{c.email}</div>
                                </div>
                                <div className="font-semibold text-text-secondary">{c.clientCompany}</div>
                                 <div className="flex justify-end gap-2">
                                    <Button variant="ghost" size="icon" className="text-text-muted hover:text-text-primary">
                                        <ExternalLink size={16} />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </TabsContent>
                     <TabsContent value="timeoff">
                         <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>PERSONNEL</TableHead>
                                    <TableHead>DATES REQUESTED</TableHead>
                                    <TableHead>TYPE</TableHead>
                                    <TableHead>STATUS</TableHead>
                                    <TableHead className="text-right">ACTIONS</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {timeOffRequests.map(req => {
                                    const person = allPersonnel.find(p => p.id === req.technicianId);
                                    return (
                                    <TableRow key={req.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-8 w-8"><AvatarImage src={person?.avatarUrl}/></Avatar>
                                                <span className="font-bold">{person?.name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>{req.startDate} to {req.endDate}</TableCell>
                                        <TableCell><Badge variant="secondary">{req.type}</Badge></TableCell>
                                        <TableCell><Badge variant={req.status === 'approved' ? 'completed' : req.status === 'pending' ? 'onhold' : 'destructive'}>{req.status}</Badge></TableCell>
                                        <TableCell className="text-right">
                                            {req.status === 'pending' && (
                                                <div className="flex gap-2 justify-end">
                                                    <Button size="sm" variant="outline">Deny</Button>
                                                    <Button size="sm">Approve</Button>
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                )})}
                            </TableBody>
                         </Table>
                    </TabsContent>
                     <TabsContent value="map">
                         <div className="p-4 flex flex-col gap-4">
                            <div className="flex justify-end items-center gap-4 border-b border-border-default pb-3">
                                <div className="flex items-center gap-2">
                                    <UserCheck size={16} className="text-accent-gold" />
                                    <Label>Tech Home Area</Label>
                                </div>
                                <Switch id="map-toggle" />
                                 <div className="flex items-center gap-2">
                                    <Building size={16} className="text-text-green" />
                                    <Label>Client Sites</Label>
                                </div>
                            </div>
                            <div className="relative aspect-video w-full bg-bg-primary rounded-md overflow-hidden border border-border-subtle">
                                <Image src="https://picsum.photos/seed/michigan/1200/800" alt="Map of Michigan" layout="fill" objectFit="cover" data-ai-hint="map michigan" />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                    <p className="text-text-muted">[Interactive Map Placeholder]</p>
                                </div>
                            </div>
                            <p className="text-xs text-text-muted text-center">In a full implementation, this would be an interactive map using a library like Mapbox or Google Maps. You could toggle layers and click on technicians to see their operational radius.</p>
                         </div>
                    </TabsContent>
                </Tabs>
            </div>
            <AddPersonnelDialog isOpen={isAddPersonnelOpen} setIsOpen={setIsAddPersonnelOpen} />
        </>
    );
}
