"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  Bell, 
  Shield, 
  Settings as SettingsIcon, 
  Building2,
  ShieldCheck,
  History,
  Search,
  Mail,
  Smartphone,
  CheckCircle2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { technicians } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { TERMINOLOGY } from '@/lib/constants';

export default function ClientSettingsPage() {
    const [mounted, setMounted] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        setMounted(true);
        const userId = localStorage.getItem('currentUserId');
        if (userId) {
            setCurrentUser(technicians.find(t => t.id === userId));
        }
    }, []);

    const handleToggle = (setting: string) => {
        toast({
            title: "Configuration Synced",
            description: `${setting} has been updated for your account.`,
        });
    };

    if (!mounted) return null;

    return (
        <div className="max-w-4xl mx-auto space-y-8 text-left pb-24">
            <header className="page-header text-left">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <SettingsIcon size={12} />
                        Client Terminal
                    </p>
                    <h1 className="page-title text-left">Settings</h1>
                    <p className="page-subtitle text-left">Manage organizational communication, security, and credentials.</p>
                </div>
                <div className="page-header-right items-center">
                    <div className="search-wrap">
                        <Search />
                        <input 
                            className="search-input !w-full md:!w-[250px]" 
                            placeholder="Find setting..." 
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
                            <CardTitle>Alert Protocols</CardTitle>
                            <CardDescription>Choose which tactical updates you want to receive for your sites.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {[
                                { id: 'cn-1', label: 'Ticket Status Updates', desc: 'Alert when service tickets move from review to approved.', icon: CheckCircle2 },
                                { id: 'cn-2', label: 'Project Milestones', desc: 'Alert when a project phase is finalized by field staff.', icon: Building2 },
                                { id: 'cn-3', label: 'Site Presence Alerts', desc: 'Alert when a technician verifies their presence on-site.', icon: MapPin },
                            ].map((item) => (
                                <div key={item.id} className="flex items-center justify-between p-4 rounded-lg bg-bg-secondary/50 border border-border-sub hover:border-text-muted transition-all">
                                    <div className="flex items-center gap-4 text-left">
                                        <div className="p-2 bg-bg-primary rounded border border-border-sub text-text-muted">
                                            <item.icon size={16} />
                                        </div>
                                        <div className="space-y-0.5 text-left">
                                            <p className="text-xs font-bold uppercase tracking-wider">{item.label}</p>
                                            <p className="text-[10px] text-text-muted uppercase font-medium">{item.desc}</p>
                                        </div>
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
                            <CardTitle>Data Protection</CardTitle>
                            <CardDescription>Manage credentials and multi-factor security for your organization.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-lg bg-brand-red-dim/10 border border-brand-red/30">
                                <div className="flex items-center gap-4 text-left">
                                    <div className="p-2 bg-brand-red rounded-md text-white">
                                        <ShieldCheck size={20}/>
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm font-bold uppercase tracking-wider">Two-Factor Authentication</p>
                                        <p className="text-[10px] text-text-muted uppercase font-bold">Required for full strategic visibility</p>
                                    </div>
                                </div>
                                <Switch onCheckedChange={() => handleToggle("2FA")} />
                            </div>
                            
                            <div className="flex items-center justify-between p-4 rounded-lg bg-bg-secondary/50 border border-border-sub">
                                <div className="space-y-0.5 text-left">
                                    <p className="text-xs font-bold uppercase tracking-wider">Access Registry Audit</p>
                                    <p className="text-[10px] text-text-muted uppercase">Review recently authorized devices and login locations.</p>
                                </div>
                                <Button variant="outline" size="sm" className="h-8 text-[9px] uppercase font-bold tracking-widest">
                                    <History size={14} className="mr-2" /> View Audit Log
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* ORGANIZATION */}
                <section id="organization" className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Building2 size={14} className="text-brand-red" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Corporate Identity</h3>
                    </div>
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>Organizational Context</CardTitle>
                            <CardDescription>Verified information for {currentUser?.clientCompany || 'your organization'}.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6 text-left">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted text-left">Organization Name</Label>
                                    <Input disabled value={currentUser?.clientCompany || ''} className="bg-bg-primary opacity-60 h-10 font-bold uppercase" />
                                </div>
                                <div className="space-y-2 text-left">
                                    <Label className="text-[10px] uppercase font-bold text-text-muted text-left">Business Classification</Label>
                                    <Input disabled value={currentUser?.businessType || 'Strategic Partner'} className="bg-bg-primary opacity-60 h-10 uppercase" />
                                </div>
                            </div>
                            <div className="p-4 rounded-lg bg-bg-tertiary/50 border border-border-sub flex items-start gap-4">
                                <Info size={18} className="text-accent-gold shrink-0 mt-0.5" />
                                <p className="text-[10px] text-text-muted uppercase font-bold leading-relaxed tracking-tight text-left">
                                    Note: Organizational parameters are locked for strategic stakeholders. Please contact your Aaromach Account Manager to modify core registry data.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </div>
    );
}
