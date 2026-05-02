'use client';

import { useState, useEffect, useMemo } from 'react';
import type { WorkOrder, Technician, WeeklyLog } from '@/lib/types';
import { workOrders, technicians, weeklyLogs } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  MapPin, 
  Clock, 
  AlertTriangle, 
  ArrowRight, 
  Calendar as CalendarIcon,
  Play,
  ClipboardList,
  Receipt,
  Eye,
  LogOut,
  StickyNote,
  Camera,
  Coins,
  ChevronRight
} from 'lucide-react';
import { ScheduleBox } from './components/schedule-box';
import { format, isSameDay, parseISO } from 'date-fns';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

export default function TechDashboardPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);
    }, []);

    const tech = useMemo(() => 
        mounted && currentTechId ? technicians.find(t => t.id === currentTechId) : null, 
    [currentTechId, mounted]);

    const techWorkOrders = useMemo(() => 
        mounted && currentTechId ? workOrders.filter(wo => wo.assignedTechnicianId === currentTechId) : [],
    [currentTechId, mounted]);
    
    const todaysWorkOrders = useMemo(() => 
        techWorkOrders.filter(wo => isSameDay(parseISO(wo.scheduleDate), new Date())),
    [techWorkOrders]);

    const activeJob = useMemo(() => 
        todaysWorkOrders.find(wo => wo.status === 'in-progress'),
    [todaysWorkOrders]);

    const nextAction = useMemo(() => {
        if (activeJob) return null;
        return todaysWorkOrders
            .filter(wo => wo.status === 'assigned')
            .sort((a, b) => a.scheduleTime.localeCompare(b.scheduleTime))[0];
    }, [todaysWorkOrders, activeJob]);

    const criticalAlerts = useMemo(() => {
        if (!mounted || !currentTechId) return [];
        const alerts = [];
        
        const unacknowledged = techWorkOrders.filter(wo => wo.status === 'assigned' && !wo.isAcknowledged);
        if (unacknowledged.length > 0) {
            alerts.push({ id: 'unack', type: 'critical', text: `${unacknowledged.length} Unacknowledged Job(s)`, icon: AlertTriangle });
        }

        const pendingLogs = weeklyLogs.filter(log => log.technicianId === currentTechId && log.status === 'Draft');
        if (pendingLogs.length > 0) {
            alerts.push({ id: 'logs', type: 'warning', text: `${pendingLogs.length} Missing Weekly Manifests`, icon: ClipboardList });
        }

        return alerts;
    }, [techWorkOrders, currentTechId, mounted]);

    const summary = useMemo(() => ({
        totalJobs: todaysWorkOrders.length,
        remainingJobs: todaysWorkOrders.filter(wo => wo.status !== 'completed').length,
        expectedHours: (todaysWorkOrders.length * 1.5).toFixed(1)
    }), [todaysWorkOrders]);

    const thisWeekEarnings = 1450.75;

    if (!mounted || !currentTechId || !tech) {
        return <div className="p-8 text-center uppercase tracking-widest text-text-muted text-xs">Initializing Terminal...</div>;
    }

    return (
        <div className="space-y-6">
            {criticalAlerts.length > 0 && (
                <div className="space-y-2">
                    {criticalAlerts.map(alert => (
                        <Alert key={alert.id} variant={alert.type === 'critical' ? 'destructive' : 'default'} className="bg-bg-secondary border-l-4 border-l-brand-red">
                            <alert.icon className="h-4 w-4" />
                            <div className="flex w-full items-center justify-between">
                                <div>
                                    <AlertTitle className="text-xs font-bold uppercase tracking-wider">{alert.text}</AlertTitle>
                                    <AlertDescription className="text-[10px] text-text-muted">Requires immediate technician attention.</AlertDescription>
                                </div>
                                <Button size="sm" variant="outline" className="h-7 text-[9px]">Fix Now</Button>
                            </div>
                        </Alert>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    {!activeJob && (
                        <Card className="border-2 border-brand-red bg-brand-red-dim/5">
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <div className="page-eyebrow text-brand-red">Next Assignment Phase</div>
                                    <Badge variant="high">Priority Task</Badge>
                                </div>
                                <CardTitle className="text-2xl mt-1">{nextAction ? nextAction.description : 'No Upcoming Jobs'}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {nextAction ? (
                                    <div className="space-y-6">
                                        <div className="flex flex-wrap gap-6">
                                            <div className="flex items-center gap-2">
                                                <div className="p-2 bg-bg-primary rounded-md"><Clock size={16} className="text-accent-gold"/></div>
                                                <div>
                                                    <p className="text-[10px] uppercase font-bold text-text-muted">Schedule Window</p>
                                                    <p className="text-sm font-semibold">{nextAction.scheduleTime}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="p-2 bg-bg-primary rounded-md"><MapPin size={16} className="text-brand-red"/></div>
                                                <div>
                                                    <p className="text-[10px] uppercase font-bold text-text-muted">Site Location</p>
                                                    <p className="text-sm font-semibold">{nextAction.location}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            <Button className="flex-1 h-12 gap-2 text-sm" onClick={() => toast({ title: "Job Started", description: "GPS track initiated."})}>
                                                <Play size={16} fill="currentColor"/> START JOB
                                            </Button>
                                            <Button variant="outline" className="h-12 px-6" asChild>
                                                <Link href={`/tech/assignments`}>
                                                    <Eye size={16} className="mr-2"/> VIEW DETAILS
                                                </Link>
                                            </Button>
                                            <Button variant="secondary" className="h-12 px-6">ACKNOWLEDGE</Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-8 text-center border border-dashed border-border-main rounded-md">
                                        <p className="text-sm text-text-muted italic">Schedule terminal clear. Awaiting further dispatch.</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {activeJob && (
                        <Card className="border-2 border-text-green bg-green-dim/10">
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="h-2 w-2 rounded-full bg-text-green animate-pulse"/>
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-text-green">Live Engagement</span>
                                    </div>
                                    <Badge variant="active">On-Site</Badge>
                                </div>
                                <CardTitle className="text-2xl mt-1">{activeJob.description}</CardTitle>
                                <CardDescription className="flex items-center gap-1.5"><MapPin size={14}/> {activeJob.location}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                                    <div className="space-y-4">
                                        <div className="flex gap-8">
                                            <div>
                                                <p className="text-[10px] uppercase font-bold text-text-muted">Checked In</p>
                                                <p className="text-lg font-mono text-text-green">{activeJob.scheduleTime}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] uppercase font-bold text-text-muted">Duration</p>
                                                <p className="text-lg font-mono">01:42:15</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" className="h-9 gap-2"><StickyNote size={14}/> Add Notes</Button>
                                            <Button variant="outline" size="sm" className="h-9 gap-2"><Camera size={14}/> Upload Photo</Button>
                                        </div>
                                    </div>
                                    <Button variant="destructive" className="h-12 gap-2 text-sm" onClick={() => toast({ title: "Checked Out", description: "Assignment finalized."})}>
                                        <LogOut size={16}/> CHECK OUT / FINALIZE
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border-main border border-border-main rounded-lg overflow-hidden">
                        <div className="bg-bg-secondary p-4">
                            <p className="text-[10px] uppercase font-bold text-text-muted mb-1">Jobs Today</p>
                            <p className="text-2xl font-bold">{summary.totalJobs}</p>
                        </div>
                        <div className="bg-bg-secondary p-4">
                            <p className="text-[10px] uppercase font-bold text-text-muted mb-1">Remaining</p>
                            <p className="text-2xl font-bold text-brand-red">{summary.remainingJobs}</p>
                        </div>
                        <div className="bg-bg-secondary p-4">
                            <p className="text-[10px] uppercase font-bold text-text-muted mb-1">Expected Hours</p>
                            <p className="text-2xl font-bold">{summary.expectedHours}h</p>
                        </div>
                        <div className="bg-bg-secondary p-4">
                            <p className="text-[10px] uppercase font-bold text-text-muted mb-1">Site Reliability</p>
                            <p className="text-2xl font-bold text-text-green">{tech.reliabilityScore}%</p>
                        </div>
                    </div>

                    <div className="opacity-80 grayscale-[0.5] hover:grayscale-0 hover:opacity-100 transition-all">
                        <ScheduleBox workOrders={techWorkOrders} />
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted mb-3 ml-1">Quick Actions</p>
                        <div className="grid grid-cols-1 gap-2">
                             <Button variant="outline" className="justify-between !h-12 !px-4 !bg-bg-secondary border-border-main hover:!border-brand-red group" asChild>
                                <Link href="/tech/assignments">
                                    <div className="flex items-center gap-3">
                                        <Play size={16} className="text-brand-red"/>
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Start Next Job</span>
                                    </div>
                                    <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity"/>
                                </Link>
                            </Button>
                             <Button variant="outline" className="justify-between !h-12 !px-4 !bg-bg-secondary border-border-main hover:!border-brand-red group" asChild>
                                <Link href="/tech/logs">
                                    <div className="flex items-center gap-3">
                                        <ClipboardList size={16} className="text-accent-gold"/>
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Submit Weekly Log</span>
                                    </div>
                                    <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity"/>
                                </Link>
                            </Button>
                             <Button variant="outline" className="justify-between !h-12 !px-4 !bg-bg-secondary border-border-main hover:!border-brand-red group">
                                <div className="flex items-center gap-3">
                                    <Receipt size={16} className="text-text-muted"/>
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Upload Receipt</span>
                                </div>
                                <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity"/>
                            </Button>
                             <Button variant="outline" className="justify-between !h-12 !px-4 !bg-bg-secondary border-border-main hover:!border-brand-red group" asChild>
                                <Link href="/tech/assignments">
                                    <div className="flex items-center gap-3">
                                        <ArrowRight size={16} className="text-text-muted"/>
                                        <span className="text-[10px] font-bold uppercase tracking-widest">All Assignments</span>
                                    </div>
                                    <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity"/>
                                </Link>
                            </Button>
                        </div>
                    </div>

                    <Card className="bg-bg-tertiary border-border-subtle">
                        <CardHeader className="pb-2">
                             <CardTitle className="text-[10px] tracking-[0.15em] uppercase text-text-muted flex items-center justify-between">
                                Payroll Snapshot
                                <Coins size={14} className="text-text-green"/>
                             </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-3xl font-bold text-text-green font-mono tracking-tight">${thisWeekEarnings.toFixed(2)}</p>
                                    <p className="text-[9px] uppercase font-bold text-text-muted tracking-widest mt-1">Pending This Period</p>
                                </div>
                                <div className="pt-4 border-t border-border-main">
                                    <Button variant="link" className="p-0 h-auto text-[10px] uppercase font-bold text-brand-red" asChild>
                                        <Link href="/tech/earnings">View Full Ledger <ArrowRight size={10} className="ml-1.5"/></Link>
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}