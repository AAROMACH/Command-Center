"use client";
import { NotificationEventsCard } from '@/components/notification-events-card';

import { useState, useEffect } from 'react';
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { resolveNotificationPrefs, withNotificationPref } from '@/lib/notification-prefs';
import type { NotificationChannel } from '@/lib/notification-prefs';
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
import type { Technician, NotificationPreferences } from '@/lib/types';
import { FontPreferenceSetting } from '@/components/font-preference-setting';
import { ThemeToggleSetting } from '@/components/theme-toggle-setting';
import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';

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

    const handleTogglePreference = async (type: NotificationChannel) => {
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
            <PageHeader
                eyebrow="Client portal"
                icon={SettingsIcon}
                title="Settings"
                subtitle="Your notifications, display and account status."
            />

            <div className="space-y-10">
                {/* NOTIFICATIONS */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Bell size={14} className="text-text-muted" />
                        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Notifications</h3>
                    </div>
                    <Card className="rounded-xl bg-bg-secondary border-border-main shadow-sm">
                        <CardHeader className="text-left">
                            <CardTitle className="text-base font-semibold">Alerts</CardTitle>
                            <CardDescription>Choose how you hear about updates to your projects and sites.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {[
                                { id: 'email', label: 'Email', desc: 'Project updates, quotes and invoices sent to your email.' },
                                { id: 'sms', label: 'Text message', desc: 'Urgent site and technician-arrival alerts texted to you.' },
                                { id: 'push', label: 'In-app & phone', desc: 'Alerts in the bell, and on your phone if you use the Android app.' },
                            ].map((item) => (
                                <div key={item.id} className="flex items-center justify-between p-4 rounded-lg bg-bg-secondary/50 border border-border-sub hover:border-text-muted transition-all">
                                    <div className="space-y-0.5 text-left">
                                        <p className="text-[13px] font-semibold text-text-primary">{item.label}</p>
                                        <p className="text-[12px] text-text-muted">{item.desc}</p>
                                    </div>
                                    <Switch 
                                        checked={resolveNotificationPrefs(currentUser?.notificationPreferences)[item.id as NotificationChannel]} 
                                        onCheckedChange={() => handleTogglePreference(item.id as NotificationChannel)}
                                    />
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                    <NotificationEventsCard />
                </section>

                {/* DISPLAY (personal — this account only) */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Type size={14} className="text-text-muted" />
                        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Display</h3>
                    </div>
                    <ThemeToggleSetting />
                    <FontPreferenceSetting />
                </section>

                {/* ORGANIZATION */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Building2 size={14} className="text-text-muted" />
                        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Account</h3>
                    </div>
                    <Card className="rounded-xl bg-bg-secondary border-border-main shadow-sm">
                        <CardHeader className="text-left">
                            <CardTitle className="text-base font-semibold">Account status</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="p-6 rounded-lg bg-bg-secondary/50 border border-border-sub flex items-center justify-between">
                                <div className="text-left space-y-1">
                                    <p className="text-sm font-semibold text-text-primary">{currentUser?.clientCompany || 'Individual account'}</p>
                                    <p className="text-[12px] text-text-muted">Client account</p>
                                </div>
                                {(() => {
                                    const pending = currentUser?.approvalStatus === 'pending';
                                    const inactive = currentUser?.accountStatus === 'inactive' || currentUser?.accountStatus === 'on_hold';
                                    return (
                                        <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full border', pending || inactive ? 'bg-accent-gold/10 border-accent-gold/40 text-accent-gold' : 'bg-text-green/10 border-text-green/30 text-text-green')}>
                                            <ShieldCheck size={14} />
                                            <span className="text-[10px] font-semibold uppercase tracking-wider">{pending ? 'Pending approval' : inactive ? 'On hold' : 'Active'}</span>
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