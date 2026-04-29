'use client';
import { useState, useMemo, useEffect } from 'react';
import type { Technician } from '@/lib/types';
import { technicians, penaltyEvents } from '@/lib/data';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from '@/hooks/use-toast';
import { Gauge, ShieldAlert } from 'lucide-react';

export default function TechProfilePage() {
    const [currentTechId, setCurrentTechId] = useState<string | null>(null);
    const [tech, setTech] = useState<Technician | undefined>(undefined);
    
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
                                <CardDescription>Set your recurring weekly work availability. This helps the dispatcher assign jobs. Time off can be requested from the Assignments page.</CardDescription>
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
                                        <div key={event.id} className="text-xs p-2 rounded-md bg-bg-primary border-border-subtle">
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
