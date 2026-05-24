
'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import type { Project, ServiceRequest, Technician, Invoice, WorkOrder } from '@/lib/types';
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
import { technicians as mockTechs } from '@/lib/data';

export default function ClientDashboardPage() {
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [myProjects, setMyProjects] = useState<Project[]>([]);
    const [myRequests, setMyRequests] = useState<ServiceRequest[]>([]);
    const [myWorkOrders, setMyWorkOrders] = useState<WorkOrder[]>([]);
    const [myInvoices, setMyInvoices] = useState<Invoice[]>([]);
    const [mounted, setMounted] = useState(false);
    const router = useRouter();

    useEffect(() => {
        setMounted(true);
        const userId = localStorage.getItem('currentUserId');
        if (!userId) return;

        const unsubUser = onSnapshot(doc(db, 'users', userId), (d) => {
            if (d.exists()) {
                const userData = { ...d.data(), id: d.id } as Technician;
                setCurrentUser(userData);
                
                const clientName = userData.clientCompany || userData.name;

                const unsubProj = onSnapshot(query(collection(db, 'projects'), where('client', '==', clientName)), (snap) => {
                    setMyProjects(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project)));
                });

                const unsubReq = onSnapshot(query(collection(db, 'clientRequests'), where('clientName', '==', clientName)), (snap) => {
                    setMyRequests(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as ServiceRequest)));
                });

                const unsubWO = onSnapshot(query(collection(db, 'workOrders'), where('clientName', '==', clientName)), (snap) => {
                    setMyWorkOrders(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as WorkOrder)));
                });

                const unsubInv = onSnapshot(query(collection(db, 'invoices'), where('clientName', '==', clientName)), (snap) => {
                    setMyInvoices(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Invoice)));
                });

                return () => { unsubProj(); unsubReq(); unsubWO(); unsubInv(); };
            }
        });

        return () => unsubUser();
    }, []);

    const outstandingBalance = useMemo(() => {
        return myInvoices
            .filter(inv => inv.status !== 'paid' && inv.status !== 'void')
            .reduce((acc, inv) => acc + inv.total, 0);
    }, [myInvoices]);

    const recentActivity = useMemo(() => {
        return [...myWorkOrders]
            .sort((a, b) => (b.scheduleDate || '').localeCompare(a.scheduleDate || ''))
            .slice(0, 5);
    }, [myWorkOrders]);

    const formatDateStr = (dateStr: string) => {
        if (!dateStr) return 'TBD';
        try {
            return dateStr.replace(/-/g, '/');
        } catch (e) {
            return dateStr;
        }
    };

    if (!mounted) return null;

    return (
        <div className="space-y-6">
            <header className="page-header">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <LayoutDashboard size={12} />
                        Low Voltage Site Pulse
                    </p>
                    <h1 className="page-title">Command Dashboard</h1>
                    <p className="page-subtitle text-left">Real-time job tracking for {currentUser?.clientCompany || currentUser?.name}.</p>
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
                            {myWorkOrders.filter(wo => wo.status === 'in-progress').length}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>infrastructure Deployment Progress</CardTitle>
                            <CardDescription>Status tracking for your low voltage projects.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-border-sub">
                                {myProjects.map(project => (
                                    <Link key={project.id} href={`/client/projects`}>
                                        <div className="p-4 flex items-center justify-between hover:bg-bg-tertiary transition-colors group cursor-pointer text-left">
                                            <div className="space-y-1">
                                                <p className="text-sm font-bold text-text-primary uppercase tracking-wide">{project.name}</p>
                                                <div className="flex items-center gap-3 text-[10px] text-text-muted font-bold uppercase">
                                                    <span className="flex items-center gap-1.5"><MapPin size={10} className="text-brand-red"/> {project.location}</span>
                                                    <span className="flex items-center gap-1.5"><Calendar size={10}/> Started {formatDateStr(project.startDate)}</span>
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
                                    <div className="p-12 text-center text-text-muted text-xs uppercase tracking-widest italic">No active projects found in the registry.</div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>Field Activity Terminal</CardTitle>
                            <CardDescription>Latest field technician updates and job results.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-border-sub">
                                {recentActivity.map(activity => (
                                    <div key={activity.id} className="p-4 flex items-center justify-between text-left">
                                        <div className="flex items-center gap-4">
                                            <div className="p-2 bg-bg-tertiary rounded border border-border-sub text-text-muted">
                                                <Clock size={16} />
                                            </div>
                                            <div className="text-left">
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
                                    <div className="p-12 text-center text-text-muted text-xs uppercase tracking-widest italic">No recent field activity logged.</div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                            <CardTitle>Recent Service Requests</CardTitle>
                            <Button variant="default" size="sm" className="h-7 text-[9px] uppercase font-bold" onClick={() => router.push('/client/tickets')}>
                                <Plus size={12} className="mr-1.5"/>
                                New Ticket
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-border-sub">
                                {myRequests.slice(0, 3).map(request => (
                                    <div key={request.id} className="p-3 flex flex-col gap-1.5 hover:bg-bg-tertiary transition-colors cursor-pointer text-left" onClick={() => router.push('/client/tickets')}>
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
                                    <div className="p-8 text-center text-[9px] text-text-muted uppercase tracking-widest italic">No pending requests in the intake funnel.</div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
