'use client';

import { useState, useEffect, useMemo } from 'react';
import { projects, serviceRequests, technicians, invoices, workOrders } from '@/lib/data';
import type { Project, ServiceRequest, Technician, Invoice } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
    LayoutDashboard, 
    Briefcase, 
    ClipboardList, 
    Plus, 
    MapPin,
    Calendar,
    ChevronRight,
    Coins,
    Activity,
    Clock,
    Mail,
    MessageSquare
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NotificationBell } from '@/components/notification-bell';

export default function ClientDashboardPage() {
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const router = useRouter();

    useEffect(() => {
        setMounted(true);
        setCurrentUserId(localStorage.getItem('currentUserId'));
    }, []);

    const currentUser = useMemo(() => 
        currentUserId ? technicians.find(t => t.id === currentUserId) : null
    , [currentUserId]);

    const myProjects = useMemo(() => {
        if (!currentUser?.clientCompany) return [];
        return projects.filter(p => p.client === currentUser.clientCompany);
    }, [currentUser]);

    const myRequests = useMemo(() => {
        if (!currentUser?.clientCompany) return [];
        return serviceRequests.filter(r => r.clientName === currentUser.clientCompany);
    }, [currentUser]);

    const outstandingBalance = useMemo(() => {
        if (!currentUser?.clientCompany) return 0;
        return invoices
            .filter(inv => inv.clientName === currentUser.clientCompany && inv.status !== 'paid' && inv.status !== 'void')
            .reduce((acc, inv) => acc + inv.total, 0);
    }, [currentUser]);

    const recentActivity = useMemo(() => {
        if (!currentUser?.clientCompany) return [];
        // Combined assignments for client sites
        return workOrders
            .filter(wo => wo.clientName === currentUser.clientCompany)
            .sort((a, b) => b.scheduleDate.localeCompare(a.scheduleDate))
            .slice(0, 5);
    }, [currentUser]);

    const formatDateStr = (dateStr: string) => {
        if (!dateStr) return 'TBD';
        try {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                const [month, day, year] = parts;
                return `${month}/${day}/${year}`;
            }
            return dateStr.replace(/-/g, '/');
        } catch (e) {
            return dateStr;
        }
    };

    if (!mounted || !currentUserId) return null;

    return (
        <div className="space-y-6">
            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <LayoutDashboard size={12} />
                        Low Voltage Site Pulse
                    </p>
                    <h1 className="page-title">Command Dashboard</h1>
                    <p className="page-subtitle">Real-time job tracking for {currentUser?.clientCompany}.</p>
                </div>
                <div className="page-header-right items-center">
                    <NotificationBell />
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-bg-secondary border-border-main">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                            <Briefcase size={12} className="text-brand-red"/> Active Projects
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-text-primary">{myProjects.filter(p => p.status === 'active').length}</p>
                    </CardContent>
                </Card>
                <Card className="bg-bg-secondary border-border-main">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                            <ClipboardList size={12} className="text-accent-gold"/> Open Tickets
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-text-primary">{myRequests.filter(r => r.status === 'new' || r.status === 'reviewed' || r.status === 'approved').length}</p>
                    </CardContent>
                </Card>
                <Card className="bg-bg-secondary border-border-main">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                            <Coins size={12} className="text-text-green"/> Outstanding A/R
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-mono font-bold text-text-green">${outstandingBalance.toLocaleString()}</p>
                    </CardContent>
                </Card>
                <Card className="bg-bg-secondary border-border-main">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                            <Activity size={12} className="text-brand-red"/> Live Sessions
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-text-primary">
                            {workOrders.filter(wo => wo.clientName === currentUser?.clientCompany && wo.status === 'in-progress').length}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>infrastructure Deployment Progress</CardTitle>
                            <CardDescription>Status tracking for your low voltage projects.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-border-sub">
                                {myProjects.map(project => (
                                    <Link key={project.id} href={`/client/projects`}>
                                        <div className="p-4 flex items-center justify-between hover:bg-bg-tertiary transition-colors group cursor-pointer">
                                            <div className="space-y-1">
                                                <p className="text-sm font-bold text-text-primary uppercase tracking-wide">{project.name}</p>
                                                <div className="flex items-center gap-3 text-[10px] text-text-muted font-bold">
                                                    <span className="flex items-center gap-1"><MapPin size={10}/> {project.location}</span>
                                                    <span className="flex items-center gap-1"><Calendar size={10}/> Started {formatDateStr(project.startDate)}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <Badge variant={project.status === 'active' ? 'active' : 'completed'} className="h-5 uppercase">
                                                    {project.status}
                                                </Badge>
                                                <ChevronRight size={16} className="text-text-muted group-hover:text-text-primary group-hover:translate-x-1 transition-all"/>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                                {myProjects.length === 0 && (
                                    <div className="p-12 text-center text-text-muted text-xs uppercase tracking-widest italic">No active projects found.</div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Field Activity Terminal</CardTitle>
                            <CardDescription>Latest field technician updates and job results.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-border-sub">
                                {recentActivity.map(activity => (
                                    <div key={activity.id} className="p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="p-2 bg-bg-tertiary rounded border border-border-sub text-text-muted">
                                                <Clock size={16} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{activity.description}</p>
                                                <p className="text-[9px] text-text-muted uppercase tracking-widest mt-0.5">{activity.location} • {formatDateStr(activity.scheduleDate)} • {activity.id.toUpperCase()}</p>
                                            </div>
                                        </div>
                                        <Badge variant={activity.status === 'completed' ? 'active' : activity.status === 'in-progress' ? 'inprogress' : 'scheduled'} className="uppercase h-5">
                                            {activity.status}
                                        </Badge>
                                    </div>
                                ))}
                                {recentActivity.length === 0 && (
                                    <div className="p-12 text-center text-text-muted text-xs uppercase tracking-widest italic">No recent jobs logged.</div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0">
                            <CardTitle>Recent Service Requests</CardTitle>
                            <Button variant="default" size="sm" className="h-7 text-[9px] uppercase font-bold" onClick={() => router.push('/client/tickets')}>
                                <Plus size={12} className="mr-1.5"/>
                                New Ticket
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-border-sub">
                                {myRequests.slice(0, 3).map(request => (
                                    <div key={request.id} className="p-3 flex flex-col gap-1.5 hover:bg-bg-tertiary transition-colors cursor-pointer" onClick={() => router.push('/client/tickets')}>
                                        <div className="flex justify-between items-start">
                                            <p className="text-[10px] font-bold text-text-primary uppercase tracking-wide line-clamp-1">{request.description}</p>
                                            <Badge variant={request.status === 'new' ? 'pending' : 'active'} className="text-[8px] h-4 uppercase">
                                                {request.status}
                                            </Badge>
                                        </div>
                                        <p className="text-[9px] text-text-muted uppercase tracking-widest">{request.requestType} • {formatDateStr(request.submittedDate)}</p>
                                    </div>
                                ))}
                                {myRequests.length === 0 && (
                                    <div className="p-8 text-center text-[9px] text-text-muted uppercase tracking-widest italic">No pending requests.</div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}