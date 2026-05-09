'use client';
import type { Technician, TimeOffRequest, WorkOrder, SiteRequest } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
    Search, 
    Mail, 
    Phone, 
    Plus, 
    Map as MapIcon, 
    ChevronLeft,
    ChevronRight,
    Building2, 
    Rows3, 
    LayoutGrid, 
    Columns2,
    ArrowUpDown,
    MapPin,
    Calendar,
    Check,
    X,
    Clock,
    Navigation,
    User,
} from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { AddPersonnelDialog } from './add-personnel-dialog';
import { EditPersonnelDialog } from './edit-personnel-dialog';
import { PersonnelDetailDialog } from './personnel-detail-dialog';
import { CompanyDetailDialog } from './company-detail-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, parseISO } from 'date-fns';

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
    const [mapViewMode, setMapViewMode] = useState<'techs' | 'sites'>('techs');
    
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const [isAddPersonnelOpen, setIsAddPersonnelOpen] = useState(false);
    const [isEditPersonnelOpen, setIsEditPersonnelOpen] = useState(false);
    const [selectedPerson, setSelectedPerson] = useState<Technician | null>(null);
    const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isCompanyDetailOpen, setIsCompanyDetailOpen] = useState(false);
    
    const [timeOffRequests, setTimeOffRequests] = useState(initialTimeOffRequests);
    const [siteRequests, setSiteRequests] = useState(initialSiteRequests);
    
    const { toast } = useToast();

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, activeTab, itemsPerPage]);

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
    
    const paginatedTechnicians = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredTechnicians.slice(start, start + itemsPerPage);
    }, [filteredTechnicians, currentPage, itemsPerPage]);

    const paginatedStaff = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredStaff.slice(start, start + itemsPerPage);
    }, [filteredStaff, currentPage, itemsPerPage]);

    const paginatedCompanies = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredCompanies.slice(start, start + itemsPerPage);
    }, [filteredCompanies, currentPage, itemsPerPage]);

    const totalRecords = activeTab === 'technicians' ? filteredTechnicians.length : 
                       activeTab === 'staff' ? filteredStaff.length :
                       activeTab === 'clients' ? filteredCompanies.length : 0;
    const totalPages = Math.ceil(totalRecords / itemsPerPage);

    const formatDateStr = (dateStr: string) => {
        if (!dateStr) return 'TBD';
        try {
            const parts = dateStr.split(/[-/]/);
            let d;
            if (parts[0].length === 4) { d = new Date(dateStr); } 
            else { d = parseISO(dateStr); }
            return format(d, 'MM-dd-yyyy');
        } catch (e) {
            return dateStr;
        }
    };

    const getPrimaryRoleLabel = (person: Technician) => {
        if (person.roles && person.roles.length > 0) {
            return person.roles[0].replace(/_/g, ' ').toUpperCase();
        }
        return person.role.toUpperCase();
    };

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

    const mapLocations = useMemo(() => {
        const sites: { id: string; name: string; location: string; type: 'tech' | 'site' }[] = [];
        if (mapViewMode === 'techs') {
            techniciansList.forEach(t => {
                if (t.address?.includes('MI') || t.currentLocation?.includes('MI')) {
                    sites.push({ id: t.id, name: t.name, location: t.address || t.currentLocation, type: 'tech' });
                }
            });
        } else {
            personnel.filter(p => p.roles?.includes('client')).forEach(c => {
                c.managedSites?.forEach(s => {
                    if (s.location.includes('MI')) {
                        sites.push({ id: s.id, name: s.name, location: s.location, type: 'site' });
                    }
                });
            });
        }
        return sites;
    }, [techniciansList, personnel, mapViewMode]);

    return (
        <>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex flex-col gap-2">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-2">
                        <TabsList className="tabs !mb-0 !p-0 !bg-bg-tertiary w-full md:w-auto h-9">
                            <TabsTrigger value="technicians" className="tab !px-4 !py-1.5 data-[state=active]:bg-brand-red data-[state=active]:text-white h-full">TECHNICIANS</TabsTrigger>
                            <TabsTrigger value="staff" className="tab !px-4 !py-1.5 data-[state=active]:bg-brand-red data-[state=active]:text-white h-full">STAFF</TabsTrigger>
                            <TabsTrigger value="clients" className="tab !px-4 !py-1.5 data-[state=active]:bg-brand-red data-[state=active]:text-white h-full">CLIENTS</TabsTrigger>
                            <TabsTrigger value="requests" className="tab !px-4 !py-1.5 data-[state=active]:bg-brand-red data-[state=active]:text-white flex items-center justify-center gap-2 h-full">
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
                                className={cn("h-7 px-3 text-[10px]", activeTab === 'map' ? "bg-brand-red" : "border-border-sub bg-bg-tertiary")}
                            >
                                <MapIcon size={11} className="mr-1.5"/>
                                MAP
                            </Button>

                            <Button variant="default" size="sm" onClick={() => setIsAddPersonnelOpen(true)} className="h-7 px-3 text-[10px]">
                                <Plus size={11} className="mr-1.5"/>
                                ADD PERSONNEL
                            </Button>
                        </div>
                    </div>

                    {activeTab !== 'map' && (
                        <div className="flex flex-col md:flex-row justify-between items-center gap-2 p-2 rounded-lg bg-bg-secondary/30 border border-border-sub">
                            <div className="flex items-center gap-2">
                                {activeTab !== 'requests' && (
                                    <div className="flex items-center bg-bg-tertiary rounded-md border border-border-sub p-0.5 h-7">
                                        <Button 
                                            variant="ghost" 
                                            size="icon-sm" 
                                            className={cn("h-6 w-6", viewMode === 'rows' && "bg-bg-secondary text-brand-red")}
                                            onClick={() => setViewMode('rows')}
                                            title="Row View"
                                        >
                                            <Rows3 size={11} />
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            size="icon-sm" 
                                            className={cn("h-6 w-6", viewMode === 'grid' && "bg-bg-secondary text-brand-red")}
                                            onClick={() => setViewMode('grid')}
                                            title="Box View"
                                        >
                                            <LayoutGrid size={11} />
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            size="icon-sm" 
                                            className={cn("h-6 w-6", viewMode === 'columns' && "bg-bg-secondary text-brand-red")}
                                            onClick={() => setViewMode('columns')}
                                            title="Column View"
                                        >
                                            <Columns2 size={11} />
                                        </Button>
                                    </div>
                                )}

                                {activeTab !== 'requests' && (
                                    <div className="flex items-center gap-1">
                                        <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                                            <SelectTrigger className="w-[110px] bg-bg-tertiary border-border-sub h-7 text-[8px] uppercase font-bold tracking-widest">
                                                <div className="flex items-center gap-1.5">
                                                    <ArrowUpDown size={10} className="text-text-muted" />
                                                    <SelectValue placeholder="Sort" />
                                                </div>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="name" className="text-[8px] uppercase font-bold">Name</SelectItem>
                                                {activeTab === 'technicians' && <SelectItem value="reliability" className="text-[8px] uppercase font-bold">Reliability</SelectItem>}
                                                {activeTab === 'clients' && <SelectItem value="contacts" className="text-[8px] uppercase font-bold">Density</SelectItem>}
                                                {activeTab === 'staff' && <SelectItem value="role" className="text-[8px] uppercase font-bold">Role</SelectItem>}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                            </div>

                            <div className="search-wrap flex-1 md:flex-none">
                                <Search className="h-3 w-3" />
                                <input 
                                    className="search-input w-full md:w-[240px] h-7 !text-[11px]" 
                                    placeholder="Filter registry..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="w-full mt-3">
                    <TabsContent value="technicians" className="m-0">
                        <div className="table-wrap">
                            <div className="grid grid-cols-[2fr,1.2fr,2fr,1fr,1fr] items-center px-4 py-2 bg-bg-tertiary text-text-muted text-[9px] font-bold uppercase tracking-widest border-b border-border-main">
                                <div className="text-left pl-0">TECHNICIAN</div>
                                <div className="text-left pl-0">ROLE</div>
                                <div className="text-left pl-0">CONTACT</div>
                                <div className="text-center">RELIABILITY</div>
                                <div className="text-center">STATUS</div>
                            </div>
                            <ScrollArea className="h-full">
                                {paginatedTechnicians.map(tech => {
                                    const reliabilityColor = tech.reliabilityScore > 90 ? 'text-text-green' : tech.reliabilityScore > 80 ? 'text-accent-gold' : 'text-text-red';
                                    return (
                                    <div key={tech.id} className="grid grid-cols-[2fr,1.2fr,2fr,1fr,1fr] items-center px-4 py-3 border-b border-border-subtle cursor-pointer hover:bg-bg-tertiary transition-colors last:border-none" onClick={() => handleRowClick(tech)}>
                                        <div className="flex items-center justify-start gap-3 pl-0">
                                            <Avatar className="h-8 w-8 shrink-0 border border-border-sub">
                                                <AvatarImage src={tech.avatarUrl} />
                                                <AvatarFallback className="text-[10px]">{tech.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                            </Avatar>
                                            <span className="font-bold text-text-primary uppercase tracking-wide text-[11px]">{tech.name}</span>
                                        </div>
                                        <div className="text-left pl-0">
                                            <span className="text-[10px] text-accent-gold font-black uppercase tracking-widest">{getPrimaryRoleLabel(tech)}</span>
                                        </div>
                                        <div className="min-w-0 flex flex-col items-start justify-center pl-0">
                                            <div className="flex items-center gap-1.5 text-[11px] text-text-primary truncate">
                                                <Mail size={11} className="text-text-muted shrink-0"/>{tech.email}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[10px] text-text-muted mt-0.5">
                                                <Phone size={11} className="text-text-muted shrink-0"/>{tech.phone}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center justify-center">
                                            <span className={`font-mono font-bold text-sm ${reliabilityColor}`}>{tech.reliabilityScore}%</span>
                                        </div>
                                        <div className="flex items-center justify-center">
                                            <Badge variant="active" className="text-[8px] h-4 uppercase tracking-widest">ACTIVE</Badge>
                                        </div>
                                    </div>
                                )})}
                            </ScrollArea>
                        </div>
                    </TabsContent>
                    
                    <TabsContent value="staff" className="m-0">
                        <div className="table-wrap">
                            <div className="grid grid-cols-[2fr,1.2fr,2fr] items-center px-4 py-2 bg-bg-tertiary text-text-muted text-[9px] font-bold uppercase tracking-widest border-b border-border-main">
                                <div className="text-left pl-0">STAFF MEMBER</div>
                                <div className="text-left pl-0">ROLE</div>
                                <div className="text-left pl-0">CONTACT</div>
                            </div>
                            {paginatedStaff.map(s => (
                                <div key={s.id} className="grid grid-cols-[2fr,1.2fr,2fr] items-center px-4 py-3 border-b border-border-subtle cursor-pointer hover:bg-bg-tertiary transition-colors last:border-none" onClick={() => handleRowClick(s)}>
                                    <div className="flex items-center justify-start gap-3 pl-0">
                                        <Avatar className="h-8 w-8 shrink-0 border border-border-sub">
                                            <AvatarImage src={s.avatarUrl} />
                                            <AvatarFallback className="text-[10px]">{s.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                        </Avatar>
                                        <span className="font-bold text-text-primary uppercase tracking-wide text-[11px]">{s.name}</span>
                                    </div>
                                    <div className="text-left pl-0">
                                        <span className="text-[10px] text-accent-gold font-black uppercase tracking-widest">{getPrimaryRoleLabel(s)}</span>
                                    </div>
                                    <div className="min-w-0 flex flex-col items-start justify-center pl-0">
                                        <div className="flex items-center gap-1.5 text-[11px] text-text-primary truncate">
                                            <Mail size={11} className="text-text-muted shrink-0"/>{s.email}
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[10px] text-text-muted mt-0.5">
                                            <Phone size={11} className="text-text-muted shrink-0"/>{s.phone}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </TabsContent>
                    
                    <TabsContent value="clients" className="m-0">
                        <div className="table-wrap">
                            <div className="grid grid-cols-[2fr,1.5fr,1fr,1fr] items-center px-4 py-2 bg-bg-tertiary text-text-muted text-[9px] font-bold uppercase tracking-widest border-b border-border-main">
                                <div className="text-left pl-0">CORPORATE ENTITY</div>
                                <div className="text-left pl-0">CLASSIFICATION</div>
                                <div className="text-center">CONTACTS</div>
                                <div className="text-center">REGISTRY</div>
                            </div>
                            {paginatedCompanies.map(company => (
                                <div key={company.name} className="grid grid-cols-[2fr,1.5fr,1fr,1fr] items-center px-4 py-3 border-b border-border-subtle cursor-pointer hover:bg-bg-tertiary group transition-colors last:border-none" onClick={() => handleCompanyClick(company.name)}>
                                    <div className="flex items-center justify-start gap-3 pl-0">
                                        <div className="p-1.5 bg-bg-tertiary rounded border border-border-sub group-hover:bg-brand-red-dim transition-colors">
                                            <Building2 size={14} className="text-text-muted group-hover:text-brand-red transition-colors" />
                                        </div>
                                        <span className="font-bold text-text-primary uppercase tracking-wide text-[11px]">{company.name}</span>
                                    </div>
                                    <div className="flex items-center justify-start pl-0">
                                        <span className="text-[9px] text-accent-gold font-black uppercase tracking-widest">{company.businessType || 'Enterprise'}</span>
                                    </div>
                                    <div className="text-center flex items-center justify-center">
                                        <Badge variant="outline" className="text-[8px] h-4 px-2 bg-bg-primary border-border-sub">{company.contacts.length} C</Badge>
                                    </div>
                                    <div className="text-center flex items-center justify-center">
                                        <ChevronRight size={14} className="text-text-muted group-hover:text-text-primary group-hover:translate-x-1 transition-all" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="requests" className="m-0">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-4">
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 border-b border-border-sub pb-1.5">
                                    <Clock size={14} className="text-brand-red" />
                                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-primary">Personnel Absence Requests</h3>
                                    <Badge variant="destructive" className="h-4 px-1 text-[8px] ml-auto">{filteredTimeOffRequests.length}</Badge>
                                </div>
                                
                                <div className="space-y-1.5">
                                    {filteredTimeOffRequests.map(req => {
                                        const tech = personnel.find(p => p.id === req.technicianId);
                                        return (
                                            <div key={req.id} className="flex flex-col md:flex-row items-center justify-between p-2 rounded-lg bg-bg-secondary border border-border-main hover:bg-bg-tertiary transition-colors group">
                                                <div className="flex items-center justify-center gap-4 flex-1 text-center">
                                                    <Avatar className="h-7 w-7 border border-border-sub group-hover:border-brand-red transition-colors shrink-0">
                                                        <AvatarImage src={tech?.avatarUrl} />
                                                        <AvatarFallback className="text-[9px]">{tech?.name.charAt(0)}</AvatarFallback>
                                                    </Avatar>
                                                    <div className="space-y-0.5 flex flex-col items-center">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{tech?.name}</p>
                                                            <Badge variant="outline" className="text-[7px] h-3.5 uppercase tracking-tighter bg-bg-tertiary">{req.type}</Badge>
                                                        </div>
                                                        <p className="text-[11px] text-text-primary font-bold flex items-center justify-center gap-1.5">
                                                            <Calendar size={11} className="shrink-0 text-brand-red" /> {formatDateStr(req.startDate)} — {formatDateStr(req.endDate)}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-center gap-1.5 mt-2 md:mt-0">
                                                    <Button variant="ghost" size="sm" className="h-7 text-[8px] uppercase font-bold text-text-red hover:bg-brand-red-dim border border-transparent hover:border-border-alert" onClick={() => handleTimeOffStatusChange(req.id, 'denied')}>
                                                        <X size={10} className="mr-1"/> Deny
                                                    </Button>
                                                    <Button variant="outline" size="sm" className="h-7 text-[8px] uppercase font-bold border-text-green text-text-green hover:bg-green-dim" onClick={() => handleTimeOffStatusChange(req.id, 'approved')}>
                                                        <Check size={10} className="mr-1"/> Approve
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center gap-2 border-b border-border-sub pb-1.5">
                                    <MapPin size={14} className="text-brand-red" />
                                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-primary">Site Registry Audit</h3>
                                    <Badge variant="destructive" className="h-4 px-1 text-[8px] ml-auto">{filteredSiteRequests.length}</Badge>
                                </div>

                                <div className="space-y-1.5">
                                    {filteredSiteRequests.map(req => (
                                        <div key={req.id} className="flex flex-col md:flex-row items-center justify-between p-2.5 rounded-lg bg-bg-secondary border border-border-main hover:bg-bg-tertiary transition-colors group">
                                            <div className="flex items-center justify-center gap-4 flex-1 text-center">
                                                <div className="p-1.5 bg-bg-primary rounded border border-border-sub group-hover:text-brand-red transition-colors shrink-0">
                                                    <Building2 size={14} />
                                                </div>
                                                <div className="space-y-0.5 flex flex-col items-center">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-xs font-bold text-text-primary uppercase tracking-wide truncate max-w-[150px]">{req.siteName}</p>
                                                        <Badge variant="outline" className="text-[7px] h-3.5 uppercase tracking-tighter bg-bg-tertiary">{req.clientName}</Badge>
                                                    </div>
                                                    <p className="text-[11px] text-text-primary font-bold flex items-center justify-center gap-1.5">
                                                        <MapPin size={11} className="shrink-0 text-brand-red"/> {req.location}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-center gap-3 mt-2 md:mt-0">
                                                <Button variant="ghost" size="sm" className="h-7 text-[8px] uppercase font-bold text-text-red hover:bg-brand-red-dim border border-transparent hover:border-border-alert" onClick={() => handleSiteRequestStatusChange(req.id, 'denied')}>
                                                    <X size={10} className="mr-1"/> Deny
                                                </Button>
                                                <Button variant="outline" size="sm" className="h-7 text-[8px] uppercase font-bold border-text-green text-text-green hover:bg-green-dim" onClick={() => handleSiteRequestStatusChange(req.id, 'approved')}>
                                                    <Check size={10} className="mr-1"/> Approve
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="map" className="m-0">
                         <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[650px] mt-4">
                            <Card className="lg:col-span-2 bg-bg-secondary border-border-main overflow-hidden relative">
                                <div className="absolute inset-0 bg-bg-primary">
                                     <iframe 
                                        src="https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d3624053.354181654!2d-84.06883681645265!3d43.5584848511088!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2sus!4v1778360117229!5m2!1sen!2sus" 
                                        width="100%" 
                                        height="100%" 
                                        style={{ border: 0 }} 
                                        allowFullScreen={true} 
                                        loading="lazy"
                                        referrerPolicy="no-referrer-when-downgrade"
                                    ></iframe>
                                    <div className="absolute top-2 right-2 z-10 bg-black/80 backdrop-blur-md p-1.5 rounded border border-white/10 shadow-2xl">
                                        <div className="flex items-center gap-1.5">
                                            <Label htmlFor="map-toggle" className="text-[8px] font-bold text-white uppercase tracking-tighter cursor-pointer opacity-70">Techs</Label>
                                            <Switch 
                                                id="map-toggle" 
                                                className="scale-[0.6] data-[state=checked]:bg-brand-red"
                                                checked={mapViewMode === 'sites'} 
                                                onCheckedChange={(val) => setMapViewMode(val ? 'sites' : 'techs')} 
                                            />
                                            <Label htmlFor="map-toggle" className="text-[8px] font-bold text-white uppercase tracking-tighter cursor-pointer opacity-70">Sites</Label>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                            
                            <Card className="bg-bg-secondary border-border-main flex flex-col overflow-hidden">
                                <div className="p-4 border-b border-border-sub bg-bg-tertiary/50">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                                        {mapViewMode === 'techs' ? <User size={14} className="text-brand-red"/> : <Building2 size={14} className="text-accent-gold"/>}
                                        {mapViewMode === 'techs' ? 'Operative Base Registry' : 'Mission Target Registry'}
                                    </h3>
                                </div>
                                <ScrollArea className="flex-1">
                                    <div className="divide-y divide-border-sub">
                                        {mapLocations.map(site => (
                                            <div key={site.id} className="p-4 hover:bg-bg-tertiary transition-colors cursor-pointer group">
                                                <div className="flex items-start gap-3">
                                                    <div className={cn(
                                                        "p-2 rounded border border-border-sub shrink-0 transition-colors",
                                                        site.type === 'tech' ? "bg-brand-red-dim/20 text-brand-red group-hover:bg-brand-red group-hover:text-white" : "bg-accent-gold-dim/20 text-accent-gold group-hover:bg-accent-gold group-hover:text-white"
                                                    )}>
                                                        {site.type === 'tech' ? <User size={14}/> : <Building2 size={14}/>}
                                                    </div>
                                                    <div className="space-y-0.5 overflow-hidden">
                                                        <p className="text-xs font-bold text-text-primary uppercase truncate">{site.name}</p>
                                                        <p className="text-[9px] text-text-muted uppercase tracking-tight flex items-center gap-1">
                                                            <Navigation size={8}/> {site.location}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </Card>
                         </div>
                    </TabsContent>
                </div>

                {activeTab !== 'map' && activeTab !== 'requests' && totalRecords > 0 && (
                    <div className="mt-3 flex items-center justify-between p-2 bg-bg-secondary rounded-lg border border-border-sub">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5">
                                <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Show</p>
                                <Select value={itemsPerPage.toString()} onValueChange={(v) => setItemsPerPage(parseInt(v))}>
                                    <SelectTrigger className="h-6 w-[55px] bg-bg-primary text-[9px] font-bold border-border-sub p-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="10" className="text-[10px]">10</SelectItem>
                                        <SelectItem value="25" className="text-[10px]">25</SelectItem>
                                        <SelectItem value="50" className="text-[10px]">50</SelectItem>
                                        <SelectItem value="100" className="text-[10px]">100</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">
                                <span className="text-text-primary">{(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, totalRecords)}</span> / {totalRecords}
                            </p>
                        </div>
                        
                        <div className="flex items-center gap-1">
                            <Button 
                                variant="outline" 
                                size="icon-sm" 
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                className="h-6 w-6 border-border-sub bg-bg-primary"
                            >
                                <ChevronLeft size={12} />
                            </Button>
                            <div className="flex items-center gap-1 px-2">
                                <span className="text-[9px] font-bold text-text-primary uppercase tracking-tighter">P{currentPage} of {totalPages}</span>
                            </div>
                            <Button 
                                variant="outline" 
                                size="icon-sm" 
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                className="h-6 w-6 border-border-sub bg-bg-primary"
                            >
                                <ChevronRight size={12} />
                            </Button>
                        </div>
                    </div>
                )}
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
                workOrders={[]}
                onEdit={() => handleEditClick(selectedPerson!)}
                timeOffRequests={[]}
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
