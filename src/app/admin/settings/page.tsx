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
  Activity,
  Globe,
  Bell,
  Banknote,
  Type,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TERMINOLOGY } from '@/lib/constants';
import { isPayAdmin, isSuperAdmin } from '@/lib/permissions';
import { BUSINESS_TIME_ZONE } from '@/lib/weekly-log-core';
import type { Technician, NotificationPreferences } from '@/lib/types';
import { FontPreferenceSetting } from '@/components/font-preference-setting';
import { ThemeToggleSetting } from '@/components/theme-toggle-setting';
import { IntegrationsPanel } from '@/components/integrations-panel';
import { SettingsTabs } from '@/components/settings-tabs';


export default function AdminSettingsPage() {
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [mileageRate, setMileageRate] = useState('0.67');
    const [savingMileageRate, setSavingMileageRate] = useState(false);
    const { toast } = useToast();

    // The mileage rate feeds payroll reimbursements — payroll and super admins
    // only (firestore.rules adminConfig/finance matches).
    const canEditFinance = isSuperAdmin(currentUser) || isPayAdmin(currentUser);

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
        <div className="space-y-5 text-left max-w-5xl mx-auto pb-24">
            <PageHeader
                eyebrow="Admin"
                icon={SettingsIcon}
                title="Settings"
                subtitle="Your notifications and display, plus company-wide settings for your role."
            />

            <SettingsTabs
                hashTabs={{ quickbooks: 'integrations', integrations: 'integrations' }}
                tabs={[
                    {
                        id: 'general', label: 'General', icon: Globe,
                        content: (
                            <Card>
                                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                                    <div className="space-y-1 text-left min-w-0">
                                        <h4 className="text-[13px] font-semibold text-text-primary">Business time zone</h4>
                                        <p className="text-[12px] text-text-muted">Weekly logs, pay weeks and schedules use this time zone.</p>
                                    </div>
                                    <span className="text-[13px] font-mono font-bold text-text-primary">{BUSINESS_TIME_ZONE.replace('_', ' ')}</span>
                                </CardContent>
                            </Card>
                        ),
                    },
                    { id: 'notifications', label: TERMINOLOGY.CONFIG.NOTIFICATIONS, icon: Bell, content: <NotificationEventsCard /> },
                    { id: 'display', label: 'Display', icon: Type, content: <><ThemeToggleSetting /><FontPreferenceSetting /></> },
                    {
                        id: 'finance', label: 'Finance', icon: Banknote, show: canEditFinance,
                        content: (
                            <Card>
                                <CardHeader className="text-left">
                                    <CardTitle>Mileage reimbursement rate</CardTitle>
                                    <CardDescription>The per-mile rate used to calculate mileage reimbursements. IRS standard rate is $0.67/mile (2024).</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex flex-wrap items-center gap-3 max-w-md">
                                        <div className="relative flex-1 min-w-[140px]">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm font-mono">$</span>
                                            <Input type="number" step="0.01" min="0" inputMode="decimal" value={mileageRate}
                                                onChange={e => setMileageRate(e.target.value)}
                                                className="h-10 pl-7 text-[13px] bg-bg-primary border-border-main font-mono" placeholder="0.67" />
                                        </div>
                                        <span className="text-[12px] text-text-muted shrink-0">per mile</span>
                                        <Button size="sm" onClick={handleSaveMileageRate} disabled={savingMileageRate}
                                            className="h-10 bg-brand-red hover:bg-brand-red/90 text-white shrink-0 w-full sm:w-auto">
                                            {savingMileageRate ? 'Saving…' : 'Save rate'}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ),
                    },
                    // API keys and connections are Super Admin only.
                    { id: 'integrations', label: TERMINOLOGY.CONFIG.INTEGRATIONS, icon: Activity, show: isSuperAdmin(currentUser), content: <IntegrationsPanel /> },
                ]}
            />
        </div>
    );
}