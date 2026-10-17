"use client";

import { PageHeader } from '@/components/page-header';
import { PageLoading } from '@/components/empty-state';
import { useState, useEffect } from 'react';
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { resolveNotificationPrefs, withNotificationPref } from '@/lib/notification-prefs';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Bell,
  Settings as SettingsIcon,
  Monitor,
  Calendar,
  Route,
  Gauge,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { TERMINOLOGY } from '@/lib/constants';
import type { Technician, NotificationPreferences } from '@/lib/types';
import { FontPreferenceSetting } from '@/components/font-preference-setting';
import { ThemeToggleSetting } from '@/components/theme-toggle-setting';

export default function TechSettingsPage() {
    const [mounted, setMounted] = useState(false);
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [routePreference, setRoutePreference] = useState<'optimized' | 'by-time' | 'by-mileage'>('by-time'); // calendar's default
    const [mileageUnit, setMileageUnit] = useState<'mi' | 'km'>('mi');
    const { toast } = useToast();

    useEffect(() => {
        setMounted(true);

        // Firebase Auth, not sessionStorage — that's per-tab, so a new tab got
        // an empty page whose toggles did nothing.
        let unsubUser: (() => void) | undefined;
        const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
            unsubUser?.();
            unsubUser = undefined;
            if (!fbUser) { setCurrentUser(null); return; }
            unsubUser = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    setCurrentUser({ ...data, id: snap.id } as Technician);
                    if (data.routePreference) setRoutePreference(data.routePreference);
                    if (data.mileageUnit) setMileageUnit(data.mileageUnit);
                }
            });
        });
        return () => { unsubAuth(); unsubUser?.(); };
    }, []);

    const saveField = async (field: string, value: any) => {
        if (!currentUser) return;
        try {
            await updateDoc(doc(db, 'users', currentUser.id), { [field]: value });
            toast({ title: 'Settings saved' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e.message });
        }
    };

    const handleTogglePreference = async (type: keyof NotificationPreferences) => {
        if (!currentUser) return;
        const updatedPrefs = withNotificationPref(currentUser.notificationPreferences, type, !resolveNotificationPrefs(currentUser.notificationPreferences)[type]);

        try {
            await updateDoc(doc(db, 'users', currentUser.id), {
                notificationPreferences: updatedPrefs
            });
            toast({
                title: "Settings saved",
                description: `${type === 'sms' ? 'Text' : type === 'push' ? 'In-app' : 'Email'} alerts are now ${updatedPrefs[type] ? 'on' : 'off'}.`,
            });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e.message });
        }
    };

    if (!mounted) return <PageLoading label="Loading settings…" />;

    return (
        <div className="max-w-4xl mx-auto space-y-8 text-left pb-24">
            <PageHeader eyebrow="Tech portal" icon={SettingsIcon} title="Settings" subtitle="Notifications, display and work preferences." />

            <div className="space-y-12">
                {/* NOTIFICATIONS */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Bell size={14} className="text-brand-red" />
                        <h2 className="section-label">{TERMINOLOGY.CONFIG.NOTIFICATIONS}</h2>
                    </div>
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle className="text-base font-semibold">Alerts</CardTitle>
                            <CardDescription className="text-[12px]">Choose how you hear about job updates and check-in reminders.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {[
                                { id: 'email', label: 'Email', desc: 'Assignments, pay stubs and alerts sent to your email.' },
                                { id: 'sms', label: 'Text message', desc: 'Job and schedule alerts texted to your phone.' },
                                { id: 'push', label: 'In-App', desc: 'Alerts in the bell at the top of the app.' },
                            ].map((item) => (
                                <div key={item.id} className="flex items-center justify-between gap-3 p-4 rounded-lg bg-bg-secondary/50 border border-border-sub hover:border-text-muted transition-all">
                                    <div className="space-y-0.5 text-left">
                                        <p className="text-[13px] font-semibold">{item.label}</p>
                                        <p className="text-[12px] text-text-muted">{item.desc}</p>
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

                {/* EXPERIENCE */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Monitor size={14} className="text-brand-red" />
                        <h2 className="section-label">Display</h2>
                    </div>
                    <ThemeToggleSetting />
                    <FontPreferenceSetting />
                </section>

                {/* WORK PREFERENCES */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Route size={14} className="text-brand-red" />
                        <h2 className="section-label">Work preferences</h2>
                    </div>
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle className="text-base font-semibold">Route &amp; mileage</CardTitle>
                            <CardDescription className="text-[12px]">Set your default route optimization and distance units.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 text-left">
                            <div className="flex items-center justify-between gap-3 p-4 rounded-lg bg-bg-secondary/50 border border-border-sub">
                                <div className="space-y-0.5 text-left">
                                    <p className="text-[13px] font-semibold">Route order</p>
                                    <p className="text-[12px] text-text-muted">Default ordering for your daily job route.</p>
                                </div>
                                <Select
                                    value={routePreference}
                                    onValueChange={(v: 'optimized' | 'by-time' | 'by-mileage') => {
                                        setRoutePreference(v);
                                        saveField('routePreference', v);
                                    }}
                                >
                                    <SelectTrigger className="h-10 sm:h-9 w-[160px] bg-bg-primary border-border-main">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-bg-elevated border-border-main">
                                        <SelectItem value="optimized" className="text-[13px]">Optimized</SelectItem>
                                        <SelectItem value="by-time" className="text-[13px]">By time</SelectItem>
                                        <SelectItem value="by-mileage" className="text-[13px]">By mileage</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center justify-between gap-3 p-4 rounded-lg bg-bg-secondary/50 border border-border-sub">
                                <div className="space-y-0.5 text-left">
                                    <p className="text-[13px] font-semibold">Distance units</p>
                                    <p className="text-[12px] text-text-muted">Miles or kilometers for mileage tracking.</p>
                                </div>
                                <div className="flex items-center border border-border-main rounded-md overflow-hidden h-10 sm:h-9 bg-bg-primary shrink-0">
                                    {(['mi', 'km'] as const).map(unit => (
                                        <button
                                            key={unit}
                                            onClick={() => { setMileageUnit(unit); saveField('mileageUnit', unit); }}
                                            className={cn(
                                                'h-10 sm:h-9 px-4 text-[13px] font-medium transition-colors border-l border-border-main first:border-l-0',
                                                mileageUnit === unit ? 'bg-brand-red text-white' : 'text-text-muted hover:text-text-primary'
                                            )}
                                        >
                                            {unit}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* CALENDAR INTEGRATION */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Calendar size={14} className="text-brand-red" />
                        <h2 className="section-label">Calendar</h2>
                    </div>
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle className="text-base font-semibold">Google Calendar</CardTitle>
                            <CardDescription className="text-[12px]">Sync your job assignments with Google Calendar.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between gap-3 p-4 rounded-lg bg-bg-secondary/50 border border-border-sub hover:border-text-muted transition-all">
                                <div className="space-y-0.5 text-left">
                                    <p className="text-[13px] font-semibold">Sync jobs</p>
                                    <p className="text-[12px] text-text-muted">Automatically add assignments to your Google Calendar.</p>
                                </div>
                                {/* Nothing reads this flag yet — shown as coming soon
                                    instead of a switch that does nothing. */}
                                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-text-muted border border-border-sub rounded-full px-2 py-1">Coming soon</span>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </div>
    );
}