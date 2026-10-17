'use client';

import { Bell, Settings as SettingsIcon, Type } from 'lucide-react';
import { NotificationPrefsCard } from '@/components/notification-prefs-card';
import { ThemeToggleSetting } from '@/components/theme-toggle-setting';
import { FontPreferenceSetting } from '@/components/font-preference-setting';

/** Sales Portal settings: the personal ones (Sales has no company settings). */
export default function SalesSettingsPage() {
    return (
        <div className="max-w-4xl mx-auto space-y-8 text-left pb-24">
            <header className="page-header text-left">
                <div className="text-left">
                    <p className="page-eyebrow flex items-center gap-2"><SettingsIcon size={12} /> Sales Portal</p>
                    <h1 className="page-title text-left">Settings</h1>
                    <p className="page-subtitle text-left">Your notifications and display.</p>
                </div>
            </header>
            <section className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <Bell size={14} className="text-brand-red" />
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Notifications</h3>
                </div>
                <NotificationPrefsCard />
            </section>
            <section className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <Type size={14} className="text-brand-red" />
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Display</h3>
                </div>
                <ThemeToggleSetting />
                <FontPreferenceSetting />
            </section>
        </div>
    );
}
