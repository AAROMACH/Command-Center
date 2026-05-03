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
import { Gauge, ShieldAlert, MapPin, Mail, Phone, Calendar as CalendarIcon, Plus, User, Activity, Timer, Settings2, Sliders } from 'lucide-react';
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
                 <div className="page-header-right">
                    <Button onClick={() => toast({ title: "Profile Updated", description: "Changes have been committed to your technician record."})}>
                        Commit Changes
                    </Button>
                </div>
            </header>
            
            <Tabs defaultValue="identity" className="w-full">
                <TabsList className="grid w-full grid-cols-4 max-w-3xl mb-8">
                    <TabsTrigger value="identity" className="flex items-center gap-2">
                        <User size={14}/> Identity
                    </TabsTrigger>
                    <TabsTrigger value="availability" className="flex items-center gap-2">
                        <Timer size={14}/> Availability
                    </TabsTrigger>
                    <TabsTrigger value="preferences" className="flex items-center gap-2">
                        <Settings2 size={14}/> Work Preferences
                    </TabsTrigger>
                    <TabsTrigger value="reliability" className="flex items-center gap-2">
                        <Activity size={14}/> Job Integrity
                    </TabsTrigger>
                </TabsList>

                <div className="mt-6">
                    {/* LAYER A: IDENTITY */}
                    <TabsContent value="identity">
                        <Card className="max-w-4xl">
                            <CardHeader>
                                <CardTitle>Technician Identity</CardTitle>
                                <CardDescription>Official low voltage personnel records and contact credentials.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-8">
                                <div className="flex items-center gap-8 pb-8 border-b border-border-main">
                                    <Avatar className="h-24 w-24 border-2 border-border-main">
                                       <AvatarImage asChild src={tech.avatarUrl} alt={tech.name} >
                                           <Image src={tech.avatarUrl} alt={tech.name} width={96} height={96} />
                                        </AvatarImage>
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
                                        <Label htmlFor="fullName" className="text-xs font-bold uppercase tracking-widest text-text-muted">Full Legal Name</Label>
                                        <Input id="fullName" defaultValue={tech.name} className="bg-bg-primary h-11" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-text-muted">Secure Email</Label>
                                        <div className="relative">
                                            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                            <Input id="email" type="email" defaultValue={tech.email} className="bg-bg-primary pl-9 h-11" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-widest text-text-muted">Primary Phone</Label>
                                        <div className="relative">
                                            <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                            <Input id="phone" type="tel" defaultValue={tech.phone} className="bg-bg-primary pl-9 h-11" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="address" className="text-xs font-bold uppercase tracking-widest text-text-muted">Operational Base address</Label>
                                        <div className="relative">
                                            <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                            <Input id="address" defaultValue={tech.address} className="bg-bg-primary pl-9 h-11" />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    
                    {/* LAYER B: OPERATIONAL STATUS (AVAILABILITY) */}
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
                                        <CardTitle>Schedule Exceptions</CardTitle>
                                        <CardDescription>Time off and absence logs.</CardDescription>
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

                    {/* LAYER C: WORK PREFERENCES */}
                    <TabsContent value="preferences">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <Card className="lg:col-span-2">
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

                                    <div className="space-y-6">
                                        <div className="flex justify-between items-end">
                                            <div className="space-y-1">
                                                <Label className="text-[10px] uppercase tracking-widest font-bold text-text-primary">Max Travel Distance</Label>
                                                <p className="text-xs text-text-muted">Hard limit for high-value infrastructure jobs.</p>
                                            </div>
                                            <span className="font-mono text-brand-red font-bold">{tech.workPreferences.maxTravelDistance} Miles</span>
                                        </div>
                                        <Slider 
                                            value={[tech.workPreferences.maxTravelDistance]} 
                                            max={250} 
                                            step={10}
                                            onValueChange={([val]) => handlePreferenceChange('maxTravelDistance', val)}
                                        />
                                    </div>

                                    <div className="space-y-4">
                                        <Label className="text-[10px] uppercase tracking-widest font-bold text-text-primary">Preferred Job Types</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {jobTypes.map(type => {
                                                const isSelected = tech.workPreferences.preferredJobTypes.includes(type);
                                                return (
                                                    <button
                                                        key={type}
                                                        onClick={() => {
                                                            const newTypes = isSelected 
                                                                ? tech.workPreferences.preferredJobTypes.filter(t => t !== type)
                                                                : [...tech.workPreferences.preferredJobTypes, type];
                                                            handlePreferenceChange('preferredJobTypes', newTypes);
                                                        }}
                                                        className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all border ${
                                                            isSelected 
                                                                ? 'bg-brand-red-dim border-brand-red text-text-primary' 
                                                                : 'bg-bg-primary border-border-subtle text-text-muted hover:border-text-muted'
                                                        }`}
                                                    >
                                                        {type}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-brand-red/20 bg-brand-red/5">
                                <CardHeader>
                                    <CardTitle className="text-brand-red flex items-center gap-2">
                                        <Sliders size={14}/>
                                        Dispatch Logic
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="flex items-center justify-between p-4 rounded-lg bg-bg-primary border border-border-subtle">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold text-text-primary uppercase tracking-widest">Availability Override</p>
                                            <p className="text-[10px] text-text-muted leading-tight">Allow Command Center to offer jobs outside standard hours.</p>
                                        </div>
                                        <Switch 
                                            checked={tech.workPreferences.availabilityOverride}
                                            onCheckedChange={(val) => handlePreferenceChange('availabilityOverride', val)}
                                        />
                                    </div>
                                    <div className="p-4 rounded-lg bg-bg-primary border border-border-subtle space-y-4">
                                         <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">System Note</p>
                                         <p className="text-[10px] text-text-secondary leading-normal">
                                            Jobs exceeding your max travel distance will require manual override and will be flagged for "Extended Travel" pay.
                                         </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* LAYER D: PERFORMANCE / RELIABILITY SCORE */}
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
                                            <p className="text-[9px] text-text-muted uppercase tracking-widest mt-1">Live Job Integrity Score</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="lg:col-span-2">
                                <CardHeader className="pb-4">
                                    <CardTitle className="flex items-center gap-2 text-[10px] tracking-[0.15em] uppercase">
                                        <ShieldAlert size={14} className="text-text-red" /> Penalty Ledger
                                    </CardTitle>
                                    <CardDescription>Official record of discrepancies and low voltage job failures.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="flex items-center justify-between p-4 rounded-lg bg-brand-red-dim/20 border border-border-red">
                                        <div>
                                            <p className="text-[10px] font-bold text-brand-red uppercase tracking-widest">30-Day Penalty Delta</p>
                                            <p className="text-2xl font-bold text-text-primary">-{penaltyPoints30d} Points</p>
                                        </div>
                                        <Activity size={32} className="text-brand-red opacity-50" />
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted mb-2">Job History</h4>
                                         {techPenaltyEvents.map(event => (
                                            <div key={event.id} className="text-[11px] p-4 rounded-md bg-bg-primary border border-border-subtle flex justify-between items-center">
                                                <div className="space-y-1">
                                                    <span className="font-bold text-text-primary uppercase tracking-wide">{event.reason}</span>
                                                    <div className="text-text-muted font-mono text-[10px]">{new Date(event.date + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                                                </div>
                                                <div className="text-right">
                                                    <span className="font-mono font-bold text-text-red text-sm">{event.points} PTS</span>
                                                </div>
                                            </div>
                                        ))}
                                        {techPenaltyEvents.length === 0 && (
                                            <div className="text-[11px] text-center p-12 border border-dashed border-border-main rounded-md text-text-muted italic">Clear record. No job discrepancies logged.</div>
                                        )}
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
                            <Textarea name="reason" placeholder="Brief explanation for Command Center audit..." className="bg-bg-primary" />
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
