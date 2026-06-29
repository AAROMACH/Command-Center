"use client";

import { useState, useEffect } from 'react';
import { db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Lock,
  Eye,
  EyeOff,
  Banknote,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { TERMINOLOGY } from '@/lib/constants';
import { isSuperAdmin } from '@/lib/permissions';
import type { Technician, NotificationPreferences } from '@/lib/types';


export default function AdminSettingsPage() {
    const [currentUser, setCurrentUser] = useState<Technician | null>(null);
    const [newPin, setNewPin] = useState('');
    const [currentPin, setCurrentPin] = useState('••••');
    const [showPin, setShowPin] = useState(false);
    const [savingPin, setSavingPin] = useState(false);
    const [mileageRate, setMileageRate] = useState('0.67');
    const [savingMileageRate, setSavingMileageRate] = useState(false);
    const { toast } = useToast();

    const userIsSuperAdmin = isSuperAdmin(currentUser);

    useEffect(() => {
        const userId = sessionStorage.getItem('currentUserId');
        if (userId) {
            const unsub = onSnapshot(doc(db, 'users', userId), (snap) => {
                if (snap.exists()) setCurrentUser({ ...snap.data(), id: snap.id } as Technician);
            });
            return () => unsub();
        }
    }, []);

    useEffect(() => {
        getDoc(doc(db, 'adminConfig', 'plans')).then(snap => {
            if (snap.exists() && snap.data()?.editPin) {
                setCurrentPin(snap.data()!.editPin);
            }
        }).catch(() => {});
        getDoc(doc(db, 'adminConfig', 'finance')).then(snap => {
            if (snap.exists() && snap.data()?.mileageRate != null) {
                setMileageRate(String(snap.data()!.mileageRate));
            }
        }).catch(() => {});
    }, []);

    const handleSavePin = async () => {
        if (!newPin || newPin.length < 4) {
            toast({ variant: 'destructive', title: 'Invalid PIN', description: 'PIN must be at least 4 characters.' });
            return;
        }
        setSavingPin(true);
        try {
            await setDoc(doc(db, 'adminConfig', 'plans'), { editPin: newPin }, { merge: true });
            setCurrentPin(newPin);
            setNewPin('');
            toast({ title: 'Plans PIN updated', description: 'The new PIN is now active.' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Failed to update PIN', description: e.message });
        } finally {
            setSavingPin(false);
        }
    };

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
            toast({ variant: 'destructive', title: 'Update Failed', description: e.message });
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

                {/* PLANS PIN (super admin only) */}
                {userIsSuperAdmin && (
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Lock size={14} className="text-brand-red" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Plans Security</h3>
                    </div>
                    <Card>
                        <CardHeader className="text-left">
                            <CardTitle>Plans Edit PIN</CardTitle>
                            <CardDescription>Control access to plan edits. Required before any create, edit, or delete action on the Plans page.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-3 p-3 rounded-lg border border-border-sub bg-bg-primary">
                                <Lock size={14} className="text-text-muted shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-0.5">Current PIN</p>
                                    <p className="text-sm font-mono font-bold text-text-primary tracking-[0.4em]">
                                        {showPin ? currentPin : '••••'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowPin(s => !s)}
                                    className="text-text-muted hover:text-text-primary transition-colors"
                                >
                                    {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            </div>
                            <div className="flex items-center gap-3">
                                <Input
                                    type="password"
                                    placeholder="New PIN (min 4 chars)"
                                    value={newPin}
                                    onChange={e => setNewPin(e.target.value)}
                                    className="h-9 flex-1 text-[11px] bg-bg-primary border-border-main font-mono"
                                />
                                <Button
                                    size="sm"
                                    onClick={handleSavePin}
                                    disabled={savingPin || !newPin}
                                    className="h-9 bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase tracking-widest"
                                >
                                    {savingPin ? 'Saving...' : 'Save PIN'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </section>
                )}

                {/* FINANCE */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Banknote size={14} className="text-brand-red" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Finance & Payroll</h3>
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
                                <span className="text-[10px] font-bold uppercase text-text-muted tracking-widest shrink-0">per mile</span>
                                <Button
                                    size="sm"
                                    onClick={handleSaveMileageRate}
                                    disabled={savingMileageRate}
                                    className="h-9 bg-brand-red hover:bg-brand-red/90 text-white text-[10px] font-black uppercase tracking-widest shrink-0"
                                >
                                    {savingMileageRate ? 'Saving...' : 'Save Rate'}
                                </Button>
                            </div>
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