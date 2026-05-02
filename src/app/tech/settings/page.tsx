
'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings as SettingsIcon, Bell, Shield, Smartphone, Mail, Key } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function TechSettingsPage() {
    const [mounted, setMounted] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return (
        <div>
             <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <SettingsIcon size={12} />
                        System Preferences
                    </p>
                    <h1 className="page-title">Settings</h1>
                    <p className="page-subtitle">Configure terminal behavior and communication protocols.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Bell size={16} className="text-brand-red"/>
                                Communication Protocols
                            </CardTitle>
                            <CardDescription>Manage how the Command Center alerts your device.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-lg bg-bg-primary border border-border-subtle">
                                <Label htmlFor="email-notifications" className="flex flex-col space-y-1 cursor-pointer">
                                    <span className="text-sm font-bold text-text-primary uppercase tracking-wider flex items-center gap-2"><Mail size={14}/> Email Alerts</span>
                                    <span className="text-xs text-text-muted">Receive mission briefings and schedule updates via encrypted email.</span>
                                </Label>
                                <Switch id="email-notifications" defaultChecked />
                            </div>
                            <div className="flex items-center justify-between p-4 rounded-lg bg-bg-primary border border-border-subtle">
                                <Label htmlFor="push-notifications" className="flex flex-col space-y-1 cursor-pointer">
                                    <span className="text-sm font-bold text-text-primary uppercase tracking-wider flex items-center gap-2"><Smartphone size={14}/> Push Notifications</span>
                                    <span className="text-xs text-text-muted">Get real-time tactical alerts on your mobile device.</span>
                                </Label>
                                <Switch id="push-notifications" defaultChecked/>
                            </div>
                            <div className="flex items-center justify-between p-4 rounded-lg bg-bg-primary border border-border-subtle">
                                <Label htmlFor="sms-notifications" className="flex flex-col space-y-1 cursor-pointer">
                                    <span className="text-sm font-bold text-text-primary uppercase tracking-wider flex items-center gap-2"><Smartphone size={14}/> SMS Critical Alerts</span>
                                    <span className="text-xs text-text-muted">Emergency communication for high-priority mission changes.</span>
                                </Label>
                                <Switch id="sms-notifications" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Shield size={16} className="text-accent-gold"/>
                                Security Terminal
                            </CardTitle>
                            <CardDescription>Manage access credentials and session security.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-lg bg-bg-primary border border-border-subtle">
                                <div>
                                    <p className="text-sm font-bold text-text-primary uppercase tracking-wider">Change Password</p>
                                    <p className="text-xs text-text-muted">Update your Command Center access key.</p>
                                </div>
                                <Button variant="outline" size="sm"><Key size={14} className="mr-2"/> Reset Key</Button>
                            </div>
                            <div className="flex items-center justify-between p-4 rounded-lg bg-bg-primary border border-border-subtle">
                                <div>
                                    <p className="text-sm font-bold text-text-primary uppercase tracking-wider">Session Management</p>
                                    <p className="text-xs text-text-muted">Currently active on this device.</p>
                                </div>
                                <Button variant="destructive-outline" size="sm" onClick={() => toast({ title: "Session Cleared", description: "All other active sessions have been terminated."})}>Log Out Other Devices</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="bg-brand-red-dim/10 border-border-red">
                        <CardHeader>
                            <CardTitle className="text-brand-red">System Information</CardTitle>
                        </CardHeader>
                        <CardContent className="text-[10px] space-y-2 uppercase tracking-widest text-text-muted">
                            <div className="flex justify-between border-b border-border-red/20 pb-2">
                                <span>Build Version</span>
                                <span className="text-text-primary font-mono">1.4.2-STABLE</span>
                            </div>
                            <div className="flex justify-between border-b border-border-red/20 pb-2">
                                <span>Protocol</span>
                                <span className="text-text-primary font-mono">ENCRYPTED-V3</span>
                            </div>
                            <div className="flex justify-between border-b border-border-red/20 pb-2">
                                <span>Node Location</span>
                                <span className="text-text-primary font-mono">US-EAST-1</span>
                            </div>
                        </CardContent>
                    </Card>
                    <Button className="w-full h-12" onClick={() => toast({ title: "Settings Saved", description: "System preferences updated."})}>
                        Save System Preferences
                    </Button>
                </div>
            </div>
        </div>
    );
}

