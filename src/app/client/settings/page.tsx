"use client";

import { useState, useEffect } from 'react';
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { resolveNotificationPrefs, withNotificationPref } from '@/lib/notification-prefs';
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
  CheckCircle2,
  Type,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TERMINOLOGY } from '@/lib/constants';
import type { Technician, NotificationPreferences } from '@/lib/types';
import { FontPreferenceSetting } from '@/components/font-preference-setting';
import { ThemeToggleSetting } from '@/components/theme-toggle-setting';

export default function ClientSettingsPage() {
    const [mounted, setMounted] = useState(false);
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);
        // Firebase Auth, not sessionStorage (per-tab — a new tab got a dead page).
        let unsubUser: (() => void) | undefined;
        const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
            unsubUser?.();
            unsubUser = undefined;
            if (!fbUser) { setCurrentUser(null); return; }
            unsubUser = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
                if (snap.exists()) setCurrentUser({ ...snap.data(), id: snap.id } as Technician);
            });
        });
        return () => { unsubAuth(); unsubUser?.(); };
    }, []);

    const handleTogglePreference = async (type: keyof NotificationPreferences) => {
        if (!currentUser) return;
        const updatedPrefs = withNotificationPref(currentUser.notificationPreferences, type, !resolveNotificationPrefs(currentUser.notificationPreferences)[type]);

        try {
            await updateDoc(doc(db, 'users', currentUser.id), {
                notificationPreferences: updatedPrefs
            });
            toast({
                title: "Notification settings saved",
                description: `${type === 'push' ? 'In-app' : type === 'sms' ? 'Text' : 'Email'} notifications ${updatedPrefs[type] ? 'on' : 'off'}.`,
            });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e.message });
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
                    <p className="page-subtitle text-left">Your notifications, display and account status.</p>
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
                                { id: 'email', label: 'Email', desc: 'Project updates, quotes and invoices sent to your email.' },
                                { id: 'sms', label: 'Text Message', desc: 'Urgent site and technician-arrival alerts texted to you.' },
                                { id: 'push', label: 'In-App', desc: 'Alerts in the bell at the top of the portal.' },
                            ].map((item) => (
                                <div key={item.id} className="flex items-center justify-between p-4 rounded-lg bg-bg-secondary/50 border border-border-sub hover:border-text-muted transition-all">
                                    <div className="space-y-0.5 text-left">
                                        <p className="text-xs font-bold uppercase tracking-wider">{item.label}</p>
                                        <p className="text-[10px] text-text-muted uppercase font-medium">{item.desc}</p>
                                    </div>
                                    <Switch 
                                        checked={resolveNotificationPrefs(currentUser?.notificationPreferences)[item.id as keyof NotificationPreferences]} 
                                        onCheckedChange={() => handleTogglePreference(item.id as keyof NotificationPreferences)}
                                    />
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </section>

                {/* DISPLAY (personal — this account only) */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Type size={14} className="text-brand-red" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Display</h3>
                    </div>
                    <ThemeToggleSetting />
                    <FontPreferenceSetting />
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
                                    <p className="text-[10px] text-text-muted uppercase tracking-widest">Client account</p>
                                </div>
                                {(() => {
                                    const pending = currentUser?.approvalStatus === 'pending';
                                    const inactive = currentUser?.accountStatus === 'inactive' || currentUser?.accountStatus === 'on_hold';
                                    return (
                                        <div className={`flex items-center gap-2 px-4 py-2 rounded border ${pending || inactive ? 'bg-accent-gold-dim border-accent-gold/40 text-accent-gold' : 'bg-green-dim border-green-border text-text-green'}`}>
                                            <ShieldCheck size={18} />
                                            <span className="text-[10px] font-black uppercase tracking-widest">{pending ? 'Pending approval' : inactive ? 'On hold' : 'Active'}</span>
                                        </div>
                                    );
                                })()}
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </div>
    );
}