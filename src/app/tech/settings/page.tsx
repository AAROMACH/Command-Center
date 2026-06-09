"use client";

import { useState, useEffect } from 'react';
import { db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  Bell, 
  Shield, 
  Settings as SettingsIcon, 
  Monitor, 
  ShieldCheck,
  Download,
  Moon,
  Sun,
  Search,
  Activity
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { TERMINOLOGY } from '@/lib/constants';
import type { Technician, NotificationPreferences } from '@/lib/types';

export default function TechSettingsPage() {
    const [mounted, setMounted] = useState(false);
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
        const saved = localStorage.getItem('aaromach_theme');
        const isLight = saved ? saved === 'light' : document.documentElement.classList.contains('light');
        setTheme(isLight ? 'light' : 'dark');

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
                title: "Protocol Synced",
                description: `${type.toUpperCase()} alerts are now ${updatedPrefs[type] ? 'ACTIVE' : 'DISABLED'} for your profile.`,
            });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Registry Error', description: e.message });
        }
    };

    const toggleTheme = (newTheme: 'dark' | 'light') => {
        setTheme(newTheme);
        localStorage.setItem('aaromach_theme', newTheme);
        if (newTheme === 'light') {
            document.documentElement.classList.remove('dark');
            document.documentElement.classList.add('light');
        } else {
            document.documentElement.classList.remove('light');
            document.documentElement.classList.add('dark');
        }
        toast({ 
            title: "Interface Refined", 
            description: `Terminal visual profile set to ${newTheme.toUpperCase()}.` 
        });
    };

    if (!mounted) return null;

    return (
        <div className="max-w-4xl mx-auto space-y-8 text-left pb-24">
             <header className="page-header text-left">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2">
                        <SettingsIcon size={12} />
                        Field Terminal
                    </p>
                    <h1 className="page-title text-left">System Settings</h1>
                    <p className="page-subtitle text-left">Configure your field communication and interface preferences.</p>
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
                            <CardTitle>Field Alert Protocols</CardTitle>
                            <CardDescription>Choose how you receive mission updates and check-in reminders.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {[
                                { id: 'email', label: 'Email Manifests', desc: 'Transmission of formal assignment folders and pay stubs.' },
                                { id: 'sms', label: 'SMS Tactical Alerts', desc: 'Direct mission staging alerts and emergency pings.' },
                                { id: 'push', label: 'Push Terminal', desc: 'On-device status alerts and check-in reminders.' },
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

                {/* EXPERIENCE */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Monitor size={14} className="text-brand-red" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Terminal Interface</h3>
                    </div>
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>Visual Mode</CardTitle>
                            <CardDescription>Customize the tactical visibility of your field terminal.</CardDescription>
                        </CardHeader>
                        <CardContent className="text-left">
                            <div className="flex gap-2 p-1 bg-bg-primary rounded-lg border border-border-sub w-fit">
                                <button 
                                    onClick={() => toggleTheme('dark')}
                                    className={cn(
                                        "px-6 h-9 rounded transition-colors text-[10px] font-bold uppercase tracking-widest",
                                        theme === 'dark' ? "bg-brand-red text-white" : "hover:bg-bg-secondary text-text-muted"
                                    )}
                                >
                                    <Moon size={14} className="inline mr-2"/> Dark
                                </button>
                                <button 
                                    onClick={() => toggleTheme('light')}
                                    className={cn(
                                        "px-6 h-9 rounded transition-colors text-[10px] font-bold uppercase tracking-widest",
                                        theme === 'light' ? "bg-brand-red text-white" : "hover:bg-bg-secondary text-text-muted"
                                    )}
                                >
                                    <Sun size={14} className="inline mr-2"/> Light
                                </button>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </div>
    );
}