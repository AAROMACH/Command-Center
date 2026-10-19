'use client';

import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/auth-context';
import { eventEnabled, resolveNotificationPrefs, withEventPref } from '@/lib/notification-prefs';
import { eventsForRoles } from '@/lib/notification-events';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

/**
 * Per-event switches: which kinds of alert may email, text or buzz this
 * person's phone. Switched-off events still show in the bell. Only the
 * events that apply to their roles are listed.
 */
export function NotificationEventsCard() {
    const { user } = useAuth();
    const { toast } = useToast();
    if (!user) return null;

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
                {events.map(e => (
                    <div key={e.id} className="flex items-center justify-between gap-4 p-4 rounded-lg border border-border-sub bg-bg-primary">
                        <div className="space-y-1 text-left">
                            <h4 className="text-[13px] font-semibold text-text-primary">{e.label}</h4>
                            <p className="text-[12px] text-text-muted">{e.desc}</p>
                        </div>
                        <Switch checked={eventEnabled(prefs, e.id)} onCheckedChange={() => toggle(e.id, e.label)} aria-label={e.label} />
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
