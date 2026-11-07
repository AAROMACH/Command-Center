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
import { getSubroles, isPayAdmin, isSuperAdmin } from '@/lib/permissions';
import Link from 'next/link';
import { ChevronRight, LayoutDashboard, Receipt, Wallet, Tag } from 'lucide-react';
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

    // Dispatch alert thresholds — the dashboard's "Open too long" and "Due soon" (adminConfig/operations).
    const [openTooLongDays, setOpenTooLongDays] = useState('3');
    const [dueSoonDays, setDueSoonDays] = useState('2');
    const [savingOps, setSavingOps] = useState(false);
    useEffect(() => onSnapshot(doc(db, 'adminConfig', 'operations'), s => {
        const d = s.data() || {};
        if (Number(d.openTooLongDays) > 0) setOpenTooLongDays(String(d.openTooLongDays));
        if (Number(d.dueSoonDays) > 0) setDueSoonDays(String(d.dueSoonDays));
    }, () => {}), []);
    const saveOps = async () => {
        const a = Math.round(Number(openTooLongDays)), b = Math.round(Number(dueSoonDays));
        if (!(a >= 1 && a <= 60) || !(b >= 1 && b <= 30)) { toast({ variant: 'destructive', title: 'Check the numbers', description: 'Open too long: 1–60 days. Due soon: 1–30 days.' }); return; }
        setSavingOps(true);
        try { await setDoc(doc(db, 'adminConfig', 'operations'), { openTooLongDays: a, dueSoonDays: b }, { merge: true }); toast({ title: 'Dispatch alerts saved' }); }
        catch (e: any) { toast({ variant: 'destructive', title: 'Could not save', description: e.message }); }
        finally { setSavingOps(false); }
    };

    // Which dashboard view opens first (same choice as the switch on the dashboard; this browser).
    type Focus = 'overview' | 'dispatch' | 'payroll';
    const subroles = getSubroles(currentUser);
    const focusOptions: Focus[] = subroles.includes('super_admin')
        ? ['overview', 'dispatch', 'payroll']
        : [subroles.includes('dispatch_admin') && 'dispatch', subroles.includes('payroll_admin') && 'payroll'].filter(Boolean) as Focus[];
    const [focus, setFocus] = useState<Focus | ''>('');
    useEffect(() => { try { setFocus((localStorage.getItem('cc:dashboard:focus') as Focus) || ''); } catch { /* private mode */ } }, []);
    const pickFocus = (f: Focus) => { setFocus(f); try { localStorage.setItem('cc:dashboard:focus', f); } catch { /* private mode */ } toast({ title: 'Dashboard view saved' }); };

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
                        content: (<>
                            <Card>
                                <CardContent className="p-0 divide-y divide-border-sub">
                                    <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                                        <div className="space-y-1 text-left min-w-0">
                                            <h4 className="text-[13px] font-semibold text-text-primary">Business time zone</h4>
                                            <p className="text-[12px] text-text-muted">Weekly logs, pay weeks and schedules use this time zone.</p>
                                        </div>
                                        <span className="text-[13px] font-mono font-bold text-text-primary">{BUSINESS_TIME_ZONE.replace('_', ' ')}</span>
                                    </div>
                                    <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                                        <div className="space-y-1 text-left min-w-0">
                                            <h4 className="text-[13px] font-semibold text-text-primary">Pay week</h4>
                                            <p className="text-[12px] text-text-muted">Monday to Sunday. Techs submit their weekly log on Saturday or Sunday.</p>
                                        </div>
                                        <span className="text-[13px] font-mono font-bold text-text-primary">Mon – Sun</span>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="text-left">
                                    <CardTitle>Dispatch alerts</CardTitle>
                                    <CardDescription>When the dashboard flags a job for dispatch.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
                                        <label className="space-y-1">
                                            <span className="text-[12px] font-medium text-text-primary">Open too long after</span>
                                            <div className="flex items-center gap-2">
                                                <Input type="number" min={1} max={60} inputMode="numeric" value={openTooLongDays} onChange={e => setOpenTooLongDays(e.target.value)} className="h-10 w-24 font-mono" />
                                                <span className="text-[12px] text-text-muted">days unassigned</span>
                                            </div>
                                        </label>
                                        <label className="space-y-1">
                                            <span className="text-[12px] font-medium text-text-primary">Due soon within</span>
                                            <div className="flex items-center gap-2">
                                                <Input type="number" min={1} max={30} inputMode="numeric" value={dueSoonDays} onChange={e => setDueSoonDays(e.target.value)} className="h-10 w-24 font-mono" />
                                                <span className="text-[12px] text-text-muted">days, if no tech</span>
                                            </div>
                                        </label>
                                    </div>
                                    <Button size="sm" onClick={saveOps} disabled={savingOps} className="h-10 bg-brand-red hover:bg-brand-red/90 text-white w-full sm:w-auto">
                                        {savingOps ? 'Saving…' : 'Save alerts'}
                                    </Button>
                                </CardContent>
                            </Card>
                        </>),
                    },
                    { id: 'notifications', label: TERMINOLOGY.CONFIG.NOTIFICATIONS, icon: Bell, content: <NotificationEventsCard /> },
                    { id: 'display', label: 'Display', icon: Type, content: <>
                        <ThemeToggleSetting /><FontPreferenceSetting />
                        {focusOptions.length > 1 && (
                            <Card>
                                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                                    <div className="space-y-1 text-left min-w-0">
                                        <h4 className="text-[13px] font-semibold text-text-primary flex items-center gap-1.5"><LayoutDashboard size={14} /> Dashboard opens on</h4>
                                        <p className="text-[12px] text-text-muted">The view you see first on the dashboard (on this device).</p>
                                    </div>
                                    <div className="tabs flex-nowrap" role="tablist" aria-label="Dashboard view">
                                        {focusOptions.map(f => (
                                            <button key={f} type="button" role="tab" aria-selected={(focus || focusOptions[0]) === f}
                                                className={(focus || focusOptions[0]) === f ? 'tab active' : 'tab'} onClick={() => pickFocus(f)}>
                                                {f === 'overview' ? 'Overview' : f === 'dispatch' ? 'Dispatch' : 'Payroll'}
                                            </button>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </> },
                    {
                        id: 'finance', label: 'Finance', icon: Banknote, show: canEditFinance,
                        content: (<>
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
                            <Card>
                                <CardHeader className="text-left">
                                    <CardTitle>More finance settings</CardTitle>
                                    <CardDescription>Set where the work happens.</CardDescription>
                                </CardHeader>
                                <CardContent className="p-0 divide-y divide-border-sub">
                                    {[
                                        { href: '/admin/payroll/audit', icon: Wallet, title: 'Hourly wages', sub: 'Payroll audit → Wages: each person’s default hourly rate.' },
                                        { href: '/admin/payroll/audit', icon: Receipt, title: 'Staff pay plans', sub: 'Payroll audit → Staff pay: weekly bonuses and installments.' },
                                        { href: '/admin/assets', icon: Tag, title: 'Pricing and payment terms', sub: 'Assets → Pricing: labor rates, markups and invoice terms.' },
                                    ].map(l => (
                                        <Link key={l.title} href={l.href} className="flex items-center gap-3 p-4 hover:bg-bg-tertiary/40 transition-colors">
                                            <l.icon size={16} className="text-text-muted shrink-0" />
                                            <div className="min-w-0 flex-1 text-left">
                                                <p className="text-[13px] font-semibold text-text-primary">{l.title}</p>
                                                <p className="text-[12px] text-text-muted">{l.sub}</p>
                                            </div>
                                            <ChevronRight size={16} className="text-text-muted shrink-0" />
                                        </Link>
                                    ))}
                                </CardContent>
                            </Card>
                        </>),
                    },
                    // API keys and connections are Super Admin only.
                    { id: 'integrations', label: TERMINOLOGY.CONFIG.INTEGRATIONS, icon: Activity, show: isSuperAdmin(currentUser), content: <IntegrationsPanel /> },
                ]}
            />
        </div>
    );
}