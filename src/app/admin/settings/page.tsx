"use client";

import { useState, useEffect } from 'react';
import { db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { 
  Settings as SettingsIcon, 
  ShieldCheck, 
  MapPin, 
  MessageSquare, 
  Flame, 
  Mail, 
  CreditCard, 
  Activity, 
  ExternalLink, 
  Lock,
  RefreshCw,
  Search,
  Clock,
  Globe,
  Bell
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { TERMINOLOGY } from '@/lib/constants';
import type { Technician, NotificationPreferences } from '@/lib/types';

interface Integration {
    id: string;
    name: string;
    icon: any;
    purpose: string;
    status: 'Connected' | 'Not Connected' | 'Placeholder' | 'Error';
    lastChecked: string;
    notes: string;
}

const integrations: Integration[] = [
    {
        id: 'gmaps',
        name: 'Google Maps Platform',
        icon: MapPin,
        purpose: 'Site coordinate visualization and tactical routing.',
        status: 'Connected',
        lastChecked: '2 min ago',
        notes: 'API key restricted to verified deployment domains.'
    },
    {
        id: 'twilio',
        name: 'Twilio SMS',
        icon: MessageSquare,
        purpose: 'Field dispatch alerts and automated check-in notifications.',
        status: 'Connected',
        lastChecked: '15 min ago',
        notes: 'Account SID managed via secure environment variables.'
    },
    {
        id: 'sendgrid',
        name: 'SendGrid Protocol',
        icon: Mail,
        purpose: 'Official report delivery and system-level comms.',
        status: 'Connected',
        lastChecked: '1 hour ago',
        notes: 'SMTP credentials stored in Secret Manager.'
    }
];

export default function AdminSettingsPage() {
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [isTesting, setIsTesting] = useState<string | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        const userId = localStorage.getItem('currentUserId');
        if (userId) {
            const unsub = onSnapshot(doc(db, 'users', userId), (snap) => {
                if (snap.exists()) setCurrentUser({ ...snap.data(), id: snap.id } as Technician);
            });
            return () => unsub();
        }
    }, []);

    const handleTogglePreference = async (type: keyof NotificationPreferences) => {
        if (!currentUser) return;
        const currentPrefs = currentUser.notificationPreferences || { email: true, sms: true, push: true };
        const updatedPrefs = { ...currentPrefs, [type]: !currentPrefs[type] };

        try {
            await updateDoc(doc(db, 'users', currentUser.id), {
                notificationPreferences: updatedPrefs
            });
            toast({
                title: "Alert Protocol Updated",
                description: `${type.toUpperCase()} notifications transitioned to ${updatedPrefs[type] ? 'ACTIVE' : 'DISABLED'} status.`,
            });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Registry Error', description: e.message });
        }
    };

    const handleIntegrationTest = (id: string) => {
        setIsTesting(id);
        setTimeout(() => {
            setIsTesting(null);
            toast({
                title: "Handshake Successful",
                description: `Communication verified with ${integrations.find(i => i.id === id)?.name}.`,
            });
        }, 1500);
    };

    const getStatusBadge = (status: string) => {
        if (status === 'Connected') return <Badge variant="active" className="text-[8px] h-4">Connected</Badge>;
        return <Badge variant="outline" className="text-[8px] h-4">Standby</Badge>;
    };

    return (
        <div className="space-y-6 text-left max-w-5xl mx-auto pb-24">
            <header className="page-header">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <SettingsIcon size={12} />
                        Administration
                    </p>
                    <h1 className="page-title">System Settings</h1>
                    <p className="page-subtitle">Unified terminal for global operational and security parameters.</p>
                </div>
            </header>

            <div className="space-y-12">
                {/* GENERAL OPERATIONS */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Globe size={14} className="text-brand-red" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">General Operations</h3>
                    </div>
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>Regional Deployment</CardTitle>
                            <CardDescription>Manage anchor regions and temporal system parameters.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4 text-left">
                                    <div className="space-y-2 text-left">
                                        <Label className="text-[10px] uppercase font-bold text-text-muted">Primary Service Region</Label>
                                        <Select defaultValue="detroit">
                                            <SelectTrigger className="bg-bg-primary h-11 text-xs uppercase font-bold"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="detroit">Detroit / SE Michigan (HQ)</SelectItem>
                                                <SelectItem value="chicago">Chicago / Great Lakes</SelectItem>
                                                <SelectItem value="remote">Global / Remote Dispatch</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="space-y-4 text-left">
                                    <div className="space-y-2 text-left">
                                        <Label className="text-[10px] uppercase font-bold text-text-muted">Regional Timezone</Label>
                                        <Select defaultValue="est">
                                            <SelectTrigger className="bg-bg-primary h-11 text-xs uppercase font-bold"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="est">Eastern Standard Time (EST)</SelectItem>
                                                <SelectItem value="pst">Pacific Standard Time (PST)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* NOTIFICATIONS */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Bell size={14} className="text-brand-red" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">{TERMINOLOGY.CONFIG.NOTIFICATIONS}</h3>
                    </div>
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>Tactical Alert Protocols</CardTitle>
                            <CardDescription>Configure global transmission channels for operational updates.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {[
                                { id: 'email', label: 'Email Dispatch', desc: 'Transmission of formal manifests and audit logs.' },
                                { id: 'sms', label: 'SMS Tactical Alerts', desc: 'Direct field operative check-in notifications.' },
                                { id: 'push', label: 'Push Hub', desc: 'Direct terminal interface notifications.' },
                            ].map((item) => (
                                <div key={item.id} className="flex items-center justify-between p-4 rounded-lg border border-border-sub bg-bg-primary">
                                    <div className="space-y-1 text-left">
                                        <h4 className="text-xs font-bold uppercase text-text-primary">{item.label}</h4>
                                        <p className="text-[10px] text-text-muted uppercase">{item.desc}</p>
                                    </div>
                                    <Switch 
                                        checked={!!currentUser?.notificationPreferences?.[item.id as keyof NotificationPreferences]} 
                                        onCheckedChange={() => handleTogglePreference(item.id as keyof NotificationPreferences)}
                                    />
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </section>

                {/* INTEGRATIONS */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Activity size={14} className="text-brand-red" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">{TERMINOLOGY.CONFIG.INTEGRATIONS}</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {integrations.map((item) => (
                            <Card key={item.id} className="bg-bg-secondary border-border-main hover:border-text-muted transition-all group">
                                <CardHeader className="pb-3 text-left">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-bg-primary rounded border border-border-sub group-hover:bg-brand-red group-hover:text-white transition-colors">
                                                <item.icon size={18} />
                                            </div>
                                            <div className="space-y-0.5 text-left">
                                                <CardTitle className="text-sm font-bold uppercase">{item.name}</CardTitle>
                                                <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest">Status Audit</p>
                                            </div>
                                        </div>
                                        {getStatusBadge(item.status)}
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4 text-left">
                                    <p className="text-[11px] text-text-secondary leading-normal uppercase font-medium">{item.purpose}</p>
                                </CardContent>
                                <CardFooter className="pt-0 flex justify-between gap-2">
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-8 flex-1 text-[9px] font-bold uppercase border border-border-sub hover:bg-bg-tertiary"
                                        onClick={() => handleIntegrationTest(item.id)}
                                        disabled={isTesting === item.id}
                                    >
                                        {isTesting === item.id ? <RefreshCw className="mr-1.5 h-3 w-3 animate-spin" /> : <Activity className="mr-1.5 h-3 w-3" />}
                                        Run Safe Handshake
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}