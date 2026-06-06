"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  Search,
  Activity
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
import { TERMINOLOGY } from '@/lib/constants';

export default function TechSettingsPage() {
    const [mounted, setMounted] = useState(false);
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [exportConfig, setExportConfig] = useState({
        from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0],
        types: ['assignments', 'billing']
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
        <div className="max-w-4xl mx-auto space-y-8 text-left pb-24">
             <header className="page-header text-left">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <SettingsIcon size={12} />
                        Terminal Configuration
                    </p>
                    <h1 className="page-title text-left">System Settings</h1>
                    <p className="page-subtitle text-left">Unified oversight of communication, security, and interface parameters.</p>
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

            <div className="space-y-12">
                {/* NOTIFICATIONS */}
                <section id="notifications" className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Bell size={14} className="text-brand-red" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">{TERMINOLOGY.CONFIG.NOTIFICATIONS}</h3>
                    </div>
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>Notification Protocols</CardTitle>
                            <CardDescription>Choose which field updates are transmitted to your terminal.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {[
                                { id: 'n-1', label: 'New Jobs', desc: 'Alert when new assignments are staged in your registry.' },
                                { id: 'n-2', label: 'Job Updates', desc: 'Alert when site details or wiring standards change.' },
                                { id: 'n-3', label: 'Schedule Changes', desc: 'Alert when mission dates or start times are adjusted.' },
                                { id: 'n-4', label: 'Billing & Payouts', desc: 'Alert when field logs are authorized for settlement.' },
                            ].map((item) => (
                                <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border border-border-sub bg-bg-secondary/50">
                                    <div className="space-y-0.5 text-left">
                                        <p className="text-xs font-bold uppercase tracking-wider">{item.label}</p>
                                        <p className="text-[10px] text-text-muted uppercase font-medium">{item.desc}</p>
                                    </div>
                                    <Switch defaultChecked onCheckedChange={() => handleToggle(item.label)} />
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </section>

                {/* SECURITY */}
                <section id="security" className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Shield size={14} className="text-brand-red" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">{TERMINOLOGY.CONFIG.SECURITY}</h3>
                    </div>
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>Authentication Layers</CardTitle>
                            <CardDescription>Manage credentials and Command Center multi-factor security.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between p-4 rounded-lg bg-brand-red-dim/10 border border-border-alert">
                                <div className="flex items-center gap-4 text-left">
                                    <div className="p-2 bg-brand-red rounded-md text-white">
                                        <ShieldCheck size={20}/>
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm font-bold uppercase tracking-wider">Two-Factor Authentication</p>
                                        <p className="text-[10px] text-text-muted uppercase font-bold">High Priority Protocol</p>
                                    </div>
                                </div>
                                <Switch onCheckedChange={() => handleToggle("2FA")} />
                            </div>
                            <div className="flex items-center justify-between p-3 rounded-lg border border-border-sub bg-bg-secondary/50">
                                <div className="text-left">
                                    <p className="text-xs font-bold uppercase tracking-wider">Update Access Key</p>
                                    <p className="text-[10px] text-text-muted uppercase">Modify your Command Center login credentials.</p>
                                </div>
                                <Button variant="outline" size="sm" className="h-8 !text-[10px] font-bold uppercase tracking-widest"><Key size={14} className="mr-2"/> Reset Password</Button>
                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* EXPERIENCE */}
                <section id="experience" className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Monitor size={14} className="text-brand-red" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Terminal Interface</h3>
                    </div>
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>Visual Environment</CardTitle>
                            <CardDescription>Customize the visual behavior of your field terminal.</CardDescription>
                        </CardHeader>
                        <CardContent className="text-left">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted text-left">Display Protocol</Label>
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
                </section>

                {/* ACCOUNT & DATA */}
                <section id="account" className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Database size={14} className="text-brand-red" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Registry Data</h3>
                    </div>
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>Operational Data Extraction</CardTitle>
                            <CardDescription>Generate a high-fidelity archive of your field activity records.</CardDescription>
                        </CardHeader>
                        <CardContent className="text-left">
                            <div className="flex items-center justify-between p-4 rounded-lg bg-bg-secondary/50 border border-border-sub">
                                <div className="space-y-1 text-left">
                                    <p className="text-xs font-bold uppercase tracking-wider text-text-primary text-left">Audit Manifest Generation</p>
                                    <p className="text-[10px] text-text-muted uppercase font-medium">Export assignment records and billing ledger data.</p>
                                </div>
                                <Button variant="outline" size="sm" className="h-9 px-4 uppercase font-bold text-[10px] tracking-widest" onClick={() => setIsExportDialogOpen(true)}>
                                    <Download size={14} className="mr-2"/> Initialize Export
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </div>

            {/* EXPORT DIALOG (Unchanged Logic) */}
            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
                <DialogContent className="sm:max-w-[500px] bg-bg-elevated border-border-default shadow-2xl">
                    <DialogHeader className="text-left">
                        <DialogTitle className="uppercase tracking-widest font-bold">Audit Archive Protocol</DialogTitle>
                    </DialogHeader>
                    <div className="p-6 space-y-6 text-left">
                        <div className="grid grid-cols-2 gap-4 text-left">
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">From</Label>
                                <Input type="date" value={exportConfig.from} className="h-10 bg-bg-primary" />
                            </div>
                            <div className="space-y-2 text-left">
                                <Label className="text-[10px] uppercase font-bold text-text-muted">To</Label>
                                <Input type="date" value={exportConfig.to} className="h-10 bg-bg-primary" />
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="bg-bg-tertiary/30 border-t border-border-default p-6 flex gap-3">
                        <Button variant="outline" onClick={() => setIsExportDialogOpen(false)} className="flex-1 uppercase font-bold text-[10px] tracking-widest h-11">Abort</Button>
                        <Button onClick={handleExecuteExport} className="flex-1 bg-brand-red hover:bg-brand-red-hover uppercase font-bold text-[10px] tracking-widest h-11 text-white">Execute Export</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
