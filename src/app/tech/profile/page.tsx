'use client';
import { useState, useMemo, useEffect } from 'react';
import type { Technician, TimeOffRequest } from '@/lib/types';
import { technicians, penaltyEvents, timeOffRequests as initialTimeOffRequests } from '@/lib/data';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { Gauge, ShieldAlert, MapPin, Mail, Phone, Calendar as CalendarIcon, Clock, Plus, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export default function TechProfilePage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [tech, setTech] = useState<Technician | undefined>(undefined);
    const [myTimeOff, setMyTimeOff] = useState<TimeOffRequest[]>([]);
    const [mounted, setMounted] = useState(false);
    const { toast } = useToast();
    
    const [isTimeOffDialogOpen, setIsTimeOffDialogOpen] = useState(false);

    useEffect(() => {
        setMounted(true);
        const userId = localStorage.getItem('currentUserId');
        setCurrentTechId(userId);
        if (userId) {
            setTech(technicians.find(t => t.id === userId));
            setMyTimeOff(initialTimeOffRequests.filter(r => r.technicianId === userId));
        }
    }, []);

    const techPenaltyEvents = useMemo(() => {
        if (!currentTechId) return [];
        return penaltyEvents.filter(p => p.technicianId === currentTechId);
    }, [currentTechId]);

    if (!mounted || !currentTechId || !tech) {
        return <div className="p-8 text-center uppercase tracking-widest text-text-muted text-xs">Loading Profile...</div>;
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

    const handleRequestTimeOff = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const newRequest: TimeOffRequest = {
            id: `tor-${Date.now()}`,
            technicianId: currentTechId,
            startDate: formData.get('startDate') as string,
            endDate: formData.get('endDate') as string,
            type: formData.get('type') as any,
            reason: formData.get('reason') as string,
            status: 'pending'
        };
        setMyTimeOff([newRequest, ...myTimeOff]);
        setIsTimeOffDialogOpen(false);
        toast({ title: "Request Submitted", description: "Your time off request is pending admin approval." });
    };

    const reliabilityScore = tech.reliabilityScore;
    const reliabilityColor = reliabilityScore > 90 ? 'text-text-green' : reliabilityScore > 80 ? 'text-accent-gold' : 'text-text-red';
    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    return (
        <div>
             <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <Settings size={12} />
                        Personal Management
                    </p>
                    <h1 className="page-title">My Profile</h1>
                    <p className="page-subtitle">Configure your operational identity, availability, and system settings.</p>
                </div>
                 <div className="page-header-right">
                    <Button onClick={() => toast({ title: "Changes Saved", description: "Your profile has been updated."})}>Save Changes</Button>
                </div>
            </header>
            
            <Tabs defaultValue="personal" className="w-full">
                <TabsList className="grid w-full grid-cols-3 max-w-xl mb-8">
                    <TabsTrigger value="personal">Personal Info</TabsTrigger>
                    <TabsTrigger value="availability">Availability</TabsTrigger>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>

                <div className="mt-6">
                    {/* PERSONAL INFO & PERFORMANCE */}
                    <TabsContent value="personal" className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <Card className="lg:col-span-2">
                                <CardHeader>
                                    <CardTitle>Core Identity</CardTitle>
                                    <CardDescription>Official personnel records and contact information.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="flex items-center gap-6 pb-6 border-b border-border-main">
                                        <Avatar className="h-20 w-20">
                                           <AvatarImage asChild src={tech.avatarUrl} alt={tech.name} >
                                               <Image src={tech.avatarUrl} alt={tech.name} width={80} height={80} />
                                            </AvatarImage>
                                            <AvatarFallback>{tech.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div className="space-y-2">
                                            <Button variant="outline" size="sm">Change Avatar</Button>
                                            <p className="text-[10px] uppercase tracking-widest text-text-muted">ID: {tech.id}</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="fullName" className="text-xs font-bold uppercase tracking-widest text-text-muted">Full Name</Label>
                                            <Input id="fullName" defaultValue={tech.name} className="bg-bg-primary" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-text-muted">Email Address</Label>
                                            <div className="relative">
                                                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                                <Input id="email" type="email" defaultValue={tech.email} className="bg-bg-primary pl-9" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-widest text-text-muted">Phone Number</Label>
                                            <div className="relative">
                                                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                                <Input id="phone" type="tel" defaultValue={tech.phone} className="bg-bg-primary pl-9" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="address" className="text-xs font-bold uppercase tracking-widest text-text-muted">Home Address</Label>
                                            <div className="relative">
                                                <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                                <Input id="address" defaultValue={tech.address} className="bg-bg-primary pl-9" />
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <div className="space-y-6">
                                <Card className="border-accent-gold/20 bg-accent-gold/5">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="flex items-center gap-2 text-[10px] tracking-[0.15em] text-accent-gold">
                                            <Gauge size={14}/> Reliability Metric
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-center py-4">
                                            <p className={`text-6xl font-bold ${reliabilityColor}`}>{reliabilityScore}%</p>
                                            <p className="text-[9px] text-text-muted uppercase tracking-widest mt-2">Operational Integrity Score</p>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="flex items-center gap-2 text-[10px] tracking-[0.15em]">
                                            <ShieldAlert size={14} className="text-text-red" /> Penalty Events
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-2">
                                         {techPenaltyEvents.map(event => (
                                            <div key={event.id} className="text-[10px] p-2.5 rounded-md bg-bg-primary border border-border-subtle">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="font-bold text-text-secondary uppercase">{event.reason}</span>
                                                    <span className="font-mono font-bold text-text-red">{event.points} PTS</span>
                                                </div>
                                                <div className="text-text-muted font-mono">{new Date(event.date + 'T12:00:00').toLocaleDateString()}</div>
                                            </div>
                                        ))}
                                        {techPenaltyEvents.length === 0 && (
                                            <div className="text-[10px] text-center p-6 text-text-muted italic">Clear record. No discrepancies logged.</div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </TabsContent>
                    
                    {/* AVAILABILITY & TIME OFF */}
                    <TabsContent value="availability" className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <Card className="lg:col-span-2">
                                <CardHeader>
                                    <CardTitle>Tactical Availability</CardTitle>
                                    <CardDescription>Set your recurring weekly work hours. These windows are used for mission dispatch.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {daysOfWeek.map(day => (
                                        <div key={day} className="grid grid-cols-4 items-center gap-4 p-3 rounded-md bg-bg-primary border border-border-subtle">
                                            <Label className="font-bold text-[11px] uppercase tracking-widest text-text-primary">{day}</Label>
                                            <Input
                                                type="time"
                                                value={tech.availability[day.toLowerCase() as keyof typeof tech.availability]?.start || ''}
                                                onChange={e => handleAvailabilityChange(day.toLowerCase(), 'start', e.target.value)}
                                                className="bg-bg-secondary border-border-subtle h-8 text-xs"
                                            />
                                            <Input
                                                type="time"
                                                value={tech.availability[day.toLowerCase() as keyof typeof tech.availability]?.end || ''}
                                                onChange={e => handleAvailabilityChange(day.toLowerCase(), 'end', e.target.value)}
                                                className="bg-bg-secondary border-border-subtle h-8 text-xs"
                                            />
                                             <Button variant="ghost" size="sm" className="text-[10px] hover:text-text-red" onClick={() => setTech(prev => prev ? ({ ...prev, availability: {...prev.availability, [day.toLowerCase()]: null} }) : undefined)}>
                                                Unavailable
                                            </Button>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                                    <div>
                                        <CardTitle>Time Off Requests</CardTitle>
                                        <CardDescription>Specific dates requested for absence.</CardDescription>
                                    </div>
                                    <Dialog open={isTimeOffDialogOpen} onOpenChange={setIsTimeOffDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button size="icon" variant="outline" className="h-8 w-8"><Plus size={14}/></Button>
                                        </DialogTrigger>
                                        <DialogContent className="bg-bg-elevated border-border-main">
                                            <DialogHeader>
                                                <DialogTitle className="text-text-primary uppercase tracking-wider font-bold">Request Absence</DialogTitle>
                                                <DialogDescription>Submit specific dates for vacation, sick leave, or personal time.</DialogDescription>
                                            </DialogHeader>
                                            <form onSubmit={handleRequestTimeOff} className="space-y-4 py-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <Label className="text-[10px] uppercase tracking-widest text-text-muted">Start Date</Label>
                                                        <Input type="date" name="startDate" required className="bg-bg-primary" />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label className="text-[10px] uppercase tracking-widest text-text-muted">End Date</Label>
                                                        <Input type="date" name="endDate" required className="bg-bg-primary" />
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] uppercase tracking-widest text-text-muted">Type</Label>
                                                    <Select name="type" defaultValue="Vacation">
                                                        <SelectTrigger className="bg-bg-primary"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="Vacation">Vacation</SelectItem>
                                                            <SelectItem value="Sick">Sick Leave</SelectItem>
                                                            <SelectItem value="Personal">Personal Time</SelectItem>
                                                            <SelectItem value="Other">Other</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] uppercase tracking-widest text-text-muted">Reason</Label>
                                                    <Textarea name="reason" placeholder="Brief explanation..." className="bg-bg-primary" />
                                                </div>
                                                <DialogFooter>
                                                    <Button type="submit">Submit Request</Button>
                                                </DialogFooter>
                                            </form>
                                        </DialogContent>
                                    </Dialog>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {myTimeOff.length === 0 ? (
                                        <div className="text-[10px] text-center p-8 border border-dashed border-border-main rounded-md text-text-muted uppercase tracking-widest">No active requests</div>
                                    ) : (
                                        myTimeOff.map(req => (
                                            <div key={req.id} className="p-3 rounded-md bg-bg-primary border border-border-subtle">
                                                <div className="flex justify-between items-start mb-2">
                                                    <Badge variant={req.status === 'approved' ? 'active' : req.status === 'denied' ? 'missed' : 'pending'} className="text-[9px] uppercase tracking-widest">
                                                        {req.status}
                                                    </Badge>
                                                    <span className="text-[10px] font-bold text-text-muted">{req.type}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-[11px] font-bold text-text-primary">
                                                    <CalendarIcon size={12} className="text-brand-red"/>
                                                    {req.startDate} — {req.endDate}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* SETTINGS / NOTIFICATIONS */}
                    <TabsContent value="settings">
                         <Card className="max-w-2xl">
                            <CardHeader>
                                <CardTitle>System Settings & Notifications</CardTitle>
                                <CardDescription>Configure how the command center communicates with your device.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-4 rounded-lg bg-bg-primary border border-border-subtle">
                                        <Label htmlFor="email-notifications" className="flex flex-col space-y-1 cursor-pointer">
                                            <span className="text-sm font-bold text-text-primary uppercase tracking-wider">Email Alerts</span>
                                            <span className="text-xs text-text-muted">Receive mission briefings and schedule updates via email.</span>
                                        </Label>
                                        <Switch id="email-notifications" defaultChecked />
                                    </div>
                                    <div className="flex items-center justify-between p-4 rounded-lg bg-bg-primary border border-border-subtle">
                                        <Label htmlFor="push-notifications" className="flex flex-col space-y-1 cursor-pointer">
                                            <span className="text-sm font-bold text-text-primary uppercase tracking-wider">Push Notifications</span>
                                            <span className="text-xs text-text-muted">Get real-time tactical alerts on your mobile device.</span>
                                        </Label>
                                        <Switch id="push-notifications" defaultChecked/>
                                    </div>
                                    <div className="flex items-center justify-between p-4 rounded-lg bg-bg-primary border border-border-subtle">
                                        <Label htmlFor="sms-notifications" className="flex flex-col space-y-1 cursor-pointer">
                                            <span className="text-sm font-bold text-text-primary uppercase tracking-wider">SMS Critical Alerts</span>
                                            <span className="text-xs text-text-muted">Emergency communication for high-priority mission changes.</span>
                                        </Label>
                                        <Switch id="sms-notifications" />
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-border-main">
                                    <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted mb-4">Security</h4>
                                    <Button variant="outline" className="w-full justify-start h-10">
                                        <Clock size={16} className="mr-2 opacity-50" />
                                        Update Password
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
