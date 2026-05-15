'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Bell, 
  Shield, 
  Key, 
  Settings as SettingsIcon, 
  Eye, 
  Monitor, 
  Database,
  ShieldCheck,
  History,
  Download,
  Moon,
  Sun,
  LocateFixed,
  UserCheck,
  MapPin
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

export default function TechSettingsPage() {
    const [mounted, setMounted] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleToggle = (setting: string) => {
        toast({
            title: "Configuration Synced",
            description: `${setting} has been updated in your master profile.`,
        });
    };

    if (!mounted) return null;

    return (
        <div className="max-w-4xl mx-auto">
             <header className="page-header">
                <div>
                    <p className="page-eyebrow flex items-center gap-2">
                        <SettingsIcon size={12} />
                        Terminal Configuration
                    </p>
                    <h1 className="page-title">System Settings</h1>
                    <p className="page-subtitle">Manage comms settings, security layers, and UI preferences.</p>
                </div>
             </header>

            <Tabs defaultValue="notifications" className="w-full">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 mb-8">
                    <TabsTrigger value="notifications" className="flex items-center gap-2 py-3">
                        <Bell size={14}/> Notifications
                    </TabsTrigger>
                    <TabsTrigger value="security" className="flex items-center gap-2 py-3">
                        <Shield size={14}/> Security
                    </TabsTrigger>
                    <TabsTrigger value="privacy" className="flex items-center gap-2 py-3">
                        <Eye size={14}/> Privacy
                    </TabsTrigger>
                    <TabsTrigger value="experience" className="flex items-center gap-2 py-3">
                        <Monitor size={14}/> Experience
                    </TabsTrigger>
                    <TabsTrigger value="account" className="flex items-center gap-2 py-3">
                        <Database size={14}/> Account & Data
                    </TabsTrigger>
                </TabsList>

                <div className="mt-6">
                    {/* NOTIFICATIONS */}
                    <TabsContent value="notifications" className="m-0 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Trigger Management</CardTitle>
                                <CardDescription>Define which low voltage job events generate system alerts.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {[
                                    { id: 'n-1', label: 'New Jobs', desc: 'Alert when a new low voltage job is assigned to you.' },
                                    { id: 'n-2', label: 'Job Updates', desc: 'Alert when site details or wiring requirements change.' },
                                    { id: 'n-3', label: 'Schedule Changes', desc: 'Alert when start times or job dates are modified.' },
                                    { id: 'n-4', label: 'Pay & Earnings', desc: 'Alert when field logs are approved or payouts initiated.' },
                                    { id: 'n-5', label: 'Job Integrity Alerts', desc: 'Alert when a penalty or score adjustment occurs.' },
                                ].map((item) => (
                                    <div key={item.id} className="flex items-center justify-between p-3 rounded-md bg-bg-primary border border-border-sub">
                                        <div className="space-y-0.5">
                                            <p className="text-xs font-bold uppercase tracking-wider">{item.label}</p>
                                            <p className="text-[10px] text-text-muted">{item.desc}</p>
                                        </div>
                                        <Switch defaultChecked onCheckedChange={() => handleToggle(item.label)} />
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Notification Timing</CardTitle>
                                <CardDescription>Control alert behavior and delivery frequency.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] uppercase tracking-widest text-text-muted">Quiet Hours Start</Label>
                                        <Input type="time" defaultValue="22:00" className="bg-bg-primary" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] uppercase tracking-widest text-text-muted">Quiet Hours End</Label>
                                        <Input type="time" defaultValue="07:00" className="bg-bg-primary" />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between p-3 rounded-md bg-bg-primary border border-border-sub">
                                    <div className="space-y-0.5">
                                        <p className="text-xs font-bold uppercase tracking-wider">Field Emergency Bypass</p>
                                        <p className="text-[10px] text-text-muted">Allow critical field job alerts to bypass quiet hours.</p>
                                    </div>
                                    <Switch defaultChecked onCheckedChange={() => handleToggle("Emergency Bypass")} />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase tracking-widest text-text-muted">Delivery Mode</Label>
                                    <Select defaultValue="instant" onValueChange={(val) => handleToggle(`Delivery Mode: ${val}`)}>
                                        <SelectTrigger className="bg-bg-primary">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="instant">Instant (Immediate Alerts)</SelectItem>
                                            <SelectItem value="summary">Summary (Hourly Batch)</SelectItem>
                                            <SelectItem value="daily">Daily Digest</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* SECURITY */}
                    <TabsContent value="security" className="m-0 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Authentication Layers</CardTitle>
                                <CardDescription>Manage credentials and Command Center multi-factor security.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center justify-between p-4 rounded-lg bg-brand-red-dim/10 border border-border-alert">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-brand-red rounded-md text-white">
                                            <ShieldCheck size={20}/>
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold uppercase tracking-wider">Two-Factor Authentication</p>
                                            <p className="text-xs text-text-muted">Add a layer of security to your terminal access.</p>
                                        </div>
                                    </div>
                                    <Switch onCheckedChange={() => handleToggle("2FA")} />
                                </div>
                                <div className="flex items-center justify-between p-3 rounded-md bg-bg-primary border border-border-sub">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wider">Change Password</p>
                                        <p className="text-[10px] text-text-muted">Update your Command Center access key.</p>
                                    </div>
                                    <Button variant="outline" size="sm" className="h-8"><Key size={14} className="mr-2"/> Reset Password</Button>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Active Sessions</CardTitle>
                                <CardDescription>Monitor and manage currently authorized devices.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {[
                                    { device: 'iPhone 15 Pro (Current)', location: 'New York, US', time: 'Active now', isCurrent: true },
                                    { device: 'MacBook Pro 16"', location: 'Brooklyn, US', time: '2 hours ago', isCurrent: false },
                                ].map((session, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 rounded-md bg-bg-primary border border-border-sub">
                                        <div className="flex items-center gap-3">
                                            <div className="p-1.5 bg-bg-secondary rounded border border-border-sub">
                                                <History size={14} className="text-text-muted"/>
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-bold text-text-primary uppercase tracking-wide">{session.device}</p>
                                                <p className="text-[10px] text-text-muted">{session.location} • {session.time}</p>
                                            </div>
                                        </div>
                                        {!session.isCurrent && (
                                            <Button variant="ghost" size="sm" className="text-[10px] hover:text-text-red">Revoke</Button>
                                        )}
                                    </div>
                                ))}
                                <Button variant="destructive-outline" className="w-full mt-2" onClick={() => handleToggle("Logout All")}>
                                    Log Out All Other Devices
                                </Button>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* PRIVACY */}
                    <TabsContent value="privacy" className="m-0 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Telemetry & Location Protocol</CardTitle>
                                <CardDescription>Control how your operational position is transmitted to the registry.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between p-4 rounded-lg bg-bg-primary border border-border-sub">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-bg-secondary rounded border border-border-sub text-brand-red">
                                            <LocateFixed size={20} />
                                        </div>
                                        <div className="space-y-0.5">
                                            <p className="text-sm font-bold uppercase tracking-wider">Live Mission Telemetry</p>
                                            <p className="text-[10px] text-text-muted">Transmit active background GPS data during operational windows.</p>
                                        </div>
                                    </div>
                                    <Switch defaultChecked onCheckedChange={() => handleToggle("Live Telemetry")} />
                                </div>
                                <div className="flex items-center justify-between p-4 rounded-lg bg-bg-primary border border-border-sub">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-bg-secondary rounded border border-border-sub text-text-muted">
                                            <MapPin size={20} />
                                        </div>
                                        <div className="space-y-0.5">
                                            <p className="text-sm font-bold uppercase tracking-wider">Restricted Verification</p>
                                            <p className="text-[10px] text-text-muted">Only access GPS sensor during manual check-in/out events.</p>
                                        </div>
                                    </div>
                                    <Switch onCheckedChange={() => handleToggle("Restricted Verification")} />
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Registry Visibility</CardTitle>
                                <CardDescription>Manage your presence in the organizational directory.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between p-3 rounded-md bg-bg-primary border border-border-sub">
                                    <div className="space-y-0.5">
                                        <p className="text-xs font-bold uppercase tracking-wider">Directory Exposure</p>
                                        <p className="text-[10px] text-text-muted">Make your mobile line visible to other field operatives.</p>
                                    </div>
                                    <Switch defaultChecked onCheckedChange={() => handleToggle("Directory Exposure")} />
                                </div>
                                <div className="flex items-center justify-between p-3 rounded-md bg-bg-primary border border-border-sub">
                                    <div className="space-y-0.5">
                                        <p className="text-xs font-bold uppercase tracking-wider">Anonymized Archive</p>
                                        <p className="text-[10px] text-text-muted">Replace name with ID in project logs after 30 days.</p>
                                    </div>
                                    <Switch onCheckedChange={() => handleToggle("Log Anonymization")} />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-accent-gold/20 bg-accent-gold-dim/5">
                            <CardHeader>
                                <CardTitle className="text-accent-gold flex items-center gap-2">
                                    <UserCheck size={14}/> Evidence Protection
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between p-4 rounded-lg bg-bg-primary border border-accent-gold/20">
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold uppercase text-text-primary">Auto-Strip Meta-Data</p>
                                        <p className="text-[10px] text-text-muted leading-tight">Remove personal device signatures and GPS EXIF data from site photos before upload.</p>
                                    </div>
                                    <Switch defaultChecked onCheckedChange={() => handleToggle("EXIF Stripping")} />
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* EXPERIENCE */}
                    <TabsContent value="experience" className="m-0 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Interface & Region</CardTitle>
                                <CardDescription>Customize the visual behavior and regional settings of the terminal.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] uppercase tracking-widest text-text-muted">Display Theme</Label>
                                        <div className="flex gap-2 p-1 bg-bg-primary rounded-lg border border-border-sub">
                                            <button className="flex-1 flex flex-col items-center gap-1 p-2 rounded bg-brand-red text-white text-[10px] font-bold uppercase">
                                                <Moon size={14}/> Dark
                                            </button>
                                            <button className="flex-1 flex flex-col items-center gap-1 p-2 rounded hover:bg-bg-secondary text-text-muted text-[10px] font-bold uppercase transition-colors">
                                                <Sun size={14}/> Light
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ACCOUNT & DATA */}
                    <TabsContent value="account" className="m-0 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Data Sovereignty</CardTitle>
                                <CardDescription>Manage your technician data records and local terminal storage.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between p-3 rounded-md bg-bg-primary border border-border-sub">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wider">Export My Data</p>
                                        <p className="text-[10px] text-text-muted">Download a full archive of your jobs and payout history.</p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => handleToggle("Data Export")}><Download size={14} className="mr-2"/> Request ZIP</Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}