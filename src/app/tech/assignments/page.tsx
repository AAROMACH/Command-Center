'use client';
import { useState, useEffect } from 'react';
import type { WorkOrder, TimeOffRequest } from '@/lib/types';
import { workOrders, timeOffRequests as initialTimeOffRequests } from '@/lib/data';
import { Calendar } from "@/components/ui/calendar";
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { MapPin, Clock, DollarSign, Plus, Calendar as CalendarIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DateRange } from 'react-day-picker';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

// Re-creating the dialog from profile page
const RequestTimeOffDialog = ({ 
    isOpen, 
    setIsOpen, 
    onSubmit 
}: { 
    isOpen: boolean, 
    setIsOpen: (open: boolean) => void, 
    onSubmit: (request: Omit<TimeOffRequest, 'id' | 'technicianId' | 'status'>) => void 
}) => {
    const [date, setDate] = useState<DateRange | undefined>();
    const [type, setType] = useState<TimeOffRequest['type'] | ''>('');
    const [reason, setReason] = useState('');
    const { toast } = useToast();

    const handleSubmit = () => {
        if (!date?.from || !date?.to || !type) {
            toast({ variant: 'destructive', title: 'Missing Information', description: 'Please select a date range and request type.' });
            return;
        }

        onSubmit({
            startDate: format(date.from, 'yyyy-MM-dd'),
            endDate: format(date.to, 'yyyy-MM-dd'),
            type: type as TimeOffRequest['type'],
            reason,
        });

        setDate(undefined);
        setType('');
        setReason('');
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Request Time Off</DialogTitle>
                    <DialogDescription>Select the dates and reason for your time off request.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label>Date Range</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    id="date"
                                    variant={"outline"}
                                    className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {date?.from ? (
                                        date.to ? (
                                            <>{format(date.from, "LLL dd, y")} - {format(date.to, "LLL dd, y")}</>
                                        ) : (format(date.from, "LLL dd, y"))
                                    ) : (<span>Pick a date range</span>)}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={setDate} numberOfMonths={2} />
                            </PopoverContent>
                        </Popover>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="request-type">Type</Label>
                        <Select value={type} onValueChange={(value) => setType(value as TimeOffRequest['type'])}>
                            <SelectTrigger id="request-type">
                                <SelectValue placeholder="Select request type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Vacation">Vacation</SelectItem>
                                <SelectItem value="Sick">Sick Day</SelectItem>
                                <SelectItem value="Personal">Personal</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="reason">Reason (Optional)</Label>
                        <Textarea id="reason" placeholder="Provide a brief reason for your request" value={reason} onChange={(e) => setReason(e.target.value)} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmit}>Submit Request</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};


export default function TechAssignmentsPage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [date, setDate] = useState<Date | undefined>(new Date('2024-07-28T12:00:00Z'));
    const [selectedEvent, setSelectedEvent] = useState<WorkOrder | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
    const [techTimeOffRequests, setTechTimeOffRequests] = useState<TimeOffRequest[]>([]);
    const { toast } = useToast();
    

    useEffect(() => {
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);
        if (userId) {
            setTechTimeOffRequests(initialTimeOffRequests.filter(r => r.technicianId === userId));
        }
    }, []);

    const techWorkOrders = workOrders.filter(wo => wo.assignedTechnicianId === currentTechId);

    const handleDayClick = (day: Date) => {
        setDate(day);
    };

    const handleEventClick = (wo: WorkOrder) => {
        setSelectedEvent(wo);
        setIsDrawerOpen(true);
    };

    const handleNewRequestSubmit = (newRequestData: Omit<TimeOffRequest, 'id' | 'technicianId' | 'status'>) => {
        if (!currentTechId) return;
        const newRequest: TimeOffRequest = {
            id: `tor-${Date.now()}`,
            technicianId: currentTechId,
            status: 'pending',
            ...newRequestData
        };
        setTechTimeOffRequests(prev => [newRequest, ...prev]);
        toast({ title: "Time Off Requested", description: "Your request has been submitted for admin approval." });
        setIsRequestDialogOpen(false);
    };


    const eventsForSelectedDay = techWorkOrders.filter(wo => wo.scheduleDate === format(date || new Date(), 'yyyy-MM-dd'));

    if (!currentTechId) {
        return <div>Loading...</div>;
    }

    return (
        <div>
            <header className="page-header">
                <div>
                    <h1 className="page-title">My Assignments</h1>
                    <p className="page-subtitle">View your assignments and manage your schedule & time off.</p>
                </div>
                 <div className="page-header-right">
                    <Button variant="outline" onClick={() => setIsRequestDialogOpen(true)}><Plus size={14} className="mr-2"/> Request Time Off</Button>
                </div>
            </header>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
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

            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Time Off Request History</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="table-wrap">
                        <Table>
                            <TableHeader><TableRow><TableHead>Dates</TableHead><TableHead>Type</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {techTimeOffRequests.map((request) => (
                                    <TableRow key={request.id}>
                                        <TableCell>{request.startDate} to {request.endDate}</TableCell>
                                        <TableCell><Badge variant="secondary" className="capitalize">{request.type}</Badge></TableCell>
                                        <TableCell className="text-text-muted">{request.reason}</TableCell>
                                        <TableCell>
                                            <Badge variant={request.status === 'approved' ? 'completed' : request.status === 'pending' ? 'onhold' : 'destructive'} className="capitalize">
                                                {request.status}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {techTimeOffRequests.length === 0 && (
                                    <TableRow><TableCell colSpan={4} className="text-center h-24">You have no time off requests.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
            
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
             <RequestTimeOffDialog
                isOpen={isRequestDialogOpen}
                setIsOpen={setIsRequestDialogOpen}
                onSubmit={handleNewRequestSubmit}
            />
        </div>
    );
}
