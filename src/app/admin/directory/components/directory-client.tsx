'use client';
import type { Technician, TimeOffRequest, WorkOrder, SiteRequest } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
    Card, 
    CardContent, 
    CardHeader, 
    CardTitle, 
    CardDescription 
} from "@/components/ui/card";
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
    ArrowUpDown,
    MapPin,
    Check,
    Navigation,
    User,
    Calendar as CalendarIcon,
    AlertTriangle,
    ShieldAlert,
    X,
    ClipboardCheck,
    Eye,
    ShieldCheck,
    ExternalLink,
    Activity,
    Lock
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
import { getReliabilityTier, getTierBadgeVariant, getTierColor } from '@/lib/reliability';
import { useSearchParams } from 'next/navigation';

type DirectoryClientProps = {
    technicians: Technician[];
    timeOffRequests: TimeOffRequest[];
    workOrders: WorkOrder[];
    siteRequests: SiteRequest[];
};

type ViewMode = 'rows' | 'grid';
type SortOption = 'name' | 'reliability' | 'contacts' | 'role';

export function DirectoryClient({ technicians: initialPersonnel, timeOffRequests: initialTimeOffRequests, workOrders, siteRequests: initialSiteRequests }: DirectoryClientProps) {
    const searchParams = useSearchParams();
    const [personnel, setPersonnel] = useState(initialPersonnel);
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<ViewMode>('rows');
    const [sortBy, setSortBy] = useState<SortOption>('name');
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'technicians');
    const [mapViewMode, setMapViewMode] = useState<'techs' | 'sites'>('techs');
    const [mapSearch, setMapSearch] = useState("");
    const [selectedMapAddress, setSelectedMapAddress] = useState<string | null>(null);
    
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
        const tab = searchParams.get('tab');
        if (tab) setActiveTab(tab);
    }, [searchParams]);

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
            description: `Personnel records for ${updatedPerson.name} committed.`
        });
    };

    const handleAddPersonnel = (newPerson: Technician) => {
        setPersonnel(prev => [newPerson, ...prev]);
        toast({
            title: "Personnel Enrolled",
            description: `${newPerson.name} has been successfully registered.`
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

    const getPrimaryRoleLabel = (person: Technician) => {
        if (person.roles && person.roles.length > 0) {
            return person.roles[0].replace(/_/g, ' ').toUpperCase();
        }
        return person.role.toUpperCase();
    };

    const personnelRequestsCount = useMemo(() => 
        timeOffRequests.filter(r => r.status === 'pending').length, 
    [timeOffRequests]);

    const clientRequestsCount = useMemo(() => 
        siteRequests.filter(r => r.status === 'pending').length, 
    [siteRequests]);

    const pendingRequestsTotalCount = personnelRequestsCount + clientRequestsCount;

    // --- MAP LOGIC ---
    const mapLocations = useMemo(() => {
        const locations: { id: string; name: string; location: string; type: 'tech' | 'site' }[] = [];
        if (mapViewMode === 'techs') {
            techniciansList.forEach(t => {
                const loc = t.address || t.currentLocation;
                if (loc) {
                    locations.push({ id: t.id, name: t.name, location: loc, type: 'tech' });
                }
            });
        } else {
            personnel.filter(p => p.roles?.includes('client')).forEach(c => {
                c.managedSites?.forEach(s => {
                    locations.push({ id: s.id, name: s.name, location: s.location, type: 'site' });
                });
            });
        }
        return locations;
    }, [mapViewMode, techniciansList, personnel]);

    const filteredMapLocations = useMemo(() => {
        const locations = mapLocations;
        if (!mapSearch) return locations;
        const q = mapSearch.toLowerCase();
        return locations.filter(loc => 
            loc.name.toLowerCase().includes(q) || 
            loc.location.toLowerCase().includes(q)
        );
    }, [mapLocations, mapSearch]);

    const selectedMapEntity = useMemo(() => {
        if (!selectedMapAddress) return null;
        const meta = mapLocations.find(l => l.location === selectedMapAddress);
        if (!meta) return null;

        if (meta.type === 'tech') {
            const data = techniciansList.find(t => t.id === meta.id);
            return data ? { ...data, metaType: 'tech' as const } : null;
        } else {
            for (const client of personnel.filter(p => p.roles?.includes('client'))) {
                const site = client.managedSites?.find(s => s.id === meta.id);
                if (site) return { ...site, clientCompany: client.clientCompany, metaType: 'site' as const };
            }
        }
        return null;
    }, [selectedMapAddress, mapLocations, techniciansList, personnel]);

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
                                {pendingRequestsTotalCount > 0 && (
                                    <Badge variant="destructive" className="h-3.5 px-1.5 min-w-[16px] flex items-center justify-center text-[8px] animate-pulse">
                                        {pendingRequestsTotalCount}
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

                    {activeTab !== 'map' && activeTab !== 'requests' && (
                        <div className="flex flex-col md:flex-row justify-between items-center gap-2 p-2 rounded-lg bg-bg-secondary/30 border border-border-sub">
                            <div className="flex items-center gap-2">
                                <div className="flex items-center bg-bg-tertiary rounded-md border border-border-sub p-0.5 h-7">
                                    <Button 
                                        variant="ghost" 
                                        size="icon-sm" 
                                        className={cn("h-6 w-6", viewMode === 'rows' && "bg-bg-secondary text-brand-red")}
                                        onClick={() => setViewMode('rows')}
                                    >
                                        <Rows3 size={11} />
                                    </Button>
                                    <Button 
                                        variant="ghost" 
                                        size="icon-sm" 
                                        className={cn("h-6 w-6", viewMode === 'grid' && "bg-bg-secondary text-brand-red")}
                                        onClick={() => setViewMode('grid')}
                                    >
                                        <LayoutGrid size={11} />
                                    </Button>
                                </div>
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
                            </div>

                            <div className="search-wrap flex-1 md:flex-none">
                                <Search className="h-3.5 w-3.5" />
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
                            <div className="grid grid-cols-[2fr,1fr,1.5fr,1.2fr,1fr] items-center px-4 py-2 bg-bg-tertiary text-text-muted text-[9px] font-bold uppercase tracking-widest border-b border-border-main">
                                <div className="text-left pl-0">TECHNICIAN</div>
                                <div className="text-left">ROLE</div>
                                <div className="text-left">CONTACT</div>
                                <div className="text-center">OPERATIONAL TRUST</div>
                                <div className="text-center">STATUS</div>
                            </div>
                            <ScrollArea className="h-full">
                                {paginatedTechnicians.map(tech => {
                                    const tier = tech.reliabilityTier || getReliabilityTier(tech.reliabilityScore);
                                    const tierColor = getTierColor(tier);
                                    const badgeVariant = getTierBadgeVariant(tier);
                                    const isRestricted = tier === 'Restricted' || tier === 'Suspended Review';

                                    return (
                                    <div key={tech.id} className="grid grid-cols-[2fr,1fr,1.5fr,1.2fr,1fr] items-center px-4 py-3 border-b border-border-subtle cursor-pointer hover:bg-bg-tertiary transition-colors last:border-none" onClick={() => handleRowClick(tech)}>
                                        <div className="flex items-center justify-start gap-3 pl-0">
                                            <Avatar className="h-8 w-8 shrink-0 border border-border-sub">
                                                <AvatarImage src={tech.avatarUrl} />
                                                <AvatarFallback className="text-[10px]">{tech.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex flex-col items-start min-w-0">
                                                <span className="font-bold text-text-primary uppercase tracking-wide text-[11px] truncate w-full text-left">{tech.name}</span>
                                                <span className="text-[9px] font-mono text-brand-red uppercase">{tech.id}</span>
                                            </div>
                                        </div>
                                        <div className="text-left">
                                            <span className="text-[10px] text-accent-gold font-black uppercase tracking-widest">{getPrimaryRoleLabel(tech)}</span>
                                        </div>
                                        <div className="min-w-0 flex flex-col items-start justify-center">
                                            <div className="flex items-center gap-1.5 text-[10px] text-text-primary truncate">
                                                <Mail size={10} className="text-text-muted shrink-0"/>{tech.email}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[9px] text-text-muted mt-0.5">
                                                <Phone size={10} className="text-text-muted shrink-0"/>{tech.phone}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center justify-center gap-1">
                                            <Badge variant={badgeVariant} className="text-[8px] h-4 uppercase tracking-[0.1em] px-2 font-black">
                                                {tier}
                                            </Badge>
                                            <div className="flex items-center gap-1.5">
                                                <Activity size={10} className={tierColor} />
                                                <span className={cn("font-mono font-bold text-xs", tierColor)}>{tech.reliabilityScore}%</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-center">
                                            {isRestricted ? (
                                                <Badge variant="missed" className="text-[8px] h-4 uppercase tracking-widest gap-1">
                                                    <Lock size={10}/> FLAG
                                                </Badge>
                                            ) : (
                                                <Badge variant="active" className="text-[8px] h-4 uppercase tracking-widest">ACTIVE</Badge>
                                            )}
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
                                <div className="text-left">ROLE</div>
                                <div className="text-left">CONTACT</div>
                            </div>
                            {paginatedStaff.map(s => (
                                <div key={s.id} className="grid grid-cols-[2fr,1.2fr,2fr] items-center px-4 py-3 border-b border-border-subtle cursor-pointer hover:bg-bg-tertiary transition-colors last:border-none" onClick={() => handleRowClick(s)}>
                                    <div className="flex items-center justify-start gap-3 pl-0">
                                        <Avatar className="h-8 w-8 shrink-0 border border-border-sub">
                                            <AvatarImage src={s.avatarUrl} />
                                            <AvatarFallback className="text-[10px]">{s.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                                        </Avatar>
                                        <span className="font-bold text-text-primary uppercase tracking-wide text-[11px] text-left">{s.name}</span>
                                    </div>
                                    <div className="text-left">
                                        <span className="text-[10px] text-accent-gold font-black uppercase tracking-widest">{getPrimaryRoleLabel(s)}</span>
                                    </div>
                                    <div className="min-w-0 flex flex-col items-start justify-center">
                                        <div className="flex items-center gap-1.5 text-[10px] text-text-primary truncate">
                                            <Mail size={10} className="text-text-muted shrink-0"/>{s.email}
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[9px] text-text-muted mt-0.5">
                                            <Phone size={10} className="text-text-muted shrink-0"/>{s.phone}
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
                                <div className="text-left">CLASSIFICATION</div>
                                <div className="text-center">CONTACTS</div>
                                <div className="text-center">REGISTRY</div>
                            </div>
                            {paginatedCompanies.map(company => (
                                <div key={company.name} className="grid grid-cols-[2fr,1.5fr,1fr,1fr] items-center px-4 py-3 border-b border-border-subtle cursor-pointer hover:bg-bg-tertiary group transition-colors last:border-none" onClick={() => handleCompanyClick(company.name)}>
                                    <div className="flex items-center justify-start gap-3 pl-0">
                                        <div className="p-1.5 bg-bg-tertiary rounded border border-border-sub group-hover:bg-brand-red-dim transition-colors">
                                            <Building2 size={14} className="text-text-muted group-hover:text-brand-red transition-colors" />
                                        </div>
                                        <span className="font-bold text-text-primary uppercase tracking-wide text-[11px] text-left">{company.name}</span>
                                    </div>
                                    <div className="flex items-center justify-start">
                                        <span className="text-[9px] text-accent-gold font-black uppercase tracking-widest">{company.businessType || 'Enterprise'}</span>
                                    </div>
                                    <div className="text-center flex items-center justify-center">
                                        <Badge variant="outline" className="text-[8px] h-4 px-2 bg-bg-primary border-border-sub">{company.contacts.length}</Badge>
                                    </div>
                                    <div className="text-center flex items-center justify-center">
                                        <ChevronRight size={14} className="text-text-muted group-hover:text-text-primary group-hover:translate-x-1 transition-all" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="requests" className="m-0 animate-in fade-in duration-300">
                        <Tabs defaultValue={searchParams.get('subtab') || "personnel"} className="w-full">
                            <TabsList className="tabs !bg-bg-secondary/50 border border-border-sub mb-6 h-9">
                                <TabsTrigger value="personnel" className="tab !px-6 h-full data-[state=active]:bg-brand-red data-[state=active]:text-white flex items-center gap-2">
                                    PERSONNEL REQUESTS
                                    {personnelRequestsCount > 0 && (
                                        <Badge variant="destructive" className="h-3.5 px-1.5 text-[8px]">{personnelRequestsCount}</Badge>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger value="client" className="tab !px-6 h-full data-[state=active]:bg-brand-red data-[state=active]:text-white flex items-center gap-2">
                                    SITE REQUESTS
                                    {clientRequestsCount > 0 && (
                                        <Badge variant="destructive" className="h-3.5 px-1.5 text-[8px]">{clientRequestsCount}</Badge>
                                    )}
                                </TabsTrigger>
                            </TabsList>
                            
                            <TabsContent value="personnel" className="mt-0">
                                <div className="max-w-3xl space-y-4">
                                    <div className="flex items-center justify-between border-b border-border-sub pb-2 px-1">
                                        <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                            <CalendarIcon size={14} className="text-brand-red"/>
                                            Personnel Absence Log
                                        </h3>
                                        <Badge variant="outline" className="text-[8px] uppercase tracking-widest">{personnelRequestsCount} Pending</Badge>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {timeOffRequests.filter(r => r.status === 'pending').map(req => {
                                            const tech = personnel.find(p => p.id === req.technicianId);
                                            return (
                                                <Card key={req.id} className="bg-bg-secondary border-border-sub shadow-sm">
                                                    <CardContent className="p-4 space-y-3">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <Avatar className="h-8 w-8 border border-border-sub">
                                                                    <AvatarImage src={tech?.avatarUrl} />
                                                                    <AvatarFallback>{tech?.name.charAt(0)}</AvatarFallback>
                                                                </Avatar>
                                                                <div>
                                                                    <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{tech?.name}</p>
                                                                    <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest">{req.type} Request</p>
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-[10px] font-mono font-bold text-text-primary uppercase">{req.startDate}</p>
                                                                <p className="text-[8px] text-text-muted uppercase font-bold">to {req.endDate}</p>
                                                            </div>
                                                        </div>
                                                        <div className="p-2.5 rounded bg-bg-primary/50 border border-border-sub italic text-[11px] text-text-secondary leading-relaxed">
                                                            &quot;{req.reason}&quot;
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <Button variant="outline" size="sm" className="flex-1 h-7 text-[9px] uppercase font-bold border-border-alert text-text-red hover:bg-brand-red-dim" onClick={() => toast({ title: "Request Denied", description: "Technician schedule manifest remains locked." })}>Deny</Button>
                                                            <Button variant="default" size="sm" className="flex-1 h-7 text-[9px] uppercase font-bold bg-text-green hover:bg-text-green/90" onClick={() => toast({ title: "Absence Authorized", description: "Temporal registry updated for field staff." })}>Approve</Button>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            );
                                        })}
                                    </div>
                                    {timeOffRequests.filter(r => r.status === 'pending').length === 0 && (
                                        <div className="p-12 text-center border border-dashed border-border-sub rounded-xl bg-bg-secondary/30">
                                            <ShieldAlert size={32} className="mx-auto text-text-muted mb-2 opacity-20" />
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">No pending absence logs</p>
                                        </div>
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="client" className="mt-0">
                                <div className="max-w-3xl space-y-4">
                                    <div className="flex items-center justify-between border-b border-border-sub pb-2 px-1">
                                        <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                                            <Building2 size={14} className="text-accent-gold"/>
                                            Client Coordinate Verification
                                        </h3>
                                        <Badge variant="outline" className="text-[8px] uppercase tracking-widest">{clientRequestsCount} Pending</Badge>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {siteRequests.filter(r => r.status === 'pending').map(req => (
                                            <Card key={req.id} className="bg-bg-secondary border-border-sub shadow-sm">
                                                <CardContent className="p-4 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2 bg-bg-tertiary rounded border border-border-sub text-accent-gold">
                                                                <MapPin size={16} />
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{req.siteName}</p>
                                                                <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest">{req.clientName}</p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Submitted</p>
                                                            <p className="text-[10px] font-mono font-bold text-text-primary">{req.submittedDate}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] text-text-secondary bg-bg-primary p-2 rounded border border-border-sub">
                                                        <Navigation size={12} className="text-brand-red shrink-0"/>
                                                        <span className="truncate">{req.location}</span>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Button variant="outline" size="sm" className="flex-1 h-7 text-[9px] uppercase font-bold border-border-alert text-text-red hover:bg-brand-red-dim" onClick={() => toast({ variant: "destructive", title: "Coordinates Rejected", description: "Client notified of registry failure." })}>Reject Coordinates</Button>
                                                        <Button variant="default" size="sm" className="flex-1 h-7 text-[9px] uppercase font-bold bg-brand-red" onClick={() => toast({ title: "Registry Authorized", description: "Site coordinates committed to managed asset database." })}>Authorize Site</Button>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                    {siteRequests.filter(r => r.status === 'pending').length === 0 && (
                                        <div className="p-12 text-center border border-dashed border-border-sub rounded-xl bg-bg-secondary/30">
                                            <MapPin size={32} className="mx-auto text-text-muted mb-2 opacity-20" />
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">No pending site verifications</p>
                                        </div>
                                    )}
                                </div>
                            </TabsContent>
                        </Tabs>
                    </TabsContent>

                    <TabsContent value="map" className="m-0">
                         <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[650px] mt-4">
                            <Card className="lg:col-span-2 bg-bg-secondary border-border-main overflow-hidden relative">
                                <div className="absolute inset-0 bg-bg-primary">
                                     <iframe 
                                        src={selectedMapAddress 
                                            ? `https://maps.google.com/maps?q=${encodeURIComponent(selectedMapAddress)}&t=&z=13&ie=UTF8&iwloc=&output=embed`
                                            : "https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d1500000!2d-84.5!3d44.5!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2sus!4v1778360117229!5m2!1sen!2sus"
                                        } 
                                        width="100%" 
                                        height="100%" 
                                        style={{ border: 0 }} 
                                        allowFullScreen={true} 
                                        loading="lazy"
                                        referrerPolicy="no-referrer-when-downgrade"
                                    ></iframe>

                                    {/* INFO CARD OVERLAY */}
                                    {selectedMapEntity && (
                                        <div className="absolute top-4 left-4 z-20 w-full max-w-[280px] animate-in fade-in slide-in-from-left-4 duration-500">
                                            <Card className="bg-bg-elevated border-border-default shadow-2xl overflow-hidden">
                                                <CardHeader className="p-3 bg-bg-tertiary/50 border-b border-border-sub relative">
                                                    <button 
                                                        onClick={() => setSelectedMapAddress(null)}
                                                        className="absolute top-2 right-2 text-text-muted hover:text-text-primary"
                                                    >
                                                        <X size={14}/>
                                                    </button>
                                                    <div className="flex items-center gap-3">
                                                        {selectedMapEntity.metaType === 'tech' ? (
                                                            <Avatar className="h-8 w-8 border border-border-sub">
                                                                <AvatarImage src={(selectedMapEntity as Technician).avatarUrl} />
                                                                <AvatarFallback>{(selectedMapEntity as Technician).name.charAt(0)}</AvatarFallback>
                                                            </Avatar>
                                                        ) : (
                                                            <div className="p-1.5 bg-bg-secondary rounded border border-border-sub text-accent-gold">
                                                                <Building2 size={16} />
                                                            </div>
                                                        )}
                                                        <div className="min-w-0">
                                                            <CardTitle className="text-xs uppercase truncate">{(selectedMapEntity as any).name}</CardTitle>
                                                            <p className="text-[9px] text-text-muted font-bold uppercase tracking-widest">
                                                                {selectedMapEntity.metaType === 'tech' ? (selectedMapEntity as Technician).role : (selectedMapEntity as any).clientCompany}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="p-3 space-y-3">
                                                    <div className="flex items-start gap-2">
                                                        <MapPin size={12} className="text-brand-red shrink-0 mt-0.5" />
                                                        <p className="text-[10px] text-text-secondary leading-tight uppercase font-medium">{(selectedMapEntity as any).location}</p>
                                                    </div>
                                                    {selectedMapEntity.metaType === 'tech' ? (
                                                        <div className="flex items-center justify-between pt-1 border-t border-border-sub/30 mt-1">
                                                            <div className="space-y-0.5">
                                                                <p className="text-[8px] font-black uppercase text-text-muted tracking-widest">Reliability</p>
                                                                <p className="text-xs font-mono font-bold text-text-green">{(selectedMapEntity as Technician).reliabilityScore}%</p>
                                                            </div>
                                                            <Button 
                                                                size="sm" 
                                                                variant="outline" 
                                                                className="h-6 text-[8px] font-bold uppercase"
                                                                onClick={() => handleRowClick(selectedMapEntity as Technician)}
                                                            >
                                                                <Eye size={10} className="mr-1"/> Profile
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center justify-between pt-1 border-t border-border-sub/30 mt-1">
                                                            <div className="space-y-0.5">
                                                                <p className="text-[8px] font-black uppercase text-text-muted tracking-widest">Access Tier</p>
                                                                <p className="text-[10px] font-bold text-text-primary uppercase">Standard Site</p>
                                                            </div>
                                                            <Button 
                                                                size="sm" 
                                                                variant="outline" 
                                                                className="h-6 text-[8px] font-bold uppercase"
                                                                onClick={() => handleCompanyClick((selectedMapEntity as any).clientCompany)}
                                                            >
                                                                <ShieldCheck size={10} className="mr-1"/> Audit Site
                                                            </Button>
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        </div>
                                    )}

                                    <div className="absolute top-2 right-2 z-10 bg-black/80 backdrop-blur-md p-1 rounded border border-white/10 shadow-2xl">
                                        <div className="flex items-center gap-1.5 px-1.5 py-0.5">
                                            <Label htmlFor="map-toggle" className="text-[8px] font-black text-white uppercase tracking-tighter cursor-pointer opacity-70">Techs</Label>
                                            <Switch 
                                                id="map-toggle" 
                                                className="scale-[0.6] data-[state=unchecked]:bg-brand-red data-[state=checked]:bg-brand-red"
                                                checked={mapViewMode === 'sites'} 
                                                onCheckedChange={(val) => {
                                                    setMapViewMode(val ? 'sites' : 'techs');
                                                    setSelectedMapAddress(null);
                                                }} 
                                            />
                                            <Label htmlFor="map-toggle" className="text-[8px] font-black text-white uppercase tracking-tighter cursor-pointer opacity-70">Sites</Label>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                            
                            <Card className="bg-bg-secondary border-border-main flex flex-col overflow-hidden">
                                <div className="p-4 border-b border-border-sub bg-bg-tertiary/50 space-y-3">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
                                        {mapViewMode === 'techs' ? <User size={14} className="text-brand-red"/> : <Building2 size={14} className="text-accent-gold"/>}
                                        {mapViewMode === 'techs' ? 'Operative Base Registry' : 'Client Site Locations'}
                                    </h3>
                                    <div className="search-wrap !mb-0 h-8">
                                        <Search className="h-3 w-3" />
                                        <input 
                                            className="search-input !w-full !h-8 !text-[10px]" 
                                            placeholder="Search registry..." 
                                            value={mapSearch}
                                            onChange={(e) => setMapSearch(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <ScrollArea className="flex-1">
                                    <div className="divide-y divide-border-sub">
                                        {filteredMapLocations.map(loc => (
                                            <div 
                                                key={loc.id} 
                                                onClick={() => setSelectedMapAddress(loc.location)}
                                                className={cn(
                                                    "p-4 hover:bg-bg-tertiary transition-colors cursor-pointer group",
                                                    selectedMapAddress === loc.location && "bg-bg-tertiary border-l-2 border-brand-red"
                                                )}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className={cn(
                                                        "p-2 rounded border border-border-sub shrink-0 transition-colors",
                                                        loc.type === 'tech' ? "bg-brand-red-dim/20 text-brand-red group-hover:bg-brand-red group-hover:text-white" : "bg-accent-gold-dim/20 text-accent-gold group-hover:bg-accent-gold group-hover:text-white"
                                                    )}>
                                                        {loc.type === 'tech' ? <User size={14}/> : <Building2 size={14}/>}
                                                    </div>
                                                    <div className="space-y-0.5 overflow-hidden">
                                                        <p className="text-xs font-bold text-text-primary uppercase truncate">{loc.name}</p>
                                                        <p className="text-[9px] text-text-muted uppercase tracking-tight flex items-center gap-1">
                                                            <Navigation size={8}/> {loc.location}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {filteredMapLocations.length === 0 && (
                                            <div className="p-12 text-center">
                                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest italic">No matching coordinates found</p>
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </Card>
                         </div>
                    </TabsContent>
                </div>

                {activeTab !== 'map' && activeTab !== 'requests' && totalRecords > 0 && (
                    <div className="mt-3 flex items-center justify-between p-2 bg-bg-secondary rounded-lg border border-border-sub">
                        <div className="flex items-center gap-4">
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
                                <span className="text-[9px] font-bold text-text-primary uppercase tracking-tighter">P{currentPage} / {totalPages}</span>
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
