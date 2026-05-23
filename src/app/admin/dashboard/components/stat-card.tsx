'use client';
import { cn } from "@/lib/utils";
import { Clock, Users, TrendingUp, FolderKanban, Wrench, TriangleAlert, CopyX, ClipboardList } from 'lucide-react';

const icons = {
    Clock,
    Users,
    TrendingUp,
    FolderKanban,
    Wrench,
    TriangleAlert,
    CopyX,
    ClipboardList
};

export type IconName = keyof typeof icons;

type StatCardProps = {
    label: string;
    value: string;
    delta: string;
    deltaType: 'up' | 'down' | 'flat' | 'warning' | 'neutral' | 'negative';
    icon: IconName;
}

export function StatCard({ label, value, delta, deltaType, icon }: StatCardProps) {
    const Icon = icons[icon];

    if (!Icon) {
        return null;
    }

    const deltaColor = {
        up: 'text-text-green',
        down: 'text-text-red',
        warning: 'text-accent-gold',
        negative: 'text-text-red',
        flat: 'text-text-muted',
        neutral: 'text-text-muted',
    }[deltaType];

    return (
        <div className="bg-bg-secondary p-4 rounded-lg border border-border-default transition-colors hover:bg-bg-tertiary h-full">
            <div className="flex justify-between items-start mb-2 text-left">
                <div className="p-2 bg-bg-tertiary rounded-md">
                    <Icon className="h-5 w-5 text-text-muted" />
                </div>
                 <div className={cn("text-[10px] font-bold uppercase tracking-tight", deltaColor)}>
                    {delta}
                </div>
            </div>
            <div className="text-left">
                <p className="text-3xl font-bold text-text-primary tracking-tighter">{value}</p>
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">{label}</p>
            </div>
        </div>
    )
}
