"use client";

import { useState, useEffect } from 'react';
import { db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Settings as SettingsIcon,
  MapPin,
  Activity,
  CheckCircle2,
  Globe,
  Bell
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { TERMINOLOGY } from '@/lib/constants';
import type { Technician, NotificationPreferences } from '@/lib/types';


export default function AdminSettingsPage() {
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
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
                    <Card className="bg-bg-secondary border-border-main">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-bg-primary rounded-lg border border-border-sub shrink-0">
                                    <MapPin size={22} className="text-text-green" />
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                    <div className="flex items-center gap-2 mb-1">
                                        <p className="text-sm font-black uppercase tracking-wide text-text-primary">Google Maps Platform</p>
                                        <Badge variant="active" className="text-[8px] h-4 px-2">Connected</Badge>
                                    </div>
                                    <p className="text-[10px] text-text-muted uppercase font-medium">Site coordinate visualization and tactical routing</p>
                                    <p className="text-[9px] text-text-muted mt-1">API key restricted to verified deployment domains.</p>
                                </div>
                                <div className="shrink-0 text-right hidden sm:block">
                                    <CheckCircle2 size={20} className="text-text-green ml-auto mb-1" />
                                    <p className="text-[9px] text-text-muted font-mono">Active</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </div>
    );
}