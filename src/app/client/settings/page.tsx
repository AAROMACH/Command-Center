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
  Receipt,
  LifeBuoy,
  Key,
} from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { Technician, NotificationPreferences } from '@/lib/types';
import { FontPreferenceSetting } from '@/components/font-preference-setting';
import { ThemeToggleSetting } from '@/components/theme-toggle-setting';
import { PageHeader } from '@/components/page-header';
import { SettingsTabs } from '@/components/settings-tabs';
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

    // Where invoices are emailed (invoice send uses billingEmail, else the sign-in email).
    const [billingEmail, setBillingEmail] = useState('');
    const [savingBilling, setSavingBilling] = useState(false);
    useEffect(() => { setBillingEmail(currentUser?.billingEmail || ''); }, [currentUser?.billingEmail]);
    const saveBilling = async () => {
        if (!currentUser) return;
        const v = billingEmail.trim();
        if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { toast({ variant: 'destructive', title: 'Check the email address' }); return; }
        setSavingBilling(true);
        try { await updateDoc(doc(db, 'users', currentUser.id), { billingEmail: v || null }); toast({ title: 'Invoice email saved', description: v ? `Invoices go to ${v}.` : 'Invoices go to your sign-in email.' }); }
        catch (e: any) { toast({ variant: 'destructive', title: 'Save failed', description: e.message }); }
        finally { setSavingBilling(false); }
    };

    if (!mounted) return null;

    return (
        <div className="max-w-4xl mx-auto space-y-5 text-left pb-24">
            <PageHeader
                eyebrow="Client portal"
                icon={SettingsIcon}
                title="Settings"
                subtitle="Your notifications, display and account status."
            />

            <SettingsTabs tabs={[
                { id: 'notifications', label: 'Notifications', icon: Bell, content: <NotificationEventsCard /> },
                { id: 'display', label: 'Display', icon: Type, content: <><ThemeToggleSetting /><FontPreferenceSetting /></> },
                { id: 'billing', label: 'Billing', icon: Receipt, content: (
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>Invoice email</CardTitle>
                            <CardDescription>Where we send your invoices. Leave blank to use your sign-in email ({currentUser?.email || '—'}).</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-wrap items-center gap-2">
                            <Input type="email" value={billingEmail} onChange={e => setBillingEmail(e.target.value)} placeholder="accounts@yourcompany.com"
                                className="h-10 flex-1 min-w-[220px] max-w-md" aria-label="Invoice email" />
                            <Button onClick={saveBilling} disabled={savingBilling || billingEmail.trim() === (currentUser?.billingEmail || '')} className="h-10 w-full sm:w-auto">
                                {savingBilling ? 'Saving…' : 'Save'}
                            </Button>
                        </CardContent>
                    </Card>
                ) },
                { id: 'account', label: 'Account', icon: Building2, content: (<>
                    <Card className="rounded-xl bg-bg-secondary border-border-main shadow-sm">
                        <CardHeader className="text-left">
                            <CardTitle className="text-base font-semibold">Account status</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="p-4 sm:p-6 rounded-lg bg-bg-secondary/50 border border-border-sub flex flex-wrap items-center justify-between gap-3">
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
                    <Card>
                        <CardContent className="p-0 divide-y divide-border-sub">
                            <Link href="/client/profile" className="flex items-center gap-3 p-4 hover:bg-bg-tertiary/40 transition-colors">
                                <Key size={16} className="text-text-muted shrink-0" />
                                <div className="min-w-0 flex-1 text-left">
                                    <p className="text-[13px] font-semibold text-text-primary">Profile and password</p>
                                    <p className="text-[12px] text-text-muted">Your name, phone and sign-in password.</p>
                                </div>
                            </Link>
                            <a href="mailto:support@aaromach.com" className="flex items-center gap-3 p-4 hover:bg-bg-tertiary/40 transition-colors">
                                <LifeBuoy size={16} className="text-text-muted shrink-0" />
                                <div className="min-w-0 flex-1 text-left">
                                    <p className="text-[13px] font-semibold text-text-primary">Need help?</p>
                                    <p className="text-[12px] text-text-muted">Email support@aaromach.com — for company details, users or billing questions.</p>
                                </div>
                            </a>
                        </CardContent>
                    </Card>
                </>) },
            ]} />
        </div>
    );
}