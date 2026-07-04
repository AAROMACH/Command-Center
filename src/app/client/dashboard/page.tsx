
'use client';

import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import type { Project, ServiceRequest, Technician, Invoice, WorkOrder } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
    Timer,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NotificationBell } from '@/components/notification-bell';
import { cn } from '@/lib/utils';

const SLA_HOURS: Record<string, number> = {
    'on-call': 48,
    'site-partner': 24,
    'dedicated': 8,
};

export default function ClientDashboardPage() {
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [myProjects, setMyProjects] = useState<Project[]>([]);
    const [myRequests, setMyRequests] = useState<ServiceRequest[]>([]);
    const [myWorkOrders, setMyWorkOrders] = useState<WorkOrder[]>([]);
    const [myInvoices, setMyInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    // Effect 1: Fetch current user document
    useEffect(() => {
        const userId = sessionStorage.getItem('currentUserId');
        if (!userId) {
            router.push('/login');
            return;
        }

        const unsubUser = onSnapshot(doc(db, 'users', userId), (d) => {
            if (d.exists()) {
                setCurrentUser({ ...d.data(), id: d.id } as Technician);
            }
            setLoading(false);
        }, () => {
            setLoading(false);
        });

        return () => unsubUser();
    }, [router]);

    // Effect 2: Set up data listeners once user is known — properly cleaned up on unmount
    useEffect(() => {
        if (!currentUser) return;

        const clientName = currentUser.clientCompany || currentUser.name;
        if (!clientName) return;

        const unsubProj = onSnapshot(
            query(collection(db, 'projects'), where('client', '==', clientName)),
            (snap) => setMyProjects(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project)))
        );

        const unsubReq = onSnapshot(
            query(collection(db, 'clientRequests'), where('clientName', '==', clientName)),
            (snap) => setMyRequests(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as ServiceRequest)))
        );

        const unsubWO = onSnapshot(
            query(collection(db, 'workOrders'), where('clientName', '==', clientName)),
            (snap) => setMyWorkOrders(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as WorkOrder)))
        );

        const unsubInv = onSnapshot(
            query(collection(db, 'invoices'), where('clientName', '==', clientName)),
            (snap) => setMyInvoices(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Invoice)))
        );

        return () => {
            unsubProj();
            unsubReq();
            unsubWO();
            unsubInv();
        };
    }, [currentUser?.id, currentUser?.clientCompany, currentUser?.name]);

    const slaData = useMemo(() => {
        if (!currentUser) return [];
        const slaLimit = SLA_HOURS[currentUser.planId || ''] ?? 48;
        return myRequests
            .filter(r => r.status === 'new' || r.status === 'reviewed')
            .map(r => {
                try {
                    const submitted = new Date(r.submittedDate);
                    const now = new Date();
                    const hoursElapsed = (now.getTime() - submitted.getTime()) / (1000 * 60 * 60);
                    const hoursRemaining = Math.max(0, slaLimit - hoursElapsed);
                    const pct = Math.min(100, (hoursElapsed / slaLimit) * 100);
                    const color = pct < 50 ? 'text-text-green' : pct < 80 ? 'text-accent-gold' : 'text-brand-red';
                    const bgColor = pct < 50 ? 'bg-text-green' : pct < 80 ? 'bg-accent-gold' : 'bg-brand-red';
                    return { request: r, hoursRemaining, pct, color, bgColor };
                } catch { return null; }
            })
            .filter(Boolean) as { request: typeof myRequests[0]; hoursRemaining: number; pct: number; color: string; bgColor: string }[];
    }, [currentUser, myRequests]);

    const outstandingBalance = useMemo(() => {
        return myInvoices
            .filter(inv => inv.status !== 'paid' && inv.status !== 'void')
            .reduce((acc, inv) => acc + (inv.total || 0), 0);
    }, [myInvoices]);

    const recentActivity = useMemo(() => {
        return [...myWorkOrders]
            .sort((a, b) => (b.scheduleDate || '').localeCompare(a.scheduleDate || ''))
            .slice(0, 5);
    }, [myWorkOrders]);

    const requestsByMonth = useMemo(() => {
        const grouped: Record<string, number> = {};
        myRequests.forEach(r => {
            try {
                const month = (r.submittedDate || '').slice(0, 7);
                if (month) grouped[month] = (grouped[month] || 0) + 1;
            } catch {}
        });
        return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).slice(-8)
            .map(([month, count]) => ({ month: month.slice(5), count }));
    }, [myRequests]);

    const invoicePie = useMemo(() => {
        const paid = myInvoices.filter(i => i.status === 'paid').length;
        const pending = myInvoices.filter(i => i.status === 'pending' || i.status === 'sent').length;
        const overdue = myInvoices.filter(i => i.status === 'overdue').length;
        return [
            { name: 'Paid', value: paid, color: '#1f8a55' },
            { name: 'Pending', value: pending, color: '#C89B3C' },
            { name: 'Overdue', value: overdue, color: '#CC2200' },
        ].filter(d => d.value > 0);
    }, [myInvoices]);

    const projectProgress = useMemo(() =>
        myProjects.slice(0, 5).map(p => {
            const allTasks = (p.phases || []).flatMap((ph: any) => ph.tasks || []);
            const completed = allTasks.filter((t: any) => t.isCompleted).length;
            const total = allTasks.length;
            return { name: (p.name || 'Project').slice(0, 18), pct: total > 0 ? Math.round((completed / total) * 100) : 0 };
        }),
        [myProjects]
    );

    const formatDateStr = (dateStr: string) => {
        if (!dateStr) return 'TBD';
        return dateStr.replace(/-/g, '/');
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="page-header">
                    <Skeleton className="h-20 w-64" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
                </div>
                <Skeleton className="h-64 rounded-lg" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <header className="page-header">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <LayoutDashboard size={12} />
                        Client Portal
                    </p>
                    <h1 className="page-title">Command Dashboard</h1>
                    <p className="page-subtitle text-left">
                        Real-time job tracking for {currentUser?.clientCompany || currentUser?.name || 'your account'}.
                    </p>
                </div>
                <div className="page-header-right items-center">
                    <NotificationBell />
                </div>
            </header>

            {/* SLA Countdown Strip */}
            {slaData.length > 0 && (
                <div className="space-y-2">
                    {slaData.map(item => (
                        <div key={item.request.id} className="flex items-center gap-3 p-3 rounded-lg bg-bg-secondary border border-border-sub">
                            <Timer size={14} className={item.color} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                    <p className="text-[10px] font-bold text-text-primary uppercase tracking-widest truncate">{item.request.requestType} · {item.request.description}</p>
                                    <span className={cn("text-[10px] font-black uppercase shrink-0 ml-2", item.color)}>{Math.round(item.hoursRemaining)}h remaining</span>
                                </div>
                                <div className="w-full bg-bg-tertiary rounded-full h-1">
                                    <div className={cn("h-1 rounded-full transition-all", item.bgColor)} style={{ width: `${item.pct}%` }} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-bg-secondary border-border-main">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                            <Briefcase size={12} className="text-brand-red" /> Active Projects
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-text-primary">{myProjects.filter(p => p.status === 'active').length}</p>
                    </CardContent>
                </Card>
                <Card className="bg-bg-secondary border-border-main">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                            <ClipboardList size={12} className="text-accent-gold" /> Open Tickets
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-text-primary">
                            {myRequests.filter(r => r.status === 'new' || r.status === 'reviewed' || r.status === 'approved').length}
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-bg-secondary border-border-main">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                            <Coins size={12} className="text-text-green" /> Outstanding A/R
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-mono font-bold text-text-green">${outstandingBalance.toLocaleString()}</p>
                    </CardContent>
                </Card>
                <Card className="bg-bg-secondary border-border-main">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                            <Activity size={12} className="text-brand-red" /> Live Sessions
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-text-primary">
                            {myWorkOrders.filter(wo => wo.status === 'in-progress').length}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Analytics Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-bg-secondary border border-border-main rounded-xl p-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted mb-3 flex items-center gap-1.5"><ClipboardList size={10} className="text-brand-red" /> Requests / Month</p>
                    {requestsByMonth.length > 0 ? (
                        <ResponsiveContainer width="100%" height={160}>
                            <BarChart data={requestsByMonth} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                                <XAxis dataKey="month" tick={{ fontSize: 8, fill: '#525252' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 8, fill: '#525252' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-main)', borderRadius: 8, fontSize: 10 }} cursor={{ fill: 'rgba(204,34,0,0.08)' }} />
                                <Bar dataKey="count" fill="#CC2200" radius={[3, 3, 0, 0]} name="Requests" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[160px] flex items-center justify-center"><p className="text-[9px] text-text-muted uppercase opacity-40">No requests yet</p></div>
                    )}
                </div>
                <div className="bg-bg-secondary border border-border-main rounded-xl p-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted mb-3 flex items-center gap-1.5"><Coins size={10} className="text-brand-red" /> Invoice Status</p>
                    {invoicePie.length > 0 ? (
                        <ResponsiveContainer width="100%" height={160}>
                            <PieChart>
                                <Pie data={invoicePie} dataKey="value" cx="50%" cy="50%" outerRadius={60} strokeWidth={0}>
                                    {invoicePie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                </Pie>
                                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-main)', borderRadius: 8, fontSize: 10 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[160px] flex items-center justify-center"><p className="text-[9px] text-text-muted uppercase opacity-40">No invoices yet</p></div>
                    )}
                </div>
                <div className="bg-bg-secondary border border-border-main rounded-xl p-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted mb-3 flex items-center gap-1.5"><Activity size={10} className="text-brand-red" /> Project Progress</p>
                    {projectProgress.length > 0 ? (
                        <ResponsiveContainer width="100%" height={160}>
                            <BarChart data={projectProgress} layout="vertical" margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
                                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 8, fill: '#525252' }} axisLine={false} tickLine={false} unit="%" />
                                <YAxis type="category" dataKey="name" tick={{ fontSize: 8, fill: '#525252' }} axisLine={false} tickLine={false} width={70} />
                                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-main)', borderRadius: 8, fontSize: 10 }} formatter={(v: number) => [`${v}%`, 'Complete']} />
                                <Bar dataKey="pct" fill="#1f8a55" radius={[0, 3, 3, 0]} name="% Complete" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[160px] flex items-center justify-center"><p className="text-[9px] text-text-muted uppercase opacity-40">No projects yet</p></div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    {/* Projects Table */}
                    <Card>
                        <CardHeader className="text-left flex flex-row items-center justify-between space-y-0">
                            <div>
                                <CardTitle>Infrastructure Deployment</CardTitle>
                                <CardDescription>Status tracking for your low voltage projects.</CardDescription>
                            </div>
                            <Link href="/client/projects">
                                <Button variant="outline" size="sm" className="h-7 text-[9px] uppercase font-bold">
                                    View All
                                </Button>
                            </Link>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-border-sub">
                                {myProjects.length === 0 ? (
                                    <div className="p-12 text-center space-y-2">
                                        <Briefcase size={24} className="mx-auto text-text-muted opacity-40" />
                                        <p className="text-xs text-text-muted uppercase tracking-widest">No active projects.</p>
                                        <p className="text-[10px] text-text-muted">Contact Aaromach to start a new project.</p>
                                    </div>
                                ) : (
                                    myProjects.map(project => (
                                        <Link key={project.id} href="/client/projects">
                                            <div className="p-4 flex items-center justify-between hover:bg-bg-tertiary transition-colors group cursor-pointer text-left">
                                                <div className="space-y-1 min-w-0 flex-1 mr-4">
                                                    <p className="text-sm font-bold text-text-primary uppercase tracking-wide truncate">{project.name}</p>
                                                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-text-muted font-bold uppercase">
                                                        <span className="flex items-center gap-1.5">
                                                            <MapPin size={10} className="text-brand-red flex-shrink-0" />
                                                            <span className="truncate max-w-[120px]">{project.location}</span>
                                                        </span>
                                                        <span className="flex items-center gap-1.5">
                                                            <Calendar size={10} />
                                                            {formatDateStr(project.startDate)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3 flex-shrink-0">
                                                    <Badge variant={project.status === 'active' ? 'active' : 'completed'} className="h-5 uppercase">
                                                        {project.status}
                                                    </Badge>
                                                    <ChevronRight size={16} className="text-text-muted group-hover:text-text-primary group-hover:translate-x-1 transition-all hidden sm:block" />
                                                </div>
                                            </div>
                                        </Link>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Recent Field Activity */}
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>Field Activity</CardTitle>
                            <CardDescription>Latest technician updates and job results.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-border-sub">
                                {recentActivity.length === 0 ? (
                                    <div className="p-12 text-center space-y-2">
                                        <Clock size={24} className="mx-auto text-text-muted opacity-40" />
                                        <p className="text-xs text-text-muted uppercase tracking-widest">No recent field activity.</p>
                                    </div>
                                ) : (
                                    recentActivity.map(activity => (
                                        <div key={activity.id} className="p-4 flex items-center justify-between text-left">
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <div className="p-2 bg-bg-tertiary rounded border border-border-sub text-text-muted flex-shrink-0">
                                                    <Clock size={14} />
                                                </div>
                                                <div className="text-left min-w-0">
                                                    <p className="text-xs font-bold text-text-primary uppercase tracking-wide truncate">{activity.description || activity.title}</p>
                                                    <p className="text-[9px] text-text-muted uppercase tracking-widest mt-0.5 truncate">
                                                        {activity.location} · {formatDateStr(activity.scheduleDate)}
                                                    </p>
                                                </div>
                                            </div>
                                            <Badge
                                                variant={activity.status === 'completed' ? 'active' : activity.status === 'in-progress' ? 'inprogress' : 'scheduled'}
                                                className="uppercase h-5 flex-shrink-0 ml-3"
                                            >
                                                {activity.status}
                                            </Badge>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                            <CardTitle>Service Requests</CardTitle>
                            <Button variant="default" size="sm" className="h-7 text-[9px] uppercase font-bold" onClick={() => router.push('/client/tickets')}>
                                <Plus size={12} className="mr-1.5" />
                                New
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-border-sub">
                                {myRequests.length === 0 ? (
                                    <div className="p-8 text-center space-y-2">
                                        <ClipboardList size={20} className="mx-auto text-text-muted opacity-40" />
                                        <p className="text-[10px] text-text-muted uppercase tracking-widest">No pending requests.</p>
                                        <Button variant="outline" size="sm" className="h-7 text-[9px] uppercase font-bold mt-2" onClick={() => router.push('/client/tickets')}>
                                            Submit a Ticket
                                        </Button>
                                    </div>
                                ) : (
                                    myRequests.slice(0, 4).map(request => (
                                        <div
                                            key={request.id}
                                            className="p-3 flex flex-col gap-1.5 hover:bg-bg-tertiary transition-colors cursor-pointer text-left"
                                            onClick={() => router.push('/client/tickets')}
                                        >
                                            <div className="flex justify-between items-start gap-2">
                                                <p className="text-[10px] font-bold text-text-primary uppercase tracking-wide line-clamp-1 flex-1">
                                                    {request.description}
                                                </p>
                                                <Badge variant={request.status === 'new' ? 'pending' : 'active'} className="text-[8px] h-4 uppercase flex-shrink-0">
                                                    {request.status}
                                                </Badge>
                                            </div>
                                            <p className="text-[9px] text-text-muted uppercase tracking-widest">
                                                {request.requestType} · {formatDateStr(request.submittedDate)}
                                            </p>
                                        </div>
                                    ))
                                )}
                            </div>
                            {myRequests.length > 4 && (
                                <div className="p-3 border-t border-border-sub">
                                    <Button variant="ghost" size="sm" className="w-full h-7 text-[9px] uppercase font-bold" onClick={() => router.push('/client/tickets')}>
                                        View All {myRequests.length} Requests
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
