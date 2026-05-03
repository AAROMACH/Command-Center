'use client';
import type { Technician, TimeOffRequest, WorkOrder } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Mail, Phone, Plus, Map, UserCheck, Building, ChevronRight, Building2, Globe } from 'lucide-react';
import { useState, useMemo } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AddPersonnelDialog } from './add-personnel-dialog';
import { EditPersonnelDialog } from './edit-personnel-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PersonnelDetailDialog } from './personnel-detail-dialog';
import { CompanyDetailDialog } from './company-detail-dialog';
import { useToast } from '@/hooks/use-toast';

type DirectoryClientProps = {
    technicians: Technician[];
    timeOffRequests: TimeOffRequest[];
    workOrders: WorkOrder[];
};

export function DirectoryClient({ technicians: initialPersonnel, timeOffRequests: initialTimeOffRequests, workOrders }: DirectoryClientProps) {
    const [personnel, setPersonnel] = useState(initialPersonnel);
    const [searchQuery, setSearchQuery] = useState("");
    const [isAddPersonnelOpen, setIsAddPersonnelOpen] = useState(false);
    const [isEditPersonnelOpen, setIsEditPersonnelOpen] = useState(false);
    const [selectedPerson, setSelectedPerson] = useState<Technician | null>(null);
    const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isCompanyDetailOpen, setIsCompanyDetailOpen] = useState(false);
    const [timeOffRequests, setTimeOffRequests] = useState(initialTimeOffRequests);
    const { toast } = useToast();

    const handleRowClick = (person: Technician) => {
        setSelectedPerson(person);
        setIsDetailOpen(true);
    };

    const handleCompanyClick = (companyName: string) => {
        setSelectedCompany(companyName);
        setIsCompanyDetailOpen(true);
    };

    const handleEditClick = (person: Technician) => {
        setSelectedPerson(person);
        setIsDetailOpen(false);
        setIsEditPersonnelOpen(true);
    };

    const handleSavePersonnel = (updatedPerson: Technician) => {
        setPersonnel(prev => prev.map(p => p.id === updatedPerson.id ? updatedPerson : p));
        if (selectedPerson?.id === updatedPerson.id) {
            setSelectedPerson(updatedPerson);
        }
        toast({
            title: "Operative Updated",
            description: `Personnel records for ${updatedPerson.name} have been committed.`
        });
    };

    const handleAddPersonnel = (newPerson: Technician) => {
        setPersonnel(prev => [newPerson, ...prev]);
        toast({
            title: "Personnel Enrolled",
            description: `${newPerson.name} has been successfully registered.`
        });
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

    const techniciansList = personnel.filter(p => {
        if (p.roles && p.roles.length > 0) {
            return p.roles.some(r => r.includes('tech') || r.includes('lead'));
        }
        return p.role.toLowerCase().includes('tech');
    });

    const staffList = personnel.filter(p => {
        if (p.roles && p.roles.length > 0) {
            return p.roles.some(r => r.includes('admin') || r.includes('manager'));
        }
        return p.role.toLowerCase() === 'dispatcher' || p.role.toLowerCase() === 'admin';
    });

    const clientsList = personnel.filter(p => {
        if (p.roles && p.roles.length > 0) {
            return p.roles.includes('client');
        }
        return p.role.toLowerCase().includes('client');
    });

    // Group clients by company
    const companies = useMemo(() => {
        const grouped: Record<string, { name: string; businessType?: string; contacts: Technician[] }> = {};
        clientsList.forEach(client => {
            const companyName = client.clientCompany || 'Independent';
            if (!grouped[companyName]) {
                grouped[companyName] = { 
                    name: companyName, 
                    businessType: client.businessType, 
                    contacts: [] 
                };
            }
            grouped[companyName].contacts.push(client);
        });
        return Object.values(grouped);
    }, [clientsList]);

    const lowercasedQuery = searchQuery.toLowerCase();

    const filteredTechnicians = techniciansList.filter((tech) =>
        tech.name.toLowerCase().includes(lowercasedQuery) ||
        tech.email.toLowerCase().includes(lowercasedQuery)
    );

    const filteredStaff = staffList.filter((s) =>
        s.name.toLowerCase().includes(lowercasedQuery) ||
        s.email.toLowerCase().includes(lowercasedQuery)
    );

    const filteredCompanies = companies.filter((c) =>
        c.name.toLowerCase().includes(lowercasedQuery) ||
        c.contacts.some(contact => 
            contact.name.toLowerCase().includes(lowercasedQuery) || 
            contact.email.toLowerCase().includes(lowercasedQuery)
        )
    );
    
    const filteredTimeOffRequests = timeOffRequests.filter(req => {
        const person = personnel.find(p => p.id === req.technicianId);
        if (!person) return false;
        
        return (
            person.name.toLowerCase().includes(lowercasedQuery) ||
            req.startDate.toLowerCase().includes(lowercasedQuery) ||
            req.endDate.toLowerCase().includes(lowercasedQuery) ||
            req.type.toLowerCase().includes(lowercasedQuery) ||
            req.status.toLowerCase().includes(lowercasedQuery)
        );
    });

    const personWorkOrders = selectedPerson ? workOrders.filter(wo => wo.assignedTechnicianId === selectedPerson.id) : [];
    const personTimeOffRequests = selectedPerson ? timeOffRequests.filter(req => req.technicianId === selectedPerson.id) : [];

    return (
        <>
            <Tabs defaultValue="technicians" className="w-full">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <TabsList className="tabs !p-0 !bg-bg-tertiary w-full md:w-auto">
                        <TabsTrigger value="technicians" className="tab !px-6 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">TECHNICIANS</TabsTrigger>
                        <TabsTrigger value="staff" className="tab !px-6 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">STAFF</TabsTrigger>
                        <TabsTrigger value="clients" className="tab !px-6 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">CLIENTS</TabsTrigger>
                        <TabsTrigger value="timeoff" className="tab !px-6 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">TIME OFF</TabsTrigger>
                        <TabsTrigger value="map" className="tab !px-6 !py-4 data-[state=active]:bg-brand-red data-[state=active]:text-white">MAP</TabsTrigger>
                    </TabsList>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <div className="search-wrap flex-1 md:flex-none">
                            <Search />
                            <input 
                                className="search-input w-full md:w-[250px]" 
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
                            <div className="grid grid-cols-[2fr,2fr,1fr,1fr] items-center p-4 bg-bg-tertiary text-text-muted text-xs font-bold uppercase tracking-wider">
                                <div>TECHNICIAN</div>
                                <div>CONTACT INFORMATION</div>
                                <div className="text-center">RELIABILITY SCORE</div>
                                <div>STATUS</div>
                            </div>
                            {filteredTechnicians.map(tech => {
                                const reliabilityColor = tech.reliabilityScore > 90 ? 'text-text-green' : tech.reliabilityScore > 80 ? 'text-accent-gold' : 'text-text-red';
                                return (
                                <div key={tech.id} className="grid grid-cols-[2fr,2fr,1fr,1fr] items-center p-4 border-t border-border-subtle cursor-pointer hover:bg-bg-tertiary" onClick={() => handleRowClick(tech)}>
                                    <div className="flex items-center gap-4">
                                        <Avatar className="h-10 w-10">
                                            <AvatarImage src={tech.avatarUrl} />
                                            <AvatarFallback>{tech.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                        </Avatar>
                                        <span className="font-bold text-text-primary uppercase tracking-wide">{tech.name}</span>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 text-sm text-text-primary"><Mail size={14} className="text-text-muted"/>{tech.email}</div>
                                        <div className="flex items-center gap-2 text-xs text-text-muted mt-1"><Phone size={14} className="text-text-muted"/>{tech.phone}</div>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <span className={`font-mono font-bold text-xl ${reliabilityColor}`}>{tech.reliabilityScore}%</span>
                                    </div>
                                    <div>
                                        <Badge variant="active">ACTIVE</Badge>
                                    </div>
                                </div>
                            )})}
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
                                        <span className="font-bold text-text-primary uppercase tracking-wide">{s.name}</span>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 text-sm text-text-primary"><Mail size={14} className="text-text-muted"/>{s.email}</div>
                                        <div className="flex items-center gap-2 text-xs text-text-muted mt-1"><Phone size={14} className="text-text-muted"/>{s.phone}</div>
                                    </div>
                                    <div>
                                        <div className="flex flex-wrap gap-1">
                                            {s.roles?.map(r => <Badge key={r} variant="secondary" className="text-[9px] uppercase">{r.replace(/_/g, ' ')}</Badge>)}
                                            {!s.roles?.length && <Badge variant="secondary">{s.role}</Badge>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                             {filteredStaff.length === 0 && (
                                <div className="text-center p-12 text-text-muted">No personnel found matching your search.</div>
                            )}
                        </div>
                    </TabsContent>
                    <TabsContent value="clients">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredCompanies.map(company => (
                                <Card key={company.name} className="bg-bg-secondary border-border-main hover:border-brand-red transition-all cursor-pointer group" onClick={() => handleCompanyClick(company.name)}>
                                    <CardContent className="p-5">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="p-3 bg-bg-tertiary rounded-lg border border-border-sub group-hover:bg-brand-red-dim group-hover:border-brand-red transition-colors">
                                                <Building2 size={24} className="text-text-muted group-hover:text-brand-red transition-colors" />
                                            </div>
                                            <Badge variant="active" className="text-[8px] uppercase tracking-widest">{company.contacts.length} Contacts</Badge>
                                        </div>
                                        <div className="space-y-1">
                                            <h3 className="text-base font-bold text-text-primary uppercase tracking-wide">{company.name}</h3>
                                            {company.businessType && (
                                                <p className="text-[10px] text-accent-gold uppercase font-black tracking-widest">{company.businessType}</p>
                                            )}
                                        </div>
                                        <div className="mt-6 pt-4 border-t border-border-sub flex items-center justify-between">
                                            <div className="flex -space-x-2">
                                                {company.contacts.slice(0, 3).map(contact => (
                                                    <Avatar key={contact.id} className="h-7 w-7 border-2 border-bg-secondary">
                                                        <AvatarImage src={contact.avatarUrl} />
                                                        <AvatarFallback className="text-[10px]">{contact.name.charAt(0)}</AvatarFallback>
                                                    </Avatar>
                                                ))}
                                                {company.contacts.length > 3 && (
                                                    <div className="h-7 w-7 rounded-full bg-bg-tertiary border-2 border-bg-secondary flex items-center justify-center text-[10px] font-bold text-text-muted">
                                                        +{company.contacts.length - 3}
                                                    </div>
                                                )}
                                            </div>
                                            <ChevronRight size={16} className="text-text-muted group-hover:text-text-primary group-hover:translate-x-1 transition-all" />
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                            {filteredCompanies.length === 0 && (
                                <div className="col-span-full py-24 text-center border-2 border-dashed border-border-main rounded-lg bg-bg-secondary/30">
                                    <Building size={48} className="mx-auto text-text-muted mb-4 opacity-20" />
                                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted italic">No corporate entities found matching your search.</p>
                                </div>
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
                                        const person = personnel.find(p => p.id === req.technicianId);
                                        return (
                                        <TableRow key={req.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-8 w-8"><AvatarImage src={person?.avatarUrl}/><AvatarFallback>{person?.name.charAt(0)}</AvatarFallback></Avatar>
                                                    <span className="font-bold uppercase tracking-wide text-xs">{person?.name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs font-mono">{req.startDate} to {req.endDate}</TableCell>
                                            <TableCell><Badge variant="secondary" className="capitalize text-[10px]">{req.type}</Badge></TableCell>
                                            <TableCell><Badge variant={req.status === 'approved' ? 'completed' : req.status === 'pending' ? 'onhold' : 'destructive'} className="capitalize text-[10px]">{req.status}</Badge></TableCell>
                                            <TableCell className="text-right">
                                                {req.status === 'pending' && (
                                                    <div className="flex gap-2 justify-end">
                                                        <Button size="sm" variant="outline" className="h-7 text-[9px]" onClick={() => handleTimeOffStatusChange(req.id, 'denied')}>Deny</Button>
                                                        <Button size="sm" className="h-7 text-[9px]" onClick={() => handleTimeOffStatusChange(req.id, 'approved')}>Approve</Button>
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
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Tech Home Area</Label>
                                </div>
                                <Switch id="map-toggle" />
                                    <div className="flex items-center gap-2">
                                    <Building size={16} className="text-text-green" />
                                    <Label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Client Sites</Label>
                                </div>
                            </div>
                            <div className="relative aspect-video w-full bg-bg-primary rounded-md overflow-hidden border border-border-subtle">
                                <iframe src="https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d2519879.5136364023!2d-84.46712132853324!3d42.82164695836222!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2sus!4v1777314459553!5m2!1sen!2sus" width="100%" height="100%" style={{ border: 0 }} allowFullScreen={true} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="absolute top-0 left-0 w-full h-full grayscale invert opacity-80"></iframe>
                            </div>
                        </div>
                    </TabsContent>
                </div>
            </Tabs>
            
            <AddPersonnelDialog 
                isOpen={isAddPersonnelOpen} 
                setIsOpen={setIsAddPersonnelOpen} 
                onSave={handleAddPersonnel}
            />
            
            {selectedPerson && (
                <EditPersonnelDialog 
                    isOpen={isEditPersonnelOpen} 
                    setIsOpen={setIsEditPersonnelOpen} 
                    person={selectedPerson}
                    onSave={handleSavePersonnel}
                />
            )}
            
            <PersonnelDetailDialog 
                isOpen={isDetailOpen} 
                setIsOpen={setIsDetailOpen} 
                person={selectedPerson}
                workOrders={personWorkOrders}
                timeOffRequests={personTimeOffRequests}
                onEdit={() => handleEditClick(selectedPerson!)}
            />

            {selectedCompany && (
                <CompanyDetailDialog
                    isOpen={isCompanyDetailOpen}
                    setIsOpen={setIsCompanyDetailOpen}
                    companyName={selectedCompany}
                    personnel={personnel}
                />
            )}
        </>
    );
}
