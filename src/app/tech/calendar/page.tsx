'use client';
import { useState } from 'react';
import type { WorkOrder, TimeOffRequest } from '@/lib/types';
import { workOrders } from '@/lib/data';
import { Calendar } from "@/components/ui/calendar";
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { MapPin, Clock, DollarSign } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const CURRENT_TECH_ID = 'tech-001';

export default function TechCalendarPage() {
    const [date, setDate] = useState<Date | undefined>(new Date('2024-07-28T12:00:00Z'));
    const [selectedEvent, setSelectedEvent] = useState<WorkOrder | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const techWorkOrders = workOrders.filter(wo => wo.assignedTechnicianId === CURRENT_TECH_ID);

    const handleDayClick = (day: Date) => {
        setDate(day);
    };

    const handleEventClick = (wo: WorkOrder) => {
        setSelectedEvent(wo);
        setIsDrawerOpen(true);
    };

    const eventsForSelectedDay = techWorkOrders.filter(wo => wo.scheduleDate === format(date || new Date(), 'yyyy-MM-dd'));

    return (
        <div>
            <header className="page-header">
                <div>
                    <h1 className="page-title">Schedule Terminal</h1>
                    <p className="page-subtitle">View your assignments and manage your schedule.</p>
                </div>
            </header>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                    <Card>
                        <CardContent className="p-2">
                             <Calendar
                                mode="single"
                                selected={date}
                                onSelect={handleDayClick}
                                className="p-0"
                                classNames={{
                                    day_selected: "bg-brand-red text-white hover:bg-brand-red-hover focus:bg-brand-red",
                                    day_today: "bg-accent-gold-dim text-accent-gold",
                                }}
                                modifiers={{
                                    hasEvent: techWorkOrders.map(wo => parseISO(wo.scheduleDate)),
                                }}
                                modifiersClassNames={{
                                    hasEvent: 'relative !flex items-center justify-center after:content-[""] after:absolute after:bottom-1.5 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-brand-red',
                                }}
                             />
                        </CardContent>
                    </Card>
                </div>
                <div>
                    <h3 className="font-bold text-text-primary mb-3">
                        Schedule for {format(date || new Date(), 'EEEE, MMMM d')}
                    </h3>
                    <div className="space-y-3">
                        {eventsForSelectedDay.length > 0 ? eventsForSelectedDay.map(wo => (
                            <Card key={wo.id} className="cursor-pointer hover:bg-bg-tertiary" onClick={() => handleEventClick(wo)}>
                                <CardContent className="p-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-semibold text-text-primary">{wo.description}</p>
                                            <p className="text-xs text-text-muted">{wo.clientName}</p>
                                        </div>
                                        <Badge variant={wo.status === 'in-progress' ? 'inprogress' : 'scheduled'}>{wo.scheduleTime}</Badge>
                                    </div>
                                </CardContent>
                            </Card>
                        )) : (
                            <div className="empty-state text-sm">No assignments scheduled for this day.</div>
                        )}
                    </div>
                </div>
            </div>
            
            <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
                <DrawerContent>
                    {selectedEvent && (
                    <div className="mx-auto w-full max-w-lg">
                        <DrawerHeader>
                            <DrawerTitle>{selectedEvent.description}</DrawerTitle>
                            <DrawerDescription>{selectedEvent.projectType} for {selectedEvent.clientName}</DrawerDescription>
                        </DrawerHeader>
                        <div className="p-4 space-y-4">
                            <div className="flex items-center gap-2 text-sm text-text-secondary"><MapPin size={14} className="text-text-muted"/> {selectedEvent.location}</div>
                            <div className="flex items-center gap-2 text-sm text-text-secondary"><Clock size={14} className="text-text-muted"/> {selectedEvent.scheduleDate} at {selectedEvent.scheduleTime}</div>
                            <div className="flex items-center gap-2 text-sm text-text-green"><DollarSign size={14}/> Pay: ${selectedEvent.pay.toFixed(2)}</div>
                        </div>
                        <DrawerFooter>
                            <Button size="lg">{selectedEvent.status === 'in-progress' ? 'Check Out' : 'Check In'}</Button>
                            <DrawerClose asChild>
                                <Button variant="outline" size="lg">Close</Button>
                            </DrawerClose>
                        </DrawerFooter>
                    </div>
                    )}
                </DrawerContent>
            </Drawer>
        </div>
    );
}
