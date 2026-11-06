'use client';

import { useState } from 'react';
import { Bell, Key, Settings as SettingsIcon, Type, User } from 'lucide-react';
import { NotificationEventsCard } from '@/components/notification-events-card';
import { ThemeToggleSetting } from '@/components/theme-toggle-setting';
import { FontPreferenceSetting } from '@/components/font-preference-setting';
import { PageHeader } from '@/components/page-header';
import { SettingsTabs } from '@/components/settings-tabs';
import { ChangePasswordDialog } from '@/components/change-password-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';

/**
 * Sales Portal settings: the personal ones (Sales has no company settings),
 * plus Account — Sales has no profile page, so name, email and password
 * live here.
 */
export default function SalesSettingsPage() {
    const { user } = useAuth();
    const [pwOpen, setPwOpen] = useState(false);
    return (
        <div className="max-w-4xl mx-auto space-y-5 text-left pb-24">
            <PageHeader eyebrow="Sales portal" icon={SettingsIcon} title="Settings" subtitle="Your notifications, display and account." />
            <SettingsTabs tabs={[
                { id: 'notifications', label: 'Notifications', icon: Bell, content: <NotificationEventsCard /> },
                { id: 'display', label: 'Display', icon: Type, content: <><ThemeToggleSetting /><FontPreferenceSetting /></> },
                {
                    id: 'account', label: 'Account', icon: User, content: (
                        <Card>
                            <CardHeader>
                                <CardTitle>Account</CardTitle>
                                <CardDescription>Your name and email are managed by the office in the Directory.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
                                    <div><p className="text-[11px] text-text-muted">Name</p><p className="font-semibold text-text-primary break-words">{user?.name || '—'}</p></div>
                                    <div><p className="text-[11px] text-text-muted">Email</p><p className="font-semibold text-text-primary break-all">{user?.email || '—'}</p></div>
                                </div>
                                <Button variant="outline" className="w-full sm:w-auto h-10" onClick={() => setPwOpen(true)}>
                                    <Key size={14} className="mr-2" /> Change password
                                </Button>
                            </CardContent>
                        </Card>
                    ),
                },
            ]} />
            <ChangePasswordDialog isOpen={pwOpen} setIsOpen={setPwOpen} />
        </div>
    );
}
