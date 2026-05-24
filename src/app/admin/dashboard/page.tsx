'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  LayoutDashboard,
  MonitorUp,
  Wrench,
  FolderKanban,
  Clock,
  ClipboardList,
  Users,
  MapPin,
  Calendar,
  ChevronRight,
  CheckCircle2,
  Activity,
} from 'lucide-react';
import { StatCard } from './components/stat-card';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { getAvailablePortals } from '@/lib/permissions';
import { useRouter } from 'next/navigation';
import { NotificationBell } from '@/components/notification-bell';
import { TERMINOLOGY } from '@/lib/constants';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, doc } from 'firebase/firestore';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription, 
    DialogFooter 
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// Performance: Code-splitting heavy chart library
const WorkloadChart = dynamic(() => import('./components/workload-chart').then(mod => mod.WorkloadChart), {
    loading: () => <div className="h-[250px] w-full bg-bg-tertiary animate-pulse rounded-lg" />,
    ssr: false
});

export default function DashboardPage() {
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [weeklyLogs, setWeeklyLogs] = useState<WeeklyLog[]>([]);
    const [siteRequests, setSiteRequests] = useState<SiteRequest[]>([]);
    const [clientRequests, setClientRequests] = useState<ServiceRequest[]>([]);
    const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [isPendingDialogOpen, setIsPendingDialogOpen] = useState(false);
    const router = useRouter();

    // 1. Initialize Real-time Registry Listeners
    useEffect(() => {
        const unsubWO = onSnapshot(collection(db, 'workOrders'), (snap) => {
            setWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });

        const unsubTech = onSnapshot(collection(db, 'users'), (snap) => {
            const techs = snap.docs.map(d => ({ ...d.data(), id: d.id } as Technician));
            setTechnicians(techs);
            
            const userId = localStorage.getItem('currentUserId');
            if (userId) {
                setCurrentUser(techs.find(t => t.id === userId) || null);
            }
        });

        const unsubProj = onSnapshot(collection(db, 'projects'), (snap) => {
            setProjects(snap.docs.map(d => ({ ...d.data(), id: d.id } as Project)));
        });

        const unsubLogs = onSnapshot(collection(db, 'weeklyLogs'), (snap) => {
            setWeeklyLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)));
        });

        const unsubSite = onSnapshot(collection(db, 'siteRequests'), (snap) => {
            setSiteRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as SiteRequest)));
        });

        const unsubClientReq = onSnapshot(collection(db, 'clientRequests'), (snap) => {
            setClientRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as ServiceRequest)));
        });

        const unsubTOR = onSnapshot(collection(db, 'timeOffRequests'), (snap) => {
            setTimeOffRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as TimeOffRequest)));
        });

        return () => {
            unsubWO();
            unsubTech();
            unsubProj();
            unsubLogs();
            unsubSite();
            unsubClientReq();
            unsubTOR();
        };
    }, []);

    // 2. Intelligence Derivation
    const highPriorityJobs = useMemo(() => 
        workOrders.filter(wo => wo.status === 'unassigned' && (wo.priority === 'critical' || wo.priority === 'high'))
    , [workOrders]);

    const workloadData = useMemo(() => 
        technicians
            .filter(t => !t.roles?.includes('client'))
            .map(tech => ({
                name: tech.name,
                assigned: workOrders.filter(wo => wo.assignedTechnicianId === tech.id && wo.status !== 'completed').length
            }))
            .sort((a, b) => b.assigned - a.assigned)
            .slice(0, 5)
    , [technicians, workOrders]);

    const pendingRequests = useMemo(() => {
        const tickets = clientRequests.filter(r => r.status === 'new');
        const sites = siteRequests.filter(s => s.status === 'pending');
        const timeOff = timeOffRequests.filter(t => t.status === 'pending');
        return {
            tickets,
            sites,
            timeOff,
            total: tickets.length + sites.length + timeOff.length
        };
    }, [clientRequests, siteRequests, timeOffRequests]);

    const availablePortals = useMemo(() => getAvailablePortals(currentUser), [currentUser]);
    const techPortal = useMemo(() => availablePortals.find(p => p.id === 'tech'), [availablePortals]);

    const handleSwapPortal = useCallback(() => {
        if (techPortal) router.push(techPortal.path);
    }, [router, techPortal]);

    return (
        <div className="animate-in fade-in duration-500 text-left">
            <header className="page-header">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <LayoutDashboard size={12} />
                        {TERMINOLOGY.PORTAL.ADMIN}
                    </p>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">
                        A real-time overview of global field service operations.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <NotificationBell />
                    {availablePortals.length > 1 && techPortal && (
                        <Button variant="outline" size="sm" className="h-8 text-[10px] uppercase font-bold tracking-widest border-border-main" onClick={handleSwapPortal}>
                            <MonitorUp size={12} className="mr-1.5 text-text-muted" />
                            Swap View
                        </Button>
                    )}
                </div>
            </header>

            <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-px overflow-hidden rounded-lg border border-border-default bg-border-default">
                <Link href="/admin/dispatch?subtab=unassigned">
                    <StatCard 
                        label={`Active ${TERMINOLOGY.ENTITIES.ASSIGNMENT}s`} 
                        value={workOrders.filter(wo => wo.status === 'assigned' || wo.status === 'in-progress' || wo.status === 'confirmed' || wo.status === 'on-my-way').length.toString()} 
                        delta={`${workOrders.filter(wo => wo.status === 'unassigned').length} unassigned`} 
                        deltaType="warning" 
                        icon="Wrench"
                    />
                </Link>
                <Link href="/admin/projects">
                    <StatCard 
                        label={`Active ${TERMINOLOGY.ENTITIES.PROJECT}s`} 
                        value={projects.filter(p => p.status === 'active').length.toString()} 
                        delta={`${projects.filter(p => p.status === 'on-hold').length} on hold`} 
                        deltaType="neutral"
                        icon="FolderKanban"
                    />
                </Link>
                <Link href="/admin/financials?tab=payroll">
                    <StatCard 
                        label="Pending Weeklogs" 
                        value={weeklyLogs.filter(l => l.status === 'Submitted').length.toString()} 
                        delta="Awaiting Audit" 
                        deltaType="warning"
                        icon="ClipboardList"
                    />
                </Link>
                <div className="cursor-pointer" onClick={() => setIsPendingDialogOpen(true)}>
                    <StatCard 
                        label="Global Requests" 
                        value={pendingRequests.total.toString()}
                        delta="Awaiting Action" 
                        deltaType="warning"
                        icon="Clock"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>High Priority Queue</CardTitle>
                            <CardDescription>Unassigned missions requiring immediate operative allocation.</CardDescription>
                        </CardHeader>
                        <CardContent className="table-wrap !border-none !rounded-none p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-bg-tertiary">
                                        <TableHead className="pl-6">Work Order</TableHead>
                                        <TableHead>Client</TableHead>
                                        <TableHead>Location</TableHead>
                                        <TableHead>Priority</TableHead>
                                        <TableHead className="text-right pr-6">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {highPriorityJobs.map(job => (
                                        <TableRow key={job.id} className="hover:bg-bg-tertiary transition-colors">
                                            <TableCell className="text-left pl-6">
                                                <div className="cell-id !mb-0">{(job.id || '').toUpperCase()}</div>
                                                <div className="text-[11px] text-text-secondary line-clamp-1 uppercase font-bold">{job.title || job.description}</div>
                                            </TableCell>
                                            <TableCell className="text-left text-xs font-bold uppercase text-text-muted">{job.clientName}</TableCell>
                                            <TableCell className="text-left text-xs font-bold uppercase">{job.location.split(',')[0]}</TableCell>
                                            <TableCell>
                                                <Badge variant={job.priority === 'critical' || job.priority === 'high' ? 'high' : 'medium'}>{job.priority}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <Button variant="default" size="sm" onClick={() => router.push('/admin/dispatch?tab=unassigned')} className="h-7 text-[10px]">Assign</Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {highPriorityJobs.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center h-32 text-xs font-bold uppercase text-text-muted italic opacity-40">
                                                High priority queue is clear.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3 text-left">
                            <CardTitle>Urgent Service Requests</CardTitle>
                            <CardDescription>Newest client intake tickets awaiting review.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {pendingRequests.tickets.slice(0, 3).map(req => (
                                <div key={req.id} className="p-3 rounded-lg bg-bg-secondary border border-border-sub flex items-center justify-between hover:border-brand-red transition-all cursor-pointer group" onClick={() => router.push('/admin/dispatch?tab=requests')}>
                                    <div className="text-left space-y-0.5">
                                        <p className="text-[10px] font-bold text-text-primary uppercase tracking-wide group-hover:text-brand-red">{req.clientName}</p>
                                        <p className="text-[9px] text-text-muted uppercase truncate max-w-[150px]">{req.description}</p>
                                    </div>
                                    <Badge variant={req.priority === 'critical' || req.priority === 'high' ? 'high' : 'medium'} className="text-[7px] h-3.5 px-1 uppercase">{req.priority}</Badge>
                                </div>
                            ))}
                            {pendingRequests.tickets.length === 0 && (
                                <div className="py-8 text-center border border-dashed border-border-sub rounded-lg opacity-40">
                                    <p className="text-[10px] font-bold uppercase text-text-muted">Funnel Clear</p>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="pt-0 border-t border-border-sub bg-bg-tertiary/20 p-4">
                            <Button variant="ghost" className="w-full text-[10px] uppercase font-bold tracking-widest h-8" onClick={() => router.push('/admin/dispatch?tab=requests')}>
                                View Full Intake Registry <ChevronRight size={12} className="ml-2" />
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
                <div className="space-y-6">
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>{TERMINOLOGY.ENTITIES.OPERATIVE} Workload</CardTitle>
                            <CardDescription>Top 5 operatives by active assignment density.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <WorkloadChart data={workloadData} />
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* GLOBAL REQUESTS AUDIT TERMINAL */}
            <Dialog open={isPendingDialogOpen} onOpenChange={setIsPendingDialogOpen}>
                <DialogContent className="sm:max-w-[800px] bg-bg-elevated border-border-default p-0 flex flex-col max-h-[90vh] shadow-2xl">
                    <DialogHeader className="p-6 border-b border-border-sub bg-bg-tertiary/30 text-left">
                        <div className="flex items-center gap-3">
                            <Clock className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest text-text-primary">Global Requests</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs uppercase font-bold text-text-muted">Consolidated audit terminal for unverified field signals and intake data.</DialogDescription>
                    </DialogHeader>

                    <Tabs defaultValue="tickets" className="flex-1 overflow-hidden flex flex-col">
                        <div className="px-6 border-b border-border-sub bg-bg-secondary/30">
                            <TabsList className="h-12 bg-transparent p-0 gap-8 justify-start">
                                <TabsTrigger value="tickets" className="tab-trigger-dashboard flex items-center gap-2">
                                    <ClipboardList size={14} /> Service Tickets <Badge variant="outline" className="h-4 px-1.5 text-[8px]">{pendingRequests.tickets.length}</Badge>
                                </TabsTrigger>
                                <TabsTrigger value="timeoff" className="tab-trigger-dashboard flex items-center gap-2">
                                    <Users size={14} /> Personnel Logs <Badge variant="outline" className="h-4 px-1.5 text-[8px]">{pendingRequests.timeOff.length}</Badge>
                                </TabsTrigger>
                                <TabsTrigger value="sites" className="tab-trigger-dashboard flex items-center gap-2">
                                    <MapPin size={14} /> Site Registry <Badge variant="outline" className="h-4 px-1.5 text-[8px]">{pendingRequests.sites.length}</Badge>
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <ScrollArea className="flex-1">
                            <div className="p-6">
                                <TabsContent value="tickets" className="m-0 space-y-3">
                                    {pendingRequests.tickets.map(req => (
                                        <div key={req.id} className="p-4 rounded-xl border border-border-sub bg-bg-secondary flex items-center justify-between group hover:border-text-muted transition-all">
                                            <div className="text-left space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-mono font-bold text-brand-red uppercase">{req.id}</span>
                                                    <Badge variant={req.priority === 'critical' || req.priority === 'high' ? 'high' : 'medium'} className="text-[7px] h-3.5 px-1 uppercase">{req.priority}</Badge>
                                                </div>
                                                <p className="text-xs font-bold text-text-primary uppercase truncate max-w-[400px]">{req.clientName} — {req.requestType}</p>
                                                <p className="text-[10px] text-text-muted font-medium uppercase tracking-widest">{req.location.split(',')[0]}</p>
                                            </div>
                                            <Button size="sm" variant="ghost" className="h-8 text-[9px] font-bold uppercase tracking-widest" onClick={() => { setIsPendingDialogOpen(false); router.push('/admin/dispatch?tab=requests'); }}>Audit detail</Button>
                                        </div>
                                    ))}
                                    {pendingRequests.tickets.length === 0 && <EmptyState icon={ClipboardList} label="Service funnel clear" />}
                                </TabsContent>

                                <TabsContent value="timeoff" className="m-0 space-y-3">
                                    {pendingRequests.timeOff.map(req => {
                                        const tech = technicians.find(t => t.id === req.technicianId);
                                        return (
                                            <div key={req.id} className="p-4 rounded-xl border border-border-sub bg-bg-secondary flex items-center justify-between">
                                                <div className="flex items-center gap-4 text-left">
                                                    <Avatar className="h-10 w-10 border border-border-sub">
                                                        <AvatarImage src={tech?.avatarUrl} />
                                                        <AvatarFallback>{(tech?.name || 'U').charAt(0)}</AvatarFallback>
                                                    </Avatar>
                                                    <div className="text-left">
                                                        <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{tech?.name}</p>
                                                        <p className="text-[9px] text-text-muted font-bold uppercase tracking-widest">{req.type} Request</p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <Calendar className="h-3 w-3 text-brand-red" />
                                                            <span className="text-[10px] font-mono font-bold">{req.startDate} — {req.endDate}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <Button size="sm" variant="ghost" className="h-8 text-[9px] font-bold uppercase tracking-widest" onClick={() => { setIsPendingDialogOpen(false); router.push('/admin/directory?tab=requests&subtab=personnel'); }}>Review Log</Button>
                                            </div>
                                        )
                                    })}
                                    {pendingRequests.timeOff.length === 0 && <EmptyState icon={Users} label="Personnel registry nominal" />}
                                </TabsContent>

                                <TabsContent value="sites" className="m-0 space-y-3">
                                    {pendingRequests.sites.map(req => (
                                        <div key={req.id} className="p-4 rounded-xl border border-border-sub bg-bg-secondary flex items-center justify-between">
                                            <div className="text-left space-y-1">
                                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{req.siteName}</p>
                                                <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">{req.clientName}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <MapPin className="h-3 w-3 text-brand-red" />
                                                    <span className="text-[10px] text-text-secondary truncate max-w-[300px] uppercase font-medium">{req.location}</span>
                                                </div>
                                            </div>
                                            <Button size="sm" variant="ghost" className="h-8 text-[9px] font-bold uppercase tracking-widest" onClick={() => { setIsPendingDialogOpen(false); router.push('/admin/directory?tab=requests&subtab=client'); }}>Verify Site</Button>
                                        </div>
                                    ))}
                                    {pendingRequests.sites.length === 0 && <EmptyState icon={MapPin} label="Site verifications complete" />}
                                </TabsContent>
                            </div>
                        </ScrollArea>
                    </Tabs>

                    <DialogFooter className="bg-bg-tertiary/30 p-6 border-t border-border-default">
                        <Button variant="outline" className="w-full h-11 uppercase font-bold text-[10px] tracking-widest" onClick={() => setIsPendingDialogOpen(false)}>Close Buffer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <style jsx global>{`
                .tab-trigger-dashboard {
                    @apply px-0 h-12 bg-transparent text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted rounded-none border-b-2 border-transparent transition-all;
                }
                .tab-trigger-dashboard[data-state="active"] {
                    @apply text-text-primary border-brand-red bg-transparent shadow-none;
                }
            `}</style>
        </div>
    );
}

function EmptyState({ icon: Icon, label }: { icon: any, label: string }) {
    return (
        <div className="py-24 text-center border-2 border-dashed border-border-sub rounded-xl opacity-40 bg-bg-secondary/30">
            <Icon size={48} className="mx-auto text-text-muted mb-2" />
            <p className="text-[10px] font-bold uppercase tracking-widest">{label}</p>
        </div>
    );
}
