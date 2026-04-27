'use client';
import type { Technician, TimeOffRequest } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Mail, Phone, Plus, Map, UserCheck, Building } from 'lucide-react';
import { useState } from 'react';
import Image from 'next/image';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AddPersonnelDialog } from './add-personnel-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PersonnelDetailDialog } from './personnel-detail-dialog';
import { useToast } from '@/hooks/use-toast';

type DirectoryClientProps = {
    technicians: Technician[];
    timeOffRequests: TimeOffRequest[];
};

export function DirectoryClient({ technicians: allPersonnel, timeOffRequests: initialTimeOffRequests }: DirectoryClientProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [isAddPersonnelOpen, setIsAddPersonnelOpen] = useState(false);
    const [selectedPerson, setSelectedPerson] = useState<Technician | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [timeOffRequests, setTimeOffRequests] = useState(initialTimeOffRequests);
    const { toast } = useToast();

    const handleRowClick = (person: Technician) => {
        setSelectedPerson(person);
        setIsDetailOpen(true);
    };

    const handleTimeOffStatusChange = (requestId: string, newStatus: 'approved' | 'denied') => {
        setTimeOffRequests(currentRequests =>
            currentRequests.map(req =>
                req.id === requestId ? { ...req, status: newStatus } : req
            )
        );
        toast({
            title: `Request ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`,
            description: `The time off request has been successfully ${newStatus}.`,
        });
    };

    const technicians = allPersonnel.filter(p => p.role.toLowerCase().includes('tech'));
    const staff = allPersonnel.filter(p => p.role.toLowerCase() === 'dispatcher' || p.role.toLowerCase() === 'admin');
    const clients = allPersonnel.filter(p => p.role.toLowerCase().includes('client'));

    const lowercasedQuery = searchQuery.toLowerCase();

    const filteredTechnicians = technicians.filter((tech) =>
        tech.name.toLowerCase().includes(lowercasedQuery) ||
        tech.email.toLowerCase().includes(lowercasedQuery)
    );

    const filteredStaff = staff.filter((s) =>
        s.name.toLowerCase().includes(lowercasedQuery) ||
        s.email.toLowerCase().includes(lowercasedQuery)
    );

    const filteredClients = clients.filter((c) =>
        c.name.toLowerCase().includes(lowercasedQuery) ||
        c.email.toLowerCase().includes(lowercasedQuery) ||
        (c.clientCompany || '').toLowerCase().includes(lowercasedQuery)
    );
    
    const filteredTimeOffRequests = timeOffRequests.filter(req => {
        const person = allPersonnel.find(p => p.id === req.technicianId);
        if (!person) return false;
        
        return (
            person.name.toLowerCase().includes(lowercasedQuery) ||
            req.startDate.toLowerCase().includes(lowercasedQuery) ||
            req.endDate.toLowerCase().includes(lowercasedQuery) ||
            req.type.toLowerCase().includes(lowercasedQuery) ||
            req.status.toLowerCase().includes(lowercasedQuery)
        );
    });


    return (
        <>
            <Tabs defaultValue="technicians" className="w-full">
                <div className="flex justify-between items-center">
                    <TabsList className="tabs !p-0 !bg-bg-tertiary">
                        <TabsTrigger value="technicians" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">TECHNICIANS</TabsTrigger>
                        <TabsTrigger value="staff" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">STAFF</TabsTrigger>
                        <TabsTrigger value="clients" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">CLIENTS</TabsTrigger>
                        <TabsTrigger value="timeoff" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">TIME OFF</TabsTrigger>
                        <TabsTrigger value="map" className="tab !px-8 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">MAP</TabsTrigger>
                    </TabsList>
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

                <div className="w-full mt-6">
                    <TabsContent value="technicians">
                        <div className="table-wrap">
                            <div className="grid grid-cols-[2fr,2fr,1fr] items-center p-4 bg-bg-tertiary text-text-muted text-xs font-bold uppercase tracking-wider">
                                <div>TECHNICIAN</div>
                                <div>CONTACT INFORMATION</div>
                                <div>STATUS</div>
                            </div>
                            {filteredTechnicians.map(tech => (
                                <div key={tech.id} className="grid grid-cols-[2fr,2fr,1fr] items-center p-4 border-t border-border-subtle cursor-pointer hover:bg-bg-tertiary" onClick={() => handleRowClick(tech)}>
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
                                </div>
                            ))}
                            {filteredTechnicians.length === 0 && (
                                <div className="text-center p-12 text-text-muted">No personnel found matching your search.</div>
                            )}
                        </div>
                    </TabsContent>
                    <TabsContent value="staff">
                        <div className="table-wrap">
                             <div className="grid grid-cols-[2fr,2fr,1fr] items-center p-4 bg-bg-tertiary text-text-muted text-xs font-bold uppercase tracking-wider">
                                <div>STAFF MEMBER</div>
                                <div>CONTACT INFORMATION</div>
                                <div>ROLE</div>
                            </div>
                            {filteredStaff.map(s => (
                                <div key={s.id} className="grid grid-cols-[2fr,2fr,1fr] items-center p-4 border-t border-border-subtle cursor-pointer hover:bg-bg-tertiary" onClick={() => handleRowClick(s)}>
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
                                </div>
                            ))}
                             {filteredStaff.length === 0 && (
                                <div className="text-center p-12 text-text-muted">No personnel found matching your search.</div>
                            )}
                        </div>
                    </TabsContent>
                    <TabsContent value="clients">
                        <div className="table-wrap">
                            <div className="grid grid-cols-[2fr,2fr,1fr] items-center p-4 bg-bg-tertiary text-text-muted text-xs font-bold uppercase tracking-wider">
                                <div>CLIENT CONTACT</div>
                                <div>CONTACT INFORMATION</div>
                                <div>COMPANY</div>
                            </div>
                            {filteredClients.map(c => (
                                <div key={c.id} className="grid grid-cols-[2fr,2fr,1fr] items-center p-4 border-t border-border-subtle cursor-pointer hover:bg-bg-tertiary" onClick={() => handleRowClick(c)}>
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
                                </div>
                            ))}
                             {filteredClients.length === 0 && (
                                <div className="text-center p-12 text-text-muted">No personnel found matching your search.</div>
                            )}
                        </div>
                    </TabsContent>
                    <TabsContent value="timeoff">
                        <div className="table-wrap">
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
                                    {filteredTimeOffRequests.map(req => {
                                        const person = allPersonnel.find(p => p.id === req.technicianId);
                                        return (
                                        <TableRow key={req.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-8 w-8"><AvatarImage src={person?.avatarUrl}/><AvatarFallback>{person?.name.charAt(0)}</AvatarFallback></Avatar>
                                                    <span className="font-bold">{person?.name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{req.startDate} to {req.endDate}</TableCell>
                                            <TableCell><Badge variant="secondary" className="capitalize">{req.type}</Badge></TableCell>
                                            <TableCell><Badge variant={req.status === 'approved' ? 'completed' : req.status === 'pending' ? 'onhold' : 'destructive'} className="capitalize">{req.status}</Badge></TableCell>
                                            <TableCell className="text-right">
                                                {req.status === 'pending' && (
                                                    <div className="flex gap-2 justify-end">
                                                        <Button size="sm" variant="outline" onClick={() => handleTimeOffStatusChange(req.id, 'denied')}>Deny</Button>
                                                        <Button size="sm" onClick={() => handleTimeOffStatusChange(req.id, 'approved')}>Approve</Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )})}
                                    {filteredTimeOffRequests.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center h-24 text-text-muted">
                                                No time off requests match your search.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>
                    <TabsContent value="map">
                        <div className="p-4 flex flex-col gap-4 border border-border-default rounded-lg bg-bg-secondary">
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
                                <iframe src="https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d2519879.5136364023!2d-84.46712132853324!3d42.82164695836222!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2sus!4v1777314459553!5m2!1sen!2sus" width="100%" height="100%" style={{ border: 0 }} allowFullScreen={true} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="absolute top-0 left-0 w-full h-full"></iframe>
                            </div>
                        </div>
                    </TabsContent>
                </div>
            </Tabs>
            <AddPersonnelDialog isOpen={isAddPersonnelOpen} setIsOpen={setIsAddPersonnelOpen} />
            <PersonnelDetailDialog isOpen={isDetailOpen} setIsOpen={setIsDetailOpen} person={selectedPerson} />
        </>
    );
}
