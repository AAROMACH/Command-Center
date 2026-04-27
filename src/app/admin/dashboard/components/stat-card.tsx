'use client';
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type StatCardProps = {
    label: string;
    value: string;
    delta: string;
    deltaType: 'positive' | 'negative' | 'warning' | 'neutral';
    icon: LucideIcon;
}

export function StatCard({ label, value, delta, deltaType, icon: Icon }: StatCardProps) {
    return (
        <div className={cn("bg-bg-secondary p-6 flex flex-col justify-between h-full", {
            'border-l-4 border-brand-red': deltaType === 'negative',
            'border-l-4 border-accent-gold': deltaType === 'warning',
        })}>
            <div className="flex justify-between items-start">
                <p className="stat-label">{label}</p>
                <Icon className={cn("h-6 w-6 shrink-0", {
                    "text-text-red": deltaType === 'negative',
                    "text-accent-gold": deltaType === 'warning',
                    "text-text-muted": deltaType === 'neutral',
                    "text-text-green": deltaType === 'positive',
                })} />
            </div>
            <div>
                <p className="stat-value">{value}</p>
                <p className={cn("body-text !text-xs", {
                    "text-text-red": deltaType === 'negative',
                    "text-accent-gold": deltaType === 'warning',
                    "text-text-muted": deltaType === 'neutral',
                    "text-text-green": deltaType === 'positive',
                })}>
                    {delta}
                </p>
            </div>
        </div>
    )
}
