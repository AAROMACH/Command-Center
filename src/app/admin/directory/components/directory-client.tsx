'use client';
import type { Technician, TimeOffRequest, WorkOrder, SiteRequest } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
    Search, 
    Mail, 
    Phone, 
    Plus, 
    Map, 
    UserCheck, 
    Building, 
    ChevronRight, 
    Building2, 
    Rows3, 
    LayoutGrid, 
    Columns2,
    Shield,
    Star,
    ArrowUpDown,
    ClipboardList,
    MapPin,
    Calendar,
    Check,
    X,
    Clock
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AddPersonnelDialog } from './add-personnel-dialog';
import { EditPersonnelDialog } from './edit-personnel-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PersonnelDetailDialog } from './personnel-detail-dialog';
import { CompanyDetailDialog } from './company-detail-dialog';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';

type DirectoryClientProps = {
    technicians: Technician[];
    timeOffRequests: TimeOffRequest[];
    workOrders: WorkOrder[];
    siteRequests: SiteRequest[];
};

type ViewMode = 'rows' | 'grid' | 'columns';
type SortOption = 'name' | 'reliability' | 'contacts' | 'role';

export function DirectoryClient({ technicians: initialPersonnel, timeOffRequests: initialTimeOffRequests, workOrders, siteRequests: initialSiteRequests }: DirectoryClientProps) {
    const [personnel, setPersonnel] = useState(initialPersonnel);
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<ViewMode>('rows');
    const [sortBy, setSortBy] = useState<SortOption>('name');
    const [activeTab, setActiveTab] = useState('technicians');
    
    const [isAddPersonnelOpen, setIsAddPersonnelOpen] = useState(false);
    const [isEditPersonnelOpen, setIsEditPersonnelOpen] = useState(false);
    const [selectedPerson, setSelectedPerson] = useState<Technician | null>(null);
    const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isCompanyDetailOpen, setIsCompanyDetailOpen] = useState(false);
    
    const [timeOffRequests, setTimeOffRequests] = useState(initialTimeOffRequests);
    const [siteRequests, setSiteRequests] = useState(initialSiteRequests);
    
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

    const handleSiteRequestStatusChange = (requestId: string, newStatus: 'approved' | 'denied') => {
        setSiteRequests(current =>
            current.map(req =>
                req.id === requestId ? { ...req, status: newStatus } : req
            )
        );
        toast({
            title: `Registry Request ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`,
            description: `The site registry request has been ${newStatus}.`,
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

    // SORTING & FILTERING
    const filteredTechnicians = useMemo(() => {
        return techniciansList
            .filter((tech) =>
                tech.name.toLowerCase().includes(lowercasedQuery) ||
                tech.email.toLowerCase().includes(lowercasedQuery)
            )
            .sort((a, b) => {
                if (sortBy === 'reliability') return b.reliabilityScore - a.reliabilityScore;
                return a.name.localeCompare(b.name);
            });
    }, [techniciansList, lowercasedQuery, sortBy]);

    const filteredStaff = useMemo(() => {
        return staffList
            .filter((s) =>
                s.name.toLowerCase().includes(lowercasedQuery) ||
                s.email.toLowerCase().includes(lowercasedQuery)
            )
            .sort((a, b) => {
                if (sortBy === 'role') return a.role.localeCompare(b.role);
                return a.name.localeCompare(b.name);
            });
    }, [staffList, lowercasedQuery, sortBy]);

    const filteredCompanies = useMemo(() => {
        return companies
            .filter((c) =>
                c.name.toLowerCase().includes(lowercasedQuery) ||
                c.contacts.some(contact => 
                    contact.name.toLowerCase().includes(lowercasedQuery) || 
                    contact.email.toLowerCase().includes(lowercasedQuery)
                )
            )
            .sort((a, b) => {
                if (sortBy === 'contacts') return b.contacts.length - a.contacts.length;
                return a.name.localeCompare(b.name);
            });
    }, [companies, lowercasedQuery, sortBy]);
    
    const filteredTimeOffRequests = useMemo(() => {
        return timeOffRequests
            .filter(req => {
                const person = personnel.find(p => p.id === req.technicianId);
                if (!person) return false;
                
                const matchesSearch = person.name.toLowerCase().includes(lowercasedQuery) ||
                    req.startDate.toLowerCase().includes(lowercasedQuery) ||
                    req.endDate.toLowerCase().includes(lowercasedQuery) ||
                    req.type.toLowerCase().includes(lowercasedQuery);
                
                return matchesSearch && req.status === 'pending';
            })
            .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    }, [timeOffRequests, personnel, lowercasedQuery]);

    const filteredSiteRequests = useMemo(() => {
        return siteRequests
            .filter(req => {
                const matchesSearch = req.clientName.toLowerCase().includes(lowercasedQuery) ||
                    req.siteName.toLowerCase().includes(lowercasedQuery) ||
                    req.location.toLowerCase().includes(lowercasedQuery);
                
                return matchesSearch && req.status === 'pending';
            })
            .sort((a, b) => new Date(b.submittedDate).getTime() - new Date(a.submittedDate).getTime());
    }, [siteRequests, lowercasedQuery]);

    const pendingRequestsCount = timeOffRequests.filter(r => r.status === 'pending').length + siteRequests.filter(r => r.status === 'pending').length;

    const personWorkOrders = selectedPerson ? workOrders.filter(wo => wo.assignedTechnicianId === selectedPerson.id) : [];
    const personTimeOffRequests = selectedPerson ? timeOffRequests.filter(req => req.technicianId === selectedPerson.id) : [];

    return (
        <>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex flex-col gap-3">
                    {/* Primary Tab & Action Row */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-3">
                        <TabsList className="tabs !mb-0 !p-0 !bg-bg-tertiary w-full md:w-auto">
                            <TabsTrigger value="technicians" className="tab !px-5 !py-2 data-[state=active]:bg-brand-red data-[state=active]:text-white">TECHNICIANS</TabsTrigger>
                            <TabsTrigger value="staff" className="tab !px-5 !py-2 data-[state=active]:bg-brand-red data-[state=active]:text-white">STAFF</TabsTrigger>
                            <TabsTrigger value="clients" className="tab !px-5 !py-2 data-[state=active]:bg-brand-red data-[state=active]:text-white">CLIENTS</TabsTrigger>
                            <TabsTrigger value="requests" className="tab !px-5 !py-2 data-[state=active]:bg-brand-red data-[state=active]:text-white flex items-center gap-2">
                                REQUESTS
                                {pendingRequestsCount > 0 && (
                                    <Badge variant="destructive" className="h-3.5 px-1.5 min-w-[16px] flex items-center justify-center text-[8px] animate-pulse">
                                        {pendingRequestsCount}
                                    </Badge>
                                )}
                            </TabsTrigger>
                        </TabsList>

                        <div className="flex items-center gap-2">
                            <Button 
                                variant={activeTab === 'map' ? 'default' : 'outline'} 
                                size="sm" 
                                onClick={() => setActiveTab('map')}
                                className={cn("h-8 px-4", activeTab === 'map' ? "bg-brand-red" : "border-border-sub bg-bg-tertiary")}
                            >
                                <Map size={12} className="mr-1.5"/>
                                MAP
                            </Button>

                            <Button variant="default" size="sm" onClick={() => setIsAddPersonnelOpen(true)} className="h-8 px-4">
                                <Plus size={12} className="mr-1.5"/>
                                ADD PERSONNEL
                            </Button>
                        </div>
                    </div>

                    {/* View/Sort & Search Row */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-3 p-3 rounded-lg bg-bg-secondary/30 border border-border-sub">
                        <div className="flex items-center gap-3">
                            {/* View Switcher */}
                            {activeTab !== 'map' && activeTab !== 'requests' && (
                                <div className="flex items-center bg-bg-tertiary rounded-md border border-border-sub p-0.5 h-8">
                                    <Button 
                                        variant="ghost" 
                                        size="icon-sm" 
                                        className={cn("h-7 w-7", viewMode === 'rows' && "bg-bg-secondary text-brand-red")}
                                        onClick={() => setViewMode('rows')}
                                        title="Row View"
                                    >
                                        <Rows3 size={12} />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="icon-sm" 
                                        className={cn("h-7 w-7", viewMode === 'grid' && "bg-bg-secondary text-brand-red")}
                                        onClick={() => setViewMode('grid')}
                                        title="Box View"
                                    >
                                        <LayoutGrid size={12} />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="icon-sm" 
                                        className={cn("h-7 w-7", viewMode === 'columns' && "bg-bg-secondary text-brand-red")}
                                        onClick={() => setViewMode('columns')}
                                        title="Column View"
                                    >
                                        <Columns2 size={12} />
                                    </Button>
                                </div>
                            )}

                            {/* Sort Controller */}
                            {activeTab !== 'map' && activeTab !== 'requests' && (
                                <div className="flex items-center gap-2">
                                    <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                                        <SelectTrigger className="w-[120px] bg-bg-tertiary border-border-sub h-8 text-[9px] uppercase font-bold tracking-widest">
                                            <div className="flex items-center gap-1.5">
                                                <ArrowUpDown size={10} className="text-text-muted" />
                                                <SelectValue placeholder="Sort" />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="name" className="text-[9px] uppercase font-bold">Name</SelectItem>
                                            {activeTab === 'technicians' && <SelectItem value="reliability" className="text-[9px] uppercase font-bold">Reliability</SelectItem>}
                                            {activeTab === 'clients' && <SelectItem value="contacts" className="text-[9px] uppercase font-bold">Density</SelectItem>}
                                            {activeTab === 'staff' && <SelectItem value="role" className="text-[9px] uppercase font-bold">Role</SelectItem>}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>

                        <div className="search-wrap flex-1 md:flex-none">
                            <Search />
                            <input 
                                className="search-input w-full md:w-[280px] h-8" 
                                placeholder="Filter registry..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <div className="w-full mt-4">
                    <TabsContent value="technicians" className="m-0">
                        {viewMode === 'rows' && (
                            <div className="table-wrap">
                                <div className="grid grid-cols-[2fr,2fr,1fr,1fr] items-center p-3 bg-bg-tertiary text-text-muted text-[10px] font-bold uppercase tracking-wider">
                                    <div>TECHNICIAN</div>
                                    <div>CONTACT</div>
                                    <div className="text-center">RELIABILITY</div>
                                    <div>STATUS</div>
                                </div>
                                {filteredTechnicians.map(tech => {
                                    const reliabilityColor = tech.reliabilityScore > 90 ? 'text-text-green' : tech.reliabilityScore > 80 ? 'text-accent-gold' : 'text-text-red';
                                    return (
                                    <div key={tech.id} className="grid grid-cols-[2fr,2fr,1fr,1fr] items-center p-2 border-t border-border-subtle cursor-pointer hover:bg-bg-tertiary transition-colors" onClick={() => handleRowClick(tech)}>
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8">
                                                <AvatarImage src={tech.avatarUrl} />
                                                <AvatarFallback className="text-[10px]">{tech.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                            </Avatar>
                                            <span className="font-bold text-text-primary uppercase tracking-wide text-xs">{tech.name}</span>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-1.5 text-xs text-text-primary"><Mail size={12} className="text-text-muted"/>{tech.email}</div>
                                            <div className="flex items-center gap-1.5 text-[10px] text-text-muted"><Phone size={12} className="text-text-muted"/>{tech.phone}</div>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className={`font-mono font-bold text-base ${reliabilityColor}`}>{tech.reliabilityScore}%</span>
                                        </div>
                                        <div>
                                            <Badge variant="active" className="text-[9px] h-5">ACTIVE</Badge>
                                        </div>
                                    </div>
                                )})}
                            </div>
                        )}

                        {viewMode === 'grid' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                {filteredTechnicians.map(tech => (
                                    <Card key={tech.id} className="bg-bg-secondary border-border-main hover:border-brand-red transition-all cursor-pointer group" onClick={() => handleRowClick(tech)}>
                                        <CardContent className="p-3">
                                            <div className="flex justify-between items-start mb-2">
                                                <Avatar className="h-10 w-10 border border-border-sub">
                                                    <AvatarImage src={tech.avatarUrl} />
                                                    <AvatarFallback>{tech.name.charAt(0)}</AvatarFallback>
                                                </Avatar>
                                                <div className="text-right">
                                                    <p className="text-[8px] font-bold text-text-muted uppercase tracking-widest">Rel.</p>
                                                    <p className={cn("text-sm font-mono font-bold", tech.reliabilityScore > 90 ? 'text-text-green' : 'text-accent-gold')}>{tech.reliabilityScore}%</p>
                                                </div>
                                            </div>
                                            <h3 className="text-xs font-bold text-text-primary uppercase tracking-wide truncate">{tech.name}</h3>
                                            <p className="text-[9px] text-accent-gold font-black uppercase tracking-widest mt-0.5">{tech.role}</p>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}

                        {viewMode === 'columns' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                                {filteredTechnicians.map(tech => (
                                    <div key={tech.id} className="p-2 rounded-lg border border-border-sub bg-bg-secondary hover:border-brand-red transition-all cursor-pointer group" onClick={() => handleRowClick(tech)}>
                                        <div className="flex items-center gap-2">
                                            <Avatar className="h-6 w-6">
                                                <AvatarImage src={tech.avatarUrl} />
                                                <AvatarFallback className="text-[8px]">{tech.name.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[10px] font-bold text-text-primary uppercase truncate">{tech.name}</p>
                                            </div>
                                            <Star size={10} className="text-accent-gold fill-current shrink-0" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </TabsContent>
                    
                    <TabsContent value="staff" className="m-0">
                        {viewMode === 'rows' && (
                            <div className="table-wrap">
                                <div className="grid grid-cols-[2fr,2fr,1fr] items-center p-3 bg-bg-tertiary text-text-muted text-[10px] font-bold uppercase tracking-wider">
                                    <div>STAFF MEMBER</div>
                                    <div>CONTACT</div>
                                    <div>ROLE</div>
                                </div>
                                {filteredStaff.map(s => (
                                    <div key={s.id} className="grid grid-cols-[2fr,2fr,1fr] items-center p-2 border-t border-border-subtle cursor-pointer hover:bg-bg-tertiary transition-colors" onClick={() => handleRowClick(s)}>
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8">
                                                <AvatarImage src={s.avatarUrl} />
                                                <AvatarFallback className="text-[10px]">{s.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                            </Avatar>
                                            <span className="font-bold text-text-primary uppercase tracking-wide text-xs">{s.name}</span>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-1.5 text-xs text-text-primary"><Mail size={12} className="text-text-muted"/>{s.email}</div>
                                            <div className="flex items-center gap-1.5 text-[10px] text-text-muted"><Phone size={12} className="text-text-muted"/>{s.phone}</div>
                                        </div>
                                        <div>
                                            <div className="flex flex-wrap gap-1">
                                                {s.roles?.map(r => <Badge key={r} variant="secondary" className="text-[8px] uppercase">{r.replace(/_/g, ' ')}</Badge>)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {/* Other views for staff could follow the same reduced padding pattern */}
                    </TabsContent>
                    
                    <TabsContent value="clients" className="m-0">
                        {viewMode === 'rows' && (
                            <div className="table-wrap">
                                <div className="grid grid-cols-[2fr,2fr,1fr,1fr] items-center p-3 bg-bg-tertiary text-text-muted text-[10px] font-bold uppercase tracking-wider">
                                    <div>CORPORATE ENTITY</div>
                                    <div>BUSINESS CLASSIFICATION</div>
                                    <div className="text-center">CONTACTS</div>
                                    <div className="text-right">REGISTRY</div>
                                </div>
                                {filteredCompanies.map(company => (
                                    <div key={company.name} className="grid grid-cols-[2fr,2fr,1fr,1fr] items-center p-2 border-t border-border-subtle cursor-pointer hover:bg-bg-tertiary group transition-colors" onClick={() => handleCompanyClick(company.name)}>
                                        <div className="flex items-center gap-3">
                                            <div className="p-1.5 bg-bg-tertiary rounded border border-border-sub group-hover:bg-brand-red-dim transition-colors">
                                                <Building2 size={14} className="text-text-muted group-hover:text-brand-red transition-colors" />
                                            </div>
                                            <span className="font-bold text-text-primary uppercase tracking-wide text-xs">{company.name}</span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] text-accent-gold font-black uppercase tracking-widest">{company.businessType || 'Enterprise'}</span>
                                        </div>
                                        <div className="text-center">
                                            <Badge variant="outline" className="text-[9px] h-5">{company.contacts.length} C</Badge>
                                        </div>
                                        <div className="text-right">
                                            <ChevronRight size={14} className="text-text-muted group-hover:text-text-primary group-hover:translate-x-1 transition-all ml-auto" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {/* Other views for clients follow the pattern */}
                    </TabsContent>
                    
                    <TabsContent value="requests" className="m-0">
                        <div className="space-y-4">
                            <Tabs defaultValue="site_registry" className="w-full">
                                <div className="flex items-center gap-4 mb-2 border-b border-border-sub pb-1.5">
                                    <TabsList className="bg-transparent h-auto p-0 gap-4">
                                        <TabsTrigger value="site_registry" className="tab-trigger data-[state=active]:text-brand-red data-[state=active]:border-brand-red border-b-2 border-transparent rounded-none px-0 pb-1 text-[10px] flex items-center gap-1.5">
                                            Site Registry
                                            {siteRequests.filter(s => s.status === 'pending').length > 0 && (
                                                <Badge variant="destructive" className="h-3 px-1 text-[7px]">
                                                    {siteRequests.filter(s => s.status === 'pending').length}
                                                </Badge>
                                            )}
                                        </TabsTrigger>
                                        <TabsTrigger value="personnel_absences" className="tab-trigger data-[state=active]:text-brand-red data-[state=active]:border-brand-red border-b-2 border-transparent rounded-none px-0 pb-1 text-[10px] flex items-center gap-1.5">
                                            Absences
                                            {timeOffRequests.filter(r => r.status === 'pending').length > 0 && (
                                                <Badge variant="secondary" className="h-3 px-1 text-[7px]">
                                                    {timeOffRequests.filter(r => r.status === 'pending').length}
                                                </Badge>
                                            )}
                                        </TabsTrigger>
                                    </TabsList>
                                </div>

                                <TabsContent value="site_registry" className="mt-0">
                                    <div className="table-wrap">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="h-9 hover:bg-transparent">
                                                    <TableHead className="text-[10px]">CLIENT & SITE</TableHead>
                                                    <TableHead className="text-[10px]">COORDINATES</TableHead>
                                                    <TableHead className="text-[10px]">MANAGER</TableHead>
                                                    <TableHead className="text-[10px]">STATUS</TableHead>
                                                    <TableHead className="text-right text-[10px]">ACTIONS</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {filteredSiteRequests.map(req => (
                                                    <TableRow key={req.id} className="h-10">
                                                        <TableCell className="py-1">
                                                            <div className="space-y-0.5">
                                                                <p className="text-[9px] font-bold text-brand-red uppercase tracking-widest">{req.clientName}</p>
                                                                <p className="text-[11px] font-bold text-text-primary uppercase">{req.siteName}</p>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="py-1">
                                                            <div className="flex items-center gap-1 text-[10px] text-text-secondary">
                                                                <MapPin size={10} className="text-text-muted" />
                                                                <span className="truncate max-w-[120px]">{req.location}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="py-1">
                                                            <p className="text-[10px] font-semibold text-text-primary">{req.managerName || 'TBD'}</p>
                                                        </TableCell>
                                                        <TableCell className="py-1">
                                                            <Badge variant={req.status === 'approved' ? 'completed' : req.status === 'pending' ? 'onhold' : 'destructive'} className="capitalize text-[9px] h-5">
                                                                {req.status}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="py-1 text-right">
                                                            {req.status === 'pending' && (
                                                                <div className="flex gap-1.5 justify-end">
                                                                    <Button size="icon-sm" variant="outline" className="h-6 w-6" onClick={() => handleSiteRequestStatusChange(req.id, 'denied')}><X size={12}/></Button>
                                                                    <Button size="icon-sm" className="h-6 w-6" onClick={() => handleSiteRequestStatusChange(req.id, 'approved')}><Check size={12}/></Button>
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </TabsContent>

                                <TabsContent value="personnel_absences" className="mt-0">
                                    <div className="table-wrap">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="h-9 hover:bg-transparent">
                                                    <TableHead className="text-[10px]">PERSONNEL</TableHead>
                                                    <TableHead className="text-[10px]">DATES</TableHead>
                                                    <TableHead className="text-[10px]">TYPE</TableHead>
                                                    <TableHead className="text-[10px]">STATUS</TableHead>
                                                    <TableHead className="text-right text-[10px]">ACTIONS</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {filteredTimeOffRequests.map(req => {
                                                    const person = personnel.find(p => p.id === req.technicianId);
                                                    return (
                                                    <TableRow key={req.id} className="h-10">
                                                        <TableCell className="py-1">
                                                            <div className="flex items-center gap-2">
                                                                <Avatar className="h-6 w-6"><AvatarImage src={person?.avatarUrl}/><AvatarFallback className="text-[8px]">{person?.name.charAt(0)}</AvatarFallback></Avatar>
                                                                <span className="font-bold uppercase tracking-wide text-[10px]">{person?.name}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="py-1 text-[10px] font-mono">{req.startDate}</TableCell>
                                                        <TableCell className="py-1"><Badge variant="secondary" className="capitalize text-[8px] h-4">{req.type}</Badge></TableCell>
                                                        <TableCell className="py-1"><Badge variant={req.status === 'approved' ? 'completed' : req.status === 'pending' ? 'onhold' : 'destructive'} className="capitalize text-[8px] h-4">{req.status}</Badge></TableCell>
                                                        <TableCell className="py-1 text-right">
                                                            {req.status === 'pending' && (
                                                                <div className="flex gap-1.5 justify-end">
                                                                    <Button size="icon-sm" variant="outline" className="h-6 w-6" onClick={() => handleTimeOffStatusChange(req.id, 'denied')}><X size={12}/></Button>
                                                                    <Button size="icon-sm" className="h-6 w-6" onClick={() => handleTimeOffStatusChange(req.id, 'approved')}><Check size={12}/></Button>
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                )})}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </div>
                    </TabsContent>
                    
                    <TabsContent value="map" className="m-0">
                        <div className="p-3 flex flex-col gap-3 border border-border-default rounded-lg bg-bg-secondary">
                            <div className="flex justify-end items-center gap-3 border-b border-border-default pb-2">
                                <div className="flex items-center gap-1.5">
                                    <UserCheck size={12} className="text-accent-gold" />
                                    <Label className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Home Area</Label>
                                </div>
                                <Switch id="map-toggle" className="scale-75" />
                                    <div className="flex items-center gap-1.5">
                                    <Building size={12} className="text-text-green" />
                                    <Label className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Client Sites</Label>
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
                onEdit={() => handleEditClick(selectedPerson!)}
                timeOffRequests={personTimeOffRequests}
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
