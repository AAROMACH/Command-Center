
'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from "@/lib/firebase";
import { collection, doc, updateDoc, onSnapshot, query, where, getDocs, addDoc, arrayUnion } from 'firebase/firestore';
import type { WorkOrder, Technician, WeeklyLog, WeeklyLogItem } from '@/lib/types';
import { technicians as mockTechnicians } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Clock, 
  Play,
  ClipboardList,
  Receipt,
  LogOut,
  Navigation,
  Check,
  RotateCcw,
  CheckCircle2
} from 'lucide-react';
import { ScheduleBox } from './components/schedule-box';
import { useToast } from '@/hooks/use-toast';
import { WeeklyLogDialog } from './components/weekly-log-dialog';
import { ReceiptUploadDialog } from './components/receipt-upload-dialog';
import { CheckInDialog } from './components/check-in-dialog';
import { LogSelectionDialog } from './components/log-selection-dialog';
import { JobDetailDialog } from '@/components/job-detail-dialog';
import { NotificationBell } from '@/components/notification-bell';
import { TERMINOLOGY } from '@/lib/constants';
import { useRouter } from 'next/navigation';
import { format, startOfWeek } from 'date-fns';
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
    const router = useRouter();

    useEffect(() => {
        const userId = localStorage.getItem('currentUserId');
        if (!userId) {
            router.push('/login');
            return;
        }
        
        setCurrentTechId(userId);

        const initialTech = mockTechnicians.find(t => t.id === userId);
        if (initialTech) setTech(initialTech);

        const unsubTech = onSnapshot(doc(db, 'users', userId), (d) => {
            if (d.exists()) {
                setTech({ ...d.data(), id: d.id } as Technician);
            }
        }, (err) => {
            console.warn("Personnel registry handshake restricted:", err);
        });

        const unsubAsmt = onSnapshot(query(collection(db, 'assignments'), where('techId', '==', userId)), (snap) => {
            setAllWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
        });

        const logQ = query(collection(db, 'weeklyLogs'), where('technicianId', '==', userId), where('status', '==', 'Draft'));
        const unsubLogs = onSnapshot(logQ, (snap) => {
            setUnsubmittedLogs(snap.docs.map(d => ({ ...d.data(), id: d.id } as WeeklyLog)));
        });

        return () => {
            unsubTech();
            unsubAsmt();
            unsubLogs();
        };
    }, [router]);

    const activeJob = useMemo(() => 
        allWorkOrders.find(wo => wo.status === 'in-progress' || wo.status === 'on-my-way' || wo.status === 'confirmed' || wo.status === 'checked-out'),
    [allWorkOrders]);

    const removeFromWeeklyLogs = async (woId: string) => {
        if (!currentTechId) return;
        const logQuery = query(
            collection(db, 'weeklyLogs'),
            where('technicianId', '==', currentTechId),
            where('status', '==', 'Draft')
        );
        const snap = await getDocs(logQuery);
        for (const logDoc of snap.docs) {
            const data = logDoc.data() as WeeklyLog;
            const updatedItems = (data.items || []).filter(item => item.workOrderId !== woId);
            if (updatedItems.length !== (data.items || []).length) {
                await updateDoc(doc(db, 'weeklyLogs', logDoc.id), { items: updatedItems });
            }
        }
    };

    const syncToWeeklyLog = async (woId: string) => {
        if (!currentTechId) return;

        const wo = allWorkOrders.find(w => w.id === woId);
        if (!wo) return;

        const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
        const weekOf = format(monday, 'MM-dd-yyyy');
        
        const logQuery = query(
            collection(db, 'weeklyLogs'),
            where('technicianId', '==', currentTechId),
            where('weekOf', '==', weekOf),
            where('status', '==', 'Draft')
        );

        const snap = await getDocs(logQuery);
        const newItem: WeeklyLogItem = {
            id: `wli-${Date.now()}`,
            workOrderId: woId,
            jobPay: wo.pay,
            outcomeCode: 'worked_completed',
            isComplete: true,
            isAdminReviewed: false
        };

        if (!snap.empty) {
            const logDoc = snap.docs[0];
            await updateDoc(doc(db, 'weeklyLogs', logDoc.id), {
                items: arrayUnion(newItem)
            });
        } else {
            const newLog: Omit<WeeklyLog, 'id'> = {
                technicianId: currentTechId,
                weekOf,
                status: 'Draft',
                items: [newItem],
                reimbursements: [],
                totalPayout: 0
            };
            await addDoc(collection(db, 'weeklyLogs'), newLog);
        }
    };

    const handleStatusTransition = async (woId: string, newStatus: WorkOrder['status']) => {
        const today = format(new Date(), 'MM-dd-yyyy');
        const nowTime = format(new Date(), 'HH:mm');
        
        try {
            const docRef = doc(db, 'assignments', woId);
            const historyEntry = { 
                type: 'status_change', 
                date: today, 
                details: `Status update to ${newStatus.toUpperCase()} at ${nowTime}.`, 
                user: tech?.name || 'Field Operative' 
            };
            
            if (newStatus === 'in-progress' || newStatus === 'checked-out') {
                await removeFromWeeklyLogs(woId);
            }

            await updateDoc(docRef, { 
                status: newStatus,
                history: [...(activeJob?.history || []), historyEntry]
            });
            
            if (newStatus === 'completed') {
                await removeFromWeeklyLogs(woId);
                await syncToWeeklyLog(woId);
                toast({ title: "Mission Finalized", description: "Mission moved to historical registry and current weekly log." });
            } else {
                toast({ title: "Status Updated", description: `Mission transitioned to ${newStatus.replace(/-/g, ' ')}.` });
            }
        } catch (e: any) {
            toast({ variant: "destructive", title: "Update Failed", description: e.message });
        }
    };

    if (!currentTechId || !tech) {
        return (
            <div className="flex h-screen items-center justify-center bg-bg-primary">
                <div className="text-center space-y-4">
                    <div className="h-8 w-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em]">Synchronizing Field terminal...</p>
                </div>
            </div>
        );
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
                <Card className={cn(
                    "border-2 bg-bg-secondary cursor-pointer transition-all",
                    activeJob.status === 'in-progress' ? "border-text-green shadow-[0_0_15px_rgba(31,138,85,0.1)]" : "border-brand-red bg-brand-red-dim/5"
                )} onClick={() => { setSelectedJob(activeJob); setIsDetailOpen(true); }}>
                    <CardHeader className="pb-2 text-left">
                        <div className="flex justify-between items-start">
                            <CardTitle className="text-xl uppercase">{activeJob.title || activeJob.description}</CardTitle>
                            <Badge variant={activeJob.status === 'checked-out' ? 'checked-out' : activeJob.status === 'in-progress' ? 'inprogress' : 'onhold'}>
                                {activeJob.status.replace(/-/g, ' ').toUpperCase()}
                            </Badge>
                        </div>
                        <CardDescription className="text-xs uppercase font-bold text-text-muted">{activeJob.clientName}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-end gap-3 pt-4">
                        {activeJob.status === 'confirmed' && (
                            <Button onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'on-my-way'); }}>
                                <Navigation size={16} className="mr-2"/> Start Trip
                            </Button>
                        )}
                        {activeJob.status === 'on-my-way' && (
                            <Button className="bg-text-green hover:bg-text-green/90" onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'in-progress'); }}>
                                <Play size={16} className="mr-2 fill-current"/> Check In
                            </Button>
                        )}
                        {activeJob.status === 'in-progress' && (
                            <Button variant="destructive" onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'checked-out'); }}>
                                <LogOut size={16} className="mr-2"/> Check Out
                            </Button>
                        )}
                        {activeJob.status === 'checked-out' && (
                            <>
                                <Button variant="outline" className="border-accent-gold text-accent-gold hover:bg-accent-gold-dim" onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'in-progress'); }}>
                                    <RotateCcw size={16} className="mr-2"/> Check back in
                                </Button>
                                <Button className="bg-text-green hover:bg-text-green/90" onClick={(e) => { e.stopPropagation(); handleStatusTransition(activeJob.id, 'completed'); }}>
                                    <CheckCircle2 size={16} className="mr-2"/> Mark Complete
                                </Button>
                            </>
                        )}
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
