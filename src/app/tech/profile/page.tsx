'use client';
import { useState, useMemo, useEffect } from 'react';
import type { Technician, TimeOffRequest } from '@/lib/types';
import { technicians, penaltyEvents, timeOffRequests as initialTimeOffRequests } from '@/lib/data';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { Gauge, ShieldAlert, MapPin, Mail, Phone, Calendar as CalendarIcon, Plus, User, Activity, Timer, Settings2, Sliders, Search, Banknote } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { subDays, isAfter } from 'date-fns';

export default function TechProfilePage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [tech, setTech] = useState<Technician | undefined>(undefined);
    const [myTimeOff, setMyTimeOff] = useState<TimeOffRequest[]>([]);
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
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

    const penaltyPoints30d = useMemo(() => {
        const thirtyDaysAgo = subDays(new Date(), 30);
        return techPenaltyEvents
            .filter(e => isAfter(new Date(e.date), thirtyDaysAgo))
            .reduce((acc, curr) => acc + Math.abs(curr.points), 0);
    }, [techPenaltyEvents]);

    if (!mounted || !currentTechId || !tech) {
        return <div className="p-8 text-center uppercase tracking-widest text-text-muted text-xs">Loading Technician Profile...</div>;
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

    const handlePreferenceChange = (field: keyof Technician['workPreferences'], value: any) => {
        setTech(prev => prev ? ({
            ...prev,
            workPreferences: {
                ...prev.workPreferences,
                [field]: value
            }
        }) : undefined);
    };

    const handlePayoutPreferenceChange = (field: string, value: string) => {
        setTech(prev => prev ? ({
            ...prev,
            payoutPreferences: {
                method: 'ACH',
                ...(prev.payoutPreferences || {}),
                [field]: value
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
    const reliabilityStatus = reliabilityScore > 90 ? 'OPERATIONAL' : reliabilityScore > 80 ? 'MONITORED' : 'RESTRICTED';
    
    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const jobTypes = ['Low Voltage Cabling', 'Network Infrastructure', 'Security Systems', 'Electrical Repair', 'Fiber Optics', 'AV Fit-out', 'Smart Home Integration'];

    return (
        <div>
             <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <User size={12} />
                        Identity & Field Readiness
                    </p>
                    <h1 className="page-title">Technician Profile</h1>
                    <p className="page-subtitle">Master field record for {tech.name}. Restricted terminal access.</p>
                </div>
                 <div className="page-header-right items-center">
                    <div className="search-wrap">
                        <Search />
                        <input 
                            className="search-input !w-full md:!w-[250px]" 
                            placeholder="Find detail..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <Button onClick={() => toast({ title: "Profile Updated", description: "Changes have been committed to your technician record."})}>
                        Commit Changes
                    </Button>
                </div>
            </header>
            
            <Tabs defaultValue="identity" className="w-full">
                <TabsList className="grid w-full grid-cols-5 max-w-4xl mb-8">
                    <TabsTrigger value="identity" className="flex items-center gap-2">
                        <User size={14}/> Identity
                    </TabsTrigger>
                    <TabsTrigger value="payouts" className="flex items-center gap-2">
                        <Banknote size={14}/> Payouts
                    </TabsTrigger>
                    <TabsTrigger value="availability" className="flex items-center gap-2">
                        <Timer size={14}/> Availability
                    </TabsTrigger>
                    <TabsTrigger value="preferences" className="flex items-center gap-2">
                        <Settings2 size={14}/> Work Prefs
                    </TabsTrigger>
                    <TabsTrigger value="reliability" className="flex items-center gap-2">
                        <Activity size={14}/> Job Integrity
                    </TabsTrigger>
                </TabsList>

                <div className="mt-6">
                    {/* IDENTITY */}
                    <TabsContent value="identity">
                        <Card className="max-w-4xl">
                            <CardHeader>
                                <CardTitle>Technician Identity</CardTitle>
                                <CardDescription>Official low voltage personnel records and contact credentials.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-8">
                                <div className="flex items-center gap-8 pb-8 border-b border-border-main">
                                    <Avatar className="h-24 w-24 border-2 border-border-main">
                                       <AvatarImage src={tech.avatarUrl} alt={tech.name} />
                                        <AvatarFallback className="text-2xl">{tech.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div className="space-y-3">
                                        <Button variant="outline" size="sm">Update Photo</Button>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Technician ID</p>
                                            <p className="font-mono text-xs text-brand-red">{tech.id}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase tracking-widest text-text-muted">Full Legal Name</Label>
                                        <Input defaultValue={tech.name} className="bg-bg-primary h-11" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase tracking-widest text-text-muted">Secure Email</Label>
                                        <Input type="email" defaultValue={tech.email} className="bg-bg-primary h-11" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* PAYOUT PREFERENCES */}
                    <TabsContent value="payouts">
                        <Card className="max-w-4xl">
                            <CardHeader>
                                <CardTitle>Payout Preferences</CardTitle>
                                <CardDescription>Configure how you prefer to receive field payouts and reimbursements.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase tracking-widest text-text-muted">Preferred Payment Method</Label>
                                        <Select 
                                            value={tech.payoutPreferences?.method || 'ACH'} 
                                            onValueChange={(val) => handlePayoutPreferenceChange('method', val)}
                                        >
                                            <SelectTrigger className="bg-bg-primary h-11">
                                                <SelectValue placeholder="Select method..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ACH">ACH Bank Transfer</SelectItem>
                                                <SelectItem value="Check">Physical Check</SelectItem>
                                                <SelectItem value="Zelle">Zelle</SelectItem>
                                                <SelectItem value="Venmo">Venmo</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold uppercase tracking-widest text-text-muted">Reference Note</Label>
                                        <Input 
                                            placeholder="e.g., Zelle phone or email..."
                                            value={tech.payoutPreferences?.notes || ''} 
                                            onChange={(e) => handlePayoutPreferenceChange('notes', e.target.value)}
                                            className="bg-bg-primary h-11" 
                                        />
                                    </div>
                                </div>
                                <div className="p-4 rounded-lg bg-bg-tertiary border border-border-sub">
                                    <p className="text-[10px] text-text-muted uppercase font-bold tracking-widest leading-relaxed">
                                        Note: For your protection, actual bank account and routing numbers are managed externally via secure administrative handshake. Use this section for tracking preferences only.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    
                    {/* AVAILABILITY */}
                    <TabsContent value="availability" className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <Card className="lg:col-span-2">
                                <CardHeader>
                                    <CardTitle>Recurring Job availability</CardTitle>
                                    <CardDescription>Default weekly availability for job dispatch.</CardDescription>
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
                                        <CardTitle>Exceptions</CardTitle>
                                        <CardDescription>Time off requests.</CardDescription>
                                    </div>
                                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setIsTimeOffDialogOpen(true)}><Plus size={14}/></Button>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {myTimeOff.length === 0 ? (
                                        <div className="text-[10px] text-center p-8 border border-dashed border-border-main rounded-md text-text-muted uppercase tracking-widest">No active exceptions</div>
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

                    {/* WORK PREFERENCES */}
                    <TabsContent value="preferences">
                        <Card className="max-w-4xl">
                            <CardHeader>
                                <CardTitle>Job Constraints</CardTitle>
                                <CardDescription>Define your low voltage job limits for automated assignment logic.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-10">
                                <div className="space-y-6">
                                    <div className="flex justify-between items-end">
                                        <div className="space-y-1">
                                            <Label className="text-[10px] uppercase tracking-widest font-bold text-text-primary">Preferred Work Radius</Label>
                                            <p className="text-xs text-text-muted">Target distance for daily field jobs.</p>
                                        </div>
                                        <span className="font-mono text-brand-red font-bold">{tech.workPreferences.preferredRadius} Miles</span>
                                    </div>
                                    <Slider 
                                        value={[tech.workPreferences.preferredRadius]} 
                                        max={100} 
                                        step={5}
                                        onValueChange={([val]) => handlePreferenceChange('preferredRadius', val)}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* RELIABILITY */}
                    <TabsContent value="reliability" className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <Card className="border-accent-gold/20 bg-accent-gold/5">
                                <CardHeader className="pb-2">
                                    <CardTitle className="flex items-center gap-2 text-[10px] tracking-[0.15em] text-accent-gold uppercase">
                                        <Gauge size={14}/> operational Integrity
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-center py-6">
                                        <p className={`text-7xl font-bold ${reliabilityColor}`}>{reliabilityScore}%</p>
                                        <div className="mt-4 flex flex-col items-center gap-1">
                                            <Badge variant={reliabilityScore > 90 ? 'active' : 'onhold'} className="h-6 px-4 text-xs">
                                                {reliabilityStatus}
                                            </Badge>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                </div>
            </Tabs>

            <Dialog open={isTimeOffDialogOpen} onOpenChange={setIsTimeOffDialogOpen}>
                <DialogContent className="bg-bg-elevated border-border-main">
                    <DialogHeader>
                        <DialogTitle className="text-text-primary uppercase tracking-wider font-bold">Request absence</DialogTitle>
                        <DialogDescription>Submit specific dates for vacation or maintenance leave.</DialogDescription>
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
        </div>
    );
}