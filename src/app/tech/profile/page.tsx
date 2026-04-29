'use client';
import { useState, useMemo, useEffect } from 'react';
import type { Technician, TimeOffRequest } from '@/lib/types';
import { technicians, timeOffRequests as initialTimeOffRequests, penaltyEvents } from '@/lib/data';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Gauge, ShieldAlert, Plus, Calendar as CalendarIcon } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

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
            type: type as TimeOffRequest['type'], // Already validated
            reason,
        });

        // Reset form
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


export default function TechProfilePage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [tech, setTech] = useState<Technician | undefined>(undefined);
    const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
    
    const [techTimeOffRequests, setTechTimeOffRequests] = useState<TimeOffRequest[]>([]);
    
    const techPenaltyEvents = useMemo(() => {
        if (!currentTechId) return [];
        return penaltyEvents.filter(p => p.technicianId === currentTechId);
    }, [currentTechId]);

    const { toast } = useToast();
    
    useEffect(() => {
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);
        if (userId) {
            setTech(technicians.find(t => t.id === userId));
            setTechTimeOffRequests(initialTimeOffRequests.filter(r => r.technicianId === userId));
        }
    }, []);

    if (!currentTechId || !tech) {
        return <div>Loading...</div>;
    }
    
    const handleAvailabilityChange = (day: string, field: 'start' | 'end', value: string) => {
        setTech(prev => prev ? ({
            ...prev,
            availability: {
                ...prev.availability,
                [day]: {
                    // @ts-ignore
                    ...prev.availability[day],
                    [field]: value,
                }
            }
        }) : undefined);
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

    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    return (
        <div>
             <header className="page-header">
                <div>
                    <h1 className="page-title">My Profile</h1>
                    <p className="page-subtitle">Manage your personal information, availability, and notification preferences.</p>
                </div>
                 <div className="page-header-right">
                    <Button onClick={() => toast({ title: "Changes Saved", description: "Your profile has been updated."})}>Save Changes</Button>
                </div>
            </header>
            
            <Tabs defaultValue="personal" className="w-full">
                <TabsList className="grid w-full grid-cols-4 max-w-2xl">
                    <TabsTrigger value="personal">Personal Info</TabsTrigger>
                    <TabsTrigger value="availability">Availability</TabsTrigger>
                    <TabsTrigger value="performance">Performance</TabsTrigger>
                    <TabsTrigger value="notifications">Notifications</TabsTrigger>
                </TabsList>
                <div className="mt-6">
                    <TabsContent value="personal">
                         <Card>
                            <CardHeader>
                                <CardTitle>Personal Information</CardTitle>
                                <CardDescription>Update your photo and personal details here.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center gap-6">
                                    <Avatar className="h-20 w-20">
                                       <AvatarImage asChild src={tech.avatarUrl} alt={tech.name} >
                                           <Image src={tech.avatarUrl} alt={tech.name} width={80} height={80} />
                                        </AvatarImage>
                                        <AvatarFallback>{tech.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div className="space-y-2">
                                        <Button variant="outline">Change Avatar</Button>
                                        <p className="text-xs text-text-muted">JPG, GIF or PNG. 1MB max.</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="fullName">Full Name</Label>
                                        <Input id="fullName" defaultValue={tech.name} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email Address</Label>
                                        <Input id="email" type="email" defaultValue={tech.email} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="phone">Phone Number</Label>
                                        <Input id="phone" type="tel" defaultValue={tech.phone} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    
                    <TabsContent value="availability">
                        <Card>
                             <CardHeader>
                                <CardTitle>Tactical Availability</CardTitle>
                                <CardDescription>Set your recurring weekly work availability. This helps the dispatcher assign jobs.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {daysOfWeek.map(day => (
                                    <div key={day} className="grid grid-cols-4 items-center gap-4 p-2 rounded-md bg-bg-primary">
                                        <Label className="font-semibold text-text-primary">{day}</Label>
                                        <Input
                                            type="time"
                                            value={tech.availability[day.toLowerCase() as keyof typeof tech.availability]?.start || ''}
                                            onChange={e => handleAvailabilityChange(day.toLowerCase(), 'start', e.target.value)}
                                            className="bg-bg-secondary border-border-subtle"
                                        />
                                        <Input
                                            type="time"
                                            value={tech.availability[day.toLowerCase() as keyof typeof tech.availability]?.end || ''}
                                            onChange={e => handleAvailabilityChange(day.toLowerCase(), 'end', e.target.value)}
                                            className="bg-bg-secondary border-border-subtle"
                                        />
                                         <Button variant="outline" size="sm" onClick={() => setTech(prev => prev ? ({ ...prev, availability: {...prev.availability, [day.toLowerCase()]: null} }) : undefined)}>
                                            Mark as Unavailable
                                        </Button>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                         <Card className="mt-6">
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle>Time Off Requests</CardTitle>
                                    <Button variant="outline" onClick={() => setIsRequestDialogOpen(true)}><Plus size={14} className="mr-2"/> New Request</Button>
                                </div>
                                <CardDescription>Your history of time off requests and their current status.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="table-wrap">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Dates</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Reason</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
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
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center h-24">
                                                    You have no time off requests.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                                </div>
                            </CardContent>
                        </Card>

                        <RequestTimeOffDialog
                            isOpen={isRequestDialogOpen}
                            setIsOpen={setIsRequestDialogOpen}
                            onSubmit={handleNewRequestSubmit}
                        />

                    </TabsContent>
                    
                    <TabsContent value="performance">
                        <div className="grid grid-cols-2 gap-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2"><Gauge size={14}/> Reliability Score</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-center">
                                        <p className="text-6xl font-bold text-text-green">{tech.reliabilityScore}%</p>
                                        <p className="text-xs text-text-muted">A measure of your on-time performance and adherence to procedures.</p>
                                    </div>
                                </CardContent>
                            </Card>
                             <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2"><ShieldAlert size={14}/> Penalty Events</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                     {techPenaltyEvents.map(event => (
                                        <div key={event.id} className="text-xs p-2 rounded-md bg-bg-primary border border-border-subtle">
                                            <div className="flex justify-between">
                                                <span className="font-semibold text-text-secondary">{event.reason}</span>
                                                <span className="font-bold text-text-red">{event.points} pts</span>
                                            </div>
                                            <div className="text-text-muted">{new Date(event.date).toLocaleDateString()}</div>
                                        </div>
                                    ))}
                                    {techPenaltyEvents.length === 0 && <p className="text-xs text-text-muted">No penalty events on record. Keep up the great work!</p>}
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="notifications">
                         <Card>
                            <CardHeader>
                                <CardTitle>Notifications</CardTitle>
                                <CardDescription>Choose how you want to be notified about assignments and system alerts.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="email-notifications" className="flex flex-col space-y-1">
                                        <span>New Assignment Alerts</span>
                                        <span className="font-normal leading-snug text-text-muted">
                                            Receive an email when a new job is assigned to you.
                                        </span>
                                    </Label>
                                    <Switch id="email-notifications" defaultChecked />
                                </div>
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="push-notifications" className="flex flex-col space-y-1">
                                        <span>In-App Push Notifications</span>
                                        <span className="font-normal leading-snug text-text-muted">
                                            Get real-time alerts within the mobile app.
                                        </span>
                                    </Label>
                                    <Switch id="push-notifications" defaultChecked/>
                                </div>
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="sms-notifications" className="flex flex-col space-y-1">
                                        <span>Critical Alerts via SMS</span>
                                        <span className="font-normal leading-snug text-text-muted">
                                            For last-minute changes or critical priority jobs.
                                        </span>
                                    </Label>
                                    <Switch id="sms-notifications" />
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
