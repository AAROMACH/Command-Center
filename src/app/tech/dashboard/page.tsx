'use client';
import { useState } from 'react';
import type { WorkOrder, Technician, PenaltyEvent } from '@/lib/types';
import { workOrders, technicians, penaltyEvents } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Bell, AlertTriangle, Calendar, Clock, MapPin, Gauge, ScrollText, CheckCircle2 } from 'lucide-react';

// For demonstration, we'll hardcode the current technician's ID
const CURRENT_TECH_ID = 'tech-001';

export default function TechDashboardPage() {
    const today = new Date('2024-07-28T12:00:00Z'); // Mock today's date for consistent data
    const todayStr = today.toISOString().split('T')[0];

    const tech = technicians.find(t => t.id === CURRENT_TECH_ID);

    const todaysAssignments = workOrders.filter(wo => 
        wo.assignedTechnicianId === CURRENT_TECH_ID &&
        wo.scheduleDate === todayStr
    );
    
    const upcomingAssignments = workOrders.filter(wo => {
      const woDate = new Date(wo.scheduleDate);
      const diffDays = (woDate.getTime() - today.getTime()) / (1000 * 3600 * 24);
      return wo.assignedTechnicianId === CURRENT_TECH_ID && diffDays > 0 && diffDays <= 7;
    });

    const reliabilityScore = tech?.reliabilityScore || 0;
    const reliabilityColor = reliabilityScore > 90 ? 'text-text-green' : reliabilityScore > 80 ? 'text-accent-gold' : 'text-text-red';
    
    // In a real app, these would come from a data source
    const pendingLogAlerts = 1;
    const unreadNotifications = 3;

    return (
        <div>
            <header className="page-header">
                <div>
                    <h1 className="page-title">My Operations</h1>
                    <p className="page-subtitle">Welcome back, {tech?.name}. Here's your operational overview for today.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-6">
                    <div>
                        <h2 className="text-lg font-bold text-text-primary mb-3">Today's Assignments</h2>
                        <div className="space-y-4">
                            {todaysAssignments.length > 0 ? todaysAssignments.map(wo => (
                                <Card key={wo.id} className="bg-bg-secondary">
                                    <CardContent className="p-4 flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="font-bold text-text-primary">{wo.description}</h3>
                                                <Badge variant={wo.status === 'in-progress' ? 'inprogress' : 'scheduled'}>{wo.status}</Badge>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-text-muted">
                                                <span className="flex items-center gap-1.5"><MapPin size={13}/> {wo.location}</span>
                                                <span className="flex items-center gap-1.5"><Clock size={13}/> {wo.scheduleTime}</span>
                                            </div>
                                        </div>
                                        <Button variant={wo.status === 'in-progress' ? 'destructive' : 'default'} size="sm">
                                            {wo.status === 'in-progress' ? 'Check Out' : 'Check In'}
                                        </Button>
                                    </CardContent>
                                </Card>
                            )) : (
                                <div className="empty-state !text-left !py-8">
                                    <CheckCircle2 size={24} className="text-text-green mb-2"/>
                                    <h3 className="font-bold text-text-primary">No assignments for today.</h3>
                                    <p className="text-sm text-text-muted">Enjoy your day off or check upcoming jobs.</p>
                                </div>
                            )}
                        </div>
                    </div>
                     <div>
                        <h2 className="text-lg font-bold text-text-primary mb-3">Upcoming (Next 7 Days)</h2>
                        <div className="table-wrap">
                            <table className="tbl">
                                <tbody>
                                    {upcomingAssignments.map(wo => (
                                         <tr key={wo.id}>
                                            <td className="!py-3">
                                                <span className="font-semibold text-text-secondary">{new Date(wo.scheduleDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric'})}</span>
                                            </td>
                                            <td className="!py-3">
                                                <div className="font-semibold text-text-primary">{wo.description}</div>
                                                <div className="text-xs text-text-muted">{wo.clientName}</div>
                                            </td>
                                            <td className="!py-3">
                                                 <div className="flex items-center gap-1.5 text-sm text-text-secondary"><MapPin className="h-3.5 w-3.5 text-text-muted"/>{wo.location}</div>
                                            </td>
                                            <td className="!py-3 text-right">
                                                 <Badge variant="scheduled">{wo.scheduleTime}</Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Quick Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-2">
                             <Button variant="outline" className="!h-auto !flex-col !gap-1 !p-3 !text-xs !normal-case !font-semibold">
                                <Bell size={20} className="mb-1 text-text-muted"/>
                                <span>{unreadNotifications} Unread</span>
                                <span>Notifications</span>
                            </Button>
                             <Button variant="outline" className="!h-auto !flex-col !gap-1 !p-3 !text-xs !normal-case !font-semibold">
                                <ScrollText size={20} className="mb-1 text-text-muted"/>
                                <span>{pendingLogAlerts} Pending</span>
                                <span>Weekly Log</span>
                            </Button>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Gauge size={14}/> Reliability Score</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <div className="text-center">
                                <p className={`text-5xl font-bold ${reliabilityColor}`}>{reliabilityScore}%</p>
                                <p className="text-xs text-text-muted">Updated monthly</p>
                            </div>
                            <div className="mt-4 space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">Recent Penalty Events</h4>
                                {penaltyEvents.filter(p => p.technicianId === CURRENT_TECH_ID).slice(0,2).map(event => (
                                    <div key={event.id} className="text-xs p-2 rounded-md bg-bg-primary border border-border-subtle">
                                        <div className="flex justify-between">
                                            <span className="font-semibold text-text-secondary">{event.reason}</span>
                                            <span className="font-bold text-text-red">{event.points} pts</span>
                                        </div>
                                        <div className="text-text-muted">{new Date(event.date).toLocaleDateString()}</div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
