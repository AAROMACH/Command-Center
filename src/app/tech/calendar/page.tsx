'use client';
import { useState, useEffect } from 'react';
import type { WorkOrder } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Calendar } from "@/components/ui/calendar";
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format, parseISO } from 'date-fns';
import { MapPin, Clock, DollarSign, CalendarDays, Building2, Briefcase, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

function getStatusColor(status: string) {
    if (status === 'in-progress') return 'bg-text-green';
    if (status === 'on-my-way' || status === 'confirmed') return 'bg-blue-400';
    if (status === 'checked-out') return 'bg-border-main';
    return 'bg-brand-red';
}

function getStatusVariant(status: string): any {
    if (status === 'in-progress') return 'inprogress';
    if (status === 'checked-out') return 'checked-out';
    if (status === 'completed') return 'completed';
    return 'scheduled';
}

export default function TechCalendarPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState<Date | undefined>(new Date());
    const [selectedEvent, setSelectedEvent] = useState<WorkOrder | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [techWorkOrders, setTechWorkOrders] = useState<WorkOrder[]>([]);

    useEffect(() => {
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);
    }, []);

    useEffect(() => {
        if (!currentTechId) return;
        const q = query(
            collection(db, 'workOrders'),
            where('assignedTechnicianId', '==', currentTechId)
        );
        const unsub = onSnapshot(q, (snap) => {
            setTechWorkOrders(snap.docs.map(d => ({ ...d.data(), id: d.id } as WorkOrder)));
            setLoading(false);
        }, () => setLoading(false));
        return () => unsub();
    }, [currentTechId]);

    const handleDayClick = (day: Date | undefined) => {
        setDate(day);
    };

    const handleEventClick = (wo: WorkOrder) => {
        setSelectedEvent(wo);
        setIsDrawerOpen(true);
    };

    const eventsForSelectedDay = techWorkOrders.filter(wo => {
        try { return wo.scheduleDate === format(date || new Date(), 'yyyy-MM-dd'); }
        catch { return false; }
    });

    if (!currentTechId) {
        return (
            <div className="space-y-6">
                <div className="page-header">
                    <div className="space-y-2">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-7 w-48" />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Skeleton className="md:col-span-2 h-80 rounded-xl" />
                    <div className="space-y-3">
                        <Skeleton className="h-24 rounded-xl" />
                        <Skeleton className="h-24 rounded-xl" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <header className="page-header">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <CalendarDays size={12} />
                        Schedule Terminal
                    </p>
                    <h1 className="page-title">My Calendar</h1>
                    <p className="page-subtitle">View your upcoming assignments and track your schedule.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Calendar */}
                <div className="md:col-span-2">
                    <Card className="overflow-hidden">
                        <CardContent className="p-0">
                            <Calendar
                                mode="single"
                                selected={date}
                                onSelect={handleDayClick}
                                className="w-full p-4"
                                classNames={{
                                    day_selected: "bg-brand-red text-white hover:bg-brand-red focus:bg-brand-red rounded-md",
                                    day_today: "bg-accent-gold-dim text-accent-gold rounded-md font-bold",
                                }}
                                modifiers={{
                                    hasEvent: techWorkOrders
                                        .map(wo => { try { return parseISO(wo.scheduleDate); } catch { return null; } })
                                        .filter(Boolean) as Date[],
                                }}
                                modifiersClassNames={{
                                    hasEvent: 'relative !flex items-center justify-center after:content-[""] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-brand-red',
                                }}
                            />
                        </CardContent>
                    </Card>
                </div>

                {/* Day Event List */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                            {format(date || new Date(), 'EEE, MMM d')}
                        </p>
                        <span className="text-[9px] font-bold text-text-muted uppercase">
                            {eventsForSelectedDay.length} job{eventsForSelectedDay.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {loading ? (
                        [1, 2].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)
                    ) : eventsForSelectedDay.length > 0 ? (
                        eventsForSelectedDay.map(wo => (
                            <div
                                key={wo.id}
                                className="relative overflow-hidden rounded-lg border border-border-sub bg-bg-secondary hover:border-border-main hover:bg-bg-tertiary transition-all cursor-pointer group"
                                onClick={() => handleEventClick(wo)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={e => e.key === 'Enter' && handleEventClick(wo)}
                            >
                                {/* Status accent bar */}
                                <div className={cn('absolute left-0 top-0 bottom-0 w-1', getStatusColor(wo.status))} />
                                <div className="pl-4 pr-3 py-3">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <p className="text-[11px] font-bold uppercase tracking-wide text-text-primary leading-tight line-clamp-2">
                                            {wo.title || wo.description}
                                        </p>
                                        <ChevronRight size={14} className="text-text-muted shrink-0 mt-0.5 group-hover:text-text-primary transition-colors" />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-1.5 text-[9px] text-text-muted">
                                            <Building2 size={9} className="shrink-0" />
                                            <span className="truncate">{wo.clientName}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[9px] text-text-muted">
                                            <Clock size={9} className="shrink-0 text-accent-gold" />
                                            <span>{wo.scheduleTime || 'TBD'}</span>
                                            <Badge variant={getStatusVariant(wo.status)} className="h-3.5 text-[7px] px-1.5 ml-auto">
                                                {wo.status.replace(/-/g, ' ')}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="py-12 text-center space-y-3 rounded-xl border-2 border-dashed border-border-sub">
                            <CalendarDays size={28} className="mx-auto text-text-muted opacity-20" />
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">No assignments</p>
                                <p className="text-[9px] text-text-muted mt-0.5">Nothing scheduled for this day</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Job Detail Drawer */}
            <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
                <DrawerContent>
                    {selectedEvent && (
                        <div className="mx-auto w-full max-w-lg pb-4">
                            <DrawerHeader className="text-left px-6 pt-6 pb-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <Badge variant={getStatusVariant(selectedEvent.status)} className="text-[8px] h-4">
                                        {selectedEvent.status.replace(/-/g, ' ')}
                                    </Badge>
                                    <span className="text-[9px] font-mono text-text-muted">{selectedEvent.id.toUpperCase()}</span>
                                </div>
                                <DrawerTitle className="text-base font-black uppercase leading-tight">
                                    {selectedEvent.title || selectedEvent.description}
                                </DrawerTitle>
                                <DrawerDescription className="text-[10px] uppercase font-bold text-text-muted mt-1">
                                    {selectedEvent.projectType} · {selectedEvent.clientName}
                                </DrawerDescription>
                            </DrawerHeader>

                            <div className="px-6 space-y-0 divide-y divide-border-sub border-y border-border-sub">
                                <div className="flex items-center gap-3 py-3">
                                    <MapPin size={14} className="text-brand-red shrink-0" />
                                    <div className="text-left">
                                        <p className="text-[8px] font-bold uppercase text-text-muted">Location</p>
                                        <p className="text-[11px] font-semibold text-text-primary">{selectedEvent.location}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 py-3">
                                    <Clock size={14} className="text-accent-gold shrink-0" />
                                    <div className="text-left">
                                        <p className="text-[8px] font-bold uppercase text-text-muted">Schedule</p>
                                        <p className="text-[11px] font-semibold text-text-primary">
                                            {selectedEvent.scheduleDate} at {selectedEvent.scheduleTime}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 py-3">
                                    <DollarSign size={14} className="text-text-green shrink-0" />
                                    <div className="text-left">
                                        <p className="text-[8px] font-bold uppercase text-text-muted">Pay</p>
                                        <p className="text-[11px] font-semibold text-text-green">${selectedEvent.pay?.toFixed(2)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 py-3">
                                    <Briefcase size={14} className="text-text-muted shrink-0" />
                                    <div className="text-left">
                                        <p className="text-[8px] font-bold uppercase text-text-muted">Job Type</p>
                                        <p className="text-[11px] font-semibold text-text-primary">{selectedEvent.projectType}</p>
                                    </div>
                                </div>
                            </div>

                            <DrawerFooter className="px-6 pt-4">
                                <DrawerClose asChild>
                                    <Button variant="outline" className="h-11 uppercase font-bold text-[10px] tracking-widest">
                                        Close
                                    </Button>
                                </DrawerClose>
                            </DrawerFooter>
                        </div>
                    )}
                </DrawerContent>
            </Drawer>
        </div>
    );
}
