'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  LayoutDashboard,
  MonitorUp,
  Wrench,
  FolderKanban,
  Clock,
} from 'lucide-react';
import { StatCard } from './components/stat-card';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { getAvailablePortals } from '@/lib/permissions';
import { useRouter } from 'next/navigation';
import { NotificationBell } from '@/components/notification-bell';
import { TERMINOLOGY } from '@/lib/constants';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query } from 'firebase/firestore';
import type { WorkOrder, Technician, Project, SiteRequest } from '@/lib/types';

// Performance: Code-splitting heavy chart library
const WorkloadChart = dynamic(() => import('./components/workload-chart').then(mod => mod.WorkloadChart), {
    loading: () => <div className="h-[250px] w-full bg-bg-tertiary animate-pulse rounded-lg" />,
    ssr: false
});

export default function DashboardPage() {
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [siteRequests, setSiteRequests] = useState<SiteRequest[]>([]);
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
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

        const unsubSite = onSnapshot(collection(db, 'siteRequests'), (snap) => {
            setSiteRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as SiteRequest)));
        });

        return () => {
            unsubWO();
            unsubTech();
            unsubProj();
            unsubSite();
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

    const pendingSitesCount = useMemo(() => 
        siteRequests.filter(sr => sr.status === 'pending').length
    , [siteRequests]);

    const availablePortals = useMemo(() => getAvailablePortals(currentUser), [currentUser]);
    const techPortal = useMemo(() => availablePortals.find(p => p.id === 'tech'), [availablePortals]);

    const handleSwapPortal = useCallback(() => {
        if (techPortal) router.push(techPortal.path);
    }, [router, techPortal]);

    return (
        <div className="animate-in fade-in duration-500">
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

            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-lg border border-border-default bg-border-default">
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
                <Link href="/admin/directory?tab=requests&subtab=client">
                    <StatCard 
                        label="Pending Site Registry" 
                        value={pendingSitesCount.toString()}
                        delta="Awaiting Audit" 
                        deltaType="warning"
                        icon="Clock"
                    />
                </Link>
                <Link href="/admin/reports?tab=flags">
                    <StatCard 
                        label="System Anomalies" 
                        value="2"
                        delta="Requires Attention" 
                        deltaType="negative"
                        icon="Clock"
                    />
                </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
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
                                                <Button variant="default" size="sm" onClick={() => router.push('/admin/dispatch?subtab=unassigned')} className="h-7 text-[10px]">Assign</Button>
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
                </div>
                <div>
                    <Card className="h-full">
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
        </div>
    );
}
