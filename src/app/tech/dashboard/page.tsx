'use client';

import { useState, useEffect, useMemo } from 'react';
import type { WorkOrder, Technician, WeeklyLog } from '@/lib/types';
import { workOrders, technicians, weeklyLogs, projects } from '@/lib/data';
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
  FileCheck
} from 'lucide-react';
import { ScheduleBox } from './components/schedule-box';
import { isSameDay, parseISO } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { WeeklyLogDialog } from './components/weekly-log-dialog';
import { ReceiptUploadDialog } from './components/receipt-upload-dialog';
import { PendingPayoutDialog } from './components/pending-payout-dialog';
import { CheckInDialog } from './components/check-in-dialog';
import { LogSelectionDialog } from './components/log-selection-dialog';
import { JobDetailDialog } from '@/components/job-detail-dialog';

export default function TechDashboardPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
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
        mounted && currentTechId ? workOrders.filter(wo => wo.assignedTechnicianId === currentTechId) : [],
    [currentTechId, mounted]);
    
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
        todaysWorkOrders.find(wo => wo.status === 'in-progress'),
  [todaysWorkOrders]);

    const nextAction = useMemo(() => {
        if (activeJob) return null;
        return todaysWorkOrders
            .filter(wo => wo.status === 'assigned')
            .sort((a, b) => a.scheduleTime.localeCompare(b.scheduleTime))[0];
    }, [todaysWorkOrders, activeJob]);

    const unfinalizedLogs = useMemo(() => {
        if (!currentTechId) return [];
        return weeklyLogs.filter(l => l.technicianId === currentTechId && l.status === 'Draft');
    }, [currentTechId]);

    const submittedLogs = useMemo(() => {
        if (!currentTechId) return [];
        return weeklyLogs.filter(l => l.technicianId === currentTechId && l.status === 'Submitted');
    }, [currentTechId]);

    const summary = useMemo(() => ({
        totalJobs: todaysWorkOrders.length,
        remainingJobs: todaysWorkOrders.filter(wo => wo.status !== 'completed').length,
        expectedHours: (todaysWorkOrders.length * 1.5).toFixed(1)
    }), [todaysWorkOrders]);

    const pendingEarnings = useMemo(() => {
        return submittedLogs.reduce((acc, log) => acc + (log.totalPayout || 0), 0);
    }, [submittedLogs]);

    const handleLogSelect = (log: WeeklyLog) => {
        setSelectedLog(log);
        setIsLogSelectionOpen(false);
    };

    const handleOpenJobDetail = (wo: WorkOrder) => {
        setSelectedJob(wo);
        setIsDetailOpen(true);
    };

    if (!mounted || !currentTechId || !tech) {
        return <div className="p-8 text-center uppercase tracking-widest text-text-muted text-xs">Initializing Terminal...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold uppercase tracking-widest text-text-primary">Operational Terminal</h1>
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
                    className="flex-1 min-w-[200px] h-12 bg-bg-secondary border-border-main hover:border-brand-red group"
                    onClick={() => setIsLogSelectionOpen(true)}
                >
                    <ClipboardList size={16} className="text-accent-gold mr-2" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Submit weekly log</span>
                </Button>

                <Button 
                    variant="outline" 
                    className="flex-1 min-w-[240px] h-12 bg-bg-tertiary border-border-subtle hover:border-text-green group"
                    onClick={() => setIsPayoutDialogOpen(true)}
                >
                    <div className="flex items-center justify-between w-full">
                        <div className="flex items-center">
                            <Coins size={16} className="text-text-green mr-2" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Pending Payout</span>
                        </div>
                        <span className="font-mono text-sm text-text-green">${pendingEarnings.toFixed(2)}</span>
                    </div>
                </Button>
            </div>

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
                    <p className="text-[10px] uppercase font-bold text-text-muted mb-1">Reliability Score</p>
                    <p className="text-2xl font-bold text-text-green">{tech.reliabilityScore}%</p>
                </div>
            </div>

            <div className="space-y-6">
                {!activeJob && (
                    <Card 
                        className="border-2 border-brand-red bg-brand-red-dim/5 cursor-pointer hover:bg-brand-red-dim/10 transition-colors"
                        onClick={() => nextAction && handleOpenJobDetail(nextAction)}
                    >
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <div className="page-eyebrow text-brand-red">Next Low Voltage Job</div>
                                {nextAction?.isImported && <Badge variant="secondary" className="uppercase text-[8px]">FieldNation Import</Badge>}
                                <Badge variant="high">Priority</Badge>
                            </div>
                            <CardTitle className="text-2xl mt-1">{nextAction ? nextAction.description : 'No Upcoming Assignments'}</CardTitle>
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
                                                <p className="text-[10px] uppercase font-bold text-text-muted">Address</p>
                                                <p className="text-sm font-semibold">{nextAction.location}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        <Button 
                                          className="flex-1 h-12 gap-2 text-sm" 
                                          onClick={(e) => { e.stopPropagation(); toast({ title: nextAction.isImported ? "Job Finalization Open" : "Job Started", description: nextAction.isImported ? "Imported job detected. No check-in required." : "GPS track initiated."})}}
                                        >
                                            {nextAction.isImported ? <FileCheck size={16}/> : <Play size={16} fill="currentColor"/>}
                                            {nextAction.isImported ? "FINALIZE JOB" : "START JOB"}
                                        </Button>
                                        <Button variant="outline" className="h-12 px-6" onClick={(e) => { e.stopPropagation(); handleOpenJobDetail(nextAction); }}>
                                            <Eye size={16} className="mr-2"/> VIEW DETAILS
                                        </Button>
                                        <Button variant="secondary" className="h-12 px-6" onClick={(e) => { e.stopPropagation(); toast({ title: "Assignment Acknowledged", description: "Acknowledgment transmitted to operations center."})}}>ACKNOWLEDGE</Button>
                                    </div>
                                    {nextAction.isImported && (
                                        <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest text-center">
                                            Field Alert: Imported jobs from FieldNation require no GPS check-in.
                                        </p>
                                    )}
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
                    <Card 
                        className="border-2 border-text-green bg-green-dim/10 cursor-pointer hover:bg-green-dim/15 transition-colors"
                        onClick={() => handleOpenJobDetail(activeJob)}
                    >
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-text-green animate-pulse"/>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-text-green">Live assignment</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <Badge variant="active">On-Site</Badge>
                                <CardTitle className="text-2xl mt-1">{activeJob.description}</CardTitle>
                            </div>
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
                                        <Button variant="outline" size="sm" className="h-9 gap-2" onClick={(e) => { e.stopPropagation(); toast({ title: "Note Buffer Open", description: "Terminal ready for field intelligence input." })}}><StickyNote size={14}/> Add Notes</Button>
                                        <Button variant="outline" size="sm" className="h-9 gap-2" onClick={(e) => { e.stopPropagation(); toast({ title: "Camera Handshake", description: "Hardware verified. Awaiting visual capture." })}}><Camera size={14}/> Upload Photo</Button>
                                    </div>
                                </div>
                                <Button variant="destructive" className="h-12 gap-2 text-sm" onClick={(e) => { e.stopPropagation(); toast({ title: "Checked Out", description: "Job finalized. Log saved to weekly registry."})}}>
                                    <LogOut size={16}/> CHECK OUT / FINALIZE
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            <div className="opacity-90 grayscale-[0.2] hover:grayscale-0 transition-all">
                <ScheduleBox workOrders={techWorkOrders} />
            </div>

            <LogSelectionDialog
                isOpen={isLogSelectionOpen}
                setIsOpen={setIsLogSelectionOpen}
                logs={unfinalizedLogs}
                onSelect={handleLogSelect}
            />

            {selectedLog && (
                <WeeklyLogDialog 
                    isOpen={!!selectedLog} 
                    setIsOpen={(open) => !open && setSelectedLog(null)} 
                    log={selectedLog}
                    onSubmitted={() => {
                        toast({ title: "Log Finalized", description: "Your field job log has been sent to audit." });
                        setSelectedLog(null);
                    }}
                />
            )}

            <ReceiptUploadDialog
                isOpen={isReceiptDialogOpen}
                setIsOpen={setIsReceiptDialogOpen}
                workOrders={techWorkOrders}
                projects={projects.filter(p => p.assignedTechnicianIds.includes(currentTechId || ''))}
            />

            <CheckInDialog
                isOpen={isCheckInDialogOpen}
                setIsOpen={setIsCheckInDialogOpen}
                workOrders={techWorkOrders.filter(wo => wo.status === 'assigned')}
                projects={projects.filter(p => p.assignedTechnicianIds.includes(currentTechId || ''))}
            />

            <PendingPayoutDialog
                isOpen={isPayoutDialogOpen}
                setIsOpen={setIsPayoutDialogOpen}
                pendingAmount={pendingEarnings}
                submittedLogs={submittedLogs}
            />

            <JobDetailDialog 
                isOpen={isDetailOpen} 
                setIsOpen={setIsDetailOpen} 
                mission={selectedJob} 
            />
        </div>
    );
}
