'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { resolveNotificationPrefs, withNotificationPref } from '@/lib/notification-prefs';
import type { NotificationChannel } from '@/lib/notification-prefs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import type { NotificationPreferences } from '@/lib/types';

/** The signed-in user's email / text / in-app notification switches. */
export function NotificationPrefsCard() {
    const [uid, setUid] = useState<string | null>(null);
    const [prefs, setPrefs] = useState<Partial<NotificationPreferences> | undefined>(undefined);
    const { toast } = useToast();

    useEffect(() => {
        let unsubUser: (() => void) | undefined;
        const unsubAuth = onAuthStateChanged(auth, fbUser => {
            unsubUser?.();
            unsubUser = undefined;
            setUid(fbUser?.uid || null);
            if (fbUser) unsubUser = onSnapshot(doc(db, 'users', fbUser.uid), snap => setPrefs(snap.data()?.notificationPreferences));
        });
        return () => { unsubAuth(); unsubUser?.(); };
    }, []);

    const toggle = async (type: NotificationChannel) => {
        if (!uid) return;
        const next = withNotificationPref(prefs, type, !resolveNotificationPrefs(prefs)[type]);
        try {
            await updateDoc(doc(db, 'users', uid), { notificationPreferences: next });
            toast({ title: 'Notification settings saved', description: `${type === 'push' ? 'In-app' : type === 'sms' ? 'Text' : 'Email'} notifications ${next[type] ? 'on' : 'off'}.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e.message });
        }
    };

    const resolved = resolveNotificationPrefs(prefs);
    return (
        <Card>
            <CardHeader className="text-left">
                <CardTitle>How you get notified</CardTitle>
                <CardDescription>Applies to your account only.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {([
                    { id: 'email', label: 'Email', desc: 'Alerts sent to your email address.' },
                    { id: 'sms', label: 'Text message', desc: 'Alerts texted to your phone number.' },
                    { id: 'push', label: 'In-app', desc: 'Alerts in the bell at the top of the app.' },
                                { id: 'phone', label: 'Phone notifications', desc: 'Pop-up alerts on your phone from the Aaromach Android app.' },
                ] as const).map(item => (
                    <div key={item.id} className="flex items-center justify-between p-4 rounded-lg border border-border-sub bg-bg-primary">
                        <div className="space-y-1 text-left">
                            <h4 className="text-[13px] font-semibold text-text-primary">{item.label}</h4>
                            <p className="text-[12px] text-text-muted">{item.desc}</p>
                        </div>
                        <Switch checked={resolved[item.id]} onCheckedChange={() => toggle(item.id)} disabled={!uid} />
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
