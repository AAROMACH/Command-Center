
'use client';

import { useClientPlan } from '@/components/client-plan-card';
import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { useClientInvoices } from '@/hooks/use-client-invoices';
import { useClientProjects, useClientJobs } from '@/hooks/use-client-data';
import type { Project, ServiceRequest, Technician, Invoice, WorkOrder } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { requestDate, formatRequestDate, requestKind } from '../_lib/requests';
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
import { jobDateTimeValue } from '@/lib/jobs';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const tooltipStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border-main)', borderRadius: 8, fontSize: 12 };

// Without a plan, requests are held to the standard 48-hour response.
const DEFAULT_RESPONSE_HOURS = 48;

export default function ClientDashboardPage() {
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [myRequests, setMyRequests] = useState<ServiceRequest[]>([]);
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

    // Projects, jobs (pool + dispatched) and sent invoices, via the shared
    // client hooks — each query is filtered the way the rules allow, so none
    // is rejected outright.
    const myProjects = useClientProjects(currentUser);
    const myWorkOrders = useClientJobs(currentUser);
    const myInvoices = useClientInvoices(currentUser);
    // Response target comes from the client's actual plan (was hard-coded by
    // plan id, with ids that didn't match the Plans page).
    const { plan: myPlan } = useClientPlan(currentUser);

    useEffect(() => {
        if (!currentUser?.id) return;
        let byId: ServiceRequest[] = [];
        let byCompany: ServiceRequest[] = [];
        const publish = () => {
            const m = new Map<string, ServiceRequest>();
            [...byId, ...byCompany].forEach(r => m.set(r.id, r));
            setMyRequests([...m.values()]);
        };
        const unsubs = [onSnapshot(
            query(collection(db, 'clientRequests'), where('clientId', '==', currentUser.id)),
            snap => { byId = snap.docs.map(d => ({ ...d.data(), id: d.id } as ServiceRequest)); publish(); }, () => {},
        )];
        if (currentUser.clientCompany) unsubs.push(onSnapshot(
            query(collection(db, 'clientRequests'), where('clientName', '==', currentUser.clientCompany)),
            snap => { byCompany = snap.docs.map(d => ({ ...d.data(), id: d.id } as ServiceRequest)); publish(); }, () => {},
        ));
        return () => unsubs.forEach(u => u());
    }, [currentUser?.id, currentUser?.clientCompany]);

    const slaData = useMemo(() => {
        if (!currentUser) return [];
        const slaLimit = myPlan?.benefits.responseHours || DEFAULT_RESPONSE_HOURS;
        const now = Date.now();
        return myRequests
            .filter(r => ['new', 'reviewed', 'pending_review'].includes(r.status as string))
            .map(r => {
                const submitted = requestDate(r);
                // No usable submit time → no countdown (was "NaNh remaining").
                if (!submitted) return { request: r, hoursRemaining: null, pct: 0, color: 'text-text-muted', bgColor: 'bg-border-main' };
                const hoursElapsed = Math.max(0, (now - submitted.getTime()) / (1000 * 60 * 60));
                const hoursRemaining = Math.max(0, slaLimit - hoursElapsed);
                const pct = Math.min(100, (hoursElapsed / slaLimit) * 100);
                const color = pct < 50 ? 'text-text-green' : pct < 80 ? 'text-accent-gold' : 'text-brand-red';
                const bgColor = pct < 50 ? 'bg-text-green' : pct < 80 ? 'bg-accent-gold' : 'bg-brand-red';
                return { request: r, hoursRemaining, pct, color, bgColor };
            });
    }, [currentUser, myRequests, myPlan]);

    const outstandingBalance = useMemo(() => {
        return myInvoices
            .filter(inv => inv.status !== 'paid' && inv.status !== 'void')
            .reduce((acc, inv) => acc + (inv.total || 0), 0);
    }, [myInvoices]);

    const recentActivity = useMemo(() => {
        return [...myWorkOrders]
            .sort((a, b) => jobDateTimeValue(b.scheduleDate, b.scheduleTime) - jobDateTimeValue(a.scheduleDate, a.scheduleTime))
            .slice(0, 5);
    }, [myWorkOrders]);

    const recentRequests = useMemo(() =>
        [...myRequests].sort((a, b) => (requestDate(b)?.getTime() ?? 0) - (requestDate(a)?.getTime() ?? 0)),
        [myRequests]);

    const requestsByMonth = useMemo(() => {
        const grouped: Record<string, number> = {};
        myRequests.forEach(r => {
            const d = requestDate(r);
            if (!d) return;
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            grouped[key] = (grouped[key] || 0) + 1;
        });
        return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).slice(-8)
            .map(([key, count]) => ({ month: `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(2, 4)}`, count }));
    }, [myRequests]);

    const invoicePie = useMemo(() => {
        const paid = myInvoices.filter(i => i.status === 'paid').length;
        const pending = myInvoices.filter(i => i.status === 'sent').length;
        const overdue = myInvoices.filter(i => i.status === 'overdue').length;
        return [
            { name: 'Paid', value: paid, color: 'var(--text-green)' },
            { name: 'Pending', value: pending, color: 'var(--accent-gold)' },
            { name: 'Overdue', value: overdue, color: 'var(--brand-red)' },
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
                <Skeleton className="h-16 w-64" />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
                <Skeleton className="h-64 rounded-xl" />
            </div>
        );
    }

    const chartCard = 'min-w-0 rounded-xl border border-border-main bg-bg-secondary p-4 shadow-sm';
    const chartTitle = 'mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted';
    const chartEmpty = (text: string) => (
        <div className="flex h-[160px] items-center justify-center"><p className="text-[12px] text-text-muted">{text}</p></div>
    );

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Client portal"
                icon={LayoutDashboard}
                title="Dashboard"
                subtitle={`Jobs, requests and invoices for ${currentUser?.clientCompany || currentUser?.name || 'your account'}.`}
                actions={<NotificationBell />}
            />

            {/* Response-time countdown for open requests */}
            {slaData.length > 0 && (
                <div className="space-y-2">
                    {slaData.map(item => (
                        <div key={item.request.id} className="flex items-center gap-3 rounded-xl border border-border-main bg-bg-secondary p-3 shadow-sm">
                            <Timer size={14} className={cn('shrink-0', item.color)} />
                            <div className="min-w-0 flex-1">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                    <p className="truncate text-[13px] font-medium text-text-primary">
                                        {requestKind(item.request)} · {item.request.description}
                                    </p>
                                    <span className={cn('ml-2 shrink-0 text-[12px] font-semibold', item.color)}>
                                        {item.hoursRemaining == null
                                            ? 'No target'
                                            : item.hoursRemaining > 0 ? `${Math.round(item.hoursRemaining)}h to respond` : 'Response due'}
                                    </span>
                                </div>
                                <div className="h-1 w-full rounded-full bg-bg-tertiary">
                                    <div className={cn('h-1 rounded-full transition-all', item.bgColor)} style={{ width: `${item.pct}%` }} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Active projects" icon={Briefcase} value={myProjects.filter(p => p.status === 'active').length} />
                <StatCard label="Open requests" icon={ClipboardList}
                    value={myRequests.filter(r => ['new', 'reviewed', 'pending_review', 'approved'].includes(r.status as string)).length} />
                <StatCard label="Balance due" icon={Coins} tone={outstandingBalance > 0 ? 'progress' : 'done'} value={`$${outstandingBalance.toLocaleString()}`} />
                <StatCard label="Jobs in progress" icon={Activity} value={myWorkOrders.filter(wo => wo.status === 'in-progress').length} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className={chartCard}>
                    <p className={chartTitle}><ClipboardList size={12} /> Requests per month</p>
                    {requestsByMonth.length > 0 ? (
                        <ChartContainer config={{ count: { label: 'Requests', color: 'var(--brand-red)' } } satisfies ChartConfig} className="aspect-auto h-[160px] w-full">
                            <BarChart data={requestsByMonth} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <Tooltip contentStyle={tooltipStyle} cursor={{ opacity: 0.1 }} />
                                <Bar dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} maxBarSize={40} name="Requests" />
                            </BarChart>
                        </ChartContainer>
                    ) : chartEmpty('No requests yet')}
                </div>
                <div className={chartCard}>
                    <p className={chartTitle}><Coins size={12} /> Invoice status</p>
                    {invoicePie.length > 0 ? (
                        <ChartContainer config={{ Paid: { label: 'Paid', color: 'var(--text-green)' }, Pending: { label: 'Pending', color: 'var(--accent-gold)' }, Overdue: { label: 'Overdue', color: 'var(--brand-red)' } } satisfies ChartConfig} className="aspect-auto h-[160px] w-full">
                            <PieChart>
                                <Pie data={invoicePie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} strokeWidth={0}>
                                    {invoicePie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                </Pie>
                                <Tooltip contentStyle={tooltipStyle} />
                            </PieChart>
                        </ChartContainer>
                    ) : chartEmpty('No invoices yet')}
                </div>
                <div className={chartCard}>
                    <p className={chartTitle}><Activity size={12} /> Project progress</p>
                    {projectProgress.length > 0 ? (
                        <ChartContainer config={{ pct: { label: 'Complete', color: 'var(--text-green)' } } satisfies ChartConfig} className="aspect-auto h-[160px] w-full">
                            <BarChart data={projectProgress} layout="vertical" margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
                                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                                <Tooltip contentStyle={tooltipStyle} cursor={{ opacity: 0.1 }} formatter={(v: number) => [`${v}%`, 'Complete']} />
                                <Bar dataKey="pct" fill="var(--color-pct)" radius={[0, 3, 3, 0]} maxBarSize={24} name="Complete" />
                            </BarChart>
                        </ChartContainer>
                    ) : chartEmpty('No projects yet')}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    <Card className="rounded-xl border-border-main bg-bg-secondary shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 text-left">
                            <div>
                                <CardTitle className="text-base font-semibold">Projects</CardTitle>
                                <CardDescription>Status of your current projects.</CardDescription>
                            </div>
                            <Button asChild variant="outline" size="sm">
                                <Link href="/client/projects">View all</Link>
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            {myProjects.length === 0 ? (
                                <div className="p-4 pt-0">
                                    <EmptyState compact icon={Briefcase} title="No projects yet" description="Contact Aaromach to start a new project." />
                                </div>
                            ) : (
                                <div className="divide-y divide-border-sub">
                                    {myProjects.map(project => (
                                        <Link key={project.id} href="/client/projects" className="group flex items-center justify-between p-4 text-left transition-colors hover:bg-bg-tertiary">
                                            <div className="mr-4 min-w-0 flex-1 space-y-1">
                                                <p className="truncate text-sm font-semibold text-text-primary">{project.name}</p>
                                                <div className="flex flex-wrap items-center gap-3 text-[12px] text-text-muted">
                                                    <span className="flex items-center gap-1.5">
                                                        <MapPin size={12} className="shrink-0" />
                                                        <span className="max-w-[160px] truncate">{project.location}</span>
                                                    </span>
                                                    <span className="flex items-center gap-1.5">
                                                        <Calendar size={12} />
                                                        {formatDateStr(project.startDate)}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-3">
                                                <StatusBadge kind="job" value={project.status === 'active' ? 'in-progress' : project.status} label={project.status ? project.status.charAt(0).toUpperCase() + project.status.slice(1) : undefined} />
                                                <ChevronRight size={16} className="hidden text-text-muted transition-all group-hover:translate-x-1 group-hover:text-text-primary sm:block" />
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="rounded-xl border-border-main bg-bg-secondary shadow-sm">
                        <CardHeader className="text-left">
                            <CardTitle className="text-base font-semibold">Recent jobs</CardTitle>
                            <CardDescription>Latest technician visits and results.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            {recentActivity.length === 0 ? (
                                <div className="p-4 pt-0">
                                    <EmptyState compact icon={Clock} title="No jobs yet" />
                                </div>
                            ) : (
                                <div className="divide-y divide-border-sub">
                                    {recentActivity.map(activity => (
                                        <div key={activity.id} className="flex items-center justify-between p-4 text-left">
                                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                                <div className="shrink-0 rounded-md border border-border-sub bg-bg-tertiary p-2 text-text-muted">
                                                    <Clock size={14} />
                                                </div>
                                                <div className="min-w-0 text-left">
                                                    <p className="truncate text-[13px] font-medium text-text-primary">{activity.description || activity.title}</p>
                                                    <p className="mt-0.5 truncate text-[12px] text-text-muted">
                                                        {activity.location} · {formatDateStr(activity.scheduleDate)}
                                                    </p>
                                                </div>
                                            </div>
                                            <StatusBadge kind="job" value={activity.status} className="ml-3 shrink-0" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="rounded-xl border-border-main bg-bg-secondary shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                            <CardTitle className="text-base font-semibold">Service requests</CardTitle>
                            <Button size="sm" onClick={() => router.push('/client/tickets')}>
                                <Plus size={14} className="mr-1.5" />
                                New
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            {recentRequests.length === 0 ? (
                                <div className="p-4 pt-0">
                                    <EmptyState compact icon={ClipboardList} title="No requests yet"
                                        action={<Button variant="outline" size="sm" onClick={() => router.push('/client/tickets')}>Submit a request</Button>} />
                                </div>
                            ) : (
                                <div className="divide-y divide-border-sub">
                                    {recentRequests.slice(0, 4).map(request => (
                                        <button
                                            type="button"
                                            key={request.id}
                                            className="flex w-full flex-col gap-1.5 p-3 text-left transition-colors hover:bg-bg-tertiary"
                                            onClick={() => router.push('/client/tickets')}
                                        >
                                            <div className="flex w-full items-start justify-between gap-2">
                                                <p className="line-clamp-1 flex-1 text-[13px] font-medium text-text-primary">{request.description}</p>
                                                <StatusBadge kind="request" value={request.status} className="shrink-0" />
                                            </div>
                                            <p className="text-[12px] text-text-muted">
                                                {requestKind(request)} · {formatRequestDate(request)}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {recentRequests.length > 4 && (
                                <div className="border-t border-border-sub p-3">
                                    <Button variant="ghost" size="sm" className="w-full" onClick={() => router.push('/client/tickets')}>
                                        View all {recentRequests.length} requests
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
