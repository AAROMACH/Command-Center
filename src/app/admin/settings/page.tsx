"use client";
import { NotificationEventsCard } from '@/components/notification-events-card';
import { PageHeader } from '@/components/page-header';

import { onAuthStateChanged } from 'firebase/auth';
import { resolveNotificationPrefs, withNotificationPref } from '@/lib/notification-prefs';
import type { NotificationChannel } from '@/lib/notification-prefs';
import { useState, useEffect } from 'react';
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Settings as SettingsIcon,
  MapPin,
  Activity,
  CheckCircle2,
  Globe,
  Bell,
  Banknote,
  Type,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { TERMINOLOGY } from '@/lib/constants';
import { isPayAdmin, isSuperAdmin } from '@/lib/permissions';
import { BUSINESS_TIME_ZONE } from '@/lib/weekly-log-core';
import type { Technician, NotificationPreferences } from '@/lib/types';
import { FontPreferenceSetting } from '@/components/font-preference-setting';
import { ThemeToggleSetting } from '@/components/theme-toggle-setting';


export default function AdminSettingsPage() {
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [mileageRate, setMileageRate] = useState('0.67');
    const [savingMileageRate, setSavingMileageRate] = useState(false);
    const { toast } = useToast();

    // The mileage rate feeds payroll reimbursements — payroll and super admins
    // only (firestore.rules adminConfig/finance matches).
    const canEditFinance = isSuperAdmin(currentUser) || isPayAdmin(currentUser);
    const mapsConfigured = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    // Signed-in user from Firebase Auth (sessionStorage is per-tab).
    useEffect(() => {
        let unsubUser: (() => void) | undefined;
        const unsubAuth = onAuthStateChanged(auth, fbUser => {
            unsubUser?.();
            unsubUser = fbUser ? onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
                if (snap.exists()) setCurrentUser({ ...snap.data(), id: snap.id } as Technician);
            }) : undefined;
        });
        return () => { unsubAuth(); unsubUser?.(); };
    }, []);

    useEffect(() => {
        getDoc(doc(db, 'adminConfig', 'finance')).then(snap => {
            if (snap.exists() && snap.data()?.mileageRate != null) {
                setMileageRate(String(snap.data()!.mileageRate));
            }
        }).catch(() => {});
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
                description: `${type === 'push' ? 'In-app' : type.toUpperCase()} notifications ${updatedPrefs[type] ? 'on' : 'off'}.`,
            });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e.message });
        }
    };

    const handleSaveMileageRate = async () => {
        const rate = parseFloat(mileageRate);
        if (isNaN(rate) || rate <= 0) {
            toast({ variant: 'destructive', title: 'Invalid rate', description: 'Enter a positive number (e.g. 0.67).' });
            return;
        }
        setSavingMileageRate(true);
        try {
            await setDoc(doc(db, 'adminConfig', 'finance'), { mileageRate: rate }, { merge: true });
            toast({ title: 'Mileage rate saved', description: `$${rate.toFixed(2)} per mile.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Failed to save', description: e.message });
        } finally {
            setSavingMileageRate(false);
        }
    };

    return (
        <div className="space-y-6 text-left max-w-5xl mx-auto pb-24">
            <PageHeader
                eyebrow="Admin"
                icon={SettingsIcon}
                title="Settings"
                subtitle="Your notifications and display, plus company-wide settings for your role."
            />

            <div className="space-y-12">
                {/* GENERAL — what the app actually runs on */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Globe size={14} className="text-brand-red" />
                        <h3 className="text-[13px] font-semibold text-text-primary">General</h3>
                    </div>
                    <Card>
                        <CardContent className="p-4 flex items-center justify-between gap-4">
                            <div className="space-y-1 text-left">
                                <h4 className="text-xs font-bold text-text-primary">Business Time Zone</h4>
                                <p className="text-[10px] text-text-muted">Weekly logs, pay weeks and schedules use this time zone.</p>
                            </div>
                            <span className="text-[12px] font-mono font-bold text-text-primary">{BUSINESS_TIME_ZONE.replace('_', ' ')}</span>
                        </CardContent>
                    </Card>
                </section>

                {/* NOTIFICATIONS */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Bell size={14} className="text-brand-red" />
                        <h3 className="text-[13px] font-semibold text-text-primary">{TERMINOLOGY.CONFIG.NOTIFICATIONS}</h3>
                    </div>
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>How you get notified</CardTitle>
                            <CardDescription>Applies to your account only.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {[
                                { id: 'email', label: 'Email', desc: 'Alerts sent to your email address.' },
                                { id: 'sms', label: 'Text Message', desc: 'Alerts texted to your phone number.' },
                                { id: 'phone', label: 'Phone notifications', desc: 'Pop-up alerts on your phone from the Aaromach Android app.' },
                            ].map((item) => (
                                <div key={item.id} className="flex items-center justify-between p-4 rounded-lg border border-border-sub bg-bg-primary">
                                    <div className="space-y-1 text-left">
                                        <h4 className="text-xs font-bold text-text-primary">{item.label}</h4>
                                        <p className="text-[10px] text-text-muted">{item.desc}</p>
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
                        <Type size={14} className="text-brand-red" />
                        <h3 className="text-[13px] font-semibold text-text-primary">Display</h3>
                    </div>
                    <ThemeToggleSetting />
                    <FontPreferenceSetting />
                </section>

                {/* FINANCE */}
                {canEditFinance && (
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Banknote size={14} className="text-brand-red" />
                        <h3 className="text-[13px] font-semibold text-text-primary">Finance & payroll</h3>
                    </div>
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>Mileage Reimbursement Rate</CardTitle>
                            <CardDescription>The per-mile rate used to calculate mileage reimbursements. IRS standard rate is $0.67/mile (2024).</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-3 max-w-sm">
                                <div className="relative flex-1">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm font-mono">$</span>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={mileageRate}
                                        onChange={e => setMileageRate(e.target.value)}
                                        className="h-9 pl-7 text-[11px] bg-bg-primary border-border-main font-mono"
                                        placeholder="0.67"
                                    />
                                </div>
                                <span className="text-[10px] font-bold uppercase text-text-muted tracking-wider shrink-0">per mile</span>
                                <Button
                                    size="sm"
                                    onClick={handleSaveMileageRate}
                                    disabled={savingMileageRate}
                                    className="h-9 bg-brand-red hover:bg-brand-red/90 text-white shrink-0"
                                >
                                    {savingMileageRate ? 'Saving...' : 'Save Rate'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </section>
                )}

                {/* INTEGRATIONS */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Activity size={14} className="text-brand-red" />
                        <h3 className="text-[13px] font-semibold text-text-primary">{TERMINOLOGY.CONFIG.INTEGRATIONS}</h3>
                    </div>
                    <Card className="bg-bg-secondary border-border-main">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-bg-primary rounded-lg border border-border-sub shrink-0">
                                    <MapPin size={22} className="text-text-green" />
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                    <div className="flex items-center gap-2 mb-1">
                                        <p className="text-sm font-bold tracking-wide text-text-primary">Google Maps Platform</p>
                                        <Badge variant={mapsConfigured ? 'active' : 'outline'} className="text-[10px] h-4 px-2">{mapsConfigured ? 'Configured' : 'Not configured'}</Badge>
                                    </div>
                                    <p className="text-[10px] text-text-muted font-medium">Address lookup, job maps and routing</p>
                                    <p className="text-[11px] text-text-muted mt-1">{mapsConfigured ? 'API key is set for this deployment.' : 'Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in the hosting environment.'}</p>
                                </div>
                                {mapsConfigured && (
                                <div className="shrink-0 text-right hidden sm:block">
                                    <CheckCircle2 size={20} className="text-text-green ml-auto mb-1" />
                                </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </div>
    );
}