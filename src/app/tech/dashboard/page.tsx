'use client';
import { useState, useEffect } from 'react';
import type { WorkOrder, Technician, PenaltyEvent } from '@/lib/types';
import { workOrders, technicians, penaltyEvents, weeklyLogs } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Bell, AlertTriangle, Calendar, Clock, MapPin, Gauge, ScrollText, CheckCircle2, LayoutDashboard, Wrench } from 'lucide-react';
import { ScheduleBox } from './components/schedule-box';


export default function TechDashboardPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);
    }, []);

    const today = new Date('2024-07-28T12:00:00Z');
    const todayStr = today.toISOString().split('T')[0];

    const tech = technicians.find(t => t.id === currentTechId);

    const techWorkOrders = workOrders.filter(wo => wo.assignedTechnicianId === currentTechId);
    
    const todaysAssignments = techWorkOrders.filter(wo => wo.scheduleDate === todayStr);

    const activeSession = todaysAssignments.find(wo => wo.status === 'in-progress');

    const upcomingAssignments = techWorkOrders.filter(wo => {
      const woDate = new Date(wo.scheduleDate);
      const diffDays = (woDate.getTime() - today.getTime()) / (1000 * 3600 * 24);
      return diffDays > 0 && diffDays <= 7;
    });

    const reliabilityScore = tech?.reliabilityScore || 0;
    const reliabilityColor = reliabilityScore > 90 ? 'text-text-green' : reliabilityScore > 80 ? 'text-accent-gold' : 'text-text-red';
    
    const pendingLogAlerts = currentTechId ? weeklyLogs.filter(log => log.technicianId === currentTechId && log.status === 'Draft').length : 0;
    const unreadNotifications = 3;

    if (!mounted || !currentTechId || !tech) {
        return <div className="p-8 text-center uppercase tracking-widest text-text-muted text-xs">Initializing Terminal...</div>;
    }

    return (
        <div>
            {activeSession && (
                <div className="session-banner">
                    <div className="flex items-center gap-2.5">
                        <div className="session-dot"></div>
                        <span className="session-label">Active Session</span>
                        <span className="session-detail">{activeSession.id.toUpperCase()} — {activeSession.description}</span>
                    </div>
                    <span className="session-time">Since {format(new Date(), 'h:mm a')}</span>
                </div>
            )}

            <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <LayoutDashboard size={12} />
                        Mission Command
                    </p>
                    <h1 className="page-title">OPERATIONS OVERVIEW</h1>
                    <p className="page-subtitle">Welcome back, {tech?.name}. Monitoring active engagements.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column - Tactical Intel */}
                <div className="lg:col-span-2 space-y-6">
                    <ScheduleBox workOrders={techWorkOrders} />

                     <div>
                        <h2 className="text-xs font-bold uppercase tracking-widest text-text-muted mb-3 flex items-center gap-2">
                            <Bell size={14} className="text-brand-red" />
                            Next Engagement Window
                        </h2>
                        <div className="table-wrap">
                            <table className="tbl">
                                <tbody>
                                    {upcomingAssignments.slice(0, 4).map(wo => (
                                         <tr key={wo.id}>
                                            <td className="!py-3">
                                                <span className="font-bold text-text-primary uppercase text-[10px] tracking-widest">{new Date(wo.scheduleDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric'})}</span>
                                            </td>
                                            <td className="!py-3">
                                                <div className="font-bold text-text-primary text-[11px] uppercase">{wo.description}</div>
                                                <div className="text-[10px] text-text-muted">{wo.clientName}</div>
                                            </td>
                                            <td className="!py-3">
                                                 <div className="flex items-center gap-1.5 text-[10px] text-text-secondary uppercase"><MapPin size={12} className="text-brand-red"/>{wo.location.split(',')[0]}</div>
                                            </td>
                                            <td className="!py-3 text-right">
                                                 <Badge variant="scheduled" className="text-[9px]">{wo.scheduleTime}</Badge>
                                            </td>
                                        </tr>
                                    ))}
                                    {upcomingAssignments.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="text-center h-24 text-text-muted uppercase text-[10px] tracking-widest italic">No engagements scheduled.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Right Column - Status & Performance */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader className="pb-4">
                            <CardTitle className="text-[10px] tracking-[0.15em]">System Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-2">
                             <Button variant="outline" className="!h-auto !flex-col !gap-2 !p-4 !text-[10px] !font-bold !bg-bg-primary">
                                <Bell size={18} className="text-text-muted"/>
                                <span>{unreadNotifications} UNREAD</span>
                            </Button>
                             <Button variant="outline" className="!h-auto !flex-col !gap-2 !p-4 !text-[10px] !font-bold !bg-bg-primary">
                                <ScrollText size={18} className="text-text-muted"/>
                                <span>{pendingLogAlerts} PENDING</span>
                            </Button>
                        </CardContent>
                    </Card>
                    
                    <Card className="border-gold-border bg-gold-dim/10">
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-[10px] tracking-[0.15em] text-accent-gold">
                                <Gauge size={14}/> 
                                Reliability Metric
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                             <div className="text-center py-4">
                                <p className={`text-6xl font-bold ${reliabilityColor}`}>{reliabilityScore}%</p>
                                <p className="text-[9px] text-text-muted uppercase tracking-widest mt-2">Operational Integrity Score</p>
                            </div>
                            <div className="mt-6 space-y-2">
                                <h4 className="text-[9px] font-bold uppercase tracking-[0.2em] text-text-muted border-b border-border-main pb-2">Recent Discrepancies</h4>
                                {tech && penaltyEvents.filter(p => p.technicianId === tech.id).slice(0,2).map(event => (
                                    <div key={event.id} className="text-[10px] p-2.5 rounded-md bg-bg-primary border border-border-subtle">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-bold text-text-secondary uppercase">{event.reason}</span>
                                            <span className="font-mono font-bold text-text-red">{event.points} PTS</span>
                                        </div>
                                        <div className="text-text-muted font-mono">{new Date(event.date).toLocaleDateString()}</div>
                                    </div>
                                ))}
                                {penaltyEvents.filter(p => p.technicianId === tech.id).length === 0 && (
                                     <div className="text-[10px] text-center p-6 text-text-muted italic">Clear record. No discrepancies logged.</div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function format(date: Date, str: string) {
    // Simple mock format
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
