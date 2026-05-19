'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from "@/lib/firebase";
import { collection, doc, updateDoc, onSnapshot, query, where, addDoc } from 'firebase/firestore';
import type { WorkOrder, Technician, WeeklyLog } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  MapPin, 
  Clock, 
  Play,
  ClipboardList,
  Receipt,
  LogOut,
  Navigation,
  Check
} from 'lucide-react';
import { ScheduleBox } from './components/schedule-box';
import { isSameDay, parseISO, format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { WeeklyLogDialog } from './components/weekly-log-dialog';
import { ReceiptUploadDialog } from './components/receipt-upload-dialog';
import { CheckInDialog } from './components/check-in-dialog';
import { LogSelectionDialog } from './components/log-selection-dialog';
import { JobDetailDialog } from '@/components/job-detail-dialog';
import { NotificationBell } from '@/components/notification-bell';
import { TERMINOLOGY } from '@/lib/constants';
import { cn } from '@/lib/utils';

export default function TechDashboardPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [tech, setTech] = useState<Technician | null>(null);
    const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>([]);
    const [unsubmittedLogs, setUnsubmittedLogs] = useState<WeeklyLog[]>([]);
    
    const [isLogSelectionOpen, setIsLogSelectionOpen] = useState(false);
    const [selectedLog, setSelectedLog] = useState<WeeklyLog | null>(null);
    const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false);
    const [isCheckInDialogOpen, setIsCheckInDialogOpen] = useState(false);
    const [selectedJob, setSelectedJob] = useState<WorkOrder | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    
    const { toast } = useToast();

    useEffect(() => {
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);
        if (!userId) return;

        const unsubTech = onSnapshot(doc(db, 'users', userId), (d) => {
            if (d.exists()) setTech({ ...d.data(), id: d.id } as Technician);
        });

        const q = query(collection(db, 'workOrders'), where('assignedTechnicianId', '==', userId));
        const unsubWO = onSnapshot(q, (snap) => {
            setAllWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });

        const logQ = query(collection(db, 'weeklyLogs'), where('technicianId', '==', userId), where('status', '==', 'Draft'));
        const unsubLogs = onSnapshot(logQ, (snap) => {
            setUnsubmittedLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)));
        });

        return () => {
            unsubTech();
            unsubWO();
            unsubLogs();
        };
    }, [currentTechId]);

    const activeJob = useMemo(() => 
        allWorkOrders.find(wo => wo.status === 'in-progress' || wo.status === 'on-my-way' || wo.status === 'confirmed'),
    [allWorkOrders]);

    const handleStatusTransition = async (woId: string, newStatus: WorkOrder['status']) => {
        try {
            const docRef = doc(db, 'workOrders', woId);
            await updateDoc(docRef, { status: newStatus });
            toast({ title: "Status Updated", description: `Mission transitioned to ${newStatus}.` });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Update Failed", description: e.message });
        }
    };

    if (!currentTechId || !tech) {
        return <div className="p-8 text-center uppercase tracking-widest text-text-muted text-xs">Initializing Terminal...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold uppercase tracking-widest text-text-primary">{TERMINOLOGY.PORTAL.TECH}</h1>
                <NotificationBell />
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" className="flex-1 h-12 bg-bg-secondary" onClick={() => setIsCheckInDialogOpen(true)}>
                    <Play size={16} className="text-text-muted mr-2" /><span className="text-[10px] font-bold uppercase">Check In</span>
                </Button>
                <Button variant="outline" className="flex-1 h-12 bg-bg-secondary" onClick={() => setIsReceiptDialogOpen(true)}>
                    <Receipt size={16} className="text-text-muted mr-2" /><span className="text-[10px] font-bold uppercase">Upload Receipt</span>
                </Button>
                <Button variant="outline" className="flex-1 h-12 relative bg-bg-secondary" onClick={() => setIsLogSelectionOpen(true)}>
                    <ClipboardList size={16} className="text-accent-gold mr-2" /><span className="text-[10px] font-bold uppercase">Submit weekly log</span>
                    {unsubmittedLogs.length > 0 && <Badge className="absolute -top-1 -right-1 bg-brand-red">{unsubmittedLogs.length}</Badge>}
                </Button>
            </div>

            {activeJob && (
                <Card className="border-2 border-brand-red bg-brand-red-dim/5" onClick={() => { setSelectedJob(activeJob); setIsDetailOpen(true); }}>
                    <CardHeader className="pb-2 text-left">
                        <CardTitle className="text-xl uppercase">{activeJob.description}</CardTitle>
                        <CardDescription className="text-xs uppercase font-bold text-brand-red">{activeJob.status}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-end pt-4">
                        {activeJob.status === 'confirmed' && <Button onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'on-my-way'); }}>Start Trip</Button>}
                        {activeJob.status === 'on-my-way' && <Button onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'in-progress'); }}>Check In</Button>}
                        {activeJob.status === 'in-progress' && <Button variant="destructive" onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'completed'); }}>Check Out</Button>}
                    </CardContent>
                </Card>
            )}

            <ScheduleBox workOrders={allWorkOrders} />

            <LogSelectionDialog isOpen={isLogSelectionOpen} setIsOpen={setIsLogSelectionOpen} logs={unsubmittedLogs} onSelect={setSelectedLog} />
            <ReceiptUploadDialog isOpen={isReceiptDialogOpen} setIsOpen={setIsReceiptDialogOpen} workOrders={allWorkOrders} projects={[]} />
            <CheckInDialog isOpen={isCheckInDialogOpen} setIsOpen={setIsCheckInDialogOpen} workOrders={allWorkOrders.filter(w => w.status === 'assigned')} projects={[]} />
            <JobDetailDialog isOpen={isDetailOpen} setIsOpen={setIsDetailOpen} mission={selectedJob} />
            {selectedLog && <WeeklyLogDialog isOpen={!!selectedLog} setIsOpen={() => setSelectedLog(null)} log={selectedLog} onSubmitted={() => setSelectedLog(null)} />}
        </div>
    );
}
