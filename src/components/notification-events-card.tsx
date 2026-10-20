'use client';

import { useEffect, useRef, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import {
    Activity, Bell, ChevronDown, BellRing, Briefcase, CheckCircle2, FolderKanban, Inbox, Loader2, Mail,
    MessageSquare, Receipt, Send, Smartphone, TrendingUp, Wallet, XCircle, type LucideIcon,
} from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { isNativeApp } from '@/lib/native-push';
import { enableWebPush, webPushDiagnostics, webPushState, type WebPushState } from '@/lib/web-push';
import { useAuth } from '@/contexts/auth-context';
import { alertOn, channelOn, resolveNotificationPrefs, withAlertMuted, withEventChannel, type OutsideChannel } from '@/lib/notification-prefs';
import { ALERT_TYPES, EVENT_GROUP_LABELS, eventsForRoles, type EventGroup, type NotificationEvent } from '@/lib/notification-events';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const CHANNELS: { id: OutsideChannel; label: string; Icon: LucideIcon }[] = [
    { id: 'phone', label: 'Phone', Icon: Smartphone },
    { id: 'email', label: 'Email', Icon: Mail },
    { id: 'sms', label: 'Text', Icon: MessageSquare },
];

const EVENT_ICONS: Partial<Record<NotificationEvent, LucideIcon>> = {
    messages: MessageSquare,
    job_assignments: Briefcase,
    my_pay: Wallet,
    projects: FolderKanban,
    dispatch_activity: Send,
    job_activity: Activity,
    requests: Inbox,
    payroll_review: Receipt,
    sales: TrendingUp,
};

const GROUP_ORDER: EventGroup[] = ['work', 'operations', 'sales'];

const DEVICE_TEXT: Record<WebPushState, string> = {
    unsupported: 'This browser can’t get pop-up notifications. On iPhone: update to iOS 16.4 or newer (Settings → General → Software Update), then open Aaromach from its Home Screen icon.',
    'needs-install': 'On iPhone: tap Share → Add to Home Screen, open Aaromach from the new icon and sign in, then come back here to turn notifications on.',
    'not-configured': 'Not available yet — the Web Push key hasn’t been added to the server.',
    off: 'Get pop-up alerts on this device, even when the app is closed.',
    blocked: 'Blocked for this site. Allow notifications for app.aaromach.com in your phone or browser settings, then reload.',
    on: 'On — alerts pop up on this device. If the test says no phone is registered, tap Reconnect.',
};

/**
 * Settings → Notifications: for each kind of alert that applies to this
 * person's roles, which channels it reaches them on (phone, email, text).
 * Every alert also lands in the bell regardless. Includes this device's web
 * push switch and a test that reports each channel.
 */
export function NotificationEventsCard() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [testing, setTesting] = useState(false);
    const [results, setResults] = useState<{ channel: string; ok: boolean; detail: string }[] | null>(null);
    // null until checked; the Android app (native push) skips this card.
    const [device, setDevice] = useState<WebPushState | null>(null);
    const [enabling, setEnabling] = useState(false);
    // Fresh sign-in token, kept ready so the closed-app test sends instantly.
    const tokenRef = useRef<string | null>(null);
    useEffect(() => {
        const load = () => auth.currentUser?.getIdToken().then(t => { tokenRef.current = t; }).catch(() => {});
        load();
        const id = setInterval(load, 30 * 60_000); // tokens last an hour
        return () => clearInterval(id);
    }, []);
    // Rows whose "Choose alerts" list is open.
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    useEffect(() => { if (!isNativeApp()) webPushState().then(setDevice).catch(() => setDevice('unsupported')); }, []);
    if (!user) return null;

    const roles = [...(Array.isArray(user.roles) ? user.roles : []), ...(typeof (user as any).role === 'string' ? [(user as any).role] : [])] as string[];
    const events = eventsForRoles(roles);
    const prefs = resolveNotificationPrefs(user.notificationPreferences);

    const toggle = async (id: string, ch: OutsideChannel) => {
        const next = withEventChannel(user.notificationPreferences, id, ch, !channelOn(prefs, id, ch));
        try {
            await updateDoc(doc(db, 'users', user.id), { notificationPreferences: next });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e.message });
        }
    };

    const toggleAlert = async (alertId: string) => {
        const next = withAlertMuted(user.notificationPreferences, alertId, alertOn(prefs, alertId));
        try {
            await updateDoc(doc(db, 'users', user.id), { notificationPreferences: next });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e.message });
        }
    };

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

    // Fire and forget: the server waits 10s, then pushes to this person's
    // phones, so they can close the app and see it arrive. The request must
    // leave BEFORE they switch away — Android freezes a backgrounded page, and
    // a request still waiting on a token would only go out on return. So the
    // token is fetched ahead of time and the "close now" hint waits a moment.
    const sendClosedTest = () => {
        const send = (token?: string) => fetch('/api/notify/test', {
            method: 'POST', keepalive: true,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ delaySeconds: 10 }),
        }).catch(() => {});
        if (tokenRef.current) send(tokenRef.current);
        else auth.currentUser?.getIdToken().then(send);
        toast({ title: 'Sending a test…', description: 'Wait for “Close the app now”.' });
        setTimeout(() => toast({ title: 'Close the app now', description: 'Leave the app or lock your phone — the test arrives in about 10 seconds.' }), 1500);
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

    return (
        <Card>
            <CardHeader className="text-left space-y-1">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-brand-red/10 border border-brand-red/20 flex items-center justify-center shrink-0">
                        <BellRing size={17} className="text-brand-red" />
                    </div>
                    <div>
                        <CardTitle className="text-base">Notification preferences</CardTitle>
                        <CardDescription className="text-[12px]">Choose how each kind of alert reaches you.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-5">
                {device && (
                    <div className={cn('flex items-center justify-between gap-4 p-3.5 rounded-lg border',
                        device === 'on' ? 'border-green-border/40 bg-green-dim/20' : 'border-border-sub bg-bg-primary')}>
                        <div className="flex items-start gap-3 text-left">
                            <Smartphone size={16} className={cn('mt-0.5 shrink-0', device === 'on' ? 'text-text-green' : 'text-text-muted')} />
                            <div className="space-y-0.5">
                                <p className="text-[13px] font-semibold text-text-primary">This device</p>
                                <p className="text-[12px] text-text-muted leading-snug">{DEVICE_TEXT[device]}</p>
                                {device !== 'on' && <p className="text-[10px] text-text-muted/70 font-mono pt-1">{webPushDiagnostics()}</p>}
                            </div>
                        </div>
                        {device === 'off' && (
                            <Button size="sm" onClick={turnOnDevice} disabled={enabling} className="shrink-0">
                                {enabling && <Loader2 size={13} className="mr-1.5 animate-spin" />}Turn on
                            </Button>
                        )}
                        {device === 'on' && (
                            // Re-saves this device's token — fixes "no phone registered" when
                            // notifications are allowed but the device never got linked.
                            <Button size="sm" variant="outline" onClick={turnOnDevice} disabled={enabling} className="shrink-0">
                                {enabling ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <CheckCircle2 size={13} className="mr-1.5 text-text-green" />}Reconnect
                            </Button>
                        )}
                    </div>
                )}

                {GROUP_ORDER.map(group => {
                    const rows = events.filter(e => e.group === group);
                    if (!rows.length) return null;
                    return (
                        <section key={group} className="space-y-2">
                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted text-left px-1">{EVENT_GROUP_LABELS[group]}</h4>
                            <div className="rounded-xl border border-border-sub divide-y divide-border-sub overflow-hidden">
                                {rows.map(e => {
                                    const Icon = EVENT_ICONS[e.id] || Bell;
                                    const alerts = ALERT_TYPES.filter(a => a.event === e.id);
                                    const onCount = alerts.filter(a => alertOn(prefs, a.id)).length;
                                    const open = expanded.has(e.id);
                                    return (
                                        <div key={e.id} className="bg-bg-primary">
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                                            <div className="flex items-start gap-3 flex-1 min-w-0 text-left">
                                                <div className="h-8 w-8 rounded-lg bg-bg-tertiary border border-border-sub flex items-center justify-center shrink-0">
                                                    <Icon size={15} className="text-text-secondary" />
                                                </div>
                                                <div className="min-w-0 space-y-0.5">
                                                    <p className="text-[13px] font-semibold text-text-primary">{e.label}</p>
                                                    <p className="text-[12px] text-text-muted leading-snug">{e.desc}</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-1.5 shrink-0 pl-11 sm:pl-0" role="group" aria-label={`${e.label} channels`}>
                                                {CHANNELS.map(({ id, label, Icon: ChIcon }) => {
                                                    const on = channelOn(prefs, e.id, id);
                                                    return (
                                                        <button key={id} type="button" aria-pressed={on} onClick={() => toggle(e.id, id)}
                                                            className={cn('h-8 px-2.5 rounded-md border text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors',
                                                                on ? 'bg-brand-red/10 border-brand-red/40 text-brand-red'
                                                                    : 'bg-bg-secondary border-border-sub text-text-muted hover:text-text-primary hover:border-border-main')}>
                                                            <ChIcon size={13} />{label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        {alerts.length > 1 && (
                                            <div className="px-4 pb-3 -mt-1 pl-[60px] sm:pl-[60px] text-left">
                                                <button type="button" aria-expanded={open}
                                                    onClick={() => setExpanded(prev => { const n = new Set(prev); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })}
                                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-secondary hover:text-text-primary">
                                                    Choose alerts · {onCount} of {alerts.length} on
                                                    <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} />
                                                </button>
                                                {open && (
                                                    <div className="mt-2 space-y-1.5">
                                                        {alerts.map(a => (
                                                            <label key={a.id} className="flex items-center gap-2 text-[12px] text-text-primary cursor-pointer">
                                                                <input type="checkbox" className="h-4 w-4 accent-[var(--brand-red)]"
                                                                    checked={alertOn(prefs, a.id)} onChange={() => toggleAlert(a.id)} />
                                                                {a.label}
                                                            </label>
                                                        ))}
                                                        <p className="text-[11px] text-text-muted pt-0.5">Unchecked alerts still show in the bell, but won’t go to your phone, email or text.</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    );
                })}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <p className="text-[12px] text-text-muted flex items-center gap-1.5 text-left">
                        <Bell size={13} className="shrink-0" /> Every alert also appears in the bell, even ones you switch off here.
                    </p>
                    <div className="flex flex-wrap gap-2 shrink-0 self-start sm:self-auto">
                        <Button variant="outline" size="sm" onClick={sendClosedTest}>
                            <Smartphone size={13} className="mr-1.5" /> Test with app closed
                        </Button>
                        <Button variant="outline" size="sm" onClick={sendTest} disabled={testing}>
                            {testing ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Send size={13} className="mr-1.5" />} Send me a test
                        </Button>
                    </div>
                </div>
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
            </CardContent>
        </Card>
    );
}
