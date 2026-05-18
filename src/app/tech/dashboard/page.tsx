'use client';

import { useState, useEffect, useMemo } from 'react';
import type { WorkOrder, Technician, WeeklyLog } from '@/lib/types';
import { workOrders as initialWorkOrders, technicians, weeklyLogs, projects } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  MapPin, 
  Clock, 
  Play,
  ClipboardList,
  Receipt,
  Eye,
  LogOut,
  StickyNote,
  Camera,
  Coins,
  Navigation,
  FileCheck,
  AlertCircle
} from 'lucide-react';
import { ScheduleBox } from './components/schedule-box';
import { isSameDay, parseISO, format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { WeeklyLogDialog } from './components/weekly-log-dialog';
import { ReceiptUploadDialog } from './components/receipt-upload-dialog';
import { PendingPayoutDialog } from './components/pending-payout-dialog';
import { CheckInDialog } from './components/check-in-dialog';
import { LogSelectionDialog } from './components/log-selection-dialog';
import { JobDetailDialog } from '@/components/job-detail-dialog';
import { NotificationBell } from '@/components/notification-bell';
import { TERMINOLOGY } from '@/lib/constants';

export default function TechDashboardPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>(initialWorkOrders);
    
    // UI Dialog States
    const [isLogSelectionOpen, setIsLogSelectionOpen] = useState(false);
    const [selectedLog, setSelectedLog] = useState<WeeklyLog | null>(null);
    const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false);
    const [isPayoutDialogOpen, setIsPayoutDialogOpen] = useState(false);
    const [isCheckInDialogOpen, setIsCheckInDialogOpen] = useState(false);
    const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    
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
        mounted && currentTechId ? allWorkOrders.filter(wo => wo.assignedTechnicianId === currentTechId) : [],
    [allWorkOrders, currentTechId, mounted]);
    
    const todaysWorkOrders = useMemo(() => 
        techWorkOrders.filter(wo => {
            try {
                return isSameDay(parseISO(wo.scheduleDate), new Date());
            } catch (e) {
                return false;
            }
        }),
    [techWorkOrders]);

    const activeJob = useMemo(() => 
        todaysWorkOrders.find(wo => wo.status === 'in-progress' || wo.status === 'on-my-way'),
    [todaysWorkOrders]);

    const nextAction = useMemo(() => {
        if (activeJob) return null;
        return todaysWorkOrders
            .filter(wo => wo.status === 'assigned')
            .sort((a, b) => a.scheduleTime.localeCompare(b.scheduleTime))[0];
    }, [todaysWorkOrders, activeJob]);

    const unsubmittedLogs = useMemo(() => {
        if (!currentTechId) return [];
        return weeklyLogs.filter(l => l.technicianId === currentTechId && l.status === 'Draft');
    }, [currentTechId]);

    const handleLogSelect = (log: WeeklyLog) => {
        setSelectedLog(log);
        setIsLogSelectionOpen(false);
    };

    const handleOpenJobDetail = (wo: WorkOrder) => {
        setSelectedJob(wo);
        setIsDetailOpen(true);
    };

    const handleStatusTransition = (woId: string, newStatus: WorkOrder['status']) => {
        const now = format(new Date(), 'HH:mm');
        const today = format(new Date(), 'MM-dd-yyyy');
        
        setAllWorkOrders(prev => prev.map(wo => {
            if (wo.id === woId) {
                let noteDetails = '';
                if (newStatus === 'on-my-way') noteDetails = `Trip initiated at ${now}. Status: EN ROUTE.`;
                if (newStatus === 'in-progress') noteDetails = `Arrival verified at ${now}. Trip completed. Status: ON SITE.`;
                if (newStatus === 'completed') noteDetails = `Mission finalized and checked out at ${now}.`;

                return { 
                    ...wo, 
                    status: newStatus,
                    history: [
                        ...(wo.history || []),
                        { type: 'note', date: today, details: noteDetails, user: tech?.name || 'Field Operative' }
                    ]
                };
            }
            return wo;
        }));

        const title = newStatus === 'on-my-way' ? 'Trip Started' : 
                      newStatus === 'in-progress' ? 'Check In Successful' : 'Job Status Updated';
        
        toast({
            title,
            description: `Assignment has been transitioned to ${newStatus.replace('-', ' ')}.`,
        });
    };

    const handleAcknowledge = (woId: string) => {
        setAllWorkOrders(prev => prev.map(wo => wo.id === woId ? { ...wo, isAcknowledged: true } : wo));
        toast({ title: "Acknowledgment Transmitted", description: "Administrative center notified of receipt." });
    };

    if (!mounted || !currentTechId || !tech) {
        return <div className="p-8 text-center uppercase tracking-widest text-text-muted text-xs">Initializing Terminal...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold uppercase tracking-widest text-text-primary">{TERMINOLOGY.PORTAL.TECH}</h1>
                <NotificationBell />
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Button 
                    variant="outline" 
                    className="flex-1 min-w-[200px] h-12 bg-bg-secondary border-border-main hover:border-brand-red group"
                    onClick={() => setIsCheckInDialogOpen(true)}
                >
                    <Play size={16} className="text-text-muted mr-2" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Check In</span>
                </Button>

                <Button 
                    variant="outline" 
                    className="flex-1 min-w-[200px] h-12 bg-bg-secondary border-border-main hover:border-brand-red group"
                    onClick={() => setIsReceiptDialogOpen(true)}
                >
                    <Receipt size={16} className="text-text-muted mr-2" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Upload Receipt</span>
                </Button>

                <Button 
                    variant="outline" 
                    className="flex-1 min-w-[200px] relative h-12 bg-bg-secondary border-border-main hover:border-brand-red group"
                    onClick={() => setIsLogSelectionOpen(true)}
                >
                    <ClipboardList size={16} className="text-accent-gold mr-2" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Submit weekly log</span>
                    {unsubmittedLogs.length > 0 && (
                        <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-red border-2 border-bg-primary shadow-[0_0_8px_rgba(204,34,0,0.6)] animate-pulse">
                            <span className="text-[8px] font-black text-white">{unsubmittedLogs.length}</span>
                        </div>
                    )}
                </Button>
            </div>

            <div className="space-y-6">
                {!activeJob && nextAction && (
                    <Card 
                        className="border-2 border-brand-red bg-brand-red-dim/5 cursor-pointer hover:bg-brand-red-dim/10 transition-colors"
                        onClick={() => handleOpenJobDetail(nextAction)}
                    >
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <div className="page-eyebrow text-brand-red">Next Low Voltage Job</div>
                                <Badge variant="high">Priority</Badge>
                            </div>
                            <CardTitle className="text-2xl mt-1">{nextAction.description}</CardTitle>
                        </CardHeader>
                        <CardContent>
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
                                            <p className="text-[10px] uppercase font-bold text-text-muted">Address</p>
                                            <p className="text-sm font-semibold">{nextAction.location}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <Button 
                                      className="flex-1 h-12 gap-2 text-sm" 
                                      onClick={(e) => { e.stopPropagation(); handleStatusTransition(nextAction.id, 'on-my-way'); }}
                                    >
                                        <Navigation size={18} className="mr-2"/> CONFIRM & START TRIP
                                    </Button>
                                    {!nextAction.isAcknowledged && (
                                        <Button variant="secondary" className="h-12 px-6" onClick={(e) => { e.stopPropagation(); handleAcknowledge(nextAction.id); }}>ACKNOWLEDGE</Button>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {activeJob && (
                    <Card 
                        className={cn(
                            "border-2 cursor-pointer transition-colors",
                            activeJob.status === 'on-my-way' ? "border-accent-gold bg-accent-gold-dim/10 hover:bg-accent-gold-dim/15" : "border-text-green bg-green-dim/10 hover:bg-green-dim/15"
                        )}
                        onClick={() => handleOpenJobDetail(activeJob)}
                    >
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <div className={cn("h-2 w-2 rounded-full animate-pulse", activeJob.status === 'on-my-way' ? "bg-accent-gold" : "bg-text-green")}/>
                                <span className={cn("text-[10px] font-bold uppercase tracking-widest", activeJob.status === 'on-my-way' ? "text-accent-gold" : "text-text-green")}>
                                    {activeJob.status === 'on-my-way' ? 'TRIP IN PROGRESS' : 'LIVE ASSIGNMENT'}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <Badge variant={activeJob.status === 'on-my-way' ? 'onhold' : 'active'}>
                                    {activeJob.status === 'on-my-way' ? 'En Route' : 'On-Site'}
                                </Badge>
                                <CardTitle className="text-2xl mt-1">{activeJob.description}</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                                <div className="space-y-4">
                                    <div className="flex gap-8">
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-text-muted">{activeJob.status === 'on-my-way' ? 'Trip Started' : 'Checked In'}</p>
                                            <p className={cn("text-lg font-mono font-bold", activeJob.status === 'on-my-way' ? "text-accent-gold" : "text-text-green")}>{activeJob.scheduleTime}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-text-muted">Active Duration</p>
                                            <p className="text-lg font-mono">01:42:15</p>
                                        </div>
                                    </div>
                                </div>
                                {activeJob.status === 'on-my-way' ? (
                                    <Button className="h-12 gap-2 text-sm bg-text-green hover:bg-text-green/90" onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'in-progress'); }}>
                                        <Play size={16} fill="currentColor"/> CHECK IN (ARRIVED)
                                    </Button>
                                ) : (
                                    <Button variant="destructive" className="h-12 gap-2 text-sm" onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'completed'); }}>
                                        <LogOut size={16}/> CHECK OUT / FINALIZE
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            <ScheduleBox workOrders={techWorkOrders} />

            <LogSelectionDialog
                isOpen={isLogSelectionOpen}
                setIsOpen={setIsLogSelectionOpen}
                logs={unsubmittedLogs}
                onSelect={handleLogSelect}
            />

            <ReceiptUploadDialog
                isOpen={isReceiptDialogOpen}
                setIsOpen={setIsReceiptDialogOpen}
                workOrders={techWorkOrders}
                projects={[]}
            />

            <CheckInDialog
                isOpen={isCheckInDialogOpen}
                setIsOpen={setIsCheckInDialogOpen}
                workOrders={techWorkOrders.filter(wo => wo.status === 'assigned' || wo.status === 'on-my-way')}
                projects={[]}
            />

            <JobDetailDialog 
                isOpen={isDetailOpen} 
                setIsOpen={setIsDetailOpen} 
                mission={selectedJob} 
            />

            {selectedLog && (
                <WeeklyLogDialog 
                    isOpen={!!selectedLog} 
                    setIsOpen={() => setSelectedLog(null)} 
                    log={selectedLog} 
                    onSubmitted={() => setSelectedLog(null)}
                />
            )}
        </div>
    );
}