'use client';

import { Bell, Settings as SettingsIcon, Type } from 'lucide-react';
import { NotificationEventsCard } from '@/components/notification-events-card';
import { ThemeToggleSetting } from '@/components/theme-toggle-setting';
import { FontPreferenceSetting } from '@/components/font-preference-setting';
import { PageHeader } from '@/components/page-header';

/** Sales Portal settings: the personal ones (Sales has no company settings). */
export default function SalesSettingsPage() {
    return (
        <div className="max-w-4xl mx-auto space-y-6 text-left pb-24">
            <PageHeader eyebrow="Sales portal" icon={SettingsIcon} title="Settings" subtitle="Your notifications and display." />
            <section className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <Bell size={14} className="text-text-muted" />
                    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Notifications</h3>
                </div>
                <NotificationEventsCard />
            </section>
            <section className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <Type size={14} className="text-text-muted" />
                    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Display</h3>
                </div>
                <ThemeToggleSetting />
                <FontPreferenceSetting />
            </section>
        </div>
    );
}
