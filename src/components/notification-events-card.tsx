'use client';

import { useEffect, useState } from 'react';
import { enableWebPush, webPushState, type WebPushState } from '@/lib/web-push';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, Send, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { eventEnabled, resolveNotificationPrefs, withEventPref } from '@/lib/notification-prefs';
import { eventsForRoles } from '@/lib/notification-events';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

const DEVICE_TEXT: Record<WebPushState, string> = {
    unsupported: '',
    'needs-install': 'On iPhone: tap Share → Add to Home Screen, open Aaromach from the new icon and sign in. Then come back here to turn notifications on.',
    'not-configured': 'Not available yet — the Web Push key hasn\u2019t been added to the server.',
    off: 'Get pop-up alerts on this phone or computer, even when the app is closed.',
    blocked: 'Blocked for this site. Allow notifications for app.aaromach.com in your phone or browser settings, then reload.',
    on: 'On — alerts will pop up on this device.',
};

/**
 * Per-event switches: which kinds of alert may email, text or buzz this
 * person's phone. Switched-off events still show in the bell. Only the
 * events that apply to their roles are listed.
 */
export function NotificationEventsCard() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [testing, setTesting] = useState(false);
    const [results, setResults] = useState<{ channel: string; ok: boolean; detail: string }[] | null>(null);
    const [device, setDevice] = useState<WebPushState>('unsupported');
    const [enabling, setEnabling] = useState(false);
    useEffect(() => { webPushState().then(setDevice).catch(() => {}); }, []);
    if (!user) return null;

    const turnOnDevice = async () => {
        setEnabling(true);
        try {
            const s = await enableWebPush();
            setDevice(s);
            toast(s === 'on' ? { title: 'Notifications on for this device' } : { variant: 'destructive', title: 'Notifications not turned on', description: DEVICE_TEXT[s] });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Could not turn on notifications', description: e.message });
        } finally {
            setEnabling(false);
        }
    };

    const sendTest = async () => {
        setTesting(true);
        setResults(null);
        try {
            const token = await auth.currentUser?.getIdToken();
            const res = await fetch('/api/notify/test', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
            const out = await res.json();
            if (!res.ok) throw new Error(out.error || `Failed (${res.status})`);
            setResults(out.results);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Test failed', description: e.message });
        } finally {
            setTesting(false);
        }
    };

    const roles = [...(Array.isArray(user.roles) ? user.roles : []), ...(typeof (user as any).role === 'string' ? [(user as any).role] : [])] as string[];
    const events = eventsForRoles(roles);
    const prefs = resolveNotificationPrefs(user.notificationPreferences);

    const toggle = async (id: string, label: string) => {
        const next = withEventPref(user.notificationPreferences, id, !eventEnabled(prefs, id));
        try {
            await updateDoc(doc(db, 'users', user.id), { notificationPreferences: next });
            toast({ title: 'Notification settings saved', description: `${label}: ${next.events?.[id] ? 'on' : 'bell only'}.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e.message });
        }
    };

    return (
        <Card>
            <CardHeader className="text-left">
                <CardTitle>What you get notified about</CardTitle>
                <CardDescription>Turn off what you don&apos;t need. Switched-off alerts still show in the bell — they just won&apos;t email, text or buzz your phone.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {device !== 'unsupported' && (
                    <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-brand-red/30 bg-brand-red/5">
                        <div className="space-y-1 text-left">
                            <h4 className="text-[13px] font-semibold text-text-primary">Phone notifications on this device</h4>
                            <p className="text-[12px] text-text-muted">{DEVICE_TEXT[device]}</p>
                        </div>
                        {device === 'off' && (
                            <Button size="sm" onClick={turnOnDevice} disabled={enabling} className="shrink-0">
                                {enabling && <Loader2 size={13} className="mr-1.5 animate-spin" />}Turn on
                            </Button>
                        )}
                        {device === 'on' && <CheckCircle2 size={18} className="text-text-green shrink-0" />}
                    </div>
                )}
                {events.map(e => (
                    <div key={e.id} className="flex items-center justify-between gap-4 p-4 rounded-lg border border-border-sub bg-bg-primary">
                        <div className="space-y-1 text-left">
                            <h4 className="text-[13px] font-semibold text-text-primary">{e.label}</h4>
                            <p className="text-[12px] text-text-muted">{e.desc}</p>
                        </div>
                        <Switch checked={eventEnabled(prefs, e.id)} onCheckedChange={() => toggle(e.id, e.label)} aria-label={e.label} />
                    </div>
                ))}
                <div className="pt-2 space-y-2">
                    <Button variant="outline" size="sm" onClick={sendTest} disabled={testing}>
                        {testing ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Send size={13} className="mr-1.5" />} Send me a test
                    </Button>
                    {results && (
                        <ul className="rounded-lg border border-border-sub bg-bg-primary divide-y divide-border-sub">
                            {results.map(r => (
                                <li key={r.channel} className="flex items-start gap-2 px-3 py-2 text-[12px] text-left">
                                    {r.ok ? <CheckCircle2 size={14} className="text-text-green shrink-0 mt-0.5" /> : <XCircle size={14} className="text-brand-red shrink-0 mt-0.5" />}
                                    <span><span className="font-semibold text-text-primary">{r.channel}:</span> <span className="text-text-muted">{r.detail}</span></span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
