'use client';
import { useState } from 'react';
import type { WorkOrder, TimeOffRequest } from '@/lib/types';
import { workOrders, timeOffRequests as initialTimeOffRequests } from '@/lib/data';
import { Calendar } from "@/components/ui/calendar";
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { MapPin, Clock, DollarSign, Plus } from 'lucide-react';

const CURRENT_TECH_ID = 'tech-001';

export default function TechCalendarPage() {
    const [date, setDate] = useState<Date | undefined>(new Date('2024-07-28T12:00:00Z'));
    const [selectedEvent, setSelectedEvent] = useState<WorkOrder | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isTimeOffDialogOpen, setIsTimeOffDialogOpen] = useState(false);
    const [timeOffRequests, setTimeOffRequests] = useState(initialTimeOffRequests);
    const { toast } = useToast();

    const techWorkOrders = workOrders.filter(wo => wo.assignedTechnicianId === CURRENT_TECH_ID);

    const handleDayClick = (day: Date) => {
        setDate(day);
    };

    const handleEventClick = (wo: WorkOrder) => {
        setSelectedEvent(wo);
        setIsDrawerOpen(true);
    };

    const handleRequestTimeOff = (formData: Omit<TimeOffRequest, 'id' | 'technicianId' | 'status'>) => {
        const newRequest: TimeOffRequest = {
            id: `tor-${Date.now()}`,
            technicianId: CURRENT_TECH_ID,
            status: 'pending',
            ...formData,
        };
        setTimeOffRequests(prev => [...prev, newRequest]);
        toast({ title: "Time Off Requested", description: "Your request has been submitted for admin approval." });
        setIsTimeOffDialogOpen(false);
    };

    const eventsForSelectedDay = techWorkOrders.filter(wo => wo.scheduleDate === format(date || new Date(), 'yyyy-MM-dd'));

    const TimeOffDialog = () => {
        const [formData, setFormData] = useState({ startDate: '', endDate: '', type: 'Vacation' as TimeOffRequest['type'], reason: '' });

        const handleSubmit = () => {
            if (!formData.startDate || !formData.endDate || !formData.reason) {
                toast({ variant: 'destructive', title: "Missing fields", description: "Please fill out all fields."});
                return;
            }
            handleRequestTimeOff(formData);
        }
        return (
            <Dialog open={isTimeOffDialogOpen} onOpenChange={setIsTimeOffDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Request Time Off</DialogTitle>
                        <DialogDescription>Submit a new request for time off. It will be sent to an administrator for approval.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="startDate" className="text-right">Start Date</Label>
                            <Input id="startDate" type="date" className="col-span-3" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})}/>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="endDate" className="text-right">End Date</Label>
                            <Input id="endDate" type="date" className="col-span-3" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})}/>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="type" className="text-right">Type</Label>
                             <Select onValueChange={(value: TimeOffRequest['type']) => setFormData({...formData, type: value})} defaultValue={formData.type}>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Vacation">Vacation</SelectItem>
                                    <SelectItem value="Sick">Sick Day</SelectItem>
                                    <SelectItem value="Personal">Personal</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="reason" className="text-right">Reason</Label>
                            <Textarea id="reason" className="col-span-3" placeholder="Briefly explain the reason for your request..." value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})}/>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" onClick={handleSubmit}>Submit Request</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <div>
            <header className="page-header">
                <div>
                    <h1 className="page-title">Schedule Terminal</h1>
                    <p className="page-subtitle">View your assignments and manage your schedule.</p>
                </div>
                <div className="page-header-right">
                    <Button onClick={() => setIsTimeOffDialogOpen(true)}><Plus size={16} className="mr-2"/> Request Time Off</Button>
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
            
            <TimeOffDialog />

        </div>
    );
}
