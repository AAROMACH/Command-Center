"use client";

import { useState, useEffect } from 'react';
import { db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
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
  CheckCircle2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TERMINOLOGY } from '@/lib/constants';
import type { Technician, NotificationPreferences } from '@/lib/types';

export default function ClientSettingsPage() {
    const [mounted, setMounted] = useState(false);
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
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
                description: `Organizational ${type.toUpperCase()} notifications transitioned to ${updatedPrefs[type] ? 'ACTIVE' : 'DISABLED'}.`,
            });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Registry Error', description: e.message });
        }
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
                    <p className="page-subtitle text-left">Manage organizational communication and terminal parameters.</p>
                </div>
            </header>

            <div className="space-y-12">
                {/* NOTIFICATIONS */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Bell size={14} className="text-brand-red" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">{TERMINOLOGY.CONFIG.NOTIFICATIONS}</h3>
                    </div>
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>Stakeholder Alerts</CardTitle>
                            <CardDescription>Choose how you want to receive tactical updates for your projects and sites.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {[
                                { id: 'email', label: 'Email Briefings', desc: 'Transmission of project milestone completions and billing manifests.' },
                                { id: 'sms', label: 'SMS Critical Pings', desc: 'Emergency site status alerts and technician arrival verifications.' },
                                { id: 'push', label: 'Push Terminal', desc: 'In-app real-time status updates and activity feed alerts.' },
                            ].map((item) => (
                                <div key={item.id} className="flex items-center justify-between p-4 rounded-lg bg-bg-secondary/50 border border-border-sub hover:border-text-muted transition-all">
                                    <div className="space-y-0.5 text-left">
                                        <p className="text-xs font-bold uppercase tracking-wider">{item.label}</p>
                                        <p className="text-[10px] text-text-muted uppercase font-medium">{item.desc}</p>
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

                {/* ORGANIZATION */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Building2 size={14} className="text-brand-red" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Strategic Identity</h3>
                    </div>
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>Account Status</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="p-6 rounded-lg bg-bg-secondary/50 border border-border-sub flex items-center justify-between">
                                <div className="text-left space-y-1">
                                    <p className="text-sm font-bold uppercase text-text-primary">{currentUser?.clientCompany || 'Independent Account'}</p>
                                    <p className="text-[10px] text-text-muted uppercase tracking-widest">Authorized Strategic Partner</p>
                                </div>
                                <div className="flex items-center gap-2 px-4 py-2 rounded bg-green-dim border border-green-border text-text-green">
                                    <ShieldCheck size={18} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Verified Registry</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </div>
    );
}