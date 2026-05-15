
'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Bell, 
  Shield, 
  Key, 
  Settings as SettingsIcon, 
  Monitor, 
  Database,
  ShieldCheck,
  History,
  Download,
  Moon,
  Sun,
  Calendar as CalendarIcon,
  Check,
  X,
  FileJson,
  FileClock,
  MessageSquare,
  Search
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

export default function TechSettingsPage() {
    const [mounted, setMounted] = useState(false);
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [exportConfig, setExportConfig] = useState({
        from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0],
        types: ['assignments', 'earnings']
    });
    
    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
        const isLight = document.documentElement.classList.contains('light');
        setTheme(isLight ? 'light' : 'dark');
    }, []);

    const handleToggle = (setting: string) => {
        toast({
            title: "Configuration Synced",
            description: `${setting} has been updated in your master profile.`,
        });
    };

    const toggleTheme = (newTheme: 'dark' | 'light') => {
        setTheme(newTheme);
        if (newTheme === 'light') {
            document.documentElement.classList.remove('dark');
            document.documentElement.classList.add('light');
        } else {
            document.documentElement.classList.remove('light');
            document.documentElement.classList.add('dark');
        }
        toast({ 
            title: "Theme Logic Synchronized", 
            description: `Aaromach terminal transitioned to ${newTheme} visual protocol.` 
        });
    };

    const toggleExportType = (type: string) => {
        setExportConfig(prev => ({
            ...prev,
            types: prev.types.includes(type) 
                ? prev.types.filter(t => t !== type) 
                : [...prev.types, type]
        }));
    };

    const handleExecuteExport = () => {
        if (exportConfig.types.length === 0) {
            toast({ variant: 'destructive', title: 'Export Configuration Error', description: 'Please select at least one data category to export.' });
            return;
        }
        toast({ 
            title: 'Audit Archive Requested', 
            description: `Generating high-fidelity ZIP archive containing ${exportConfig.types.join(', ')} registry data.`,
        });
        setIsExportDialogOpen(false);
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
                <div className="page-header-right items-center">
                    <div className="search-wrap">
                        <Search />
                        <input 
                            className="search-input !w-full md:!w-[250px]" 
                            placeholder="Find configuration..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
             </header>

            <Tabs defaultValue="notifications" className="w-full">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-8">
                    <TabsTrigger value="notifications" className="flex items-center gap-2 py-3">
                        <Bell size={14}/> Notifications
                    </TabsTrigger>
                    <TabsTrigger value="security" className="flex items-center gap-2 py-3">
                        <Shield size={14}/> Security
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
                                            <button 
                                                onClick={() => toggleTheme('dark')}
                                                className={cn(
                                                    "flex-1 flex flex-col items-center gap-1 p-2 rounded transition-colors text-[10px] font-bold uppercase",
                                                    theme === 'dark' ? "bg-brand-red text-white" : "hover:bg-bg-secondary text-text-muted"
                                                )}
                                            >
                                                <Moon size={14}/> Dark
                                            </button>
                                            <button 
                                                onClick={() => toggleTheme('light')}
                                                className={cn(
                                                    "flex-1 flex flex-col items-center gap-1 p-2 rounded transition-colors text-[10px] font-bold uppercase",
                                                    theme === 'light' ? "bg-brand-red text-white" : "hover:bg-bg-secondary text-text-muted"
                                                )}
                                            >
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
                                <div className="flex items-center justify-between p-4 rounded-lg bg-bg-primary border border-border-sub">
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold uppercase tracking-wider text-text-primary">Operational Data Export</p>
                                        <p className="text-[10px] text-text-muted">Generate a high-fidelity archive of your field activity and financial records.</p>
                                    </div>
                                    <Button variant="outline" size="sm" className="h-9 px-4 uppercase font-bold text-[10px] tracking-widest" onClick={() => setIsExportDialogOpen(true)}>
                                        <Download size={14} className="mr-2"/> Initialize Export
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </div>
            </Tabs>

            {/* AUDIT DATA EXPORT DIALOG */}
            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
                <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default flex flex-col p-0 overflow-hidden shadow-2xl">
                    <DialogHeader className="p-6 pb-2 border-b border-border-sub bg-bg-tertiary/30">
                        <div className="flex items-center gap-2 mb-1">
                            <Download className="text-brand-red h-5 w-5" />
                            <DialogTitle className="text-lg font-bold uppercase tracking-widest">Audit Archive Configuration</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs uppercase font-bold text-text-muted tracking-tight">Configure parameters for tactical data extraction.</DialogDescription>
                    </DialogHeader>

                    <div className="p-6 space-y-8">
                        {/* Temporal Window */}
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-brand-red uppercase tracking-[0.2em] border-b border-border-sub pb-1.5 px-1">Temporal Window</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest flex items-center gap-1.5">
                                        <CalendarIcon size={12} /> From
                                    </Label>
                                    <Input 
                                        type="date" 
                                        value={exportConfig.from}
                                        onChange={e => setExportConfig({...exportConfig, from: e.target.value})}
                                        className="h-10 bg-bg-primary border-border-sub text-xs"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted tracking-widest flex items-center gap-1.5">
                                        <CalendarIcon size={12} /> To
                                    </Label>
                                    <Input 
                                        type="date" 
                                        value={exportConfig.to}
                                        onChange={e => setExportConfig({...exportConfig, to: e.target.value})}
                                        className="h-10 bg-bg-primary border-border-sub text-xs"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Data Categories */}
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-brand-red uppercase tracking-[0.2em] border-b border-border-sub pb-1.5 px-1">Tactical Categories</h3>
                            <div className="grid grid-cols-1 gap-2">
                                {[
                                    { id: 'assignments', label: 'Work History', desc: 'Assignment records, site locations, and completion status.', icon: FileJson },
                                    { id: 'earnings', label: 'Earnings Ledger', desc: 'Payroll manifests, reimbursements, and authorized payouts.', icon: FileClock },
                                    { id: 'comms', label: 'Communication Logs', desc: 'Directives received and system broadcast records.', icon: MessageSquare }
                                ].map(cat => (
                                    <div 
                                        key={cat.id} 
                                        onClick={() => toggleExportType(cat.id)}
                                        className={cn(
                                            "flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer",
                                            exportConfig.types.includes(cat.id) ? "bg-brand-red-dim/10 border-brand-red" : "bg-bg-primary border-border-sub hover:border-text-muted"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "p-2 rounded border transition-colors",
                                                exportConfig.types.includes(cat.id) ? "bg-brand-red text-white border-brand-red" : "bg-bg-tertiary border-border-sub text-text-muted"
                                            )}>
                                                <cat.icon size={14} />
                                            </div>
                                            <div className="space-y-0.5">
                                                <p className={cn("text-xs font-bold uppercase", exportConfig.types.includes(cat.id) ? "text-text-primary" : "text-text-muted")}>{cat.label}</p>
                                                <p className="text-[9px] text-text-muted tracking-tight leading-tight">{cat.desc}</p>
                                            </div>
                                        </div>
                                        <Checkbox checked={exportConfig.types.includes(cat.id)} className="h-4 w-4" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="bg-bg-tertiary/50 p-6 border-t border-border-default flex gap-3">
                        <Button variant="outline" onClick={() => setIsExportDialogOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest h-11">
                            Cancel
                        </Button>
                        <Button onClick={handleExecuteExport} className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest h-11">
                            <Download size={16} className="mr-2" /> Request ZIP Archive
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
